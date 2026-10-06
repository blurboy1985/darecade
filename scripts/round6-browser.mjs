import { pathToFileURL } from "node:url";
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE).href
);
import { mkdirSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const out = "output/playwright/round6";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const report = [];
for (const [width, height, touch] of [
  [390, 844, true],
  [844, 390, true],
  [1280, 900, false],
]) {
  const name = `${width}x${height}`;
  const context = await browser.newContext({
    viewport: { width, height },
    hasTouch: touch,
    isMobile: touch,
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  const press = async (locator) => (touch ? locator.tap() : locator.click());
  const shot = async (phase) =>
    page.screenshot({ path: `${out}/${phase}-${name}.png` });
  try {
    await page.goto("http://127.0.0.1:4179");
    await page.getByRole("button", { name: "Agree & play" }).waitFor();
    const agree = page.getByRole("button", { name: "Agree & play" });
    const box = await agree.boundingBox();
    assert.ok(box.y + box.height <= height && box.x >= 0);
    await press(
      page.getByRole("switch", { name: "I'm 13 or older", exact: true }),
    );
    await press(
      page.getByRole("switch", { name: "I understand how my information" }),
    );
    await shot("phase1-age");
    await press(agree);
    await page.locator("#world canvas").waitFor();
    await page.waitForTimeout(1800);
    assert.equal(await page.locator("#account-dialog[open]").count(), 0);
    await page.reload();
    await page.locator("#world canvas").waitFor();
    assert.equal(await page.locator("#account-dialog[open]").count(), 0);
    await press(page.getByRole("button", { name: "Dismiss cap goal" }));
    await shot("phase4-lobby");
    // Jump with keyboard in every viewport; touch also uses the visible button.
    const canvas = page.locator("#world canvas");
    await page.keyboard.press("Space");
    await page.waitForTimeout(200);
    const keyboardHeight = Number(await canvas.getAttribute("data-elevation"));
    assert.ok(keyboardHeight > 0.3, `keyboard jump ${keyboardHeight}`);
    await page.waitForTimeout(900);
    if (touch) {
      await press(page.getByRole("button", { name: "Jump", exact: true }));
      await page.waitForTimeout(200);
      assert.ok(Number(await canvas.getAttribute("data-elevation")) > 0.3);
    }
    await page.waitForTimeout(900);
    await press(page.getByRole("button", { name: "Play", exact: true }));
    await press(page.locator('[data-game="hop"]'));
    await page.waitForTimeout(6000);
    if (touch) await press(page.locator(".game-touch [data-touch-action]"));
    else await page.keyboard.press("w+Space");
    await page.waitForTimeout(250);
    await shot("phase1-hop");
    await page.waitForTimeout(900);
    assert.ok(
      Number(await page.locator("#run-score").textContent()) > 40,
      "Hop cleared first crate",
    );
    await press(page.getByRole("button", { name: "Close panel" }));
    assert.equal(await page.locator("#modal[open]").count(), 0);
    await press(page.getByRole("button", { name: "Play", exact: true }));
    await press(page.locator('[data-game="swarm"]'));
    await page.locator("#game-mount canvas").waitFor();
    await page.waitForTimeout(300);
    await page.keyboard.down("ArrowLeft");
    await page.waitForTimeout(100);
    await page.keyboard.up("ArrowLeft"); // start waiting round, then release; no sustained participation
    await page.waitForTimeout(14500);
    await page.locator(".result-score").waitFor({ timeout: 125000 });
    assert.match(await page.locator(".result-score").innerText(), /^0/);
    assert.match(await page.locator(".round-breakdown").innerText(), /\+0/);
    const fit = await page.locator("#modal-body").evaluate((e) => ({
      scroll: e.scrollHeight,
      client: e.clientHeight,
      bottom: e.getBoundingClientRect().bottom,
    }));
    assert.ok(
      fit.scroll <= fit.client + 2,
      `inner scroll ${JSON.stringify(fit)}`,
    );
    assert.ok(fit.bottom <= height, `result bottom ${fit.bottom}`);
    await shot("phase3-zero-result");
    await press(page.getByRole("button", { name: "Close panel" }));
    await press(page.getByRole("button", { name: "Play", exact: true }));
    await press(page.locator('[data-game="brick"]'));
    await page.locator("#game-mount canvas").waitFor();
    const time = await page.locator(".time-pill").boundingBox();
    assert.ok(time.x + time.width <= width, "time fits");
    await shot("phase3-brick");
    await press(page.getByRole("button", { name: "Close panel" }));
    assert.equal(await page.locator("#modal[open]").count(), 0);
    await press(page.getByRole("button", { name: "My look", exact: true }));
    if (height < 500) {
      const el = page.locator(".wardrobe-controls");
      await el.hover();
      await page.mouse.wheel(0, 800);
      await page.waitForTimeout(200);
      assert.ok(
        (await el.evaluate((e) => e.scrollTop)) > 0,
        "landscape wardrobe wheel scroll",
      );
    }
    await shot("phase5-wardrobe");
    await press(page.locator('[data-open="support"]'));
    await page.getByRole("button", { name: "I'm 18 or older" }).waitFor();
    await shot("phase1-premium");
    const before = await page.evaluate(() =>
      fetch("/api/auth/me").then((r) => r.json()),
    );
    assert.equal(before.purchasesConfirmed, false);
    await press(page.getByRole("button", { name: "I'm 18 or older" }));
    await page.waitForTimeout(300);
    const after = await page.evaluate(() =>
      fetch("/api/auth/me").then((r) => r.json()),
    );
    assert.equal(after.purchasesConfirmed, true);
    report.push({ name, touch, passed: true, errors });
    console.log(name, "PASS", errors);
  } catch (e) {
    await shot("failure");
    report.push({ name, touch, passed: false, error: e.message, errors });
    console.error(name, e.message);
  }
  await context.close();
}
writeFileSync(`${out}/browser-report.json`, JSON.stringify(report, null, 2));
await browser.close();
if (report.some((r) => !r.passed || r.errors.length)) process.exitCode = 1;
