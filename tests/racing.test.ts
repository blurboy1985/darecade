import { edgeAssist } from "../src/race-assist.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Simulation,
  replayRun,
  rulesVersion,
  type Input,
  type Replay,
} from "../shared/simulation.ts";
import {
  CoastRace,
  KART_LENGTH,
  KART_WIDTH,
  RaceField,
  SPIN_TICKS,
  WALL,
  boostPads,
  driftTier,
  racer,
  ITEMS,
  itemCrates,
  pickups,
  RIVALS,
  RACE_DISTANCE,
  RACE_TICKS,
  TRACK_LENGTH,
  raceScore,
  raceScoreTime,
  raceTime,
  trackCurve,
  trackPoint,
} from "../shared/racing.ts";
import { formatScore, gameIds } from "../src/catalog.ts";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";

type Driving = "clean" | "drift" | "idle" | "brake";
function drive(seed: number, style: Driving = "clean") {
  const sim = new Simulation("coast", seed),
    events: Replay["events"] = [];
  let previous = "";
  while (!sim.ended) {
    const r = sim.race!;
    const steering =
      style === "brake"
        ? 0
        : Math.sign(
            trackCurve(r.distance) * r.speed * r.speed * 0.1 -
              r.offset * 2 -
              r.lateralSpeed * 0.5,
          );
    const input: Input = [
      steering,
      style === "brake"
        ? -1
        : style === "idle" && sim.ticks % 180 > 150
          ? 0
          : 1,
      -1,
      Number(style === "drift" && r.charge < 0.98),
      -1,
      -1,
    ];
    const stamp = JSON.stringify(input);
    if (stamp !== previous) {
      events.push([sim.ticks, ...input]);
      previous = stamp;
    }
    sim.advance(input);
  }
  return {
    score: sim.score,
    replay: { version: rulesVersion("coast"), ticks: sim.ticks, events },
    race: sim.race!,
  };
}

test("Coast Rush shares deterministic three-lap physics with server replay; a seed always replays the same race", () => {
  const a = drive(1, "drift"),
    b = drive(876543, "drift");
  const again = drive(1, "drift");
  assert.deepEqual(a.replay, again.replay);
  assert.deepEqual(a.race.result(), again.race.result());
  assert.deepEqual(a.race.rivals, again.race.rivals);
  // Rivals draw and use items from the seed, so another seed is another race.
  assert.ok(b.score > 0);
  assert.notDeepEqual(
    a.race.rivals.map((r) => r.distance),
    b.race.rivals.map((r) => r.distance),
  );
  assert.ok(a.score > 0);
  assert.equal(a.race.distance, RACE_DISTANCE);
  assert.equal(a.race.lapTicks.length, 3);
  assert.equal(
    a.race.lapTicks.reduce((a, b) => a + b),
    a.replay.ticks,
  );
  assert.deepEqual(replayRun("coast", 1, a.replay), {
    score: a.score,
    ticks: a.replay.ticks,
    playMedalEligible: true,
    race: a.race.result(),
  });
  assert.ok(a.replay.events.length <= RACE_TICKS);
  assert.ok(JSON.stringify(a.replay).length < 262144);
  const finished = a.race.distance;
  a.race.advance(1, 1, true);
  assert.equal(a.race.distance, finished);
});

test("steering and drift reward skill; coasting costs time; incomplete runs score zero", () => {
  const drift = drive(1, "drift"),
    brake = drive(1, "brake");
  // Rival items land differently on every seed, so skill is measured over a
  // few races rather than one.
  const total = (style: Driving) =>
    [1, 2, 3, 4].reduce((sum, seed) => sum + drive(seed, style).race.ticks, 0);
  const clean = total("clean"),
    idle = total("idle");
  assert.ok(total("drift") < clean - 1200, "drifting saves seconds a race");
  assert.ok(idle > clean + 240, "coasting costs a second a race or more");
  assert.ok(drift.score > 0);
  assert.ok(drift.race.boosts > 0);
  assert.equal(brake.replay.ticks, RACE_TICKS);
  assert.equal(brake.score, 0);
  assert.ok(brake.race.distance < RACE_DISTANCE);
  assert.equal(replayRun("coast", 1, brake.replay).score, 0);
  const r = new CoastRace();
  for (let i = 0; i < 240; i++) r.advance(0, 0, true);
  r.advance(0, 0, false);
  assert.equal(r.charge, 0, "drifting without accelerating cannot charge");
  assert.equal(r.boosts, 0);
});

test("race time encoding preserves faster-is-better, exact tick ties, and sub-minute formatting", () => {
  assert.equal(raceTime(3600), "1:00.00");
  assert.equal(raceTime(3599), "0:59.98");
  assert.equal(raceScoreTime(raceScore(2460)), "0:41.00");
  assert.equal(formatScore("coast", 0), "No finish");
  assert.equal(formatScore("noodle", 20), "20");
  for (let ticks = 1; ticks <= RACE_TICKS; ticks++) {
    assert.ok(raceScore(ticks) > 0);
    assert.equal(raceScoreTime(raceScore(ticks)), raceTime(ticks));
    if (ticks > 1) assert.ok(raceScore(ticks - 1) > raceScore(ticks));
  }
  assert.equal(gameIds.length, 5);
  assert.deepEqual(trackPoint(0), trackPoint(TRACK_LENGTH));
});

