import * as T from "three";
import { hairShapes } from "./hair-catalog.ts";

type HairShape = (typeof hairShapes)[number];
const surfaces = new Map<string, T.BufferGeometry>();
const smooth = (a: number, b: number, x: number) =>
  T.MathUtils.smoothstep(x, a, b);

/** A single scalp-following surface, with the fringe and nape in its boundary.
 * Shared vertices keep the forehead and back continuous, including the outline.
 * Long cuts extend that same surface rather than stacking ellipsoids behind it.
 */
export function hairSurface(style: HairShape, capped: boolean) {
  const key = `${style}:${capped}`;
  const cached = surfaces.get(key);
  if (cached) return cached;
  const columns = 48,
    rows = 14;
  const positions: number[] = [0, capped ? 0.23 : 0.43, -0.015];
  const uv: number[] = [0.5, 1];
  const indices: number[] = [];
  for (let row = 1; row <= rows; row++) {
    const t = row / rows;
    for (let column = 0; column < columns; column++) {
      const angle = (column / columns) * Math.PI * 2;
      const signed = Math.atan2(Math.sin(angle), Math.cos(angle));
      const front = 1 - smooth(0.55, 1.65, Math.abs(signed));
      // Keep the fringe just above the brows, with a small cut-specific contour.
      let fringe = 1.48;
      if (style === "flowing")
        fringe = 1.45 + 0.07 * Math.abs(Math.sin(angle * 1.5));
      if (style === "messy") fringe = 1.49 + 0.035 * Math.sin(angle * 5 + 0.7);
      if (style === "ponytail" || style === "braid")
        fringe = 1.48 + 0.04 * Math.sin(angle * 2 + 0.5);
      if (style === "buns" || style === "tails")
        fringe = 1.48 + 0.025 * Math.cos(angle * 4);
      if (style === "spiky") fringe = 1.48 + 0.035 * Math.cos(angle * 6);
      // Broad swept locks, with narrower valleys between them. The phase bends
      // toward an off-centre part as it approaches the crown.
      const edgePhase = angle * 13 + 1.1 + 0.6 * Math.sin(angle * 3);
      const phase = edgePhase + (1 - t) * 4.5;
      const lock = Math.pow(0.5 + 0.5 * Math.cos(phase), 0.7);
      const edgeLock = Math.pow(0.5 + 0.5 * Math.cos(edgePhase), 2);
      fringe += 0.21 * edgeLock - 0.12 + 0.055 * Math.sin(angle + 0.5);
      const temple = Math.exp(-Math.pow((Math.abs(signed) - 1.15) / 0.2, 2));
      const end =
        T.MathUtils.lerp(style === "bob" ? 1.82 : 2.03, fringe, front) +
        0.11 * temple +
        0.045 * (1 - front) * edgeLock;
      const polar = t * end;
      const sweep =
        style === "messy" ? 0.055 * Math.sin(polar) * Math.cos(polar) : 0;
      let x = 0.46 * Math.sin(polar) * Math.sin(angle) + sweep;
      let y = 0.03 + 0.4 * Math.cos(polar);
      // The lower fringe needs forehead clearance as the skull widens here.
      const depth = 0.39 + 0.025 * front * smooth(0.6, 1, t);
      let z = -0.015 + depth * Math.sin(polar) * Math.cos(angle);
      // Fade the ridges to zero at the welded crown. Keep valleys outside the
      // skull; surface shading comes from raised locks, not cuts into the scalp.
      const relief =
        (style === "messy" ? 0.065 : 0.045) * lock * Math.sin(polar);
      x += relief * Math.sin(angle);
      z += relief * Math.cos(angle);
      // Hats retain the original crown-height envelope.
      if (!capped) y += relief * 0.5;
      x += 0.055 * Math.sin(Math.PI * t) * Math.sin(polar);
      // Length grows from the lower side/back of the same shell, with no seam.
      const length = style === "flowing" ? 0.57 : style === "bob" ? 0.19 : 0;
      y -= length * (1 - front) * smooth(0.48, 1, t);
      y += length * 0.12 * (1 - front) * (1 - edgeLock) * smooth(0.75, 1, t);
      if (style === "spiky" && !capped) {
        const tips = Math.pow(Math.max(0, Math.cos(angle * 5)), 6);
        y += 0.22 * tips * Math.pow(Math.sin(Math.PI * t), 3);
      }
      if (capped && y > 0.08) {
        const tuck = smooth(0.08, 0.43, y);
        x *= 1 - 0.14 * tuck;
        z *= 1 - 0.14 * tuck;
        y = 0.08 + (y - 0.08) * 0.43;
      }
      positions.push(x, y, z);
      uv.push(column / columns, 1 - t);
    }
  }
  for (let column = 0; column < columns; column++) {
    const next = (column + 1) % columns;
    indices.push(0, 1 + column, 1 + next);
    for (let row = 0; row < rows - 1; row++) {
      const a = 1 + row * columns + column,
        b = 1 + row * columns + next;
      const c = a + columns,
        d = b + columns;
      indices.push(a, c, b, b, c, d);
    }
  }
  // Turn the hairline inward, making a thin solid edge instead of a floating sheet.
  const rim = positions.length / 3;
  for (let column = 0; column < columns; column++) {
    const edge = 1 + (rows - 1) * columns + column;
    positions.push(
      positions[edge * 3] * 0.95,
      positions[edge * 3 + 1] + 0.014,
      positions[edge * 3 + 2] * 0.95,
    );
    uv.push(column / columns, 0);
    const next = (column + 1) % columns;
    const edgeNext = 1 + (rows - 1) * columns + next;
    indices.push(
      edge,
      rim + column,
      edgeNext,
      edgeNext,
      rim + column,
      rim + next,
    );
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  surfaces.set(key, geometry);
  return geometry;
}
