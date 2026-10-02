import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";

test(
  "HTTP routes require consent/session, reject cross-origin writes and protect private storage",
  { timeout: 20000 },
  async () => {
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((r) => reservation.close(() => r()));
    const dir = mkdtempSync(join(tmpdir(), "darecade-api-"));
    const origin = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ["server/index.mjs"], {
      cwd: resolve("."),
      env: {
        ...process.env,
        PORT: String(port),
        LAN_HOST: "",
        DARECADE_DATA: dir,
        NODE_ENV: "test",
        MAIL_MODE: "outbox",
        PUBLIC_ORIGIN: origin,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Test server did not start")),
          8000,
        );
        child.once("error", reject);
        child.stdout.on("data", (data) => {
          if (String(data).includes("neighbourhood ready")) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      const post = (
        path: string,
        body: unknown,
        cookie = "",
        requestOrigin = origin,
      ) =>
        fetch(origin + "/api/" + path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: requestOrigin,
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: JSON.stringify(body),
        });
      assert.equal((await fetch(origin + "/api/state")).status, 401);
      const config = await (await fetch(origin + "/api/auth/config")).json();
      const young = await post("auth/join", {
        month: 1,
        year: 2020,
        consent: true,
        privacyVersion: config.privacyVersion,
      });
      assert.equal(young.status, 400);
      assert.equal(young.headers.get("set-cookie"), null);
      const cross = await post(
        "auth/join",
        {
          month: 1,
          year: 2000,
          consent: true,
          privacyVersion: config.privacyVersion,
        },
        "",
        "https://unrelated.example",
      );
      assert.equal(cross.status, 403);
      const joined = await post("auth/join", {
        month: 1,
        year: 2000,
        consent: true,
        privacyVersion: config.privacyVersion,
      });
      assert.equal(joined.status, 200);
      const setCookie = joined.headers.get("set-cookie")!;
      assert.match(setCookie, /HttpOnly/);
      assert.match(setCookie, /SameSite=Strict/);
      const cookie = setCookie.split(";")[0];
      const profile = await joined.json();
      assert.equal(profile.progress.xp, 0);
      const hacked = await post(
        "profile",
        { xp: 999999, best: { noodle: 999999 }, unlockedHats: [0, 1, 2, 3] },
        cookie,
      );
      const saved = await hacked.json();
      assert.equal(saved.progress.xp, 0);
      assert.equal(saved.progress.best.noodle, 0);
      assert.deepEqual(saved.progress.unlockedHats, [0]);
      const begun = await (
        await post("run", { game: "noodle" }, cookie)
      ).json();
      const bad = await post("finish", { id: begun.id, score: 999999 }, cookie);
      assert.equal(bad.status, 400);
      const state = await (
        await fetch(origin + "/api/state", { headers: { Cookie: cookie } })
      ).json();
      assert.equal(state.profile.progress.xp, 0);
      assert.equal(state.boards.noodle.length, 0);
      assert.equal(state.weekly.length, 0);
      assert.equal(
        (await fetch(origin + "/data/neighbourhood.sqlite")).status,
        404,
      );
      assert.equal(
        (await fetch(origin + "/mail-outbox/test.json")).status,
        404,
      );
      const home = await fetch(origin + "/");
      assert.match(
        home.headers.get("content-security-policy")!,
        /frame-ancestors 'none'/,
      );
      assert.equal(home.headers.get("referrer-policy"), "no-referrer");
      assert.equal(
        (await post("privacy/delete", { confirm: "no" }, cookie)).status,
        400,
      );
      assert.equal(
        (await post("privacy/delete", { confirm: "DELETE" }, cookie)).status,
        200,
      );
      assert.equal(
        (await fetch(origin + "/api/auth/me", { headers: { Cookie: cookie } }))
          .status,
        401,
      );
      for (let i = 0; i < 12; i++)
        await post("auth/check", { month: 1, year: 2000 });
      assert.equal(
        (await post("auth/check", { month: 1, year: 2000 })).status,
        429,
      );
    } finally {
      const exited = once(child, "exit");
      child.kill();
      await exited;
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
