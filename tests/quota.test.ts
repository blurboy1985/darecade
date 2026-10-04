import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { CommunityCore, PRIVACY_VERSION } from "../server/community-core.mjs";

const consent = {
  month: 1,
  year: 2000,
  consent: true,
  privacyVersion: PRIVACY_VERSION,
};
const FIVE_MINUTES = 5 * 60000;
const DAY = 86400000;

test("activity touches are bounded across requests, sessions and database restarts", () => {
  const directory = mkdtempSync(join(tmpdir(), "darecade-quota-"));
  const path = join(directory, "records.sqlite");
  let now = Date.parse("2026-10-03T12:00:00Z");
  let store = new Store(path, () => now);
  let community = new CommunityCore(store);
  try {
    const guest = community.join(consent);
    const otherSession = community.issue(guest.me.id);
    const read = () =>
      store.db
        .prepare("SELECT last_active FROM profiles WHERE player=?")
        .get(guest.me.id).last_active;
    store.db.exec(`CREATE TABLE activity_writes(n INTEGER NOT NULL);
      INSERT INTO activity_writes VALUES(0);
      CREATE TRIGGER count_activity_writes AFTER UPDATE OF last_active ON profiles
      BEGIN UPDATE activity_writes SET n=n+1; END;`);
    const writes = () =>
      store.db.prepare("SELECT n FROM activity_writes").get().n;
    const joined = now;
    for (let request = 1; request < 10; request++) {
      now = joined + request * 30000;
      assert.equal(community.lookup(guest.token), guest.me.id);
      assert.equal(community.lookup(otherSession), guest.me.id);
    }
    assert.equal(read(), joined);
    assert.equal(writes(), 0);
    store.close();
    store = new Store(path, () => now);
    community = new CommunityCore(store);
    now = joined + FIVE_MINUTES - 1;
    assert.equal(community.lookup(guest.token), guest.me.id);
    assert.equal(writes(), 0);
    now++;
    assert.equal(community.lookup(otherSession), guest.me.id);
    assert.equal(read(), now);
    assert.equal(writes(), 1);
    assert.equal(community.lookup(guest.token), guest.me.id);
    assert.equal(writes(), 1);
    now += FIVE_MINUTES;
    assert.equal(community.lookup(guest.token), guest.me.id);
    assert.equal(writes(), 2);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("throttling activity writes never caches expiry, consent, suspension or deletion", () => {
  let now = Date.parse("2026-10-03T12:00:00Z");
  const store = new Store(":memory:", () => now);
  const community = new CommunityCore(store);
  try {
    const guest = community.join(consent);
    assert.equal(community.lookup(guest.token), guest.me.id);
    now += 1000;
    store.db
      .prepare("UPDATE profiles SET consent=? WHERE player=?")
      .run("old", guest.me.id);
    assert.equal(community.lookup(guest.token), null);
    store.db
      .prepare("UPDATE profiles SET consent=? WHERE player=?")
      .run(PRIVACY_VERSION, guest.me.id);
    store.db
      .prepare("INSERT INTO suspensions VALUES(?,?)")
      .run(guest.me.id, now);
    assert.equal(community.lookup(guest.token), null);
    store.db.prepare("DELETE FROM suspensions WHERE player=?").run(guest.me.id);
    assert.equal(community.lookup(guest.token), guest.me.id);
    store.db
      .prepare("UPDATE sessions SET expires=? WHERE player=?")
      .run(now, guest.me.id);
    assert.equal(community.lookup(guest.token), null);
    assert.equal(community.lookup("invalid-token"), null);
    const freshSession = community.issue(guest.me.id);
    assert.equal(community.lookup(freshSession), guest.me.id);
    store.db.prepare("DELETE FROM sessions WHERE player=?").run(guest.me.id);
    assert.equal(community.lookup(freshSession), null);
    assert.equal(
      store.db
        .prepare("SELECT last_active FROM profiles WHERE player=?")
        .get(guest.me.id).last_active,
      now - 1000,
    );
  } finally {
    store.close();
  }
});

test("replay retention clears expired payloads once and preserves scores and fresh payloads", () => {
  const now = Date.parse("2026-10-03T12:00:00Z");
  const store = new Store(":memory:", () => now);
  const community = new CommunityCore(store, { files: { cleanup() {} } });
  try {
    const guest = community.join(consent);
    const insert = store.db.prepare(
      "INSERT INTO runs(id,player,finished,score,replay) VALUES(?,?,?,?,?)",
    );
    insert.run("old", guest.me.id, now - 31 * DAY, 42, "old-replay");
    insert.run("cleared", guest.me.id, now - 31 * DAY, 43, null);
    insert.run("boundary", guest.me.id, now - 30 * DAY, 44, "boundary-replay");
    insert.run("fresh", guest.me.id, now - DAY, 45, "fresh-replay");
    store.db.exec(`CREATE TABLE replay_writes(n INTEGER NOT NULL);
      INSERT INTO replay_writes VALUES(0);
      CREATE TRIGGER count_replay_writes AFTER UPDATE OF replay ON runs
      BEGIN UPDATE replay_writes SET n=n+1; END;`);
    community.cleanup();
    community.cleanup();
    assert.equal(store.db.prepare("SELECT n FROM replay_writes").get().n, 1);
    assert.deepEqual(
      store.db
        .prepare("SELECT id,score,replay FROM runs ORDER BY id")
        .all()
        .map((row) => ({ ...row })),
      [
        { id: "boundary", score: 44, replay: "boundary-replay" },
        { id: "cleared", score: 43, replay: null },
        { id: "fresh", score: 45, replay: "fresh-replay" },
        { id: "old", score: 42, replay: null },
      ],
    );
  } finally {
    store.close();
  }
});
