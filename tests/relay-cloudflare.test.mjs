import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  "real Cloudflare Relay routes share authoritative SQLite state, epochs and privacy cancellation",
  { timeout: 30000 },
  async () => {
    const r = runtime();
    try {
      const a = await r.api("auth/join", consent),
        b = await r.api("auth/join", consent);
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      const before = (await r.api("privacy/export", undefined, a.cookie)).data;
      assert.equal(
        (await r.api("relay/create", { solo: false, difficulty: "standard" }))
          .status,
        401,
      );
      const created = await r.api(
        "relay/create",
        { solo: false, difficulty: "standard" },
        a.cookie,
      );
      assert.equal(created.status, 200);
      const db = await r.sql(),
        stored = await db.exec(
          "SELECT code_hash FROM relay_rooms WHERE id=?",
          created.data.room,
        );
      assert.equal(
        stored[0].code_hash,
        createHash("sha256").update(created.data.code).digest("hex"),
      );
      const joined = await r.api(
        "relay/join",
        { code: created.data.code.toLowerCase() },
        b.cookie,
      );
      assert.equal(joined.status, 200);
      assert.equal(joined.data.players.length, 2);
      assert.equal(joined.data.code, undefined);
      await r.api(
        "relay/ready",
        { room: created.data.room, ready: true },
        a.cookie,
      );
      await r.api(
        "relay/ready",
        { room: created.data.room, ready: true },
        b.cookie,
      );
      const running = await r.api(
        "relay/start",
        { room: created.data.room },
        a.cookie,
      );
      assert.equal(running.status, 200);
      assert.equal(running.data.status, "running");
      const stub = await r.object();
      await stub.setRelayTime(running.data.serverAt);
      const controls = {
        room: running.data.room,
        controlEpoch: running.data.controlEpoch,
        seq: 0,
        actionSeq: 0,
        input: { x: 0, z: 1 },
      };
      assert.equal((await r.api("relay/tick", controls, a.cookie)).status, 200);
      await stub.setRelayTime(running.data.serverAt + 250);
      const moved = await r.api(
        "relay/tick",
        { ...controls, seq: 1, input: { x: 0, z: 0 } },
        a.cookie,
      );
      assert.equal(moved.data.simulation.tick, 15);
      assert.ok(moved.data.simulation.runners[0].z > 0);
      assert.equal(
        (await r.api("relay/tick", { ...controls, seq: 2, leg: 3 }, a.cookie))
          .status,
        400,
      );
      const fresh = await r.api(
        "relay/join",
        { room: running.data.room },
        a.cookie,
      );
      assert.notEqual(fresh.data.controlEpoch, running.data.controlEpoch);
      const stale = await r.api(
        "relay/leave",
        { room: running.data.room, controlEpoch: running.data.controlEpoch },
        a.cookie,
      );
      assert.equal(stale.status, 409);
      assert.match(stale.data.error, /controls moved/);
      assert.equal(
        (
          await r.api(
            "relay/tick",
            { ...controls, controlEpoch: fresh.data.controlEpoch },
            a.cookie,
          )
        ).status,
        200,
      );
      assert.equal((await r.api("auth/logout", {}, b.cookie)).status, 200);
      const cancelled = await r.api(
        "relay/tick",
        {
          ...controls,
          controlEpoch: fresh.data.controlEpoch,
          seq: 1,
          input: { x: 0, z: 0 },
        },
        a.cookie,
      );
      assert.equal(cancelled.status, 200);
      assert.equal(cancelled.data.status, "cancelled");
      assert.equal(cancelled.data.simulation, null);
      assert.deepEqual(
        cancelled.data.players.map((p) => p.slot),
        [0],
      );
      const after = (await r.api("privacy/export", undefined, a.cookie)).data;
      assert.deepEqual(after.profile.progress, before.profile.progress);
      assert.deepEqual(after.rounds, before.rounds);
      assert.deepEqual(after.medals, before.medals);
      assert.deepEqual(after.medalRewards, before.medalRewards);
      const alarm = await stub.relayAlarm();
      assert.equal(alarm.expiresAt, cancelled.data.expiresAt);
      assert.ok(alarm.at <= cancelled.data.expiresAt);
      await stub.runRelayAlarm(cancelled.data.expiresAt);
      assert.equal(
        (await db.exec("SELECT count(*) n FROM relay_rooms"))[0].n,
        0,
      );
      assert.equal(
        (await db.exec("SELECT count(*) n FROM relay_members"))[0].n,
        0,
      );
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
      const created = await r.api(
        "relay/create",
        { solo: true, difficulty: "practice" },
        a.cookie,
      );
      assert.equal(created.status, 200);
      const stub = await r.object(),
        alarm = await stub.relayAlarm();
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
        404,
      );
    } finally {
      await r.mf.dispose();
    }
  },
);
