import { hairSurface } from "./hair-surface.ts";
import { hairVisual } from "./hair-catalog.ts";
import { mergeCosmeticParts } from "./cosmetic-meshes.ts";
import * as T from "three";
import { part, node, material } from "./shapes.ts";

export const hairStyles = [
  "spiky",
  "flowing",
  "buns",
  "messy",
  "ponytail",
  "bob",
  "braid",
  "tails",
] as const;
export const hairPalette = [
  "#309cf4",
  "#ee446c",
  "#34304e",
  "#c5d4ec",
  "#f5bc28",
  "#be64f0",
  "#f33c98",
  "#26cda6",
];
const hairCache = new Map<string, T.Group>();
const lockGeometries = new Map<string, T.SphereGeometry>();
const hairMaterials = new Map<T.Material, T.MeshStandardMaterial>();

// Closed, tapered locks share the same material as the scalp so they still
// merge into one cosmetic draw. Bend and ridges are baked once per cached look.
function hairLock(
  parent: T.Group,
  color: string,
  position: [number, number, number],
  scale: [number, number, number],
  bend: number,
  bun = false,
) {
  const key = `${bend}:${bun}`;
  let geometry = lockGeometries.get(key);
  if (!geometry) {
    geometry = new T.SphereGeometry(1, 16, 12);
    const points = geometry.getAttribute("position");
    for (let i = 0; i < points.count; i++) {
      const x = points.getX(i),
        y = points.getY(i),
        z = points.getZ(i);
      const t = (1 - y) / 2;
      const angle = Math.atan2(z, x);
      const ridge =
        1 + (bun ? 0.065 : 0.09) * Math.cos(angle * 5 + t * (bun ? 8 : 2));
      const taper = bun ? 1 : 1.12 - 0.65 * t;
      points.setXYZ(i, x * taper * ridge + bend * t * t, y, z * taper * ridge);
    }
    geometry.computeVertexNormals();
    lockGeometries.set(key, geometry);
  }
  const mesh = new T.Mesh(geometry, material(color));
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  parent.add(mesh);
}

export function buildHair(parent: T.Object3D, index: number, capped = false) {
  const cacheKey = `${index}:${capped}`;
  const cached = hairCache.get(cacheKey);
  if (cached) {
    const hair = cached.clone();
    parent.add(hair);
    return hair;
  }
  const visual = hairVisual(index);
  const style = hairStyles[visual.shape];
  const color = visual.color;
  const hair = node(parent, [0, 1.46, -0.07], "VolumetricHair");
  hair.userData.secondaryMotion = true;
  const shell = new T.Mesh(hairSurface(style, capped), material(color));
  shell.name = "HairShell";
  shell.castShadow = true;
  hair.add(shell);
  for (const side of [-1, 1]) {
    if (style === "buns" && !capped)
      hairLock(
        hair,
        color,
        [side * 0.39, 0.32, -0.08],
        [0.19, 0.19, 0.17],
        0,
        true,
      );
    if (style === "tails") {
      hairLock(
        hair,
        color,
        [side * 0.43, -0.34, -0.13],
        [0.15, 0.59, 0.17],
        side * 0.45,
      );
      part(
        hair,
        "torus",
        [side * 0.42, 0.13, -0.1],
        [0.085, 0.065, 0.085],
        "#ffe299",
        { rot: [Math.PI / 2, 0, 0] },
      );
    }
  }
  if (style === "ponytail")
    hairLock(hair, color, [0, -0.29, -0.44], [0.18, 0.66, 0.18], 0.5);
  if (style === "braid") {
    for (let i = 0; i < 6; i++)
      part(
        hair,
        "ball",
        [0.36 + (i % 2) * 0.06, -0.18 - i * 0.115, -0.14],
        [0.105 - i * 0.007, 0.1, 0.095],
        color,
      );
    part(hair, "ball", [0.39, -0.84, -0.14], [0.07, 0.12, 0.07], "#ffe299");
  }
  mergeCosmeticParts(hair);
  // Sculpted locks use their own shading; an expanded outline intersects valleys.
  // The open underside of long cuts must remain visible from the front.
  hair.traverse((mesh) => {
    if (
      !(mesh instanceof T.Mesh) ||
      !(mesh.material instanceof T.MeshStandardMaterial)
    )
      return;
    let finish = hairMaterials.get(mesh.material);
    if (!finish) {
      finish = mesh.material.clone();
      finish.side = T.DoubleSide;
      finish.roughness = 0.8;
      hairMaterials.set(mesh.material, finish);
    }
    mesh.material = finish;
  });
  hairCache.set(cacheKey, hair.clone());
  return hair;
}

