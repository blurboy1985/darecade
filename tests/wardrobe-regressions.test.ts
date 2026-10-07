import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import {
  legendarySets,
  setItemIndex,
  canWear,
  canRedeem,
  outfitLook,
} from "../src/collections.ts";
import { fresh } from "../src/state.ts";
import { hairNames } from "../src/appearance.ts";
import {
  itemLook,
  wardrobeBrowser,
  wardrobeSections,
  wardrobeFilters,
  wardrobeItemState,
} from "../src/wardrobe.ts";

test("all catalog previews are present and distinct within each category", () => {
  for (const slot of ["outfits", "pet", "accessory"] as const) {
    const seen = new Set<string>();
    const indices = legendarySets.flatMap((_, i) =>
      slot === "outfits" ? [i * 2, i * 2 + 1] : [setItemIndex(slot, i)],
    );
    for (const index of indices) {
      const image = readFileSync(
        new URL(`../public/wardrobe/${slot}-${index}.png`, import.meta.url),
      );
      const hash = createHash("sha256").update(image).digest("hex");
      assert.equal(
        seen.has(hash),
        false,
        `${slot}-${index} repeats another image`,
      );
      seen.add(hash);
    }
  }
});

test("saved hairstyles keep their indices but are not sold as outfits", () => {
  const save = fresh();
  const index = hairNames.indexOf("Mint twin tails");
  assert.equal(
    itemLook("hair", index, { ...save, baseHair: 53 }).baseHair,
    index,
  );
  assert.doesNotMatch(
    wardrobeBrowser("Outfits", "Free", save, 0, null),
    /Mint twin tails|data-try-slot="hair"|data-try-slot="clothing"/,
  );
});

test("each character sees 22 complete outfits, pets and spells in each tier", () => {
  assert.deepEqual(wardrobeSections, [
    "Outfits",
    "Clothes",
    "Hair",
    "Headwear",
    "Pets",
    "Magic",
  ]);
  assert.deepEqual(wardrobeFilters, ["Free", "Legendary", "Premium"]);
  for (const body of [0, 1]) {
    const seen = new Set<string>();
    const p = { ...fresh(), body };
    for (const section of ["Outfits", "Pets", "Magic"] as const)
      for (const tier of wardrobeFilters) {
        const html = wardrobeBrowser(section, tier, p, 0, null);
        const cards = [
          ...html.matchAll(/data-try-slot="([^"]+)" data-try-index="(\d+)"/g),
        ];
        assert.equal(cards.length, 22, `${section} ${tier} body ${body}`);
        for (const match of cards) {
          const key = `${match[1]}:${match[2]}`;
          assert.equal(seen.has(key), false, key);
          seen.add(key);
          if (section === "Outfits") assert.equal(Number(match[2]) % 2, body);
        }
        if (tier === "Free")
          assert.doesNotMatch(html, /data-redeem-set|data-buy-set/);
        if (tier === "Premium") assert.doesNotMatch(html, /data-redeem-set/);
      }
    assert.equal(seen.size, 198);
  }
});

test("complete outfits preserve identity and companions and reject the other body", () => {
  for (const body of [0, 1]) {
    const p = {
      ...fresh(),
      body,
      skin: 2,
      eye: 3,
      pet: 5,
      accessory: 6,
      hat: 1,
    };
    for (const [index, set] of legendarySets.entries()) {
      const look = itemLook("outfits", index * 2 + body, p);
      assert.deepEqual(look, { ...p, ...outfitLook(index, body) });
      assert.equal(look.hat, 0);
      assert.throws(
        () => itemLook("outfits", index * 2 + 1 - body, p),
        /your character/,
      );
      assert.equal(
        wardrobeItemState("outfits", index * 2 + body, p, 0, null).owned,
        set.tier === "Free",
      );
      for (const slot of ["clothing", "hair", "pet", "accessory"] as const)
        assert.equal(
          canWear(slot, setItemIndex(slot, index), p, 0),
          set.tier === "Free",
        );
    }
  }
});

test("Legendary offers tokens, with a cash fallback when tokens are short", () => {
  const poor = wardrobeBrowser("Pets", "Legendary", fresh(), 0, null);
  assert.match(poor, /data-redeem-set="piece:solar:pet" disabled/);
  assert.match(poor, /data-buy-set="solar"/);
  const rich = wardrobeBrowser(
    "Pets",
    "Legendary",
    { ...fresh(), xp: 10000 },
    0,
    null,
  );
  assert.match(rich, /data-redeem-set="piece:solar:pet" >/);
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

test("Premium is money-only at S$1.99 even with enough Style tokens", () => {
  const p = { ...fresh(), xp: 10000 };
  const html = wardrobeBrowser("Pets", "Premium", p, 0, null);
  assert.match(html, /data-buy-set="aegis-prime"/);
  assert.match(html, /S\$1\.99/);
  assert.doesNotMatch(html, /data-redeem-set/);
  for (const set of legendarySets.filter((s) => s.tier === "Premium"))
    assert.equal(canRedeem(set, p, 0), false);
});
