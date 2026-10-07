import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import { fresh, normalise } from "../src/state.ts";
import { captureLook, favouriteProgress } from "../src/wardrobe.ts";
import { readSavedLooks, savedLookAllowed } from "../src/saved-looks.ts";
import { outfitLook } from "../src/collections.ts";

test("old saves gain empty slots without losing earned or purchased items", () => {
  const { savedLooks, favouriteSet, ...old } = fresh();
  Object.assign(old, {
    xp: 2300,
    medalTokens: 3,
    wardrobeUnlocked: ["solar"],
    wardrobePurchased: ["aegis-prime"],
    unlockedHats: [0, 1],
  });
  const upgraded = normalise(old, fresh());
  assert.deepEqual(upgraded.savedLooks, [null, null, null, null]);
  assert.equal(upgraded.favouriteSet, "");
  for (const key of [
    "xp",
    "medalTokens",
    "wardrobeUnlocked",
    "wardrobePurchased",
    "unlockedHats",
  ] as const)
    assert.deepEqual(upgraded[key], old[key]);
  const look = captureLook(upgraded);
  const roundtrip = normalise(
    JSON.parse(
      JSON.stringify({
        ...upgraded,
        savedLooks: [look],
        favouriteSet: "monsoon-wayfinder",
      }),
    ),
    fresh(),
  );
  assert.deepEqual(roundtrip.savedLooks[0], look);
  assert.equal(roundtrip.favouriteSet, "monsoon-wayfinder");
  const crafted = readSavedLooks([
    { ...look, xp: 999999, wardrobePurchased: ["solar"] },
    { ...look, clothing: 99999 },
  ]);
  assert.equal("xp" in crafted[0]!, false);
  assert.equal(crafted[1], null);
});

test("server validates saved components, preserves preferences for old clients and rechecks ownership on apply", () => {
  const directory = mkdtempSync(join(tmpdir(), "simi-saved-looks-"));
  const store = new Store(":memory:");
  const c = new Community(store, { directory });
  try {
    const id = c.join({
      month: 1,
      year: 2000,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    }).me.id;
    const original = c.privateProfile(id).progress;
    const free = captureLook({ ...original, ...outfitLook(60, 0) });
    const premium = captureLook({ ...original, ...outfitLook(61, 0) });
    assert.throws(
      () => c.patch(id, { savedLooks: [premium] }),
      /Unlock every piece/,
    );
    assert.throws(
      () => c.patch(id, { savedLooks: [{ ...free, hat: 1 }] }),
      /Unlock every piece/,
    );
    c.patch(id, {
      savedLooks: [free],
      favouriteSet: "rainshield-guardian",
      xp: 99999,
      wardrobePurchased: ["rainshield-guardian"],
    });
    const after = c.patch(id, { sound: false }).progress;
    assert.deepEqual(after.savedLooks[0], free);
    assert.equal(after.favouriteSet, "rainshield-guardian");
    assert.equal(after.xp, original.xp);
    assert.deepEqual(after.wardrobePurchased, []);
    c.save(id, { ...after, wardrobePurchased: ["rainshield-guardian"] });
    c.patch(id, { savedLooks: [free, premium] });
    c.patch(id, premium);
    const owned = c.privateProfile(id).progress;
    // Simulate entitlement removal; inactive snapshots cannot grant items back.
    c.save(id, { ...owned, ...free, wardrobePurchased: [] });
    assert.equal(
      savedLookAllowed(premium, c.privateProfile(id).progress),
      false,
    );
    assert.throws(() => c.patch(id, premium), /Unlock/);
    assert.doesNotThrow(() => c.patch(id, { sound: true }));
    c.patch(id, { savedLooks: [free, null] });
    assert.equal(c.privateProfile(id).progress.savedLooks[1], null);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("favourite progress separates earned tokens, owned looks and optional purchases", () => {
  const p = {
    ...fresh(),
    favouriteSet: "monsoon-wayfinder",
    xp: 1100,
    medalTokens: 2,
  };
  assert.match(favouriteProgress(p), /8 \/ 8 Style tokens · 0 to go/);
  assert.match(favouriteProgress(p), /No deadline/);
  assert.doesNotMatch(favouriteProgress(p), /data-buy-set/);
  assert.match(
    favouriteProgress({ ...p, favouriteSet: "rainshield-guardian" }),
    /Style tokens do not unlock/,
  );
  assert.match(
    favouriteProgress({ ...p, wardrobeUnlocked: ["monsoon-wayfinder"] }),
    /Yours to wear/,
  );
});
