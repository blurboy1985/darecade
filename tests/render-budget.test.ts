import test from "node:test";
import assert from "node:assert/strict";
import { renderPixelRatio } from "../src/render-budget.ts";

test("portrait and landscape phones share the same bounded rendering workload", () => {
  for (const density of [1, 2, 3]) {
    for (const [width, height] of [
      [390, 844],
      [430, 932],
      [768, 1024],
    ]) {
      const portrait = renderPixelRatio(width, height, density);
      assert.equal(portrait, renderPixelRatio(height, width, density));
      assert.ok(portrait <= density && portrait <= 1.25);
      assert.ok(width * height * portrait ** 2 <= 1_500_000 + 1e-6);
    }
  }
});

test("large displays stay within the pixel budget without increasing low-density resolution", () => {
  assert.equal(renderPixelRatio(390, 844, 1), 1);
  const ratio = renderPixelRatio(3840, 2160, 3);
  assert.ok(Math.abs(3840 * 2160 * ratio ** 2 - 1_500_000) < 1e-6);
});
