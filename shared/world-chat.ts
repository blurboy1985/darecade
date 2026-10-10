/** The longest message a player can say in a world. */
export const WORLD_CHAT_MAX = 120;
/** A player can say one message this often. */
export const WORLD_CHAT_GAP_MS = 1500;
/**
 * A world keeps a message this long, so a player who polls every two seconds
 * still hears it. Nothing is stored after that.
 */
export const WORLD_CHAT_KEEP_MS = 10000;

/** What a player typed as one tidy line, or "" when there is nothing to say. */
export function worldChatText(value: unknown) {
  if (typeof value !== "string") return "";
  const line = value
    .normalize("NFKC")
    .replace(/[\p{Cc}\s]+/gu, " ")
    .trim();
  return [...line].slice(0, WORLD_CHAT_MAX).join("").trim();
}

/**
 * The world times the gap from when messages arrive, and the network can
 * bring two closer together than they left, so they leave this much further
 * apart.
 */
const SEND_MARGIN_MS = 300;
/** How many messages can wait to go out. */
const WAITING_MAX = 3;

/** A player's messages on their way out, released one per gap. */
export class WorldChatOutbox {
  private waiting: string[] = [];
  private sentAt = -Infinity;
  /** Takes a message, unless too many are already waiting. */
  add(text: string) {
    if (!text || this.waiting.length >= WAITING_MAX) return false;
    this.waiting.push(text);
    return true;
  }
  /** The message to send now, or "" when there is none or it is too soon. */
  next(now: number) {
    if (
      !this.waiting.length ||
      now - this.sentAt < WORLD_CHAT_GAP_MS + SEND_MARGIN_MS
    )
      return "";
    this.sentAt = now;
    return this.waiting.shift()!;
  }
  /** A message that did not get through goes first with the next update. */
  putBack(text: string) {
    this.waiting.unshift(text);
    this.sentAt = -Infinity;
  }
}
