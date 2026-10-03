import { genderNames } from "./appearance";
import { celebrate } from "./celebration";
import {
  loadCharacter,
  createCharacterPreview,
  clothingNames,
  hairNames,
  petNames,
  accessoryNames,
} from "./character";
import { playtestEnabled, playtestEvent, playtestSummary } from "./playtest";
import "./style.css";
import "./neighbourhood.css";
import { api, type SharedState, type SharedPlayer, type Run } from "./social";
import {
  ensureAccount,
  openAccount,
  reportPlayer,
  acceptProfile,
  currentProfile,
  type Profile,
} from "./account";
import { LobbyWorld, spots } from "./world";
import { ArcadeGame } from "./games";
import { games, gameIds, activities, type ActivityId } from "./catalog";
import { residents } from "./neighbourhood";
import { interactionSpecs } from "./interactions";
import {
  readSave,
  completeWelcomeRound,
  writeSave,
  outfits,
  skins,
  missions,
  missionProgress,
  claimGift,
  singaporeDay,
  singaporeWeek,
  type GameId,
} from "./state";

const icons: Record<string, string> = {
  game: '<rect x="3" y="7" width="18" height="13" rx="4"/><path d="M7 13h5m-2.5-2.5v5M16 12h.01M18 15h.01M9 7V4h6"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2 6-6 2 2-6Z"/>',
  gift: '<rect x="4" y="10" width="16" height="11" rx="1"/><path d="M3 7h18v4H3zM12 7v14"/><path d="M12 7C3 7 6 0 10 4Zm0 0c9 0 6-7 2-3Z"/>',
  trophy:
    '<path d="M7 3h10v5c0 7-10 7-10 0ZM7 5H3v3c0 4 5 4 5 4m9-7h4v3c0 4-5 4-5 4M12 14v6m-5 1h10"/>',
  shirt: '<path d="m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4c0 4-8 4-8 0Z"/>',
  smile:
    '<circle cx="12" cy="12" r="9"/><path d="M8 9h.01M16 9h.01M8 14c1 4 7 4 8 0"/>',
  book: '<path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1Zm0 0v15"/>',
  sound: '<path d="m11 4-5 5H2v6h4l5 5ZM15 8c3 2 3 6 0 8m3-11c5 4 5 10 0 14"/>',
  mute: '<path d="m11 4-5 5H2v6h4l5 5ZM16 9l6 6m0-6-6 6"/>',
  settings:
    '<path d="M12 3v3m0 12v3M3 12h3m12 0h3M6 6l2 2m8 8 2 2M6 18l2-2m8-8 2-2"/><circle cx="12" cy="12" r="5"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  leaf: '<path d="M19 3C4 2 1 12 8 17s14-1 11-14ZM5 21 16 8"/>',
  star: '<path d="m12 2 3 7 7 1-5 5 1 7-6-4-6 4 1-7-5-5 7-1Z"/>',
  pin: '<path d="M19 9c0 6-7 13-7 13S5 15 5 9a7 7 0 0 1 14 0Z"/><circle cx="12" cy="9" r="2"/>',
  cat: '<path d="m4 10 1-7 6 4h2l6-4 1 7c6 13-22 13-16 0ZM8 12h.01M16 12h.01m-5 4 1 1 1-1M1 14l5 1m12 0 5-1"/>',
  camera: '<path d="M3 7h4l2-3h6l2 3h4v14H3Z"/><circle cx="12" cy="13" r="4"/>',
};
function icon(name: string) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.star}</svg>`;
}
const save = readSave();
let world: LobbyWorld | null = null;
let game: ArcadeGame | null = null;
let wardrobeTab = "style";
let boardTab = "week";
let boardGame: GameId = "noodle";
let disposeCelebration: (() => void) | null = null;
let disposePreview: (() => void) | null = null;
let shared: SharedState | null = null;
let profileReady = false;
window.addEventListener("session-expired", () => {
  if (profileReady) {
    profileReady = false;
    location.reload();
  }
});
let profileQueue = Promise.resolve();
let sentPreferences = "";
const preferenceKeys = [
  "outfit",
  "skin",
  "hat",
  "gender",
  "clothing",
  "hair",
  "pet",
  "accessory",
  "sound",
  "reduced",
  "twoD",
  "light",
  "cameraMode",
  "awayActivity",
  "welcomeDismissed",
] as const;
let pendingPreferences = 0;
function profileMutation(path: string, data: unknown) {
  const preferenceChange = path === "profile";
  if (preferenceChange) pendingPreferences++;
  profileQueue = profileQueue
    .then(async () => {
      let p: Profile;
      try {
        p = await api<Profile>(path, data);
      } finally {
        if (preferenceChange) pendingPreferences--;
      }
      // Earlier saves must not undo a newer choice while its request is queued.
      if (pendingPreferences)
        Object.assign(
          p.progress,
          Object.fromEntries(preferenceKeys.map((k) => [k, save[k]])),
        );
      acceptProfile(p);
    })
    .catch((error) => {
      if (preferenceChange) sentPreferences = "";
      toast((error as Error).message);
    });
  return profileQueue;
}
function progress(event: string, value?: unknown) {
  if (profileReady) void profileMutation("progress", { event, value });
}
let connected = false;
let activeRun: Run | null = null;
let gameGeneration = 0;
let socialPanel = "";
const connection = Array.from(crypto.getRandomValues(new Uint8Array(16)), (n) =>
  n.toString(16).padStart(2, "0"),
).join("");
let syncing = false;
let sharedSignature = "";
let is2d = false;
let nearId = "";
let toastTimer = 0;
let lastFocus: HTMLElement | null = null;
let audio: AudioContext | null = null;
let tuneTimer = 0;
let activeMinutes = 0;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="world"></div><div class="vignette" aria-hidden="true"></div>
  <header class="topbar"><a class="brand" href="#" aria-label="Darecade home"><span class="brand-mark">d<span>★</span></span><span>DARECADE<span class="brand-caption">MEET YOU DOWNSTAIRS.</span></span></a><div class="location-pill"><span class="status-dot"></span>THE NEIGHBOURHOOD<span class="divider"></span><span id="sgt-clock">SGT</span></div><div class="top-actions"><span class="demo-tag">LOCAL PREVIEW</span><button class="coin-pill" data-open="quests" aria-label="View pixel coin hunt"><span class="pixel-coin">✦</span><b id="coin-count">0 / 5</b></button><button class="icon-button" id="sound-toggle" aria-label="Turn sound on">${icon("mute")}</button><button class="icon-button" data-open="settings" aria-label="Settings">${icon("settings")}</button></div></header>
  <main class="hud"><section class="welcome-panel"><div class="eyebrow"><span class="tiny-spark">✦</span> YOUR LITTLE CORNER OF THE INTERNET</div><h1>Good times.<br>Great company.</h1><p>No tickets needed.<br>Just bring your game face.</p><button class="primary" data-open="arcade">Let’s play ${icon("arrow")}</button><div class="world-caption"><span class="status-dot"></span> A whole neighbourhood to explore</div></section>
  <button class="quest-card" data-open="quests" aria-label="Open pixel coin hunt"><span class="quest-icon">${icon("compass")}</span><span class="quest-copy"><span class="eyebrow">A LITTLE SIDE QUEST</span><strong>The great pixel hunt</strong><span>5 hidden coins. One fresh look.</span><span class="quest-progress" id="coin-dots">○ ○ ○ ○ ○</span></span><span class="card-arrow">↗</span></button>
  <div class="right-rail"><button class="gift-teaser" data-open="shop" aria-label="Choose your daily gift at the Mama Shop"><span class="gift-illustration">${icon("gift")}<i>✦</i></span><span class="eyebrow" id="gift-eyebrow">A LITTLE SOMETHING FOR YOU</span><strong id="gift-title">Your daily goodie</strong><span id="gift-caption">Pick a free gift at the Mama Shop</span><span class="gift-link">Take a look ${icon("arrow")}</span></button><button class="map-card" data-open="map" aria-label="Open neighbourhood map"><div class="mini-map" aria-hidden="true"><i class="map-building m1"></i><i class="map-building m2"></i><i class="map-building m3"></i><i class="map-tree t1"></i><i class="map-tree t2"></i><i class="map-you"></i><span>N ↑</span></div><span>${icon("pin")} The neighbourhood <b>↗</b></span></button></div>
  <div class="scene-label label-arcade"><button data-walk="arcade">${icon("game")} Arcade Row <span>4 games</span></button></div>
  <div class="world-controls"><button id="rotate-left" aria-label="Rotate view left">↶</button><button id="reset-view" aria-label="Reset view">${icon("compass")}</button><button id="rotate-right" aria-label="Rotate view right">↷</button><span></span><button id="zoom-out" aria-label="Zoom out">−</button><button id="zoom-in" aria-label="Zoom in">+</button></div>
  <button id="interaction" class="interaction" hidden><kbd>E</kbd><span></span>${icon("arrow")}</button>
  <div class="move-hint"><kbd>W</kbd><span><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><p>to wander <i>·</i> click anywhere to walk</p></div>
  <div id="joystick" class="joystick" role="group" aria-label="Drag to walk"><span></span></div>
  <div id="fallback" class="fallback" hidden></div>
  </main>
  <footer class="bottom-bar"><button class="profile" data-open="wardrobe"><span class="avatar-icon" id="avatar-icon"><i></i></span><span><strong id="player-name">New neighbour</strong><small id="medal-points">0 MEDAL POINTS</small><span id="level-label">LEVEL 1 · NEW KID ON THE BLOCK</span><span class="xp-track"><i id="xp-fill"></i></span></span><span class="profile-edit">✎</span></button><nav class="dock" aria-label="Lobby activities"><button class="selected" data-open="map">${icon("compass")}<span>Explore</span></button><button data-open="arcade">${icon("game")}<span>Arcade</span></button><button data-open="dares">${icon("trophy")}<span>Dares</span></button><span class="dock-divider"></span><button data-open="wardrobe">${icon("shirt")}<span>My look</span></button><button data-open="emotes">${icon("smile")}<span>Emotes</span></button><button data-open="album">${icon("book")}<span>My album</span></button></nav><div class="footer-note"><span>Small world. Big possibilities.</span><span>MADE FOR PLAY <i>✦</i> <span id="quality-note">3D LOBBY</span></span></div></footer>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <dialog id="modal"><div class="modal-top"><span class="eyebrow" id="modal-kicker">THE NEIGHBOURHOOD</span><button id="close-modal" class="close-button" aria-label="Close panel">×</button></div><div id="modal-body"></div></dialog>
  <div id="loading"><span class="brand-mark">d<span>★</span></span><h2>See you downstairs.</h2><p>Putting the finishing touches on your neighbourhood…</p><span class="loading-line"></span></div>
`;
document
  .querySelector(".hud")!
  .insertAdjacentHTML(
    "beforeend",
    `<div class="neighbour-tools"><button id="camera-toggle" aria-label="Switch camera perspective">${icon("camera")}<span>Third person</span><kbd>V</kbd></button><button data-open="neighbours">${icon("smile")}<span>Neighbours</span></button><button data-open="away">${icon("leaf")}<span>Step away</span></button></div><aside id="inspector" class="inspector" aria-label="Neighbour inspection" hidden></aside><div id="away-banner" class="away-banner" hidden><span></span><button data-action="return-lobby">I’m back →</button></div><div id="camera-hint" class="camera-hint" hidden>Drag to look · scroll / pinch to zoom · WASD to walk</div>`,
  );
