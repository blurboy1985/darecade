import {
  additionalThemes,
  originalFamilies,
  legacyDesigns,
  type Design,
} from "./style-catalog.ts";
import { HAIR_START, HAIR_COUNT } from "./hair-catalog.ts";
// Stable indices are shared by save validation, the wardrobe and all renderers.
// Each slot is laid out as: original items, the first ten sets, later single
// items ("extras"), then every later set. Append sets freely; never reorder.
export const setStarts = { clothing: 24, hair: 28, pet: 26, accessory: 27 };
export type LookSlot = keyof typeof setStarts;
const firstSets = 10;
export const extraCounts = { clothing: 0, hair: 9, pet: 6, accessory: 6 };
export type StyleSet = {
  id: string;
  name: string;
  theme: string;
  color: string;
  accent: string;
  tier: "Free" | "Legendary" | "Premium";
  design: Design;
  cost: number;
  medals: number;
  rounds: number;
  outfit: string;
  head: string;
  pet: string;
  magic: string;
};
const originalSets = [
  {
    id: "solar",
    name: "Solar Sentinel",
    theme: "Sun-powered superhero",
    color: "#ffb932",
    accent: "#ff584d",
    tier: "Legendary",
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
    tier: "Legendary",
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
    tier: "Legendary",
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
    tier: "Legendary",
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
    tier: "Legendary",
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
    tier: "Legendary",
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
    tier: "Legendary",
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
    tier: "Legendary",
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
    tier: "Legendary",
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
    tier: "Legendary",
    cost: 45,
    medals: 21,
    rounds: 180,
    outfit: "Galaxy stagecoat",
    head: "Shooting star headphones",
    pet: "Encore the star sprite",
    magic: "Starlight encore",
  },
  {
    id: "candy",
    name: "Candy Pop",
    theme: "Sweet-shop pop star",
    color: "#ff9ecb",
    accent: "#8ff0e0",
    tier: "Legendary",
    cost: 22,
    medals: 8,
    rounds: 70,
    outfit: "Candy pop streetwear",
    head: "Lollipop swirl clips",
    pet: "Sprinkle the cupcake cat",
    magic: "Sugar rush swirl",
  },
  {
    id: "boba",
    name: "Boba Dream",
    theme: "Bubble tea barista",
    color: "#c98a5a",
    accent: "#ffe9c9",
    tier: "Legendary",
    cost: 26,
    medals: 10,
    rounds: 85,
    outfit: "Milk tea barista apron",
    head: "Boba straw beret",
    pet: "Pearl the tapioca slime",
    magic: "Bubble tea whirl",
  },
  {
    id: "pixel",
    name: "Pixel Champion",
    theme: "Arcade Row high scorer",
    color: "#6ee06e",
    accent: "#ffd84a",
    tier: "Legendary",
    cost: 30,
    medals: 12,
    rounds: 100,
    outfit: "High score jacket",
    head: "8-bit crown",
    pet: "Bit the pixel pup",
    magic: "Coin shower",
  },
  {
    id: "witch",
    name: "Dream Witch",
    theme: "Midnight spell caster",
    color: "#7a6cf0",
    accent: "#ffd9f5",
    tier: "Legendary",
    cost: 34,
    medals: 14,
    rounds: 120,
    outfit: "Dream witch cloak",
    head: "Crescent witch hat",
    pet: "Hex the little bat",
    magic: "Moonlit spell circle",
  },
  {
    id: "garden",
    name: "Garden Sprite",
    theme: "Flower meadow fairy",
    color: "#7fd48a",
    accent: "#ffb3d1",
    tier: "Legendary",
    cost: 38,
    medals: 16,
    rounds: 140,
    outfit: "Petal sprite tunic",
    head: "Tulip bud hood",
    pet: "Clover the bumblebee",
    magic: "Petal whirl",
  },
  {
    id: "dino",
    name: "Dino Explorer",
    theme: "Prehistoric adventurer",
    color: "#5fc8a0",
    accent: "#ffd166",
    tier: "Legendary",
    cost: 42,
    medals: 18,
    rounds: 160,
    outfit: "Dino explorer onesie",
    head: "Dino hood",
    pet: "Rex the tiny dino",
    magic: "Fossil fireworks",
  },
];
export const legendarySetCost = 8;
export const pieceCosts = {
  clothing: 5,
  hair: 4,
  pet: 4,
  accessory: 4,
} as const;
export const pieceId = (slot: LookSlot, setId: string) =>
  `piece:${setId}:${slot}`;
