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
  gameIds,
  type ActivityId,
  type GameId,
} from "./catalog.ts";
export type { GameId } from "./catalog.ts";
export type Save = {
  version: 1;
  outfit: number;
  skin: number;
  gender: number;
  clothing: number;
  hair: number;
  pet: number;
  accessory: number;
  hat: number;
  unlockedHats: number[];
  xp: number;
  coins: string[];
  week: string;
  giftDay: string;
  gift: number;
  visited: string[];
  cat: boolean;
  rounds: number;
  best: Record<GameId, number>;
  sound: boolean;
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
    gender: 0,
    clothing: 0,
    hair: 0,
    pet: 0,
    accessory: 0,
    hat: 0,
    unlockedHats: [0],
    xp: 0,
    coins: [],
    week: singaporeWeek(),
    giftDay: "",
    gift: 0,
    visited: [],
    cat: false,
    rounds: 0,
    best: { noodle: 0, brick: 0, hop: 0, swarm: 0 },
    cameraMode: "isometric",
    awayActivity: "jog",
    awaySince: 0,
    away: false,
    sound: false,
    reduced:
      typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    twoD: false,
    light: "dusk",
    claims: [],
    welcome: "new",
    welcomeDismissed: false,
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
  if (r.cameraMode === "third") s.cameraMode = "third";
  if (r.awayActivity && Object.hasOwn(activities, r.awayActivity))
    s.awayActivity = r.awayActivity;
  if (typeof r.away === "boolean") s.away = r.away;
  if (Number.isFinite(r.awaySince) && r.awaySince! >= 0)
    s.awaySince = Math.min(Date.now(), r.awaySince!);
  for (const key of [
    "outfit",
    "skin",
    "hat",
    "gift",
    "gender",
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
          hat: 4,
          gift: 3,
          ...appearanceLimits,
        }[key]
    )
      s[key] = r[key]!;
  for (const key of ["xp", "rounds"] as const)
    if (Number.isFinite(r[key]) && r[key]! >= 0)
      s[key] = Math.floor(Math.min(r[key]!, 1e8));
  for (const key of ["sound", "reduced", "cat", "twoD"] as const)
    if (typeof r[key] === "boolean") s[key] = r[key]!;
  for (const key of ["visited", "claims"] as const)
    if (Array.isArray(r[key]))
      s[key] = r[key]!.filter((v): v is string => typeof v === "string").slice(
        0,
        50,
      );
  if (["auto", "day", "dusk", "night"].includes(r.light!)) s.light = r.light!;
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
  for (const key of gameIds)
    if (Number.isFinite(r.best?.[key]) && r.best![key] >= 0)
      s.best[key] = Math.min(1e7, Math.floor(r.best![key]));
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
];
export function missionProgress(s: Save, id: string) {
  return id === "explore"
    ? Math.min(4, s.visited.length)
    : id === "cat"
      ? Number(s.cat)
      : Math.min(1, s.rounds);
}
