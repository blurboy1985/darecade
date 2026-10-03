// Procedural headgear for KayKit heads. Coordinates are avatar-local at rest:
// the head spans roughly y 0.90–1.78, ±0.44 wide and ±0.47 deep, face at +z.
// Parts are added to the avatar's hat group, which follows the head bone.
import * as T from "three";
import { ball, node, part } from "./shapes.ts";

export type Gear =
  | "cat"
  | "bunny"
  | "fox"
  | "flowers"
  | "party"
  | "beanie"
  | "chef"
  | "grad"
  | "headphones"
  | "propeller"
  | "viking"
  | "tiara"
  | "mushroom"
  | "antlers"
  | "bandana"
  | "straw"
  | "bow";

const TOP = 1.76;
const up = new T.Vector3(0, 1, 0);
function aim(m: T.Object3D, dir: number[]) {
  m.quaternion.setFromUnitVectors(up, new T.Vector3(...dir).normalize());
}

export function buildHeadgear(g: T.Object3D, gear: Gear) {
  switch (gear) {
    case "cat":
    case "fox":
      for (const side of [-1, 1]) {
        const outer = gear === "cat" ? "#4a3f46" : "#e0782f";
        const ear = part(
          g,
          "cone",
          [side * 0.26, TOP + 0.1 + 0.04, 0],
          [0.14, 0.26, 0.08],
          outer,
        );
        aim(ear, [side * 0.45, 1, 0]);
        const inner = part(
          g,
          "cone",
          [side * 0.255, TOP + 0.1 + 0.03, 0.04],
          [0.08, 0.17, 0.03],
          gear === "cat" ? "#f2a9b5" : "#fbf3e4",
        );
        aim(inner, [side * 0.45, 1, 0]);
        if (gear === "fox") {
          const tip = part(
            g,
            "cone",
            [side * 0.33, TOP + 0.1 + 0.16, 0],
            [0.06, 0.09, 0.05],
            "#2d2224",
          );
          aim(tip, [side * 0.45, 1, 0]);
        }
      }
      break;
    case "bunny":
      for (const side of [-1, 1]) {
        const ear = node(g, [side * 0.15, TOP + 0.08 - 0.02, -0.02]);
        ear.rotation.z = -side * 0.18;
        ball(ear, [0, 0.27, 0], [0.085, 0.3, 0.05], "#fbf6f1");
        ball(ear, [0, 0.27, 0.03], [0.05, 0.22, 0.02], "#f4b0bf");
      }
      break;
    case "flowers": {
      part(
        g,
        "torus",
        [0, TOP + 0.07 - 0.12, 0.02],
        [0.43, 0.43, 0.35],
        "#6fa65a",
        { rot: [Math.PI / 2, 0, 0] },
      );
      const colors = ["#ff9db8", "#ffe07a", "#ffffff", "#c4a5ff", "#ffb07a"];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const p = [
          Math.cos(a) * 0.43,
          TOP + 0.07 - 0.1,
          Math.sin(a) * 0.43 + 0.02,
        ];
        ball(g, p, [0.075, 0.05, 0.075], colors[i % colors.length]);
        ball(g, [p[0], p[1] + 0.035, p[2]], [0.03, 0.02, 0.03], "#ffd14a");
      }
      break;
    }
    case "party": {
      const cone = part(
        g,
        "cone",
        [0.1, TOP + 0.1 + 0.17, 0],
        [0.17, 0.4, 0.17],
        "#7fd3ff",
      );
      cone.rotation.z = -0.22;
      for (let i = 0; i < 3; i++)
        part(
          g,
          "torus",
          [0.1 + 0.035 * (i + 0.5), TOP + 0.1 + 0.05 + i * 0.1, 0],
          [0.15 - i * 0.04, 0.15 - i * 0.04, 0.1],
          ["#ff8fb0", "#ffe07a", "#b9f27a"][i],
          { rot: [Math.PI / 2, 0.22, 0] },
        );
      ball(g, [0.19, TOP + 0.1 + 0.39, 0], [0.06, 0.06, 0.06], "#ffe07a");
      break;
    }
    case "beanie":
      ball(g, [0, TOP - 0.18, 0], [0.47, 0.32, 0.5], "#3fa6a0");
      part(g, "cyl", [0, TOP - 0.3, 0], [0.47, 0.12, 0.5], "#2f8580");
      ball(g, [0, TOP + 0.17, 0], [0.1, 0.1, 0.1], "#f5efe4");
      break;
    case "chef":
      part(g, "cyl", [0, TOP + 0.04, 0], [0.32, 0.3, 0.32], "#ffffff");
      for (const [x, z] of [
        [0, 0],
        [0.16, 0.1],
        [-0.16, 0.1],
        [0.12, -0.14],
        [-0.12, -0.14],
      ])
        ball(g, [x, TOP + 0.25, z], [0.22, 0.15, 0.22], "#ffffff");
      break;
    case "grad":
      part(g, "cyl", [0, TOP - 0.04, 0], [0.34, 0.16, 0.36], "#24283a");
      part(g, "box", [0, TOP + 0.06, 0], [0.8, 0.04, 0.8], "#24283a", {
        rot: [0, Math.PI / 4, 0],
      });
      ball(g, [0, TOP + 0.09, 0], [0.04, 0.02, 0.04], "#f2c14e");
      part(g, "cyl", [0.27, TOP - 0.05, 0.27], [0.012, 0.22, 0.012], "#f2c14e");
      ball(g, [0.27, TOP - 0.17, 0.27], [0.03, 0.05, 0.03], "#f2c14e");
      break;
    case "headphones": {
      for (let i = 0; i <= 10; i++) {
        const a = (i / 10) * Math.PI;
        ball(
          g,
          [Math.cos(a) * 0.46, 1.32 + Math.sin(a) * 0.5, -0.02],
          [0.05, 0.05, 0.06],
          "#2c2f3a",
        );
      }
      for (const side of [-1, 1]) {
        part(
          g,
          "cyl",
          [side * 0.47, 1.3, -0.02],
          [0.15, 0.08, 0.15],
          "#ff7a9c",
          { rot: [0, 0, Math.PI / 2] },
        );
        part(g, "cyl", [side * 0.52, 1.3, -0.02], [0.1, 0.03, 0.1], "#ffd1dc", {
          rot: [0, 0, Math.PI / 2],
          glow: 0.3,
        });
      }
      break;
    }
    case "propeller": {
      ball(g, [0, TOP - 0.16, 0], [0.46, 0.3, 0.49], "#ffcf4a");
      ball(g, [0, TOP - 0.16, 0], [0.12, 0.305, 0.497], "#5fb8ff");
      part(g, "box", [0, TOP + 0.08, 0.38], [0.36, 0.03, 0.16], "#ff6b6b");
      part(g, "cyl", [0, TOP + 0.18, 0], [0.02, 0.14, 0.02], "#666a77");
      const spin = node(g, [0, TOP + 0.26, 0], "Spin");
      for (const side of [-1, 1])
        ball(
          spin,
          [side * 0.16, 0, 0],
          [0.17, 0.015, 0.05],
          side > 0 ? "#5fb8ff" : "#ff6b6b",
        );
      break;
    }
    case "viking":
      ball(g, [0, TOP - 0.16, 0], [0.47, 0.32, 0.5], "#9aa3ad");
      part(g, "torus", [0, TOP - 0.26, 0], [0.47, 0.5, 0.4], "#7c6a52", {
        rot: [Math.PI / 2, 0, 0],
      });
      for (const side of [-1, 1]) {
        const horn = part(
          g,
          "cone",
          [side * 0.52, TOP - 0.02, 0],
          [0.09, 0.32, 0.09],
          "#f3e6c8",
        );
        aim(horn, [side, 0.75, 0]);
        const tip = part(
          g,
          "cone",
          [side * 0.66, TOP + 0.16, 0],
          [0.05, 0.16, 0.05],
          "#e8d5ad",
        );
        aim(tip, [side * 0.3, 1, 0]);
      }
      break;
    case "tiara": {
      part(g, "torus", [0, TOP - 0.2, 0.04], [0.44, 0.44, 0.25], "#f2c14e", {
        rot: [Math.PI / 2 - 0.25, 0, 0],
        glow: 0.25,
      });
      const gems = ["#9fe7ff", "#ffb3ec", "#fff19a", "#ffb3ec", "#9fe7ff"];
      gems.forEach((c, i) => {
        const x = (i - 2) * 0.13;
        const s = 0.07 - Math.abs(i - 2) * 0.015;
        part(
          g,
          "oct",
          [
            x,
            TOP - 0.06 - Math.abs(i - 2) * 0.03,
            0.4 - Math.abs(i - 2) * 0.05,
          ],
          [s, s * 1.5, s * 0.6],
          c,
          { glow: 0.8 },
        );
      });
      break;
    }
    case "mushroom":
      ball(g, [0, TOP - 0.06, 0], [0.62, 0.3, 0.62], "#e84d4d");
      ball(g, [0, TOP - 0.16, 0], [0.6, 0.12, 0.6], "#f6e6d0");
      for (const [x, y, z, r] of [
        [0.2, 0.14, 0.25, 0.08],
        [-0.25, 0.12, 0.15, 0.07],
        [0.05, 0.22, -0.1, 0.09],
        [-0.15, 0.1, -0.35, 0.07],
        [0.35, 0.06, -0.2, 0.06],
        [-0.4, 0.02, -0.08, 0.05],
      ])
        ball(g, [x, TOP - 0.06 + y, z], [r, r * 0.5, r], "#ffffff");
      break;
    case "antlers":
      for (const side of [-1, 1]) {
        const main = part(
          g,
          "cyl",
          [side * 0.28, TOP + 0.08, -0.05],
          [0.035, 0.32, 0.035],
          "#8a6a4a",
        );
        aim(main, [side * 0.6, 1, -0.1]);
        for (const [h, out] of [
          [0.12, 0.25],
          [0.22, 0.12],
        ]) {
          const tine = part(
            g,
            "cyl",
            [side * (0.33 + h * 0.6), TOP + 0.02 + h + 0.08, -0.05],
            [0.025, 0.16, 0.025],
            "#9b7a58",
          );
          aim(tine, [side * out, 1, 0.3]);
        }
        ball(g, [side * 0.24, TOP - 0.05, 0], [0.05, 0.04, 0.05], "#7aa65a");
      }
      break;
    case "bandana":
      ball(g, [0, TOP - 0.2, -0.01], [0.47, 0.3, 0.5], "#d64545");
      for (const [x, y, z] of [
        [0.2, 0.0, 0.32],
        [-0.18, 0.05, 0.3],
        [0.32, -0.05, -0.05],
        [-0.3, 0.02, -0.15],
        [0.05, 0.08, -0.3],
      ])
        ball(g, [x, TOP - 0.15 + y, z], [0.035, 0.035, 0.035], "#ffffff");
      ball(g, [0.06, TOP - 0.28, -0.48], [0.08, 0.08, 0.06], "#d64545");
      for (const side of [-1, 1]) {
        const tail = ball(
          g,
          [0.06 + side * 0.08, TOP - 0.42, -0.5],
          [0.06, 0.14, 0.03],
          "#c03a3a",
        );
        tail.rotation.z = side * 0.4;
      }
      break;
    case "straw":
      part(g, "cyl", [0, TOP + 0.12 - 0.12, 0], [0.7, 0.03, 0.7], "#e8c97a");
      part(g, "cyl", [0, TOP + 0.12 + 0.0, 0], [0.38, 0.22, 0.38], "#e8c97a");
      part(g, "cyl", [0, TOP + 0.12 - 0.06, 0], [0.39, 0.07, 0.39], "#e45d5d");
      break;
    case "bow":
      for (const side of [-1, 1]) {
        const loop = ball(
          g,
          [side * 0.2, TOP + 0.08 + 0.02, 0.05],
          [0.2, 0.13, 0.07],
          "#ff7aa8",
        );
        loop.rotation.z = side * 0.35;
        const tail = ball(
          g,
          [side * 0.1, TOP + 0.08 - 0.13, 0.08],
          [0.05, 0.12, 0.03],
          "#ff7aa8",
        );
        tail.rotation.z = side * 0.5;
      }
      ball(g, [0, TOP + 0.08 + 0.01, 0.07], [0.07, 0.07, 0.06], "#e85590");
      break;
  }
}

export function animateHeadgear(g: T.Object3D, t: number) {
  const spin = g.getObjectByName("Spin");
  if (spin) spin.rotation.y = t * 9;
}
