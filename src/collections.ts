// Stable indices are shared by save validation, the wardrobe and all renderers.
export const setStarts = { clothing: 24, hair: 28, pet: 26, accessory: 27 };
export type LookSlot = keyof typeof setStarts;
export const legendarySets = [
  {
    id: "solar",
    name: "Solar Sentinel",
    theme: "Sun-powered superhero",
    color: "#ffb932",
    accent: "#ff584d",
    cost: 12,
    medals: 3,
    rounds: 30,
    outfit: "Solar armour & comet cape",
    head: "Sunburst visor",
    pet: "Helio the lion cub",
    magic: "Solar flare wings",
  },
  {
    id: "moon",
    name: "Moon Prism",
    theme: "Celestial magical guardian",
    color: "#db9fff",
    accent: "#80eaff",
    cost: 15,
    medals: 4,
    rounds: 40,
    outfit: "Prism guardian robe",
    head: "Crescent crystal tiara",
    pet: "Miso the moon rabbit",
    magic: "Prism moon ribbons",
  },
  {
    id: "storm",
    name: "Storm Ronin",
    theme: "Lightning anime swordsman",
    color: "#698aff",
    accent: "#b7f9ff",
    cost: 18,
    medals: 5,
    rounds: 50,
    outfit: "Storm ronin cloak",
    head: "Thunder horn crown",
    pet: "Raiju the thunder wolf",
    magic: "Thunderblade orbit",
  },
  {
    id: "sakura",
    name: "Sakura Kitsune",
    theme: "Nine-tailed spirit guardian",
    color: "#ff8eb8",
    accent: "#ffe7b0",
    cost: 20,
    medals: 6,
    rounds: 60,
    outfit: "Sakura spirit robes",
    head: "Spirit fox headdress",
    pet: "Yuzu the nine-tail fox",
    magic: "Nine-tail blossom aura",
  },
  {
    id: "nova",
    name: "Nova Mecha",
    theme: "Cosmic robot pilot",
    color: "#49e5e2",
    accent: "#ff5c95",
    cost: 24,
    medals: 8,
    rounds: 75,
    outfit: "Nova exosuit",
    head: "Hologram flight helmet",
    pet: "Pixel the satellite bot",
    magic: "Orbital thrusters",
  },
  {
    id: "abyss",
    name: "Abyss Monarch",
    theme: "Shadow realm ruler",
    color: "#aa78ff",
    accent: "#68f9bf",
    cost: 28,
    medals: 10,
    rounds: 90,
    outfit: "Abyss sovereign armour",
    head: "Eclipse spire crown",
    pet: "Nyx the void dragon",
    magic: "Eclipse portal",
  },
  {
    id: "tide",
    name: "Tidal Empress",
    theme: "Ocean fantasy royalty",
    color: "#43cded",
    accent: "#ffb5d9",
    cost: 32,
    medals: 12,
    rounds: 110,
    outfit: "Pearl wave regalia",
    head: "Coral pearl crown",
    pet: "Nori the sky manta",
    magic: "Tidal pearl spiral",
  },
  {
    id: "phoenix",
    name: "Phoenix Ascendant",
    theme: "Flame-winged champion",
    color: "#ff753f",
    accent: "#ffe36a",
    cost: 36,
    medals: 15,
    rounds: 130,
    outfit: "Phoenix feather mantle",
    head: "Inferno feather crest",
    pet: "Cinder the phoenix hatchling",
    magic: "Phoenix supernova",
  },
  {
    id: "frost",
    name: "Frost Seraph",
    theme: "Ice-winged celestial knight",
    color: "#b8edff",
    accent: "#baa5ff",
    cost: 40,
    medals: 18,
    rounds: 150,
    outfit: "Glacial seraph armour",
    head: "Frozen star halo",
    pet: "Flurry the crystal stag",
    magic: "Seraph crystal wings",
  },
  {
    id: "galaxy",
    name: "Galaxy Idol",
    theme: "Starlight anime performer",
    color: "#ff82e4",
    accent: "#75ffd5",
    cost: 45,
    medals: 21,
    rounds: 180,
    outfit: "Galaxy stagecoat",
    head: "Shooting star headphones",
    pet: "Encore the star sprite",
    magic: "Starlight encore",
  },
];
export type WardrobeProgress = {
  xp: number;
  medalTokens?: number;
  rounds: number;
  wardrobeSpent: number;
  wardrobeUnlocked: string[];
  wardrobePurchased: string[];
};
export const ownsSet = (p: WardrobeProgress, id: string) =>
  p.wardrobeUnlocked.includes(id) || p.wardrobePurchased.includes(id);
export const styleTokens = (p: WardrobeProgress) =>
  Math.max(0, Math.floor(p.xp / 100) + (p.medalTokens ?? 0) - p.wardrobeSpent);
export const lookBundles = [
  { id: "discovery", name: "Street looks", cost: 1 },
  { id: "mastery", name: "Weekend looks", cost: 3 },
] as const;
export const tokenLooks = [...legendarySets, ...lookBundles];
export function setForItem(slot: LookSlot, index: number) {
  return legendarySets[index - setStarts[slot]];
}
export function collectionFor(slot: LookSlot, index: number) {
  if (index >= setStarts[slot]) return "legendary";
  if (index < 8) return "starter";
  return index < 16 ? "discovery" : "mastery";
}
export function canWear(
  slot: LookSlot,
  index: number,
  p: WardrobeProgress,
  medals: number,
) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= setStarts[slot] + legendarySets.length
  )
    return false;
  const set = setForItem(slot, index);
  if (set) return ownsSet(p, set.id);
  const group = collectionFor(slot, index);
  return group === "starter" || ownsSet(p, group);
}
export function canRedeem(
  set: (typeof legendarySets)[number],
  p: WardrobeProgress,
  medals: number,
) {
  return styleTokens(p) >= set.cost;
}
export function setLook(index: number) {
  return {
    clothing: setStarts.clothing + index,
    hair: setStarts.hair + index,
    pet: setStarts.pet + index,
    accessory: setStarts.accessory + index,
    hat: 0,
  };
}
