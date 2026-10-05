import { stopBrowser } from "./browser-dom.ts";
import test from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { join, resolve, extname, sep } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fresh } from "../src/state.ts";

const chromium = process.env.DARECADE_TEST_CHROMIUM;
for (const width of [320, 390, 1440])
  test(
    `built season, history and rollback views fit ${width}px`,
    {
      skip: chromium
        ? false
        : "Build and set DARECADE_TEST_CHROMIUM for responsive season QA",
      timeout: 40000,
    },
    async () => {
      assert.ok(chromium);
      const root = resolve("dist");
      assert.ok(existsSync(join(root, "index.html")));
      mkdirSync(".browser", { recursive: true });
      const progress = {
        ...fresh(),
        twoD: true,
        welcome: "complete",
        rounds: 3,
        xp: 250,
        sound: false,
        music: false,
      };
      const period = {
        id: "opening",
        name: "Opening season",
        startsAt: Date.parse("2026-10-05T00:00:00+08:00"),
        endsAt: null,
        xp: 0,
        points: 0,
        rank: null,
        standings: [],
      };
      const profile = {
        id: "synthetic-season-qa",
        name: "QA Neighbour",
        account: { email: "qa@example.test", created: 1, eligibleAt: 1 },
        ageBand: "adult",
        privacyVersion: "fixture",
        progress,
        styleRewards: 0,
        season: period,
      };
      const script = `<script>
    const profile = ${JSON.stringify(profile)}, season = profile.season;
    const history = {...season, id:'previous', name:'Previous season', endsAt:season.startsAt, startsAt:season.startsAt-604800000, xp:400, points:9, rank:1, standings:[{id:profile.id,name:profile.name,rank:1,points:9}]};
    let visible = true;
    localStorage.setItem('darecade-v1', JSON.stringify(profile.progress));
    const nativeFetch=window.fetch;
    window.fetch=async (input,init)=>{
      const u=new URL(String(input),location.href);
      if(!u.pathname.startsWith('/api/'))return nativeFetch(input,init);
      const path=u.pathname.slice(5);let value={};
      if(path==='auth/config')value={now:Date.now(),privacyVersion:'fixture',mailMode:'outbox',origin:location.origin,storageNotice:'Synthetic browser fixture'};
      if(path==='auth/me'||path==='profile')value=profile;
      if(path==='style-rewards')value={tokens:0};
      if(path==='state')value={profile,competitionReady:true,me:profile.id,self:{id:profile.id,name:profile.name,look:{},activity:'lobby',status:'online',best:profile.progress.best,points:12,outgoing:0},day:'2026-10-05',nextReset:Date.now()+86400000,week:'2026-10-05',weekly:[],lastWeek:[],dares:[],recentRuns:[],players:[],friends:[],challenged:[],boards:{noodle:[],hop:[],brick:[],swarm:[],coast:[]},history:[],season:visible?season:null,seasonHistory:visible?[history]:[]};
      if(path==='world/poll')value={t:'sync',at:Date.now(),world:'qa',p:[],d:[],gone:[]};
      return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
    };
    addEventListener('load',async()=>{
      const check=(ok,why)=>{if(!ok)throw Error(why);};
      const wait=async(fn)=>{for(let i=0;i<160;i++){if(fn())return;await new Promise(r=>setTimeout(r,100));}throw Error('UI wait timed out');};
      const click=(selector)=>{const el=document.querySelector(selector);check(el,selector);el.click();};
      const select=(value)=>{const el=document.querySelector('#board-period');el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));};
      const fit=()=>{const d=document.querySelector('#modal');check(document.documentElement.scrollWidth<=innerWidth+1,'page overflow');check(d.scrollWidth<=d.clientWidth+1,'dialog overflow');};
      try {
        await wait(()=>document.body.classList.contains('mode-2d')&&!document.querySelector('#loading'));
        click('[data-open="phone-menu"]');click('[data-open="friends-menu"]');click('[data-open="competition-menu"]');click('[data-open="board"]');
        await wait(()=>document.querySelector('#board-period')?.value==='season:opening');
        check(document.querySelector('#modal-body').textContent.includes('A fresh season'),'fresh state');
        check(document.querySelector('.standing-stats').textContent.includes('0Season XP'),'zero season XP');
        check(document.querySelector('#level-label').textContent==='LEVEL 3','lifetime level');fit();
        select('season:previous');check(document.querySelector('#modal-body').textContent.includes('400'),'past XP retained');check(document.querySelector('.leaderboard').textContent.includes('9'),'past medals retained');fit();
        select('daily');check(document.querySelector('#board-game'),'daily board retained');fit();
        select('week');check(document.querySelector('#modal-body').textContent.includes('Lifetime'),'lifetime medals retained');fit();
        select('season:opening');
        profile.progress.xp=310;season.xp=60;
        dispatchEvent(new CustomEvent('account-profile',{detail:profile}));
        dispatchEvent(new Event('account-refresh'));
        await wait(()=>document.querySelector('#level-label').textContent==='LEVEL 4');
        await wait(()=>document.querySelector('.standing-stats')?.textContent.includes('60Season XP'));
        click('#close-modal');click('[data-open="phone-menu"]');click('[data-open="my-stuff"]');click('[data-open="wardrobe"]');
        check(document.querySelector('.style-wallet').textContent.includes('3 Style tokens'),'only lifetime tokens in wallet');fit();
        visible=false;profile.season=null;
        dispatchEvent(new CustomEvent('account-profile',{detail:profile}));
        dispatchEvent(new Event('account-refresh'));
        click('#close-modal');click('[data-open="phone-menu"]');click('[data-open="friends-menu"]');click('[data-open="competition-menu"]');click('[data-open="board"]');
        await wait(()=>!document.querySelector('#board-period option[value="season:opening"]'));
        check(document.querySelector('#board-period').value==='week','rollback restores weekly view');fit();
        visible=true;profile.season=season;
        dispatchEvent(new CustomEvent('account-profile',{detail:profile}));
        dispatchEvent(new Event('account-refresh'));
        await wait(()=>document.querySelector('#board-period option[value="season:opening"]'));
        select('season:opening');fit();
        parent.postMessage({result:'pass',report:{width:innerWidth,seasonXP:season.xp,lifetimeXP:profile.progress.xp,level:document.querySelector('#level-label').textContent,archive:true,rollback:true,noOverflow:true}},location.origin);
      }catch(error){parent.postMessage({result:'fail',report:error.stack},location.origin);}
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
            `<!doctype html><html><head><script>addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==document.querySelector('iframe').contentWindow)return;document.body.dataset.result=e.data.result;document.querySelector('#result').textContent=JSON.stringify(e.data.report);});</script></head><body style="margin:0"><iframe src="/fixture" style="width:${width}px;height:844px;border:0"></iframe><pre id="result"></pre></body></html>`,
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
          response.writeHead(404);
          response.end();
          return;
        }
        const types: Record<string, string> = {
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".glb": "model/gltf-binary",
          ".woff2": "font/woff2",
        };
        response.setHeader(
          "Content-Type",
          types[extname(file)] || "application/octet-stream",
        );
        response.end(readFileSync(file));
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const dir = mkdtempSync(join(tmpdir(), "simi-season-browser-"));
      const child = spawn(
        chromium,
        [
          "--headless",
          "--no-first-run",
          "--disable-background-networking",
          "--use-mock-keychain",
          "--password-store=basic",
          "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
          `--user-data-dir=${dir}`,
          `--window-size=${width},960`,
          "--dump-dom",
          "--virtual-time-budget=20000",
          `--screenshot=${resolve(`.browser/season-${width}.png`)}`,
          `http://127.0.0.1:${address.port}/`,
        ],
        { detached: true, stdio: ["ignore", "pipe", "pipe"] },
      );
      let output = "",
        errors = "";
      try {
        await new Promise<void>((done, reject) => {
          const timer = setTimeout(
            () => reject(Error("Chrome timed out")),
            35000,
          );
          child.stdout.on("data", (data) => {
            output += data;
            if (output.includes("</html>")) {
              clearTimeout(timer);
              done();
            }
          });
          child.stderr.on("data", (data) => (errors += data));
          child.on("error", (e) => {
            clearTimeout(timer);
            reject(e);
          });
          child.on("exit", (code) => {
            clearTimeout(timer);
            output.includes("</html>")
              ? done()
              : reject(Error(`Chrome ${code}: ${errors}`));
          });
        });
        writeFileSync(`.browser/season-${width}.html`, output);
        assert.match(
          output,
          /data-result="pass"/,
          output.match(/<pre id="result">([\s\S]*?)<\/pre>/)?.[1] || errors,
        );
      } finally {
        await stopBrowser(child);
        server.close();
        rmSync(dir, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        });
      }
    },
  );
