// PowerShell: set PLAYWRIGHT_CORE to the installed playwright-core/index.mjs.
// Start npm run dev -- --port 5176, then node scripts/hair-fit-review.mjs after.
// Synthetic local models only. No account, storage or API writes.
import { pathToFileURL } from "node:url";
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE).href
);
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync("output/playwright/hair-fit", { recursive: true });
const tag = process.argv[2] || "after";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5176/scripts/hair-fit-review.html");
  await page.waitForFunction(() => !!window.hairReviewModules);
  await page.evaluate(async () => {
    const { three: T, character, collections } = window.hairReviewModules;
    window.hairReviewCharacter = character;
    const { createAvatar, disposeAvatar, loadCharacter, animateDetails } =
      character;
    await loadCharacter();
    const { legendarySets, setLook } = collections;
    document.body.innerHTML = "";
    document.body.style.cssText = "margin:0;background:#f5f0e2";
    const renderer = new T.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    renderer.setSize(1600, 900);
    renderer.setPixelRatio(1);
    document.body.append(renderer.domElement);
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    const scene = new T.Scene();
    scene.background = new T.Color("#f5f0e2");
    scene.add(new T.HemisphereLight("#fff4e4", "#8b9e93", 2.6));
    const light = new T.DirectionalLight("#fff3dd", 3.3);
    light.position.set(-5, 10, 8);
    scene.add(light);
    const camera = new T.OrthographicCamera(-0.72, 0.72, 1.02, -1.02, 0.1, 30);
    camera.position.set(0, 1.8, 8);
    camera.lookAt(0, 1.6, 0);
    window.captureHair = (body = 0, mode = "hair") => {
      camera.position.set(0, 1.8, 8);
      camera.lookAt(0, 1.6, 0);
      camera.left = -0.72;
      camera.right = 0.72;
      camera.top = 1.02;
      camera.bottom = -1.02;
      camera.updateProjectionMatrix();
      const crowns = mode === "crowns" || mode === "starter-crowns";
      document.querySelectorAll(".label").forEach((e) => e.remove());
      renderer.setScissorTest(true);
      const counts = [];
      for (let row = 0; row < 3; row++)
        for (let col = 0; col < 8; col++) {
          let look = {
            outfit: 0,
            skin: 0,
            body,
            hat: 0,
            clothing: 0,
            hair: 53 + col,
            pet: 0,
            accessory: 0,
          };
          if (crowns) {
            const set = legendarySets.findIndex((s) =>
              s.name.includes(
                row === 0 ? "Eclipse" : row === 1 ? "Crystal" : "Solar",
              ),
            );
            look = {
              ...look,
              ...setLook(set),
              baseHair: 53 + col,
              body,
              pet: 0,
              accessory: 0,
            };
          }
          if (mode === "starter-crowns") look.clothing = [1, 5, 7][row];
          if (mode === "headwear") {
            const set = legendarySets.findIndex(
              (s) =>
                s.id ===
                ["apprentice-mage", "moon-student", "void-deck-weekend"][row],
            );
            look = {
              ...look,
              ...setLook(set),
              baseHair: 53 + col,
              body,
              pet: 0,
              accessory: 0,
            };
          }
          const avatar = createAvatar(
            scene,
            0,
            0,
            "#76cfe0",
            "#ffc8b6",
            0,
            look,
          );
          if (mode === "hats") {
            look.hat = row === 0 ? 1 : row === 1 ? 2 : 3;
            const { applyLook } = window.hairReviewCharacter;
            applyLook(avatar, look);
          }
          avatar.root.rotation.y =
            crowns || mode === "hats" || mode === "headwear"
              ? 0.3
              : (row * Math.PI) / 2;
          if (mode === "poses") {
            camera.position.set(0, 2.8, 8);
            camera.lookAt(0, 0.95, 0);
            camera.left = -1.15;
            camera.right = 1.15;
            camera.top = 1.64;
            camera.bottom = -1.64;
            camera.updateProjectionMatrix();
            // Pose inputs normally provided by LobbyWorld before skin fitting.
            avatar.moving = col < 2;
            if (col < 2) {
              avatar.legs[0].rotation.x = 0.5;
              avatar.legs[1].rotation.x = -0.5;
            } else if (col === 2 || col === 3) {
              avatar.legs.forEach((leg) => (leg.rotation.x = -1.35));
            } else if (col === 4) {
              avatar.left.rotation.x = avatar.right.rotation.x = -0.8;
            }
            animateDetails(
              avatar,
              1.4,
              [
                "walk",
                "jog",
                "bench",
                "swing",
                "arcade",
                "wave",
                "dance",
                "jump",
              ][col],
              false,
            );
          }
          renderer.setViewport(col * 200, (2 - row) * 300, 200, 300);
          renderer.setScissor(col * 200, (2 - row) * 300, 200, 300);
          renderer.render(scene, camera);
          counts.push(renderer.info.render.triangles);
          const label = document.createElement("div");
          label.className = "label";
          label.style.cssText = `position:absolute;left:${col * 200 + 6}px;top:${row * 300 + 6}px;font:13px sans-serif`;
          label.textContent = `${["Spiky", "Flowing", "Buns", "Messy", "Ponytail", "Bob", "Braid", "Tails"][col]} · ${mode === "headwear" ? ["Apprentice", "Moon Academy", "Kopi bucket"][row] : crowns ? ["Eclipse", "Crystal", "Solar"][row] : mode === "hats" ? ["Cap", "Lilac existing owner", "Sprout"][row] : mode === "poses" ? ["walk", "run", "bench", "swing", "arcade", "wave", "dance", "jump"][col] : ["Front", "Side", "Back"][row]}`;
          document.body.append(label);
          disposeAvatar(avatar);
        }
      return counts;
    };
    window.captureHairPortrait = (body) => {
      document.querySelectorAll(".label").forEach((e) => e.remove());
      const width = window.innerWidth,
        height = window.innerHeight;
      renderer.setSize(width, height);
      renderer.setScissorTest(false);
      const halfHeight = Math.max(0.85, (0.7 * height) / width);
      camera.left = (-halfHeight * width) / height;
      camera.right = (halfHeight * width) / height;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.position.set(0, 1.8, 8);
      camera.lookAt(0, 1.55, 0);
      camera.updateProjectionMatrix();
      const avatar = createAvatar(scene, 0, 0, "#76cfe0", "#ffc8b6", 0, {
        outfit: 0,
        skin: 0,
        body,
        hat: 0,
        clothing: 0,
        hair: 56,
        pet: 0,
        accessory: 0,
      });
      avatar.root.rotation.y = 0.35;
      renderer.render(scene, camera);
      disposeAvatar(avatar);
    };
  });
  const counts = {};
  for (const body of [0, 1])
    for (const mode of [
      "hair",
      "headwear",
      "crowns",
      "starter-crowns",
      "hats",
      "poses",
    ]) {
      const name = `${tag}-${mode}-body${body}`;
      counts[name] = await page.evaluate(
        ([b, c]) => window.captureHair(b, c),
        [body, mode],
      );
      await page.screenshot({ path: `output/playwright/hair-fit/${name}.png` });
    }
  for (const [width, height] of [
    [390, 844],
    [844, 390],
    [1280, 800],
  ]) {
    await page.setViewportSize({ width, height });
    for (const body of [0, 1]) {
      await page.evaluate((b) => window.captureHairPortrait(b), body);
      await page.screenshot({
        path: `output/playwright/hair-fit/${tag}-${width}x${height}-body${body}.png`,
      });
    }
  }
  writeFileSync(
    `output/playwright/hair-fit/${tag}.json`,
    JSON.stringify({ counts, errors }, null, 2),
  );
  console.log(tag, errors);
} finally {
  await browser.close();
}
