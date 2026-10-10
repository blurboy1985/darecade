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
