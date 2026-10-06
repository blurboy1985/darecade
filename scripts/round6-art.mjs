import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE).href
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto("http://127.0.0.1:5176/scripts/art-review.html");
await page.waitForFunction(() => !!window.artReview);
const report = await page.evaluate(async () => {
  const result = await window.artReview.verify();
  const w = window.artReview.world;
  const { blocked } = await import("/src/navigation.ts");
  let props = 0,
    cameras = 0;
  const failures = [];
  w.setCameraMode("third");
  for (const o of w.obstacles) {
    w.placePlayer(o.x, o.z);
    if (
      blocked(w.player.root.position.x, w.player.root.position.z, w.obstacles)
    )
      failures.push(`spawn ${o.x},${o.z}`);
    props++;
    for (const side of [-1, 1]) {
      const x = o.x + side * (o.w / 2 + 0.6),
        z = o.z;
      if (blocked(x, z, w.obstacles)) continue;
      w.placePlayer(x, z);
      for (let n = 0; n < 8; n++) {
        w.angle = (n * Math.PI) / 4;
        w.pitch = 0.2;
        w.followDistance = 7;
        w.updateCamera();
        const p = w.camera.position;
        if (
          w.obstacles.some(
            (b) =>
              p.y > 0 &&
              p.y < b.cameraHeight &&
              Math.abs(p.x - b.x) < b.w / 2 &&
              Math.abs(p.z - b.z) < b.d / 2,
          )
        )
          failures.push(`camera ${o.x},${o.z},${n}`);
        cameras++;
      }
    }
  }
  return { art: result, props, cameras, failures };
});
writeFileSync(
  "output/playwright/round6/art-report.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report));
await browser.close();
if (report.failures.length) process.exitCode = 1;
