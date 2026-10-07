import test from "node:test";
import assert from "node:assert/strict";
import { fresh, normalise } from "../src/state.ts";
import { outfitLook, setItemIndex } from "../src/collections.ts";
import {
  itemLook,
  wearable,
  captureLook,
  withoutHeadwear,
  wardrobeBrowser,
} from "../src/wardrobe.ts";

test("mixing hair, headwear and clothes preserves the other components and identity", () => {
  const saved = {
    ...fresh(),
    ...outfitLook(20, 1),
    body: 1,
    skin: 5,
    eye: 2,
    pet: 4,
    accessory: 3,
    wardrobePurchased: ["aegis-prime"],
  };
  const hair = itemLook("hairstyle", 112, saved);
  assert.deepEqual(hair, { ...saved, baseHair: 112 });
  const head = itemLook("hair", setItemIndex("hair", 40), hair);
  assert.equal(head.baseHair, 112);
  assert.equal(head.clothing, saved.clothing);
  const clothes = itemLook("clothing", setItemIndex("clothing", 42), head);
  assert.deepEqual(clothes, {
    ...head,
    clothing: setItemIndex("clothing", 42),
  });
  assert.equal(wearable(clothes, saved, 0), true);
  const roundtrip = normalise(
    JSON.parse(JSON.stringify({ ...saved, ...clothes })),
    fresh(),
  );
  for (const key of [
    "clothing",
    "hair",
    "baseHair",
    "body",
    "skin",
    "eye",
    "pet",
    "accessory",
    "wardrobePurchased",
  ] as const)
    assert.deepEqual(roundtrip[key], (clothes as typeof saved)[key]);
});

test("component previews cannot bypass ownership and Undo contains no progress", () => {
  const saved = fresh();
  for (const slot of ["clothing", "hair"] as const)
    assert.equal(
      wearable(itemLook(slot, setItemIndex(slot, 20), saved), saved, 0),
      false,
    );
  assert.equal(
    wearable({ ...saved, baseHair: setItemIndex("hair", 20) }, saved, 0),
    false,
  );
  assert.equal("xp" in captureLook(saved), false);
  assert.equal("wardrobePurchased" in captureLook(saved), false);
  const bare = withoutHeadwear({ ...saved, hair: 133, baseHair: 38, hat: 2 });
  assert.equal(bare.hat, 0);
  assert.equal(bare.hair, bare.baseHair);
  assert.ok(bare.hair! >= 53 && bare.hair! < 133);
  assert.match(
    wardrobeBrowser("Hair", "Premium", saved, 0, null),
    /All hairstyles are free/,
  );
  assert.doesNotMatch(
    wardrobeBrowser("Hair", "Premium", saved, 0, null),
    /data-buy-set/,
  );
});
