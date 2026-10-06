import test from "node:test";
import assert from "node:assert/strict";
import { Simulation, replayRun, type Replay } from "../shared/simulation.ts";
import { HopRun } from "../src/action-games.ts";
test("new Star Swarm runs give no score without input and end early; replay agrees", () => {
  const sim = new Simulation("swarm", -43);
  while (!sim.ended) sim.advance([0, 0, -1, 0, -1, -1]);
  assert.equal(sim.score, 0);
  assert.ok(sim.elapsed <= 12.1);
  const replay: Replay = {
    version: 2,
    ticks: sim.ticks,
    events: [[0, 0, 0, -1, 0, -1, -1]],
  };
  assert.equal(replayRun("swarm", -43, replay).score, 0);
});
test("legacy Star Swarm positive seeds keep original rules", () => {
  const sim = new Simulation("swarm", 42, 1);
  for (let i = 0; i < 540 && !sim.ended; i++)
    sim.advance([0, 0, -1, 0, -1, -1]);
  assert.ok(sim.elapsed > 8);
});
test("first Hop crate is avoidable with one timely jump", () => {
  const hop = new HopRun();
  let jumped = false;
  for (let i = 0; i < 240 && !hop.ended; i++) {
    if (!jumped && hop.hazards[0]?.x < 150) {
      assert.equal(hop.jump(), true);
      jumped = true;
    }
    hop.tick(1 / 60);
  }
  assert.ok(jumped);
  assert.equal(hop.ended, false);
  assert.ok(hop.bonus >= 25);
});
