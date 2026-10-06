import type { GameId, ActivityId } from "./catalog";
import type { Profile } from "./account";
import type { SeasonStanding } from "./season";
export type SharedPlayer = {
  id: string;
  name: string;
  look: {
    outfit: number;
    skin: number;
    eye?: number;
    hat: number;
    body?: number;
    clothing?: number;
    hair?: number;
    pet?: number;
    accessory?: number;
  };
  activity: ActivityId;
  since: number;
  x: number;
  z: number;
  yaw: number;
  emote?: string;
  status: "online" | "resting" | "offline";
  best: Record<GameId, number>;
  challengeScores?: Partial<Record<GameId, { score: number; runId: string }>>;
  points: number;
  incoming: number;
  outgoing: number;
  wins: number;
};
export type SharedState = {
  season?: SeasonStanding | null;
  seasonHistory?: SeasonStanding[];
  profile: Profile;
  competitionReady: boolean;
  week: string;
  weekly: { id: string; name: string; points: number; rank: number }[];
  lastWeek: { id: string; name: string; points: number; rank: number }[];
  dares: {
    id: string;
    host: string;
    name: string;
    game: GameId;
    score: number;
    expires: number;
  }[];
  recentRuns: { id: string; game: GameId; score: number; finished: number }[];
  me: string;
  self: SharedPlayer;
  day: string;
  nextReset: number;
  players: SharedPlayer[];
  friends: SharedPlayer[];
  challenged: string[];
  boards: Record<
    GameId,
    { id: string; name: string; score: number; rank: number; runId: string }[]
  >;
  history: {
    id: string;
    game: GameId;
    score: number | null;
    targetScore: number;
    status: string;
    player: string;
    target: string;
    challenger: string;
    defender: string;
  }[];
};
export type Run = {
  seed: number;
  version: number;
  ranked: boolean;
  dailySeed: boolean;
  id: string;
  game: GameId;
  target: string | null;
  targetScore: number;
};
export async function api<T>(path: string, data?: unknown): Promise<T> {
  const response = await fetch(`/api/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: data === undefined ? {} : { "Content-Type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal: AbortSignal.timeout(8000),
  });
  const result = await response.json();
  if (response.status === 401 && path !== "auth/me")
    window.dispatchEvent(new Event("session-expired"));
  if (!response.ok)
    throw Error(result.error || "The neighbourhood server is unavailable.");
  return result;
}
