// Writes assets/SHOTLIST.md and assets/contact-sheet.png from what is in assets/.
// Reviewer scores are merged from assets/review.json when it exists:
//   { "round": 1, "shots": { "emote.mp4": { "score": 8, "rank": 1, "beat": "HOOK", "note": "" } }, "missing": [] }
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const A = "assets";
const clips = existsSync("raw/clips.json") ? JSON.parse(readFileSync("raw/clips.json", "utf8")) : {};
const review = existsSync(`${A}/review.json`) ? JSON.parse(readFileSync(`${A}/review.json`, "utf8")) : null;
const STILLS = {
  "avatar-create-mage": "My look > Full sets > Free, wearing the free Lantern Mage (hat, robe, staff) set",
  "look-mage": "Plaza close-up, Lantern Mage (hat, robe, staff), standing. HUD hidden",
  "look-mage-pose": "Plaza close-up, Lantern Mage (wizard hat, robe, staff), mid cheer emote. HUD hidden",
  "avatar-create-pirate": "My look > Full sets > Free, wearing the free Coral Pirate (tricorn, coat, cutlass) set",
  "look-pirate": "Plaza close-up, Coral Pirate (tricorn, coat, cutlass), standing. HUD hidden",
  "look-pirate-pose": "Plaza close-up, Coral Pirate (tricorn, coat, cutlass), mid cheer emote. HUD hidden",
  "avatar-create-thief": "My look > Full sets > Free, wearing the free Velvet Thief (jacket, daggers) set",
  "look-thief": "Plaza close-up, Velvet Thief (jacket, daggers), standing. HUD hidden",
  "look-thief-pose": "Plaza close-up, Velvet Thief (mask, jacket, daggers), mid cheer emote. HUD hidden",
  "avatar-create-warrior": "My look > Full sets > Free, wearing the free Dawn Warrior (armour, sword) set",
  "look-warrior": "Plaza close-up, Dawn Warrior (armour, sword), standing. HUD hidden",
  "look-warrior-pose": "Plaza close-up, Dawn Warrior (armour, sword), mid cheer emote. HUD hidden",
  "avatar-create-archer": "My look > Full sets > Free, wearing the free Orchard Archer (hood, cloak, bow) set",
  "look-archer": "Plaza close-up, Orchard Archer (hood, cloak, bow), standing. HUD hidden",
  "look-archer-pose": "Plaza close-up, Orchard Archer (hood, cloak, bow), mid cheer emote. HUD hidden",
  "wardrobe-classes": "My look, the five free class sets, Orchard Archer worn",
  "wardrobe-hats": "My look, Hats section mid-swap",
  "wardrobe-pets": "My look, Pets section mid-swap",
  "wardrobe-magic": "My look, Magic section mid-swap",
  "wardrobe-sets": "My look, Full sets previewing a premium set (preview only)",
  "emote-still": "Front close-up mid cheer emote, Pirate set",
  "plaza-1": "Plaza: stopped in front of Arcade Row with three helper avatars behind",
  "plaza-2": "Plaza: group cheer with the helper avatars",
  "plaza-3": "Plaza: jump while the helper avatars dance",
  "plaza-desktop-1": "Desktop 1920×1080 plaza with three helper avatars, HUD hidden",
  "plaza-desktop-2": "Desktop plaza: group cheer",
  "plaza-desktop-3": "Desktop plaza: jump while the helpers dance",
  "plaza-desktop-ui": "Desktop 1920×1080 plaza with the normal HUD",
  quests: "Quests panel",
  rankings: "Rankings panel (guest view, no rows)",
  levelup: "Hoops result (10 of 10 baskets) with the LEVEL UP +1 Style token panel",
  "result-screen": "Round result with XP earned",
  logo: "Play Simi logo, copied from the game's top bar at 2× size",
};
const probe = (f) => {
  const r = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height:format=duration", "-of", "csv=p=0", f], { encoding: "utf8" });
  const [dims, dur] = r.stdout.trim().split(/\r?\n/);
  return { dims: (dims || "").replace(",", "×"), dur: Number(dur) };
};
const files = readdirSync(A);
const rows = [];
for (const f of files.sort()) {
  const base = f.replace(/\.[^.]+$/, "");
  if (f.endsWith(".mp4")) {
    const p = probe(`${A}/${f}`);
    rows.push({ file: `${base}.mp4 / .webm`, key: f, what: clips[base]?.note || "", len: `${p.dur.toFixed(1)}s`, dims: p.dims });
  } else if (f.endsWith(".png") && f !== "contact-sheet.png") {
    const p = probe(`${A}/${f}`);
    rows.push({ file: f, key: f, what: STILLS[base] || (base.endsWith("-still") ? `Still from the ${base.replace("-still", "")} take` : ""), len: "still", dims: p.dims });
  }
}
const sc = (r) => review?.shots?.[r.key] || {};
let md = `# Play Simi promo — shot list\n\nCaptured from https://playsimi.danielquek.com as a guest with \`capture.mjs\`.\nPhone clips are 780×1688 (390×844 window at 2×), stills 1170×2532 (3×).\nOther players' name tags show made-up names; the guest's own tag reads "YOU · MochiStar" (a made-up nickname).\n\n`;
md += `| File | What it shows | Length | Size |${review ? " Score | Rank | Beat | Reviewer note |" : ""}\n|---|---|---|---|${review ? "---|---|---|---|" : ""}\n`;
for (const r of rows) {
  const s = sc(r);
  md += `| ${r.file} | ${r.what} | ${r.len} | ${r.dims} |${review ? ` ${s.score ?? ""} | ${s.rank ?? ""} | ${s.beat ?? ""} | ${s.note ?? ""} |` : ""}\n`;
}
if (existsSync("NOTES-capture.md")) md += "\n" + readFileSync("NOTES-capture.md", "utf8");
if (review?.summary) md += `\n## Reviewer summary (round ${review.round})\n\n${review.summary}\n`;
writeFileSync(`${A}/SHOTLIST.md`, md);

// Contact sheet: one labelled tile per still, and the middle frame of each clip.
rmSync("raw/sheet", { recursive: true, force: true });
mkdirSync("raw/sheet", { recursive: true });
let n = 0;
for (const r of rows) {
  const src = `${A}/${r.key}`;
  const label = r.key.replace(/'/g, "");
  const seek = r.key.endsWith(".mp4") ? ["-ss", (probe(src).dur / 2).toFixed(2)] : [];
  spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...seek, "-i", src, "-frames:v", "1", "-vf",
    `scale=300:420:force_original_aspect_ratio=decrease,pad=320:470:(ow-iw)/2:10:color=0x1f2a3c,drawtext=text='${label}':fontcolor=white:fontsize=17:x=(w-text_w)/2:y=h-32:fontfile='C\\:/Windows/Fonts/arialbd.ttf'`,
    `raw/sheet/${String(n++).padStart(3, "0")}.png`]);
}
const cols = 8, rowsN = Math.ceil(n / cols);
spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-framerate", "1", "-i", "raw/sheet/%03d.png", "-vf", `tile=${cols}x${rowsN}`, "-frames:v", "1", `${A}/contact-sheet.png`]);
console.log(`${rows.length} files listed, contact sheet ${cols}x${rowsN}`);