document
  .querySelector(".dock")!
  .insertAdjacentHTML(
    "beforeend",
    `<button class="phone-more" data-open="phone-menu">${icon("settings")}<span>More</span></button>`,
  );
document
  .querySelector(".hud")!
  .insertAdjacentHTML(
    "beforeend",
    '<aside id="phone-next" class="phone-next" hidden></aside>',
  );
const modal = document.querySelector<HTMLDialogElement>("#modal")!;
const body = document.querySelector<HTMLDivElement>("#modal-body")!;
function persist() {
  if (profileReady) {
    const prefs = Object.fromEntries(preferenceKeys.map((k) => [k, save[k]]));
    const stamp = JSON.stringify(prefs);
    if (stamp !== sentPreferences) {
      sentPreferences = stamp;
      void profileMutation("profile", prefs);
    }
  }
  void syncSocial();
  if (!writeSave(save))
    toast("Your browser can’t save right now. Progress lasts for this visit.");
  renderStats();
  renderWelcome();
}
function toast(message: string) {
  const el = document.querySelector("#toast")!;
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove("show"), 4200);
}
function beep(freq = 660) {
  if (!save.sound) return;
  try {
    audio ??= new AudioContext();
    void audio.resume();
    const o = audio.createOscillator(),
      g = audio.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.setValueAtTime(0.035, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + 0.24);
    o.connect(g);
    g.connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + 0.25);
  } catch {}
}
function startTune() {
  clearInterval(tuneTimer);
  if (!save.sound) return;
  let i = 0;
  const notes = [261.63, 329.63, 392, 329.63, 293.66, 349.23, 440, 349.23];
  tuneTimer = window.setInterval(() => {
    if (!document.hidden && !game) beep(notes[i++ % notes.length]);
  }, 1200);
}
function renderStats() {
  document.querySelector("#coin-count")!.textContent =
    `${save.coins.length} / 5`;
  document.querySelector("#coin-dots")!.innerHTML = Array.from(
    { length: 5 },
    (_, i) => `<i class="${i < save.coins.length ? "found" : ""}">✦</i>`,
  ).join("");
  document.querySelector("#level-label")!.textContent =
    `LEVEL ${1 + Math.floor(save.xp / 100)} · ${save.xp >= 200 ? "NEIGHBOURHOOD REGULAR" : "NEW KID ON THE BLOCK"}`;
  (document.querySelector("#xp-fill") as HTMLElement).style.width =
    `${save.xp % 100}%`;
  (document.querySelector("#avatar-icon") as HTMLElement).style.setProperty(
    "--outfit",
    outfits[save.outfit],
  );
  const claimed = save.giftDay === singaporeDay();
  document.querySelector("#gift-title")!.textContent = claimed
    ? "Looking good, neighbour."
    : "Your daily goodie";
  document.querySelector("#gift-caption")!.textContent = claimed
    ? "Your gift is waiting in your wardrobe"
    : "Pick a free gift at the Mama Shop";
  document.querySelector("#gift-eyebrow")!.textContent = claimed
    ? "TODAY’S GIFT · COLLECTED"
    : "A LITTLE SOMETHING FOR YOU";
  const sound = document.querySelector("#sound-toggle")!;
  sound.innerHTML = icon(save.sound ? "sound" : "mute");
  sound.setAttribute(
    "aria-label",
    save.sound ? "Turn sound off" : "Turn sound on",
  );
  document.documentElement.classList.toggle("reduced", save.reduced);
}
function visit(id: string) {
  if (!save.visited.includes(id)) {
    save.visited.push(id);
    save.xp += 10;
    progress("visit", id);
    persist();
    toast(`Discovered ${spots.find((s) => s.id === id)?.name || id} · +10 XP`);
  }
}
function collect(id: string) {
  if (save.coins.includes(id)) return;
  save.coins.push(id);
  progress("coin", id);
  save.xp += 10;
  beep(880);
  if (save.coins.length === 5) {
    save.hat = 3;
    if (!save.unlockedHats.includes(3)) save.unlockedHats.push(3);
    save.xp += 50;
    world?.updateAvatar();
    toast("All 5 found! Sprout hat unlocked · +50 XP");
  } else
    toast(`A little golden find! ${save.coins.length}/5 pixel coins · +10 XP`);
  persist();
}
function abandonRound() {
  gameGeneration++;
  if (activeRun) void api("abandon", { id: activeRun.id }).catch(() => {});
  activeRun = null;
}
function openShell(kicker: string) {
  disposeCelebration?.();
  disposeCelebration = null;
  disposePreview?.();
  disposePreview = null;
  abandonRound();
  socialPanel = "";
  world?.cancelInteraction();
  dismissInspector();
  game?.dispose();
  game = null;
  lastFocus = document.activeElement as HTMLElement;
  document.querySelector("#modal-kicker")!.textContent = kicker;
  modal.className = "";
  if (!modal.open) modal.showModal();
  if (world) {
    world.paused = true;
    world.keys.clear();
    world.joystick = { x: 0, y: 0 };
  }
  beep(440);
}
function close() {
  disposeCelebration?.();
  disposeCelebration = null;
  disposePreview?.();
  disposePreview = null;
  abandonRound();
  socialPanel = "";
  game?.dispose();
  game = null;
  modal.close();
  if (world) {
    world.paused = false;
    world.keys.clear();
  }
  lastFocus?.focus({ preventScroll: true });
}
function actionButton(action: string, label: string, klass = "primary") {
  return `<button class="${klass}" data-action="${action}">${label}</button>`;
}
function cards() {
  const art = {
    noodle:
      '<span class="noodle-body"></span><span class="dumpling">●</span><i>01</i>',
    brick: "<i></i>".repeat(12) + "<b></b><span></span>",
    hop: '<span class="hop-roof r1"></span><span class="hop-roof r2"></span><span class="hop-character">↑</span><i>03</i>',
    swarm:
      '<span class="star-ship">▲</span><span class="star-enemy">▼</span><i>✦ · ✧ · ✦</i>',
  };
  return `<div class="game-grid four-games">${gameIds.map((id) => `<button class="game-card ${id}" data-game="${id}"><div class="game-art ${id}-art">${art[id]}</div><span class="eyebrow">${games[id].genre}</span><h3>${games[id].name}</h3><p>${games[id].description}</p><div><span>60 sec · BEST ${shared?.players.find((p) => p.id === shared!.me)?.best[id] ?? 0}</span>${icon("arrow")}</div></button>`).join("")}</div>`;
}
function open(id: string) {
  if (id.startsWith("player:")) {
    showPlayer(id.slice(7));
    return;
  }
  if (id.startsWith("action:")) {
    startOutdoor(id.slice(7));
    return;
  }
  if (id.startsWith("resident:")) {
    showResident(id.slice(9));
    return;
  }
  if (gameIds.includes(id as GameId)) {
    startGame(id as GameId);
    return;
  }
  if (id.startsWith("dare")) {
    openDares();
    return;
  }
  if (id === "bell") {
    startOutdoor("bell");
    return;
  }
  if (id === "bench") {
    startOutdoor("bench0");
    return;
  }
  if (id === "cat") {
    if (!is2d) {
      startOutdoor("pet");
      return;
    }
    visit("cat");
    if (!save.cat) {
      save.cat = true;
      progress("cat");
      save.xp += 15;
      persist();
    }
    world?.act("wave");
    openShell("THE UNOFFICIAL MAYOR");
    body.innerHTML = `<div class="cat-portrait">${icon("cat")}</div><h2>Meet Kopi.</h2><p class="lead">Professional sunbeam finder.<br>Part-time arcade supervisor.</p><div class="note">Kopi leans into your hand and gives a tiny, approving purr. You’ve made a friend.</div>${actionButton("pet", "Give another head scratch ♡")}<p class="fine-print">A little pause is part of the adventure.</p>`;
    return;
  }
  openShell(
    id === "arcade"
      ? "ARCADE ROW · ALWAYS FREE"
      : id === "shop"
        ? "MAMA SHOP · A GIFT, JUST BECAUSE"
        : id === "wardrobe"
          ? "A LITTLE SELF-EXPRESSION"
          : "YOUR NEIGHBOURHOOD",
  );
  if (id === "phone-menu") {
    body.innerHTML = `<h2>Your neighbourhood.</h2><p class="lead">Everything else, when you need it.</p><div class="phone-menu-grid">${[
      ["board", "Rankings & medals"],
      ["dares", "Challenge a neighbour"],
      ["neighbours", "Meet the neighbours"],
      ["wardrobe", "Change my look"],
      ["surroundings", "Play outside"],
      ["away", "Step away"],
      ["shop", "Free daily gift"],
      ["quests", "Pixel coin hunt"],
      ["emotes", "Say hello"],
      ["album", "My sticker album"],
      ["settings", "Sound & settings"],
    ]
      .map(
        ([key, label]) =>
          `<button class="secondary" data-open="${key}">${label} →</button>`,
      )
      .join(
        "",
      )}<button class="secondary" data-account>Account & privacy →</button><button class="secondary" data-action="phone-camera">Switch camera view ↻</button><button class="secondary" data-action="phone-reset">Reset camera ↺</button>${playtestEnabled ? '<button class="primary" data-action="phone-test">Phone test · feedback</button>' : ""}</div><p class="fine-print">Drag the world to look around. Pinch with two fingers to zoom.</p>`;
  } else if (id === "arcade") {
    body.innerHTML = `<h2>Find your next<br>“one more go”.</h2><p class="lead">Original little games. A whole lot of play.</p>${cards()}<p class="fine-print">Start at zero. Set today’s best score to qualify for daily medals. Guest progress saves on this neighbourhood server.</p>`;
  } else if (id === "shop") {
    const taken = save.giftDay === singaporeDay();
    body.innerHTML = `<h2>${taken ? "Good choice, neighbour." : "Something for your noggin."}</h2><p class="lead">${taken ? "Your free gift is in your wardrobe. Come back any day." : "Pick one. It’s yours to keep. No catch, no lucky dip."}</p><div class="gift-grid">${["The Kopitiam Bucket", "Lilac Daydream", "Just a Little Sprout"].map((n, i) => `<button class="gift-option ${taken && save.gift === i ? "chosen" : ""}" data-gift="${i}" ${taken ? "disabled" : ""}><span class="hat-art hat-${i}">${["▰", "◒", "♧"][i]}</span><strong>${n}</strong><span>${taken ? (save.gift === i ? "YOURS TO KEEP" : "ANOTHER DAY") : "FREE · CHOOSE ME"}</span></button>`).join("")}</div><div class="note">${icon("leaf")} A new choice each day, Singapore time. Miss a day? You won’t lose a thing.</div>${taken ? actionButton("wardrobe", "Wear it your way →") : ""}`;
  } else if (id === "wardrobe") {
    const choices = (
      key: "gender" | "clothing" | "hair" | "pet" | "accessory",
      names: string[],
    ) =>
      `<div class="look-options">${names.map((name, i) => `<button class="secondary ${save[key] === i ? "chosen" : ""}" data-${key}="${i}" aria-pressed="${save[key] === i}">${name}</button>`).join("")}</div>`;
    const nickname =
      currentProfile?.name ||
      shared?.players.find((p) => p.id === shared?.me)?.name ||
      "New neighbour";
    body.innerHTML = `<div class="wardrobe-layout"><div class="avatar-preview"><div class="character-preview" aria-label="3D character preview; drag to turn"></div><strong>${escapeText(nickname)}</strong><small>DRAG TO TURN · SAVES AS YOU GO</small><span class="look-caption">${clothingNames[save.clothing]} · ${hairNames[save.hair]}</span></div><div class="wardrobe-controls"><span class="eyebrow">YOUR NEIGHBOURHOOD SELF</span><h2>Make it you.</h2><details class="look-identity" ${innerWidth > 600 ? "open" : ""}><summary>Name & avatar gender</summary><form id="nickname-form"><label class="field-label" for="nickname">YOUR NICKNAME</label><div class="nickname-row"><input id="nickname" name="nickname" value="${escapeText(nickname)}" minlength="2" maxlength="20" autocomplete="off" required><button class="secondary" type="submit">Save name</button></div><p class="fine-print">Visible to everyone. Use a nickname, not your real name or contact details.</p><p id="nickname-status" role="status"></p></form><details class="avatar-identity"><summary>Avatar gender · ${genderNames[save.gender]}</summary><p class="fine-print">A character choice only. Every hairstyle and outfit is available to everyone.</p>${choices("gender", genderNames)}</details></details><div class="look-tabs" aria-label="Wardrobe sections">${[
      ["style", "Outfits"],
      ["hair", "Head"],
      ["pets", "Pets"],
      ["magic", "Magic"],
    ]
      .map(
        ([key, label]) =>
          `<button class="${wardrobeTab === key ? "active" : ""}" data-look-tab="${key}" aria-pressed="${wardrobeTab === key}">${label}</button>`,
      )
      .join(
        "",
      )}</div><section class="character-options">${wardrobeTab === "style" ? `<h3>Find your favourite fit.</h3><p class="fine-print">Outfit colour tints the tunic, robe, cape or hood.</p>${choices("clothing", clothingNames)}<label class="field-label">OUTFIT COLOUR</label><div class="swatches">${outfits.map((c, i) => `<button data-outfit="${i}" style="--swatch:${c}" class="${save.outfit === i ? "active" : ""}" aria-label="${["Lime", "Lilac", "Coral", "Sky", "Gold", "Cream"][i]} outfit" aria-pressed="${save.outfit === i}"></button>`).join("")}</div><label class="field-label">SKIN TONE</label><div class="swatches">${skins.map((c, i) => `<button data-skin="${i}" style="--swatch:${c}" class="${save.skin === i ? "active" : ""}" aria-label="Skin tone ${i + 1}" aria-pressed="${save.skin === i}"></button>`).join("")}</div><label class="field-label">TOP IT OFF</label><div class="hat-options">${["No hat", "Bucket", "Cap", "Sprout"].map((n, i) => `<button data-hat="${i}" ${save.unlockedHats.includes(i) ? "" : "disabled"} class="${save.hat === i ? "active" : ""}" aria-pressed="${save.hat === i}">${n}${save.unlockedHats.includes(i) ? "" : " · locked"}</button>`).join("")}</div>` : wardrobeTab === "hair" ? `<h3>Heads, hoods and hats.</h3><p class="fine-print">Mix any head with any outfit. An earned hat replaces the helmet or wizard hat.</p>${choices("hair", hairNames)}` : wardrobeTab === "pets" ? `<h3>A little friend, always.</h3><p class="fine-print">Your companion follows you around the neighbourhood.</p>${choices("pet", petNames)}` : `<h3>A little everyday magic.</h3><p class="fine-print">Floating charms, soft wings and tiny spells.</p>${choices("accessory", accessoryNames)}`}</section><p class="fine-print">All looks are free and cosmetic. They never change your score.</p>${actionButton("done-look", "Love it. Let’s play →")}</div></div>`;
    const preview = body.querySelector<HTMLElement>(".character-preview")!;
    if (!is2d) {
      try {
        disposePreview = createCharacterPreview(preview, save);
      } catch {
        preview.textContent = "Your look will appear in the neighbourhood.";
      }
    } else
      preview.innerHTML = `<span class="look-2d" style="background:${outfits[save.outfit]}">${icon("shirt")}</span><p>3D preview is available in 3D mode.</p>`;
    body.querySelector<HTMLFormElement>("#nickname-form")!.onsubmit = async (
      e,
    ) => {
      e.preventDefault();
      const status = body.querySelector<HTMLElement>("#nickname-status")!;
      const button = body.querySelector<HTMLButtonElement>(
        "#nickname-form button",
      )!;
      const name = body.querySelector<HTMLInputElement>("#nickname")!.value;
      button.disabled = true;
      try {
        await profileQueue;
        const profile = await api<Profile>("profile", { name });
        acceptProfile(profile);
        await syncSocial();
        status.textContent = "Nickname saved.";
        body.querySelector(".avatar-preview strong")!.textContent =
          profile.name;
      } catch (error) {
        status.textContent = (error as Error).message;
      } finally {
        button.disabled = false;
      }
    };
  } else if (id === "map") {
    body.innerHTML = `<h2>A small world.<br>A lot to get lost in.</h2><p class="lead">Pick a spot and we’ll take a little walk.</p><div class="zone-grid">${spots.map((s, i) => `<button data-walk="${s.id}"><span class="zone-number">0${i + 1}</span>${icon(["game", "trophy", "gift", "shirt", "trophy", "leaf", "cat", "star"][i])}<strong>${s.name}</strong><span>${save.visited.includes(s.id) ? "✓ DISCOVERED" : "LET’S EXPLORE →"}</span></button>`).join("")}</div><div class="note">${is2d ? "You’re in the lightweight 2D lobby. All games and rewards are available." : "WASD or arrows to walk · click the ground to choose a route · E to interact · space to jump"}</div>`;
  } else if (id === "quests") {
    body.innerHTML = `<h2>Take the scenic route.</h2><p class="lead">There’s more downstairs than a high score.</p><div class="hunt-panel"><span class="big-coin">✦</span><div><h3>The great pixel hunt</h3><p>Find 5 golden coins tucked around the world.<br>Unlock the Sprout hat + 50 XP.</p><strong>${save.coins.length} / 5 discovered</strong></div></div>${is2d ? '<p class="fine-print">The treasure hunt needs 3D. You can also choose a free Sprout hat from the Mama Shop.</p>' : ""}<div class="mission-list">${missions
      .map((m) => {
        const progress = missionProgress(save, m.id);
        return `<div><span class="mission-check ${progress >= m.total ? "complete" : ""}">${progress >= m.total ? "✓" : icon("star")}</span><span><strong>${m.name}</strong><small>${m.detail} · ${progress}/${m.total}</small></span><button data-claim="${m.id}" ${progress < m.total || save.claims.includes(m.id) ? "disabled" : ""}>${save.claims.includes(m.id) ? "CLAIMED" : `+${m.xp} XP`}</button></div>`;
      })
      .join(
        "",
      )}</div><p class="fine-print">Weekly coin locations refresh on Monday, Singapore time. Play at your own pace.</p>`;
  } else if (id === "album") {
    const stickers = [
      [
        "First footsteps",
        save.visited.length >= 1,
        "Explore a spot",
        "compass",
      ],
      ["Kopi’s favourite", save.cat, "Meet the cat", "cat"],
      ["Player one", save.rounds > 0, "Finish a round", "game"],
      ["Block explorer", save.visited.length >= 4, "Visit 4 spots", "pin"],
      ["Golden hour", save.coins.length === 5, "Find 5 pixel coins", "star"],
      ["Goodie two shoes", !!save.giftDay, "Choose a daily gift", "gift"],
    ];
    body.innerHTML = `<h2>Little moments.<br>Worth keeping.</h2><p class="lead">Your neighbourhood sticker album · Page 01</p><div class="sticker-grid">${stickers.map(([n, unlocked, task, ic]) => `<div class="sticker ${unlocked ? "unlocked" : ""}"><span>${icon(String(ic))}</span><strong>${n}</strong><small>${unlocked ? "STUCK WITH LOVE" : task}</small></div>`).join("")}</div><p class="fine-print">${stickers.filter((s) => s[1]).length}/6 memories collected. No deadlines. Just good times.</p>`;
  } else if (id === "board") {
    socialPanel = "board";
    renderSharedBoard();
  } else if (id === "emotes") {
    body.innerHTML = `<h2>Say it your way.</h2><p class="lead">A little personality. No words needed.</p><div class="emote-grid">${[
      ["wave", "👋", "Hello, neighbour"],
      ["cheer", "🙌", "Big cheer"],
      ["dance", "🪩", "Tiny dance party"],
      ["jump", "⚡", "Jump for joy"],
      ["victory", "✌", "Nailed it"],
      ["think", "💭", "Deep thoughts"],
    ]
      .map(
        ([id, e, n]) =>
          `<button data-emote="${id}"><span>${e}</span><strong>${n}</strong></button>`,
      )
      .join("")}</div>`;
  } else if (id === "neighbours") {
    socialPanel = "neighbours";
    renderSharedNeighbours();
  } else if (id === "away") {
    body.innerHTML = `<h2>Life goes on downstairs.</h2><p class="lead">Choose what your avatar does when you step away, close the page, or lose your connection.</p><div class="activity-list" role="group" aria-label="Away activity">${Object.entries(
      activities,
    )
      .map(
        ([id, a]) =>
          `<button data-away="${id}" aria-pressed="${save.awayActivity === id}" class="${save.awayActivity === id ? "chosen" : ""}"><span>${a.icon}</span><span><strong>${a.name}</strong><small>${a.description}</small></span><b>${save.awayActivity === id ? "✓" : "○"}</b></button>`,
      )
      .join(
        "",
      )}</div><div class="button-row">${actionButton("start-away", "Save & step away →")}${actionButton("save-away", "Save preference", "secondary")}</div><p class="fine-print">Your saved avatar stays in this neighbourhood while you’re away. Each player can send three challenges a day to different neighbours. Your saved score can receive unlimited challenges without losing points. Away activities don’t earn XP or game scores; daily ranking medals still apply. Keep this server running so other visitors can see you.</p>`;
  } else if (id === "settings") {
    body.innerHTML = `<button class="secondary" data-account>Account & privacy →</button><h2>Your kind of comfortable.</h2><p class="lead">Make the neighbourhood feel right.</p><label class="settings-row"><span><strong>Neighbourhood sounds</strong><small>A soft, original melody and playful little sounds</small></span><input id="setting-sound" type="checkbox" ${save.sound ? "checked" : ""}></label><label class="settings-row"><span><strong>Reduce motion</strong><small>Less decorative movement and a quieter interface</small></span><input id="setting-reduced" type="checkbox" ${save.reduced ? "checked" : ""}></label><label class="settings-row"><span><strong>Time of day</strong><small>Singapore time, or your favourite atmosphere</small></span><select id="setting-light">${[
      ["auto", "Follow SGT"],
      ["day", "Daylight"],
      ["dusk", "Golden hour"],
      ["night", "After dark"],
    ]
      .map(
        ([v, n]) =>
          `<option value="${v}" ${save.light === v ? "selected" : ""}>${n}</option>`,
      )
      .join(
        "",
      )}</select></label><div class="settings-row"><span><strong>Lightweight lobby</strong><small>Games and rewards without the 3D world</small></span>${actionButton("2d", is2d ? "Return to 3D" : "Use 2D", "secondary")}</div><div class="note">Your guest identity, rankings, medals and away avatar are saved on the neighbourhood server. Cosmetics and XP are saved by the server; this browser keeps a display cache. Keep your browser cookies to keep your guest identity. Use Account & privacy to sign in, download your data or delete your profile. There is no chat or purchasing. A gentle break reminder appears after 30 active minutes.</div>`;
  } else if (id === "surroundings") {
    body.innerHTML = `<h2>A little more<br>hands-on.</h2><p class="lead">Pick something to do. Walk over and watch your character bring the neighbourhood to life.</p><div class="outdoor-grid">${[
      "dragon",
      "swing",
      "bench3",
      "pet",
      "bell",
      "cabinet-noodle",
    ]
      .map((key, i) => {
        const s = interactionSpecs.find((s) => s.id === key)!;
        return `<button data-environment="${key}"><span>${["🐉", "✦", "📖", "🐈", "🔔", "🕹"][i]}</span><strong>${s.title}</strong><small>${["Climb the stairs, then slide down", "Hop on and swing through the air", "Open a book and turn the pages", "Kopi leans in and swishes his tail", "A little ding, a little neighbourhood joy", "Work the controls, then play a round"][i]}</small><b>LET’S GO →</b></button>`;
      })
      .join(
        "",
      )}</div><div class="note">${is2d ? "These animated scenes need the 3D lobby. Switch back in Settings to join in." : "Tap a prop in the world, or walk nearby and press E. Stop at any time with Escape, movement keys, or the on-screen Stop button."}</div>`;
  } else if (id === "garden") {
    body.innerHTML = `<div class="garden-portrait">${icon("leaf")}</div><h2>Nothing to chase here.</h2><p class="lead">A patch of green. A familiar bench.<br>A moment that’s all yours.</p><button class="primary" data-environment="bench0">Sit down & open a book →</button>`;
  } else if (id === "playground") {
    body.innerHTML = `<div class="dragon-portrait">✦</div><h2>Old-school playground.<br>New little adventures.</h2><p class="lead">Climb the steps, take a seat, and slide down our terracotta dragon.</p><button class="primary" data-environment="dragon">Let’s ride the dragon →</button><button class="secondary" data-environment="swing">Try the neighbourhood swing</button>`;
  } else if (id === "soon") {
    body.innerHTML = `<h2>All four cabinets are open.</h2>${cards()}`;
  } else {
    body.innerHTML = `<h2>Take a breather.</h2><p class="lead">You’ve been exploring for 30 minutes.<br>Stretch, grab some water, look out of a window.</p><div class="note">Everything you’ve earned will be here when you get back.</div>${actionButton("close", "Back when I’m ready")}`;
  }
}
function openDares() {
  openShell("DARE PLAZA · NEIGHBOUR CHALLENGES");
  socialPanel = "dares";
  renderSharedDares();
}
async function startGame(id: GameId, defender = "", dare = "") {
  if (save.away) {
    save.away = false;
    save.awaySince = 0;
    world?.setAway(false);
    renderAway();
    persist();
  }
  openShell(defender || dare ? "FRIENDLY DARE" : "ARCADE ROW");
  const generation = gameGeneration;
  body.innerHTML = "<h2>Getting your cabinet ready…</h2>";
  let run: Run | null = null;
  try {
    run = await api<Run>("run", {
      game: id,
      target: defender || null,
      dare: dare || null,
    });
  } catch (error) {
    if (generation !== gameGeneration) return;
    if (defender || dare) {
      body.innerHTML =
        "<h2>Dare unavailable</h2><p>" +
        escapeText((error as Error).message) +
        '</p><button class="primary" data-open="dares">Back to dares</button>';
      return;
    }
    toast("Server unavailable. This is practice only, with no saved rewards.");
  }
  if (generation !== gameGeneration) {
    if (run) void api("abandon", { id: run.id });
    return;
  }
  activeRun = run;
  playtestEvent("cabinet-ready");
  modal.classList.add("game-modal");
  const target = run?.targetScore || 0;
  document.querySelector("#modal-kicker")!.textContent = target
    ? "DARE · SAME LEVEL · ONE ATTEMPT"
    : run?.ranked
      ? "VERIFIED ROUND · DAILY BOARD"
      : run
        ? "VERIFIED PRACTICE · EARN COSMETIC XP"
        : "OFFLINE PRACTICE";
  body.innerHTML = "<h2>" + games[id].name + '</h2><div id="game-mount"></div>';
  game = new ArcadeGame(
    id,
    body.querySelector("#game-mount")!,
    async (score, replay) => {
      game?.dispose();
      game = null;
      activeRun = null;
      playtestEvent("round-finished");
      body.innerHTML =
        "<h2>Checking your round…</h2><p>The server replays your inputs before saving rewards.</p>";
      const render = async () => {
        try {
          let result: {
            welcome?: boolean;
            ranked?: boolean;
            profile: Profile;
          } | null = null;
          if (run) {
            await profileQueue;
            result = await api("finish", { id: run.id, score, replay });
            acceptProfile(result!.profile);
            await syncSocial();
          }
          if (generation !== gameGeneration) return;
          const reward = !!result?.welcome;
          body.innerHTML =
            '<div class="result-star">' +
            icon(target ? "trophy" : "game") +
            '</div><h2 class="result-score">' +
            score +
            '<small>GAME SCORE</small></h2><p class="lead">' +
            (target
              ? score > target
                ? "Dare beaten!"
                : score === target
                  ? "A draw. Both scores stand."
                  : "Your target was " +
                    target +
                    ". Try another neighbour next time."
              : "A little better with every round.") +
            "</p>" +
            (reward
              ? '<div class="welcome-reward"><span class="cap-badge">✦</span><span><strong>First round complete!</strong><span>Lilac cap unlocked · +35 bonus XP</span></span></div>'
              : "") +
            '<div class="button-row">' +
            (reward
              ? '<button class="primary" data-action="welcome-wear">Wear my cap & meet Kopi →</button>'
              : '<button class="primary" data-replay="' +
                id +
                '">Another round →</button>') +
            '<button class="secondary" data-open="board">See the weekly board</button></div>' +
            '<div class="note">' +
            (result
              ? "Replay verified · +20 cosmetic XP. " +
                (result.ranked
                  ? "Today’s score is saved for midnight medals."
                  : "This round is saved as practice. Ranked play opens after account verification and the 24-hour waiting period; daily medals require today’s level.")
              : "Offline practice: no progress or leaderboard score was saved.") +
            "</div>" +
            (run && score > 0 && shared?.competitionReady
              ? '<button class="secondary" data-post-dare="' +
                run.id +
                '">Post this score as a 24-hour dare →</button>'
              : "") +
            (!currentProfile?.account
              ? '<button class="secondary" data-account>Create an account to keep my progress →</button>'
              : "");
          body.insertAdjacentHTML(
            "afterbegin",
            '<div class="finish-effects" aria-hidden="true"></div>',
          );
          if (!is2d && !save.reduced) {
            try {
              disposeCelebration = celebrate(
                body.querySelector(".finish-effects")!,
              );
            } catch {
              /* Rewards remain readable without WebGL. */
            }
          }
          const standing = shared?.boards[id]?.find((p) => p.id === shared?.me);
          body
            .querySelector(".result-score")!
            .insertAdjacentHTML(
              "afterend",
              `<div class="round-breakdown"><span>Cosmetic XP<strong>${result ? "+20" : "0"}</strong><small>For your avatar level</small></span><span>Today’s rank<strong>${result?.ranked && standing ? "#" + standing.rank : "Practice"}</strong><small>${result?.ranked && standing && standing.rank <= 3 ? `+${4 - standing.rank} medals if held at midnight` : "Medals are separate from game scores"}</small></span></div>`,
            );
          beep(score > target ? 880 : 550);
        } catch (error) {
          if (generation !== gameGeneration) return;
          body.innerHTML =
            "<h2>Round not saved yet</h2><p>" +
            escapeText((error as Error).message) +
            '</p><button class="primary" id="retry-result">Try saving again</button><button class="secondary" data-open="arcade">Back to arcade</button>';
          body
            .querySelector("#retry-result")!
            .addEventListener("click", () => void render());
        }
      };
      await render();
    },
    () => beep(620),
    run?.seed,
  );
}

