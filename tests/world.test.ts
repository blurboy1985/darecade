import test from "node:test";
import assert from "node:assert/strict";
import { WorldState, clampMovement } from "../server/world-core.mjs";
import { MovementBuffer } from "../src/movement-buffer.ts";
const identity = (id: string) => ({
  id,
  name: id,
  look: { outfit: 0, skin: 0, hat: 0 },
  blockedIds: [],
});
test("world clamps untrusted movement, caps membership, and rate limits at five updates per second", () => {
  let now = 1000;
  const world = new WorldState(() => now);
  assert.deepEqual(
    clampMovement({
      x: Infinity,
      z: -100,
      yaw: 100,
      activity: "email",
      away: "false",
      emote: "token",
    }),
    { x: 0, z: -25, yaw: 25, activity: "rest", away: false, emote: "" },
  );
  for (let n = 0; n < 30; n++) assert.ok(world.join(identity(`p${n}`)));
  assert.equal(world.join(identity("extra")), null);
  for (let n = 1; n <= 5; n++) assert.equal(world.move("p0", { x: n }), true);
  assert.equal(world.move("p0", { x: 20 }), false);
  now += 1000;
  assert.equal(world.move("p0", { x: 20 }), true);
});
test("25 moving players fit a sub-1KB delta, with bilateral privacy and leave events", () => {
  let now = Date.now();
  const world = new WorldState(() => now),
    known = new Map();
  for (let n = 0; n < 25; n++) world.join(identity(`p${n}`));
  const first = world.snapshot("p0", known, true);
  assert.equal(first.p.length, 25);
  assert.equal(world.snapshot("p0", known), null);
  now += 200;
  for (let n = 0; n < 25; n++)
    world.move(`p${n}`, {
      x: 25,
      z: -25,
      yaw: 25,
      activity: "dance",
      emote: "wave",
    });
  const delta = world.snapshot("p0", known);
  const bytes = Buffer.byteLength(JSON.stringify(delta));
  assert.ok(bytes < 1024, `${bytes} bytes`);
  console.log(`25-player movement delta: ${bytes} bytes`);
  world.players.get("p1").blockedIds = ["p0"];
  const hidden = world.snapshot("p0", known);
  assert.deepEqual(hidden.gone, [1]);
  assert.ok(
    !world.snapshot("p1", new Map(), true).p.some((p) => p[1] === "p0"),
  );
  world.players.delete("p2");
  assert.deepEqual(world.snapshot("p0", known).gone, [2]);
  assert.doesNotMatch(JSON.stringify(first), /blockedIds|session|email|age/);
});
test("remote interpolation uses a 150ms buffer and shortest rotation", () => {
  const buffer = new MovementBuffer();
  buffer.push({ x: 0, z: 0, yaw: 3.1 }, 1000);
  buffer.push({ x: 2, z: 4, yaw: -3.1 }, 1200);
  const mid = buffer.sample(1250)!;
  assert.equal(mid.x, 1);
  assert.equal(mid.z, 2);
  assert.ok(Math.abs(mid.yaw - Math.PI) < 0.01);
  assert.ok(buffer.sample(10000)!.x <= 2.5);
});
