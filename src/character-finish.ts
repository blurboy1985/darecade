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
  // Back volume stops above the nape; the face remains completely exposed.
  if (!capped) part(hair, "ball", [0, 0.12, -0.1], [0.44, 0.39, 0.33], color);
  if (capped) part(hair, "ball", [0, -0.02, -0.1], [0.39, 0.25, 0.3], color);
  // Rear clumps break the smooth sphere silhouette from the gameplay camera.
  for (let i = -2; i <= 2; i++) {
    part(
      hair,
      "ball",
      [i * 0.15, -0.02, -0.34],
      [0.115, 0.28 + (2 - Math.abs(i)) * 0.035, 0.12],
      color,
      { rot: [-0.18, 0, -i * 0.11] },
    );
    part(hair, "cone", [i * 0.14, -0.29, -0.29], [0.1, 0.19, 0.1], color, {
      rot: [Math.PI, 0, i * 0.12],
    });
  }
  for (let i = -2; i <= 2; i++) {
    const strand = part(
      hair,
      "ball",
      [i * 0.145, 0.22 - Math.abs(i) * 0.025, 0.275],
      [0.125, style === "spiky" ? 0.14 : style === "messy" ? 0.18 : 0.24, 0.11],
      color,
    );
    strand.rotation.z = i * -0.15 + 0.12;
  }
  for (const side of [-1, 1]) {
    part(hair, "ball", [side * 0.39, -0.1, 0.075], [0.12, 0.29, 0.17], color, {
      rot: [0, 0, side * 0.14],
    });
    if (style === "buns" && !capped)
      part(hair, "ball", [side * 0.39, 0.32, -0.08], [0.19, 0.19, 0.17], color);
    if (style === "tails") {
      part(
        hair,
        "ball",
        [side * 0.43, -0.19, -0.1],
        [0.16, 0.43, 0.18],
        color,
        { rot: [0, 0, side * 0.24] },
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
    if (style === "flowing")
      for (let i = 0; i < 3; i++)
        part(
          hair,
          "ball",
          [side * (0.16 + i * 0.1), -0.31, -0.23],
          [0.13, 0.48 - i * 0.025, 0.14],
          color,
          { rot: [-0.12, 0, side * 0.1] },
        );
    if (style === "bob")
      part(
        hair,
        "ball",
        [side * 0.31, -0.16, -0.12],
        [0.16, 0.25, 0.21],
        color,
      );
  }
  if (!capped && (style === "spiky" || style === "messy"))
    for (let i = -2; i <= 2; i++)
      part(
        hair,
        "cone",
        [i * 0.14, 0.51 - Math.abs(i) * 0.04, 0.02],
        [0.115, style === "messy" ? 0.36 + (i % 2) * 0.1 : 0.52, 0.12],
        color,
        { rot: [0.1, 0, -i * (style === "messy" ? 0.45 : 0.27)] },
      );
  if (style === "ponytail")
    part(hair, "ball", [0, -0.12, -0.4], [0.18, 0.48, 0.2], color, {
      rot: [-0.35, 0, 0],
    });
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
  if (capped) {
    // A fitted crown: compress upper strands below the brim, retaining nape and locks.
    hair.updateMatrixWorld(true);
    for (const child of hair.children)
      if (child instanceof T.Mesh) {
        const geometry = child.geometry.clone();
        geometry.applyMatrix4(child.matrix);
        const positions = geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          const y = positions.getY(i);
          positions.setY(i, Math.min(y, 0.2));
          if (y > 0.06) {
            positions.setX(i, positions.getX(i) * 0.83);
            positions.setZ(i, positions.getZ(i) * 0.83);
          }
        }
        geometry.computeVertexNormals();
        child.geometry = geometry;
        child.position.set(0, 0, 0);
        child.rotation.set(0, 0, 0);
        child.scale.set(1, 1, 1);
      }
  }
  mergeCosmeticParts(hair);
  outlineModel(hair);
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
