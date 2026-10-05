import { createHmac } from "node:crypto";
import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { trackCurve } from "../shared/racing.ts";
import { Simulation, rulesVersion } from "../shared/simulation.ts";
import { PRIVACY_VERSION } from "../server/community-core.mjs";
import {
  createWaterTrail,
  trailTiles,
  traceWater,
} from "../shared/plot-trail.ts";

const origin = "https://darecade.test";
const oldOrigin = "https://old.darecade.test";

test(
  "Cloudflare season registration, concurrent XP, challenge filtering and midnight rewards preserve lifetime data",
  { timeout: 30000 },
  async () => {
    const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
    const monday = new Date(today + "T00:00:00Z");
    // Always register strictly in the future, including when this test runs Monday.
    monday.setUTCDate(
      monday.getUTCDate() + ((8 - monday.getUTCDay()) % 7 || 7),
    );
    const date = monday.toISOString().slice(0, 10),
      start = Date.parse(date + "T00:00:00+08:00");
    const { mf, api } = runtime(true, {
      awards: true,
      env: {
        COMPETITION_SEASONS: JSON.stringify([
          {
            id: "fixture-season",
            name: "Fixture season",
            startsAt: date + "T00:00:00+08:00",
          },
        ]),
        SEASON_VIEW: "true",
      },
    });
    try {
      const consent = {
        month: 1,
        year: 2000,
        consent: true,
        privacyVersion: PRIVACY_VERSION,
      };
      const a = await api("auth/join", consent),
        b = await api("auth/join", consent);
      assert.equal(a.status, 200);
      assert.equal(b.status, 200);
      assert.equal(a.data.season, null);
      const sql = await mf.unsafeGetDurableObjectStorage(
        "darecade-test",
        "AwardsNeighbourhood",
        { name: "darecade-main-v1" },
      );
      for (const p of [a, b])
        await sql.exec(
          "INSERT INTO accounts VALUES(?,?,?)",
          p.data.id,
          `${p.data.id}@example.test`,
          Date.now() - 172800000,
        );
      await sql.exec(
        "UPDATE profiles SET progress=json_set(progress,'$.xp',250,'$.wardrobePurchased',json('[\"solar\"]')) WHERE player=?",
        a.data.id,
      );
      await sql.exec(
        "INSERT INTO runs(id,player,game,started,finished,score,day,status,verified,eligible,seed,version) VALUES('old',?,'hop',?,?,?,?, 'finished',1,1,123,1)",
        b.data.id,
        start - 2000,
        start - 1000,
        100,
        new Date(start - 1000 + 8 * 3600000).toISOString().slice(0, 10),
      );
      const namespace = await mf.getDurableObjectNamespace("NEIGHBOURHOOD"),
        stub = namespace.get(namespace.idFromName("darecade-main-v1"));
      await stub.runAwardAlarm(start + 1000);
      let state = await api("state", undefined, a.cookie);
      assert.equal(state.data.season.xp, 0);
      assert.equal(state.data.season.points, 0);
      assert.equal(
        (
          await api(
            "run",
            { game: "hop", target: b.data.id, targetRun: "old" },
            a.cookie,
          )
        ).status,
        400,
      );
      const results = await Promise.all([
        api("progress", { event: "gift", value: 0 }, a.cookie),
        api("progress", { event: "gift", value: 0 }, a.cookie),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
      await Promise.all([
        api("progress", { event: "visit", value: "garden" }, a.cookie),
        api("progress", { event: "visit", value: "plots" }, a.cookie),
        api("progress", { event: "visit", value: "stage" }, a.cookie),
      ]);
      const profile = (await api("auth/me", undefined, a.cookie)).data;
      assert.equal(profile.progress.xp, 310);
      assert.equal(profile.season.xp, 60);
      assert.ok(profile.progress.wardrobePurchased.includes("solar"));
      assert.equal(
        (
          await sql.exec(
            "SELECT SUM(tokens) n FROM style_reward_notices WHERE player=?",
            a.data.id,
          )
        )[0].n,
        1,
      );
      for (const game of ["hop", "noodle"])
        await sql.exec(
          "INSERT INTO runs(id,player,game,started,finished,score,day,status,verified,eligible,seed,version) VALUES(?,?,?,?,?,?,?,'finished',1,1,123,1)",
          game,
          a.data.id,
          game,
          start + 1000,
          start + 61000,
          100,
          date,
        );
      await stub.runAwardAlarm(start + 86401000);
      await stub.runAwardAlarm(start + 86402000);
      state = await api("state", undefined, a.cookie);
      assert.equal(state.data.season.points, 6);
      assert.equal(state.data.season.xp, 60);
      assert.equal(state.data.profile.progress.medalTokens, 3);
      assert.equal(
        (
          await sql.exec(
            "SELECT COUNT(*) n FROM medal_rewards WHERE player=?",
            a.data.id,
          )
        )[0].n,
        1,
      );
      const exported = await api("privacy/export", undefined, a.cookie);
      assert.equal(exported.data.seasons[0].xp, 60);
      assert.equal((await api("auth/me", undefined, b.cookie)).status, 200);
    } finally {
      await mf.dispose();
    }
  },
);

test(
  "Cloudflare validates a linked water trail and persists only one crop boost",
  { timeout: 30000 },
  async () => {
    const { mf, api } = runtime();
    try {
      const player = await api("auth/join", {
        month: 1,
        year: 2000,
        consent: true,
        privacyVersion: PRIVACY_VERSION,
      });
      assert.equal(player.status, 200);
      const progress = (event, value) =>
        api("progress", { event, value }, player.cookie);
      const planted = await progress("plant", "sunflower");
      assert.equal(planted.status, 200);
      const save = planted.data.progress;
      const trail = createWaterTrail(save.plotCrop, save.plotPlanted);
      const turns = Array.from({ length: 64 }, (_, n) => [
        n % 4,
        Math.floor(n / 4) % 4,
        Math.floor(n / 16),
      ]).find((turns) => traceWater(trailTiles(trail, turns)).complete);
      assert.ok(turns);
      const value = { crop: save.plotCrop, planted: save.plotPlanted, turns };
      assert.equal(
        (await progress("tend", { ...value, planted: value.planted - 1 }))
          .status,
        400,
      );
      assert.equal(
        (await progress("tend", { ...value, turns: [0, 0, 0] })).status,
        400,
      );
      assert.equal(
        (await api("auth/me", undefined, player.cookie)).data.progress
          .plotWatered,
        false,
      );
      const watered = await progress("tend", value);
      assert.equal(watered.status, 200, JSON.stringify(watered.data));
      assert.equal(watered.data.progress.plotWatered, true);
      assert.equal(watered.data.progress.xp, save.xp);
      assert.ok(watered.data.progress.plotPlanted < save.plotPlanted);
      assert.ok(
        save.plotPlanted - watered.data.progress.plotPlanted <= 2 * 3600000,
      );
      assert.equal((await progress("tend", value)).status, 400);
      assert.equal((await progress("water")).status, 400);
      assert.equal((await progress("harvest")).status, 400);
      const reloaded = await api("auth/me", undefined, player.cookie);
      assert.deepEqual(reloaded.data.progress, watered.data.progress);
    } finally {
      await mf.dispose();
    }
  },
);

test(
  "Cloudflare checkout and raw signed webhooks persist paid looks and reject forged callbacks",
  { timeout: 30000 },
  async () => {
    let session;
    const secret = "whsec_cloudflarefixture";
    const { mf, api } = runtime(true, {
      env: {
        PAYMENTS_ENABLED: "true",
        STRIPE_SECRET_KEY: "sk_test_fixture",
        STRIPE_WEBHOOK_SECRET: secret,
        STRIPE_CATALOG: JSON.stringify({
          solar: { priceId: "price_solar", amount: 490 },
        }),
      },
      request: async (request) => {
        if (request.url.includes("/prices/"))
          return Response.json({
            active: true,
            type: "one_time",
            currency: "sgd",
            unit_amount: 490,
            livemode: false,
          });
        if (request.method === "POST") {
          const form = new URLSearchParams(await request.text());
          session = {
            id: "cs_test_cloudflare",
            url: "https://checkout.stripe.com/c/pay/cs_test_cloudflare",
            client_reference_id: form.get("client_reference_id"),
            metadata: { order: form.get("metadata[order]") },
            mode: "payment",
            status: "complete",
            payment_status: "paid",
            currency: "sgd",
            amount_total: 490,
            livemode: false,
            line_items: {
              has_more: false,
              data: [{ quantity: 1, price: { id: "price_solar" } }],
            },
            payment_intent: {
              id: "pi_fixture",
              latest_charge: { refunded: false, disputed: false },
            },
          };
        }
        return Response.json(session);
      },
    });
    try {
      const user = await api("auth/join", {
        month: 1,
        year: 2000,
        consent: true,
        privacyVersion: PRIVACY_VERSION,
      });
      assert.equal(
        (await api("payments/checkout", { product: "solar" }, user.cookie))
          .status,
        403,
      );
      const sql = await mf.unsafeGetDurableObjectStorage(
        "darecade-test",
        "Neighbourhood",
        { name: "darecade-main-v1" },
      );
      await sql.exec(
        "INSERT INTO accounts VALUES(?,?,?)",
        user.data.id,
        "payment@example.test",
        Date.now(),
      );
      assert.equal(
        (await api("payments/config", undefined, user.cookie)).data.enabled,
        true,
      );
      const checkout = await api(
        "payments/checkout",
        { product: "solar", amount: 1 },
        user.cookie,
      );
      assert.equal(checkout.status, 200, JSON.stringify(checkout.data));
      assert.equal(checkout.data.url, session.url);
      const raw = JSON.stringify({
        id: "evt_fixture",
        type: "checkout.session.completed",
        livemode: false,
        data: { object: { id: session.id } },
      });
      const t = Math.floor(Date.now() / 1000);
      const signature = `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex")}`;
      const send = (sig) =>
        mf.dispatchFetch(origin + "/api/payments/webhook", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Stripe-Signature": sig,
          },
          body: raw,
        });
      assert.equal((await send("forged")).status, 400);
      assert.deepEqual(
        (await api("auth/me", undefined, user.cookie)).data.progress
          .wardrobePurchased,
        [],
      );
      assert.equal((await send(signature)).status, 200);
      assert.equal((await send(signature)).status, 200);
      assert.deepEqual(
        (await api("auth/me", undefined, user.cookie)).data.progress
          .wardrobePurchased,
        ["solar"],
      );
      assert.equal(
        (await api("payments/history", undefined, user.cookie)).data.length,
        1,
      );
      assert.equal(
        (
          await api(
            "profile",
            { clothing: 24, hair: 28, pet: 26, accessory: 27 },
            user.cookie,
          )
        ).status,
        200,
      );
      session.payment_intent.latest_charge.refunded = true;
      assert.equal(
        (await api("payments/status", { session: session.id }, user.cookie))
          .data.status,
        "refunded",
      );
      assert.equal(
        (await api("auth/me", undefined, user.cookie)).data.progress.clothing,
        0,
      );
    } finally {
      await mf.dispose();
    }
  },
);

