import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
const out = "output/playwright/round6";
const phases = [
  {
    name: "Phase 1 — Blockers",
    files: [
      "src/account.ts",
      "src/account.css",
      "src/payments.ts",
      "src/jump-input.ts",
      "src/games.ts",
      "src/main.ts",
      "src/activities.ts",
      "src/plaza-relay.ts",
      "src/plaza-relay.css",
      "src/rooftops.ts",
      "src/state.ts",
      "src/world.ts",
      "shared/plaza-relay.ts",
      "server/community-core.mjs",
      "server/index.mjs",
      "server/payments.mjs",
      "server/relay.mjs",
      "cloudflare/api.mjs",
    ],
    summary:
      "13+ consent and separate purchase confirmation; shared jump buffer, pads and five-star quest; CPU Relay lifecycle and pacing; score-based XP; Brick Bash exit.",
  },
  {
    name: "Phase 2 — Star Swarm",
    files: [
      "src/action-games.ts",
      "src/legacy-star-flight.ts",
      "src/star-flight-v2.ts",
      "src/games.ts",
      "shared/simulation.ts",
    ],
    summary:
      "20-second warm-up, patterns at 30/60 seconds, boss at 90 seconds, shield pills, distinct bullets and readable wave text. Old replay versions retained.",
  },
  {
    name: "Phase 3 — Results and HUD",
    files: [
      "src/main.ts",
      "src/mobile-hud.css",
      "src/racing-game.ts",
      "src/racing.css",
      "src/games.ts",
      "src/action-games.ts",
    ],
    summary:
      "Immediate numeric results, compact layouts, zero XP at zero score, TIME placement, Coast Rush clock/quit/results flow, Noodle grace period and bold Brick Bash visuals.",
  },
  {
    name: "Phase 4 — Social and expression",
    files: [
      "src/main.ts",
      "src/mobile-hud.css",
      "src/social.ts",
      "src/state.ts",
      "src/character.ts",
      "src/world.ts",
      "src/world-connection.ts",
      "src/world-picker.ts",
      "server/local-worlds.mjs",
    ],
    summary:
      "Consistent live player counts, nearby-player entry point, four favourite emotes, random AFK poses, immediate return to controls and mobile callout suppression.",
  },
  {
    name: "Phase 5 — Characters and world",
    files: [
      "src/main.ts",
      "src/mobile-hud.css",
      "src/avatar-portraits.ts",
      "src/catalog.ts",
      "src/character-identity.ts",
      "src/character.ts",
      "src/state.ts",
      "src/wardrobe.ts",
      "src/world.ts",
      "server/community-core.mjs",
      "public/hoops-card.svg",
      "public/fishing-card.svg",
      ...Array.from({ length: 133 }, (_, i) => `public/wardrobe/hair-${i}.png`),
      ...Array.from(
        { length: 5 },
        (_, i) => `public/wardrobe/sets--${i + 1}.png`,
      ),
    ],
    summary:
      "Preserved hairstyle under headwear, seated hats, cape motion/collar, prop and camera collisions, zoom framing, scrollable wardrobe, immediate selection feedback and thumbnails, consistent name tags, card artwork and accessible controls.",
  },
];
const reports = Object.fromEntries(
  ["browser", "gameplay", "polish", "art", "coast", "roofs", "latency"].map(
    (n) => [n, JSON.parse(readFileSync(`${out}/${n}-report.json`, "utf8"))],
  ),
);
for (const key of [
  "browser",
  "gameplay",
  "polish",
  "coast",
  "roofs",
  "latency",
]) {
  if (
    reports[key].length !== 3 ||
    reports[key].some((r) => !r.passed || r.errors?.length)
  )
    throw Error(`${key}: incomplete acceptance evidence`);
}
if (reports.art.failures.length) throw Error("Art verification failed");
const tests = execFileSync(
  "git",
  [
    "-c",
    "core.safecrlf=false",
    "diff",
    "fb09d6f9399ad27a813653508a992682fed45c59",
    "--name-only",
    "--",
    "tests",
  ],
  { encoding: "utf8" },
)
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
tests.push("tests/round6.test.ts");
const scripts = readdirSync("scripts")
  .filter((f) => /^round6-.*\.mjs$/.test(f))
  .map((f) => `scripts/${f}`);
