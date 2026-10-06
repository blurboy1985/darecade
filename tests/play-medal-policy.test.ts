import test from "node:test";
import assert from "node:assert/strict";
import {
  Simulation,
  replayRun,
  rulesVersion,
  TICK_RATE,
  type Input,
  type Replay,
} from "../shared/simulation.ts";
import { FishingRound, HoopsRound } from "../shared/outdoor.ts";
import { HopRun } from "../src/action-games.ts";
import { trackCurve } from "../shared/racing.ts";
import {
  PLAY_MEDAL_DAILY_LIMIT,
  qualifiesForPlayMedal,
} from "../shared/play-medals.ts";

const neutral = (): Input => [0, 0, -1, 0, -1, -1];
function play(
  game: string,
  seed: number,
  controls: (sim: Simulation) => Input,
) {
  const sim = new Simulation(game, seed);
  const events: Replay["events"] = [];
  let previous = "";
  while (!sim.ended) {
    const input = controls(sim);
    const stamp = JSON.stringify(input);
    if (stamp !== previous) {
      events.push([sim.ticks, ...input]);
      previous = stamp;
    }
    sim.advance(input);
  }
  const replay = { version: rulesVersion(game), ticks: sim.ticks, events };
  const result = replayRun(game, seed, replay);
  // Eligibility is observational: the recorded round's score and time stand.
  assert.equal(result.score, sim.score);
  assert.equal(result.ticks, sim.ticks);
  return { sim, replay, result };
}

/** Uses visible positions, targets and hazards rather than altering game state. */
function meaningfulControls(sim: Simulation): Input {
  const input = neutral();
  if (sim.race) {
    const race = sim.race;
    input[0] = Math.sign(
      trackCurve(race.distance) * race.speed * race.speed * 0.1 -
        race.offset * 2 -
        race.lateralSpeed * 0.5,
    );
    input[1] = 1;
  } else if (sim.outdoor instanceof HoopsRound) {
    const round = sim.outdoor;
    input[3] = Number(
      !round.flight &&
        Math.abs(round.marker - round.centre) <= round.width * 0.14,
    );
  } else if (sim.outdoor instanceof FishingRound) {
    const round = sim.outdoor;
    input[3] = Number(
      round.state === "idle" ||
        round.state === "bite" ||
        (round.state === "reeling" && !round.surging),
    );
  } else if (sim.id === "noodle") {
    const head = sim.snake[0],
      direction = sim.direction;
    // Collect the first noodle, then steer around a safe rectangle.
    if (head.x >= 17 && direction.x === 1) input[2] = 2;
    else if (head.y >= 17 && direction.y === 1) input[2] = 3;
    else if (head.x <= 2 && direction.x === -1) input[2] = 0;
    else if (head.y <= 2 && direction.y === -1) input[2] = 1;
  } else if (sim.id === "brick") input[4] = Math.round(sim.ball.x);
  else if (sim.action instanceof HopRun)
    input[3] = Number(
      sim.action.hazards.some(
        (hazard) =>
          !hazard.passed && hazard.x < 140 && hazard.x + hazard.width > 76,
      ),
    );
  else if (sim.id === "swarm")
    input[0] = Math.floor(sim.ticks / 120) % 2 ? 1 : -1;
  return input;
}

test("Play medal policy uses completion and participation boundaries", () => {
  assert.equal(PLAY_MEDAL_DAILY_LIMIT, 3);
  assert.equal(
    qualifiesForPlayMedal({ game: "coast", finished: false }),
    false,
  );
  assert.equal(qualifiesForPlayMedal({ game: "coast", finished: true }), true);
  assert.equal(
    qualifiesForPlayMedal({ game: "fishing", completed: false, catches: 1 }),
    false,
  );
  assert.equal(
    qualifiesForPlayMedal({ game: "fishing", completed: true, catches: 0 }),
    false,
  );
  assert.equal(
    qualifiesForPlayMedal({
      game: "hoops",
      completed: false,
      attempts: 3,
      made: 1,
    }),
    false,
  );
  assert.equal(
    qualifiesForPlayMedal({
      game: "hoops",
      completed: true,
      attempts: 3,
      made: 0,
    }),
    false,
  );
  for (const game of ["noodle", "hop"] as const) {
    assert.equal(
      qualifiesForPlayMedal({ game, seconds: 15 - 1 / TICK_RATE, score: 20 }),
      false,
    );
    assert.equal(qualifiesForPlayMedal({ game, seconds: 15, score: 0 }), false);
    assert.equal(qualifiesForPlayMedal({ game, seconds: 15, score: 20 }), true);
  }
  for (const [game, required] of [
    ["brick", 3],
    ["swarm", 10],
  ] as const) {
    assert.equal(
      qualifiesForPlayMedal({
        game,
        seconds: 15,
        score: 20,
        movementSeconds: required - 1,
      }),
      false,
    );
    assert.equal(
      qualifiesForPlayMedal({
        game,
        seconds: 15,
        score: 20,
        movementSeconds: required,
      }),
      true,
    );
  }
});