// An outfit is the whole set: clothes, headwear, pet and magic. Each of the
// four can also be owned on its own as a piece. `outfit:<set>` was granted
// for a few hours on 11 October 2026 and counts as the whole set.
export const outfitId = (setId: string) => `outfit:${setId}`;
const allSets: StyleSet[] = [
  ...originalSets.map(
    (set, i): StyleSet => ({
      ...set,
      tier: "Legendary",
      design: legacyDesigns[i],
    }),
  ),
  ...additionalThemes,
  ...originalFamilies,
];
export const legendarySets = allSets.map((set) => ({
  ...set,
  cost: set.tier === "Legendary" ? legendarySetCost : set.cost,
}));
export const historicalSetCount = 16;
export const setPriceSGD = 499;
export const piecePriceSGD = 199;
export type OutfitBody = 0 | 1;
export const outfitBodyName = (body: number) => (body === 1 ? "Boy" : "Girl");
export function outfitLook(index: number, body: number) {
  const set = legendarySets[index];
  const shape =
    set.design.hairShapes?.[body === 1 ? 1 : 0] ??
    (body === 1
      ? set.design.motif % 2
        ? 3
        : 0
      : [1, 4, 5, 6, 7][set.design.motif % 5]);
  return {
    clothing: setItemIndex("clothing", index),
    hair: setItemIndex("hair", index),
    baseHair: HAIR_START + set.design.hairColour * 8 + shape,
  };
}
export type WardrobeProgress = {
  favouriteSet?: string;
  xp: number;
  medalTokens?: number;
  rounds: number;
  wardrobeSpent: number;
  wardrobeUnlocked: string[];
  wardrobePurchased: string[];
};
const holds = (p: WardrobeProgress, id: string) =>
  p.wardrobeUnlocked.includes(id) || p.wardrobePurchased.includes(id);
export const ownsSet = (p: WardrobeProgress, id: string) =>
  holds(p, id) || holds(p, outfitId(id));
export const styleTokens = (p: WardrobeProgress) =>
  Math.max(0, Math.floor(p.xp / 100) + (p.medalTokens ?? 0) - p.wardrobeSpent);
export const lookBundles = [
  { id: "discovery", name: "Street looks", cost: 1 },
  { id: "mastery", name: "Weekend looks", cost: 3 },
] as const;
export const outfitLooks = legendarySets.flatMap((set) =>
  set.tier === "Free"
    ? []
    : [
        {
          id: outfitId(set.id),
          setId: set.id,
          tier: set.tier,
          name: `${set.name} outfit`,
          cost: set.cost,
        },
      ],
);
// Every paid set's four pieces. Legendary pieces take tokens or money;
// Premium pieces take money only.
export const legendaryPieces = legendarySets.flatMap((set) =>
  set.tier === "Free"
    ? []
    : (["clothing", "hair", "pet", "accessory"] satisfies LookSlot[]).map(
        (slot) => ({
          id: pieceId(slot, set.id),
          setId: set.id,
          slot,
          tier: set.tier,
          name:
            slot === "clothing"
              ? set.outfit
              : slot === "hair"
                ? set.head
                : slot === "pet"
                  ? set.pet
                  : set.magic,
          cost: pieceCosts[slot],
        }),
      ),
);
export const tokenLooks = [
  ...legendarySets,
  ...lookBundles,
  ...outfitLooks,
  ...legendaryPieces,
];
/** Credit already-earned pieces toward the outfit, so upgrading never pays twice. */
export function redemptionCost(
  item: (typeof tokenLooks)[number],
  p: WardrobeProgress,
) {
  if (!("tier" in item) || item.tier !== "Legendary" || "slot" in item)
    return item.cost;
  const setId = "setId" in item ? item.setId : item.id;
  const credit = legendaryPieces
    .filter(
      (piece) => piece.setId === setId && p.wardrobeUnlocked.includes(piece.id),
    )
    .reduce((sum, piece) => sum + piece.cost, 0);
  return Math.max(0, item.cost - credit);
}
/** True when exchanging tokens for this item would add nothing. */
export function alreadyOwns(
  item: (typeof tokenLooks)[number],
  p: WardrobeProgress,
) {
  return ownsSet(p, item.id) || ("setId" in item && ownsSet(p, item.setId));
}
export const slotSize = (slot: LookSlot) =>
  setStarts[slot] +
  legendarySets.length +
  extraCounts[slot] +
  (slot === "hair" ? HAIR_COUNT : 0);
