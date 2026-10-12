import { stopBrowser } from "./browser-dom.ts";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve, extname, sep } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import WebSocket from "ws";
import { fresh } from "../src/state.ts";

// The styled dropdown is pressed with a real mouse and keyboard over the
// DevTools protocol. Setting the native select's value, as the other browser
// tests do, never shows whether a press reaches the option.
const chromium = process.env.DARECADE_TEST_CHROMIUM;
test(
  "Rankings opens on a game board and its dropdowns answer mouse and keys",
  {
    skip: chromium
      ? false
      : "Build and set DARECADE_TEST_CHROMIUM for real dropdown input",
    timeout: 60000,
  },
  async () => {
    assert.ok(chromium);
    const root = resolve("dist");
    assert.ok(existsSync(join(root, "index.html")));
    const progress = {
      ...fresh(),
      twoD: true,
      welcome: "complete",
      rounds: 8,
      xp: 250,
      sound: false,
      music: false,
    };
    const script = `<script>
    const progress=${JSON.stringify(progress)};
    localStorage.setItem('darecade-v1',JSON.stringify(progress));
    const profile={id:'me',name:'QA Neighbour',account:{email:'qa@example.test',created:1,eligibleAt:1},ageBand:'adult',privacyVersion:'fixture',progress,styleRewards:0,season:null};
    const row=(id,name,rank,score)=>({id,name,rank,score,runId:'run-'+id,look:{}});
    const friend=(id,name)=>({id,name,look:{outfit:0,clothing:0},activity:'lobby',status:'offline',points:3,best:{noodle:40,hop:12,brick:300,swarm:0,coast:0},relationship:'friend',challengeScores:{noodle:{score:40,runId:'r1'}}});
    const nativeFetch=window.fetch;
    window.fetch=async(input,init)=>{
      const u=new URL(String(input),location.href);
      if(!u.pathname.startsWith('/api/'))return nativeFetch(input,init);
      const path=u.pathname.slice(5);let value={};
      if(path==='auth/config')value={now:Date.now(),privacyVersion:'fixture',mailMode:'outbox',origin:location.origin,storageNotice:'Synthetic browser fixture'};
      if(path==='auth/session'||path==='auth/me'||path==='profile')value=profile;
      if(path==='style-rewards')value={tokens:0};
      if(path==='state')value={profile,competitionReady:true,me:'me',self:{id:'me',name:profile.name,look:{},activity:'lobby',status:'online',best:{noodle:25,hop:8,brick:0,swarm:0,coast:0},points:12,outgoing:0},day:'2026-10-13',nextReset:Date.now()+86400000,week:'2026-10-12',weekly:[{id:'me',name:'QA Neighbour',rank:1,points:5,look:{}}],lastWeek:[],dares:[],recentRuns:[],players:[],friends:[friend('a','Ah Beng'),friend('b','Mei Ling')],challenged:[],muted:[],boards:{noodle:[row('a','Ah Beng',1,40),row('me','QA Neighbour',2,25)],hop:[row('b','Mei Ling',1,12)],brick:[],swarm:[],coast:[]},history:[],season:null,seasonHistory:[]};
      if(path==='world/poll')value={t:'sync',at:Date.now(),world:'qa',p:[],d:[],gone:[]};
      return new Response(JSON.stringify(value),{headers:{'Content-Type':'application/json'}});
    };
  </script>`;
    const html = readFileSync(join(root, "index.html"), "utf8").replace(
      "<head>",
      "<head>" + script,
    );
    const server = createServer((request, response) => {
      const path = new URL(request.url || "/", "http://localhost").pathname;
      if (path === "/") {
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
    const dir = mkdtempSync(join(tmpdir(), "simi-rankings-browser-"));
    const child = spawn(
      chromium,
      [
        "--headless",
        "--enable-automation",
        "--no-first-run",
        "--disable-background-networking",
        "--use-mock-keychain",
        "--password-store=basic",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
        "--remote-debugging-port=0",
        `--user-data-dir=${dir}`,
        "--window-size=390,900",
        "about:blank",
      ],
      { detached: true, stdio: "ignore" },
    );
    let socket: WebSocket | undefined;
    try {
      const pause = (ms: number) => new Promise((done) => setTimeout(done, ms));
      const portFile = join(dir, "DevToolsActivePort");
      for (let i = 0; i < 150 && !existsSync(portFile); i++) await pause(100);
      const port = readFileSync(portFile, "utf8").split("\n")[0];
      const targets = (await (
        await fetch(`http://127.0.0.1:${port}/json`)
      ).json()) as { type: string; webSocketDebuggerUrl: string }[];
      socket = new WebSocket(
        targets.find((target) => target.type === "page")!.webSocketDebuggerUrl,
      );
      await once(socket, "open");
      let calls = 0;
      const replies = new Map<number, (message: any) => void>();
      const errors: string[] = [];
      socket.on("message", (raw) => {
        const message = JSON.parse(String(raw));
        replies.get(message.id)?.(message);
        replies.delete(message.id);
        if (message.method === "Runtime.exceptionThrown")
          errors.push(
            message.params.exceptionDetails.exception?.description ||
              message.params.exceptionDetails.text,
          );
      });
      const send = (method: string, params = {}) =>
        new Promise<any>((done, fail) => {
          const id = ++calls;
          replies.set(id, (message) =>
            message.error
              ? fail(Error(`${method}: ${message.error.message}`))
              : done(message.result),
          );
          socket!.send(JSON.stringify({ id, method, params }));
        });
      const evaluate = async (expression: string) => {
        const reply = await send("Runtime.evaluate", {
          expression,
          returnByValue: true,
        });
        assert.ok(!reply.exceptionDetails, expression);
        return reply.result.value;
      };
      const wait = async (expression: string) => {
        for (let i = 0; i < 200; i++) {
          if (await evaluate(expression)) return;
          await pause(100);
        }
        assert.fail(`Timed out: ${expression}`);
      };
      /** Presses the middle of the element, if nothing covers it. */
      const press = async (selector: string, index = 0) => {
        const point = await evaluate(
          `(()=>{const el=document.querySelectorAll(${JSON.stringify(selector)})[${index}];if(!el)return null;el.scrollIntoView({block:'center'});const r=el.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);return {x,y,hit:hit===el||el.contains(hit)};})()`,
        );
        assert.ok(point?.hit, `${selector} can be pressed`);
        for (const type of ["mouseMoved", "mousePressed", "mouseReleased"])
          await send("Input.dispatchMouseEvent", {
            type,
            x: point.x,
            y: point.y,
            button: "left",
            buttons: type === "mousePressed" ? 1 : 0,
            clickCount: 1,
          });
        await pause(150);
      };
      const key = async (name: "Enter" | "ArrowDown") => {
        for (const type of ["keyDown", "keyUp"])
          await send("Input.dispatchKeyEvent", {
            type,
            key: name,
            code: name,
            windowsVirtualKeyCode: name === "Enter" ? 13 : 40,
            ...(name === "Enter" && type === "keyDown" ? { text: "\r" } : {}),
          });
        await pause(150);
      };
      const choose = async (id: string, label: string) => {
        await press(`.kit-select:has(#${id}) .kit-select-trigger`);
        const options: string[] = await evaluate(
          `[...document.querySelectorAll('.kit-select:has(#${id}) .kit-options button')].map(b=>b.textContent)`,
        );
        assert.ok(options.includes(label), `${id}: ${options.join(", ")}`);
        await press(
          `.kit-select:has(#${id}) .kit-options button`,
          options.indexOf(label),
        );
      };
      const text = () =>
        evaluate("document.querySelector('#modal-body').textContent");
      await send("Runtime.enable");
      await send("Emulation.setDeviceMetricsOverride", {
        width: 390,
        height: 844,
        deviceScaleFactor: 1,
        mobile: false,
      });
      await send("Page.navigate", {
        url: `http://127.0.0.1:${address.port}/`,
      });
      await wait(
        "!!document.querySelector('#world canvas')&&!document.querySelector('#loading')",
      );
      await evaluate(
        `document.querySelector('[data-open="phone-menu"]').click();document.querySelector('[data-open="quests"]').click()`,
      );
      assert.deepEqual(
        await evaluate(
          "[...document.querySelectorAll('.quest-tabs button')].map(b=>b.textContent)",
        ),
        ["Quests", "Rankings & challenges"],
      );
      await press('.quest-tabs [data-open="board"]');
      await wait("!!document.querySelector('#board-game')");
      assert.equal(
        await evaluate("document.querySelector('#board-period').value"),
        "daily",
      );
      assert.match(await text(), /Ah Beng[\s\S]*40/);

      await choose("board-game", "Hop Hop");
      assert.equal(
        await evaluate("document.querySelector('#board-game').value"),
        "hop",
      );
      assert.match(await text(), /Mei Ling[\s\S]*Play Hop Hop/);
      assert.equal(
        await evaluate("document.activeElement.className"),
        "kit-select-trigger",
        "focus returns to the dropdown after its panel redraws",
      );
      // Enter opens the list on Hop Hop; one step down is the next game.
      const next = await evaluate(
        "(()=>{const s=document.querySelector('#board-game');return s.options[s.selectedIndex+1].value})()",
      );
      await key("Enter");
      await key("ArrowDown");
      await key("Enter");
      assert.equal(
        await evaluate("document.querySelector('#board-game').value"),
        next,
      );

      await choose("board-period", "Weekly medals");
      assert.match(await text(), /YOUR WEEKLY RANK/);
      await choose("board-period", "Today’s scores");
      assert.ok(await evaluate("!!document.querySelector('#board-game')"));

      await press('.board-challenges [data-open="dares-neighbour"]');
      assert.match(await text(), /Friends & requests/);
      await choose("dare-choice", "Mei Ling · friend");
      assert.equal(
        await evaluate(
          "document.querySelector('[data-challenge]').dataset.defender",
        ),
        "b",
      );
      await press('[data-open="dares-find"]');
      assert.match(await text(), /Ask for their exact nickname/);
      await press(".menu-back");
      await press(".menu-back");
      assert.ok(await evaluate("!!document.querySelector('#board-game')"));
      assert.deepEqual(errors, []);
    } finally {
      socket?.close();
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
