/**
 * Everything a player can say in a race room. A player picks a line and only
 * its number travels, so a room never carries words a player wrote. Typed
 * chat is only in the shared world; see `world-chat.ts`.
 */
export const CHAT_LINES = [
  "Hello!",
  "Good luck!",
  "Ready when you are",
  "Nice drift!",
  "Ouch!",
  "So close!",
  "Good race!",
  "One more?",
] as const;
/** A player can say one line this often. */
export const CHAT_GAP_MS = 1500;

/** The number of a line that exists, or -1. */
export function chatLine(value: unknown) {
  return Number.isInteger(value) && CHAT_LINES[value as number] !== undefined
    ? (value as number)
    : -1;
}
