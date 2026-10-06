import { mergeCosmeticParts } from "./cosmetic-meshes.ts";
import * as T from "three";
import { node, part } from "./shapes.ts";

// Visual remaps only: these numeric items have existed since save version 1.
export const starterClasses = [
  {
    clothing: 1,
    hair: 5,
    name: "Lantern Mage",
    color: "#8b46db",
    prop: "staff",
  },
  {
    clothing: 3,
    hair: 6,
    name: "Dawn Warrior",
    color: "#de6741",
    prop: "sword",
  },
  {
    clothing: 5,
    hair: 4,
    name: "Orchard Archer",
    color: "#219f80",
    prop: "bow",
  },
  {
    clothing: 7,
    hair: 25,
    name: "Coral Pirate",
    color: "#ce3668",
    prop: "cutlass",
  },
  {
    clothing: 6,
    hair: 0,
    name: "Velvet Thief",
    color: "#5e51bb",
    prop: "daggers",
  },
] as const;
export function classFor(clothing: number) {
  return starterClasses.find((c) => c.clothing === clothing);
}
const gold = "#ffda76";
function blade(
  g: T.Object3D,
  x: number,
  y: number,
  z: number,
  scale: number,
  tilt: number,
) {
  const sword = node(g, [x, y, z]);
  sword.rotation.z = tilt;
  part(
    sword,
    "box",
    [0, 0.24 * scale, 0],
    [0.15 * scale, 0.72 * scale, 0.055 * scale],
    "#d4ecff",
  );
  part(
    sword,
    "cone",
    [0, 0.65 * scale, 0],
    [0.075 * scale, 0.14 * scale, 0.035 * scale],
    "#f2fcff",
  );
  part(
    sword,
    "box",
    [0, -0.15 * scale, 0],
    [0.35 * scale, 0.075 * scale, 0.09 * scale],
    gold,
  );
  part(
    sword,
    "cyl",
    [0, -0.28 * scale, 0],
    [0.045 * scale, 0.22 * scale, 0.045 * scale],
    "#59405f",
  );
}
const costumeCache = new Map<string, T.Group>();
export function buildClassBody(
  parent: T.Object3D,
  clothing: number,
  legendary: boolean,
) {
  const c = classFor(clothing);
  if (!c && !legendary) return;
  const key = `${clothing}:${legendary}`;
  const cached = costumeCache.get(key);
  if (cached) {
    parent.add(cached.clone());
    return;
  }
  const g = node(parent);
  g.scale.setScalar(1 / 0.82);
  const color = c?.color ?? "#6542cb";
  const backColor =
    c?.prop === "staff"
      ? "#ffd260"
      : c?.prop === "sword"
        ? "#3152b9"
        : c?.prop === "bow"
          ? "#f4c052"
          : c?.prop === "cutlass"
            ? "#31b8c5"
            : c?.prop === "daggers"
              ? "#ff649e"
              : "#51e8e0";
  const cape = node(g, [0, 1.08, -0.27], "SwayCape");
  // The entire garment is behind the back, flaring toward negative z.
  for (let i = -2; i <= 2; i++) {
    const panel = part(
      cape,
      "box",
      [i * 0.14, -0.35, -0.1 - Math.abs(i) * 0.025],
      [0.15, 0.82, 0.045],
      backColor,
      { rot: [0.2, 0, -i * 0.05] },
    );
    if (legendary)
      part(panel, "oct", [0, -0.12, -1], [0.3, 0.07, 0.5], gold, { glow: 0.6 });
  }
  if (c?.prop === "staff") {
    part(g, "cone", [0, 0.49, 0], [0.3, 0.92, 0.23], color);
    part(g, "cyl", [0.43, 0.94, -0.48], [0.034, 1.6, 0.034], gold, {
      rot: [0, 0, -0.1],
    });
    part(g, "oct", [0.52, 1.83, -0.48], [0.16, 0.22, 0.16], "#6ffce7", {
      glow: 0.8,
    });
    part(g, "torus", [0.52, 1.83, -0.48], [0.22, 0.22, 0.22], gold);
  } else if (c?.prop === "sword") {
    for (const side of [-1, 1])
      part(g, "ball", [side * 0.27, 0.95, 0], [0.2, 0.16, 0.19], color);
    part(g, "box", [0, 0.85, 0.12], [0.4, 0.32, 0.11], color);
    part(g, "oct", [0, 0.92, 0.2], [0.085, 0.12, 0.05], gold);
    blade(g, -0.1, 0.97, -0.52, 1.4, -0.65);
    cape.scale.y = 0.65;
  } else if (c?.prop === "bow") {
    part(g, "cone", [0, 0.69, -0.04], [0.28, 0.64, 0.23], color);
    part(g, "torus", [0.48, 0.79, 0.08], [0.25, 0.56, 0.15], gold);
    part(g, "cyl", [0.48, 0.79, 0.08], [0.008, 1.1, 0.008], "#fff4dc");
    part(g, "cyl", [-0.23, 1.04, -0.53], [0.15, 0.66, 0.15], "#92512f", {
      rot: [0, 0, -0.3],
    });
    for (let i = 0; i < 3; i++)
      part(
        g,
        "cone",
        [-0.32 + i * 0.07, 1.49, -0.53],
        [0.035, 0.16, 0.035],
        gold,
      );
  } else if (c?.prop === "cutlass") {
    for (const side of [-1, 1]) {
      part(g, "box", [side * 0.19, 0.53, -0.27], [0.23, 1.02, 0.16], color, {
        rot: [0, 0, side * 0.13],
      });
      for (let i = 0; i < 3; i++)
        part(
          g,
          "ball",
          [side * 0.15, 0.72 - i * 0.12, 0.015],
          [0.024, 0.024, 0.02],
          gold,
        );
    }
    blade(g, 0.45, 0.58, 0.1, 0.85, -0.3);
    part(g, "torus", [0.43, 0.39, 0.1], [0.14, 0.14, 0.14], gold);
  } else if (c?.prop === "daggers") {
    part(g, "box", [0, 0.91, 0.08], [0.41, 0.25, 0.2], color);
    blade(g, -0.35, 0.56, 0.1, 0.55, -0.4);
    blade(g, 0.35, 0.56, 0.1, 0.55, 0.4);
    cape.scale.set(0.65, 0.8, 1);
    for (const side of [-1, 1])
      part(
        cape,
        "box",
        [side * 0.2, -0.4, -0.17],
        [0.16, 1, 0.045],
        backColor,
        { rot: [0.2, 0, side * 0.15] },
      );
  }
  const sparkles = node(g, [0, 1, 0], "EquipSparkles");
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    part(
      sparkles,
      "oct",
      [Math.sin(angle) * 0.55, Math.cos(angle) * 0.55, Math.cos(angle) * 0.35],
      [0.035, 0.07, 0.035],
      gold,
      { glow: 0.8 },
    );
  }
  sparkles.userData.legendary = legendary;
  mergeCosmeticParts(g);
  costumeCache.set(key, g.clone());
}
export function buildClassHead(parent: T.Object3D, clothing: number) {
  const c = classFor(clothing);
  if (!c) return;
  if (c.prop === "staff") {
    part(parent, "cyl", [0, 1.82, 0], [0.62, 0.1, 0.51], c.color);
    part(parent, "cone", [0, 2.1, -0.05], [0.29, 0.65, 0.25], c.color, {
      rot: [0, 0, -0.12],
    });
    part(parent, "torus", [0, 1.88, 0], [0.26, 0.26, 0.26], gold, {
      rot: [Math.PI / 2, 0, 0],
    });
  }
  if (c.prop === "bow") {
    part(parent, "ball", [0, 1.64, -0.29], [0.5, 0.44, 0.3], c.color);
    for (const side of [-1, 1])
      part(
        parent,
        "ball",
        [side * 0.38, 1.46, -0.03],
        [0.09, 0.29, 0.18],
        c.color,
      );
  }
  if (c.prop === "cutlass") {
    part(parent, "ball", [0, 1.8, -0.07], [0.4, 0.14, 0.3], c.color);
    part(parent, "box", [-0.39, 1.64, -0.17], [0.13, 0.34, 0.04], c.color, {
      rot: [0, 0, -0.3],
    });
    part(parent, "oct", [0, 1.83, 0.22], [0.09, 0.09, 0.025], gold);
  }
  if (c.prop === "daggers")
    part(parent, "ball", [0, 1.14, 0.22], [0.22, 0.09, 0.055], c.color);
}
export function animateCostume(
  parent: T.Object3D,
  time: number,
  moving: boolean,
  reduced: boolean,
  age: number,
) {
  const cape = parent.getObjectByName("SwayCape");
  if (cape) {
    cape.rotation.x = reduced ? 0 : Math.sin(time * (moving ? 8 : 2)) * 0.1;
    cape.rotation.z = reduced ? 0 : Math.sin(time * 1.7) * 0.04;
  }
  const sparks = parent.getObjectByName("EquipSparkles");
  if (sparks) {
    sparks.visible = !reduced && (age < 1 || !!sparks.userData.legendary);
    sparks.rotation.y = time * 0.7;
  }
}