test(
  "occupancy reports only write changed away flags and keep room freshness",
  { timeout: 30000 },
  async () => {
    const { mf, api } = runtime();
    const sockets = [];
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const connect = async (cookie) => {
      const response = await mf.dispatchFetch(
        origin + "/api/world/connect?world=world-1",
        {
          headers: { Upgrade: "websocket", Cookie: cookie, Origin: origin },
        },
      );
      assert.equal(response.status, 101);
      const socket = response.webSocket;
      socket.addEventListener("message", (event) => {
        if (JSON.parse(event.data).t === "closed") socket.close();
      });
      socket.addEventListener("close", () => {
        try {
          socket.close();
        } catch {}
      });
      socket.accept();
      sockets.push(socket);
      return socket;
    };
    try {
      const users = [];
      for (let n = 0; n < 4; n++) {
        const user = await api(
          "auth/join",
          {
            month: 1,
            year: 2000,
            consent: true,
            privacyVersion: PRIVACY_VERSION,
          },
          "",
          { "CF-Connecting-IP": `192.0.2.${n + 1}` },
        );
        assert.equal(user.status, 200);
        users.push(user);
      }
      // Let the Worker allocate the first room before using the explicit room path.
      await api("world/poll", { x: 0 }, users[0].cookie);
      const first = await connect(users[0].cookie);
      const sql = await mf.unsafeGetDurableObjectStorage(
        "darecade-test",
        "Neighbourhood",
        { name: "darecade-main-v1" },
      );
      await sql.exec("CREATE TABLE away_writes(n INTEGER NOT NULL)");
      await sql.exec("INSERT INTO away_writes VALUES(0)");
      await sql.exec(
        "CREATE TRIGGER count_away_writes AFTER UPDATE OF away ON world_members BEGIN UPDATE away_writes SET n=n+1; END",
      );
      await sql.exec("UPDATE worlds SET seen=0 WHERE name='world-1'");
      await connect(users[1].cookie);
      const writes = async () =>
        (await sql.exec("SELECT n FROM away_writes"))[0].n;
      assert.equal(await writes(), 0);
      const fresh = (
        await sql.exec("SELECT seen,occupancy FROM worlds WHERE name='world-1'")
      )[0];
      assert.equal(fresh.occupancy, 2);
      assert.ok(fresh.seen > Date.now() - 5000);
      first.send(JSON.stringify({ away: true }));
      await sleep(250);
      await connect(users[2].cookie);
      assert.equal(await writes(), 1);
      assert.equal(
        (await api("state", undefined, users[0].cookie)).data.players.find(
          (p) => p.id === users[0].data.id,
        ).status,
        "resting",
      );
      first.send(JSON.stringify({ away: false }));
      await sleep(250);
      await connect(users[3].cookie);
      assert.equal(await writes(), 2);
      assert.equal(
        (await api("state", undefined, users[0].cookie)).data.players.find(
          (p) => p.id === users[0].data.id,
        ).status,
        "online",
      );
    } finally {
      for (const socket of sockets)
        try {
          socket.close();
        } catch {}
      await mf.dispose();
    }
  },
);

