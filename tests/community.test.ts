import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  mkdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import {
  Simulation,
  replayRun,
  rulesVersion,
  type Input,
  type Replay,
} from "../shared/simulation.ts";
const DAY = 86400000;
const consent = {
  month: 1,
  year: 2000,
  consent: true,
  privacyVersion: PRIVACY_VERSION,
};
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "darecade-community-"));
  let time = Date.parse("2026-10-03T00:00:00+08:00");
  const store = new Store(":memory:", () => time),
    community = new Community(store, { directory });
  return {
    store,
    community,
    directory,
    tick: (ms: number) => (time += ms),
    setTime: (t: number) => (time = t),
    close: () => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
function play(game: string, seed: number): { score: number; replay: Replay } {
  const sim = new Simulation(game, seed),
    events: Replay["events"] = [];
  let previous = "";
  while (!sim.ended) {
    const input: Input = [0, 0, -1, 0, -1, -1];
    if (game === "hop" && sim.ticks % 60 === 0) input[3] = 1;
    if (game === "brick") input[4] = Math.round(sim.ball.x);
    if (game === "swarm") input[0] = Math.floor(sim.ticks / 120) % 2 ? 1 : -1;
    const stamp = JSON.stringify(input);
    if (stamp !== previous) {
      events.push([sim.ticks, ...input]);
      previous = stamp;
    }
    sim.advance(input);
  }
  return {
    score: sim.score,
    replay: { version: rulesVersion(game), ticks: sim.ticks, events },
  };
}
/** The code most recently "emailed" to an address in the local test outbox. */
function emailedCode(directory: string, email: string): string {
  return readdirSync(join(directory, "mail-outbox"))
    .map((n) =>
      JSON.parse(readFileSync(join(directory, "mail-outbox", n), "utf8")),
    )
    .find((m) => m.to === email && m.code).code;
}
const wrong = (code: string) => (code === "000000" ? "000001" : "000000");
async function register(s: ReturnType<typeof setup>, email: string) {
  const guest = s.community.join(consent);
  await s.community.requestCode(guest.me.id, email);
  const code = emailedCode(s.directory, email);
  return { ...s.community.verifyCode(email, code), code };
}
test("all five games replay exactly from bounded tick inputs and seeded rules", () => {
  for (const game of ["noodle", "brick", "hop", "swarm", "coast"])
    for (const seed of [1, 987654321]) {
      const run = play(game, seed);
      const checked = replayRun(game, seed, run.replay);
      assert.equal(checked.score, run.score);
      assert.equal(checked.ticks, run.replay.ticks);
      assert.deepEqual(play(game, seed), run);
      assert.throws(
        () => replayRun(game, seed, { ...run.replay, ticks: 1 }),
        /Finish|inputs/,
      );
      assert.throws(
        () => replayRun(game, seed, { ...run.replay, version: 99 }),
        /Invalid/,
      );
      assert.throws(
        () =>
          replayRun(game, seed, {
            ...run.replay,
            events: [[0, 99, 0, -1, 0, -1, -1]],
          }),
        /Invalid/,
      );
    }
});
test("under-age and declined consent leave no player, profile, account or birth details", () => {
  const s = setup();
  try {
    assert.throws(
      () => s.community.join({ ...consent, year: 2020 }),
      /13 and over/,
    );
    assert.throws(
      () => s.community.join({ ...consent, consent: false }),
      /privacy/,
    );
    assert.throws(() => s.community.join({ ...consent, year: 3000 }), /valid/);
    for (const t of [
      "players",
      "profiles",
      "accounts",
      "sessions",
      "magic_links",
      "email_codes",
    ])
      assert.equal(
        s.store.db.prepare(`SELECT count(*) n FROM ${t}`).get().n,
        0,
      );
    const teen = s.community.join({ ...consent, year: 2011 });
    assert.equal(teen.me.ageBand, "13–17");
    const fields = s.store.db
      .prepare("PRAGMA table_info(profiles)")
      .all()
      .map((p) => p.name);
    assert.ok(!fields.some((n) => /birth|month|year/.test(n)));
  } finally {
    s.close();
  }
});
test("email code is one-time, hashed, expires and restores the same account across sessions", async () => {
  const s = setup();
  try {
    const a = await register(s, "account@example.test");
    assert.equal(s.community.lookup(a.token), a.me.id);
    assert.match(a.code, /^\d{6}$/);
    assert.throws(
      () => s.community.verifyCode("account@example.test", a.code),
      /incorrect or has expired/,
    );
    const stored = s.store.db
      .prepare("SELECT token FROM sessions WHERE player=?")
      .get(a.me.id);
    assert.notEqual(stored.token, a.token);
    s.community.patch(a.me.id, { clothing: 2, pet: 3, skin: 4, xp: 99999 });
    assert.equal(s.community.privateProfile(a.me.id).progress.xp, 0);
    s.community.logout(a.me.id, a.token);
    assert.equal(s.community.lookup(a.token), null);
    await s.community.requestExistingCode("account@example.test");
    const msg = JSON.parse(
      readFileSync(
        join(
          s.directory,
          "mail-outbox",
          readdirSync(join(s.directory, "mail-outbox"))[0],
        ),
        "utf8",
      ),
    );
    assert.equal(msg.url, undefined);
    assert.doesNotMatch(msg.text, /https?:/);
    assert.match(msg.subject, new RegExp(msg.code));
    // Only a hash of the code is stored.
    const pending = s.store.db.prepare("SELECT * FROM email_codes").all();
    assert.equal(pending.length, 1);
    assert.equal(JSON.stringify(pending).includes(msg.code), false);
    // Asking again within a minute does not send a second code.
    await s.community.requestExistingCode("account@example.test");
    assert.equal(readdirSync(join(s.directory, "mail-outbox")).length, 1);
    // Email case and spacing do not matter when the code is typed in.
    const b = s.community.verifyCode(" Account@Example.test ", msg.code);
    assert.equal(readdirSync(join(s.directory, "mail-outbox")).length, 0);
    assert.equal(b.me.id, a.me.id);
    assert.equal(b.me.progress.pet, 3);
    assert.equal(b.me.progress.clothing, 2);
    await s.community.requestExistingCode("account@example.test");
    const expiry = JSON.parse(
      readFileSync(
        join(
          s.directory,
          "mail-outbox",
          readdirSync(join(s.directory, "mail-outbox"))[0],
        ),
        "utf8",
      ),
    );
    s.tick(16 * 60000);
    assert.throws(
      () => s.community.verifyCode("account@example.test", expiry.code),
      /expired/,
    );
  } finally {
    s.close();
  }
});
test("wrong codes are limited per code and per email, without revealing accounts", async () => {
  const s = setup();
  const email = "guess@example.test";
  try {
    const a = await register(s, email);
    s.community.logout(a.me.id, a.token);
    for (const bad of ["12345", "1234567", "abcdef", 123456, null])
      assert.throws(
        () => s.community.verifyCode(email, bad),
        /incorrect or has expired/,
      );
    // Five wrong guesses retire a code, even if the sixth try is right.
    await s.community.requestExistingCode(email);
    const first = emailedCode(s.directory, email);
    for (let i = 0; i < 5; i++)
      assert.throws(
        () => s.community.verifyCode(email, wrong(first)),
        /incorrect or has expired/,
      );
    assert.throws(
      () => s.community.verifyCode(email, first),
      /incorrect or has expired/,
    );
    assert.equal(
      s.store.db.prepare("SELECT count(*) n FROM email_codes").get().n,
      0,
    );
    assert.equal(readdirSync(join(s.directory, "mail-outbox")).length, 0);
    // An address with no account answers exactly the same way.
    assert.throws(
      () => s.community.verifyCode("nobody@example.test", "123456"),
      /incorrect or has expired/,
    );
    // A fresh code still works after earlier failures.
    await s.community.requestExistingCode(email);
    const second = emailedCode(s.directory, email);
    assert.equal(s.community.verifyCode(email, second).me.id, a.me.id);
    // Fifteen wrong guesses in a day lock the address: no new code is sent
    // and nothing verifies, until the day has passed.
    for (let i = 0; i < 9; i++)
      assert.throws(
        () => s.community.verifyCode(email, "000000"),
        /incorrect or has expired/,
      );
    assert.deepEqual(await s.community.requestExistingCode(email), {
      sent: true,
      delivery: "outbox",
    });
    assert.equal(readdirSync(join(s.directory, "mail-outbox")).length, 0);
    assert.throws(() => s.community.verifyCode(email, "000000"), /Too many/);
    // Only a hash of the address is kept with the failure count.
    assert.equal(
      JSON.stringify(
        s.store.db.prepare("SELECT * FROM code_failures").all(),
      ).includes("guess@"),
      false,
    );
    s.tick(86400000 + 1);
    s.community.cleanup();
    await s.community.requestExistingCode(email);
    assert.equal(
      s.community.verifyCode(email, emailedCode(s.directory, email)).me.id,
      a.me.id,
    );
  } finally {
    s.close();
  }
});
test("forged, premature and wrong-owner results never award XP; retries are idempotent", async () => {
  const s = setup();
  try {
    const a = await register(s, "a@example.test"),
      b = await register(s, "b@example.test");
    const r = s.community.begin(a.me.id, "noodle"),
      game = play("noodle", r.seed),
      data = { id: r.id, ...game };
    assert.throws(() => s.community.finish(b.me.id, data), /not found/);
    assert.throws(
      () => s.community.finish(a.me.id, { ...data, score: 99999 }),
      /does not match/,
    );
    assert.throws(() => s.community.finish(a.me.id, data), /faster/);
    assert.equal(s.community.privateProfile(a.me.id).progress.xp, 0);
    s.tick(61000);
    const result = s.community.finish(a.me.id, data);
    assert.equal(result.verified, true);
    assert.equal(result.ranked, true, "new accounts are ranked without a wait");
    assert.equal(result.profile.progress.xp, 55);
    const retry = s.community.finish(a.me.id, data);
    assert.equal(retry.profile.progress.xp, 55);
    assert.equal(retry.ranked, true);
    assert.throws(
      () => s.community.finish(a.me.id, { ...data, score: 0 }),
      /different result/,
    );
    const board = s.community.state(a.me.id).boards.noodle;
    assert.equal(board.length, 1, "the finished round saves to the rankings");
    assert.equal(board[0].id, a.me.id);
    assert.equal(board[0].score, game.score);
    const publicState = s.community.state(b.me.id);
    assert.ok(!JSON.stringify(publicState.players).includes("@"));
    assert.ok(!JSON.stringify(publicState.players).includes("ageBand"));
  } finally {
    s.close();
  }
});
test("posted dares preserve host seed and score, expire and use only three outgoing slots", async () => {
  const s = setup();
  try {
    const a = await register(s, "host@example.test"),
      b = await register(s, "guest@example.test");
    assert.throws(() => s.community.postDare(a.me.id, "none"), /24 hours/);
    s.tick(DAY);
    const r = s.community.begin(a.me.id, "noodle"),
      data = play("noodle", r.seed);
    s.tick(61000);
    s.community.finish(a.me.id, { id: r.id, ...data });
    const dare = s.community.postDare(a.me.id, r.id);
    s.store.heartbeat(a.me.id, { connection: "online", away: false });
    const challenge = s.community.begin(b.me.id, "noodle", null, dare.id);
    assert.equal(challenge.seed, r.seed);
    assert.equal(challenge.targetScore, data.score);
    s.store.abandon(b.me.id, challenge.id);
    assert.throws(
      () => s.community.begin(b.me.id, "noodle", null, dare.id),
      /already challenged/,
    );
    assert.throws(() => s.community.postDare(a.me.id, r.id), /already a dare/);
    s.tick(DAY + 1);
    assert.throws(
      () => s.community.begin(b.me.id, "noodle", null, dare.id),
      /closed/,
    );
  } finally {
    s.close();
  }
});
test("weekly medals roll over at Monday Singapore midnight and retain last week", async () => {
  const s = setup();
  try {
    const a = await register(s, "weekly@example.test");
    s.tick(DAY);
    const r = s.community.begin(a.me.id, "noodle"),
      data = play("noodle", r.seed);
    s.tick(61000);
    s.community.finish(a.me.id, { id: r.id, ...data });
    s.setTime(Date.parse("2026-10-05T00:00:00+08:00"));
    const state = s.community.state(a.me.id);
    assert.equal(state.week, "2026-10-05");
    assert.equal(state.weekly.length, 0);
    assert.equal(state.lastWeek[0].points, 3);
    assert.equal(state.players[0].points, 3);
    assert.equal(s.community.state(a.me.id).lastWeek[0].points, 3);
  } finally {
    s.close();
  }
});
test("progress rewards cannot repeat; reports hide players and deletion revokes all access", async () => {
  const s = setup();
  try {
    const a = await register(s, "privacy@example.test"),
      b = await register(s, "other@example.test");
    s.community.progression(a.me.id, "gift", 1);
    assert.throws(() => s.community.progression(a.me.id, "gift", 1), /already/);
    s.community.progression(a.me.id, "visit", "garden");
    const once = s.community.privateProfile(a.me.id).progress.xp;
    s.community.progression(a.me.id, "visit", "garden");
    assert.equal(s.community.privateProfile(a.me.id).progress.xp, once);
    assert.throws(
      () => s.community.progression(a.me.id, "claim", "round"),
      /not ready/,
    );
    assert.throws(() => s.community.patch(a.me.id, { hat: 3 }), /Unlock/);
    s.community.report(a.me.id, b.me.id, "under-age");
    assert.ok(
      !s.community.state(a.me.id).players.some((p) => p.id === b.me.id),
    );
    const exported = s.community.export(a.me.id);
    assert.equal(exported.profile.account.email, "privacy@example.test");
    assert.ok(!JSON.stringify(exported).includes(b.token));
    s.community.delete(a.me.id);
    assert.equal(s.community.lookup(a.token), null);
    assert.equal(
      s.store.db
        .prepare("SELECT count(*) n FROM accounts WHERE email=?")
        .get("privacy@example.test").n,
      0,
    );
    assert.equal(
      s.store.db.prepare("SELECT count(*) n FROM reports").get().n,
      0,
    );
  } finally {
    s.close();
  }
});
test("retention deletes inactive profiles after twelve months and production fails closed", async () => {
  const s = setup();
  try {
    await register(s, "inactive@example.test");
    s.tick(366 * DAY);
    s.community.cleanup();
    assert.equal(
      s.store.db.prepare("SELECT count(*) n FROM profiles").get().n,
      0,
    );
    assert.throws(() => new Community(s.store, { production: true }), /HTTPS/);
  } finally {
    s.close();
  }
});

test("only three outgoing dares are allowed and a midnight reset cannot repeat a posted dare", async () => {
  const s = setup();
  try {
    const challenger = await register(s, "limit-player@example.test");
    const hosts = [];
    for (let i = 0; i < 4; i++)
      hosts.push(await register(s, `limit-host${i}@example.test`));
    s.tick(DAY);
    const dares = hosts.map((h) => {
      const r = s.community.begin(h.me.id, "noodle"),
        game = play("noodle", r.seed);
      s.tick(3000);
      s.community.finish(h.me.id, { id: r.id, ...game });
      return s.community.postDare(h.me.id, r.id);
    });
    for (const d of dares.slice(0, 3)) {
      const r = s.community.begin(challenger.me.id, "noodle", null, d.id);
      s.store.abandon(challenger.me.id, r.id);
    }
    assert.throws(
      () => s.community.begin(challenger.me.id, "noodle", null, dares[3].id),
      /three challenges/,
    );
    s.setTime(Date.parse("2026-10-05T00:00:00+08:00"));
    // First post was just after midnight on October 4, so it remains open briefly.
    assert.throws(
      () => s.community.begin(challenger.me.id, "noodle", null, dares[0].id),
      /already challenged/,
    );
    assert.ok(
      s.community.begin(challenger.me.id, "noodle", null, dares[3].id).id,
    );
  } finally {
    s.close();
  }
});

test("deletion removes feedback and all pending codes for the deleted email", async () => {
  const s = setup();
  try {
    const a = await register(s, "erase@example.test"),
      b = s.community.join(consent);
    await s.community.requestCode(b.me.id, "erase@example.test");
    const message = JSON.parse(
      readFileSync(
        join(
          s.directory,
          "mail-outbox",
          readdirSync(join(s.directory, "mail-outbox"))[0],
        ),
        "utf8",
      ),
    );
    mkdirSync(join(s.directory, "playtests"));
    writeFileSync(
      join(s.directory, "playtests", "feedback.json"),
      JSON.stringify({ player: a.me.id, answers: { device: "test phone" } }),
    );
    // A pre-code sign-in message must also be erased during an upgrade.
    s.store.db
      .prepare("INSERT INTO magic_links VALUES (?,?,?,?)")
      .run("legacy-link", "erase@example.test", b.me.id, Date.now() + DAY);
    writeFileSync(
      join(s.directory, "mail-outbox", "legacy-link.json"),
      JSON.stringify({ to: "erase@example.test", token: "legacy-link" }),
    );
    assert.equal(s.community.export(a.me.id).playtests.length, 1);
    s.community.delete(a.me.id);
    assert.equal(readdirSync(join(s.directory, "playtests")).length, 0);
    assert.equal(readdirSync(join(s.directory, "mail-outbox")).length, 0);
    assert.throws(
      () => s.community.verifyCode("erase@example.test", message.code),
      /incorrect or has expired/,
    );
    assert.ok(s.community.lookup(b.token));
  } finally {
    s.close();
  }
});

test("suspended players disappear from ranked scoring and cannot receive dares", async () => {
  const s = setup();
  try {
    const a = await register(s, "suspend@example.test"),
      b = await register(s, "viewer@example.test");
    s.tick(DAY);
    const run = s.community.begin(a.me.id, "noodle"),
      game = play("noodle", run.seed);
    s.tick(3000);
    s.community.finish(a.me.id, { id: run.id, ...game });
    assert.equal(s.store.board("noodle").length, 1);
    s.store.db
      .prepare("INSERT INTO suspensions VALUES(?,?)")
      .run(a.me.id, s.store.now());
    assert.equal(s.community.lookup(a.token), null);
    assert.equal(s.store.board("noodle").length, 0);
    assert.throws(
      () => s.community.begin(b.me.id, "noodle", a.me.id),
      /unavailable/,
    );
  } finally {
    s.close();
  }
});

test("account, saved avatar and session survive a database restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "darecade-restart-"));
  let store = new Store(join(directory, "test.sqlite"));
  let community = new Community(store, { directory });
  try {
    const guest = community.join(consent);
    await community.requestCode(guest.me.id, "restart@example.test");
    const file = readdirSync(join(directory, "mail-outbox"))[0];
    const message = JSON.parse(
      readFileSync(join(directory, "mail-outbox", file), "utf8"),
    );
    const account = community.verifyCode("restart@example.test", message.code);
    community.patch(account.me.id, {
      name: "Moon Mochi",
      sound: true,
      music: false,
      gender: 1,
      pet: 7,
      clothing: 7,
      hair: 7,
      accessory: 7,
    });
    // Simulate a profile saved before the gender preference was retired.
    store.db.exec("DELETE FROM rules WHERE key='gender_retired'");
    store.db
      .prepare(
        "UPDATE profiles SET progress=json_set(progress,'$.gender',1,'$.xp',75) WHERE player=?",
      )
      .run(account.me.id);
    store.db
      .prepare("UPDATE players SET look=json_set(look,'$.gender',1) WHERE id=?")
      .run(account.me.id);
    store.close();
    store = new Store(join(directory, "test.sqlite"));
    community = new Community(store, { directory });
    assert.equal(community.lookup(account.token), account.me.id);
    assert.equal(community.privateProfile(account.me.id).name, "Moon Mochi");
    assert.equal(community.privateProfile(account.me.id).progress.sound, true);
    assert.equal(community.privateProfile(account.me.id).progress.music, false);
    assert.equal(
      Object.hasOwn(community.privateProfile(account.me.id).progress, "gender"),
      false,
    );
    assert.equal(community.privateProfile(account.me.id).progress.xp, 75);
    assert.equal(
      Object.hasOwn(
        JSON.parse(
          store.db
            .prepare("SELECT progress FROM profiles WHERE player=?")
            .get(account.me.id).progress,
        ),
        "gender",
      ),
      false,
    );
    assert.equal(
      Object.hasOwn(
        JSON.parse(
          store.db
            .prepare("SELECT look FROM players WHERE id=?")
            .get(account.me.id).look,
        ),
        "gender",
      ),
      false,
    );
    assert.equal(community.privateProfile(account.me.id).progress.hair, 7);
    assert.equal(community.privateProfile(account.me.id).progress.clothing, 7);
    assert.equal(community.privateProfile(account.me.id).progress.accessory, 7);
    assert.equal(community.privateProfile(account.me.id).progress.pet, 7);
    assert.equal(
      community.privateProfile(account.me.id).account.email,
      "restart@example.test",
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("combined pointer and keyboard inputs cannot double paddle speed", () => {
  const pointer = new Simulation("brick", 3),
    combined = new Simulation("brick", 3);
  pointer.advance([0, 0, -1, 0, 420, -1]);
  combined.advance([1, 0, -1, 0, 420, -1]);
  assert.equal(pointer.paddle, combined.paddle);
});

test("hiding a player does not improve your weekly rank", async () => {
  const s = setup();
  try {
    const a = await register(s, "rank-a@example.test"),
      b = await register(s, "rank-b@example.test");
    s.tick(DAY);
    const award = s.store.db.prepare("INSERT INTO medals VALUES(?,?,?,?,?,?)");
    award.run("2026-10-03", "noodle", a.me.id, 1, 3, 20);
    award.run("2026-10-03", "noodle", b.me.id, 1, 3, 20);
    award.run("2026-10-03", "brick", b.me.id, 1, 3, 75);
    assert.equal(
      s.community.state(a.me.id).weekly.find((p) => p.id === a.me.id).rank,
      2,
    );
    s.community.report(a.me.id, b.me.id, "suspected-cheating");
    const own = s.community.state(a.me.id).weekly;
    assert.equal(own.length, 1);
    assert.equal(own[0].id, a.me.id);
    assert.equal(own[0].rank, 2);
  } finally {
    s.close();
  }
});

test("nickname and appearance edits validate before writing and never award rank or progress", () => {
  const s = setup();
  try {
    const guest = s.community.join(consent);
    const id = guest.me.id;
    for (const name of [
      "<script>alert(1)</script>",
      "name@example.test",
      "x123456",
      "a",
      123,
      "A".repeat(21),
    ]) {
      assert.throws(() => s.community.patch(id, { name, pet: 7 }));
      assert.equal(s.community.privateProfile(id).name, guest.me.name);
      assert.equal(s.community.privateProfile(id).progress.pet, 0);
    }
    const p = s.community.patch(id, {
      name: "  Moon   Mochi ",
      gender: 3,
      clothing: 7,
      hair: 7,
      pet: 7,
      accessory: 7,
      xp: 999,
      points: 999,
    });
    assert.equal(p.name, "Moon Mochi");
    assert.equal(p.progress.xp, 0);
    assert.equal(Object.hasOwn(p.progress, "gender"), false);
    assert.equal(p.progress.hair, 7);
    const other = s.community.join(consent);
    assert.equal(
      s.community.report(other.me.id, id, "inappropriate-name").ok,
      true,
    );
    assert.equal(s.store.state(id).players.find((p) => p.id === id).points, 0);
    const invalid = s.community.patch(id, {
      gender: 99,
      clothing: 99,
      hair: -1,
      pet: "7",
      accessory: 999,
    });
    assert.equal(Object.hasOwn(invalid.progress, "gender"), false);
    for (const key of ["clothing", "hair", "pet", "accessory"])
      assert.equal(invalid.progress[key], 0);
  } finally {
    s.close();
  }
});
test("sign-in requests for an address with no account send guidance, not a link, at most hourly", async () => {
  const s = setup();
  try {
    const outbox = () => {
      try {
        return readdirSync(join(s.directory, "mail-outbox")).map((n) =>
          JSON.parse(readFileSync(join(s.directory, "mail-outbox", n), "utf8")),
        );
      } catch {
        return [];
      }
    };
    await assert.rejects(
      s.community.requestExistingCode("not-an-email"),
      /valid email/,
    );
    const reply = await s.community.requestExistingCode(" Guest@Example.test ");
    assert.deepEqual(reply, { sent: true, delivery: "outbox" });
    const [notice] = outbox();
    assert.equal(notice.to, "guest@example.test");
    assert.equal(notice.notice, true);
    assert.equal(notice.code, undefined);
    assert.doesNotMatch(notice.text, /\d{6}/);
    assert.match(notice.text, /Account & privacy/);
    // Only a hash of the address is kept for throttling.
    assert.equal(
      JSON.stringify(
        s.store.db.prepare("SELECT * FROM login_notices").all(),
      ).includes("guest@"),
      false,
    );
    await s.community.requestExistingCode("guest@example.test");
    assert.equal(outbox().length, 1);
    s.tick(61 * 60000);
    await s.community.requestExistingCode("guest@example.test");
    assert.equal(outbox().length, 2);
    // Once the guest saves this email, the same form sends a real sign-in code.
    const account = await register(s, "guest@example.test");
    s.community.logout(account.me.id, account.token);
    await s.community.requestExistingCode("guest@example.test");
    assert.equal(
      s.community.verifyCode(
        "guest@example.test",
        emailedCode(s.directory, "guest@example.test"),
      ).me.id,
      account.me.id,
    );
  } finally {
    s.close();
  }
});
