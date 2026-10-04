import test from "node:test";
import assert from "node:assert/strict";
import { Vector3 } from "three";
import { RaceCameraFollow } from "../src/race-camera.ts";

test("acceleration and turbo never increase chase distance or shrink the driver", () => {
  for (const reduced of [false, true]) {
    const follow = new RaceCameraFollow();
    const camera = new Vector3();
    const kart = new Vector3();
    const offset = new Vector3(0, 3.25, -6.6);
    for (let frame = 0; frame < 360; frame++) {
      const dt = frame % 3 === 0 ? 1 / 30 : 1 / 120;
      kart.z += Math.min(frame / 5, 40) * dt;
      follow.update(camera, kart, kart.clone().add(offset), dt, reduced);
      assert.ok(camera.clone().sub(kart).distanceTo(offset) < 1e-10);
    }
  }
});

test("camera orbit still eases through turns and snaps for reduced motion", () => {
  const follow = new RaceCameraFollow();
  const position = new Vector3();
  const kart = new Vector3();
  follow.update(position, kart, new Vector3(0, 3, -6), 0, false);
  const target = new Vector3(6, 3, 0);
  follow.update(position, kart, target, 1 / 60, false);
  assert.ok(position.x > 0 && position.x < 6);
  assert.ok(position.z > -6 && position.z < 0);
  follow.update(position, kart, target, 1 / 60, true);
  assert.deepEqual(position, target);
});