/** Position of an item among the sets, or -1 for a single item. */
export function setIndexFor(slot: LookSlot, index: number) {
  if (slot === "hair" && index >= HAIR_START && index < HAIR_START + HAIR_COUNT)
    return -1;
  const i =
    index -
    setStarts[slot] -
    (slot === "hair" && index >= HAIR_START + HAIR_COUNT ? HAIR_COUNT : 0);
  if (i < 0 || index >= slotSize(slot)) return -1;
  if (i < firstSets) return i;
  return i < firstSets + extraCounts[slot] ? -1 : i - extraCounts[slot];
}
/** Position of an item among the later single items, or -1. */
export function extraIndexFor(slot: LookSlot, index: number) {
  const i = index - setStarts[slot] - firstSets;
  return i >= 0 && i < extraCounts[slot] ? i : -1;
}
export const setItemIndex = (slot: LookSlot, set: number) =>
  setStarts[slot] +
  set +
  (set < firstSets ? 0 : extraCounts[slot]) +
  (slot === "hair" && set >= historicalSetCount ? HAIR_COUNT : 0);
export const extraItemIndex = (slot: LookSlot, extra: number) =>
  setStarts[slot] + firstSets + extra;
export function setForItem(slot: LookSlot, index: number) {
  return legendarySets[setIndexFor(slot, index)];
}
export function collectionFor(slot: LookSlot, index: number) {
  if (slot === "hair" && index >= HAIR_START && index < HAIR_START + HAIR_COUNT)
    return "starter";
  const extra = extraIndexFor(slot, index);
  // Later single items: a third each are free, Street and Weekend.
  const tier =
    extra < 0 ? index : Math.floor((extra * 3) / extraCounts[slot]) * 8;
  if (extra < 0 && index >= setStarts[slot]) return "legendary";
  if (tier < 8) return "starter";
  return tier < 16 ? "discovery" : "mastery";
}
export function canWear(
  slot: LookSlot,
  index: number,
  p: WardrobeProgress,
  medals: number,
) {
  if (!Number.isInteger(index) || index < 0 || index >= slotSize(slot))
    return false;
  const set = setForItem(slot, index);
  if (set)
    return (
      set.tier === "Free" ||
      ownsSet(p, set.id) ||
      holds(p, pieceId(slot, set.id))
    );
  return true; // Basic pieces are free; saved bundle ownership remains intact.
}
export function canRedeem(
  set: (typeof legendarySets)[number],
  p: WardrobeProgress,
  medals: number,
) {
  return set.tier === "Legendary" && styleTokens(p) >= redemptionCost(set, p);
}
/** What wearing an outfit puts on: its clothes and headwear, pet and magic. */
export const fullOutfitLook = (index: number, body: number) => ({
  ...outfitLook(index, body),
  pet: setItemIndex("pet", index),
  accessory: setItemIndex("accessory", index),
});
export function setLook(index: number) {
  return {
    clothing: setItemIndex("clothing", index),
    hair: setItemIndex("hair", index),
    pet: setItemIndex("pet", index),
    accessory: setItemIndex("accessory", index),
  };
}
