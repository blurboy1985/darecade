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
  "retired Node HTTP Relay routes preserve identity, privacy and player data",
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
      for (const action of [
        "create",
        "join",
        "ready",
        "start",
        "tick",
        "leave",
      ]) {
        const retired = await api("relay/" + action, {}, a.cookie);
        assert.equal(retired.status, 410, action);
        assert.match(retired.data.error, /has been removed/);
      }
      const after = (await api("privacy/export", undefined, a.cookie)).data;
      assert.deepEqual(after.profile.progress, before.profile.progress);
      assert.deepEqual(after.rounds, before.rounds);
      assert.deepEqual(after.medals, before.medals);
      assert.equal(
        (await api("privacy/delete", { confirm: "DELETE" }, a.cookie)).status,
        200,
      );
      assert.equal((await api("auth/me", undefined, a.cookie)).status, 401);
      assert.equal(
        (await api("privacy/delete", { confirm: "DELETE" }, b.cookie)).status,
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
