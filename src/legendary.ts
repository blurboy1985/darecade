import * as T from "three";
import { legendarySets } from "./collections.ts";
import { part, ball, node } from "./shapes.ts";

// Sets after the first ten have their own headwear, trim and magic, keyed by
// set id. Head coordinates follow headgear.ts (crown at y 1.76, face at +z).
const TOP = 1.76;
function laterHead(g: T.Object3D, id: string, color: string, accent: string) {
  switch (id) {
    case "candy":
      for (const side of [-1, 1]) {
        part(
          g,
          "cyl",
          [side * 0.4, TOP - 0.02, 0.12],
          [0.15, 0.04, 0.15],
          color,
          {
            rot: [Math.PI / 2, 0, 0],
          },
        );
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ball(
            g,
            [
              side * 0.4 + Math.cos(a) * 0.09,
              TOP - 0.02 + Math.sin(a) * 0.09,
              0.15,
            ],
            [0.035, 0.035, 0.015],
            i % 2 ? accent : "#ffffff",
          );
        }
        part(
          g,
          "cyl",
          [side * 0.45, TOP - 0.22, 0.12],
          [0.014, 0.26, 0.014],
          "#ffffff",
          {
            rot: [0, 0, side * 0.25],
          },
        );
      }
      break;
    case "boba":
      ball(g, [-0.04, TOP - 0.04, -0.03], [0.5, 0.15, 0.5], color);
      part(g, "cyl", [0, TOP - 0.12, 0], [0.4, 0.05, 0.42], accent);
      part(g, "cyl", [0.2, TOP + 0.2, 0.05], [0.035, 0.42, 0.035], "#ff8fb1", {
        rot: [0, 0, -0.3],
      });
      for (const [x, z] of [
        [-0.25, 0.15],
        [-0.1, 0.3],
        [-0.3, -0.1],
        [0.05, 0.2],
      ])
        ball(g, [x, TOP + 0.07, z], [0.055, 0.045, 0.055], "#3a2418");
      break;
    case "pixel":
      part(g, "box", [0, TOP - 0.06, 0], [0.62, 0.1, 0.62], accent);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        part(
          g,
          "box",
          [
            Math.round(Math.cos(a)) * 0.26,
            TOP + 0.05 + (i % 2) * 0.1,
            Math.round(Math.sin(a)) * 0.26,
          ],
          [0.1, 0.12 + (i % 2) * 0.2, 0.1],
          accent,
        );
      }
      for (const x of [-0.2, 0, 0.2])
        part(
          g,
          "box",
          [x, TOP - 0.06, 0.32],
          [0.08, 0.08, 0.03],
          x ? color : "#ff5c95",
          {
            glow: 0.8,
          },
        );
      break;
    case "witch": {
      part(g, "cyl", [0, TOP - 0.2, 0], [0.72, 0.03, 0.72], color);
      const cone = node(g, [0, TOP - 0.18, 0]);
      cone.rotation.z = -0.12;
      part(cone, "cone", [0, 0.3, 0], [0.4, 0.6, 0.4], color);
      part(cone, "cone", [0.08, 0.68, 0], [0.13, 0.3, 0.13], color, {
        rot: [0, 0, -0.9],
      });
      part(cone, "cyl", [0, 0.06, 0], [0.4, 0.08, 0.4], accent);
      part(g, "torus", [0.03, TOP - 0.1, 0.4], [0.07, 0.07, 0.1], "#ffe27a", {
        glow: 0.9,
      });
      ball(g, [0.4, TOP + 0.4, 0], [0.05, 0.05, 0.05], "#ffe27a", { glow: 1 });
      break;
    }
    case "garden":
      ball(g, [0, TOP - 0.2, -0.02], [0.48, 0.3, 0.5], color);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const petal = ball(
          g,
          [Math.cos(a) * 0.17, TOP + 0.16, Math.sin(a) * 0.17],
          [0.16, 0.26, 0.1],
          i % 2 ? accent : "#ff8fb8",
        );
        petal.rotation.set(Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5);
      }
      ball(g, [0, TOP + 0.12, 0], [0.1, 0.08, 0.1], "#ffe27a");
      for (const side of [-1, 1]) {
        const leaf = ball(
          g,
          [side * 0.42, TOP - 0.1, 0],
          [0.16, 0.05, 0.09],
          "#5fb86c",
        );
        leaf.rotation.z = -side * 0.5;
      }
      break;
    case "dino":
      ball(g, [0, TOP - 0.2, -0.02], [0.49, 0.32, 0.52], color);
      ball(g, [0, TOP - 0.1, 0.38], [0.3, 0.14, 0.2], color);
      for (const side of [-1, 1]) {
        ball(g, [side * 0.2, TOP + 0.06, 0.3], [0.08, 0.08, 0.06], "#ffffff");
        ball(g, [side * 0.2, TOP + 0.07, 0.35], [0.04, 0.045, 0.02], "#243c45");
        ball(
          g,
          [side * 0.08, TOP - 0.08, 0.57],
          [0.02, 0.02, 0.012],
          "#2c6b55",
        );
        for (let i = 0; i < 3; i++)
          part(
            g,
            "cone",
            [side * (0.08 + i * 0.09), TOP - 0.2, 0.5 - i * 0.02],
            [0.03, 0.07, 0.03],
            "#ffffff",
            { rot: [Math.PI, 0, 0] },
          );
      }
      for (let i = 0; i < 4; i++)
        part(
          g,
          "cone",
          [0, TOP + 0.14 - i * 0.07, 0.05 - i * 0.17],
          [0.07, 0.17, 0.07],
          accent,
          { rot: [-0.25 - i * 0.3, 0, 0] },
        );
      break;
  }
}
function laterBody(g: T.Object3D, id: string, color: string, accent: string) {
  switch (id) {
    case "candy":
      for (const side of [-1, 1]) {
        const loop = ball(
          g,
          [side * 0.12, 1.08, 0.3],
          [0.12, 0.08, 0.05],
          accent,
        );
        loop.rotation.z = side * 0.4;
        ball(g, [side * 0.34, 1.2, 0], [0.13, 0.1, 0.13], color);
      }
      ball(g, [0, 1.08, 0.32], [0.05, 0.05, 0.04], "#ff4d6d");
      for (let i = 0; i < 6; i++)
        ball(
          g,
          [Math.cos(i) * 0.3, 0.72, Math.sin(i) * 0.26],
          [0.045, 0.045, 0.045],
          i % 2 ? accent : "#ffffff",
        );
      break;
    case "boba":
      part(g, "box", [0, 0.86, 0.27], [0.36, 0.42, 0.04], accent);
      part(g, "box", [0, 0.8, 0.3], [0.2, 0.14, 0.02], color);
      for (const side of [-1, 1])
        part(g, "box", [side * 0.14, 1.12, 0.24], [0.05, 0.22, 0.03], color, {
          rot: [0, 0, side * 0.2],
        });
      for (const x of [-0.05, 0, 0.05])
        ball(g, [x, 0.79, 0.32], [0.022, 0.022, 0.012], "#3a2418");
      break;
    case "pixel":
      for (const side of [-1, 1]) {
        part(g, "box", [side * 0.36, 1.2, 0], [0.18, 0.1, 0.2], accent);
        part(g, "box", [side * 0.14, 0.9, 0.28], [0.06, 0.4, 0.03], color);
      }
      for (const [x, y] of [
        [0, 1.02],
        [-0.05, 1.07],
        [0.05, 1.07],
        [0, 0.97],
      ])
        part(g, "box", [x, y, 0.31], [0.05, 0.05, 0.03], "#ff5c95", {
          glow: 0.8,
        });
      break;
    case "witch":
      part(g, "cone", [0, 0.95, -0.08], [0.5, 0.75, 0.4], color, {
        opacity: 0.92,
      });
      part(g, "torus", [0, 1.24, 0.02], [0.24, 0.2, 0.3], accent, {
        rot: [Math.PI / 2, 0, 0],
      });
      part(g, "torus", [0, 1.14, 0.3], [0.06, 0.06, 0.1], "#ffe27a", {
        glow: 0.9,
      });
      for (let i = 0; i < 5; i++)
        part(
          g,
          "oct",
          [
            Math.sin(i * 1.3) * 0.36,
            0.72 + (i % 2) * 0.06,
            -0.28 + Math.cos(i * 1.3) * 0.08,
          ],
          [0.03, 0.05, 0.03],
          "#ffe27a",
          { glow: 1 },
        );
      break;
    case "garden":
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const petal = ball(
          g,
          [Math.cos(a) * 0.3, 0.7, Math.sin(a) * 0.27],
          [0.13, 0.18, 0.05],
          i % 2 ? accent : "#ff8fb8",
        );
        petal.rotation.set(0, -a + Math.PI / 2, 0);
        petal.rotateX(0.6);
      }
      for (const side of [-1, 1]) {
        const leaf = ball(g, [side * 0.3, 1.2, 0], [0.17, 0.05, 0.12], color);
        leaf.rotation.z = -side * 0.4;
      }
      ball(g, [0, 1.1, 0.3], [0.06, 0.06, 0.04], "#ffe27a");
      break;
    case "dino":
      ball(g, [0, 0.9, 0.24], [0.2, 0.26, 0.08], "#f4f7d8");
      for (let i = 0; i < 4; i++)
        part(
          g,
          "cone",
          [0, 1.22 - i * 0.16, -0.3],
          [0.06, 0.14, 0.06],
          accent,
          {
            rot: [-Math.PI / 2 + 0.3, 0, 0],
          },
        );
      part(g, "cone", [0, 0.58, -0.42], [0.13, 0.42, 0.13], color, {
        rot: [-Math.PI / 2 - 0.35, 0, 0],
      });
      break;
  }
}
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

export function legendaryHead(parent: T.Object3D, index: number) {
  const s = legendarySets[index];
  const g = node(parent);
  if (index >= 10) {
    laterHead(g, s.id, s.color, s.accent);
    return g;
  }
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
  if (index >= 10) {
    laterBody(g, s.id, s.color, s.accent);
    return g;
  }
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
