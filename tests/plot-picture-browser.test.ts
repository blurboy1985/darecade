import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserDOM } from "./browser-dom.ts";

const chromium = process.env.DARECADE_TEST_CHROMIUM;
for (const [width, simple, reduced] of [
  [320, false, false],
  [390, false, true],
  [1280, false, false],
  [320, true, false],
] as const) {
  test(
    `solved plot pictures remain visible at ${width}px, simple=${simple}, reduced=${reduced}`,
    { skip: !chromium, timeout: 45000 },
    async () => {
      assert.ok(chromium);
      const fixture = `<!doctype html><html><body><dialog id="modal"><div id="modal-body"></div></dialog><pre id="result"></pre><script type="module">
      import '/src/style.css'; import '/src/neighbourhood.css'; import '/src/arcade-theme.css'; import '/src/lobby-ui.css'; import '/src/mobile-lobby.css'; import '/src/activities.css';
      import {mountPlots} from '/src/plots.ts';
      import {fresh,plantCrop,tendCrop} from '/src/state.ts';
      import {createWaterTrail,trailTiles,traceWater} from '/shared/plot-trail.ts';
      const wait=async p=>{for(let i=0;i<200;i++){if(p())return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out');};
      const check=(ok,msg)=>{if(!ok)throw Error(msg);};
      const dialog=document.querySelector('dialog');dialog.showModal();
      const pictures=()=>{
        const cells=[...document.querySelectorAll('.trail-cell')];check(cells.length===9,'nine pictures');
        for(const cell of cells){
          const rect=cell.getBoundingClientRect();check(rect.width>40&&rect.height>40,'visible tile size');
          const svg=getComputedStyle(cell.querySelector('svg'));
          if(${simple}) check(svg.visibility==='visible','fallback picture visible');
          else {check(!!document.querySelector('.plot-3d-ready canvas'),'3D canvas ready');check(getComputedStyle(cell).backgroundColor==='rgba(0, 0, 0, 0)','tile covers 3D picture: '+cell.className);}
        }
      };
      try{ check(innerWidth===${width},"exact viewport width");
        for(const crop of ['chilli','pandan','sunflower']){
          const save=fresh();save.reduced=${reduced};const planted=Date.now();plantCrop(save,crop,planted);let finish;let reports=0;
          mountPlots(document.querySelector('#modal-body'),{save,simple:${simple},sound(){},report(event,value){reports++;return new Promise(resolve=>{finish=()=>{check(tendCrop(save,value,Date.now()),'valid watering');resolve();};});}});
          document.querySelector('#plot-tend').click();
          if(!${simple})await wait(()=>document.querySelector('.plot-3d-ready'));
          const trail=createWaterTrail(crop,planted);let solution;
          for(let n=0;n<64;n++){const t=[n%4,Math.floor(n/4)%4,Math.floor(n/16)];if(traceWater(trailTiles(trail,t)).complete){solution=t;break;}}
          check(!!solution,'solution exists');
          for(let gate=0;gate<3;gate++)for(let n=0;n<solution[gate];n++){
            document.querySelector('#pipe-'+gate).click();
            await new Promise(r=>setTimeout(r,180));pictures();
          }
          check(document.querySelector('.trail-meter').textContent==='Every channel is flowing!','solved');
          check(reports===1,'one save');pictures();finish();await wait(()=>document.querySelector('#plot-again'));pictures();
          check(document.querySelector('.plot-tag').textContent.includes('WATERING SAVED'),'save confirmed');
          if(!${simple}){
            const canvas=document.querySelector('.plot-visual canvas');
            canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));
            check(!document.querySelector('.plot-3d-ready'),'lost context reveals fallback');
            for(const svg of document.querySelectorAll('.trail-cell svg'))check(getComputedStyle(svg).visibility==='visible','solved fallback picture visible');
          }
        }
        document.body.dataset.result='pass';document.querySelector('#result').textContent='Solved pictures visible before and after saving all three crops';
      }catch(error){document.body.dataset.result='fail';document.querySelector('#result').textContent=error.stack;}
      parent.postMessage({result:document.body.dataset.result,message:document.querySelector("#result").textContent},location.origin);
    </script></body></html>`;
      const server = await createServer({
        configFile: false,
        server: { host: "127.0.0.1", port: 0 },
        plugins: [
          {
            name: "plot-fixture",
            configureServer(server) {
              server.middlewares.use("/plot-test", (_req, res) => {
                res.setHeader("Content-Type", "text/html");
                res.end(
                  `<html><body><iframe src="/plot-fixture" style="width:${width}px;height:1000px;border:0"></iframe><pre id="result"></pre><script>addEventListener("message",e=>{if(e.origin!==location.origin||e.source!==document.querySelector("iframe").contentWindow)return;document.body.dataset.result=e.data.result;document.querySelector("#result").textContent=e.data.message;});</script></body></html>`,
                );
              });
              server.middlewares.use("/plot-fixture", async (req, res) => {
                res.setHeader("Content-Type", "text/html");
                res.end(
                  await server.transformIndexHtml("/plot-fixture", fixture),
                );
              });
            },
          },
        ],
      });
      await server.listen();
      const address = server.httpServer?.address();
      assert.ok(address && typeof address !== "string");
      const directory = mkdtempSync(join(tmpdir(), "simi-plot-picture-"));
      try {
        const output = await browserDOM(
          chromium,
          `http://127.0.0.1:${address.port}/plot-test`,
          directory,
          {
            gpu: true,
            virtualTime: 30000,
            timeout: 40000,
            flags: [`--window-size=${width},1000`],
          },
        );
        assert.match(
          output,
          /<body[^>]*data-result="pass"/,
          output.slice(-2500),
        );
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
}
