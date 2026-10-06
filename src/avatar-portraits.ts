import { createCharacterPreview, loadCharacter, type Look } from "./character";
import { itemLook, type WardrobeTab } from "./wardrobe";

// One offscreen context serves the HUD and every lazy card. Cache only visual
// fields, never a whole Save, so XP and account changes do not invalidate images.
const cache = new Map<string, string>();
let studio: ReturnType<typeof createCharacterPreview> | undefined;
const keyFor = (look: Look, slot: string) =>
  JSON.stringify([
    slot,
    look.body ?? 0,
    look.skin,
    look.outfit,
    look.hat,
    look.clothing ?? 0,
    look.hair ?? 0,
    look.pet ?? 0,
    look.accessory ?? 0,
  ]);
export async function avatarPortrait(look: Look, slot = "portrait") {
  const snapshot = { ...look };
  const key = keyFor(snapshot, slot);
  const cached = cache.get(key);
  if (cached) return cached;
  await loadCharacter();
  if (!studio) {
    const host = document.createElement("div");
    studio = createCharacterPreview(host, { ...snapshot, reduced: true });
  }
  const image = studio.thumbnail(snapshot, slot);
  cache.set(key, image);
  if (cache.size > 128) cache.delete(cache.keys().next().value!);
  return image;
}
let headshotVersion = 0;
export function refreshHeadshot(host: HTMLElement, look: Look) {
  const version = ++headshotVersion;
  void avatarPortrait(look)
    .then((image) => {
      if (version !== headshotVersion) return;
      const img = new Image();
      img.alt = "Your current avatar";
      img.src = image;
      host.replaceChildren(img);
    })
    .catch(() => {
      host.setAttribute("aria-label", "Your avatar");
    });
}
let cards: IntersectionObserver | undefined;
const thumbnailJobs: (() => Promise<void>)[] = [];
let renderingCard = false;
function enqueueThumbnail(job: () => Promise<void>) {
  thumbnailJobs.push(job);
  if (renderingCard) return;
  renderingCard = true;
  const next = () => {
    const task = thumbnailJobs.shift();
    if (!task) {
      renderingCard = false;
      return;
    }
    void task().finally(() => setTimeout(next, 32));
  };
  setTimeout(next, 32);
}
export function mountAvatarCards(host: HTMLElement, worn: Look) {
  cards?.disconnect();
  thumbnailJobs.length = 0;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (
          !entry.isIntersecting ||
          !(entry.target instanceof HTMLImageElement)
        )
          continue;
        const img = entry.target;
        observer.unobserve(img);
        const [slot, index] = (img.dataset.thumbnail ?? "").split(":");
        if (!["sets", "hair", "clothing", "pet", "accessory"].includes(slot))
          continue;
        // Yield each render so the skeleton and input can paint first.
        enqueueThumbnail(async () => {
          if (!img.isConnected) return;
          await avatarPortrait(
            itemLook(slot as WardrobeTab, Number(index), worn),
            slot,
          )
            .then((src) => {
              if (img.isConnected) {
                img.src = src;
                img.classList.add("is-ready");
              }
            })
            .catch(() => {
              img.alt = "Preview available by tapping this item";
            });
        });
      }
    },
    { rootMargin: "80px" },
  );
  cards = observer;
  host
    .querySelectorAll<HTMLImageElement>("[data-thumbnail]")
    .forEach((img) => observer.observe(img));
}