function runtime(ready = true, paymentOptions = {}) {
  const messages = [];
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "darecade-test",
      unsafeInspectDurableObjects: true,
      modules: paymentOptions.awards
        ? [
            { type: "ESModule", path: "tests/awards-worker.mjs" },
            { type: "ESModule", path: ".browser/cloudflare-bundle/worker.js" },
          ]
        : true,
      scriptPath: paymentOptions.awards
        ? "tests/awards-worker.mjs"
        : ".browser/cloudflare-bundle/worker.js",
      compatibilityDate: "2026-10-03",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: {
        NEIGHBOURHOOD: {
          className: paymentOptions.awards
            ? "AwardsNeighbourhood"
            : "Neighbourhood",
          useSQLite: true,
        },
        WORLD: { className: "World", useSQLite: true },
      },
      bindings: {
        LAUNCH_READY: String(ready),
        PUBLIC_ORIGIN: origin,
        LEGACY_ORIGIN: oldOrigin,
        RESEND_API_KEY: "test-only-key",
        MAIL_FROM: "Play Simi <hello@example.test>",
        PRIVACY_CONTACT: "privacy@example.test",
        STORAGE_NOTICE: "Synthetic Cloudflare runtime test.",
        ...paymentOptions.env,
      },
      serviceBindings: { ASSETS: () => new Response("asset fixture") },
      outboundService: async (request) => {
        if (
          request.url.startsWith("https://api.stripe.com/") &&
          paymentOptions.request
        )
          return paymentOptions.request(request);
        assert.equal(request.url, "https://api.resend.com/emails");
        if (paymentOptions.mail) return paymentOptions.mail(request);
        messages.push(await request.json());
        return Response.json({ id: "synthetic-mail" });
      },
    }),
  );
  const api = async (path, data, cookie = "", extra = {}) => {
    const response = await mf.dispatchFetch(origin + "/api/" + path, {
      method: data === undefined ? "GET" : "POST",
      headers: {
        "CF-Connecting-IP": "192.0.2.10",
        Origin: origin,
        ...(data === undefined ? {} : { "Content-Type": "application/json" }),
        ...(cookie ? { Cookie: cookie } : {}),
        ...extra,
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    });
    let value;
    try {
      value = await response.json();
    } catch {
      value = null;
    }
    return {
      status: response.status,
      data: value,
      cookie: response.headers.get("set-cookie")?.split(";")[0],
      headers: response.headers,
    };
  };
  return { mf, api, messages };
}
function play(game, seed) {
  const sim = new Simulation(game, seed),
    events = [];
  let previous = "";
  while (!sim.ended) {
    const input = [0, 0, -1, 0, -1, -1];
    if (game === "hop" && sim.ticks % 60 === 0) input[3] = 1;
    if (game === "brick") input[4] = Math.round(sim.ball.x);
    if (game === "swarm") input[0] = Math.floor(sim.ticks / 120) % 2 ? 1 : -1;
    if (game === "coast") {
      const race = sim.race;
      input[0] = Math.sign(
        trackCurve(race.distance) * race.speed ** 2 * 0.24 -
          race.offset * 2 -
          race.lateralSpeed * 0.5,
      );
      input[1] = 1;
      input[3] = Number(race.charge < 0.998);
    }
    const stamp = JSON.stringify(input);
    if (stamp !== previous) {
      events.push([sim.ticks, ...input]);
      previous = stamp;
    }
    sim.advance(input);
  }
  return {
    score: sim.score,
    replay: { version: rulesVersion(game), ticks: sim.ticks, events },
  };
}

