// Set magic is built from accessories: lanterns, blades, umbrellas, teacups.
// Each set names its props and how they move. A prop is baked once into at
// most three shared batches (lit, glowing, glass) and cloned for each avatar.
// Positions are avatar-local: feet at y 0, crown ~1.8, front is +z.
import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { StyleSet } from "./collections.ts";
import type { Spell } from "./style-catalog.ts";

const tau = Math.PI * 2;
function outline(points: number[][], depth = 0.22) {
  const shape = new T.Shape(points.map(([x, y]) => new T.Vector2(x, y)));
  const g = new T.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: false,
    steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  return g;
}
const ring = (n: number, fn: (a: number, i: number) => number[]) =>
  Array.from({ length: n }, (_, i) => fn((i / n) * tau, i));
// Unit shapes: radius or half-width 1, so a piece's scale is its size.
const geo = {
  box: new T.BoxGeometry(1, 1, 1),
  orb: new T.SphereGeometry(1, 8, 6),
  dome: new T.SphereGeometry(1, 8, 3, 0, tau, 0, Math.PI / 2),
  tube: new T.CylinderGeometry(1, 1, 1, 8),
  disc: new T.CylinderGeometry(1, 1, 1, 14),
  hex: new T.CylinderGeometry(1, 1, 1, 6),
  cone: new T.ConeGeometry(1, 1, 8),
  spike: new T.ConeGeometry(1, 1, 4),
  hoop: new T.TorusGeometry(1, 0.09, 4, 16),
  band: new T.TorusGeometry(1, 0.035, 4, 24),
  oct: new T.OctahedronGeometry(1, 0),
  ico: new T.IcosahedronGeometry(1, 0),
  star: outline(
    ring(10, (a, i) => {
      const r = i % 2 ? 0.46 : 1;
      return [Math.sin(a) * r, Math.cos(a) * r];
    }),
  ),
  heart: outline(
    ring(18, (a) => [
      Math.sin(a) ** 3,
      (13 * Math.cos(a) -
        5 * Math.cos(2 * a) -
        2 * Math.cos(3 * a) -
        Math.cos(4 * a)) /
        16,
    ]),
  ),
  moon: outline([
    ...Array.from({ length: 13 }, (_, i) => {
      const a = ((60 + i * 20) * Math.PI) / 180;
      return [Math.cos(a), Math.sin(a)];
    }),
    ...Array.from({ length: 9 }, (_, i) => {
      const a = ((276 - i * 24) * Math.PI) / 180;
      return [0.45 + Math.cos(a) * 0.87, Math.sin(a) * 0.87];
    }),
  ]),
  bolt: outline([
    [0.1, 1],
    [-0.5, -0.1],
    [-0.05, -0.1],
    [-0.3, -1],
    [0.5, 0.25],
    [0.08, 0.25],
    [0.5, 1],
  ]),
  leaf: outline([
    ...Array.from({ length: 5 }, (_, i) => [
      Math.sin((i / 5) * Math.PI) * 0.55,
      -1 + (i / 5) * 2,
    ]),
    ...Array.from({ length: 5 }, (_, i) => [
      -Math.sin((i / 5) * Math.PI) * 0.55,
      1 - (i / 5) * 2,
    ]),
  ]),
  drop: outline([
    [0, 1],
    ...Array.from({ length: 9 }, (_, i) => {
      const a = ((30 - i * 30) * Math.PI) / 180;
      return [Math.cos(a) * 0.6, -0.4 + Math.sin(a) * 0.6];
    }),
  ]),
};
type Shape = keyof typeof geo;
type Finish = "lit" | "glow" | "glass";
const finishes = {
  lit: new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }),
  // Unlit, so a charm reads the same on the day plaza and the night palette.
  glow: new T.MeshBasicMaterial({ vertexColors: true }),
  glass: new T.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.4,
    depthWrite: false,
  }),
};
const light = new T.Vector3(0.35, 0.8, 0.5).normalize();
const normal = new T.Vector3();
type Add = (
  shape: Shape,
  at: number[],
  size: number | number[],
  color: string,
  rot?: number[],
  finish?: Finish,
) => void;
type Build = (add: Add, color: string, accent: string) => void;

const paper = "#fff3df",
  steel = "#d5dbe8",
  wood = "#8b5e3c",
  gold = "#f2c85b",
  ink = "#2c2536",
  white = "#ffffff";
const faceZ = [Math.PI / 2, 0, 0]; // stands a disc up, or lays a hoop down
const lie = [-Math.PI / 2, 0, 0]; // lays an outline flat on the ground

const wing =
  (shape: Shape, side: number): Build =>
  (add, c, a) => {
    for (let i = 0; i < 6; i++)
      add(
        shape,
        [side * (0.14 + i * 0.12), 0.2 - i * 0.03 - i * i * 0.012, -i * 0.006],
        [0.085, 0.36 - i * 0.035, shape === "oct" ? 0.03 : 0.2],
        i % 2 ? a : c,
        [0, 0, -side * (0.5 + i * 0.2)],
        "glow",
      );
    add("box", [side * 0.2, 0.3, 0], [0.4, 0.035, 0.03], a, [
      0,
      0,
      side * 0.25,
    ]);
  };

