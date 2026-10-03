import * as T from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { outfits, skins } from "./state";
import { clothingNames } from "./appearance";
import { makePet, animatePet, type Pet } from "./pets";
import { buildMagic, disposeMagic, type Magic } from "./magic";
import { buildHeadgear, animateHeadgear, type Gear } from "./headgear";
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
  pet: Pet | null;
  magic: Magic | null;
  look: Look;
  last: T.Vector3;
  materials: Map<string, T.MeshStandardMaterial>;
  footrest: T.Mesh;
  moving: boolean;
  rig: Map<string, { bone: T.Object3D; rest: T.Quaternion }>;
};
let template: T.Group;
let loading: Promise<void> | null = null;
export function loadCharacter() {
  return (loading ??= new GLTFLoader()
    .register((parser) => {
      // Embedded GLB images are blob URLs. Load them as images (img-src blob:)
      // rather than ImageBitmapLoader's fetch, which our connect-src forbids.
      parser.textureLoader = new T.TextureLoader(parser.options.manager);
      return { name: "DarecadeEmbeddedImages" };
    })
    .loadAsync("/models/neighbour-kaykit.glb?v=kaykit-1")
    .then((g) => {
      template = g.scene;
      template.scale.setScalar(KAYKIT_SCALE);
    }));
}
// KayKit Adventurers (CC0, Kay Lousberg). All four characters share one rig, so
// each saved look picks a body set and a head set by toggling mesh visibility.
const KAYKIT_SCALE = 0.86;
type Who = "Rogue" | "Mage" | "Knight" | "Barbarian";
// [top & arms, legs, cape or null]. Parts from different adventurers share one
// rig, so they mix freely. Order matches clothingNames.
const bodySets: [Who, Who, Who | null][] = [
  ["Rogue", "Rogue", null],
  ["Rogue", "Rogue", "Rogue"],
  ["Mage", "Mage", null],
  ["Mage", "Mage", "Mage"],
  ["Knight", "Knight", null],
  ["Knight", "Knight", "Knight"],
  ["Barbarian", "Barbarian", null],
  ["Barbarian", "Barbarian", "Barbarian"],
  ["Rogue", "Knight", null],
  ["Rogue", "Rogue", "Knight"],
  ["Rogue", "Mage", "Mage"],
  ["Mage", "Rogue", null],
  ["Mage", "Mage", "Barbarian"],
  ["Mage", "Knight", "Knight"],
  ["Knight", "Rogue", null],
  ["Knight", "Knight", "Mage"],
  ["Knight", "Barbarian", "Barbarian"],
  ["Barbarian", "Rogue", "Rogue"],
  ["Barbarian", "Knight", "Knight"],
  ["Barbarian", "Mage", "Mage"],
  ["Rogue", "Barbarian", "Barbarian"],
  ["Mage", "Rogue", "Rogue"],
  ["Knight", "Mage", null],
  ["Barbarian", "Rogue", null],
];
// [head mesh, KayKit headwear, procedural gear]. Order matches hairNames.
const headSets: [string, string | null, Gear | null][] = [
  ["Rogue_Head", null, null],
  ["Mage_Head", null, null],
  ["Knight_Head", null, null],
  ["Barbarian_Head", null, null],
  ["Rogue_Head_Hooded", null, null],
  ["Mage_Head", "Mage_Hat", null],
  ["Knight_Head", "Knight_Helmet", null],
  ["Barbarian_Head", "Barbarian_Hat", null],
  ["Rogue_Head", "Mage_Hat", null],
  ["Barbarian_Head", "Knight_Helmet", null],
  ["Rogue_Head", "Barbarian_Hat", null],
  ["Rogue_Head", null, "cat"],
  ["Mage_Head", null, "bunny"],
  ["Knight_Head", null, "fox"],
  ["Rogue_Head", null, "flowers"],
  ["Knight_Head", null, "party"],
  ["Mage_Head", null, "beanie"],
  ["Barbarian_Head", null, "chef"],
  ["Mage_Head", null, "grad"],
  ["Knight_Head", null, "headphones"],
  ["Rogue_Head", null, "propeller"],
  ["Barbarian_Head", null, "viking"],
  ["Mage_Head", null, "tiara"],
  ["Rogue_Head", null, "mushroom"],
  ["Knight_Head", null, "antlers"],
  ["Barbarian_Head", null, "bandana"],
  ["Knight_Head", null, "straw"],
  ["Rogue_Head", null, "bow"],
];
const headwear = ["Mage_Hat", "Knight_Helmet", "Barbarian_Hat"];
// Each KayKit texture is an 8 x 4 grid of 128 x 256 px gradient swatches. The
// first swatch is skin in all four; the first two swatches of the second row
// carry each outfit's main colour (tunic, robe, plume/cape, hood, wizard hat).
const tintCache = new Map<string, T.Texture>();
function releaseTint(texture: T.Texture | null) {
  if (!texture?.userData.tintKey) return;
  if (--texture.userData.users > 0) return;
  tintCache.delete(texture.userData.tintKey);
  texture.dispose();
}
function tintedTexture(src: T.Texture, skin: string, outfit: string) {
  const key = `${src.uuid}|${skin}|${outfit}`;
  const hit = tintCache.get(key);
  if (hit) return hit;
  const img = src.image as CanvasImageSource & {
    width: number;
    height: number;
  };
  if (typeof document === "undefined" || !img?.width) return src;
  const canvas = document.createElement("canvas");
  // These are gradient swatches, not detailed artwork. A compact atlas avoids
  // allocating a full-resolution image for every neighbour and colour choice.
  canvas.width = Math.min(256, img.width);
  canvas.height = Math.min(256, img.height);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const cw = canvas.width / 8,
    ch = canvas.height / 4;
  const paint = (col: number, row: number, hex: string, shade = 1) => {
    const target = new T.Color(hex).convertLinearToSRGB();
    const want = [target.r, target.g, target.b].map((v) => v * 255 * shade);
    const data = ctx.getImageData(col * cw, row * ch, cw, ch);
    const px = data.data;
    // Keep each swatch's light-to-dark gradient but take the hue from the target.
    const lum = (i: number) =>
      0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2];
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
  tex.userData.tintKey = key;
  tex.userData.users = 0;
  tintCache.set(key, tex);
  return tex;
}
const unitBall = new T.SphereGeometry(1, 12, 8);
const stepGeometry = new T.BoxGeometry(0.78, 0.38, 0.64);
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
  // A small step lets the shorter adventurers reach the full-size cabinets.
  const footrest = new T.Mesh(stepGeometry, mat("#94795c"));
  footrest.visible = false;
  footrest.castShadow = true;
  footrest.receiveShadow = true;
  root.add(footrest);
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
        m.addEventListener("dispose", () => {
          releaseTint(m!.map);
          m!.map = null;
        });
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
    magic: null,
    look: {
      outfit: Math.max(0, outfits.indexOf(color)),
      skin: Math.max(0, skins.indexOf(skin)),
      hat,
      ...options,
    },
    last: root.position.clone(),
    materials,
    footrest,
    moving: false,
    rig,
  };
  root.add(a.hat, a.extras);
  root.userData.avatar = a;
  applyLook(a, a.look, color, skin);
  poseSkin(a, "idle");
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
      const next = tintedTexture(m.userData.source, skin, color);
      if (m.map !== next) {
        if (next.userData.tintKey) next.userData.users++;
        releaseTint(m.map);
        m.map = next;
        m.needsUpdate = true;
      }
    }
  const [top, legs, cape] = bodySets[a.look.clothing! % bodySets.length];
  const [head, wear, gear] = headSets[a.look.hair! % headSets.length];
  a.model.traverse((o) => {
    if (!(o instanceof T.Mesh)) return;
    const [who, part] = [
      o.name.split("_")[0],
      o.name.slice(o.name.indexOf("_") + 1),
    ];
    if (["Body", "ArmLeft", "ArmRight"].includes(part)) o.visible = who === top;
    else if (["LegLeft", "LegRight"].includes(part)) o.visible = who === legs;
    else if (part === "Cape") o.visible = who === cape;
    else if (headwear.includes(o.name))
      o.visible = o.name === wear && !look.hat;
    else if (o.name.includes("Head")) o.visible = o.name === head;
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
  // Wardrobe headgear sits under an earned hat's slot: the earned hat wins.
  if (gear && !look.hat) buildHeadgear(a.hat, gear);
  if (previous.accessory !== a.look.accessory || !a.magic) {
    disposeMagic(a.magic);
    a.magic = buildMagic(a.extras, a.look.accessory!);
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
export function animateDetails(
  a: Avatar,
  time: number,
  mode = "idle",
  reduced = false,
) {
  if (a.root.userData.poseMode !== mode) {
    a.root.userData.poseMode = mode;
    a.root.userData.poseStarted = time;
    a.root.userData.contactProps = new Map<string, T.Object3D>();
  }
  a.root.userData.poseTime = Math.max(0, time - a.root.userData.poseStarted);
  const travel = a.root.position.distanceTo(a.last);
  a.moving = travel > 0.008;
  a.last.copy(a.root.position);
  const t = reduced ? 0 : time;
  const gait = Math.sin(t * 10);
  const seated = ["rest", "bench", "swing", "drive"].includes(mode);
  const performing = [
    "drive",
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
  // The older clip bends the whole root toward Kopi. Keep the larger KayKit
  // head upright while crouching so its face does not intersect the cat.
  a.spine.rotation.x = mode === "pet" ? -0.25 : 0;
  if (!performing && ["idle", "walk", "jog"].includes(mode)) {
    a.left.rotation.x = a.moving
      ? -a.legs[0].rotation.x * 0.65
      : Math.sin(t * 1.9) * 0.035;
    a.right.rotation.x = a.moving
      ? -a.legs[1].rotation.x * 0.65
      : -Math.sin(t * 1.9) * 0.035;
  }
  a.magic?.tick(t, a.moving);
  animateHeadgear(a.hat, t);
  if (mode === "drive") {
    a.legs.forEach((l) => l.rotation.set(-1.25, 0, 0));
    a.knees.forEach((k) => k.rotation.set(1.35, 0, 0));
    a.left.rotation.set(-0.9, 0, -0.08);
    a.right.rotation.set(-0.9, 0, 0.08);
    a.elbows.forEach((e) => e.rotation.set(-0.35, 0, 0));
    a.spine.rotation.set(0.05, 0, 0);
  }
  poseSkin(a, mode);
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
    animatePet(pet, t, a.moving);
  }
}
const axisZ = new T.Vector3(0, 0, 1);
const rootQ = new T.Quaternion(),
  parentQ = new T.Quaternion(),
  targetQ = new T.Quaternion();
function poseSkin(a: Avatar, mode: string) {
  const pitch = -(a.legs[0].rotation.x + a.legs[1].rotation.x) / 2;
  const seated = ["rest", "bench", "swing", "dragon", "drive"].includes(mode)
    ? T.MathUtils.clamp(pitch / 1.35, 0, 1)
    : 0;
  const reach = T.MathUtils.clamp(
    Math.max(-a.left.rotation.x, -a.right.rotation.x) /
      (mode === "bell" ? 1.85 : 1.2),
    0,
    1,
  );
  // A short hop reaches the bicycle bell without pushing the large head into it.
  const bellHop =
    mode === "bell"
      ? 0.46 *
        Math.sin(
          Math.PI *
            T.MathUtils.clamp((a.root.userData.poseTime - 0.4) / 2.3, 0, 1),
        )
      : 0;
  const stepLift = mode === "arcade" ? 0.2 * reach : 0;
  // The authored sit/swing/slide clips place the hips for the earlier, longer-
  // legged rig (thigh at 0.73 m). KayKit hips sit at 0.45 m, so lift the body
  // as the thighs come forward to keep seats, swings and the slide aligned.
  a.model.position.set(
    0,
    0.28 * seated + bellHop + stepLift,
    -0.22 * seated +
      (mode === "bell"
        ? 0.28
        : mode === "arcade"
          ? 0.08
          : mode === "pet"
            ? -0.08
            : 0) *
        reach,
  );
  const stepHeight = Math.max(0, a.root.position.y + stepLift - 0.1);
  a.footrest.visible = mode === "arcade" && stepHeight > 0.05;
  a.footrest.scale.y = stepHeight / 0.38;
  a.footrest.position.set(0, 0.1 + stepHeight / 2 - a.root.position.y, 0.08);
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

  fitHands(a, mode, mode === "drive" ? 1 : reach);
  const pivot = new T.Vector3(0, 1.241 * KAYKIT_SCALE, 0);
  a.hat.quaternion.copy(head);
  a.hat.position.copy(pivot).sub(pivot.clone().applyQuaternion(head));
  a.hat.position.y += a.model.position.y;
  a.hat.position.x += a.model.position.x;
  a.hat.position.z += a.model.position.z;
  a.extras.position.x = a.model.position.x;
  a.extras.position.y = a.model.position.y;
  a.extras.position.z = a.model.position.z;
}

/** Match the existing animated props without stretching or rebuilding the skin. */
function fitHands(a: Avatar, mode: string, weight: number) {
  if (
    !["swing", "pet", "bell", "arcade", "drive"].includes(mode) ||
    weight <= 0
  )
    return;
  const prop = (name: string) => {
    const cache = a.root.userData.contactProps as Map<string, T.Object3D>;
    let nearest = cache?.get(name),
      distance = Infinity;
    if (!nearest) {
      a.root.parent?.traverse((o) => {
        if (o.name !== name) return;
        const d = o
          .getWorldPosition(new T.Vector3())
          .distanceToSquared(a.root.position);
        if (d < distance) {
          nearest = o;
          distance = d;
        }
      });
      if (nearest) cache?.set(name, nearest);
    }
    return nearest
      ? a.root.worldToLocal(nearest.getWorldPosition(new T.Vector3()))
      : null;
  };
  const solve = (side: "r" | "l", goal: T.Vector3) => {
    const upper = a.rig.get("upperarm" + side)!.bone;
    const lower = a.rig.get("lowerarm" + side)!.bone;
    const wrist = a.rig.get("wrist" + side)!.bone;
    const start = upper.getWorldPosition(new T.Vector3());
    const elbow = lower.getWorldPosition(new T.Vector3());
    const hand = wrist.getWorldPosition(new T.Vector3());
    const end = hand.clone().lerp(a.root.localToWorld(goal), weight);
    const first = start.distanceTo(elbow),
      second = elbow.distanceTo(hand);
    const direction = end.clone().sub(start).normalize();
    const distance = T.MathUtils.clamp(
      start.distanceTo(end),
      Math.abs(first - second) + 0.001,
      first + second - 0.001,
    );
    const along =
      (first * first + distance * distance - second * second) / (2 * distance);
    const pole = new T.Vector3(
      side === "r" ? -0.6 : 0.6,
      -1,
      0.25,
    ).applyQuaternion(rootQ);
    pole.addScaledVector(direction, -pole.dot(direction)).normalize();
    const bend = start
      .clone()
      .addScaledVector(direction, along)
      .addScaledVector(
        pole,
        Math.sqrt(Math.max(0, first * first - along * along)),
      );
    const turn = (bone: T.Object3D, child: T.Object3D, target: T.Vector3) => {
      const p = bone.getWorldPosition(new T.Vector3());
      const from = child.getWorldPosition(new T.Vector3()).sub(p).normalize();
      const to = target.clone().sub(p).normalize();
      const q = new T.Quaternion()
        .setFromUnitVectors(from, to)
        .multiply(bone.getWorldQuaternion(new T.Quaternion()));
      bone.quaternion
        .copy(bone.parent!.getWorldQuaternion(new T.Quaternion()).invert())
        .multiply(q);
      bone.updateMatrixWorld(true);
    };
    turn(upper, lower, bend);
    turn(lower, wrist, start.clone().addScaledVector(direction, distance));
  };
  if (mode === "drive") {
    // Wheel grips follow steering and share the kart parent with the driver.
    for (const [side, name] of [
      ["r", "Kart_grip_r"],
      ["l", "Kart_grip_l"],
    ] as const) {
      const target = prop(name);
      if (target) solve(side, target);
    }
  } else if (mode === "swing") {
    for (const [side, name] of [
      ["r", "Swing_chain"],
      ["l", "Swing_chain001"],
    ] as const) {
      const p = prop(name);
      if (p) {
        p.x *= 0.85;
        p.y = 1.2;
        solve(side, p);
      }
    }
  } else if (mode === "pet") {
    const p = prop("Kopi_head");
    if (p) solve("l", p.add(new T.Vector3(0, 0.16, -0.2)));
  } else if (mode === "bell") {
    const p = prop("Bell_lever");
    if (p) solve("r", p.add(new T.Vector3(-0.03, -0.07, -0.1)));
  } else {
    const button = prop("Arcade_button"),
      stick = prop("Joystick_grip");
    if (button) solve("r", button.add(new T.Vector3(0, 0.06, -0.09)));
    if (stick) solve("l", stick.add(new T.Vector3(-0.05, -0.11, -0.05)));
  }
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
  return {
    mount(nextHost: HTMLElement, nextLook: Look & { reduced?: boolean }) {
      observer.unobserve(host);
      host = nextHost;
      look = nextLook;
      host.append(renderer.domElement);
      applyLook(a, look);
      camera.position.x = look.pet ? 0.3 : 0;
      observer.observe(host);
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      a.materials.forEach((m) => m.dispose());
      disposeMagic(a.magic);
      const skeletons = new Set<T.Skeleton>();
      a.model.traverse((o) => {
        if (o instanceof T.SkinnedMesh) skeletons.add(o.skeleton);
      });
      skeletons.forEach((s) => s.dispose());
      renderer.dispose();
      // Release only when leaving the wardrobe, not on every choice.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
