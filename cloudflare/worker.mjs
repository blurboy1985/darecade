import { Payments } from "../server/payments.mjs";
import { DurableObject } from "cloudflare:workers";
import { createHash, randomBytes } from "node:crypto";
import { StoreCore } from "../server/store-core.mjs";
import { CommunityCore } from "../server/community-core.mjs";
import { DurableSqlite, privateStorage } from "./sqlite.mjs";
import { handleApi, json } from "./api.mjs";
import { sessionKey, sessionToken } from "./world-auth.mjs";
import { PRIVACY_VERSION } from "../server/community-core.mjs";
export { World } from "./world.mjs";

function ready(env) {
  try {
    const origin = new URL(env.PUBLIC_ORIGIN);
    return (
      env.LAUNCH_READY === "true" &&
      origin.protocol === "https:" &&
      origin.origin === env.PUBLIC_ORIGIN &&
      !!env.RESEND_API_KEY &&
      !!env.MAIL_FROM &&
      !!env.PRIVACY_CONTACT &&
      !!env.STORAGE_NOTICE
    );
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/health")
      return json(
        { service: "darecade", ready: ready(env) },
        ready(env) ? 200 : 503,
      );
    if (url.pathname.startsWith("/api/")) {
      if (!ready(env))
        return json(
          {
            error:
              "Darecade is being set up. Accounts will open once sign-in email and privacy information are ready.",
          },
          503,
        );
      if (url.origin !== env.PUBLIC_ORIGIN)
        return json({ error: "Please use the game’s main address." }, 403);
      const id = env.NEIGHBOURHOOD.idFromName("darecade-main-v1");
      const neighbourhood = env.NEIGHBOURHOOD.get(id, {
        locationHint: "apac-se",
      });
      // Replace, never trust, a client-supplied internal IP header.
      const headers = new Headers(request.headers);
      headers.set(
        "x-darecade-client-ip",
        request.headers.get("CF-Connecting-IP") || "unknown",
      );
      headers.delete("x-darecade-world-player");
      if (url.pathname.startsWith("/api/world/")) {
        if (
          (request.headers.get("origin") &&
            request.headers.get("origin") !== env.PUBLIC_ORIGIN) ||
          request.headers.get("sec-fetch-site") === "cross-site"
        )
          return json({ error: "This request came from another site." }, 403);
        if (
          ![
            "/api/world/connect",
            "/api/world/poll",
            "/api/world/leave",
          ].includes(url.pathname)
        )
          return json({ error: "Not found." }, 404);
        if (
          request.method !== (url.pathname.endsWith("connect") ? "GET" : "POST")
        )
          return json({ error: "Method not allowed." }, 405);
        let world = url.searchParams.get("world");
        if (world && !/^world-[1-9][0-9]{0,5}$/.test(world))
          return json({ error: "Invalid world." }, 400);
        if (!world || url.pathname.endsWith("connect")) {
          try {
            const identity = await neighbourhood.worldAuthorize(
              headers.get("cookie") || "",
              headers.get("x-darecade-client-ip"),
            );
            if (!identity) return json({ error: "Sign in to join." }, 401);
            world = await neighbourhood.worldChoose(identity.id, world);
            if (!world) return json({ error: "World unavailable." }, 404);
            headers.set("x-darecade-world-player", JSON.stringify(identity));
          } catch {
            return json({ error: "Please wait before joining again." }, 429);
          }
        }
        url.searchParams.set("world", world);
        return env.WORLD.get(env.WORLD.idFromName(world), {
          locationHint: "apac-se",
        }).fetch(new Request(url, new Request(request, { headers })));
      }
      return neighbourhood.fetch(new Request(request, { headers }));
    }
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method not allowed", { status: 405 });
    // Private filenames must not receive a successful SPA fallback.
    if (
      /^\/(?:data|server|cloudflare|\.env|\.git|\.dev\.vars|mail-outbox)(?:[/.]|$)/.test(
        url.pathname,
      )
    )
      return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(request);
  },
};