document.addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>("button");
  if (!b || b.disabled) return;
  if (b.dataset.lookTab) {
    wardrobeTab = b.dataset.lookTab;
    open("wardrobe");
    return;
  }
  if (b.dataset.boardTab) {
    boardTab = b.dataset.boardTab;
    renderSharedBoard();
    return;
  }
  if (b.dataset.boardGame) {
    boardGame = b.dataset.boardGame as GameId;
    renderSharedBoard();
    return;
  }
  if (b.dataset.account !== undefined) {
    void openAccount();
    return;
  }
  if (b.dataset.report) {
    reportPlayer(b.dataset.report);
    return;
  }
  if (b.dataset.dare) {
    void startGame(b.dataset.gameId as GameId, "", b.dataset.dare);
    return;
  }
  if (b.dataset.postDare) {
    b.disabled = true;
    void api("dares", { run: b.dataset.postDare })
      .then(() => {
        toast("Your dare is live for 24 hours.");
        void syncSocial();
      })
      .catch((err) => {
        toast(err.message);
        b.disabled = false;
      });
    return;
  }
  if (b.id === "start-game") playtestEvent("round-started");
  if (b.dataset.player) {
    showPlayer(b.dataset.player);
    return;
  }
  if (b.dataset.environment) {
    startOutdoor(b.dataset.environment);
    return;
  }
  if (b.dataset.resident) {
    showResident(b.dataset.resident);
    return;
  }
  if (b.dataset.away) {
    save.awayActivity = b.dataset.away as ActivityId;
    persist();
    open("away");
    return;
  }
  if (b.dataset.open) {
    open(b.dataset.open);
    return;
  }
  if (b.dataset.walk) {
    const id = b.dataset.walk;
    close();
    if (is2d) {
      visit(id);
      open(id);
    } else {
      world?.go(id);
      toast(`Let’s wander over to ${spots.find((s) => s.id === id)?.name}.`);
    }
    return;
  }
  if (b.dataset.game) {
    startGame(b.dataset.game as GameId);
    return;
  }
  if (b.dataset.challenge) {
    void startGame(b.dataset.challenge as GameId, b.dataset.defender);
    return;
  }
  if (b.dataset.replay) {
    playtestEvent("replay-chosen");
    void startGame(b.dataset.replay as GameId);
    return;
  }
  if (b.dataset.gift !== undefined) {
    if (claimGift(save, Number(b.dataset.gift))) {
      progress("gift", Number(b.dataset.gift));
      persist();
      world?.updateAvatar();
      open("shop");
      toast("A new look, on the house. +30 XP");
      beep(880);
    }
    return;
  }
  for (const key of [
    "outfit",
    "skin",
    "hat",
    "gender",
    "clothing",
    "hair",
    "pet",
    "accessory",
  ] as const)
    if (b.dataset[key] !== undefined) {
      save[key] = Number(b.dataset[key]);
      persist();
      world?.updateAvatar();
      const scroll = modal.scrollTop;
      open("wardrobe");
      modal.scrollTop = scroll;
      body
        .querySelector<HTMLButtonElement>(`[data-${key}="${save[key]}"]`)
        ?.focus();
      return;
    }
  if (b.dataset.claim) {
    const m = missions.find((m) => m.id === b.dataset.claim)!;
    if (missionProgress(save, m.id) >= m.total && !save.claims.includes(m.id)) {
      save.claims.push(m.id);
      progress("claim", m.id);
      save.xp += m.xp;
      persist();
      open("quests");
      toast(`A little adventure, well rewarded. +${m.xp} XP`);
    }
    return;
  }
  if (b.dataset.emote) {
    const id = b.dataset.emote;
    close();
    world?.act(id);
    toast(
      is2d
        ? "Your avatar sends a little neighbourhood cheer!"
        : "A little main-character moment.",
    );
    return;
  }
  if (b.dataset.action) {
    const a = b.dataset.action;
    if (a === "welcome-start" || a === "welcome-resume") {
      save.welcomeDismissed = false;
      if (save.welcome === "new") save.welcome = "cabinet";
      persist();
      playtestEvent("welcome-start");
      if (is2d) void startGame("noodle");
      else startOutdoor("cabinet-noodle");
      return;
    }
    if (a === "welcome-skip") {
      save.welcomeDismissed = true;
      persist();
      return;
    }
    if (a === "welcome-wear") {
      progress("welcome-wear");
      if (!save.unlockedHats.includes(2)) return;
      save.hat = 2;
      save.welcome = "complete";
      persist();
      world?.updateAvatar();
      playtestEvent("cosmetic-worn");
      close();
      if (is2d) open("cat");
      else startOutdoor("pet");
      return;
    }
    if (a === "phone-camera" || a === "phone-reset") {
      close();
      document
        .querySelector<HTMLButtonElement>(
          a === "phone-camera" ? "#camera-toggle" : "#reset-view",
        )!
        .click();
      return;
    }
    if (a === "phone-test") {
      openPhoneTest();
      return;
    }
    if (a === "save-phone-test") {
      void savePhoneTest();
      return;
    }

    if (a === "stop-interaction") {
      world?.cancelInteraction();
      return;
    }
    if (a === "close-inspector") {
      dismissInspector();
      return;
    }
    if (a === "start-away") {
      close();
      enterAway();
      return;
    }
    if (a === "save-away") {
      persist();
      close();
      toast(`Away activity saved: ${activities[save.awayActivity].name}.`);
      return;
    }
    if (a === "return-lobby") {
      save.away = false;
      save.awaySince = 0;
      world?.setAway(false);
      dismissInspector();
      renderAway();
      persist();
      toast("Welcome back, neighbour.");
      return;
    }
    if (["wardrobe", "arcade"].includes(a)) {
      open(a);
      return;
    }
    if (a === "pet") {
      beep(240);
      toast("Prrrr. You have been approved by Kopi.");
      return;
    }
    if (a === "2d") {
      if (is2d) {
        save.twoD = false;
        persist();
        location.reload();
        return;
      }
      enable2D();
      close();
      return;
    }
    close();
    if (a === "done-look") toast("Fresh look. Same excellent you.");
    if (a === "dragon-pose") world?.act("victory");
    if (a === "rest")
      toast("Take your time. You’re right where you need to be.");
  }
});
document.querySelector("#close-modal")!.addEventListener("click", close);
modal.addEventListener("cancel", (e) => {
  e.preventDefault();
  close();
});
modal.addEventListener("click", (e) => {
  if (e.target === modal) {
    const r = modal.getBoundingClientRect();
    if (
      e.clientX < r.left ||
      e.clientX > r.right ||
      e.clientY < r.top ||
      e.clientY > r.bottom
    )
      close();
  }
});
document.addEventListener("change", (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === "setting-sound") {
    save.sound = el.checked;
    beep();
    startTune();
  }
  if (el.id === "setting-reduced") {
    save.reduced = el.checked;
    world?.setReduced(el.checked);
  }
  if (el.id === "setting-light") {
    save.light = el.value;
    world?.setLighting(el.value);
  }
  persist();
});
document.querySelector("#sound-toggle")!.addEventListener("click", () => {
  save.sound = !save.sound;
  persist();
  beep();
  startTune();
});
document
  .querySelector("#rotate-left")!
  .addEventListener("click", () => world?.rotate(-0.2));
