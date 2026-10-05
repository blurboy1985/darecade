import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, day } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import { Seasons } from "../server/seasons.mjs";
import { styleTokens } from "../src/collections.ts";
import {
  Simulation,
  rulesVersion,
  type Input,
  type Replay,
} from "../shared/simulation.ts";

const start = Date.parse("2026-10-05T00:00:00+08:00");
const schedule = JSON.stringify([
  {
    id: "opening",
    name: "Opening season",
    startsAt: "2026-10-05T00:00:00+08:00",
  },
]);
const next = JSON.stringify([
  {
    id: "second",
    name: "Second season",
    startsAt: "2026-10-12T00:00:00+08:00",
  },
]);
function fixture() {
  let now = start - 60000;
  const directory = mkdtempSync(join(tmpdir(), "simi-seasons-"));
  const store = new Store(join(directory, "test.sqlite"), () => now);
  const community = new Community(store, {
    directory,
    competitionSeasons: schedule,
    seasonView: true,
  });
  const player = (name: string) => {
    const joined = community.join({
      month: 1,
      year: 2000,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    });
    store.db
      .prepare("INSERT INTO accounts VALUES(?,?,?)")
      .run(joined.me.id, `${name}@example.test`, now - 172800000);
    community.patch(joined.me.id, { name });
    return joined;
  };
  const score = (id: string, value: number, finished: number, game = "hop") => {
    const run = `${id}-${game}-${finished}`;
    store.db
      .prepare(
        "INSERT INTO runs(id,player,game,started,finished,score,day,status,verified,eligible,seed,version) VALUES(?,?,?,?,?,?,?,'finished',1,1,123,?)",
      )
      .run(
        run,
        id,
        game,
        finished - 1000,
        finished,
        value,
        day(finished),
        rulesVersion(game),
      );
    return run;
  };
  return {
    directory,
    store,
    community,
    player,
    score,
    set: (t: number) => (now = t),
    close: () => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
function play(seed: number) {
  const sim = new Simulation("hop", seed),
    events: Replay["events"] = [];
  let prior = "";
  while (!sim.ended) {
    const input: Input = [0, 0, -1, sim.ticks % 60 === 0 ? 1 : 0, -1, -1];
    const stamp = JSON.stringify(input);
    if (stamp !== prior) {
      events.push([sim.ticks, ...input]);
      prior = stamp;
    }
    sim.advance(input);
  }
  return {
    score: sim.score,
    replay: { version: rulesVersion("hop"), ticks: sim.ticks, events },
  };
}

test("registering a future season preserves existing identity, progression, runs and reward ledgers", () => {
  const s = fixture();
  try {
    const a = s.player("Alpha"),
      id = a.me.id;
    const p = s.community.privateProfile(id).progress;
    p.xp = 250;
    p.wardrobeSpent = 1;
    p.wardrobeUnlocked = ["discovery"];
    p.wardrobePurchased = ["solar"];
    p.rounds = 3;
    p.visited = ["arcade"];
    s.community.save(id, p);
    s.score(id, 100, start - 30000);
    s.store.db
      .prepare("INSERT INTO medals VALUES(?,?,?,?,?,?)")
      .run("2026-10-03", "hop", id, 1, 3, 100);
    s.store.db
      .prepare("INSERT INTO medal_rewards VALUES(?,?,?)")
      .run("2026-10-03", id, 3);
    s.store.db
      .prepare(
        "INSERT INTO payment_orders(id,player,product,kind,price_id,amount,currency,status,created) VALUES(?,?,'solar','set','price_fixture',199,'sgd','paid',?)",
      )
      .run("paid-fixture", id, start - 1000);
    const tables = [
      "players",
      "profiles",
      "accounts",
      "sessions",
      "runs",
      "medals",
      "medal_rewards",
      "payment_orders",
      "settled",
      "style_reward_notices",
    ];
    const before = tables.map((t) =>
      s.store.db.prepare(`SELECT * FROM ${t}`).all(),
    );
    new Seasons(s.store, next, false);
    assert.deepEqual(
      tables.map((t) => s.store.db.prepare(`SELECT * FROM ${t}`).all()),
      before,
    );
    s.set(start);
    const state = s.community.state(id);
    assert.equal(state.season.xp, 0);
    assert.equal(state.season.points, 0);
    assert.equal(state.season.rank, null);
    assert.deepEqual(state.season.standings, []);
    assert.equal(state.profile.progress.xp, 250);
    // Sunday still awards three normal tokens at midnight, in addition to history.
    assert.equal(styleTokens(state.profile.progress), 7);
    assert.equal(state.self.best.hop, 100);
    assert.ok(state.profile.progress.wardrobePurchased.includes("solar"));
    assert.equal(s.community.lookup(a.token), id);
    assert.equal(s.store.db.prepare("SELECT COUNT(*) n FROM runs").get().n, 1);
    assert.equal(s.community.export(id).rounds.length, 1);
  } finally {
    s.close();
  }
});

test("schedule registration is future-only, immutable, append-only and survives removal from configuration", () => {
  const s = fixture();
  try {
    for (const invalid of [
      '[{"id":"past","name":"Past","startsAt":"2026-09-28T00:00:00+08:00"}]',
      '[{"id":"tuesday","name":"Bad","startsAt":"2026-10-06T00:00:00+08:00"}]',
      schedule.replace("00:00:00", "01:00:00"),
      schedule.replace("Opening season", "Changed"),
      schedule.replace("2026-10-05", "2026-10-12"),
      JSON.stringify([JSON.parse(schedule)[0], JSON.parse(schedule)[0]]),
    ])
      assert.throws(() => new Seasons(s.store, invalid, true));
    const second = new Seasons(s.store, next, true);
    assert.equal(second.periods.length, 2);
    s.set(start + 7 * 86400000);
    const restarted = new Seasons(s.store, "[]", false);
    assert.equal(restarted.current().id, "second");
    assert.equal(restarted.end(restarted.periods[0]), start + 7 * 86400000);
    assert.equal(restarted.profile("nobody"), null);
    assert.equal(
      s.store.db.prepare("SELECT COUNT(*) n FROM competition_seasons").get().n,
      2,
    );
  } finally {
    s.close();
  }
});

test("season XP counts trusted deltas once while lifetime token thresholds and ownership stay intact", () => {
  const s = fixture();
  try {
    const id = s.player("Alpha").me.id;
    const p = s.community.privateProfile(id).progress;
    p.xp = 250;
    p.rounds = 4;
    s.community.save(id, p);
    s.set(start);
    s.community.progression(id, "gift", 0);
    s.community.progression(id, "visit", "garden");
    s.community.progression(id, "visit", "plots");
    s.community.progression(id, "visit", "stage");
    let profile = s.community.privateProfile(id);
    assert.equal(profile.progress.xp, 310);
    assert.equal(profile.season.xp, 60);
    assert.equal(styleTokens(profile.progress), 3);
    s.community.progression(id, "visit", "stage");
    assert.throws(() => s.community.progression(id, "gift", 0));
    s.community.patch(id, {
      xp: 99999,
      season: { xp: 99999 },
      seasonalXp: 99999,
    });
    profile = s.community.privateProfile(id);
    assert.equal(profile.progress.xp, 310);
    assert.equal(profile.season.xp, 60);
    s.community.progression(id, "cat");
    s.community.progression(id, "visit", "shop");
    s.community.progression(id, "visit", "board");
    s.community.progression(id, "visit", "fishing");
    assert.equal(s.community.privateProfile(id).season.xp, 105);
    assert.equal(styleTokens(s.community.privateProfile(id).progress), 3);
    assert.equal(
      s.store.db
        .prepare(
          "SELECT SUM(tokens) n FROM style_reward_notices WHERE player=?",
        )
        .get(id).n,
      3,
    );
  } finally {
    s.close();
  }
});

test("season targets reject old run IDs and dares across all paths but preserve frozen in-flight challenges", () => {
  const s = fixture();
  try {
    const host = s.player("Host").me.id,
      challenger = s.player("Challenger").me.id;
    const old = s.score(host, 500, start - 40000);
    s.community.saveFriend(challenger, "Host");
    const challenge = s.community.begin(challenger, "hop", host, null, old);
    const result = play(challenge.seed);
    s.store.db
      .prepare("INSERT INTO dares VALUES(?,?,?,?,?,?,?,?)")
      .run(
        "posted",
        host,
        old,
        "hop",
        123,
        500,
        start - 40000,
        start + 86400000,
      );
    const cached = s.store.snapshot();
    s.set(start);
    assert.notEqual(s.store.snapshot(), cached);
    assert.deepEqual(
      s.community.state(challenger).friends[0].challengeScores,
      {},
    );
    assert.deepEqual(s.community.state(challenger).dares, []);
    assert.throws(
      () => s.community.begin(challenger, "hop", host, null, old),
      /no validated score/,
    );
    assert.throws(
      () => s.community.begin(challenger, "hop", host),
      /no validated score/,
    );
    assert.throws(
      () => s.community.begin(challenger, "hop", null, "posted"),
      /closed/,
    );
    const frozen = s.store.db
      .prepare("SELECT * FROM runs WHERE id=?")
      .get(challenge.id);
    assert.equal(frozen.target_run, old);
    assert.equal(frozen.targetScore, 500);
    s.set(start + 61000);
    const first = s.community.finish(challenger, {
      id: challenge.id,
      ...result,
    });
    const retry = s.community.finish(challenger, {
      id: challenge.id,
      ...result,
    });
    assert.equal(first.profile.progress.xp, retry.profile.progress.xp);
    assert.equal(first.profile.season.xp, 55);
    assert.equal(retry.profile.season.xp, 55);
    assert.equal(
      s.store.db
        .prepare("SELECT target_run FROM runs WHERE id=?")
        .get(challenge.id).target_run,
      old,
    );
    assert.ok(
      s.community.state(challenger).history.some((r) => r.id === challenge.id),
    );
    const fresh = s.score(host, 40, start + 62000);
    assert.equal(
      s.community.state(challenger).friends[0].challengeScores.hop.runId,
      fresh,
    );
    assert.equal(
      s.community.begin(challenger, "hop", host, null, fresh).targetScore,
      40,
    );
  } finally {
    s.close();
  }
});

test("Sunday settles into the old week; tied season medals, token caps and delayed historical settlement remain consistent", () => {
  const s = fixture();
  try {
    const a = s.player("Alpha").me.id,
      b = s.player("Beta").me.id,
      c = s.player("Gamma").me.id;
    s.score(a, 90, start - 30000);
    s.set(start);
    let state = s.community.state(a);
    assert.equal(state.lastWeek[0].points, 3);
    assert.equal(state.weekly.length, 0);
    assert.equal(state.self.points, 3);
    assert.equal(state.season.points, 0);
    assert.equal(state.profile.progress.medalTokens, 3);
    for (const game of ["hop", "noodle", "brick", "swarm", "coast"]) {
      s.score(a, 100, start + 1000, game);
      s.score(b, 100, start + 1000, game);
      s.score(c, 50, start + 1000, game);
    }
    s.set(start + 86400000);
    state = s.community.state(a);
    assert.deepEqual(
      state.season.standings.map((p) => p.rank),
      [1, 1, 3],
    );
    assert.equal(state.season.points, 15);
    assert.equal(state.weekly[0].points, 15);
    assert.equal(state.profile.progress.medalTokens, 6);
    assert.equal(s.community.privateProfile(b).progress.medalTokens, 3);
    const ledgers = s.store.db
      .prepare("SELECT * FROM medal_rewards ORDER BY day,player")
      .all();
    s.store.settledThrough = null;
    s.store.settle();
    assert.deepEqual(
      s.store.db
        .prepare("SELECT * FROM medal_rewards ORDER BY day,player")
        .all(),
      ledgers,
    );
    state.season.standings[0].points = 999;
    assert.equal(s.community.state(a).season.points, 15);
  } finally {
    s.close();
  }
});

test("season transitions archive earlier totals and display rollback keeps offline invite XP tracking", () => {
  const s = fixture();
  try {
    const host = s.player("Host").me.id,
      guest = s.player("Guest").me.id;
    s.community.seasons = new Seasons(s.store, next, true);
    s.set(start);
    s.store.db
      .prepare("INSERT INTO invite_joins VALUES(?,?,?,0)")
      .run(guest, host, start);
    const progress = s.community.privateProfile(guest).progress;
    s.store.transaction(() => {
      s.community.payInvite(guest, progress);
      s.community.save(guest, progress);
    });
    assert.equal(s.community.privateProfile(host).season.xp, 30);
    s.community.seasons.show = false;
    assert.equal(s.community.privateProfile(host).season, null);
    s.community.progression(host, "visit", "garden");
    s.community.seasons.show = true;
    assert.equal(s.community.privateProfile(host).season.xp, 40);
    s.set(start + 7 * 86400000);
    const current = s.community.state(host);
    assert.equal(current.season.id, "second");
    assert.equal(current.season.xp, 0);
    assert.equal(current.seasonHistory[0].id, "opening");
    assert.equal(current.seasonHistory[0].xp, 40);
    s.community.progression(host, "visit", "plots");
    assert.equal(s.community.privateProfile(host).season.xp, 10);
    const hidden = new Community(s.store, {
      directory: s.directory,
      seasonView: false,
    });
    assert.equal(hidden.state(host).season, null);
    hidden.progression(host, "visit", "stage");
    const restored = new Community(s.store, {
      directory: s.directory,
      seasonView: true,
    });
    assert.equal(restored.privateProfile(host).season.xp, 20);
    assert.equal(restored.export(host).seasons[0].xp, 40);
    restored.delete(guest);
    assert.equal(
      s.store.db
        .prepare("SELECT COUNT(*) n FROM season_xp WHERE player=?")
        .get(guest).n,
      0,
    );
    assert.equal(restored.privateProfile(host).season.xp, 20);
  } finally {
    s.close();
  }
});

test("XP, season counters and notices roll back together on failure", () => {
  const s = fixture();
  try {
    const id = s.player("Alpha").me.id;
    s.set(start);
    s.store.db.exec(
      "CREATE TRIGGER fail_progress BEFORE UPDATE ON profiles BEGIN SELECT RAISE(ABORT,'synthetic crash'); END;",
    );
    assert.throws(
      () => s.community.progression(id, "gift", 0),
      /synthetic crash/,
    );
    assert.equal(s.community.privateProfile(id).progress.xp, 0);
    assert.equal(s.community.privateProfile(id).season.xp, 0);
    s.store.db.exec("DROP TRIGGER fail_progress");
    s.community.progression(id, "gift", 0);
    assert.equal(s.community.privateProfile(id).season.xp, 30);
  } finally {
    s.close();
  }
});

test("one operation timestamp keeps targets, results and invite XP on the same side of midnight", () => {
  const s = fixture();
  try {
    const host = s.player("Host").me.id,
      guest = s.player("Guest").me.id;
    const old = s.score(host, 500, start - 30000);
    let samples = 0;
    const crossing = () => (samples++ === 0 ? start - 1 : start + 1);
    s.store.now = crossing;
    s.community.now = crossing;
    const challenge = s.community.begin(guest, "hop", host, null, old);
    assert.equal(
      s.store.db
        .prepare("SELECT started FROM runs WHERE id=?")
        .get(challenge.id).started,
      start - 1,
    );
    assert.throws(() => s.community.begin(host, "hop", guest, null, old));
    s.store.db
      .prepare("UPDATE runs SET started=? WHERE id=?")
      .run(start - 61001, challenge.id);
    s.store.db
      .prepare("INSERT INTO invite_joins VALUES(?,?,?,0)")
      .run(guest, host, start - 1000);
    const replay = play(challenge.seed);
    samples = 0;
    s.community.finish(guest, { id: challenge.id, ...replay });
    assert.equal(
      s.store.db
        .prepare("SELECT finished FROM runs WHERE id=?")
        .get(challenge.id).finished,
      start - 1,
    );
    assert.equal(s.community.privateProfile(guest).season.xp, 0);
    assert.equal(s.community.privateProfile(host).season.xp, 0);
    assert.equal(s.community.privateProfile(host).progress.xp, 30);
    assert.equal(s.community.privateProfile(guest).progress.xp, 85);
  } finally {
    s.close();
  }
});

test("mission, weekly hunt, stage and garden deltas share lifetime claim and reward limits", () => {
  const s = fixture();
  try {
    const id = s.player("Alpha").me.id;
    s.set(start);
    s.community.progression(id, "cat");
    s.community.progression(id, "claim", "cat");
    for (let n = 0; n < 5; n++) s.community.progression(id, "coin", `coin${n}`);
    s.community.progression(id, "perform", { score: 100, stars: 3 });
    s.community.progression(id, "plant", "chilli");
    s.set(start + 3600001);
    s.community.progression(id, "harvest");
    const p = s.community.privateProfile(id);
    assert.equal(p.progress.xp, 165);
    assert.equal(p.season.xp, 165);
    assert.equal(styleTokens(p.progress), 1);
    assert.throws(() => s.community.progression(id, "claim", "cat"));
    assert.throws(() => s.community.progression(id, "harvest"));
    s.community.progression(id, "coin", "coin0");
    assert.equal(s.community.privateProfile(id).season.xp, 165);
  } finally {
    s.close();
  }
});
