import test from "node:test";
import assert from "node:assert/strict";
import { Object3D, PerspectiveCamera, Quaternion, Vector3 } from "three";
import {
  kartSteeringInput,
  KartSteering,
  KartWheel,
} from "../src/kart-motion.ts";
import { TRACK_LENGTH, trackPoint } from "../shared/racing.ts";

test("kart left and right inputs move to the matching side of the chase camera around the track", () => {
  for (let distance = 0; distance < TRACK_LENGTH; distance += 13) {
    const centre = trackPoint(distance);
    const forward = new Vector3(Math.sin(centre.yaw), 0, Math.cos(centre.yaw));
    const camera = new PerspectiveCamera(57, 1, 0.1, 600);
    camera.position.set(centre.x, 3.4, centre.z).addScaledVector(forward, -6.6);
    camera.lookAt(
      new Vector3(centre.x, 0.95, centre.z).addScaledVector(forward, 7.5),
    );
    camera.updateMatrixWorld(true);
    const screenX = (left: boolean, right: boolean) => {
      const p = trackPoint(distance, kartSteeringInput(left, right));
      return new Vector3(p.x, 0.15, p.z).project(camera).x;
    };
    const neutral = screenX(false, false);
    assert.ok(screenX(true, false) < neutral, `left at ${distance}`);
    assert.ok(screenX(false, true) > neutral, `right at ${distance}`);
    assert.equal(screenX(true, true), neutral);
  }
});

test("wheel surfaces have fixed centres and axles, and only the front wheels steer", () => {
  for (const x of [-0.79, 0.79])
    for (const z of [-0.64, 0.73]) {
      const wheel = new KartWheel(x, z);
      const tyre = new Object3D();
      tyre.rotation.z = Math.PI / 2;
      wheel.steering.add(tyre);
      for (const steer of [-1, 0, 1]) {
        wheel.pose(steer);
        const expectedAxle = new Vector3(-1, 0, 0).applyAxisAngle(
          new Vector3(0, 1, 0),
          z > 0 ? steer * 0.24 : 0,
        );
        const axle = new Vector3(0, 1, 0).applyQuaternion(
          tyre.getWorldQuaternion(new Quaternion()),
        );
        assert.ok(axle.distanceTo(expectedAxle) < 1e-10);
        assert.deepEqual(wheel.steering.position.toArray(), [x, 0.29, z]);
        assert.deepEqual(tyre.rotation.toArray(), [0, 0, Math.PI / 2, "XYZ"]);
      }
    }
});

test("visual steering eases reversals, filters rapid key alternation and returns to centre", () => {
  const steering = new KartSteering();
  let previous = steering.update(1, 1);
  for (let frame = 0; frame < 120; frame++) {
    const value = steering.update(frame % 2 ? 1 : -1, 1 / 60);
    assert.ok(Math.abs(value - previous) * 0.24 < 0.075, "no full-lock snap");
    if (frame > 60) assert.ok(Math.abs(value) < 0.09, "filter flutter");
    previous = value;
  }
  assert.ok(Math.abs(steering.update(0, 1)) < 0.00001);
});

test("visual steering has the same response at 30, 60 and 120 Hz", () => {
  const outcomes = [30, 60, 120].map((fps) => {
    const steering = new KartSteering();
    let result = 0;
    for (let frame = 0; frame < fps / 2; frame++)
      result = steering.update(1, 1 / fps);
    return result;
  });
  assert.ok(outcomes[0] > 0.99);
  assert.ok(Math.max(...outcomes) - Math.min(...outcomes) < 1e-12);
});