document
  .querySelector("#rotate-right")!
  .addEventListener("click", () => world?.rotate(0.2));
document.querySelector("#reset-view")!.addEventListener("click", () => {
  dismissInspector();
  world?.resetView();
  renderCameraUI();
});
document
  .querySelector("#zoom-in")!
  .addEventListener("click", () => world?.setZoom(0.15));
document
  .querySelector("#zoom-out")!
  .addEventListener("click", () => world?.setZoom(-0.15));
document
  .querySelector("#interaction")!
  .addEventListener("click", () => open(nearId));
document.querySelector(".brand")!.addEventListener("click", (e) => {
  e.preventDefault();
  if (modal.open) close();
  dismissInspector();
  world?.resetView();
  renderCameraUI();
});
function renderCameraUI() {
  const third = world
    ? world.cameraMode === "third"
    : save.cameraMode === "third";
  document.body.classList.toggle("third-person", third && !is2d);
  const button = document.querySelector("#camera-toggle")!;
  button.querySelector("span")!.textContent = third
    ? "Bird’s-eye view"
    : "Third person";
  button.setAttribute(
    "aria-label",
    third ? "Switch to bird’s-eye view" : "Switch to third-person view",
  );
  (document.querySelector("#camera-hint") as HTMLElement).hidden =
    !third || is2d;
  document.querySelector("#camera-hint")!.textContent = world?.inspectedId
    ? "Drag to orbit · scroll / pinch to zoom · Esc to return"
    : document.body.classList.contains("is-interacting")
      ? "Drag to look · scroll / pinch to zoom · Esc to stop"
      : "Drag to look · scroll / pinch to zoom · WASD to walk";
}
document
  .querySelector(".neighbour-tools")!
  .insertAdjacentHTML(
    "beforeend",
    `<button data-open="surroundings">${icon("star")}<span>Play outside</span></button>`,
  );
