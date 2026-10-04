import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { createPlotPipeCurve, createPlotView } from "../src/plot-view.ts";

const endpoints = new Map([
  [1, [0, 0.5, 0]],
  [2, [0.5, 0, 0]],
  [4, [0, -0.5, 0]],
  [8, [-0.5, 0, 0]],
]);

test("every pipe joins the correct cell edges without shifting the 3×3 grid", () => {
  for (const mask of [3, 5, 6, 9, 10, 12]) {
    const shape = createPlotPipeCurve(mask);
    assert.ok(shape);
    const bits = [...endpoints.keys()].filter((bit) => mask & bit);
    assert.equal(shape.first, bits[0]);
    assert.deepEqual(shape.curve.getPoint(0).toArray(), endpoints.get(bits[0]));
    assert.deepEqual(shape.curve.getPoint(1).toArray(), endpoints.get(bits[1]));
    for (let sample = 0; sample <= 40; sample++) {
      const point = shape.curve.getPoint(sample / 40);
      assert.ok(Math.abs(point.x) <= 0.5 && Math.abs(point.y) <= 0.5);
      assert.equal(point.z, 0);
    }
    const tube = new T.TubeGeometry(shape.curve, 24, 0.08, 8, false);
    const positions = tube.getAttribute("position");
    assert.ok(positions.count > 100);
    assert.ok([...positions.array].every(Number.isFinite));
    tube.dispose();
  }
});

test("straight pipes cross the centre and elbows are genuinely curved", () => {
  for (const mask of [5, 10]) {
    const shape = createPlotPipeCurve(mask);
    assert.ok(shape);
    assert.equal(shape.curve.curves.length, 1);
    assert.equal(shape.curve.getPoint(0.5).length(), 0);
  }
  for (const mask of [3, 6, 9, 12]) {
    const shape = createPlotPipeCurve(mask);
    assert.ok(shape);
    assert.equal(shape.curve.curves.length, 3);
    const bend = shape.curve.curves[1];
    assert.ok(bend instanceof T.QuadraticBezierCurve3);
    assert.ok(shape.curve.getPoint(0.5).length() > 0);
    assert.ok(shape.curve.getLength() < 1);
  }
});

test("pipe geometry rejects masks outside the supported two-connector domain", () => {
  for (const mask of [0, 1, 2, 4, 7, 8, 11, 13, 14, 15, 16, -1, 3.5, NaN]) {
    assert.equal(createPlotPipeCurve(mask), null);
  }
});

test("simple mode exits before touching DOM or WebGL", () => {
  // A DOM host is deliberately absent, proving simple mode is a zero-work path.
  // @ts-expect-error The deliberately invalid host must never be accessed.
  assert.equal(createPlotView(null, { reduced: false, simple: true }), null);
});
