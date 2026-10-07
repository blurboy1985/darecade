import {
  extraIndexFor,
  legendarySets,
  setIndexFor,
  type StyleSet,
} from "./collections.ts";
// Companion pets. Every pet is built from simple primitives so they share the
// soft, toy-like look of the neighbourhood. Index 0 means "no companion".
import * as T from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";
import { ball, material, node, part } from "./shapes.ts";

export type PetMotion = "walk" | "hop" | "float" | "waddle" | "bounce" | "swim";
export type Pet = {
  root: T.Group;
  body: T.Group;
  legs: T.Group[];
  tail: T.Group;
  wings: T.Object3D[];
  sway: T.Object3D[];
  motion: PetMotion;
  kind: number;
};

type Quad = {
  color: string;
  muzzle?: string;
  ear: number[];
  earColor: string;
  earTilt?: number;
  legColor?: string;
  bodyScale?: number[];
  legLength?: number;
  tail?: "short" | "fluffy" | "thin" | "none";
  tailColor?: string;
};

// Original neighbourhood familiars. The editable recipe stays here; a single
// vertex-colour mesh is cached for each articulated part, shared by all players.
// These process-lifetime geometries and materials must not be disposed on a swap.
const familiarShapes = {
  round: new T.SphereGeometry(1, 10, 7),
  flat: new T.SphereGeometry(1, 8, 6),
  ear: new T.ConeGeometry(1, 1, 3),
  gem: new T.OctahedronGeometry(1),
};
const familiarMaterial = new T.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.78,
});
const familiarParts = new Map<string, T.BufferGeometry>();

function familiarPart(
  parent: T.Object3D,
  shape: keyof typeof familiarShapes,
  p: number[],
  s: number[],
  color: string,
  rotation?: number[],
) {
  const mesh = new T.Mesh(familiarShapes[shape], material(color));
  mesh.position.set(p[0], p[1], p[2]);
  mesh.scale.set(s[0], s[1], s[2]);
  if (rotation) mesh.rotation.set(rotation[0], rotation[1], rotation[2]);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function bakeFamiliar(group: T.Group, key: string) {
  const groups = group.children.filter((child) => child instanceof T.Group);
  groups.forEach((child, i) => bakeFamiliar(child, `${key}/${i}`));
  const meshes = group.children.filter(
    (child): child is T.Mesh<T.BufferGeometry, T.MeshStandardMaterial> =>
      child instanceof T.Mesh &&
      child.material instanceof T.MeshStandardMaterial,
  );
  if (!meshes.length) return;
  let geometry = familiarParts.get(key);
  if (!geometry) {
    const pieces = meshes.map((mesh) => {
      mesh.updateMatrix();
      const piece = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      piece.applyMatrix4(mesh.matrix);
      const count = piece.getAttribute("position").count;
      const colors = new Float32Array(count * 3);
      const color = mesh.material.color;
      for (let i = 0; i < count; i++)
        colors.set([color.r, color.g, color.b], i * 3);
      piece.setAttribute("color", new T.BufferAttribute(colors, 3));
      return piece;
    });
    const merged = mergeGeometries(pieces);
    pieces.forEach((piece) => piece.dispose());
    if (!merged)
      throw new Error("Familiar parts must share geometry attributes");
    geometry = mergeVertices(merged);
    merged.dispose();
    familiarParts.set(key, geometry);
  }
  for (const mesh of meshes) {
    mesh.removeFromParent();
  }
  const baked = new T.Mesh(geometry, familiarMaterial);
  baked.name = "FamiliarPart";
  baked.castShadow = true;
  baked.userData.sharedCompanionGeometry = true;
  group.add(baked);
}

function familiarFace(body: T.Group, y: number, z: number, spread = 0.09) {
  for (const side of [-1, 1]) {
    familiarPart(
      body,
      "flat",
      [side * spread, y, z],
      [0.033, 0.046, 0.015],
      "#302d46",
    );
    familiarPart(
      body,
      "flat",
      [side * spread - 0.009, y + 0.017, z + 0.012],
      [0.011, 0.014, 0.007],
      "#fff9ed",
    );
    familiarPart(
      body,
      "flat",
      [side * (spread + 0.052), y - 0.049, z - 0.008],
      [0.035, 0.014, 0.01],
      "#eaa7ae",
    );
    familiarPart(
      body,
      "flat",
      [side * 0.017, y - 0.076, z + 0.012],
      [0.02, 0.011, 0.008],
      "#685166",
      [0, 0, -side * 0.3],
    );
  }
  familiarPart(
    body,
    "ear",
    [0, y - 0.054, z + 0.027],
    [0.023, 0.025, 0.016],
    "#ab7183",
    [Math.PI, 0, 0],
  );
}

function familiarAnimal(pet: Pet, rabbit: boolean) {
  const b = pet.body;
  const coat = rabbit ? "#f8e0d2" : "#c7b0cf";
  const cream = "#fff2dc";
  familiarPart(b, "round", [0, 0.28, -0.025], [0.18, 0.19, 0.25], coat);
  familiarPart(b, "round", [0, 0.48, 0.19], [0.235, 0.205, 0.205], coat);
  familiarPart(b, "flat", [0, 0.265, 0.18], [0.11, 0.14, 0.045], cream);
  familiarPart(b, "flat", [0, 0.43, 0.35], [0.13, 0.076, 0.056], cream);
  familiarFace(b, 0.51, 0.371);
  for (const side of [-1, 1]) {
    const ear = node(b, [side * 0.145, 0.625, 0.13], "FamiliarEar");
    ear.rotation.z = -side * (rabbit ? 0.12 : 0.27);
    if (rabbit) {
      familiarPart(ear, "round", [0, 0.13, 0], [0.065, 0.19, 0.057], coat);
      familiarPart(
        ear,
        "flat",
        [0, 0.135, 0.047],
        [0.033, 0.135, 0.015],
        "#eaa7ae",
      );
      pet.sway.push(ear);
    } else {
      familiarPart(ear, "ear", [0, 0.055, 0], [0.11, 0.19, 0.075], coat);
      familiarPart(
        ear,
        "ear",
        [0, 0.065, 0.039],
        [0.059, 0.105, 0.012],
        "#eaa7ae",
      );
    }
  }
  // A small jade scarf for Mochi and a peach bow for Peaches tie the pets to
  // the neighbourhood palette without copying a reference character.
  const trim = rabbit ? "#eaa0a2" : "#76bcae";
  familiarPart(b, "flat", [0, 0.345, 0.255], [0.15, 0.038, 0.05], trim);
  for (const side of [-1, 1])
    familiarPart(
      b,
      "gem",
      [side * 0.05, 0.35, 0.307],
      [0.055, 0.035, 0.023],
      trim,
    );
  familiarPart(b, "gem", [0, 0.346, 0.329], [0.024, 0.029, 0.012], "#fff1b3");
  for (const x of [-0.115, 0.115])
    for (const z of [-0.15, 0.14]) {
      const paw = node(b, [x, 0.16, z], "FamiliarPaw");
      familiarPart(
        paw,
        "round",
        [0, -0.055, 0.02],
        [0.067, 0.105, 0.075],
        coat,
      );
      familiarPart(paw, "flat", [0, -0.11, 0.04], [0.062, 0.042, 0.064], cream);
      pet.legs.push(paw);
    }
  pet.tail.position.set(0, 0.29, -0.24);
  if (rabbit) {
    familiarPart(
      pet.tail,
      "round",
      [0, 0.02, -0.04],
      [0.088, 0.085, 0.08],
      cream,
    );
  } else {
    familiarPart(
      pet.tail,
      "round",
      [0, 0.08, -0.09],
      [0.048, 0.19, 0.055],
      coat,
      [-0.7, 0, 0],
    );
    familiarPart(
      pet.tail,
      "round",
      [0, 0.2, -0.2],
      [0.057, 0.07, 0.055],
      cream,
    );
  }
}

function merlionFamiliar(pet: Pet) {
  const b = pet.body;
  // Original floating lion-fish familiar, with an orchid-like scalloped mane.
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    familiarPart(
      b,
      "round",
      [Math.cos(angle) * 0.19, 0.54 + Math.sin(angle) * 0.19, 0.01],
      [0.094, 0.103, 0.077],
      i % 2 ? "#e3b665" : "#f3cc82",
    );
  }
  familiarPart(b, "round", [0, 0.535, 0.095], [0.214, 0.205, 0.174], "#fff1d8");
  familiarPart(b, "flat", [0, 0.47, 0.246], [0.119, 0.081, 0.046], "#fff9ec");
  familiarFace(b, 0.565, 0.263, 0.083);
  for (const side of [-1, 1])
    familiarPart(
      b,
      "round",
      [side * 0.147, 0.71, 0.085],
      [0.063, 0.064, 0.045],
      "#fff1d8",
    );
  familiarPart(b, "round", [0, 0.3, -0.005], [0.177, 0.196, 0.18], "#7ecbc8");
  familiarPart(b, "flat", [0, 0.295, 0.149], [0.115, 0.132, 0.035], "#d9f1dd");
  for (let i = 0; i < 3; i++)
    familiarPart(
      b,
      "gem",
      [0, 0.36 - i * 0.062, 0.182],
      [0.071 - i * 0.012, 0.033, 0.014],
      "#f5dc94",
    );
  familiarPart(b, "round", [0, 0.225, -0.178], [0.125, 0.113, 0.16], "#7ecbc8");
  pet.tail.position.set(0, 0.2, -0.3);
  for (const side of [-1, 1]) {
    familiarPart(
      pet.tail,
      "flat",
      [side * 0.087, 0.031, -0.075],
      [0.114, 0.039, 0.09],
      "#559eae",
      [0, side * 0.35, side * 0.32],
    );
    const fin = node(b, [side * 0.151, 0.337, 0.018], "PetWing");
    fin.userData.side = side;
    familiarPart(
      fin,
      "flat",
      [side * 0.052, -0.014, 0],
      [0.086, 0.038, 0.08],
      "#559eae",
    );
    pet.wings.push(fin);
  }
}

