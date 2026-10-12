import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserDOM } from "./browser-dom.ts";

const chromium = process.env.DARECADE_TEST_CHROMIUM;
test(
  "crowns retain full hair over every starter class on both bodies",
  {
    skip: chromium ? false : "Set DARECADE_TEST_CHROMIUM",
    timeout: 45000,
  },
  async () => {
    assert.ok(chromium);
    const html = `<!doctype html><body><pre id="report"></pre><script type="module">
  import * as T from '/node_modules/three/build/three.module.js';
  import {loadCharacter,createAvatar,disposeAvatar} from '/src/character.ts';
  import {legendarySets,setLook} from '/src/collections.ts';
  try {
    await loadCharacter(); let count=0;
    const scene=new T.Scene();
    for(const body of [0,1])for(const clothing of [0,1,3,5,6,7])
    for(const name of ['Eclipse Vanguard','Crystal Vanguard'])for(let cut=0;cut<8;cut++){
      const set=legendarySets.findIndex(s=>s.name===name);
      if(set<0)throw Error('Missing crown '+name);
      const look={...setLook(set),body,clothing,baseHair:53+cut,pet:0,accessory:0,skin:0};
      const a=createAvatar(scene,0,0,'#76cfe0','#ffc8b6',look);
      const hair=a.hat.getObjectByName('VolumetricHair');
      if(!hair||new T.Box3().setFromObject(hair).max.y<1.85)
        throw Error('Flattened crown hair: '+JSON.stringify({body,clothing,name,cut}));
      disposeAvatar(a);count++;
    }
    document.body.dataset.result='pass';document.querySelector('#report').textContent=count+' combinations';
  } catch(error){document.body.dataset.result='fail';document.querySelector('#report').textContent=error.stack;}
  </script>`;
    const server = await createServer({
      plugins: [
        {
          name: "hair-fitting-test",
          configureServer(server) {
            server.middlewares.use("/__hair-fit", (_req, res) => {
              res.setHeader("Content-Type", "text/html");
              res.end(html);
            });
          },
        },
      ],
      server: { host: "127.0.0.1", port: 0 },
    });
    await server.listen();
    const address = server.httpServer!.address();
    assert.ok(address && typeof address !== "string");
    const directory = mkdtempSync(join(tmpdir(), "simi-hair-fit-"));
    try {
      const output = await browserDOM(
        chromium,
        `http://127.0.0.1:${address.port}/__hair-fit`,
        directory,
        { gpu: true, virtualTime: 20000, timeout: 30000 },
      );
      assert.match(output, /data-result="pass"/, output.slice(-3000));
      assert.match(output, /192 combinations/);
    } finally {
      await server.close();
      rmSync(directory, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      });
    }
  },
);
