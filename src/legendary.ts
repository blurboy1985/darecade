import * as T from "three";
import { legendarySets } from "./collections.ts";
import { part, ball, node } from "./shapes.ts";

export function legendaryHead(parent: T.Object3D, index: number) {
  const s = legendarySets[index];
  const g = node(parent);
  const gem = (x: number, y: number, z: number, size = 0.09) =>
    part(g, "oct", [x, y, z], [size, size * 1.8, size], s.accent, {
      glow: 0.7,
    });
  if (index === 4 || index === 9) {
    for (const side of [-1, 1]) {
      ball(g, [side * 0.44, 1.4, 0], [0.1, 0.2, 0.18], s.color);
      part(g, "ring", [side * 0.49, 1.4, 0], [0.14, 0.14, 0.14], s.accent, {
        rot: [0, Math.PI / 2, 0],
        glow: 1,
      });
      gem(side * 0.44, 1.8, 0);
    }
    if (index === 4)
      part(g, "box", [0, 1.45, 0.42], [0.68, 0.12, 0.06], s.accent, {
        glow: 1,
        opacity: 0.75,
      });
  } else if (index === 3) {
    for (const side of [-1, 1]) {
      part(g, "cone", [side * 0.29, 1.92, 0], [0.19, 0.48, 0.13], s.color, {
        rot: [0, 0, -side * 0.3],
      });
      gem(side * 0.29, 1.9, 0.1);
    }
  } else if (index === 1 || index === 8) {
    part(g, "ring", [0, 2.02, 0], [0.37, 0.37, 0.37], s.color, {
      glow: 0.8,
      rot: [0.3, 0, 0],
    });
    for (let i = 0; i < 5; i++)
      gem(Math.cos(i * 1.25) * 0.37, 2.02 + Math.sin(i * 1.25) * 0.37, 0);
  } else {
    part(g, "torus", [0, 1.72, 0], [0.4, 0.1, 0.36], s.color, {
      rot: [Math.PI / 2, 0, 0],
    });
    const count = index === 2 ? 2 : index === 7 ? 7 : 5;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const spike = gem(
        Math.cos(a) * 0.32,
        1.92 + (i % 2) * 0.1,
        Math.sin(a) * 0.28,
        index === 2 ? 0.16 : 0.09,
      );
      spike.rotation.z = -Math.cos(a) * 0.5;
    }
    gem(0, 1.64, 0.42, 0.11);
  }
  return g;
}

export function legendaryBody(parent: T.Object3D, index: number) {
  const s = legendarySets[index];
  const g = node(parent);
  // The silhouette stays distinct even without the matching head or magic.
  part(g, "oct", [0, 1.05, 0.32], [0.15, 0.22, 0.08], s.accent, { glow: 0.8 });
  for (const side of [-1, 1]) {
    const count = [3, 2, 3, 4, 2, 4, 3, 5, 4, 2][index];
    for (let i = 0; i < count; i++) {
      const shape = index === 4 ? "box" : index === 6 ? "ball" : "oct";
      part(
        g,
        shape,
        [side * (0.31 + i * 0.07), 1.19 - i * 0.045, -0.03],
        [0.13, 0.18 + i * 0.04, 0.14],
        i % 2 ? s.accent : s.color,
        { rot: [0, 0, -side * (0.4 + i * 0.17)], glow: 0.25 },
      );
    }
    part(g, "box", [side * 0.19, 0.68, 0.25], [0.09, 0.48, 0.05], s.color, {
      rot: [0, 0, side * 0.15],
    });
  }
  return g;
}

export function legendaryMagic(parent: T.Object3D, index: number) {
  const s = legendarySets[index];
  const g = node(parent);
  if ([0, 7, 8].includes(index)) {
    for (const side of [-1, 1])
      for (let i = 0; i < 6; i++)
        part(
          g,
          "oct",
          [side * (0.4 + i * 0.12), 1.32 + Math.sin(i * 0.5) * 0.5, -0.3],
          [0.15, 0.5 - i * 0.045, 0.07],
          i % 2 ? s.color : s.accent,
          { rot: [0, 0, -side * (0.4 + i * 0.13)], glow: 0.6 },
        );
  } else if (index === 3) {
    for (let i = 0; i < 9; i++) {
      const a = (i - 4) * 0.24;
      part(
        g,
        "cone",
        [Math.sin(a) * 0.85, 0.8 + Math.cos(a) * 0.45, -0.45],
        [0.11, 0.95, 0.1],
        i % 2 ? s.color : s.accent,
        { rot: [0.45, 0, -a], glow: 0.5 },
      );
    }
  } else if (index === 1 || index === 5) {
    part(g, "ring", [0, 1.35, -0.3], [0.85, 0.85, 0.85], s.color, { glow: 1 });
    part(g, "ring", [0, 1.35, -0.32], [0.7, 0.7, 0.7], s.accent, { glow: 1 });
  }
  const satellites = Array.from({ length: 8 }, (_, i) =>
    part(
      g,
      index === 2 ? "cone" : index === 6 ? "ball" : "oct",
      [0, 0, 0],
      [0.07, index === 2 ? 0.3 : 0.1, 0.07],
      i % 2 ? s.color : s.accent,
      { glow: 1 },
    ),
  );
  return (time: number) => {
    satellites.forEach((o, i) => {
      const a = time * (0.45 + index * 0.06) + (i * Math.PI) / 4;
      o.position.set(
        Math.cos(a) * 0.85,
        1.2 + Math.sin(a * 2 + index) * 0.65,
        Math.sin(a) * 0.65,
      );
      o.rotation.set(a, a * 0.4, a);
    });
  };
}