function face(
  body: T.Object3D,
  y: number,
  z: number,
  spread = 0.075,
  size = 0.03,
) {
  for (const side of [-1, 1]) {
    ball(
      body,
      [side * spread, y, z],
      [size * 0.9, size, size * 0.45],
      "#243c45",
    );
    ball(
      body,
      [side * spread - 0.008, y + 0.012, z + 0.012],
      [0.009, 0.01, 0.004],
      "#ffffff",
    );
  }
}

function quad(pet: Pet, q: Quad) {
  const b = pet.body;
  const [sx, sy, sz] = q.bodyScale ?? [0.19, 0.2, 0.31];
  const leg = q.legLength ?? 0.13;
  const lift = leg - 0.13;
  ball(b, [0, 0.31 + lift, 0], [sx, sy, sz], q.color);
  ball(b, [0, 0.5 + lift, 0.22 + (sz - 0.31)], [0.2, 0.19, 0.18], q.color);
  const hz = 0.22 + (sz - 0.31);
  ball(
    b,
    [0, 0.43 + lift, hz + 0.14],
    [0.11, 0.085, 0.095],
    q.muzzle ?? "#f4dfb9",
  );
  for (const side of [-1, 1]) {
    const ear = ball(
      b,
      [side * 0.14, 0.65 + lift, hz - 0.04],
      q.ear,
      q.earColor,
    );
    ear.rotation.z = side * (q.earTilt ?? 0.2);
  }
  face(b, 0.53 + lift, hz + 0.15);
  ball(b, [0, 0.45 + lift, hz + 0.22], [0.034, 0.025, 0.02], "#684c53");
  for (const x of [-0.12, 0.12])
    for (const z of [-0.18, 0.18]) {
      const g = node(b, [x, 0.22 + lift, z * (sz / 0.31)]);
      ball(
        g,
        [0, -0.08 - lift / 2, 0],
        [0.06, leg, 0.065],
        q.legColor ?? q.color,
      );
      pet.legs.push(g);
    }
  pet.tail.position.set(0, 0.32 + lift, -sz + 0.03);
  const tc = q.tailColor ?? q.color;
  if (q.tail === "fluffy") {
    const t = ball(pet.tail, [0, 0.14, -0.12], [0.11, 0.24, 0.12], tc);
    t.rotation.x = -0.9;
    ball(pet.tail, [0, 0.28, -0.24], [0.09, 0.09, 0.08], "#fff1d8");
  } else if (q.tail === "thin") {
    const t = ball(pet.tail, [0, 0.1, -0.09], [0.04, 0.17, 0.04], tc);
    t.rotation.x = -0.8;
  } else if (q.tail === "short") {
    ball(pet.tail, [0, 0.03, -0.03], [0.06, 0.06, 0.06], tc);
  } else if (q.tail !== "none") {
    const t = ball(pet.tail, [0, 0.1, -0.09], [0.07, 0.18, 0.075], tc);
    t.rotation.x = -0.8;
  }
}

function bird(
  pet: Pet,
  body: string,
  belly: string,
  beak: string,
  wing: string,
  glow = 0,
) {
  const b = pet.body;
  ball(b, [0, 0.32, 0], [0.2, 0.26, 0.19], body, { glow });
  ball(b, [0, 0.3, 0.09], [0.15, 0.2, 0.12], belly, { glow });
  ball(b, [0, 0.58, 0.03], [0.16, 0.15, 0.15], body, { glow });
  face(b, 0.62, 0.16, 0.065, 0.026);
  part(b, "cone", [0, 0.56, 0.21], [0.045, 0.1, 0.03], beak, {
    rot: [Math.PI / 2, 0, 0],
  });
  for (const side of [-1, 1]) {
    const w = node(b, [side * 0.19, 0.38, 0], "PetWing");
    w.userData.side = side;
    ball(w, [side * 0.05, -0.04, 0], [0.06, 0.15, 0.11], wing, { glow });
    pet.wings.push(w);
    const foot = node(b, [side * 0.08, 0.08, 0.04]);
    ball(foot, [0, -0.03, 0.04], [0.06, 0.025, 0.08], beak);
    pet.legs.push(foot);
  }
}

