import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { mkdirSync, writeFileSync } from "node:fs";
import { mobileLobbyFixture } from "../tests/mobile-lobby-fixture.ts";

// Run after npm run build. PLAYWRIGHT_CORE points to an installed playwright-core entry.
assert.ok(
  process.env.PLAYWRIGHT_CORE,
  "Set PLAYWRIGHT_CORE to playwright-core/index.mjs",
);
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE).href
);
const server = mobileLobbyFixture(390, 844, false, false, false);
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const output = "output/playwright/jump-controls";
mkdirSync(output, { recursive: true });
const reports = [];
try {
  for (const [width, height, touch] of [
    [320, 568, true],
    [390, 844, true],
    [844, 390, true],
    [1280, 900, false],
  ]) {
    const context = await browser.newContext({
      viewport: { width, height },
      hasTouch: touch,
      isMobile: touch,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      // This HTTP-only fixture exercises presence polling after the expected
      // WebSocket handshake rejection. Other console errors still fail the check.
      if (
        message.type() === "error" &&
        !/^WebSocket connection to 'ws:\/\/127\.0\.0\.1:\d+\/api\/world\/connect\?.*' failed: Error during WebSocket handshake: Unexpected response code: 404$/.test(
          message.text(),
        )
      )
        errors.push(message.text());
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/?intro=0`);
    await page.waitForFunction(
      () =>
        !document.querySelector("#loading") &&
        document.querySelector("#world canvas")?.dataset.position,
    );
    await page.evaluate(() => {
      localStorage.setItem("playsimi-jump-hint", "1");
      document.querySelector('[data-action="welcome-skip"]')?.click();
      window.jumpEvents = [];
      addEventListener("world-jump", (event) =>
        window.jumpEvents.push(event.detail),
      );
    });
    const jump = page.locator("#lobby-jump");
    assert.equal(await jump.isVisible(), true);
    assert.equal(await jump.textContent(), "Jump");
    const box = await jump.boundingBox();
    assert.ok(box && box.width >= 76 && box.height >= 76);
    assert.ok(
      box.x >= 0 &&
        box.y >= 0 &&
        box.x + box.width <= width &&
        box.y + box.height <= height,
    );
    const canvas = page.locator("#world canvas");
    const count = () => page.evaluate(() => window.jumpEvents.length);
    const position = async () =>
      (await canvas.getAttribute("data-position")).split(",").map(Number);
    const landed = () =>
      page.waitForFunction(
        () =>
          Number(document.querySelector("#world canvas").dataset.elevation) <=
          0.11,
      );
    const report = { width, height, touch, button: box };
    if (touch) {
      const cdp = await context.newCDPSession(page);
      const stick = await page.locator("#joystick").boundingBox();
      const walking = {
        id: 1,
        x: stick.x + stick.width / 2,
        y: stick.y + stick.height * 0.2,
      };
      const jumping = {
        id: 2,
        x: box.x + box.width / 2,
        y: box.y + box.height / 2,
      };
      const send = (type, touchPoints) =>
        cdp.send("Input.dispatchTouchEvent", { type, touchPoints });
      await send("touchStart", [walking]);
      await page.waitForTimeout(150);
      const start = await position();
      await send("touchStart", [walking, jumping]);
      await page.waitForTimeout(180);
      report.heightWhileWalking = Number(
        await canvas.getAttribute("data-elevation"),
      );
      assert.ok(
        report.heightWhileWalking > 0.3,
        "second finger jumps while joystick is held",
      );
      const during = await position();
      assert.ok(
        Math.hypot(during[0] - start[0], during[1] - start[1]) > 0.1,
        "walking continues during jump",
      );
      await send("touchMove", [walking]);
      await page.waitForFunction(
        (previous) => {
          const current = document
            .querySelector("#world canvas")
            .dataset.position.split(",")
            .map(Number);
          return (
            Math.hypot(current[0] - previous[0], current[1] - previous[1]) > 0.1
          );
        },
        during,
        { timeout: 2000 },
      );
      const after = await position();
      assert.ok(
        Math.hypot(after[0] - during[0], after[1] - during[1]) > 0.1,
        "releasing Jump keeps the joystick active: " +
          JSON.stringify({ start, during, after }),
      );
      await send("touchEnd", []);
      await landed();
      await page.waitForTimeout(250);
      assert.equal(await count(), 1, "one jump per touch");
      const stopped = await position();
      await page.waitForTimeout(120);
      assert.deepEqual(
        await position(),
        stopped,
        "releasing the joystick stops walking",
      );
      // A long primary touch produces a release click in browsers. It must not jump again.
      await send("touchStart", [jumping]);
      await page.waitForTimeout(160);
      assert.equal(await count(), 2);
      await landed();
      await send("touchEnd", []);
      await page.waitForTimeout(250);
      assert.equal(
        await count(),
        2,
        "release after landing does not queue another jump",
      );
      await send("touchStart", [jumping]);
      await page.waitForTimeout(120);
      await send("touchCancel", []);
      await landed();
      assert.equal(await count(), 3);
      await jump.tap();
      await page.waitForTimeout(120);
      assert.equal(await count(), 4, "touch works after cancellation");
      await landed();
    } else {
      await page.keyboard.down("w");
      const start = await position();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(180);
      assert.ok(Number(await canvas.getAttribute("data-elevation")) > 0.3);
      assert.notDeepEqual(
        await position(),
        start,
        "mouse jump preserves keyboard walking",
      );
      await page.keyboard.up("w");
      await landed();
      await page.mouse.up();
      await page.waitForTimeout(250);
      assert.equal(await count(), 1, "mouse release does not jump again");
      await jump.focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(120);
      assert.equal(await count(), 2, "Enter activates focused button");
      await landed();
      await page.keyboard.press("Space");
      await page.waitForTimeout(120);
      assert.equal(await count(), 3, "Space shortcut remains available");
      await landed();
    }
    assert.equal(
      await page.evaluate(() => {
        const nearby = document.querySelector("#interaction");
        nearby.hidden = false;
        const button = document.querySelector("#lobby-jump");
        return [nearby, button].every((el) => {
          const r = el.getBoundingClientRect();
          return el.contains(
            document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2),
          );
        });
      }),
      true,
      "nearby action and Jump are both unobstructed",
    );
    await page.evaluate(
      () => (document.querySelector("#interaction").hidden = true),
    );
    for (const state of ["is-away", "is-interacting", "inspecting"]) {
      await page.evaluate((state) => document.body.classList.add(state), state);
      assert.equal(await jump.isVisible(), false, state);
      await page.evaluate(
        (state) => document.body.classList.remove(state),
        state,
      );
    }
    await page.locator('[data-open="phone-menu"]').click();
    assert.equal(await jump.isVisible(), false, "Jump hides behind menus");
    await page.locator("#close-modal").click();
    assert.equal(await jump.isVisible(), true);
    await page.screenshot({ path: `${output}/${width}x${height}.png` });
    assert.deepEqual(errors, []);
    reports.push({ ...report, jumps: await count(), errors });
    await context.close();
  }
  writeFileSync(`${output}/report.json`, JSON.stringify(reports, null, 2));
  console.log(JSON.stringify(reports, null, 2));
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
