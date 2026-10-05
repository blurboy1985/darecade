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
import { raceTime } from "../shared/racing.ts";

// Real built DOM/CSS/canvas in installed Chrome, with synthetic API responses.
// Chrome virtual time does not reliably deliver RAF. This fixture controls only
// RAF/performance.now to exercise 40 seconds of actual Stage simulation. It does
// not measure real-time timing, native touch, backgrounding or 3D performance.
const chromium = process.env.DARECADE_TEST_CHROMIUM;
const viewports = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 390, height: 844 },
  { name: "landscape", width: 844, height: 390 },
];

for (const viewport of viewports) {
  test(
    `Section 4 built Coast and Stage panels at ${viewport.name} ${viewport.width}×${viewport.height}`,
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
      const yesterday = new Date(Date.parse(today) - 86400000)
        .toISOString()
        .slice(0, 10);
      const profile = {
        id: "section4-synthetic-guest",
        name: "QA Neighbour",
        account: null,
        ageBand: "adult",
        privacyVersion: "fixture",
        styleRewards: 0,
        playMedals: { day: today, today: 0, total: 0, games: [], limit: 3 },
        progress: {
          ...fresh(),
          twoD: true,
          reduced: true,
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
        requests.push({ path, data });
        let result = {};
        if (path === 'auth/config') result = { now: Date.now(), privacyVersion: 'fixture', mailMode: 'outbox', origin: location.origin, storageNotice: 'Synthetic test fixture' };
        else if (path === 'auth/me' || path === 'profile' || path === 'progress') result = profile;
        else if (path === 'state') result = { profile, competitionReady: false, me: profile.id, self: { id: profile.id, name: profile.name, look: {}, activity: 'lobby', status: 'online', best: profile.progress.best, points: 0 }, day: ${JSON.stringify(today)}, nextReset: Date.now() + 86400000, week: '', weekly: [], lastWeek: [], dares: [], recentRuns: [], players: [], friends: [], challenged: [], boards: { noodle: [], hop: [], brick: [], swarm: [], coast: [], hoops: [], fishing: [] }, history: [] };
        else if (path === 'world/poll') result = { t: 'sync', at: Date.now(), world: 'fixture', p: [], d: [], gone: [] };
        else if (path === 'run') result = { id: 'synthetic-coast-run', game: data.game, seed: 7, version: 3, ranked: false, dailySeed: false, target: null, targetScore: 0 };
        else if (path === 'style-rewards') result = { tokens: 0 };
        return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } });
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
        const playableStage = label => {
          const screen = find('.stage-screen').getBoundingClientRect();
          const lanes = find('.stage-lanes').getBoundingClientRect();
          check(screen.width > 0 && screen.height > 0 && screen.top >= 0 && screen.bottom <= innerHeight + 1, label + ' note highway fits the playing viewport');
          check(lanes.width > 0 && lanes.height > 0 && lanes.top >= 0 && lanes.bottom <= innerHeight + 1, label + ' lane buttons fit the same playing viewport');
          check(screen.bottom <= lanes.top + 1, label + ' lane buttons do not cover the notes');
          const button = find('[data-lane="0"]'), box = button.getBoundingClientRect();
          const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
          check(target === button || button.contains(target), label + ' lane button remains an unobstructed target during play');
        };
        const close = () => find('#close-modal').click();
        const syncProfile = () => window.dispatchEvent(new CustomEvent('account-profile', { detail: profile }));
        const openCoast = async () => {
          find('.lobby-dock [data-open="arcade"]').click();
          for (let i = 0; i < 3 && !find('[data-game="coast"]'); i++) {
            const next = [...document.querySelectorAll('[data-page="games"]')].find(button => !button.disabled && button.textContent.includes('Next'));
            check(!!next, 'Coast remains reachable in game picker'); next.click();
          }
          find('[data-game="coast"]').click();
          await until(() => find('.race-cover #start-game') && !find('.race-cover #start-game').disabled, 'Coast ready');
        };
        const openStage = async () => {
          find('.lobby-dock [data-open="map"]').click();
          find('#destination').value = 'stage';
          find('[data-action="go-destination"]').click();
          await until(() => find('#stage-mode'), 'Stage panel');
        };
        const setMode = value => { find('#stage-mode').value = value; find('#stage-mode').dispatchEvent(new Event('change', { bubbles: true })); };
        const performRequests = () => requests.filter(request => request.path === 'progress' && request.data?.event === 'perform');
        const savedStage = () => { const p = JSON.parse(localStorage.getItem('darecade-v1')); return [p.xp, p.stageBest, p.stageXp, p.stageDay, p.stageLast]; };
        try {
          await until(() => document.body.classList.contains('mode-2d') && !find('#loading'), 'built lobby loaded');
          check(innerWidth === ${viewport.width} && innerHeight === ${viewport.height}, 'actual iframe CSS viewport');
          await openCoast();
          check(find('.game-progress').textContent.includes('First goal: finish all 3 laps'), 'Coast first finish goal');
          check(find('.level-reward').textContent.includes('1 XP to your next Style token'), '99 XP boundary');
          check(find('.game-progress').textContent.includes('Verified round: +20 XP'), 'existing Coast XP copy');
          const cover = find('.race-cover'), guide = find('.race-guide');
          check(getComputedStyle(cover).overflowY === 'auto', 'Coast cover can scroll');
          hitTarget(find('.race-cover #start-game'), 'Coast start');
          hitTarget(guide.querySelector('summary'), 'Coast Controls & items');
          guide.querySelector('summary').focus();
          check(document.activeElement === guide.querySelector('summary'), 'guide accepts keyboard focus');
          guide.querySelector('summary').click();
          check(guide.open && guide.textContent.includes('Shield') && guide.textContent.includes('Coconut') && guide.textContent.includes('Shells'), 'original controls and item guide opens');
          check(guide.textContent.includes('Space') || guide.textContent.includes('DRIFT'), 'drift controls preserved');
          hitTarget(find('.race-sound'), 'Coast sound control');
          check(document.documentElement.scrollWidth <= innerWidth + 1, 'Coast has no document horizontal overflow');
          check(find('#modal').scrollWidth <= find('#modal').clientWidth + 1, 'Coast has no modal horizontal overflow');
          close();
          profile.progress.xp = 100;
          profile.progress.coastRecord = { version: 3, timeTicks: 3600, place: 2 };
          syncProfile();
          await openCoast();
          check(find('.game-progress').textContent.includes('Next goal: beat ${raceTime(3600)}'), 'Coast saved fastest-time goal');
          check(find('.game-progress').textContent.includes('best place 2'), 'separate saved placing');
          check(find('.level-reward').textContent.includes('Level 2') && find('.level-reward').textContent.includes('100 XP to your next Style token'), '100 XP level boundary');
          close();
          profile.progress.stageXp = 45; syncProfile();
          await openStage();
          check(find('#stage-mode').value === 'warmup', 'new performer defaults to warmup');
          check(find('#stage-progress').textContent.includes('0/45 XP left today'), 'same-day Stage cap');
          check(getComputedStyle(find('.stage-hype')).display === 'none', 'warmup hype is hidden by actual CSS');
          hitTarget(find('#stage-start'), 'Stage start');
          check(find('#modal').scrollWidth <= find('#modal').clientWidth + 1, 'Stage has no modal horizontal overflow');
          const savedBefore = JSON.stringify(savedStage());
          find('#stage-start').click();
          check(find('#stage-mode').disabled, 'session selector locked during warmup');
          check([...document.querySelectorAll('[data-lane]')].map(button => button.disabled).join() === 'false,true,true,false', 'only outside warmup lanes enabled');
          playableStage('Warmup');
          advance(2400);
          check(find('.activity-stage').dataset.left === '0', 'all 40 simulation seconds completed');
          check(find('.activity-status').textContent.includes('0 notes landed') && find('.activity-status').textContent.includes('No XP or best score changed'), 'idle warmup gives a gentle completion');
          check(performRequests().length === 0 && JSON.stringify(savedStage()) === savedBefore, 'warmup sends no perform report or saved progress change');
          check(!find('#stage-start').hidden && !find('#stage-mode').disabled, 'warmup replay and Show remain available');
          check(find('#stage-progress').getBoundingClientRect().height > 0, 'completion restores the progress card');
          find('#stage-start').click();
          playableStage('Warmup replay');
          for (let tick = 1; tick <= 2400; tick++) {
            if (tick >= 150 && tick <= 510 && (tick - 150) % 90 === 0) {
              const key = ((tick - 150) / 90) % 2 ? 'ArrowRight' : 'ArrowLeft';
              window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
            }
            advance();
          }
          check(find('.activity-status').textContent.includes('5 notes landed') && find('.activity-status').textContent.includes('Warm-up goal complete'), 'five-note goal succeeds with real Stage keyboard handlers');
          check(performRequests().length === 0 && JSON.stringify(savedStage()) === savedBefore, 'successful warmup also grants no rewards');
          setMode('show');
          check(find('#stage-score-label').textContent === 'SCORE' && find('#stage-score').textContent === '0' && !find('.activity-status').textContent, 'mode switch clears practice HUD');
          check(getComputedStyle(find('.stage-hype')).display !== 'none', 'Show restores hype');
          find('#stage-start').click();
          check([...document.querySelectorAll('[data-lane]')].every(button => !button.disabled), 'Show preserves all four lanes');
          playableStage('Show');
          advance(300);
          await until(() => find('.activity-status').textContent.includes('Try Warm-up'), 'failed Show result');
          check(performRequests().length === 1 && performRequests()[0].data.value.score === 0 && performRequests()[0].data.value.stars === 0, 'original Show reports its zero-star result once');
          close();
          profile.progress.stageBest = 5000; profile.progress.stageDay = ${JSON.stringify(yesterday)}; syncProfile();
          await openStage();
          check(find('#stage-mode').value === 'show', 'returning positive best defaults to Show');
          check(find('#stage-progress').textContent.includes('Best show: 5000 points') && find('#stage-progress').textContent.includes('45/45 XP left today'), 'best retained and yesterday cap resets in copy');
          check(document.documentElement.scrollWidth <= innerWidth + 1, 'final Stage has no horizontal overflow');
          check(!requests.some(request => request.path === 'auth/join' || request.path.startsWith('auth/code') || request.path === 'auth/verify'), 'no account creation or email requests');
          // Leave a live Show on screen for Chrome's optional screenshot. Both
          // gameplay and the ready-state progress copy were checked above.
          find('#stage-start').click(); advance(120);
          playableStage('Returning Show');
          check(find('#stage-progress').getBoundingClientRect().height === 0, 'large progress card is hidden only during play');
          parent.postMessage({ result: 'pass', report: { viewport: ${JSON.stringify(viewport)}, checks, performReports: performRequests().length, timing: 'test-controlled RAF: two 40-second warmups', graphics: 'saved 2D mode; real DOM/CSS/2D canvas' } }, location.origin);
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
      const directory = mkdtempSync(join(tmpdir(), "simi-section4-browser-"));
      mkdirSync(resolve(".browser"), { recursive: true });
      const screenshot = resolve(".browser", `section4-${viewport.name}.png`);
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
          resolve(".browser", `section4-${viewport.name}.html`),
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
