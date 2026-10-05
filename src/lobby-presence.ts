import type { SharedPlayer } from "./social";

/** Count only the server's current, privacy-filtered live room snapshot. */
export function worldPresenceCopy(
  players: readonly Pick<SharedPlayer, "id" | "status">[],
  me: string | undefined,
  status: "joining" | "connected" | "reconnecting" | "offline",
  networkOnline = true,
) {
  if (!networkOnline || status === "offline" || status === "reconnecting")
    return "Player count unavailable";
  const ids = new Set(
    players.filter((p) => p.status !== "offline").map((p) => p.id),
  );
  if (status !== "connected" || !me || !ids.has(me)) return "Finding players…";
  return ids.size === 1
    ? "Just you here"
    : `${ids.size} players here · including you`;
}
