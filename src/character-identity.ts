/** Stable visual choices using existing starter item IDs; no save migration. */
export function identitySeed(id: string) {
  let value = 2166136261;
  for (const char of id)
    value = Math.imul(value ^ char.charCodeAt(0), 16777619);
  return value >>> 0;
}
export function seededLook(id: string) {
  const seed = identitySeed(id);
  return {
    outfit: seed % 5,
    skin: (seed >>> 4) % 8,
    body: (seed >>> 8) % 2,
    clothing: (seed >>> 9) % 8,
    hair: (seed >>> 13) % 8,
    hat: 0,
    pet: 0,
    accessory: 0,
  };
}
export function distinctHair(candidate: number, occupied: Set<number>) {
  for (let step = 0; step < 8; step++) {
    const hair = (candidate + step) % 8;
    if (!occupied.has(hair)) return hair;
  }
  return candidate;
}
/** Visual separation does not mutate network coordinates or stored activity. */
export function separateCharacter(
  point: { x: number; z: number },
  occupied: readonly { x: number; z: number }[],
  seed: number,
  gap = 1.25,
) {
  for (let pass = 0; pass < 3; pass++)
    for (const other of occupied) {
      const dx = point.x - other.x,
        dz = point.z - other.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= gap) continue;
      const angle = distance > 0.001 ? Math.atan2(dz, dx) : (seed % 628) / 100;
      point.x = other.x + Math.cos(angle) * gap;
      point.z = other.z + Math.sin(angle) * gap;
    }
}
