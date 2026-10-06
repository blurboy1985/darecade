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
for (const [width, height, touch] of [
  [390, 844, true],
  [844, 390, true],
  [1280, 900, false],
].filter(
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
    await press(page.locator('[data-open="relay"]'));
    await press(page.locator("[data-solo]"));
    await page.locator(".plaza-running").waitFor();
    assert.equal(await page.locator(".plaza-running input").count(), 0);
    await press(page.locator("[data-next]"));
    await page.waitForTimeout(700);
    await page.keyboard.press("Space");
    await shot("phase1-relay-running");
    await page.locator(".plaza-result").waitFor({ timeout: 65000 });
    const relay = await page.locator(".plaza-cue").innerText();
    assert.match(relay, /1st place/);
    assert.match(relay, /4\/4 gates/);
    assert.equal(await page.locator(".plaza-error").innerText(), "");
    await shot("phase1-relay-result");
    await page.waitForTimeout(2000);
    assert.equal(await page.locator(".plaza-error").innerText(), "");
    await press(page.locator("[data-leave]"));
    assert.equal(await page.locator(".plaza-relay").count(), 0);
    console.log(name, "relay", relay);
    await press(page.getByRole("button", { name: "Menu", exact: true }));
    await press(page.locator('[data-open="quests"]'));
    await press(page.locator('[data-rooftop="arcade"]'));
    await page.waitForTimeout(7000);
    if (touch)
      await press(page.getByRole("button", { name: "Jump", exact: true }));
    else await page.keyboard.press("Space");
    await page.waitForTimeout(750);
    await shot("phase1-pad-arc");
    await page.waitForTimeout(1400);
    const profile = await page.evaluate(() =>
      fetch("/api/auth/me").then((r) => r.json()),
    );
    assert.ok(
      profile.progress.roofStars.includes("arcade"),
      "roof star collected",
    );
    await press(page.getByRole("button", { name: "Menu", exact: true }));
    await press(page.locator('[data-open="quests"]'));
    await shot("phase1-rooftop-quest");
    await press(page.getByRole("button", { name: "Close panel" }));
    await press(page.getByRole("button", { name: "Play", exact: true }));
    await press(page.locator('[data-game="coast"]'));
    await page
      .locator('.coast-game[data-status="racing"]')
      .waitFor({ timeout: 30000 });
    await shot("phase3-coast-ready");
    await page.waitForTimeout(1500);
    assert.equal(
      await page.locator(".coast-game").getAttribute("data-ticks"),
      "0",
      "clock waits for throttle",
    );
    if (touch) await press(page.locator('[data-race-control="gas"]'));
    else await page.keyboard.down("w");
    await page.waitForTimeout(1800);
    if (!touch) await page.keyboard.up("w");
    await shot("phase3-coast-driving");
    await page.keyboard.press("Escape");
    await page.getByText("Leave this race?", { exact: true }).waitFor();
    await press(page.locator("[data-quit-race]"));
    await page.getByText("Race left early", { exact: false }).waitFor();
    await shot("phase3-coast-quit");
    await press(page.locator('[data-action="close"]'));
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
    for (const period of [100, 110, 120, 130, 140, 150, 160, 170, 180]) {
      const s = new Simulation("swarm", run.seed, 3);
      while (!s.ended)
        s.advance([
          s.elapsed >= 19.8 && s.elapsed < 21.3
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
      Date.now() - started < 63000 &&
      (await page.locator("#run-time").count())
    ) {
      const elapsed = (Date.now() - started) / 1000,
        direction =
          elapsed >= 19.8 && elapsed < 21.3
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
      for (const seconds of [19, 21, 31, 44, 61])
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
    assert.ok(shots.has(61), "live Swarm survived beyond 60 seconds");
    results.push({
      name,
      passed: true,
      relay,
      roofStars: profile.progress.roofStars,
      swarm: best,
      errors,
    });
    console.log(name, "PASS gameplay", errors);
  } catch (e) {
    await shot("gameplay-failure");
    results.push({ name, passed: false, error: e.message, errors });
    console.error(name, e.message);
  }
  await context.close();
}
const prior = existsSync(`${out}/gameplay-report.json`)
  ? JSON.parse(readFileSync(`${out}/gameplay-report.json`, "utf8"))
  : [];
writeFileSync(
  `${out}/gameplay-report.json`,
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