test(
  "World auto-join fills 25 places, reuses the fullest room, and keeps empty rooms reusable",
  { timeout: 60000 },
  async () => {
    const { mf, api } = runtime();
    const sockets = [];
    const users = [];
    const join = async (cookie) => {
      const response = await mf.dispatchFetch(origin + "/api/world/connect", {
        headers: { Upgrade: "websocket", Cookie: cookie, Origin: origin },
      });
      assert.equal(response.status, 101);
      const ws = response.webSocket;
      sockets.push(ws);
      const first = new Promise((resolve) =>
        ws.addEventListener("message", (e) => resolve(JSON.parse(e.data)), {
          once: true,
        }),
      );
      ws.addEventListener("close", () => {
        try {
          ws.close();
        } catch {}
      });
      ws.accept();
      return first;
    };
    try {
      for (let i = 0; i < 27; i++) {
        const user = await api(
          "auth/join",
          {
            month: 1,
            year: 2000,
            consent: true,
            privacyVersion: PRIVACY_VERSION,
          },
          "",
          { "CF-Connecting-IP": `192.0.2.${i + 1}` },
        );
        users.push(user);
        const packet = await join(user.cookie);
        assert.equal(packet.world, i < 25 ? "world-1" : "world-2");
      }
      assert.deepEqual(
        (await api("worlds", undefined, users[0].cookie)).data.worlds.map(
          (w) => w.count,
        ),
        [25, 2],
      );
      sockets[0].close();
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(
        (await join(users[0].cookie)).world,
        "world-1",
        "24 places wins over a room with 2",
      );
      sockets[25].close();
      sockets[26].close();
      await new Promise((r) => setTimeout(r, 100));
      const empty = (
        await api("worlds", undefined, users[0].cookie)
      ).data.worlds.find((w) => w.id === "world-2");
      assert.equal(empty.count, 0);
      assert.equal(
        (await join(users[25].cookie)).world,
        "world-2",
        "empty room reused when first room has 25",
      );
      const sql = await mf.unsafeGetDurableObjectStorage(
        "darecade-test",
        "Neighbourhood",
        { name: "darecade-main-v1" },
      );
      await sql.exec(
        "UPDATE worlds SET occupancy=30,seen=0 WHERE name='world-2'",
      );
      await sql.exec(
        "DELETE FROM world_members WHERE player=?",
        users[26].data.id,
      );
      assert.equal(
        (await join(users[26].cookie)).world,
        "world-2",
        "stale occupancy cannot strand a room forever",
      );
    } finally {
      for (const ws of sockets)
        try {
          ws.close();
        } catch {}
      await mf.dispose();
    }
  },
);

