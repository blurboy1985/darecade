import { HAIR_START } from "./hair-catalog.ts";
import { starterClasses } from "./class-costumes.ts";
import {
  clothingNames,
  hairNames,
  petNames,
  accessoryNames,
} from "./appearance.ts";
import {
  canWear,
  outfitLook,
  outfitBodyName,
  setItemIndex,
  setIndexFor,
  setPriceSGD,
  canRedeem,
  legendarySets,
  setForItem,
  setLook,
  styleTokens,
  type LookSlot,
  type WardrobeProgress,
} from "./collections.ts";
import type { Look } from "./character";
import { fresh } from "./state.ts";

export type WardrobeTab = LookSlot | "sets" | "outfits";
export type TryOn = { look: Look; name: string; image: string } | null;
export const wardrobeSections = ["Outfits", "Pets", "Magic"] as const;
export type WardrobeSection = (typeof wardrobeSections)[number];
export const wardrobeFilters = ["Free", "Legendary", "Premium"] as const;
export type WardrobeFilter = (typeof wardrobeFilters)[number];
const names = {
  clothing: clothingNames,
  hair: hairNames,
  pet: petNames,
  accessory: accessoryNames,
};
export const tierDescriptions = {
  Free: "Yours to wear. No tokens or payment needed.",
  Legendary:
    "Unlock a set with Style tokens, or pay if you need more tokens. Complete outfit, pet and magic are included.",
  Premium: "Money-only looks. Style tokens cannot be used here.",
};
export function wardrobeBrowser(
  section: WardrobeSection,
  filter: WardrobeFilter,
  p: WardrobeProgress & Look,
  medals: number,
  trying: TryOn,
) {
  const slot =
    section === "Outfits"
      ? "outfits"
      : section === "Pets"
        ? "pet"
        : "accessory";
  const audience = p.body === 1 ? 1 : 0;
  const entries = legendarySets.flatMap((set, theme) =>
    set.tier !== filter
      ? []
      : [
          {
            set,
            index:
              slot === "outfits"
                ? theme * 2 + audience
                : setItemIndex(slot, theme),
          },
        ],
  );
  const cards = entries.map(({ set, index }) => {
    const name =
      slot === "outfits" ? set.name : slot === "pet" ? set.pet : set.magic;
    const { owned, equipped, selected, state } = wardrobeItemState(
      slot,
      index,
      p,
      medals,
      trying,
    );
    const actions = !owned
      ? `<div class="item-unlock"><small>Set includes a complete outfit, pet & magic</small>${set.tier === "Legendary" ? `<button class="secondary" data-redeem-set="${set.id}" ${canRedeem(set, p, medals) ? "" : "disabled"}>Unlock · ${set.cost} Style tokens</button>` : ""}${set.tier === "Premium" || !canRedeem(set, p, medals) ? `<button class="secondary" data-buy-set="${set.id}">Buy set · S$${(setPriceSGD / 100).toFixed(2)}</button>` : ""}</div>`
      : "";
    return `<article class="collection-card ${selected ? "is-previewing" : ""}" style="--collection-color:${set.color}"><button class="try-item" data-try-slot="${slot}" data-try-index="${index}" ${slot === "outfits" ? `data-outfit-body="${audience}"` : ""} aria-label="${owned ? "Equip" : "Preview"} ${name}" aria-pressed="${selected || equipped}"><span class="item-art"><img data-thumbnail="${slot}:${index}" class="avatar-thumbnail" src="/wardrobe/${slot}-${index}.png" loading="lazy" alt="${name}" width="240" height="220"></span><span class="item-state">${state}</span><strong>${name}</strong><small>${slot === "outfits" ? `${outfitBodyName(audience)} · Complete outfit` : set.name}</small></button>${actions}</article>`;
  });
  return `<div class="catalog-heading"><strong>${section === "Outfits" ? `${outfitBodyName(audience)} outfits` : section}</strong><span>${entries.length} ${filter.toLowerCase()} ${section === "Outfits" ? "looks" : "items"}</span>${slot === "pet" ? `<button class="text-button" data-pet="0" aria-pressed="${!p.pet}">No pet</button>` : slot === "accessory" ? `<button class="text-button" data-accessory="0" aria-pressed="${!p.accessory}">No magic</button>` : ""}</div><p class="tier-description">${tierDescriptions[filter]}</p><div class="collection-grid">${cards.join("")}</div>`;
}
export function wardrobeItemState(
  slot: WardrobeTab,
  index: number,
  p: WardrobeProgress & Look,
  medals: number,
  trying: TryOn,
) {
  const outfit = slot === "outfits";
  const set = outfit
    ? legendarySets[Math.floor(index / 2)]
    : slot === "sets"
      ? legendarySets[index]
      : setForItem(slot, index);
  const owned =
    set?.tier === "Free" ||
    (outfit || slot === "sets"
      ? !!set &&
        (p.wardrobeUnlocked.includes(set.id) ||
          p.wardrobePurchased.includes(set.id))
      : canWear(slot, index, p, medals));
  const matches = (look: Look) =>
    outfit
      ? index % 2 === (look.body ?? 0) &&
        Object.entries(outfitLook(Math.floor(index / 2), look.body ?? 0)).every(
          ([key, value]) => look[key as keyof Look] === value,
        )
      : slot === "sets"
        ? Object.entries(setLook(index)).every(
            ([key, value]) => look[key as keyof Look] === value,
          )
        : look[slot] === index && (slot !== "hair" || !look.hat);
  const equipped = matches(p);
  const selected = !!trying && matches(trying.look) && !equipped;
  const ownership =
    set && p.wardrobePurchased.includes(set.id)
      ? "Purchased"
      : set && owned && set.tier !== "Free"
        ? "Owned"
        : (set?.tier ?? "Free");
  return {
    owned,
    equipped,
    selected,
    state: `${ownership}${equipped ? " · Equipped" : selected ? " · Previewing" : ""}`,
  };
}
export function refreshWardrobeCards(
  host: HTMLElement,
  p: WardrobeProgress & Look,
  medals: number,
  trying: TryOn,
) {
  for (const button of Array.from(
    host.querySelectorAll<HTMLButtonElement>("[data-try-slot]"),
  )) {
    const slot = button.dataset.trySlot;
    if (
      slot !== "outfits" &&
      slot !== "clothing" &&
      slot !== "hair" &&
      slot !== "pet" &&
      slot !== "accessory"
    )
      continue;
    const state = wardrobeItemState(
      slot,
      Number(button.dataset.tryIndex),
      p,
      medals,
      trying,
    );
    button.setAttribute(
      "aria-pressed",
      String(state.selected || state.equipped),
    );
    button
      .closest(".collection-card")
      ?.classList.toggle("is-previewing", state.selected);
    const label = button.querySelector(".item-state");
    if (label) label.textContent = state.state;
  }
}
export function thumbnailLook(slot: WardrobeTab, index: number): Look {
  const base = {
    outfit: 1,
    body: slot === "outfits" ? index % 2 : 0,
    skin: 0,
    hat: 0,
    clothing: 0,
    hair: fresh().hair,
    pet: 0,
    accessory: 0,
  };
  return itemLook(slot, index, base);
}
export function itemName(slot: WardrobeTab, index: number) {
  if (slot === "outfits") return legendarySets[Math.floor(index / 2)]?.name;
  if (slot === "sets" && index < 0) return starterClasses[-index - 1]?.name;
  return slot === "sets" ? legendarySets[index]?.name : names[slot][index];
}
export function itemLook(slot: WardrobeTab, index: number, worn: Look): Look {
  if (slot === "outfits") {
    if (index % 2 !== (worn.body ?? 0))
      throw Error("Choose an outfit for your character.");
    return { ...worn, ...outfitLook(Math.floor(index / 2), worn.body ?? 0) };
  }
  if (slot === "sets" && index < 0) {
    const starter = starterClasses[-index - 1];
    return { ...worn, clothing: starter.clothing, hat: 0 };
  }
  return slot === "sets"
    ? { ...worn, ...setLook(index) }
    : {
        ...worn,
        [slot]: index,
        ...(slot === "hair"
          ? {
              hat: 0,
              baseHair:
                index >= HAIR_START ||
                /cut|bob|buns|beard|flowing hair|ponytail|twin tails/i.test(
                  hairNames[index],
                )
                  ? index
                  : (worn.baseHair ?? worn.hair ?? 38),
            }
          : {}),
      };
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
export const tokenSummary = (p: WardrobeProgress) =>
  `${styleTokens(p)} Style tokens`;

export const hatNames = [
  "No hat",
  "The Kopitiam Bucket",
  "Lilac Daydream cap",
  "Just a Little Sprout",
];
/** Daily-gift and reward hats the player owns, shown with the rest of the headwear. */
export function hatShelf(p: {
  hat: number;
  hair?: number;
  unlockedHats: number[];
}) {
  const owned = hatNames
    .map((name, index) => ({ name, index }))
    .filter(({ index }) => !index || p.unlockedHats.includes(index));
  return `<section class="hat-shelf" aria-label="Your hats"><h3>Your hats</h3>${!p.hat && p.hair !== undefined ? `<p class="collection-note">Selected: ${hairNames[p.hair]}</p>` : ""}${
    owned.length > 1
      ? `<div class="hat-options">${owned.map(({ name, index }) => `<button data-hat="${index}" aria-pressed="${p.hat === index}">${name}${p.hat === index && index ? " · wearing" : ""}</button>`).join("")}</div><p class="collection-note">Hats sit on top of any hairstyle. Trying a hairstyle below takes the hat off.</p>`
      : '<p class="collection-note">No hats yet. Pick a free one at the Mama Shop each day, or finish Palm Bay for the Lilac cap.</p>'
  }</section>`;
}

export function outfitPreviewImage(look: Look) {
  const theme = setIndexFor("clothing", look.clothing ?? 0);
  return theme >= 0
    ? `/wardrobe/outfits-${theme * 2 + (look.body === 1 ? 1 : 0)}.png`
    : `/wardrobe/clothing-${look.clothing ?? 0}.png`;
}
