type MenuAction = { label: string; target: string; icon: string };
type ThreeActions = readonly [MenuAction, MenuAction, MenuAction];
type MenuPage = { title: string; back: string | null; actions: ThreeActions };

// Keep each navigation decision to three routes, including on desktop.
export const menuPages = {
  "phone-menu": {
    title: "Menu",
    back: null,
    actions: [
      { label: "My stuff", target: "my-stuff", icon: "shirt" },
      { label: "Friends", target: "friends-menu", icon: "smile" },
      { label: "Settings", target: "settings", icon: "settings" },
    ],
  },
  settings: {
    title: "Settings",
    back: "phone-menu",
    actions: [
      { label: "Preferences", target: "preferences", icon: "sound" },
      { label: "Camera & controls", target: "controls", icon: "camera" },
      { label: "Account & safety", target: "safety-menu", icon: "settings" },
    ],
  },
  "safety-menu": {
    title: "Account & safety",
    back: "settings",
    actions: [
      { label: "Account & privacy", target: "account", icon: "settings" },
      { label: "Report a player", target: "neighbours", icon: "smile" },
      { label: "Step away", target: "away", icon: "leaf" },
    ],
  },
  "my-stuff": {
    title: "My stuff",
    back: "phone-menu",
    actions: [
      { label: "My look", target: "wardrobe", icon: "shirt" },
      { label: "Rewards", target: "rewards-menu", icon: "gift" },
      { label: "Support & purchases", target: "support", icon: "gift" },
    ],
  },
  "friends-menu": {
    title: "Friends",
    back: "phone-menu",
    actions: [
      { label: "Neighbours", target: "neighbours", icon: "smile" },
      { label: "Dares & rankings", target: "competition-menu", icon: "trophy" },
      { label: "Worlds", target: "worlds", icon: "compass" },
    ],
  },
  "competition-menu": {
    title: "Play together",
    back: "friends-menu",
    actions: [
      { label: "Dares", target: "dares", icon: "game" },
      { label: "Rankings", target: "board", icon: "trophy" },
      { label: "Emotes", target: "emotes", icon: "smile" },
    ],
  },
  "rewards-menu": {
    title: "Rewards",
    back: "my-stuff",
    actions: [
      { label: "Daily gift", target: "shop", icon: "gift" },
      { label: "Quests", target: "quests", icon: "compass" },
      { label: "Stickers", target: "album", icon: "book" },
    ],
  },
} satisfies Record<string, MenuPage>;

export function isMenuPage(id: string): id is keyof typeof menuPages {
  return Object.hasOwn(menuPages, id);
}

export const firstVisitCopy = {
  kicker: "YOUR FIRST RACE",
  title: "Ready to race?",
  detail: "Race Palm Bay. Finish a round to unlock your lilac cap.",
} as const;

export function pageChoices<T>(items: readonly T[], requested: number) {
  const total = Math.max(1, Math.ceil(items.length / 3));
  const page = Math.min(
    total - 1,
    Math.max(0, Number.isFinite(requested) ? Math.floor(requested) : 0),
  );
  return { page, total, items: items.slice(page * 3, page * 3 + 3) };
}