const quads: Record<number, Quad> = {
  2: {
    color: "#ca9a69",
    ear: [0.1, 0.2, 0.065],
    earColor: "#8b654c",
    earTilt: 0.7,
  },
  5: {
    color: "#df9457",
    ear: [0.08, 0.16, 0.065],
    earColor: "#7f5847",
    tail: "fluffy",
  },
  6: { color: "#93cdb1", ear: [0.045, 0.07, 0.04], earColor: "#e6c572" },
  10: {
    color: "#f2efe8",
    muzzle: "#f7f4ee",
    ear: [0.07, 0.07, 0.05],
    earColor: "#2b2a2e",
    legColor: "#2b2a2e",
    bodyScale: [0.24, 0.23, 0.3],
    tail: "short",
  },
  11: {
    color: "#c4572b",
    muzzle: "#f7eadb",
    ear: [0.07, 0.1, 0.05],
    earColor: "#f7eadb",
    legColor: "#3a2620",
    tail: "none",
  },
  17: {
    color: "#e09a4f",
    muzzle: "#fbf3e4",
    ear: [0.07, 0.17, 0.05],
    earColor: "#d0843f",
    legLength: 0.09,
    bodyScale: [0.19, 0.18, 0.36],
    tail: "short",
    tailColor: "#fbf3e4",
  },
  20: {
    color: "#faf6ff",
    muzzle: "#fdf0f6",
    ear: [0.05, 0.12, 0.04],
    earColor: "#f1e4ff",
    legLength: 0.19,
    tail: "none",
  },
};

const motions: Record<number, PetMotion> = {
  3: "float",
  4: "hop",
  7: "float",
  9: "waddle",
  14: "hop",
  16: "waddle",
  19: "swim",
  21: "float",
  22: "bounce",
  23: "float",
  24: "float",
  25: "float",
};

function bee(pet: Pet, body: string, stripe: string) {
  const b = pet.body;
  pet.motion = "float";
  ball(b, [0, 0.5, 0], [0.17, 0.17, 0.22], body);
  for (const [z, r] of [
    [-0.03, 0.172],
    [-0.11, 0.152],
  ])
    part(b, "cyl", [0, 0.5, z], [r, 0.045, r], stripe, {
      rot: [Math.PI / 2, 0, 0],
    });
  face(b, 0.53, 0.19, 0.07, 0.03);
  for (const side of [-1, 1]) {
    ball(b, [side * 0.11, 0.47, 0.17], [0.035, 0.018, 0.01], "#ffb3c9");
    const wing = node(b, [side * 0.07, 0.64, -0.03], "PetWing");
    wing.userData.side = side;
    ball(wing, [side * 0.1, 0.03, 0], [0.12, 0.025, 0.08], "#e8f7ff", {
      opacity: 0.7,
    });
    pet.wings.push(wing);
    const feeler = part(
      b,
      "cyl",
      [side * 0.06, 0.7, 0.14],
      [0.01, 0.12, 0.01],
      stripe,
    );
    feeler.rotation.z = -side * 0.35;
    ball(b, [side * 0.08, 0.77, 0.14], [0.025, 0.025, 0.025], stripe);
  }
  part(b, "cone", [0, 0.5, -0.25], [0.04, 0.09, 0.04], stripe, {
    rot: [-Math.PI / 2, 0, 0],
  });
}

