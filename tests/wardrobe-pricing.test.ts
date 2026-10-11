import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import {
  fresh,
  normalise,
  claimGift,
  completeWelcomeRound,
} from "../src/state.ts";
import {
  canWear,
  legendarySets,
  pieceId,
  redemptionCost,
  setItemIndex,
  styleTokens,
} from "../src/collections.ts";
import { wardrobeBrowser, favouriteProgress } from "../src/wardrobe.ts";

test("piece unlocks debit once, authorize only the piece and credit a complete-set upgrade", () => {
  const directory = mkdtempSync(join(tmpdir(), "simi-piece-pricing-"));
  const store = new Store(":memory:");
  const c = new Community(store, { directory });
  try {
    const id = c.join({
      over13: true,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    }).me.id;
    const clothes = pieceId("clothing", "solar");
    assert.throws(
      () => c.progression(id, "redeem-style", clothes),
      /Earn enough/,
    );
    c.patch(id, { wardrobeUnlocked: [clothes], wardrobeSpent: -8, xp: 900 });
    assert.deepEqual(c.privateProfile(id).progress.wardrobeUnlocked, []);
    c.save(id, { ...c.privateProfile(id).progress, xp: 800 });
    const p = c.progression(id, "redeem-style", clothes).progress;
    assert.equal(styleTokens(p), 3);
    assert.equal(canWear("clothing", setItemIndex("clothing", 0), p, 0), true);
    assert.equal(canWear("hair", setItemIndex("hair", 0), p, 0), false);
    assert.throws(
      () => c.patch(id, { hair: setItemIndex("hair", 0) }),
      /Unlock/,
    );
    assert.equal(
      c.progression(id, "redeem-style", clothes).progress.wardrobeSpent,
      5,
    );
    c.patch(id, { clothing: setItemIndex("clothing", 0) });
    assert.equal(redemptionCost(legendarySets[0], p), 3);
    assert.match(
      favouriteProgress({ ...p, favouriteSet: "solar" }),
      /3 \/ 3 Style tokens/,
    );
    const upgraded = c.progression(id, "redeem-style", "solar").progress;
    assert.equal(upgraded.wardrobeSpent, 8);
    assert.equal(styleTokens(upgraded), 0);
    // The outfit no longer brings the pet along: it is its own 4-token piece.
    assert.equal(canWear("pet", setItemIndex("pet", 0), upgraded, 0), false);
    assert.throws(
      () => c.progression(id, "redeem-style", pieceId("pet", "solar")),
      /Earn enough/,
    );
    c.patch(id, { sound: false }); // Old clients preserve ownership and ledger.
    const reloaded = normalise(c.privateProfile(id).progress, fresh());
    assert.equal(reloaded.wardrobeSpent, 8);
    assert.ok(canWear("hair", setItemIndex("hair", 0), reloaded, 0));
    assert.throws(
      () => c.progression(id, "redeem-style", pieceId("hair", "aegis-prime")),
      /Unknown/,
    );
  } finally {
    store.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("standard prices keep old debits and purchases, while Hair cards expose previews", () => {
  for (const set of legendarySets.filter((s) => s.tier === "Legendary"))
    assert.equal(set.cost, 8);
  const old = {
    ...fresh(),
    xp: 1200,
    wardrobeSpent: 12,
    wardrobeUnlocked: ["solar"],
    wardrobePurchased: ["aegis-prime"],
    unlockedHats: [0, 2],
    hat: 2,
  };
  const p = normalise(JSON.parse(JSON.stringify(old)), fresh());
  assert.equal(styleTokens(p), 0);
  assert.equal(p.wardrobeSpent, 12);
  assert.deepEqual(p.wardrobePurchased, old.wardrobePurchased);
  assert.deepEqual(p.unlockedHats, [0, 2]);
  const html = wardrobeBrowser("Hair", "Free", p, 0, null);
  assert.equal((html.match(/data-thumbnail="hair:/g) || []).length, 80);
  assert.match(
    wardrobeBrowser("Clothes", "Legendary", fresh(), 0, null),
    /Unlock piece · 5 Style tokens/,
  );
  assert.match(
    wardrobeBrowser("Headwear", "Legendary", fresh(), 0, null),
    /Unlock piece · 4 Style tokens/,
  );
  assert.match(
    wardrobeBrowser("Outfits", "Legendary", fresh(), 0, null),
    /Unlock outfit · 8 Style tokens/,
  );
  assert.equal(claimGift(fresh(), 1), false);
  const newPlayer = fresh();
  completeWelcomeRound(newPlayer);
  assert.equal(normalise(newPlayer, fresh()).unlockedHats.includes(2), false);
});
