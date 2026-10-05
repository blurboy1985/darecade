import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { PRIVACY_VERSION } from "../server/community-core.mjs";

test(
  "actual Node HTTP Relay routes enforce identity, readiness, epoch ownership and deletion privacy",
  { timeout: 20000 },
  async () => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    const address = probe.address();
    assert.ok(address && typeof address !== "string");
    const port = address.port;
    await new Promise<void>((resolve, reject) =>
      probe.close((error) => (error ? reject(error) : resolve())),
    );
    const directory = mkdtempSync(join(tmpdir(), "darecade-relay-http-")),
      origin = "http://127.0.0.1:" + port;
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "server/index.mjs"],
      {
        cwd: new URL("..", import.meta.url),
        env: {
          ...process.env,
          NODE_ENV: "development",
          PORT: String(port),
          PUBLIC_ORIGIN: origin,
          DARECADE_DATA: directory,
          MAIL_MODE: "outbox",
          COMPETITION_SEASONS: "[]",
          SEASON_VIEW: "false",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const api = async (
      path: string,
      data?: object,
      cookie = "",
      requestOrigin = origin,
    ) => {
      const response = await fetch(origin + "/api/" + path, {
        method: data === undefined ? "GET" : "POST",
        headers: {
          Origin: requestOrigin,
          ...(data === undefined ? {} : { "Content-Type": "application/json" }),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(data === undefined ? {} : { body: JSON.stringify(data) }),
      });
      const body = await response.text();
      return {
        status: response.status,
        data: body ? JSON.parse(body) : null,
        cookie: response.headers.get("set-cookie")?.split(";")[0],
      };
    };
    try {
      let ready = false;
      for (let i = 0; i < 40; i++) {
        if (child.exitCode !== null)
          throw Error("Fixture server stopped: " + output);
        try {
          ready = (await api("auth/config")).status === 200;
        } catch {}
        if (ready) break;
        await delay(50);
      }
      assert.ok(ready, "Isolated fixture server must start: " + output);
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
      const before = (await api("privacy/export", undefined, a.cookie)).data;
      assert.equal(
        (await api("relay/create", { solo: false, difficulty: "standard" }))
          .status,
        401,
      );
      assert.equal(
        (
          await api(
            "relay/create",
            { solo: false, difficulty: "standard" },
            a.cookie,
            "https://foreign.test",
          )
        ).status,
        403,
      );
      assert.equal(
        (await api("relay/create", undefined, a.cookie)).status,
        405,
      );
      const r = await api(
        "relay/create",
        { solo: false, difficulty: "standard" },
        a.cookie,
      );
      assert.equal(r.status, 200);
      assert.equal(
        (await api("relay/start", { room: r.data.room }, a.cookie)).status,
        400,
      );
      const joined = await api("relay/join", { code: r.data.code }, b.cookie);
      assert.equal(joined.status, 200);
      assert.equal(joined.data.players.length, 2);
      await api("relay/ready", { room: r.data.room, ready: true }, a.cookie);
      await api("relay/ready", { room: r.data.room, ready: true }, b.cookie);
      assert.equal(
        (await api("relay/start", { room: r.data.room }, b.cookie)).status,
        403,
      );
      assert.equal(
        (await api("relay/start", { room: r.data.room }, a.cookie)).data.status,
        "running",
      );
      const controls = {
        room: r.data.room,
        controlEpoch: r.data.controlEpoch,
        seq: 0,
        actionSeq: 0,
        input: { x: 0, z: 1 },
      };
      assert.equal(
        (await api("relay/tick", { ...controls, x: 999 }, a.cookie)).status,
        400,
      );
      assert.equal((await api("relay/tick", controls, a.cookie)).status, 200);
      await delay(55);
      const advanced = await api(
        "relay/tick",
        { ...controls, seq: 1 },
        a.cookie,
      );
      assert.ok(
        advanced.data.simulation.tick > 0 &&
          advanced.data.simulation.runners[0].z > 0,
      );
      const resumed = await api("relay/join", { room: r.data.room }, a.cookie);
      assert.notEqual(resumed.data.controlEpoch, r.data.controlEpoch);
      assert.equal(
        (
          await api(
            "relay/leave",
            { room: r.data.room, controlEpoch: r.data.controlEpoch },
            a.cookie,
          )
        ).status,
        409,
      );
      assert.equal(
        (
          await api(
            "relay/tick",
            { ...controls, controlEpoch: resumed.data.controlEpoch },
            a.cookie,
          )
        ).status,
        200,
      );
      assert.equal(
        (await api("privacy/delete", { confirm: "DELETE" }, b.cookie)).status,
        200,
      );
      const cancelled = await api(
        "relay/tick",
        { ...controls, controlEpoch: resumed.data.controlEpoch, seq: 1 },
        a.cookie,
      );
      assert.equal(cancelled.data.status, "cancelled");
      assert.equal(cancelled.data.simulation, null);
      assert.deepEqual(
        cancelled.data.players.map((p: { slot: number }) => p.slot),
        [0],
      );
      const after = (await api("privacy/export", undefined, a.cookie)).data;
      assert.deepEqual(after.profile.progress, before.profile.progress);
      assert.deepEqual(after.medals, before.medals);
      assert.deepEqual(after.rounds, before.rounds);
      assert.equal(
        (
          await api(
            "relay/leave",
            { room: r.data.room, controlEpoch: resumed.data.controlEpoch },
            a.cookie,
          )
        ).status,
        200,
      );
    } finally {
      if (child.exitCode === null) {
        child.kill("SIGINT");
        const exited = await Promise.race([
          once(child, "exit").then(() => true),
          delay(2000, undefined, { ref: false }).then(() => false),
        ]);
        if (!exited) {
          child.kill("SIGKILL");
          await once(child, "exit");
        }
      }
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
