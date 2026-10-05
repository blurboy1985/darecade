import test from "node:test";
import assert from "node:assert/strict";
import { HopRun, HOP_POWER_SECONDS } from "../src/action-games.ts";
import {
  Simulation,
  replayRun,
  RULES_VERSION,
  type Input,
  type Replay,
} from "../shared/simulation.ts";

const dt = 1 / 240;
/** A run with one hazard placed by hand and no others on the way. */
function scene(
  kind: "gap" | "crate",
  x: number,
  width = kind === "gap" ? 65 : 28,
) {
  const run = new HopRun();
  run.spawn = 99;
  run.hazards.push({ x, width, kind, passed: false });
  return run;
}

test("Hop Hop adds bonuses to steady time points instead of replacing them", () => {
  const run = scene("crate", 125);
  run.jump();
  while (!run.hazards[0]?.passed && !run.ended) run.tick(dt);
  assert.equal(run.ended, false);
  assert.equal(run.bonus, 25);
  assert.equal(run.score, Math.floor(run.elapsed * 12) + 25);
  const before = run.score;
  for (let i = 0; i < 240; i++) run.tick(dt);
  assert.equal(run.score, before + 12, "a second of running is twelve points");
});

test("a toe over the edge or a landing just short of it does not end the round", () => {
  // The gap has reached the runner's toe but not the middle of its feet.
  const toe = scene("gap", 95);
  toe.tick(dt);
  assert.equal(toe.falling, false);
  assert.equal(toe.ended, false);
  // Landing with the gap's far edge still under the runner's heel.
  const heel = scene("gap", 22);
  heel.height = 3;
  heel.velocity = -200;
  for (let i = 0; i < 12; i++) heel.tick(dt);
  assert.equal(heel.height, 0);
  assert.equal(heel.falling, false);
  assert.equal(heel.ended, false);
  // A crate clipped by a corner is forgiven too.
  const corner = scene("crate", 98.5);
  corner.tick(dt);
  assert.equal(corner.ended, false);
});

test("walking into a gap is a visible fall, and a quick jump still saves it", () => {
  const fall = scene("gap", 60);
  fall.tick(dt);
  assert.equal(fall.falling, true);
  assert.equal(fall.ended, false, "the round does not stop on the spot");
  let ticks = 1;
  while (!fall.ended) {
    fall.tick(dt);
    ticks++;
  }
  assert.ok(ticks * dt > 0.3 && ticks * dt < 0.5, `fell for ${ticks * dt}s`);
  assert.ok(fall.height < -90);
  assert.equal(fall.jump(), false);

  const saved = scene("gap", 60);
  for (let i = 0; i < 12; i++) saved.tick(dt);
  assert.equal(saved.falling, true);
  assert.equal(saved.jump(), true);
  assert.equal(saved.falling, false);
  while (saved.height !== 0 && !saved.ended) saved.tick(dt);
  assert.equal(saved.ended, false);

  const late = scene("gap", 60);
  for (let i = 0; i < 40; i++) late.tick(dt);
  assert.equal(late.jump(), false, "too deep to jump out");
});

test("a star gives five seconds of power: crates smash and gaps are bridged", () => {
  const run = new HopRun();
  run.spawn = 99;
  run.stars.push({ x: 90 });
  run.tick(dt);
  assert.equal(run.power, 0, "a star is out of reach from the ground");
  run.jump();
  while (!run.power && run.height >= 0 && !run.ended) run.tick(dt);
  assert.ok(run.power > HOP_POWER_SECONDS - 1);
  assert.equal(run.bonus, 25);
  assert.equal(run.stars.length, 0);
  while (run.height !== 0) run.tick(dt);

  run.hazards.push({ x: 90, width: 28, kind: "crate", passed: false });
  run.tick(dt);
  assert.equal(run.ended, false);
  assert.equal(run.smashed, 1);
  assert.equal(run.bonus, 75);

  run.hazards.push({ x: 60, width: 65, kind: "gap", passed: false });
  run.tick(dt);
  assert.equal(run.falling, false);
  // The bridge under the runner holds even if the power runs out over the gap.
  run.power = 0;
  for (let i = 0; i < 30; i++) run.tick(dt);
  assert.equal(run.falling, false);
  assert.equal(run.ended, false);
  // Without power the next crate ends the round again.
  run.hazards.push({ x: 90, width: 28, kind: "crate", passed: false });
  run.tick(dt);
  assert.equal(run.ended, true);
});

test("a full Hop Hop round is beatable, meets stars, and replays to the same score", () => {
  for (const seed of [1, 2, 3]) {
    const sim = new Simulation("hop", seed),
      events: Replay["events"] = [];
    let previous = "",
      powered = 0;
    while (!sim.ended) {
      const run = sim.action as HopRun;
      const next = run.hazards.find((h) => h.x + h.width > 80);
      const star = run.stars.find((s) => s.x > 96 && s.x < 150);
      const jump =
        run.height === 0 &&
        ((next && next.x < 128 && next.x > 96 && !run.power) || !!star);
      if (run.power) powered++;
      const input: Input = [0, 0, -1, Number(jump), -1, -1];
      const stamp = JSON.stringify(input);
      if (stamp !== previous) {
        events.push([sim.ticks, ...input]);
        previous = stamp;
      }
      sim.advance(input);
    }
    const run = sim.action as HopRun;
    assert.equal(sim.ticks, 3600, `seed ${seed} survives the minute`);
    assert.ok(powered > 300, "star power was used");
    assert.ok(run.smashed > 0);
    assert.equal(sim.score, 720 + run.bonus);
    assert.deepEqual(
      replayRun("hop", seed, {
        version: RULES_VERSION,
        ticks: sim.ticks,
        events,
      }),
      { score: sim.score, ticks: sim.ticks, playMedalEligible: true },
    );
  }
});
