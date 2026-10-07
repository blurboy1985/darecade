import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  legendarySets,
  setItemIndex,
  canWear,
  canRedeem,
  slotSize,
} from "../src/collections.ts";
import { fresh } from "../src/state.ts";
import { clothingNames, hairNames } from "../src/appearance.ts";
import {
  itemLook,
  wardrobeBrowser,
  wardrobeSections,
  wardrobeFilters,
  wardrobeItemState,
} from "../src/wardrobe.ts";

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
    wardrobeBrowser("Outfits", "Free", save, 0, null),
    /Mint twin tails/,
  );
});

test("three sections and three exclusive tiers cover every item once", () => {
  assert.deepEqual(wardrobeSections, ["Outfits", "Pets", "Magic"]);
  assert.deepEqual(wardrobeFilters, ["Free", "Legendary", "Premium"]);
  const seen = new Set<string>();
  for (const section of wardrobeSections)
    for (const tier of wardrobeFilters) {
      const html = wardrobeBrowser(section, tier, fresh(), 0, null);
      for (const match of html.matchAll(
        /data-try-slot="([^"]+)" data-try-index="(\d+)"/g,
      )) {
        const key = `${match[1]}:${match[2]}`;
        assert.equal(seen.has(key), false, key);
        seen.add(key);
      }
      if (tier === "Free")
        assert.doesNotMatch(html, /data-redeem-set|data-buy-set/);
      if (tier === "Premium") assert.match(html, /No premium/);
    }
  assert.equal(
    seen.size,
    ["clothing", "hair", "pet", "accessory"].reduce(
      (sum, slot) => sum + slotSize(slot),
      0,
    ),
  );
});

test("every basic item is wearable without tokens or purchases", () => {
  const p = fresh();
  for (const section of wardrobeSections) {
    const html = wardrobeBrowser(section, "Free", p, 0, null);
    for (const match of html.matchAll(
      /data-try-slot="([^"]+)" data-try-index="(\d+)"/g,
    )) {
      assert.ok(canWear(match[1], Number(match[2]), p, 0));
    }
  }
});

test("Legendary offers tokens, with a cash fallback when tokens are short", () => {
  const poor = wardrobeBrowser("Pets", "Legendary", fresh(), 0, null);
  assert.match(poor, /data-redeem-set="solar" disabled/);
  assert.match(poor, /data-buy-set="solar"/);
  const rich = wardrobeBrowser(
    "Pets",
    "Legendary",
    { ...fresh(), xp: 10000 },
    0,
    null,
  );
  assert.match(rich, /data-redeem-set="solar" >/);
  assert.doesNotMatch(rich, /data-buy-set/);
});

test("owned and purchased sets keep an indicator even while equipped and have no purchase actions", () => {
  for (const ownership of ["wardrobeUnlocked", "wardrobePurchased"] as const) {
    const p = {
      ...fresh(),
      [ownership]: ["solar"],
      pet: setItemIndex("pet", 0),
    };
    const html = wardrobeBrowser("Pets", "Legendary", p, 0, null);
    assert.doesNotMatch(html, /data-(?:buy|redeem)-set="solar"/);
    assert.equal(
      wardrobeItemState("pet", p.pet, p, 0, null).state,
      `${ownership === "wardrobePurchased" ? "Purchased" : "Owned"} · Equipped`,
    );
  }
});

test("Premium is separate and money-only", () => {
  const set = legendarySets[0];
  const original = set.tier;
  try {
    set.tier = "Premium";
    const p = { ...fresh(), xp: 10000 };
    const html = wardrobeBrowser("Pets", "Premium", p, 0, null);
    assert.match(html, /data-buy-set="solar"/);
    assert.doesNotMatch(html, /data-redeem-set/);
    assert.doesNotMatch(
      wardrobeBrowser("Pets", "Legendary", p, 0, null),
      /data-buy-set="solar"/,
    );
    assert.equal(canRedeem(set, p, 0), false);
  } finally {
    set.tier = original;
  }
});
