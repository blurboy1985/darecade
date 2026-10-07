import type { Group } from "three";
import { ball, part } from "./shapes.ts";
import type { StyleSet } from "./collections.ts";

const families = new Set([
  "street",
  "rainshield",
  "wayfinder",
  "academy",
  "otter",
  "neighbour",
]);
// Torso decorations stop above the hip: the source skinned legs and sleeves remain free to pose.
export function originalBody(g: Group, s: StyleSet) {
  const kind = s.design.costume;
  if (!families.has(kind)) return false;
  const cream = "#f1e4cb",
    ink = "#293744";
  if (kind === "street") {
    for (const side of [-1, 1]) {
      part(g, "box", [side * 0.2, 1.02, 0.2], [0.19, 0.36, 0.2], s.color);
      part(g, "box", [side * 0.2, 0.87, 0.31], [0.17, 0.055, 0.03], s.accent);
    }
    part(g, "box", [0, 0.87, 0.28], [0.23, 0.36, 0.035], cream);
    part(g, "box", [0.19, 1.03, 0.33], [0.2, 0.16, 0.1], "#ef876d");
    part(g, "box", [0, 1.1, 0.31], [0.04, 0.42, 0.04], s.accent, {
      rot: [0, 0, -0.6],
    });
  } else if (kind === "rainshield") {
    // Broad diagonal rain mantle, shield chest and short rain-chevron back.
    part(g, "oct", [-0.18, 1.16, -0.03], [0.38, 0.24, 0.33], s.color);
    part(g, "oct", [0, 1.06, 0.3], [0.22, 0.23, 0.06], s.accent);
    part(g, "oct", [0, 1.07, 0.365], [0.14, 0.16, 0.025], "#52bdb2");
    part(g, "box", [-0.16, 1.01, -0.29], [0.36, 0.42, 0.045], s.color, {
      rot: [0, 0, -0.18],
    });
    for (const side of [-1, 1])
      part(
        g,
        "box",
        [-0.16 + side * 0.07, 1.02, -0.32],
        [0.035, 0.2, 0.025],
        s.accent,
        { rot: [0, 0, side * 0.55] },
      );
  } else if (kind === "wayfinder") {
    part(g, "oct", [-0.15, 1.12, 0.02], [0.37, 0.29, 0.34], s.color);
    part(g, "box", [-0.19, 0.98, 0.31], [0.32, 0.065, 0.04], s.accent, {
      rot: [0, 0, -0.3],
    });
    part(g, "box", [0.21, 0.88, 0.25], [0.22, 0.22, 0.12], "#34676f");
    part(g, "cyl", [0.27, 1.06, -0.19], [0.07, 0.45, 0.07], s.accent, {
      rot: [0, 0, -0.2],
    });
    part(g, "box", [0, 1.13, 0.29], [0.045, 0.42, 0.04], s.accent, {
      rot: [0, 0, 0.55],
    });
  } else if (kind === "academy") {
    part(g, "oct", [0, 1.22, -0.035], [0.4, 0.18, 0.32], s.color);
    for (const side of [-1, 1])
      part(g, "box", [side * 0.09, 1.22, 0.27], [0.15, 0.14, 0.035], cream, {
        rot: [0, 0, side * 0.5],
      });
    part(g, "cone", [0, 1.16, 0.33], [0.055, 0.075, 0.04], "#c9a45f");
    part(g, "box", [0.24, 0.92, 0.21], [0.2, 0.27, 0.12], s.accent);
    part(g, "box", [0.24, 0.93, 0.28], [0.15, 0.2, 0.035], cream);
    for (const y of [1.04, 0.95, 0.86])
      part(g, "oct", [0, y, 0.29], [0.02, 0.025, 0.015], "#c9a45f");
  } else if (kind === "otter") {
    for (const side of [-1, 1]) {
      part(g, "box", [side * 0.2, 1.02, 0.2], [0.17, 0.42, 0.22], s.color);
      part(g, "box", [side * 0.19, 1.2, 0.22], [0.13, 0.13, 0.22], "#f0d7b7");
    }
    for (const y of [0.9, 1, 1.1])
      part(g, "box", [0, y, 0.3], [0.25, 0.035, 0.03], s.accent);
    part(g, "ico", [0.25, 0.85, 0.3], [0.11, 0.1, 0.06], "#f0d7b7");
  } else {
    // Original terrazzo tiles and kopi sling evoke the void deck without borrowed logos.
    for (const side of [-1, 1]) {
      part(g, "box", [side * 0.18, 1.04, 0.25], [0.2, 0.39, 0.06], s.color);
      part(g, "box", [side * 0.12, 1.23, 0.29], [0.15, 0.13, 0.04], s.accent, {
        rot: [0, 0, side * 0.6],
      });
      for (const y of [0.93, 1.06])
        part(g, "oct", [side * 0.2, y, 0.29], [0.055, 0.035, 0.015], "#b76555");
    }
    part(g, "box", [0, 1.08, 0.31], [0.04, 0.42, 0.04], "#684e42", {
      rot: [0, 0, -0.55],
    });
    part(g, "cyl", [0.23, 0.88, 0.3], [0.085, 0.19, 0.07], "#684e42");
    part(g, "cyl", [0.23, 0.99, 0.3], [0.09, 0.025, 0.075], s.accent);
  }
  return true;
}
export function originalHead(g: Group, s: StyleSet) {
  const kind = s.design.costume;
  if (!families.has(kind)) return false;
  if (kind === "street") {
    ball(g, [0.46, 1.48, 0], [0.09, 0.13, 0.12], s.color);
    part(g, "box", [0.46, 1.68, -0.01], [0.04, 0.25, 0.045], s.accent);
    part(g, "oct", [0.53, 1.48, 0.04], [0.035, 0.06, 0.06], "#ef876d");
  } else if (kind === "rainshield") {
    part(g, "box", [0.16, 1.35, 0.46], [0.29, 0.1, 0.03], "#52bdb2");
    part(g, "box", [0.39, 1.35, 0.23], [0.04, 0.08, 0.43], s.accent);
  } else if (kind === "wayfinder") {
    part(g, "box", [0, 1.74, 0.32], [0.56, 0.065, 0.1], s.color);
    part(g, "oct", [-0.25, 1.75, 0.38], [0.065, 0.08, 0.025], s.accent);
  } else if (kind === "academy") {
    ball(g, [0.09, 1.73, -0.07], [0.44, 0.11, 0.37], s.color, {
      rot: [0, 0, -0.14],
    });
    part(g, "box", [0.12, 1.84, -0.07], [0.035, 0.075, 0.035], s.accent);
    for (const side of [-1, 1])
      part(
        g,
        "ring",
        [side * 0.17, 1.3, 0.48],
        [0.125, 0.13, 0.025],
        "#c9a45f",
      );
    part(g, "box", [0, 1.31, 0.49], [0.1, 0.025, 0.02], "#c9a45f");
  } else if (kind === "otter") {
    ball(g, [0, 1.78, -0.12], [0.49, 0.18, 0.42], s.color);
    for (const side of [-1, 1]) {
      ball(g, [side * 0.37, 1.94, -0.02], [0.13, 0.13, 0.08], s.color);
      ball(g, [side * 0.37, 1.95, 0.05], [0.075, 0.07, 0.02], "#f0d7b7");
      part(g, "box", [side * 0.42, 1.5, -0.17], [0.12, 0.43, 0.24], s.color);
    }
  } else {
    part(g, "cyl", [0, 1.87, -0.035], [0.39, 0.18, 0.35], s.accent);
    part(g, "cyl", [0, 1.78, -0.035], [0.51, 0.035, 0.46], s.accent);
    part(g, "box", [0, 1.86, 0.325], [0.14, 0.065, 0.02], "#684e42");
  }
  return true;
}
