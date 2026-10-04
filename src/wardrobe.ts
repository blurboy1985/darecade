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
  setForItem,
  setLook,
  styleTokens,
  type LookSlot,
  type WardrobeProgress,
} from "./collections.ts";
import type { Look } from "./character";

export type WardrobeTab = LookSlot | "sets";
export type Collection = "starter" | "discovery" | "mastery" | "legendary";
export const collectionLabels = {
  starter: "Everyday",
  discovery: "Discovery",
  mastery: "Mastery",
  legendary: "Legendary",
};
const names = {
  clothing: clothingNames,
  hair: hairNames,
  pet: petNames,
  accessory: accessoryNames,
};
export type TryOn = { look: Look; name: string; image: string } | null;
export function thumbnailLook(slot: WardrobeTab, index: number): Look {
  const base = {
    outfit: 1,
    skin: 0,
    hat: 0,
    clothing: 0,
    hair: 0,
    pet: 0,
    accessory: 0,
  };
  return slot === "sets"
    ? { ...base, ...setLook(index) }
    : { ...base, [slot]: index };
}
export function itemName(slot: WardrobeTab, index: number) {
  return slot === "sets" ? legendarySets[index]?.name : names[slot][index];
}
export function itemLook(slot: WardrobeTab, index: number, worn: Look): Look {
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
  collection: Collection,
  p: WardrobeProgress & Look,
  medals: number,
  trying: TryOn,
) {
  const entries =
    tab === "sets"
      ? legendarySets.map((s, index) => ({ name: s.name, index }))
      : names[tab]
          .map((name, index) => ({ name, index }))
          .filter(({ index }) => collectionFor(tab, index) === collection);
  return `<div class="collection-grid">${entries
    .map(({ name, index }) => {
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
      const selected = trying?.name === name;
      const thumb = `${tab}:${index}`;
      return `<article class="collection-card ${selected ? "is-previewing" : ""}" style="--collection-color:${set?.color ?? "#b4a0f5"}"><button class="try-item" data-try-slot="${tab}" data-try-index="${index}" aria-label="Preview ${name}" aria-pressed="${selected}"><span class="item-art"><img data-thumbnail="${thumb}" src="/wardrobe/${thumb.replace(":", "-")}.png" loading="lazy" alt="${name}" width="240" height="220"></span><span class="item-state">${equipped ? "Equipped" : owned ? "Owned" : "Locked · preview"}</span><strong>${name}</strong>${set ? `<small>${tab === "sets" ? set.theme : set.name}</small>` : ""}</button>${tab === "sets" && set ? `<div class="set-requirement"><small>Outfit + headwear + pet + magic</small>${owned ? `<span>Yours to mix & match</span>` : `<span>${set.cost} Style tokens</span><small>${Math.min(medals, set.medals)}/${set.medals} medal points OR ${Math.min(p.rounds, set.rounds)}/${set.rounds} rounds</small><button class="secondary" data-redeem-set="${set.id}" ${canRedeem(set, p, medals) ? "" : "disabled"}>${canRedeem(set, p, medals) ? "Exchange tokens" : "Keep playing to unlock"}</button><button class="text-button" data-buy-set="${set.id}">Buy set options</button>`}</div>` : ""}</article>`;
    })
    .join("")}</div>`;
}
export function collectionDescription(
  collection: Collection,
  p: WardrobeProgress,
  medals: number,
) {
  if (collection === "starter")
    return "Your everyday essentials. Tap any item to try it on.";
  if (collection === "legendary")
    return "Pieces from the 10 Legendary sets. Exchange tokens in Sets to own all four pieces.";
  const xp = collection === "discovery" ? 300 : 1000,
    points = collection === "discovery" ? 1 : 3;
  return p.xp >= xp || medals >= points
    ? "Collection unlocked. Try a piece, then equip it."
    : `Unlock at ${xp} XP or ${points} lifetime medal point${points > 1 ? "s" : ""}. Your progress: ${p.xp}/${xp} XP · ${medals}/${points} medal points. All items can be previewed.`;
}
export const tokenSummary = (p: WardrobeProgress) =>
  `${styleTokens(p)} Style tokens`;
