import test from "node:test";
import assert from "node:assert/strict";
import { Store } from "../server/store.mjs";
import { CommunityCore, PRIVACY_VERSION } from "../server/community-core.mjs";
import { handleApi } from "../cloudflare/api.mjs";
import { fresh } from "../src/state.ts";

const consent = {
  over13: true,
  consent: true,
  privacyVersion: PRIVACY_VERSION,
};

test("new guests choose a validated nickname and keep the neutral starter across reloads", () => {
  const store = new Store(":memory:");
  const c = new CommunityCore(store, { files: { playtests: () => [] } });
  try {
    for (const name of [
      "",
      "a",
      "person@example.com",
      "<script>",
      "x123456",
      123,
    ])
      assert.throws(() => c.join({ ...consent, name }));
    assert.equal(store.db.prepare("SELECT count(*) n FROM players").get().n, 0);
    const guest = c.join({ ...consent, name: "  MoonOtter  " });
    assert.equal(guest.me.name, "MoonOtter");
    assert.equal(guest.me.progress.nameChosen, true);
    for (const key of [
      "outfit",
      "skin",
      "eye",
      "hair",
      "baseHair",
      "clothing",
    ] as const)
      assert.equal(guest.me.progress[key], fresh()[key]);
    c.patch(guest.me.id, { skin: 6, hair: 38, clothing: 2 });
    const returned = c.privateProfile(c.lookup(guest.token));
    assert.equal(returned.progress.skin, 6);
    assert.equal(returned.progress.hair, 38);
    assert.equal(returned.progress.clothing, 2);
    assert.equal(returned.name, "MoonOtter");
  } finally {
    store.close();
  }
});

test("guest reset deletes only the authenticated guest, revokes its session and rejects linked accounts", async () => {
  const store = new Store(":memory:");
  const c = new CommunityCore(store, { files: { playtests: () => [] } });
  const guest = c.join({ ...consent, name: "MoonOtter" });
  const other = c.join({ ...consent, name: "StarPanda" });
  const origin = "https://darecade.test";
  c.origin = origin;
  const reset = (token: string, body: object) =>
    handleApi(
      new Request(`${origin}/api/privacy/delete`, {
        method: "POST",
        headers: {
          origin,
          "content-type": "application/json",
          cookie: `darecade_session=${token}`,
        },
        body: JSON.stringify(body),
      }),
      { community: c, store, rate() {}, worlds: { async disconnect() {} } },
    );
  try {
    assert.equal(
      (await reset(guest.token, { guestOnly: true, confirm: "" })).status,
      400,
    );
    assert.equal(c.lookup(guest.token), guest.me.id);
    store.db
      .prepare("INSERT INTO accounts VALUES(?,?,?)")
      .run(other.me.id, "test@example.invalid", 0);
    const rejected = await reset(other.token, {
      guestOnly: true,
      confirm: "DELETE",
    });
    assert.equal(rejected.status, 409);
    assert.equal(c.lookup(other.token), other.me.id);
    const removed = await reset(guest.token, {
      guestOnly: true,
      confirm: "DELETE",
      player: other.me.id,
    });
    assert.equal(removed.status, 200, await removed.text());
    assert.match(removed.headers.get("set-cookie")!, /Max-Age=0/);
    assert.equal(c.lookup(guest.token), null);
    assert.throws(() => c.privateProfile(guest.me.id));
    assert.equal(c.privateProfile(other.me.id).name, "StarPanda");
    const restarted = c.join({ ...consent, name: "NewOtter" });
    assert.notEqual(restarted.me.id, guest.me.id);
    assert.equal(restarted.me.progress.xp, 0);
    assert.equal(restarted.me.progress.rounds, 0);
    assert.deepEqual(restarted.me.progress.wardrobePurchased, []);
  } finally {
    store.close();
  }
});
