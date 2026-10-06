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
import { resolve, join, extname, sep } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { fresh } from "../src/state.ts";

// Runs the built application with canned API responses, never player accounts
// or a mail transport. Real DOM, Three.js and CSS exercise both fallback paths.
const chromium = process.env.DARECADE_TEST_CHROMIUM;
for (const twoD of [true, false]) {
  test(
    `built lobby and reward work with ${twoD ? "saved 2D mode" : "WebGL unavailable"}`,
    {
      skip: chromium
        ? false
        : "Build first and set DARECADE_TEST_CHROMIUM for browser smoke",
      timeout: 40000,
    },
    async () => {
      assert.ok(chromium);
      const root = resolve("dist");
      assert.ok(existsSync(join(root, "index.html")), "npm run build first");
      const progress = {
        ...fresh(),
        twoD,
        rounds: 1,
        welcome: "complete",
        xp: 200,
        sound: false,
        music: false,
      };
      const profile = {
        id: "qa-existing-profile",
        name: "QA Neighbour",
        account: null,
        ageBand: "adult",
        privacyVersion: "test",
        progress,
        styleRewards: 0,
      };
      const script = `<script>
      const profile = ${JSON.stringify(profile)};
      let notices = 0, claims = 0, contexts = 0;
      const nativeContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (String(type).startsWith('webgl')) { contexts++; return null; }
        return nativeContext.call(this, type, ...args);
      };
      localStorage.setItem('darecade-v1', JSON.stringify(profile.progress));
      const nativeFetch = window.fetch;
      window.fetch = async (input, init) => {
        const url = new URL(String(input), location.href);
        if (!url.pathname.startsWith('/api/')) return nativeFetch(input, init);
        const path = url.pathname.slice(5);
        let result = {};
        if (path === 'auth/config') result = { now: Date.now(), privacyVersion: 'test', mailMode: 'outbox', origin: location.origin, storageNotice: 'Test fixture' };
        else if (path === 'auth/me' || path === 'profile') result = profile;
        else if (path === 'style-rewards') { result = { tokens: notices }; notices = 0; claims++; profile.styleRewards = 0; }
        else if (path === 'state') result = { profile, competitionReady: false, me: profile.id, self: { id: profile.id, name: profile.name, look: {}, activity: 'lobby', status: 'online', best: profile.progress.best, points: 0 }, day: '2026-10-05', nextReset: Date.now() + 86400000, week: '', weekly: [], lastWeek: [], dares: [], recentRuns: [], players: [], friends: [], challenged: [], boards: { noodle: [], hop: [], brick: [], swarm: [], coast: [] }, history: [] };
        else if (path === 'world/poll') result = { t: 'sync', at: Date.now(), world: 'qa', p: [], d: [], gone: [] };
        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
      };
      window.addEventListener('load', async () => {
        const check = (value, message) => { if (!value) throw Error(message); };
        const until = async (predicate) => { for (let i = 0; i < 160; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 100)); } throw Error('Timed out waiting for UI'); };
        const reward = () => document.querySelector('.style-reward');
        const award = (tokens) => { notices = tokens; profile.styleRewards = tokens; window.dispatchEvent(new CustomEvent('account-profile', { detail: profile })); };
        try {
          await until(() => document.body.classList.contains('mode-2d') && !document.querySelector('#loading'));
          check(!document.querySelector('#fallback').hidden, 'fallback lobby visible');
          check(getComputedStyle(document.querySelector('#camera-toggle')).display === 'none', 'camera hidden in 2D');
          check(document.querySelector('#interaction').hidden, 'nearby interaction cleared');
          check(!document.querySelector('#world canvas'), 'world canvas removed');
          check(JSON.parse(localStorage.getItem('darecade-v1')).twoD === ${twoD}, 'temporary graphics failure must not save 2D preference');
          check(${twoD} ? contexts === 0 : contexts > 0, 'correct startup path');
                    award(2);
          await until(reward);
          check(reward().textContent.includes('+2 Style tokens'), 'multiple token count');
          check(!reward().querySelector('canvas'), 'static reveal in 2D');
          reward().querySelector('.text-button').click();
          check(!reward(), 'dismiss removes reward');
          award(1);
          await until(reward);
          reward().querySelector('.primary').click();
          check(!reward() && document.querySelector('#modal').open, 'See looks opens wardrobe');
          check(document.querySelector('#modal-body').textContent.includes('Style'), 'wallet explained');
          award(2);
          await new Promise(r => setTimeout(r, 100));
          check(!reward(), 'reward waits while wardrobe is open');
          document.querySelector('#close-modal').click();
          await until(reward);
          check(!document.querySelector('#modal').open, 'owner dialog closed');
          reward().querySelector('.text-button').click();
          check(!reward(), 'deferred reward can be dismissed');
          check(claims === 3, 'each reward claimed once');
          await new Promise(r => setTimeout(r, 100));
          check(!reward(), 'dismissed notices do not replay');
          document.querySelector('[data-open="arcade"]').click();
          check(document.querySelector('#modal').open, 'Games opens in 2D');
          check(document.querySelector('#modal-body').textContent.includes('Play outside'), 'Games heading');
          check(innerWidth === 390, 'real CSS viewport is 390px');
          check(document.documentElement.scrollWidth <= innerWidth, 'mobile has no horizontal overflow');
          document.body.dataset.result = 'pass';
          parent.postMessage({ result: 'pass', report: { twoD: ${twoD}, contexts, claims, width: innerWidth, height: innerHeight } }, location.origin);
        } catch (error) { parent.postMessage({ result: 'fail', report: error.stack }, location.origin); }
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
            `<!doctype html><html><head><script>addEventListener('message', event => { if (event.origin !== location.origin || event.source !== document.querySelector('iframe').contentWindow) return; document.body.dataset.result = event.data.result; document.querySelector('#smoke-result').textContent = JSON.stringify(event.data.report); });</script></head><body style="margin:0"><iframe src="/smoke" style="width:390px;height:844px;border:0"></iframe><pre id="smoke-result"></pre></body></html>`,
          );
          return;
        }
        if (path === "/smoke") {
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
      const directory = mkdtempSync(join(tmpdir(), "simi-fallback-browser-"));
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
          "--window-size=390,844",
          "--dump-dom",
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
              reject(
                Error(
                  "No browser result within 30 seconds\n" + errors.slice(-2000),
                ),
              ),
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
        mkdirSync(resolve(".browser"), { recursive: true });
        writeFileSync(resolve(".browser", `fallback-${twoD}.html`), output);
        assert.match(
          output,
          /<body[^>]*data-result="pass"/,
          [...output.matchAll(/<pre id="smoke-result">([\s\S]*?)<\/pre>/g)].at(
            -1,
          )?.[1] || output.slice(-2000),
        );
        console.log(
          [...output.matchAll(/<pre id="smoke-result">([\s\S]*?)<\/pre>/g)].at(
            -1,
          )?.[1],
        );
      } finally {
        // macOS headless Chrome can finish dump-dom but hang at process shutdown.
        // Stop only this fixture's process group after collecting its DOM result.
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