// Later companions: six single pets, then the pets of every set after the
// first ten. Ids match laterPets below and the set ids in collections.ts.
function laterPet(pet: Pet, id: string, color: string, accent: string) {
  const b = pet.body;
  switch (id) {
    case "chick":
      bird(pet, "#ffe27a", "#fff3b8", "#ff9d3c", "#ffd24f");
      ball(b, [0, 0.75, 0.01], [0.03, 0.06, 0.03], "#ffd24f");
      pet.motion = "waddle";
      break;
    case "shiba":
      quad(pet, {
        color: "#e0a45c",
        muzzle: "#fff6e6",
        ear: [0.07, 0.13, 0.05],
        earColor: "#c98a45",
        tail: "fluffy",
        tailColor: "#fff6e6",
      });
      for (const side of [-1, 1])
        ball(b, [side * 0.13, 0.47, 0.33], [0.06, 0.05, 0.04], "#fff6e6");
      break;
    case "koala":
      quad(pet, {
        color: "#a9adb8",
        muzzle: "#e9e9ee",
        ear: [0.11, 0.11, 0.06],
        earColor: "#8f93a0",
        earTilt: 0.5,
        bodyScale: [0.22, 0.22, 0.28],
        tail: "none",
      });
      ball(b, [0, 0.47, 0.42], [0.05, 0.065, 0.035], "#3b3b45");
      break;
    case "bee":
      bee(pet, "#ffd447", "#3b2f2f");
      break;
    case "octopus": {
      pet.motion = "bounce";
      ball(b, [0, 0.32, 0], [0.22, 0.22, 0.21], "#b98cf2");
      face(b, 0.3, 0.19, 0.08, 0.032);
      for (const side of [-1, 1])
        ball(b, [side * 0.14, 0.24, 0.16], [0.04, 0.02, 0.012], "#ffb3c9");
      ball(b, [0, 0.23, 0.2], [0.03, 0.03, 0.02], "#8a5fd0");
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + 0.52;
        const arm = node(b, [Math.cos(a) * 0.15, 0.15, Math.sin(a) * 0.15]);
        ball(
          arm,
          [Math.cos(a) * 0.05, -0.06, Math.sin(a) * 0.05],
          [0.06, 0.09, 0.06],
          i % 2 ? "#b98cf2" : "#a476e6",
        );
        pet.sway.push(arm);
      }
      break;
    }
    case "whale": {
      pet.motion = "float";
      ball(b, [0, 0.5, 0], [0.2, 0.17, 0.3], "#7cb8f2");
      ball(b, [0, 0.455, 0.03], [0.175, 0.13, 0.27], "#e9f6ff");
      face(b, 0.53, 0.25, 0.11, 0.028);
      pet.tail.position.set(0, 0.5, -0.27);
      for (const side of [-1, 1]) {
        const fluke = ball(
          pet.tail,
          [side * 0.08, 0.04, -0.1],
          [0.09, 0.025, 0.07],
          "#7cb8f2",
        );
        fluke.rotation.y = side * 0.5;
        const fin = node(b, [side * 0.18, 0.44, 0.08], "PetWing");
        fin.userData.side = side;
        ball(fin, [side * 0.07, -0.02, 0], [0.09, 0.02, 0.06], "#5fa0e0");
        pet.wings.push(fin);
      }
      ball(pet.tail, [0, 0.02, -0.04], [0.05, 0.04, 0.09], "#7cb8f2");
      for (const [x, y, s] of [
        [0, 0.74, 0.035],
        [-0.06, 0.82, 0.022],
        [0.06, 0.86, 0.018],
      ])
        ball(b, [x, y, 0.05], [s, s, s], "#fff3b0", { glow: 0.9 });
      break;
    }
    case "candy": {
      quad(pet, {
        color: "#fff1f6",
        muzzle: "#ffffff",
        ear: [0.08, 0.14, 0.05],
        earColor: color,
        tail: "thin",
        tailColor: color,
      });
      ball(b, [0, 0.5, -0.05], [0.15, 0.07, 0.2], color);
      ball(b, [0, 0.56, -0.05], [0.1, 0.06, 0.13], accent);
      ball(b, [0, 0.63, -0.05], [0.04, 0.04, 0.04], "#ff4d6d");
      for (let i = 0; i < 7; i++)
        part(
          b,
          "box",
          [Math.sin(i * 2.4) * 0.11, 0.565, -0.05 + Math.cos(i * 2.4) * 0.15],
          [0.012, 0.012, 0.04],
          ["#ffe27a", "#8fb8ff", "#ffffff"][i % 3],
          { rot: [0, i, 0] },
        );
      break;
    }
    case "boba": {
      pet.motion = "bounce";
      ball(b, [0, 0.19, 0], [0.24, 0.19, 0.24], accent, { opacity: 0.85 });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ball(
          b,
          [Math.cos(a) * 0.11, 0.08 + (i % 2) * 0.03, Math.sin(a) * 0.11],
          [0.045, 0.045, 0.045],
          "#3a2418",
        );
      }
      face(b, 0.24, 0.215, 0.07, 0.03);
      for (const side of [-1, 1])
        ball(b, [side * 0.12, 0.19, 0.2], [0.035, 0.018, 0.01], "#ffb3c9");
      part(b, "cyl", [0.07, 0.42, -0.02], [0.028, 0.3, 0.028], "#ff8fb1", {
        rot: [0, 0, -0.25],
      });
      ball(b, [0, 0.34, 0], [0.16, 0.035, 0.16], color, { opacity: 0.9 });
      break;
    }
    case "pixel": {
      part(b, "box", [0, 0.3, -0.03], [0.3, 0.24, 0.4], color);
      part(b, "box", [0, 0.52, 0.2], [0.32, 0.28, 0.28], color);
      part(b, "box", [0, 0.46, 0.36], [0.16, 0.12, 0.08], "#f4ffe9");
      part(b, "box", [0, 0.5, 0.41], [0.06, 0.05, 0.03], "#243c45");
      for (const side of [-1, 1]) {
        part(b, "box", [side * 0.13, 0.7, 0.18], [0.08, 0.12, 0.08], accent);
        part(
          b,
          "box",
          [side * 0.08, 0.57, 0.345],
          [0.05, 0.06, 0.02],
          "#243c45",
        );
        for (const z of [-0.16, 0.12]) {
          const leg = node(b, [side * 0.1, 0.2, z]);
          part(leg, "box", [0, -0.1, 0], [0.09, 0.2, 0.09], color);
          pet.legs.push(leg);
        }
      }
      pet.tail.position.set(0, 0.36, -0.23);
      part(pet.tail, "box", [0, 0.08, 0], [0.07, 0.18, 0.07], accent);
      break;
    }
    case "witch": {
      pet.motion = "float";
      ball(b, [0, 0.5, 0], [0.17, 0.18, 0.16], color);
      face(b, 0.52, 0.14, 0.065, 0.03);
      for (const side of [-1, 1]) {
        part(b, "cone", [side * 0.1, 0.7, 0], [0.06, 0.14, 0.04], color, {
          rot: [0, 0, -side * 0.3],
        });
        part(
          b,
          "cone",
          [side * 0.03, 0.44, 0.15],
          [0.012, 0.035, 0.012],
          "#ffffff",
          { rot: [Math.PI, 0, 0] },
        );
        const wing = node(b, [side * 0.13, 0.52, -0.02], "PetWing");
        wing.userData.side = side;
        for (let n = 0; n < 3; n++)
          part(
            wing,
            "cone",
            [side * (0.08 + n * 0.09), -0.02 - n * 0.015, 0],
            [0.07, 0.24 - n * 0.04, 0.012],
            n % 2 ? "#5b4fc4" : "#4b3f9e",
            { rot: [Math.PI, 0, 0] },
          );
        pet.wings.push(wing);
      }
      part(b, "cyl", [0, 0.68, 0.02], [0.11, 0.015, 0.11], accent);
      part(b, "cone", [0, 0.78, 0.02], [0.065, 0.2, 0.065], accent);
      break;
    }
    case "garden":
      bee(pet, "#fff0a8", color);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ball(
          b,
          [Math.cos(a) * 0.05, 0.69, 0.02 + Math.sin(a) * 0.05],
          [0.045, 0.02, 0.045],
          accent,
        );
      }
      ball(b, [0, 0.7, 0.02], [0.03, 0.025, 0.03], "#ffe27a");
      break;
    case "dino": {
      ball(b, [0, 0.3, -0.02], [0.2, 0.23, 0.23], color);
      ball(b, [0, 0.27, 0.07], [0.15, 0.17, 0.17], "#f4f7d8");
      ball(b, [0, 0.58, 0.1], [0.19, 0.17, 0.19], color);
      ball(b, [0, 0.53, 0.25], [0.13, 0.1, 0.11], color);
      face(b, 0.63, 0.24, 0.1, 0.03);
      for (const side of [-1, 1]) {
        ball(b, [side * 0.05, 0.56, 0.35], [0.012, 0.012, 0.008], "#2c6b55");
        ball(b, [side * 0.15, 0.36, 0.16], [0.04, 0.07, 0.04], color);
        const leg = node(b, [side * 0.11, 0.14, 0]);
        ball(leg, [0, -0.07, 0.03], [0.075, 0.07, 0.11], color);
        pet.legs.push(leg);
      }
      for (let i = 0; i < 4; i++)
        part(
          b,
          "cone",
          [0, 0.74 - i * 0.13, -0.02 - i * 0.07],
          [0.04, 0.09, 0.04],
          accent,
          { rot: [-0.5 - i * 0.2, 0, 0] },
        );
      pet.tail.position.set(0, 0.2, -0.2);
      part(pet.tail, "cone", [0, 0, -0.13], [0.09, 0.3, 0.09], color, {
        rot: [-Math.PI / 2, 0, 0],
      });
      break;
    }
  }
}
const laterPets = ["chick", "shiba", "koala", "bee", "octopus", "whale"];

