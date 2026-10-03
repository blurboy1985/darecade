// Only imported by wrangler.load.jsonc. Never import this fixture in the app.
import app, { Neighbourhood as Records, World } from "../cloudflare/worker.mjs";
import { PRIVACY_VERSION } from "../server/community-core.mjs";
import { day } from "../server/store-core.mjs";
export { World };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (
      env.LOAD_TEST_LOCAL !== "true" ||
      !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
    )
      return new Response("Local load fixture only", { status: 403 });
    const records = env.NEIGHBOURHOOD.get(
      env.NEIGHBOURHOOD.idFromName("darecade-main-v1"),
    );
    if (url.pathname === "/__load/health")
      return Response.json({ fixture: "darecade-local-load-v1" });
    if (url.pathname === "/__load/seed" && request.method === "POST")
      return Response.json(await records.seed(await request.json()));
    if (url.pathname === "/__load/metrics")
      return Response.json(await records.metrics(request.method === "POST"));
    // All test requests still pass through the actual Worker and session validation.
    url.protocol = "https:";
    url.host = "load.darecade.invalid";
    url.port = "";
    const headers = new Headers(request.headers);
    if (headers.has("origin")) headers.set("origin", env.PUBLIC_ORIGIN);
    return app.fetch(
      new Request(url, new Request(request, { headers })),
      env,
      ctx,
    );
  },
};

export class Neighbourhood extends Records {
  constructor(ctx, env) {
    super(ctx, env);
    this.counts = { calls: {}, rowsRead: 0, rowsWritten: 0 };
    const execute = (sql, args) => {
      const cursor = ctx.storage.sql.exec(sql, ...args);
      const rows = cursor.toArray();
      this.counts.rowsRead += cursor.rowsRead;
      this.counts.rowsWritten += cursor.rowsWritten;
      return rows;
    };
    this.db.prepare = (sql) => ({
      all: (...args) => execute(sql, args),
      get: (...args) => execute(sql, args)[0],
      run: (...args) => {
        execute(sql, args);
      },
    });
    this.db.exec = (sql) => {
      execute(sql, []);
    };
  }
  count(name) {
    this.counts.calls[name] = (this.counts.calls[name] || 0) + 1;
  }
  fetch(request) {
    this.count(new URL(request.url).pathname);
    return super.fetch(request);
  }
  worldAuthorize(...args) {
    this.count("worldAuthorize");
    return super.worldAuthorize(...args);
  }
  worldChoose(...args) {
    this.count("worldChoose");
    return super.worldChoose(...args);
  }
  worldArrive(...args) {
    this.count("worldArrive");
    return super.worldArrive(...args);
  }
  worldDepart(...args) {
    this.count("worldDepart");
    return super.worldDepart(...args);
  }
  worldOccupancy(...args) {
    this.count("worldOccupancy");
    return super.worldOccupancy(...args);
  }
  worldRefresh(...args) {
    this.count("worldRefresh");
    return super.worldRefresh(...args);
  }
  worldSave(...args) {
    this.count("worldSave");
    return super.worldSave(...args);
  }
  metrics(reset) {
    const result = this.counts;
    if (reset) this.counts = { calls: {}, rowsRead: 0, rowsWritten: 0 };
    return result;
  }
  seed({ players = 150, registered = 1000, runs = 20000 }) {
    if (this.db.prepare("SELECT COUNT(*) n FROM players").get().n)
      throw Error("Use a fresh disposable persistence directory.");
    if (
      !Number.isInteger(players) ||
      players < 1 ||
      players > 300 ||
      registered < players ||
      registered > 2000 ||
      runs < 0 ||
      runs > 40000
    )
      throw Error("Invalid fixture size.");
    const users = [];
    this.store.transaction(() => {
      for (let n = 0; n < registered; n++) {
        const joined = this.community.join({
          month: 1,
          year: 2000,
          consent: true,
          privacyVersion: PRIVACY_VERSION,
        });
        this.db
          .prepare("UPDATE players SET name=? WHERE id=?")
          .run(`Load neighbour ${n}`, joined.me.id);
        this.db
          .prepare("INSERT INTO accounts VALUES(?,?,?)")
          .run(joined.me.id, `load-${n}@example.test`, Date.now() - 86400001);
        users.push({
          id: joined.me.id,
          cookie: `darecade_session=${joined.token}`,
        });
      }
      const run = this.db
        .prepare(`INSERT INTO runs(id,player,game,started,finished,score,day,status,verified,eligible,version)
        VALUES(?,?,?,?,?,?,?,'finished',1,1,1)`);
      for (let n = 0; n < runs; n++)
        run.run(
          `load-run-${n}`,
          users[n % registered].id,
          ["noodle", "hop", "brick", "swarm"][Math.floor(n / registered) % 4],
          Date.now() - 100000,
          Date.now() - 1000,
          (n % 200) + 1,
          day(Date.now()),
        );
    });
    return users.slice(0, players);
  }
}