test(
  "World sockets enforce capacity, privacy, trusted identity, hibernation and HTTP fallback",
  { timeout: 60000 },
  async () => {
    const { mf, api } = runtime();
    const sockets = [];
    const closed = new Set();
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const connect = async (cookie, world = "", extra = {}) =>
      mf.dispatchFetch(
        origin + "/api/world/connect" + (world ? `?world=${world}` : ""),
        {
          headers: {
            Upgrade: "websocket",
            Cookie: cookie,
            Origin: origin,
            "CF-Connecting-IP": "192.0.2.99",
            ...extra,
          },
        },
      );
    const listen = (response) => {
      assert.equal(response.status, 101);
      const ws = response.webSocket,
        packets = [];
      ws.addEventListener("message", (e) => {
        const packet = JSON.parse(e.data);
        if (packet.t === "closed") ws.close();
        else packets.push(packet);
      });
      ws.addEventListener("close", () => {
        closed.add(ws);
        try {
          ws.close();
        } catch {}
      });
      ws.accept();
      sockets.push(ws);
      return { ws, packets };
    };
    try {
      assert.equal(
        (
          await connect("", "", {
            "x-darecade-world-player": JSON.stringify({
              id: "forged",
              name: "Fake",
              blockedIds: [],
            }),
          })
        ).status,
        401,
      );
      const users = [];
      for (let n = 0; n < 32; n++) {
        const user = await api(
          "auth/join",
          {
            month: 1,
            year: 2000,
            consent: true,
            privacyVersion: PRIVACY_VERSION,
          },
          "",
          { "CF-Connecting-IP": `192.0.2.${n + 1}` },
        );
        assert.equal(user.status, 200);
        users.push(user);
      }
      const a = listen(
        await connect(users[0].cookie, "", {
          "x-darecade-world-player": JSON.stringify({ id: "forged" }),
        }),
      );
      await sleep(30);
      assert.equal(a.packets[0].world, "world-1");
      assert.equal(a.packets[0].p[0][1], users[0].data.id);
      for (let n = 1; n < 30; n++)
        listen(await connect(users[n].cookie, "world-1"));
      const liveState = await api("state", undefined, users[0].cookie);
      assert.equal(
        liveState.data.players.filter((p) => p.status === "online").length,
        30,
        "world membership preserves live status between position saves",
      );
      assert.equal((await connect(users[30].cookie, "world-1")).status, 409);
      const directory = await api("worlds", undefined, users[0].cookie);
      assert.equal(directory.status, 200);
      assert.deepEqual(directory.data.worlds, [
        { id: "world-1", code: "W1", count: 30 },
      ]);
      assert.doesNotMatch(
        JSON.stringify(directory.data),
        /session|email|ageBand|blockedIds/,
      );
      assert.equal(
        (
          await api(
            "worlds/join",
            { friend: users[0].data.id },
            users[30].cookie,
          )
        ).status,
        400,
      );
      const b = sockets[1],
        bp = [];
      b.addEventListener("message", (e) => bp.push(JSON.parse(e.data)));
      a.ws.send(
        JSON.stringify({
          x: 99,
          z: -99,
          yaw: 2,
          activity: "dance",
          emote: "wave",
        }),
      );
      await sleep(260);
      const slot = a.packets[0].p[0][0];
      assert.ok(
        bp.some((p) =>
          p.d.some((d) => d[0] === slot && d[1] === 3300 && d[2] === -2500),
        ),
      );
      a.ws.send(
        JSON.stringify({ x: 27.4, z: 11, activity: "fish", away: true }),
      );
      await sleep(260);
      assert.ok(
        bp.some((p) =>
          p.d.some((d) => d[0] === slot && d[1] === 2740 && d[4] === 5),
        ),
        "East Side fishing reaches another socket without clipping or losing its activity",
      );
      const before = bp.length;
      assert.equal(
        (
          await api(
            "report",
            { target: users[1].data.id, reason: "unsafe-behaviour" },
            users[0].cookie,
          )
        ).status,
        200,
      );
      await sleep(30);
      assert.ok(bp.slice(before).some((p) => p.gone.includes(slot)));
      const ownBlocked = a.packets.at(-1);
      assert.ok(ownBlocked.gone.length > 0);
      for (const [viewer, hidden] of [
        [users[0], users[1]],
        [users[1], users[0]],
      ]) {
        const listing = await api("worlds", undefined, viewer.cookie);
        assert.ok(
          !listing.data.neighbours.some((p) => p.id === hidden.data.id),
        );
        assert.equal(
          (await api("worlds/join", { friend: hidden.data.id }, viewer.cookie))
            .status,
          400,
        );
      }
      a.ws.send(JSON.stringify({ x: 3 }));
      await sleep(260);
      assert.ok(!bp.slice(before).some((p) => p.d.some((d) => d[0] === slot)));
      assert.equal(
        (await api("world/poll?world=world-1", { x: 2 }, users[31].cookie))
          .status,
        409,
      );
      sockets[29].close();
      await sleep(100);
      const polled = await api(
        "world/poll?world=world-1",
        { x: 7, z: 8 },
        users[31].cookie,
      );
      assert.equal(polled.status, 200, JSON.stringify(polled.data));
      assert.equal(polled.data.p.length, 30);
      const pollSlot = polled.data.p.find((p) => p[1] === users[31].data.id)[0];
      assert.ok(polled.data.d.some((d) => d[0] === pollSlot && d[1] === 700));
      assert.doesNotMatch(
        JSON.stringify(polled.data),
        /blockedIds|session|email|ageBand/,
      );
      const sql = await mf.unsafeGetDurableObjectStorage(
        "darecade-test",
        "Neighbourhood",
        { name: "darecade-main-v1" },
      );
      await sql.exec(
        "INSERT INTO suspensions(player,created) VALUES(?,?)",
        users[30].data.id,
        Date.now(),
      );
      assert.equal((await connect(users[30].cookie, "world-1")).status, 401);
      assert.equal(
        (
          await connect(users[30].cookie, "world-1", {
            Origin: "https://evil.test",
          })
        ).status,
        403,
      );
      await mf.unsafeEvictDurableObject("darecade-test", "World", {
        name: "world-1",
      });
      await sleep(220);
      const afterWake = await api(
        "world/poll?world=world-1",
        { x: 9 },
        users[31].cookie,
      );
      assert.equal(afterWake.status, 200, JSON.stringify(afterWake.data));
      assert.equal(afterWake.data.p.length, 30);
      const packetStart = a.packets.length;
      assert.equal(
        (await api("privacy/delete", { confirm: "DELETE" }, users[2].cookie))
          .status,
        200,
      );
      await sleep(100);
      assert.ok(
        a.packets
          .slice(packetStart)
          .some(
            (p) =>
              p.gone.includes(2) ||
              (p.t === "sync" &&
                !p.p.some((row) => row[1] === users[2].data.id)),
          ),
      );
      assert.ok(!afterWake.data.p.some((row) => row[1] === "forged"));
      await sleep(250);
      assert.ok(
        closed.has(sockets[2]) || sockets[2].readyState >= 2,
        "deletion closes the player's live socket",
      );
      const deletedPoll = await api(
        "world/poll?world=world-1",
        {},
        users[2].cookie,
      );
      assert.equal(deletedPoll.status, 401);
      const joinedElsewhere = listen(await connect(users[29].cookie));
      await sleep(30);
      assert.equal(joinedElsewhere.packets[0].world, "world-2");
      // Moving worlds disconnects the old instance before Records changes membership.
      const switched = listen(await connect(users[3].cookie, "world-2"));
      await sleep(50);
      assert.equal(switched.packets[0].world, "world-2");
      assert.ok(sockets[3].readyState >= 2);
      const membership = await sql.exec(
        "SELECT world FROM world_members WHERE player=?",
        users[3].data.id,
      );
      assert.equal(membership[0].world, "world-2");
      const friend = await api(
        "worlds/join",
        { friend: users[3].data.id },
        users[4].cookie,
      );
      assert.deepEqual(friend.data, { world: "world-2" });
      assert.equal(
        (await api("worlds/join", { world: "world-9999" }, users[4].cookie))
          .status,
        400,
      );
      assert.equal((await api("worlds", undefined)).status, 401);
    } finally {
      for (const ws of sockets)
        try {
          ws.close();
        } catch {}
      await mf.dispose();
    }
  },
);

