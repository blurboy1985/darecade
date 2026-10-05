import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import {
  canWear,
  legendarySets,
  setStarts,
  setLook,
  styleTokens,
} from "../src/collections.ts";
import { appearanceLimits } from "../src/appearance.ts";
import { fresh, normalise } from "../src/state.ts";
import { legendaryBody, legendaryHead } from "../src/legendary.ts";
import * as T from "three";

test("ten complete sets retain old indices and have distinct visible geometry", () => {
  assert.equal(legendarySets.length, 10);
  const silhouettes = new Set<string>();
  for (let i = 0; i < 10; i++) {
    const root = new T.Group();
    legendaryBody(root, i);
    legendaryHead(root, i);
    assert.ok(root.children.every((group) => group.children.length > 3));
    const parts: string[] = [];
    root.traverse((o) => {
      if (o instanceof T.Mesh)
        parts.push(
          `${o.geometry.type}:${o.position.toArray()}:${o.scale.toArray()}`,
        );
    });
    silhouettes.add(parts.join("|"));
  }
  assert.equal(silhouettes.size, 10);
  for (const slot of ["clothing", "hair", "pet", "accessory"] as const) {
    assert.equal(appearanceLimits[slot], setStarts[slot] + 10);
    assert.equal(canWear(slot, setStarts[slot], fresh(), 100), false);
    assert.equal(canWear(slot, 0, fresh(), 0), true);
    assert.equal(canWear(slot, 8, fresh(), 0), false);
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
      0,
    );
    const p = community.privateProfile(id).progress;
    p.xp = 1200;
    p.rounds = 29;
    community.save(id, p);
    // Tokens alone buy the set, even before any medal or round gate.
    p.rounds = 0;
    community.save(id, p);
    const first = community.progression(id, "redeem-style", "solar").progress;
    assert.equal(styleTokens(first), 0);
    assert.equal(first.xp, 1200);
    assert.deepEqual(first.wardrobeUnlocked, ["solar"]);
    const retry = community.progression(id, "redeem-style", "solar").progress;
    assert.equal(retry.wardrobeSpent, 12);
    assert.equal(
      normalise(JSON.parse(JSON.stringify(retry)), fresh()).wardrobeSpent,
      12,
    );
    const equipped = community.patch(id, setLook(0)).progress;
    assert.equal(equipped.pet, setStarts.pet);
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
