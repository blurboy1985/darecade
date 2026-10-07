import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { PRIVACY_VERSION } from "../server/community-core.mjs";

const origin = "https://relay.example.test";
const consent = {
  month: 1,
  year: 2000,
  consent: true,
  privacyVersion: PRIVACY_VERSION,
};
function runtime() {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "relay-runtime-test",
      unsafeInspectDurableObjects: true,
      modules: [
        { type: "ESModule", path: "tests/relay-worker.mjs" },
        { type: "ESModule", path: ".browser/cloudflare-bundle/worker.js" },
      ],
      scriptPath: "tests/relay-worker.mjs",
      compatibilityDate: "2026-10-03",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: {
        NEIGHBOURHOOD: { className: "RelayNeighbourhood", useSQLite: true },
        WORLD: { className: "World", useSQLite: true },
      },
      bindings: {
        LAUNCH_READY: "true",
        PUBLIC_ORIGIN: origin,
        RESEND_API_KEY: "test-only-key",
        MAIL_FROM: "Play Simi <hello@example.test>",
        PRIVACY_CONTACT: "privacy@example.test",
        STORAGE_NOTICE: "Synthetic local Relay runtime.",
      },
      serviceBindings: { ASSETS: () => new Response("fixture") },
      outboundService: () => {
        throw Error("Relay must not send mail or make external requests.");
      },
    }),
  );
  const api = async (path, data, cookie = "") => {
    const response = await mf.dispatchFetch(origin + "/api/" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        Origin: origin,
        "CF-Connecting-IP": "192.0.2.32",
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
    };
  };
  const object = async () => {
    const ns = await mf.getDurableObjectNamespace("NEIGHBOURHOOD");
    return ns.get(ns.idFromName("darecade-main-v1"));
  };
  const sql = () =>
    mf.unsafeGetDurableObjectStorage(
      "relay-runtime-test",
      "RelayNeighbourhood",
      { name: "darecade-main-v1" },
    );
  return { mf, api, object, sql };
}

test(
  "retired Cloudflare Relay routes return 410 without changing player data",
  { timeout: 30000 },
  async () => {
    const r = runtime();
    try {
      const a = await r.api("auth/join", consent);
      assert.equal(a.status, 200);
      const before = (await r.api("privacy/export", undefined, a.cookie)).data;
      assert.equal((await r.api("relay/create", {})).status, 401);
      assert.equal(
        (await r.api("relay/create", undefined, a.cookie)).status,
        405,
      );
      for (const action of [
        "create",
        "join",
        "ready",
        "start",
        "tick",
        "leave",
      ]) {
        const result = await r.api("relay/" + action, {}, a.cookie);
        assert.equal(result.status, 410, action);
        assert.match(result.data.error, /has been removed/);
      }
      const db = await r.sql();
      assert.equal(
        (await db.exec("SELECT count(*) n FROM relay_rooms"))[0].n,
        0,
      );
      assert.equal(
        (await db.exec("SELECT count(*) n FROM relay_members"))[0].n,
        0,
      );
      const after = (await r.api("privacy/export", undefined, a.cookie)).data;
      assert.deepEqual(after.profile.progress, before.profile.progress);
      assert.deepEqual(after.rounds, before.rounds);
      assert.deepEqual(after.medals, before.medals);
      assert.equal(
        (await r.api("privacy/delete", { confirm: "DELETE" }, a.cookie)).status,
        200,
      );
      assert.equal((await r.api("auth/me", undefined, a.cookie)).status, 401);
    } finally {
      await r.mf.dispose();
    }
  },
);

test(
  "real Durable Object schedules waiting-room expiry and removes idle rooms without client polling",
  { timeout: 30000 },
  async () => {
    const r = runtime();
    try {
      const a = await r.api("auth/join", consent);
      const stub = await r.object();
      const created = {
        data: await stub.seedLegacyRelay(a.cookie.split("=")[1]),
      };
      const alarm = await stub.relayAlarm();
      assert.equal(alarm.expiresAt, created.data.expiresAt);
      assert.ok(
        alarm.at <= created.data.expiresAt && alarm.at > created.data.serverAt,
      );
      await stub.runRelayAlarm(created.data.expiresAt);
      const db = await r.sql();
      assert.equal(
        (await db.exec("SELECT count(*) n FROM relay_rooms"))[0].n,
        0,
      );
      assert.equal(
        (await db.exec("SELECT count(*) n FROM relay_members"))[0].n,
        0,
      );
      assert.equal(
        (await r.api("relay/join", { room: created.data.room }, a.cookie))
          .status,
        410,
      );
    } finally {
      await r.mf.dispose();
    }
  },
);
