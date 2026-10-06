import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE).href
);
const browser = await chromium.launch({ channel: "chrome", headless: true }),
  results = [];
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
    page = await context.newPage();
  const press = (l) => (touch ? l.tap() : l.click());
  await page.goto("http://127.0.0.1:4181");
  await press(
    page.getByRole("switch", { name: "I'm 13 or older", exact: true }),
  );
  await press(
    page.getByRole("switch", { name: "I understand how my information" }),
  );
  await page.waitForTimeout(220);
  await page.screenshot({
    path: `output/playwright/round6/phase1-age-${width}x${height}.png`,
  });
  await press(page.getByRole("button", { name: "Agree & play" }));
  await page.locator("#world canvas").waitFor();
  await page.waitForTimeout(1000);
  await press(page.getByRole("button", { name: "Dismiss cap goal" }));
  await press(page.getByRole("button", { name: "My look", exact: true }));
  await press(page.locator("[data-wardrobe-section=Hair]"));
  await page.evaluate(() => {
    window.equipTimes = [];
    document.addEventListener(
      "click",
      (e) => {
        const b = e.target.closest("[data-try-index]");
        if (!b) return;
        const start = performance.now();
        requestAnimationFrame(() => {
          const selected = document.querySelector(
            `[data-try-slot="${b.dataset.trySlot}"][data-try-index="${b.dataset.tryIndex}"]`,
          );
          window.equipTimes.push({
            ms: performance.now() - start,
            selected: selected?.getAttribute("aria-pressed") === "true",
          });
        });
      },
      true,
    );
  });
  const indices = await page
    .locator('.try-item[aria-label^="Equip"][aria-pressed="false"]')
    .evaluateAll((es) => es.slice(0, 3).map((e) => e.dataset.tryIndex));
  for (const index of indices) {
    await press(
      page.locator(`[data-try-slot=hair][data-try-index="${index}"]`),
    );
    await page.waitForTimeout(300);
  }
  const samples = await page.evaluate(() => window.equipTimes);
  assert.equal(samples.length, 3);
  assert.ok(
    samples.every((s) => s.selected && s.ms < 200),
    JSON.stringify(samples),
  );
  results.push({ name: `${width}x${height}`, passed: true, samples });
  console.log(width, samples);
  await context.close();
}
writeFileSync(
  "output/playwright/round6/latency-report.json",
  JSON.stringify(results, null, 2),
);
await browser.close();
