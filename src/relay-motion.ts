import { RELAY_TICK_RATE } from "../shared/relay.ts";

/** One expected 4 Hz poll interval, never an unbounded client simulation. */
export const RELAY_PRESENTATION_MAX_AGE = 0.25;

/** Advance only deterministic visual phases. Positions, ownership, outcomes and
 * catch validation remain authoritative. Stalled packets freeze after 15 ticks;
 * finished/paused rooms freeze immediately. This does not compensate network RTT.
 */
export function presentationTick(
  snapshotTick: number,
  ageSeconds: number,
  status: string,
): number {
  if (status !== "running") return snapshotTick;
  const age = Number.isFinite(ageSeconds)
    ? Math.min(RELAY_PRESENTATION_MAX_AGE, Math.max(0, ageSeconds))
    : 0;
  return snapshotTick + age * RELAY_TICK_RATE;
}
