import { randomBytes, randomUUID, createHash } from "node:crypto";
import { day, gameIds } from "./store-core.mjs";
import {
  fresh,
  normalise,
  claimGift,
  completeWelcomeRound,
  missions,
  missionProgress,
  singaporeWeek,
} from "../src/state.ts";
import { replayRun, RULES_VERSION } from "../shared/simulation.ts";
export const PRIVACY_VERSION = "2026-10-03";
const DAY = 86400000;
const hash = (x) => createHash("sha256").update(x).digest("hex");
export const seedFor = (game, date) =>
  parseInt(hash(`darecade-v${RULES_VERSION}:${game}:${date}`).slice(0, 8), 16);
const lookKeys = [
  "outfit",
  "skin",
  "hat",
  "clothing",
  "hair",
  "pet",
  "accessory",
];
const prefs = [
  "sound",
  "reduced",
  "twoD",
  "light",
  "cameraMode",
  "awayActivity",
  "welcomeDismissed",
];
export class CommunityCore {
  constructor(
    store,
    {
      files,
      origin = "http://127.0.0.1:4173",
      mailMode = "outbox",
      mailKey = "",
      mailFrom = "",
      production = false,
      privacyContact = "",
      storageNotice = "This local test stores data on the arcade operator’s computer.",
    } = {},
  ) {
    this.store = store;
    this.db = store.db;
    this.now = store.now;
    this.files = files;
    this.origin = origin;
    this.mailMode = mailMode;
    this.mailKey = mailKey;
    this.mailFrom = mailFrom;
    this.production = production;
    if (
      production &&
      (!origin.startsWith("https://") ||
        mailMode !== "resend" ||
        !mailKey ||
        !mailFrom)
    )
      throw Error(
        "Production requires HTTPS PUBLIC_ORIGIN and configured transactional email.",
      );
    if (production && (!privacyContact || storageNotice.includes("local test")))
      throw Error(
        "Production requires PRIVACY_CONTACT and an accurate STORAGE_NOTICE.",
      );
    this.privacyContact = privacyContact;
    this.storageNotice = storageNotice;
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS profiles(player TEXT PRIMARY KEY REFERENCES players(id),age_band TEXT NOT NULL,consent TEXT NOT NULL,consented INTEGER NOT NULL,progress TEXT NOT NULL,last_active INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS accounts(player TEXT PRIMARY KEY REFERENCES players(id),email TEXT UNIQUE NOT NULL,created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,player TEXT REFERENCES players(id),expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS magic_links(token TEXT PRIMARY KEY,email TEXT NOT NULL,candidate TEXT REFERENCES players(id),expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS dares(id TEXT PRIMARY KEY,host TEXT REFERENCES players(id),run TEXT REFERENCES runs(id),game TEXT,seed INTEGER,score INTEGER,created INTEGER,expires INTEGER);
  CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,reporter TEXT REFERENCES players(id),target TEXT REFERENCES players(id),reason TEXT,created INTEGER,status TEXT DEFAULT 'open');
  CREATE TABLE IF NOT EXISTS blocks(player TEXT REFERENCES players(id),target TEXT REFERENCES players(id),PRIMARY KEY(player,target));
  CREATE TABLE IF NOT EXISTS suspensions(player TEXT PRIMARY KEY REFERENCES players(id),created INTEGER);`);
    // Retire the unused preference without changing avatars or earned progress.
    this.store.transaction(() => {
      if (
        this.db.prepare("SELECT 1 FROM rules WHERE key='gender_retired'").get()
      )
        return;
      this.db
        .exec(`UPDATE profiles SET progress=json_remove(progress,'$.gender') WHERE json_type(progress,'$.gender') IS NOT NULL;
        UPDATE players SET look=json_remove(look,'$.gender') WHERE json_type(look,'$.gender') IS NOT NULL;
        INSERT INTO rules VALUES('gender_retired','1');`);
    });
    this.db
      .prepare("INSERT OR IGNORE INTO rules VALUES('verified_rules_from',?)")
      .run(day(this.now()));
    this.verifiedFrom = this.db
      .prepare("SELECT value FROM rules WHERE key='verified_rules_from'")
      .get().value;
  }
  config() {
    return {
      now: this.now(),
      privacyVersion: PRIVACY_VERSION,
      mailMode: this.mailMode,
      origin: this.origin,
      privacyContact: this.privacyContact,
      storageNotice: this.storageNotice,
    };
  }
  lookup(token) {
    if (typeof token !== "string") return null;
    const s = this.db
      .prepare(
        "SELECT s.player FROM sessions s JOIN profiles p ON p.player=s.player WHERE s.token=? AND s.expires>? AND p.consent=?",
      )
      .get(hash(token), this.now(), PRIVACY_VERSION);
    if (
      !s ||
      this.db.prepare("SELECT 1 FROM suspensions WHERE player=?").get(s.player)
    )
      return null;
    this.db
      .prepare("UPDATE profiles SET last_active=? WHERE player=?")
      .run(this.now(), s.player);
    return s.player;
  }
  issue(player) {
    const token = randomBytes(32).toString("hex");
    this.db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .run(hash(token), player, this.now() + 30 * DAY);
    return token;
  }
  eligible(month, year) {
    if (
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12 ||
      !Number.isInteger(year) ||
      year < 1900
    )
      throw Error("Choose a valid birth month and year.");
    const today = new Date(this.now() + 8 * 3600000),
      months =
        (today.getUTCFullYear() - year) * 12 + today.getUTCMonth() + 1 - month;
    if (months < 0) throw Error("Choose a valid birth month and year.");
    if (months < 13 * 12)
      throw Error(
        "Darecade is for ages 13 and over. No profile has been created and your birth details have not been saved.",
      );
    return months < 18 * 12 ? "13–17" : "18+";
  }
  join(data, legacyToken) {
    const band = this.eligible(data.month, data.year);
    if (data.consent !== true || data.privacyVersion !== PRIVACY_VERSION)
      throw Error(
        "Please read the privacy notice and choose whether to agree.",
      );
    return this.store.transaction(() => {
      const existing =
        legacyToken &&
        this.db
          .prepare(
            "SELECT id FROM players WHERE token=? AND id NOT IN (SELECT player FROM accounts)",
          )
          .get(hash(legacyToken));
      const id = existing?.id || this.store.session().id;
      if (this.db.prepare("SELECT 1 FROM profiles WHERE player=?").get(id))
        throw Error("Please sign in again.");
      const save = fresh();
      const look = JSON.parse(
        this.db.prepare("SELECT look FROM players WHERE id=?").get(id).look,
      );
      Object.assign(save, normalise({ ...save, ...look }, save));
      this.db
        .prepare("INSERT INTO profiles VALUES(?,?,?,?,?,?)")
        .run(
          id,
          band,
          PRIVACY_VERSION,
          this.now(),
          JSON.stringify(save),
          this.now(),
        );
      return { token: this.issue(id), me: this.privateProfile(id) };
    });
  }
  privateProfile(id) {
    const p = this.db.prepare("SELECT * FROM profiles WHERE player=?").get(id);
    if (!p) throw Error("Sign in to continue.");
    const account = this.db
      .prepare("SELECT email,created FROM accounts WHERE player=?")
      .get(id);
    const progress = normalise(JSON.parse(p.progress), fresh());
    return {
      id,
      name: this.db.prepare("SELECT name FROM players WHERE id=?").get(id).name,
      account: account
        ? {
            email: account.email,
            created: account.created,
            eligibleAt: account.created + DAY,
          }
        : null,
      ageBand: p.age_band,
      privacyVersion: p.consent,
      progress,
    };
  }
  save(id, progress) {
    this.db
      .prepare("UPDATE profiles SET progress=?,last_active=? WHERE player=?")
      .run(JSON.stringify(progress), this.now(), id);
  }
  patch(id, patch) {
    if (!patch || typeof patch !== "object") throw Error("Choose a setting.");
    let name;
    if (Object.hasOwn(patch, "name")) {
      if (typeof patch.name !== "string") throw Error("Choose a nickname.");
      name = patch.name.trim().replace(/\s+/g, " ");
      if (!/^[\p{L}][\p{L}\p{N} _-]{1,19}$/u.test(name) || /\d{5}/.test(name))
        throw Error(
          "Use 2–20 letters, numbers, spaces or hyphens; no contact details.",
        );
    }
    const p = this.privateProfile(id).progress,
      allowed = {};
    for (const k of [...lookKeys, ...prefs])
      if (Object.hasOwn(patch, k)) allowed[k] = patch[k];
    const candidate = normalise({ ...p, ...allowed }, fresh());
    if (!p.unlockedHats.includes(candidate.hat))
      throw Error("Unlock this hat before wearing it.");
    for (const k of [...lookKeys, ...prefs]) p[k] = candidate[k];
    if (name !== undefined)
      this.db.prepare("UPDATE players SET name=? WHERE id=?").run(name, id);
    this.save(id, p);
    const look = Object.fromEntries(lookKeys.map((k) => [k, p[k]]));
    this.db
      .prepare("UPDATE players SET look=?,activity=? WHERE id=?")
      .run(JSON.stringify(look), p.awayActivity, id);
    return this.privateProfile(id);
  }
  progression(id, event, value) {
    return this.store.transaction(() => {
      const p = this.privateProfile(id).progress;
      if (event === "gift") {
        if (!claimGift(p, value, day(this.now())))
          throw Error("This daily gift is already claimed or unavailable.");
      } else if (event === "visit") {
        if (
          ![
            "arcade",
            "board",
            "shop",
            "wardrobe",
            "dares",
            "garden",
            "cat",
            "playground",
          ].includes(value)
        )
          throw Error("Unknown place.");
        if (!p.visited.includes(value)) {
          p.visited.push(value);
          p.xp += 10;
        }
      } else if (event === "cat") {
        if (!p.cat) {
          p.cat = true;
          p.xp += 15;
        }
      } else if (event === "coin") {
        if (!/^coin[0-4]$/.test(value)) throw Error("Unknown coin.");
        const week = singaporeWeek(new Date(this.now()));
        if (p.week !== week) {
          p.week = week;
          p.coins = [];
        }
        if (!p.coins.includes(value)) {
          p.coins.push(value);
          p.xp += 10;
          if (p.coins.length === 5) {
            p.xp += 50;
            if (!p.unlockedHats.includes(3)) p.unlockedHats.push(3);
          }
        }
      } else if (event === "claim") {
        const m = missions.find((x) => x.id === value);
        if (
          !m ||
          p.claims.includes(value) ||
          missionProgress(p, value) < m.total
        )
          throw Error("This mission is not ready to claim.");
        p.claims.push(value);
        p.xp += m.xp;
      } else if (event === "welcome-wear") {
        if (!p.unlockedHats.includes(2))
          throw Error("Finish a validated round first.");
        p.hat = 2;
        p.welcome = "complete";
      } else throw Error("Unknown progression event.");
      this.save(id, p);
      this.db
        .prepare("UPDATE players SET look=? WHERE id=?")
        .run(
          JSON.stringify(Object.fromEntries(lookKeys.map((k) => [k, p[k]]))),
          id,
        );
      return this.privateProfile(id);
    });
  }
  async requestLink(id, email) {
    email = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw Error("Enter a valid email address.");
    const old = this.db
      .prepare("SELECT 1 FROM magic_links WHERE email=? AND expires>?")
      .get(email, this.now() + 14 * 60000);
    if (old) return { sent: true, delivery: this.mailMode };
    const token = randomBytes(32).toString("hex");
    this.db.prepare("DELETE FROM magic_links WHERE email=?").run(email);
    this.db
      .prepare("INSERT INTO magic_links VALUES(?,?,?,?)")
      .run(hash(token), email, id, this.now() + 15 * 60000);
    const url = `${this.origin}/#login=${token}`;
    try {
      if (this.mailMode === "resend") {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.mailKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: this.mailFrom,
            to: [email],
            subject: "Your Darecade sign-in link",
            text: `Open this link to sign in to Darecade. It expires in 15 minutes and works once. Do not share it.\n\n${url}\n\nIf you did not request this, ignore this email.`,
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!response.ok)
          throw Error("Email delivery is unavailable. Please try later.");
      } else if (this.mailMode === "outbox" && !this.production) {
        this.files.writeOutbox(hash(token), {
          to: email,
          url,
          expires: this.now() + 15 * 60000,
        });
      } else throw Error("Email delivery is not configured.");
    } catch (e) {
      this.db.prepare("DELETE FROM magic_links WHERE token=?").run(hash(token));
      throw e;
    }
    return { sent: true, delivery: this.mailMode };
  }
  async requestExistingLink(email) {
    const normal = typeof email === "string" ? email.trim().toLowerCase() : "";
    const account = this.db
      .prepare("SELECT player FROM accounts WHERE email=?")
      .get(normal);
    if (account) await this.requestLink(account.player, normal);
    return { sent: true, delivery: this.mailMode };
  }
  consume(raw) {
    if (typeof raw !== "string" || !/^[a-f0-9]{64}$/.test(raw))
      throw Error("This sign-in link is invalid or expired.");
    return this.store.transaction(() => {
      const link = this.db
        .prepare("SELECT * FROM magic_links WHERE token=? AND expires>?")
        .get(hash(raw), this.now());
      if (!link) throw Error("This sign-in link is invalid or expired.");
      const account = this.db
        .prepare("SELECT player FROM accounts WHERE email=?")
        .get(link.email);
      const id = account?.player || link.candidate;
      if (this.db.prepare("SELECT 1 FROM suspensions WHERE player=?").get(id))
        throw Error(
          "This account is unavailable. Contact the arcade operator.",
        );
      if (!account) {
        const p = this.privateProfile(id);
        if (p.privacyVersion !== PRIVACY_VERSION)
          throw Error("Please agree to the current privacy notice.");
        if (this.db.prepare("SELECT 1 FROM accounts WHERE player=?").get(id))
          throw Error("Start this sign-in from a signed-out browser.");
        this.db
          .prepare("INSERT INTO accounts VALUES(?,?,?)")
          .run(id, link.email, this.now());
        this.db
          .prepare("UPDATE players SET token=? WHERE id=?")
          .run(hash(randomBytes(32)), id);
        this.db.prepare("DELETE FROM sessions WHERE player=?").run(id);
      }
      this.db.prepare("DELETE FROM magic_links WHERE token=?").run(hash(raw));
      try {
        this.files.removeOutbox(hash(raw));
      } catch {}
      return { token: this.issue(id), me: this.privateProfile(id) };
    });
  }
  logout(id, token) {
    this.db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
    this.db.prepare("DELETE FROM presence WHERE player=?").run(id);
    return { ok: true };
  }
  eligibleAccount(id) {
    const a = this.db
      .prepare("SELECT created FROM accounts WHERE player=?")
      .get(id);
    return !!a && a.created + DAY <= this.now();
  }
  begin(id, game, target = null, dareId = null) {
    if (!gameIds.includes(game)) throw Error("Choose an arcade game.");
    let seed = seedFor(game, day(this.now())),
      score = 0,
      dare = null;
    if (dareId) {
      dare = this.db
        .prepare("SELECT * FROM dares WHERE id=? AND expires>?")
        .get(dareId, this.now());
      if (!dare || dare.game !== game) throw Error("This dare has closed.");
      if (
        this.db
          .prepare("SELECT 1 FROM runs WHERE player=? AND dare=?")
          .get(id, dareId)
      )
        throw Error("You already challenged this dare.");
      target = dare.host;
      seed = dare.seed;
      score = dare.score;
    }
    if (target) {
      if (
        this.db.prepare("SELECT 1 FROM suspensions WHERE player=?").get(target)
      )
        throw Error("This dare is unavailable.");
      if (!this.eligibleAccount(id) || !this.eligibleAccount(target))
        throw Error(
          "Shared dares open 24 hours after account verification. Regular rounds are available now.",
        );
      if (
        this.db
          .prepare(
            "SELECT 1 FROM blocks WHERE (player=? AND target=?) OR (player=? AND target=?)",
          )
          .get(id, target, target, id)
      )
        throw Error("This dare is unavailable.");
      if (!dare) {
        const best = this.db
          .prepare(
            "SELECT score,seed FROM runs WHERE player=? AND game=? AND verified=1 AND seed IS NOT NULL AND version=? AND status='finished' AND score>0 ORDER BY score DESC,finished ASC LIMIT 1",
          )
          .get(target, game, RULES_VERSION);
        if (!best) throw Error("This neighbour has no validated score yet.");
        seed = best.seed;
        score = best.score;
      }
    }
    const run = this.store.begin(id, game, target, {
      allowOnline: !!dare,
      targetScore: target ? score : undefined,
    });
    if (target) run.targetScore = score;
    this.db
      .prepare(
        "UPDATE runs SET seed=?,version=?,targetScore=?,dare=? WHERE id=?",
      )
      .run(seed, RULES_VERSION, score, dareId, run.id);
    return {
      ...run,
      seed,
      version: RULES_VERSION,
      ranked: this.eligibleAccount(id),
      dailySeed: seed === seedFor(game, day(this.now())),
    };
  }
  finish(id, data) {
    const r = this.db
      .prepare("SELECT * FROM runs WHERE id=? AND player=?")
      .get(data.id, id);
    if (!r) throw Error("Round not found.");
    const digest = hash(
      JSON.stringify({ score: data.score, replay: data.replay }),
    );
    if (r.status === "finished") {
      if (r.digest !== digest)
        throw Error("This round was already saved with a different result.");
      return {
        score: r.score,
        won: !!r.target && r.score > r.targetScore,
        profile: this.privateProfile(id),
        verified: true,
      };
    }
    if (
      r.status !== "started" ||
      this.now() - r.started > 600000 ||
      r.version !== RULES_VERSION
    )
      throw Error("This round has expired. Start a new round.");
    const result = replayRun(r.game, r.seed, data.replay);
    if (result.score !== data.score)
      throw Error(
        "The replay does not match this score. No rewards were saved.",
      );
    if ((result.ticks / 60) * 1000 > this.now() - r.started + 250)
      throw Error(
        "This replay was submitted faster than the round could be played.",
      );
    return this.store.transaction(() => {
      const ranked =
        this.eligibleAccount(id) && r.seed === seedFor(r.game, day(this.now()));
      this.db
        .prepare(
          "UPDATE runs SET score=?,finished=?,status='finished',verified=1,eligible=?,replay=?,digest=? WHERE id=?",
        )
        .run(
          result.score,
          this.now(),
          ranked ? 1 : 0,
          JSON.stringify(data.replay),
          digest,
          r.id,
        );
      const p = this.privateProfile(id).progress;
      const welcome = completeWelcomeRound(p);
      p.rounds++;
      p.xp += 20;
      p.best[r.game] = Math.max(p.best[r.game], result.score);
      this.save(id, p);
      return {
        score: result.score,
        won: !!r.target && result.score > r.targetScore,
        verified: true,
        ranked,
        welcome,
        profile: this.privateProfile(id),
      };
    });
  }
  postDare(id, runId) {
    if (!this.eligibleAccount(id))
      throw Error("Posting dares opens 24 hours after account verification.");
    return this.store.transaction(() => {
      const r = this.db
        .prepare(
          "SELECT * FROM runs WHERE id=? AND player=? AND verified=1 AND status='finished' AND score>0 AND version=?",
        )
        .get(runId, id, RULES_VERSION);
      if (!r) throw Error("Choose a positive, validated round to post.");
      if (this.db.prepare("SELECT 1 FROM dares WHERE run=?").get(runId))
        throw Error("This round is already a dare.");
      const start = Date.parse(`${day(this.now())}T00:00:00+08:00`);
      if (
        this.db
          .prepare("SELECT COUNT(*) n FROM dares WHERE host=? AND created>=?")
          .get(id, start).n >= 3
      )
        throw Error("You have posted three dares today.");
      const d = {
        id: randomUUID(),
        host: id,
        game: r.game,
        seed: r.seed,
        score: r.score,
        created: this.now(),
        expires: this.now() + DAY,
      };
      this.db
        .prepare("INSERT INTO dares VALUES(?,?,?,?,?,?,?,?)")
        .run(d.id, id, runId, r.game, r.seed, r.score, d.created, d.expires);
      return d;
    });
  }
  state(id) {
    const state = this.store.state(id),
      week = singaporeWeek(new Date(this.now())),
      last = singaporeWeek(new Date(this.now() - 7 * DAY));
    const allowed = new Set(
      this.db
        .prepare(
          "SELECT p.player FROM profiles p WHERE p.player NOT IN (SELECT player FROM suspensions) AND p.player NOT IN (SELECT target FROM blocks WHERE player=?)",
        )
        .all(id)
        .map((p) => p.player),
    );
    state.players = state.players.filter((p) => allowed.has(p.id)).slice(0, 30);
    if (!state.players.some((p) => p.id === id)) {
      const own = this.store.state(id).players.find((p) => p.id === id);
      if (own) state.players = [own, ...state.players.slice(0, 29)];
    }
    // Personal bests and friendly targets include verified practice rounds.
    // Daily medal boards separately require an eligible account and today's seed.
    const bests = this.db
      .prepare(
        "SELECT player,game,MAX(score) score FROM runs WHERE verified=1 AND status='finished' AND version=? GROUP BY player,game",
      )
      .all(RULES_VERSION);
    for (const player of state.players) {
      player.best = Object.fromEntries(gameIds.map((game) => [game, 0]));
      for (const r of bests)
        if (r.player === player.id) player.best[r.game] = r.score;
    }
    state.history = state.history.filter(
      (r) => allowed.has(r.player) && allowed.has(r.target),
    );
    for (const game of gameIds)
      state.boards[game] = state.boards[game]
        .filter((p) => allowed.has(p.id))
        .slice(0, 50);
    const weekly = (start, end) =>
      this.db
        .prepare(
          `SELECT p.id,p.name,p.look,SUM(m.points) points FROM medals m JOIN players p ON p.id=m.player JOIN accounts a ON a.player=p.id WHERE m.day>=? AND m.day<? AND p.id NOT IN (SELECT player FROM suspensions) GROUP BY p.id ORDER BY points DESC,p.id ASC`,
        )
        .all(start > this.verifiedFrom ? start : this.verifiedFrom, end)
        .map((p, i, rows) => ({
          ...p,
          look: JSON.parse(p.look),
          rank: rows.findIndex((r) => r.points === p.points) + 1,
        }))
        .filter((p) => allowed.has(p.id))
        .slice(0, 50);
    state.week = week;
    state.weekly = weekly(week, day(this.now() + DAY));
    state.lastWeek = weekly(last, week);
    state.dares = this.db
      .prepare(
        "SELECT d.*,p.name FROM dares d JOIN players p ON p.id=d.host WHERE d.expires>? ORDER BY d.created DESC LIMIT 100",
      )
      .all(this.now())
      .filter((d) => allowed.has(d.host));
    state.profile = this.privateProfile(id);
    state.competitionReady = this.eligibleAccount(id);
    state.recentRuns = this.db
      .prepare(
        "SELECT id,game,score,finished FROM runs WHERE player=? AND verified=1 AND status='finished' ORDER BY finished DESC LIMIT 12",
      )
      .all(id);
    return state;
  }
  report(id, target, reason) {
    if (
      id === target ||
      !this.db.prepare("SELECT 1 FROM profiles WHERE player=?").get(target)
    )
      throw Error("Choose another neighbour.");
    if (
      ![
        "under-age",
        "unsafe-behaviour",
        "suspected-cheating",
        "inappropriate-name",
      ].includes(reason)
    )
      throw Error("Choose a report reason.");
    if (
      this.db
        .prepare(
          "SELECT 1 FROM reports WHERE reporter=? AND target=? AND status='open'",
        )
        .get(id, target)
    )
      return { ok: true };
    if (
      this.db
        .prepare(
          "SELECT COUNT(*) n FROM reports WHERE reporter=? AND created>?",
        )
        .get(id, this.now() - DAY).n >= 5
    )
      throw Error(
        "Your reports have been received. Please wait before sending more.",
      );
    this.db
      .prepare(
        "INSERT INTO reports(id,reporter,target,reason,created) VALUES(?,?,?,?,?)",
      )
      .run(randomUUID(), id, target, reason, this.now());
    this.db.prepare("INSERT OR IGNORE INTO blocks VALUES(?,?)").run(id, target);
    return { ok: true };
  }
  playtests(id) {
    return this.files.playtests(id);
  }
  export(id) {
    return {
      exportedAt: new Date(this.now()).toISOString(),
      profile: this.privateProfile(id),
      player: this.db
        .prepare("SELECT id,name,look,activity,created FROM players WHERE id=?")
        .get(id),
      rounds: this.db
        .prepare(
          "SELECT game,started,finished,score,status,verified,replay FROM runs WHERE player=?",
        )
        .all(id),
      medals: this.db
        .prepare("SELECT day,game,rank,points,score FROM medals WHERE player=?")
        .all(id),
      dares: this.db
        .prepare("SELECT id,game,score,created,expires FROM dares WHERE host=?")
        .all(id),
      reports: this.db
        .prepare("SELECT reason,created,status FROM reports WHERE reporter=?")
        .all(id),
      playtests: this.playtests(id).map((f) => f.data),
    };
  }
  delete(id) {
    return this.store.transaction(() => {
      this.db
        .prepare("DELETE FROM blocks WHERE player=? OR target=?")
        .run(id, id);
      this.db
        .prepare("DELETE FROM reports WHERE reporter=? OR target=?")
        .run(id, id);
      this.db.prepare("DELETE FROM dares WHERE host=?").run(id);
      this.db
        .prepare(
          "UPDATE runs SET target=NULL,dare=NULL,targetScore=0 WHERE target=?",
        )
        .run(id);
      const email =
        this.db.prepare("SELECT email FROM accounts WHERE player=?").get(id)
          ?.email || "";
      const links = this.db
        .prepare("SELECT token FROM magic_links WHERE candidate=? OR email=?")
        .all(id, email);
      for (const link of links)
        try {
          this.files.removeOutbox(link.token);
        } catch {}
      this.db
        .prepare("DELETE FROM magic_links WHERE candidate=? OR email=?")
        .run(id, email);
      for (const f of this.playtests(id)) this.files.removePlaytest(f.path);
      for (const table of [
        "presence",
        "medals",
        "runs",
        "sessions",
        "accounts",
        "profiles",
        "suspensions",
      ])
        this.db.prepare(`DELETE FROM ${table} WHERE player=?`).run(id);
      this.db.prepare("DELETE FROM players WHERE id=?").run(id);
      return { ok: true };
    });
  }
  cleanup() {
    this.db.prepare("DELETE FROM sessions WHERE expires<=?").run(this.now());
    this.db.prepare("DELETE FROM magic_links WHERE expires<=?").run(this.now());
    const cutoff = new Date(this.now());
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
    for (const p of this.db
      .prepare("SELECT player FROM profiles WHERE last_active<?")
      .all(cutoff.getTime()))
      this.delete(p.player);
    this.db
      .prepare("UPDATE runs SET replay=NULL WHERE finished<?")
      .run(this.now() - 30 * DAY);
    this.files.cleanup(this.now());
  }
}
