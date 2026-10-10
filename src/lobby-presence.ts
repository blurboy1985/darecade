import type { SharedPlayer } from "./social";

/** Count only the server's current, privacy-filtered live room snapshot. */
export function worldPresenceCopy(
  players: readonly Pick<SharedPlayer, "id" | "status">[],
  me: string | undefined,
  status: "joining" | "connected" | "reconnecting" | "offline",
  networkOnline = true,
) {
  if (!networkOnline || status === "offline")
    return "Offline · player count unavailable";
  if (status === "reconnecting") return "Reconnecting…";
  const ids = new Set(
    players
      .filter((p) => p.status === "online" || p.status === "resting")
      .map((p) => p.id),
  );
  if (me && (status === "connected" || ids.size)) ids.add(me);
  if (!ids.size) return "Joining world…";
  return `${ids.size} player${ids.size === 1 ? "" : "s"}`;
}
