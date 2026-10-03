import { DatabaseSync } from "node:sqlite";
import { StoreCore } from "./store-core.mjs";
export { day, gameIds } from "./store-core.mjs";
export class Store extends StoreCore {
  constructor(path, now = Date.now) {
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;");
    super(db, now);
  }
}
