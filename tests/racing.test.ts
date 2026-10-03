import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Simulation,
  replayRun,
  RULES_VERSION,
  type Input,
  type Replay,
} from "../shared/simulation.ts";
import {
  CoastRace,
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
      style === "idle" || style === "brake"
        ? 0
        : Math.sign(
            trackCurve(r.distance) * r.speed * r.speed * 0.14 -
              r.offset * 2 -
              r.lateralSpeed * 0.5,
          );
    const input: Input = [
      steering,
      Number(style === "brake"),
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
    replay: { version: RULES_VERSION, ticks: sim.ticks, events },
    race: sim.race!,
  };
}

test("Coast Rush shares deterministic two-lap physics with server replay; seed and graphics do not change handling", () => {
  const a = drive(1, "drift"),
    b = drive(876543, "drift");
  assert.deepEqual(a, b);
  assert.ok(a.score > 0);
  assert.equal(a.race.distance, RACE_DISTANCE);
  assert.equal(a.race.lapTicks.length, 2);
  assert.equal(
    a.race.lapTicks.reduce((a, b) => a + b),
    a.replay.ticks,
  );
  assert.deepEqual(replayRun("coast", 1, a.replay), {
    score: a.score,
    ticks: a.replay.ticks,
  });
  assert.ok(a.replay.events.length <= RACE_TICKS);
  assert.ok(JSON.stringify(a.replay).length < 262144);
  const finished = a.race.distance;
  a.race.advance(1, false, true);
  assert.equal(a.race.distance, finished);
});

test("steering and drift reward skill; sand and collisions cost time; incomplete runs score zero", () => {
  const clean = drive(1),
    drift = drive(1, "drift"),
    idle = drive(1, "idle"),
    brake = drive(1, "brake");
  assert.ok(drift.score > clean.score && clean.score > idle.score);
  assert.ok(drift.race.boosts > 0);
  assert.ok(idle.race.bumps > clean.race.bumps);
  assert.equal(brake.replay.ticks, RACE_TICKS);
  assert.equal(brake.score, 0);
  assert.ok(brake.race.distance < RACE_DISTANCE);
  assert.equal(replayRun("coast", 1, brake.replay).score, 0);
  const r = new CoastRace();
  for (let i = 0; i < 240; i++) r.advance(0, false, true);
  r.advance(0, false, false);
  assert.equal(
    r.charge,
    0,
    "drifting without steering into a bend cannot charge",
  );
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
    () => replayRun("coast", 1, { version: 1, ticks: 60, events: [] }),
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
