import type { Look } from "../src/character";
import type { RelayState } from "./relay.ts";

export type RelayDifficulty = "practice" | "standard" | "challenge";
export type RelayStatus =
  | "waiting"
  | "running"
  | "finished"
  | "timeout"
  | "cancelled";
export type RelayPlayer = {
  slot: number;
  name: string;
  look: Look;
  ready: boolean;
  online: boolean;
};
export type RelaySnapshot = {
  room: string;
  /** Private invitation code returned only by room creation. */
  code?: string;
  slot: number;
  host: number;
  controlEpoch: string;
  solo: boolean;
  difficulty: RelayDifficulty;
  status: RelayStatus;
  players: RelayPlayer[];
  simulation: RelayState | null;
  serverAt: number;
  expiresAt: number;
};
export type RelayTick = {
  room: string;
  controlEpoch: string;
  seq: number;
  /** Increment only on a context-action edge; repeats do not trigger actions. */
  actionSeq: number;
  input: { x: number; z: number };
};
