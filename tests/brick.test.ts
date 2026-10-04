import test from "node:test";
import assert from "node:assert/strict";
import {
  BRICK_BOSS_AT,
  BRICK_BOSS_HP,
  Simulation,
  replayRun,
  RULES_VERSION,
  type Input,
  type Replay,
} from "../shared/simulation.ts";

const still: Input = [0, 0, -1, 0, -1, -1];
/** A round with the ball parked out of play, so only what a test sets up happens. */
function quiet() {
  const sim = new Simulation("brick", 7);
  sim.ball = { x: 220, y: 300, vx: 0, vy: 0 };
  return sim;
}

test("the Big Brick arrives at 0:35, slides, and drops bombs that cost a life on the paddle", () => {
  const sim = quiet();
  for (let i = 0; i < BRICK_BOSS_AT * 60 - 1; i++) sim.advance(still);
  assert.equal(sim.bossSpawned, false);
  sim.advance(still);
  sim.advance(still);
  assert.equal(sim.bossSpawned, true);
  assert.equal(sim.boss!.hp, BRICK_BOSS_HP);
  const x = sim.boss!.x;
  for (let i = 0; i < 90; i++) sim.advance(still);
  assert.notEqual(sim.boss!.x, x);
  assert.ok(sim.bombs.length > 0);
  // A bomb straight above the paddle hurts once; a second in the same moment does not.
  sim.bombs = [
    { x: sim.paddle, y: 400 },
    { x: sim.paddle, y: 398 },
  ];
  for (let i = 0; i < 12; i++) sim.advance(still);
  assert.equal(sim.lives, 2);
  assert.ok(sim.guard > 0);
  // A bomb that misses the paddle does nothing.
  sim.guard = 0;
  sim.bombs = [{ x: sim.paddle + 120, y: 400 }];
  for (let i = 0; i < 30; i++) sim.advance(still);
  assert.equal(sim.lives, 2);
});

test("eight hits beat the boss; the round ends early only once the wall is gone too", () => {
  const sim = quiet();
  sim.bricks.forEach((r) => (r.alive = false));
  sim.advance(still);
  assert.equal(sim.bossSpawned, true, "clearing the wall calls the boss early");
  assert.equal(sim.ended, false);
  const score = sim.score;
  for (let hit = 1; hit <= BRICK_BOSS_HP; hit++) {
    sim.ball = { x: sim.boss!.x, y: 256, vx: 0, vy: -230 };
    sim.advance(still);
    if (hit < BRICK_BOSS_HP) {
      assert.equal(sim.boss!.hp, BRICK_BOSS_HP - hit);
      assert.equal(sim.score, score + hit * 40);
      assert.ok(sim.ball.vy > 0, "the ball bounces back down");
    }
  }
  assert.equal(sim.boss, null);
  assert.equal(sim.bossDefeated, true);
  assert.equal(sim.bombs.length, 0);
  assert.equal(sim.score, score + BRICK_BOSS_HP * 40 + 300 + 100);
  assert.equal(sim.ended, true);

  // With bricks still standing, beating the boss does not end the round.
  const wall = quiet();
  wall.bossSpawned = true;
  wall.boss = { x: 220, hp: 1, dir: 1, fire: 9 };
  wall.ball = { x: 220, y: 256, vx: 0, vy: -230 };
  wall.advance(still);
  assert.equal(wall.bossDefeated, true);
  assert.equal(wall.ended, false);
});

test("capsules widen the paddle and add balls; only the last ball costs a life", () => {
  const sim = quiet();
  assert.equal(sim.paddleHalf, 46);
  sim.drops.push({ x: sim.paddle, y: 406, kind: "wide" });
  sim.advance(still);
  assert.equal(sim.paddleHalf, 66);
  for (let i = 0; i < 8 * 60 + 2; i++) sim.advance(still);
  assert.equal(sim.paddleHalf, 46);

  sim.ball = { x: 220, y: 300, vx: 100, vy: -272 };
  sim.drops.push({ x: sim.paddle, y: 406, kind: "multi" });
  sim.advance(still);
  assert.equal(sim.extra.length, 2);
  for (const b of sim.extra)
    assert.ok(Math.abs(Math.hypot(b.vx, b.vy) - 290) < 1e-6);
  // A third capsule with three balls in play pays points instead.
  const score = sim.score;
  sim.drops.push({ x: sim.paddle, y: 406, kind: "multi" });
  sim.advance(still);
  assert.equal(sim.extra.length, 2);
  assert.equal(sim.score, score + 30);
  // Losing balls: the first two are free, the last costs a life.
  sim.bricks.forEach((r) => (r.alive = false));
  sim.bossSpawned = true;
  for (const b of [sim.ball, ...sim.extra])
    Object.assign(b, { x: 20, y: 440, vx: 0, vy: 200 });
  sim.paddle = 300;
  for (let i = 0; i < 10; i++) sim.advance(still);
  assert.equal(sim.extra.length, 0);
  assert.equal(sim.lives, 2);
});

test("a full Brick Bash round drops capsules, meets the boss, and replays to the same score", () => {
  let capsules = 0,
    bosses = 0;
  for (const seed of [1, 2, 3, 4]) {
    const sim = new Simulation("brick", seed),
      events: Replay["events"] = [];
    let previous = "",
      seen = 0;
    while (!sim.ended) {
      // Follow the lowest ball, as a player dragging the paddle would.
      const ball = [sim.ball, ...sim.extra].reduce((a, b) =>
        b.y > a.y ? b : a,
      );
      const input: Input = [0, 0, -1, 0, Math.round(ball.x), -1];
      const stamp = JSON.stringify(input);
      if (stamp !== previous) {
        events.push([sim.ticks, ...input]);
        previous = stamp;
      }
      seen = Math.max(seen, sim.drops.length);
      sim.advance(input);
    }
    capsules += seen;
    bosses += Number(sim.bossSpawned);
    assert.ok(sim.score > 0);
    assert.deepEqual(
      replayRun("brick", seed, {
        version: RULES_VERSION,
        ticks: sim.ticks,
        events,
      }),
      { score: sim.score, ticks: sim.ticks },
    );
  }
  assert.ok(capsules > 0, "capsules fell");
  assert.ok(bosses > 0, "the boss arrived");
});
