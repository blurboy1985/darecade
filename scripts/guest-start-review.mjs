// Windows PowerShell: set PLAYWRIGHT_CORE to playwright-core/index.mjs, then
// node --experimental-strip-types scripts/guest-start-review.mjs
// Disposable in-memory database; no production accounts or payments.
import { pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { Store } from "../server/store.mjs";
import { CommunityCore } from "../server/community-core.mjs";
import { handleApi } from "../cloudflare/api.mjs";
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE).href
);
const store = new Store(":memory:");
const community = new CommunityCore(store, { files: { playtests: () => [] } });
const errors = [],
  results = [];
let origin;
const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "guest-start-review",
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (!req.url.startsWith("/api/")) return next();
          try {
            if (req.url.startsWith("/api/world/")) {
              res.setHeader("Content-Type", "application/json");
              res.end(
                JSON.stringify({
                  t: "sync",
                  at: Date.now(),
                  world: "review",
                  p: [],
                  d: [],
                  gone: [],
                }),
              );
              return;
            }
            const chunks = [];
            for await (const chunk of req) chunks.push(chunk);
            const response = await handleApi(
              new Request(origin + req.url, {
                method: req.method,
                headers: req.headers,
                ...(req.method === "POST"
                  ? { body: Buffer.concat(chunks) }
                  : {}),
              }),
              {
                community,
                store,
                rate() {},
                worlds: { refresh() {}, disconnect() {} },
              },
            );
            res.statusCode = response.status;
            response.headers.forEach((v, k) => res.setHeader(k, v));
            res.end(await response.text());
          } catch (error) {
            errors.push(error.message);
            res.statusCode = 500;
            res.end("fixture error");
          }
        });
      },
    },
  ],
});
await server.listen();
origin = `http://127.0.0.1:${server.httpServer.address().port}`;
community.origin = origin;
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  // Exercise the same intro policy as a person, rather than its automation skip.
  args: ["--disable-blink-features=AutomationControlled"],
});
const output = "output/playwright/guest-start";
mkdirSync(output, { recursive: true });
try {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1280, 800],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      reducedMotion: "no-preference",
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(origin);
    assert.equal(await page.evaluate(() => navigator.webdriver), false);
    await page.locator(".intro-skip").click();
    await page.locator("#consent-form").waitFor();
    const form = page.locator("#consent-form");
    assert.equal(await form.evaluate((f) => f.checkValidity()), false);
    await page.locator('[name="over13"]').check();
    await page.locator('[name="consent"]').check();
    assert.equal(await form.evaluate((f) => f.checkValidity()), false);
    await page.locator("#welcome-name").fill("MoonOtter");
    assert.equal(await form.evaluate((f) => f.checkValidity()), true);
    await page.screenshot({ path: `${output}/welcome-${width}.png` });
    await form.locator("button.primary").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#loading") &&
        document.querySelector("#world canvas"),
    );
    const profile = await page.evaluate(async () =>
      (await fetch("/api/auth/me")).json(),
    );
    assert.equal(profile.name, "MoonOtter");
    assert.equal(profile.progress.skin, 4);
    assert.equal(profile.progress.hair, 112);
    assert.equal(await page.locator(".starter-guide").isVisible(), true);
    await page.screenshot({ path: `${output}/lobby-${width}.png` });
    // Exercise the real narrow-screen navigation and guest name editor.
    await page.locator('.lobby-dock [data-open="wardrobe"]').click();
    await page.locator(".look-identity summary").click();
    await page.locator("#nickname").fill("StarOtter");
    await page.locator("#nickname-form button").click();
    await page.waitForFunction(
      () =>
        document.querySelector("#nickname-status")?.textContent ===
        "Nickname saved.",
    );
    await page.locator("#close-modal").click();
    await page.reload();
    await page.waitForFunction(
      () =>
        !document.querySelector("#loading") &&
        document.querySelector("#player-name")?.textContent === "StarOtter",
    );
    assert.equal(await page.locator("#player-name").textContent(), "StarOtter");
    await page.locator('.lobby-dock [data-open="phone-menu"]').click();
    await page.locator('[data-open="account"]').click();
    await page.locator("#reset-guest").click();
    assert.equal(
      await page
        .locator("#account-content form")
        .evaluate((f) => f.checkValidity()),
      false,
    );
    await page.locator("#keep-account").click();
    assert.equal(
      await page.evaluate(() => localStorage.getItem("playsimi-intro-seen")),
      "1",
    );
    assert.equal(await page.locator("#reset-guest").isVisible(), true);
    assert.equal(community.privateProfile(profile.id).name, "StarOtter");
    await page.locator("#reset-guest").click();
    await page.locator('[name="confirm"]').fill("RESET");
    await page.screenshot({ path: `${output}/reset-${width}.png` });
    await page.locator("#account-content form button").click();
    await page.locator(".intro-play").waitFor({ timeout: 5000 });
    assert.equal(
      await page.evaluate(() => localStorage.getItem("playsimi-intro-seen")),
      null,
    );
    // The start button pulses continuously; keyboard activation does not wait
    // for the animation to become stationary.
    await page.locator(".intro-play").press("Enter");
    await page.waitForFunction(
      () => document.querySelector(".intro-lines")?.textContent,
    );
    await page.screenshot({ path: `${output}/reset-intro-${width}.png` });
    await page.locator(".intro-skip").click();
    await page.locator("#welcome-name").waitFor();
    assert.throws(() => community.privateProfile(profile.id));
    assert.equal(
      await page.evaluate(() => localStorage.getItem("darecade-v1")),
      null,
    );
    assert.equal(await page.locator('[name="over13"]').isChecked(), false);
    assert.equal(await page.locator('[name="consent"]').isChecked(), false);
    await page.locator("#welcome-name").fill("FreshOtter");
    await page.locator('[name="over13"]').check();
    await page.locator('[name="consent"]').check();
    await page.locator("#consent-form button.primary").click();
    await page.waitForFunction(
      () =>
        !document.querySelector("#loading") &&
        document.querySelector("#player-name")?.textContent === "FreshOtter",
    );
    const fresh = await page.evaluate(async () =>
      (await fetch("/api/auth/me")).json(),
    );
    assert.notEqual(fresh.id, profile.id);
    assert.equal(fresh.progress.xp, 0);
    results.push({
      width,
      height,
      nickname: true,
      guide: true,
      reset: true,
      freshId: true,
      introReplaysAfterReset: true,
      errors: 0,
    });
    await context.close();
  }
  assert.deepEqual(errors, []);
  writeFileSync(
    `${output}/results.json`,
    JSON.stringify({ results, errors }, null, 2),
  );
  console.log(JSON.stringify({ results, errors }));
} finally {
  await browser.close();
  await server.close();
  store.close();
}
