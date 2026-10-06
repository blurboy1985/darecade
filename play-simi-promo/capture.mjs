// Captures promo footage of the live Play Simi game as a guest.
//
//   node capture.mjs              every shot
//   node capture.mjs hoops emote  only the named shots
//   node capture.mjs --list       list shot names
//   node capture.mjs --retrim     re-cut clips from raw/ after editing raw/clips.json
//
// Rules this script keeps: guest play only, no email is ever typed, nothing is
// bought (premium looks are only previewed), no player is contacted or
// reported, and other players' nicknames are swapped for made-up ones before
// the page sees them, so no real name is ever filmed.
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const URL = "https://playsimi.danielquek.com";
const ASSETS = "assets";
const RAW = "raw";
const STATE = "guest-state.json";
const NICKNAME = "MochiStar"; // made up; shown as the guest's own name tag
// Phone: a 390×844 touch window. Stills use a real device scale factor of 3
// (1170×2532); clips use 2 (780×1688) so every frame keeps up at 30 fps.
// The scale factor is set on the browser window, not emulated, because the
// recorder only sees emulated pages at 1×.
const PHONE = { width: 390, height: 844 };
const DESKTOP = { width: 1920, height: 1080 };
const GPU_ARGS = ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--mute-audio"];
const ALIASES = ["Luna", "Kiko", "Bao", "Tofu", "Miso", "Juno", "Sora", "Nori", "Pip", "Yuzu", "Coco", "Riku", "Momo", "Tato", "Zuzu", "Fig", "Kumo", "Pan", "Remy", "Suki"];

mkdirSync(ASSETS, { recursive: true });
mkdirSync(RAW, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- name scrub
const realNames = new Map(); // real nickname -> alias
let myId = "";
function alias(name) {
  if (!realNames.has(name)) realNames.set(name, ALIASES[realNames.size % ALIASES.length]);
  return realNames.get(name);
}
function collect(o) {
  if (!o || typeof o !== "object") return;
  if (!Array.isArray(o)) {
    if (typeof o.me === "string") myId = o.me;
    if (typeof o.name === "string" && (o.look || /^[0-9a-f-]{36}$/.test(o.id || "")) && o.id !== myId && o.name !== NICKNAME) alias(o.name);
  }
  for (const v of Object.values(o)) collect(v);
}
function replace(o) {
  if (!o || typeof o !== "object") return;
  for (const [k, v] of Object.entries(o)) {
    if (typeof v === "string" && realNames.has(v)) o[k] = realNames.get(v);
    else replace(v);
  }
}
function scrub(json) {
  collect(json);
  replace(json);
  return json;
}
async function scrubNames(ctx) {
  // Guests who never chose a nickname show a generated one ("Mint Gecko 42").
  // Those never pass through the API as a player record, so they are swapped
  // where the page draws name tags: any "Word Word 12" text becomes an alias.
  await ctx.addInitScript((aliases) => {
    const map = new Map();
    const swap = (t) => {
      if (typeof t !== "string" || !/^[A-Z][a-z]+ [A-Z][a-z]+ \d{1,3}$/.test(t.trim())) return t;
      if (!map.has(t)) map.set(t, aliases[(map.size * 3 + 5) % aliases.length]);
      return map.get(t);
    };
    for (const fn of ["fillText", "strokeText", "measureText"]) {
      const orig = CanvasRenderingContext2D.prototype[fn];
      CanvasRenderingContext2D.prototype[fn] = function (t, ...rest) {
        return orig.call(this, swap(t), ...rest);
      };
    }
  }, ALIASES);
  await ctx.route("**/api/**", async (route) => {
    try {
      const response = await route.fetch();
      if (!(response.headers()["content-type"] || "").includes("json")) return route.fulfill({ response });
      const json = scrub(await response.json());
      return route.fulfill({ response, json });
    } catch {
      return route.continue().catch(() => {});
    }
  });
  await ctx.routeWebSocket(/\/api\/world\/connect/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((m) => server.send(m));
    server.onMessage((m) => {
      try {
        ws.send(JSON.stringify(scrub(JSON.parse(m))));
      } catch {
        ws.send(m);
      }
    });
  });
}

// ---------------------------------------------------------------- page helpers
const jclick = (page, sel) =>
  page.evaluate((s) => {
    const e = document.querySelector(s);
    if (!e) return false;
    e.click();
    return true;
  }, sel);
/** Opens any panel through the game's own delegated [data-open] handler. */
const openPanel = async (page, id, wait = 900) => {
  await page.evaluate((id) => {
    const b = document.createElement("button");
    b.dataset.open = id;
    b.hidden = true;
    document.querySelector("#app").append(b);
    b.click();
    b.remove();
  }, id);
  await page.waitForTimeout(wait);
};
const closeModal = async (page) => {
  await jclick(page, "#close-modal");
  await page.waitForTimeout(500);
};
const world = (page) => page.evaluate(() => ({ ...document.querySelector("#world canvas")?.dataset }));
const key = (page, k, type = "keydown") =>
  page.evaluate(([k, type]) => window.dispatchEvent(new KeyboardEvent(type, { key: k, bubbles: true, cancelable: true })), [k, type]);
const CLEAN_CSS = `.topbar,.bottom-bar,.vignette,.hud,.world-actions,.world-zoom,#quick-emotes,[id^=toast],.toast{display:none!important}`;
async function cleanHud(page, on = true) {
  await page.evaluate(
    ([css, on]) => {
      document.querySelector("#promo-clean")?.remove();
      if (!on) return;
      const s = document.createElement("style");
      s.id = "promo-clean";
      s.textContent = css;
      document.head.append(s);
    },
    [CLEAN_CSS, on],
  );
}
const scrollModalTop = (page) =>
  page.evaluate(() => {
    for (const e of [document.querySelector("#modal"), document.querySelector("#modal-body"), ...document.querySelectorAll("#modal *")])
      if (e && e.scrollTop) e.scrollTop = 0;
  });

