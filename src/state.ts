import { legendarySets, tokenLooks } from "./collections.ts";
import { validWaterTrail } from "../shared/plot-trail.ts";
import { appearanceLimits } from "./appearance.ts";
export const outfits = [
  "#bbec66",
  "#b4a0f5",
  "#ff927b",
  "#76cfe0",
  "#f5cb66",
  "#f0e6d6",
];
export const skins = [
  "#f6c9a1",
  "#dca574",
  "#af7953",
  "#80523e",
  "#f4d8c6",
  "#c5916e",
  "#694536",
  "#e7b998",
];
import {
  activities,
  playIds,
  type ActivityId,
  type GameId,
} from "./catalog.ts";
export type { GameId } from "./catalog.ts";
export type Save = {
  version: 1;
  outfit: number;
  skin: number;
  /** 0 girl, 1 boy. */
  body: number;
  clothing: number;
  hair: number;
  pet: number;
  accessory: number;
  hat: number;
  unlockedHats: number[];
  xp: number;
  medalTokens: number;
  wardrobeSpent: number;
  wardrobeUnlocked: string[];
  wardrobePurchased: string[];
  coins: string[];
  week: string;
  giftDay: string;
  gift: number;
  visited: string[];
  cat: boolean;
  rounds: number;
  best: Record<GameId, number>;
  coastRecord: { version: 3; timeTicks: number; place: number };
  coastLegacyBest: number;
  sound: boolean;
  music: boolean;
  reduced: boolean;
  twoD: boolean;
  light: string;
  claims: string[];
  cameraMode: "isometric" | "third";
  awayActivity: ActivityId;
  awaySince: number;
  away: boolean;
  welcome: "new" | "cabinet" | "played" | "complete";
  welcomeDismissed: boolean;
  nameChosen: boolean;
  /** East Side: species caught, best of ten hoops, and the one garden plot. */
  fish: string[];
  hoopsBest: number;
  /** Open Stage: best show score, and the XP earned from shows on stageDay. */
  stageBest: number;
  stageDay: string;
  stageXp: number;
  stageLast: number;
  plotCrop: string;
  plotPlanted: number;
  plotWatered: boolean;
  harvests: number;
};
export function singaporeDay(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
export function singaporeWeek(date = new Date()) {
  const d = new Date(singaporeDay(date) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export function fresh(): Save {
  return {
    version: 1,
    outfit: 0,
    skin: 0,
    body: 0,
    clothing: 0,
    // New players start as the source character: pink twin buns (free).
    hair: 38,
    pet: 0,
    accessory: 0,
    hat: 0,
    unlockedHats: [0],
    xp: 0,
    medalTokens: 0,
    wardrobeSpent: 0,
    wardrobeUnlocked: [],
    wardrobePurchased: [],
    coins: [],
    week: singaporeWeek(),
    giftDay: "",
    gift: 0,
    visited: [],
    cat: false,
    rounds: 0,
    best: {
      noodle: 0,
      brick: 0,
      hop: 0,
      swarm: 0,
      coast: 0,
      hoops: 0,
      fishing: 0,
    },
    coastRecord: { version: 3, timeTicks: 0, place: 0 },
    coastLegacyBest: 0,
    cameraMode: "third",
    awayActivity: "jog",
    awaySince: 0,
    away: false,
    sound: true,
    music: true,
    reduced:
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    twoD: false,
    light: "dusk",
    claims: [],
    welcome: "new",
    welcomeDismissed: false,
    nameChosen: false,
    fish: [],
    hoopsBest: 0,
    stageBest: 0,
    stageDay: "",
    stageXp: 0,
    stageLast: 0,
    plotCrop: "",
    plotPlanted: 0,
    plotWatered: false,
    harvests: 0,
  };
}
export function normalise(raw: unknown, fallback: Save): Save {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Partial<Save>;
  const s = { ...fallback, best: { ...fallback.best } };
  if (["new", "cabinet", "played", "complete"].includes(r.welcome!))
    s.welcome = r.welcome!;
  if (typeof r.welcomeDismissed === "boolean")
    s.welcomeDismissed = r.welcomeDismissed;
  if (typeof r.nameChosen === "boolean") s.nameChosen = r.nameChosen;
  if (r.cameraMode === "third" || r.cameraMode === "isometric")
    s.cameraMode = r.cameraMode;
  if (r.awayActivity && Object.hasOwn(activities, r.awayActivity))
    s.awayActivity = r.awayActivity;
  if (typeof r.away === "boolean") s.away = r.away;
  if (Number.isFinite(r.awaySince) && r.awaySince! >= 0)
    s.awaySince = Math.min(Date.now(), r.awaySince!);
  for (const key of [
    "outfit",
    "skin",
    "body",
    "hat",
    "gift",
    "clothing",
    "hair",
    "pet",
    "accessory",
  ] as const)
    if (
      Number.isInteger(r[key]) &&
      r[key]! >= 0 &&
      r[key]! <
        {
          outfit: 6,
          skin: 8,
          body: 2,
          hat: 4,
          gift: 3,
          ...appearanceLimits,
        }[key]
    )
      s[key] = r[key]!;
  s.wardrobePurchased = tokenLooks
    .filter(
      (set) =>
        Array.isArray(r.wardrobePurchased) &&
        r.wardrobePurchased.includes(set.id),
    )
    .map((set) => set.id);
  s.wardrobeUnlocked = tokenLooks
    .filter(
      (set) =>
        Array.isArray(r.wardrobeUnlocked) &&
        r.wardrobeUnlocked.includes(set.id),
    )
    .map((set) => set.id);
  s.wardrobeSpent = s.wardrobeUnlocked.reduce(
    (sum, id) => sum + tokenLooks.find((set) => set.id === id)!.cost,
    0,
  );
  for (const key of ["xp", "rounds", "medalTokens"] as const)
    if (Number.isFinite(r[key]) && r[key]! >= 0)
      s[key] = Math.floor(Math.min(r[key]!, 1e8));
  for (const key of ["sound", "music", "reduced", "cat", "twoD"] as const)
    if (typeof r[key] === "boolean") s[key] = r[key]!;
  for (const key of ["visited", "claims"] as const)
    if (Array.isArray(r[key]))
      s[key] = r[key]!.filter((v): v is string => typeof v === "string").slice(
        0,
        50,
      );
  if (["auto", "day", "dusk", "night"].includes(r.light!)) s.light = r.light!;
  if (Array.isArray(r.fish))
    s.fish = fishSpecies.map((f) => f.id).filter((id) => r.fish!.includes(id));
  if (Number.isInteger(r.stageBest))
    s.stageBest = Math.max(0, Math.min(STAGE_SCORE_LIMIT, r.stageBest!));
  if (typeof r.stageDay === "string" && /^\d{4}-\d\d-\d\d$/.test(r.stageDay))
    s.stageDay = r.stageDay;
  if (Number.isInteger(r.stageXp))
    s.stageXp = Math.max(0, Math.min(STAGE_DAILY_XP, r.stageXp!));
  if (Number.isFinite(r.stageLast)) s.stageLast = Math.max(0, r.stageLast!);
  if (Number.isInteger(r.hoopsBest))
    s.hoopsBest = Math.max(0, Math.min(HOOPS_SHOTS, r.hoopsBest!));
  if (Number.isInteger(r.harvests) && r.harvests! >= 0)
    s.harvests = Math.min(r.harvests!, 1e6);
  if (
    crops.some((c) => c.id === r.plotCrop) &&
    Number.isFinite(r.plotPlanted) &&
    r.plotPlanted! > 0
  ) {
    s.plotCrop = r.plotCrop!;
    s.plotPlanted = Math.floor(r.plotPlanted!);
    s.plotWatered = r.plotWatered === true;
  }
  if (typeof r.giftDay === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.giftDay))
    s.giftDay = r.giftDay;
  if (r.week === fallback.week && Array.isArray(r.coins))
    s.coins = [...new Set(r.coins.filter((v) => /^coin[0-4]$/.test(v)))];
  s.unlockedHats = [
    ...new Set([
      0,
      s.hat,
      ...(s.welcome === "played" || s.welcome === "complete" ? [2] : []),
      ...(Array.isArray(r.unlockedHats)
        ? r.unlockedHats.filter((v) => Number.isInteger(v) && v >= 0 && v <= 3)
        : []),
    ]),
  ];
  for (const key of playIds)
    if (Number.isFinite(r.best?.[key]) && r.best![key] >= 0)
      s.best[key] = Math.min(1e7, Math.floor(r.best![key]));
  const record = r.coastRecord;
  if (
    record?.version === 3 &&
    Number.isInteger(record.timeTicks) &&
    record.timeTicks >= 0 &&
    record.timeTicks <= 7200 &&
    Number.isInteger(record.place) &&
    record.place >= 0 &&
    record.place <= 8
  ) {
    s.coastRecord = { ...record };
    s.coastLegacyBest = Number.isFinite(r.coastLegacyBest)
      ? Math.max(0, r.coastLegacyBest!)
      : 0;
  } else {
    // Keep the best from the previous rules, but never compare it with the
    // current route: two laps, then three on the old loop, now the winding one.
    s.coastLegacyBest =
      s.best.coast ||
      (Number.isFinite(r.coastLegacyBest)
        ? Math.max(0, r.coastLegacyBest!)
        : 0);
    s.best.coast = 0;
    s.coastRecord = { version: 3, timeTicks: 0, place: 0 };
  }
  return s;
}
export function readSave(): Save {
  try {
    return normalise(
      JSON.parse(localStorage.getItem("darecade-v1") || "null"),
      fresh(),
    );
  } catch {
    return fresh();
  }
}
export function writeSave(s: Save) {
  try {
    localStorage.setItem("darecade-v1", JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}
export function completeWelcomeRound(s: Save) {
  if (s.welcome === "played" || s.welcome === "complete") return false;
  s.welcome = "played";
  s.welcomeDismissed = false;
  s.xp += 35;
  if (!s.unlockedHats.includes(2)) s.unlockedHats.push(2);
  return true;
}
export function firstRoundGoalPending(
  s: Pick<Save, "rounds" | "unlockedHats">,
) {
  return s.rounds === 0 && !s.unlockedHats.includes(2);
}
export function claimGift(s: Save, choice: number, day = singaporeDay()) {
  if (
    s.giftDay === day ||
    !Number.isInteger(choice) ||
    choice < 0 ||
    choice > 2
  )
    return false;
  s.giftDay = day;
  s.gift = choice;
  s.xp += 30;
  s.hat = choice + 1;
  if (!s.unlockedHats.includes(s.hat)) s.unlockedHats.push(s.hat);
  return true;
}
// ---------------------------------------------------------------- East Side
// These rules run on the server as well as in the browser. Rewards are small,
// cosmetic and bounded, and never touch medals or the arcade boards.
export const fishSpecies = [
  { id: "guppy", name: "Longkang guppy", icon: "🐟", weight: 30 },
  { id: "tilapia", name: "Pond tilapia", icon: "🐠", weight: 26 },
  { id: "catfish", name: "Whiskered catfish", icon: "🐡", weight: 18 },
  { id: "prawn", name: "River prawn", icon: "🦐", weight: 14 },
  { id: "terrapin", name: "Sunbathing terrapin", icon: "🐢", weight: 6 },
  { id: "koi", name: "Golden koi", icon: "✨", weight: 6 },
] as const;
export const FISH_XP = 10;
/** Returns true for a species caught for the first time, null for an unknown id. */
export function catchFish(s: Save, id: unknown) {
  if (!fishSpecies.some((f) => f.id === id)) return null;
  if (s.fish.includes(id as string)) return false;
  s.fish.push(id as string);
  s.xp += FISH_XP;
  return true;
}
/** Open Stage: five XP a star, at most three shows' worth a day. */
export const STAGE_STAR_XP = 5;
export const STAGE_DAILY_XP = 45;
export const STAGE_SCORE_LIMIT = 100000;
/** A show lasts forty seconds, so two reports closer than this are refused. */
export const STAGE_REST_MS = 30000;
/**
 * Records a show. Returns the XP earned, or null if the report is malformed
 * or arrives before another show could have been played.
 */
export function performShow(
  s: Save,
  value: unknown,
  now: number,
  today: string,
) {
  const v = value as { score?: unknown; stars?: unknown } | null;
  if (
    !v ||
    !Number.isInteger(v.score) ||
    (v.score as number) < 0 ||
    (v.score as number) > STAGE_SCORE_LIMIT ||
    !Number.isInteger(v.stars) ||
    (v.stars as number) < 0 ||
    (v.stars as number) > 3 ||
    now - s.stageLast < STAGE_REST_MS
  )
    return null;
  if (s.stageDay !== today) {
    s.stageDay = today;
    s.stageXp = 0;
  }
  const gain = Math.min(
    (v.stars as number) * STAGE_STAR_XP,
    STAGE_DAILY_XP - s.stageXp,
  );
  s.stageLast = now;
  s.stageXp += gain;
  s.xp += gain;
  s.stageBest = Math.max(s.stageBest, v.score as number);
  return gain;
}
export const HOOPS_SHOTS = 10;
export const HOOPS_XP = 5;
/** Records a round of ten shots. Only a new best earns XP. Returns the XP, or null if invalid. */
export function scoreHoops(s: Save, made: unknown) {
  if (
    !Number.isInteger(made) ||
    (made as number) < 0 ||
    (made as number) > HOOPS_SHOTS
  )
    return null;
  const gain = Math.max(0, (made as number) - s.hoopsBest) * HOOPS_XP;
  s.hoopsBest = Math.max(s.hoopsBest, made as number);
  s.xp += gain;
  return gain;
}
export const crops = [
  { id: "chilli", name: "Chilli padi", icon: "🌶", hours: 1, xp: 10 },
  { id: "pandan", name: "Pandan", icon: "🌿", hours: 3, xp: 15 },
  { id: "sunflower", name: "Sunflower", icon: "🌻", hours: 8, xp: 25 },
] as const;
const HOUR = 3600000;
const planted = (s: Save) => crops.find((c) => c.id === s.plotCrop);
/** The time the growing crop can be harvested, or 0 with an empty plot. */
export function cropReadyAt(s: Save) {
  const crop = planted(s);
  return crop ? s.plotPlanted + crop.hours * HOUR : 0;
}
export function plantCrop(s: Save, id: unknown, now: number) {
  if (s.plotCrop || !crops.some((c) => c.id === id)) return false;
  s.plotCrop = id as string;
  s.plotPlanted = now;
  s.plotWatered = false;
  return true;
}
/** Once per crop, watering brings the harvest a quarter of the remaining time closer. */
export function waterCrop(s: Save, now: number) {
  const ready = cropReadyAt(s);
  if (!ready || s.plotWatered || now >= ready) return false;
  s.plotPlanted -= Math.floor((ready - now) / 4);
  s.plotWatered = true;
  return true;
}
/** A solved trail grants the same single watering boost, never extra XP. */
export function tendCrop(s: Save, value: unknown, now: number) {
  if (
    !s.plotCrop ||
    s.plotWatered ||
    !validWaterTrail(s.plotCrop, s.plotPlanted, value)
  )
    return false;
  return waterCrop(s, now);
}
/** Crops never wilt: a ready crop waits until it is picked. Returns the crop, or null. */
export function harvestCrop(s: Save, now: number) {
  const crop = planted(s);
  if (!crop || now < cropReadyAt(s)) return null;
  s.plotCrop = "";
  s.plotPlanted = 0;
  s.plotWatered = false;
  s.harvests++;
  s.xp += crop.xp;
  return crop;
}
export const missions = [
  {
    id: "explore",
    name: "Make yourself at home",
    detail: "Visit 4 neighbourhood spots",
    total: 4,
    xp: 40,
  },
  {
    id: "cat",
    name: "Meet the local celebrity",
    detail: "Say hello to Kopi the cat",
    total: 1,
    xp: 25,
  },
  {
    id: "round",
    name: "A little friendly competition",
    detail: "Finish an arcade round",
    total: 1,
    xp: 35,
  },
  {
    id: "eastside",
    name: "A breath of fresh air",
    detail: "Try 2 East Side activities",
    total: 2,
    xp: 30,
  },
];
export function missionProgress(s: Save, id: string) {
  return id === "explore"
    ? Math.min(4, s.visited.length)
    : id === "cat"
      ? Number(s.cat)
      : id === "eastside"
        ? Math.min(
            2,
            Number(s.fish.length > 0) +
              Number(s.hoopsBest > 0) +
              Number(s.harvests > 0 || !!s.plotCrop),
          )
        : Math.min(1, s.rounds);
}