test(
  "Cloudflare runtime persists accounts, validates five games, isolates private data and erases feedback",
  { timeout: 60000 },
  async () => {
    const { mf, api, messages } = runtime();
    try {
      assert.equal((await api("health")).status, 200);
      assert.equal((await api("state")).status, 401);
      assert.equal(
        (
          await api("auth/join", {
            month: 1,
            year: 2020,
            consent: true,
            privacyVersion: PRIVACY_VERSION,
          })
        ).status,
        400,
      );
      const guest = await api("auth/join", {
        month: 1,
        year: 2000,
        consent: true,
        privacyVersion: PRIVACY_VERSION,
      });
      assert.equal(guest.status, 200, JSON.stringify(guest.data));
      assert.match(guest.headers.get("set-cookie"), /Secure/);
      let cookie = guest.cookie;
      const id = guest.data.id;
      assert.equal(
        (
          await api(
            "profile",
            {
              name: "Cloud Mochi",
              gender: 1,
              hair: 7,
              clothing: 7,
              pet: 6,
              accessory: 4,
            },
            cookie,
          )
        ).data.name,
        "Cloud Mochi",
      );
      assert.equal(
        (
          await api("profile", { xp: 999999 }, cookie, {
            Origin: "https://untrusted.test",
          })
        ).status,
        403,
      );
      assert.equal(
        (await api("auth/code", { email: "cloud@example.test" }, cookie))
          .status,
        200,
      );
      const previousCookie = cookie;
      const beforeVerify = await mf.dispatchFetch(
        origin + "/api/world/connect?connection=before-code",
        {
          headers: { Cookie: cookie, Origin: origin, Upgrade: "websocket" },
        },
      );
      assert.equal(beforeVerify.status, 101);
      beforeVerify.webSocket.accept();
      assert.equal(messages.length, 1);
      const verify = {
        email: "cloud@example.test",
        code: messages[0].text.match(/code is (\d{6})/)[1],
      };
      const signed = await Promise.all([
        api("auth/verify", verify),
        api("auth/verify", verify),
      ]);
      assert.deepEqual(signed.map((r) => r.status).sort(), [200, 400]);
      cookie = signed.find((r) => r.status === 200).cookie;
      assert.equal(
        (await api("auth/me", undefined, previousCookie)).status,
        401,
      );
      const afterVerify = await mf.dispatchFetch(
        origin + "/api/world/connect?world=world-1&connection=after-code",
        {
          headers: { Cookie: cookie, Origin: origin, Upgrade: "websocket" },
        },
      );
      assert.equal(
        afterVerify.status,
        101,
        "rotated session can replace its world connection",
      );
      afterVerify.webSocket.accept();
      afterVerify.webSocket.close();
      beforeVerify.webSocket.close();
      const sql = await mf.unsafeGetDurableObjectStorage(
        "darecade-test",
        "Neighbourhood",
        { name: "darecade-main-v1" },
      );
      // Advance only synthetic eligibility and elapsed round timestamps, never production data.
      await sql.exec(
        "UPDATE accounts SET created=? WHERE player=?",
        Date.now() - 172800000,
        id,
      );
      for (const game of ["noodle", "brick", "hop", "swarm", "coast"]) {
        const run = await api("run", { game }, cookie);
        assert.equal(run.status, 200);
        const replay = play(game, run.data.seed);
        assert.equal(
          (
            await api(
              "finish",
              { id: run.data.id, ...replay, score: replay.score + 1 },
              cookie,
            )
          ).status,
          400,
        );
        await sql.exec(
          "UPDATE runs SET started=? WHERE id=?",
          Date.now() - ((replay.replay.ticks / 60) * 1000 + 1000),
          run.data.id,
        );
        const result = await api(
          "finish",
          { id: run.data.id, ...replay },
          cookie,
        );
        assert.equal(result.status, 200, JSON.stringify(result.data));
        assert.equal(result.data.verified, true);
        if (game === "coast") {
          assert.equal(result.data.race.finished, true);
          assert.equal(result.data.race.newBest, true);
          assert.equal(
            result.data.profile.progress.coastRecord.timeTicks,
            replay.replay.ticks,
          );
          assert.ok(result.data.race.pickups > 0);
          assert.equal(
            (await api("finish", { id: run.data.id, ...replay }, cookie)).data
              .race.newBest,
            true,
          );
        }
        assert.equal(result.data.ranked, true);
        assert.equal(
          (await api("finish", { id: run.data.id, ...replay }, cookie)).data
            .profile.progress.rounds,
          result.data.profile.progress.rounds,
        );
      }
      const me = await api("auth/me", undefined, cookie);
      assert.equal(me.data.progress.rounds, 5);
      assert.equal(me.data.progress.xp, 135);
      const state = await api("state", undefined, cookie);
      assert.equal(state.data.boards.hop[0].rank, 1);
      assert.equal(state.data.boards.coast.length, 1);
      assert.equal(state.data.boards.coast[0].id, id);
      assert.equal(state.data.players[0].name, "Cloud Mochi");
      const presence = await api(
        "presence",
        {
          connection: "cloud-test",
          x: 3,
          z: 4,
          look: { hat: 3 },
        },
        cookie,
      );
      assert.equal(presence.status, 200);
      assert.deepEqual(Object.keys(presence.data), ["players"]);
      assert.equal(presence.data.players[0].x, 3);
      assert.equal(presence.data.players[0].look.hat, 0);
      const publicPlayers = JSON.stringify(state.data.players);
      assert.ok(!publicPlayers.includes("example.test"));
      const feedback = await api(
        "playtest",
        { answers: { device: "Synthetic runtime" }, measurements: { fps: 30 } },
        cookie,
      );
      assert.equal(feedback.status, 200);
      assert.equal(
        (await api("privacy/export", undefined, cookie)).data.playtests.length,
        1,
      );
      await mf.unsafeEvictDurableObject("darecade-test", "Neighbourhood", {
        name: "darecade-main-v1",
      });
      const restored = await api("auth/me", undefined, cookie);
      assert.equal(restored.data.name, "Cloud Mochi");
      assert.equal(restored.data.progress.hair, 7);
      assert.equal(restored.data.progress.rounds, 5);
      assert.equal(
        (await mf.dispatchFetch(origin + "/data/neighbourhood.sqlite")).status,
        404,
      );
      const oversized = await api(
        "profile",
        { name: "x".repeat(10000) },
        cookie,
      );
      assert.equal(oversized.status, 413);
      assert.equal(
        (await api("privacy/delete", { confirm: "DELETE" }, cookie)).status,
        200,
      );
      assert.equal((await api("auth/me", undefined, cookie)).status, 401);
      assert.equal(
        (await sql.exec("SELECT count(*) n FROM playtest_feedback"))[0].n,
        0,
      );
      assert.equal((await sql.exec("SELECT count(*) n FROM profiles"))[0].n, 0);
    } finally {
      await mf.dispose();
    }
  },
);

