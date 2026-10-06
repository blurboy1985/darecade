import test from "node:test";
import assert from "node:assert/strict";
import { WorldMotion } from "../src/world-motion.ts";
import { clearSegment, route } from "../src/navigation.ts";

test("displayed motion stays continuous at 30, 60, 90 and 144 Hz", () => {
  for (const fps of [30, 60, 90, 144]) {
    const motion = new WorldMotion(),
      point = { x: 0, z: 0 };
    let previous = 0;
    for (let i = 0; i < fps * 2; i++) {
      motion.sample(point, 1 / fps, (dt) => {
        point.x += dt * 4.8;
      });
      if (i > 2) assert.ok(Math.abs(point.x - previous - 4.8 / fps) < 1e-8);
      previous = point.x;
    }
    assert.ok(Math.abs(point.x - 9.52) < 1e-8);
  }
});

test("paths cannot cross narrow props between otherwise free cells", () => {
  const props = [{ x: 0.5, z: 0, w: 0.1, d: 0.1 }];
  assert.equal(clearSegment({ x: 0, z: 0 }, { x: 1, z: 0 }, props), false);
  const path = route({ x: 0, z: 0 }, { x: 2, z: 0 }, props);
  assert.ok(path.length > 2);
  let previous = { x: 0, z: 0 };
  for (const point of path) {
    assert.ok(clearSegment(previous, point, props));
    previous = point;
  }
});
