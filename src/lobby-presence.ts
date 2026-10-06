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
    return "Player count unavailable";
  const ids = new Set(
    players.filter((p) => p.status !== "offline").map((p) => p.id),
  );
  if (me && (status === "connected" || ids.size)) ids.add(me);
  if (!ids.size) return `Joining world · ${neighbours} neighbours`;
  return `${ids.size} players · ${neighbours} neighbours`;
}
