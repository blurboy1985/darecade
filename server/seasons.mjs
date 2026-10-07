import { day } from "./store-core.mjs";

// Competition periods are independent of replay versions and reward identities.
export class Seasons {
  constructor(store, schedule = "[]", show = false) {
    this.store = store;
    this.db = store.db;
    this.show = show;
    const definitions = JSON.parse(schedule);
    if (!Array.isArray(definitions) || definitions.length > 64)
      throw Error(
        "COMPETITION_SEASONS must be an array of at most 64 seasons.",
      );
    for (const s of definitions) {
      if (
        !s ||
        typeof s !== "object" ||
        typeof s.id !== "string" ||
        !/^[a-z0-9][a-z0-9-]{0,39}$/.test(s.id) ||
        typeof s.name !== "string" ||
        !s.name.trim() ||
        s.name.length > 40 ||
        typeof s.startsAt !== "string" ||
        !/^\d{4}-\d{2}-\d{2}T00:00:00\+08:00$/.test(s.startsAt) ||
        !Number.isFinite(Date.parse(s.startsAt)) ||
        day(Date.parse(s.startsAt)) !== s.startsAt.slice(0, 10) ||
        new Date(`${s.startsAt.slice(0, 10)}T00:00:00Z`).getUTCDay() !== 1
      )
        throw Error(
          "Each season needs an ID, name and Monday 00:00 +08:00 start.",
        );
    }
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS competition_seasons(id TEXT PRIMARY KEY,name TEXT NOT NULL,starts INTEGER UNIQUE NOT NULL,registered INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS season_xp(season TEXT REFERENCES competition_seasons(id),player TEXT REFERENCES players(id),xp INTEGER NOT NULL CHECK(xp>=0),PRIMARY KEY(season,player));
      CREATE INDEX IF NOT EXISTS season_xp_player ON season_xp(player);`);
    store.transaction(() => {
      const rows = this.db
        .prepare("SELECT * FROM competition_seasons ORDER BY starts")
        .all();
      const ids = new Set();
      let added = 0;
      let last = rows.at(-1)?.starts ?? 0;
      for (const s of [...definitions].sort(
        (a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt),
      )) {
        if (ids.has(s.id)) throw Error("Duplicate competition season ID.");
        ids.add(s.id);
        const starts = Date.parse(s.startsAt),
          old = rows.find((r) => r.id === s.id);
        if (old) {
          if (old.starts !== starts || old.name !== s.name)
            throw Error(
              "Registered seasons are immutable. Append a new future season.",
            );
          continue;
        }
        if (starts <= store.now() || starts <= last)
          throw Error(
            "New seasons must append a future Monday boundary; historical XP cannot be reconstructed.",
          );
        if (rows.length + ++added > 64)
          throw Error(
            "At most 64 registered competition seasons are supported.",
          );
        this.db
          .prepare("INSERT INTO competition_seasons VALUES(?,?,?,?)")
          .run(s.id, s.name, starts, store.now());
        last = starts;
      }
    });
    this.periods = this.db
      .prepare("SELECT id,name,starts FROM competition_seasons ORDER BY starts")
      .all();
    this.cachedBoards = new Map();
  }
  current(at = this.store.now()) {
    return this.periods.findLast((s) => s.starts <= at) ?? null;
  }
  end(season) {
    return this.periods.find((s) => s.starts > season.starts)?.starts ?? null;
  }
  targetAfter(at = this.store.now()) {
    return this.current(at)?.starts ?? 0;
  }
  recordXp(player, before, after, at) {
    const season = this.current(at),
      gain = Math.max(0, after - before);
    if (!season || !gain) return;
    this.db
      .prepare(
        "INSERT INTO season_xp VALUES(?,?,?) ON CONFLICT(season,player) DO UPDATE SET xp=xp+excluded.xp",
      )
      .run(season.id, player, gain);
  }
  xp(player, season) {
    return (
      this.db
        .prepare("SELECT xp FROM season_xp WHERE season=? AND player=?")
        .get(season.id, player)?.xp ?? 0
    );
  }
  profile(player) {
    const season = this.show && this.current();
    return season ? this.describe(player, season) : null;
  }
  describe(player, season) {
    return {
      id: season.id,
      name: season.name,
      startsAt: season.starts,
      endsAt: this.end(season),
      xp: this.xp(player, season),
    };
  }
  standings(season) {
    const end = this.end(season);
    const revision = this.db
      .prepare("SELECT revision FROM snapshot_revision WHERE id=1")
      .get().revision;
    const old = this.cachedBoards.get(season.id);
    if (old?.revision === revision) return old.rows;
    let rank = 0;
    const rows = this.db
      .prepare(
        `SELECT p.id,p.name,p.look,SUM(m.points) points FROM medals m
      JOIN players p ON p.id=m.player JOIN profiles a ON a.player=p.id
      WHERE m.day>=? AND (? IS NULL OR m.day<?) AND p.id NOT IN (SELECT player FROM suspensions)
      GROUP BY p.id ORDER BY points DESC,p.id ASC`,
      )
      .all(
        day(season.starts),
        end === null ? null : day(end),
        end === null ? null : day(end),
      )
      .map((p, i, rows) => {
        if (!i || p.points !== rows[i - 1].points) rank = i + 1;
        return { ...p, look: JSON.parse(p.look), rank };
      });
    this.cachedBoards.set(season.id, { revision, rows });
    return rows;
  }
  state(player, allowed, ranked) {
    if (!this.show) return { season: null, seasonHistory: [] };
    const current = this.current();
    const project = (s) => {
      const rows = ranked ? this.standings(s).filter((p) => allowed(p.id)) : [];
      const own = rows.find((p) => p.id === player);
      return {
        ...this.describe(player, s),
        points: own?.points ?? 0,
        rank: own?.rank ?? null,
        standings: structuredClone(rows.slice(0, 50)),
      };
    };
    return {
      season: current ? project(current) : null,
      seasonHistory: this.periods
        .filter((s) => current && s.starts < current.starts)
        .map(project)
        .reverse(),
    };
  }
  export(player) {
    return this.periods
      .filter((s) => s.starts <= this.store.now())
      .map((s) => this.describe(player, s));
  }
}
