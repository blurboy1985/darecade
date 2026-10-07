// Windows PowerShell: set PLAYWRIGHT_CORE to playwright-core/index.mjs, then
// node --experimental-strip-types scripts/guest-flow-review.mjs
// Uses disposable SQLite and a simulated Stripe boundary. No real payments.
import { pathToFileURL } from "node:url";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import { Payments } from "../server/payments.mjs";
import { handleApi } from "../cloudflare/api.mjs";
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE).href
);
const directory = mkdtempSync(join(tmpdir(), "playsimi-guest-review-"));
const store = new Store(":memory:");
const community = new Community(store, { directory });
const sessions = new Map();
const payments = new Payments(
  community,
  {
    PAYMENTS_ENABLED: "true",
    STRIPE_SECRET_KEY: "sk_test_fixture",
    STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    STRIPE_CATALOG: JSON.stringify({
      solar: { priceId: "price_solar", amount: 490 },
    }),
  },
  async (url, init) => {
    if (url.includes("/prices/"))
      return Response.json({
        active: true,
        type: "one_time",
        currency: "sgd",
        unit_amount: 490,
        livemode: false,
      });
    if (init.method === "POST") {
      const form = new URLSearchParams(init.body),
        id = `cs_test_fixture${sessions.size}`;
      const session = {
        id,
        url: `https://checkout.stripe.com/c/pay/${id}`,
        client_reference_id: form.get("client_reference_id"),
        metadata: { order: form.get("metadata[order]") },
        mode: "payment",
        currency: "sgd",
        amount_total: 490,
        livemode: false,
        status: "open",
        payment_status: "unpaid",
        payment_intent: {
          id: `pi_${sessions.size}`,
          latest_charge: { refunded: false, disputed: false },
        },
        line_items: {
          has_more: false,
          data: [{ quantity: 1, price: { id: "price_solar" } }],
        },
      };
      sessions.set(id, session);
      return Response.json(session);
    }
    return Response.json(
      sessions.get(url.split("/sessions/")[1].split("?")[0]),
    );
  },
);
const errors = [];
let origin;
const server = await createServer({
  server: { host: "127.0.0.1", port: 0 },
  plugins: [
    {
      name: "guest-flow-review",
      configureServer(vite) {
        vite.middlewares.use(async (req, res, next) => {
          if (!req.url.startsWith("/api/")) return next();
          try {
            // World presence is unrelated to this payment/score review.
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
            const request = new Request(origin + req.url, {
              method: req.method,
              headers: req.headers,
              ...(req.method === "POST" ? { body: Buffer.concat(chunks) } : {}),
            });
            const response = await handleApi(request, {
              community,
              store,
              payments,
              rate() {},
              worlds: { refresh() {} },
            });
            res.statusCode = response.status;
            response.headers.forEach((value, name) =>
              res.setHeader(name, value),
            );
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
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
const output = "output/playwright/guest-flow";
mkdirSync(output, { recursive: true });
try {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [844, 390],
    [1280, 800],
  ]) {
    const guest = community.join({
      over13: true,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    });
    community.patch(guest.me.id, { twoD: true, sound: false, music: false });
    const context = await browser.newContext({ viewport: { width, height } });
    await context.addCookies([
      {
        name: "darecade_session",
        value: guest.token,
        url: origin,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://checkout.stripe.com/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: "<h1>Simulated secure checkout</h1>",
      }),
    );
    await page.goto(origin);
    await page.waitForFunction(
      () =>
        !document.querySelector("#loading") &&
        !!document.querySelector("#player-name") &&
        document.querySelector("#player-name").textContent !== "New neighbour",
    );
    await page.locator('.lobby-dock [data-open="wardrobe"]').click();
    await page.locator('[data-wardrobe-section="Outfits"]').click();
    await page.locator('[data-wardrobe-filter="Legendary"]').click();
    await page.locator('[data-buy-set="solar"]').first().click();
    await page.getByRole("button", { name: "I'm 18 or older" }).click();
    const buy = page.locator('[data-checkout="solar"]');
    await buy.waitFor();
    assert.equal(await buy.isEnabled(), true);
    assert.equal(await page.locator("#account-dialog[open]").count(), 0);
    assert.equal(
      await page.locator(".payment-products .payment-product").count(),
      1,
    );
    await buy.scrollIntoViewIfNeeded();
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    );
    await page.screenshot({
      path: `${output}/purchase-${width}x${height}.png`,
    });
    await buy.click();
    await page.waitForURL("https://checkout.stripe.com/**");
    const session = [...sessions.values()].at(-1);
    session.status = "complete";
    session.payment_status = "paid";
    await page.goto(`${origin}/?payment=return&session_id=${session.id}`);
    await page
      .getByText("Solar Sentinel is yours.", { exact: false })
      .waitFor();
    const saved = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("darecade-v1")),
    );
    assert.ok(saved.wardrobePurchased.includes("solar"));
    const cookie = (await context.cookies()).find(
      (c) => c.name === "darecade_session",
    );
    assert.ok(
      cookie.httpOnly && cookie.expires > Date.now() / 1000 + 360 * 86400,
    );
    // Reopen the browser with its own persisted device state, without email.
    const storage = await context.storageState();
    await context.close();
    const reopened = await browser.newContext({
      viewport: { width, height },
      storageState: storage,
    });
    const again = await reopened.newPage();
    again.on("pageerror", (e) => errors.push(e.message));
    await again.goto(origin);
    await again.waitForFunction(
      () =>
        !document.querySelector("#loading") &&
        !!document.querySelector("#player-name") &&
        document.querySelector("#player-name").textContent !== "New neighbour",
    );
    const restored = await again.evaluate(() =>
      fetch("/api/auth/me").then((r) => r.json()),
    );
    assert.equal(restored.id, guest.me.id);
    assert.equal(restored.account, null);
    assert.ok(restored.progress.wardrobePurchased.includes("solar"));
    await again.locator('.lobby-dock [data-open="phone-menu"]').click();
    await again.locator('[data-open="quests"]').click();
    await again.locator('[data-quest-tab][data-open="board"]').click();
    await again
      .getByRole("heading", { name: "Rankings", exact: true })
      .waitFor();
    assert.ok(
      await again
        .getByText("XP to your next Style token", { exact: false })
        .count(),
    );
    assert.equal(await again.locator("#account-dialog[open]").count(), 0);
    await again.screenshot({
      path: `${output}/rankings-${width}x${height}.png`,
    });
    results.push({
      width,
      height,
      guestPurchase: true,
      localPurchaseSaved: true,
      reopenedSameGuest: true,
      emailPrompts: 0,
    });
    await reopened.close();
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
  rmSync(directory, { recursive: true, force: true });
}