document
  .querySelector(".hud")!
  .insertAdjacentHTML(
    "beforeend",
    `<aside id="action-banner" class="action-banner" aria-live="polite" hidden><span class="action-status">LET’S GO OUTSIDE</span><strong></strong><span class="action-track" aria-hidden="true"><i></i></span><button data-action="stop-interaction">Stop <kbd>Esc</kbd></button></aside>`,
  );
function startOutdoor(id: string) {
  if (is2d) {
    toast("Switch to 3D in Settings to play with the surroundings.");
    return;
  }
  if (modal.open) close();
  dismissInspector();
  void world?.interact(id);
}
window.addEventListener("world-interaction", (event) => {
  const d = (event as CustomEvent).detail;
  const active = ["loading", "walking", "playing"].includes(d.phase);
  if (d.id === "cabinet-noodle") playtestEvent(`welcome-${d.phase}`);
  const banner = document.querySelector<HTMLElement>("#action-banner")!;
  banner.hidden = !active;
  document.body.classList.toggle("is-interacting", active);
  banner.querySelector("strong")!.textContent = d.title || "";
  banner.querySelector(".action-status")!.textContent =
    d.phase === "playing"
      ? "A LITTLE MAIN-CHARACTER MOMENT"
      : d.phase === "loading"
        ? "GETTING READY"
        : "WALKING OVER";
  (banner.querySelector(".action-track i") as HTMLElement).style.width = "0%";
  renderCameraUI();
  renderAway();
  if (d.phase === "walking") persist();
  if (
    d.id === "cabinet-noodle" &&
    d.phase === "error" &&
    save.welcome === "cabinet"
  ) {
    toast(
      "The cabinet animation couldn’t load. You can still play your first round.",
    );
    void startGame("noodle");
  }
  if (d.phase === "playing" && d.id === "bell") beep(1100);
  if (d.phase === "error") toast(d.message);
  if (d.phase === "complete") {
    if (d.id === "pet" && !save.cat) {
      save.cat = true;
      progress("cat");
      save.xp += 15;
      visit("cat");
      persist();
      toast("A new friend. Kopi approves! +15 XP");
    } else if (!d.id?.startsWith("cabinet-"))
      toast("A little moment, just for you. Try another spot.");
  }
});
window.addEventListener("world-interaction-progress", (event) => {
  (document.querySelector(".action-track i") as HTMLElement).style.width =
    `${Math.round((event as CustomEvent<number>).detail * 100)}%`;
});
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !modal.open) dismissInspector();
});
function dismissInspector() {
  document.body.classList.remove("inspecting");
  const el = document.querySelector<HTMLElement>("#inspector");
  if (el && !el.hidden) {
    el.hidden = true;
    delete el.dataset.player;
    world?.endInspection();
    renderCameraUI();
  }
}
function showResident(id: string) {
  const r = residents.find((r) => r.id === id);
  if (!r) return;
  if (modal.open) close();
  dismissInspector();
  const detail = `<span class="eyebrow">EXAMPLE NEIGHBOUR · AWAY ACTIVITY</span><h3>${r.name}</h3><p>${r.bio}</p><div class="resident-outfit"><i style="background:${outfits[r.outfit]}"></i><span>${["Lime", "Lilac", "Coral", "Sky", "Gold", "Cream"][r.outfit]} outfit · ${["No hat", "Bucket hat", "Lilac cap", "Sprout hat"][r.hat]}</span></div><strong>${activities[r.activity].icon} ${activities[r.activity].name}</strong>`;
  if (is2d) {
    openShell("YOUR NEIGHBOURHOOD");
    body.innerHTML = `${detail}<div class="note">Switch to 3D in Settings to orbit, zoom, and watch this activity.</div>`;
    return;
  }
  world?.inspectResident(id);
  renderCameraUI();
  const inspector = document.querySelector<HTMLElement>("#inspector")!;
  inspector.innerHTML = `<button class="close-button" data-action="close-inspector" aria-label="Stop inspecting neighbour">×</button>${detail}<p class="fine-print">Drag the world to orbit. Scroll, pinch, or use + / − to inspect their outfit.</p>`;
  inspector.hidden = false;
  document.body.classList.add("inspecting");
}
function renderAway() {
  const banner = document.querySelector<HTMLElement>("#away-banner")!;
  banner.hidden = !save.away;
  banner.querySelector("span")!.textContent =
    `${activities[save.awayActivity].icon} You’re away · ${activities[save.awayActivity].name}`;
  document.body.classList.toggle("is-away", save.away);
}
function enterAway() {
  dismissInspector();
  save.away = true;
  save.awaySince = Date.now();
  world?.setAway(true);
  renderAway();
  persist();
  toast(
    "Your avatar is staying downstairs. Neighbours can challenge your saved scores.",
  );
}
document.querySelector("#camera-toggle")!.addEventListener("click", () => {
  dismissInspector();
  world?.setCameraMode(world.cameraMode === "third" ? "isometric" : "third");
  renderCameraUI();
  persist();
});
window.addEventListener("camera-change", () => {
  dismissInspector();
  renderCameraUI();
  persist();
});
window.addEventListener("offline", () => {
  if (modal.open) close();
  enterAway();
  toast(
    "Connection lost. Your chosen away activity is running on this device.",
  );
});
window.addEventListener("online", () =>
  toast("Connection restored. Choose “I’m back” when you’re ready."),
);
window.addEventListener("pagehide", () => {
  if (!save.away) {
    save.away = true;
    save.awaySince = Date.now();
  }
  writeSave(save);
  navigator.sendBeacon(
    "/api/leave",
    new Blob([JSON.stringify(presenceData())], { type: "application/json" }),
  );
});
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    world?.setAway(save.away);
    renderAway();
  }
});
function enable2D() {
  is2d = true;
  save.twoD = true;
  persist();
  world?.dispose();
  world = null;
  document.body.classList.add("mode-2d");
  const el = document.querySelector<HTMLDivElement>("#fallback")!;
  el.hidden = false;
  el.innerHTML = `<span class="eyebrow">THE LIGHTWEIGHT NEIGHBOURHOOD</span><h1>Come on in.<br>Make yourself at home.</h1><p>Same good times. A lighter way to play.</p><section id="fallback-welcome"></section><div class="fallback-zones">${spots.map((s, i) => `<button data-walk="${s.id}">${icon(["game", "trophy", "gift", "shirt", "trophy", "leaf", "cat", "star"][i])}<strong>${s.name}</strong><span>COME ON OVER →</span></button>`).join("")}</div>`;
  document.querySelector("#quality-note")!.textContent = "2D LOBBY";
  renderWelcome();
}
const stick = document.querySelector<HTMLDivElement>("#joystick")!,
  knob = stick.querySelector("span")!;
