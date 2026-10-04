import { clampMovement } from "./world-core.mjs";
import { appearanceLimits } from "../src/appearance.ts";
import { randomUUID, randomBytes, createHash } from "node:crypto";

import { gameIds } from "../src/catalog.ts";
import { COAST_RULES_VERSION } from "../shared/simulation.ts";
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
      ["race_result", "TEXT"],
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
    this.db
      .prepare("INSERT OR IGNORE INTO rules VALUES('coast_gp_from',?)")
      .run(day(this.now()));
    this.coastFrom = this.db
      .prepare("SELECT value FROM rules WHERE key='coast_gp_from'")
      .get().value;
    // First day of the winding route. Earlier days settle on the old loop.
    this.db
      .prepare("INSERT OR IGNORE INTO rules VALUES('coast_route_from',?)")
      .run(day(this.now()));
    this.routeFrom = this.db
      .prepare("SELECT value FROM rules WHERE key='coast_route_from'")
      .get().value;
    this.rulesFrom = this.db
      .prepare("SELECT value FROM rules WHERE key='daily_rules_from'")
      .get().value;
    const playerColumns = this.db.prepare("PRAGMA table_info(players)").all();
    if (!playerColumns.some((c) => c.name === "seen")) {
      this.db.exec(
        "ALTER TABLE players ADD COLUMN seen INTEGER NOT NULL DEFAULT 0",
      );
      this.db.exec(
        "UPDATE players SET seen=COALESCE((SELECT MAX(seen) FROM presence WHERE player=players.id),created)",
      );
    }
    this.db
      .exec(`CREATE INDEX IF NOT EXISTS runs_player_game_status ON runs(player,game,status);
      CREATE INDEX IF NOT EXISTS runs_player_target_day ON runs(player,target,day);
      CREATE INDEX IF NOT EXISTS runs_board ON runs(game,status,verified,eligible,finished);
      CREATE INDEX IF NOT EXISTS medals_player ON medals(player);
      CREATE INDEX IF NOT EXISTS players_seen ON players(seen DESC);
      CREATE INDEX IF NOT EXISTS presence_seen ON presence(seen,player);
      CREATE TABLE IF NOT EXISTS snapshot_revision(id INTEGER PRIMARY KEY, revision INTEGER NOT NULL);
      INSERT OR IGNORE INTO snapshot_revision VALUES(1,0);`);
    this.watchSnapshot(
      "runs",
      "status,score,target,targetScore,day,verified,eligible,version",
    );
    this.watchSnapshot("medals");
    this.watchSnapshot("suspensions");
    this.watchSnapshot("players", "name");
  }
  watchSnapshot(table, columns) {
    // Database triggers also invalidate caches after operator moderation SQL.
    for (const event of ["INSERT", "UPDATE", "DELETE"])
      this.db.exec(`CREATE TRIGGER IF NOT EXISTS snapshot_${table}_${event}
        AFTER ${event}${event === "UPDATE" && columns ? ` OF ${columns}` : ""} ON ${table}
        BEGIN UPDATE snapshot_revision SET revision=revision+1 WHERE id=1; END;`);
  }
  refreshSnapshot() {
    this.cachedSnapshot = null;
    this.snapshot();
    this.onSnapshot?.();
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
        "INSERT INTO players(id,token,name,created,since,seen) VALUES(?,?,?,?,?,?)",
      )
      .run(id, hash(token), name, this.now(), this.now(), this.now());
    return { id, token };
  }
  status(id) {
    const live = this.liveStatus?.(id);
    if (live) return live;
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
    const was = this.status(id);
    const movement = clampMovement(data, p);
    const activity = movement.activity;
    const look = JSON.parse(p.look);
    // Profiles equip through CommunityCore.patch, which checks ownership.
    const hasProfile =
      this.db
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type='table' AND name='profiles'",
        )
        .get() &&
      this.db.prepare("SELECT 1 FROM profiles WHERE player=?").get(id);
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
        !hasProfile &&
        Number.isInteger(data.look?.[key]) &&
        data.look[key] >= 0 &&
        data.look[key] <= max
      )
        look[key] = data.look[key];
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
        "UPDATE players SET look=?,activity=?,since=?,x=?,z=?,yaw=?,seen=? WHERE id=?",
      )
      .run(
        JSON.stringify(look),
        activity,
        since,
        movement.x,
        movement.z,
        movement.yaw,
        this.now(),
        id,
      );
  }
  board(game, before = this.now() + 1, after = 0) {
    const rows = this.db
      .prepare(
        `WITH best AS (
          SELECT player,score,finished achieved,
            ROW_NUMBER() OVER (PARTITION BY player ORDER BY score DESC,finished ASC) choice
          FROM runs WHERE game=? AND status='finished' AND verified=1 AND eligible=1
            AND (game!='coast' OR COALESCE(version,1)=?) AND finished>=? AND finished<? AND score>0
            AND player NOT IN (SELECT player FROM suspensions))
        SELECT p.id,p.name,b.score,b.achieved FROM best b JOIN players p ON p.id=b.player
        WHERE b.choice=1 ORDER BY b.score DESC,b.achieved ASC,p.id ASC`,
      )
      .all(
        game,
        before <= boundary(this.coastFrom)
          ? 1
          : before <= boundary(this.routeFrom)
            ? 2
            : COAST_RULES_VERSION,
        after,
        before,
      );
    let rank = 0;
    return rows.map((p, i) => {
      if (!i || p.score !== rows[i - 1].score) rank = i + 1;
      return { ...p, rank };
    });
  }
  settle(refresh = true) {
    this.db
      .prepare(
        "UPDATE runs SET status='abandoned' WHERE status='started' AND started<?",
      )
      .run(this.now() - 600000);
    const today = day(this.now());
    if (this.settledThrough === today) return;
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
    this.settledThrough = today;
    if (refresh) this.refreshSnapshot();
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
      this.db
        .prepare("UPDATE runs SET version=? WHERE id=?")
        .run(game === "coast" ? COAST_RULES_VERSION : 1, run.id);
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
    this.refreshSnapshot();
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
  snapshot() {
    const now = this.now(),
      today = day(now);
    const revision = this.db
      .prepare("SELECT revision FROM snapshot_revision WHERE id=1")
      .get().revision;
    if (
      this.cachedSnapshot &&
      this.cachedSnapshot.revision === revision &&
      this.cachedSnapshot.day === today &&
      now - this.cachedSnapshot.built < 30000
    )
      return this.cachedSnapshot;
    this.settle(false);
    const cards = new Map(
      this.db
        .prepare(
          "SELECT id FROM players WHERE id NOT IN (SELECT player FROM suspensions)",
        )
        .all()
        .map(({ id }) => [
          id,
          {
            best: empty(),
            guestBest: empty(),
            points: 0,
            wins: 0,
            incoming: 0,
            outgoing: 0,
          },
        ]),
    );
    // Group score records and wins in one pass through finished rounds.
    for (const r of this.db
      .prepare(
        `SELECT player,game,
        COUNT(CASE WHEN verified=1 THEN 1 END) verifiedRuns,
        MAX(CASE WHEN verified=1 THEN CASE WHEN eligible=1 AND (game!='coast' OR COALESCE(version,1)=${COAST_RULES_VERSION}) THEN score ELSE 0 END END) best,
        MAX(CASE WHEN verified=1 THEN CASE WHEN version=CASE WHEN game='coast' THEN ${COAST_RULES_VERSION} ELSE 1 END THEN score ELSE 0 END END) guestBest,
        SUM(CASE WHEN target IS NOT NULL AND score>targetScore THEN 1 ELSE 0 END) wins
        FROM runs WHERE status='finished' GROUP BY player,game`,
      )
      .all()) {
      const card = cards.get(r.player);
      if (card) {
        if (r.verifiedRuns) {
          card.best[r.game] = r.best;
          card.guestBest[r.game] = r.guestBest;
        }
        card.wins += r.wins;
      }
    }
    for (const [field, sql, args] of [
      ["points", "SELECT player,SUM(points) n FROM medals GROUP BY player", []],
      [
        "incoming",
        "SELECT target player,COUNT(*) n FROM runs WHERE target IS NOT NULL AND day=? GROUP BY target",
        [today],
      ],
      [
        "outgoing",
        "SELECT player,COUNT(*) n FROM runs WHERE target IS NOT NULL AND day=? GROUP BY player",
        [today],
      ],
    ])
      for (const r of this.db.prepare(sql).all(...args)) {
        const card = cards.get(r.player);
        if (card) card[field] = r.n;
      }
    this.cachedSnapshot = {
      built: now,
      day: today,
      nextReset: boundary(today) + DAY,
      cards,
      revision: this.db
        .prepare("SELECT revision FROM snapshot_revision WHERE id=1")
        .get().revision,
      boards: Object.fromEntries(
        gameIds.map((g) => [g, this.board(g, now + 1, boundary(today))]),
      ),
    };
    return this.cachedSnapshot;
  }
  publicPlayer(p, guest = false) {
    const card = this.cachedSnapshot?.cards.get(p.id);
    return {
      ...p,
      look: JSON.parse(p.look),
      best: { ...(card?.[guest ? "guestBest" : "best"] || empty()) },
      points: card?.points || 0,
      wins: card?.wins || 0,
      incoming: card?.incoming || 0,
      outgoing: card?.outgoing || 0,
    };
  }
  playerList(id, community = false) {
    const worldPlayers = this.livePlayerList?.(id);
    if (worldPlayers) return worldPlayers;
    const visibility = `p.id NOT IN (SELECT player FROM suspensions)${
      community
        ? `
      AND EXISTS (SELECT 1 FROM profiles WHERE player=p.id)
      AND p.id NOT IN (SELECT target FROM blocks WHERE player=? UNION SELECT player FROM blocks WHERE target=?)`
        : ""
    }`;
    const args = community ? [id, id] : [];
    // Select live neighbours first, then at most eight offline neighbours.
    // Presence and appearance are always fresh; heartbeat never rebuilds scores.
    return this.db
      .prepare(
        `WITH live AS (
        SELECT player,CASE WHEN MIN(away)=0 THEN 'online' ELSE 'resting' END status
        FROM presence WHERE seen>? GROUP BY player),
      online AS (SELECT p.id,p.name,p.look,p.activity,p.since,p.x,p.z,p.yaw,p.seen,l.status
        FROM live l JOIN players p ON p.id=l.player WHERE ${visibility} ORDER BY p.seen DESC,p.rowid LIMIT 40),
      offline AS (SELECT p.id,p.name,p.look,p.activity,p.since,p.x,p.z,p.yaw,p.seen,'offline' status
        FROM players p WHERE ${visibility} AND NOT EXISTS (SELECT 1 FROM live WHERE player=p.id)
        ORDER BY p.seen DESC,p.rowid LIMIT 8),
      selected AS (SELECT * FROM online UNION ALL SELECT * FROM offline LIMIT 40)
      SELECT * FROM selected ORDER BY seen DESC`,
      )
      .all(this.now() - 15000, ...args, ...args)
      .map((p) => this.publicPlayer(p, community));
  }
  personalState(id) {
    return {
      me: id,
      self: this.publicPlayer({
        ...this.db
          .prepare(
            "SELECT id,name,look,activity,since,x,z,yaw,seen FROM players WHERE id=?",
          )
          .get(id),
        status: this.status(id),
      }),
      challenged: this.db
        .prepare(
          "SELECT DISTINCT target FROM runs WHERE player=? AND target IS NOT NULL AND day=?",
        )
        .all(id, day(this.now()))
        .map((r) => r.target),
      history: this.db
        .prepare(
          `SELECT r.id,r.game,r.score,r.targetScore,r.status,r.player,r.target,p.name challenger,t.name defender
        FROM runs r JOIN players p ON p.id=r.player JOIN players t ON t.id=r.target
        WHERE r.player=? OR r.target=? ORDER BY r.started DESC,r.id ASC LIMIT 20`,
        )
        .all(id, id),
    };
  }
  state(id) {
    const snapshot = this.snapshot();
    return {
      ...this.personalState(id),
      day: snapshot.day,
      nextReset: snapshot.nextReset,
      boards: structuredClone(snapshot.boards),
      players: this.playerList(id),
    };
  }
  close() {
    this.db.close();
  }
}
