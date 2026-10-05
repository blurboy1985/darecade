import { randomUUID } from "node:crypto";
import { day } from "./store-core.mjs";
import { games } from "../src/catalog.ts";
import { PRIVACY_VERSION } from "./community-core.mjs";

const HOUR = 3600000;
// Resend retains idempotency keys for 24 hours. Stop ambiguous retries before
// that window expires; an operator must reconcile these instead of resending.
const RETRY_WINDOW = 23 * HOUR;
export class MedalRewards {
  constructor(community) {
    this.community = community;
    this.db = community.db;
    this.now = community.now;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS medal_rewards(day TEXT,player TEXT REFERENCES players(id),tokens INTEGER NOT NULL,PRIMARY KEY(day,player));
      CREATE INDEX IF NOT EXISTS medal_rewards_player ON medal_rewards(player);
      CREATE TABLE IF NOT EXISTS notification_preferences(player TEXT PRIMARY KEY REFERENCES players(id),medal_email INTEGER NOT NULL DEFAULT 0,consented INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS medal_email_outbox(day TEXT,player TEXT REFERENCES players(id),payload TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',attempts INTEGER NOT NULL DEFAULT 0,first_attempt INTEGER,next_attempt INTEGER NOT NULL,lease TEXT,PRIMARY KEY(day,player));
      CREATE INDEX IF NOT EXISTS medal_email_due ON medal_email_outbox(status,next_attempt);`);
    community.store.transaction(() => {
      const exists = this.db
        .prepare("SELECT 1 FROM rules WHERE key='medal_tokens_from'")
        .get();
      if (exists) return;
      this.db
        .prepare("INSERT INTO rules VALUES('medal_tokens_from',?)")
        .run(day(this.now()));
      // Preserve collections already unlocked by the previous XP/medal rules.
      for (const row of this.db
        .prepare("SELECT player,progress FROM profiles")
        .all()) {
        const p = JSON.parse(row.progress);
        const medals = this.db
          .prepare(
            "SELECT COALESCE(SUM(points),0) n FROM medals WHERE player=?",
          )
          .get(row.player).n;
        for (const [id, xp, points] of [
          ["discovery", 300, 1],
          ["mastery", 1000, 3],
        ])
          if (
            (p.xp >= xp ||
              medals >= points ||
              ["clothing", "hair", "pet", "accessory"].some((slot) =>
                id === "discovery"
                  ? p[slot] >= 8 && p[slot] < 16
                  : p[slot] >= 16 &&
                    p[slot] <
                      { clothing: 24, hair: 28, pet: 26, accessory: 27 }[slot],
              )) &&
            !p.wardrobePurchased?.includes(id)
          )
            p.wardrobePurchased = [...(p.wardrobePurchased || []), id];
        this.db
          .prepare("UPDATE profiles SET progress=? WHERE player=?")
          .run(JSON.stringify(p), row.player);
      }
    });
    this.from = this.db
      .prepare("SELECT value FROM rules WHERE key='medal_tokens_from'")
      .get().value;
  }
  tokens(player) {
    return this.db
      .prepare(
        "SELECT COALESCE(SUM(tokens),0) n FROM medal_rewards WHERE player=?",
      )
      .get(player).n;
  }
  optedIn(player) {
    return !!this.db
      .prepare(
        "SELECT 1 FROM notification_preferences WHERE player=? AND medal_email=1",
      )
      .get(player);
  }
  preference(player, enabled) {
    this.community.store.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO notification_preferences VALUES(?,?,?) ON CONFLICT(player) DO UPDATE SET medal_email=excluded.medal_email,consented=excluded.consented",
        )
        .run(player, enabled ? 1 : 0, this.now());
      if (!enabled)
        this.db
          .prepare(
            "UPDATE medal_email_outbox SET status='cancelled',lease=NULL WHERE player=? AND status IN ('pending','sending','needs_review')",
          )
          .run(player);
    });
  }
  settle(date) {
    if (date < this.from) return;
    for (const row of this.db
      .prepare(
        "SELECT player,MIN(3,SUM(points)) tokens FROM medals WHERE day=? GROUP BY player",
      )
      .all(date)) {
      if (
        this.db
          .prepare("SELECT 1 FROM medal_rewards WHERE day=? AND player=?")
          .get(date, row.player)
      )
        continue;
      this.db
        .prepare("INSERT INTO medal_rewards VALUES(?,?,?)")
        .run(date, row.player, row.tokens);
      const account = this.recipient(row.player);
      if (!account) continue;
      const awards = this.db
        .prepare(
          "SELECT game,rank,score FROM medals WHERE day=? AND player=? ORDER BY game",
        )
        .all(date, row.player);
      const payload = {
        email: account.email,
        subject: `Your Play Simi medals for ${date}`,
        text: `Nice play! Your ${date} Singapore day awards:\n\n${awards.map((a) => `${["Gold", "Silver", "Bronze"][a.rank - 1]} · ${games[a.game].name}`).join("\n")}\n\n+${row.tokens} Style token${row.tokens === 1 ? "" : "s"} for these medals. Medal rewards cap at 3 tokens a day. XP tokens are separate. Style tokens buy outfits and looks.\n\nPlay: ${this.community.origin}\nTurn off medal emails in Account & privacy.`,
      };
      this.db
        .prepare(
          "INSERT INTO medal_email_outbox(day,player,payload,next_attempt) VALUES(?,?,?,?)",
        )
        .run(date, row.player, JSON.stringify(payload), this.now());
    }
  }
  recipient(player) {
    return this.db
      .prepare(
        `SELECT a.email FROM accounts a JOIN profiles p ON p.player=a.player JOIN notification_preferences n ON n.player=p.player
      WHERE a.player=? AND p.consent=? AND n.medal_email=1 AND NOT EXISTS(SELECT 1 FROM suspensions WHERE player=p.player)`,
      )
      .get(player, PRIVACY_VERSION);
  }
  nextAttempt() {
    return this.db
      .prepare(
        "SELECT MIN(next_attempt) n FROM medal_email_outbox WHERE status IN ('pending','sending')",
      )
      .get().n;
  }
  async deliver() {
    // A persisted lease protects against overlapping alarms and requests.
    for (let i = 0; i < 25; i++) {
      const job = this.community.store.transaction(() => {
        const row = this.db
          .prepare(
            "SELECT * FROM medal_email_outbox WHERE status IN ('pending','sending') AND next_attempt<=? ORDER BY day,player LIMIT 1",
          )
          .get(this.now());
        if (!row) return null;
        const payload = JSON.parse(row.payload);
        if (this.recipient(row.player)?.email !== payload.email) {
          this.db
            .prepare(
              "UPDATE medal_email_outbox SET status='cancelled',lease=NULL WHERE day=? AND player=?",
            )
            .run(row.day, row.player);
          return { skipped: true };
        }
        if (
          row.first_attempt !== null &&
          this.now() - row.first_attempt >= RETRY_WINDOW
        ) {
          this.db
            .prepare(
              "UPDATE medal_email_outbox SET status='needs_review',lease=NULL WHERE day=? AND player=?",
            )
            .run(row.day, row.player);
          return { skipped: true };
        }
        const lease = randomUUID();
        this.db
          .prepare(
            "UPDATE medal_email_outbox SET status='sending',attempts=attempts+1,first_attempt=COALESCE(first_attempt,?),next_attempt=?,lease=? WHERE day=? AND player=?",
          )
          .run(this.now(), this.now() + 60000, lease, row.day, row.player);
        return { ...row, payload, lease };
      });
      if (!job) break;
      if (job.skipped) continue;
      const key = `medals/${job.day}/${job.player}`;
      try {
        await this.community.sendEmail(
          job.payload.email,
          job.payload.subject,
          job.payload.text,
          `medals-${job.day}-${job.player}`,
          { awardsDay: job.day },
          key,
        );
        this.db
          .prepare(
            "UPDATE medal_email_outbox SET status='sent',lease=NULL WHERE day=? AND player=? AND lease=?",
          )
          .run(job.day, job.player, job.lease);
      } catch {
        const delay = Math.min(HOUR, 60000 * 2 ** Math.min(job.attempts, 6));
        this.db
          .prepare(
            "UPDATE medal_email_outbox SET status='pending',next_attempt=?,lease=NULL WHERE day=? AND player=? AND lease=?",
          )
          .run(this.now() + delay, job.day, job.player, job.lease);
      }
    }
  }
}
