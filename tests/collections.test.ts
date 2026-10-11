import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import {
  canWear,
  collectionFor,
  extraCounts,
  extraIndexFor,
  extraItemIndex,
  legendarySets,
  setIndexFor,
  setItemIndex,
  setStarts,
  setLook,
  slotSize,
  styleTokens,
} from "../src/collections.ts";
import {
  accessoryNames,
  appearanceLimits,
  clothingNames,
  hairNames,
  petNames,
} from "../src/appearance.ts";
import { fresh, normalise } from "../src/state.ts";
import { costumeBody, costumeHead } from "../src/costume-design.ts";
import { createHash } from "node:crypto";
import * as T from "three";

test("complete sets retain old indices and have distinct visible geometry", () => {
  assert.equal(legendarySets.length, 66);
  const silhouettes = new Set<string>();
  for (let i = 0; i < legendarySets.length; i++) {
    const root = new T.Group();
    costumeBody(root, legendarySets[i], 0);
    costumeHead(root, legendarySets[i]);
    assert.ok(root.children.every((group) => group.children.length === 1));
    const parts: string[] = [];
    root.traverse((o) => {
      if (o instanceof T.Mesh)
        parts.push(
          createHash("sha256")
            .update(
              Buffer.from(o.geometry.getAttribute("position").array.buffer),
            )
            .update(Buffer.from(o.geometry.getAttribute("color").array.buffer))
            .digest("hex"),
        );
    });
    silhouettes.add(parts.join("|"));
  }
  assert.equal(silhouettes.size, legendarySets.length);
  for (const slot of ["clothing", "hair", "pet", "accessory"] as const) {
    assert.equal(appearanceLimits[slot], slotSize(slot));
    assert.equal(canWear(slot, setStarts[slot], fresh(), 100), false);
    assert.equal(canWear(slot, 0, fresh(), 0), true);
    assert.equal(canWear(slot, 8, fresh(), 0), true);
    assert.equal(
      canWear(slot, 8, { ...fresh(), wardrobeUnlocked: ["discovery"] }, 0),
      true,
    );
    assert.equal(
      canWear(slot, 16, { ...fresh(), wardrobePurchased: ["mastery"] }, 3),
      true,
    );
    assert.equal(canWear(slot, 999, fresh(), 999), false);
  }
});

