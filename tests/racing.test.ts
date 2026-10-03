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
  driftTier,
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
        : style === "idle" && sim.ticks % 180 > 120
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

test("Coast Rush shares deterministic three-lap physics with server replay; seed and graphics do not change handling", () => {
  const a = drive(1, "drift"),
    b = drive(876543, "drift");
  assert.deepEqual(a, b);
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
    race: a.race.result(),
  });
  assert.ok(a.replay.events.length <= RACE_TICKS);
  assert.ok(JSON.stringify(a.replay).length < 262144);
  const finished = a.race.distance;
  a.race.advance(1, 1, true);
  assert.equal(a.race.distance, finished);
});

test("steering and drift reward skill; coasting costs time; incomplete runs score zero", () => {
  const clean = drive(1),
    drift = drive(1, "drift"),
    idle = drive(1, "idle"),
    brake = drive(1, "brake");
  assert.ok(drift.score > clean.score && clean.score > idle.score);
  assert.ok(drift.race.boosts > 0);
  assert.ok(idle.race.ticks > clean.race.ticks);
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

test("crates give only shield or turbo; E consumes once per press; shells are lap pickups", () => {
  const race = new CoastRace();
  const cross = (point: { distance: number; offset: number }) => {
    race.distance = point.distance - 0.1;
    race.offset = point.offset;
    race.speed = 23;
    race.advance(0, 1, false);
  };
  cross(itemCrates[0]);
  assert.equal(race.item, "shield");
  race.advance(0, 1, false, true);
  assert.equal(race.item, null);
  assert.ok(race.shield > 2.9);
  cross(itemCrates[1]);
  assert.equal(race.item, "turbo");
  race.advance(0, 1, false, true);
  assert.equal(race.item, null);
  assert.ok(race.boost > 1.9);
  race.item = "shield";
  race.advance(0, 1, false, true);
  assert.equal(race.item, "shield", "held E does not consume the next item");
  cross(pickups[9]);
  assert.equal(race.pickupCount, 1);
  assert.ok(race.collected.has("pickup:0:9"));
});

test("walls and kart contact visibly stop the clocked racer; an active shield prevents both", () => {
  for (const kind of ["wall", "kart"] as const)
    for (const protectedByShield of [false, true]) {
      const race = new CoastRace();
      race.speed = 23;
      race.shield = protectedByShield ? 3 : 0;
      if (kind === "wall") race.offset = 6.6;
      else {
        race.distance = race.rivals[6].distance;
        race.offset = race.rivals[6].offset;
      }
      race.advance(0, 1, false);
      assert.equal(race.bumps, protectedByShield ? 0 : 1);
      if (!protectedByShield) {
        const distance = race.distance;
        for (let tick = 0; tick < 45; tick++) race.advance(-1, 1, false);
        assert.equal(race.distance, distance);
        assert.equal(race.penaltyTicks, 45);
      }
    }
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
      coastRecord: { version: 2, timeTicks: 1, place: 1 },
    });
    assert.deepEqual(community.privateProfile(id).progress.coastRecord, record);
    assert.equal(
      community.state(id).boards.coast.length,
      0,
      "guests and AI are excluded",
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
    assert.equal(community.state(verified).boards.coast.length, 1);
    assert.equal(
      community.state(id).boards.coast.length,
      0,
      "real medal boards require email verification even through the API",
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
    assert.throws(() => community.postDare(id, old.id), /validated/);
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
