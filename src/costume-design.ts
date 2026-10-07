import * as T from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";
import { ball, node, part, type Shape } from "./shapes.ts";
import type { StyleSet } from "./collections.ts";

const costumeCache = new Map<string, T.BufferGeometry>();
const costumeMaterial = new T.MeshStandardMaterial({
  vertexColors: true,
  side: T.DoubleSide,
  roughness: 0.7,
});
function cachedCostume(parent: T.Object3D, key: string) {
  const geometry = costumeCache.get(key);
  if (!geometry) return null;
  const group = node(parent);
  group.add(new T.Mesh(geometry, costumeMaterial));
  return group;
}
function bakeCostume(group: T.Group, key: string) {
  group.updateMatrixWorld(true);
  const parts: T.BufferGeometry[] = [];
  const inverse = group.matrixWorld.clone().invert();
  group.traverse((object) => {
    if (
      !(object instanceof T.Mesh) ||
      !(object.material instanceof T.MeshStandardMaterial)
    )
      return;
    const geometry = object.geometry.index
      ? object.geometry.toNonIndexed()
      : object.geometry.clone();
    geometry.applyMatrix4(
      new T.Matrix4().multiplyMatrices(inverse, object.matrixWorld),
    );
    const color = object.material.color;
    const colors = new Float32Array(
      geometry.getAttribute("position").count * 3,
    );
    for (let i = 0; i < colors.length; i += 3)
      colors.set([color.r, color.g, color.b], i);
    geometry.setAttribute("color", new T.BufferAttribute(colors, 3));
    parts.push(geometry);
  });
  const merged = mergeGeometries(parts);
  parts.forEach((part) => part.dispose());
  if (!merged) throw Error("Outfit parts must share mesh attributes");
  const geometry = mergeVertices(merged);
  merged.dispose();
  costumeCache.set(key, geometry);
  group.clear();
  group.add(new T.Mesh(geometry, costumeMaterial));
  return group;
}

