import { pathToFileURL } from "node:url";
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
import { Simulation } from "../shared/simulation.ts";
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE).href
);
const out = "output/playwright/round6";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
for (const [width, height, touch] of [[390, 844, true]].filter(
  ([w]) => !process.env.ROUND6_VIEW || String(w) === process.env.ROUND6_VIEW,
)) {
  const name = `${width}x${height}`,
    context = await browser.newContext({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
    });
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const press = async (l) => (touch ? l.tap() : l.click()),
    shot = async (p) => page.screenshot({ path: `${out}/${p}-${name}.png` });
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
    await page.waitForTimeout(1500);
    await press(page.getByRole("button", { name: "Dismiss cap goal" }));
    await press(page.getByRole("button", { name: "Play", exact: true }));
    const response = page.waitForResponse(
      (r) => r.url().endsWith("/api/run") && r.request().method() === "POST",
    );
    await press(page.locator('[data-game="swarm"]'));
    const run = await (await response).json();
    await page.locator("#game-mount canvas").waitFor();
    await page.waitForTimeout(300);
    // Choose a reproducible steering cadence on the issued seed, then play it through
    // real keyboard/touch events. No client/server game state is modified.
    let best = { seconds: 0, period: 140 };
    for (const period of Array.from({ length: 57 }, (_, i) => 80 + i * 5)) {
      const s = new Simulation("swarm", run.seed, 3);
      while (!s.ended)
        s.advance([
          [20, 42, 64, 86, 108].some(
            (t) => s.elapsed >= t - 0.2 && s.elapsed < t + 1.3,
          )
            ? 0
            : Math.floor(s.ticks / period) % 2
              ? 1
              : -1,
          0,
          -1,
          0,
          -1,
          -1,
        ]);
      if (s.elapsed > best.seconds) best = { seconds: s.elapsed, period };
    }
    const cdp = touch ? await context.newCDPSession(page) : null;
    let stick;
    if (touch) {
      const b = await page.locator(".game-touch [data-joystick]").boundingBox();
      stick = { x: b.x + b.width / 2, y: b.y + b.height / 2, r: b.width * 0.4 };
    }
    let lastDirection = 0,
      started = Date.now(),
      shots = new Set();
    while (
      Date.now() - started < 95000 &&
      (await page.locator("#run-time").count())
    ) {
      const elapsed = (Date.now() - started) / 1000,
        direction = [20, 42, 64, 86, 108].some(
          (t) => elapsed >= t - 0.2 && elapsed < t + 1.3,
        )
          ? 0
          : Math.floor((elapsed * 60) / best.period) % 2
            ? 1
            : -1;
      if (direction !== lastDirection) {
        if (touch) {
          await cdp.send("Input.dispatchTouchEvent", {
            type: direction
              ? lastDirection
                ? "touchMove"
                : "touchStart"
              : "touchEnd",
            touchPoints: direction
              ? [{ x: stick.x + direction * stick.r, y: stick.y, id: 1 }]
              : [],
          });
        } else {
          if (lastDirection)
            await page.keyboard.up(
              lastDirection > 0 ? "ArrowRight" : "ArrowLeft",
            );
          if (direction)
            await page.keyboard.down(
              direction > 0 ? "ArrowRight" : "ArrowLeft",
            );
        }
        lastDirection = direction;
      }
      for (const seconds of [19, 21, 31, 44, 61, 86, 91])
        if (elapsed >= seconds && !shots.has(seconds)) {
          shots.add(seconds);
          await shot(`phase2-swarm-${seconds}s`);
        }
      await page.waitForTimeout(70);
    }
    if (touch)
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
    else await page.keyboard.up(lastDirection > 0 ? "ArrowRight" : "ArrowLeft");
    assert.ok(shots.has(91), "live Swarm reached the 90-second boss");
    results.push({ name, passed: true, seed: run.seed, swarm: best, errors });
    console.log(name, "PASS gameplay", errors);
  } catch (e) {
    await shot("gameplay-failure");
    results.push({ name, passed: false, error: e.message, errors });
    console.error(name, e.message);
  }
  await context.close();
}
const prior = existsSync(`${out}/boss-report.json`)
  ? JSON.parse(readFileSync(`${out}/boss-report.json`, "utf8"))
  : [];
writeFileSync(
  `${out}/boss-report.json`,
  JSON.stringify(
    [
      ...prior.filter((p) => !results.some((r) => r.name === p.name)),
      ...results,
    ],
    null,
    2,
  ),
);
await browser.close();
if (results.some((r) => !r.passed || r.errors.length)) process.exitCode = 1;