function catalogPet(pet: Pet, s: StyleSet) {
  const b = pet.body,
    { familiar, motif } = s.design;
  const color = s.color,
    accent = s.accent;
  const soft = new T.Color(color).lerp(new T.Color("#ffffff"), 0.4).getStyle();
  if (familiar === "dragon") {
    // Upright drake: two feet, barrel chest, broad wings and a tapering tail.
    ball(b, [0, 0.36, 0], [0.22, 0.29, 0.2], color);
    ball(b, [0, 0.36, 0.15], [0.15, 0.21, 0.09], soft);
    ball(b, [0, 0.7, 0.08], [0.23, 0.18, 0.2], color);
    ball(b, [0, 0.64, 0.26], [0.14, 0.08, 0.12], soft);
    face(b, 0.73, 0.255, 0.1, 0.038);
    for (const side of [-1, 1]) {
      const foot = node(b, [side * 0.15, 0.1, 0.06]);
      ball(foot, [0, 0, 0.04], [0.1, 0.08, 0.14], color);
      pet.legs.push(foot);
      part(b, "cone", [side * 0.15, 0.91, -0.01], [0.04, 0.18, 0.04], accent);
      const wing = node(b, [side * 0.18, 0.52, -0.12]);
      wing.userData.side = side;
      part(
        wing,
        "oct",
        [side * 0.18, 0.08, -0.03],
        [0.25, 0.23, 0.035],
        accent,
        { rot: [0, 0, side * 0.35] },
      );
      pet.wings.push(wing);
      ball(b, [side * 0.22, 0.42, 0.08], [0.065, 0.13, 0.07], color);
    }
    pet.tail.position.set(0, 0.18, -0.17);
    part(pet.tail, "cone", [0, 0, -0.2], [0.1, 0.5, 0.1], color, {
      rot: [-Math.PI / 2, 0, 0],
    });
    part(pet.tail, "oct", [0, 0.02, -0.45], [0.065, 0.1, 0.065], accent);
    pet.motion = "waddle";
  } else if (familiar === "otter") {
    quad(pet, {
      color,
      muzzle: "#f0d7b7",
      ear: [0.065, 0.055, 0.035],
      earColor: color,
      bodyScale: [0.2, 0.15, 0.39],
      legLength: 0.08,
      tail: "none",
    });
    ball(pet.tail, [0, 0, -0.19], [0.12, 0.035, 0.23], color);
    ball(b, [0, 0.3, 0.15], [0.16, 0.11, 0.2], "#f0d7b7");
    pet.motion = "waddle";
  } else if (["cat", "fox", "wolf", "rabbit"].includes(familiar)) {
    quad(pet, {
      color: soft,
      ...(familiar === "wolf"
        ? {
            bodyScale: [0.16, 0.18, 0.36] as [number, number, number],
            legLength: 0.21,
          }
        : {}),
      muzzle: "#fff3df",
      ear:
        familiar === "rabbit"
          ? [0.06, 0.29, 0.055]
          : familiar === "fox"
            ? [0.075, 0.18, 0.065]
            : [0.075, 0.12, 0.06],
      earColor: color,
      tail: familiar === "cat" ? "thin" : "fluffy",
      tailColor: color,
      legColor: color,
    });
    if (familiar === "rabbit") pet.motion = "hop";
    if (familiar === "wolf") {
      for (const side of [-1, 1])
        part(b, "cone", [side * 0.19, 0.52, 0.14], [0.09, 0.21, 0.09], color, {
          rot: [0, 0, side * 0.65],
        });
    }
    if (familiar === "fox")
      for (let i = 0; i < 1 + (motif % 3); i++)
        part(
          pet.tail,
          "cone",
          [(i - (motif % 3) / 2) * 0.08, 0.03, -0.1],
          [0.07, 0.3, 0.08],
          color,
          { rot: [-0.9, 0, (i - 1) * 0.25] },
        );
  } else if (familiar === "bird") {
    bird(pet, soft, color, accent, accent);
    pet.motion = "float";
    for (let i = 0; i < 3; i++)
      part(
        b,
        "oct",
        [(i - 1) * 0.055, 0.78, 0],
        [0.025, 0.1 + i * 0.018, 0.025],
        accent,
        { rot: [0, 0, (i - 1) * 0.2] },
      );
  } else if (familiar === "turtle") {
    quad(pet, {
      color: soft,
      ear: [0.02, 0.025, 0.02],
      earColor: soft,
      tail: "short",
      legLength: 0.08,
      bodyScale: [0.22, 0.12, 0.28],
    });
    ball(b, [0, 0.38, -0.05], [0.27, 0.18, 0.29], color);
    for (let i = 0; i < 5; i++) {
      const a = (i * Math.PI * 2) / 5;
      part(
        b,
        "oct",
        [Math.cos(a) * 0.15, 0.51, Math.sin(a) * 0.15 - 0.05],
        [0.055, 0.025, 0.065],
        accent,
      );
    }
    pet.motion = "waddle";
  } else if (familiar === "robot") {
    part(b, "box", [0, 0.46, 0], [0.32, 0.34, 0.27], color);
    part(b, "box", [0, 0.7, 0.02], [0.37, 0.22, 0.3], soft);
    part(b, "box", [0, 0.71, 0.18], [0.29, 0.13, 0.025], "#243044");
    for (const side of [-1, 1]) {
      ball(b, [side * 0.08, 0.71, 0.2], [0.03, 0.04, 0.012], accent);
      const foot = node(b, [side * 0.13, 0.21, 0]);
      part(foot, "box", [0, 0, 0.03], [0.12, 0.1, 0.17], soft);
      pet.legs.push(foot);
      const arm = node(b, [side * 0.2, 0.49, 0]);
      ball(arm, [0, 0, 0], [0.065, 0.12, 0.065], accent);
      pet.sway.push(arm);
    }
    part(b, "cyl", [0, 0.91, 0], [0.012, 0.18, 0.012], soft);
    ball(b, [0, 1.02, 0], [0.045, 0.045, 0.045], accent);
  } else if (familiar === "slime") {
    ball(b, [0, 0.29, 0], [0.26, 0.23, 0.23], soft);
    ball(b, [-0.08, 0.49, -0.02], [0.1, 0.12, 0.09], color);
    face(b, 0.31, 0.21, 0.085, 0.035);
    pet.motion = "bounce";
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      const droplet = node(b, [Math.cos(a) * 0.3, 0.2, Math.sin(a) * 0.3]);
      ball(droplet, [0, 0, 0], [0.06, 0.07, 0.06], accent);
      pet.sway.push(droplet);
    }
  } else {
    ball(b, [0, 0.51, 0], [0.1, 0.19, 0.1], color);
    ball(b, [0, 0.71, 0.04], [0.14, 0.12, 0.12], soft);
    face(b, 0.72, 0.14, 0.055, 0.025);
    pet.motion = "float";
    for (const side of [-1, 1]) {
      const wing = node(b, [side * 0.08, 0.56, -0.04]);
      wing.userData.side = side;
      ball(wing, [side * 0.13, 0.09, 0], [0.2, 0.21, 0.025], accent);
      ball(wing, [side * 0.13, -0.13, 0], [0.12, 0.12, 0.025], soft);
      part(wing, "oct", [side * 0.19, 0.12, 0.025], [0.07, 0.11, 0.01], color);
      pet.wings.push(wing);
    }
    ball(pet.tail, [0, 0, 0], [0.065, 0.12, 0.06], accent);
  }
  // Collar badge and little cheek marks make each themed companion recognizable.
  part(
    b,
    "oct",
    [0, 0.39, 0.31],
    [0.035 + (motif % 3) * 0.005, 0.05, 0.012],
    accent,
  );
  for (const side of [-1, 1])
    ball(b, [side * 0.12, 0.45, 0.3], [0.03, 0.015, 0.01], color);
  if (s.tier === "Premium")
    for (const side of [-1, 1]) {
      const charm = node(b, [side * 0.16, 0.86, 0]);
      part(charm, "oct", [0, 0, 0], [0.035, 0.085, 0.025], accent);
      pet.sway.push(charm);
    }
  bakeFamiliar(pet.root, `catalog-${s.id}`);
}