const props = {
  sword: (add, c, a) => {
    add("box", [0, 0.2, 0], [0.07, 0.6, 0.02], steel);
    add("spike", [0, 0.56, 0], [0.05, 0.13, 0.014], steel);
    add("box", [0, 0.2, 0.012], [0.018, 0.56, 0.006], a, [], "glow");
    add("box", [0, -0.13, 0], [0.24, 0.045, 0.05], c);
    add("tube", [0, -0.24, 0], [0.025, 0.18, 0.025], wood);
    add("oct", [0, -0.36, 0], 0.045, a, [], "glow");
  },
  lance: (add, c, a) => {
    add("tube", [0, -0.12, 0], [0.015, 0.7, 0.015], steel);
    add("spike", [0, 0.4, 0], [0.065, 0.36, 0.03], c, [], "glow");
    add("oct", [0, 0.2, 0], 0.045, a, [], "glow");
  },
  arrow: (add, c, a) => {
    add("tube", [0, 0, 0], [0.012, 0.6, 0.012], wood);
    add("cone", [0, 0.34, 0], [0.045, 0.12, 0.045], a, [], "glow");
    for (const turn of [0, Math.PI / 2])
      add("box", [0, -0.25, 0], [0.09, 0.1, 0.008], c, [0, turn, 0]);
  },
  kunai: (add, c, a) => {
    add("spike", [0, 0.1, 0], [0.06, 0.3, 0.02], steel);
    add("box", [0, 0.1, 0.012], [0.012, 0.22, 0.006], a, [], "glow");
    add("tube", [0, -0.13, 0], [0.018, 0.16, 0.018], c);
    add("hoop", [0, -0.25, 0], 0.04, a, [], "glow");
  },
  shuriken: (add, c, a) => {
    for (let i = 0; i < 4; i++) {
      const t = (i * Math.PI) / 2;
      add(
        "spike",
        [-Math.sin(t) * 0.12, Math.cos(t) * 0.12, 0],
        [0.07, 0.26, 0.02],
        i % 2 ? c : paper,
        [0, 0, t],
      );
    }
    add("tube", [0, 0, 0], [0.055, 0.035, 0.055], a, faceZ, "glow");
  },
  fan: (add, c, a) => {
    for (let i = 0; i < 7; i++) {
      const t = (i - 3) * 0.33;
      add(
        "box",
        [Math.sin(t) * 0.2, Math.cos(t) * 0.2, i * 0.002],
        [0.085, 0.36, 0.012],
        i % 2 ? paper : c,
        [0, 0, -t],
      );
      add(
        "box",
        [Math.sin(t) * 0.36, Math.cos(t) * 0.36, i * 0.002],
        [0.085, 0.03, 0.016],
        a,
        [0, 0, -t],
        "glow",
      );
    }
    add("orb", [0, 0, 0.01], 0.035, gold);
  },
  lantern: (add, c, a) => {
    add("orb", [0, 0, 0], [0.17, 0.2, 0.17], c, [], "glow");
    for (const y of [-0.08, 0.08])
      add("tube", [0, y, 0], [0.162, 0.014, 0.162], a);
    for (const y of [-0.2, 0.2])
      add("tube", [0, y, 0], [0.09, 0.04, 0.09], ink);
    add("hoop", [0, 0.27, 0], 0.055, gold);
    add("box", [0, -0.32, 0], [0.025, 0.2, 0.025], a, [], "glow");
  },
  umbrella: (add, c, a) => {
    add("cone", [0, 0.17, 0], [0.44, 0.3, 0.44], c);
    add("band", [0, 0.045, 0], 0.44, a, faceZ, "glow");
    add("orb", [0, 0.33, 0], 0.03, a, [], "glow");
    add("tube", [0, -0.16, 0], [0.014, 0.5, 0.014], wood);
    add("hoop", [0.04, -0.41, 0], 0.04, gold);
  },
  book: (add, c, a) => {
    for (const side of [-1, 1]) {
      add("box", [side * 0.085, 0, 0], [0.17, 0.22, 0.035], c, [
        0,
        side * 0.2,
        0,
      ]);
      add("box", [side * 0.082, 0, 0.025], [0.145, 0.19, 0.018], paper, [
        0,
        side * 0.2,
        0,
      ]);
    }
    add("box", [0, -0.09, 0.04], [0.025, 0.12, 0.012], a, [], "glow");
  },
  plane: (add, _c, a) => {
    for (const side of [-1, 1])
      add("oct", [side * 0.07, 0, 0], [0.13, 0.018, 0.22], paper, [
        0,
        side * 0.4,
        side * 0.12,
      ]);
    add("box", [0, 0.025, 0], [0.018, 0.07, 0.2], a);
  },
  crystal: (add, c, a) => {
    add("oct", [0, 0, 0], [0.1, 0.26, 0.1], c, [], "glow");
    add("oct", [0.09, -0.1, 0.03], [0.05, 0.13, 0.05], a, [0, 0, -0.4], "glow");
    add(
      "oct",
      [-0.08, -0.12, -0.02],
      [0.04, 0.1, 0.04],
      white,
      [0, 0, 0.5],
      "glow",
    );
  },
  star: (add, c, a) => {
    add("star", [0, 0, 0], [0.2, 0.2, 0.3], c, [], "glow");
    add("star", [0, 0, 0], [0.11, 0.11, 0.4], a, [], "glow");
  },
  moon: (add, c, a) => {
    add("moon", [0, 0, 0], [0.24, 0.24, 0.4], c, [], "glow");
    add("star", [0.1, 0.02, 0], [0.06, 0.06, 0.3], a, [], "glow");
  },
  heart: (add, c, a) => {
    add("heart", [0, 0, 0], [0.17, 0.17, 0.4], c, [], "glow");
    add("heart", [0, 0.01, 0], [0.09, 0.09, 0.5], a, [], "glow");
  },
  bolt: (add, c, a) => {
    add("bolt", [0, 0, 0], [0.14, 0.26, 0.3], c, [], "glow");
    add("bolt", [0, 0, 0], [0.075, 0.15, 0.4], a, [], "glow");
  },
  flame: (add, c, a) => {
    add("drop", [0, 0, 0], [0.14, 0.2, 0.4], c, [], "glow");
    add("drop", [0, 0, 0], [0.14, 0.2, 0.4], c, [0, Math.PI / 2, 0], "glow");
    add("drop", [0, -0.04, 0], [0.075, 0.11, 0.6], a, [], "glow");
  },
  raindrop: (add, c, a) => {
    add("drop", [0, 0, 0], [0.06, 0.1, 0.3], c, [], "glow");
    add("drop", [0, 0, 0], [0.06, 0.1, 0.3], a, [0, Math.PI / 2, 0], "glow");
  },
  leaf: (add, c, a) => {
    add("leaf", [0, 0, 0], [0.12, 0.18, 0.2], c, [], "glow");
    add("box", [0, 0, 0], [0.014, 0.3, 0.06], a, [], "glow");
  },
  flower: (add, c, a) => {
    for (let i = 0; i < 5; i++) {
      const t = (i / 5) * tau;
      add(
        "leaf",
        [-Math.sin(t) * 0.1, Math.cos(t) * 0.1, 0],
        [0.075, 0.11, 0.2],
        c,
        [0, 0, t],
        "glow",
      );
    }
    add("ico", [0, 0, 0], [0.05, 0.05, 0.045], a, [], "glow");
  },
  butterfly: (add, c, a) => {
    for (const side of [-1, 1]) {
      add(
        "leaf",
        [side * 0.09, 0.04, 0],
        [0.085, 0.12, 0.12],
        c,
        [0, 0, -side * 0.9],
        "glow",
      );
      add(
        "leaf",
        [side * 0.07, -0.07, 0],
        [0.06, 0.08, 0.12],
        a,
        [0, 0, -side * 2.2],
        "glow",
      );
    }
    add("tube", [0, 0, 0], [0.012, 0.15, 0.012], ink);
  },
  snowflake: (add, c, a) => {
    for (let i = 0; i < 3; i++)
      add(
        "box",
        [0, 0, 0],
        [0.03, 0.4, 0.02],
        c,
        [0, 0, (i * Math.PI) / 3],
        "glow",
      );
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * tau;
      add(
        "oct",
        [Math.sin(t) * 0.17, Math.cos(t) * 0.17, 0],
        [0.04, 0.04, 0.02],
        a,
        [],
        "glow",
      );
    }
    add("hex", [0, 0, 0], [0.05, 0.03, 0.05], white, faceZ, "glow");
  },
  bubble: (add, c) => {
    add("orb", [0, 0, 0], 0.14, c, [], "glass");
    add("orb", [-0.05, 0.06, 0.09], 0.03, white, [], "glow");
  },
  pearl: (add, c) => {
    add("ico", [0, 0, 0], 0.075, c);
    add("orb", [-0.025, 0.03, 0.05], 0.02, white, [], "glow");
  },
  lollipop: (add, c, a) => {
    add("disc", [0, 0.12, 0], [0.17, 0.05, 0.17], c, faceZ);
    for (const z of [-0.03, 0.03]) {
      add("hoop", [0, 0.12, z], 0.11, a, [], "glow");
      add("disc", [0, 0.12, z], [0.05, 0.012, 0.05], paper, faceZ, "glow");
    }
    add("tube", [0, -0.16, 0], [0.014, 0.38, 0.014], paper);
  },
  cup: (add, c, a) => {
    add("tube", [0, 0.06, 0], [0.118, 0.14, 0.118], paper);
    add("tube", [0, -0.07, 0], [0.12, 0.13, 0.12], c);
    for (let i = 0; i < 5; i++) {
      const t = (i / 5) * tau;
      add("ico", [Math.cos(t) * 0.1, -0.1, Math.sin(t) * 0.1], 0.035, ink);
    }
    add("disc", [0, 0.14, 0], [0.13, 0.025, 0.13], a);
    add("tube", [0.03, 0.26, 0], [0.018, 0.3, 0.018], a, [0, 0, -0.15], "glow");
  },
  teacup: (add, c, a) => {
    add("tube", [0, 0, 0], [0.11, 0.12, 0.11], paper);
    add("disc", [0, 0.058, 0], [0.095, 0.012, 0.095], c, [], "glow");
    add("hoop", [0.13, 0, 0], 0.05, paper);
    add("disc", [0, -0.075, 0], [0.18, 0.02, 0.18], a);
    add("orb", [0.02, 0.17, 0], 0.035, white, [], "glass");
    add("orb", [-0.02, 0.25, 0], 0.028, white, [], "glass");
  },
  potion: (add, c, a) => {
    add("orb", [0, -0.04, 0], 0.115, c, [], "glass");
    add("orb", [0, -0.06, 0], [0.095, 0.075, 0.095], a, [], "glow");
    add("tube", [0, 0.1, 0], [0.035, 0.1, 0.035], paper);
    add("tube", [0, 0.17, 0], [0.042, 0.04, 0.042], wood);
  },
  orb: (add, c, a) => {
    add("orb", [0, 0, 0], 0.13, c, [], "glass");
    add("ico", [0, 0, 0], 0.065, a, [], "glow");
    add("tube", [0, -0.14, 0], [0.08, 0.04, 0.08], gold);
  },
  coin: (add, c) => {
    add("disc", [0, 0, 0], [0.15, 0.035, 0.15], gold, faceZ);
    add("star", [0, 0, 0], [0.085, 0.085, 0.25], c, [], "glow");
  },
  pixelHeart: (add, c, a) => {
    [" ## ## ", "#######", "#######", " ##### ", "  ###  ", "   #   "].forEach(
      (row, y) =>
        [...row].forEach((cell, x) => {
          if (cell === "#")
            add(
              "box",
              [(x - 3) * 0.05, (2.5 - y) * 0.05, 0],
              [0.048, 0.048, 0.05],
              x === 1 && y === 1 ? a : c,
              [],
              "glow",
            );
        }),
    );
  },
  note: (add, c, a) => {
    add("orb", [-0.05, -0.13, 0], [0.085, 0.065, 0.05], c, [0, 0, 0.4], "glow");
    add("box", [0.02, 0.05, 0], [0.025, 0.36, 0.025], c, [], "glow");
    add("box", [0.085, 0.19, 0], [0.13, 0.07, 0.025], a, [0, 0, -0.4], "glow");
  },
  mic: (add, c, a) => {
    add("orb", [0, 0.13, 0], 0.075, steel);
    add("tube", [0, 0.06, 0], [0.05, 0.03, 0.05], a, [], "glow");
    add("tube", [0, -0.08, 0], [0.032, 0.26, 0.032], c);
  },
  lamp: (add, c, a) => {
    add("tube", [0, 0, 0], [0.085, 0.16, 0.085], c);
    add("disc", [0, -0.085, 0], [0.07, 0.02, 0.07], a, [], "glow");
    add("cone", [0, -0.38, 0], [0.17, 0.58, 0.17], white, [], "glass");
    add("hoop", [0, 0.1, 0], 0.05, steel);
  },
  gear: (add, c, a) => {
    add("disc", [0, 0, 0], [0.15, 0.05, 0.15], c, faceZ);
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * tau;
      add(
        "box",
        [Math.sin(t) * 0.17, Math.cos(t) * 0.17, 0],
        [0.06, 0.07, 0.05],
        c,
        [0, 0, -t],
      );
    }
    add("tube", [0, 0, 0], [0.05, 0.07, 0.05], a, faceZ, "glow");
  },
  wrench: (add, c) => {
    add("box", [0, 0, 0], [0.05, 0.34, 0.03], steel);
    add("hoop", [0, 0.21, 0], 0.06, steel);
    add("hex", [0, -0.19, 0], [0.055, 0.03, 0.055], c, faceZ);
  },
  shield: (add, c, a) => {
    add("hex", [0, 0, 0], [0.22, 0.04, 0.27], c, faceZ);
    add("hex", [0, 0, 0.012], [0.16, 0.04, 0.2], a, faceZ, "glow");
    add("star", [0, 0, 0.04], [0.075, 0.075, 0.1], white, [], "glow");
  },
  drone: (add, c, a) => {
    add("box", [0, 0, 0], [0.2, 0.12, 0.14], steel);
    add("orb", [0, 0, 0.075], 0.04, a, [], "glow");
    for (const side of [-1, 1])
      add("box", [side * 0.2, 0, 0], [0.16, 0.02, 0.12], c);
    add("tube", [0, 0.11, 0], [0.01, 0.1, 0.01], ink);
    add("orb", [0, 0.17, 0], 0.022, a, [], "glow");
    add("cone", [0, -0.11, 0], [0.05, 0.1, 0.05], a, [Math.PI, 0, 0], "glow");
  },
  kite: (add, c, a) => {
    add("oct", [0, 0, 0], [0.17, 0.24, 0.015], c);
    add("box", [0, 0, 0.012], [0.012, 0.46, 0.008], a);
    add("box", [0, 0.03, 0.012], [0.32, 0.012, 0.008], a);
    for (let i = 0; i < 3; i++)
      add(
        "oct",
        [i % 2 ? 0.03 : -0.03, -0.32 - i * 0.1, 0],
        [0.04, 0.03, 0.01],
        a,
        [],
        "glow",
      );
  },
  cloud: (add, c) => {
    add("orb", [0, 0, 0], 0.12, white);
    add("orb", [0.13, -0.02, 0], 0.09, white);
    add("orb", [-0.12, -0.03, 0], 0.08, white);
    add("box", [0, -0.09, 0], [0.3, 0.02, 0.1], c, [], "glow");
  },
  mushroom: (add, c, a) => {
    add("tube", [0, -0.07, 0], [0.055, 0.16, 0.055], paper);
    add("dome", [0, 0, 0], [0.16, 0.13, 0.16], c);
    add("disc", [0, 0, 0], [0.155, 0.02, 0.155], paper);
    for (const [x, y, z] of [
      [0.08, 0.08, 0.08],
      [-0.09, 0.06, 0.05],
      [0, 0.12, -0.03],
      [0.02, 0.07, -0.12],
    ])
      add("ico", [x, y, z], 0.032, a, [], "glow");
  },
  shell: (add, c, a) => {
    add("dome", [0, 0, 0], [0.16, 0.07, 0.13], c, [Math.PI, 0, 0]);
    add("disc", [0, 0, 0], [0.15, 0.012, 0.12], a);
    add("dome", [0, 0.045, -0.06], [0.16, 0.07, 0.13], c, [-0.9, 0, 0]);
    add("disc", [0, 0.045, -0.06], [0.15, 0.012, 0.12], a, [-0.9, 0, 0]);
    add("orb", [0, 0.045, 0.02], 0.05, white, [], "glow");
  },
  bone: (add, c) => {
    add("tube", [0, 0, 0], [0.03, 0.3, 0.03], paper, [0, 0, Math.PI / 2]);
    for (const x of [-0.16, 0.16])
      for (const y of [-0.035, 0.035]) add("ico", [x, y, 0], 0.05, paper);
    add("oct", [0, 0.09, 0], 0.035, c, [], "glow");
  },
  crown: (add, c, a) => {
    add("band", [0, 0, 0], 0.3, c, faceZ, "glow");
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * tau;
      add(
        "spike",
        [Math.cos(t) * 0.3, 0.09, Math.sin(t) * 0.3],
        [0.05, i % 2 ? 0.12 : 0.2, 0.05],
        i % 2 ? a : c,
        [],
        "glow",
      );
    }
  },
  sun: (add, c, a) => {
    add("disc", [0, 0, 0], [0.2, 0.04, 0.2], c, faceZ, "glow");
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * tau;
      add(
        "spike",
        [-Math.sin(t) * 0.3, Math.cos(t) * 0.3, 0],
        [0.05, 0.15, 0.02],
        a,
        [0, 0, t],
        "glow",
      );
    }
  },
  portal: (add, c, a) => {
    add("band", [0, 0, 0], 0.62, c, [], "glow");
    add("band", [0, 0, 0.02], 0.52, a, [], "glow");
    add("disc", [0, 0, 0], [0.5, 0.01, 0.5], c, faceZ, "glass");
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * tau;
      add(
        "oct",
        [Math.sin(t) * 0.74, Math.cos(t) * 0.74, 0],
        [0.04, 0.08, 0.02],
        a,
        [0, 0, -t],
        "glow",
      );
    }
  },
  talisman: (add, c, a) => {
    add("box", [0, 0, 0], [0.13, 0.3, 0.012], paper);
    for (const z of [-0.008, 0.008]) {
      add("box", [0, 0.115, z], [0.13, 0.04, 0.006], c);
      add("box", [0, -0.01, z], [0.02, 0.15, 0.006], a, [], "glow");
      add("box", [0, 0.03, z], [0.08, 0.02, 0.006], a, [], "glow");
      add("box", [0, -0.05, z], [0.06, 0.02, 0.006], a, [], "glow");
    }
  },
  seal: (add, c, a) => {
    add("band", [0, 0, 0], 0.78, c, faceZ, "glow");
    add("band", [0, 0.01, 0], 0.56, a, faceZ, "glow");
    for (let i = 0; i < 6; i++) {
      const t = (i / 6) * tau;
      add(
        "box",
        [Math.cos(t) * 0.67, 0, Math.sin(t) * 0.67],
        [0.04, 0.012, 0.15],
        a,
        [0, -t, 0],
        "glow",
      );
      add(
        "oct",
        [Math.cos(t + 0.52) * 0.67, 0, Math.sin(t + 0.52) * 0.67],
        [0.035, 0.012, 0.035],
        c,
        [],
        "glow",
      );
    }
    add("star", [0, 0, 0], [0.44, 0.44, 0.05], c, lie, "glass");
  },
  compass: (add, c, a) => {
    add("band", [0, 0, 0], 0.72, c, faceZ, "glow");
    for (let i = 0; i < 4; i++) {
      const t = (i * Math.PI) / 2;
      add(
        "oct",
        [Math.cos(t) * 0.55, 0.005, Math.sin(t) * 0.55],
        [0.16, 0.025, 0.07],
        a,
        [0, -t, 0],
        "glow",
      );
    }
    add("oct", [0, 0.02, 0.2], [0.05, 0.015, 0.22], "#d9543a", [], "glow");
    add("oct", [0, 0.02, -0.2], [0.05, 0.015, 0.22], paper, [], "glow");
  },
  tail: (add, c, a) => {
    add("cone", [0, 0.36, 0], [0.11, 0.72, 0.1], c, [], "glow");
    add("cone", [0, 0.63, 0], [0.058, 0.26, 0.053], a, [], "glow");
  },
  meteor: (add, c, a) => {
    add("ico", [0, 0, 0], 0.1, c);
    add("oct", [0.05, 0.04, 0.06], 0.04, a, [], "glow");
    add("cone", [0, 0, -0.24], [0.085, 0.38, 0.085], a, faceZ, "glow");
  },
  planet: (add, c, a) => {
    add("orb", [0, 0, 0], 0.12, c);
    add("hoop", [0, 0, 0], 0.2, a, [Math.PI / 2 + 0.4, 0, 0.2], "glow");
    add("ico", [0.22, 0.1, 0], 0.03, white, [], "glow");
  },
  skateboard: (add, c, a) => {
    add("box", [0, 0, 0], [0.14, 0.025, 0.46], c);
    add("box", [0, 0.015, 0], [0.05, 0.006, 0.4], a, [], "glow");
    for (const x of [-0.06, 0.06])
      for (const z of [-0.15, 0.15])
        add("tube", [x, -0.04, z], [0.03, 0.03, 0.03], paper, [
          0,
          0,
          Math.PI / 2,
        ]);
  },
  wingL: wing("leaf", -1),
  wingR: wing("leaf", 1),
  shardWingL: wing("oct", -1),
  shardWingR: wing("oct", 1),
  flameWingL: wing("drop", -1),
  flameWingR: wing("drop", 1),
} satisfies Record<string, Build>;
type Prop = keyof typeof props;