export class Neighbourhood extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.db = new DurableSqlite(ctx.storage);
    this.store = new StoreCore(this.db);
    this.files = privateStorage(this.db);
    this.community = new CommunityCore(this.store, {
      files: this.files,
      production: true,
      origin: env.PUBLIC_ORIGIN,
      mailMode: "resend",
      mailKey: env.RESEND_API_KEY,
      mailFrom: env.MAIL_FROM,
      privacyContact: env.PRIVACY_CONTACT,
      storageNotice: env.STORAGE_NOTICE,
    });
    this.db
      .exec(`CREATE TABLE IF NOT EXISTS request_limits(key TEXT PRIMARY KEY,n INTEGER NOT NULL,expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS private_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS worlds(name TEXT PRIMARY KEY,occupancy INTEGER NOT NULL DEFAULT 0,seen INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS world_members(player TEXT PRIMARY KEY,world TEXT NOT NULL,away INTEGER NOT NULL DEFAULT 0);
      CREATE INDEX IF NOT EXISTS world_members_world ON world_members(world);`);
    this.payments = new Payments(this.community, env);
    this.store.liveStatus = (id) => {
      const member = this.db
        .prepare(
          "SELECT m.away FROM world_members m JOIN worlds w ON w.name=m.world WHERE m.player=? AND w.seen>?",
        )
        .get(id, Date.now() - 30000);
      return member ? (member.away ? "resting" : "online") : null;
    };
    this.store.livePlayerList = (id) => this.worldPlayers(id);
    this.db
      .prepare("INSERT OR IGNORE INTO private_settings VALUES('rate-salt',?)")
      .run(randomBytes(32).toString("hex"));
    this.salt = this.db
      .prepare("SELECT value FROM private_settings WHERE key='rate-salt'")
      .get().value;
    ctx.blockConcurrencyWhile(async () => {
      if ((await ctx.storage.getAlarm()) === null)
        await ctx.storage.setAlarm(this.nextMidnight());
    });
  }
  nextMidnight() {
    return (
      Math.floor((Date.now() + 8 * 3600000) / 86400000) * 86400000 -
      8 * 3600000 +
      86400000 +
      1000
    );
  }
  async alarm() {
    this.store.settle();
    this.community.cleanup();
    this.db
      .prepare("DELETE FROM request_limits WHERE expires<=?")
      .run(Date.now());
    await this.ctx.storage.setAlarm(this.nextMidnight());
  }
  fetch(request) {
    const ip = request.headers.get("x-darecade-client-ip") || "unknown";
    const client = createHash("sha256")
      .update(this.salt + ip)
      .digest("hex");
    const rate = (scope, max, windowMs, player) => {
      const key = (player ? "player:" + player : "ip:" + client) + ":" + scope,
        now = Date.now();
      const count = this.db.transaction(() => {
        this.db
          .prepare(
            "INSERT INTO request_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=CASE WHEN expires<=? THEN 1 ELSE n+1 END,expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END",
          )
          .run(key, now + windowMs, now, now);
        return this.db
          .prepare("SELECT n FROM request_limits WHERE key=?")
          .get(key).n;
      });
      if (count > max) {
        const e = Error("Please wait before trying again.");
        e.status = 429;
        throw e;
      }
    };
    return handleApi(request, {
      community: this.community,
      payments: this.payments,
      store: this.store,
      files: this.files,
      rate,
      worlds: {
        directory: (id) => this.worldDirectory(id),
        destination: (id, data) => this.worldDestination(id, data),
        disconnect: async (id) => {
          const row = this.db
            .prepare("SELECT world FROM world_members WHERE player=?")
            .get(id);
          if (row)
            await this.env.WORLD.get(
              this.env.WORLD.idFromName(row.world),
            ).disconnect(id);
          this.db.prepare("DELETE FROM world_members WHERE player=?").run(id);
        },
        refresh: async (...ids) => {
          const names = new Set(
            ids
              .map(
                (id) =>
                  this.db
                    .prepare("SELECT world FROM world_members WHERE player=?")
                    .get(id)?.world,
              )
              .filter(Boolean),
          );
          await Promise.all(
            [...names].map((name) =>
              this.env.WORLD.get(this.env.WORLD.idFromName(name)).refresh(),
            ),
          );
        },
      },
    });
  }
  worldIdentity(id, session) {
    const p = this.db
      .prepare(
        `SELECT p.id,p.name,p.look,p.x,p.z,p.yaw,p.activity FROM players p
      JOIN profiles f ON f.player=p.id JOIN sessions s ON s.player=p.id
      WHERE p.id=? AND s.token=? AND s.expires>? AND f.consent=? AND NOT EXISTS(SELECT 1 FROM suspensions WHERE player=p.id)`,
      )
      .get(id, session, Date.now(), PRIVACY_VERSION);
    if (!p) return null;
    const blockedIds = this.db
      .prepare(
        "SELECT target id FROM blocks WHERE player=? UNION SELECT player id FROM blocks WHERE target=?",
      )
      .all(id, id)
      .map((row) => row.id);
    return {
      ...p,
      look: JSON.parse(p.look),
      blockedIds,
      suspended: false,
      session,
    };
  }
  worldAuthorize(cookie, ip) {
    const id = this.community.lookup(sessionToken(cookie));
    for (const [scope, identity, max] of [
      ["world", id || ip || "unknown", 360],
      ["world-ip", ip || "unknown", 3000],
    ]) {
      const key =
        scope +
        ":" +
        createHash("sha256")
          .update(this.salt + identity)
          .digest("hex");
      this.db
        .prepare(
          "INSERT INTO request_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=CASE WHEN expires<=? THEN 1 ELSE n+1 END,expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END",
        )
        .run(key, Date.now() + 60000, Date.now(), Date.now());
      if (
        this.db.prepare("SELECT n FROM request_limits WHERE key=?").get(key).n >
        max
      )
        throw Error("Too many joins");
    }
    return id ? this.worldIdentity(id, sessionKey(cookie)) : null;
  }
  async worldChoose(id, requested) {
    if (requested)
      return (
        this.db.prepare("SELECT name FROM worlds WHERE name=?").get(requested)
          ?.name || null
      );
    const existing = this.db
      .prepare("SELECT world FROM world_members WHERE player=?")
      .get(id);
    if (existing) return existing.world;
    const available = this.db
      .prepare(
        "SELECT name FROM worlds WHERE occupancy<25 OR seen<=? ORDER BY CASE WHEN seen>? THEN occupancy ELSE 0 END DESC,CAST(substr(name,7) AS INTEGER) LIMIT 1",
      )
      .get(Date.now() - 30000, Date.now() - 30000);
    if (available) return available.name;
    const name =
      "world-" + (this.db.prepare("SELECT COUNT(*) n FROM worlds").get().n + 1);
    this.db.prepare("INSERT INTO worlds(name) VALUES(?)").run(name);
    return name;
  }
  worldDirectory(id) {
    // Room counts are approximate; the destination World enforces its hard cap.
    const cutoff = Date.now() - 30000;
    const worlds = this.db
      .prepare(
        `SELECT name id,CASE WHEN seen>? THEN occupancy ELSE 0 END count
      FROM worlds ORDER BY CAST(substr(name,7) AS INTEGER)`,
      )
      .all(cutoff);
    const neighbours = this.db
      .prepare(
        `SELECT p.id,p.name,m.world FROM world_members m
      JOIN worlds w ON w.name=m.world JOIN players p ON p.id=m.player
      JOIN profiles f ON f.player=p.id WHERE w.seen>? AND p.id!=? AND f.consent=?
      AND NOT EXISTS(SELECT 1 FROM suspensions WHERE player=p.id)
      AND p.id NOT IN(SELECT target FROM blocks WHERE player=? UNION SELECT player FROM blocks WHERE target=?)
      ORDER BY p.seen DESC,p.id LIMIT 40`,
      )
      .all(cutoff, id, PRIVACY_VERSION, id, id);
    return {
      worlds: worlds.map((w) => ({ ...w, code: "W" + w.id.slice(6) })),
      neighbours,
    };
  }
  worldDestination(id, { world, friend }) {
    let name = world;
    if (friend) {
      // Use the same bilateral privacy filter without revealing a hidden player's room.
      name = this.db
        .prepare(
          `SELECT m.world FROM world_members m JOIN worlds w ON w.name=m.world
        JOIN profiles f ON f.player=m.player WHERE m.player=? AND w.seen>? AND f.consent=?
        AND NOT EXISTS(SELECT 1 FROM suspensions WHERE player=m.player)
        AND NOT EXISTS(SELECT 1 FROM blocks WHERE (player=? AND target=?) OR (player=? AND target=?))`,
        )
        .get(
          friend,
          Date.now() - 30000,
          PRIVACY_VERSION,
          id,
          friend,
          friend,
          id,
        )?.world;
    }
    if (typeof name !== "string" || !/^world-[1-9][0-9]{0,5}$/.test(name))
      throw Error("That neighbour or world is unavailable.");
    const row = this.db
      .prepare("SELECT occupancy,seen FROM worlds WHERE name=?")
      .get(name);
    if (!row) throw Error("That world is unavailable.");
    const current = this.db
      .prepare("SELECT world FROM world_members WHERE player=?")
      .get(id)?.world;
    if (
      current !== name &&
      row.seen > Date.now() - 30000 &&
      row.occupancy >= 30
    )
      throw Error("This world is full. Try another world.");
    return name;
  }
  worldRefresh(players) {
    return players
      .map((p) => this.worldIdentity(p.id, p.session))
      .filter(Boolean);
  }
  async worldArrive(name, id) {
    const old = this.db
      .prepare("SELECT world FROM world_members WHERE player=?")
      .get(id)?.world;
    if (old && old !== name)
      await this.env.WORLD.get(this.env.WORLD.idFromName(old)).disconnect(id);
    this.db
      .prepare("INSERT OR REPLACE INTO world_members(player,world) VALUES(?,?)")
      .run(id, name);
  }
  worldOccupancy(name, players) {
    this.db
      .prepare(
        "INSERT INTO worlds VALUES(?,?,?) ON CONFLICT(name) DO UPDATE SET occupancy=excluded.occupancy,seen=excluded.seen",
      )
      .run(name, players.length, Date.now());
    for (const { id, away } of players)
      this.db
        .prepare(
          "UPDATE world_members SET away=? WHERE player=? AND world=? AND away!=?",
        )
        .run(Number(away), id, name, Number(away));
  }
  worldDepart(name, id) {
    this.db
      .prepare("DELETE FROM world_members WHERE player=? AND world=?")
      .run(id, name);
  }
  worldPlayers(id) {
    const name = this.db
      .prepare("SELECT world FROM world_members WHERE player=?")
      .get(id)?.world;
    if (!name) return null;
    const allowed = `NOT EXISTS(SELECT 1 FROM suspensions WHERE player=p.id)
      AND EXISTS(SELECT 1 FROM profiles WHERE player=p.id AND consent=?)
      AND p.id NOT IN (SELECT target FROM blocks WHERE player=? UNION SELECT player FROM blocks WHERE target=?)`;
    const live = this.db
      .prepare(
        `SELECT p.id,p.name,p.look,p.activity,p.since,p.x,p.z,p.yaw,p.seen,
      CASE WHEN m.away=1 THEN 'resting' ELSE 'online' END status FROM world_members m
      JOIN players p ON p.id=m.player JOIN worlds w ON w.name=m.world
      WHERE m.world=? AND w.seen>? AND ${allowed} ORDER BY p.seen DESC LIMIT 30`,
      )
      .all(name, Date.now() - 30000, PRIVACY_VERSION, id, id);
    const away = this.db
      .prepare(
        `SELECT p.id,p.name,p.look,p.activity,p.since,p.x,p.z,p.yaw,p.seen,'offline' status
      FROM players p WHERE ${allowed} AND NOT EXISTS(SELECT 1 FROM world_members m JOIN worlds w ON w.name=m.world
      WHERE m.player=p.id AND w.seen>? AND (m.world=? OR m.away=0)) ORDER BY p.seen DESC LIMIT 8`,
      )
      .all(PRIVACY_VERSION, id, id, Date.now() - 30000, name);
    return [...live, ...away].map((p) => this.store.publicPlayer(p, true));
  }
  worldSave(name, players, leaving) {
    for (const p of players)
      if (this.db.prepare("SELECT 1 FROM players WHERE id=?").get(p.id))
        this.store.heartbeat(p.id, { ...p, connection: name }, leaving);
  }
}
