// Render every purchasable outfit, pet and spell from the real game meshes.
// DARECADE_TEST_CHROMIUM=/path/to/chrome node scripts/render-complete-catalog.mjs
import { createServer } from "vite";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserDOM } from "../tests/browser-dom.ts";
import { legendarySets, setItemIndex } from "../src/collections.ts";
const chromium = process.env.DARECADE_TEST_CHROMIUM;
if (!chromium)
  throw Error("Set DARECADE_TEST_CHROMIUM to an installed Chrome executable");
const keys = new Set(
  legendarySets.flatMap((_, i) => [
    `outfits-${i * 2}`,
    `outfits-${i * 2 + 1}`,
    `pet-${setItemIndex("pet", i)}`,
    `accessory-${setItemIndex("accessory", i)}`,
  ]),
);
const written = new Set();
mkdirSync("public/wardrobe", { recursive: true });
const html = `<!doctype html><html><body><p id="result">Rendering catalog…</p><script type="module">
import {loadCharacter,createCharacterPreview} from '/src/character.ts';
import {thumbnailLook} from '/src/wardrobe.ts';
const keys=${JSON.stringify([...keys])};
try {
 await loadCharacter();
 const host=document.createElement('div');host.style.cssText='width:240px;height:220px';document.body.append(host);
 const preview=createCharacterPreview(host,thumbnailLook('outfits',0));
 for(const key of keys){
  const [slot,id]=key.split('-');
  const image=await preview.thumbnail(thumbnailLook(slot,Number(id)),slot);
  const blob=await fetch(image).then(r=>r.blob());URL.revokeObjectURL(image);
  const response=await fetch('/__catalog-image/'+key,{method:'POST',body:blob});
  if(!response.ok)throw Error('Saving '+key+' failed');
 }
 preview.dispose();host.remove();document.querySelector('#result').textContent='Rendered '+keys.length+' catalog images';document.body.dataset.result='pass';
} catch(error){document.querySelector('#result').textContent=error.stack;document.body.dataset.result='fail';}
</script></body></html>`;
const server = await createServer({
  server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
  plugins: [
    {
      name: "catalog-capture",
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === "/__catalog") {
            res.setHeader("Content-Type", "text/html");
            res.end(html);
            return;
          }
          const key = req.url?.slice("/__catalog-image/".length);
          if (
            req.url?.startsWith("/__catalog-image/") &&
            req.method === "POST" &&
            keys.has(key)
          ) {
            const chunks = [];
            let size = 0;
            for await (const chunk of req) {
              size += chunk.length;
              if (size > 2000000) {
                res.writeHead(413).end();
                return;
              }
              chunks.push(chunk);
            }
            const png = Buffer.concat(chunks);
            if (png.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
              res.writeHead(400).end();
              return;
            }
            writeFileSync(join("public/wardrobe", key + ".png"), png);
            written.add(key);
            res.end("ok");
            return;
          }
          next();
        });
      },
    },
  ],
});
const directory = mkdtempSync(join(tmpdir(), "simi-catalog-"));
try {
  await server.listen();
  const address = server.httpServer.address();
  const result = await browserDOM(
    chromium,
    `http://127.0.0.1:${address.port}/__catalog`,
    directory,
    { gpu: true, virtualTime: 1800000, timeout: 240000 },
  );
  if (
    !/<body[^>]*data-result="pass"/.test(result) ||
    written.size !== keys.size
  )
    throw Error(result.slice(-3000));
  console.log(
    `Rendered ${written.size} outfit, pet and magic images from the current meshes.`,
  );
} finally {
  await server.close();
  rmSync(directory, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