const templates = new Map<string, T.Group>();
function template(prop: Prop, color: string, accent: string) {
  const key = `${prop}|${color}|${accent}`;
  let made = templates.get(key);
  if (made) return made;
  const pieces: { g: T.BufferGeometry; finish: Finish }[] = [];
  props[prop](
    (shape, at, size, tint, rot = [], finish = "lit") => {
      const g = geo[shape].index
        ? geo[shape].toNonIndexed()
        : geo[shape].clone();
      g.deleteAttribute("uv");
      const s = typeof size === "number" ? [size, size, size] : size;
      g.applyMatrix4(
        new T.Matrix4().compose(
          new T.Vector3(at[0], at[1], at[2]),
          new T.Quaternion().setFromEuler(
            new T.Euler(rot[0] ?? 0, rot[1] ?? 0, rot[2] ?? 0),
          ),
          new T.Vector3(s[0], s[1], s[2]),
        ),
      );
      const normals = g.getAttribute("normal");
      const colors = new Float32Array(normals.count * 3);
      const base = new T.Color(tint);
      for (let i = 0; i < normals.count; i++) {
        // Unlit finishes carry a little baked shading so facets still read.
        const shade =
          finish === "lit"
            ? 1
            : 0.78 +
              0.3 *
                Math.max(0, normal.fromBufferAttribute(normals, i).dot(light));
        colors.set([base.r * shade, base.g * shade, base.b * shade], i * 3);
      }
      g.setAttribute("color", new T.BufferAttribute(colors, 3));
      pieces.push({ g, finish });
    },
    color,
    accent,
  );
  made = new T.Group();
  for (const finish of ["lit", "glow", "glass"] as const) {
    const list = pieces.filter((p) => p.finish === finish).map((p) => p.g);
    if (!list.length) continue;
    const merged = mergeGeometries(list);
    list.forEach((g) => g.dispose());
    if (!merged) throw Error("Magic props must share geometry attributes");
    const mesh = new T.Mesh(merged, finishes[finish]);
    mesh.name = "MagicProp";
    mesh.castShadow = finish === "lit";
    mesh.userData.sharedCosmeticGeometry = true;
    if (finish === "glass") mesh.renderOrder = 4;
    made.add(mesh);
  }
  templates.set(key, made);
  return made;
}

