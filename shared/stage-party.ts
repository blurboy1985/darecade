/** Stage Party: up to four dancers play the same Open Stage song together. */
import type { Look } from "../src/character";

export const PARTY_CAP = 4;
/** From the host pressing Start to the first tick of the song. */
export const PARTY_COUNTDOWN_MS = 4000;
export const PARTY_SHOW_MS = 40000;
/** Polling: quicker while the show is on, and never faster than the floor. */
export const PARTY_POLL_MS = 800;
export const PARTY_LOBBY_POLL_MS = 1500;
export const PARTY_TICK_MIN_MS = 150;
export const PARTY_CODE_LETTERS = "BCDFGHJKLMNPQRSTVWXZ";
export const PARTY_CHEERS = ["🔥", "👏", "💃", "😂"] as const;
export const PARTY_MODES = ["show", "encore"] as const;
export type PartyMode = (typeof PARTY_MODES)[number];
export type PartyStatus = "waiting" | "running" | "results";

export type PartyPlayer = {
  slot: number;
  name: string;
  look: Look;
  online: boolean;
  /** Dancing in the current round, not waiting for the next one. */
  playing: boolean;
  style: number;
  score: number;
  combo: number;
  hype: number;
  fever: boolean;
  /** Notes landed this round, and the lane of the latest one. */
  hits: number;
  lane: number;
  done: boolean;
  booed: boolean;
  stars: number;
  /** Counts up with each cheer; cheerKind indexes PARTY_CHEERS. */
  cheer: number;
  cheerKind: number;
};
export type PartySnapshot = {
  code: string;
  you: number;
  host: number;
  status: PartyStatus;
  mode: PartyMode;
  round: number;
  seed: number;
  /** Server time of the song's first tick, and of this reply. */
  startAt: number;
  serverAt: number;
  players: PartyPlayer[];
};
/** What a dancer reports while polling. Every field is optional. */
export type PartyTick = Partial<{
  round: number;
  style: number;
  score: number;
  combo: number;
  hype: number;
  fever: boolean;
  hits: number;
  lane: number;
  done: boolean;
  booed: boolean;
  stars: number;
  cheer: number;
}>;

/** Highest score first; a dancer booed off ranks below one who finished. */
export function partyRanking<
  T extends Pick<PartyPlayer, "slot" | "score" | "booed" | "playing">,
>(players: readonly T[]): T[] {
  return players
    .filter((p) => p.playing)
    .sort(
      (a, b) =>
        Number(a.booed) - Number(b.booed) ||
        b.score - a.score ||
        a.slot - b.slot,
    );
}
/** Server clock minus this browser's, from one request's send and receive times. */
export function clockOffset(sent: number, received: number, serverAt: number) {
  return serverAt - (sent + received) / 2;
}
export function partyCode(value: string) {
  const code = value.trim().toUpperCase();
  return new RegExp(`^[${PARTY_CODE_LETTERS}]{4}$`).test(code) ? code : null;
}
