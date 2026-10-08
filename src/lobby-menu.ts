type MenuAction = { label: string; target: string; icon: string };
export const menuPages = {
  "phone-menu": {
    title: "Menu",
    actions: [
      { label: "Quests & rankings", target: "quests", icon: "trophy" },
      { label: "Sound & display", target: "preferences", icon: "sound" },
      { label: "Neighbourhood", target: "map", icon: "compass" },
    ] satisfies MenuAction[],
  },
} as const;

export function isMenuPage(id: string): id is keyof typeof menuPages {
  return Object.hasOwn(menuPages, id);
}

export const firstVisitCopy = {
  kicker: "YOUR FIRST RACE",
  title: "Your first Palm Bay finish",
  detail: "Finish a round at Palm Bay for +35 bonus XP.",
  explore: "The town is open to explore.",
} as const;

/** Email is optional for challenges. The server checks session eligibility. */
export function dareHoldCopy(
  ready: boolean,
  _account: { eligibleAt?: number } | null | undefined,
) {
  return ready ? "" : "Connect to play challenges. No email needed.";
}

/**
 * The first reason a Play challenge button cannot be used, or "" when it can. The
 * connection status is explained by dareHoldCopy instead.
 */
export function dareBlock(o: {
  connected: boolean;
  left: number;
  own?: boolean;
  online?: boolean;
  challenged?: boolean;
  noScore?: boolean;
}) {
  if (!o.connected) return "Challenges need a connection.";
  if (o.own) return "This is your own challenge.";
  if (o.online)
    return "They are online now. Challenges are for resting or offline neighbours.";
  if (o.challenged) return "You already challenged this neighbour today.";
  if (o.left <= 0) return "No challenges left today. Resets midnight SGT.";
  if (o.noScore) return "This neighbour has no saved score to beat yet.";
  return "";
}

/**
 * The line under a result's rank. The board keeps each player's best score of
 * the day, so a lower replay is told which score is the one that counts.
 */
export function standingNote(
  ranked: boolean,
  standing: { rank: number; score: number } | undefined,
  score: number,
  best: string,
) {
  if (!ranked) return "";
  if (!standing)
    return score > 0
      ? "Not on today’s board yet"
      : "Score above 0 to join the board";
  const medals =
    standing.rank <= 3 ? ` · +${4 - standing.rank} medals at midnight` : "";
  return standing.score === score
    ? `This round is your best today${medals}`
    : `Your best today, ${best}, holds this rank${medals}`;
}

export function pageChoices<T>(items: readonly T[], requested: number) {
  const total = Math.max(1, Math.ceil(items.length / 3));
  const page = Math.min(
    total - 1,
    Math.max(0, Number.isFinite(requested) ? Math.floor(requested) : 0),
  );
  return { page, total, items: items.slice(page * 3, page * 3 + 3) };
}