type Move =
  | "orbit" // circle the body; tilt leans the ring
  | "back" // fanned out behind the shoulders
  | "wings" // a left and right prop that flap
  | "rise" // spiral up from the feet
  | "fall" // drift down from above the head
  | "ground" // lie under the feet and turn
  | "float" // hover beside the shoulders
  | "over" // hover above the head
  | "fountain"; // burst up and arc back down
type Turn =
  | "out" // face away from the body
  | "along" // nose along the path
  | "bank" // along the path, rolled so a flat prop shows its top
  | "front" // keep facing forward with a slow sway
  | "spin"
  | "tumble"
  | "wheel" // face out and spin like a thrown disc
  | "down"; // face out, point at the ground
type Entry = {
  prop: Prop;
  move: Move;
  n?: number;
  size?: number;
  r?: number;
  y?: number;
  speed?: number;
  tilt?: number;
  turn?: Turn;
  /** Swap the two colours on every other prop. */
  swap?: boolean;
  /** Lead with the set's accent colour. */
  flip?: boolean;
};
export type Dust =
  | "glow"
  | "star"
  | "heart"
  | "petal"
  | "flake"
  | "note"
  | "leaf"
  | "bubble";
type Recipe = { dust: Dust; props: Entry[] };

const frac = (v: number) => v - Math.floor(v);
function place(e: Entry, o: T.Object3D, i: number, n: number, t: number) {
  const size = e.size ?? 1;
  const speed = e.speed ?? 1;
  o.scale.setScalar(size);
  if (e.move === "orbit") {
    const a =
      t * 0.6 * speed +
      (i / n) * tau +
      (n % 2 ? -Math.PI / 2 : n % 4 ? 0 : Math.PI / n);
    const r = e.r ?? 0.72;
    o.position.set(
      Math.cos(a) * r,
      (e.y ?? 1.15) +
        Math.sin(a) * (e.tilt ?? 0) +
        Math.sin(t * 1.4 + i * 2.1) * 0.05,
      Math.sin(a) * r,
    );
    const turn = e.turn ?? "out";
    if (turn === "tumble") o.rotation.set(t * 1.3 + i, t * 0.9 + i * 2, 0);
    else
      o.rotation.set(
        0,
        turn === "spin"
          ? t * 2 + i
          : turn === "front"
            ? Math.sin(t * 0.6 + i) * 0.5
            : turn === "along" || turn === "bank"
              ? -a
              : Math.PI / 2 - a,
        turn === "wheel"
          ? t * 4 + i
          : turn === "down"
            ? Math.PI
            : turn === "bank"
              ? 0.7
              : 0,
      );
  } else if (e.move === "back") {
    const a = n > 1 ? (i / (n - 1) - 0.5) * (e.tilt ?? 1.7) : 0;
    const r = e.r ?? 0;
    o.position.set(
      Math.sin(a) * r,
      (e.y ?? 1.1) + Math.cos(a) * r,
      -0.42 - Math.abs(a) * 0.03,
    );
    o.rotation.set(
      0,
      0,
      -a +
        Math.sin(t * 1.5 * speed + i) * 0.06 +
        (e.turn === "wheel" ? t * 0.5 * (i % 2 ? -1 : 1) : 0),
    );
  } else if (e.move === "wings") {
    const side = i ? 1 : -1;
    o.position.set(side * 0.13, e.y ?? 1.2, -0.3);
    o.rotation.set(0, side * (0.15 + Math.sin(t * 3 * speed) * 0.22), 0);
  } else if (e.move === "rise" || e.move === "fall") {
    const u = frac(t * 0.2 * speed + i / n);
    const a = i * 2.4 + t * 0.5;
    const r = (e.r ?? 0.6) * (0.75 + 0.25 * Math.sin(u * Math.PI));
    o.position.set(
      Math.cos(a) * r + (e.move === "fall" ? Math.sin(t * 1.5 + i) * 0.08 : 0),
      e.move === "rise" ? 0.15 + u * 2.05 : 2.35 - u * 2.2,
      Math.sin(a) * r,
    );
    o.scale.setScalar(size * Math.min(1, Math.sin(u * Math.PI) * 2.4 + 0.02));
    if (e.turn === "tumble") o.rotation.set(t * 1.3 + i, t * 0.9 + i * 2, 0);
    else
      o.rotation.set(
        0,
        t * 0.8 + i,
        e.move === "fall" ? Math.sin(t * 2 + i) * 0.5 : 0,
      );
  } else if (e.move === "ground") {
    o.position.set(0, e.y ?? 0.04, 0);
    o.rotation.set(0, t * 0.2 * speed, 0);
  } else if (e.move === "float") {
    o.position.set(
      (i % 2 ? -1 : 1) * (e.r ?? 0.62),
      (e.y ?? 1.6) - (i % 2) * 0.1 + Math.sin(t * 1.6 + i * 2) * 0.06,
      0.08,
    );
    o.rotation.set(
      0,
      Math.sin(t * 0.8 + i) * 0.4,
      Math.sin(t * 1.1 + i) * 0.08,
    );
  } else if (e.move === "over") {
    o.position.set(0, (e.y ?? 2.25) + Math.sin(t * 1.5) * 0.04, 0);
    o.rotation.set(e.tilt ?? 0, t * 0.5 * speed, 0);
  } else {
    const u = frac(t * 0.6 * speed + i / n);
    const a = i * 2.4;
    const r = 0.25 + u * 0.55;
    o.position.set(
      Math.cos(a) * r,
      0.4 + Math.sin(u * Math.PI) * 1.7,
      Math.sin(a) * r,
    );
    o.rotation.set(t * 4 + i, 0, t * 3);
  }
}

