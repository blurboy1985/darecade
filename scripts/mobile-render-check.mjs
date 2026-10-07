import { createServer } from "vite";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { browserDOM } from "../tests/browser-dom.ts";

// Deterministic workload comparison, not an iPhone FPS benchmark. Real meshes,
// skeletons, movement, camera and WebGL rendering run at simulated phone timings.
const chromium = process.env.DARECADE_TEST_CHROMIUM;
if (!chromium) throw Error("Set DARECADE_TEST_CHROMIUM to a Chrome executable");
const check = process.argv.includes("--check");
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}#world{width:390px;height:844px}</style><div id="world"></div><pre id="report"></pre><script type="module">
import {LobbyWorld} from '/src/world.ts';
import {loadCharacter} from '/src/character.ts';
import {fresh} from '/src/state.ts';
try {
 await loadCharacter();
 window.requestAnimationFrame = () => 0;
 const host=document.querySelector('#world');
 const world=new LobbyWorld(host,{...fresh(),sound:false,music:false,light:'day'}, {interact(){},visit(){},coin(){},near(){},fallback(){throw Error('WebGL fallback')}});
 // Reproduce the old startup path when measuring the baseline revision.
 world.setQuality?.('auto');
 let matrixUpdates=0;
 const objectPrototype=Object.getPrototypeOf(Object.getPrototypeOf(world.player.root));
 const update=objectPrototype.updateMatrix;
 objectPrototype.updateMatrix=function(){matrixUpdates++;return update.call(this)};
 const report=[];
 let now=1000;
 for(const [width,height] of [[390,844],[844,390]]) {
 host.style.width=width+'px';host.style.height=height+'px';world.resize();
 for(const camera of ['third','isometric']) {
 world.setCameraMode(camera);world.angle=0;world.revealAt=-Infinity;
 world.player.root.position.set(0,0.1,10);world.player.last.copy(world.player.root.position);world.motion.reset();
 world.joystick={x:1,y:0};
 const calls=[],triangles=[],matrices=[];
 for(let i=0;i<90;i++) {
 now += [8.333333333,16.666666667,11,25][i%4];
 matrixUpdates=0;world.animate(now);
 if(i>15){calls.push(world.renderer.info.render.calls);triangles.push(world.renderer.info.render.triangles);matrices.push(matrixUpdates)}
 if(i>3 && Math.abs(world.player.legs[0].rotation.x-Math.sin(world.clock*12)*0.55)>1e-8)throw Error('Stale walking pose');
 }
 world.joystick={x:0,y:0};
 for(let i=0;i<5;i++){now+=1000/60;world.animate(now)}
 if(world.player.moving||world.player.legs.some(l=>l.rotation.x!==0))throw Error('Walking did not stop');
 const stats=a=>{const s=a.toSorted((a,b)=>a-b);return {median:s[Math.floor(s.length/2)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)}};
 const row={width,height,camera,ratio:world.renderer.getPixelRatio(),shadows:world.renderer.shadowMap.enabled,calls:stats(calls),triangles:stats(triangles),matrixUpdates:stats(matrices)};
 report.push(row);
 if(${check} && (row.ratio>1.25||row.shadows||row.calls.max>520||row.matrixUpdates.max>2300))throw Error('Mobile rendering budget exceeded: '+JSON.stringify(row));
 }
 }
 objectPrototype.updateMatrix=update;
 world.dispose();
 document.body.dataset.result='pass';document.querySelector('#report').textContent=JSON.stringify(report);
} catch(error) {document.body.dataset.result='fail';document.querySelector('#report').textContent=error.stack}
</script>`;
const server = await createServer({
  plugins: [
    {
      name: "mobile-render-check",
      configureServer(server) {
        server.middlewares.use("/__mobile-render-check", (_req, res) => {
          res.setHeader("Content-Type", "text/html");
          res.end(html);
        });
      },
    },
  ],
  server: { host: "127.0.0.1", port: 0 },
});
await server.listen();
const address = server.httpServer.address();
const directory = mkdtempSync(join(tmpdir(), "simi-render-"));
try {
  const output = await browserDOM(
    chromium,
    `http://127.0.0.1:${address.port}/__mobile-render-check`,
    directory,
    {
      gpu: true,
      virtualTime: 20000,
      timeout: 60000,
      flags: ["--force-device-scale-factor=3", "--window-size=1000,1000"],
    },
  );
  const report = output.match(/<pre id="report">([\s\S]*?)<\/pre>/)?.[1];
  if (!output.includes('data-result="pass"'))
    throw Error(report || output.slice(-2000));
  mkdirSync(".browser", { recursive: true });
  const path =
    process.env.RENDER_REPORT || ".browser/mobile-render-report.json";
  writeFileSync(path, JSON.stringify(JSON.parse(report), null, 2) + "\n");
  console.log(report);
} finally {
  await server.close();
  rmSync(directory, { recursive: true, force: true });
}