test(
  "shared Wi-Fi uses player budgets, a coarse IP cap, and persistent limits",
  { timeout: 60000 },
  async () => {
    const { mf, api } = runtime();
    try {
      const cookies = [];
      for (let i = 0; i < 11; i++) {
        const joined = await api("auth/join", {
          month: 1,
          year: 2000,
          consent: true,
          privacyVersion: PRIVACY_VERSION,
        });
        assert.equal(joined.status, 200);
        cookies.push(joined.cookie);
      }
      // 440 authenticated calls from one IP exceed the old shared 360/min cap.
      for (let n = 0; n < 40; n++)
        for (const cookie of cookies)
          assert.equal(
            (await api("presence", { connection: "wifi" }, cookie)).status,
            200,
          );
      for (let n = 40; n < 360; n++)
        assert.equal((await api("auth/me", undefined, cookies[0])).status, 200);
      assert.equal((await api("auth/me", undefined, cookies[0])).status, 429);
      assert.equal((await api("auth/me", undefined, cookies[1])).status, 200);
      await mf.unsafeEvictDurableObject("darecade-test", "Neighbourhood", {
        name: "darecade-main-v1",
      });
      assert.equal((await api("auth/me", undefined, cookies[0])).status, 429);
      // All preceding requests count against the IP backstop, including 429s.
      let requests = 11 + 440 + 320 + 1 + 1 + 1;
      while (requests < 3000) {
        const cookie = cookies[1 + (requests % 10)];
        assert.equal((await api("auth/me", undefined, cookie)).status, 200);
        requests++;
      }
      assert.equal(
        (
          await api("auth/me", undefined, cookies[2], {
            "x-darecade-client-ip": "spoofed-ip",
          })
        ).status,
        429,
      );
    } finally {
      await mf.dispose();
    }
  },
);

test(
  "Cloudflare stays closed without launch settings and durable rate limits survive eviction",
  { timeout: 30000 },
  async () => {
    const closed = runtime(false);
    try {
      assert.equal((await closed.api("auth/join", {})).status, 503);
      assert.equal((await closed.api("health")).data.ready, false);
    } finally {
      await closed.mf.dispose();
    }
    const { mf, api } = runtime();
    try {
      for (let i = 0; i < 12; i++)
        assert.equal(
          (await api("auth/check", { month: 1, year: 2000 })).status,
          200,
        );
      await mf.unsafeEvictDurableObject("darecade-test", "Neighbourhood", {
        name: "darecade-main-v1",
      });
      assert.equal(
        (await api("auth/check", { month: 1, year: 2000 })).status,
        429,
      );
    } finally {
      await mf.dispose();
    }
  },
);

test(
  "Cloudflare sign-in from a new device emails existing accounts and guides guest-only addresses",
  { timeout: 60000 },
  async () => {
    const { mf, api, messages } = runtime();
    try {
      const guest = await api("auth/join", {
        month: 1,
        year: 2000,
        consent: true,
        privacyVersion: PRIVACY_VERSION,
      });
      assert.equal(guest.status, 200, JSON.stringify(guest.data));
      assert.equal(
        (await api("auth/code", { email: "cloud@example.test" }, guest.cookie))
          .status,
        200,
      );
      assert.doesNotMatch(messages[0].text, /https?:/);
      assert.equal(
        (
          await api("auth/verify", {
            email: "cloud@example.test",
            code: messages[0].text.match(/code is (\d{6})/)[1],
          })
        ).status,
        200,
      );

      // A signed-out browser (no cookie) asks to sign in to the existing account.
      const known = await api("auth/login-code", {
        email: "  Cloud@Example.test ",
      });
      assert.equal(known.status, 200, JSON.stringify(known.data));
      assert.equal(messages.length, 2);
      assert.deepEqual(messages[1].to, ["cloud@example.test"]);
      const signed = await api("auth/verify", {
        email: "cloud@example.test",
        code: messages[1].text.match(/code is (\d{6})/)[1],
      });
      assert.equal(signed.status, 200);
      assert.equal(signed.data.id, guest.data.id);

      // An address with no account still gets an email, but never a sign-in code.
      const unknown = await api("auth/login-code", {
        email: "guest-only@example.test",
      });
      assert.equal(unknown.status, 200);
      assert.deepEqual(unknown.data, known.data);
      assert.equal(messages.length, 3);
      assert.deepEqual(messages[2].to, ["guest-only@example.test"]);
      assert.doesNotMatch(messages[2].text, /\d{6}/);
      assert.match(messages[2].text, /Account & privacy/);

      // Repeat requests for an unknown address are not re-sent within the hour.
      assert.equal(
        (await api("auth/login-code", { email: "guest-only@example.test" }))
          .status,
        200,
      );
      assert.equal(messages.length, 3);
      assert.equal(
        (await api("auth/login-code", { email: "not-an-email" })).status,
        400,
      );

      // A second guest saving to that address is never moved to its account.
      const other = await api("auth/join", {
        month: 1,
        year: 2000,
        consent: true,
        privacyVersion: PRIVACY_VERSION,
      });
      assert.equal(other.status, 200, JSON.stringify(other.data));
      const sent = messages.length;
      assert.equal(
        (await api("auth/code", { email: "cloud@example.test" }, other.cookie))
          .status,
        200,
      );
      const verify = {
        email: "cloud@example.test",
        code: messages[sent].text.match(/code is (\d{6})/)[1],
      };
      const refused = await api("auth/verify", verify, other.cookie);
      assert.equal(refused.status, 200, JSON.stringify(refused.data));
      assert.deepEqual(Object.keys(refused.data), ["conflict"]);
      assert.equal(refused.cookie, undefined, "the session is left alone");
      assert.equal(
        (await api("auth/me", undefined, other.cookie)).data.id,
        other.data.id,
      );
      // Only the explicit choice signs in to the existing character.
      const switched = await api(
        "auth/verify",
        { ...verify, switchAccount: true },
        other.cookie,
      );
      assert.equal(switched.status, 200, JSON.stringify(switched.data));
      assert.equal(switched.data.id, guest.data.id);
      assert.ok(switched.cookie);
    } finally {
      await mf.dispose();
    }
  },
);

