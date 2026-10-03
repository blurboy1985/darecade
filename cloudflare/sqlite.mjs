// The same game rules run on Node SQLite locally and Durable Object SQLite online.
export class DurableSqlite {
  constructor(storage) {
    this.storage = storage;
  }
  exec(sql) {
    this.storage.sql.exec(sql).toArray();
  }
  prepare(sql) {
    const execute = (...args) => this.storage.sql.exec(sql, ...args);
    return {
      all: (...args) => execute(...args).toArray(),
      get: (...args) => execute(...args).toArray()[0],
      run: (...args) => {
        execute(...args).toArray();
      },
    };
  }
  transaction(fn) {
    return this.storage.transactionSync(fn);
  }
  close() {}
}

export function privateStorage(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS playtest_feedback(id TEXT PRIMARY KEY, player TEXT REFERENCES players(id), data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS feedback_player ON playtest_feedback(player);`);
  return {
    writeOutbox() {
      throw Error("Local email outboxes are unavailable on the hosted game.");
    },
    removeOutbox() {},
    playtests(player) {
      return db
        .prepare("SELECT id,data FROM playtest_feedback WHERE player=?")
        .all(player)
        .map((r) => ({ path: r.id, data: JSON.parse(r.data) }));
    },
    removePlaytest(id) {
      db.prepare("DELETE FROM playtest_feedback WHERE id=?").run(id);
    },
    cleanup() {},
    saveFeedback(data) {
      db.prepare("INSERT INTO playtest_feedback VALUES(?,?,?)").run(
        data.id,
        data.player,
        JSON.stringify(data),
      );
    },
  };
}
