import { createCharacterPreview, loadCharacter, type Look } from "./character";
import { thumbnailLook, type WardrobeTab } from "./wardrobe";

// One offscreen context serves the HUD and every lazy card. Cache only visual
// fields, never a whole Save, so XP and account changes do not invalidate images.
const cache = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
let studioQueue: Promise<unknown> = Promise.resolve();
let studio: ReturnType<typeof createCharacterPreview> | undefined;
const keyFor = (look: Look, slot: string) =>
  JSON.stringify([
    slot,
    look.body ?? 0,
    look.skin,
    look.eye ?? 0,
    look.outfit,
    look.hat,
    look.clothing ?? 0,
    look.hair ?? 0,
    look.baseHair ?? look.hair ?? 0,
    look.pet ?? 0,
    look.accessory ?? 0,
  ]);
export async function avatarPortrait(look: Look, slot = "portrait") {
  const snapshot = { ...look };
  const key = keyFor(snapshot, slot);
  const cached = cache.get(key);
  if (cached) return cached;
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const job = studioQueue.then(async () => {
    await loadCharacter();
    if (!studio) {
      const host = document.createElement("div");
      studio = createCharacterPreview(host, { ...snapshot, reduced: true });
    }
    const image = await studio.thumbnail(snapshot, slot);
    cache.set(key, image);
    if (cache.size > 128) {
      const oldest = cache.keys().next().value!;
      URL.revokeObjectURL(cache.get(oldest)!);
      cache.delete(oldest);
    }
    return image;
  });
  pending.set(key, job);
  studioQueue = job.catch(() => {});
  try {
    return await job;
  } finally {
    pending.delete(key);
  }
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
  const identity = {
    body: worn.body,
    skin: worn.skin,
    eye: worn.eye,
    outfit: worn.outfit,
  };
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
        if (
          !["outfits", "sets", "hair", "clothing", "pet", "accessory"].includes(
            slot,
          )
        )
          continue;
        // Yield each render so the skeleton and input can paint first.
        enqueueThumbnail(async () => {
          if (!img.isConnected) return;
          await avatarPortrait(
            {
              ...thumbnailLook(slot as WardrobeTab, Number(index)),
              ...identity,
            },
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
  host.querySelectorAll<HTMLImageElement>("[data-thumbnail]").forEach((img) => {
    const [slot, index] = (img.dataset.thumbnail || "").split(":");
    if (Number.isInteger(Number(index))) {
      img.src = `/wardrobe/${slot}-${index}.png`;
      img.classList.add("is-ready");
    }
    observer.observe(img);
  });
}
