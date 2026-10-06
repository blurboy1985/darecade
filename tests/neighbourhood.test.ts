import { test } from "node:test";
import assert from "node:assert/strict";
import { HopRun, StarFlight } from "../src/action-games.ts";
import { normalise, fresh } from "../src/state.ts";
import { activityPose } from "../src/neighbourhood.ts";

test("old two-game saves migrate without losing personal bests or mutating defaults", () => {
  const fallback = fresh();
  const s = normalise(
    {
      best: { noodle: 120, brick: 200 },
      xp: 90,
      awayActivity: "unknown",
      cameraMode: "bad",
    },
    fallback,
  );
  assert.deepEqual(s.best, {
    noodle: 120,
    brick: 200,
    hop: 0,
    swarm: 0,
    coast: 0,
    hoops: 0,
    fishing: 0,
  });
  assert.equal(fallback.best.noodle, 0);
  assert.equal(s.awayActivity, "jog");
  assert.equal(s.cameraMode, "third");
  const resumed = normalise(
    {
      ...s,
      away: true,
      awayActivity: "dragon",
      awaySince: 1234,
      cameraMode: "third",
      best: { ...s.best, hop: 99, swarm: 400 },
    },
    fresh(),
  );
  assert.equal(resumed.away, true);
  assert.equal(resumed.awayActivity, "dragon");
  assert.equal(resumed.awaySince, 1234);
  assert.equal(resumed.best.swarm, 400);
});
test("Hop Hop ends on an obstacle, while timed jumps clear early obstacles", () => {
  const idle = new HopRun();
  for (let i = 0; i < 1200 && !idle.ended; i++) idle.tick(1 / 120);
  assert.equal(idle.ended, true);
  assert.ok(idle.elapsed < 6);
  const active = new HopRun();
  let jumps = 0;
  for (let i = 0; i < 1200 && !active.ended; i++) {
    const hazard = active.hazards.find((h) => h.x + h.width > 76);
    if (hazard && hazard.x < 130 && hazard.x > 100 && active.height === 0) {
      if (active.jump()) jumps++;
    }
    active.tick(1 / 120);
  }
  assert.ok(jumps >= 2);
  assert.ok(active.elapsed > idle.elapsed + 3);
  assert.ok(active.score > idle.score);
  const score = idle.score;
  idle.tick(1);
  assert.equal(idle.score, score);
});
test("Hop Hop cannot double-jump in the air", () => {
  const r = new HopRun();
  assert.equal(r.jump(), true);
  r.tick(0.05);
  const v = r.velocity;
  assert.equal(r.jump(), false);
  assert.equal(r.velocity, v);
});
test("Star Swarm auto-fires, limits damage during invulnerability, and ends at zero health", () => {
  const s = new StarFlight();
  for (let i = 0; i < 70; i++) s.tick(1 / 60, i < 35 ? 1 : -1);
  assert.ok(s.bullets.some((b) => !b.enemy));
  s.hit();
  s.hit();
  assert.equal(s.lives, 2);
  s.invulnerable = 0;
  s.hit();
  s.invulnerable = 0;
  s.hit();
  assert.equal(s.ended, true);
  const time = s.elapsed;
  s.tick(1);
  assert.equal(s.elapsed, time);
});
test("Star Swarm hits score points, powerups shield, and the boss arrives once", () => {
  const s = new StarFlight();
  s.activeSeconds = 2;
  s.enemies.push({ x: 220, origin: 220, y: 100, phase: 0, hp: 1, boss: false });
  s.bullets.push({ x: 220, y: 103, enemy: false });
  s.tick(1 / 120);
  assert.equal(s.score, 20);
  s.lives = 2;
  s.pickups.push({ x: s.x, y: s.y });
  s.tick(1 / 120);
  assert.equal(s.lives, 2);
  assert.equal(s.shieldHits, 2);
  assert.ok(s.shield > 0);
  s.invulnerable = 100;
  for (let i = 0; i < 91 * 120; i++)
    s.tick(1 / 120, Math.floor(i / 120) % 2 ? 1 : -1);
  assert.equal(s.bossSpawned, true);
  assert.ok(s.enemies.filter((e) => e.boss).length <= 1);
});
test("away activity poses are bounded and reconstruct consistently after re-entry", () => {
  for (const activity of ["jog", "dragon", "dance", "rest", "arcade"] as const)
    for (let t = 0; t < 100; t += 0.37) {
      const p = activityPose(activity, t);
      assert.ok(Number.isFinite(p.x + p.y + p.z + p.yaw));
      assert.ok(Math.abs(p.x) <= 19 && Math.abs(p.z) <= 14);
      assert.ok(p.y >= 0 && p.y <= 2);
      assert.deepEqual(activityPose(activity, t), p);
    }
  const a = activityPose("jog", 2),
    b = activityPose("jog", 18);
  assert.ok(Math.abs(a.x - b.x) < 1e-10 && Math.abs(a.z - b.z) < 1e-10);
  assert.equal(activityPose("rest", 10).sit, true);
  assert.equal(activityPose("dragon", 7).sit, true);
});