function moveStick(e: PointerEvent) {
  if (!world) return;
  const r = stick.getBoundingClientRect(),
    dx = e.clientX - r.left - r.width / 2,
    dy = e.clientY - r.top - r.height / 2;
  const l = Math.hypot(dx, dy),
    factor = Math.min(1, 32 / Math.max(l, 1));
  knob.style.transform = `translate(${dx * factor}px,${dy * factor}px)`;
  world.joystick = { x: (dx * factor) / 32, y: (dy * factor) / 32 };
}
stick.addEventListener("pointerdown", (e) => {
  stick.setPointerCapture(e.pointerId);
  moveStick(e);
});
stick.addEventListener("pointermove", (e) => {
  if (stick.hasPointerCapture(e.pointerId)) moveStick(e);
});
for (const event of ["pointerup", "pointercancel", "lostpointercapture"])
  stick.addEventListener(event, () => {
    knob.style.transform = "";
    if (world) world.joystick = { x: 0, y: 0 };
  });
function updateClock() {
  document.querySelector("#sgt-clock")!.textContent =
    new Intl.DateTimeFormat("en-SG", {
      timeZone: "Asia/Singapore",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date()) + " SGT";
  if (save.week !== singaporeWeek()) {
    save.week = singaporeWeek();
    save.coins = [];
    world?.coins.forEach((c) => (c.visible = true));
    persist();
  }
  renderStats();
  if (save.light === "auto") world?.setLighting("auto");
}
updateClock();
setInterval(updateClock, 60_000);
setInterval(() => {
  if (
    profileReady &&
    !document.hidden &&
    !document.querySelector("#account-dialog[open]")
  ) {
    activeMinutes++;
    if (activeMinutes === 30) {
      open("break");
      activeMinutes = 0;
    }
  }
}, 60_000);
renderStats();
const accountReady = ensureAccount().then((p) => {
  try {
    if (!localStorage.getItem("darecade-preview-backup")) {
      const old = localStorage.getItem("darecade-v1");
      if (old) localStorage.setItem("darecade-preview-backup", old);
    }
  } catch {}
  Object.assign(save, p.progress);
  profileReady = true;
  sentPreferences = JSON.stringify(
    Object.fromEntries(preferenceKeys.map((k) => [k, save[k]])),
  );
  renderStats();
  void syncSocial();
  return p;
});
window.addEventListener("account-profile", ((event: CustomEvent<Profile>) => {
  if (!profileReady) return;
  const away = save.away,
    awaySince = save.awaySince;
  Object.assign(save, event.detail.progress, { away, awaySince });
  writeSave(save);
  world?.updateAvatar();
  renderStats();
  renderWelcome();
}) as EventListener);
window.addEventListener("account-refresh", () => void syncSocial());
requestAnimationFrame(async () => {
  try {
    await accountReady;
    if (save.twoD) {
      enable2D();
      renderAway();
      document.querySelector("#loading")!.remove();
      return;
    }
    await loadCharacter();
    world = new LobbyWorld(document.querySelector("#world")!, save, {
      interact: open,
      visit,
      coin: collect,
      near: (name, id) => {
        nearId = id;
        const b = document.querySelector<HTMLButtonElement>("#interaction")!;
        b.hidden = !id;
        b.querySelector("span")!.textContent = name;
      },
      fallback: () => {
        enable2D();
        toast(
          "Switched to the lightweight lobby. Your games and progress are still here.",
        );
      },
    });
    if (!navigator.onLine && !save.away) {
      save.away = true;
      save.awaySince = Date.now();
      persist();
    }
    if (save.away) world.setAway(true);
    renderCameraUI();
    renderAway();
  } catch (error) {
    if (!profileReady) {
      const loading = document.querySelector("#loading")!;
      const setupPending =
        error instanceof Error &&
        error.message.startsWith("Darecade is being set up.");
      loading.innerHTML = setupPending
        ? '<h2>Your neighbourhood is nearly ready.</h2><p>We’re finishing sign-in and privacy setup before opening the gates. Please come back soon.</p><button class="primary" id="retry-welcome">Check again</button>'
        : '<h2>The neighbourhood is taking a moment.</h2><p>We need the server for your welcome and privacy check.</p><button class="primary" id="retry-welcome">Try again</button>';
      if (setupPending)
        document.querySelector(".demo-tag")!.textContent = "OPENING SOON";
      loading
        .querySelector("button")!
        .addEventListener("click", () => location.reload());
      return;
    }
    console.warn("3D unavailable. Using accessible lobby.", error);
    enable2D();
  }
  document.querySelector("#loading")!.remove();
});
function escapeText(value: string) {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
function presenceData() {
  return {
    connection,
    away: save.away,
    activity: save.awayActivity,
    look: {
      outfit: save.outfit,
      skin: save.skin,
      hat: save.hat,
      gender: save.gender,
      clothing: save.clothing,
      hair: save.hair,
      pet: save.pet,
      accessory: save.accessory,
    },
    x: world?.player.root.position.x,
    z: world?.player.root.position.z,
    yaw: world?.player.root.rotation.y,
  };
}
async function syncSocial() {
  if (!profileReady || syncing) return;
  syncing = true;
  try {
    shared = await api<SharedState>("presence", presenceData());
    const signature = JSON.stringify([
      shared.day,
      shared.players.map((p) => [
        p.id,
        p.name,
        p.status,
        p.look,
        p.activity,
        p.points,
        p.incoming,
        p.outgoing,
        p.wins,
        p.best,
      ]),
      shared.boards,
      shared.weekly,
      shared.history,
    ]);
    const changed = signature !== sharedSignature || !connected;
    sharedSignature = signature;
    connected = true;
    const me = shared.players.find((p) => p.id === shared!.me)!;
    document.querySelector("#player-name")!.textContent = me.name;
    document.querySelector("#medal-points")!.textContent =
      `${me.points} MEDAL POINTS`;
    document.querySelector(".demo-tag")!.textContent = "SHARED NEIGHBOURHOOD";
    world?.syncPlayers(shared.players, shared.me);
    if (changed && modal.open && socialPanel === "board") renderSharedBoard();
    if (changed && modal.open && socialPanel === "dares") renderSharedDares();
    if (changed && modal.open && socialPanel === "neighbours")
      renderSharedNeighbours();
    const inspector = document.querySelector<HTMLElement>("#inspector")!;
    if (changed && !inspector.hidden && inspector.dataset.player)
      renderPlayerInspector(inspector.dataset.player);
  } catch {
    connected = false;
    document.querySelector(".demo-tag")!.textContent = "SERVER OFFLINE";
    if (modal.open && socialPanel === "board") renderSharedBoard();
    if (modal.open && socialPanel === "dares") renderSharedDares();
  } finally {
    syncing = false;
  }
}
function serverNote() {
  return connected
    ? ""
    : '<div class="note">The neighbourhood server is unavailable. Rankings below may be out of date. Challenges need a connection.</div>';
}
function playerRows() {
  return (
    shared?.players
      .filter((p) => p.id !== shared!.me)
      .map(
        (p) =>
          `<button data-player="${p.id}"><span class="resident-swatch" style="background:${outfits[p.look.outfit]}">${activities[p.activity].icon}</span><span><strong>${escapeText(p.name)}</strong><small>${p.status.toUpperCase()} · ${p.points} medal points · ${p.incoming} challenges received today</small></span><b>VISIT ↗</b></button>`,
      )
      .join("") ||
    '<div class="note">You’re the first neighbour here. Another browser profile can join this server to play alongside you.</div>'
  );
}
function renderSharedNeighbours() {
  body.innerHTML = `<h2>Your neighbours.<br>Still downstairs.</h2><p class="lead">Visit a saved avatar, inspect their outfit, or challenge their best while they’re resting.</p>${serverNote()}<div class="resident-list">${playerRows()}</div><h3>Around the block</h3><p class="fine-print">Community characters bring the park to life. They don’t compete for medals.</p><div class="resident-list">${residents.map((r) => `<button data-resident="${r.id}"><span class="resident-swatch" style="background:${outfits[r.outfit]}">${activities[r.activity].icon}</span><span><strong>${r.name}</strong><small>COMMUNITY CHARACTER · ${activities[r.activity].name}</small></span><b>VISIT ↗</b></button>`).join("")}</div>`;
}
function renderSharedBoard() {
  const me = shared?.players.find((p) => p.id === shared?.me);
  const week = shared?.weekly || [];
  const ownWeek = week.find((p) => p.id === shared?.me);
  const board = shared?.boards[boardGame] || [];
  const ownDay = board.find((p) => p.id === shared?.me);
  const pending = gameIds.reduce((sum, g) => {
    const r = shared?.boards[g].find((p) => p.id === shared?.me)?.rank;
    return sum + (r && r <= 3 ? 4 - r : 0);
  }, 0);
  const list =
    boardTab === "week"
      ? week.map((p) => ({ ...p, value: p.points }))
      : board.map((p) => ({ ...p, value: p.score }));
  const unit = boardTab === "week" ? "MEDAL PTS" : "GAME SCORE";
  const rank = boardTab === "week" ? ownWeek?.rank : ownDay?.rank;
  const podium = list.filter((p) => p.rank <= 3);
  body.innerHTML = `<span class="eyebrow">YOUR NEIGHBOURHOOD LEAGUE</span><h2>Small wins.<br>Something to show for them.</h2>${serverNote()}<section class="your-standing"><div><span>YOUR ${boardTab === "week" ? "WEEKLY" : "DAILY"} RANK</span><strong>${rank ? "#" + rank : "—"}</strong><small>${rank ? "Keep playing at your own pace" : shared?.competitionReady ? "Set a score to join the board" : "Practice now · ranked play unlocks after verification + 24h"}</small></div><div class="standing-stats"><span><b>${ownWeek?.points || 0}</b>This week</span><span><b>${pending ? "+" + pending : "0"}</b>Pending tonight</span><span><b>${me?.points || 0}</b>Lifetime</span></div></section><div class="look-tabs board-tabs"><button data-board-tab="week" class="${boardTab === "week" ? "active" : ""}" aria-pressed="${boardTab === "week"}">Weekly medals</button><button data-board-tab="daily" class="${boardTab === "daily" ? "active" : ""}" aria-pressed="${boardTab === "daily"}">Today’s game scores</button></div>${boardTab === "daily" ? `<div class="game-filters">${gameIds.map((g) => `<button class="secondary ${g === boardGame ? "chosen" : ""}" data-board-game="${g}" aria-pressed="${g === boardGame}">${games[g].name}</button>`).join("")}</div><p class="fine-print">${games[boardGame].name} · Your best today: <b>${ownDay?.score || 0}</b> · Medals are pending until 00:00 SGT.</p>` : `<p class="fine-print">Week of ${shared?.week || "Monday"} · Awarded daily medals only. A fresh board every Monday, 00:00 SGT.</p>`}<div class="podium-cards">${podium.length ? podium.map((p) => `<article class="podium-card medal-${p.rank} ${p.id === shared?.me ? "is-you" : ""}"><span class="podium-medal">${["🥇", "🥈", "🥉"][p.rank - 1]}</span><small>RANK ${p.rank}${p.id === shared?.me ? " · YOU" : ""}</small><h3>${escapeText(p.name)}</h3><strong>${p.value}</strong><small>${unit}${boardTab === "daily" ? ` · +${4 - p.rank} PENDING` : ""}</small></article>`).join("") : `<div class="board-empty"><span>✦</span><h3>${boardTab === "week" ? "Your next chapter starts at zero." : "The first spot is open."}</h3><p>${boardTab === "week" ? "Finish today’s games. Top-three scores earn medals at midnight." : "Finish a ranked round to set today’s first score."}</p><button class="primary" data-game="${boardGame}">Play ${games[boardGame].name} →</button></div>`}</div>${list.length ? `<div class="leaderboard">${list.map((p) => `<div class="${p.id === shared?.me ? "you-row" : ""}"><b>#${p.rank}</b><span>${escapeText(p.name)}${p.id === shared?.me ? " · You" : ""}</span><strong>${p.value}<small>${unit}</small></strong></div>`).join("")}</div>` : ""}${boardTab === "daily" && ownDay && board[0] ? `<div class="score-target"><label>Your score compared with today’s leader <b>${ownDay.score} / ${board[0].score}</b></label><progress value="${ownDay.score}" max="${Math.max(1, board[0].score)}"></progress></div>` : ""}${boardTab === "daily" ? `<button class="primary" data-game="${boardGame}">Play ${games[boardGame].name} →</button>` : ""}<details class="scoring-guide"><summary>How scores become medals</summary><div class="medal-rule"><span>🥇<b>+3</b>Gold</span><span>🥈<b>+2</b>Silver</span><span>🥉<b>+1</b>Bronze</span></div><p>1. Play any of the four daily games. Your best positive score counts.</p><p>2. At midnight Singapore time, each game awards its top three ranks. Up to 12 medal points a day.</p><p>3. Daily medals build your weekly total. The weekly board resets Monday; lifetime medals stay.</p><p class="fine-print">Ties share a rank (1, 1, 3). Pending medals can change before midnight. Cosmetic XP levels up your avatar and never affects ranks. Dares record wins separately.</p></details><details class="scoring-guide"><summary>Last week’s champions</summary><div class="leaderboard">${(shared?.lastWeek || []).map((p) => `<div><b>#${p.rank}</b><span>${escapeText(p.name)}</span><strong>${p.points}<small>MEDAL PTS</small></strong></div>`).join("") || "<p>No completed week yet.</p>"}</div></details>${!shared?.competitionReady ? '<button class="secondary" data-account>Account & ranked play →</button>' : ""}`;
}
function challengeButtons(p: SharedPlayer) {
  const eligible =
    connected &&
    !!shared?.competitionReady &&
    p.status !== "online" &&
    (shared?.players.find((me) => me.id === shared?.me)?.outgoing || 0) < 3 &&
    !shared?.challenged.includes(p.id) &&
    p.id !== shared?.me;
  const own = shared?.players.find((me) => me.id === shared?.me);
  const match = (g: GameId) =>
    !own?.best[g]
      ? "Set your first best"
      : Math.abs(p.best[g] - own.best[g]) / Math.max(p.best[g], own.best[g]) <=
          0.25
        ? "Close match"
        : p.best[g] > own.best[g]
          ? "Stretch goal"
          : "Sharpen your score";
  return `<div class="challenge-games">${gameIds.map((g) => `<button class="secondary" data-challenge="${g}" data-defender="${p.id}" ${!eligible || p.best[g] === 0 ? "disabled" : ""}><span>${games[g].name}<small>${match(g)}</small></span><b>${p.best[g] ? `Beat ${p.best[g]} →` : "No score yet"}</b></button>`).join("")}</div>`;
}
function renderSharedDares() {
  const candidates =
    shared?.players.filter(
      (p) => p.id !== shared!.me && p.status !== "online",
    ) || [];
  body.innerHTML = `<span class="eyebrow">THREE DARES TO SEND · THREE DIFFERENT NEIGHBOURS</span><h2>A friendly dare.<br>Even while they’re away.</h2><p class="lead">Beat a resting neighbour’s saved best. Their score is locked in when you start.</p>${serverNote()}<div class="note">You have ${Math.max(0, 3 - (shared?.players.find((p) => p.id === shared?.me)?.outgoing || 0))}/3 dares left today. Starting uses your attempt, even if you quit. Choose a different neighbour each time, across all four games. Resets at midnight SGT. Receiving a dare never uses your attempts or removes points. Ties are draws. Wins are recorded separately from medals; regular rounds stay unlimited.</div><div class="offline-dares">${candidates.map((p) => `<section class="ranking-card"><button class="neighbour-heading" data-player="${p.id}">${activities[p.activity].icon} ${escapeText(p.name)} ↗</button><p>${p.status.toUpperCase()} · ${activities[p.activity].name}<br><b>${shared?.challenged.includes(p.id) ? "Already challenged today" : "Ready for a friendly dare"}</b></p>${challengeButtons(p)}</section>`).join("") || '<div class="note">No resting opponents yet. Set a score, then choose “Step away” so a neighbour can challenge you.</div>'}</div><h3>Your recent challenges</h3><div class="challenge-history">${shared?.history.map((r) => `<div><strong>${escapeText(r.challenger)} → ${escapeText(r.defender)}</strong><span>${games[r.game].name} · ${r.status === "finished" ? `${r.score} vs ${r.targetScore} · ${r.score! > r.targetScore ? "CHALLENGER WON" : r.score === r.targetScore ? "TIED" : "DEFENDER HELD"}` : r.status === "started" ? "IN PROGRESS" : "ATTEMPT ENDED"}</span></div>`).join("") || "<p>No challenges yet. There’s no rush.</p>"}</div><button class="secondary" data-open="board">See the daily rankings →</button>`;
  const published = (shared?.dares || [])
    .map(
      (d) =>
        '<section class="ranking-card"><h3>' +
        escapeText(d.name) +
        "</h3><p>" +
        games[d.game].name +
        " · beat <b>" +
        d.score +
        "</b></p><small>Closes " +
        new Date(d.expires).toLocaleString("en-SG", {
          timeZone: "Asia/Singapore",
          day: "numeric",
          month: "short",
          hour: "2-digit",
          minute: "2-digit",
        }) +
        ' SGT</small><button class="primary" data-dare="' +
        d.id +
        '" data-game-id="' +
        d.game +
        '" ' +
        (!shared?.competitionReady ||
        d.host === shared?.me ||
        shared?.challenged.includes(d.host)
          ? "disabled"
          : "") +
        ">Play this same-level dare →</button></section>",
    )
    .join("");
  body.insertAdjacentHTML(
    "afterbegin",
    '<h2>Dares on the plaza.</h2><p>Post up to three verified scores a day. Each dare lasts 24 hours. Every challenger plays the same seeded level. You can send three attempts a day to different neighbours; failed attempts cost no medal points.</p><div class="ranking-grid">' +
      (published ||
        "<p>No open dares yet. Finish a verified round, then post your score.</p>") +
      '</div><details><summary>Post one of my saved rounds</summary><div class="account-actions">' +
      (shared?.recentRuns || [])
        .filter((r) => r.score > 0)
        .map(
          (r) =>
            '<button class="secondary" data-post-dare="' +
            r.id +
            '" ' +
            (!shared?.competitionReady ? "disabled" : "") +
            ">" +
            games[r.game].name +
            " · " +
            r.score +
            " →</button>",
        )
        .join("") +
      '</div></details><p class="fine-print">' +
      (!shared?.competitionReady
        ? "Shared dares open 24 hours after email verification. You can play regular rounds now."
        : "Repeated attempts against the same neighbour do not consume another slot because they are blocked before starting.") +
      "</p>",
  );
}
function renderPlayerInspector(id: string) {
  const p = shared?.players.find((p) => p.id === id);
  if (!p) return;
  const el = document.querySelector<HTMLElement>("#inspector")!;
  el.innerHTML = `<button class="close-button" data-action="close-inspector" aria-label="Stop inspecting neighbour">×</button><span class="eyebrow">${p.status.toUpperCase()} · SAVED NEIGHBOUR</span><h3>${escapeText(p.name)}</h3><p>${p.points} medal points · ${p.wins} challenge wins<br>${activities[p.activity].icon} ${activities[p.activity].name}</p><div class="resident-outfit"><i style="background:${outfits[p.look.outfit]}"></i><span>${clothingNames[p.look.clothing || 0]} · ${petNames[p.look.pet || 0]} · ${accessoryNames[p.look.accessory || 0]}</span></div><strong>${shared?.challenged.includes(p.id) ? "Already challenged today" : "Ready for a friendly dare"}</strong>${challengeButtons(p)}<button class="secondary" data-report="${p.id}">Report or hide this player</button><p class="fine-print">Starting uses one of your three daily dares. Beat their saved score to win. Drag to orbit; scroll or pinch to zoom.</p>`;
}
function showPlayer(id: string) {
  if (!shared?.players.some((p) => p.id === id)) return;
  if (is2d) {
    openDares();
    return;
  }
  if (modal.open) close();
  dismissInspector();
  world?.inspectResident(`player:${id}`);
  renderCameraUI();
  const el = document.querySelector<HTMLElement>("#inspector")!;
  el.dataset.player = id;
  renderPlayerInspector(id);
  el.hidden = false;
  document.body.classList.add("inspecting");
}
void syncSocial();
window.setInterval(() => void syncSocial(), 2000);

function renderWelcome() {
  document.body.classList.toggle("welcome-played", save.welcome === "played");
  const next = document.querySelector<HTMLElement>("#phone-next");
  if (next) {
    next.hidden = !["played", "complete"].includes(save.welcome);
    next.innerHTML =
      save.welcome === "played"
        ? '<span>YOUR CAP IS READY</span><button data-action="welcome-wear">Wear it & meet Kopi →</button>'
        : !save.cat
          ? '<span>NEXT LITTLE ADVENTURE</span><button data-walk="cat">Say hello to Kopi →</button>'
          : '<span>TRY SOMETHING NEW</span><button data-game="hop">Play Hop Hop →</button>';
  }

  const fallback = document.querySelector("#fallback-welcome");
  if (fallback)
    fallback.innerHTML =
      save.welcome === "complete"
        ? ""
        : `<div class="note"><strong>Your first little victory.</strong><p>Finish one short round at any score. Unlock a lilac cap and +35 bonus XP.</p><button class="primary" data-action="${save.welcome === "played" ? "welcome-wear" : "welcome-resume"}">${save.welcome === "played" ? "Wear my cap & meet Kopi" : "Play my first round"} →</button></div>`;
  const el = document.querySelector<HTMLElement>(".welcome-panel");
  if (!el) return;
  const active = save.welcome !== "complete" && !save.welcomeDismissed;
  document.body.classList.toggle("welcome-active", active);
  const stage = save.welcome;
  if (!active) {
    el.innerHTML = `<div class="eyebrow">MEET YOU DOWNSTAIRS</div><h1>Good times.<br>Great company.</h1><button class="primary" data-open="arcade">Choose a game →</button>${stage !== "complete" ? `<button class="welcome-later" data-action="${stage === "played" ? "welcome-wear" : "welcome-resume"}">${stage === "played" ? "Wear my unlocked cap" : "Resume welcome quest"}</button>` : ""}`;
    return;
  }
  el.innerHTML = `<div class="eyebrow">WELCOME QUEST · ${stage === "new" ? "1" : stage === "cabinet" ? "2" : "3"} OF 3</div><h1>${stage === "played" ? "That’s your<br>first little win." : stage === "cabinet" ? "Your cabinet<br>is this way." : "Your first<br>little victory."}</h1><p>${stage === "played" ? "Your lilac cap is unlocked. Wear it, then say hello to Kopi the cat." : stage === "cabinet" ? "Follow the path to Noodle Run. Finish a round at any score to unlock your cap." : "Play one short round. Unlock a lilac cap. Make yourself at home."}</p><ol class="welcome-steps" aria-label="Welcome quest progress"><li class="${stage !== "new" ? "done" : ""}">Find a cabinet</li><li class="${stage === "played" ? "done" : ""}">Finish a round</li><li class="${stage === "played" ? "done" : ""}">Unlock your cap</li></ol><button class="primary" data-action="${stage === "played" ? "welcome-wear" : "welcome-start"}">${stage === "played" ? "Wear it & meet Kopi →" : stage === "cabinet" ? "Take me to my cabinet →" : "Show me the arcade →"}</button><button class="welcome-later" data-action="welcome-skip">I’ll explore on my own</button>`;
}
renderWelcome();

function openPhoneTest() {
  openShell("PHONE PLAYTEST · YOUR OBSERVATIONS");
  const questions = [
    [
      "movement",
      "Moving around felt…",
      ["Easy", "A little awkward", "Hard to control"],
    ],
    [
      "readability",
      "Text and buttons were…",
      ["Easy to read and tap", "Some were too small", "Hard to read or tap"],
    ],
    [
      "performance",
      "The world and games felt…",
      ["Smooth", "Occasional stutters", "Often slow or stuck"],
    ],
    [
      "nextStep",
      "After the first round, the next step was…",
      ["Obvious", "I had to look for it", "I didn’t know what to do"],
    ],
    ["replay", "Did you want another round?", ["Yes", "Maybe later", "No"]],
  ];
  body.innerHTML = `<h2>How did it feel?</h2><p class="lead">Explore for about two minutes first. There are no right answers.</p><form id="phone-report"><label class="phone-field">Phone and browser<input name="device" required maxlength="100" value="${/iPhone/.test(navigator.userAgent) ? "iPhone · Safari" : ""}" placeholder="e.g. iPhone 17 · Safari"></label>${questions.map(([id, label, choices]) => `<label class="phone-field">${label}<select name="${id}" required><option value="">Choose an answer</option>${(choices as string[]).map((c) => `<option>${c}</option>`).join("")}</select></label>`).join("")}<label class="phone-field">Anything confusing or frustrating?<textarea name="notes" maxlength="1200" rows="3" placeholder="What happened, and where?"></textarea></label><p class="fine-print">Saves your answers, browser details, frame-rate samples and quest timings on this computer when you tap Save.</p><button class="primary" type="submit">Save phone test →</button><div id="phone-report-status" role="status"></div></form>`;
  body.querySelector("form")!.addEventListener("submit", (e) => {
    e.preventDefault();
    void savePhoneTest();
  });
}
async function savePhoneTest() {
  const form = body.querySelector<HTMLFormElement>("#phone-report");
  if (!form || !form.reportValidity()) return;
  const button = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  button.disabled = true;
  const answers: Record<string, string> = {};
  new FormData(form).forEach((v, k) => (answers[k] = String(v)));
  try {
    const result = await api<{ id: string }>("playtest", {
      answers,
      measurements: playtestSummary(),
    });
    body.innerHTML = `<h2>Thanks for playing.</h2><p class="lead">Your phone test is saved on this computer.</p><div class="note">Report ${escapeText(result.id)}</div><button class="primary" data-action="close">Back downstairs →</button>`;
  } catch {
    button.disabled = false;
    form.querySelector("#phone-report-status")!.textContent =
      "Couldn’t save the report. Check your Wi-Fi connection and try again.";
  }
}
if (playtestEnabled)
  document
    .querySelector(".hud")!
    .insertAdjacentHTML(
      "beforeend",
      '<button class="phone-test-button" data-action="phone-test">Phone test · feedback</button>',
    );
