import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import { styleTokens } from "../src/collections.ts";

test("existing version-1 profile survives database reopen with account, items and balances intact", () => {
  const directory = mkdtempSync(join(tmpdir(), "simi-save-refresh-"));
  const file = join(directory, "records.sqlite");
  const now = () => Date.parse("2026-10-06T02:00:00Z");
  let store = new Store(file, now);
  try {
    let community = new Community(store, { directory });
    const { me } = community.join({
      month: 1,
      year: 2000,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    });
    const progress = me.progress;
    Object.assign(progress, {
      xp: 2740,
      medalTokens: 19,
      wardrobeSpent: 12,
      wardrobeUnlocked: ["solar", "discovery"],
      wardrobePurchased: ["galaxy"],
      hair: 38,
      skin: 6,
      clothing: 24,
      hat: 2,
      unlockedHats: [0, 1, 2, 3],
      rounds: 31,
      coins: ["coin1"],
      coastRecord: { version: 3, timeTicks: 6150, place: 4 },
    });
    community.save(me.id, progress);
    community.patch(me.id, { hair: 38, skin: 6, clothing: 24, hat: 2 });
    store.db
      .prepare("INSERT INTO accounts VALUES(?,?,?)")
      .run(me.id, "existing@example.test", now() - 86400000);
    const before = community.privateProfile(me.id);
    const balance = styleTokens(before.progress);
    store.close();
    store = new Store(file, now);
    community = new Community(store, { directory });
    const after = community.privateProfile(me.id);
    assert.deepEqual(after, before);
    assert.equal(after.progress.version, 1);
    assert.equal(styleTokens(after.progress), balance);
    assert.deepEqual(
      JSON.parse(
        store.db.prepare("SELECT look FROM players WHERE id=?").get(me.id).look,
      ),
      Object.fromEntries(
        [
          "outfit",
          "skin",
          "body",
          "clothing",
          "hair",
          "pet",
          "accessory",
          "hat",
        ].map((k) => [k, after.progress[k]]),
      ),
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