const recipes: Record<string, Recipe> = {
  solar: {
    dust: "star",
    props: [
      { prop: "flameWingL", move: "wings" },
      { prop: "sun", move: "over", size: 0.9, y: 2.3 },
    ],
  },
  moon: {
    dust: "star",
    props: [
      { prop: "moon", move: "orbit", n: 3, tilt: 0.3, y: 1.25 },
      {
        prop: "crystal",
        move: "orbit",
        n: 4,
        r: 0.38,
        y: 2.1,
        size: 0.5,
        speed: -1.4,
      },
    ],
  },
  storm: {
    dust: "glow",
    props: [
      { prop: "sword", move: "back", n: 5, r: 0.6, y: 1, tilt: 2.1, size: 1.3 },
      {
        prop: "bolt",
        move: "orbit",
        n: 3,
        size: 0.8,
        tilt: 0.25,
        turn: "spin",
      },
    ],
  },
  sakura: {
    dust: "petal",
    props: [
      {
        prop: "tail",
        move: "back",
        n: 9,
        y: 0.7,
        tilt: 2.5,
        size: 1.6,
        swap: true,
      },
      { prop: "flower", move: "fall", n: 5, size: 0.8 },
    ],
  },
  nova: {
    dust: "glow",
    props: [
      { prop: "drone", move: "orbit", n: 3, tilt: 0.3, y: 1.35, turn: "along" },
      { prop: "planet", move: "over", size: 0.9, y: 2.3 },
    ],
  },
  abyss: {
    dust: "glow",
    props: [
      { prop: "portal", move: "back", y: 1.2 },
      {
        prop: "crystal",
        move: "orbit",
        n: 4,
        size: 0.8,
        speed: 0.7,
        turn: "tumble",
      },
    ],
  },
  tide: {
    dust: "bubble",
    props: [
      { prop: "shell", move: "float", n: 2, y: 1.55 },
      { prop: "pearl", move: "rise", n: 7, r: 0.62 },
    ],
  },
  phoenix: {
    dust: "glow",
    props: [
      { prop: "flameWingL", move: "wings", size: 1.1 },
      { prop: "flame", move: "rise", n: 5, r: 0.55, speed: 1.4 },
    ],
  },
  frost: {
    dust: "flake",
    props: [
      { prop: "shardWingL", move: "wings", speed: 0.7 },
      {
        prop: "snowflake",
        move: "orbit",
        n: 5,
        r: 0.38,
        y: 2.1,
        size: 0.55,
        turn: "wheel",
      },
    ],
  },
  galaxy: {
    dust: "note",
    props: [
      { prop: "mic", move: "float", n: 1, y: 1.45 },
      { prop: "note", move: "orbit", n: 4, tilt: 0.25, swap: true },
      {
        prop: "star",
        move: "orbit",
        n: 5,
        r: 0.38,
        y: 2.1,
        size: 0.5,
        speed: -1.5,
        turn: "spin",
      },
    ],
  },
  candy: {
    dust: "heart",
    props: [
      { prop: "lollipop", move: "orbit", n: 3, swap: true },
      { prop: "heart", move: "rise", n: 4, size: 0.6, r: 0.45 },
    ],
  },
  boba: {
    dust: "bubble",
    props: [
      { prop: "cup", move: "orbit", n: 3, y: 1.2 },
      { prop: "pearl", move: "rise", n: 6, r: 0.45, size: 0.8 },
    ],
  },
  pixel: {
    dust: "star",
    props: [
      { prop: "coin", move: "fountain", n: 8, size: 0.8 },
      { prop: "pixelHeart", move: "float", n: 2, y: 1.75, size: 0.8 },
    ],
  },
  witch: {
    dust: "star",
    props: [
      { prop: "seal", move: "ground" },
      { prop: "potion", move: "orbit", n: 3, y: 1.25, swap: true },
      { prop: "moon", move: "over", size: 0.8, y: 2.35 },
    ],
  },
  garden: {
    dust: "petal",
    props: [
      { prop: "flower", move: "rise", n: 6, flip: true },
      {
        prop: "butterfly",
        move: "orbit",
        n: 3,
        y: 1.6,
        tilt: 0.2,
        turn: "along",
      },
    ],
  },
  dino: {
    dust: "star",
    props: [
      { prop: "bone", move: "orbit", n: 4, turn: "tumble" },
      { prop: "star", move: "fountain", n: 6, size: 0.6 },
    ],
  },
  "jade-fist": {
    dust: "glow",
    props: [
      { prop: "seal", move: "ground" },
      { prop: "talisman", move: "orbit", n: 5, y: 1.2 },
    ],
  },
  "maple-knight": {
    dust: "leaf",
    props: [
      { prop: "shield", move: "orbit", n: 3, y: 1.15 },
      { prop: "leaf", move: "fall", n: 7, swap: true },
    ],
  },
  "volt-tamer": {
    dust: "glow",
    props: [
      { prop: "bolt", move: "orbit", n: 5, tilt: 0.35, turn: "spin" },
      { prop: "pearl", move: "float", n: 2, size: 1.3, y: 1.7 },
    ],
  },
  "astral-ranger": {
    dust: "star",
    props: [
      {
        prop: "arrow",
        move: "back",
        n: 5,
        r: 0.6,
        y: 1.05,
        tilt: 2.2,
        size: 1.4,
      },
      { prop: "star", move: "orbit", n: 5, tilt: 0.4, size: 0.7, turn: "spin" },
    ],
  },
  "aegis-prime": {
    dust: "star",
    props: [
      { prop: "wingL", move: "wings" },
      { prop: "shield", move: "orbit", n: 3, y: 1.1 },
    ],
  },
  "eclipse-vanguard": {
    dust: "glow",
    props: [
      { prop: "portal", move: "back", y: 1.2, size: 1.1 },
      { prop: "moon", move: "orbit", n: 3, tilt: 0.3, size: 0.8 },
    ],
  },
  "crystal-valkyrie": {
    dust: "flake",
    props: [
      { prop: "lance", move: "back", n: 6, r: 0.5, y: 0.95, tilt: 2 },
      {
        prop: "crystal",
        move: "orbit",
        n: 5,
        r: 0.38,
        y: 2.1,
        size: 0.5,
        turn: "spin",
      },
    ],
  },
  "dragon-emperor": {
    dust: "glow",
    props: [
      { prop: "seal", move: "ground", speed: 2 },
      { prop: "flame", move: "orbit", n: 6, y: 1.1, turn: "spin" },
      { prop: "crown", move: "over", y: 2.12, size: 0.8 },
    ],
  },
  "celestial-idol": {
    dust: "star",
    props: [
      { prop: "lamp", move: "float", n: 2, y: 2.2, r: 0.55 },
      {
        prop: "star",
        move: "orbit",
        n: 5,
        tilt: 0.35,
        size: 0.8,
        turn: "spin",
      },
    ],
  },
  "oni-dancer": {
    dust: "petal",
    props: [
      { prop: "fan", move: "orbit", n: 4, y: 1.2, swap: true },
      { prop: "lantern", move: "float", n: 2, y: 1.95, size: 0.7 },
    ],
  },
  "arcane-librarian": {
    dust: "star",
    props: [
      { prop: "book", move: "orbit", n: 4, y: 1.3, tilt: 0.2 },
      { prop: "talisman", move: "rise", n: 5, size: 0.6, turn: "tumble" },
    ],
  },
  "neo-paladin": {
    dust: "glow",
    props: [
      { prop: "drone", move: "orbit", n: 3, y: 1.4, turn: "along" },
      { prop: "crown", move: "over", y: 2.12, size: 0.75 },
    ],
  },
  "rose-duelist": {
    dust: "petal",
    props: [
      {
        prop: "sword",
        move: "back",
        n: 2,
        r: 0.45,
        y: 1.1,
        tilt: 1.5,
        size: 1.5,
      },
      { prop: "flower", move: "fall", n: 8, size: 0.8 },
    ],
  },
  "aurora-oracle": {
    dust: "glow",
    props: [
      { prop: "orb", move: "float", n: 2, y: 1.5 },
      {
        prop: "star",
        move: "orbit",
        n: 6,
        tilt: 0.45,
        size: 0.6,
        turn: "spin",
        swap: true,
      },
    ],
  },
  "void-assassin": {
    dust: "glow",
    props: [
      { prop: "kunai", move: "orbit", n: 6, y: 1.3, turn: "down" },
      {
        prop: "shuriken",
        move: "orbit",
        n: 3,
        r: 0.38,
        y: 2.1,
        size: 0.6,
        speed: -2,
        turn: "wheel",
      },
    ],
  },
  "star-forged": {
    dust: "star",
    props: [
      { prop: "crown", move: "over", y: 2.12 },
      { prop: "meteor", move: "orbit", n: 3, tilt: 0.4, y: 1.3, turn: "along" },
    ],
  },
  "ember-champion": {
    dust: "glow",
    props: [
      { prop: "sun", move: "back", y: 1.3, size: 2, turn: "wheel" },
      { prop: "flame", move: "rise", n: 5, speed: 1.3 },
    ],
  },
  "moon-garden": {
    dust: "petal",
    props: [
      { prop: "moon", move: "over", y: 2.4 },
      { prop: "lantern", move: "float", n: 1, y: 1.5, size: 0.8 },
      { prop: "flower", move: "fall", n: 6, size: 0.7 },
    ],
  },
  "thunder-regent": {
    dust: "glow",
    props: [
      { prop: "seal", move: "ground", speed: 1.5 },
      { prop: "bolt", move: "fall", n: 5, r: 0.55, speed: 2.5 },
      { prop: "talisman", move: "orbit", n: 4, r: 0.4, y: 2.1, size: 0.5 },
    ],
  },
  "ocean-dreamer": {
    dust: "bubble",
    props: [
      { prop: "bubble", move: "rise", n: 7, swap: true },
      { prop: "shell", move: "float", n: 2, y: 1.5 },
    ],
  },
  "prism-tamer": {
    dust: "star",
    props: [
      {
        prop: "crystal",
        move: "orbit",
        n: 5,
        tilt: 0.4,
        y: 1.25,
        turn: "tumble",
        swap: true,
      },
      {
        prop: "star",
        move: "orbit",
        n: 4,
        r: 0.38,
        y: 2.1,
        size: 0.5,
        speed: -1.5,
        turn: "spin",
      },
    ],
  },
  "clockwork-bard": {
    dust: "note",
    props: [
      {
        prop: "gear",
        move: "back",
        n: 3,
        r: 0.42,
        y: 0.95,
        tilt: 1.5,
        size: 1.5,
        turn: "wheel",
      },
      { prop: "note", move: "orbit", n: 4, tilt: 0.25, swap: true },
    ],
  },
  "world-tree": {
    dust: "leaf",
    props: [
      { prop: "leaf", move: "rise", n: 7, swap: true },
      {
        prop: "butterfly",
        move: "orbit",
        n: 3,
        y: 1.7,
        tilt: 0.2,
        turn: "along",
      },
    ],
  },
  "infinity-captain": {
    dust: "star",
    props: [
      { prop: "planet", move: "orbit", n: 3, tilt: 0.4, y: 1.3, swap: true },
      {
        prop: "star",
        move: "orbit",
        n: 5,
        r: 0.38,
        y: 2.1,
        size: 0.5,
        speed: -1.5,
        turn: "spin",
      },
    ],
  },
  "rookie-hero": {
    dust: "star",
    props: [{ prop: "star", move: "orbit", n: 3, tilt: 0.3, turn: "spin" }],
  },
  "dojo-student": {
    dust: "glow",
    props: [{ prop: "talisman", move: "orbit", n: 4, y: 1.2 }],
  },
  "forest-scout": {
    dust: "leaf",
    props: [
      { prop: "lantern", move: "float", n: 1, y: 1.5, size: 0.8 },
      { prop: "leaf", move: "fall", n: 4 },
    ],
  },
  "apprentice-mage": {
    dust: "bubble",
    props: [
      { prop: "potion", move: "float", n: 1, y: 1.6 },
      { prop: "bubble", move: "rise", n: 5 },
    ],
  },
  "pocket-trainer": {
    dust: "heart",
    props: [
      {
        prop: "heart",
        move: "orbit",
        n: 4,
        tilt: 0.25,
        turn: "front",
        swap: true,
      },
    ],
  },
  "city-ninja": {
    dust: "glow",
    props: [{ prop: "shuriken", move: "orbit", n: 4, y: 1.25, turn: "wheel" }],
  },
  "sky-courier": {
    dust: "star",
    props: [
      {
        prop: "plane",
        move: "orbit",
        n: 4,
        tilt: 0.3,
        y: 1.4,
        size: 1.3,
        turn: "bank",
      },
    ],
  },
  "festival-star": {
    dust: "petal",
    props: [
      { prop: "fan", move: "float", n: 2, y: 1.5, size: 0.9 },
      { prop: "flower", move: "fall", n: 5, size: 0.7 },
    ],
  },
  "mushroom-knight": {
    dust: "glow",
    props: [{ prop: "mushroom", move: "orbit", n: 4, y: 1.1, swap: true }],
  },
  "moon-student": {
    dust: "star",
    props: [
      { prop: "seal", move: "ground" },
      { prop: "book", move: "float", n: 1, y: 1.55 },
    ],
  },
  "ocean-scout": {
    dust: "bubble",
    props: [
      { prop: "shell", move: "orbit", n: 3, y: 1.1 },
      { prop: "bubble", move: "rise", n: 4, size: 0.8 },
    ],
  },
  "arcade-rookie": {
    dust: "star",
    props: [
      { prop: "pixelHeart", move: "orbit", n: 3, y: 1.4, size: 0.8 },
      { prop: "coin", move: "fountain", n: 4, size: 0.7 },
    ],
  },
  "cloud-pilot": {
    dust: "glow",
    props: [
      { prop: "kite", move: "float", n: 2, y: 2, r: 0.7 },
      { prop: "cloud", move: "orbit", n: 3, y: 0.9, speed: 0.5 },
    ],
  },
  "starlight-squire": {
    dust: "star",
    props: [
      { prop: "shield", move: "float", n: 1, y: 1.3 },
      {
        prop: "star",
        move: "orbit",
        n: 5,
        r: 0.38,
        y: 2.1,
        size: 0.5,
        turn: "spin",
      },
    ],
  },
  "tea-alchemist": {
    dust: "leaf",
    props: [
      { prop: "teacup", move: "orbit", n: 3, y: 1.25, turn: "along" },
      { prop: "leaf", move: "rise", n: 4, size: 0.6 },
    ],
  },
  "sunset-skater": {
    dust: "star",
    props: [
      {
        prop: "skateboard",
        move: "orbit",
        n: 2,
        y: 0.45,
        size: 1.4,
        turn: "bank",
        speed: 2,
      },
      { prop: "bolt", move: "float", n: 2, y: 1.7, size: 0.7 },
    ],
  },
  "garden-prince": {
    dust: "petal",
    props: [
      { prop: "flower", move: "orbit", n: 5, tilt: 0.35, y: 1.25, swap: true },
      { prop: "butterfly", move: "float", n: 2, y: 1.95, size: 0.9 },
    ],
  },
  "snow-traveller": {
    dust: "flake",
    props: [
      { prop: "snowflake", move: "fall", n: 6, size: 0.8 },
      { prop: "lantern", move: "float", n: 1, y: 1.4, size: 0.75 },
    ],
  },
  "little-mechanic": {
    dust: "glow",
    props: [
      { prop: "gear", move: "orbit", n: 3, y: 1.2, turn: "wheel" },
      { prop: "wrench", move: "float", n: 2, y: 1.8 },
    ],
  },
  "music-club": {
    dust: "note",
    props: [
      { prop: "note", move: "orbit", n: 5, tilt: 0.3, swap: true },
      { prop: "mic", move: "float", n: 1, y: 1.5 },
    ],
  },
  "after-school-circuit": {
    dust: "star",
    props: [
      { prop: "drone", move: "float", n: 1, y: 1.75 },
      { prop: "star", move: "orbit", n: 4, tilt: 0.3, size: 0.7, turn: "spin" },
    ],
  },
  "rainshield-guardian": {
    dust: "glow",
    props: [
      { prop: "umbrella", move: "over", y: 2.3, tilt: 0.45 },
      { prop: "shield", move: "orbit", n: 3, y: 1.1 },
      { prop: "raindrop", move: "fall", n: 5, r: 0.75, speed: 2 },
    ],
  },
  "monsoon-wayfinder": {
    dust: "glow",
    props: [
      { prop: "compass", move: "ground" },
      { prop: "lantern", move: "float", n: 1, y: 1.5, size: 0.8 },
    ],
  },
  "moonbell-society": {
    dust: "star",
    props: [
      {
        prop: "book",
        move: "orbit",
        n: 2,
        y: 1.2,
        tilt: 0.25,
        speed: 0.7,
        turn: "front",
      },
    ],
  },
  "canal-otter-club": {
    dust: "bubble",
    props: [
      { prop: "shell", move: "float", n: 2, y: 1.45 },
      { prop: "bubble", move: "rise", n: 5 },
    ],
  },
  "void-deck-weekend": {
    dust: "glow",
    props: [
      {
        prop: "plane",
        move: "orbit",
        n: 3,
        tilt: 0.25,
        y: 1.2,
        size: 1.3,
        turn: "bank",
        speed: 0.7,
      },
    ],
  },
};
// A set added without a recipe still gets a prop that suits its spell.
const bySpell: Record<Spell, Recipe> = {
  wings: { dust: "star", props: [{ prop: "wingL", move: "wings" }] },
  blades: {
    dust: "glow",
    props: [{ prop: "sword", move: "back", n: 4, r: 0.5, y: 0.95 }],
  },
  runes: { dust: "glow", props: [{ prop: "seal", move: "ground" }] },
  stars: {
    dust: "star",
    props: [{ prop: "star", move: "orbit", n: 4, turn: "spin" }],
  },
  petals: { dust: "petal", props: [{ prop: "flower", move: "fall", n: 6 }] },
  orbs: { dust: "bubble", props: [{ prop: "bubble", move: "rise", n: 5 }] },
  flames: { dust: "glow", props: [{ prop: "flame", move: "rise", n: 5 }] },
  crystals: {
    dust: "flake",
    props: [{ prop: "crystal", move: "orbit", n: 4 }],
  },
  leaves: { dust: "leaf", props: [{ prop: "leaf", move: "fall", n: 6 }] },
  portal: { dust: "glow", props: [{ prop: "portal", move: "back", y: 1.2 }] },
};
const recipeFor = (set: StyleSet) =>
  recipes[set.id] ?? bySpell[set.design.spell];
export const setMagicDust = (set: StyleSet) => recipeFor(set).dust;

/** Adds the set's accessories to the group and returns their animation. */
export function setMagic(group: T.Object3D, set: StyleSet) {
  const moving = recipeFor(set).props.map((entry) => {
    const n = entry.move === "wings" ? 2 : (entry.n ?? 1);
    const objects = Array.from({ length: n }, (_, i) => {
      // The right wing is the "…R" prop of the same family.
      const prop =
        entry.move === "wings" && i
          ? (entry.prop.replace(/L$/, "R") as Prop)
          : entry.prop;
      const swapped = !!entry.flip !== (!!entry.swap && i % 2 === 1);
      const object = template(
        prop,
        swapped ? set.accent : set.color,
        swapped ? set.color : set.accent,
      ).clone();
      group.add(object);
      return object;
    });
    return { entry, objects };
  });
  return (time: number) => {
    for (const { entry, objects } of moving)
      objects.forEach((object, i) =>
        place(entry, object, i, objects.length, time),
      );
  };
}
