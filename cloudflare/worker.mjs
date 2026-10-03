import { DurableObject } from "cloudflare:workers";
import { createHash, randomBytes } from "node:crypto";
import { StoreCore } from "../server/store-core.mjs";
import { CommunityCore } from "../server/community-core.mjs";
import { DurableSqlite, privateStorage } from "./sqlite.mjs";
import { handleApi, json } from "./api.mjs";

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
      CREATE TABLE IF NOT EXISTS private_settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
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
      store: this.store,
      files: this.files,
      rate,
    });
  }
}
