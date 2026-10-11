import { pageChoices } from "./lobby-menu.ts";

// Three playable choices at a time; no checklist, timer or required order.
export const discoveries = [
  { id: "coast", kind: "game", name: "Coast Rush", hook: "Race seven rivals", icon: "🏎" },
  { id: "stage", kind: "open", name: "Open Stage", hook: "Dance to the beat", icon: "♫" },
  { id: "hoops", kind: "game", name: "Hoops Court", hook: "Sink ten shots", icon: "🏀" },
  { id: "fishing", kind: "game", name: "Fishing Jetty", hook: "Hook your next catch", icon: "🎣" },
  { id: "pet", kind: "environment", name: "Meet Kopi", hook: "Pet the neighbourhood cat", icon: "🐈" },
  { id: "plots", kind: "open", name: "Community Plots", hook: "Grow something green", icon: "🌱" },
  { id: "hop", kind: "game", name: "Hop Hop", hook: "Jump the rooftops", icon: "↑" },
  { id: "brick", kind: "game", name: "Brick Bash", hook: "Smash the wall", icon: "▦" },
  { id: "swarm", kind: "game", name: "Star Swarm", hook: "Blast the swarm", icon: "✦" },
  { id: "noodle", kind: "game", name: "Noodle Run", hook: "Gobble the dumplings", icon: "🍜" },
  { id: "dragon", kind: "environment", name: "Dragon Rooftop", hook: "Climb up and slide", icon: "🐉" },
  { id: "swing", kind: "environment", name: "Swings", hook: "Take a little flight", icon: "✧" },
  { id: "bench0", kind: "environment", name: "Take a seat", hook: "A quiet book break", icon: "📖" },
] as const;

export function discoveryPage(page: number) {
  return pageChoices(discoveries, page);
}

export function discoveryCards(page: number) {
  return `<div class="outside-cards discovery-cards">${discoveryPage(page).items.map((item) => `<button class="menu-choice" data-${item.kind}="${item.id}"><span class="discovery-icon" aria-hidden="true">${item.icon}</span><span><strong>${item.name}</strong><small>${item.hook}</small></span></button>`).join("")}</div>`;
}

export function nextDiscovery(game: string) {
  const next: Record<string, string> = {
    coast: "stage", noodle: "hoops", brick: "swarm", hop: "fishing",
    swarm: "pet", hoops: "coast", fishing: "hop",
  };
  const item = discoveries.find((item) => item.id === next[game]) || discoveries[1];
  return `<button class="secondary" data-${item.kind}="${item.id}">Try ${item.name} →</button>`;
}
