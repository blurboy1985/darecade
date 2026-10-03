import * as T from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { outfits, skins } from "./state";
import { clothingNames } from "./appearance";
export {
  clothingNames,
  hairNames,
  petNames,
  accessoryNames,
} from "./appearance";
export type Look = {
  outfit: number;
  skin: number;
  hat: number;
  gender?: number;
  clothing?: number;
  hair?: number;
  pet?: number;
  accessory?: number;
};
export type Avatar = {
  root: T.Group;
  model: T.Group;
  left: T.Group;
  right: T.Group;
  legs: T.Group[];
  elbows: T.Object3D[];
  knees: T.Object3D[];
  hands: T.Object3D[];
  head: T.Object3D;
  spine: T.Object3D;
  hat: T.Group;
  extras: T.Group;
  pet: { root: T.Group; legs: T.Group[]; tail: T.Group } | null;
  look: Look;
  last: T.Vector3;
  materials: Map<string, T.MeshStandardMaterial>;
  moving: boolean;
  rig: Map<string, { bone: T.Object3D; rest: T.Quaternion }>;
};
let template: T.Group;
let loading: Promise<void> | null = null;
export function loadCharacter() {
  return (loading ??= new GLTFLoader()
    .loadAsync("/models/neighbour-kaykit.glb?v=kaykit-1")
    .then((g) => {
      template = g.scene;
      template.scale.setScalar(KAYKIT_SCALE);
    }));
}
// KayKit Adventurers (CC0, Kay Lousberg). All four characters share one rig, so
// each saved look picks a body set and a head set by toggling mesh visibility.
const KAYKIT_SCALE = 0.86;
const bodySets = [
  ["Rogue", false],
  ["Rogue", true],
  ["Mage", false],
  ["Mage", true],
  ["Knight", false],
  ["Knight", true],
  ["Barbarian", false],
  ["Barbarian", true],
] as const;
const headSets = [
  ["Rogue_Head"],
  ["Mage_Head"],
  ["Knight_Head"],
  ["Barbarian_Head"],
  ["Rogue_Head_Hooded"],
  ["Mage_Head", "Mage_Hat"],
  ["Knight_Head", "Knight_Helmet"],
  ["Barbarian_Head", "Barbarian_Hat"],
];
const bodyParts = ["Body", "ArmLeft", "ArmRight", "LegLeft", "LegRight"];
const headwear = ["Mage_Hat", "Knight_Helmet", "Barbarian_Hat"];
// Each KayKit texture is an 8 x 4 grid of 128 x 256 px gradient swatches. The
// first swatch is skin in all four; the first two swatches of the second row
// carry each outfit's main colour (tunic, robe, plume/cape, hood, wizard hat).
const tintCache = new Map<string, T.Texture>();
function tintedTexture(src: T.Texture, skin: string, outfit: string) {
  const key = `${src.uuid}|${skin}|${outfit}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  const img = src.image as CanvasImageSource & { width: number; height: number };
  if (typeof document === "undefined" || !img?.width) return src;
  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  const cw = img.width / 8,
    ch = img.height / 4;
  const paint = (col: number, row: number, hex: string, shade = 1) => {
    const target = new T.Color(hex).convertLinearToSRGB();
    const want = [target.r, target.g, target.b].map((v) => v * 255 * shade);
    const data = ctx.getImageData(col * cw, row * ch, cw, ch);
    const px = data.data;
    // Keep each swatch's light-to-dark gradient but take the hue from the target.
    const lum = (i: number) => 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
    let mean = 0;
    for (let i = 0; i < px.length; i += 4) mean += lum(i);
    mean = Math.max(1, mean / (px.length / 4));
    for (let i = 0; i < px.length; i += 4) {
      const k = lum(i) / mean;
      for (let c = 0; c < 3; c++) px[i + c] = Math.min(255, want[c] * k);
    }
    ctx.putImageData(data, col * cw, row * ch);
  };
  paint(0, 0, skin);
  paint(0, 1, outfit);
  paint(1, 1, outfit, 0.82);
  const tex = new T.CanvasTexture(canvas);
  tex.flipY = src.flipY;
  tex.colorSpace = src.colorSpace;
  tex.magFilter = src.magFilter;
  tex.minFilter = src.minFilter;
  tex.wrapS = src.wrapS;
  tex.wrapT = src.wrapT;
  tintCache.set(key, tex);
  return tex;
}
const unitBall = new T.SphereGeometry(1, 12, 8);
const mats = new Map<string, T.MeshStandardMaterial>();
function mat(color: string, glow = false) {
  const key = color + glow;
  if (!mats.has(key))
    mats.set(
      key,
      new T.MeshStandardMaterial({
        color,
        roughness: 0.7,
        emissive: glow ? color : "#000000",
        emissiveIntensity: glow ? 0.45 : 0,
      }),
    );
  return mats.get(key)!;
}
function ellipsoid(
  parent: T.Object3D,
  p: number[],
  scale: number[],
  color: string,
  glow = false,
) {
  const m = new T.Mesh(unitBall, mat(color, glow));
  m.position.set(p[0], p[1], p[2]);
  m.scale.set(scale[0], scale[1], scale[2]);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function group(parent: T.Object3D, p: number[] = [0, 0, 0]) {
  const g = new T.Group();
  g.position.set(p[0], p[1], p[2]);
  parent.add(g);
  return g;
}
export function createAvatar(
  parent: T.Object3D,
  x: number,
  z: number,
  color: string,
  skin = "#e7b18c",
  hat = 0,
  options: Partial<Look> = {},
): Avatar {
  if (!template) throw Error("Character asset is not ready");
  const root = new T.Group();
  root.position.set(x, 0.1, z);
  parent.add(root);
  const model = cloneSkeleton(template) as T.Group;
  root.add(model);
  const materials = new Map<string, T.MeshStandardMaterial>();
  model.traverse((o) => {
    if (o instanceof T.Mesh) {
      const original = o.material as T.MeshStandardMaterial;
      let m = materials.get(original.name);
      if (!m) {
        m = original.clone();
        m.userData.source = original.map;
        materials.set(original.name, m);
      }
      o.material = m;
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  model.updateMatrixWorld(true);
  const rig = new Map<string, { bone: T.Object3D; rest: T.Quaternion }>();
  model.traverse((bone) => {
    if (bone instanceof T.Bone)
      rig.set(bone.name, {
        bone,
        rest: bone.getWorldQuaternion(new T.Quaternion()),
      });
  });
  // Neutral-space controls preserve the existing Blender prop timelines while
  // translating their rotations onto the connected, independently cloned skin.
  const controls = new Map<string, T.Group>();
  const node = (name: string) => {
    if (!controls.has(name)) controls.set(name, new T.Group());
    return controls.get(name)!;
  };
  const a: Avatar = {
    root,
    model,
    left: node("LeftArm"),
    right: node("RightArm"),
    legs: [node("LeftLeg"), node("RightLeg")],
    elbows: [node("LeftElbow"), node("RightElbow")],
    knees: [node("LeftKnee"), node("RightKnee")],
    hands: [node("LeftHand"), node("RightHand")],
    head: node("Head"),
    spine: node("Spine"),
    hat: new T.Group(),
    extras: new T.Group(),
    pet: null,
    look: {
      outfit: Math.max(0, outfits.indexOf(color)),
      skin: Math.max(0, skins.indexOf(skin)),
      hat,
      ...options,
    },
    last: root.position.clone(),
    materials,
    moving: false,
    rig,
  };
  root.add(a.hat, a.extras);
  root.userData.avatar = a;
  applyLook(a, a.look, color, skin);
  poseSkin(a);
  return a;
}
export function applyLook(
  a: Avatar,
  look: Look,
  color = outfits[look.outfit],
  skin = skins[look.skin],
) {
  const previous = a.look;
  a.look = { clothing: 0, hair: 0, pet: 0, accessory: 0, ...look };
  for (const m of a.materials.values())
    if (m.userData.source) {
      m.map = tintedTexture(m.userData.source, skin, color);
      m.needsUpdate = true;
    }
  const [outfit, cape] = bodySets[a.look.clothing! % clothingNames.length];
  const head = headSets[a.look.hair! % headSets.length];
  a.model.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    const [who, part] = [o.name.split("_")[0], o.name.slice(o.name.indexOf("_") + 1)];
    if (bodyParts.includes(part)) o.visible = who === outfit;
    else if (part === "Cape") o.visible = cape && who === outfit;
    else if (o.name.includes("Head") || headwear.includes(o.name))
      o.visible =
        head.includes(o.name) && !(look.hat && headwear.includes(o.name));
  });
  a.hat.clear();
  if (look.hat === 1) {
    ellipsoid(a.hat, [0, 1.83, 0], [0.24, 0.12, 0.22], "#e7a769");
    ellipsoid(a.hat, [0, 1.78, 0.025], [0.29, 0.035, 0.28], "#e7a769");
  }
  if (look.hat === 2) {
    ellipsoid(a.hat, [0, 1.83, 0], [0.226, 0.12, 0.205], "#b4a0f5");
    ellipsoid(a.hat, [0, 1.78, 0.2], [0.23, 0.026, 0.18], "#b4a0f5");
  }
  if (look.hat === 3) {
    ellipsoid(a.hat, [0, 1.9, 0], [0.1, 0.13, 0.1], "#8cb459");
    const leaf = ellipsoid(
      a.hat,
      [0.11, 2.03, 0],
      [0.15, 0.045, 0.07],
      "#9fd567",
    );
    leaf.rotation.z = 0.5;
  }
  // Earned hats were sized for the earlier head; fit them to the KayKit head
  // (about 0.87 wide, crown at y 1.78 after scaling).
  for (const part of a.hat.children) {
    part.position.x *= 1.85;
    part.position.z *= 1.85;
    part.position.y -= 0.16;
    part.scale.x *= 1.85;
    part.scale.z *= 1.85;
    part.scale.y *= 1.25;
  }
  a.extras.clear();
  if (a.look.accessory === 1)
    for (let i = 0; i < 3; i++) {
      const star = group(a.extras);
      star.userData.orbit = i;
      for (const rot of [0, Math.PI / 2]) {
        const ray = ellipsoid(
          star,
          [0, 0, 0],
          [0.035, 0.13, 0.035],
          "#ffe7a5",
          true,
        );
        ray.rotation.z = rot;
      }
    }
  if (a.look.accessory === 2)
    for (const side of [-1, 1]) {
      const wing = group(a.extras, [side * 0.14, 1.18, -0.18]);
      wing.name = "Wing";
      wing.userData.side = side;
      const top = ellipsoid(
        wing,
        [side * 0.24, 0.12, -0.04],
        [0.28, 0.35, 0.045],
        "#c8a7ed",
      );
      top.rotation.z = -side * 0.45;
      ellipsoid(wing, [side * 0.17, -0.22, 0], [0.2, 0.22, 0.035], "#9ddccb");
      ellipsoid(wing, [side * 0.24, 0.15, 0.01], [0.13, 0.22, 0.02], "#f8d89a");
    }
  if (a.look.accessory === 3)
    for (let i = 0; i < 4; i++) {
      const firefly = ellipsoid(
        a.extras,
        [0, 1, 0],
        [0.025, 0.025, 0.025],
        i % 2 ? "#e3d0ff" : "#d0ffa8",
        true,
      );
      firefly.userData.orbit = i;
    }
  if (a.look.accessory === 4) {
    const halo = group(a.extras, [0, 2.08, 0]);
    halo.name = "Halo";
    for (let i = 0; i < 24; i++) {
      const r = (i * Math.PI) / 12;
      ellipsoid(
        halo,
        [Math.cos(r) * 0.36, 0, Math.sin(r) * 0.3],
        [0.024, 0.018, 0.024],
        "#ffe6a2",
        true,
      );
    }
    ellipsoid(halo, [0.37, 0.04, 0], [0.045, 0.085, 0.025], "#fff2bf", true);
  }
  if (a.look.accessory === 5) {
    const crown = group(a.extras, [0, 1.86, 0]);
    crown.name = "Crown";
    for (let i = 0; i < 5; i++) {
      const crystal = ellipsoid(
        crown,
        [(i - 2) * 0.11, 0.04 - Math.abs(i - 2) * 0.015, 0.07],
        [0.045, 0.1 - Math.abs(i - 2) * 0.016, 0.035],
        ["#bd9aff", "#86ede6", "#ffe1a4"][i % 3],
        true,
      );
      crystal.rotation.z = (2 - i) * 0.18;
    }
  }
  if (a.look.accessory === 6) {
    const ribbon = group(a.extras, [0, 1.22, -0.19]);
    ribbon.name = "Ribbon";
    for (let j = 0; j < 4; j++)
      for (let i = 0; i < 16; i++) {
        const angle = (i / 15) * Math.PI;
        ellipsoid(
          ribbon,
          [
            Math.cos(angle) * (0.42 + j * 0.042),
            Math.sin(angle) * (0.42 + j * 0.042),
            0,
          ],
          [0.038, 0.04, 0.026],
          ["#ffa6b5", "#ffdb85", "#a8eccb", "#b8acfa"][j],
          true,
        );
      }
  }
  if (a.look.accessory === 7)
    for (let i = 0; i < 7; i++) {
      const bubble = group(a.extras);
      bubble.userData.orbit = i;
      ellipsoid(
        bubble,
        [0, 0, 0],
        [0.06, 0.06, 0.06],
        i % 2 ? "#c1eaff" : "#e5c2fa",
        true,
      );
      ellipsoid(
        bubble,
        [-0.017, 0.025, 0.05],
        [0.018, 0.009, 0.009],
        "#ffffff",
        true,
      );
    }
  if (previous.pet !== a.look.pet || (!!a.look.pet && !a.pet)) {
    a.pet?.root.removeFromParent();
    a.pet = a.look.pet ? makePet(a.root.parent!, a.look.pet) : null;
    if (a.pet)
      a.pet.root.position
        .copy(a.root.position)
        .add(new T.Vector3(0.85, 0, 0.7));
  }
}
function makePet(parent: T.Object3D, kind: number) {
  const root = group(parent);
  root.userData.companion = true;
  const legs: T.Group[] = [];
  const tail = group(root, [0, 0.32, -0.28]);
  if (kind === 3) {
    ellipsoid(root, [0, 0.5, 0], [0.23, 0.2, 0.25], "#ddedeb");
    ellipsoid(root, [0, 0.52, 0.2], [0.17, 0.085, 0.065], "#364f6a");
    for (const x of [-0.07, 0.07])
      ellipsoid(root, [x, 0.54, 0.26], [0.025, 0.028, 0.012], "#baf5d9", true);
    ellipsoid(root, [0, 0.73, 0], [0.025, 0.1, 0.025], "#e7c077");
    ellipsoid(root, [0, 0.84, 0], [0.06, 0.06, 0.06], "#e7c077", true);
  } else if (kind === 7) {
    ellipsoid(root, [0, 0.43, 0], [0.24, 0.28, 0.21], "#b29bbf");
    ellipsoid(root, [0, 0.41, 0.16], [0.18, 0.21, 0.08], "#f2e2cc");
    for (const side of [-1, 1]) {
      ellipsoid(
        root,
        [side * 0.1, 0.55, 0.19],
        [0.105, 0.115, 0.06],
        "#f5edd9",
      );
      ellipsoid(
        root,
        [side * 0.1, 0.55, 0.246],
        [0.042, 0.052, 0.02],
        "#343449",
      );
      ellipsoid(
        root,
        [side * 0.1 - 0.01, 0.575, 0.263],
        [0.014, 0.017, 0.006],
        "#ffffff",
      );
      const wing = group(root, [side * 0.22, 0.46, 0]);
      wing.name = "PetWing";
      wing.userData.side = side;
      ellipsoid(wing, [side * 0.08, -0.02, 0], [0.14, 0.2, 0.07], "#88739d");
      ellipsoid(root, [side * 0.1, 0.16, 0.04], [0.07, 0.035, 0.08], "#e6b55c");
    }
    ellipsoid(root, [0, 0.46, 0.25], [0.045, 0.055, 0.055], "#e6b55c");
  } else {
    const color =
      kind === 4
        ? "#f0d5cd"
        : kind === 5
          ? "#df9457"
          : kind === 6
            ? "#93cdb1"
            : kind === 1
              ? "#b2a0bd"
              : "#ca9a69";
    ellipsoid(root, [0, 0.31, 0], [0.19, 0.2, 0.31], color);
    ellipsoid(root, [0, 0.5, 0.22], [0.2, 0.19, 0.18], color);
    ellipsoid(root, [0, 0.43, 0.36], [0.11, 0.085, 0.095], "#f4dfb9");
    for (const side of [-1, 1]) {
      const ear = ellipsoid(
        root,
        [side * 0.14, 0.65, 0.18],
        kind === 4
          ? [0.06, 0.26, 0.055]
          : kind === 5
            ? [0.08, 0.16, 0.065]
            : kind === 6
              ? [0.045, 0.07, 0.04]
              : kind === 1
                ? [0.075, 0.16, 0.06]
                : [0.1, 0.2, 0.065],
        kind === 4
          ? "#e8b9b5"
          : kind === 5
            ? "#7f5847"
            : kind === 6
              ? "#e6c572"
              : kind === 1
                ? "#aa91b5"
                : "#8b654c",
      );
      ear.rotation.z = side * ([1, 4, 5, 6].includes(kind) ? 0.2 : 0.7);
      ellipsoid(
        root,
        [side * 0.075, 0.53, 0.37],
        [0.027, 0.032, 0.014],
        "#243c45",
      );
    }
    ellipsoid(root, [0, 0.45, 0.44], [0.034, 0.025, 0.02], "#684c53");
    for (const x of [-0.12, 0.12])
      for (const z of [-0.18, 0.18]) {
        const leg = group(root, [x, 0.22, z]);
        ellipsoid(leg, [0, -0.08, 0], [0.06, 0.13, 0.065], color);
        legs.push(leg);
      }
    const t = ellipsoid(tail, [0, 0.1, -0.09], [0.07, 0.18, 0.075], color);
    t.rotation.x = -0.8;
    if (kind === 4) t.scale.set(0.08, 0.08, 0.08);
    if (kind === 5) {
      t.scale.set(0.13, 0.25, 0.14);
      ellipsoid(tail, [0, 0.2, -0.2], [0.12, 0.12, 0.1], "#fff1d8");
    }
    if (kind === 6) {
      for (const side of [-1, 1]) {
        const wing = group(root, [side * 0.14, 0.43, -0.07]);
        wing.name = "PetWing";
        wing.userData.side = side;
        ellipsoid(
          wing,
          [side * 0.14, 0.08, -0.03],
          [0.2, 0.12, 0.045],
          "#caacf0",
        );
        ellipsoid(wing, [side * 0.1, 0.04, 0], [0.13, 0.065, 0.02], "#e9d7fa");
      }
      for (let i = 0; i < 3; i++)
        ellipsoid(
          root,
          [0, 0.47 - i * 0.035, -0.1 - i * 0.1],
          [0.04, 0.07, 0.04],
          "#e9cb79",
        );
    }
  }
  return { root, legs, tail };
}
export function animateDetails(
  a: Avatar,
  time: number,
  mode = "idle",
  reduced = false,
) {
  const travel = a.root.position.distanceTo(a.last);
  a.moving = travel > 0.008;
  a.last.copy(a.root.position);
  const t = reduced ? 0 : time;
  const gait = Math.sin(t * 10);
  const seated = ["rest", "bench", "swing"].includes(mode);
  const performing = [
    "dragon",
    "pet",
    "bell",
    "arcade",
    "swing",
    "bench",
  ].includes(mode);
  a.elbows.forEach(
    (e, i) =>
      (e.rotation.x = seated
        ? -0.05
        : mode === "pet"
          ? i === 1
            ? -0.15
            : -0.8
          : mode === "arcade"
            ? -0.12
            : mode === "think"
              ? -1.1
              : mode === "wave" && i === 1
                ? -0.9
                : a.moving
                  ? -0.4
                  : -0.12),
  );
  a.knees.forEach(
    (k, i) =>
      (k.rotation.x = seated
        ? 1.35
        : mode === "pet"
          ? 0.9
          : a.moving
            ? Math.max(0, -a.legs[i].rotation.x) * 1.3
            : 0.04),
  );
  a.hands.forEach(
    (h, i) =>
      (h.rotation.z = mode === "wave" && i === 1 ? Math.sin(t * 9) * 0.25 : 0),
  );
  a.head.rotation.set(
    0,
    !performing && !a.moving ? Math.sin(t * 0.8) * 0.09 : 0,
    mode === "think" ? 0.09 : 0,
  );
  a.spine.rotation.z = !performing && a.moving ? gait * 0.025 : 0;
  if (!performing && ["idle", "walk", "jog"].includes(mode)) {
    a.left.rotation.x = a.moving
      ? -a.legs[0].rotation.x * 0.65
      : Math.sin(t * 1.9) * 0.035;
    a.right.rotation.x = a.moving
      ? -a.legs[1].rotation.x * 0.65
      : -Math.sin(t * 1.9) * 0.035;
  }
  for (const child of a.extras.children) {
    if (child.name === "Wing")
      child.rotation.y =
        child.userData.side * (0.15 + Math.sin(t * 3.5) * 0.22);
    else if (["Halo", "Crown", "Ribbon"].includes(child.name))
      child.rotation.y =
        child.name === "Halo" ? t * 0.35 : Math.sin(t * 1.8) * 0.08;
    else {
      const i = child.userData.orbit || 0;
      child.position.set(
        Math.cos(t * 1.4 + i * 2.1) * 0.55,
        2.18 + Math.sin(t * 1.8 + i) * 0.14,
        Math.sin(t * 1.4 + i * 2.1) * 0.55,
      );
      child.rotation.z = t * 0.8 + i;
    }
  }
  poseSkin(a);
  if (a.pet) {
    const target = new T.Vector3(0.8, 0.02, 0.9)
      .applyAxisAngle(new T.Vector3(0, 1, 0), a.root.rotation.y)
      .add(a.root.position);
    target.y = 0.1;
    const pet = a.pet;
    pet.root.position.lerp(target, 0.1);
    pet.root.rotation.y = Math.atan2(
      target.x - pet.root.position.x,
      target.z - pet.root.position.z,
    );
    pet.legs.forEach(
      (l, i) =>
        (l.rotation.x = a.moving
          ? Math.sin(t * 14 + (i % 2) * Math.PI) * 0.55
          : 0),
    );
    pet.tail.rotation.z = Math.sin(t * 7) * 0.35;
    pet.root.children
      .filter((c) => c.name === "PetWing")
      .forEach((c) => {
        c.rotation.z = c.userData.side * Math.sin(t * 5) * 0.35;
      });
    if (a.look.pet === 4 && a.moving)
      pet.root.position.y += Math.abs(Math.sin(t * 9)) * 0.1;
    if ([3, 7].includes(a.look.pet!))
      pet.root.position.y = 0.1 + Math.sin(t * 2) * 0.08;
  }
}
const axisZ = new T.Vector3(0, 0, 1);
const rootQ = new T.Quaternion(),
  parentQ = new T.Quaternion(),
  targetQ = new T.Quaternion();
function poseSkin(a: Avatar) {
  a.root.updateMatrixWorld(true);
  a.root.getWorldQuaternion(rootQ);
  const set = (name: string, delta: T.Quaternion) => {
    const entry = a.rig.get(name);
    if (!entry) return;
    targetQ.copy(rootQ).multiply(delta).multiply(entry.rest);
    entry.bone.parent!.getWorldQuaternion(parentQ).invert();
    entry.bone.quaternion.copy(parentQ).multiply(targetQ);
    entry.bone.updateMatrixWorld(true);
  };
  const torso = a.spine.quaternion.clone();
  set("chest", torso);
  const head = torso.clone().multiply(a.head.quaternion);
  set("head", head);
  // Skin rest arms are horizontal. Rotate into the game's neutral arms-down pose.
  for (const [i, suffix] of ["r", "l"].entries()) {
    const bone = (n: string) => n + suffix; // GLTFLoader strips "." from "upperarm.l"
    const arm = (i === 0 ? a.left : a.right).quaternion;
    const down = new T.Quaternion().setFromAxisAngle(
      axisZ,
      i === 0 ? 1.4 : -1.4,
    );
    const upper = torso.clone().multiply(arm);
    set(bone("upperarm"), upper.clone().multiply(down));
    const lower = upper.clone().multiply(a.elbows[i].quaternion);
    set(bone("lowerarm"), lower.clone().multiply(down));
    set(bone("wrist"), lower.multiply(a.hands[i].quaternion).multiply(down));
    const leg = a.legs[i].quaternion.clone();
    set(bone("upperleg"), leg);
    leg.multiply(a.knees[i].quaternion);
    set(bone("lowerleg"), leg);
    set(bone("foot"), leg);
  }
  // The authored sit/swing/slide clips place the hips for the earlier, longer-
  // legged rig (thigh at 0.73 m). KayKit hips sit at 0.45 m, so lift the body
  // as the thighs come forward to keep seats, swings and the slide aligned.
  const pitch = -(a.legs[0].rotation.x + a.legs[1].rotation.x) / 2;
  const seated = Math.min(1, Math.max(0, pitch / 1.35));
  a.model.position.y = 0.28 * seated;
  // Shorter thighs also leave the seat behind the hips; sit back onto it.
  a.model.position.z = -0.22 * seated;
  const pivot = new T.Vector3(0, 1.241 * KAYKIT_SCALE, 0);
  a.hat.quaternion.copy(head);
  a.hat.position.copy(pivot).sub(pivot.clone().applyQuaternion(head));
  a.hat.position.y += a.model.position.y;
  a.extras.position.y = a.model.position.y;
}
export function createCharacterPreview(
  host: HTMLElement,
  look: Look & { reduced?: boolean },
) {
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setSize(host.clientWidth, Math.max(160, host.clientHeight));
  renderer.setClearColor("#e8eadc", 0);
  host.append(renderer.domElement);
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight("#ffffff", "#7b7761", 2.5));
  const light = new T.DirectionalLight("#fff2d1", 3);
  light.position.set(2, 4, 3);
  scene.add(light);
  const camera = new T.PerspectiveCamera(
    35,
    host.clientWidth / Math.max(160, host.clientHeight),
    0.1,
    30,
  );
  const distance = Math.max(
    4.6,
    (look.pet ? 1.15 : 0.72) / (camera.aspect * Math.tan((Math.PI * 35) / 360)),
  );
  camera.position.set(look.pet ? 0.3 : 0, 1.45, distance);
  camera.lookAt(look.pet ? 0.3 : 0, 1.13, 0);
  const observer = new ResizeObserver(() => {
    const w = host.clientWidth,
      h = Math.max(160, host.clientHeight);
    if (!w) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.position.z = Math.max(
      4.6,
      (look.pet ? 1.15 : 0.72) /
        (camera.aspect * Math.tan((Math.PI * 35) / 360)),
    );
    camera.lookAt(look.pet ? 0.3 : 0, 1.13, 0);
    camera.updateProjectionMatrix();
  });
  observer.observe(host);
  const a = createAvatar(
    scene,
    0,
    0,
    outfits[look.outfit],
    skins[look.skin],
    look.hat,
    look,
  );
  a.root.rotation.y = 0.2;
  let frame = 0,
    last = 0;
  const loop = (t: number) => {
    frame = requestAnimationFrame(loop);
    if (t - last < 33) return;
    last = t;
    animateDetails(a, t / 1000, "idle", look.reduced);
    if (a.pet) a.pet.root.rotation.y = a.root.rotation.y - 0.18;
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);
  let start = 0;
  renderer.domElement.style.touchAction = "pan-y";
  renderer.domElement.onpointerdown = (e) => {
    start = e.clientX;
    renderer.domElement.setPointerCapture(e.pointerId);
  };
  renderer.domElement.onpointermove = (e) => {
    if (renderer.domElement.hasPointerCapture(e.pointerId)) {
      a.root.rotation.y += (e.clientX - start) * 0.012;
      start = e.clientX;
    }
  };
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    a.materials.forEach((m) => m.dispose());
    renderer.dispose();
    // Each wardrobe change replaces this preview. Release its WebGL context so
    // repeated choices cannot evict the main world's context on mobile Safari.
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