// A shared inverted hull adds one inexpensive pass per visible base mesh.
const outline = new T.MeshBasicMaterial({ color: "#43344f", side: T.BackSide });
outline.onBeforeCompile = (shader) => {
  shader.vertexShader = shader.vertexShader.replace(
    "#include <begin_vertex>",
    "#include <begin_vertex>\ntransformed += normal * 0.013;",
  );
};
outline.customProgramCacheKey = () => "simi-outline-v1";
export function outlineModel(model: T.Group) {
  const sources: T.Mesh[] = [];
  model.traverse((o) => {
    // Thin authored brims need their solid surface, never an expanded backface.
    if (o instanceof T.Mesh && !o.name.startsWith("Hat_")) sources.push(o);
  });
  for (const mesh of sources) {
    // The source and hull share geometry and skeleton, including blinking.
    const hull =
      mesh instanceof T.SkinnedMesh
        ? new T.SkinnedMesh(mesh.geometry, outline)
        : new T.Mesh(mesh.geometry, outline);
    hull.name = mesh.name;
    hull.position.copy(mesh.position);
    hull.quaternion.copy(mesh.quaternion);
    hull.scale.copy(mesh.scale);
    if (hull instanceof T.SkinnedMesh && mesh instanceof T.SkinnedMesh) {
      hull.bindMode = mesh.bindMode;
      hull.bind(mesh.skeleton, mesh.bindMatrix);
    }
    hull.morphTargetInfluences = mesh.morphTargetInfluences;
    hull.userData.outline = true;
    mesh.parent!.add(hull);
  }
}
export function rimMaterial(material: T.MeshStandardMaterial) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <opaque_fragment>",
      `
      float rim = pow(1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0), 3.0);
      outgoingLight += vec3(0.19, 0.14, 0.23) * rim;
      #include <opaque_fragment>`,
    );
  };
  material.customProgramCacheKey = () => "simi-rim-v1";
}
export type Expression = "happy" | "surprised" | "wink" | "sleepy";
export function expressionFor(mode: string): Expression {
  return mode === "jump"
    ? "surprised"
    : mode === "victory"
      ? "wink"
      : ["rest", "bench", "think"].includes(mode)
        ? "sleepy"
        : "happy";
}
export function blinkAmount(time: number, seed: number) {
  const period = 3 + (seed % 2000) / 1000;
  const phase = (time + ((seed >>> 3) % 3000) / 1000) % period;
  return phase < 0.04
    ? phase / 0.04
    : phase < 0.16
      ? 1
      : phase < 0.2
        ? (0.2 - phase) / 0.04
        : 0;
}
const smileShape = new T.Shape();
smileShape.moveTo(-1, 0.35);
smileShape.quadraticCurveTo(0, 0.05, 1, 0.35);
smileShape.quadraticCurveTo(0.85, -1, 0, -1);
smileShape.quadraticCurveTo(-0.85, -1, -1, 0.35);
const smileGeometry = new T.ShapeGeometry(smileShape, 12);
export function buildMouth(parent: T.Object3D, _skin: string) {
  const face = node(parent, [0, 1.2, 0.285], "ExpressionMouth");

  const mouth = new T.Mesh(smileGeometry, material("#713b54"));
  mouth.position.z = 0.027;
  mouth.scale.set(0.027, 0.009, 0.003);
  face.add(mouth);
  mouth.name = "Mouth";
  for (const side of [-1, 1])
    part(
      parent,
      "ball",
      [side * 0.22, 1.2, 0.205],
      [0.04, 0.014, 0.003],
      "#ee9298",
    );
  return face;
}

/** Build a genuine one-eye wink from the authored blink, once per shared mesh. */
export function addWink(model: T.Group) {
  model.traverse((o) => {
    if (
      !(o instanceof T.Mesh) ||
      !o.morphTargetDictionary ||
      !o.morphTargetInfluences
    )
      return;
    const blink =
      o.geometry.morphAttributes.position?.[o.morphTargetDictionary.Blink];
    const basis = o.geometry.getAttribute("position");
    if (!blink || o.morphTargetDictionary.Wink !== undefined) return;
    const wink = blink.clone();
    for (let i = 0; i < basis.count; i++)
      if (basis.getX(i) < 0)
        wink.setXYZ(
          i,
          o.geometry.morphTargetsRelative ? 0 : basis.getX(i),
          o.geometry.morphTargetsRelative ? 0 : basis.getY(i),
          o.geometry.morphTargetsRelative ? 0 : basis.getZ(i),
        );
    const index = o.geometry.morphAttributes.position.push(wink) - 1;
    o.morphTargetDictionary.Wink = index;
    o.morphTargetInfluences.push(0);
  });
}
