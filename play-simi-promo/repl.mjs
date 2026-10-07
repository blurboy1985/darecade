// Throwaway: keeps one guest browser open and runs snippets dropped in explore/cmd/*.js.
// Usage: node repl.mjs phone|desktop
import { chromium } from "playwright";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { GPU_ARGS, dump } from "./explore.mjs";

const mode = process.argv[2] || "phone";
const STATE = "guest-state.json";
mkdirSync("explore/cmd", { recursive: true });
const browser = await chromium.launch({ args: GPU_ARGS });
const ctx = await browser.newContext({
  ...(mode === "phone"
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
    : { viewport: { width: 1920, height: 1080 } }),
  ...(existsSync(STATE) ? { storageState: STATE } : {}),
});
const page = await ctx.newPage();
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text().slice(0, 300)}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.goto("https://playsimi.danielquek.com", { waitUntil: "networkidle", timeout: 90000 }).catch(() => {});
writeFileSync("explore/cmd/ready.out", "ready\n");
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
for (;;) {
  const files = readdirSync("explore/cmd").filter((f) => f.endsWith(".js")).sort();
  for (const f of files) {
    const src = readFileSync(`explore/cmd/${f}`, "utf8");
    let out = "";
    const log = (...a) => (out += a.map((x) => (typeof x === "string" ? x : JSON.stringify(x, null, 1))).join(" ") + "\n");
    try {
      if (src.trim() === "quit") {
        await ctx.storageState({ path: STATE });
        await browser.close();
        process.exit(0);
      }
      await new AsyncFunction("page", "ctx", "dump", "log", "logs", "STATE", src)(page, ctx, dump, log, logs, STATE);
    } catch (e) {
      out += `ERROR ${e.stack}\n`;
    }
    writeFileSync(`explore/cmd/${f}.out`, out);
    renameSync(`explore/cmd/${f}`, `explore/cmd/${f}.done`);
  }
  await new Promise((r) => setTimeout(r, 200));
}
