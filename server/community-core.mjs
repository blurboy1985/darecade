import {
  ownsSet,
  canWear,
  canRedeem,
  legendarySets,
  setStarts,
} from "../src/collections.ts";
import { randomBytes, randomInt, randomUUID, createHash } from "node:crypto";
import { day, gameIds } from "./store-core.mjs";
import {
  fresh,
  normalise,
  claimGift,
  completeWelcomeRound,
  catchFish,
  scoreHoops,
  plantCrop,
  waterCrop,
  harvestCrop,
  missions,
  missionProgress,
  singaporeWeek,
} from "../src/state.ts";
import {
  replayRun,
  RULES_VERSION,
  rulesVersion,
} from "../shared/simulation.ts";
export const PRIVACY_VERSION = "2026-10-03";
const DAY = 86400000;
const ACTIVE_TOUCH_INTERVAL = 5 * 60000;
const CODE_MINUTES = 15;
// A code dies after this many wrong guesses; an email address is refused for
// the rest of a day after this many across all of its codes.
const CODE_TRIES = 5;
const DAILY_CODE_TRIES = 15;
const BAD_CODE = "That code is incorrect or has expired.";
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
  "music",
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
      .exec(`CREATE TABLE IF NOT EXISTS payment_orders(id TEXT PRIMARY KEY,player TEXT,product TEXT NOT NULL,kind TEXT NOT NULL,price_id TEXT NOT NULL,amount INTEGER NOT NULL,currency TEXT NOT NULL,status TEXT NOT NULL,created INTEGER NOT NULL,session TEXT UNIQUE,intent TEXT);
  CREATE INDEX IF NOT EXISTS payment_player ON payment_orders(player,status);
  CREATE INDEX IF NOT EXISTS payment_intent ON payment_orders(intent);
  CREATE TABLE IF NOT EXISTS profiles(player TEXT PRIMARY KEY REFERENCES players(id),age_band TEXT NOT NULL,consent TEXT NOT NULL,consented INTEGER NOT NULL,progress TEXT NOT NULL,last_active INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS accounts(player TEXT PRIMARY KEY REFERENCES players(id),email TEXT UNIQUE NOT NULL,created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,player TEXT REFERENCES players(id),expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS magic_links(token TEXT PRIMARY KEY,email TEXT NOT NULL,candidate TEXT REFERENCES players(id),expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS email_codes(email TEXT PRIMARY KEY,code TEXT NOT NULL,candidate TEXT REFERENCES players(id),expires INTEGER NOT NULL,attempts INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS code_failures(email TEXT PRIMARY KEY,n INTEGER NOT NULL,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS login_notices(email TEXT PRIMARY KEY,expires INTEGER NOT NULL);
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
    for (const table of ["profiles", "accounts", "dares"])
      this.store.watchSnapshot(
        table,
        table === "profiles" ? "consent" : undefined,
      );
    this.db.exec(
      "CREATE INDEX IF NOT EXISTS blocks_target ON blocks(target,player)",
    );
    this.store.onSnapshot = () => this.snapshot();
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
    const now = this.now();
    const s = this.db
      .prepare(
        "SELECT s.player,p.last_active FROM sessions s JOIN profiles p ON p.player=s.player WHERE s.token=? AND s.expires>? AND p.consent=?",
      )
      .get(hash(token), now, PRIVACY_VERSION);
    if (
      !s ||
      this.db.prepare("SELECT 1 FROM suspensions WHERE player=?").get(s.player)
    )
      return null;
    // Activity retention needs a recent timestamp, not a write on every read.
    // Session expiry, consent and suspension are still checked on every lookup.
    if (now - s.last_active >= ACTIVE_TOUCH_INTERVAL)
      this.db
        .prepare("UPDATE profiles SET last_active=? WHERE player=?")
        .run(now, s.player);
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
      // Legacy looks predate Legendary ownership; never import an unowned set.
      for (const [slot, start] of Object.entries(setStarts))
        if (save[slot] >= start) save[slot] = 0;
      this.db
        .prepare("UPDATE players SET look=? WHERE id=?")
        .run(
          JSON.stringify(
            Object.fromEntries(lookKeys.map((key) => [key, save[key]])),
          ),
          id,
        );
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
    const medals = this.db
      .prepare("SELECT COALESCE(SUM(points),0) n FROM medals WHERE player=?")
      .get(id).n;
    for (const slot of Object.keys(setStarts))
      if (
        candidate[slot] !== p[slot] &&
        !canWear(slot, candidate[slot], p, medals)
      )
        throw Error("Unlock this collection before equipping it.");
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
      if (event === "redeem-style") {
        const set = legendarySets.find((s) => s.id === value);
        if (!set) throw Error("Unknown style set.");
        if (ownsSet(p, set.id)) return this.privateProfile(id);
        const medals = this.db
          .prepare(
            "SELECT COALESCE(SUM(points),0) n FROM medals WHERE player=?",
          )
          .get(id).n;
        if (!canRedeem(set, p, medals))
          throw Error("Earn the tokens and medal or round requirement first.");
        p.wardrobeUnlocked.push(set.id);
        p.wardrobeSpent += set.cost;
      } else if (event === "gift") {
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
            "fishing",
            "hoops",
            "plots",
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
      } else if (event === "fish") {
        if (catchFish(p, value) === null) throw Error("Unknown catch.");
      } else if (event === "hoops") {
        if (scoreHoops(p, value) === null) throw Error("Unknown score.");
      } else if (event === "plant") {
        if (!plantCrop(p, value, this.now()))
          throw Error("This plot is already growing something.");
      } else if (event === "water") {
        if (!waterCrop(p, this.now()))
          throw Error("There is nothing to water right now.");
      } else if (event === "harvest") {
        if (!harvestCrop(p, this.now()))
          throw Error("This crop is not ready yet.");
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
  normaliseEmail(email) {
    email = typeof email === "string" ? email.trim().toLowerCase() : "";
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      throw Error("Enter a valid email address.");
    return email;
  }
  /** Sends one transactional email, or writes it to the local test outbox. */
  async sendEmail(email, subject, text, outboxId, outbox) {
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
          subject,
          text,
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok)
        throw Error("Email delivery is unavailable. Please try later.");
    } else if (this.mailMode === "outbox" && !this.production) {
      this.files.writeOutbox(outboxId, { to: email, subject, text, ...outbox });
    } else throw Error("Email delivery is not configured.");
  }
  codeLocked(email) {
    return !!this.db
      .prepare(
        "SELECT 1 FROM code_failures WHERE email=? AND expires>? AND n>=?",
      )
      .get(hash("code-failures:" + email), this.now(), DAILY_CODE_TRIES);
  }
  /**
   * Emails a six-digit code that the player types into the window they already
   * have open. Only a hash of the code is stored. A repeat request within a
   * minute, or for a locked address, answers the same way without sending.
   */
  async requestCode(id, email) {
    email = this.normaliseEmail(email);
    const live = this.db
      .prepare("SELECT 1 FROM email_codes WHERE email=? AND expires>?")
      .get(email, this.now() + (CODE_MINUTES - 1) * 60000);
    if (live || this.codeLocked(email))
      return { sent: true, delivery: this.mailMode };
    const code = String(randomInt(1000000)).padStart(6, "0");
    const key = hash(`code:${email}:${code}`);
    const expires = this.now() + CODE_MINUTES * 60000;
    const previous = this.db
      .prepare("SELECT code FROM email_codes WHERE email=?")
      .get(email);
    if (previous)
      try {
        this.files.removeOutbox(previous.code);
      } catch {}
    this.db
      .prepare("INSERT OR REPLACE INTO email_codes VALUES(?,?,?,?,0)")
      .run(email, key, id, expires);
    try {
      await this.sendEmail(
        email,
        `${code} is your Darecade code`,
        `Your Darecade code is ${code}\n\nType it into the Darecade window you already have open. It expires in ${CODE_MINUTES} minutes and works once. Do not share it.\n\nIf you did not request this, ignore this email.`,
        key,
        { code, expires },
      );
    } catch (e) {
      this.db.prepare("DELETE FROM email_codes WHERE code=?").run(key);
      throw e;
    }
    return { sent: true, delivery: this.mailMode };
  }
  async requestExistingCode(email) {
    const normal = this.normaliseEmail(email);
    const account = this.db
      .prepare("SELECT player FROM accounts WHERE email=?")
      .get(normal);
    if (account) return this.requestCode(account.player, normal);
    // No account uses this address (often a guest who never saved an email).
    // Reply exactly as for a real account, but email guidance instead of
    // silence. Only a hash of the address is kept, for one hour, so the same
    // inbox is not emailed repeatedly.
    const key = hash("login-notice:" + normal);
    const recent = this.db
      .prepare("SELECT 1 FROM login_notices WHERE email=? AND expires>?")
      .get(key, this.now());
    if (recent) return { sent: true, delivery: this.mailMode };
    this.db
      .prepare("INSERT OR REPLACE INTO login_notices VALUES(?,?)")
      .run(key, this.now() + 60 * 60000);
    try {
      await this.sendEmail(
        normal,
        "Your Darecade sign-in request",
        `Someone asked to sign in to Darecade with this email address, but no Darecade account uses it yet.\n\nPlayed as a guest? Your avatar and progress are saved in the browser you played on. Open Darecade there, choose More → Account & privacy → Create my account, and enter this email. After that you can sign in on any device.\n\nNew to Darecade? Start here: ${this.origin}\n\nIf you did not ask for this, ignore this email. We will not email this address again for at least an hour.`,
        hash(randomBytes(32)),
        { notice: true },
      );
    } catch (e) {
      this.db.prepare("DELETE FROM login_notices WHERE email=?").run(key);
      throw e;
    }
    return { sent: true, delivery: this.mailMode };
  }
  /** Checks an emailed code, then signs in or attaches the email to the guest. */
  verifyCode(email, code) {
    email = this.normaliseEmail(email);
    if (typeof code !== "string" || !/^\d{6}$/.test(code))
      throw Error(BAD_CODE);
    // A wrong guess is recorded and reported after the transaction, because a
    // thrown error would roll the count back.
    const result = this.store.transaction(() => {
      if (this.codeLocked(email))
        return { error: "Too many incorrect codes. Try again tomorrow." };
      const link = this.db
        .prepare("SELECT * FROM email_codes WHERE email=? AND expires>?")
        .get(email, this.now());
      if (!link || link.code !== hash(`code:${email}:${code}`)) {
        // Counted whether or not a code exists, so the reply never reveals
        // which addresses have accounts.
        this.db
          .prepare(
            "INSERT INTO code_failures VALUES(?,1,?) ON CONFLICT(email) DO UPDATE SET n=CASE WHEN expires<=? THEN 1 ELSE n+1 END,expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END",
          )
          .run(
            hash("code-failures:" + email),
            this.now() + DAY,
            this.now(),
            this.now(),
          );
        if (link && link.attempts + 1 >= CODE_TRIES) {
          this.db.prepare("DELETE FROM email_codes WHERE email=?").run(email);
          try {
            this.files.removeOutbox(link.code);
          } catch {}
        } else if (link)
          this.db
            .prepare("UPDATE email_codes SET attempts=attempts+1 WHERE email=?")
            .run(email);
        return { error: BAD_CODE };
      }
      const account = this.db
        .prepare("SELECT player FROM accounts WHERE email=?")
        .get(email);
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
          .run(id, email, this.now());
        this.db
          .prepare("UPDATE players SET token=? WHERE id=?")
          .run(hash(randomBytes(32)), id);
        this.db.prepare("DELETE FROM sessions WHERE player=?").run(id);
      }
      this.db.prepare("DELETE FROM email_codes WHERE email=?").run(email);
      try {
        this.files.removeOutbox(link.code);
      } catch {}
      return { token: this.issue(id), me: this.privateProfile(id) };
    });
    if (result.error) throw Error(result.error);
    return result;
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
  // Every verified round by an email account is ranked; only dares wait 24h.
  rankedAccount(id) {
    return !!this.db.prepare("SELECT 1 FROM accounts WHERE player=?").get(id);
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
      if (
        !dare ||
        dare.game !== game ||
        this.db.prepare("SELECT version FROM runs WHERE id=?").get(dare.run)
          ?.version !== rulesVersion(game)
      )
        throw Error("This dare has closed.");
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
          .get(target, game, rulesVersion(game));
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
      .run(seed, rulesVersion(game), score, dareId, run.id);
    return {
      ...run,
      seed,
      version: rulesVersion(game),
      ranked: this.rankedAccount(id),
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
        race: r.race_result ? JSON.parse(r.race_result) : undefined,
        score: r.score,
        won: !!r.target && r.score > r.targetScore,
        profile: this.privateProfile(id),
        verified: true,
        ranked: !!r.eligible,
      };
    }
    if (
      r.status !== "started" ||
      this.now() - r.started > 600000 ||
      r.version !== rulesVersion(r.game)
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
    const saved = this.store.transaction(() => {
      const ranked = this.rankedAccount(id);
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
      let race;
      if (result.race) {
        const previous = p.coastRecord;
        const newBest =
          result.race.finished &&
          (!previous.timeTicks ||
            result.race.timeTicks < previous.timeTicks ||
            !previous.place ||
            result.race.place < previous.place);
        race = { ...result.race, newBest };
        if (race.finished)
          p.coastRecord = {
            version: 2,
            timeTicks: previous.timeTicks
              ? Math.min(previous.timeTicks, race.timeTicks)
              : race.timeTicks,
            place: previous.place
              ? Math.min(previous.place, race.place)
              : race.place,
          };
        this.db
          .prepare("UPDATE runs SET race_result=? WHERE id=?")
          .run(JSON.stringify(race), r.id);
      }
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
        race,
        profile: this.privateProfile(id),
      };
    });
    this.store.refreshSnapshot();
    return saved;
  }
  postDare(id, runId) {
    if (!this.eligibleAccount(id))
      throw Error("Posting dares opens 24 hours after account verification.");
    const saved = this.store.transaction(() => {
      const r = this.db
        .prepare(
          "SELECT * FROM runs WHERE id=? AND player=? AND verified=1 AND status='finished' AND score>0 AND version=CASE WHEN game='coast' THEN 2 ELSE 1 END",
        )
        .get(runId, id);
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
    this.store.refreshSnapshot();
    return saved;
  }
  snapshot() {
    const base = this.store.snapshot();
    if (this.cachedSnapshot?.base === base) return this.cachedSnapshot;
    const week = singaporeWeek(new Date(this.now())),
      last = singaporeWeek(new Date(this.now() - 7 * DAY));
    const allowed = new Set(
      this.db
        .prepare(
          "SELECT player FROM profiles WHERE player NOT IN (SELECT player FROM suspensions)",
        )
        .all()
        .map((p) => p.player),
    );
    const weekly = (start, end) => {
      let rank = 0;
      return this.db
        .prepare(
          `SELECT p.id,p.name,p.look,SUM(m.points) points FROM medals m
        JOIN players p ON p.id=m.player JOIN accounts a ON a.player=p.id
        WHERE m.day>=? AND m.day<? AND p.id NOT IN (SELECT player FROM suspensions)
        GROUP BY p.id ORDER BY points DESC,p.id ASC`,
        )
        .all(start > this.verifiedFrom ? start : this.verifiedFrom, end)
        .map((p, i, rows) => {
          if (!i || p.points !== rows[i - 1].points) rank = i + 1;
          return { ...p, look: JSON.parse(p.look), rank };
        });
    };
    return (this.cachedSnapshot = {
      base,
      allowed,
      week,
      weekly: weekly(week, day(this.now() + DAY)),
      lastWeek: weekly(last, week),
      dares: this.db
        .prepare(
          `SELECT d.*,p.name FROM dares d JOIN players p ON p.id=d.host
        JOIN runs r ON r.id=d.run WHERE r.version=CASE WHEN d.game='coast' THEN 2 ELSE 1 END
        AND d.expires>? ORDER BY d.created DESC LIMIT 100`,
        )
        .all(this.now()),
    });
  }
  presence(id) {
    return { players: this.store.playerList(id, true) };
  }
  state(id) {
    const snapshot = this.snapshot(),
      { base } = snapshot;
    const blocked = new Set(
      this.db
        .prepare(
          "SELECT target id FROM blocks WHERE player=? UNION SELECT player id FROM blocks WHERE target=?",
        )
        .all(id, id)
        .map((p) => p.id),
    );
    const allowed = (player) =>
      snapshot.allowed.has(player) && !blocked.has(player);
    const personal = this.store.personalState(id);
    personal.self.best = {
      ...(base.cards.get(id)?.guestBest || personal.self.best),
    };
    const profile = this.privateProfile(id);
    return {
      ...personal,
      day: base.day,
      nextReset: base.nextReset,
      players: this.store.playerList(id, true),
      history: personal.history.filter(
        (r) => allowed(r.player) && allowed(r.target),
      ),
      boards: Object.fromEntries(
        gameIds.map((game) => [
          game,
          profile.account
            ? base.boards[game]
                .filter((p) => allowed(p.id))
                .slice(0, 50)
                .map((p) => ({ ...p }))
            : [],
        ]),
      ),
      week: snapshot.week,
      weekly: profile.account
        ? structuredClone(
            snapshot.weekly.filter((p) => allowed(p.id)).slice(0, 50),
          )
        : [],
      lastWeek: profile.account
        ? structuredClone(
            snapshot.lastWeek.filter((p) => allowed(p.id)).slice(0, 50),
          )
        : [],
      dares: snapshot.dares
        .filter((d) => d.expires > this.now() && allowed(d.host))
        .map((d) => ({ ...d })),
      profile,
      competitionReady: this.eligibleAccount(id),
      recentRuns: this.db
        .prepare(
          `SELECT id,game,score,finished FROM runs WHERE player=? AND verified=1
        AND status='finished' AND version=CASE WHEN game='coast' THEN 2 ELSE 1 END ORDER BY finished DESC LIMIT 12`,
        )
        .all(id),
    };
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
      payments: this.db
        .prepare(
          "SELECT id,product,kind,amount,currency,status,created FROM payment_orders WHERE player=?",
        )
        .all(id),
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
    const saved = this.store.transaction(() => {
      this.db
        .prepare("UPDATE payment_orders SET player=NULL WHERE player=?")
        .run(id);
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
      const codes = this.db
        .prepare("SELECT code FROM email_codes WHERE candidate=? OR email=?")
        .all(id, email);
      for (const pending of codes)
        try {
          this.files.removeOutbox(pending.code);
        } catch {}
      this.db
        .prepare("DELETE FROM email_codes WHERE candidate=? OR email=?")
        .run(id, email);
      this.db
        .prepare("DELETE FROM code_failures WHERE email=?")
        .run(hash("code-failures:" + email));
      // Links were replaced by codes; erase older outbox messages too.
      for (const link of this.db
        .prepare("SELECT token FROM magic_links WHERE candidate=? OR email=?")
        .all(id, email))
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
    this.store.refreshSnapshot();
    return saved;
  }
  cleanup() {
    this.db.prepare("DELETE FROM sessions WHERE expires<=?").run(this.now());
    this.db.prepare("DELETE FROM magic_links WHERE expires<=?").run(this.now());
    this.db.prepare("DELETE FROM email_codes WHERE expires<=?").run(this.now());
    this.db
      .prepare("DELETE FROM code_failures WHERE expires<=?")
      .run(this.now());
    this.db
      .prepare("DELETE FROM login_notices WHERE expires<=?")
      .run(this.now());
    const cutoff = new Date(this.now());
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 1);
    for (const p of this.db
      .prepare("SELECT player FROM profiles WHERE last_active<?")
      .all(cutoff.getTime()))
      this.delete(p.player);
    this.db
      .prepare(
        "UPDATE runs SET replay=NULL WHERE finished<? AND replay IS NOT NULL",
      )
      .run(this.now() - 30 * DAY);
    this.files.cleanup(this.now());
  }
}
