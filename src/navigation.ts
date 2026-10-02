export type Obstacle = { x: number; z: number; w: number; d: number };
export function blocked(x: number, z: number, obstacles: Obstacle[]) {
  return (
    Math.abs(x) > 19 ||
    Math.abs(z) > 14 ||
    obstacles.some(
      (o) =>
        Math.abs(x - o.x) < o.w / 2 + 0.36 &&
        Math.abs(z - o.z) < o.d / 2 + 0.36,
    )
  );
}
export function route(
  start: { x: number; z: number },
  end: { x: number; z: number },
  obstacles: Obstacle[],
) {
  const sx = Math.round(start.x),
    sz = Math.round(start.z),
    ex = Math.round(end.x),
    ez = Math.round(end.z);
  if (blocked(ex, ez, obstacles)) return [];
  const key = (x: number, z: number) => `${x},${z}`;
  const queue = [[sx, sz]];
  const prev = new Map<string, number[] | null>([[key(sx, sz), null]]);
  for (let i = 0; i < queue.length && i < 1300; i++) {
    const [x, z] = queue[i];
    if (x === ex && z === ez) {
      const path = [];
      let p: number[] | null = [x, z];
      while (p) {
        path.push({ x: p[0], z: p[1] });
        p = prev.get(key(p[0], p[1]))!;
      }
      return path.reverse().slice(1);
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
