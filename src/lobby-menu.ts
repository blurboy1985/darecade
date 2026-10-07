type MenuAction = { label: string; target: string; icon: string };
export const menuPages = {
  "phone-menu": {
    title: "Menu",
    actions: [
      { label: "My look", target: "wardrobe", icon: "shirt" },
      { label: "Quests & rankings", target: "quests", icon: "trophy" },
      { label: "Sound & display", target: "preferences", icon: "sound" },
      { label: "Change world", target: "worlds", icon: "compass" },
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

const sgt = (time: number) =>
  new Date(time).toLocaleString("en-SG", {
    timeZone: "Asia/Singapore",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

/**
 * Why challenges are closed for this player, with the real opening time. Empty
 * once they are open. The 24-hour wait itself is set out in ACCOUNTS.md.
 */
export function dareHoldCopy(
  ready: boolean,
  account: { eligibleAt?: number } | null | undefined,
) {
  if (ready) return "";
  if (!account)
    return "Challenges need a saved account. Save with email; challenges open 24 hours later. Regular rounds are open now.";
  if (!account.eligibleAt)
    return "Challenges open 24 hours after your email was verified. Regular rounds are open now.";
  return `Your challenges open ${sgt(account.eligibleAt)} SGT, 24 hours after your email was verified. Regular rounds are open now.`;
}

/**
 * The first reason a Play challenge button cannot be used, or "" when it can. The
 * 24-hour wait is explained by dareHoldCopy instead.
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
