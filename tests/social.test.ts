import test from "node:test";
import assert from "node:assert/strict";
import { Store, day } from "../server/store.mjs";

function setup() {
  let time = Date.parse("2026-10-02T15:59:00Z");
  const store = new Store(":memory:", () => time);
  return { store, tick: (ms) => (time += ms) };
}
test("new neighbours start at zero; midnight SGT settles five games exactly once", () => {
  const { store, tick } = setup();
  const people = Array.from({ length: 4 }, () => store.session().id);
  assert.equal(store.state(people[0]).players[0].points, 0);
  for (const game of ["noodle", "brick", "hop", "swarm", "coast"])
    for (let i = 0; i < 4; i++) {
      const r = store.begin(people[i], game);
      store.finish(people[i], r.id, 100 - i * 20);
    }
  assert.ok(store.state(people[0]).players.every((p) => p.points === 0));
  tick(60000);
  assert.equal(day(Date.parse("2026-10-02T16:00:00Z")), "2026-10-03");
  assert.deepEqual(
    store.state(people[0]).players.map((p) => p.points),
    [15, 10, 5, 0],
  );
  assert.deepEqual(
    store.state(people[0]).players.map((p) => p.points),
    [15, 10, 5, 0],
  );
  tick(86400000 * 2);
  assert.deepEqual(
    store.state(people[0]).players.map((p) => p.points),
    [15, 10, 5, 0],
  );
  store.close();
});
test("zero scores receive no medals and a later score never changes closed-day awards", () => {
  const { store, tick } = setup();
  const a = store.session().id,
    b = store.session().id;
  store.finish(a, store.begin(a, "noodle").id, 20);
  store.finish(b, store.begin(b, "noodle").id, 0);
  tick(60000);
  store.finish(b, store.begin(b, "noodle").id, 200);
  assert.deepEqual(
    store.state(a).players.map((p) => p.points),
    [3, 0],
  );
  store.close();
});
test("equal scores share ranks; duplicate finishes cannot replace score", () => {
  const { store, tick } = setup();
  const a = store.session().id,
    b = store.session().id;
  const r = store.begin(a, "hop");
  store.finish(a, r.id, 100);
  tick(1);
  store.finish(b, store.begin(b, "hop").id, 100);
  assert.equal(store.finish(a, r.id, 999).score, 100);
  assert.deepEqual(
    store.state(a).boards.hop.map((p) => p.rank),
    [1, 1],
  );
  tick(60000);
  assert.deepEqual(
    store.state(a).players.map((p) => p.points),
    [3, 3],
  );
  store.close();
});
test("one outgoing attempt a day; an abandoned attempt consumes only the sender's budget", () => {
  const { store, tick } = setup();
  const a = store.session().id;
  const defenders = Array.from({ length: 4 }, () => store.session().id);
  for (const p of defenders) store.finish(p, store.begin(p, "noodle").id, 100);
  store.abandon(a, store.begin(a, "noodle", defenders[0]).id);
  assert.throws(() => store.begin(a, "noodle", defenders[3]), /today’s dare/);
  assert.equal(store.state(a).players[0].outgoing, 1);
  tick(60000);
  assert.ok(store.begin(a, "noodle", defenders[0]));
  assert.throws(() => store.begin(a, "noodle", defenders[0]), /today’s dare/);
  // Four independent guests can all challenge the same defender.
  for (let i = 0; i < 4; i++)
    store.begin(store.session().id, "noodle", defenders[1]);
  assert.equal(
    store.state(a).players.find((p) => p.id === defenders[1]).incoming,
    4,
  );
  store.close();
});
test("online and self challenges blocked; target score snapshot, tie loss, win separate from medals", () => {
  const { store } = setup();
  const a = store.session().id,
    b = store.session().id;
  store.finish(a, store.begin(a, "noodle").id, 100);
  store.heartbeat(a, { connection: "a", away: false });
  assert.throws(() => store.begin(b, "noodle", a), /back online/);
  assert.throws(() => store.begin(a, "noodle", a), /another neighbour/);
  store.heartbeat(a, { connection: "a", away: true });
  const r = store.begin(b, "noodle", a);
  store.finish(a, store.begin(a, "noodle").id, 200);
  assert.equal(store.finish(b, r.id, 120).won, true);
  const s = store.state(b);
  assert.equal(s.players[1].wins, 1);
  assert.equal(s.players[1].points, 0);
  const c = store.session().id;
  const tie = store.begin(c, "noodle", a);
  assert.equal(store.finish(c, tie.id, 200).won, false);
  store.close();
});
test("disconnect retains avatar and score; one closing tab does not disconnect another", () => {
  const { store, tick } = setup();
  const a = store.session().id;
  store.heartbeat(a, {
    connection: "a",
    away: false,
    activity: "dragon",
    look: {
      outfit: 2,
      hat: 3,
      skin: 1,
      clothing: 2,
      hair: 3,
      pet: 1,
      accessory: 2,
    },
  });
  store.heartbeat(a, { connection: "b", away: false });
  store.heartbeat(a, { connection: "a" }, true);
  assert.equal(store.status(a), "online");
  tick(15001);
  const p = store.state(a).players[0];
  assert.equal(p.status, "offline");
  assert.equal(p.activity, "dragon");
  assert.equal(p.look.hat, 3);
  assert.equal(p.look.pet, 1);
  assert.equal(p.look.clothing, 2);
  assert.equal(p.look.hair, 3);
  assert.equal(p.look.accessory, 2);
  store.close();
});
test("invalid, wrong-owner and abandoned results are rejected", () => {
  const { store } = setup();
  const a = store.session().id,
    b = store.session().id,
    r = store.begin(a, "swarm");
  assert.throws(() => store.finish(b, r.id, 100), /not found/);
  assert.throws(() => store.finish(a, r.id, -1), /Invalid/);
  store.abandon(a, r.id);
  assert.throws(() => store.finish(a, r.id, 100), /expired/);
  store.close();
});
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("database restart retains identities, avatars and scores, and catches up medals only once", () => {
  const folder = mkdtempSync(join(tmpdir(), "darecade-test-"));
  const file = join(folder, "world.sqlite");
  let time = Date.parse("2026-10-02T15:59:00Z");
  let store = new Store(file, () => time);
  try {
    const guest = store.session();
    store.heartbeat(guest.id, {
      connection: "test",
      away: true,
      activity: "dragon",
      look: { outfit: 3, skin: 7, hat: 2 },
    });
    store.finish(guest.id, store.begin(guest.id, "brick").id, 45);
    store.close();
    time += 120000;
    store = new Store(file, () => time);
    assert.equal(store.session(guest.token).id, guest.id);
    const player = store.state(guest.id).players[0];
    assert.equal(player.status, "offline");
    assert.equal(player.best.brick, 45);
    assert.equal(player.activity, "dragon");
    assert.equal(player.look.skin, 7);
    assert.equal(player.points, 3);
    store.close();
    store = new Store(file, () => time);
    assert.equal(store.state(guest.id).players[0].points, 3);
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("daily score can be lower than lifetime best and tied ranks skip places", () => {
  const { store, tick } = setup();
  const a = store.session().id,
    b = store.session().id,
    c = store.session().id;
  store.finish(a, store.begin(a, "brick").id, 500);
  tick(60000);
  assert.equal(store.state(a).boards.brick.length, 0);
  store.finish(a, store.begin(a, "brick").id, 20);
  store.finish(b, store.begin(b, "brick").id, 20);
  store.finish(c, store.begin(c, "brick").id, 10);
  assert.deepEqual(
    store.state(a).boards.brick.map((p) => p.rank),
    [1, 1, 3],
  );
  assert.equal(store.state(a).players[0].best.brick, 500);
  tick(86400000);
  assert.deepEqual(
    store.state(a).players.map((p) => p.points),
    [6, 3, 1],
  );
  store.close();
});

test("legacy medals survive schema migration and tied awards remain possible", () => {
  const folder = mkdtempSync(join(tmpdir(), "darecade-migration-"));
  const path = join(folder, "world.sqlite");
  let time = Date.parse("2026-10-02T15:59:00Z");
  let store = new Store(path, () => time);
  try {
    const a = store.session().id,
      b = store.session().id;
    store.db.exec(
      `DROP TABLE medals; CREATE TABLE medals(day TEXT,game TEXT,player TEXT,rank INTEGER,points INTEGER,score INTEGER,PRIMARY KEY(day,game,rank),UNIQUE(day,game,player)); DELETE FROM rules;`,
    );
    store.db
      .prepare("INSERT INTO medals VALUES(?,?,?,?,?,?)")
      .run("2026-10-01", "hop", a, 1, 3, 80);
    store.close();
    store = new Store(path, () => time);
    assert.equal(store.state(a).players[0].points, 3);
    for (const id of [a, b]) store.finish(id, store.begin(id, "hop").id, 100);
    time += 60000;
    assert.deepEqual(
      store.state(a).players.map((p) => p.points),
      [6, 3],
    );
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
