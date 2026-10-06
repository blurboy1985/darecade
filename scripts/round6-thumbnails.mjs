import { pathToFileURL } from "node:url";
import { writeFileSync } from "node:fs";
const { chromium } = await import(
  pathToFileURL(process.env.PLAYWRIGHT_CORE).href
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:5176/scripts/art-review.html");
const images = await page.evaluate(async () => {
  const { loadCharacter, createCharacterPreview } = await import(
    "/src/character.ts"
  );
  const { itemLook } = await import("/src/wardrobe.ts");
  const { fresh } = await import("/src/state.ts");
  const { HAIR_START, HAIR_COUNT } = await import("/src/hair-catalog.ts");
  const { starterClasses } = await import("/src/class-costumes.ts");
  await loadCharacter();
  const host = document.createElement("div");
  host.style.cssText = "width:240px;height:220px";
  document.body.append(host);
  const preview = createCharacterPreview(host, fresh());
  const images = {};
  for (const [slot, indices] of [
    ["hair", Array.from({ length: HAIR_START + HAIR_COUNT }, (_, i) => i)],
    ["sets", starterClasses.map((_, i) => -i - 1)],
  ]) {
    for (const i of indices) {
      const uri = await preview.thumbnail(
        itemLook(slot, i, fresh()),
        slot === "sets" ? "set" : slot,
      );
      const bytes = new Uint8Array(await (await fetch(uri)).arrayBuffer());
      let raw = "";
      for (const b of bytes) raw += String.fromCharCode(b);
      images[`${slot}-${i}.png`] = btoa(raw);
      URL.revokeObjectURL(uri);
    }
  }
  preview.dispose();
  host.remove();
  return images;
});
for (const [name, base64] of Object.entries(images))
  writeFileSync(`public/wardrobe/${name}`, Buffer.from(base64, "base64"));
console.log(
  "Rendered",
  Object.keys(images).length,
  "new thumbnails from production meshes",
);
await browser.close();
