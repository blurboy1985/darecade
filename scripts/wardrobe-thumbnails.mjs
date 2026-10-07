// Local art server only. Render the production meshes into checked-in catalogue images.
import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE).href
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5176/scripts/art-review.html");
  await page.waitForFunction(() => !!window.artReview);
  await page.exposeFunction("saveThumbnail", (name, data) => {
    if (!/^(hair|clothing|outfits|pet|accessory|sets)-\d+\.png$/.test(name))
      throw Error("Invalid thumbnail name");
    writeFileSync(`public/wardrobe/${name}`, Buffer.from(data, "base64"));
  });
  const count = await page.evaluate(async (sample) => {
    const { createCharacterPreview, loadCharacter } = await import(
      "/src/character.ts"
    );
    await loadCharacter();
    const { thumbnailLook } = await import("/src/wardrobe.ts");
    const { appearanceLimits } = await import("/src/appearance.ts");
    const { legendarySets, historicalSetCount } = await import(
      "/src/collections.ts"
    );
    const host = document.createElement("div");
    host.style.cssText = "width:240px;height:220px";
    document.body.append(host);
    const preview = createCharacterPreview(host, thumbnailLook("hair", 53));
    let count = 0;
    try {
      for (const [slot, length] of Object.entries(
        sample
          ? { hair: 61 }
          : {
              ...appearanceLimits,
              outfits: legendarySets.length * 2,
              sets: historicalSetCount,
            },
      )) {
        for (let index = sample ? 53 : 0; index < length; index++) {
          const url = await preview.thumbnail(
            thumbnailLook(slot, index),
            slot === "sets" || slot === "outfits" ? "set" : slot,
          );
          const blob = await (await fetch(url)).blob();
          const data = await new Promise((resolve) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result.split(",")[1]);
            r.readAsDataURL(blob);
          });
          await window.saveThumbnail(`${slot}-${index}.png`, data);
          URL.revokeObjectURL(url);
          count++;
        }
      }
    } finally {
      preview.dispose();
      host.remove();
    }
    return count;
  }, process.argv.includes("--sample"));
  console.log(`Rendered ${count} thumbnails from production geometry.`);
} finally {
  await browser.close();
}
