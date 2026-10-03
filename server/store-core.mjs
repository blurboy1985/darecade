import { appearanceLimits } from "../src/appearance.ts";
import { randomUUID, randomBytes, createHash } from "node:crypto";

import { gameIds } from "../src/catalog.ts";
export { gameIds };
const DAY = 86400000;
export const day = (time) =>
  new Date(time + 8 * 3600000).toISOString().slice(0, 10);
const boundary = (date) => Date.parse(`${date}T00:00:00+08:00`);
const hash = (token) => createHash("sha256").update(token).digest("hex");
const empty = () => Object.fromEntries(gameIds.map((g) => [g, 0]));
export class StoreCore {
  constructor(db, now = Date.now) {
    this.now = now;
    this.db = db;
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS players(id TEXT PRIMARY KEY, token TEXT UNIQUE, name TEXT, created INTEGER, look TEXT DEFAULT '{"outfit":0,"skin":0,"hat":0}', activity TEXT DEFAULT 'jog', since INTEGER, x REAL DEFAULT 0, z REAL DEFAULT 4, yaw REAL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS presence(player TEXT REFERENCES players(id), connection TEXT, seen INTEGER, away INTEGER, PRIMARY KEY(player,connection));
      CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, player TEXT REFERENCES players(id), game TEXT, started INTEGER, finished INTEGER, score INTEGER, target TEXT REFERENCES players(id), targetScore INTEGER, day TEXT, status TEXT);
      CREATE INDEX IF NOT EXISTS runs_target_day ON runs(target,day);
      CREATE TABLE IF NOT EXISTS medals(day TEXT, game TEXT, player TEXT REFERENCES players(id), rank INTEGER, points INTEGER, score INTEGER, PRIMARY KEY(day,game,player));
      CREATE TABLE IF NOT EXISTS settled(day TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS rules(key TEXT PRIMARY KEY,value TEXT);`);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS suspensions(player TEXT PRIMARY KEY REFERENCES players(id),created INTEGER)",
    );
    const columns = this.db
      .prepare("PRAGMA table_info(runs)")
      .all()
      .map((c) => c.name);
    for (const [name, type] of [
      ["verified", "INTEGER DEFAULT 0"],
      ["eligible", "INTEGER DEFAULT 0"],
      ["seed", "INTEGER"],
      ["version", "INTEGER"],
      ["replay", "TEXT"],
      ["digest", "TEXT"],
      ["dare", "TEXT"],
    ])
      if (!columns.includes(name))
        this.db.exec(`ALTER TABLE runs ADD COLUMN ${name} ${type}`);
    this.transaction(() => {
      if (
        !this.db
          .prepare("SELECT 1 FROM rules WHERE key='daily_rules_from'")
          .get()
      ) {
        this.db.exec(`ALTER TABLE medals RENAME TO medals_legacy;
          CREATE TABLE medals(day TEXT, game TEXT, player TEXT REFERENCES players(id), rank INTEGER, points INTEGER, score INTEGER, PRIMARY KEY(day,game,player));
          INSERT INTO medals SELECT * FROM medals_legacy;
          DROP TABLE medals_legacy;`);
        this.db
          .prepare("INSERT INTO rules VALUES('daily_rules_from',?)")
          .run(day(this.now()));
      }
    });
    this.rulesFrom = this.db
      .prepare("SELECT value FROM rules WHERE key='daily_rules_from'")
      .get().value;
  }
  transaction(fn) {
    if (this.db.transaction) return this.db.transaction(fn);
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = fn();
      this.db.exec("COMMIT");
      return value;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
  session(token) {
    let p =
      token &&
      this.db.prepare("SELECT * FROM players WHERE token=?").get(hash(token));
    if (p) return { id: p.id };
    token = randomBytes(32).toString("hex");
    const id = randomUUID();
    const count = this.db.prepare("SELECT count(*) AS n FROM players").get().n;
    const name = `${["Sunny Otter", "Cosmic Cat", "Brave Panda", "Mellow Fox", "Mint Gecko"][count % 5]} ${String(count + 1).padStart(2, "0")}`;
    this.db
      .prepare(
        "INSERT INTO players(id,token,name,created,since) VALUES(?,?,?,?,?)",
      )
      .run(id, hash(token), name, this.now(), this.now());
    return { id, token };
  }
  status(id) {
    const rows = this.db
      .prepare("SELECT away FROM presence WHERE player=? AND seen>?")
      .all(id, this.now() - 15000);
    return rows.some((p) => !p.away)
      ? "online"
      : rows.length
        ? "resting"
        : "offline";
  }
  heartbeat(id, data, leaving = false) {
    if (
      typeof data.connection !== "string" ||
      !/^[a-zA-Z0-9-]{1,80}$/.test(data.connection)
    )
      throw Error("Invalid connection");
    const p = this.db.prepare("SELECT * FROM players WHERE id=?").get(id);
    const was = this.status(id),
      activity = ["jog", "dragon", "dance", "rest", "arcade"].includes(
        data.activity,
      )
        ? data.activity
        : p.activity;
    const look = JSON.parse(p.look);
    for (const [key, max] of [
      ["outfit", 5],
      ["skin", 7],
      ["hat", 3],
      ...Object.entries(appearanceLimits).map(([key, count]) => [
        key,
        count - 1,
      ]),
    ])
      if (
        Number.isInteger(data.look?.[key]) &&
        data.look[key] >= 0 &&
        data.look[key] <= max
      )
        look[key] = data.look[key];
    const num = (v, f) =>
      typeof v === "number" && Number.isFinite(v)
        ? Math.max(-25, Math.min(25, v))
        : f;
    this.db
      .prepare("INSERT OR REPLACE INTO presence VALUES(?,?,?,?)")
      .run(
        id,
        data.connection,
        leaving ? 0 : this.now(),
        data.away || leaving ? 1 : 0,
      );
    const since =
      (was === "online" && this.status(id) !== "online") ||
      activity !== p.activity
        ? this.now()
        : p.since;
    this.db
      .prepare(
        "UPDATE players SET look=?,activity=?,since=?,x=?,z=?,yaw=? WHERE id=?",
      )
      .run(
        JSON.stringify(look),
        activity,
        since,
        num(data.x, p.x),
        num(data.z, p.z),
        num(data.yaw, p.yaw),
        id,
      );
  }
  board(game, before = this.now() + 1, after = 0) {
    const rows = this.db
      .prepare(
        `WITH best AS (
      SELECT player,MAX(score) score FROM runs WHERE game=? AND status='finished' AND verified=1 AND eligible=1 AND finished>=? AND finished<? AND score>0 AND player NOT IN (SELECT player FROM suspensions) GROUP BY player)
      SELECT p.id,p.name,b.score,MIN(r.finished) achieved FROM best b JOIN players p ON p.id=b.player
      JOIN runs r ON r.player=b.player AND r.game=? AND r.score=b.score AND r.finished>=? AND r.finished<? AND r.status='finished'
      GROUP BY p.id ORDER BY b.score DESC,achieved ASC,p.id ASC`,
      )
      .all(game, after, before, game, after, before);
    let rank = 0;
    return rows.map((p, i) => {
      if (!i || p.score !== rows[i - 1].score) rank = i + 1;
      return { ...p, rank };
    });
  }
  settle() {
    this.db
      .prepare(
        "UPDATE runs SET status='abandoned' WHERE status='started' AND started<?",
      )
      .run(this.now() - 600000);
    const first = this.db.prepare("SELECT MIN(created) n FROM players").get().n;
    if (first === null) return;
    this.transaction(() => {
      for (
        let at = boundary(day(first));
        at < boundary(day(this.now()));
        at += DAY
      ) {
        const d = day(at);
        if (this.db.prepare("SELECT 1 FROM settled WHERE day=?").get(d))
          continue;
        for (const g of gameIds) {
          const modern = d >= this.rulesFrom;
          this.board(g, at + DAY, modern ? at : 0)
            .map((p, i) => ({ ...p, rank: modern ? p.rank : i + 1 }))
            .filter((p) => p.rank <= 3)
            .forEach((p) =>
              this.db
                .prepare("INSERT INTO medals VALUES(?,?,?,?,?,?)")
                .run(d, g, p.id, p.rank, 4 - p.rank, p.score),
            );
        }
        this.db.prepare("INSERT INTO settled VALUES(?)").run(d);
      }
    });
  }
  begin(id, game, target = null, options = {}) {
    this.settle();
    if (!gameIds.includes(game)) throw Error("Choose an arcade game.");
    return this.transaction(() => {
      let targetScore = 0;
      if (target) {
        if (target === id)
          throw Error("Choose another neighbour to challenge.");
        if (!this.db.prepare("SELECT 1 FROM players WHERE id=?").get(target))
          throw Error("Neighbour not found.");
        if (this.status(target) === "online" && !options.allowOnline)
          throw Error(
            "This neighbour is back online. Choose a resting or offline neighbour.",
          );
        const used = this.db
          .prepare(
            "SELECT count(*) n FROM runs WHERE player=? AND target IS NOT NULL AND day=?",
          )
          .get(id, day(this.now())).n;
        if (used >= 3)
          throw Error(
            "You have used your three challenges today. Play regular rounds or return after midnight SGT.",
          );
        if (
          this.db
            .prepare("SELECT 1 FROM runs WHERE player=? AND target=? AND day=?")
            .get(id, target, day(this.now()))
        )
          throw Error(
            "You already challenged this neighbour today. Choose someone different.",
          );
        targetScore =
          options.targetScore ??
          this.board(game).find((p) => p.id === target)?.score ??
          0;
        if (!targetScore)
          throw Error("This neighbour has not set a score in that game yet.");
      }
      this.db
        .prepare(
          "UPDATE runs SET status='abandoned' WHERE player=? AND status='started'",
        )
        .run(id);
      const run = { id: randomUUID(), game, target, targetScore };
      this.db
        .prepare(
          "INSERT INTO runs(id,player,game,started,target,targetScore,day,status) VALUES(?,?,?,?,?,?,?,?)",
        )
        .run(
          run.id,
          id,
          game,
          this.now(),
          target,
          targetScore,
          day(this.now()),
          "started",
        );
      return run;
    });
  }
  finish(id, runId, score, eligible = true) {
    this.settle();
    if (!Number.isInteger(score) || score < 0 || score > 100000)
      throw Error("Invalid game score.");
    const r = this.db
      .prepare("SELECT * FROM runs WHERE id=? AND player=?")
      .get(runId, id);
    if (!r) throw Error("Game session not found.");
    if (r.status === "finished")
      return {
        score: r.score,
        won: !!r.target && r.score > r.targetScore,
        targetScore: r.targetScore,
      };
    if (r.status !== "started" || this.now() - r.started > 600000)
      throw Error("This round has expired. Start a new round.");
    this.db
      .prepare(
        "UPDATE runs SET score=?,finished=?,status='finished',verified=1,eligible=? WHERE id=?",
      )
      .run(score, this.now(), eligible ? 1 : 0, runId);
    return {
      score,
      won: !!r.target && score > r.targetScore,
      targetScore: r.targetScore,
    };
  }
  abandon(id, runId) {
    this.db
      .prepare(
        "UPDATE runs SET status='abandoned' WHERE id=? AND player=? AND status='started'",
      )
      .run(runId, id);
  }
  state(id) {
    this.settle();
    const today = day(this.now());
    const boards = Object.fromEntries(
      gameIds.map((g) => [g, this.board(g, this.now() + 1, boundary(today))]),
    );
    const lifetime = Object.fromEntries(gameIds.map((g) => [g, this.board(g)]));
    const players = this.db
      .prepare(
        "SELECT id,name,look,activity,since,x,z,yaw FROM players ORDER BY created",
      )
      .all()
      .map((p) => {
        const best = empty();
        for (const g of gameIds)
          best[g] = lifetime[g].find((r) => r.id === p.id)?.score || 0;
        return {
          ...p,
          look: JSON.parse(p.look),
          status: this.status(p.id),
          best,
          points: this.db
            .prepare(
              "SELECT COALESCE(SUM(points),0) n FROM medals WHERE player=?",
            )
            .get(p.id).n,
          incoming: this.db
            .prepare("SELECT count(*) n FROM runs WHERE target=? AND day=?")
            .get(p.id, today).n,
          outgoing: this.db
            .prepare(
              "SELECT count(*) n FROM runs WHERE player=? AND target IS NOT NULL AND day=?",
            )
            .get(p.id, today).n,
          wins: this.db
            .prepare(
              "SELECT count(*) n FROM runs WHERE player=? AND target IS NOT NULL AND status='finished' AND score>targetScore",
            )
            .get(p.id).n,
        };
      });
    const history = this.db
      .prepare(
        `SELECT r.id,r.game,r.score,r.targetScore,r.status,r.player,r.target,p.name challenger,t.name defender FROM runs r JOIN players p ON p.id=r.player JOIN players t ON t.id=r.target WHERE r.player=? OR r.target=? ORDER BY r.started DESC LIMIT 20`,
      )
      .all(id, id);
    return {
      me: id,
      day: today,
      nextReset: boundary(today) + DAY,
      players,
      boards,
      challenged: this.db
        .prepare(
          "SELECT DISTINCT target FROM runs WHERE player=? AND target IS NOT NULL AND day=?",
        )
        .all(id, today)
        .map((r) => r.target),
      history,
    };
  }
  close() {
    this.db.close();
  }
}
