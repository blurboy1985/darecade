/** Water trails have three turnable pipes. All other pipes stay fixed.
 * Generation and validation are shared with the server; turning a pipe is local.
 * Bits run clockwise: north, east, south, west.
 */
export type WaterTrail = {
  tiles: number[];
  gates: number[];
  links: number[][];
};
const paths = [
  [0, 1, 2, 5, 4, 3, 6, 7, 8],
  [0, 3, 6, 7, 4, 1, 2, 5, 8],
] as const;
export const pipeDirections = ["up", "right", "down", "left"] as const;
const steps = [-3, 1, 3, -1];
// Adding two turns to every linked-loop control cancels out. Filter both
// equivalent solutions so a tricky trail cannot be solved in one tap.
const linkedScrambles = Array.from({ length: 64 }, (_, n) => [
  n % 4,
  Math.floor(n / 4) % 4,
  Math.floor(n / 16),
]).filter((turns) => {
  const undo = turns.map((n) => (4 - n) % 4);
  return (
    Math.min(
      undo.reduce((sum, n) => sum + n, 0),
      undo.reduce((sum, n) => sum + ((n + 2) % 4), 0),
    ) >= 4
  );
});

function rotate(mask: number, turns: number) {
  for (let i = 0; i < turns; i++) mask = ((mask << 1) & 15) | (mask >> 3);
  return mask;
}
function direction(from: number, to: number) {
  return 1 << steps.indexOf(to - from);
}
export function createWaterTrail(
  crop: string,
  planted: number,
  variation = 0,
): WaterTrail {
  let seed = 2166136261;
  for (const char of `${crop}:${planted}:${variation}`)
    seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const path = paths[seed % paths.length];
  const tiles = Array<number>(9).fill(0);
  path.forEach((cell, i) => {
    tiles[cell] =
      (i === 0 ? 8 : direction(cell, path[i - 1])) |
      (i === path.length - 1 ? 2 : direction(cell, path[i + 1]));
  });
  // Only elbows turn: every turn visibly changes the two openings.
  const bends = path.filter((cell) => tiles[cell] !== 5 && tiles[cell] !== 10);
  const offset = (seed >>> 4) % bends.length;
  const gates = [0, 1, 2].map((i) => bends[(offset + i) % bends.length]);
  const links =
    crop === "sunflower"
      ? [
          [0, 1],
          [1, 2],
          [2, 0],
        ]
      : crop === "pandan"
        ? [[0, 1], [1], [2]]
        : [[0], [1], [2]];
  const trail = { tiles, gates, links };
  const scramble =
    crop === "sunflower"
      ? [...linkedScrambles[(seed >>> 8) % linkedScrambles.length]]
      : [0, 1, 2].map((i) => 1 + ((seed >>> (8 + i * 3)) % 3));
  let mixed = trailTiles(trail, scramble);
  // Linked controls can cancel each other. Never start with a solved bed.
  if (traceWater(mixed).complete) {
    scramble[0] = (scramble[0] + 1) % 4;
    mixed = trailTiles(trail, scramble);
  }
  return { ...trail, tiles: mixed };
}
export function trailTiles(trail: WaterTrail, turns: readonly number[]) {
  const tiles = [...trail.tiles];
  trail.links.forEach((linked, control) => {
    for (const gate of linked) {
      const cell = trail.gates[gate];
      tiles[cell] = rotate(tiles[cell], turns[control]);
    }
  });
  return tiles;
}
export function traceWater(tiles: readonly number[]) {
  const wet: number[] = [];
  if (tiles.length !== 9 || !(tiles[0] & 8)) return { wet, complete: false };
  const queue = [0];
  while (queue.length) {
    const cell = queue.shift()!;
    if (wet.includes(cell)) continue;
    wet.push(cell);
    for (let d = 0; d < 4; d++) {
      if (!(tiles[cell] & (1 << d))) continue;
      if ((d === 1 && cell % 3 === 2) || (d === 3 && cell % 3 === 0)) continue;
      const next = cell + steps[d];
      if (
        next >= 0 &&
        next < 9 &&
        tiles[next] & (1 << (d + 2) % 4) &&
        !wet.includes(next)
      )
        queue.push(next);
    }
  }
  return { wet, complete: wet.includes(8) && !!(tiles[8] & 2) };
}
/** The planting identity prevents an old solution from watering a later crop. */
export function validWaterTrail(crop: string, planted: number, value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    !("crop" in value) ||
    value.crop !== crop ||
    !("planted" in value) ||
    value.planted !== planted ||
    !("turns" in value) ||
    !Array.isArray(value.turns) ||
    value.turns.length !== 3 ||
    !Array.from(value.turns).every(
      (n: unknown) =>
        typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 3,
    )
  )
    return false;
  return traceWater(trailTiles(createWaterTrail(crop, planted), value.turns))
    .complete;
}