export function makePet(parent: T.Object3D, kind: number): Pet {
  const root = node(parent);
  root.userData.companion = true;
  const body = node(root);
  const pet: Pet = {
    root,
    body,
    legs: [],
    tail: node(body, [0, 0.32, -0.28]),
    wings: [],
    sway: [],
    motion: motions[kind] ?? "walk",
    kind,
  };
  const b = body;
  if (kind === 1 || kind === 4 || kind === 24) {
    if (kind === 24) merlionFamiliar(pet);
    else familiarAnimal(pet, kind === 4);
    bakeFamiliar(root, String(kind));
    return pet;
  }
  if (quads[kind]) quad(pet, quads[kind]);
  const i = setIndexFor("pet", kind);
  if (i >= 16) {
    catalogPet(pet, legendarySets[i]);
    return pet;
  }
  const extra = laterPets[extraIndexFor("pet", kind)];
  if (extra) laterPet(pet, extra, "", "");
  else if (i >= 10)
    laterPet(
      pet,
      legendarySets[i].id,
      legendarySets[i].color,
      legendarySets[i].accent,
    );
  const special = i < 10 ? legendarySets[i] : undefined;
  if (special) {
    if ([4, 6, 9].includes(i)) {
      pet.motion = "float";
      ball(
        b,
        [0, 0.5, 0],
        i === 6 ? [0.32, 0.09, 0.25] : [0.19, 0.2, 0.19],
        special.color,
        { glow: 0.4 },
      );
      face(b, 0.53, 0.18);
      for (const side of [-1, 1]) {
        const wing = node(b, [side * 0.2, 0.5, 0]);
        part(
          wing,
          i === 4 ? "box" : "oct",
          [side * 0.15, 0, 0],
          [0.24, 0.05, 0.15],
          special.accent,
          { glow: 0.5 },
        );
        wing.userData.side = side;
        pet.wings.push(wing);
      }
      for (let n = 0; n < 5; n++)
        part(
          b,
          "oct",
          [Math.sin(n * 1.25) * 0.24, 0.6 + Math.cos(n * 1.25) * 0.24, 0],
          [0.07, 0.12, 0.07],
          special.accent,
          { glow: 0.7 },
        );
    } else if (i === 7) {
      bird(pet, special.color, special.accent, "#fff3b0", special.accent, 0.5);
      pet.motion = "float";
    } else {
      quad(pet, {
        color: special.color,
        muzzle: special.accent,
        ear: i === 1 ? [0.07, 0.3, 0.07] : [0.09, 0.12, 0.08],
        earColor: special.accent,
        tail: "fluffy",
      });
      pet.motion = i === 1 ? "hop" : "walk";
      if (i === 3)
        for (let n = 0; n < 8; n++) {
          const a = (n - 3.5) * 0.3;
          part(
            pet.tail,
            "cone",
            [Math.sin(a) * 0.25, 0.15, -0.15],
            [0.07, 0.5, 0.07],
            n % 2 ? special.color : special.accent,
            { rot: [-0.8, 0, -a] },
          );
        }
      if (i === 0)
        for (let n = 0; n < 10; n++)
          ball(
            b,
            [
              Math.sin(n * 0.628) * 0.23,
              0.52 + Math.cos(n * 0.628) * 0.23,
              0.2,
            ],
            [0.09, 0.1, 0.08],
            special.accent,
          );
      if ([2, 5, 8].includes(i))
        for (const side of [-1, 1])
          part(
            b,
            "cone",
            [side * 0.15, 0.82, 0.13],
            [0.07, 0.3, 0.07],
            special.accent,
            { rot: [0, 0, -side * 0.4], glow: 0.4 },
          );
      if (i === 5)
        for (const side of [-1, 1])
          part(
            b,
            "oct",
            [side * 0.3, 0.45, -0.05],
            [0.3, 0.05, 0.2],
            special.accent,
            { glow: 0.5 },
          );
    }
  }
  switch (kind) {
    case 3: {
      ball(b, [0, 0.5, 0], [0.23, 0.2, 0.25], "#ddedeb");
      ball(b, [0, 0.52, 0.2], [0.17, 0.085, 0.065], "#364f6a");
      for (const x of [-0.07, 0.07])
        ball(b, [x, 0.54, 0.26], [0.025, 0.028, 0.012], "#baf5d9", {
          glow: 0.6,
        });
      ball(b, [0, 0.73, 0], [0.025, 0.1, 0.025], "#e7c077");
      ball(b, [0, 0.84, 0], [0.06, 0.06, 0.06], "#e7c077", { glow: 0.6 });
      break;
    }
    case 6: {
      for (const side of [-1, 1]) {
        const wing = node(b, [side * 0.14, 0.43, -0.07], "PetWing");
        wing.userData.side = side;
        ball(wing, [side * 0.14, 0.08, -0.03], [0.2, 0.12, 0.045], "#caacf0");
        ball(wing, [side * 0.1, 0.04, 0], [0.13, 0.065, 0.02], "#e9d7fa");
        pet.wings.push(wing);
      }
      for (let i = 0; i < 3; i++)
        ball(
          b,
          [0, 0.47 - i * 0.035, -0.1 - i * 0.1],
          [0.04, 0.07, 0.04],
          "#e9cb79",
        );
      break;
    }
    case 7: {
      ball(b, [0, 0.43, 0], [0.24, 0.28, 0.21], "#b29bbf");
      ball(b, [0, 0.41, 0.16], [0.18, 0.21, 0.08], "#f2e2cc");
      for (const side of [-1, 1]) {
        ball(b, [side * 0.1, 0.55, 0.19], [0.105, 0.115, 0.06], "#f5edd9");
        ball(b, [side * 0.1, 0.55, 0.246], [0.042, 0.052, 0.02], "#343449");
        ball(
          b,
          [side * 0.1 - 0.01, 0.575, 0.263],
          [0.014, 0.017, 0.006],
          "#ffffff",
        );
        const wing = node(b, [side * 0.22, 0.46, 0], "PetWing");
        wing.userData.side = side;
        ball(wing, [side * 0.08, -0.02, 0], [0.14, 0.2, 0.07], "#88739d");
        pet.wings.push(wing);
        ball(b, [side * 0.1, 0.16, 0.04], [0.07, 0.035, 0.08], "#e6b55c");
      }
      ball(b, [0, 0.46, 0.25], [0.045, 0.055, 0.055], "#e6b55c");
      break;
    }
    case 8: {
      // Smooth-coated otter, a familiar sight along Singapore's waterways.
      ball(b, [0, 0.22, 0], [0.15, 0.14, 0.36], "#7a5a43");
      ball(b, [0, 0.19, 0.06], [0.11, 0.1, 0.26], "#c9ad8d");
      ball(b, [0, 0.32, 0.36], [0.15, 0.13, 0.14], "#7a5a43");
      ball(b, [0, 0.28, 0.47], [0.09, 0.065, 0.06], "#d6bd9f");
      ball(b, [0, 0.31, 0.53], [0.03, 0.022, 0.015], "#2d2224");
      face(b, 0.36, 0.48, 0.06, 0.024);
      for (const side of [-1, 1])
        ball(b, [side * 0.12, 0.42, 0.33], [0.035, 0.03, 0.02], "#5e4433");
      for (const x of [-0.1, 0.1])
        for (const z of [-0.18, 0.2]) {
          const g = node(b, [x, 0.13, z]);
          ball(g, [0, -0.04, 0.01], [0.05, 0.07, 0.06], "#5e4433");
          pet.legs.push(g);
        }
      pet.tail.position.set(0, 0.2, -0.33);
      part(pet.tail, "cone", [0, 0, -0.18], [0.07, 0.38, 0.05], "#6b4d39", {
        rot: [-Math.PI / 2, 0, 0],
      });
      break;
    }
    case 9:
      bird(pet, "#26303d", "#f4f2ee", "#f0a33a", "#1d2530");
      break;
    case 10: {
      for (const side of [-1, 1])
        ball(b, [side * 0.07, 0.535, 0.37], [0.05, 0.06, 0.03], "#2b2a2e");
      face(b, 0.535, 0.385);
      break;
    }
    case 11: {
      for (const side of [-1, 1])
        ball(b, [side * 0.09, 0.5, 0.35], [0.05, 0.04, 0.03], "#f7eadb");
      pet.tail.position.set(0, 0.34, -0.27);
      for (let i = 0; i < 5; i++)
        ball(
          pet.tail,
          [0, 0.03 * i, -0.07 - i * 0.07],
          [0.085, 0.085, 0.06],
          i % 2 ? "#7d2f17" : "#d36a3a",
        );
      break;
    }
    case 12: {
      ball(b, [0, 0.2, 0], [0.2, 0.18, 0.22], "#e8b77d");
      ball(b, [0, 0.17, 0.08], [0.15, 0.13, 0.16], "#fbf0de");
      for (const side of [-1, 1]) {
        ball(b, [side * 0.1, 0.36, 0.08], [0.05, 0.055, 0.03], "#f2a9a9");
        ball(b, [side * 0.1, 0.2, 0.18], [0.06, 0.045, 0.04], "#f6d6b0");
        const g = node(b, [side * 0.09, 0.06, 0.05]);
        ball(g, [0, -0.02, 0.02], [0.035, 0.03, 0.05], "#f2a9a9");
        pet.legs.push(g);
      }
      face(b, 0.27, 0.2, 0.065, 0.025);
      ball(b, [0, 0.23, 0.225], [0.022, 0.018, 0.012], "#e48a8a");
      break;
    }
    case 13: {
      ball(b, [0, 0.2, 0], [0.2, 0.17, 0.24], "#8b6b4e");
      ball(b, [0, 0.18, 0.2], [0.12, 0.11, 0.11], "#e4cfaf");
      ball(b, [0, 0.17, 0.31], [0.025, 0.02, 0.02], "#2d2224");
      face(b, 0.23, 0.27, 0.05, 0.022);
      const up = new T.Vector3(0, 1, 0);
      for (let i = 0; i < 34; i++) {
        // Spines over the upper back, leaving the face clear.
        const az = (i * 2.399) % (Math.PI * 2);
        const el = 0.25 + ((i * 0.618) % 1) * 1.1;
        const n = new T.Vector3(
          Math.sin(az) * Math.cos(el),
          Math.sin(el),
          Math.cos(az) * Math.cos(el),
        );
        if (n.z > 0.35) continue;
        const s = part(
          b,
          "cone",
          [n.x * 0.19, 0.2 + n.y * 0.16, n.z * 0.23],
          [0.035, 0.13, 0.035],
          "#5a4535",
        );
        s.quaternion.setFromUnitVectors(
          up,
          n
            .clone()
            .add(new T.Vector3(0, 0, -0.5))
            .normalize(),
        );
      }
      for (const x of [-0.1, 0.1])
        for (const z of [-0.1, 0.12]) {
          const g = node(b, [x, 0.06, z]);
          ball(g, [0, -0.02, 0], [0.035, 0.04, 0.04], "#5a4535");
          pet.legs.push(g);
        }
      break;
    }
    case 14: {
      ball(b, [0, 0.18, 0], [0.22, 0.15, 0.2], "#6fbf5a");
      ball(b, [0, 0.15, 0.06], [0.17, 0.1, 0.15], "#c9e8a2");
      for (const side of [-1, 1]) {
        ball(b, [side * 0.1, 0.3, 0.1], [0.07, 0.07, 0.07], "#6fbf5a");
        ball(b, [side * 0.1, 0.32, 0.15], [0.04, 0.045, 0.03], "#1f2b22");
        ball(b, [side * 0.09, 0.335, 0.175], [0.012, 0.012, 0.006], "#ffffff");
        const back = node(b, [side * 0.16, 0.1, -0.08]);
        ball(back, [side * 0.03, -0.03, 0.04], [0.06, 0.05, 0.13], "#5aa648");
        pet.legs.push(back);
        const front = node(b, [side * 0.1, 0.08, 0.14]);
        ball(front, [0, -0.04, 0.02], [0.035, 0.06, 0.04], "#5aa648");
        pet.legs.push(front);
      }
      ball(b, [0, 0.16, 0.2], [0.1, 0.012, 0.02], "#3d6d33");
      break;
    }
    case 15: {
      ball(b, [0, 0.2, 0], [0.24, 0.15, 0.27], "#5f8a4c");
      for (const [x, z] of [
        [0, 0],
        [0.11, 0.1],
        [-0.11, 0.1],
        [0.11, -0.1],
        [-0.11, -0.1],
        [0, 0.17],
        [0, -0.17],
      ])
        ball(b, [x, 0.3, z], [0.07, 0.04, 0.07], "#7fa868");
      ball(b, [0, 0.1, 0], [0.25, 0.04, 0.28], "#d8c98f");
      ball(b, [0, 0.18, 0.33], [0.09, 0.08, 0.1], "#a8c27a");
      face(b, 0.21, 0.4, 0.045, 0.02);
      for (const x of [-0.17, 0.17])
        for (const z of [-0.16, 0.16]) {
          const g = node(b, [x, 0.1, z]);
          ball(g, [0, -0.03, 0], [0.05, 0.05, 0.06], "#a8c27a");
          pet.legs.push(g);
        }
      break;
    }
    case 16:
      bird(pet, "#ffd85a", "#ffe9a3", "#f29b38", "#f2c443");
      break;
    case 18: {
      for (const [x, y, z] of [
        [0, 0.36, 0],
        [0.12, 0.33, 0.1],
        [-0.12, 0.33, 0.1],
        [0.12, 0.33, -0.12],
        [-0.12, 0.33, -0.12],
        [0, 0.44, 0.06],
        [0, 0.42, -0.12],
        [0, 0.28, 0.16],
        [0, 0.28, -0.2],
      ])
        ball(b, [x, y, z], [0.15, 0.14, 0.15], "#f6f2ea");
      ball(b, [0, 0.47, 0.26], [0.12, 0.13, 0.12], "#3b3436");
      ball(b, [0, 0.58, 0.22], [0.1, 0.06, 0.08], "#f6f2ea");
      for (const side of [-1, 1]) {
        const ear = ball(
          b,
          [side * 0.13, 0.5, 0.24],
          [0.07, 0.03, 0.04],
          "#3b3436",
        );
        ear.rotation.z = side * -0.4;
      }
      face(b, 0.5, 0.36, 0.05, 0.022);
      for (const x of [-0.1, 0.1])
        for (const z of [-0.14, 0.14]) {
          const g = node(b, [x, 0.2, z]);
          ball(g, [0, -0.08, 0], [0.04, 0.11, 0.04], "#3b3436");
          pet.legs.push(g);
        }
      break;
    }
    case 19: {
      ball(b, [0, 0.25, -0.04], [0.14, 0.12, 0.3], "#f4a6c0");
      ball(b, [0, 0.27, 0.26], [0.17, 0.12, 0.14], "#f4a6c0");
      face(b, 0.3, 0.38, 0.08, 0.022);
      ball(b, [0, 0.24, 0.39], [0.06, 0.01, 0.02], "#c4577a");
      for (const side of [-1, 1])
        for (let i = 0; i < 3; i++) {
          const gill = node(b, [side * 0.16, 0.3 + (i - 1) * 0.05, 0.22]);
          gill.rotation.z = side * (0.5 + (i - 1) * 0.5);
          ball(gill, [side * 0.07, 0, 0], [0.08, 0.02, 0.02], "#e0568a");
          pet.sway.push(gill);
        }
      for (const x of [-0.12, 0.12])
        for (const z of [-0.14, 0.12]) {
          const g = node(b, [x, 0.17, z]);
          ball(g, [0, -0.04, 0], [0.03, 0.05, 0.03], "#f4a6c0");
          pet.legs.push(g);
        }
      pet.tail.position.set(0, 0.26, -0.3);
      ball(pet.tail, [0, 0, -0.14], [0.03, 0.1, 0.18], "#f7bfd2", {
        opacity: 0.85,
      });
      break;
    }
    case 20: {
      // Unicorn foal: rainbow mane and tail, glowing horn.
      part(b, "cone", [0, 0.76, 0.31], [0.03, 0.18, 0.03], "#ffd86b", {
        glow: 0.7,
        rot: [0.5, 0, 0],
      });
      const mane = [
        "#ff9db8",
        "#ffcf7a",
        "#fff28a",
        "#9de8a6",
        "#8fd3ff",
        "#c4a5ff",
      ];
      mane.forEach((c, i) =>
        ball(b, [0, 0.68 - i * 0.05, 0.18 - i * 0.06], [0.06, 0.06, 0.05], c),
      );
      pet.tail.position.set(0, 0.42, -0.28);
      mane.forEach((c, i) =>
        ball(
          pet.tail,
          [0, -0.03 * i, -0.04 - i * 0.045],
          [0.05, 0.05, 0.045],
          c,
        ),
      );
      for (const leg of pet.legs)
        ball(leg, [0, -0.2, 0], [0.065, 0.03, 0.07], "#c9b6e8");
      break;
    }
    case 21: {
      bird(pet, "#ff7a3d", "#ffc06b", "#ffd86b", "#ff5a2e", 0.35);
      for (let i = 0; i < 3; i++) {
        const f = node(pet.tail, [(i - 1) * 0.05, 0, 0]);
        part(
          f,
          "cone",
          [0, 0, -0.16],
          [0.035, 0.32, 0.02],
          i === 1 ? "#ffd86b" : "#ff9a3d",
          { glow: 0.8, rot: [-Math.PI / 2 - 0.4, 0, (i - 1) * 0.3] },
        );
      }
      pet.tail.position.set(0, 0.28, -0.14);
      ball(b, [0, 0.76, 0.0], [0.03, 0.06, 0.03], "#ffd86b", { glow: 0.9 });
      break;
    }
    case 22: {
      ball(b, [0, 0.18, 0], [0.24, 0.19, 0.24], "#5fd6c2", {
        opacity: 0.82,
        glow: 0.15,
      });
      ball(b, [0, 0.16, 0], [0.12, 0.09, 0.12], "#2fa596", { opacity: 0.9 });
      ball(b, [-0.07, 0.29, 0.14], [0.05, 0.03, 0.03], "#ffffff", {
        opacity: 0.7,
      });
      face(b, 0.22, 0.22, 0.07, 0.03);
      ball(b, [0, 0.15, 0.235], [0.04, 0.015, 0.01], "#1f6f66");
      break;
    }
    case 23: {
      ball(b, [0, 0.5, 0], [0.2, 0.2, 0.19], "#f7f4ff", {
        opacity: 0.88,
        glow: 0.2,
      });
      part(b, "cone", [0, 0.3, 0], [0.2, 0.32, 0.19], "#f7f4ff", {
        opacity: 0.88,
        glow: 0.2,
        rot: [Math.PI, 0, 0],
      });
      face(b, 0.52, 0.17, 0.07, 0.03);
      for (const side of [-1, 1]) {
        ball(b, [side * 0.11, 0.46, 0.16], [0.035, 0.018, 0.01], "#ffb3c9");
        const arm = node(b, [side * 0.19, 0.42, 0.02], "PetWing");
        arm.userData.side = side;
        ball(arm, [side * 0.04, -0.02, 0], [0.06, 0.08, 0.05], "#f7f4ff", {
          opacity: 0.88,
        });
        pet.wings.push(arm);
      }
      ball(b, [0, 0.42, 0.185], [0.03, 0.035, 0.01], "#4a4060");
      break;
    }
    case 25: {
      ball(b, [0, 0.6, 0], [0.2, 0.15, 0.2], "#c9a7ff", {
        opacity: 0.75,
        glow: 0.6,
      });
      ball(b, [0, 0.56, 0], [0.12, 0.08, 0.12], "#f3d9ff", {
        opacity: 0.9,
        glow: 0.8,
      });
      face(b, 0.6, 0.18, 0.06, 0.024);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const t = node(b, [Math.cos(a) * 0.12, 0.5, Math.sin(a) * 0.12]);
        part(
          t,
          "cyl",
          [0, -0.14, 0],
          [0.012, 0.28, 0.012],
          i % 2 ? "#a7e9ff" : "#e7b8ff",
          { glow: 0.7, opacity: 0.85 },
        );
        pet.sway.push(t);
      }
      break;
    }
  }
  return pet;
}