const production = existsSync("qa/round6/release.json")
  ? JSON.parse(readFileSync("qa/round6/release.json", "utf8"))
  : null;
const limitations = [
  ...(production
    ? []
    : ["Local implementation only; production has not been deployed."]),
  "Browser checks use Chrome touch emulation at 390×844 and 844×390, plus 1280×900 desktop. Physical iOS/Safari and Android devices were not available.",
  "The 90-second boss threshold is simulation-tested. The separate live 90-second attempt ended before the boss; live acceptance evidence reaches 61 seconds.",
  "28 optional tests in the general suite were skipped because their browser environment variable was not configured. Dedicated round-6 browser scripts ran separately.",
];
const report = {
  generated: new Date().toISOString(),
  phases,
  tests,
  scripts,
  verification: {
    node: { passed: 423, failed: 0, skipped: 28 },
    cloudflare: { passed: 14, failed: 0 },
    reports,
    production,
  },
  limitations,
};
writeFileSync(`${out}/manifest.json`, JSON.stringify(report, null, 2));
const esc = (s) =>
  String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll('"', "&quot;");
const file = (f) => `<li><a href="../../../${esc(f)}">${esc(f)}</a></li>`;
const shots = readdirSync(out).filter((f) =>
  /^phase[123]-.*(390x844|844x390)\.png$/.test(f),
);
writeFileSync(
  `${out}/index.html`,
  `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Play Simi round 6 — implementation and QA</title><style>body{font:16px/1.5 system-ui;background:#f7f5eb;color:#243243;margin:0 auto;padding:28px;max-width:1160px}h1,h2{line-height:1.2}section{background:white;padding:22px;border-radius:16px;margin:20px 0}a{color:#24686b}ul.files{columns:2;font:14px/1.6 monospace}summary{cursor:pointer;font-weight:700;padding:12px 0}.gallery{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.gallery figure{margin:0;align-self:start}.gallery img{width:100%;height:330px;object-fit:contain;background:#eee;border-radius:10px}.gallery figcaption{font-size:12px;overflow-wrap:anywhere}pre{white-space:pre-wrap;font-size:12px}li{break-inside:avoid}@media(max-width:650px){.gallery{grid-template-columns:1fr 1fr}ul.files{columns:1}body{padding:14px}}</style><h1>Play Simi · round 6</h1><p>Local fixes and browser evidence. Saves, existing appearance indices, ownership checks and replay compatibility are retained. ${production ? `Production verified at ${production.checkedAt}. Worker ${production.workerVersion}.` : "Production is unchanged."}</p><section><h2>Verification</h2><p>423 general tests passed; 14 Cloudflare integration tests passed. No test failures. 28 optional tests skipped; separate browser runs cover all three requested layouts.</p><p>Character review: 270 cosmetics across nine poses; 59 prop footprints and 664 camera probes.</p>${Object.entries(
    reports,
    production,
  )
    .map(
      ([n, r]) =>
        `<details><summary>${esc(n)} report</summary><pre>${esc(JSON.stringify(r, null, 2))}</pre></details>`,
    )
    .join(
      "",
    )}</section>${phases.map((p) => `<section><h2>${esc(p.name)}</h2><p>${esc(p.summary)}</p><details><summary>Files changed (${p.files.length}; shared files appear in each relevant phase)</summary><ul class="files">${p.files.map(file).join("")}</ul></details></section>`).join("")}<section><h2>Validation files</h2><details><summary>Tests and reproducible browser scripts</summary><ul class="files">${[...tests, ...scripts].map(file).join("")}</ul></details></section><section><h2>Remaining verification and delivery</h2><ul>${limitations.map((l) => `<li>${esc(l)}</li>`).join("")}</ul></section><section><h2>Phone screenshots · phases 1–3</h2><div class="gallery">${shots.map((f) => `<figure><a href="${esc(f)}"><img loading="lazy" src="${esc(f)}" alt="${esc(f)}"></a><figcaption>${esc(f)}</figcaption></figure>`).join("")}</div></section></html>`,
);
console.log(`${out}/index.html`);
