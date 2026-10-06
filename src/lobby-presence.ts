import type { SharedPlayer } from "./social";

/** Count only the server's current, privacy-filtered live room snapshot. */
export function worldPresenceCopy(
  players: readonly Pick<SharedPlayer, "id" | "status">[],
  me: string | undefined,
  status: "joining" | "connected" | "reconnecting" | "offline",
  networkOnline = true,
  neighbours = 5,
) {
  if (!networkOnline || status === "offline" || status === "reconnecting")
    return `${neighbours} neighbours · player count unavailable`;
  const ids = new Set(
    players
      .filter((p) => p.status === "online" || p.status === "resting")
      .map((p) => p.id),
  );
  if (status !== "connected" || !me || !ids.has(me)) return "Finding players…";
  return ids.size === 1
    ? `1 player · ${neighbours} neighbours`
    : `${ids.size} players · ${neighbours} neighbours`;
}
