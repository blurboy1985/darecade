import { pathToFileURL } from "node:url";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE).href
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = "output/playwright/round6";
const reports = await Promise.all(
  [
    [390, 844, true],
    [844, 390, true],
    [1280, 900, false],
  ]
    .filter(
      ([w]) =>
        !process.env.ROUND6_VIEW || String(w) === process.env.ROUND6_VIEW,
    )
    .map(async ([width, height, touch]) => {
      const name = `${width}x${height}`,
        context = await browser.newContext({
          viewport: { width, height },
          hasTouch: touch,
          isMobile: touch,
        }),
        page = await context.newPage(),
        errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      const press = async (l) => (touch ? l.tap() : l.click()),
        shot = async (p) =>
          page.screenshot({ path: `${out}/${p}-${name}.png` });
      try {
        await page.goto("http://127.0.0.1:4179");
        await press(
          page.getByRole("switch", { name: "I'm 13 or older", exact: true }),
        );
        await press(
          page.getByRole("switch", { name: "I understand how my information" }),
        );
        await press(page.getByRole("button", { name: "Agree & play" }));
        await page.locator("#world canvas").waitFor();
        await page.waitForTimeout(1200);
        await press(page.getByRole("button", { name: "Dismiss cap goal" }));
        for (const emote of ["wave", "dance", "cheer", "victory"]) {
          await press(page.locator(`#quick-emotes [data-emote=${emote}]`));
          await page.waitForTimeout(400);
          await shot(`phase4-${emote}`);
        }
        await press(
          page.getByRole("button", { name: "Friends and nearby players" }),
        );
        await page
          .getByRole("heading", { name: /neighbour|friend/i })
          .first()
          .waitFor();
        await press(page.getByRole("button", { name: "Close panel" }));
        await press(page.getByRole("button", { name: "My look", exact: true }));
        await press(page.locator('[data-wardrobe-section="Hair"]'));
        await press(
          page.locator('[data-try-slot="hair"][data-try-index="38"]'),
        );
        await page.waitForTimeout(500);
        const before = await page.evaluate(() =>
          fetch("/api/auth/me").then((r) => r.json()),
        );
        await press(page.locator('[data-wardrobe-section="Hats"]'));
        const helmet = page.locator(
          '[data-try-slot="hair"][data-try-index="6"]',
        );
        await press(helmet);
        assert.equal(await helmet.getAttribute("aria-pressed"), "true");
        await page.waitForTimeout(600);
        const after = await page.evaluate(() =>
          fetch("/api/auth/me").then((r) => r.json()),
        );
        assert.equal(after.progress.baseHair, before.progress.baseHair);
        assert.equal(after.progress.hair, 6);
        await shot("phase5-helmet");
        await press(helmet);
        assert.equal(
          await page
            .locator('[data-wardrobe-section="Hats"]')
            .getAttribute("aria-pressed"),
          "true",
        );
        await press(page.locator('[data-wardrobe-section="Hair"]'));
        const controls = page.locator(".wardrobe-controls");
        if (height < 500) {
          const b = await controls.boundingBox(),
            cdp = await context.newCDPSession(page);
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchStart",
            touchPoints: [
              { x: b.x + b.width * 0.7, y: b.y + b.height * 0.8, id: 1 },
            ],
          });
          for (let n = 1; n <= 10; n++) {
            await cdp.send("Input.dispatchTouchEvent", {
              type: "touchMove",
              touchPoints: [
                {
                  x: b.x + b.width * 0.7,
                  y: b.y + b.height * (0.8 - n * 0.05),
                  id: 1,
                },
              ],
            });
            await page.waitForTimeout(20);
          }
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
          assert.ok(
            (await controls.evaluate((e) => e.scrollTop)) > 0,
            "touch scroll",
          );
        }
        await shot("phase5-hair-scroll");
        await press(page.getByRole("button", { name: "Close panel" }));
        for (let n = 0; n < 14; n++)
          await press(
            page.getByRole("button", { name: "Zoom in", exact: true }),
          );
        await shot("phase5-max-zoom");
        await page.waitForTimeout(62000);
        assert.equal(await page.locator("#away-banner").isVisible(), true);
        if (touch) {
          assert.equal(await page.locator("#lobby-jump").isVisible(), true);
          assert.equal(await page.locator("#joystick").isVisible(), true);
        }
        assert.equal(await page.locator("#quick-emotes").isVisible(), true);
        await shot("phase4-afk");
        await page.keyboard.press("w");
        assert.equal(await page.locator("#away-banner").isVisible(), false);
        for (const game of ["hoops", "fishing"]) {
          await press(page.getByRole("button", { name: "Play", exact: true }));
          await press(page.locator(`[data-game="${game}"]`));
          await page.locator("#run-time").waitFor();
          const time = await page.locator(".time-pill").boundingBox();
          assert.ok(time.x >= 0 && time.x + time.width <= width);
          await shot(`phase3-${game}-hud`);
          await page.locator(".result-score").waitFor({ timeout: 70000 });
          await page.locator(".round-breakdown").waitFor();
          assert.match(await page.locator(".result-score").innerText(), /^0/);
          const fit = await page.locator("#modal-body").evaluate((e) => ({
            scroll: e.scrollHeight,
            height: e.clientHeight,
            bottom: e.getBoundingClientRect().bottom,
          }));
          assert.ok(fit.scroll <= fit.height + 2, JSON.stringify(fit));
          assert.ok(fit.bottom <= height);
          await shot(`phase3-${game}-zero`);
          await press(page.getByRole("button", { name: "Close panel" }));
        }
        console.log(name, "PASS polish", errors);
        return { name, passed: true, errors };
      } catch (e) {
        await shot("polish-failure");
        console.error(name, e.message);
        return { name, passed: false, error: e.message, errors };
      } finally {
        await context.close();
      }
    }),
);
writeFileSync(`${out}/polish-report.json`, JSON.stringify(reports, null, 2));
await browser.close();
if (reports.some((r) => !r.passed || r.errors.length)) process.exitCode = 1;
