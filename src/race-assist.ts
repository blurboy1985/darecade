/**
 * Touch and new-driver help for Coast Rush. Everything here shapes the inputs
 * the player sends; physics, replays and rules are untouched, so the server
 * validates an assisted race exactly like any other.
 */

/** Sixty ticks a second: five seconds parked stops the clock. */
export const IDLE_PAUSE_TICKS = 300;
const ASSIST_EDGE = 4.2;
const ASSIST_RELEASE = 2.5;

/**
 * Steers back from the road edge for a driver who has never finished and is
 * not steering. Returns -1, 0 or 1. The driver's own steering always wins.
 */
export function edgeAssist(offset: number, steer: number, previous: number) {
  if (steer) return 0;
  if (Math.abs(offset) > ASSIST_EDGE) return -Math.sign(offset);
  if (Math.abs(offset) < ASSIST_RELEASE) return 0;
  return previous;
}

/**
 * GO latches on a touch, so a tap drives; BRAKE lets go. Steering, DRIFT and
 * ITEM leave the latch as it is.
 */
export function latchThrottle(cruise: boolean, control: string) {
  return control === "gas" ? true : control === "brake" ? false : cruise;
}

/** Counts ticks spent parked with no throttle, to pause instead of timing out. */
export function idleTicks(previous: number, throttle: number, speed: number) {
  return throttle <= 0 && speed < 1 ? previous + 1 : 0;
}
