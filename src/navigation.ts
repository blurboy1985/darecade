export type Obstacle = { x: number; z: number; w: number; d: number };
/** The walkable island. East Side extends it past the original east edge. */
export const BOUNDS = { west: -19, east: 33, depth: 14 };
export function blocked(x: number, z: number, obstacles: Obstacle[]) {
  return (
    x < BOUNDS.west ||
    x > BOUNDS.east ||
    Math.abs(z) > BOUNDS.depth ||
    obstacles.some(
      (o) =>
        Math.abs(x - o.x) < o.w / 2 + 0.36 &&
        Math.abs(z - o.z) < o.d / 2 + 0.36,
    )
  );
}
/**
 * Whether passing a spot counts as visiting it. On a walk to a chosen spot
 * only that spot does, so the places on the way are not announced instead.
 */
export function visitsOnWalk(
  spot: string,
  pending: string,
  spots: readonly { id: string }[],
) {
  return pending === spot || !spots.some((s) => s.id === pending);
}
export function route(
  start: { x: number; z: number },
  end: { x: number; z: number },
  obstacles: Obstacle[],
) {
  const clearSegment = (x: number, z: number) => {
    const steps = Math.ceil(Math.hypot(start.x - x, start.z - z) / 0.1);
    for (let i = 1; i <= steps; i++)
      if (
        blocked(
          start.x + ((x - start.x) * i) / steps,
          start.z + ((z - start.z) * i) / steps,
          obstacles,
        )
      )
        return false;
    return true;
  };
  const nearby = [];
  for (let x = Math.floor(start.x) - 1; x <= Math.ceil(start.x) + 1; x++)
    for (let z = Math.floor(start.z) - 1; z <= Math.ceil(start.z) + 1; z++)
      if (!blocked(x, z, obstacles) && clearSegment(x, z))
        nearby.push({ x, z });
  nearby.sort(
    (a, b) =>
      Math.hypot(a.x - start.x, a.z - start.z) -
      Math.hypot(b.x - start.x, b.z - start.z),
  );
  if (!nearby.length) return [];
  const sx = nearby[0].x,
    sz = nearby[0].z,
    ex = Math.round(end.x),
    ez = Math.round(end.z);
  if (blocked(ex, ez, obstacles)) return [];
  const key = (x: number, z: number) => `${x},${z}`;
  const queue = [[sx, sz]];
  const prev = new Map<string, number[] | null>([[key(sx, sz), null]]);
  // Enough steps to search every cell of the island.
  for (let i = 0; i < queue.length && i < 2200; i++) {
    const [x, z] = queue[i];
    if (x === ex && z === ez) {
      const path = [];
      let p: number[] | null = [x, z];
      while (p) {
        path.push({ x: p[0], z: p[1] });
        p = prev.get(key(p[0], p[1]))!;
      }
      const ordered = path.reverse();
      return Math.hypot(start.x - sx, start.z - sz) < 0.05
        ? ordered.slice(1)
        : ordered;
    }
    for (const [dx, dz] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ]) {
      const nx = x + dx,
        nz = z + dz,
        k = key(nx, nz);
      if (!prev.has(k) && !blocked(nx, nz, obstacles)) {
        prev.set(k, [x, z]);
        queue.push([nx, nz]);
      }
    }
  }
  return [];
}
