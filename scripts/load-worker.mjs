// Only imported by wrangler.load.jsonc. Never import this fixture in the app.
import app, {
  Neighbourhood as Records,
  World as AppWorld,
} from "../cloudflare/worker.mjs";
import { LoadMetrics, measuredContext } from "./load-metrics.mjs";
import { PRIVACY_VERSION } from "../server/community-core.mjs";
import { day } from "../server/store-core.mjs";

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
    if (url.pathname === "/__load/world-metrics" && request.method === "POST") {
      const { worlds, reset = false } = await request.json();
      if (
        !Array.isArray(worlds) ||
        worlds.length > 300 ||
        worlds.some((name) => !/^world-[1-9][0-9]{0,5}$/.test(name))
      )
        return new Response("Invalid fixture worlds", { status: 400 });
      return Response.json(
        Object.fromEntries(
          await Promise.all(
            worlds.map(async (name) => [
              name,
              await env.WORLD.get(env.WORLD.idFromName(name)).metrics(reset),
            ]),
          ),
        ),
      );
    }
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
    this.measurement = new LoadMetrics();
    const execute = (sql, args) => {
      const cursor = ctx.storage.sql.exec(sql, ...args);
      const rows = cursor.toArray();
      this.measurement.sql(sql, cursor);
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
  fetch(request) {
    return this.measurement.invoke(new URL(request.url).pathname, () =>
      super.fetch(request),
    );
  }
  alarm() {
    return this.measurement.invoke("alarm", () => super.alarm());
  }
  worldAuthorize(...args) {
    return this.measurement.invoke("worldAuthorize", () =>
      super.worldAuthorize(...args),
    );
  }
  worldChoose(...args) {
    return this.measurement.invoke("worldChoose", () =>
      super.worldChoose(...args),
    );
  }
  worldArrive(...args) {
    return this.measurement.invoke("worldArrive", () =>
      super.worldArrive(...args),
    );
  }
  worldDepart(...args) {
    return this.measurement.invoke("worldDepart", () =>
      super.worldDepart(...args),
    );
  }
  worldOccupancy(...args) {
    return this.measurement.invoke("worldOccupancy", () =>
      super.worldOccupancy(...args),
    );
  }
  worldRefresh(...args) {
    return this.measurement.invoke("worldRefresh", () =>
      super.worldRefresh(...args),
    );
  }
  worldSave(...args) {
    return this.measurement.invoke("worldSave", () => super.worldSave(...args));
  }
  metrics(reset) {
    return this.measurement.snapshot(reset);
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

// Only this fixture exports the measured World. Production imports AppWorld.
export class World extends AppWorld {
  constructor(ctx, env) {
    const measurement = new LoadMetrics();
    super(ctx, env);
    // The native DurableObject constructor requires its original branded state.
    // Only application accesses are wrapped; constructor setup is excluded.
    Object.defineProperty(this, "ctx", {
      value: measuredContext(ctx, measurement),
    });
    this.measurement = measurement;
  }
  fetch(request) {
    return this.measurement.invoke(new URL(request.url).pathname, () =>
      super.fetch(request),
    );
  }
  webSocketMessage(...args) {
    return this.measurement.invoke("webSocketMessage", () =>
      super.webSocketMessage(...args),
    );
  }
  webSocketClose(...args) {
    return this.measurement.invoke("webSocketClose", () =>
      super.webSocketClose(...args),
    );
  }
  webSocketError(...args) {
    return this.measurement.invoke("webSocketError", () =>
      super.webSocketError(...args),
    );
  }
  alarm() {
    return this.measurement.invoke("alarm", () => super.alarm());
  }
  refresh(...args) {
    return this.measurement.invoke("refresh", () => super.refresh(...args));
  }
  disconnect(...args) {
    return this.measurement.invoke("disconnect", () =>
      super.disconnect(...args),
    );
  }
  metrics(reset) {
    const { instanceId, calls, operations, storageOperations } =
      this.measurement.snapshot(reset);
    return {
      instanceId,
      calls,
      operations: Object.fromEntries(
        Object.entries(operations).map(([name, value]) => [
          name,
          { calls: value.calls, storageOperations: value.storageOperations },
        ]),
      ),
      storageOperations,
      storageUnit:
        "API operation counts, not SQL rows or billed storage operations; in-memory fixture counters reset on object eviction",
    };
  }
}
