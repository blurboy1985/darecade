import test from "node:test";
import assert from "node:assert/strict";
import { Store, day, gameIds } from "../server/store.mjs";
import { playIds } from "../src/catalog.ts";
import { CommunityCore } from "../server/community-core.mjs";

const DAY = 86400000;

function fixture(count = 54) {
  let now = Date.parse("2026-10-04T12:00:00+08:00");
  const store = new Store(":memory:", () => now);
  const player = store.db.prepare(
    "INSERT INTO players(id,name,created,since,seen) VALUES(?,?,?,?,?)",
  );
  for (let i = 0; i < count; i++)
    player.run(`p${i}`, `Synthetic ${i}`, now, now, now);
  const insert = store.db.prepare(`INSERT INTO runs(
    id,player,game,started,finished,score,target,targetScore,day,status,verified,eligible,version
  ) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  return {
    store,
    insert,
    tick: (ms: number) => {
      now += ms;
    },
  };
}

// Keep the pre-optimization queries independent of the production aggregate.
// Compare every card field after snapshot maintenance, including settlement.
function baselineCards(store: Store) {
  const db = store.db;
  const cards = new Map(
    db
      .prepare(
        "SELECT id FROM players WHERE id NOT IN (SELECT player FROM suspensions)",
      )
      .all()
      .map(({ id }) => [
        id,
        {
          best: Object.fromEntries(playIds.map((game) => [game, 0])),
          guestBest: Object.fromEntries(playIds.map((game) => [game, 0])),
          challengeScores: {} as Record<
            string,
            { score: number; runId: string }
          >,
          points: 0,
          wins: 0,
          incoming: 0,
          outgoing: 0,
        },
      ]),
  );
  for (const row of db
    .prepare(
      `SELECT player,game,
      MAX(CASE WHEN eligible=1 AND (game!='coast' OR COALESCE(version,1)=4) THEN score ELSE 0 END) best,
      MAX(CASE WHEN version=CASE WHEN game='coast' THEN 4 ELSE 1 END THEN score ELSE 0 END) guestBest
      FROM runs WHERE status='finished' AND verified=1 GROUP BY player,game`,
    )
    .all()) {
    const card = cards.get(row.player);
    if (card) {
      card.best[row.game] = row.best;
      card.guestBest[row.game] = row.guestBest;
    }
  }
  for (const [field, sql, args] of [
    ["points", "SELECT player,SUM(points) n FROM medals GROUP BY player", []],
    [
      "wins",
      "SELECT player,COUNT(*) n FROM runs WHERE target IS NOT NULL AND status='finished' AND score>targetScore GROUP BY player",
      [],
    ],
    [
      "incoming",
      "SELECT target player,COUNT(*) n FROM runs WHERE target IS NOT NULL AND day=? GROUP BY target",
      [day(store.now())],
    ],
    [
      "outgoing",
      "SELECT player,COUNT(*) n FROM runs WHERE target IS NOT NULL AND day=? GROUP BY player",
      [day(store.now())],
    ],
  ])
    for (const row of db.prepare(sql).all(...args)) {
      const card = cards.get(row.player);
      if (card) card[field] = row.n;
    }
  for (const [id, card] of cards) {
    for (const game of playIds) {
      const best = db
        .prepare(
          "SELECT id,score FROM runs WHERE player=? AND game=? AND status='finished' AND verified=1 AND eligible=1 AND seed IS NOT NULL AND score>0 AND version=? ORDER BY score DESC,finished ASC,id ASC LIMIT 1",
        )
        .get(id, game, game === "coast" ? 3 : 1);
      if (best)
        card.challengeScores[game] = { score: best.score, runId: best.id };
    }
  }
  return cards;
}

function assertCards(store: Store) {
  const snapshot = store.snapshot();
  assert.deepEqual(snapshot.cards, baselineCards(store));
  return snapshot;
}

test("production snapshot matches separate score and win aggregates across mixed histories", () => {
  const seen = Object.fromEntries(
    ["status", "verified", "eligible", "version", "game", "score"].map(
      (key) => [key, new Set()],
    ),
  );
  for (let seed = 1; seed <= 30; seed++) {
    const { store, insert } = fixture();
    const db = store.db,
      now = store.now();
    let randomState = seed;
    const random = (n: number) => {
      randomState ^= randomState << 13;
      randomState ^= randomState >>> 17;
      randomState ^= randomState << 5;
      return (randomState >>> 0) % n;
    };
    const choose = <T>(values: T[]) => values[random(values.length)];
    try {
      store.transaction(() => {
        for (let i = 0; i < 5; i++)
          db.prepare("INSERT INTO suspensions VALUES(?,?)").run(
            `p${i * 7}`,
            now,
          );
        for (let i = 0; i < 2000; i++) {
          const row = {
            game: choose([...gameIds, null, "future-game"]),
            score: choose([null, -1, 0, 1, 2, 99]),
            status: choose(["finished", "started", "abandoned"]),
            verified: choose([null, 0, 1]),
            eligible: choose([null, 0, 1]),
            version: choose([null, 1, 2, 3]),
          };
          for (const [key, value] of Object.entries(row)) seen[key].add(value);
          insert.run(
            `r${i}`,
            `p${random(50)}`,
            row.game,
            now - 1000,
            now,
            row.score,
            random(3) ? null : `p${random(50)}`,
            choose([null, 0, 1, 2, 99]),
            day(now - random(2) * DAY),
            row.status,
            row.verified,
            row.eligible,
            row.version,
          );
        }
        // An unverified win must not introduce a new best key; verified NULL
        // scores must remain NULL, while a player without runs stays at zero.
        insert.run(
          "unverified",
          "p50",
          "future-game",
          now,
          now,
          99,
          "p51",
          0,
          day(now),
          "finished",
          0,
          1,
          1,
        );
        insert.run(
          "nullable",
          "p51",
          "hop",
          now,
          now,
          null,
          null,
          null,
          day(now),
          "finished",
          1,
          1,
          1,
        );
        insert.run(
          "legacy",
          "p52",
          "coast",
          now,
          now,
          99,
          null,
          null,
          day(now),
          "finished",
          1,
          1,
          1,
        );
        db.prepare("INSERT INTO medals VALUES(?,?,?,?,?,?)").run(
          day(now),
          "hop",
          "p50",
          1,
          3,
          10,
        );
      });
      const { cards } = assertCards(store);
      assert.equal(cards.get("p50").wins, 1);
      assert.equal("future-game" in cards.get("p50").best, false);
      assert.equal(cards.get("p51").best.hop, null);
      assert.equal(cards.get("p52").best.coast, 0);
      assert.equal(cards.get("p52").guestBest.coast, 0);
      assert.equal(cards.get("p53").wins, 0);
    } finally {
      store.close();
    }
  }
  assert.equal(seen.status.size, 3);
  assert.equal(seen.verified.size, 3);
  assert.equal(seen.eligible.size, 3);
  assert.equal(seen.version.size, 4);
  assert.equal(seen.game.size, gameIds.length + 2);
  assert.equal(seen.score.size, 6);
});

test("aggregate cards refresh after moderation, retries, suspension and account deletion", () => {
  const { store, insert } = fixture(4);
  const community = new CommunityCore(store, {
    files: { playtests: () => [] },
  });
  const db = store.db,
    now = store.now();
  try {
    insert.run(
      "ranked",
      "p0",
      "coast",
      now,
      now,
      80,
      "p1",
      60,
      day(now),
      "finished",
      1,
      1,
      2,
    );
    insert.run(
      "guest",
      "p0",
      "hop",
      now,
      now,
      90,
      "p1",
      10,
      day(now),
      "finished",
      0,
      0,
      1,
    );
    insert.run(
      "other",
      "p2",
      "hop",
      now,
      now,
      50,
      "p0",
      20,
      day(now),
      "finished",
      1,
      1,
      1,
    );
    assertCards(store);
    for (const sql of [
      "UPDATE runs SET score=40 WHERE id='ranked'",
      "UPDATE runs SET verified=0 WHERE id='ranked'",
      "UPDATE runs SET verified=1,eligible=0 WHERE id='ranked'",
      "UPDATE runs SET eligible=1,version=1 WHERE id='ranked'",
      "UPDATE runs SET version=4,targetScore=30 WHERE id='ranked'",
      "UPDATE runs SET target=NULL WHERE id='ranked'",
      "UPDATE runs SET status='abandoned' WHERE id='ranked'",
      "DELETE FROM runs WHERE id='ranked'",
    ]) {
      db.exec(sql);
      assertCards(store);
    }
    const run = store.begin("p0", "noodle");
    store.finish("p0", run.id, 100);
    const completed = assertCards(store);
    assert.equal(store.finish("p0", run.id, 999).score, 100);
    assert.equal(assertCards(store), completed);
    db.prepare("INSERT INTO suspensions VALUES(?,?)").run("p0", now);
    assert.equal(assertCards(store).cards.has("p0"), false);
    db.prepare("DELETE FROM suspensions WHERE player=?").run("p0");
    assert.equal(assertCards(store).cards.has("p0"), true);
    community.delete("p0");
    assert.equal(assertCards(store).cards.has("p0"), false);
    assert.equal(store.snapshot().cards.get("p2").wins, 0);
  } finally {
    store.close();
  }
});

test("aggregate merge preserves 30-second expiry, Singapore midnight and settlement", () => {
  const { store, insert, tick } = fixture(2);
  const db = store.db,
    now = store.now();
  try {
    insert.run(
      "run",
      "p0",
      "hop",
      now,
      now,
      20,
      "p1",
      10,
      day(now),
      "finished",
      1,
      1,
      1,
    );
    const first = assertCards(store);
    // These edits are deliberately outside the existing revision trigger.
    db.exec("UPDATE runs SET game='noodle',player='p1' WHERE id='run'");
    tick(29999);
    assert.equal(store.snapshot(), first);
    tick(1);
    const expired = assertCards(store);
    assert.notEqual(expired, first);
    assert.equal(expired.cards.get("p0").best.hop, 0);
    assert.equal(expired.cards.get("p1").best.noodle, 20);
    tick(12 * 3600000 - 30000);
    const nextDay = assertCards(store);
    assert.equal(nextDay.day, "2026-10-05");
    assert.equal(nextDay.cards.get("p1").points, 3);
    assert.equal(nextDay.cards.get("p1").incoming, 0);
    assert.equal(nextDay.cards.get("p1").outgoing, 0);
    assert.equal(nextDay.boards.noodle.length, 0);
    assert.equal(assertCards(store), nextDay);
  } finally {
    store.close();
  }
});
