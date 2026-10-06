import { pathToFileURL } from "node:url";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import { trackCurve, raceTime } from "../shared/racing.ts";
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
      ([width]) =>
        !process.env.ROUND6_VIEW || String(width) === process.env.ROUND6_VIEW,
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
      const press = async (l) => (touch ? l.tap() : l.click());
      try {
        await page.goto(process.env.BASE_URL || "http://127.0.0.1:4179");
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
        await press(page.getByRole("button", { name: "Play", exact: true }));
        await press(page.locator("[data-game=coast]"));
        await page
          .locator(".coast-game[data-status=racing]")
          .waitFor({ timeout: 30000 });
        if (touch) await press(page.locator("[data-race-control=gas]"));
        else await page.keyboard.down("w");
        const cdp = touch ? await context.newCDPSession(page) : null;
        const box = touch
          ? await page.locator(".race-steer [data-joystick]").boundingBox()
          : null;
        const stick = box
          ? {
              x: box.x + box.width / 2,
              y: box.y + box.height / 2,
              r: box.width * 0.4,
            }
          : null;
        let lastDir = 0,
          oldOffset = 0,
          oldTicks = 0,
          finishTicks = 0;
        const started = Date.now();
        while (Date.now() - started < 210000) {
          const d = await page
            .locator(".coast-game")
            .evaluate((e) => ({ ...e.dataset }));
          finishTicks = +d.ticks;
          if (d.status === "finished") break;
          const dt = (+d.ticks - oldTicks) / 60,
            lateral = dt > 0 ? (+d.offset - oldOffset) / dt : 0;
          const force =
            trackCurve(+d.distance) * (+d.speed) ** 2 * 0.24 -
            +d.offset * 2 -
            lateral * 0.5;
          const dir = Math.abs(force) < 0.5 ? 0 : Math.sign(force);
          if (dir !== lastDir) {
            if (touch)
              await cdp.send("Input.dispatchTouchEvent", {
                type: dir ? (lastDir ? "touchMove" : "touchStart") : "touchEnd",
                touchPoints: dir
                  ? [{ x: stick.x + dir * stick.r, y: stick.y, id: 0 }]
                  : [],
              });
            else {
              if (lastDir) await page.keyboard.up(lastDir > 0 ? "d" : "a");
              if (dir) await page.keyboard.down(dir > 0 ? "d" : "a");
            }
          }
          lastDir = dir;
          oldOffset = +d.offset;
          oldTicks = +d.ticks;
          await page.waitForTimeout(65);
        }
        if (touch && lastDir)
          await cdp.send("Input.dispatchTouchEvent", {
            type: "touchEnd",
            touchPoints: [],
          });
        else {
          await page.keyboard.up("w");
          if (lastDir) await page.keyboard.up(lastDir > 0 ? "d" : "a");
        }
        await page
          .getByRole("button", { name: "See results" })
          .waitFor({ timeout: 5000 });
        const shown = await page
          .locator(".finish-stats span")
          .first()
          .innerText();
        assert.ok(
          shown.includes(raceTime(finishTicks)),
          `finish ${shown} vs ticks ${finishTicks}`,
        );
        await page.screenshot({
          path: `${out}/phase3-coast-finish-${name}.png`,
        });
        await press(page.getByRole("button", { name: "See results" }));
        await page.locator(".result-score").waitFor();
        const result = await page.locator(".result-score").innerText();
        assert.ok(
          result.includes(raceTime(finishTicks)),
          `result ${result} vs timer`,
        );
        assert.equal(await page.locator(".coast-game").count(), 0);
        const fit = await page.locator("#modal-body").evaluate((e) => ({
          scroll: e.scrollHeight,
          client: e.clientHeight,
          bottom: e.getBoundingClientRect().bottom,
        }));
        assert.ok(
          fit.scroll <= fit.client + 2 && fit.bottom <= height,
          JSON.stringify(fit),
        );
        await page.screenshot({
          path: `${out}/phase3-coast-results-${name}.png`,
        });
        console.log(name, "PASS Coast complete", result);
        return { name, passed: true, finishTicks, result, errors };
      } catch (e) {
        await page.screenshot({ path: `${out}/coast-failure-${name}.png` });
        console.error(name, e.message);
        return { name, passed: false, error: e.message, errors };
      } finally {
        await context.close();
      }
    }),
);
writeFileSync(
  `${out}/coast-report.json`,
  JSON.stringify(
    [
      ...(existsSync(`${out}/coast-report.json`)
        ? JSON.parse(readFileSync(`${out}/coast-report.json`, "utf8")).filter(
            (p) => !reports.some((r) => r.name === p.name),
          )
        : []),
      ...reports,
    ],
    null,
    2,
  ),
);
await browser.close();
if (reports.some((r) => !r.passed || r.errors.length)) process.exitCode = 1;
