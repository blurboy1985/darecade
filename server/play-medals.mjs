import { day } from "./store-core.mjs";
import { PLAY_MEDAL_DAILY_LIMIT } from "../shared/play-medals.ts";

/** Personal completion awards. These never enter competitive or token ledgers. */
export class PlayMedals {
  constructor(db) {
    this.db = db;
    db.exec(`CREATE TABLE IF NOT EXISTS play_medals(
      player TEXT NOT NULL REFERENCES players(id),
      day TEXT NOT NULL,
      game TEXT NOT NULL,
      run TEXT NOT NULL UNIQUE REFERENCES runs(id),
      PRIMARY KEY(player,day,game)
    )`);
  }
  progress(player, at) {
    const date = day(at);
    const games = this.db
      .prepare(
        "SELECT game FROM play_medals WHERE player=? AND day=? ORDER BY game",
      )
      .all(player, date)
      .map((row) => row.game);
    const total = this.db
      .prepare("SELECT COUNT(*) n FROM play_medals WHERE player=?")
      .get(player).n;
    return {
      day: date,
      total,
      today: games.length,
      games,
      limit: PLAY_MEDAL_DAILY_LIMIT,
    };
  }
  earned(player, run) {
    return this.db
      .prepare("SELECT 1 FROM play_medals WHERE player=? AND run=?")
      .get(player, run)
      ? 1
      : 0;
  }
  /** Called inside the same transaction that accepts the validated finish. */
  award(player, run, game, at, eligible) {
    if (!eligible) return 0;
    const p = this.progress(player, at);
    if (p.today >= p.limit || p.games.includes(game)) return 0;
    this.db
      .prepare("INSERT INTO play_medals(player,day,game,run) VALUES(?,?,?,?)")
      .run(player, p.day, game, run);
    return 1;
  }
}