export function animatePet(pet: Pet, t: number, moving: boolean) {
  const b = pet.body;
  b.position.y = 0;
  b.rotation.z = 0;
  b.scale.set(1, 1, 1);
  const gait = moving ? 14 : 0;
  pet.legs.forEach(
    (l, i) =>
      (l.rotation.x = moving
        ? Math.sin(t * gait + (i % 2) * Math.PI) * 0.55
        : 0),
  );
  pet.tail.rotation.z = Math.sin(t * 7) * 0.35;
  const flap = pet.motion === "float" ? 9 : 5;
  for (const w of pet.wings)
    w.rotation.z =
      w.userData.side *
      Math.sin(t * flap) *
      (pet.motion === "float" ? 0.6 : 0.35);
  pet.sway.forEach((s, i) => (s.rotation.x = Math.sin(t * 2.4 + i) * 0.35));
  switch (pet.motion) {
    case "hop":
      b.position.y = moving
        ? Math.abs(Math.sin(t * 9)) * 0.12
        : Math.max(0, Math.sin(t * 2.2)) ** 8 * 0.1;
      break;
    case "float":
      b.position.y = 0.35 + Math.sin(t * 2) * 0.08;
      break;
    case "swim":
      b.position.y = 0.05 + Math.sin(t * 1.6) * 0.04;
      b.rotation.z = Math.sin(t * 3) * 0.08;
      break;
    case "waddle":
      b.rotation.z = Math.sin(t * (moving ? 10 : 3)) * (moving ? 0.18 : 0.05);
      break;
    case "bounce": {
      const k = Math.abs(Math.sin(t * (moving ? 8 : 3)));
      b.position.y = k * (moving ? 0.14 : 0.04);
      b.scale.set(
        1 + (1 - k) * 0.15,
        1 - (1 - k) * 0.15 + k * 0.08,
        1 + (1 - k) * 0.15,
      );
      break;
    }
  }
}