// Shared shapes keep the complete outfits readable at the small lobby scale.
const capeGeometry = new T.CylinderGeometry(
  0.29,
  0.52,
  0.72,
  12,
  1,
  true,
  Math.PI * 0.5,
  Math.PI,
);
const capeMaterials = new Map<string, T.MeshStandardMaterial>();
function cape(g: T.Group, s: StyleSet, short = false) {
  let material = capeMaterials.get(s.color);
  if (!material) {
    material = new T.MeshStandardMaterial({
      color: s.color,
      side: T.DoubleSide,
      roughness: 0.8,
    });
    capeMaterials.set(s.color, material);
  }
  const mesh = new T.Mesh(capeGeometry, material);
  mesh.position.set(0, short ? 1.02 : 0.94, -0.06);
  mesh.scale.y = short ? 0.62 : 1;
  g.add(mesh);
  part(g, "torus", [0, 1.26, 0], [0.27, 0.12, 0.25], s.accent, {
    rot: [Math.PI / 2, 0, 0],
  });
}
function emblem(g: T.Group, s: StyleSet, y = 1.05) {
  const shapes: Shape[] = ["oct", "ring", "box", "ico", "torus"];
  const shape = shapes[s.design.motif % shapes.length];
  part(g, shape, [0, y, 0.315], [0.085, 0.1, 0.035], s.accent, {
    glow: s.tier === "Free" ? 0 : 0.3,
    rot: [0, 0, s.design.motif % 2 ? Math.PI / 4 : 0],
  });
}
export function costumeBody(parent: T.Object3D, s: StyleSet, body: number) {
  const key = `body:${s.id}:${body}`;
  const cached = cachedCostume(parent, key);
  if (cached) return cached;
  const g = node(parent);
  const { costume, motif } = s.design;
  const premium = s.tier === "Premium";
  const dark = new T.Color(s.color).multiplyScalar(0.48).getStyle();
  part(g, "box", [0, 0.79, 0.02], [0.53, 0.07, 0.51], dark);
  part(g, "box", [0, 0.79, 0.29], [0.1, 0.08, 0.04], s.accent);
  if (["hero", "royal", "knight", "mage", "ranger"].includes(costume))
    cape(g, s, costume === "ranger");
  if (costume === "hero" || costume === "mecha" || costume === "knight") {
    part(g, "box", [0, 1.05, 0.22], [0.45, 0.35, 0.12], s.color);
    for (const side of [-1, 1]) {
      part(
        g,
        costume === "mecha" ? "box" : "oct",
        [side * 0.34, 1.21, 0],
        [0.17, 0.11, 0.17],
        s.accent,
        { rot: [0, 0, -side * 0.18] },
      );
      part(g, "box", [side * 0.15, 0.94, 0.3], [0.06, 0.14, 0.035], dark, {
        rot: [0, 0, side * 0.3],
      });
    }
    if (costume === "knight") {
      const shield = node(g, [-0.44, 0.94, 0.08]);
      part(shield, "oct", [0, 0, 0], [0.2, 0.27, 0.06], s.color);
      part(shield, "oct", [0, 0, 0.065], [0.12, 0.18, 0.015], s.accent);
    }
    if (costume === "mecha")
      for (const side of [-1, 1]) {
        part(g, "box", [side * 0.22, 1.0, -0.3], [0.14, 0.33, 0.16], dark, {
          rot: [0, 0, side * 0.22],
        });
        part(
          g,
          "cyl",
          [side * 0.24, 0.83, -0.31],
          [0.055, 0.07, 0.055],
          s.accent,
          { glow: 0.6 },
        );
      }
  }
  if (costume === "fighter" || costume === "rogue") {
    for (const side of [-1, 1])
      part(g, "box", [side * 0.1, 1.04, 0.26], [0.07, 0.39, 0.035], s.accent, {
        rot: [0, 0, side * 0.4],
      });
    for (const side of [-1, 1])
      part(g, "box", [side * 0.07, 0.63, 0.29], [0.06, 0.3, 0.025], s.accent, {
        rot: [0, 0, side * 0.18],
      });
    if (costume === "rogue")
      for (const side of [-1, 1]) {
        const dagger = node(g, [side * 0.29, 0.7, 0.05]);
        dagger.rotation.z = side * 0.45;
        part(dagger, "box", [0, -0.14, 0], [0.045, 0.3, 0.035], "#cfdae2");
        part(dagger, "box", [0, 0.03, 0], [0.14, 0.035, 0.05], s.accent);
        part(dagger, "box", [0, 0.1, 0], [0.055, 0.1, 0.05], dark);
      }
  }
  if (costume === "mage") {
    const staff = node(g, [0.46, 0.62, 0.1]);
    staff.rotation.z = -0.12;
    part(staff, "cyl", [0, 0.18, 0], [0.022, 1.15, 0.022], dark);
    part(staff, "ring", [0, 0.79, 0], [0.14, 0.14, 0.025], s.accent);
    part(staff, "oct", [0, 0.79, 0], [0.07, 0.1, 0.04], s.color, { glow: 0.6 });
    for (const side of [-1, 1])
      part(g, "box", [side * 0.17, 0.73, 0.27], [0.1, 0.45, 0.03], s.accent, {
        rot: [0, 0, side * 0.12],
      });
  }
  if (costume === "ranger" || costume === "trainer") {
    part(g, "box", [0, 1.03, 0.28], [0.055, 0.52, 0.045], s.accent, {
      rot: [0, 0, -0.56],
    });
    part(g, "box", [0.25, 0.77, 0.18], [0.2, 0.2, 0.14], dark);
    part(g, "box", [0.25, 0.84, 0.26], [0.21, 0.05, 0.02], s.accent);
    if (costume === "ranger") {
      for (let i = 0; i < 3; i++) {
        part(
          g,
          "cyl",
          [0.14 + i * 0.06, 1.2, -0.28],
          [0.013, 0.47, 0.013],
          s.accent,
          { rot: [0, 0, -0.15] },
        );
        part(
          g,
          "cone",
          [0.17 + i * 0.06, 1.46, -0.28],
          [0.033, 0.1, 0.02],
          s.color,
        );
      }
    } else
      for (let i = 0; i < 3; i++)
        ball(
          g,
          [-0.16 + i * 0.12, 0.81, 0.3],
          [0.037, 0.04, 0.025],
          i % 2 ? s.color : s.accent,
        );
  }
  if (costume === "idol") {
    for (const side of [-1, 1])
      part(g, "oct", [side * 0.11, 1.16, 0.28], [0.12, 0.07, 0.035], s.accent, {
        rot: [0, 0, side * 0.25],
      });
    for (let i = 0; i < 3; i++)
      ball(g, [0, 1.06 - i * 0.095, 0.285], [0.025, 0.025, 0.018], s.accent);
    part(g, "box", [0, 0.65, 0.26], [0.09, 0.28, 0.03], s.accent, {
      rot: [0, 0, 0.15],
    });
  }
  if (costume === "royal") {
    for (const side of [-1, 1]) {
      part(g, "box", [side * 0.17, 0.75, 0.27], [0.1, 0.52, 0.03], s.accent, {
        rot: [0, 0, side * 0.12],
      });
      ball(g, [side * 0.26, 1.23, 0.09], [0.12, 0.055, 0.13], s.accent);
    }
    for (let i = 0; i < 4; i++)
      ball(g, [0, 1.15 - i * 0.075, 0.3], [0.022, 0.022, 0.015], s.accent);
  }
  // Girl coat panels flare; boy panels have a split, straight hem.
  if (["royal", "mage", "idol", "hero"].includes(costume))
    for (const side of [-1, 1]) {
      part(
        g,
        "box",
        [side * (body === 1 ? 0.19 : 0.24), 0.65, 0.02],
        [body === 1 ? 0.12 : 0.2, 0.28, 0.44],
        s.color,
        { rot: [0, 0, body === 1 ? 0 : side * 0.18] },
      );
      part(
        g,
        "box",
        [side * (body === 1 ? 0.19 : 0.26), 0.51, 0.03],
        [body === 1 ? 0.13 : 0.22, 0.035, 0.45],
        s.accent,
        { rot: [0, 0, body === 1 ? 0 : side * 0.18] },
      );
    }
  emblem(g, s);
  // A different clasp arrangement and hem rhythm for every theme.
  for (let i = 0; i < 2 + (motif % 4); i++)
    part(
      g,
      "oct",
      [(i - (1 + (motif % 4)) / 2) * 0.085, 0.88, 0.29],
      [0.018, 0.025, 0.01],
      s.accent,
    );
  if (premium)
    for (const side of [-1, 1]) {
      part(g, "ring", [side * 0.3, 1.22, 0.02], [0.11, 0.11, 0.035], s.accent, {
        rot: [0, side * 0.6, 0],
        glow: 0.25,
      });
      part(g, "oct", [side * 0.32, 1.36, 0], [0.05, 0.12, 0.04], s.accent, {
        rot: [0, 0, -side * 0.3],
        glow: 0.35,
      });
    }
  return bakeCostume(g, key);
}
export function costumeHead(parent: T.Object3D, s: StyleSet) {
  const key = `head:${s.id}`;
  const cached = cachedCostume(parent, key);
  if (cached) return cached;
  const g = node(parent);
  const { costume, motif } = s.design;
  const y = 1.78;
  if (costume === "mage") {
    part(g, "cyl", [0, y - 0.035, 0], [0.58, 0.035, 0.51], s.color);
    part(g, "cone", [0, y + 0.2, -0.015], [0.35, 0.48, 0.32], s.color, {
      rot: [0, 0, -0.1],
    });
    part(g, "cyl", [0, y + 0.03, 0], [0.34, 0.07, 0.32], s.accent);
    part(g, "oct", [0, y + 0.05, 0.32], [0.07, 0.09, 0.025], s.accent);
  } else if (costume === "royal" || costume === "knight") {
    part(g, "torus", [0, y + 0.02, 0], [0.35, 0.11, 0.33], s.accent, {
      rot: [Math.PI / 2, 0, 0],
    });
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      part(
        g,
        "cone",
        [Math.cos(a) * 0.3, y + 0.14, Math.sin(a) * 0.29],
        [0.06, 0.23 + (i % 2) * 0.06, 0.055],
        s.accent,
      );
    }
    part(g, "oct", [0, y + 0.02, 0.35], [0.075, 0.11, 0.03], s.color);
  } else if (costume === "trainer" || costume === "ranger") {
    ball(g, [0, y - 0.04, -0.035], [0.46, 0.15, 0.41], s.color);
    part(g, "box", [0, y - 0.12, 0.39], [0.5, 0.045, 0.28], s.accent, {
      rot: [-0.08, 0, 0],
    });
    part(g, "oct", [0, y - 0.04, 0.39], [0.055, 0.07, 0.02], s.accent);
    if (costume === "ranger")
      part(g, "oct", [0.3, y + 0.14, 0], [0.07, 0.26, 0.025], s.accent, {
        rot: [0, 0, -0.3],
      });
  } else if (costume === "mecha" || costume === "idol") {
    for (const side of [-1, 1]) {
      ball(g, [side * 0.43, 1.48, 0], [0.09, 0.14, 0.14], s.color);
      part(g, "ring", [side * 0.5, 1.48, 0], [0.08, 0.08, 0.025], s.accent, {
        rot: [0, Math.PI / 2, 0],
        glow: 0.25,
      });
      part(g, "box", [side * 0.42, 1.69, -0.04], [0.04, 0.21, 0.04], s.accent, {
        rot: [0, 0, -side * 0.15],
      });
    }
    if (costume === "mecha")
      part(g, "box", [0, 1.65, 0.4], [0.62, 0.07, 0.035], s.accent, {
        glow: 0.35,
      });
  } else {
    part(g, "torus", [0, 1.74, 0], [0.44, 0.06, 0.39], s.color, {
      rot: [Math.PI / 2, 0, 0],
    });
    for (const side of [-1, 1])
      part(
        g,
        "box",
        [side * 0.36, 1.58, -0.2],
        [0.065, 0.32, 0.025],
        s.accent,
        { rot: [0, 0, side * 0.24] },
      );
    part(g, "oct", [0, 1.74, 0.39], [0.065, 0.09, 0.025], s.accent);
    if (costume === "hero")
      for (const side of [-1, 1])
        part(g, "oct", [side * 0.32, 1.84, 0], [0.065, 0.15, 0.03], s.accent, {
          rot: [0, 0, -side * 0.5],
        });
  }
  // Tiny pins make palettes recognizable without hiding the face.
  for (let i = 0; i < 1 + (motif % 3); i++)
    ball(g, [0.13 + i * 0.05, 1.77, 0.32], [0.018, 0.02, 0.015], s.accent);
  return bakeCostume(g, key);
}