test(
  "the old address only hands a player over, and the new address continues as that player",
  { timeout: 60000 },
  async () => {
    const { mf, api } = runtime();
    const old = (path, data, cookie = "", from = oldOrigin) =>
      mf.dispatchFetch(oldOrigin + "/api/" + path, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          "CF-Connecting-IP": "192.0.2.10",
          ...(data === undefined
            ? {}
            : { Origin: from, "Content-Type": "application/json" }),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
    try {
      const key = "ab".repeat(32);
      const guest = await api("auth/join", {
        month: 1,
        year: 2000,
        consent: true,
        privacyVersion: PRIVACY_VERSION,
      });
      assert.equal(guest.status, 200, JSON.stringify(guest.data));

      // The old address plays no part in the game any more.
      assert.equal((await old("auth/config")).status, 403);
      assert.equal((await old("auth/me", undefined, guest.cookie)).status, 403);
      assert.equal((await old("move/claim", { code: "x" })).status, 403);
      assert.equal(
        (await old("world/connect", undefined, guest.cookie)).status,
        403,
      );
      assert.equal(
        (await old("auth/join", { month: 1, year: 2000 })).status,
        403,
      );
      // Another site cannot ask for a code, and the new address does not issue them.
      assert.equal(
        (await old("move", { key }, guest.cookie, origin)).status,
        403,
      );
      assert.equal((await api("move", { key }, guest.cookie)).status, 404);
      // A Stripe webhook sent to the old address still reaches the signature check.
      assert.notEqual(
        (await old("payments/webhook", { type: "x" })).status,
        403,
      );

      // No key from the new address, no code.
      assert.equal(
        (await old("move", { saves: {} }, guest.cookie)).status,
        400,
      );
      assert.deepEqual(await (await old("move", { key, saves: {} })).json(), {
        code: null,
      });
      const out = await old(
        "move",
        { key, saves: { "darecade-v1": '{"xp":40}', other: "dropped" } },
        guest.cookie,
      );
      assert.equal(out.status, 200);
      const { code } = await out.json();
      assert.match(code, /^[0-9a-f]{64}$/);

      const claimed = await api("move/claim", { code, key });
      assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
      assert.deepEqual(claimed.data, { saves: { "darecade-v1": '{"xp":40}' } });
      assert.match(
        claimed.headers.get("set-cookie"),
        /^darecade_session=[0-9a-f]{64}; HttpOnly; Secure; SameSite=Strict/,
      );
      assert.notEqual(claimed.cookie, guest.cookie);
      const me = await api("auth/me", undefined, claimed.cookie);
      assert.equal(me.status, 200);
      assert.equal(me.data.id, guest.data.id);
      // The code works once and the session it replaced is gone.
      assert.equal((await api("move/claim", { code, key })).status, 400);
      // A code made for one browser signs nobody in from another.
      const mine = await (
        await old("move", { key, saves: {} }, claimed.cookie)
      ).json();
      const theft = await api("move/claim", {
        code: mine.code,
        key: "cd".repeat(32),
      });
      assert.equal(theft.status, 400);
      assert.equal(theft.headers.get("set-cookie"), null);
      assert.equal(
        (await api("auth/me", undefined, claimed.cookie)).status,
        200,
      );
      assert.equal((await api("auth/me", undefined, guest.cookie)).status, 401);
    } finally {
      await mf.dispose();
    }
  },
);

test(
  "Cloudflare midnight alarm durably awards capped tokens, retries consolidated email and acknowledges XP notices once",
  { timeout: 30000 },
  async () => {
    const sends = new Map();
    let requests = 0;
    const { mf, api } = runtime(true, {
      awards: true,
      mail: async (request) => {
        requests++;
        const key = request.headers.get("Idempotency-Key");
        assert.ok(key);
        const payload = await request.text();
        if (sends.has(key)) assert.equal(sends.get(key), payload);
        sends.set(key, payload);
        if (requests === 1)
          return new Response("temporary failure", { status: 503 });
        return Response.json({ id: "fake-medal-mail" });
      },
    });
    try {
      const p = await api("auth/join", {
        month: 1,
        year: 2000,
        consent: true,
        privacyVersion: PRIVACY_VERSION,
      });
      assert.equal(p.status, 200);
      const sql = await mf.unsafeGetDurableObjectStorage(
        "darecade-test",
        "AwardsNeighbourhood",
        { name: "darecade-main-v1" },
      );
      const now = Date.now(),
        date = new Date(now + 8 * 3600000).toISOString().slice(0, 10),
        midnight = Date.parse(date + "T00:00:00+08:00") + 86400000;
      await sql.exec(
        "INSERT INTO accounts VALUES(?,?,?)",
        p.data.id,
        "awards@example.test",
        now - 86400000,
      );
      assert.equal(
        (await api("profile", { medalEmail: true }, p.cookie)).status,
        200,
      );
      for (const game of ["noodle", "hop"])
        await sql.exec(
          "INSERT INTO runs(id,player,game,started,finished,score,day,status,verified,eligible,seed,version) VALUES(?,?,?,?,?,?,?,'finished',1,1,123,1)",
          game,
          p.data.id,
          game,
          now - 1000,
          now,
          100,
          date,
        );
      const namespace = await mf.getDurableObjectNamespace("NEIGHBOURHOOD"),
        stub = namespace.get(namespace.idFromName("darecade-main-v1"));
      await stub.runAwardAlarm(midnight + 1000);
      assert.equal(
        (await api("auth/me", undefined, p.cookie)).data.progress.medalTokens,
        3,
      );
      assert.equal(
        (await sql.exec("SELECT status FROM medal_email_outbox"))[0].status,
        "pending",
      );
      await stub.runAwardAlarm(midnight + 61000);
      await stub.runAwardAlarm(midnight + 62000);
      assert.equal(requests, 2);
      assert.equal(sends.size, 1);
      assert.equal(
        (await sql.exec("SELECT status FROM medal_email_outbox"))[0].status,
        "sent",
      );
      assert.equal(
        (await sql.exec("SELECT COUNT(*) n FROM medal_rewards"))[0].n,
        1,
      );
      await sql.exec("INSERT INTO style_reward_notices VALUES(?,2)", p.data.id);
      const results = await Promise.all([
        api("style-rewards", {}, p.cookie),
        api("style-rewards", {}, p.cookie),
      ]);
      assert.deepEqual(results.map((r) => r.data.tokens).sort(), [0, 2]);
      assert.equal(
        (await api("auth/me", undefined, p.cookie)).data.styleRewards,
        0,
      );
      assert.equal((await api("dares", { run: "hop" }, p.cookie)).status, 400);
      const exported = await api("privacy/export", undefined, p.cookie);
      assert.equal(exported.data.medalRewards[0].tokens, 3);
      assert.equal(exported.data.medalEmails[0].status, "sent");
    } finally {
      await mf.dispose();
    }
  },
);