test("race replay rejects early finishes, invalid inputs, after-finish events, and oversized duration", () => {
  const run = drive(1);
  assert.throws(
    () => replayRun("coast", 1, { ...run.replay, version: 1 }),
    /Invalid/,
  );
  assert.throws(
    () =>
      replayRun("coast", 1, {
        version: rulesVersion("coast"),
        ticks: 60,
        events: [],
      }),
    /Finish/,
  );
  assert.throws(
    () => replayRun("coast", 1, { ...run.replay, ticks: RACE_TICKS + 1 }),
    /Invalid/,
  );
  assert.throws(
    () =>
      replayRun("coast", 1, {
        ...run.replay,
        events: [[0, 2, 0, -1, 0, -1, -1]],
      }),
    /inputs/,
  );
  assert.throws(
    () => replayRun("coast", 1, { ...run.replay, ticks: run.replay.ticks + 1 }),
    /after game over/,
  );
  assert.throws(
    () => replayRun("brick", 1, { version: 1, ticks: 3601, events: [] }),
    /Invalid/,
  );
  assert.throws(
    () => replayRun("unknown", 1, { version: 1, ticks: 60, events: [] }),
    /Invalid game/,
  );
});

test("verified race times drive daily medals, weekly totals and three distinct-neighbour dares without rewriting older scores", () => {
  const directory = mkdtempSync(join(tmpdir(), "darecade-race-"));
  let time = Date.parse("2026-10-06T08:00:00+08:00");
  const store = new Store(":memory:", () => time),
    community = new Community(store, { directory });
  const consent = {
    year: 2000,
    month: 1,
    consent: true,
    privacyVersion: PRIVACY_VERSION,
  };
  try {
    const people = Array.from({ length: 5 }, (_, i) => {
      const p = community.join(consent).me.id;
      store.db
        .prepare("INSERT INTO accounts VALUES(?,?,?)")
        .run(p, `racer${i}@example.test`, time - 172800000);
      const progress = community.privateProfile(p).progress;
      progress.coastRecord = { version: 5, timeTicks: 7000, place: 8 };
      community.save(p, progress);
      return p;
    });
    const submit = (
      id: string,
      style: Driving,
      target: string | null = null,
    ) => {
      const session = community.begin(id, "coast", target);
      const run = drive(session.seed, style);
      assert.throws(
        () =>
          community.finish(id, {
            id: session.id,
            score: run.score + 1,
            replay: run.replay,
          }),
        /does not match/,
      );
      assert.throws(
        () =>
          community.finish(id, {
            id: session.id,
            score: run.score,
            replay: run.replay,
          }),
        /faster than/,
      );
      time += (run.replay.ticks * 1000) / 60 + 1000;
      const data = { id: session.id, score: run.score, replay: run.replay };
      const result = community.finish(id, data);
      const retry = community.finish(id, data);
      assert.equal(retry.profile.progress.xp, result.profile.progress.xp);
      return { result, session, run };
    };
    submit(people[0], "drift");
    submit(people[1], "clean");
    submit(people[2], "clean");
    submit(people[3], "idle");
    submit(people[4], "brake");
    const state = community.state(people[0]);
    assert.deepEqual(
      state.boards.coast.map((p) => p.rank),
      [1, 2, 2, 4],
    );
    assert.equal(state.boards.coast[0].id, people[0]);
    assert.equal(state.boards.coast.length, 4, "DNF cannot enter the board");
    const guest = community.join(consent).me.id;
    const guestState = community.state(guest);
    assert.deepEqual(
      guestState.boards.coast,
      state.boards.coast,
      "guests can compare against actual daily Coast Rush times before saving email",
    );
    assert.equal(guestState.boards.noodle.length, 0);
    assert.equal(guestState.weekly.length, 0);
    assert.ok(
      !JSON.stringify(guestState.boards.coast).includes("@example.test"),
    );
    community.moderate(guest, people[0], "block");
    assert.ok(
      !community.state(guest).boards.coast.some((p) => p.id === people[0]),
      "blocked racers remain hidden from guest timing comparisons",
    );
    const dare = submit(people[4], "drift", people[3]);
    assert.equal(dare.result.won, true);
    assert.equal(
      dare.session.targetScore,
      drive(dare.session.seed, "idle").score,
    );
    assert.throws(
      () => community.begin(people[4], "coast", people[3]),
      /already|different/,
    );
    community.begin(people[4], "coast", people[1]);
    community.begin(people[4], "coast", people[2]);
    assert.throws(
      () => community.begin(people[4], "coast", people[0]),
      /three/,
    );
    // The faster racing dare also becomes today's best, giving two equal firsts.
    assert.deepEqual(
      community.state(people[0]).boards.coast.map((p) => p.rank),
      [1, 1, 3, 3, 5],
    );
    time = Date.parse("2026-10-07T00:00:00+08:00");
    const settled = community.state(people[0]);
    assert.equal(settled.boards.coast.length, 0);
    assert.deepEqual(
      settled.weekly.map((p) => p.points),
      [3, 3, 1, 1],
    );
    assert.deepEqual(
      community.state(people[0]).weekly,
      settled.weekly,
      "settles exactly once",
    );
    assert.equal(community.privateProfile(people[0]).progress.best.noodle, 0);
    assert.ok(community.privateProfile(people[0]).progress.best.coast > 0);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("manual throttle, a beatable lap-one pass, and seven fixed game-character rivals", () => {
  const stopped = new CoastRace();
  for (let tick = 0; tick < 300; tick++) stopped.advance(0, 0, false);
  assert.equal(stopped.distance, 0);
  assert.equal(stopped.place, 8);
  assert.equal(new Set(RIVALS.map((r) => r.name)).size, 7);
  const race = new CoastRace();
  while (race.lap === 1 && !race.ended) {
    const steer = Math.sign(
      trackCurve(race.distance) * race.speed ** 2 * 0.1 -
        race.offset * 2 -
        race.lateralSpeed * 0.5,
    );
    race.advance(steer, 1, false);
  }
  assert.ok(
    race.place < 8,
    "a novice without drifting passes a rival on lap one",
  );
  assert.ok(new Set(race.rivals.map((r) => Math.floor(r.distance))).size > 5);
  const speed = race.speed;
  for (let i = 0; i < 60; i++) race.advance(0, -1, false);
  assert.ok(race.speed < speed);
});

test("drift release awards the displayed Mini, Super and Ultra tiers", () => {
  assert.equal(driftTier(0.79), null);
  for (const [ticks, expected] of [
    [48, "Mini"],
    [96, "Super"],
    [144, "Ultra"],
  ] as const) {
    const race = new CoastRace();
    race.speed = 23;
    for (let i = 0; i < ticks; i++) {
      const steer = Math.sign(
        trackCurve(race.distance) * race.speed ** 2 * 0.1 -
          race.offset * 2 -
          race.lateralSpeed * 0.5,
      );
      race.advance(steer, 1, true);
    }
    assert.equal(race.tier, expected);
    race.advance(0, 1, false);
    assert.equal(race.lastTurbo, expected);
    assert.ok(race.boost > 0);
    assert.equal(race.charge, 0);
  }
});

test("crates draw one of seven seeded items; E consumes once per press; shells are lap pickups", () => {
  const race = new CoastRace();
  // Karts are solid, so the grid is moved clear of the crates being crossed.
  for (const r of race.rivals) r.distance += 300;
  const cross = (point: { distance: number; offset: number }) => {
    race.distance = point.distance - 0.1;
    race.offset = point.offset;
    race.speed = 23;
    race.advance(0, 1, false);
  };
  cross(itemCrates[0]);
  assert.ok(ITEMS.includes(race.item!));
  race.item = "shield";
  race.advance(0, 1, false, true);
  assert.equal(race.item, null);
  assert.ok(race.shield > 2.9);
  race.item = "turbo";
  race.advance(0, 1, false);
  race.advance(0, 1, false, true);
  assert.equal(race.item, null);
  assert.ok(race.boost > 1.9);
  race.item = "shield";
  race.advance(0, 1, false, true);
  assert.equal(race.item, "shield", "held E does not consume the next item");
  cross(pickups[9]);
  assert.equal(race.pickupCount, 1);
  assert.ok(race.collected.has("pickup:0:9"));

  // The draw depends on the seed, covers all seven, and repeats for one seed.
  const draw = (seed: number, leading = false) => {
    const r = new CoastRace(seed);
    for (const rival of r.rivals) rival.distance += 300;
    if (leading) r.distance = TRACK_LENGTH;
    r.distance += itemCrates[0].distance - 0.1;
    r.offset = itemCrates[0].offset;
    r.speed = 23;
    r.advance(0, 1, false);
    return r.item;
  };
  const seeds = Array.from({ length: 400 }, (_, i) => i * 7919 + 1);
  const counts = new Map<string, number>();
  for (const seed of seeds) {
    const item = draw(seed)!;
    assert.equal(draw(seed), item);
    counts.set(item, (counts.get(item) ?? 0) + 1);
  }
  assert.deepEqual([...counts.keys()].sort(), [...ITEMS].sort());
  for (const [item, n] of counts)
    assert.ok(n > 25 && n < 95, `${item} drawn ${n} of 400 times`);
  for (const seed of seeds)
    assert.ok(
      ["shield", "turbo", "coconut", "wave"].includes(draw(seed, true)!),
      "the leader has no kart ahead to aim at",
    );
});

/** Eight parked karts three apart, kart 0 at the back, and nobody collecting crates. */
function field(seed = 1) {
  const karts = Array.from({ length: 8 }, (_, i) =>
    racer(`K${i}`, "#fff", i ? 20 : 0, 100 + i * 30, i % 2 ? -2.8 : 2.8),
  );
  return { karts, field: new RaceField(karts, seed, false) };
}
const steps = (f: RaceField, ticks: number) => {
  for (let i = 0; i < ticks; i++) f.step();
};

test("missile knocks the kart in front, storm slows every kart ahead, coconut spins a chaser", () => {
  const missile = field(),
    free = field();
  // Everyone is up to speed before the missile goes.
  steps(missile.field, 300);
  steps(free.field, 300);
  const struckAt = missile.karts[1].distance;
  missile.field.use(0, "missile");
  assert.equal(missile.field.missiles.length, 1);
  assert.equal(missile.field.missiles[0].target, 1, "the next kart ahead");
  steps(missile.field, 240);
  steps(free.field, 240);
  assert.equal(missile.field.missiles.length, 0);
  assert.deepEqual(missile.field.hits, [
    { kind: "spin", kart: 1, by: 0, item: "missile" },
  ]);
  assert.ok(
    free.karts[1].distance - missile.karts[1].distance > 10,
    "the knocked kart loses ground",
  );
  assert.ok(
    missile.karts[1].distance - struckAt > 40,
    "but it rolls on: nothing stops dead",
  );
  for (let i = 2; i < 8; i++)
    assert.equal(missile.karts[i].distance, free.karts[i].distance);

  const storm = field();
  steps(storm.field, 300);
  storm.field.use(3, "storm");
  assert.ok(storm.karts.slice(4).every((k) => k.slow > 0));
  assert.ok(
    storm.karts.slice(0, 4).every((k) => !k.slow),
    "karts behind, and the one who called it, are not slowed",
  );
  steps(storm.field, 150);
  assert.ok(storm.karts[5].speed < storm.karts[5].pace * 0.6);
  assert.equal(storm.karts[2].speed, storm.karts[2].pace);
  steps(storm.field, 300);
  assert.equal(storm.karts[5].speed, storm.karts[5].pace);

  const coconut = field();
  coconut.karts[4].distance = 400;
  coconut.field.use(4, "coconut");
  assert.equal(coconut.field.coconuts.length, 1);
  steps(coconut.field, 60 * 12);
  assert.equal(coconut.field.coconuts.length, 0);
  assert.equal(
    coconut.field.hits.filter((h) => h.kind === "spin").length,
    1,
    "only the first chaser is caught",
  );
  assert.equal(coconut.field.hits[0].by, 4);

  const leader = field();
  leader.field.use(7, "missile");
  steps(leader.field, 120);
  assert.equal(
    leader.field.missiles.length,
    0,
    "with no kart ahead it flies off",
  );
  assert.equal(leader.field.hits.length, 0);
});

test("wave spins every kart close by, crab runs down the leader, and a shield turns both away", () => {
  const wave = field();
  // Karts 2, 3 and 4 bunch up; the rest are out of reach.
  wave.karts[2].distance = 195;
  wave.karts[4].distance = 205;
  wave.karts[3].distance = 200;
  wave.karts[4].shield = 3;
  wave.field.use(3, "wave");
  assert.deepEqual(wave.field.hits, [
    { kind: "spin", kart: 2, by: 3, item: "wave" },
    { kind: "block", kart: 4, by: 3, item: "wave" },
  ]);
  assert.equal(wave.karts[2].spin, SPIN_TICKS);
  assert.equal(wave.karts[4].spin, 0);
  assert.equal(wave.karts[3].spin, 0, "never the kart that set it off");

  const crab = field();
  crab.field.use(0, "crab");
  assert.equal(
    crab.field.missiles[0].target,
    7,
    "the leader, not the next kart",
  );
  assert.equal(crab.field.missiles[0].crab, true);
  steps(crab.field, 600);
  assert.deepEqual(crab.field.hits, [
    { kind: "spin", kart: 7, by: 0, item: "crab" },
  ]);
  assert.deepEqual(crab.field.uses, [{ kart: 0, item: "crab" }]);
  assert.equal(field().field.place(7), 1);
  assert.equal(field().field.place(0), 8);
});

test("computer karts collect crates and use items on each other and the player, but not in a first race", () => {
  const used = (seed: number) => {
    const race = new CoastRace(seed);
    const uses = new Map<string, number>();
    let cpuHits = 0;
    const original = race.field.use.bind(race.field);
    race.field.use = (index, item) => {
      if (index) uses.set(item, (uses.get(item) ?? 0) + 1);
      original(index, item);
      if (index) cpuHits += race.field.hits.length;
    };
    for (let i = 0; i < 60 * 100 && !race.ended; i++) {
      const steer = Math.sign(
        trackCurve(race.distance) * race.speed ** 2 * 0.12 -
          race.offset * 2 -
          race.lateralSpeed * 0.5,
      );
      race.advance(steer, 1, false);
    }
    return { race, uses, cpuHits };
  };
  const all = new Set<string>();
  let total = 0,
    struck = 0;
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { race, uses } = used(seed);
    for (const [item, n] of uses) {
      all.add(item);
      total += n;
    }
    struck += race.struck;
    assert.ok(race.speed > 0, "whatever hit it, the kart is still moving");
  }
  assert.deepEqual([...all].sort(), [...ITEMS].sort());
  // A fight, not a barrage: roughly twenty to thirty rival items a race, and
  // the player hit by about one in five of them.
  assert.ok(total > 100 && total < 220, `${total} rival items in six races`);
  assert.ok(struck > 10 && struck < 50, `player struck ${struck} times`);
  const first = used(-1);
  assert.equal(first.uses.size, 0);
  assert.equal(first.race.struck, 0);
  assert.ok(first.race.rivals.every((r) => r.item === null));
});

test("an item hit spins the player without stopping the kart; a shield blocks it", () => {
  // A first race, so no rival item lands on top of the one being tested.
  const race = new CoastRace(-1);
  race.speed = 23;
  race.distance = 300;
  assert.equal(race.strike("spin", "Marina", "missile"), true);
  assert.equal(race.spin, SPIN_TICKS);
  assert.deepEqual(race.lastStruck, { by: "Marina", item: "missile" });
  let slowest = Infinity;
  for (let i = 0; i < SPIN_TICKS; i++) {
    const before = race.distance;
    race.advance(1, 1, true);
    assert.ok(race.distance > before, "still rolling");
    assert.equal(race.drifting, false, "no drifting mid-spin");
    slowest = Math.min(slowest, race.speed);
  }
  assert.ok(slowest >= 7 && slowest < 10);
  assert.equal(race.spin, 0);
  for (let i = 0; i < 120; i++)
    race.advance(
      Math.sign(
        trackCurve(race.distance) * race.speed ** 2 * 0.12 -
          race.offset * 2 -
          race.lateralSpeed * 0.5,
      ),
      1,
      false,
    );
  assert.ok(race.speed > 22, "back to cruising two seconds later");
  race.shield = 3;
  assert.equal(race.strike("slow", "Reef", "storm"), false);
  assert.equal(race.slow, 0);
  assert.equal(race.blocks, 1);
  assert.equal(race.struck, 1);
});

test("the drift route is closed, never crosses itself, and its hairpins need a drift at cruising speed", () => {
  let tightest = Infinity,
    left = 0,
    right = 0;
  for (let d = 0; d < TRACK_LENGTH; d += 2) {
    const curve = trackCurve(d);
    tightest = Math.min(tightest, 1 / Math.abs(curve));
    if (curve > 0.03) left++;
    if (curve < -0.03) right++;
    for (let e = d + 60; e < d + TRACK_LENGTH - 60; e += 2) {
      const a = trackPoint(d),
        b = trackPoint(e);
      assert.ok(
        Math.hypot(a.x - b.x, a.z - b.z) > 24,
        `sections at ${d} and ${e} stay apart`,
      );
    }
  }
  assert.ok(tightest > 12 && tightest < 16, `tightest radius ${tightest}`);
  assert.ok(left > 40 && right > 60, "long bends both ways");
  // Three hairpins and a carousel: bends tighter than a 20-unit radius make
  // up a good part of the lap, where the old route had one.
  let tight = 0;
  for (let d = 0; d < TRACK_LENGTH; d++)
    if (Math.abs(trackCurve(d)) > 1 / 20) tight++;
  assert.ok(tight > 150, `${tight} units of tight bend`);
  // Pads and crate rows sit on straights, not in a bend.
  for (const p of [...boostPads, ...itemCrates.filter((c) => !c.offset)])
    assert.ok(
      Math.abs(trackCurve(p.distance)) < 1 / 25,
      `at ${p.distance / TRACK_LENGTH}`,
    );
  // At cruising speed the harbour hairpin throws a kart that is not drifting
  // onto the sand, and into the wall from a wide line. A drift holds the road
  // and charges a turbo.
  const hairpin = (drift: boolean, line: number) => {
    const race = new CoastRace(-1);
    race.distance = TRACK_LENGTH * 0.19;
    race.offset = line;
    race.speed = 23;
    let widest = 0;
    while (race.distance < TRACK_LENGTH * 0.29) {
      race.advance(
        Math.sign(
          trackCurve(race.distance) * race.speed ** 2 * 0.12 -
            race.offset * 2 -
            race.lateralSpeed * 0.5,
        ),
        1,
        drift,
      );
      widest = Math.max(widest, Math.abs(race.offset));
    }
    return { race, widest };
  };
  assert.ok(hairpin(true, 0).widest < 3, "a drift stays near its line");
  assert.equal(hairpin(true, 0).race.charge, 1, "and earns an Ultra turbo");
  assert.ok(hairpin(false, 0).widest > 5, "no drift: out to the edge");
  assert.equal(hairpin(true, -4).race.bumps, 0);
  assert.ok(hairpin(false, -4).race.bumps > 0, "no drift from wide: the wall");
});

test("walls and other karts only rub off speed; an active shield prevents both", () => {
  for (const kind of ["wall", "kart"] as const)
    for (const protectedByShield of [false, true]) {
      const race = new CoastRace(-1);
      race.speed = 23;
      race.distance = 245;
      race.shield = protectedByShield ? 3 : 0;
      if (kind === "wall") race.offset = WALL + 0.2;
      else {
        race.rivals[6].distance = 245.5;
        race.offset = race.rivals[6].offset;
      }
      race.advance(0, 1, false);
      assert.equal(race.bumps, protectedByShield ? 0 : 1);
      assert.ok(Math.abs(race.offset) <= WALL, "the wall still holds the kart");
      if (protectedByShield) {
        assert.ok(race.speed > 22, "a shielded kart keeps its speed");
        continue;
      }
      // A knock, not a stop: most of the speed survives and the kart keeps going.
      assert.ok(race.speed > 23 * 0.8 && race.speed < 23, String(race.speed));
      const distance = race.distance;
      for (let tick = 0; tick < 45; tick++) race.advance(0, 1, false);
      assert.ok(race.distance - distance > 12, "it never stops");
      assert.ok(race.speed > 15);
    }
  // Leaning on the wall all the way round costs speed for as long as it lasts.
  const rider = new CoastRace(-1);
  rider.speed = 23;
  rider.distance = 245;
  for (let tick = 0; tick < 240; tick++) {
    rider.offset = WALL + 0.2;
    rider.advance(0, 1, false);
  }
  assert.ok(rider.speed > 14 && rider.speed < 18, String(rider.speed));
  assert.ok(rider.bumps >= 4);
  // A kart that is shoved moves aside instead of sitting on the one it hit.
  const shoved = new CoastRace(-1);
  shoved.speed = 23;
  shoved.distance = 245;
  shoved.rivals[6].distance = 245.5;
  shoved.offset = shoved.rivals[6].offset + 0.4;
  shoved.advance(0, 1, false);
  assert.ok(shoved.lateralSpeed > 0, "pushed away from the other kart");
});

/** Two karts sharing a piece of road, which solid karts never do. */
const overlapping = (
  a: { distance: number; offset: number },
  b: { distance: number; offset: number },
) =>
  Math.abs(a.distance - b.distance) < KART_LENGTH - 0.2 &&
  Math.abs(a.offset - b.offset) < KART_WIDTH - 0.3;

test("karts are solid: a driver is held behind a kart it runs into, slides off it and loses pace", () => {
  const meet = (blocked: boolean) => {
    const race = new CoastRace(-1);
    const slow = race.rivals[6];
    for (const r of race.rivals) if (r !== slow || !blocked) r.distance += 300;
    race.distance = 240;
    race.offset = slow.offset;
    race.speed = 23;
    if (blocked) slow.distance = 243;
    let slowest = 23,
      held = 0;
    for (let tick = 0; tick < 150; tick++) {
      const before = race.distance;
      // Holding the slow kart's line, so the driver keeps steering back at it.
      const steer = Math.sign(
        trackCurve(race.distance) * race.speed ** 2 * 0.1 -
          (race.offset - slow.offset) * 2 -
          race.lateralSpeed * 0.5,
      );
      race.advance(steer, 1, false);
      assert.ok(!overlapping(race, slow), `inside the other kart at ${tick}`);
      slowest = Math.min(slowest, race.speed);
      if (race.distance - before < (race.speed / 60) * 0.9) held++;
    }
    return { race, slow, slowest, held };
  };
  const free = meet(false),
    hit = meet(true);
  assert.equal(free.race.bumps, 0);
  assert.equal(free.held, 0);
  assert.ok(hit.race.bumps >= 1);
  assert.ok(hit.held > 3, `held behind for ${hit.held} ticks`);
  assert.ok(hit.slowest < 23 * 0.9, String(hit.slowest));
  assert.ok(hit.slowest > 12, "a knock and a rub, not a stop");
  assert.ok(
    Math.abs(hit.race.offset - hit.slow.offset) >= KART_WIDTH - 0.3 ||
      hit.race.distance > hit.slow.distance + KART_LENGTH - 0.2,
    "it went round",
  );
  assert.ok(hit.race.distance > hit.slow.distance, "and got past");
  assert.ok(
    free.race.distance - hit.race.distance > 2,
    "the contact cost ground",
  );
});

test("door to door, karts push each other apart and rub for as long as one leans on the other", () => {
  const race = new CoastRace(-1);
  const rival = race.rivals[0];
  for (const r of race.rivals) if (r !== rival) r.distance += 300;
  race.distance = rival.distance = 240;
  race.speed = rival.speed = 20.5;
  race.offset = rival.offset - 1.6;
  const line = rival.offset;
  // Steering into the other kart the whole time. It gives way until it runs
  // out of road, and from there the two rub.
  const lean = (ticks: number) => {
    let rubbed = 0;
    for (let tick = 0; tick < ticks; tick++) {
      race.advance(1, 1, false);
      assert.ok(!overlapping(race, rival), `inside the other kart at ${tick}`);
      if (race.rub && rival.rub) rubbed++;
    }
    return rubbed;
  };
  lean(30);
  assert.ok(rival.offset > line + 1, "the other kart was pushed off its line");
  assert.equal(race.bumps, 1, "they met with a knock");
  assert.ok(lean(30) > 20, "pinned at the edge, both rub every tick");
  assert.ok(race.speed < 23 * 0.85, "leaning on a kart holds the pace down");
  assert.ok(rival.speed < 19, "and holds the other kart's pace down too");
  assert.equal(race.bumps, 1, "one knock, then a rub");
  // Steering away ends it.
  for (let tick = 0; tick < 40; tick++) race.advance(-1, 1, false);
  assert.equal(race.rub, 0);
  // A shielded kart keeps its line and its speed, and the other one gives way.
  const shielded = new CoastRace(-1);
  const other = shielded.rivals[0];
  for (const r of shielded.rivals) if (r !== other) r.distance += 300;
  shielded.distance = other.distance = 240;
  shielded.speed = other.speed = 20.5;
  shielded.offset = other.offset - 1;
  shielded.shield = 3;
  shielded.advance(0, 1, false);
  assert.equal(shielded.bumps, 0);
  assert.equal(shielded.rub, 0);
  assert.ok(other.offset > 2.8 && other.rub > 0);
});

test("computer karts are solid to each other, and go round a slower kart instead of through it", () => {
  // Already on its tail: the faster kart is held, rubs and slides off.
  const karts = [
    racer("Fast", "#fff", 24, 100, 2.8),
    racer("Slow", "#fff", 12, 102.2, 2.8),
  ];
  const [fast, slow] = karts;
  fast.speed = 24;
  slow.speed = 12;
  const close = new RaceField(karts, 1, false);
  let rubbed = false,
    slowest = 24;
  for (let tick = 0; tick < 300; tick++) {
    close.step();
    assert.ok(!overlapping(fast, slow), `inside the other kart at ${tick}`);
    rubbed ||= fast.rub > 0;
    slowest = Math.min(slowest, fast.speed);
  }
  assert.ok(rubbed);
  assert.ok(slowest < 24 * 0.92, String(slowest));
  assert.ok(fast.distance > slow.distance + KART_LENGTH, "it got past");
  assert.ok(Math.abs(fast.offset - 2.8) < 0.1, "and went back to its lane");
  // With room to see it coming, it pulls out early and never touches.
  const far = [
    racer("Fast", "#fff", 24, 100, 2.8),
    racer("Slow", "#fff", 12, 112, 2.8),
  ];
  far[0].speed = 24;
  far[1].speed = 12;
  const open = new RaceField(far, 1, false);
  let widest = 0;
  for (let tick = 0; tick < 300; tick++) {
    open.step();
    assert.equal(far[0].rub, 0);
    widest = Math.max(widest, Math.abs(far[0].offset - 2.8));
  }
  assert.ok(widest > KART_WIDTH, "pulled out to pass");
  assert.ok(far[0].distance > far[1].distance + KART_LENGTH);
});

test("computer karts move across to block a kart catching them, but not in a first race", () => {
  const blocks = (seed: number, fighting: boolean) => {
    const karts = [
      racer("Driver", "#fff", 0, 114, -1.5),
      racer("Rival", "#fff", 20, 120, 2.8),
    ];
    const [driver, rival] = karts;
    driver.speed = 26;
    rival.speed = 20;
    const f = new RaceField(karts, seed, fighting);
    let nearest = Infinity;
    for (let tick = 0; tick < 60; tick++) {
      // The driver closes on the rival along its own line.
      driver.distance += driver.speed / 60;
      f.step();
      nearest = Math.min(nearest, Math.abs(rival.offset - driver.offset));
    }
    return nearest < 2.5;
  };
  const seeds = Array.from({ length: 40 }, (_, i) => i * 7919 + 1);
  const fought = seeds.filter((seed) => blocks(seed, true)).length;
  // In the mood about two times in three.
  assert.ok(fought > 15 && fought < 36, `${fought} of 40 blocked`);
  assert.equal(seeds.filter((seed) => blocks(seed, false)).length, 0);
});

test("new bests and race records come from replay, retry safely, and never put rivals on real boards", () => {
  const directory = mkdtempSync(join(tmpdir(), "darecade-gp-record-"));
  let now = Date.parse("2026-10-06T10:00:00+08:00");
  const store = new Store(":memory:", () => now),
    community = new Community(store, { directory });
  try {
    const id = community.join({
      year: 2000,
      month: 1,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    }).me.id;
    const submit = (style: Driving) => {
      const session = community.begin(id, "coast"),
        run = drive(session.seed, style);
      now += (run.replay.ticks / 60) * 1000 + 500;
      const payload = {
        id: session.id,
        score: run.score,
        replay: run.replay,
        race: { place: 1, timeTicks: 1, pickups: 999 },
      };
      const result = community.finish(id, payload);
      assert.deepEqual(result.race, {
        ...run.race.result(),
        newBest: result.race.newBest,
      });
      assert.deepEqual(community.finish(id, payload).race, result.race);
      return result;
    };
    const first = submit("clean");
    assert.equal(first.ranked, false);
    assert.equal(first.race.newBest, true);
    assert.equal(first.welcome, true);
    const same = submit("clean");
    assert.equal(same.race.newBest, false);
    assert.equal(same.welcome, false);
    const better = submit("drift");
    assert.equal(better.race.newBest, true);
    const record = better.profile.progress.coastRecord;
    community.patch(id, {
      coastRecord: { version: 3, timeTicks: 1, place: 1 },
    });
    assert.deepEqual(community.privateProfile(id).progress.coastRecord, record);
    assert.equal(
      community.state(id).boards.coast.length,
      1,
      "standard guest races are ranked; AI are excluded",
    );
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM players").get().n, 1);
    const verified = community.join({
      year: 2000,
      month: 1,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    }).me.id;
    store.db
      .prepare("INSERT INTO accounts VALUES(?,?,?)")
      .run(verified, "board@example.test", now - 172800000);
    const rankedRun = store.begin(verified, "coast");
    store.finish(verified, rankedRun.id, 1000);
    assert.equal(community.state(verified).boards.coast.length, 2);
    assert.equal(
      community.state(id).boards.coast.length,
      2,
      "guests and accounts share the ranked board",
    );
    assert.ok(community.state(id).boards.coast.some((p) => p.id === verified));
    assert.ok(
      community.state(id).boards.coast.some((p) => p.id === id),
      "validated standard races enter the guest's own result",
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("old two-lap times and dares are archived without changing other games or earned medals", () => {
  const directory = mkdtempSync(join(tmpdir(), "darecade-gp-migration-"));
  const now = Date.parse("2026-10-06T10:00:00+08:00");
  const store = new Store(":memory:", () => now),
    community = new Community(store, { directory });
  try {
    const id = community.join({
      year: 2000,
      month: 1,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    }).me.id;
    store.db
      .prepare("INSERT INTO accounts VALUES(?,?,?)")
      .run(id, "old@example.test", now - 172800000);
    const old = store.begin(id, "coast");
    store.finish(id, old.id, 5000);
    store.db
      .prepare("UPDATE runs SET version=1,seed=42 WHERE id=?")
      .run(old.id);
    store.db
      .prepare("INSERT INTO dares VALUES(?,?,?,?,?,?,?,?)")
      .run("old-dare", id, old.id, "coast", 42, 5000, now, now + 86400000);
    const progress = community.privateProfile(id).progress;
    delete progress.coastRecord;
    progress.best.coast = 5000;
    progress.best.noodle = 30;
    store.db
      .prepare("UPDATE profiles SET progress=? WHERE player=?")
      .run(JSON.stringify(progress), id);
    store.db
      .prepare("INSERT INTO medals VALUES(?,?,?,?,?,?)")
      .run("2026-10-05", "coast", id, 1, 3, 5000);
    const migrated = community.privateProfile(id).progress;
    assert.equal(migrated.best.coast, 0);
    assert.equal(migrated.coastLegacyBest, 5000);
    assert.equal(migrated.best.noodle, 30);
    assert.equal(community.state(id).boards.coast.length, 0);
    assert.equal(community.state(id).dares.length, 0);
    assert.throws(() => community.postDare(id, old.id), /saved score/);
    assert.throws(
      () => community.begin(id, "coast", null, "old-dare"),
      /closed/,
    );
    assert.equal(
      store.db.prepare("SELECT points FROM medals WHERE player=?").get(id)
        .points,
      3,
    );
    assert.equal(
      store.db.prepare("SELECT score FROM runs WHERE id=?").get(old.id).score,
      5000,
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a race that uses its items replays to the same result on the server", () => {
  const seed = 20261004,
    sim = new Simulation("coast", seed),
    events: Replay["events"] = [],
    used = new Set<string>();
  let previous = "";
  while (!sim.ended) {
    const r = sim.race!;
    if (r.item) used.add(r.item);
    const input: Input = [
      Math.sign(
        trackCurve(r.distance) * r.speed ** 2 * 0.24 -
          r.offset * 2 -
          r.lateralSpeed * 0.5,
      ),
      1,
      r.item && sim.ticks % 30 === 0 ? 1 : -1,
      Number(r.charge < 0.98),
      -1,
      -1,
    ];
    const stamp = JSON.stringify(input);
    if (stamp !== previous) {
      events.push([sim.ticks, ...input]);
      previous = stamp;
    }
    sim.advance(input);
  }
  assert.ok(sim.score > 0);
  assert.ok(used.size >= 3, `used ${[...used]}`);
  assert.deepEqual(
    replayRun("coast", seed, {
      version: rulesVersion("coast"),
      ticks: sim.ticks,
      events,
    }),
    {
      score: sim.score,
      ticks: sim.ticks,
      playMedalEligible: true,
      race: sim.race!.result(),
    },
  );
});

test("old-loop times are archived when the route changes; earlier days still settle on the old loop", () => {
  const directory = mkdtempSync(join(tmpdir(), "darecade-route-migration-"));
  const now = Date.parse("2026-10-06T10:00:00+08:00"),
    midnight = Date.parse("2026-10-06T00:00:00+08:00");
  const store = new Store(":memory:", () => now),
    community = new Community(store, { directory });
  try {
    assert.equal(rulesVersion("coast"), 5);
    const id = community.join({
      year: 2000,
      month: 1,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    }).me.id;
    store.db
      .prepare("INSERT INTO accounts VALUES(?,?,?)")
      .run(id, "loop@example.test", now - 172800000);
    const old = store.begin(id, "coast");
    store.finish(id, old.id, 4200);
    store.db
      .prepare("UPDATE runs SET version=2,seed=42,finished=? WHERE id=?")
      .run(midnight - 3600000, old.id);
    const progress = community.privateProfile(id).progress;
    Object.assign(progress, {
      coastRecord: { version: 2, timeTicks: 3001, place: 2 },
      coastLegacyBest: 5000,
    });
    progress.best.coast = 4200;
    progress.best.hop = 40;
    store.db
      .prepare("UPDATE profiles SET progress=? WHERE player=?")
      .run(JSON.stringify(progress), id);
    const migrated = community.privateProfile(id).progress;
    assert.equal(migrated.best.coast, 0);
    assert.equal(migrated.best.hop, 40);
    assert.equal(migrated.coastLegacyBest, 4200);
    assert.deepEqual(migrated.coastRecord, {
      version: 5,
      timeTicks: 0,
      place: 0,
    });
    assert.throws(() => community.postDare(id, old.id), /saved score/);
    assert.equal(community.state(id).boards.coast.length, 0);
    // The day before the route changed is still ranked on the old loop.
    store.coastFrom = "2026-10-01";
    assert.equal(store.board("coast", midnight, midnight - 86400000).length, 1);
    assert.equal(store.board("coast", now + 1, midnight - 86400000).length, 0);
    assert.equal(
      store.db.prepare("SELECT score FROM runs WHERE id=?").get(old.id).score,
      4200,
    );
    // The same holds for the winding route once the drift route replaces it:
    // its last day settles on version 3, and its times leave today's board.
    store.routeFrom = "2026-10-04";
    store.db.prepare("UPDATE runs SET version=3 WHERE id=?").run(old.id);
    assert.equal(store.driftFrom, "2026-10-06");
    assert.equal(store.board("coast", midnight, midnight - 86400000).length, 1);
    assert.equal(store.board("coast", now + 1, midnight - 86400000).length, 0);
    const winding = community.privateProfile(id).progress;
    Object.assign(winding, {
      coastRecord: { version: 3, timeTicks: 2900, place: 1 },
      coastLegacyBest: 0,
    });
    winding.best.coast = 4301;
    store.db
      .prepare("UPDATE profiles SET progress=? WHERE player=?")
      .run(JSON.stringify(winding), id);
    const drifted = community.privateProfile(id).progress;
    assert.equal(drifted.coastLegacyBest, 4301);
    assert.equal(drifted.coastRecord.timeTicks, 0);
    // And for the drift route before karts became solid: its last day settles
    // on version 4, and a version 4 best is archived.
    store.driftFrom = "2026-10-05";
    store.db.prepare("UPDATE runs SET version=4 WHERE id=?").run(old.id);
    assert.equal(store.contactFrom, "2026-10-06");
    assert.equal(store.board("coast", midnight, midnight - 86400000).length, 1);
    assert.equal(store.board("coast", now + 1, midnight - 86400000).length, 0);
    const ghostly = community.privateProfile(id).progress;
    Object.assign(ghostly, {
      coastRecord: { version: 4, timeTicks: 2800, place: 1 },
      coastLegacyBest: 0,
    });
    ghostly.best.coast = 4401;
    store.db
      .prepare("UPDATE profiles SET progress=? WHERE player=?")
      .run(JSON.stringify(ghostly), id);
    const solid = community.privateProfile(id).progress;
    assert.equal(solid.coastLegacyBest, 4401);
    assert.equal(solid.best.coast, 0);
    assert.deepEqual(solid.coastRecord, {
      version: 5,
      timeTicks: 0,
      place: 0,
    });
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("first-finish seeds allow 180 seconds, replay exactly and keep standard seeds unchanged", () => {
  for (const seed of [1, 42, 20261006, 4294967295]) {
    const first = drive(-seed - 1, "clean");
    assert.equal(first.race.limitTicks, 10800);
    assert.ok(first.race.result().finished);
    assert.ok(first.race.place <= 4, `seed ${seed}: ${first.race.place}`);
    assert.equal(
      replayRun("coast", -seed - 1, first.replay).score,
      first.score,
    );
    assert.equal(new CoastRace(seed).limitTicks, 7200);
  }
  const unfinished = drive(-43, "brake");
  assert.equal(unfinished.replay.ticks, 10800);
  assert.equal(unfinished.score, 0);
});

test("one GO tap with edge help can finish the first race in the top four", () => {
  const sim = new Simulation("coast", -43);
  let steer = 0;
  while (!sim.ended) {
    steer = edgeAssist(sim.race!.offset, 0, steer);
    sim.advance([steer, 1, -1, 0, -1, -1]);
  }
  assert.ok(sim.race!.result().finished);
  assert.ok(sim.race!.place <= 4);
});

test("finish records retain minutes beyond the standard two-minute limit", () => {
  assert.equal(raceTime(7671), "2:07.85");
  assert.equal(raceTime(10800), "3:00.00");
});
