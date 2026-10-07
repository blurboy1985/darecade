import * as T from "three";
import { legendarySets, type StyleSet } from "./collections.ts";
import { part, ball, node } from "./shapes.ts";

// Existing magic recipes retain their saved item IDs.
function laterMagic(g: T.Object3D, id: string, color: string, accent: string) {
  const shape = (
    {
      candy: "ball",
      boba: "ball",
      pixel: "cyl",
      witch: "oct",
      garden: "ball",
      dino: "ico",
    } as const
  )[id as "candy"];
  const many = id === "pixel" ? 10 : 8;
  const bits = Array.from({ length: many }, (_, i) =>
    part(
      g,
      shape,
      [0, 0, 0],
      id === "pixel"
        ? [0.08, 0.02, 0.08]
        : id === "garden"
          ? [0.09, 0.03, 0.06]
          : [0.07, 0.07, 0.07],
      id === "boba" ? (i % 2 ? "#3a2418" : accent) : i % 2 ? color : accent,
      { glow: id === "boba" ? 0.2 : 0.9 },
    ),
  );
  const ring =
    id === "witch" || id === "dino"
      ? part(g, "ring", [0, 0.14, 0], [0.8, 0.8, 0.8], color, {
          glow: 1,
          rot: [Math.PI / 2, 0, 0],
        })
      : null;
  if (id === "witch")
    for (let i = 0; i < 5; i++)
      part(
        g,
        "oct",
        [Math.cos(i * 1.257) * 0.8, 0.14, Math.sin(i * 1.257) * 0.8],
        [0.05, 0.1, 0.05],
        accent,
        { glow: 1 },
      );
  return (time: number) => {
    if (ring) ring.rotation.z = time * 0.5;
    bits.forEach((o, i) => {
      const k = i / many;
      if (id === "pixel" || id === "dino") {
        // Coins and sparks rise in a fountain and fall back.
        const u = (time * 0.6 + k) % 1;
        const a = i * 2.4;
        const r = 0.25 + u * 0.55;
        o.position.set(
          Math.cos(a) * r,
          0.4 + Math.sin(u * Math.PI) * (id === "dino" ? 2.1 : 1.7),
          Math.sin(a) * r,
        );
        o.rotation.set(time * 4 + i, 0, time * 3);
      } else {
        // A helix that climbs around the avatar.
        const a = time * (id === "witch" ? 0.9 : 1.3) + k * Math.PI * 2;
        const y = (time * 0.25 + k) % 1;
        const r = id === "garden" ? 0.55 + Math.sin(y * Math.PI) * 0.3 : 0.7;
        o.position.set(Math.cos(a) * r, 0.25 + y * 1.9, Math.sin(a) * r);
        o.rotation.set(a, a * 0.5, a);
      }
    });
  };
}

export function legendaryMagic(parent: T.Object3D, index: number) {
  const s = legendarySets[index];
  const g = node(parent);
  if (index >= 16) return catalogMagic(g, s);
  if (index >= 10) return laterMagic(g, s.id, s.color, s.accent);
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

function catalogMagic(g: T.Group, s: StyleSet) {
  const { spell, motif } = s.design;
  const power = s.tier === "Premium" ? 1 : s.tier === "Legendary" ? 0.8 : 0.6;
  const satellites: T.Object3D[] = [];
  if (spell === "wings")
    for (const side of [-1, 1])
      for (let i = 0; i < 5; i++)
        part(
          g,
          "oct",
          [side * (0.3 + i * 0.13), 1.28 + i * 0.075, -0.25],
          [0.09, 0.31 - i * 0.027, 0.035],
          i % 2 ? s.accent : s.color,
          { rot: [0, 0, -side * (0.5 + i * 0.1)], glow: power },
        );
  if (spell === "portal")
    for (let i = 0; i < 3; i++)
      part(
        g,
        "ring",
        [0, 1.22, -0.36 - i * 0.025],
        [0.72 + i * 0.08, 0.84 + i * 0.04, 0.07],
        i % 2 ? s.accent : s.color,
        { glow: power },
      );
  if (spell === "runes") {
    for (let i = 0; i < 2; i++)
      part(
        g,
        "ring",
        [0, 0.06 + i * 0.025, 0],
        [0.67 + i * 0.16, 0.67 + i * 0.16, 0.04],
        i ? s.accent : s.color,
        { rot: [Math.PI / 2, 0, 0], glow: power },
      );
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      part(
        g,
        "box",
        [Math.cos(a) * 0.68, 0.1, Math.sin(a) * 0.68],
        [0.07, 0.035, 0.14],
        s.accent,
        { rot: [0, -a, 0], glow: power },
      );
    }
  }
  const shape =
    spell === "orbs"
      ? "ball"
      : spell === "blades" || spell === "flames"
        ? "cone"
        : spell === "petals" || spell === "leaves"
          ? "ball"
          : "oct";
  for (let i = 0; i < 6 + (motif % 4); i++) {
    const o = part(
      g,
      shape,
      [0, 0, 0],
      spell === "blades"
        ? [0.035, 0.28, 0.02]
        : spell === "petals" || spell === "leaves"
          ? [0.055, 0.11, 0.016]
          : [0.055, spell === "crystals" ? 0.16 : 0.08, 0.055],
      i % 2 ? s.accent : s.color,
      { glow: power },
    );
    satellites.push(o);
  }
  return (time: number) =>
    satellites.forEach((o, i) => {
      const a =
        time * (0.35 + (motif % 5) * 0.04) +
        (i * Math.PI * 2) / satellites.length;
      const rise = (time * 0.16 + i / satellites.length) % 1;
      const rising = ["petals", "leaves", "flames", "crystals"].includes(spell);
      const radius = rising ? 0.45 + rise * 0.28 : 0.72;
      o.position.set(
        Math.cos(a) * radius,
        rising ? 0.15 + rise * 1.9 : 1.18 + Math.sin(a * 2) * 0.38,
        Math.sin(a) * radius,
      );
      o.rotation.set(
        spell === "blades" ? 0 : a,
        0,
        spell === "flames" ? Math.sin(a) * 0.2 : a,
      );
    });
}
