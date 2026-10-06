import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store, day } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import { styleTokens } from "../src/collections.ts";
import {
  Simulation,
  rulesVersion,
  type Replay,
  type Input,
} from "../shared/simulation.ts";
const DAY = 86400000;
function fixture() {
  let now = Date.parse("2026-10-04T23:59:00+08:00");
  const directory = mkdtempSync(join(tmpdir(), "simi-awards-"));
  const store = new Store(join(directory, "test.sqlite"), () => now);
  const community = new Community(store, { directory });
  function player(name: string) {
    const p = community.join({
      month: 1,
      year: 2000,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    }).me;
    store.db
      .prepare("INSERT INTO accounts VALUES(?,?,?)")
      .run(p.id, `${name}@example.test`, now - 2 * DAY);
    store.db.prepare("UPDATE players SET name=? WHERE id=?").run(name, p.id);
    return p.id;
  }
  function score(
    player: string,
    game: string,
    value: number,
    finished = now,
    run = `${player}-${game}-${finished}`,
  ) {
    store.db
      .prepare(
        "INSERT INTO runs(id,player,game,started,finished,score,day,status,verified,eligible,seed,version) VALUES(?,?,?,?,?,?,?,'finished',1,1,123,1)",
      )
      .run(run, player, game, finished - 1000, finished, value, day(finished));
    return run;
  }
  return {
    directory,
    store,
    community,
    player,
    score,
    tick: (ms: number) => (now += ms),
    now: () => now,
    close: () => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
test("midnight awards tied medals, caps medal tokens separately from XP and settles once across restart", () => {
  const s = fixture();
  try {
    const a = s.player("Alpha"),
      b = s.player("Beta"),
      c = s.player("Gamma");
    const p = s.community.privateProfile(a).progress;
    p.xp = 250;
    s.community.save(a, p);
    s.score(a, "noodle", 100);
    s.score(b, "noodle", 100);
    s.score(c, "noodle", 50);
    s.score(a, "hop", 90);
    s.score(a, "brick", 50);
    s.store.settle();
    assert.equal(s.community.privateProfile(a).progress.medalTokens, 0);
    s.tick(60000);
    s.store.settle();
    assert.deepEqual(
      s.store.db
        .prepare(
          "SELECT rank FROM medals WHERE game='noodle' ORDER BY score DESC,player",
        )
        .all()
        .map((r) => r.rank),
      [1, 1, 3],
    );
    assert.equal(s.community.privateProfile(a).progress.medalTokens, 3);
    assert.equal(s.community.privateProfile(b).progress.medalTokens, 3);
    assert.equal(s.community.privateProfile(c).progress.medalTokens, 1);
    assert.equal(styleTokens(s.community.privateProfile(a).progress), 5);
    const restarted = new Community(s.store, { directory: s.directory });
    s.store.settledThrough = null;
    s.store.settle();
    assert.equal(restarted.privateProfile(a).progress.medalTokens, 3);
    s.score(a, "hop", 100);
    s.tick(2 * DAY);
    s.store.settle();
    assert.equal(restarted.privateProfile(a).progress.medalTokens, 6);
    assert.equal(restarted.privateProfile(a).progress.xp, 250);
  } finally {
    s.close();
  }
});
test("cutover skips unsettled history, preserves old balances and grandfathered looks", () => {
  const s = fixture();
  try {
    const a = s.player("Legacy");
    const p = s.community.privateProfile(a).progress;
    p.xp = 1200;
    p.wardrobeUnlocked = ["solar"];
    p.wardrobeSpent = 12;
    s.community.save(a, p);
    s.store.db
      .prepare("UPDATE players SET created=? WHERE id=?")
      .run(s.now() - 2 * DAY, a);
    s.score(a, "noodle", 20, s.now() - DAY);
    s.store.db
      .prepare("INSERT INTO medals VALUES(?,?,?,?,?,?)")
      .run(day(s.now() - 2 * DAY), "hop", a, 1, 3, 40);
    s.store.db.prepare("DELETE FROM rules WHERE key='medal_tokens_from'").run();
    const migrated = new Community(s.store, { directory: s.directory });
    s.store.settle();
    const q = migrated.privateProfile(a).progress;
    assert.equal(q.medalTokens, 0);
    assert.equal(styleTokens(q), 0);
    assert.equal(q.wardrobeSpent, 12);
    assert.ok(
      q.wardrobePurchased.includes("discovery") &&
        q.wardrobePurchased.includes("mastery"),
    );
    assert.equal(
      s.store.db.prepare("SELECT COUNT(*) n FROM medals").get().n,
      2,
    );
  } finally {
    s.close();
  }
});
test("settlement and reward queue roll back together", () => {
  const s = fixture();
  try {
    const a = s.player("Rollback");
    s.score(a, "noodle", 10);
    s.tick(60000);
    const hook = s.store.onSettleDay;
    s.store.onSettleDay = (date: string) => {
      hook(date);
      throw Error("simulated crash");
    };
    assert.throws(() => s.store.settle(), /simulated crash/);
    for (const table of [
      "medals",
      "medal_rewards",
      "settled",
      "medal_email_outbox",
    ])
      assert.equal(
        s.store.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,
        0,
      );
    s.store.onSettleDay = hook;
    s.store.settle();
    assert.equal(s.community.privateProfile(a).progress.medalTokens, 3);
  } finally {
    s.close();
  }
});
test("tokens alone buy starter and legendary looks, and browser patches cannot mint rewards", () => {
  const s = fixture();
  try {
    const a = s.player("Buyer"),
      p = s.community.privateProfile(a).progress;
    p.xp = 1300;
    s.community.save(a, p);
    s.community.patch(a, { medalTokens: 99999, wardrobeSpent: -100 });
    const q = s.community.progression(a, "redeem-style", "discovery").progress;
    assert.equal(styleTokens(q), 12);
    const r = s.community.progression(a, "redeem-style", "solar").progress;
    assert.equal(styleTokens(r), 0);
    assert.equal(r.rounds, 0);
    assert.equal(
      s.community.progression(a, "redeem-style", "solar").progress
        .wardrobeSpent,
      13,
    );
    assert.equal(s.community.patch(a, { clothing: 8 }).progress.clothing, 8);
  } finally {
    s.close();
  }
});
test("daily emails require verified address and opt-in; consolidate awards and recover without duplicated sends", async () => {
  const s = fixture();
  try {
    const a = s.player("Optin"),
      b = s.player("Silent");
    assert.equal(s.community.privateProfile(a).notifications.medalEmail, false);
    s.community.patch(a, { medalEmail: true });
    s.score(a, "noodle", 10);
    s.score(a, "hop", 30);
    s.score(b, "noodle", 5);
    s.tick(60000);
    s.store.settle();
    assert.equal(
      s.store.db.prepare("SELECT COUNT(*) n FROM medal_email_outbox").get().n,
      1,
    );
    const accepted = new Map<string, string>();
    let attempts = 0;
    s.community.sendEmail = async (
      email: string,
      subject: string,
      text: string,
      _id: string,
      _meta: unknown,
      key: string,
    ) => {
      attempts++;
      const payload = JSON.stringify({ email, subject, text });
      if (accepted.has(key)) assert.equal(accepted.get(key), payload);
      accepted.set(key, payload);
      assert.match(text, /Gold · Noodle Run/);
      assert.match(text, /Gold · Hop Hop/);
      assert.match(text, /\+3 Style tokens/);
      if (attempts === 1) throw Error("accepted but response lost");
    };
    await Promise.all([
      s.community.medalRewards.deliver(),
      s.community.medalRewards.deliver(),
    ]);
    assert.equal(attempts, 1);
    assert.equal(accepted.size, 1);
    s.tick(60000);
    await s.community.medalRewards.deliver();
    assert.equal(attempts, 2);
    assert.equal(accepted.size, 1);
    await s.community.medalRewards.deliver();
    assert.equal(attempts, 2);
    assert.equal(s.community.privateProfile(a).progress.medalTokens, 3);
    assert.equal(
      s.store.db.prepare("SELECT status FROM medal_email_outbox").get().status,
      "sent",
    );
  } finally {
    s.close();
  }
});
test("email leases recover after restart; opt-outs, deleted profiles and old uncertain sends never resend", async () => {
  const s = fixture();
  try {
    const a = s.player("Lease");
    s.community.patch(a, { medalEmail: true });
    s.score(a, "noodle", 20);
    s.tick(60000);
    s.store.settle();
    s.store.db
      .prepare(
        "UPDATE medal_email_outbox SET status='sending',first_attempt=?,next_attempt=?,lease='crashed'",
      )
      .run(s.now(), s.now() + 60000);
    const c = new Community(s.store, { directory: s.directory });
    let attempts = 0;
    c.sendEmail = async () => {
      attempts++;
      throw Error("provider down");
    };
    s.tick(60000);
    await c.medalRewards.deliver();
    assert.equal(attempts, 1);
    s.tick(23 * 3600000);
    await c.medalRewards.deliver();
    assert.equal(attempts, 1);
    assert.equal(
      s.store.db.prepare("SELECT status FROM medal_email_outbox").get().status,
      "needs_review",
    );
    c.patch(a, { medalEmail: false });
    assert.equal(
      s.store.db.prepare("SELECT status FROM medal_email_outbox").get().status,
      "cancelled",
    );
    c.delete(a);
    for (const table of [
      "medal_rewards",
      "medal_email_outbox",
      "notification_preferences",
    ])
      assert.equal(
        s.store.db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,
        0,
      );
    const guest = c.join({
      month: 1,
      year: 2000,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    }).me.id;
    assert.throws(() => c.patch(guest, { medalEmail: true }), /Verify/);
  } finally {
    s.close();
  }
});
test("opt-out before delivery cancels durable job but preserves tokens", async () => {
  const s = fixture();
  try {
    const a = s.player("Cancel");
    s.community.patch(a, { medalEmail: true });
    s.score(a, "noodle", 20);
    s.tick(60000);
    s.store.settle();
    s.community.patch(a, { medalEmail: false });
    s.community.sendEmail = async () => assert.fail("must not send");
    await s.community.medalRewards.deliver();
    assert.equal(s.community.privateProfile(a).progress.medalTokens, 3);
  } finally {
    s.close();
  }
});
test("profile erasure removes delivered local medal mail and anonymises frozen targets", async () => {
  const s = fixture();
  try {
    const a = s.player("Erase"),
      b = s.player("Keep");
    s.community.patch(a, { medalEmail: true });
    const target = s.score(a, "hop", 20);
    const challenge = s.community.begin(b, "hop", a, null, target);
    s.tick(60000);
    s.store.settle();
    await s.community.medalRewards.deliver();
    const path = join(
      s.directory,
      "mail-outbox",
      `medals-${day(s.now() - 60000)}-${a}.json`,
    );
    assert.ok(
      existsSync(path),
      "test transport wrote the actual award message",
    );
    s.community.delete(a);
    assert.equal(existsSync(path), false);
    assert.deepEqual(
      {
        ...s.store.db
          .prepare(
            "SELECT target,target_run,dare,targetScore FROM runs WHERE id=?",
          )
          .get(challenge.id),
      },
      { target: null, target_run: null, dare: null, targetScore: 0 },
    );
    assert.equal(
      s.store.db
        .prepare("SELECT COUNT(*) n FROM medal_email_outbox WHERE player=?")
        .get(a).n,
      0,
    );
    // Missing test-outbox files also must not block deletion.
    s.community.patch(b, { medalEmail: true });
    s.score(b, "noodle", 10);
    s.tick(DAY);
    s.store.settle();
    assert.doesNotThrow(() => s.community.delete(b));
  } finally {
    s.close();
  }
});
test("friend scores outside rankings remain accessible and board challenges freeze the displayed run", () => {
  const s = fixture();
  try {
    const a = s.player("Challenger"),
      b = s.player("Hidden Friend");
    s.score(b, "hop", 200, s.now() - DAY, "old-best");
    const shown = s.score(b, "hop", 10, s.now(), "shown-today");
    for (let i = 0; i < 55; i++) {
      const id = s.player(`Leader ${i}`);
      s.score(id, "hop", 30 + i);
    }
    const state = s.community.state(a);
    assert.ok(!state.boards.hop.some((p) => p.id === b));
    const friends = s.community.saveFriend(a, "Hidden Friend");
    assert.equal(friends[0].id, b);
    assert.equal(friends[0].best.hop, 200);
    const r = s.community.begin(a, "hop", b, null, shown);
    assert.equal(r.targetScore, 10);
    assert.equal(r.seed, 123);
    s.score(b, "hop", 300, s.now() + 1, "new-best");
    assert.equal(
      s.store.db.prepare("SELECT targetScore FROM runs WHERE id=?").get(r.id)
        .targetScore,
      10,
    );
    s.store.abandon(a, r.id);
    s.tick(DAY);
    assert.throws(
      () => s.community.begin(a, "hop", b, null, shown),
      /already played/,
    );
    assert.throws(
      () => s.community.begin(a, "noodle", b, null, shown),
      /no validated score/,
    );
    s.community.moderate(a, b, "block");
    assert.equal(s.community.friends(a).length, 0);
    assert.throws(() => s.community.begin(a, "hop", b), /unavailable/);
  } finally {
    s.close();
  }
});
test("legacy challenge attempts retain source-score replay protection across migration and midnight", () => {
  const s = fixture();
  try {
    const host = s.player("Legacy Host"),
      a = s.player("Past Challenger"),
      b = s.player("New Challenger");
    const source = s.score(host, "hop", 100);
    s.store.db
      .prepare("INSERT INTO dares VALUES(?,?,?,?,?,?,?,?)")
      .run(
        "legacy-dare",
        host,
        source,
        "hop",
        123,
        100,
        s.now() - 3600000,
        s.now() + DAY,
      );
    s.store.db
      .prepare(
        "INSERT INTO runs(id,player,game,started,day,status,target,targetScore,dare) VALUES(?,?,?,?,?,'abandoned',?,?,?)",
      )
      .run(
        "old-attempt",
        a,
        "hop",
        s.now() - 1800000,
        day(s.now()),
        host,
        100,
        "legacy-dare",
      );
    s.store.db
      .prepare("DELETE FROM rules WHERE key='saved_score_targets_v1'")
      .run();
    const c = new Community(s.store, { directory: s.directory });
    assert.equal(
      s.store.db
        .prepare("SELECT target_run FROM runs WHERE id='old-attempt'")
        .get().target_run,
      source,
    );
    s.tick(60000);
    assert.throws(
      () => c.begin(a, "hop", host, null, source),
      /already played/,
    );
    assert.throws(
      () => c.begin(a, "hop", host, "legacy-dare"),
      /already played/,
    );
    const r = c.begin(b, "hop", host, "legacy-dare");
    assert.equal(
      s.store.db.prepare("SELECT target_run FROM runs WHERE id=?").get(r.id)
        .target_run,
      source,
    );
    s.store.abandon(b, r.id);
    s.tick(DAY);
    assert.throws(
      () => c.begin(b, "hop", host, null, source),
      /already played/,
    );
  } finally {
    s.close();
  }
});
test("XP reward notices accumulate once, survive restart and roll back with progression", () => {
  const s = fixture();
  try {
    const a = s.player("Notice"),
      p = s.community.privateProfile(a).progress;
    p.xp = 90;
    s.community.save(a, p);
    p.xp = 305;
    s.community.save(a, p);
    s.community.save(a, p);
    const restarted = new Community(s.store, { directory: s.directory });
    assert.equal(restarted.privateProfile(a).styleRewards, 3);
    assert.deepEqual(restarted.takeStyleRewards(a), { tokens: 3 });
    assert.deepEqual(restarted.takeStyleRewards(a), { tokens: 0 });
    assert.equal(
      new Community(s.store, { directory: s.directory }).privateProfile(a)
        .styleRewards,
      0,
    );
    p.xp = 499;
    restarted.save(a, p);
    assert.throws(
      () =>
        s.store.transaction(() => {
          restarted.save(a, { ...p, xp: 700 });
          throw Error("roll back");
        }),
      /roll back/,
    );
    assert.equal(restarted.privateProfile(a).progress.xp, 499);
    assert.equal(restarted.export(a).styleRewardNotice.tokens, 1);
    restarted.delete(a);
    assert.equal(
      s.store.db.prepare("SELECT COUNT(*) n FROM style_reward_notices").get().n,
      0,
    );
  } finally {
    s.close();
  }
});
test("committed XP token counts are accurate and finish retries carry no repeat notification", () => {
  const s = fixture();
  try {
    const a = s.player("Leveler"),
      p = s.community.privateProfile(a).progress;
    p.xp = 290;
    s.community.save(a, p);
    const reward = s.community.progression(a, "gift", 0);
    assert.equal(reward.xpTokens, 1);
    const q = reward.progress;
    q.xp = 199;
    q.welcome = "new";
    q.rounds = 0;
    s.community.save(a, q);
    const r = s.community.begin(a, "hop"),
      sim = new Simulation("hop", r.seed),
      events: Replay["events"] = [];
    let previous = "";
    while (!sim.ended) {
      const input: Input = [0, 0, -1, sim.ticks % 60 === 0 ? 1 : 0, -1, -1],
        stamp = JSON.stringify(input);
      if (stamp !== previous) {
        events.push([sim.ticks, ...input]);
        previous = stamp;
      }
      sim.advance(input);
    }
    s.tick(61000);
    const result = {
      id: r.id,
      score: sim.score,
      replay: { version: rulesVersion("hop"), ticks: sim.ticks, events },
    };
    const first = s.community.finish(a, result);
    assert.equal(first.xpTokens, 1);
    assert.equal(s.community.finish(a, result).xpTokens, undefined);
    const multi = s.community.privateProfile(a).progress;
    multi.xp = 390;
    multi.coins = ["coin0", "coin1", "coin2", "coin3"];
    s.community.save(a, multi);
    assert.equal(s.community.progression(a, "coin", "coin4").xpTokens, 1);
    assert.throws(
      () => s.community.finish(a, { ...result, score: result.score + 1 }),
      /different result/,
    );
  } finally {
    s.close();
  }
});
