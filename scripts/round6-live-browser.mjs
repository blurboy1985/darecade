import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const { chromium } = await import(
    pathToFileURL(process.env.PLAYWRIGHT_CORE).href
  ),
  browser = await chromium.launch({ channel: "chrome", headless: true }),
  reports = [];
try {
  for (const [width, height, touch] of [
    [390, 844, true],
    [844, 390, true],
    [1280, 900, false],
  ]) {
    const context = await browser.newContext({
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
    await page.goto("https://playsimi.danielquek.com", {
      waitUntil: "networkidle",
    });
    const press = (l) => (touch ? l.tap() : l.click());
    await press(
      page.getByRole("switch", { name: "I'm 13 or older", exact: true }),
    );
    await press(
      page.getByRole("switch", { name: "I understand how my information" }),
    );
    await page.waitForTimeout(250);
    const agree = page.getByRole("button", { name: "Agree & play" }),
      b = await agree.boundingBox();
    assert.ok(
      b.x >= 0 &&
        b.y >= 0 &&
        b.x + b.width <= width &&
        b.y + b.height <= height,
    );
    assert.equal(await page.getByRole("combobox").count(), 0);
    await page.screenshot({
      path: `output/playwright/round6/live-age-${width}x${height}.png`,
    });
    assert.deepEqual(errors, []);
    reports.push({
      viewport: `${width}x${height}`,
      touch,
      ageGateFits: true,
      errors,
    });
    await context.close();
  }
  writeFileSync(
    ".browser/round6-production-browser.json",
    JSON.stringify(reports, null, 2),
  );
  console.log(JSON.stringify(reports, null, 2));
} finally {
  await browser.close();
}
