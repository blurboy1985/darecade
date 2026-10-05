import { RELAY_TICK_BUDGET } from "../shared/relay-protocol.ts";
import { Payments, paymentBody } from "./payments.mjs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
import { Store } from "./store.mjs";
import { Community } from "./community.mjs";
import { LocalWorlds } from "./local-worlds.mjs";

const dir = resolve(process.env.DARECADE_DATA || "data");
mkdirSync(dir, { recursive: true });
const store = new Store(resolve(dir, "neighbourhood.sqlite"));
const production = process.env.NODE_ENV === "production";
const origin =
  process.env.PUBLIC_ORIGIN ||
  `http://${process.env.LAN_HOST || "127.0.0.1"}:${process.env.PORT || 4173}`;
const community = new Community(store, {
  directory: dir,
  origin,
  production,
  competitionSeasons: process.env.COMPETITION_SEASONS || "[]",
  seasonView: process.env.SEASON_VIEW === "true",
  mailMode: process.env.MAIL_MODE || "outbox",
  mailKey: process.env.RESEND_API_KEY || "",
  mailFrom: process.env.MAIL_FROM || "",
  privacyContact: process.env.PRIVACY_CONTACT || "",
  storageNotice: process.env.STORAGE_NOTICE || undefined,
});
const payments = new Payments(community, process.env);
const origins = new Set([
  origin,
  `http://127.0.0.1:${process.env.PORT || 4173}`,
  ...(!production ? ["http://localhost:5173", "http://127.0.0.1:5173"] : []),
]);
const worlds = new LocalWorlds(community);
const limits = new Map();
function rate(req, key, max, windowMs, player) {
  const bucket = `${player ? "player:" + player : "ip:" + req.socket.remoteAddress}:${key}`,
    now = Date.now();
  let r = limits.get(bucket);
  if (!r || r.until <= now) {
    r = { n: 0, until: now + windowMs };
    limits.set(bucket, r);
  }
  if (++r.n > max) {
    const e = Error("Please wait before trying again.");
    e.status = 429;
    throw e;
  }
}
function cookie(res, token) {
  res.setHeader(
    "Set-Cookie",
    `darecade_session=${token || ""}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 2592000 : 0}${production ? "; Secure" : ""}`,
  );
}
const root = resolve(process.env.STATIC_DIR || "dist");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
const handler = async (req, res) => {
  try {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const url = new URL(req.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
      if (url.pathname === "/api/payments/webhook" && req.method === "POST") {
        rate(req, "payment-webhook", 180, 60000);
        const result = await payments.webhook(
          await paymentBody(req),
          req.headers["stripe-signature"],
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
        return;
      }
      if (req.headers.origin && !origins.has(req.headers.origin)) {
        res.writeHead(403);
        res.end();
        return;
      }
      let data = {};
      rate(req, "api-ip", 3000, 60000);
      if (req.method === "POST") {
        if (!req.headers["content-type"]?.startsWith("application/json"))
          throw Error("Send JSON data.");
        let raw = "";
        for await (const chunk of req) {
          raw += chunk;
          if (raw.length > (url.pathname === "/api/finish" ? 262144 : 8192))
            throw Error("Request too large.");
        }
        data = JSON.parse(raw || "{}");
      }
      const token = req.headers.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("darecade_session="))
        ?.slice(17);
      const player = community.lookup(token);
      rate(req, "api", 360, 60000, player);
      const respond = (result) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(result));
      };
      if (req.method === "GET" && url.pathname === "/api/auth/config") {
        respond(community.config());
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/auth/check") {
        rate(req, "age", 12, 900000);
        community.eligible(data.month, data.year);
        respond({ ok: true });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/auth/login-code") {
        rate(req, "email", 6, 900000);
        respond(await community.requestExistingCode(data.email));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/auth/join") {
        rate(req, "join", 12, 900000);
        const joined = community.join(data, token);
        cookie(res, joined.token);
        respond(joined.me);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/auth/verify") {
        rate(req, "verify", 12, 900000);
        const signed = community.verifyCode(data.email, data.code, {
          switchAccount: data.switchAccount === true,
        });
        // No session changes until the player chooses which character to keep.
        if (signed.conflict) {
          respond({ conflict: signed.conflict });
          return;
        }
        cookie(res, signed.token);
        respond(signed.me);
        return;
      }
      if (!player) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: "Please complete the welcome check or sign in.",
          }),
        );
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/payments/config") {
        respond(payments.config());
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/payments/history") {
        respond(payments.history(player));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/payments/checkout") {
        rate(req, "checkout", 6, 60000, player);
        respond(await payments.checkout(player, data.product));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/payments/status") {
        rate(req, "payment-status", 12, 60000, player);
        respond(await payments.reconcile(data.session, player));
        return;
      }
      const session = { id: player };
      if (url.pathname.startsWith("/api/relay/")) {
        if (req.method !== "POST") {
          res.writeHead(405);
          res.end();
          return;
        }
        const action = url.pathname.slice("/api/relay/".length);
        rate(
          req,
          "relay:" + action,
          action === "tick"
            ? RELAY_TICK_BUDGET
            : action === "create"
              ? 6
              : action === "join"
                ? 12
                : 30,
          60000,
          player,
        );
        respond(community.relay.request(player, action, data, token));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/worlds") {
        respond(worlds.directory(player));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/worlds/join") {
        respond({ world: worlds.destination(player, data) });
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/world/poll") {
        respond(worlds.poll(player, url.searchParams.get("world"), data));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/world/leave") {
        worlds.leave(player);
        respond({ ok: true });
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/auth/me") {
        respond(community.privateProfile(player));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/auth/code") {
        rate(req, "email", 6, 900000);
        respond(await community.requestCode(player, data.email));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/auth/logout") {
        worlds.leave(player);
        const result = community.logout(player, token);
        cookie(res, null);
        respond(result);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/privacy/export") {
        respond(community.export(player));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/privacy/delete") {
        if (data.confirm !== "DELETE") throw Error("Confirm account deletion.");
        worlds.leave(player);
        const result = community.delete(player);
        cookie(res, null);
        respond(result);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/profile") {
        respond(community.patch(player, data));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/progress") {
        respond(community.progression(player, data.event, data.value));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/invite") {
        respond(community.invite(player));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/invite/accept") {
        respond(community.acceptInvite(player, data.code));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/style-rewards") {
        respond(community.takeStyleRewards(player));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/friends") {
        respond(community.saveFriend(player, data.name));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/dares") {
        respond(community.postDare(player, data.run));
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/report") {
        respond(community.report(player, data.target, data.reason));
        return;
      }
      let result;
      if (req.method === "POST" && url.pathname === "/api/playtest") {
        if (
          !data.answers ||
          typeof data.answers.device !== "string" ||
          !data.measurements
        )
          throw Error("Complete the phone test first.");
        const id = randomUUID();
        const reports = resolve(dir, "playtests");
        mkdirSync(reports, { recursive: true });
        writeFileSync(
          resolve(reports, id + ".json"),
          JSON.stringify(
            {
              id,
              player,
              savedAt: new Date().toISOString(),
              answers: data.answers,
              measurements: data.measurements,
            },
            null,
            2,
          ),
          { flag: "wx" },
        );
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ id }));
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/state")
        result = community.state(session.id);
      else if (req.method === "POST" && url.pathname === "/api/presence") {
        store.heartbeat(session.id, {
          ...data,
          look: JSON.parse(
            store.db.prepare("SELECT look FROM players WHERE id=?").get(player)
              .look,
          ),
        });
        result = community.presence(session.id);
      } else if (req.method === "POST" && url.pathname === "/api/leave") {
        store.heartbeat(
          session.id,
          {
            ...data,
            look: JSON.parse(
              store.db
                .prepare("SELECT look FROM players WHERE id=?")
                .get(player).look,
            ),
          },
          true,
        );
        result = { ok: true };
      } else if (req.method === "POST" && url.pathname === "/api/run")
        result = community.begin(
          session.id,
          data.game,
          data.target,
          data.dare,
          data.targetRun,
        );
      else if (req.method === "POST" && url.pathname === "/api/finish")
        result = community.finish(session.id, data);
      else if (req.method === "POST" && url.pathname === "/api/abandon") {
        store.abandon(session.id, data.id);
        result = { ok: true };
      } else {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(result));
      return;
    }
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      res.end();
      return;
    }
    let path = resolve(root, "." + decodeURIComponent(url.pathname));
    if (path !== root && !path.startsWith(root + sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (path === root || !extname(path)) path = resolve(root, "index.html");
    if (!existsSync(path)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[extname(path)] || "application/octet-stream",
      "Cache-Control":
        extname(path) === ".html" ? "no-cache" : "public,max-age=3600",
    });
    res.end(req.method === "HEAD" ? undefined : readFileSync(path));
  } catch (e) {
    res.writeHead(e.status || 400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({ error: e.message || "Unable to complete request." }),
    );
  }
};
const server = createServer(handler);
const lanServer = process.env.LAN_HOST ? createServer(handler) : null;
for (const preview of [server, lanServer])
  preview?.on("upgrade", (_req, socket) =>
    socket.end("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n"),
  );
lanServer?.listen(Number(process.env.PORT || 4173), process.env.LAN_HOST, () =>
  console.log(
    `Phone playtest ready at http://${process.env.LAN_HOST}:${process.env.PORT || 4173}/?playtest=1`,
  ),
);
const timer = setInterval(() => {
  store.settle();
  community.cleanup();
  void community.medalRewards.deliver();
  for (const [k, v] of limits) if (v.until < Date.now()) limits.delete(k);
}, 30000);
timer.unref();
server.listen(Number(process.env.PORT || 4173), "127.0.0.1", () =>
  console.log(
    `Play Simi neighbourhood ready at http://127.0.0.1:${process.env.PORT || 4173}`,
  ),
);
process.on("SIGINT", () => {
  clearInterval(timer);
  lanServer?.close();
  server.close(() => {
    store.close();
    process.exit();
  });
});
