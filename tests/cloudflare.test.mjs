import test from "node:test";
import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { trackCurve } from "../shared/racing.ts";
import { Simulation, rulesVersion } from "../shared/simulation.ts";
import { PRIVACY_VERSION } from "../server/community-core.mjs";

const origin = "https://darecade.test";
function runtime(ready = true) {
  const messages = [];
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      name: "darecade-test",
      unsafeInspectDurableObjects: true,
      modules: true,
      scriptPath: ".browser/cloudflare-bundle/worker.js",
      compatibilityDate: "2026-10-03",
      compatibilityFlags: ["nodejs_compat"],
      durableObjects: {
        NEIGHBOURHOOD: { className: "Neighbourhood", useSQLite: true },
      },
      bindings: {
        LAUNCH_READY: String(ready),
        PUBLIC_ORIGIN: origin,
        RESEND_API_KEY: "test-only-key",
        MAIL_FROM: "Darecade <hello@example.test>",
        PRIVACY_CONTACT: "privacy@example.test",
        STORAGE_NOTICE: "Synthetic Cloudflare runtime test.",
      },
      serviceBindings: { ASSETS: () => new Response("asset fixture") },
      outboundService: async (request) => {
        assert.equal(request.url, "https://api.resend.com/emails");
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
        trackCurve(race.distance) * race.speed ** 2 * 0.1 -
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
        (await api("auth/link", { email: "cloud@example.test" }, cookie))
          .status,
        200,
      );
      assert.equal(messages.length, 1);
      const token = messages[0].text.match(/#login=([a-f0-9]+)/)[1];
      const signed = await Promise.all([
        api("auth/consume", { token }),
        api("auth/consume", { token }),
      ]);
      assert.deepEqual(signed.map((r) => r.status).sort(), [200, 400]);
      cookie = signed.find((r) => r.status === 200).cookie;
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
        (await api("auth/link", { email: "cloud@example.test" }, guest.cookie))
          .status,
        200,
      );
      const first = messages[0].text.match(/#login=([a-f0-9]+)/)[1];
      assert.equal((await api("auth/consume", { token: first })).status, 200);

      // A signed-out browser (no cookie) asks to sign in to the existing account.
      const known = await api("auth/login-link", {
        email: "  Cloud@Example.test ",
      });
      assert.equal(known.status, 200, JSON.stringify(known.data));
      assert.equal(messages.length, 2);
      assert.deepEqual(messages[1].to, ["cloud@example.test"]);
      const again = messages[1].text.match(/#login=([a-f0-9]+)/)[1];
      const signed = await api("auth/consume", { token: again });
      assert.equal(signed.status, 200);
      assert.equal(signed.data.id, guest.data.id);

      // An address with no account still gets an email, but never a sign-in link.
      const unknown = await api("auth/login-link", {
        email: "guest-only@example.test",
      });
      assert.equal(unknown.status, 200);
      assert.deepEqual(unknown.data, known.data);
      assert.equal(messages.length, 3);
      assert.deepEqual(messages[2].to, ["guest-only@example.test"]);
      assert.doesNotMatch(messages[2].text, /#login=/);
      assert.match(messages[2].text, /Account & privacy/);

      // Repeat requests for an unknown address are not re-sent within the hour.
      assert.equal(
        (await api("auth/login-link", { email: "guest-only@example.test" }))
          .status,
        200,
      );
      assert.equal(messages.length, 3);
      assert.equal(
        (await api("auth/login-link", { email: "not-an-email" })).status,
        400,
      );
    } finally {
      await mf.dispose();
    }
  },
);