test("all seven games reject completely idle completed replays", () => {
  for (const game of [
    "coast",
    "fishing",
    "hoops",
    "noodle",
    "hop",
    "brick",
    "swarm",
  ])
    assert.equal(
      play(game, 314159, neutral).result.playMedalEligible,
      false,
      game,
    );
});

test("meaningful finished replays qualify deterministically in all seven games", () => {
  for (const game of [
    "coast",
    "fishing",
    "hoops",
    "noodle",
    "hop",
    "brick",
    "swarm",
  ])
    for (const seed of [1, 77, 314159]) {
      const run = play(game, seed, meaningfulControls);
      assert.equal(run.result.playMedalEligible, true, `${game}, seed ${seed}`);
      assert.deepEqual(replayRun(game, seed, run.replay), run.result);
      assert.equal(typeof run.result.playMedalEligible, "boolean");
    }
});

test("positive two-second Noodle wall scores and short Hop runs do not qualify", () => {
  for (const game of ["noodle", "hop"]) {
    const run = play(game, 314159, neutral);
    assert.ok(run.sim.score > 0);
    assert.ok(run.sim.ticks < 15 * TICK_RATE);
    assert.equal(run.result.playMedalEligible, false);
  }
});

test("Swarm auto-fire, a single pulse, unused controls and wall holding do not qualify", () => {
  const controls: ((sim: Simulation) => Input)[] = [
    neutral,
    (sim) => [Number(sim.ticks === 0), 0, -1, 0, -1, -1],
    () => [0, 0, 1, 1, -1, -1],
    () => [1, 0, -1, 0, -1, -1],
    // A stationary pointer overrides the held keyboard input.
    () => [1, 1, -1, 0, 220, 375],
  ];
  for (const control of controls) {
    const run = play("swarm", 314159, control);
    assert.ok(run.sim.ticks <= 15 * TICK_RATE);
    if (control === neutral) assert.equal(run.sim.score, 0);
    assert.equal(run.result.playMedalEligible, false);
  }
});

test("Swarm counts distinct seconds with real steering rather than input ticks", () => {
  for (const seconds of [9, 10]) {
    const run = play("swarm", 2, (sim) => [
      sim.ticks < seconds * TICK_RATE
        ? Math.floor(sim.ticks / 30) % 2
          ? -1
          : 1
        : 0,
      0,
      -1,
      0,
      -1,
      -1,
    ]);
    assert.ok(run.sim.ticks >= 15 * TICK_RATE);
    assert.ok(run.sim.score > 0);
    assert.equal(run.result.playMedalEligible, seconds === 10);
  }
});

test("Brick does not reward two seconds of movement followed by passive scoring", () => {
  const run = play("brick", 12, (sim) => [
    0,
    0,
    -1,
    0,
    sim.ticks < 120 ? Math.round(sim.ball.x) : -1,
    -1,
  ]);
  assert.ok(run.sim.ticks >= 15 * TICK_RATE);
  assert.ok(run.sim.score > 0);
  assert.equal(run.result.playMedalEligible, false);
});

test("Hoops requires three actual shots, not one basket followed by expired clocks", () => {
  for (const attempts of [1, 2, 3]) {
    const run = play("hoops", 77, (sim) => {
      const round = sim.outdoor as HoopsRound;
      return round.attempts < attempts ? meaningfulControls(sim) : neutral();
    });
    const round = run.sim.outdoor as HoopsRound;
    assert.equal(round.shot, 10);
    assert.equal(round.attempts, attempts);
    assert.ok(round.made >= 1);
    assert.equal(run.result.playMedalEligible, attempts === 3);
  }
});

test("eligibility is recomputed from replay and unfinished rounds remain invalid", () => {
  const idle = play("swarm", 314159, neutral);
  assert.equal(
    replayRun("swarm", 314159, { ...idle.replay, playMedalEligible: true })
      .playMedalEligible,
    false,
  );
  const active = play("swarm", 314159, meaningfulControls);
  assert.throws(
    () =>
      replayRun("swarm", 314159, {
        ...active.replay,
        ticks: active.replay.ticks - 1,
      }),
    /Finish|Invalid/,
  );
});
