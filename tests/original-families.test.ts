import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import * as T from "three";
import {
  legendarySets,
  setItemIndex,
  canWear,
  canRedeem,
} from "../src/collections.ts";
import { fresh } from "../src/state.ts";
import { costumeBody, costumeHead } from "../src/costume-design.ts";

test("six original families have different geometry without relying on colour", () => {
  const seen = new Set<string>();
  const expected = [
    "after-school-circuit",
    "rainshield-guardian",
    "monsoon-wayfinder",
    "moonbell-society",
    "canal-otter-club",
    "void-deck-weekend",
  ];
  assert.deepEqual(
    legendarySets.slice(60).map((s) => s.id),
    expected,
  );
  for (const [i, set] of legendarySets.slice(60).entries()) {
    const root = new T.Group();
    costumeBody(root, set, 0);
    costumeHead(root, set);
    const hash = createHash("sha256");
    let triangles = 0,
      draws = 0;
    root.traverse((o) => {
      if (!(o instanceof T.Mesh)) return;
      draws++;
      hash.update(
        Buffer.from(o.geometry.getAttribute("position").array.buffer),
      );
      triangles +=
        (o.geometry.index?.count ?? o.geometry.getAttribute("position").count) /
        3;
    });
    const signature = hash.digest("hex");
    assert.ok(!seen.has(signature), set.name);
    seen.add(signature);
    assert.equal(draws, 2, "one cached body + one cached head draw");
    assert.ok(triangles < 4000, `${set.name}: ${triangles} overlay triangles`);
    assert.equal(
      canWear("clothing", setItemIndex("clothing", 60 + i), fresh(), 0),
      set.tier === "Free",
    );
    if (set.tier === "Premium")
      assert.equal(canRedeem(set, { ...fresh(), xp: 999999 }, 0), false);
  }
});
