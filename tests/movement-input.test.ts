import test from "node:test";
import assert from "node:assert/strict";
import { MovementInput } from "../src/movement-input.ts";
test("a W tap entirely between frames still moves, then stops", () => {
  const input = new MovementInput();
  input.press("w");
  let frames = 0;
  for (let i = 0; i < 30; i++)
    if (input.sample(new Set(), 1 / 60).has("w")) frames++;
  assert.ok(frames >= 4 && frames <= 6);
});
test("long press stays continuous and blur cancels pending taps", () => {
  const input = new MovementInput();
  input.press("w");
  for (let i = 0; i < 120; i++)
    assert.ok(input.sample(new Set(["w"]), 1 / 60).has("w"));
  assert.equal(input.sample(new Set(), 1 / 60).size, 0);
  input.press("w");
  input.clear();
  assert.equal(input.sample(new Set(), 1 / 60).size, 0);
});