test("exchanges enforce server progress, debit once, survive reload and protect all equip paths", () => {
  const directory = mkdtempSync(join(tmpdir(), "darecade-wardrobe-"));
  const store = new Store(":memory:");
  const community = new Community(store, { directory });
  try {
    const { me } = community.join({
      month: 1,
      year: 2000,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    });
    const id = me.id;
    assert.throws(() => community.patch(id, setLook(0)), /Unlock/);
    assert.throws(
      () => community.progression(id, "redeem-style", "solar"),
      /Earn/,
    );
    community.patch(id, {
      xp: 99999,
      rounds: 99999,
      wardrobeUnlocked: ["solar"],
      wardrobeSpent: -999,
    });
    assert.equal(community.privateProfile(id).progress.xp, 0);
    assert.deepEqual(
      community.privateProfile(id).progress.wardrobeUnlocked,
      [],
    );
    store.heartbeat(id, {
      connection: "wardrobe-test",
      look: setLook(0),
      x: 0,
      z: 4,
    });
    assert.equal(
      JSON.parse(
        store.db.prepare("SELECT look FROM players WHERE id=?").get(id).look,
      ).clothing,
      me.progress.clothing,
    );
    const p = community.privateProfile(id).progress;
    p.xp = 1200;
    p.rounds = 29;
    community.save(id, p);
    // Tokens alone buy the set, even before any medal or round gate.
    p.rounds = 0;
    community.save(id, p);
    // Premium is money-only: the outfit and each of its items.
    for (const premium of [
      "aegis-prime",
      "outfit:aegis-prime",
      "piece:aegis-prime:pet",
      "piece:aegis-prime:clothing",
    ])
      assert.throws(
        () => community.progression(id, "redeem-style", premium),
        /require payment/,
      );
    assert.equal(community.privateProfile(id).progress.wardrobeSpent, 0);
    const first = community.progression(id, "redeem-style", "solar").progress;
    assert.equal(styleTokens(first), 4);
    assert.equal(first.xp, 1200);
    assert.deepEqual(first.wardrobeUnlocked, ["solar"]);
    // The outfit-only ID of 11 October 2026 means the whole set.
    assert.equal(
      community.progression(id, "redeem-style", "outfit:solar").progress
        .wardrobeSpent,
      8,
    );
    const retry = community.progression(id, "redeem-style", "solar").progress;
    assert.equal(retry.wardrobeSpent, 8);
    assert.equal(
      normalise(JSON.parse(JSON.stringify(retry)), fresh()).wardrobeSpent,
      8,
    );
    // The outfit brings its pet and magic.
    const equipped = community.patch(id, setLook(0)).progress;
    assert.equal(equipped.pet, setStarts.pet);
    assert.equal(equipped.accessory, setStarts.accessory);
    assert.equal(
      community.progression(id, "redeem-style", "piece:solar:pet").progress
        .wardrobeSpent,
      8,
    );
    assert.throws(() => community.patch(id, setLook(1)), /Unlock/);
    assert.throws(
      () => community.progression(id, "redeem-style", "unknown"),
      /Unknown/,
    );
    // Medal points provide the alternative route without any completed rounds.
    const second = community.join({
      month: 1,
      year: 2000,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    }).me.id;
    const q = community.privateProfile(second).progress;
    q.xp = 1200;
    community.save(second, q);
    store.db
      .prepare("INSERT INTO medals VALUES(?,?,?,?,?,?)")
      .run("2026-10-01", "noodle", second, 1, 3, 100);
    assert.deepEqual(
      community.progression(second, "redeem-style", "solar").progress
        .wardrobeUnlocked,
      ["solar"],
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("later items and sets are appended without moving any saved index", () => {
  // The names saved looks already point at.
  assert.equal(clothingNames[24], "Solar armour & comet cape");
  assert.equal(hairNames[37], "Shooting star headphones");
  assert.equal(petNames[35], "Encore the star sprite");
  assert.equal(accessoryNames[36], "Starlight encore");
  const names = {
    clothing: clothingNames,
    hair: hairNames,
    pet: petNames,
    accessory: accessoryNames,
  };
  const piece = {
    clothing: "outfit",
    hair: "head",
    pet: "pet",
    accessory: "magic",
  } as const;
  for (const slot of ["clothing", "hair", "pet", "accessory"] as const) {
    const seen = new Set<string>();
    for (let index = 0; index < slotSize(slot); index++) {
      const set = setIndexFor(slot, index);
      const extra = extraIndexFor(slot, index);
      assert.ok(set < 0 || extra < 0);
      if (set >= 0) {
        assert.equal(setItemIndex(slot, set), index);
        assert.equal(names[slot][index], legendarySets[set][piece[slot]]);
        assert.equal(collectionFor(slot, index), "legendary");
        seen.add(`set${set}`);
      }
      if (extra >= 0) {
        assert.equal(extraItemIndex(slot, extra), index);
        assert.notEqual(collectionFor(slot, index), "legendary");
        seen.add(`extra${extra}`);
      }
    }
    assert.equal(seen.size, legendarySets.length + extraCounts[slot]);
    assert.equal(setIndexFor(slot, slotSize(slot)), -1);
    if (!extraCounts[slot]) continue;
    // Historical collection IDs remain stable for existing saves.
    const tiers = Array.from({ length: extraCounts[slot] }, (_, i) =>
      collectionFor(slot, extraItemIndex(slot, i)),
    );
    for (const tier of ["starter", "discovery", "mastery"])
      assert.equal(
        tiers.filter((t) => t === tier).length,
        extraCounts[slot] / 3,
      );
    assert.equal(canWear(slot, extraItemIndex(slot, 0), fresh(), 0), true);
    assert.equal(
      canWear(slot, extraItemIndex(slot, extraCounts[slot] / 3), fresh(), 0),
      true,
    );
  }
  assert.equal(setLook(10).pet, setStarts.pet + 16);
  assert.equal(canWear("pet", setLook(10).pet, fresh(), 0), false);
  assert.equal(
    canWear(
      "pet",
      setLook(10).pet,
      { ...fresh(), wardrobePurchased: ["candy"] },
      0,
    ),
    true,
  );
});
