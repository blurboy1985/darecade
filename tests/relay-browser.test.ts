import { stopBrowser } from "./browser-dom.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fresh, singaporeDay } from "../src/state.ts";
import { createPlazaRelay } from "../shared/plaza-relay.ts";
import { createRelay } from "../shared/relay.ts";

// Real built DOM/CSS/canvas in installed Chrome, with synthetic API responses.
// Chrome virtual time does not reliably deliver RAF. This fixture controls only
// RAF/performance.now to exercise actual input and lifecycle handlers. It does
// not measure real-time timing, native touch, backgrounding or 3D performance.
const chromium = process.env.DARECADE_TEST_CHROMIUM;
const viewports = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "desktop-3d", width: 1280, height: 900 },
  { name: "desktop-3d-reduced", width: 1280, height: 900 },
  { name: "phone", width: 390, height: 844 },
  { name: "landscape", width: 844, height: 390 },
];

for (const viewport of viewports) {
  test(
    `Relay built controls and cleanup at ${viewport.name} ${viewport.width}×${viewport.height}`,
    {
      skip: chromium
        ? false
        : "Build first and set DARECADE_TEST_CHROMIUM for browser QA",
      timeout: 40000,
    },
    async () => {
      assert.ok(chromium);
      const root = resolve("dist");
      assert.ok(existsSync(join(root, "index.html")), "npm run build first");
      const today = singaporeDay();
      const simulation = createRelay("standard", [0], true);
      const profile = {
        id: "relay-synthetic-guest",
        name: "QA Neighbour",
        account: null,
        ageBand: "adult",
        privacyVersion: "fixture",
        styleRewards: 0,
        playMedals: { day: today, today: 0, total: 0, games: [], limit: 3 },
        progress: {
          ...fresh(),
          twoD: !viewport.name.includes("3d"),
          reduced: viewport.name !== "desktop-3d",
          sound: false,
          music: false,
          rounds: 1,
          welcome: "complete",
          nameChosen: true,
          xp: 99,
          stageDay: today,
        },
      };
      const script = `<script>
      const profile = ${JSON.stringify(profile)};
      const requests = [], checks = [];
      const holdPaths = new Set(), delayed = [];
      let relayActive = 0, relayMaxActive = 0;
      const room = {room:'fixture-relay',code:'ABCDEF',slot:0,host:0,controlEpoch:'fixture-control',solo:true,difficulty:'standard',status:'waiting',players:[{slot:0,name:'QA Neighbour',look:{outfit:0,skin:0,hat:0},ready:false,online:true}],simulation:null,serverAt:Date.now(),expiresAt:Date.now()+180000};
      const simulation = ${JSON.stringify(simulation)};
      let frameId = 0, frameTime = performance.now();
      const frames = new Map();
      Object.defineProperty(performance, 'now', { value: () => frameTime });
      window.requestAnimationFrame = callback => { frames.set(++frameId, callback); return frameId; };
      window.cancelAnimationFrame = id => frames.delete(id);
      const advance = (count = 1) => {
        for (let i = 0; i < count; i++) {
          frameTime += 1000 / 60 + 0.000001;
          const batch = [...frames.values()]; frames.clear();
          batch.forEach(callback => callback(frameTime));
        }
      };
      const nativeFetch = window.fetch;
      window.fetch = async (input, init) => {
        const url = new URL(String(input), location.href);
        if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);
        const path = url.pathname.slice(5), data = init?.body ? JSON.parse(init.body) : null;
        requests.push({ path, data, at: frameTime });
        const relayRequest=path.startsWith('relay/');
        if(relayRequest) {relayActive++;relayMaxActive=Math.max(relayMaxActive,relayActive);}
        try {
        if(holdPaths.has(path)) await new Promise((resolve,reject)=>delayed.push({path,resolve,reject}));
        let result = {};
        if (path === 'auth/config') result = { now: Date.now(), privacyVersion: 'fixture', mailMode: 'outbox', origin: location.origin, storageNotice: 'Synthetic test fixture' };
        else if (path === 'auth/session' || path === 'auth/me' || path === 'profile' || path === 'progress') result = profile;
        else if (path === 'state') result = { profile, competitionReady: false, me: profile.id, self: { id: profile.id, name: profile.name, look: {}, activity: 'lobby', status: 'online', best: profile.progress.best, points: 0 }, day: ${JSON.stringify(today)}, nextReset: Date.now() + 86400000, week: '', weekly: [], lastWeek: [], dares: [], recentRuns: [], players: [], friends: [], challenged: [], boards: { noodle: [], hop: [], brick: [], swarm: [], coast: [], hoops: [], fishing: [] }, history: [] };
        else if (path === 'world/poll') result = { t: 'sync', at: Date.now(), world: 'fixture', p: [], d: [], gone: [] };
        else if (path === 'run') result = { id: 'synthetic-coast-run', game: data.game, seed: 7, version: 3, ranked: false, dailySeed: false, target: null, targetScore: 0 };
        else if (path === 'style-rewards') result = { tokens: 0 };
        else if (path === 'relay/create') { room.solo=data.solo; room.status='waiting'; room.simulation=null;if(data.course==='plaza')room.plaza=${JSON.stringify(createPlazaRelay([0]))}; room.players=[room.players[0]];room.players[0].ready=false; result=structuredClone(room); }
        else if (path === 'relay/ready') {room.players[0].ready=data.ready;result=structuredClone(room);}
        else if (path === 'relay/start') {room.status='running';if(!room.plaza)room.simulation=structuredClone(simulation);result=structuredClone(room);}
        else if (path === 'relay/tick' || path === 'relay/join') result=structuredClone(room);
        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
        } finally {if(relayRequest) relayActive--;}
      };
      localStorage.setItem('darecade-v1', JSON.stringify(profile.progress));
      addEventListener('load', async () => {
        const find = selector => document.querySelector(selector);
        const check = (value, label) => { if (!value) throw Error(label); checks.push(label); };
        const until = async (predicate, label) => {
          for (let i = 0; i < 160; i++) { advance(); if (predicate()) return; await new Promise(r => setTimeout(r, 50)); }
          throw Error('Timed out: ' + label);
        };
        const hitTarget = (element, label) => {
          element.scrollIntoView({ block: 'center', inline: 'nearest' });
          const box = element.getBoundingClientRect();
          check(box.width > 0 && box.height > 0 && box.top >= 0 && box.bottom <= innerHeight + 1, label + ' fits viewport');
          const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          check(target === element || element.contains(target), label + ' has an unobstructed click target');
        };
        const relayTicks = () => requests.filter(r => r.path === 'relay/tick');
        const flush = async () => { advance(20); await new Promise(r=>setTimeout(r,20)); advance(20); await new Promise(r=>setTimeout(r,20)); };
        const key = (type, key, repeat=false) => window.dispatchEvent(new KeyboardEvent(type,{key,repeat,bubbles:true,cancelable:true}));
        try {
          await until(() => !find('#loading') && find('.lobby-dock'), 'built lobby loaded');
          find('.lobby-dock [data-open="arcade"]').click();
          for(let i=0;i<5&&!find('[data-open="relay"]');i++) {
            const next=[...document.querySelectorAll('[data-page="outside"]')].find(b=>!b.disabled&&b.textContent.includes('Next'));
            check(!!next,'Relay reachable through outside pages');next.click();
          }
          find('[data-open="relay"]').click();
          if (${viewport.name.includes("3d")}) {
            await until(()=>find('[data-solo]'),'plaza setup');find('[data-solo]').click();
            await until(()=>find('.plaza-running'),'world Relay running');
            check(!find('#modal').open,'Relay uses the actual world instead of a game modal');
            check(find('#world canvas').getBoundingClientRect().width>0,'world canvas visible');
            advance(30);check(find('.plaza-roster').textContent.includes('Milo · CPU'),'named computer teammates');
            const pos=find('#world canvas').dataset.position;key('keydown','w');advance(20);key('keyup','w');
            check(find('#world canvas').dataset.position!==pos,'normal avatar keyboard movement');
            find('[data-emote="jump"]').click();advance(10);check(Number(find('#world canvas').dataset.elevation)>.1,'normal avatar jump');
            await flush();await new Promise(r=>setTimeout(r,300));
            check(relayTicks().some(r=>r.data.position&&Number.isFinite(r.data.position.x)),'bounded world position reaches team transport');
            hitTarget(find('[data-leave]'),'Leave plaza Relay');find('[data-leave]').click();await flush();
            check(!find('.plaza-running'),'leave removes world overlay');
            check(!requests.some(r=>(r.path==='progress'&&r.data?.event!=='visit')||r.path==='finish'),'Relay grants no round rewards; ordinary world discoveries retain their rules');
            parent.postMessage({result:'pass',report:{viewport:${JSON.stringify(viewport)},checks}},location.origin);return;
          }
          await until(()=>find('#relay-join'),'Relay loaded');
          check(find('.relay-setup').querySelectorAll('button').length===3,'three initial actions');
          find('#relay-join button').click();
          check(find('.relay-error').textContent.includes('code first'),'empty code explains validation');
          check(!requests.some(r=>r.path==='relay/join'),'empty code sends no request');
          hitTarget(find('[data-relay="solo"]'),'Solo practice');
          find('[data-relay="solo"]').click();
          await until(()=>find('.relay').dataset.phase==='running','solo started');
          check(requests.filter(r=>['relay/create','relay/ready','relay/start'].includes(r.path)).map(r=>r.path).join()==='relay/create,relay/ready,relay/start','solo creates readies then starts');
          check(find('.relay-room-code').textContent.includes('no other players'),'solo does not invent teammates');
          const scene=find('.relay-scene'), controls=find('.relay-controls');
          scene.scrollIntoView({block:'start'});
          const sb=scene.getBoundingClientRect(), cb=controls.getBoundingClientRect();
          check(sb.top>=0&&sb.bottom<=innerHeight+1,'playing scene fits viewport');
          check(cb.top>=0&&cb.bottom<=innerHeight+1,'controls fit same playing viewport');
          hitTarget(find('.relay-action'),'context action');
          check(find('#modal').scrollWidth<=find('#modal').clientWidth+1,'no modal horizontal overflow');
          if (${viewport.name.includes("3d")}) {
            await until(()=>find('.relay-scene canvas[aria-hidden]') || find('.relay-cue').textContent.includes('course map'),'3D view or truthful fallback');
            check(!!find('.relay-scene canvas[aria-hidden]'),'actual Three.js WebGL canvas available without unsafe flags');
            check(find('.relay-map').hidden,'3D replaces map');
          } else check(!find('.relay-map').hidden&&find('.relay-map').getContext('2d').getImageData(300,200,1,1).data[3]>0,'actual lightweight canvas draws');
          await flush();
          const pressAt=frameTime;key('keydown','w');
          for(let i=0;i<6;i++){advance();await new Promise(r=>setTimeout(r,1));}
          check(relayTicks().some(r=>r.at>=pressAt&&r.at-pressAt<=100.01&&r.data.input.z===1),'keyboard press sent within 100ms');
          const releaseAt=frameTime;key('keyup','w');
          for(let i=0;i<6;i++){advance();await new Promise(r=>setTimeout(r,1));}
          check(relayTicks().some(r=>r.at>=releaseAt&&r.at-releaseAt<=100.01&&r.data.input.z===0),'keyboard release sent within 100ms');
          holdPaths.add('relay/tick');advance(20);await until(()=>delayed.some(r=>r.path==='relay/tick'),'delayed movement packet');
          key('keydown','d');key('keyup','d');key('keydown','a');
          holdPaths.delete('relay/tick');const deliveryAt=frameTime;delayed.shift().resolve();
          for(let i=0;i<6;i++){advance();await new Promise(r=>setTimeout(r,1));}
          check(relayTicks().some(r=>r.at>=deliveryAt&&r.at-deliveryAt<=100.01&&r.data.input.x===-1),'latest input survives in-flight request');
          check(relayMaxActive===1,'movement requests remain single-flight');key('keyup','a');await flush();
          const cadenceAt=frameTime;
          for(let i=0;i<60;i++){advance();await new Promise(r=>setTimeout(r,1));}
          const cadence=relayTicks().filter(r=>r.at>=cadenceAt);
          check(cadence.length>=9&&cadence.length<=13,'running updates at 10Hz with a bounded budget');
          key('keydown','w');await flush();
          check(relayTicks().at(-1).data.input.z===1,'keyboard forward reaches transport');
          key('keyup','w');await flush();check(relayTicks().at(-1).data.input.z===0,'keyboard release clears movement');
          key('keydown','d');window.dispatchEvent(new Event('blur'));await flush();
          check(relayTicks().at(-1).data.input.x===0,'blur clears held direction');
          const direction=find('[data-relay-move="0,1"]');
          // Synthetic PointerEvents are not trusted active pointers. Intercept only
          // capture bookkeeping; real handlers and transport remain under test.
          direction.setPointerCapture=()=>{};
          direction.dispatchEvent(new PointerEvent('pointerdown',{pointerId:7,bubbles:true,cancelable:true}));await flush();
          check(relayTicks().at(-1).data.input.z===1,'pointer direction reaches transport');
          direction.dispatchEvent(new PointerEvent('pointercancel',{pointerId:7,bubbles:true}));await flush();
          check(relayTicks().at(-1).data.input.z===0,'pointer cancellation clears movement');
          await flush();const before=relayTicks().at(-1).data.actionSeq;
          key('keydown',' ');key('keyup',' ');await flush();
          check(relayTicks().at(-1).data.actionSeq===before+1,'quick action survives frame boundary');
          key('keydown',' ',true);await flush();check(relayTicks().at(-1).data.actionSeq===before+1,'key repeat cannot multiply action');
          check(relayTicks().every(r=>Object.keys(r.data).sort().join()==='actionSeq,controlEpoch,input,room,seq'&&Object.keys(r.data.input).sort().join()==='x,z'),'transport sends controls only, no positions or claimed results');
          if (${viewport.name.includes("3d")}) {
            find('.relay-scene canvas[aria-hidden]').dispatchEvent(new Event('webglcontextlost'));
            await flush();
            check(!find('.relay-map').hidden&&!find('.relay-scene canvas[aria-hidden]'),'WebGL context loss restores map and disposes 3D canvas');
            check(find('.relay-graphics').textContent.includes('course map'),'fallback notice persists across drawing frames');
          }
          find('.relay-play [data-relay="leave"]').click();await flush();
          check(!find('.relay-setup').hidden&&find('.relay-room').hidden,'leave restores setup');
          check(sessionStorage.getItem('playsimi-relay-session')===null,'leave removes resume hint');
          check(requests.some(r=>r.path==='relay/leave'),'leave informs server');
          find('[data-relay="create"]').click();await until(()=>find('.relay').dataset.phase==='waiting','team lobby');
          check(find('[data-relay="start"]').disabled,'host cannot start without teammate');
          check(find('.relay-players').children.length===1,'only actual snapshot teammate appears');
          // Delayed transport exercises reservation order rather than relying
          // on instant fixture responses. Readiness rules are backend-tested.
          room.players.push({slot:1,name:'Synthetic teammate',look:{outfit:0,skin:0,hat:0},ready:true,online:true});
          room.players[0].ready=true;advance(80);await flush();
          check(!find('[data-relay="start"]').disabled,'ready team enables host start');
          holdPaths.add('relay/tick');advance(80);
          await until(()=>delayed.some(r=>r.path==='relay/tick'),'held team poll');
          const commandStart=requests.length;relayMaxActive=relayActive;
          holdPaths.add('relay/ready');holdPaths.add('relay/start');
          find('[data-relay="ready"]').click();find('[data-relay="start"]').click();await flush();
          check(!requests.slice(commandStart).some(r=>r.path==='relay/ready'||r.path==='relay/start'),'Ready and Start wait behind in-flight poll');
          holdPaths.delete('relay/tick');delayed.splice(delayed.findIndex(r=>r.path==='relay/tick'),1)[0].resolve();
          await until(()=>delayed.some(r=>r.path==='relay/ready'),'queued Ready delivered');
          check(!requests.slice(commandStart).some(r=>r.path==='relay/start'),'Start waits while Ready holds reservation');
          holdPaths.delete('relay/ready');delayed.splice(delayed.findIndex(r=>r.path==='relay/ready'),1)[0].resolve();
          await until(()=>delayed.some(r=>r.path==='relay/start'),'queued Start delivered');
          check(relayMaxActive===1,'delayed commands remain strictly single-flight');
          holdPaths.delete('relay/start');delayed.splice(delayed.findIndex(r=>r.path==='relay/start'),1)[0].resolve();
          await until(()=>find('.relay').dataset.phase==='running','queued team start accepted');
          check(requests.slice(commandStart).filter(r=>['relay/ready','relay/start'].includes(r.path)).map(r=>r.path).join()==='relay/ready,relay/start','queued commands delivered once in order');
          holdPaths.add('relay/tick');advance(40);
          await until(()=>delayed.some(r=>r.path==='relay/tick'),'held error poll');
          find('.relay-play [data-relay="leave"]').click();
          holdPaths.delete('relay/tick');delayed.splice(delayed.findIndex(r=>r.path==='relay/tick'),1)[0].reject(Error('Relay controls expired'));
          await flush();
          check(find('.relay').dataset.phase==='setup'&&!find('.relay-setup').hidden&&find('.relay-room').hidden,'late tick error cannot resurrect departed room');
          check(!find('.relay-error').textContent&&sessionStorage.getItem('playsimi-relay-session')===null,'late tick error cannot restore stale error or resume hint');
          find('[data-relay="create"]').click();await until(()=>find('.relay').dataset.phase==='waiting','new team after delayed error');
          holdPaths.add('relay/ready');find('[data-relay="ready"]').click();
          await until(()=>delayed.some(r=>r.path==='relay/ready'),'held command error');
          find('.relay-lobby-actions [data-relay="leave"]').click();
          holdPaths.delete('relay/ready');delayed.splice(delayed.findIndex(r=>r.path==='relay/ready'),1)[0].reject(Error('Old readiness rejected'));
          await flush();
          check(find('.relay').dataset.phase==='setup'&&!find('.relay-error').textContent,'late command error stays discarded after leave');
          check(requests.filter(r=>r.path==='relay/leave').every(r=>r.data.controlEpoch==='fixture-control'),'every leave is scoped to its control epoch');
          find('[data-relay="create"]').click();await until(()=>find('.relay').dataset.phase==='waiting','last team lobby');
          find('#close-modal').click();await flush();const last=relayTicks().length;
          key('keydown','w');advance(180);await flush();check(relayTicks().length===last,'closed panel stops polling/input');
          check(!requests.some(r=>(r.path==='progress'&&r.data?.event!=='visit')||r.path==='auth/join'||r.path.startsWith('auth/code')),'no rewards/account/email writes: '+JSON.stringify(requests.filter(r=>(r.path==='progress'&&r.data?.event!=='visit')||r.path==='auth/join'||r.path.startsWith('auth/code'))));
          // Reopen solo to leave an actual painted course screenshot.
          find('.lobby-dock [data-open="arcade"]').click();
          find('[data-open="relay"]').click();find('[data-relay="solo"]').click();
          await until(()=>find('.relay').dataset.phase==='running','final scene');
          room.difficulty='challenge';room.simulation.difficulty='challenge';room.simulation.tick=100;
          room.simulation.bag.owner=null;room.simulation.bag.flight={from:0,to:0,startTick:60,endTick:114,x0:-3.8,z0:28,x1:-3.2,z1:29.3,solo:true};
          // Deliver one authoritative packet, then advance only presentation.
          await new Promise(r=>setTimeout(r,20));advance(6);
          await new Promise(r=>setTimeout(r,20));advance(1);
          check(find('.relay-cue').textContent.includes('Watch the bag'),'Challenge cue waits before catch window');
          const cueTickCount=relayTicks().length;advance(4);
          check(find('.relay-cue').textContent==='Catch now!'&&relayTicks().length===cueTickCount,'Challenge cue enters catch window between server packets');
          if (${viewport.name.includes("3d")}) {
            await until(()=>find('.relay-scene canvas[aria-hidden]'),'final 3D scene');
            room.simulation.tick=180;room.simulation.runners[0].x=0;room.simulation.runners[0].z=19.5;room.simulation.runners[0].vaultUntil=205;
            room.simulation.bag.owner=null;room.simulation.bag.flight={from:0,to:0,startTick:150,endTick:210,x0:0,z0:19.5,x1:-3.2,z1:29.3,solo:true};
            await flush(); advance(30);
          } else advance(3);
          parent.postMessage({result:'pass',report:{viewport:${JSON.stringify(viewport)},checks,graphics:${JSON.stringify(viewport.name.includes("3d") ? "real built Three.js WebGL; synthetic vault and bag flight snapshot" : "real built lightweight 2D canvas")},limits:'mocked API and RAF; synthetic pointer capture; not real multiplayer/server validation/native touch/performance'}},location.origin);
        } catch (error) { parent.postMessage({ result: 'fail', report: { viewport: ${JSON.stringify(viewport)}, checks, error: error.stack } }, location.origin); }
      });
      </script>`;
      const html = readFileSync(join(root, "index.html"), "utf8").replace(
        "<head>",
        "<head>" + script,
      );
      const server = createServer((request, response) => {
        const path = new URL(request.url || "/", "http://localhost").pathname;
        if (path === "/") {
          response.setHeader("Content-Type", "text/html");
          response.end(
            `<!doctype html><html><head><script>addEventListener('message', event => { if (event.origin !== location.origin || event.source !== document.querySelector('iframe').contentWindow) return; document.body.dataset.result = event.data.result; document.querySelector('#browser-result').textContent = JSON.stringify(event.data.report); });</script></head><body style="margin:0"><iframe src="/fixture" style="display:block;width:${viewport.width}px;height:${viewport.height}px;border:0"></iframe><pre id="browser-result" style="white-space:pre-wrap"></pre></body></html>`,
          );
          return;
        }
        if (path === "/fixture") {
          response.setHeader("Content-Type", "text/html");
          response.end(html);
          return;
        }
        const file = resolve(root, "." + path);
        if (!file.startsWith(root + sep) || !existsSync(file)) {
          response.writeHead(404).end();
          return;
        }
        const mime: Record<string, string> = {
          ".js": "text/javascript",
          ".css": "text/css",
          ".glb": "model/gltf-binary",
          ".svg": "image/svg+xml",
          ".woff2": "font/woff2",
        };
        response.setHeader(
          "Content-Type",
          mime[extname(file)] || "application/octet-stream",
        );
        response.end(readFileSync(file));
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const directory = mkdtempSync(join(tmpdir(), "simi-relay-browser-"));
      mkdirSync(resolve(".browser"), { recursive: true });
      const screenshot = resolve(".browser", `relay-${viewport.name}.png`);
      rmSync(screenshot, { force: true });
      const browser = spawn(
        chromium,
        [
          "--headless",
          "--no-first-run",
          "--disable-background-networking",
          "--use-mock-keychain",
          "--password-store=basic",
          "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
          `--user-data-dir=${directory}`,
          `--window-size=${viewport.width},${viewport.height + 160}`,
          "--dump-dom",
          `--screenshot=${screenshot}`,
          "--virtual-time-budget=20000",
          `http://127.0.0.1:${address.port}/`,
        ],
        { detached: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "",
        errors = "";
      try {
        await new Promise<void>((done, reject) => {
          const bound = setTimeout(
            () =>
              reject(Error("Chrome fixture timed out\n" + errors.slice(-2000))),
            30000,
          );
          const finish = (error?: Error) => {
            clearTimeout(bound);
            error ? reject(error) : done();
          };
          browser.stdout.on("data", (data) => {
            output += data;
            if (
              /<body[^>]*data-result="(pass|fail)"/.test(output) &&
              output.includes("</html>")
            )
              finish();
          });
          browser.stderr.on("data", (data) => {
            errors += data;
          });
          browser.on("error", finish);
          browser.on("close", () => finish());
        });
        const report = [
          ...output.matchAll(
            /<pre id="browser-result"[^>]*>([\s\S]*?)<\/pre>/g,
          ),
        ].at(-1)?.[1];
        writeFileSync(
          resolve(".browser", `relay-${viewport.name}.html`),
          output,
        );
        assert.match(
          output,
          /<body[^>]*data-result="pass"/,
          report || output.slice(-2000) || errors.slice(-2000),
        );
        console.log(report);
        if (existsSync(screenshot))
          console.log(`Chrome screenshot: ${screenshot}`);
      } finally {
        await stopBrowser(browser);
        await new Promise<void>((done) => server.close(() => done()));
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
