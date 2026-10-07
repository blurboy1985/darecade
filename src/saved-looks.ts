import type { Look } from "./character.ts";
import { appearanceLimits } from "./appearance.ts";
import { canWear, type WardrobeProgress } from "./collections.ts";

const limits = {
  outfit: 6,
  skin: 8,
  eye: 5,
  body: 2,
  hat: 4,
  ...appearanceLimits,
  baseHair: appearanceLimits.hair,
};
export const savedLookCount = 4;
export type SavedLooks = (Look | null)[];
/** Bounded, visual-only snapshots. Never deserialize progress or entitlement fields. */
export function readSavedLooks(raw: unknown): SavedLooks {
  return Array.from({ length: savedLookCount }, (_, index) => {
    const value = Array.isArray(raw) ? raw[index] : null;
    if (!value || typeof value !== "object") return null;
    const entries = Object.entries(limits).map(([key, limit]) => {
      const n = value[key];
      return [
        key,
        Number.isInteger(n) && n >= 0 && n < limit ? n : null,
      ] as const;
    });
    if (entries.some(([, value]) => value === null)) return null;
    return Object.fromEntries(entries) as Look;
  });
}
export function savedLookAllowed(
  look: Look,
  progress: WardrobeProgress & { unlockedHats: number[] },
) {
  return (
    progress.unlockedHats.includes(look.hat) &&
    (["clothing", "hair", "pet", "accessory"] as const).every((slot) =>
      canWear(slot, look[slot] ?? 0, progress, 0),
    ) &&
    canWear("hair", look.baseHair ?? look.hair ?? 0, progress, 0)
  );
}
