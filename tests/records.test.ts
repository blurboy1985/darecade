import test from "node:test";
import assert from "node:assert/strict";
import { Store, day } from "../server/store.mjs";
import { CommunityCore, PRIVACY_VERSION } from "../server/community-core.mjs";
import { fresh } from "../src/state.ts";

function fixture(count = 1000) {
  let now = Date.parse("2026-10-04T12:00:00+08:00");
  const store = new Store(":memory:", () => now);
  const community = new CommunityCore(store);
  const db = store.db;
  store.transaction(() => {
    const player = db.prepare(
      "INSERT INTO players(id,name,created,since,seen) VALUES(?,?,?,?,?)",
    );
    const profile = db.prepare("INSERT INTO profiles VALUES(?,?,?,?,?,?)");
    const account = db.prepare("INSERT INTO accounts VALUES(?,?,?)");
    const run =
      db.prepare(`INSERT INTO runs(id,player,game,started,finished,score,target,targetScore,day,status,verified,eligible,version)
      VALUES(?,?,?,?,?,?,?,?,?,'finished',1,1,1)`);
    const medal = db.prepare("INSERT INTO medals VALUES(?,?,?,?,?,?)");
    for (let i = 0; i < count; i++) {
      const id = `p${i}`;
      player.run(id, `Neighbour ${i}`, now, now, now - count + i);
      profile.run(
        id,
        "18+",
        PRIVACY_VERSION,
        now,
        JSON.stringify(fresh()),
        now,
      );
      account.run(id, `synthetic-${i}@example.test`, now - 86400000);
    }
    for (let i = 0; i < count; i++) {
      for (let r = 0; r < 20; r++) {
        const game = ["noodle", "brick", "hop", "swarm"][r % 4];
        run.run(
          `r${i}-${r}`,
          `p${i}`,
          game,
          now - 20000 + r,
          now - 10000 + r,
          i + r + 1,
          r === 0 ? `p${(i + 1) % count}` : null,
          0,
          day(now),
        );
      }
      medal.run(day(now - 86400000), "noodle", `p${i}`, 1, 3, 1);
    }
  });
  return {
    store,
    community,
    db,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

test("1,000 players / 20,000 runs: cached personal state <10ms, rebuild <300ms", (t) => {
  const { store, community } = fixture();
  try {
    for (let i = 0; i < 25; i++)
      store.heartbeat(`p${i}`, { connection: "benchmark", away: i % 2 === 0 });
    const builds: number[] = [];
    for (let i = 0; i < 3; i++) {
      store.cachedSnapshot = null;
      const start = performance.now();
      const state = community.state("p999");
      builds.push(performance.now() - start);
      assert.equal(state.boards.noodle[0].score, 1016);
      assert.equal(state.self.points, 3);
      assert.equal(state.self.wins, 1);
    }
    const cached: number[] = [];
    for (let i = 0; i < 30; i++) {
      const start = performance.now();
      community.state(`p${i}`);
      cached.push(performance.now() - start);
    }
    const p95 = cached.sort((a, b) => a - b)[28];
    t.diagnostic(
      `1,000 players / 20,000 runs: rebuilds ${builds.map((n) => n.toFixed(2)).join(", ")} ms; cached p95 ${p95.toFixed(2)} ms, max ${Math.max(...cached).toFixed(2)} ms`,
    );
    assert.ok(Math.max(...builds) < 300, `rebuild ${Math.max(...builds)}ms`);
    assert.ok(Math.max(...cached) < 10, `cached ${Math.max(...cached)}ms`);
  } finally {
    store.close();
  }
});

test("index-free grouped snapshots retain scores and use a fixed number of queries", (t) => {
  const { store, community, db } = fixture();
  try {
    const expected = community.state("p999");
    for (const { name } of db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND sql IS NOT NULL",
      )
      .all())
      db.exec(`DROP INDEX "${name}"`);
    db.exec("PRAGMA automatic_index=OFF");
    let queries = 0;
    const prepare = db.prepare.bind(db);
    db.prepare = (sql: string) => {
      queries++;
      return prepare(sql);
    };
    store.cachedSnapshot = null;
    const actual = community.state("p999");
    assert.deepEqual(actual, expected);
    assert.ok(queries < 40, `expected grouped queries, got ${queries}`);
    t.diagnostic(
      `Full snapshot and personal state use ${queries} queries with all optional indexes removed and automatic indexes disabled`,
    );
  } finally {
    store.close();
  }
});

test("presence selects recent neighbours, filters both sides of blocks, and never rebuilds scores", () => {
  const { store, community, db, tick } = fixture(80);
  try {
    community.state("p79");
    const cached = store.cachedSnapshot;
    for (let i = 40; i < 65; i++) {
      tick(1);
      store.heartbeat(`p${i}`, { connection: "tab", away: i % 2 === 0 });
    }
    community.report("p79", "p64", "unsafe-behaviour");
    community.report("p63", "p79", "unsafe-behaviour");
    db.prepare("INSERT INTO suspensions VALUES(?,?)").run("p62", store.now());
    tick(31000);
    for (let i = 40; i < 65; i++)
      store.heartbeat(`p${i}`, { connection: "tab", away: i % 2 === 0 });
    const presence = community.presence("p79");
    assert.deepEqual(Object.keys(presence), ["players"]);
    assert.equal(store.cachedSnapshot, cached);
    assert.equal(
      presence.players.filter((p) => p.status !== "offline").length,
      22,
    );
    assert.equal(
      presence.players.filter((p) => p.status === "offline").length,
      8,
    );
    assert.ok(presence.players.some((p) => p.id === "p60"));
    assert.ok(
      presence.players.every((p) => !["p62", "p63", "p64"].includes(p.id)),
    );
    assert.ok(
      presence.players.every((p, i, rows) => !i || rows[i - 1].seen >= p.seen),
    );
    assert.ok(!JSON.stringify(presence).includes("example.test"));
    for (let i = 0; i < 80; i++)
      store.heartbeat(`p${i}`, { connection: "tab" });
    assert.equal(community.presence("p79").players.length, 40);
  } finally {
    store.close();
  }
});

test("snapshots expire at 30 seconds and midnight, refresh after events, and isolate callers", () => {
  const { store, community, db, tick } = fixture(12);
  try {
    const first = community.state("p11");
    const cached = store.cachedSnapshot;
    first.boards.noodle[0].name = "tampered";
    first.players[0].best.noodle = -1;
    tick(29999);
    assert.notEqual(community.state("p11").boards.noodle[0].name, "tampered");
    assert.equal(store.cachedSnapshot, cached);
    tick(1);
    community.state("p11");
    assert.notEqual(store.cachedSnapshot, cached);
    const run = store.begin("p11", "noodle");
    store.finish("p11", run.id, 999);
    assert.equal(community.cachedSnapshot.base.boards.noodle[0].score, 999);
    db.prepare("UPDATE runs SET seed=1 WHERE id=?").run(run.id);
    assert.throws(() => community.postDare("p11", run.id), /saved score/);
    community.report("p10", "p11", "suspected-cheating");
    assert.ok(
      !community.state("p10").boards.noodle.some((p) => p.id === "p11"),
    );
    assert.ok(!community.state("p11").players.some((p) => p.id === "p10"));
    db.prepare("INSERT INTO suspensions VALUES(?,?)").run("p11", store.now());
    const moderated = community.state("p9");
    assert.ok(!moderated.boards.noodle.some((p) => p.id === "p11"));
    assert.equal(moderated.dares.length, 0);
    tick(12 * 3600000);
    assert.notEqual(community.state("p9").day, first.day);
    assert.equal(community.state("p9").boards.noodle.length, 0);
  } finally {
    store.close();
  }
});
