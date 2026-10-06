import { bindJoystick } from "./joystick";
import { rooftops } from "./rooftops";
import { mountPayments } from "./payments";
import {
  wardrobeBrowser,
  wardrobeSections,
  wardrobeFilters,
  type WardrobeSection,
  type WardrobeFilter,
  collectionLabels,
  tokenSummary,
  itemLook,
  itemName,
  wearable,
  hatShelf,
  type WardrobeTab,
  type Collection,
  type TryOn,
} from "./wardrobe";
import { legendarySets, tokenLooks, styleTokens } from "./collections";
import { audio, petSound, type Sfx } from "./audio";
import { showStyleReward } from "./style-reward";
import { celebrate } from "./celebration";
import { createArcadeFx, type ArcadeFx } from "./arcade-fx";
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
import type { SeasonStanding } from "./season";
import { WorldConnection } from "./world-connection";
import { WorldPicker, worldCode } from "./world-picker";
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
import { RacingGame } from "./racing-game";
import { raceComparison } from "./race-results";
import { mountFishing, mountHoops, mountPlots } from "./activities";
import { mountStage } from "./stage-game";
import { mountRelay } from "./relay-game";

import { OutdoorGame } from "./outdoor-game";
import { acceptPendingInvite, captureInvite, mountInvite } from "./invite";
import { ordinal, type RaceResult } from "../shared/racing";
import type { Replay } from "../shared/simulation";
import {
  games,
  gameIds,
  playIds,
  formatScore,
  activities,
  type ActivityId,
} from "./catalog";
import { residents } from "./neighbourhood";
import {
  readSave,
  completeWelcomeRound,
  firstRoundGoalPending,
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
import "./arcade-theme.css";
import "./wardrobe.css";
import "./lobby-ui.css";
import "./mobile-hud.css";
import "./joystick.css";
import {
  menuPages,
  isMenuPage,
  firstVisitCopy,
  pageChoices,
  dareHoldCopy,
  dareBlock,
  standingNote,
} from "./lobby-menu";
import { worldPresenceCopy } from "./lobby-presence";
import {
  playMedalGoal,
  playMedalResult,
  latestPlayMedals,
  guestSaveCopy,
  emailSaveCopy,
} from "./play-medals";

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
    '<path d="m9 3-1 3-3 1-2 4 2 2v3l4 3 3-1 3 1 4-3v-3l2-2-2-4-3-1-1-3Z"/><circle cx="12" cy="12" r="3"/>',
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
let game: ArcadeGame | RacingGame | OutdoorGame | null = null;
let wardrobeSection: WardrobeSection = "Outfits";
let wardrobeFilter: WardrobeFilter = "All";
let undoLook: NonNullable<TryOn>["look"] | null = null;
let wardrobeTab: WardrobeTab = "clothing";
let wardrobeCollection: Collection = "starter";
let tryingLook: TryOn = null;
let gamePage = 0;
let outdoorPage = 0;
let emotePage = 0;
let emote2d = { id: "", until: 0 };
let questPage = 0;
// True while a new player is led from their first result through naming and
// dressing their character, on the way to saving it.
let setupGuide = false;
let boardTab = "week";
let boardPeriodChosen = false;
let boardGame: GameId = "noodle";
const challengeGameByPlayer = new Map<string, GameId>();
let neighbourRosterSignature = "";
let dareView: "home" | "neighbour" | "find" = "home";
let boardTarget = "";
let pendingStyleTokens = 0;
let claimingStyleReward = false;
async function claimStyleRewards() {
  if (claimingStyleReward) return;
  claimingStyleReward = true;
  const player = currentProfile?.id;
  try {
    const result = await api<{ tokens: number }>("style-rewards", {});
    if (currentProfile?.id === player) queueStyleTokens(result.tokens);
  } catch {
    /* The next state poll retries unacknowledged notices. */
  } finally {
    claimingStyleReward = false;
  }
}
let dismissStyleReward: (() => void) | null = null;
function flushStyleTokens() {
  if (!pendingStyleTokens || game || document.hidden) return;
  const count = pendingStyleTokens;
  pendingStyleTokens = 0;
  dismissStyleReward?.();
  dismissStyleReward = showStyleReward(count, save.reduced || is2d, () => {
    document.querySelector<HTMLDialogElement>("#account-dialog")?.close();
    wardrobeCollection = "discovery";
    open("wardrobe");
  });
}
function queueStyleTokens(count = 0) {
  if (!Number.isInteger(count) || count <= 0) return;
  pendingStyleTokens += count;
  window.setTimeout(flushStyleTokens, 0);
}
let disposeCelebration: (() => void) | null = null;
let arcadeFx: ArcadeFx | null = null;
function disposeArcadeFx() {
  arcadeFx?.dispose();
  arcadeFx = null;
  modal.querySelector(".arcade-fx")?.remove();
  delete modal.dataset.game;
}
let characterPreview: ReturnType<typeof createCharacterPreview> | null = null;
let shared: SharedState | null = null;
let profileReady = false;
window.addEventListener("session-expired", () => {
  worldConnection.stop();
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
  "body",
  "hat",
  "clothing",
  "hair",
  "pet",
  "accessory",
  "sound",
  "music",
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
      if (p.styleRewards) void claimStyleRewards();
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
let syncing = false;
let syncRequested = false;
let sharedSignature = "";
let is2d = false;
let nearId = "";
let toastTimer = 0;
let lastFocus: HTMLElement | null = null;
let activeMinutes = 0;
const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div id="world"></div><div class="vignette" aria-hidden="true"></div>
  <header class="topbar"><a class="brand" href="#" aria-label="Play Simi home"><span class="brand-mark">p<span>★</span></span><span>PLAY SIMI</span></a><div class="location-pill"><span class="status-dot"></span><span id="current-world">Joining…</span><span class="divider"></span><span id="sgt-clock">SGT</span></div><div class="world-utilities"><button id="camera-toggle" data-action="toggle-camera" aria-label="Switch to third-person view" aria-pressed="false">${icon("camera")}<span>Third person</span></button></div><span class="demo-tag" role="status">Connecting…</span></header>
  <main class="hud"><section class="welcome-panel" aria-label="Welcome"></section>
  <div class="move-hint"><kbd>W</kbd><span><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span><p>Move <i>·</i> tap to walk</p></div>
  <div id="joystick" class="joystick" role="group" aria-label="Drag to walk"><span></span></div>
  <div id="fallback" class="fallback" hidden></div>
  </main>
  <footer class="bottom-bar"><div class="profile"><span class="avatar-icon" id="avatar-icon"><i></i></span><span><strong id="player-name">New neighbour</strong><small id="medal-points">0 MEDALS</small><span id="level-label">LEVEL 1</span><span class="xp-track"><i id="xp-fill"></i></span></span></div><nav class="dock lobby-dock" aria-label="Main actions"><button class="selected" data-open="arcade" data-main-action>${icon("game")}<span>Play</span></button><button data-open="wardrobe" data-main-action>${icon("shirt")}<span>My look</span></button><button class="phone-more" data-open="phone-menu" data-main-action>${icon("settings")}<span>Menu</span></button></nav><span class="footer-note" id="quality-note">3D WORLD</span></footer>
  <div class="world-actions"><button class="round-action" id="quick-emotes-toggle" aria-label="Favourite emotes" aria-expanded="false">${icon("smile")}</button><button class="round-action" data-emote="jump" aria-label="Jump">↑</button></div>
  <div id="quick-emotes" hidden><button data-emote="wave" aria-label="Wave">👋</button><button data-emote="dance" aria-label="Dance">♫</button><button data-emote="cheer" aria-label="Cheer">🙌</button><button data-emote="victory" aria-label="Victory">✌</button><button data-open="emotes">More</button></div>
  <div class="world-zoom"><button data-action="zoom-out" aria-label="Zoom out">−</button><button data-action="zoom-in" aria-label="Zoom in">+</button></div>
  <div id="toast" class="toast" role="status" aria-live="polite"></div>
  <dialog id="modal"><div class="modal-top"><span class="eyebrow" id="modal-kicker">THE NEIGHBOURHOOD</span><button id="close-modal" class="close-button" aria-label="Close panel">×</button></div><div id="modal-body"></div></dialog>
  <div id="loading"><span class="brand-mark">p<span>★</span></span><h2>See you downstairs.</h2><p>Loading…</p><span class="loading-line"></span></div>
`;
document
  .querySelector(".hud")!
  .insertAdjacentHTML(
    "beforeend",
    `<aside id="inspector" class="inspector" aria-label="Neighbour inspection" hidden></aside><div id="away-banner" class="away-banner" hidden><span></span><button data-action="return-lobby">I’m back</button></div><div id="camera-hint" class="camera-hint" hidden></div><button id="interaction" class="nearby-prompt" hidden>${icon("pin")}<span></span><kbd>E</kbd></button>`,
  );
document
  .querySelector("#quick-emotes-toggle")!
  .addEventListener("click", () => {
    const strip = document.querySelector<HTMLElement>("#quick-emotes")!;
    strip.hidden = !strip.hidden;
    document
      .querySelector("#quick-emotes-toggle")!
      .setAttribute("aria-expanded", String(!strip.hidden));
  });
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
function beep(name: Sfx = "click") {
  audio.play(name);
}
function startTune() {
  audio.configure(save.sound, save.music);
  updateMusic();
}
function updateMusic() {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: "Asia/Singapore",
    }).format(new Date()),
  );
  const night =
    save.light === "night" ||
    save.light === "dusk" ||
    (save.light === "auto" && (hour >= 19 || hour < 7));
  audio.setTheme(
    game instanceof RacingGame
      ? "race"
      : game
        ? "game"
        : night
          ? "night"
          : "day",
  );
}
let shownLevel = 0;
let headshotLook = "";
function renderStats() {
  audio.configure(save.sound, save.music);
  const level = 1 + Math.floor(save.xp / 100);
  if (shownLevel && level > shownLevel) beep("levelup");
  shownLevel = level;
  const lookKey = [
    save.outfit,
    save.skin,
    save.body,
    save.hat,
    save.clothing,
    save.hair,
  ].join(":");
  if (world && lookKey !== headshotLook) {
    headshotLook = lookKey;
    const host = document.createElement("div");
    const preview = createCharacterPreview(host, save);
    const image = new Image();
    image.alt = "Your character";
    image.src = preview.thumbnail(save, "hair");
    preview.dispose();
    document.querySelector("#avatar-icon")!.replaceChildren(image);
  }
  document.querySelector("#level-label")!.textContent =
    `LEVEL ${1 + Math.floor(save.xp / 100)}`;
  (document.querySelector("#xp-fill") as HTMLElement).style.width =
    `${save.xp % 100}%`;
  (document.querySelector("#avatar-icon") as HTMLElement).style.setProperty(
    "--outfit",
    outfits[save.outfit],
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
  if (id.startsWith("roof:")) {
    const today = singaporeDay();
    if (save.roofDay !== today) {
      save.roofDay = today;
      save.roofStars = [];
    }
    const roof = id.slice(5);
    if (save.roofStars.includes(roof)) return;
    save.roofStars.push(roof);
    progress("rooftop", roof);
    beep("coin");
    toast(
      save.roofStars.length === 3
        ? "Rooftop hunt complete! +30 bonus XP"
        : `Rooftop star ${save.roofStars.length}/3 · +10 XP`,
    );
    persist();
    return;
  }
  if (firstRacePending()) return;
  if (save.coins.includes(id)) return;
  save.coins.push(id);
  progress("coin", id);
  save.xp += 10;
  beep("coin");
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
function openShell(kicker: string, keepPreview = false) {
  dismissStyleReward?.();
  void syncSocial();
  disposeCelebration?.();
  disposeCelebration = null;
  disposeArcadeFx();
  if (!keepPreview) {
    characterPreview?.dispose();
    characterPreview = null;
  }
  abandonRound();
  socialPanel = "";
  world?.cancelInteraction();
  dismissInspector();
  game?.dispose();
  game = null;
  if (!modal.open) lastFocus = document.activeElement as HTMLElement;
  document.querySelector("#modal-kicker")!.textContent = kicker;
  modal.className = "";
  if (!modal.open) {
    modal.showModal();
    beep("open");
  }
  if (world) {
    world.paused = true;
    world.keys.clear();
    world.joystick = { x: 0, y: 0 };
  }
}
function close() {
  dismissStyleReward?.();
  window.setTimeout(flushStyleTokens, 0);
  setupGuide = false;
  disposeCelebration?.();
  disposeCelebration = null;
  disposeArcadeFx();
  characterPreview?.dispose();
  characterPreview = null;
  abandonRound();
  socialPanel = "";
  game?.dispose();
  game = null;
  if (modal.open) beep("close");
  modal.close();
  if (world) {
    world.paused = false;
    world.keys.clear();
  }
  const returnFocus = lastFocus?.isConnected
    ? lastFocus
    : document.querySelector<HTMLElement>(
        firstRoundGoalPending(save)
          ? `${is2d ? "#fallback-welcome" : ".welcome-panel"} [data-action="welcome-start"]`
          : '.lobby-dock [data-open="phone-menu"]',
      );
  returnFocus?.focus({ preventScroll: true });
}
function actionButton(action: string, label: string, klass = "primary") {
  return `<button class="${klass}" data-action="${action}">${label}</button>`;
}
function pager(page: number, total: number, target: string) {
  if (total < 2) return "";
  return `<nav class="choice-pager" aria-label="${target} pages"><button class="secondary" data-page="${target}" data-page-index="${page - 1}" ${page === 0 ? "disabled" : ""}>← Back</button><span aria-live="polite">${page + 1} / ${total}</span><button class="secondary" data-page="${target}" data-page-index="${page + 1}" ${page === total - 1 ? "disabled" : ""}>Next →</button></nav>`;
}
function cards() {
  const art = {
    noodle:
      '<span class="noodle-body"></span><span class="dumpling">●</span><i>01</i>',
    brick: "<i></i>".repeat(12) + "<b></b><span></span>",
    hop: '<span class="hop-roof r1"></span><span class="hop-roof r2"></span><span class="hop-character">↑</span><i>03</i>',
    swarm:
      '<span class="star-ship">▲</span><span class="star-enemy">▼</span><i>✦ · ✧ · ✦</i>',
    coast: "<span>🏎</span><b>PALM BAY</b><i>05</i>",
    hoops: "<span>🏀</span>",
    fishing: "<span>🎣</span>",
  };
  const choices = { items: playIds, page: gamePage, total: 1 };
  return `<div class="game-grid compact-games">${choices.items.map((id) => `<button class="game-card ${id}" data-game="${id}"><div class="game-art ${id}-art">${art[id]}</div><span class="eyebrow">${games[id].genre}</span><h3>${games[id].name}</h3><div><span>${id === "coast" ? "3 laps" : id === "hoops" ? "10 shots" : "60s"} · BEST ${formatScore(id, shared?.self.best[id] ?? 0)}</span>${icon("arrow")}</div></button>`).join("")}</div>${pager(choices.page, choices.total, "games")}`;
}
function questTabs(active: string) {
  return `<nav class="quest-tabs" aria-label="Quests & rankings">${[
    ["quests", "Quests"],
    ["dares", "Challenges"],
    ["board", "Rankings"],
  ]
    .map(
      ([id, title]) =>
        `<button class="secondary" data-quest-tab data-open="${id}" aria-pressed="${active === id}">${title}</button>`,
    )
    .join("")}</nav>`;
}
function open(id: string) {
  if (["map", "surroundings"].includes(id)) id = "arcade";
  if (["settings", "controls"].includes(id)) id = "preferences";
  if (id === "account") {
    void openAccount();
    return;
  }
  if (id === "privacy") {
    void openAccount({ privacy: true });
    return;
  }
  if (id === "help") {
    openShell("HELP & REPORT");
    body.innerHTML = `<h2>Help & Report</h2><p>Open any nearby player's profile to Block, Mute or Report them. Reports stay private.</p><button class="secondary" data-open="neighbours">Nearby players</button><p>Move with the joystick or WASD. Pinch to zoom. Jump on a green pad to reach rooftops.</p><a href="mailto:hello@playsimi.danielquek.com">Contact Play Simi support</a>`;
    return;
  }
  dismissStyleReward?.();
  if (id !== "wardrobe") {
    setupGuide = false;
    tryingLook = null;
  }
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
  // Hoops and fishing share their id with the facility, which opens a panel.
  if ((gameIds as string[]).includes(id)) {
    startGame(id as GameId);
    return;
  }
  if (id.startsWith("dare")) {
    if (id === "dares-board") {
      boardTab = "daily";
      open("board");
      return;
    }
    openDares(
      id === "dares-neighbour"
        ? "neighbour"
        : id === "dares-find"
          ? "find"
          : "home",
    );
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
      ? "ARCADE ROW"
      : id === "shop"
        ? "MAMA SHOP"
        : id === "wardrobe"
          ? "MY LOOK"
          : ["fishing", "hoops", "plots"].includes(id)
            ? "EAST SIDE"
            : id === "stage"
              ? "SIMI PLAZA"
              : "PLAY SIMI",
    id === "wardrobe" && !is2d,
  );
  if (id === "relay") {
    mountRelay(body, { save, simple: is2d });
    return;
  }
  if (id === "stage") {
    mountStage(body, {
      save,
      sound: beep,
      simple: is2d,
      report: (event, value) => {
        progress(event, value);
        return profileQueue;
      },
    });
    body.querySelector<HTMLButtonElement>("#stage-start")?.click();
    return;
  }
  if (id === "invite") {
    void mountInvite(body, toast);
    return;
  }
  if (id === "fishing" || id === "hoops" || id === "plots") {
    const mount = {
      fishing: mountFishing,
      hoops: mountHoops,
      plots: mountPlots,
    };
    mount[id](body, {
      save,
      simple: is2d,
      sound: beep,
      // The save is refreshed from the server's reply before this resolves.
      report: (event, value) => {
        progress(event, value);
        return profileQueue;
      },
    });
    return;
  }
  if (id === "support") {
    void mountPayments(body);
  } else if (id === "worlds") {
    socialPanel = "worlds";
    void worldPicker.open();
  } else if (isMenuPage(id)) {
    const page = menuPages[id];
    body.innerHTML = `<h2>${page.title}</h2><div class="simple-menu" aria-label="Menu">${page.actions.map((action) => `<button class="menu-choice" data-open="${action.target}">${icon(action.icon)}<span>${action.label}</span>${icon("arrow")}</button>`).join("")}<button class="menu-choice" ${currentProfile?.account ? 'data-action="logout"' : 'data-action="save-email"'}>${icon("settings")}<span>${currentProfile?.account ? "Log out" : "Save with email"}</span>${icon("arrow")}</button></div><div class="menu-links"><button class="text-button" data-open="privacy">Privacy & data</button><button class="text-button" data-open="help">Help/Report</button></div>`;
  } else if (id === "arcade") {
    body.innerHTML = `<h2>Play</h2>${cards()}<h3>Play outside</h3><div class="outside-cards">${[
      ["relay", "Neighbourhood Relay", "🎒"],
      ["stage", "Open Stage", "♫"],
      ["plots", "Community Plots", "🌱"],
    ]
      .map(
        ([id, name, emoji]) =>
          `<button class="menu-choice" data-open="${id}"><span>${emoji}</span><strong>${name}</strong></button>`,
      )
      .join("")}${[
      ["dragon", "Dragon Rooftop", "🐉"],
      ["swing", "Swings", "✦"],
      ["pet", "Pet Kopi", "🐈"],
      ["bench0", "Take a seat", "📖"],
    ]
      .map(
        ([id, name, emoji]) =>
          `<button class="menu-choice" data-environment="${id}"><span>${emoji}</span><strong>${name}</strong></button>`,
      )
      .join(
        "",
      )}</div><p class="fine-print">Play medals reward qualifying finishes. Ranked arcade medals land at midnight.</p>`;
  } else if (id === "shop") {
    const taken = save.giftDay === singaporeDay();
    body.innerHTML = `<h2>${taken ? "Good choice!" : "Pick a free hat"}</h2><p class="lead">${taken ? "It’s in My look → Head, under Your hats." : "Yours to keep."}</p><div class="gift-grid">${["The Kopitiam Bucket", "Lilac Daydream", "Just a Little Sprout"].map((n, i) => `<button class="gift-option ${taken && save.gift === i ? "chosen" : ""}" data-gift="${i}" ${taken ? "disabled" : ""}><span class="hat-art hat-${i}">${["▰", "◒", "♧"][i]}</span><strong>${n}</strong><span>${taken ? (save.gift === i ? "YOURS TO KEEP" : "ANOTHER DAY") : "FREE · CHOOSE ME"}</span></button>`).join("")}</div><div class="note">${icon("leaf")} New pick daily (SGT). No streak to lose.</div>${taken ? '<button class="primary" data-look-tab="hair">See it in My look →</button>' : ""}`;
  } else if (id === "wardrobe") {
    const nickname =
      currentProfile?.name || shared?.self?.name || "New neighbour";
    const typed =
      body.querySelector<HTMLInputElement>("#nickname")?.value ??
      (setupGuide && !save.nameChosen ? "" : nickname);
    const moreLooksOpen =
      body.querySelector<HTMLDetailsElement>(".setup-more")?.open ?? false;
    const medals = shared?.self?.points ?? 0;
    const shown = tryingLook?.look ?? save;
    body.innerHTML = `<div class="wardrobe-layout"><div class="avatar-preview"><div class="character-preview" aria-label="3D character preview; drag to turn"></div><strong>${tryingLook ? "Trying on" : escapeText(nickname)}</strong><small>DRAG TO TURN</small><span class="look-caption">${tryingLook?.name ?? clothingNames[save.clothing]}</span><div class="try-actions" role="status"><button class="secondary" data-undo-look ${undoLook ? "" : "disabled"}>Undo</button><button class="text-button" data-reset-look>Back to my look</button></div></div><div class="wardrobe-controls">${setupGuide ? '<span class="eyebrow setup-step">STEP 1 OF 2 · NAME & LOOK</span>' : ""}${setupGuide ? "<h2>Create your driver</h2>" : `<span class="eyebrow">YOUR COLLECTION</span><h2>My look</h2><div class="style-wallet"><strong>${tokenSummary(save)}</strong><small>Tokens buy looks. +1 per 100 XP, up to +3 daily from ranked medals.</small></div>`}<details class="look-identity" ${setupGuide ? "open" : ""}><summary>Name, girl or boy, colours & daily hats</summary><form id="nickname-form" novalidate><label class="field-label" for="nickname">NICKNAME</label><div class="nickname-row"><input id="nickname" name="nickname" value="${escapeText(typed)}" minlength="2" maxlength="20" autocomplete="off" placeholder="Choose your nickname" aria-describedby="nickname-status" required><button class="secondary" type="submit">Save name</button></div><p class="fine-print">Everyone sees this. No real names.</p><p id="nickname-status" role="status"></p></form><label class="field-label">CHARACTER</label><div class="body-options">${["Girl", "Boy"].map((label, i) => `<button data-body="${i}" class="${save.body === i ? "active" : ""}" aria-pressed="${save.body === i}">${label}</button>`).join("")}</div><label class="field-label">OUTFIT COLOUR</label><div class="swatches">${outfits.map((c, i) => `<button data-outfit="${i}" style="--swatch:${c}" class="${save.outfit === i ? "active" : ""}" aria-label="${["Lime", "Lilac", "Coral", "Sky", "Gold", "Cream"][i]} outfit" aria-pressed="${save.outfit === i}"></button>`).join("")}</div><p class="fine-print">Legendary outfits use their own signature colours.</p><label class="field-label">SKIN TONE</label><div class="swatches">${skins.map((c, i) => `<button data-skin="${i}" style="--swatch:${c}" class="${save.skin === i ? "active" : ""}" aria-label="Skin tone ${i + 1}" aria-pressed="${save.skin === i}"></button>`).join("")}</div><label class="field-label">DAILY HATS</label><div class="hat-options">${["No hat", "Bucket", "Cap", "Sprout"].map((n, i) => `<button data-hat="${i}" ${save.unlockedHats.includes(i) ? "" : "disabled"} aria-pressed="${save.hat === i}">${n}${save.unlockedHats.includes(i) ? "" : " · locked"}</button>`).join("")}</div></details>${setupGuide ? `<details class="setup-more" ${moreLooksOpen ? "open" : ""}><summary>More looks & hairstyles</summary>` : ""}<div class="look-tabs" aria-label="Wardrobe sections">${wardrobeSections.map((label) => `<button data-wardrobe-section="${label}" aria-pressed="${wardrobeSection === label}">${label}</button>`).join("")}<button data-open="support">Premium</button></div><div class="collection-tabs" aria-label="Filter looks">${wardrobeFilters.map((label) => `<button data-wardrobe-filter="${label}" aria-pressed="${wardrobeFilter === label}">${label}</button>`).join("")}</div>${wardrobeSection === "Hats" ? hatShelf(save) : ""}${wardrobeSection === "Capes & back" ? '<p class="fine-print">Capes include their matching outfit. Wings use the Magic slot.</p>' : ""}${wardrobeBrowser(wardrobeSection, wardrobeFilter, save, medals, tryingLook)}<p class="fine-print">Cosmetic only. No gameplay advantage. Earn sets through play or check optional purchase availability.</p>${setupGuide ? "</details>" : ""}${setupGuide ? actionButton("setup-save", currentProfile?.account ? "Save & continue →" : "Next: save my character →") : actionButton("done-look", "Done")}</div></div>`;
    const preview = body.querySelector<HTMLElement>(".character-preview")!;
    if (!is2d) {
      try {
        if (characterPreview)
          characterPreview.mount(preview, { ...shown, reduced: save.reduced });
        else
          characterPreview = createCharacterPreview(preview, {
            ...shown,
            reduced: save.reduced,
          });
      } catch {
        preview.textContent = "Your look will appear in the neighbourhood.";
      }
    } else
      preview.innerHTML = `<img class="look-2d-image" src="${tryingLook?.image ?? `/wardrobe/clothing-${save.clothing}.png`}" alt="${tryingLook?.name ?? clothingNames[save.clothing]}">${actionButton("2d", "Return to 3D", "secondary")}`;
    body.querySelector<HTMLFormElement>("#nickname-form")!.onsubmit = async (
      e,
    ) => {
      e.preventDefault();
      const status = body.querySelector<HTMLElement>("#nickname-status")!;
      const button = body.querySelector<HTMLButtonElement>(
        "#nickname-form button",
      )!;
      const input = body.querySelector<HTMLInputElement>("#nickname")!;
      const name = input.value.trim();
      if (name.length < 2 || !input.checkValidity()) {
        status.textContent =
          name.length < 2
            ? "Choose a nickname with at least 2 characters."
            : input.validationMessage;
        input.setAttribute("aria-invalid", "true");
        input.focus();
        return;
      }
      input.removeAttribute("aria-invalid");
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
    body.innerHTML = `<h2>Neighbourhood</h2><label class="field-label" for="destination">Choose a spot</label><select class="destination-select" id="destination">${spots.map((spot) => `<option value="${spot.id}">${spot.name}</option>`).join("")}</select><div class="simple-menu"><button class="menu-choice" data-action="go-destination" data-main-action>${icon("pin")}<span>Go there</span>${icon("arrow")}</button><button class="menu-choice" data-open="surroundings" data-main-action>${icon("star")}<span>Play outside</span>${icon("arrow")}</button><button class="menu-choice" data-open="worlds" data-main-action>${icon("compass")}<span>Change world</span>${icon("arrow")}</button></div>`;
  } else if (id === "quests") {
    const choices = pageChoices(missions, questPage);
    body.innerHTML = `${questTabs("quests")}<h2>Quests</h2><button class="secondary" data-open="shop">Daily free hat</button><div class="hunt-panel"><span class="big-coin">★</span><div><h3>Daily rooftop hunt</h3><p>Jump from green pads to the arcade, shop and dragon. Jump again for each star.</p><strong>${save.roofDay === singaporeDay() ? save.roofStars.length : 0}/3 · +10 XP per star, +30 for all three</strong><small>Resets at midnight SGT</small><div class="button-row">${rooftops.map((r) => `<button class="secondary" data-rooftop="${r.id}">${r.name}</button>`).join("")}</div></div></div><div class="hunt-panel"><span class="big-coin">✦</span><div><h3>Pixel hunt</h3><p>Find 5 coins → Sprout hat + 50 XP</p><strong>${save.coins.length} / 5</strong></div></div>${is2d ? '<p class="fine-print">Needs 3D. Or grab a free Sprout hat at the Mama Shop.</p>' : ""}<div class="mission-list">${choices.items
      .map((m) => {
        const progress = missionProgress(save, m.id);
        return `<div><span class="mission-check ${progress >= m.total ? "complete" : ""}">${progress >= m.total ? "✓" : icon("star")}</span><span><strong>${m.name}</strong><small>${m.detail} · ${progress}/${m.total}</small></span><button data-claim="${m.id}" ${progress < m.total || save.claims.includes(m.id) ? "disabled" : ""}>${save.claims.includes(m.id) ? "CLAIMED ✓" : progress >= m.total ? `CLAIM +${m.xp} XP` : `${progress}/${m.total} · +${m.xp} XP`}</button></div>`;
      })
      .join(
        "",
      )}</div>${pager(choices.page, choices.total, "quests")}<p class="fine-print">Coins move every Monday (SGT).</p>`;
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
      ["Gone fishing", save.fish.length > 0, "Catch a fish", "compass"],
      ["Nothing but net", save.hoopsBest >= 5, "Make 5 of 10 hoops", "trophy"],
      ["Green fingers", save.harvests > 0, "Harvest a crop", "leaf"],
    ];
    body.innerHTML = `<h2>Sticker album</h2><div class="sticker-grid">${stickers.map(([n, unlocked, task, ic]) => `<div class="sticker ${unlocked ? "unlocked" : ""}"><span>${icon(String(ic))}</span><strong>${n}</strong><small>${unlocked ? "✓ GOT IT" : task}</small></div>`).join("")}</div><p class="fine-print">${stickers.filter((s) => s[1]).length} / ${stickers.length} collected</p>`;
  } else if (id === "board") {
    socialPanel = "board";
    renderSharedBoard();
  } else if (id === "emotes") {
    const choices = pageChoices(
      [
        ["wave", "👋", "Hello, neighbour"],
        ["cheer", "🙌", "Big cheer"],
        ["dance", "🪩", "Tiny dance party"],
        ["jump", "⚡", "Jump for joy"],
        ["victory", "✌", "Nailed it"],
        ["think", "💭", "Deep thoughts"],
      ],
      emotePage,
    );
    body.innerHTML = `<h2>Emotes</h2><p class="fine-print">Say hello in your world. No email needed.</p><div class="emote-grid">${choices.items
      .map(
        ([id, e, n]) =>
          `<button data-emote="${id}"><span>${e}</span><strong>${n}</strong></button>`,
      )
      .join("")}</div>${pager(choices.page, choices.total, "emotes")}`;
  } else if (id === "neighbours") {
    socialPanel = "neighbours";
    renderSharedNeighbours();
  } else if (id === "away") {
    body.innerHTML = `<h2>Step away</h2><label class="field-label" for="away-activity">While you’re gone</label><select class="destination-select" id="away-activity">${Object.entries(
      activities,
    )
      .map(
        ([key, activity]) =>
          `<option value="${key}" ${key === save.awayActivity ? "selected" : ""}>${activity.name}</option>`,
      )
      .join(
        "",
      )}</select><div class="button-row">${actionButton("start-away", "Step away")}${actionButton("save-away", "Save choice", "secondary")}</div><p class="fine-print">Away time earns no XP.</p>`;
  } else if (id === "preferences") {
    body.innerHTML = `<button class="text-button menu-back" data-open="phone-menu">← Back</button><h2>Sound & display</h2><label class="settings-row"><span>Display quality</span><select id="setting-quality">${["auto", "quality", "performance"].map((q) => `<option value="${q}" ${localStorage.getItem("playsimi-quality") === q ? "selected" : ""}>${q === "auto" ? "Automatic" : q === "quality" ? "Quality" : "Performance"}</option>`).join("")}</select></label><label class="settings-row"><span><strong>Sound effects</strong><small>Blips and sparkles</small></span><input id="setting-sound" type="checkbox" ${save.sound ? "checked" : ""}></label><label class="settings-row"><span><strong>Background music</strong><small>Lo-fi, pads and chiptune</small></span><input id="setting-music" type="checkbox" ${save.music ? "checked" : ""} ${save.sound ? "" : "disabled"}></label><label class="settings-row"><span><strong>Reduce motion</strong><small>Calmer effects</small></span><input id="setting-reduced" type="checkbox" ${save.reduced ? "checked" : ""}></label><label class="settings-row"><span><strong>Time of day</strong><small>SGT or pick a mood</small></span><select id="setting-light">${[
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
      )}</select></label><div class="settings-row"><span><strong>Lightweight lobby</strong><small>No 3D world</small></span>${actionButton("2d", is2d ? "Return to 3D" : "Use 2D", "secondary")}</div>${playtestEnabled ? '<details class="menu-details"><summary>Phone test</summary><button class="secondary" data-action="phone-test">Give feedback</button></details>' : ""}<p class="fine-print">Character model based on “Chibi Girl Character” by Syed’s Creation, <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>, modified. <a href="https://sketchfab.com/3d-models/chibi-girl-character-3e795731d68d416eb0b8770a6b363e65" target="_blank" rel="noopener">Source</a>.</p>`;
  } else if (id === "controls") {
    body.innerHTML = `<button class="text-button menu-back" data-open="phone-menu">← Back</button><h2>Camera & controls</h2><p>WASD or tap to walk. E to interact. Space to jump.</p><label class="settings-row"><span>View</span><select id="setting-camera"><option value="third" ${save.cameraMode === "third" ? "selected" : ""}>Third person</option><option value="isometric" ${save.cameraMode === "isometric" ? "selected" : ""}>Bird’s-eye</option></select></label><label class="settings-row"><span>Zoom</span><input id="setting-zoom" type="range" min="0" max="100" value="50" data-previous="50" aria-label="Camera zoom"></label><div class="camera-buttons"><button class="secondary" data-action="rotate-left" aria-label="Rotate view left">↶</button><button class="secondary" data-action="reset-view">Reset view</button><button class="secondary" data-action="rotate-right" aria-label="Rotate view right">↷</button></div>`;
  } else if (id === "surroundings") {
    const options = [
      {
        id: "relay",
        label: "Neighbourhood Relay",
        emoji: "🎒",
        walk: false,
        open: true,
      },
      { id: "dragon", label: "Dragon slide", emoji: "🐉", walk: false },
      { id: "swing", label: "Swings", emoji: "✦", walk: false },
      { id: "pet", label: "Pet Kopi", emoji: "🐈", walk: false },
      { id: "fishing", label: "Fishing", emoji: "🎣", walk: true },
      { id: "hoops", label: "Hoops", emoji: "🏀", walk: true },
      { id: "plots", label: "Garden plots", emoji: "🌱", walk: true },
      { id: "bench3", label: "Sit & read", emoji: "📖", walk: false },
      { id: "bell", label: "Ring the bell", emoji: "🔔", walk: false },
      { id: "cabinet-noodle", label: "Noodle Run", emoji: "🕹", walk: false },
      { id: "cabinet-coast", label: "Palm Bay", emoji: "🏎", walk: false },
    ];
    const choices = pageChoices(
      is2d
        ? [
            ...options.filter((choice) => choice.walk || choice.open),
            ...options.filter((choice) => !choice.walk && !choice.open),
          ]
        : options,
      outdoorPage,
    );
    body.innerHTML = `<h2>Play outside</h2><div class="outdoor-grid">${choices.items.map((choice) => `<button ${choice.open ? "data-open" : choice.walk ? "data-walk" : "data-environment"}="${choice.id}" ${is2d && !choice.walk && !choice.open ? "disabled" : ""}><span>${choice.emoji}</span><strong>${choice.label}</strong></button>`).join("")}</div>${pager(choices.page, choices.total, "outside")}${is2d ? '<p class="fine-print">Some activities need 3D. Relay, fishing, hoops and plots work here.</p>' : ""}`;
  } else if (id === "garden") {
    body.innerHTML = `<div class="garden-portrait">${icon("leaf")}</div><h2>Pocket Garden</h2><p class="lead">Nothing to chase. Just breathe.</p><button class="primary" data-environment="bench0">Sit & read →</button>`;
  } else if (id === "playground") {
    body.innerHTML = `<div class="dragon-portrait">✦</div><h2>Dragon playground</h2><button class="primary" data-environment="dragon">Ride the dragon →</button><button class="secondary" data-environment="swing">Swing</button>`;
  } else if (id === "soon") {
    body.innerHTML = `<h2>Play</h2>${cards()}<h3>Play outside</h3><div class="outside-cards">${[
      ["relay", "Neighbourhood Relay", "🎒"],
      ["stage", "Open Stage", "♫"],
      ["plots", "Community Plots", "🌱"],
    ]
      .map(
        ([id, name, emoji]) =>
          `<button class="menu-choice" data-open="${id}"><span>${emoji}</span><strong>${name}</strong></button>`,
      )
      .join("")}${[
      ["dragon", "Dragon Rooftop", "🐉"],
      ["swing", "Swings", "✦"],
      ["pet", "Pet Kopi", "🐈"],
      ["bench0", "Take a seat", "📖"],
    ]
      .map(
        ([id, name, emoji]) =>
          `<button class="menu-choice" data-environment="${id}"><span>${emoji}</span><strong>${name}</strong></button>`,
      )
      .join("")}</div>`;
  } else {
    body.innerHTML = `<h2>Take a breather.</h2><p class="lead">30 minutes in. Stretch, sip some water.</p><div class="note">Your progress is saved.</div>${actionButton("close", "Back when I’m ready")}`;
  }
}
function openDares(view: typeof dareView = "home") {
  dareView = view;
  openShell("SIMI PLAZA");
  socialPanel = "dares";
  renderSharedDares();
}
async function startGame(id: GameId, defender = "", dare = "", targetRun = "") {
  if (save.away) {
    save.away = false;
    save.awaySince = 0;
    world?.setAway(false);
    renderAway();
    persist();
  }
  const outdoor = id === "hoops" || id === "fishing";
  openShell(
    defender || dare
      ? "FRIENDLY CHALLENGE"
      : outdoor
        ? "EAST SIDE"
        : "ARCADE ROW",
  );
  const generation = gameGeneration;
  body.innerHTML = "<h2>Loading…</h2>";
  let run: Run | null = null;
  try {
    run = await api<Run>("run", {
      game: id,
      target: defender || null,
      dare: dare || null,
      targetRun: targetRun || null,
    });
  } catch (error) {
    if (generation !== gameGeneration) return;
    if (defender || dare) {
      body.innerHTML =
        "<h2>Challenge unavailable</h2><p>" +
        escapeText((error as Error).message) +
        '</p><button class="primary" data-open="dares">Back to challenges</button>';
      return;
    }
    toast("Offline · this round won’t be saved.");
  }
  if (generation !== gameGeneration) {
    if (run) void api("abandon", { id: run.id });
    return;
  }
  activeRun = run;
  playtestEvent("cabinet-ready");
  modal.classList.add("game-modal");
  modal.dataset.game = id;
  modal.insertAdjacentHTML(
    "afterbegin",
    '<div class="arcade-fx" aria-hidden="true"></div>',
  );
  if (!is2d && !save.reduced)
    arcadeFx = createArcadeFx(modal.querySelector(".arcade-fx")!, id);
  const target = run?.targetScore || 0;
  document.querySelector("#modal-kicker")!.textContent = target
    ? `CHALLENGE · BEAT ${formatScore(id, target)}`
    : run?.ranked
      ? "RANKED ROUND"
      : run
        ? "GUEST ROUND · +XP"
        : "OFFLINE";
  body.innerHTML =
    '<h2 class="game-title">' +
    games[id].name +
    '</h2><div id="game-mount"></div>';
  if (!outdoor) boardGame = id;
  if (id === "coast") modal.classList.add("racing-modal");
  const onFinish = async (score: number, replay: Replay) => {
    type Finished = {
      playMedal?: number;
      race?: RaceResult & { newBest: boolean };
      welcome?: boolean;
      invite?: { xp: number } | null;
      ranked?: boolean;
      profile: Profile;
      xpTokens?: number;
    };
    const racing = game instanceof RacingGame ? game : null;
    const endNote = game instanceof ArcadeGame ? game.endNote() : "";
    const raceSummary =
      game instanceof RacingGame || game instanceof OutdoorGame
        ? game.summary()
        : "";
    activeRun = null;
    playtestEvent("round-finished");
    const send = async () => {
      await profileQueue;
      const result = await api<Finished>("finish", {
        id: run!.id,
        score,
        replay,
      });
      acceptProfile(result.profile);
      if (result.profile.styleRewards) void claimStyleRewards();
      return result;
    };
    // The race is saved while its finish sequence plays, so closing the
    // window during the celebration cannot lose the result.
    let pending = run ? send() : null;
    pending?.catch(() => {});
    if (racing) await racing.outro();
    if (generation !== gameGeneration) return;
    modal.classList.remove("racing-modal");
    game?.dispose();
    game = null;
    flushStyleTokens();
    updateMusic();
    body.innerHTML = "<h2>Checking score…</h2>";
    const render = async () => {
      try {
        let result: Finished | null = null;
        let today: SharedState | null = null;
        if (run) {
          const sent = pending ?? send();
          pending = null;
          result = await sent;
          // Read standings now: a sync already in flight may predate this round.
          try {
            today = await api<SharedState>("state");
            shared = today;
          } catch {
            // A leaderboard outage must not hide an already saved round.
          }
          void syncSocial();
        }
        if (generation !== gameGeneration) return;
        const reward = !!result?.welcome;
        // A new guest's first result leads into making and saving a character.
        const setup =
          !!result &&
          (reward || !save.nameChosen || save.welcome !== "complete");
        body.innerHTML =
          id === "coast"
            ? `<h2 class="result-score">${formatScore(id, score)}<small>YOUR THREE-LAP TIME</small></h2>${result?.race?.newBest ? '<p class="new-best">New personal best!</p>' : ""}${raceComparison(score, today, !!result?.ranked)}<div class="button-row"><button class="primary" data-action="setup-look">${setup ? "Create my name & look" : "Edit my name & look"}</button><button class="secondary" data-replay="coast">Race again</button></div><details class="race-extra-details"><summary>Race details & rewards</summary>${raceSummary}<p>${result ? `Verified round · +20 XP${reward ? " · Lilac cap unlocked · +35 bonus XP" : ""}` : "Offline · this round was not saved."}</p>${!currentProfile?.account ? '<button class="secondary" data-account>Save with email</button>' : ""}</details>`
            : '<div class="result-star">' +
              icon(target ? "trophy" : "game") +
              '</div><h2 class="result-score">' +
              formatScore(id, score) +
              "<small>" +
              "GAME SCORE" +
              "</small></h2>" +
              (endNote
                ? '<p class="round-end-note" role="status">' + endNote + "</p>"
                : "") +
              (result?.race?.newBest
                ? '<p class="new-best" role="status">✦ New best!</p>'
                : "") +
              raceSummary +
              '<p class="lead">' +
              (target
                ? score > target
                  ? "Challenge beaten!"
                  : score === target
                    ? "Draw!"
                    : "Target " + formatScore(id, target) + ". Try again!"
                : "") +
              "</p>" +
              (reward
                ? '<div class="welcome-reward"><span class="cap-badge">✦</span><span><strong>First round complete!</strong><span>Lilac cap unlocked · +35 bonus XP</span></span></div>'
                : "") +
              '<div class="button-row">' +
              (setup
                ? '<button class="primary" data-action="setup-look">Make it yours</button><button class="secondary" data-replay="' +
                  id +
                  '">Play again</button>'
                : reward
                  ? '<button class="primary" data-action="welcome-wear">Wear my cap</button>'
                  : '<button class="primary" data-replay="' +
                    id +
                    '">Play again</button>') +
              '<button class="secondary" data-action="close">Neighbourhood</button></div>' +
              '<div class="note">' +
              (result
                ? "✓ Verified · " +
                  (result.ranked
                    ? outdoor
                      ? "East Side rounds build personal bests and Play medals."
                      : "in the running for tonight’s ranked medals."
                    : outdoor
                      ? "guest round saved · your personal best and XP are kept."
                      : "guest round saved · your personal best and XP are kept.")
                : "Offline · nothing saved.") +
              "</div>" +
              (result?.invite
                ? `<p class="new-best" role="status">+${result.invite.xp} XP · you and the friend who invited you</p>`
                : "") +
              (run && !setup
                ? '<details class="menu-details"><summary>Play with a friend</summary><button class="secondary" data-open="invite">Invite a friend</button></details>'
                : "") +
              (!currentProfile?.account && !setup
                ? result?.race?.newBest
                  ? '<details class="menu-details"><summary>Save my progress</summary><button class="secondary" id="save-race-best">Save with email</button></details>'
                  : '<details class="menu-details"><summary>Save my progress</summary><button class="secondary" data-account>Save with email</button></details>'
                : "");
        body.insertAdjacentHTML(
          "beforeend",
          result
            ? playMedalResult(
                result.profile.playMedals,
                result.playMedal || 0,
                id,
              )
            : "",
        );
        body
          .querySelector("#save-race-best")
          ?.addEventListener("click", () => void openAccount({ create: true }));
        body.insertAdjacentHTML(
          "afterbegin",
          '<div class="finish-effects" aria-hidden="true"></div>',
        );
        if (arcadeFx) {
          arcadeFx.setUrgency(0);
          arcadeFx.fire("end");
        } else if (!is2d && !save.reduced) {
          try {
            disposeCelebration = celebrate(
              body.querySelector(".finish-effects")!,
            );
          } catch {
            /* Rewards remain readable without WebGL. */
          }
        }
        const standing = shared?.boards[id]?.find((p) => p.id === shared?.me);
        if (id !== "coast")
          body
            .querySelector(".result-score")!
            .insertAdjacentHTML(
              "afterend",
              `<div class="round-breakdown"><span>XP<strong>${result ? "+20" : "0"}</strong></span><span>Rank<strong>${result?.ranked && standing ? "#" + standing.rank : result?.ranked ? "—" : "Guest"}</strong><small>${standingNote(!!result?.ranked, standing, score, formatScore(id, standing?.score ?? 0))}</small></span></div>`,
            );
        beep(score > target ? "win" : "finish");
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
  };
  const mount = body.querySelector<HTMLElement>("#game-mount")!;
  game =
    id === "coast"
      ? new RacingGame(
          mount,
          onFinish,
          (name) => beep(name),
          run?.seed ?? 314159,
          save,
          {
            reduced: save.reduced,
            simple: save.twoD,
            target,
            playerName: currentProfile?.name ?? "You",
            progress: save,
            best: shared?.self?.best.coast ?? save.best.coast,
            assist: !save.coastRecord.timeTicks,
            soundOn: () => save.sound,
            toggleSound,
          },
        )
      : id === "hoops" || id === "fishing"
        ? new OutdoorGame(
            mount,
            id,
            onFinish,
            (name) => beep(name),
            run?.seed ?? 314159,
            { reduced: save.reduced, simple: save.twoD },
          )
        : new ArcadeGame(id, mount, onFinish, (name) => beep(name), run?.seed);
  game.onFx = (event, amount) => {
    arcadeFx?.fire(event, amount);
    if (event === "hurt" && !save.reduced) {
      modal.classList.remove("fx-hurt");
      void modal.offsetWidth;
      modal.classList.add("fx-hurt");
    }
  };
  game.onTime = (left) =>
    arcadeFx?.setUrgency(left <= 10 ? (10 - left) / 10 : 0);
  game.onPause = (paused) => arcadeFx?.setPaused(paused);
  const start = mount.querySelector<HTMLButtonElement>("#start-game");
  if (start?.disabled) {
    const ready = new MutationObserver(() => {
      if (!start.isConnected || !start.disabled) {
        ready.disconnect();
        if (start.isConnected && generation === gameGeneration) start.click();
      }
    });
    ready.observe(start, { attributes: true, attributeFilter: ["disabled"] });
  } else start?.click();
}

document.addEventListener("click", (e) => {
  const b = (e.target as Element).closest<HTMLButtonElement>("button");
  if (!b || b.disabled) return;
  if (b.dataset.joinFriend) {
    void worldPicker.join({ friend: b.dataset.joinFriend });
    return;
  }
  if (b.dataset.wardrobeSection) {
    const section = wardrobeSections.find(
      (s) => s === b.dataset.wardrobeSection,
    );
    if (section) {
      wardrobeSection = section;
      open("wardrobe");
    }
    return;
  }
  if (b.dataset.wardrobeFilter) {
    const filter = wardrobeFilters.find((s) => s === b.dataset.wardrobeFilter);
    if (filter) {
      wardrobeFilter = filter;
      open("wardrobe");
    }
    return;
  }
  if (b.hasAttribute("data-undo-look") && undoLook) {
    Object.assign(save, undoLook);
    undoLook = null;
    tryingLook = null;
    persist();
    world?.updateAvatar();
    open("wardrobe");
    return;
  }
  if (b.dataset.lookTab) {
    if (
      !["clothing", "hair", "pet", "accessory", "sets"].includes(
        b.dataset.lookTab,
      )
    )
      return;
    wardrobeTab = b.dataset.lookTab as WardrobeTab;
    wardrobeSection = wardrobeTab === "hair" ? "Hats" : wardrobeTab === "pet" ? "Pets" : wardrobeTab === "accessory" ? "Magic" : wardrobeTab === "sets" ? "Full sets" : "Outfits";
    open("wardrobe");
    return;
  }
  if (
    b.dataset.collection &&
    Object.hasOwn(collectionLabels, b.dataset.collection)
  ) {
    wardrobeCollection = b.dataset.collection as Collection;
    open("wardrobe");
    return;
  }
  if (b.dataset.trySlot && b.dataset.tryIndex !== undefined) {
    const slot = b.dataset.trySlot as WardrobeTab;
    const index = Number(b.dataset.tryIndex);
    tryingLook = {
      look: itemLook(slot, index, save),
      name: itemName(slot, index),
      image: `/wardrobe/${slot}-${index}.png`,
    };
    if (wearable(tryingLook.look, save, shared?.self?.points ?? 0)) {
      undoLook = {
        outfit: save.outfit,
        skin: save.skin,
        body: save.body,
        hat: save.hat,
        clothing: save.clothing,
        hair: save.hair,
        pet: save.pet,
        accessory: save.accessory,
      };
      Object.assign(save, tryingLook.look);
      tryingLook = null;
      persist();
      world?.updateAvatar();
      beep("equip");
    }
    const scroll = body.querySelector(".wardrobe-controls")?.scrollTop ?? 0;
    open("wardrobe");
    const controls = body.querySelector(".wardrobe-controls");
    if (controls) controls.scrollTop = scroll;
    body
      .querySelector<HTMLButtonElement>(
        `[data-try-slot="${slot}"][data-try-index="${index}"]`,
      )
      ?.focus({ preventScroll: true });
    return;
  }
  if (b.hasAttribute("data-reset-look")) {
    tryingLook = null;
    open("wardrobe");
    return;
  }
  if (b.hasAttribute("data-equip-look") && tryingLook) {
    if (!wearable(tryingLook.look, save, shared?.self?.points ?? 0)) return;
    Object.assign(save, tryingLook.look);
    tryingLook = null;
    persist();
    world?.updateAvatar();
    beep("equip");
    open("wardrobe");
    return;
  }
  if (b.dataset.buySet) {
    open("support");
    void mountPayments(body, b.dataset.buySet);
    return;
  }
  if (b.dataset.redeemSet) {
    const set = tokenLooks.find((set) => set.id === b.dataset.redeemSet);
    if (!set || !profileReady) {
      toast("Connect to save and exchange your tokens.");
      return;
    }
    b.disabled = true;
    void profileMutation("progress", {
      event: "redeem-style",
      value: set.id,
    }).then(() => {
      if (save.wardrobeUnlocked.includes(set.id))
        toast(`${set.name} unlocked. All four pieces are yours!`);
      if (modal.open && body.querySelector(".wardrobe-layout"))
        open("wardrobe");
    });
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
  if (b.dataset.page) {
    const page = Number(b.dataset.pageIndex);
    if (b.dataset.page === "games") {
      gamePage = page;
      open("arcade");
    }
    if (b.dataset.page === "outside") {
      outdoorPage = page;
      open("surroundings");
    }
    if (b.dataset.page === "quests") {
      questPage = page;
      open("quests");
    }
    if (b.dataset.page === "emotes") {
      emotePage = page;
      open("emotes");
    }
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
  if (b.dataset.rooftop) {
    close();
    world?.goRooftop(b.dataset.rooftop);
    toast("Follow the path to the green pad. Press Jump to launch.");
    return;
  }
  if (b.dataset.game) {
    startGame(b.dataset.game as GameId);
    return;
  }
  if (b.dataset.challenge) {
    void startGame(
      b.dataset.challenge as GameId,
      b.dataset.defender,
      "",
      b.dataset.targetRun,
    );
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
      beep("gift");
    }
    return;
  }
  for (const key of [
    "outfit",
    "skin",
    "body",
    "hat",
    "clothing",
    "hair",
    "pet",
    "accessory",
  ] as const)
    if (b.dataset[key] !== undefined) {
      tryingLook = null;
      save[key] = Number(b.dataset[key]);
      beep(
        key === "pet"
          ? save.pet
            ? petSound(save.pet)
            : "click"
          : key === "accessory"
            ? save.accessory
              ? "sparkle"
              : "click"
            : "equip",
      );
      persist();
      world?.updateAvatar();
      const scroll = modal.scrollTop;
      open("wardrobe");
      modal.scrollTop = scroll;
      (
        body.querySelector<HTMLButtonElement>(
          `.hat-shelf [data-${key}="${save[key]}"]`,
        ) ??
        body.querySelector<HTMLButtonElement>(`[data-${key}="${save[key]}"]`)
      )?.focus();
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
    } else
      toast(
        save.claims.includes(m.id)
          ? "Already claimed."
          : "Not finished yet. Keep going!",
      );
    return;
  }
  if (b.dataset.emote) {
    const id = b.dataset.emote;
    document.querySelector<HTMLElement>("#quick-emotes")!.hidden = true;
    document
      .querySelector("#quick-emotes-toggle")!
      .setAttribute("aria-expanded", "false");
    if (id === "jump" && !localStorage.getItem("playsimi-jump-hint")) {
      toast("Jump on a green pad, then jump again to collect a rooftop star.");
      localStorage.setItem("playsimi-jump-hint", "1");
    }
    close();
    if (is2d) emote2d = { id, until: Date.now() + 4000 };
    else world?.act(id);
    if (id !== "jump") toast(is2d ? "Emote ready." : "Emote sent.");
    return;
  }
  if (b.dataset.action) {
    const a = b.dataset.action;
    if (a === "save-email") {
      close();
      void openAccount({ create: true });
      return;
    }
    if (a === "logout") {
      close();
      void openAccount({ logout: true });
      return;
    }
    if (a === "toggle-camera") {
      const next =
        (world?.cameraMode ?? save.cameraMode) === "third"
          ? "isometric"
          : "third";
      dismissInspector();
      save.cameraMode = next;
      world?.setCameraMode(save.cameraMode);
      renderCameraUI();
      persist();
      return;
    }
    if (a === "welcome-start" || a === "welcome-resume") {
      save.welcomeDismissed = false;
      if (save.welcome === "new") save.welcome = "cabinet";
      persist();
      playtestEvent("welcome-start");
      void startGame("coast");
      return;
    }
    if (a === "welcome-skip") {
      save.welcomeDismissed = true;
      persist();
      return;
    }
    if (a === "setup-look") {
      if (save.welcome !== "complete" && save.unlockedHats.includes(2)) {
        save.hat = 2;
        persist();
      }
      world?.updateAvatar();
      playtestEvent("cosmetic-worn");
      wardrobeTab = "clothing";
      setupGuide = true;
      open("wardrobe");
      return;
    }
    if (a === "setup-save") {
      void (async () => {
        const generation = gameGeneration;
        const input = body.querySelector<HTMLInputElement>("#nickname");
        if (!input) return;
        const name = input.value.trim();
        if (name.length < 2) {
          body.querySelector<HTMLDetailsElement>(".look-identity")!.open = true;
          input.setAttribute("aria-invalid", "true");
          body.querySelector("#nickname-status")!.textContent =
            "Choose a nickname with at least 2 characters.";
          input.focus();
          return;
        }
        if (!input.reportValidity()) {
          body.querySelector<HTMLDetailsElement>(".look-identity")!.open = true;
          input.setAttribute("aria-invalid", "true");
          body.querySelector("#nickname-status")!.textContent =
            input.validationMessage;
          input.focus();
          return;
        }
        input.removeAttribute("aria-invalid");
        b.disabled = true;
        try {
          await profileQueue;
          if (!save.nameChosen || name !== currentProfile?.name) {
            acceptProfile(await api<Profile>("profile", { name }));
          }
          if (save.rounds > 0 && save.welcome !== "complete") {
            acceptProfile(
              await api<Profile>("progress", { event: "setup-complete" }),
            );
          }
          if (generation !== gameGeneration || !modal.open) return;
          void syncSocial();
          if (currentProfile?.account) {
            close();
            toast("Your name and look are saved.");
            return;
          }
          void openAccount({
            create: true,
            guided: true,
            onSkipped: close,
            onSaved: () => {
              close();
              toast(
                "Character saved to your email. Welcome to the neighbourhood!",
              );
            },
          });
        } catch (error) {
          if (generation !== gameGeneration || !modal.open) return;
          body.querySelector("#nickname-status")!.textContent =
            error instanceof Error
              ? error.message
              : "Could not save your name. Try again.";
          input.focus();
        } finally {
          b.disabled = false;
        }
      })();
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
    if (a === "visit-neighbour" || a === "report-neighbour") {
      const selected =
        body.querySelector<HTMLSelectElement>("#neighbour-choice")!.value;
      if (selected.startsWith("player:")) {
        if (a === "report-neighbour") reportPlayer(selected.slice(7));
        else showPlayer(selected.slice(7));
      } else if (a === "visit-neighbour") showResident(selected.slice(9));
      return;
    }
    if (a === "go-destination") {
      const id = body.querySelector<HTMLSelectElement>("#destination")!.value;
      const place = spots.find((s) => s.id === id)?.name || id;
      close();
      if (is2d) {
        visit(id);
        open(id);
      } else if (save.away)
        toast("You’re away. Choose “I’m back” to walk again.");
      else if (!world?.go(id))
        toast(
          `No clear path to ${place} from here. Walk closer and try again.`,
        );
      // Arriving at once opens the place; otherwise say where the walk leads.
      else if (!modal.open) toast(`Heading to ${place}.`);
      return;
    }
    if (a === "fallback-go") {
      const id = document.querySelector<HTMLSelectElement>(
        "#fallback-destination",
      )!.value;
      visit(id);
      open(id);
      return;
    }
    if (
      [
        "rotate-left",
        "rotate-right",
        "reset-view",
        "zoom-in",
        "zoom-out",
      ].includes(a)
    ) {
      if (a === "rotate-left") world?.rotate(-0.2);
      if (a === "rotate-right") world?.rotate(0.2);
      if (a === "zoom-in") world?.setZoom(0.15);
      if (a === "zoom-out") world?.setZoom(-0.15);
      if (a === "reset-view") {
        dismissInspector();
        world?.resetView();
      }
      renderCameraUI();
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
      beep("meow");
      toast("Prrrr. You have been approved by Kopi.");
      return;
    }
    if (a === "2d") {
      if (is2d) {
        save.twoD = false;
        persist();
        void profileQueue.then(() => location.reload());
        return;
      }
      save.twoD = true;
      persist();
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
  if (
    el.id === "setting-quality" &&
    ["auto", "quality", "performance"].includes(el.value)
  ) {
    const quality =
      el.value === "quality"
        ? "quality"
        : el.value === "performance"
          ? "performance"
          : "auto";
    world?.setQuality(quality);
    localStorage.setItem("playsimi-quality", quality);
    return;
  }
  if (el.id === "setting-zoom") {
    world?.setZoom((Number(el.value) - Number(el.dataset.previous || 50)) / 20);
    el.dataset.previous = el.value;
    return;
  }

  for (const key of [
    "outfit",
    "skin",
    "body",
    "hat",
    "clothing",
    "hair",
    "pet",
    "accessory",
  ] as const) {
    if (el.dataset.lookKey === key) {
      save[key] = Number(el.value);
      beep(
        key === "pet" && save.pet
          ? petSound(save.pet)
          : key === "accessory" && save.accessory
            ? "sparkle"
            : "equip",
      );
      persist();
      world?.updateAvatar();
      const scroll = modal.scrollTop;
      open("wardrobe");
      modal.scrollTop = scroll;
      body
        .querySelector<HTMLSelectElement>(`[data-look-key="${key}"]`)
        ?.focus();
      return;
    }
  }
  if (el.id === "neighbour-choice") {
    body.querySelector<HTMLButtonElement>(
      '[data-action="report-neighbour"]',
    )!.disabled = !el.value.startsWith("player:");
    return;
  }
  if (el.id === "dare-choice") {
    renderSharedDares();
    body.querySelector<HTMLSelectElement>("#dare-choice")?.focus();
    return;
  }
  if (el.dataset.challengePicker) {
    const button = document.querySelector<HTMLButtonElement>(
      `[data-defender="${el.dataset.challengePicker}"]`,
    );
    if (button && playIds.includes(el.value as GameId)) {
      challengeGameByPlayer.set(el.dataset.challengePicker, el.value as GameId);
      button.dataset.challenge = el.value;
      const player = [
        ...(shared?.players || []),
        ...(shared?.friends || []),
      ].find((p) => p.id === el.dataset.challengePicker);
      button.dataset.targetRun =
        player?.challengeScores?.[el.value as GameId]?.runId || "";
    }
    return;
  }
  if (el.id === "board-target") {
    boardTarget = el.value;
    renderSharedBoard();
    return;
  }
  if (
    el.id === "board-period" &&
    (["week", "daily"].includes(el.value) ||
      [shared?.season, ...(shared?.seasonHistory || [])].some(
        (s) => s && el.value === `season:${s.id}`,
      ))
  ) {
    boardTab = el.value;
    boardPeriodChosen = true;
    renderSharedBoard();
    body.querySelector<HTMLSelectElement>("#board-period")?.focus();
    return;
  }
  if (el.id === "board-game" && (gameIds as string[]).includes(el.value)) {
    boardGame = el.value as GameId;
    renderSharedBoard();
    body.querySelector<HTMLSelectElement>("#board-game")?.focus();
    return;
  }
  if (el.id === "away-activity" && Object.hasOwn(activities, el.value)) {
    save.awayActivity = el.value as ActivityId;
  }
  if (
    ![
      "away-activity",
      "setting-sound",
      "setting-reduced",
      "setting-music",
      "setting-camera",
      "setting-light",
    ].includes(el.id)
  )
    return;
  if (el.id === "setting-sound") {
    save.sound = el.checked;
    document
      .querySelector<HTMLInputElement>("#setting-music")
      ?.toggleAttribute("disabled", !el.checked);
    startTune();
    audio.unlock();
    beep("click");
  }
  if (el.id === "setting-reduced") {
    save.reduced = el.checked;
    world?.setReduced(el.checked);
  }
  if (el.id === "setting-music") {
    save.music = el.checked;
    startTune();
    audio.unlock();
    beep("click");
  }
  if (
    el.id === "setting-camera" &&
    (el.value === "third" || el.value === "isometric")
  ) {
    save.cameraMode = el.value;
    world?.setCameraMode(el.value);
    renderCameraUI();
  }
  if (el.id === "setting-light") {
    save.light = el.value;
    world?.setLighting(el.value);
    updateMusic();
  }
  persist();
});
function toggleSound() {
  save.sound = !save.sound;
  persist();
  startTune();
  audio.unlock();
  beep("click");
}
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
  const toggle = document.querySelector<HTMLButtonElement>("#camera-toggle")!;
  toggle.hidden = is2d;
  toggle.setAttribute("aria-pressed", String(third));
  toggle.setAttribute(
    "aria-label",
    `Switch to ${third ? "bird’s-eye" : "third-person"} view`,
  );
  toggle.querySelector("span")!.textContent = third
    ? "Bird’s-eye"
    : "Third person";
  document.body.classList.toggle("third-person", third && !is2d);
  (document.querySelector("#camera-hint") as HTMLElement).hidden =
    !third || is2d;
  document.querySelector("#camera-hint")!.textContent = world?.inspectedId
    ? "Drag to orbit · scroll / pinch to zoom · Esc to return"
    : document.body.classList.contains("is-interacting")
      ? "Drag to look · scroll / pinch to zoom · Esc to stop"
      : "Drag to look · scroll / pinch to zoom · WASD to walk";
}
document
  .querySelector(".hud")!
  .insertAdjacentHTML(
    "beforeend",
    `<aside id="action-banner" class="action-banner" aria-live="polite" hidden><span class="action-status">LET’S GO OUTSIDE</span><strong></strong><span class="action-track" aria-hidden="true"><i></i></span><button data-action="stop-interaction">Stop <kbd>Esc</kbd></button></aside>`,
  );
function startOutdoor(id: string) {
  dismissStyleReward?.();
  if (is2d) {
    toast("Switch to 3D in Settings to play with the surroundings.");
    return;
  }
  if (modal.open) close();
  dismissInspector();
  void world?.interact(id, true);
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
      ? "PLAYING"
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
  if (d.phase === "playing")
    beep(
      d.id === "bell"
        ? "bell"
        : d.id === "swing"
          ? "swing"
          : d.id === "dragon"
            ? "slide"
            : d.id === "pet"
              ? "meow"
              : d.id.startsWith("bench")
                ? "page"
                : d.id.startsWith("cabinet")
                  ? "arcade"
                  : "click",
    );
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
  save.awayActivity = (["rest", "read", "nap", "pet"] as const)[
    Math.floor(Math.random() * 4)
  ];
  save.awaySince = Date.now();
  world?.setAway(true);
  renderAway();
  persist();
  toast(
    "Your avatar is staying downstairs. Neighbours can challenge your saved scores.",
  );
}
window.addEventListener("camera-change", () => {
  dismissInspector();
  renderCameraUI();
  persist();
});
window.addEventListener("offline", () => {
  worldStatus = "offline";
  renderWorldPresence();
  if (modal.open) close();
  enterAway();
  toast(
    "Connection lost. Your chosen away activity is running on this device.",
  );
});
window.addEventListener("online", () =>
  toast("Connection restored. Choose “I’m back” when you’re ready."),
);
let lastActiveAt = Date.now();
function resumeFromIdle() {
  lastActiveAt = Date.now();
  if (!save.away || !navigator.onLine) return;
  save.away = false;
  save.awaySince = 0;
  world?.setAway(false);
  renderAway();
  persist();
}
for (const event of ["pointerdown", "pointermove", "keydown"] as const)
  document.addEventListener(event, resumeFromIdle, { passive: true });
window.setInterval(() => {
  if (
    world &&
    (world.keys.size ||
      world.path.length ||
      Math.hypot(world.joystick.x, world.joystick.y) > 0.1)
  )
    lastActiveAt = Date.now();
  if (profileReady && !save.away && !game && Date.now() - lastActiveAt >= 60000)
    enterAway();
}, 1000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden && profileReady && !save.away) enterAway();
  else if (!document.hidden) {
    resumeFromIdle();
    flushStyleTokens();
  }
});
window.addEventListener("pagehide", () => {
  dismissStyleReward?.();
  pendingStyleTokens = 0;
  if (!save.away) {
    save.away = true;
    save.awaySince = Date.now();
  }
  writeSave(save);
  worldConnection.stop();
});
window.addEventListener("pageshow", (e) => {
  if (e.persisted) {
    if (profileReady) worldConnection.start();
    world?.setAway(save.away);
    renderAway();
  }
});
function enable2D() {
  is2d = true;
  // A lost graphics context is temporary, not a saved request for 2D mode.
  characterPreview?.dispose();
  characterPreview = null;
  const previousWorld = world;
  world = null;
  previousWorld?.dispose();
  if (modal.open) close();
  nearId = "";
  document.body.classList.remove("has-nearby");
  document.querySelector<HTMLButtonElement>("#interaction")!.hidden = true;
  document.body.classList.add("mode-2d");
  const el = document.querySelector<HTMLDivElement>("#fallback")!;
  el.hidden = false;
  el.innerHTML = `<div class="fallback-content"><span class="eyebrow">2D WORLD</span><h1>Meet you downstairs.</h1><p>Choose Play, My look or Menu.</p><section id="fallback-welcome"></section><label class="field-label" for="fallback-destination">Choose a spot</label><select class="destination-select" id="fallback-destination">${spots.map((spot) => `<option value="${spot.id}">${spot.name}</option>`).join("")}</select><button class="secondary" data-action="fallback-go">Play →</button></div>`;
  document.querySelector("#quality-note")!.textContent = "2D LOBBY";
  renderCameraUI();
  renderWelcome();
}
bindJoystick(document.querySelector<HTMLElement>("#joystick")!, (x, y) => { if (world) world.joystick = { x, y }; });
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
captureInvite();
const accountReady = ensureAccount().then((p) => {
  try {
    if (!localStorage.getItem("darecade-preview-backup")) {
      const old = localStorage.getItem("darecade-v1");
      if (old) localStorage.setItem("darecade-preview-backup", old);
    }
  } catch {}
  Object.assign(save, p.progress);
  profileReady = true;
  worldConnection.start();
  sentPreferences = JSON.stringify(
    Object.fromEntries(preferenceKeys.map((k) => [k, save[k]])),
  );
  renderStats();
  renderWelcome();
  void syncSocial();
  // A new player who arrived by a friend's link is tied to them now; both are
  // rewarded when the first round is finished.
  void acceptPendingInvite(save.rounds).then((invite) => {
    if (invite)
      toast(
        `${invite.name} invited you. Finish a round and you both get +${invite.xp} XP.`,
      );
  });
  return p;
});
window.addEventListener("account-profile", ((event: CustomEvent<Profile>) => {
  if (!profileReady) return;
  const away = save.away,
    awaySince = save.awaySince;
  const look = (s: typeof save) =>
    [
      s.outfit,
      s.skin,
      s.body,
      s.hat,
      s.clothing,
      s.hair,
      s.pet,
      s.accessory,
    ].join();
  const before = look(save);
  Object.assign(save, event.detail.progress, { away, awaySince });
  writeSave(save);
  // Rebuilding the 3D avatar is slow; do it only when the look changed.
  if (look(save) !== before) world?.updateAvatar();
  renderStats();
  renderWelcome();
  if (event.detail.styleRewards) void claimStyleRewards();
}) as EventListener);
window.addEventListener("account-session", () => {
  if (!profileReady) return;
  worldConnection.refreshSession();
  void syncSocial();
});
window.addEventListener("account-refresh", () => void syncSocial());
function showPaymentReturn() {
  const paymentReturn = new URL(location.href);
  if (paymentReturn.searchParams.has("payment")) {
    const session = paymentReturn.searchParams.get("session_id") || "";
    const cancelled = paymentReturn.searchParams.get("payment") === "cancelled";
    paymentReturn.searchParams.delete("payment");
    paymentReturn.searchParams.delete("session_id");
    history.replaceState(null, "", paymentReturn);
    open("support");
    void mountPayments(body, "", session, cancelled);
  }
}
requestAnimationFrame(async () => {
  try {
    await accountReady;
    if (save.twoD) {
      enable2D();
      renderAway();
      document.querySelector("#loading")!.remove();
      showPaymentReturn();
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
        document.body.classList.toggle("has-nearby", !!id);
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
    const quality = localStorage.getItem("playsimi-quality");
    world.setQuality(
      quality === "quality"
        ? "quality"
        : quality === "performance"
          ? "performance"
          : "auto",
    );
    if (save.away) world.setAway(true);
    applyWorldPlayers();
    renderCameraUI();
    renderAway();
    world.paused = modal.open;
  } catch (error) {
    if (!profileReady) {
      const loading = document.querySelector("#loading")!;
      const setupPending =
        error instanceof Error &&
        error.message.startsWith("Play Simi is being set up.");
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
  showPaymentReturn();
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
    away: save.away,
    activity: save.awayActivity,
    x: world?.player.root.position.x,
    z: world?.player.root.position.z,
    yaw: world?.player.root.rotation.y,
    emote: is2d
      ? Date.now() < emote2d.until
        ? emote2d.id
        : ""
      : world?.emote || "",
  };
}
async function syncSocial() {
  if (!profileReady) return;
  if (syncing) {
    syncRequested = true;
    return;
  }
  syncing = true;
  const player = currentProfile?.id;
  try {
    const next = await api<SharedState>("state");
    if (player !== currentProfile?.id || next.me !== player) return;
    shared = next;
    // XP is monotonic. Include passive invite awards without letting an older
    // poll undo a newer/queued progress response or local preference choice.
    save.xp = Math.max(save.xp, shared.profile.progress.xp);
    save.medalTokens = shared.profile.progress.medalTokens;
    if (shared.profile.styleRewards) void claimStyleRewards();
    if (currentProfile) {
      currentProfile.playMedals = latestPlayMedals(
        currentProfile.playMedals,
        shared.profile.playMedals,
      );
      shared.profile.playMedals = currentProfile.playMedals;
      currentProfile.progress.xp = save.xp;
      currentProfile.progress.medalTokens = save.medalTokens;
    }
    writeSave(save);
    renderStats();
    if (modal.open && body.querySelector(".style-wallet"))
      body.querySelector(".style-wallet strong")!.textContent =
        tokenSummary(save);
    for (const button of Array.from(
      body.querySelectorAll<HTMLButtonElement>("[data-redeem-set]"),
    )) {
      const look = tokenLooks.find(
        (look) => look.id === button.dataset.redeemSet,
      );
      if (look) button.disabled = styleTokens(save) < look.cost;
    }
    const signature = JSON.stringify([
      shared.day,
      shared.profile.playMedals,
      shared.self,
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
      shared.friends,
      shared.boards,
      shared.weekly,
      shared.season,
      shared.seasonHistory,
      shared.history,
      shared.dares,
      shared.recentRuns,
    ]);
    const changed = signature !== sharedSignature || !connected;
    sharedSignature = signature;
    connected = true;
    const me = shared.self;
    document.querySelector("#player-name")!.textContent = me.name;
    document.querySelector("#medal-points")!.textContent =
      `${shared.profile.playMedals?.total ?? 0} PLAY MEDAL POINTS · ${me.points} RANKED`;
    savedNeighbours = shared.players;
    hiddenNeighbours.clear();
    applyWorldPlayers();
    if (changed && modal.open && socialPanel === "board") renderSharedBoard();
    if (changed && modal.open && socialPanel === "dares") renderSharedDares();
    if (changed && modal.open && socialPanel === "neighbours")
      renderSharedNeighbours();
    const inspector = document.querySelector<HTMLElement>("#inspector")!;
    if (changed && !inspector.hidden && inspector.dataset.player)
      renderPlayerInspector(inspector.dataset.player);
  } catch {
    connected = false;
    if (modal.open && socialPanel === "board") renderSharedBoard();
    if (modal.open && socialPanel === "dares") renderSharedDares();
  } finally {
    syncing = false;
    if (syncRequested) {
      syncRequested = false;
      void syncSocial();
    }
  }
}
function serverNote() {
  return connected
    ? ""
    : '<div class="note">Offline · rankings may be stale, challenges need a connection.</div>';
}
function renderSharedNeighbours() {
  const selected =
    body.querySelector<HTMLSelectElement>("#neighbour-choice")?.value;
  const players =
    shared?.players.filter((player) => player.id !== shared?.me) || [];
  const signature = JSON.stringify([
    connected,
    players.map((player) => [player.id, player.name, player.status]),
  ]);
  if (
    body.querySelector("#neighbour-choice") &&
    signature === neighbourRosterSignature
  )
    return;
  const keepFocus = document.activeElement?.id === "neighbour-choice";
  neighbourRosterSignature = signature;
  body.innerHTML = `<h2>Neighbours</h2>${serverNote()}<label class="field-label" for="neighbour-choice">Choose a neighbour</label><select class="destination-select" id="neighbour-choice">${players.length ? `<optgroup label="Players">${players.map((player) => `<option value="player:${player.id}">${escapeText(player.name)} · ${player.status}</option>`).join("")}</optgroup>` : ""}<optgroup label="Example neighbours">${residents.map((resident) => `<option value="resident:${resident.id}">${resident.name}</option>`).join("")}</optgroup></select><div class="simple-menu"><button class="menu-choice" data-action="visit-neighbour">Visit</button><button class="menu-choice" data-open="worlds">Worlds</button><button class="menu-choice" data-action="report-neighbour">Report or hide</button></div><details class="menu-details"><summary>Bring a friend</summary><button class="secondary" data-open="invite">Invite a friend</button></details>`;
  const picker = body.querySelector<HTMLSelectElement>("#neighbour-choice")!;
  if (
    selected &&
    Array.from(picker.options).some((option) => option.value === selected)
  )
    picker.value = selected;
  body.querySelector<HTMLButtonElement>(
    '[data-action="report-neighbour"]',
  )!.disabled = !picker.value.startsWith("player:");
  if (keepFocus) picker.focus();
}
function rankingPeriodPicker() {
  const current = shared?.season;
  return `<label class="field-label" for="board-period">Show</label><select class="destination-select" id="board-period">${current ? `<option value="season:${current.id}" ${boardTab === `season:${current.id}` ? "selected" : ""}>${escapeText(current.name)}</option>` : ""}<option value="week" ${boardTab === "week" ? "selected" : ""}>Weekly medals</option><option value="daily" ${boardTab === "daily" ? "selected" : ""}>Today’s scores</option>${(shared?.seasonHistory || []).map((s) => `<option value="season:${s.id}" ${boardTab === `season:${s.id}` ? "selected" : ""}>${escapeText(s.name)} · past</option>`).join("")}</select>`;
}
function renderSeasonBoard(season: SeasonStanding) {
  modal.classList.remove("race-board");
  const past = season.id !== shared?.season?.id;
  const rows = season.standings;
  const date = new Date(season.startsAt).toLocaleDateString("en-SG", {
    timeZone: "Asia/Singapore",
  });
  body.innerHTML = `<span class="eyebrow">LEAGUE</span><h2>Rankings</h2>${serverNote()}${playMedalGoal(currentProfile?.playMedals)}<section class="your-standing"><div><span>YOUR SEASON RANK</span><strong>${season.rank ? `#${season.rank}` : "—"}</strong><small>${past ? "Past season" : "Medals settle at midnight"}</small></div><div class="standing-stats"><span><b>${season.points}</b>Season medals</span><span><b>${season.xp}</b>Season XP</span><span><b>${save.xp}</b>Lifetime XP</span></div></section>${rankingPeriodPicker()}<p class="fine-print">${escapeText(season.name)} · from ${date} SGT. Daily medals build this ranking. XP keeps your lifetime level and earns tokens once.</p><div class="leaderboard">${rows.map((p) => `<div class="${p.id === shared?.me ? "you-row" : ""}"><b>#${p.rank}</b><span>${escapeText(p.name)}${p.id === shared?.me ? " · You" : ""}</span><strong>${p.points}<small>MEDAL PTS</small></strong></div>`).join("") || `<section class="board-empty"><h3>${past ? "No medals" : "A fresh season"}</h3><p>${past ? "No saved medal results for this season." : "Play today. Top daily ranks earn medals at 00:00 SGT. Your earlier progress stays saved."}</p>${past ? "" : `<button class="primary" data-game="${boardGame}">Play ${games[boardGame].name}</button>`}</section>`}</div><details class="scoring-guide"><summary>Lifetime & history</summary><p>${shared?.self.points || 0} lifetime medal points · ${save.xp} lifetime XP · Level ${1 + Math.floor(save.xp / 100)}.</p><p>Earlier scores, outfits and tokens stay saved. Past seasons are in Show. Your personal bests are on each game card.</p></details>${!currentProfile?.account ? `<details class="scoring-guide"><summary>How guest progress is saved</summary><p>${guestSaveCopy}</p><p>${emailSaveCopy}</p><button class="secondary" data-account>Link an email</button></details>` : ""}`;
}
function renderSharedBoard() {
  if (shared?.season && !boardPeriodChosen && boardTab !== "daily")
    boardTab = `season:${shared.season.id}`;
  if (boardTab.startsWith("season:")) {
    const season = [shared?.season, ...(shared?.seasonHistory || [])].find(
      (s) => s && boardTab === `season:${s.id}`,
    );
    if (season) {
      renderSeasonBoard(season);
      return;
    }
    boardTab = "week";
  }
  modal.classList.toggle(
    "race-board",
    boardTab === "daily" && boardGame === "coast",
  );
  const me = shared?.self;
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
      : board.map((p) => ({ ...p, value: formatScore(boardGame, p.score) }));
  const unit =
    boardTab === "week"
      ? "MEDAL PTS"
      : boardGame === "coast"
        ? "RACE TIME"
        : "GAME SCORE";
  const rank = boardTab === "week" ? ownWeek?.rank : ownDay?.rank;
  const podium = list.filter((p) => p.rank <= 3);
  const targets = board.filter((p) => p.id !== shared?.me);
  const target = targets.find((p) => p.id === boardTarget) || targets[0];
  const challenge =
    boardTab === "daily" && target
      ? `<details class="scoring-guide"><summary>Challenge a saved score</summary><select id="board-target" class="destination-select" aria-label="Score to challenge">${targets.map((p) => `<option value="${p.id}" ${p.id === target.id ? "selected" : ""}>${escapeText(p.name)} · ${formatScore(boardGame, p.score)}</option>`).join("")}</select><button class="primary" data-challenge="${boardGame}" data-defender="${target.id}" data-target-run="${target.runId}" ${!shared?.competitionReady || !connected || (me?.outgoing || 0) >= 3 || shared?.challenged.includes(target.id) ? "disabled" : ""}>Beat this score</button><p class="fine-print">The selected score freezes at start. Resting or offline players only.</p></details>`
      : "";
  // Weekly ranks are built from medals, which only exist after midnight.
  const playedToday = gameIds.some((g) =>
    shared?.boards[g].some((p) => p.id === shared?.me),
  );
  // A guest can read the board. Their rounds earn XP and are not ranked.
  const guest = !currentProfile?.account;
  const waiting = guest
    ? "Your Play medal goal is above"
    : boardTab !== "week"
      ? "Finish a round to join the board"
      : pending
        ? `+${pending} medal points pending · awarded at 00:00 SGT`
        : playedToday
          ? "You’re on today’s board · top 3 win medals at midnight"
          : "Finish a round to join the board";
  // Sunday's medals belong to the week that ends at the same midnight.
  const weekEnds = new Date(`${shared?.day}T00:00:00Z`).getUTCDay() === 0;
  const awarded = weekEnds
    ? "They are awarded at 00:00 SGT and count for this week, which closes then: look under Last week’s champions tomorrow."
    : "They are awarded at 00:00 SGT and then appear here.";
  body.innerHTML = `${questTabs("board")}<span class="eyebrow">LEAGUE</span><h2>Rankings</h2>${serverNote()}${playMedalGoal(currentProfile?.playMedals)}${guest ? '<details class="scoring-guide"><summary>Ranked medal standings</summary>' : ""}<section class="your-standing"><div><span>YOUR ${boardTab === "week" ? "WEEKLY" : "DAILY"} RANK</span><strong>${rank ? "#" + rank : "—"}</strong><small>${rank ? "Nice!" : waiting}</small></div><div class="standing-stats"><span><b>${ownWeek?.points || 0}</b>This week</span><span><b>${pending ? "+" + pending : "0"}</b>Pending tonight</span><span><b>${me?.points || 0}</b>Lifetime</span></div></section>${guest ? "</details>" : ""}${rankingPeriodPicker()}${boardTab === "daily" ? `<label class="field-label" for="board-game">Game</label><select class="destination-select" id="board-game">${gameIds.map((g) => `<option value="${g}" ${g === boardGame ? "selected" : ""}>${games[g].name}</option>`).join("")}</select><p class="fine-print">${games[boardGame].name}${boardGame === "coast" ? " · Fastest three-lap time wins" : ""} · Your best today: <b>${formatScore(boardGame, ownDay?.score || 0)}</b> · Each player’s best score of the day is listed, so a lower replay does not replace it. Medals are pending until 00:00 SGT.</p>` : `<p class="fine-print">Week of ${shared?.week || "Monday"} · resets Monday 00:00 SGT</p>`}<div class="podium-cards">${podium.length ? podium.map((p) => `<article class="podium-card medal-${p.rank} ${p.id === shared?.me ? "is-you" : ""}"><span class="podium-medal">${["🥇", "🥈", "🥉"][p.rank - 1]}</span><small>RANK ${p.rank}${p.id === shared?.me ? " · YOU" : ""}</small><h3>${escapeText(p.name)}</h3><strong>${p.value}</strong><small>${unit}${boardTab === "daily" ? ` · +${4 - p.rank} PENDING` : ""}</small></article>`).join("") : `<div class="board-empty"><span>✦</span><h3>${guest ? "Nothing yet!" : boardTab !== "week" ? "Be the first!" : playedToday ? "Medals land at midnight" : "Nothing yet!"}</h3><p>${guest ? "Earn Play medals with the daily goal above. Email adds ranked arcade rounds; top 3 daily scores win ranked medals at midnight." : boardTab !== "week" ? "Finish a round to claim #1." : pending ? `Your scores today are worth +${pending} medal points so far. ${awarded}` : playedToday ? "Your rounds today are on Today’s scores. Top 3 in a game win medals at midnight." : "Top 3 daily scores win medals at midnight."}</p>${boardTab === "week" && playedToday ? '<button class="primary" data-board-tab="daily">See today’s scores →</button>' : `<button class="primary" data-game="${boardGame}">Play ${games[boardGame].name} →</button>`}</div>`}</div>${list.length ? `<div class="leaderboard">${list.map((p) => `<div class="${p.id === shared?.me ? "you-row" : ""}"><b>#${p.rank}</b><span>${escapeText(p.name)}${p.id === shared?.me ? " · You" : ""}</span><strong>${p.value}<small>${unit}</small></strong></div>`).join("")}</div>` : ""}${boardTab === "daily" && ownDay && board[0] ? `<div class="score-target"><label>${boardGame === "coast" ? "Your time / today’s fastest" : "Your score compared with today’s leader"} <b>${formatScore(boardGame, ownDay.score)} / ${formatScore(boardGame, board[0].score)}</b></label><progress value="${ownDay.score}" max="${Math.max(1, board[0].score)}"></progress></div>` : ""}${boardTab === "daily" && podium.length ? `<button class="primary" data-game="${boardGame}">Play ${games[boardGame].name}</button>` : ""}${challenge}<details class="scoring-guide"><summary>How scores become ranked medals</summary><div class="medal-rule"><span>🥇<b>+3</b>Gold</span><span>🥈<b>+2</b>Silver</span><span>🥉<b>+1</b>Bronze</span></div><p>1. Play any of the five daily games. Your best positive score counts. Coast Rush ranks fastest three-lap times.</p><p>2. At midnight Singapore time, each game awards its top three ranks. Gold earns 3 Style tokens, silver 2, bronze 1. Medal tokens cap at 3 per day across games.</p><p>3. Daily medals build your weekly total. The weekly board resets Monday; lifetime medals stay.</p><p class="fine-print">Ties share a rank (1, 1, 3). Pending medals can change before midnight. Cosmetic XP levels up your avatar and never affects ranks. Challenges record wins separately.</p></details><details class="scoring-guide"><summary>Last week’s champions</summary><div class="leaderboard">${(shared?.lastWeek || []).map((p) => `<div><b>#${p.rank}</b><span>${escapeText(p.name)}</span><strong>${p.points}<small>MEDAL PTS</small></strong></div>`).join("") || "<p>No completed week yet.</p>"}</div></details>${guest ? `<details class="scoring-guide"><summary>How guest progress is saved</summary><p>${guestSaveCopy}</p><p>${emailSaveCopy}</p><button class="secondary" data-account>Link an email</button></details>` : !shared?.competitionReady ? '<button class="secondary" data-account>Account & challenges →</button>' : ""}`;
}
function challengeButtons(p: SharedPlayer) {
  const best = p.challengeScores
    ? Object.fromEntries(
        playIds.map((game) => [game, p.challengeScores?.[game]?.score || 0]),
      )
    : p.best;
  const previous = challengeGameByPlayer.get(p.id);
  const selected =
    previous && best[previous] > 0
      ? previous
      : playIds.find((game) => best[game] > 0);
  const blocked = dareBlock({
    connected,
    left: 3 - (shared?.self?.outgoing || 0),
    own: p.id === shared?.me,
    online: p.status === "online",
    challenged: shared?.challenged.includes(p.id),
    noScore: !selected,
  });
  const eligible = !!shared?.competitionReady && !blocked;
  return `<label class="field-label" for="challenge-game-${p.id}">Game</label><select class="destination-select" id="challenge-game-${p.id}" data-challenge-picker="${p.id}">${playIds.map((game) => `<option value="${game}" ${selected === game ? "selected" : ""} ${!best[game] ? "disabled" : ""}>${games[game].name} · ${best[game] ? formatScore(game, best[game]) : "No score"}</option>`).join("")}</select><button class="primary" data-challenge="${selected || gameIds[0]}" data-defender="${p.id}" data-target-run="${selected ? p.challengeScores?.[selected]?.runId || "" : ""}" ${!eligible || !selected ? "disabled" : ""}>Play challenge</button>${blocked && shared?.competitionReady ? `<p class="fine-print dare-reason">${blocked}</p>` : ""}`;
}
function renderSharedDares() {
  const previous = body.querySelector<HTMLSelectElement>("#dare-choice")?.value;
  const back =
    '<button class="text-button menu-back" data-open="dares">← Back</button>';
  const ready = !!shared?.competitionReady;
  const left = Math.max(0, 3 - (shared?.self.outgoing || 0));
  const eligibility = dareHoldCopy(ready, currentProfile?.account);
  const rule = `<p class="fine-print">${eligibility || `${left}/3 left today. Score freezes at start. Resets midnight SGT.`}</p>`;
  if (dareView === "home") {
    body.innerHTML = `${questTabs("dares")}<h2>Challenges</h2>${serverNote()}<p>Beat a saved score.</p><div class="simple-menu"><button class="menu-choice" data-open="dares-neighbour">Friends & neighbours</button><button class="menu-choice" data-open="dares-board">Today’s scores</button><button class="menu-choice" data-open="dares-find">Save a friend</button></div>${rule}<details class="menu-details"><summary>Recent challenges</summary><div class="challenge-history">${shared?.history.map((r) => `<div><strong>${escapeText(r.challenger)} → ${escapeText(r.defender)}</strong><span>${games[r.game].name} · ${r.status === "finished" ? `${formatScore(r.game, r.score || 0)} vs ${formatScore(r.game, r.targetScore)} · ${r.score! > r.targetScore ? "WON" : r.score === r.targetScore ? "TIED" : "HELD"}` : "ENDED"}</span></div>`).join("") || "<p>No challenges yet.</p>"}</div></details>`;
    return;
  }
  if (dareView === "find") {
    body.innerHTML = `${questTabs("dares")}${back}<h2>Save a friend</h2><p>Ask for their exact nickname.</p><form id="save-friend"><label>Nickname<input name="name" minlength="2" maxlength="20" required autocomplete="off"></label><button class="primary">Save friend</button><p role="status"></p></form>`;
    body.querySelector<HTMLFormElement>("#save-friend")!.onsubmit = async (
      event,
    ) => {
      event.preventDefault();
      const form = event.currentTarget as HTMLFormElement;
      const button = form.querySelector("button")!;
      button.disabled = true;
      try {
        const friends = await api<SharedPlayer[]>("friends", {
          name: new FormData(form).get("name"),
        });
        if (shared) shared.friends = friends;
        dareView = "neighbour";
        renderSharedDares();
      } catch (error) {
        form.querySelector("[role=status]")!.textContent = (
          error as Error
        ).message;
        button.disabled = false;
      }
    };
    return;
  }
  const players = [
    ...new Map(
      [...(shared?.friends || []), ...(shared?.players || [])]
        .filter((p) => p.id !== shared?.me)
        .map((p) => [p.id, p]),
    ).values(),
  ];
  const selected = players.find((p) => p.id === previous) || players[0];
  body.innerHTML = `${questTabs("dares")}${back}<h2>Friends & neighbours</h2>${serverNote()}${players.length ? `<label class="field-label" for="dare-choice">Choose a player</label><select class="destination-select" id="dare-choice">${players.map((p) => `<option value="${p.id}" ${p.id === selected?.id ? "selected" : ""}>${escapeText(p.name)} · ${p.status}</option>`).join("")}</select>` : "<p>Save a friend to find their scores here.</p>"}${selected ? challengeButtons(selected) : ""}${rule}`;
}
function renderPlayerInspector(id: string) {
  const p = shared?.players.find((p) => p.id === id);
  if (!p) return;
  const el = document.querySelector<HTMLElement>("#inspector")!;
  el.innerHTML = `<button class="close-button" data-action="close-inspector" aria-label="Stop inspecting neighbour">×</button><span class="eyebrow">${p.status.toUpperCase()} · SAVED NEIGHBOUR</span><h3>${escapeText(p.name)}</h3><p>${p.points} ranked medal points · ${p.wins} challenge wins<br>${activities[p.activity].icon} ${activities[p.activity].name}</p><div class="resident-outfit"><i style="background:${outfits[p.look.outfit]}"></i><span>${clothingNames[p.look.clothing || 0]} · ${petNames[p.look.pet || 0]} · ${accessoryNames[p.look.accessory || 0]}</span></div><strong>${shared?.challenged.includes(p.id) ? "Already challenged today" : shared?.competitionReady ? "Ready for a friendly challenge" : "Challenges are not open for you yet"}</strong>${challengeButtons(p)}<button class="secondary" data-join-friend="${p.id}">Join friend’s world</button><button class="secondary" data-report="${p.id}">Report or hide this player</button><p class="fine-print">${dareHoldCopy(!!shared?.competitionReady, currentProfile?.account) || "Starting uses one of your three daily challenges. Beat their saved score to win."} Drag to orbit; scroll or pinch to zoom.</p>`;
}
function showPlayer(id: string) {
  if (!shared?.players.some((p) => p.id === id)) return;
  if (is2d) {
    const player = shared?.players.find((p) => p.id === id);
    if (!player) return;
    openShell("NEIGHBOUR");
    body.innerHTML = `<h2>${escapeText(player.name)}</h2><p>${activities[player.activity].name}</p><div class="simple-menu"><button class="secondary" data-open="dares">Challenges</button><button class="secondary" data-join-friend="${player.id}">Join their world</button><button class="secondary" data-report="${player.id}">Report or hide</button></div>`;
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
window.setInterval(() => void syncSocial(), 30000);
let savedNeighbours: SharedPlayer[] = [];
let liveNeighbours: SharedPlayer[] = [];
const hiddenNeighbours = new Set<string>();
function applyWorldPlayers() {
  if (!shared) return;
  const liveIds = new Set(liveNeighbours.map((p) => p.id));
  const cards = new Map(savedNeighbours.map((p) => [p.id, p]));
  shared.players = [
    ...liveNeighbours.map((p) => ({
      ...cards.get(p.id),
      ...p,
      best: cards.get(p.id)?.best || p.best,
      points: cards.get(p.id)?.points || 0,
      incoming: cards.get(p.id)?.incoming || 0,
      outgoing: cards.get(p.id)?.outgoing || 0,
      wins: cards.get(p.id)?.wins || 0,
    })),
    ...savedNeighbours.filter(
      (p) =>
        !liveIds.has(p.id) &&
        !hiddenNeighbours.has(p.id) &&
        p.status !== "online",
    ),
  ];
  world?.syncPlayers(shared.players, shared.me, liveIds);
  if (modal.open && socialPanel === "neighbours") renderSharedNeighbours();
}
let currentWorld = "";
let worldStatus: "joining" | "connected" | "reconnecting" | "offline" =
  "joining";
function renderWorldPresence() {
  const label = document.querySelector(".demo-tag")!;
  const text = worldPresenceCopy(
    liveNeighbours,
    currentProfile?.id,
    worldStatus,
    navigator.onLine,
  );
  if (label.textContent !== text) label.textContent = text;
}
const worldConnection = new WorldConnection(
  presenceData,
  (players) => {
    const ids = new Set(players.map((p) => p.id));
    for (const p of liveNeighbours)
      if (!ids.has(p.id)) hiddenNeighbours.add(p.id);
    liveNeighbours = players;
    applyWorldPlayers();
    renderWorldPresence();
  },
  (name) => {
    currentWorld = name;
    document.querySelector("#current-world")!.textContent =
      `World ${name.slice(6)} · ${worldCode(name)}`;
  },
  (status) => {
    worldStatus = status;
    renderWorldPresence();
    const label = document.querySelector("#current-world")!;
    const room = currentWorld
      ? `World ${currentWorld.slice(6)} · ${worldCode(currentWorld)}`
      : "World";
    label.textContent =
      status === "connected"
        ? room
        : status === "joining"
          ? "Joining world…"
          : `${room} · ${status === "offline" ? "offline" : "reconnecting…"}`;
  },
);
const worldPicker = new WorldPicker(
  body,
  () => modal.open && socialPanel === "worlds",
  () => currentWorld,
  async (name) => {
    await worldConnection.join(name);
    dismissInspector();
    hiddenNeighbours.clear();
    savedNeighbours = [];
    await syncSocial();
  },
  toast,
);

function firstRacePending() {
  return save.rounds === 0;
}
function renderWelcome() {
  const firstRace = firstRoundGoalPending(save);
  document.body.classList.toggle("first-race", firstRace);
  document.body.classList.toggle("welcome-active", firstRace);
  document.body.classList.toggle("welcome-played", save.welcome === "played");
  const invitation = `<div class="eyebrow">${firstVisitCopy.kicker}</div><h1>${firstVisitCopy.title}</h1><p>${firstVisitCopy.detail}</p><p class="welcome-explore">${firstVisitCopy.explore}</p><button class="primary" data-action="welcome-start" data-main-action>Play now ${icon("arrow")}</button><div class="welcome-options"><button class="text-button" data-open="settings">Settings</button><button class="text-button" data-account>Account & privacy</button></div>`;
  const el = document.querySelector<HTMLElement>(".welcome-panel")!;
  el.hidden = !firstRace;
  const html = firstRace ? invitation : "";
  if (el.dataset.welcome !== String(firstRace)) {
    el.innerHTML = html;
    el.dataset.welcome = String(firstRace);
  }
  const fallback = document.querySelector("#fallback-welcome");
  if (
    fallback instanceof HTMLElement &&
    fallback.dataset.welcome !== String(firstRace)
  ) {
    fallback.innerHTML = html;
    fallback.dataset.welcome = String(firstRace);
  }
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
    ["replay", "Did you want another round?", ["Yes", "Keep playing", "No"]],
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
// Sound: browsers only start audio after a gesture, so unlock on the first
// tap or key. Music follows the time of day and switches to chiptune in games.
startTune();
for (const type of ["pointerdown", "keydown"])
  document.addEventListener(type, () => audio.unlock(), { passive: true });
window.setInterval(updateMusic, 1000);
window.setInterval(() => {
  if (world && !world.paused && !modal.open && world.player?.moving)
    beep("step");
}, 300);
