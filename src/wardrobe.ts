import { HAIR_START } from "./hair-catalog.ts";
import { starterClasses } from "./class-costumes.ts";
import {
  clothingNames,
  hairNames,
  petNames,
  accessoryNames,
} from "./appearance.ts";
import {
  ownsSet,
  canWear,
  canRedeem,
  collectionFor,
  legendarySets,
  lookBundles,
  setForItem,
  setLook,
  styleTokens,
  type LookSlot,
  type WardrobeProgress,
} from "./collections.ts";
import type { Look } from "./character";
import { fresh } from "./state.ts";

export type WardrobeTab = LookSlot | "sets";
export type Collection = "starter" | "discovery" | "mastery" | "legendary";
export const collectionLabels = {
  starter: "Everyday",
  discovery: "Street looks",
  mastery: "Weekend looks",
  legendary: "Legendary",
};
const names = {
  clothing: clothingNames,
  hair: hairNames,
  pet: petNames,
  accessory: accessoryNames,
};
export type TryOn = { look: Look; name: string; image: string } | null;
export const wardrobeSections = [
  "Outfits",
  "Hair",
  "Hats",
  "Capes & back",
  "Props",
  "Pets",
  "Magic",
  "Full sets",
] as const;
export type WardrobeSection = (typeof wardrobeSections)[number];
export const wardrobeFilters = [
  "All",
  "Free",
  "Owned",
  "Mage",
  "Warrior",
  "Archer",
  "Pirate",
  "Thief",
  "Legendary",
  "Premium",
] as const;
export type WardrobeFilter = (typeof wardrobeFilters)[number];
const classPatterns = {
  Mage: /wizard|witch|robe|prism|magic|moon/i,
  Warrior: /knight|armour|ronin|solar|storm|helmet/i,
  Archer: /explorer|hood|forest|garden/i,
  Pirate: /pirate|coral|tide|tidal|pearl/i,
  Thief: /shadow|abyss|hood|slate|midnight/i,
};
export function wardrobeBrowser(
  section: WardrobeSection,
  filter: WardrobeFilter,
  p: WardrobeProgress & Look,
  medals: number,
  trying: TryOn,
) {
  const slots: WardrobeTab[] =
    section === "Capes & back" || section === "Props"
      ? ["clothing", "accessory"]
      : [
          section === "Outfits"
            ? "clothing"
            : section === "Hair" || section === "Hats"
              ? "hair"
              : section === "Pets"
                ? "pet"
                : section === "Full sets"
                  ? "sets"
                  : "accessory",
        ];
  return slots
    .map((slot) =>
      wardrobeCards(slot, null, p, medals, trying, (name, index, owned) => {
        if (
          section === "Hair" &&
          index < HAIR_START &&
          !/cut|bob|buns|beard|flowing hair|ponytail/i.test(name)
        )
          return false;
        if (
          section === "Hats" &&
          (index >= HAIR_START ||
            /cut|bob|buns|beard|flowing hair|ponytail/i.test(name))
        )
          return false;
        if (
          section === "Capes & back" &&
          !/cape|cloak|wings|mantle/i.test(name)
        )
          return false;
        if (
          section === "Props" &&
          !/staff|sword|dagger|cutlass|bow|ribbon|crown|hoop|keep it simple/i.test(
            name,
          )
        )
          return false;
        if (section === "Magic" && /wings|ribbon|crown|hoop/i.test(name))
          return false;
        const set =
          slot === "sets" ? legendarySets[index] : setForItem(slot, index);
        if (filter === "Owned") return owned;
        if (filter === "Free")
          return (
            (slot === "sets" && index < 0) ||
            (!set &&
              slot !== "sets" &&
              collectionFor(slot, index) === "starter")
          );
        if (filter === "Legendary" || filter === "Premium") return !!set;
        if (filter !== "All")
          return classPatterns[filter].test(name + " " + (set?.theme || ""));
        return true;
      }),
    )
    .join("");
}
export function thumbnailLook(slot: WardrobeTab, index: number): Look {
  const base = {
    outfit: 1,
    skin: 0,
    hat: 0,
    clothing: 0,
    hair: fresh().hair,
    pet: 0,
    accessory: 0,
  };
  return slot === "sets"
    ? { ...base, ...setLook(index) }
    : { ...base, [slot]: index };
}
export function itemName(slot: WardrobeTab, index: number) {
  if (slot === "sets" && index < 0) return starterClasses[-index - 1]?.name;
  return slot === "sets" ? legendarySets[index]?.name : names[slot][index];
}
export function itemLook(slot: WardrobeTab, index: number, worn: Look): Look {
  if (slot === "sets" && index < 0) {
    const starter = starterClasses[-index - 1];
    return { ...worn, clothing: starter.clothing, hat: 0 };
  }
  return slot === "sets"
    ? { ...worn, ...setLook(index) }
    : { ...worn, [slot]: index, ...(slot === "hair" ? { hat: 0 } : {}) };
}
export function wearable(
  look: Look,
  p: WardrobeProgress & Look,
  medals: number,
) {
  return (["clothing", "hair", "pet", "accessory"] satisfies LookSlot[]).every(
    (slot) =>
      look[slot] === p[slot] || canWear(slot, look[slot] ?? 0, p, medals),
  );
}
export function wardrobeCards(
  tab: WardrobeTab,
  collection: Collection | null,
  p: WardrobeProgress & Look,
  medals: number,
  trying: TryOn,
  include: (name: string, index: number, owned: boolean) => boolean = () =>
    true,
) {
  const entries =
    tab === "sets"
      ? [
          { name: legendarySets[9].name, index: 9 },
          ...starterClasses.map((s, index) => ({
            name: s.name,
            index: -index - 1,
          })),
          ...legendarySets.map((s, index) => ({ name: s.name, index })),
        ]
      : names[tab]
          .map((name, index) => ({ name, index }))
          .filter(
            ({ index }) =>
              !collection || collectionFor(tab, index) === collection,
          );
  return `<div class="collection-grid">${entries
    .map(({ name, index }) => {
      if (tab === "sets" && index < 0) {
        if (!include(name, index, true)) return "";
        return `<article class="collection-card"><button class="try-item" data-try-slot="sets" data-try-index="${index}" aria-label="Preview ${name}"><span class="item-art"><img class="avatar-thumbnail" data-thumbnail="sets:${index}" alt="${name}" width="240" height="220"></span><span class="item-state">Free starter class</span><strong>${name}</strong></button></article>`;
      }
      const set =
        tab === "sets" ? legendarySets[index] : setForItem(tab, index);
      const owned =
        tab === "sets"
          ? ownsSet(p, set!.id)
          : canWear(tab, index, p, medals) || p[tab] === index;
      const equipped =
        tab === "sets"
          ? Object.entries(setLook(index)).every(
              ([key, value]) => p[key as keyof Look] === value,
            )
          : p[tab] === index;
      if (!include(name, index, owned)) return "";
      const selected = trying?.name === name;
      // Free, Style-token and premium pieces are told apart on every card.
      const tier = set
        ? "Premium"
        : collectionFor(tab as LookSlot, index) === "starter"
          ? "Free"
          : "Style tokens";
      const state = equipped
        ? "Equipped"
        : owned
          ? tier === "Free"
            ? "Free"
            : `${tier} · owned`
          : `${tier} · preview`;
      const thumb = `${tab}:${index}`;
      return `<article class="collection-card ${selected ? "is-previewing" : ""}" style="--collection-color:${set?.color ?? "#b4a0f5"}"><button class="try-item" data-try-slot="${tab}" data-try-index="${index}" aria-label="${owned ? "Equip" : "Preview"} ${name}" aria-pressed="${selected}"><span class="item-art"><img data-thumbnail="${thumb}" class="avatar-thumbnail" src="/wardrobe/${thumb.replace(":", "-")}.png" loading="lazy" alt="${name}" width="240" height="220"></span><span class="item-state${set ? " is-premium" : ""}">${state}</span><strong>${name}</strong>${set ? `<small>${tab === "sets" ? set.theme : set.name}</small>` : ""}</button>${!owned && tab !== "sets" ? (set ? `<button class="secondary" data-buy-set="${set.id}">Get set</button>` : `<button class="secondary" data-redeem-set="${collectionFor(tab, index)}">Get · ${lookBundles.find((b) => b.id === collectionFor(tab, index))?.cost} Style tokens</button>`) : ""}${tab === "sets" && set ? `<div class="set-requirement"><small>Outfit + headwear + pet + magic</small>${owned ? `<span>Yours to mix & match</span>` : `<span>${set.cost} Style tokens</span><button class="secondary" data-redeem-set="${set.id}" ${canRedeem(set, p, medals) ? "" : "disabled"}>${canRedeem(set, p, medals) ? "Exchange tokens" : "Keep playing to unlock"}</button><button class="text-button" data-buy-set="${set.id}">Get set</button>`}</div>` : ""}</article>`;
    })
    .join("")}</div>`;
}
export const hatNames = [
  "No hat",
  "The Kopitiam Bucket",
  "Lilac Daydream cap",
  "Just a Little Sprout",
];
/** Daily-gift and reward hats the player owns, shown with the rest of the headwear. */
export function hatShelf(p: { hat: number; unlockedHats: number[] }) {
  const owned = hatNames
    .map((name, index) => ({ name, index }))
    .filter(({ index }) => !index || p.unlockedHats.includes(index));
  return `<section class="hat-shelf" aria-label="Your hats"><h3>Your hats</h3>${
    owned.length > 1
      ? `<div class="hat-options">${owned.map(({ name, index }) => `<button data-hat="${index}" aria-pressed="${p.hat === index}">${name}${p.hat === index && index ? " · wearing" : ""}</button>`).join("")}</div><p class="collection-note">Hats sit on top of any hairstyle. Trying a hairstyle below takes the hat off.</p>`
      : '<p class="collection-note">No hats yet. Pick a free one at the Mama Shop each day, or finish a round for the Lilac cap.</p>'
  }</section>`;
}
export function collectionDescription(
  collection: Collection,
  p: WardrobeProgress,
  medals: number,
) {
  if (collection === "starter")
    return "Your everyday essentials. Tap any item to try it on.";
  if (collection === "legendary")
    return `Premium pieces from the ${legendarySets.length} Legendary sets. Buy a set or exchange tokens in Sets to own all four pieces.`;
  const bundle = lookBundles.find((b) => b.id === collection)!;
  return ownsSet(p, bundle.id)
    ? "Yours! Try a piece, then equip it."
    : `Unlock this collection for ${bundle.cost} Style token${bundle.cost === 1 ? "" : "s"}. Preview any piece.`;
}
export const tokenSummary = (p: WardrobeProgress) =>
  `${styleTokens(p)} Style tokens`;

export function starterOffer(collection: Collection, p: WardrobeProgress) {
  const bundle = lookBundles.find((b) => b.id === collection);
  return bundle && !ownsSet(p, bundle.id)
    ? `<button class="primary" data-redeem-set="${bundle.id}" ${styleTokens(p) < bundle.cost ? "disabled" : ""}>Get ${bundle.name} · ${bundle.cost} token${bundle.cost === 1 ? "" : "s"}</button>`
    : "";
}
