import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import { WorldState } from "../server/world-core.mjs";
import { LocalWorlds } from "../server/local-worlds.mjs";
import { nicknameError } from "../shared/nickname.ts";

test("friend acceptance gates world lookup; mute, block and report are independent", () => {
  const directory = mkdtempSync(join(tmpdir(), "simi-safety-"));
  const store = new Store(":memory:");
  const c = new Community(store, { directory });
  try {
    const people = [0, 1].map((i) => {
      const { me } = c.join({
        month: 1,
        year: 2000,
        consent: true,
        privacyVersion: PRIVACY_VERSION,
      });
      store.db
        .prepare("INSERT INTO accounts VALUES(?,?,?)")
        .run(me.id, `safety${i}@example.test`, 0);
      return c.patch(me.id, { name: `CloudFox${i}` });
    });
    const [a, b] = people;
    const worlds = new LocalWorlds(c);
    worlds.worlds.set("world-1", new WorldState());
    worlds.worlds.set("world-2", new WorldState());
    worlds.poll(a.id, "world-1", { x: 0, z: 10 });
    worlds.poll(b.id, "world-2", { x: 0, z: 10 });
    assert.equal(worlds.directory(a.id).neighbours.length, 0);
    assert.throws(
      () => worlds.destination(a.id, { friend: b.id }),
      /unavailable/,
    );
    assert.equal(
      c.state(a.id).players.find((p) => p.id === b.id)?.status,
      "private",
    );
    c.saveFriend(a.id, b.name);
    assert.equal(c.friends(b.id)[0].relationship, "incoming");
    assert.equal(c.isFriend(a.id, b.id), false);
    c.acceptFriend(b.id, a.id);
    assert.equal(worlds.destination(a.id, { friend: b.id }), "world-2");
    const before = c.privateProfile(a.id).progress;
    c.progression(a.id, "visit", "shop");
    assert.equal(c.privateProfile(a.id).progress.xp, before.xp);
    c.report(a.id, b.id, "unsafe-behaviour");
    assert.equal(store.db.prepare("SELECT COUNT(*) n FROM blocks").get().n, 0);
    c.moderate(a.id, b.id, "mute");
    assert.deepEqual(c.state(a.id).muted, [b.id]);
    assert.equal(worlds.destination(a.id, { friend: b.id }), "world-2");
    c.moderate(a.id, b.id, "block");
    assert.throws(
      () => worlds.destination(a.id, { friend: b.id }),
      /unavailable/,
    );
    assert.equal(
      c.state(a.id).players.some((p) => p.id === b.id),
      false,
    );
    assert.throws(
      () => c.acceptInvite(a.id, c.invite(b.id).code),
      /unavailable/,
    );
    assert.equal(
      c.privateProfile(a.id).progress.wardrobeSpent,
      before.wardrobeSpent,
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("nickname filtering rejects contact, real-name patterns and profanity", () => {
  for (const name of [
    "John Smith",
    "DanielQuek",
    "Jane_Smith",
    "call123456",
    "name@gmail.com",
    "DiscordMe",
    "f_u_c_k",
  ])
    assert.ok(nicknameError(name), name);
  for (const name of ["CloudFox", "MintMochi7", "PixelOtter"])
    assert.equal(nicknameError(name), null);
});
