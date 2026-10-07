// Throwaway explorer: loads the live game as a guest and dumps what is on screen.
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const URL = "https://playsimi.danielquek.com";
const OUT = "explore";
mkdirSync(OUT, { recursive: true });

export const GPU_ARGS = [
  "--use-angle=d3d11",
  "--enable-gpu",
  "--ignore-gpu-blocklist",
  "--enable-webgl",
  "--autoplay-policy=no-user-gesture-required",
  "--mute-audio",
];

export async function dump(page, label) {
  const info = await page.evaluate(() => {
    const vis = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
    };
    const els = [...document.querySelectorAll("button, a, [role=button], input, select, [data-open], [data-action]")]
      .filter(vis)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const attrs = [...el.attributes]
          .filter((a) => a.name === "id" || a.name.startsWith("data-") || a.name === "class" || a.name === "aria-label")
          .map((a) => `${a.name}=${a.value}`)
          .join(" ");
        return `${el.tagName.toLowerCase()} [${attrs}] "${(el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 60)}" @${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
      });
    const heads = [...document.querySelectorAll("h1,h2,h3")].filter(vis).map((h) => h.textContent.trim());
    const canvases = [...document.querySelectorAll("canvas")].map((c) => `${c.id || c.className} ${c.width}x${c.height} ${JSON.stringify({ ...c.dataset })}`);
    return { heads, els, canvases };
  });
  writeFileSync(`${OUT}/${label}.txt`, `HEADS\n${info.heads.join("\n")}\n\nCANVAS\n${info.canvases.join("\n")}\n\nELS\n${info.els.join("\n")}\n`);
  await page.screenshot({ path: `${OUT}/${label}.png` });
  return info;
}

if (process.argv[1].endsWith("explore.mjs")) {
  const browser = await chromium.launch({ args: GPU_ARGS });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  page.on("console", (m) => m.type() === "error" && console.log("console.error:", m.text().slice(0, 200)));
  await page.goto(URL, { waitUntil: "networkidle", timeout: 90000 }).catch((e) => console.log("goto:", e.message));
  await page.waitForTimeout(4000);
  const a = await dump(page, "01-landing");
  console.log(a.heads, a.els.join("\n"), a.canvases);
  const gl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    const g = c.getContext("webgl2") || c.getContext("webgl");
    if (!g) return "no webgl";
    const e = g.getExtension("WEBGL_debug_renderer_info");
    return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : "webgl ok";
  });
  console.log("GL:", gl);
  await browser.close();
}
