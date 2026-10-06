import { pathToFileURL } from "node:url";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE).href
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const out = "output/playwright/round6",
  reports = [];
for (const [width, height, touch] of [
  [390, 844, true],
  [844, 390, true],
  [1280, 900, false],
].filter(
  ([width]) =>
    !process.env.ROUND6_VIEW || String(width) === process.env.ROUND6_VIEW,
)) {
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
    for (const roof of [
      "arcade",
      "arcade-east",
      "shop",
      "shop-east",
      "dragon",
    ]) {
      await press(page.getByRole("button", { name: "Menu", exact: true }));
      await press(page.locator("[data-open=quests]"));
      if (roof.endsWith("-east"))
        await press(page.getByText("More stars", { exact: true }));
      await press(page.locator(`[data-rooftop="${roof}"]`));
      await page.waitForTimeout(11000);
      if (touch)
        await press(page.getByRole("button", { name: "Jump", exact: true }));
      else await page.keyboard.press("Space");
      await page.waitForTimeout(2200);
      const p = await page.evaluate(() =>
        fetch("/api/auth/me").then((r) => r.json()),
      );
      assert.ok(p.progress.roofStars.includes(roof), `${roof} not collected`);
      console.log(name, roof, "collected");
    }
    const p = await page.evaluate(() =>
      fetch("/api/auth/me").then((r) => r.json()),
    );
    assert.equal(p.progress.roofStars.length, 5);
    assert.equal(p.progress.xp, 80);
    await press(page.getByRole("button", { name: "Menu", exact: true }));
    await press(page.locator("[data-open=quests]"));
    await page
      .getByRole("heading", { name: "Rooftop hunt: 5/5 stars" })
      .waitFor();
    await page.screenshot({
      path: `${out}/phase1-rooftop-complete-${name}.png`,
    });
    reports.push({
      name,
      passed: true,
      stars: p.progress.roofStars,
      xp: p.progress.xp,
      errors,
    });
  } catch (e) {
    await page.screenshot({ path: `${out}/roof-failure-${name}.png` });
    reports.push({ name, passed: false, error: e.message, errors });
    console.error(name, e.message);
  } finally {
    await context.close();
  }
}
writeFileSync(
  `${out}/roofs-report.json`,
  JSON.stringify(
    [
      ...(existsSync(`${out}/roofs-report.json`)
        ? JSON.parse(readFileSync(`${out}/roofs-report.json`, "utf8")).filter(
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