/** Steers Coast Rush from the offset the game exposes. Returns when done. */
async function driveCoast(page, { ms, untilFinished = false, onTick }) {
  await page.keyboard.down("w");
  let held = "", heldSince = 0, drifting = false;
  const t0 = Date.now();
  let last = null;
  while (Date.now() - t0 < ms) {
    const d = await page.evaluate(() => {
      const s = document.querySelector(".coast-game");
      return s ? { ...s.dataset, notice: document.querySelector(".race-notice")?.textContent || "" } : null;
    });
    if (!d) break;
    last = d;
    if (d.status === "finished") break;
    const off = Number(d.offset);
    const want = off > 1.0 ? "d" : off < -1.0 ? "a" : "";
    if (want !== held) {
      if (held) await page.keyboard.up(held);
      if (drifting) (await page.keyboard.up(" ")), (drifting = false);
      if (want) await page.keyboard.down(want);
      held = want;
      heldSince = Date.now();
    } else if (held && !drifting && Date.now() - heldSince > 250) {
      await page.keyboard.down(" ");
      drifting = true;
    }
    if (d.item && d.item !== "empty") await page.keyboard.press("e");
    onTick?.(d);
    await page.waitForTimeout(40);
  }
  if (held) await page.keyboard.up(held);
  if (drifting) await page.keyboard.up(" ");
  if (!untilFinished) await page.keyboard.up("w");
  return last;
}

/** First visit: age gate, consent, first race, nickname. Email is skipped. */
async function ensureGuest(page, nickname = NICKNAME) {
  await page.waitForTimeout(1500);
  // Current build: two switches (13 or older, privacy notice) and "Agree & play".
  const switches = page.locator("dialog[open] .kit-switch");
  if ((await switches.count().catch(() => 0)) >= 2) {
    for (let i = 0; i < 2; i++) await switches.nth(i).click();
    await page.locator("dialog[open] button.primary").click();
    await page.waitForTimeout(5000);
    await jclick(page, "[data-action=welcome-skip]"); // the first race is optional
    await page.waitForTimeout(500);
    // Guests get a generated nickname; replace it with the made-up one where the game offers the field.
    await openPanel(page, "wardrobe");
    await page.evaluate(() => document.querySelectorAll("#modal-body details").forEach((d) => (d.open = true)));
    if (await page.locator("#nickname").count()) {
      await page.fill("#nickname", nickname, { force: true }).catch(() => {});
      await page.evaluate(() => document.querySelector("#nickname-form")?.requestSubmit());
      await page.waitForTimeout(1200);
    }
    await closeModal(page);
    return;
  }
  // Earlier builds: birth month and year, then a consent tick, then a welcome race.
  if (await page.locator("#age-form").isVisible().catch(() => false)) {
    await page.selectOption("#age-form select[name=month]", "1");
    await page.fill("#age-form input[name=year]", "2000");
    await page.click("#age-form button.primary");
    await page.waitForSelector("#consent-form", { timeout: 15000 });
    await page.check("#consent-form input[name=consent]");
    await page.click("#consent-form button.primary");
    await page.waitForTimeout(5000);
  }
  if (await page.locator("[data-action=welcome-start]").isVisible().catch(() => false)) {
    console.log("  first visit: running the welcome race and naming the guest");
    await jclick(page, "[data-action=welcome-start]");
    await page.waitForSelector("#start-game:not([disabled])", { timeout: 40000 });
    await jclick(page, "#start-game");
    await driveCoast(page, { ms: 130000 });
    await page.waitForSelector("[data-action=setup-look]", { timeout: 40000 });
    await jclick(page, "[data-action=setup-look]");
    await page.waitForSelector("#nickname", { timeout: 10000 });
    await page.fill("#nickname", nickname);
    await jclick(page, "[data-action=setup-save]");
    await page.waitForSelector("#account-back", { timeout: 10000 });
    await jclick(page, "#account-back"); // "Skip for now": no email
    await page.waitForTimeout(2000);
  }
}

// ---------------------------------------------------------------- sessions
const browsers = {};
async function getBrowser(size, scale) {
  const k = `${size.width}x${scale}`;
  browsers[k] ??= await chromium.launch({
    args: [...GPU_ARGS, `--force-device-scale-factor=${scale}`, `--window-size=${size.width},${size.height}`],
  });
  return browsers[k];
}
/**
 * Records the page through Playwright's CDP session: screencast frames are
 * piped straight into ffmpeg. (recordVideo is fixed at a low VP8 bitrate and
 * 1× pixels, which is too soft for a 1080p promo.)
 */
