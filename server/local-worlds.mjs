import { WorldState } from "./world-core.mjs";

// The Node preview uses the same protocol over HTTP; Cloudflare supplies sockets.
export class LocalWorlds {
  worlds = new Map();
  constructor(community) {
    this.community = community;
    this.store = community.store;
    this.store.liveStatus = (id) => {
      for (const world of this.worlds.values()) {
        const p = world.players.get(id);
        if (p && Date.now() - p.seen < 15000)
          return p.away ? "resting" : "online";
      }
      return null;
    };
  }
  leave(id) {
    for (const [name, world] of this.worlds) {
      const p = world.players.get(id);
      if (
        p &&
        this.store.db.prepare("SELECT 1 FROM players WHERE id=?").get(id)
      )
        this.store.heartbeat(id, { ...p, connection: name }, true);
      world.players.delete(id);
    }
  }
  poll(id, name, data) {
    const db = this.store.db;
    for (const world of this.worlds.values())
      for (const p of [...world.players.values()]) {
        if (
          Date.now() - p.seen > 15000 ||
          !db.prepare("SELECT 1 FROM players WHERE id=?").get(p.id) ||
          db.prepare("SELECT 1 FROM suspensions WHERE player=?").get(p.id)
        )
          world.players.delete(p.id);
        else
          p.blockedIds = db
            .prepare(
              "SELECT target id FROM blocks WHERE player=? UNION SELECT player id FROM blocks WHERE target=?",
            )
            .all(p.id, p.id)
            .map((r) => r.id);
      }
    if (!name)
      name =
        [...this.worlds].find(([, w]) => w.players.has(id))?.[0] ||
        [...this.worlds]
          .sort((a, b) => b[1].players.size - a[1].players.size)
          .find(([, w]) => w.players.size < 25)?.[0];
    if (!name) {
      name = `world-${this.worlds.size + 1}`;
      this.worlds.set(name, new WorldState());
    }
    const world = this.worlds.get(name);
    if (!world) throw Error("World unavailable.");
    let p = world.players.get(id);
    if (!p) {
      const row = db
        .prepare("SELECT id,name,look,x,z,yaw,activity FROM players WHERE id=?")
        .get(id);
      p = world.join({
        ...row,
        look: JSON.parse(row.look),
        blockedIds: db
          .prepare(
            "SELECT target id FROM blocks WHERE player=? UNION SELECT player id FROM blocks WHERE target=?",
          )
          .all(id, id)
          .map((r) => r.id),
      });
    }
    if (!p) {
      const error = Error("This world is full.");
      error.status = 409;
      throw error;
    }
    world.move(id, data);
    p.seen = Date.now();
    if (!p.saved || Date.now() - p.saved >= 30000) {
      this.store.heartbeat(id, { ...p, connection: name });
      p.saved = Date.now();
    }
    return { ...world.snapshot(id, new Map(), true), world: name };
  }
}
