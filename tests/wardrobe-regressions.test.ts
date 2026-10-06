import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { fresh } from "../src/state.ts";
import { clothingNames, hairNames } from "../src/appearance.ts";
import { itemLook, wardrobeBrowser } from "../src/wardrobe.ts";

test("outfit and head previews use distinct current renders", () => {
  for (const [slot, names] of [
    ["clothing", clothingNames],
    ["hair", hairNames],
  ] as const) {
    const seen = new Map<string, string>();
    for (const [index, name] of names.entries()) {
      const image = readFileSync(
        new URL(`../public/wardrobe/${slot}-${index}.png`, import.meta.url),
      );
      const hash = createHash("sha256").update(image).digest("hex");
      assert.equal(seen.has(hash), false, `${name} repeats ${seen.get(hash)}`);
      seen.set(hash, name);
    }
  }
});

test("Mint twin tails is hair and replaces the saved base hairstyle", () => {
  const save = fresh();
  const index = hairNames.indexOf("Mint twin tails");
  assert.equal(
    itemLook("hair", index, { ...save, baseHair: 53 }).baseHair,
    index,
  );
  assert.match(
    wardrobeBrowser("Hair", "All", save, 0, null),
    /Mint twin tails/,
  );
  assert.doesNotMatch(
    wardrobeBrowser("Hats", "All", save, 0, null),
    /Mint twin tails/,
  );
});

test("Full sets lists each item once", () => {
  const html = wardrobeBrowser("Full sets", "All", fresh(), 0, null);
  const indices = [...html.matchAll(/data-try-index="(-?\d+)"/g)].map(
    (m) => m[1],
  );
  assert.equal(indices.length, new Set(indices).size);
});
