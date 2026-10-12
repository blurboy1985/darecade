import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE).href
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
await page.goto("http://127.0.0.1:5176/scripts/art-review.html");
await page.waitForFunction(() => !!window.artReview);
const count = await page.evaluate(async () => {
  const T = await import("/node_modules/.vite/deps/three.js");
  const C = await import("/src/character.ts");
  await C.loadCharacter();
  const { fresh } = await import("/src/state.ts");
  const { hairNames } = await import("/src/appearance.ts");
  window.artReview.world.dispose();
  window.artReview.preview.dispose();
  document.body.innerHTML =
    '<main id="gallery" style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px"></main>';
  document.body.style.cssText =
    "margin:12px;background:#eff0dc;color:#263447;font:12px sans-serif";
  const scene = new T.Scene();
  scene.background = new T.Color("#dae6df");
  scene.add(new T.HemisphereLight("#ffffff", "#6e7391", 3));
  const sun = new T.DirectionalLight("#fff2d8", 3);
  sun.position.set(-3, 5, 4);
  scene.add(sun);
  const renderer = new T.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(190, 180);
  const camera = new T.PerspectiveCamera(40, 190 / 180, 0.01, 20);
  camera.position.set(0, 1.8, 2.4);
  camera.lookAt(0, 1.65, 0);
  const base = {
    ...fresh(),
    hair: 0,
    baseHair: 0,
    clothing: 0,
    pet: 0,
    accessory: 0,
  };
  const avatar = C.createAvatar(scene, 0, 0, "#75b9aa", "#eec9a6", base);
  const hats = hairNames
    .slice(0, 53)
    .flatMap((name, hair) =>
      [0, 1, 2, 3, 38, 41, 44].includes(hair) ? [] : [{ name, hair }],
    );
  for (const hat of hats) {
    C.applyLook(avatar, { ...base, ...hat });
    for (const [view, angle] of [
      ["front", 0],
      ["side", Math.PI / 2],
    ]) {
      avatar.root.rotation.y = angle;
      C.animateDetails(avatar, 1.4, "idle", true);
      renderer.render(scene, camera);
      const tile = document.createElement("figure");
      tile.style.cssText =
        "margin:0;background:white;padding:3px;border-radius:8px";
      tile.innerHTML = `<img style="width:100%" src="${renderer.domElement.toDataURL()}"><figcaption>${hat.name} · ${view}</figcaption>`;
      document.querySelector("#gallery").append(tile);
    }
  }
  C.disposeAvatar(avatar);
  renderer.dispose();
  return hats.length;
});
for (let i = 0; i < 4; i++) {
  await page.evaluate((n) => window.scrollTo(0, n * 900), i);
  await page.screenshot({
    path: `output/playwright/round6/phase5-hats-${i + 1}.png`,
  });
}
console.log(count, "headwear options rendered from front and side");
await browser.close();