async function startRecorder(ctx, page, file) {
  const cdp = await ctx.newCDPSession(page);
  const enc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-use_wallclock_as_timestamps", "1", "-c:v", "mjpeg", "-i", "pipe:0",
    "-vf", "fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-pix_fmt", "yuv420p", file], { stdio: ["pipe", "inherit", "inherit"] });
  let frames = 0;
  cdp.on("Page.screencastFrame", (f) => {
    frames++;
    if (enc.stdin.writable) enc.stdin.write(Buffer.from(f.data, "base64"));
    cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, everyNthFrame: 1 });
  const t0 = Date.now();
  return {
    t0,
    async stop() {
      await cdp.send("Page.stopScreencast").catch(() => {});
      enc.stdin.end();
      await once(enc, "close");
      console.log(`  recorded ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    },
  };
}
let current = null; // the open session, so a failed shot can still be closed
async function session(kind, { video = false } = {}) {
  const desktop = kind === "desktop";
  const browser = await getBrowser(desktop ? DESKTOP : PHONE, desktop ? 1 : video ? 2 : 3);
  const ctx = await browser.newContext({ viewport: null, hasTouch: !desktop, ...(existsSync(STATE) ? { storageState: STATE } : {}) });
  await scrubNames(ctx);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => console.log("  pageerror:", e.message.slice(0, 160)));
  await page.goto(URL, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
  await ensureGuest(page);
  await ctx.storageState({ path: STATE });
  await page.waitForFunction(() => Number(document.querySelector("#world canvas")?.dataset.fps) > 5, null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const marks = {};
  let rec = null, t0 = Date.now();
  return (current = {
    page,
    ctx,
    /** Starts filming. Marks and now() count seconds from this moment. */
    async record(name) {
      rec = await startRecorder(ctx, page, `${RAW}/${name}.mp4`);
      t0 = rec.t0;
      this.name = name;
    },
    now: () => (Date.now() - t0) / 1000,
    mark: (name) => (marks[name] = (Date.now() - t0) / 1000),
    marks,
    async end() {
      await ctx.storageState({ path: STATE });
      if (rec) {
        await rec.stop();
        writeFileSync(`${RAW}/${this.name}.json`, JSON.stringify(marks, null, 1));
      }
      await ctx.close();
      current = null;
    },
  });
}
/**
 * Extra guest sessions run by this script, so the plaza shot has company.
 * The newest build hides other players' avatars from strangers, so without
 * these the plaza is empty. They are this script's own guests with made-up
 * nicknames: no real player is involved.
 */
const FRIENDS = [
  { nick: "LunaBean", look: "mage", at: [-1.7, 5.6] },
  { nick: "KikoPop", look: "archer", at: [2.0, 6.0] },
  { nick: "BaoBun", look: "warrior", at: [-1.1, 3.2] },
];
async function openFriends() {
  const browser = await getBrowser(PHONE, 2);
  return Promise.all(FRIENDS.map(async (f, i) => {
    const file = `guest-friend-${i + 1}.json`;
    const ctx = await browser.newContext({ viewport: null, hasTouch: true, ...(existsSync(file) ? { storageState: file } : {}) });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
    await ensureGuest(page, f.nick);
    await ctx.storageState({ path: file });
    await page.waitForFunction(() => Number(document.querySelector("#world canvas")?.dataset.fps) > 1, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1000);
    await openPanel(page, "wardrobe");
    await wearLook(page, LOOKS[f.look]);
    await closeModal(page);
    await goTo(page, f.at[0], f.at[1] - 0.6);
    await walk(page, "s", 130); // turn to face the camera side
    return { ...f, page, ctx, file };
  }));
}
async function closeFriends(friends) {
  for (const f of friends) {
    await f.ctx.storageState({ path: f.file }).catch(() => {});
    await f.ctx.close().catch(() => {});
  }
}
const shot = (page, name, opts = {}) => {
  console.log("  still", name);
  return page.screenshot({ path: `${ASSETS}/${name}.png`, ...opts });
};

// ---------------------------------------------------------------- ffmpeg
function ff(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8" });
  if (r.status !== 0) console.log("  ffmpeg failed:", r.stderr.slice(0, 400));
  return r.status === 0;
}
const clips = existsSync(`${RAW}/clips.json`) ? JSON.parse(readFileSync(`${RAW}/clips.json`, "utf8")) : {};
/** Cuts raw/<src>.mp4 to assets/<name>.webm and .mp4. crop is "w:h:x:y" in source pixels. */
function trim(name, start, dur, { src = name, crop = "", note = "" } = {}) {
  start = Math.max(0, start);
  const vf = [crop && `crop=${crop}`, "scale=trunc(iw/2)*2:trunc(ih/2)*2", "fps=30"].filter(Boolean).join(",");
  const base = ["-ss", start.toFixed(2), "-i", `${RAW}/${src}.mp4`, "-t", dur.toFixed(2), "-an", "-vf", vf];
  ff([...base, "-c:v", "libvpx-vp9", "-crf", "24", "-b:v", "0", "-deadline", "good", "-cpu-used", "4", `${ASSETS}/${name}.webm`]);
  ff([...base, "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-g", "10", "-pix_fmt", "yuv420p", "-movflags", "+faststart", `${ASSETS}/${name}.mp4`]);
  clips[name] = { src, start: +start.toFixed(2), dur, crop, note };
  writeFileSync(`${RAW}/clips.json`, JSON.stringify(clips, null, 1));
  console.log(`  clip ${name}: ${start.toFixed(1)}s +${dur}s`);
}
/** The window of `dur` seconds with the biggest score gain. samples: [{t, score}] */
function bestWindow(samples, dur, fallback) {
  let best = { gain: -1, t: fallback };
  for (const a of samples) {
    const b = samples.filter((s) => s.t <= a.t + dur).at(-1);
    if (!b || b.t - a.t < dur - 0.6) continue;
    if ((b.lives ?? 0) < (a.lives ?? 0)) continue; // a hit was taken in this window
    if (b.score - a.score > best.gain) best = { gain: b.score - a.score, t: a.t };
  }
  return best;
}

// ---------------------------------------------------------------- wardrobe
// The five free starter class sets in My look > Full sets, in storyboard order.
// Each class's headwear comes with its matching free hairstyle, so both are worn.
const LOOKS = {
  mage: { set: "Lantern Mage", hair: "Silver messy hair & beard" },
  pirate: { set: "Coral Pirate", hair: "Cherry flowing hair" },
  thief: { set: "Velvet Thief", hair: "Midnight twin buns" },
  warrior: { set: "Dawn Warrior", hair: "Sky spiky cut" },
  archer: { set: "Orchard Archer", hair: "Golden ponytail & hood" },
};
const HERO = LOOKS.pirate; // the avatar in the emote, plaza and game clips
const openDetails = (page) => page.evaluate(() => document.querySelectorAll("#modal-body details").forEach((d) => (d.open = true)));
async function wardrobeView(page, section, filter = "All") {
  await jclick(page, `[data-wardrobe-filter="${filter}"]`);
  await page.waitForTimeout(250);
  await jclick(page, `[data-wardrobe-section="${section}"]`);
  await page.waitForTimeout(350);
}
/**
 * Clicks an item card by name. Free items equip; locked ones only preview.
 * Cards are never the "Get" buttons, so this cannot spend or buy anything.
 */
async function tryOn(page, name, wait = 700) {
  const ok = await page.evaluate((n) => {
    const b = [...document.querySelectorAll(".try-item")].find((b) => b.querySelector("strong")?.textContent === n);
    if (!b) return false;
    b.click();
    return true;
  }, name);
  await page.waitForTimeout(wait);
  return ok;
}
/** Wears a free class set and its hairstyle, with an optional free magic effect. */
async function wearLook(page, look, magic = "Keep it simple") {
  await wardrobeView(page, "Full sets", "Free");
  if (!(await tryOn(page, look.set))) console.log("  missing set:", look.set);
  await wardrobeView(page, "Hair", "Free");
  if (!(await tryOn(page, look.hair))) console.log("  missing hair:", look.hair);
  await wardrobeView(page, "Magic", "Free");
  await tryOn(page, magic, 500);
  await wardrobeView(page, "Full sets", "Free");
}

// ---------------------------------------------------------------- plaza camera
const viewport = (page) => page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
async function drag(page, dx, dy) {
  const { width, height } = await viewport(page);
  const x = width / 2, y = height * 0.42;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(120);
}
async function zoomTo(page, target) {
  const { width, height } = await viewport(page);
  await page.mouse.move(width / 2, height * 0.42);
  for (let i = 0; i < 40; i++) {
    const z = Number((await world(page)).zoom);
    if (Math.abs(z - target) < 0.3) break;
    await page.mouse.wheel(0, z > target ? -100 : 100);
    await page.waitForTimeout(60);
  }
}
async function pitchTo(page, target) {
  for (let i = 0; i < 12; i++) {
    const p = Number((await world(page)).orbit.split(",")[1]);
    if (Math.abs(p - target) < 0.04) break;
    const before = p;
    await drag(page, 0, p > target ? -40 : 40);
    const after = Number((await world(page)).orbit.split(",")[1]);
    if (i === 0 && Math.abs(after - target) > Math.abs(before - target)) await drag(page, 0, p > target ? 80 : -80);
  }
}
async function walk(page, k, ms) {
  await page.keyboard.down(k);
  await page.waitForTimeout(ms);
  await page.keyboard.up(k);
}
const position = async (page) => (await world(page)).position.split(",").map(Number);
/** Walks to (x, z) with the camera at its default heading: W/S move along z, A/D along x. */
async function goTo(page, x, z, tolerance = 0.35) {
  for (const axis of [1, 0, 1]) {
    const target = axis ? z : x;
    const start = Date.now();
    let p = (await position(page))[axis];
    if (Math.abs(p - target) < tolerance) continue;
    const k = axis ? (target < p ? "w" : "s") : target < p ? "a" : "d";
    const sign = Math.sign(target - p);
    await page.keyboard.down(k);
    while (Date.now() - start < 6000) {
      p = (await position(page))[axis];
      if ((target - p) * sign < tolerance * 0.5) break;
      await page.waitForTimeout(30);
    }
    await page.keyboard.up(k);
    await page.waitForTimeout(150);
  }
}
const emote = async (page, id) => {
  await page.evaluate((id) => {
    const b = document.createElement("button");
    b.dataset.emote = id;
    b.hidden = true;
    document.querySelector("#app").append(b);
    b.click();
    b.remove();
  }, id);
};
async function orbitTo(page, target) {
  for (let i = 0; i < 10; i++) {
    const a = Number((await world(page)).orbit.split(",")[0]);
    let err = target - a;
    while (err > Math.PI) err -= 2 * Math.PI;
    while (err < -Math.PI) err += 2 * Math.PI;
    if (Math.abs(err) < 0.06) break;
    // Dragging right by 1px turns the camera by about -0.006 rad.
    await drag(page, Math.max(-170, Math.min(170, -err / 0.006)), 0);
  }
}
/**
 * Walks from the spawn point into the open plaza (walls there push the camera
 * overhead), then swings the camera round to the avatar's front.
 */
async function faceCamera(page, { zoom = 3.0, pitch = 0.24 } = {}) {
  await zoomTo(page, 7);
  await walk(page, "w", 2600);
  await walk(page, "a", 700);
  await walk(page, "w", 150);
  await orbitTo(page, Math.PI);
  await zoomTo(page, zoom);
  await pitchTo(page, pitch);
  await page.waitForTimeout(600);
}

// ---------------------------------------------------------------- game bots
/** In-page helpers that read the game's own 2D canvas. Coordinates are the canvas's 440 grid. */
const BOT_LIB = () => {
  const near = (d, i, r, g, b, tol = 26) => Math.abs(d[i] - r) < tol && Math.abs(d[i + 1] - g) < tol && Math.abs(d[i + 2] - b) < tol;
  const press = (k) => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { key: k, bubbles: true })), 40);
  };
  const B = (window.__bot = { stop: false, near, press });
  const arcade = () => document.querySelector(".game-screen canvas");
  const pixels = (c) => c.getContext("2d").getImageData(0, 0, c.width, c.height).data;

  B.hop = () => {
    const step = () => {
      if (B.stop) return;
      const c = arcade();
      if (!c) return requestAnimationFrame(step);
      const d = pixels(c);
      let jump = false;
      for (let x = 98; x <= 124; x += 2) {
        if (near(d, (320 * 440 + x) * 4, 220, 170, 115) || near(d, (346 * 440 + x) * 4, 24, 45, 65, 14)) jump = true;
      }
      if (jump) press(" ");
      requestAnimationFrame(step);
    };
    step();
  };

  B.noodle = () => {
    const DIRS = [["arrowup", 0, -1], ["arrowright", 1, 0], ["arrowdown", 0, 1], ["arrowleft", -1, 0]];
    let lastHead = "", lastKey = "";
    const step = () => {
      if (B.stop) return;
      const c = arcade();
      if (!c) return requestAnimationFrame(step);
      const d = pixels(c);
      const cell = (x, y, r, g, b) => near(d, ((y * 22 + 15) * 440 + x * 22 + 11) * 4, r, g, b, 18);
      let head = null, food = null;
      const body = new Set();
      for (let y = 0; y < 20; y++)
        for (let x = 0; x < 20; x++) {
          if (cell(x, y, 0xdc, 0xff, 0xa3)) head = [x, y];
          else if (cell(x, y, 0xab, 0xd3, 0x77)) body.add(x + "," + y);
          else if (cell(x, y, 0xf2, 0xbd, 0x88)) food = [x, y];
        }
      if (head && head.join() !== lastHead) {
        lastHead = head.join();
        const free = (x, y) => x >= 0 && y >= 0 && x < 20 && y < 20 && !body.has(x + "," + y);
        let pick = null;
        if (food) {
          // Breadth-first search from the food back to the head.
          const dist = new Map([[food.join(), 0]]);
          const queue = [food];
          while (queue.length) {
            const [x, y] = queue.shift();
            for (const [, dx, dy] of DIRS) {
              const k = x + dx + "," + (y + dy);
              if (free(x + dx, y + dy) && !dist.has(k)) dist.set(k, dist.get(x + "," + y) + 1), queue.push([x + dx, y + dy]);
            }
          }
          let best = 1e9;
          for (const [k, dx, dy] of DIRS) {
            const n = dist.get(head[0] + dx + "," + (head[1] + dy));
            if (n !== undefined && free(head[0] + dx, head[1] + dy) && n < best) (best = n), (pick = k);
          }
        }
        if (!pick) pick = DIRS.find(([, dx, dy]) => free(head[0] + dx, head[1] + dy))?.[0];
        if (pick && pick !== lastKey) press(pick), (lastKey = pick);
        else if (pick) lastKey = pick;
      }
      requestAnimationFrame(step);
    };
    press("arrowright");
    step();
  };

  /** Brick Bash: where the ball is, in client pixels. */
  B.ball = () => {
    const c = arcade();
    if (!c) return null;
    const d = pixels(c), r = c.getBoundingClientRect();
    let sx = 0, sy = 0, n = 0;
    for (let y = 40; y < 430; y += 2)
      for (let x = 0; x < 440; x += 2)
        if (near(d, (y * 440 + x) * 4, 0xff, 0xda, 0xb0, 10)) (sx += x), (sy += y), n++;
    if (!n) return { x: r.left + r.width / 2, y: r.top + r.height * 0.9, found: false };
    return { x: r.left + (sx / n / 440) * r.width, y: r.top + r.height * 0.9, found: true };
  };

  /** Star Swarm: sit under the lowest enemy, sidestep enemy shots. Client pixels. */
  B.ship = () => {
    const c = arcade();
    if (!c) return null;
    const d = pixels(c), r = c.getBoundingClientRect();
    let target = null, low = -1;
    const danger = [];
    for (let y = 30; y < 420; y += 3)
      for (let x = 4; x < 436; x += 3) {
        const i = (y * 440 + x) * 4;
        if ((near(d, i, 0xe6, 0xaa, 0x93, 12) || near(d, i, 0xb8, 0x9c, 0xcf, 12)) && y > low && y < 330) (low = y), (target = x);
        else if (near(d, i, 0xef, 0x9f, 0x95, 14) && y > 215) danger.push(x);
        if ((near(d, i, 0xe6, 0xaa, 0x93, 12) || near(d, i, 0xb8, 0x9c, 0xcf, 12)) && y >= 330) danger.push(x); // an enemy about to ram
      }
    let x = target ?? 220;
    // Step clear of anything coming down the ship's column; staying alive beats lining up a shot.
    for (let pass = 0; pass < 3; pass++) for (const dx of danger) if (Math.abs(dx - x) < 34) x += dx > x ? -52 : 52;
    x = Math.max(24, Math.min(416, x));
    return { x: r.left + (x / 440) * r.width, y: r.top + (385 / 440) * r.height };
  };

  B.hoops = () => {
    const step = () => {
      if (B.stop) return;
      const root = document.querySelector(".outdoor-game");
      const zone = document.querySelector(".shot-zone"), marker = document.querySelector(".shot-marker");
      if (root && zone && marker && root.dataset.status === "playing" && root.dataset.flight !== "true") {
        const z0 = parseFloat(zone.style.left), w = parseFloat(zone.style.width), m = parseFloat(marker.style.left);
        if (m > z0 + w * 0.3 && m < z0 + w * 0.7 && Date.now() - (B.lastShot || 0) > 900) (B.lastShot = Date.now()), press(" ");
      }
      requestAnimationFrame(step);
    };
    step();
  };

  B.fishing = () => {
    let holding = false;
    const set = (down) => {
      if (down === holding) return;
      holding = down;
      window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: " ", bubbles: true, cancelable: true }));
    };
    let wait = 0;
    const step = () => {
      if (B.stop) return set(false);
      const root = document.querySelector(".outdoor-game");
      if (root && root.dataset.status === "playing") {
        const s = root.dataset.state;
        const tension = parseFloat(document.querySelector("#reel-tension")?.style.width) || 0;
        if (wait > 0) wait--, set(false);
        else if (s === "idle" || s === "lost" || s === "landed") {
          if (holding) set(false), (wait = 4);
          else set(true), (wait = 6), setTimeout(() => set(false), 60);
        } else if (s === "bite") {
          if (holding) set(false);
          else set(true);
        } else if (s === "reeling") set(root.dataset.surging !== "true" && tension < 78);
        else set(false);
      }
      requestAnimationFrame(step);
    };
    step();
  };

  B.stage = () => {
    const COL = [[0xff, 0x8f, 0xb8], [0x7f, 0xe3, 0xe0], [0xff, 0xe2, 0x7a], [0xb9, 0xa4, 0xff]];
    const KEYS = ["arrowleft", "arrowdown", "arrowup", "arrowright"];
    const was = [false, false, false, false];
    const step = () => {
      if (B.stop) return;
      const c = document.querySelector(".stage-notes");
      if (c) {
        const d = c.getContext("2d").getImageData(0, 0, 360, 220).data;
        for (let lane = 0; lane < 4; lane++) {
          const on = near(d, (201 * 360 + lane * 90 + 30) * 4, ...COL[lane], 30) && d[(201 * 360 + lane * 90 + 30) * 4 + 3] > 200;
          if (on && !was[lane]) press(KEYS[lane]);
          was[lane] = on;
        }
      }
      requestAnimationFrame(step);
    };
    step();
  };
};
const startBot = async (page, name) => {
  await page.evaluate(BOT_LIB);
  if (name) await page.evaluate((n) => window.__bot[n](), name);
};
const stopBot = (page) => page.evaluate(() => window.__bot && (window.__bot.stop = true)).catch(() => {});
const score = (page) =>
  page.evaluate(() => Number((document.querySelector("#run-score, #stage-score")?.textContent || "0").replace(/[^\d.]/g, "")) || 0);

/** Opens a game from the Games panel, paging until its card shows. */
async function openGame(page, id) {
  await openPanel(page, "arcade");
  for (let i = 0; i < 5; i++) {
    if (await jclick(page, `.game-card[data-game="${id}"]`)) break;
    if (!(await jclick(page, '[data-page=games][data-page-index="1"]:not([disabled])'))) throw new Error(`no game card for ${id}`);
    await page.waitForTimeout(500);
  }
  // Some builds start the round as soon as the cabinet is ready; others show a start button.
  await page.waitForSelector("#game-mount canvas", { timeout: 40000, state: "attached" });
  await page.waitForFunction(() => !document.querySelector("#start-game[disabled]"), null, { timeout: 40000 });
  await page.waitForTimeout(150);
}
/** Samples the score a few times a second for `ms`, calling tick() each time. */
async function watchScore(s, ms, tick, still = "") {
  const samples = [];
  const end = Date.now() + ms;
  const stillAt = Date.now() + ms * 0.2;
  while (Date.now() < end) {
    // The still is taken right after a score change, mid-run.
    if (still && Date.now() > stillAt && samples.length > 1 && samples.at(-1).score > samples.at(-2).score) {
      await shot(s.page, still);
      still = "";
    }
    samples.push({ t: s.now(), score: await score(s.page), lives: await s.page.evaluate(() => (document.querySelector("#run-state")?.textContent.match(/\u2665/g) || []).length) });
    if (tick && (await tick()) === false) break;
    await s.page.waitForTimeout(tick ? 30 : 250);
  }
  return samples;
}
async function arcadeShot(name, id, bot, { ms = 30000, dur = 5, mouse = "" } = {}) {
  const s = await session("phone", { video: true });
  const { page } = s;
  await s.record(name);
  await openGame(page, id);
  await jclick(page, "#start-game");
  await page.waitForTimeout(600);
  await startBot(page, bot);
  const go = s.mark("go");
  let samples;
  if (mouse) {
    const first = await page.evaluate((m) => window.__bot[m](), mouse);
    await page.mouse.move(first.x, first.y);
    await page.mouse.down();
    samples = await watchScore(s, ms, async () => {
      const p = await page.evaluate((m) => window.__bot[m](), mouse).catch(() => null);
      if (!p) return false;
      await page.mouse.move(p.x, p.y, { steps: 2 });
    }, `${name}-still`);
    await page.mouse.up();
  } else samples = await watchScore(s, ms, null, `${name}-still`);
  await stopBot(page);
  const final = samples.at(-1)?.score;
  await closeModal(page);
  await s.end();
  const best = bestWindow(samples, dur, go + 2);
  console.log(`  ${name}: final score ${final}, best ${dur}s window +${best.gain}`);
  trim(name, best.t, dur, { note: `score +${best.gain} in window, ${final} at end of take` });
}

async function plazaTake(kind, name) {
  const friends = await openFriends();
  const s = await session(kind, { video: true });
  const { page } = s;
  try {
    if (kind === "desktop") await shot(page, "plaza-desktop-ui");
    await cleanHud(page);
    await zoomTo(page, 7);
    await goTo(page, 0.4, 0.2);
    await orbitTo(page, 0.14);
    await zoomTo(page, kind === "desktop" ? 5.6 : 5.0);
    await pitchTo(page, 0.27);
    await walk(page, "s", 120);
    await page.waitForTimeout(700);
    console.log("  sees", (await world(page)).sharedPlayers, "shared players; at", (await position(page)).join(","));
    await s.record(name);
    await page.waitForTimeout(300);
    s.mark("walk");
    await page.keyboard.down("s");
    for (let i = 0; i < 60 && (await position(page))[1] < 7.0; i++) {
      if (i === 10) for (const f of friends) emote(f.page, "wave");
      await page.waitForTimeout(40);
    }
    await page.keyboard.up("s");
    await page.waitForTimeout(150);
    await shot(page, `${name}-1`);
    s.mark("emote");
    await emote(page, "cheer");
    for (const f of friends) await emote(f.page, "cheer");
    await page.waitForTimeout(1000);
    await shot(page, `${name}-2`);
    await page.waitForTimeout(1500);
    s.mark("dance");
    await emote(page, "jump");
    for (const f of friends) await emote(f.page, "dance");
    await page.waitForTimeout(1100);
    await shot(page, `${name}-3`);
    await page.waitForTimeout(1700);
    await s.end();
  } finally {
    await closeFriends(friends);
  }
  trim(name, s.marks.walk - 0.1, 4.6, { note: "walking toward the camera past three helper avatars (the script's own guests), pet following, then a group cheer" });
  trim(`${name}-cheer`, s.marks.emote - 0.2, 2.8, { src: name, note: "group cheer in the plaza with the helper avatars" });
  trim(`${name}-party`, s.marks.dance - 0.2, 2.8, { src: name, note: "jump while the helper avatars dance" });
}

// ---------------------------------------------------------------- shots
const SHOTS = {
  /** My look with each free class set worn, and the same look posed in the plaza. */
  async looks() {
    const s = await session("phone");
    const { page } = s;
    await faceCamera(page, { zoom: 3.4, pitch: 0.24 });
    for (const [name, look] of Object.entries(LOOKS)) {
      await cleanHud(page, false);
      await openPanel(page, "wardrobe");
      await wearLook(page, look);
      await scrollModalTop(page);
      await shot(page, `avatar-create-${name}`);
      await closeModal(page);
      await cleanHud(page);
      await page.waitForTimeout(1800);
      await shot(page, `look-${name}`);
      await emote(page, "cheer");
      await page.waitForTimeout(900);
      await shot(page, `look-${name}-pose`);
      await page.waitForTimeout(1800);
    }
    await cleanHud(page, false);
    await openPanel(page, "wardrobe");
    await wearLook(page, HERO, "Orbiting stars"); // the look the emote, plaza and game clips use
    await closeModal(page);
    await s.end();
  },

  /** My look: the five class sets, then hats and pets, then premium set previews. */
  async wardrobe() {
    const s = await session("phone", { video: true });
    const { page } = s;
    await s.record("wardrobe");
    await openPanel(page, "wardrobe");
    await wardrobeView(page, "Full sets", "Free");
    await scrollModalTop(page);
    await page.waitForTimeout(900);
    const flip = async (section, names, filter = "All", still = "", wait = 620) => {
      await wardrobeView(page, section, filter);
      await scrollModalTop(page);
      for (const n of names) {
        await tryOn(page, n, wait);
        await scrollModalTop(page);
      }
      if (still) await shot(page, still);
    };
    s.mark("classes");
    for (const look of Object.values(LOOKS)) {
      await wardrobeView(page, "Full sets", "Free");
      await tryOn(page, look.set, 250);
      await wardrobeView(page, "Hair", "Free");
      await tryOn(page, look.hair, 150);
      await wardrobeView(page, "Full sets", "Free");
      await scrollModalTop(page);
      s.mark("class-" + look.set.split(" ")[1].toLowerCase());
      await page.waitForTimeout(750);
    }
    await shot(page, "wardrobe-classes");
    s.mark("items");
    await flip("Hats", ["Knight helmet", "Bear hat", "Wizard hat"], "Free", "wardrobe-hats");
    await flip("Pets", ["Mochi the cat", "Luna the owl", "Mango the shiba", "Bean the dragon"], "Free", "wardrobe-pets");
    await flip("Magic", ["Firefly friends", "Orbiting stars", "Moon halo"], "Free", "wardrobe-magic");
    s.mark("sets");
    await flip("Full sets", ["Storm Ronin", "Sakura Kitsune", "Galaxy Idol", "Dream Witch", "Phoenix Ascendant"], "All", "wardrobe-sets", 700);
    await page.waitForTimeout(500);
    s.mark("end");
    await jclick(page, "[data-reset-look]");
    await page.waitForTimeout(400);
    await wearLook(page, HERO, "Orbiting stars");
    await closeModal(page);
    await s.end();
    console.log("  class looks settle at", ["mage", "pirate", "thief", "warrior", "archer"].map((k) => (s.marks["class-" + k] - s.marks.classes).toFixed(2)).join(", "), "s into wardrobe-classes");
    trim("wardrobe-classes", s.marks.classes, Math.min(12, s.marks.items - s.marks.classes), { src: "wardrobe", note: "the five free class sets worn one after another: Mage, Pirate, Thief, Warrior, Archer" });
    trim("wardrobe", s.marks.items + 0.3, 5.5, { note: "hats, pets and magic swapping in My look" });
    trim("wardrobe-sets", s.marks.sets + 0.7, Math.min(4.2, s.marks.end - s.marks.sets - 0.9), { src: "wardrobe", note: "premium set previews (try-on only, nothing bought)" });
  },

  /** Front close-up of each emote, HUD hidden. The avatar is turned back to the camera before every take. */
  async emote() {
    const s = await session("phone", { video: true });
    const { page } = s;
    await faceCamera(page, { zoom: 3.6, pitch: 0.24 });
    await cleanHud(page);
    await page.waitForTimeout(800);
    await s.record("emote");
    const ids = ["cheer", "victory", "jump", "wave", "dance"];
    for (const id of ids) {
      await page.keyboard.press("s", { delay: 90 }); // step toward the camera, which is on the far side after faceCamera
      await page.waitForTimeout(900);
      s.mark(id);
      await emote(page, id);
      await page.waitForTimeout(900);
      if (id === "cheer") await shot(page, "emote-still");
      await page.waitForTimeout(1900);
    }
    await s.end();
    for (const id of ids) trim(id === "cheer" ? "emote" : `emote-${id}`, s.marks[id] - 0.25, 2.9, { src: "emote", note: `front close-up, "${id}" emote, Pirate set` });
  },

  /** Phone: walking toward the camera through the plaza past three helper avatars, then everyone emotes together. */
  plaza: () => plazaTake("phone", "plaza"),
  /** Desktop framing (1920×1080) of the same take, for the landscape cut. */
  desktop: () => plazaTake("desktop", "plaza-desktop"),

  async "coast-rush"() {
    const s = await session("phone", { video: true });
    const { page } = s;
    await s.record("coast-rush");
    await openGame(page, "coast");
    await jclick(page, "#start-game");
    const turbo = [];
    let racing = 0;
    await driveCoast(page, {
      ms: 45000,
      onTick: (d) => {
        if (d.status === "racing" && !racing) racing = s.now();
        if (/turbo|boost/i.test(d.notice) && (!turbo.length || s.now() - turbo.at(-1) > 3)) turbo.push(s.now());
      },
    });
    await shot(page, "coast-rush-still");
    await closeModal(page);
    await s.end();
    const t = turbo.find((t) => t > racing + 4) ?? racing + 6;
    console.log("  coast: racing from", racing.toFixed(1), "turbo at", turbo.map((t) => t.toFixed(1)).join(","));
    trim("coast-rush", t - 2.5, 5.5, { note: "Coast Rush kart race, drifting through a bend" });
  },
  "noodle-run": () => arcadeShot("noodle-run", "noodle", "noodle", { ms: 32000 }),
  "hop-hop": () => arcadeShot("hop-hop", "hop", "hop", { ms: 26000 }),
  "brick-bash": () => arcadeShot("brick-bash", "brick", "", { ms: 30000, mouse: "ball" }),
  "star-swarm": () => arcadeShot("star-swarm", "swarm", "", { ms: 48000, mouse: "ship", dur: 4 }),

  async hoops() {
    const s = await session("phone", { video: true });
    const { page } = s;
    await s.record("hoops");
    await openGame(page, "hoops");
    await jclick(page, "#start-game");
    await startBot(page, "hoops");
    const samples = await watchScore(s, 26000, null, "hoops-still");
    await stopBot(page);
    await closeModal(page);
    await s.end();
    const best = bestWindow(samples, 5, samples[0].t + 3);
    trim("hoops", best.t, 5, { note: `Hoops, score +${best.gain} in window` });
  },
  async fishing() {
    const s = await session("phone", { video: true });
    const { page } = s;
    await s.record("fishing");
    await openGame(page, "fishing");
    await jclick(page, "#start-game");
    await startBot(page, "fishing");
    let landed = 0;
    const samples = await watchScore(s, 40000, async () => {
      const st = await page.evaluate(() => document.querySelector(".outdoor-game")?.dataset.state);
      if (st === "landed" && !landed) landed = s.now();
      await page.waitForTimeout(120);
    });
    await stopBot(page);
    await shot(page, "fishing-still");
    await closeModal(page);
    await s.end();
    console.log("  fishing: final", samples.at(-1)?.score, "first catch at", landed.toFixed(1));
    trim("fishing", (landed || samples[0].t + 8) - 4.5, 5.5, { note: "Fishing: reeling in, then the catch" });
  },
  async "open-stage"() {
    const s = await session("phone", { video: true });
    const { page } = s;
    await s.record("open-stage");
    await openPanel(page, "stage", 2500);
    await page.waitForSelector("#stage-mode", { state: "attached", timeout: 15000 });
    await page.evaluate(() => { const m = document.querySelector("#stage-mode"); m.value = "show"; m.dispatchEvent(new Event("change", { bubbles: true })); });
    await page.waitForTimeout(600);
    console.log("  stage mode:", await page.evaluate(() => document.querySelector("#stage-mode").value + " / " + document.querySelector("#stage-start").textContent));
    await startBot(page, "stage");
    await jclick(page, "#stage-start");
    const samples = await watchScore(s, 34000, null, "open-stage-still");
    await stopBot(page);
    await closeModal(page);
    await s.end();
    const best = bestWindow(samples, 5, samples[0].t + 6);
    trim("open-stage", best.t, 5, { note: `Open Stage rhythm show, score +${best.gain} in window` });
  },

  /** Quests, rankings, and a level-up: claim a finished quest, then play Hoops until the level turns over. */
  async progress() {
    const s = await session("phone", { video: true });
    const { page } = s;
    await s.record("progress");
    const levelUp = () => page.evaluate(() => { const e = document.querySelector(".token-reveal"); return !!e && e.getBoundingClientRect().width > 0; });
    await openPanel(page, "quests");
    await shot(page, "quests");
    let up = 0, filmed = false;
    for (let i = 0; i < 4 && !up; i++) {
      if (!(await jclick(page, "[data-claim]:not([disabled])"))) break;
      await page.waitForTimeout(700);
      if (await levelUp()) {
        up = s.mark("levelup");
        await page.waitForTimeout(900);
        await shot(page, "levelup");
        filmed = true;
        await page.waitForTimeout(2600);
      }
    }
    await openPanel(page, "board");
    await page.selectOption("#board-period", { index: 1 }).catch(() => {});
    await page.waitForTimeout(800);
    await shot(page, "rankings");
    await closeModal(page);
    for (let round = 0; round < 7 && !up; round++) {
      await openGame(page, "hoops");
      await jclick(page, "#start-game");
      await startBot(page, "hoops");
      const end = Date.now() + 75000;
      while (Date.now() < end) {
        if (await levelUp()) {
          up = s.mark("levelup");
          break;
        }
        const done = await page.evaluate(() => !document.querySelector(".outdoor-game") && !!document.querySelector("[data-replay]"));
        if (done) {
          await page.waitForTimeout(2500);
          if (await levelUp()) up = s.mark("levelup");
          break;
        }
        await page.waitForTimeout(200);
      }
      await stopBot(page);
      if (!up) await shot(page, "result-screen");
      if (!up) await closeModal(page);
    }
    if (up && !filmed) {
      await page.waitForTimeout(900);
      await shot(page, "levelup");
      await page.waitForTimeout(2500);
    } else if (!up) console.log("  no level-up seen");
    await s.end();
    if (up) trim("levelup", up - 0.8, 4, { src: "progress", note: "Level up panel with Style token reward" });
  },

  /** The logo, cropped from the top bar. */
  async logo() {
    const s = await session("phone");
    // The wordmark hides once the welcome card is gone, so a copy of the same
    // element is laid over a plain card and photographed.
    const box = await s.page.evaluate(() => {
      const back = document.createElement("div");
      back.style.cssText = "position:fixed;inset:0;z-index:99998;background:#fff7e8";
      const bar = document.createElement("header");
      bar.className = "topbar";
      bar.style.cssText = "position:fixed;left:14px;top:60px;z-index:99999;display:block!important;width:auto;padding:0;background:none";
      const brand = document.querySelector(".brand").cloneNode(true);
      brand.style.cssText = "display:inline-flex!important;visibility:visible!important;opacity:1!important;zoom:2";
      bar.append(brand);
      document.body.append(back, bar);
      const r = brand.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    const svg = await s.page.evaluate(() => fetch("/favicon.svg").then((r) => (r.ok ? r.text() : "")));
    if (svg.includes("<svg")) writeFileSync(`${ASSETS}/logo-mark.svg`, svg);
    await shot(s.page, "logo", { clip: { x: box.x - 6, y: box.y - 6, width: box.width + 12, height: box.height + 12 } });
    await s.end();
  },
};

// ---------------------------------------------------------------- main
const args = process.argv.slice(2);
if (args.includes("--list")) {
  console.log(Object.keys(SHOTS).join("\n"));
  process.exit(0);
}
// --retrim: cut every clip again from raw/ using raw/clips.json (edit start/dur there first).
if (args.includes("--retrim")) {
  const only = args.filter((a) => !a.startsWith("--"));
  for (const [name, c] of Object.entries({ ...clips })) if (!only.length || only.includes(name)) trim(name, c.start, c.dur, c);
  process.exit(0);
}
const wanted = args.length ? args : Object.keys(SHOTS);
for (const name of wanted) {
  if (!SHOTS[name]) {
    console.log("unknown shot:", name);
    continue;
  }
  console.log("==", name);
  try {
    await SHOTS[name]();
  } catch (e) {
    console.log(`  FAILED ${name}: ${e.message.split("\n")[0]}`);
    await current?.page.screenshot({ path: `${RAW}/failed-${name}.png` }).catch(() => {});
    await current?.end().catch(() => {});
  }
}
for (const b of Object.values(browsers)) await b.close();
