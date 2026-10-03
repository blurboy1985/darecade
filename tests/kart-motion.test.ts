import test from "node:test";
import assert from "node:assert/strict";
import { Object3D, PerspectiveCamera, Quaternion, Vector3 } from "three";
import {
  kartSteeringInput,
  KartWheel,
  KART_WHEEL_RADIUS,
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

test("kart tyres roll about stable axles, only the front wheels steer, and stopped wheels stay still", () => {
  for (const x of [-0.79, 0.79])
    for (const z of [-0.64, 0.73]) {
      const wheel = new KartWheel(x, z);
      const tyre = new Object3D();
      tyre.rotation.z = Math.PI / 2; // Cylinder geometry's Y axle is mounted along X.
      wheel.rolling.add(tyre);
      for (const steer of [-1, 0, 1]) {
        const yaw = z > 0 ? steer * 0.24 : 0;
        const expectedAxle = new Vector3(-1, 0, 0).applyAxisAngle(
          new Vector3(0, 1, 0),
          yaw,
        );
        for (const distance of [0, 0.2, 1, 3.7, 22, 90]) {
          wheel.pose(distance, steer);
          wheel.steering.updateMatrixWorld(true);
          const axle = new Vector3(0, 1, 0).applyQuaternion(
            tyre.getWorldQuaternion(new Quaternion()),
          );
          assert.ok(
            axle.distanceTo(expectedAxle) < 1e-10,
            "rolling must not swivel the axle",
          );
          assert.deepEqual(wheel.steering.position.toArray(), [x, 0.29, z]);
          const before = tyre.getWorldQuaternion(new Quaternion());
          wheel.pose(distance, steer);
          assert.ok(
            before.angleTo(tyre.getWorldQuaternion(new Quaternion())) < 1e-7,
          );
        }
      }
      wheel.pose((Math.PI * KART_WHEEL_RADIUS) / 2, 0);
      const bottom = new Vector3(0, -1, 0).applyQuaternion(
        wheel.rolling.quaternion,
      );
      assert.ok(
        bottom.distanceTo(new Vector3(0, 0, -1)) < 1e-10,
        "the bottom rolls backward as the kart moves forward",
      );
    }
});
