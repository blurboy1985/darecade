// Renders promo.html to MP4 (H.264 + AAC, 30 fps), frame by frame.
//
//   node render.mjs                 all three: 30s vertical, 30s landscape, 15s vertical
//   node render.mjs vertical        only promo-30s-vertical.mp4   (also: landscape, short)
//   node render.mjs story           story.html, the 60-second animated story (also: story-vertical)
//   node render.mjs --stills        instead of video, save one frame every 2.5 s to review/<name>/
//   node render.mjs vertical --stills --at=0.4,13.2   save exact moments instead
//
// The page is opened in its render mode (?render=1). Each frame is drawn on the
// page's fixed 30 fps clock after its video frames have been seeked, so the
// result is the same every run. The soundtrack is rendered by the page itself
// with an OfflineAudioContext and muxed in with ffmpeg.
import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";

const OUTPUTS = {
  vertical: { file: "promo-30s-vertical.mp4", query: "" },
  landscape: { file: "promo-30s-landscape.mp4", query: "&landscape=1" },
  short: { file: "promo-15s-vertical.mp4", query: "&cut=15" },
  story: { file: "story-60s-landscape.mp4", query: "", page: "story.html" },
  "story-vertical": { file: "story-60s-vertical.mp4", query: "&portrait=1", page: "story.html" },
};
const args = process.argv.slice(2);
const stills = args.includes("--stills");
const names = args.filter((a) => !a.startsWith("--"));
const jobs = (names.length ? names : Object.keys(OUTPUTS)).filter((n) => OUTPUTS[n]);

// A tiny static server: canvases cannot be read back from file:// pages.
const TYPES = { ".html": "text/html", ".mp4": "video/mp4", ".webm": "video/webm", ".png": "image/png", ".svg": "image/svg+xml", ".mp3": "audio/mpeg", ".js": "text/javascript", ".woff2": "font/woff2" };
const root = process.cwd();
const server = createServer((req, res) => {
  const path = normalize(join(root, decodeURIComponent(new URL(req.url, "http://x").pathname)));
  if (!path.startsWith(root) || !existsSync(path) || !statSync(path).isFile()) return res.writeHead(404).end();
  const size = statSync(path).size, type = TYPES[extname(path)] || "application/octet-stream";
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range || "");
  if (range) {
    const start = Number(range[1]), end = range[2] ? Number(range[2]) : size - 1;
    res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
    return createReadStream(path, { start, end }).pipe(res);
  }
  res.writeHead(200, { "Content-Type": type, "Content-Length": size, "Accept-Ranges": "bytes" });
  createReadStream(path).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

// PW_CHANNEL=chrome uses the installed Google Chrome instead of Playwright's Chromium.
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined, args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
for (const name of jobs) {
  const { file, query, page: html = "promo.html" } = OUTPUTS[name];
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => console.log("  page error:", e.message));
  await page.goto(`${base}/${html}?render=1${query}`);
  await page.evaluate(() => window.__promo.ready);
  const info = await page.evaluate(() => ({ frames: __promo.frames, fps: __promo.fps, size: __promo.size, missing: __promo.missing(), fonts: document.fonts.check('700 80px "Fredoka"') }));
  console.log(`${file}: ${info.frames} frames at ${info.size.join("×")}${info.missing.length ? `, missing assets: ${info.missing.join(", ")}` : ""}${info.fonts ? "" : ", web font not loaded (fallback font used)"}`);

  if (stills) {
    const dir = `review/${name}`;
    mkdirSync(dir, { recursive: true });
    const step = Math.round(2.5 * info.fps);
    const at = (args.find((x) => x.startsWith("--at=")) || "").slice(5); // --at=1.2,3.5 picks exact seconds
    const list = at ? at.split(",").map((t) => Math.round(Number(t) * info.fps)) : [];
    if (!at) for (let f = Math.round(info.fps * 0.6); f < info.frames; f += step) list.push(f);
    for (const [i, f] of list.entries()) {
      const jpg = await page.evaluate((f) => __promo.frame(f), f);
      writeFileSync(`${dir}/frame-${String(i).padStart(2, "0")}-${(f / info.fps).toFixed(1)}s.jpg`, Buffer.from(jpg, "base64"));
    }
    console.log(`  stills in ${dir}/`);
    await page.close();
    continue;
  }

  writeFileSync(`.render-${name}.wav`, Buffer.from(await page.evaluate(() => __promo.audio()), "base64"));
  const enc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y",
    "-f", "image2pipe", "-framerate", String(info.fps), "-c:v", "mjpeg", "-i", "pipe:0", "-i", `.render-${name}.wav`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p", "-r", String(info.fps),
    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", file], { stdio: ["pipe", "inherit", "inherit"] });
  const t0 = Date.now();
  for (let f = 0; f < info.frames; f++) {
    const jpg = await page.evaluate((f) => __promo.frame(f), f);
    if (!enc.stdin.write(Buffer.from(jpg, "base64"))) await once(enc.stdin, "drain");
    if (f % 150 === 0) console.log(`  frame ${f}/${info.frames}`);
  }
  enc.stdin.end();
  await once(enc, "close");
  spawnSync(process.platform === "win32" ? "cmd" : "rm", process.platform === "win32" ? ["/c", "del", `.render-${name}.wav`] : [`.render-${name}.wav`]);
  console.log(`  done in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  await page.close();
}
await browser.close();
server.close();
