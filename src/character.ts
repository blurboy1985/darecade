import * as T from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { outfits, skins } from "./state";
export const clothingNames = [
  "Weekend hoodie",
  "Arcade varsity",
  "Trail explorer",
  "Everyday tee",
];
export const hairNames = [
  "Side-swept waves",
  "Double buns",
  "Close crop",
  "Long layers",
];
export const petNames = [
  "No companion",
  "Mochi the cat",
  "Biscuit the pup",
  "Little cloudbot",
];
export const accessoryNames = [
  "Keep it simple",
  "Orbiting stars",
  "Butterfly wings",
  "Firefly friends",
];
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
    .loadAsync("/models/neighbour.glb?v=cute-10")
    .then((g) => {
      template = g.scene;
    }));
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
  a.materials.get("Fabric")!.color.set(color);
  a.materials.get("Skin")!.color.set(skin);
  for (let i = 0; i < 4; i++) {
    a.model.getObjectByName("Clothing" + i)!.visible = i === a.look.clothing;
    a.model.getObjectByName("Hair" + i)!.visible = i === a.look.hair;
  }
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
  for (const part of a.hat.children) {
    part.position.x *= 1.6;
    part.position.z *= 1.6;
    part.position.y += 0.065;
    part.scale.x *= 1.6;
    part.scale.z *= 1.6;
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
  } else {
    const color = kind === 1 ? "#b2a0bd" : "#ca9a69";
    ellipsoid(root, [0, 0.31, 0], [0.19, 0.2, 0.31], color);
    ellipsoid(root, [0, 0.5, 0.22], [0.2, 0.19, 0.18], color);
    ellipsoid(root, [0, 0.43, 0.36], [0.11, 0.085, 0.095], "#f4dfb9");
    for (const side of [-1, 1]) {
      const ear = ellipsoid(
        root,
        [side * 0.14, 0.65, 0.18],
        kind === 1 ? [0.075, 0.16, 0.06] : [0.1, 0.2, 0.065],
        kind === 1 ? "#aa91b5" : "#8b654c",
      );
      ear.rotation.z = side * (kind === 1 ? 0.2 : 0.7);
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
    if (a.look.pet === 3) pet.root.position.y = 0.1 + Math.sin(t * 2) * 0.08;
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
  set("spine_03", torso);
  const head = torso.clone().multiply(a.head.quaternion);
  set("Head", head);
  // Skin rest arms are horizontal. Rotate into the game's neutral arms-down pose.
  for (const [i, suffix] of ["r", "l"].entries()) {
    const arm = (i === 0 ? a.left : a.right).quaternion;
    const down = new T.Quaternion().setFromAxisAngle(
      axisZ,
      i === 0 ? 1.4 : -1.4,
    );
    const upper = torso.clone().multiply(arm);
    set("upperarm_" + suffix, upper.clone().multiply(down));
    const lower = upper.clone().multiply(a.elbows[i].quaternion);
    set("lowerarm_" + suffix, lower.clone().multiply(down));
    set("hand_" + suffix, lower.multiply(a.hands[i].quaternion).multiply(down));
    const leg = a.legs[i].quaternion.clone();
    set("thigh_" + suffix, leg);
    leg.multiply(a.knees[i].quaternion);
    set("calf_" + suffix, leg);
    set("foot_" + suffix, leg);
  }
  const pivot = new T.Vector3(0, 1.38, -0.04);
  a.hat.quaternion.copy(head);
  a.hat.position.copy(pivot).sub(pivot.clone().applyQuaternion(head));
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
    4.2,
    (look.pet ? 1.3 : 0.72) / (camera.aspect * Math.tan((Math.PI * 35) / 360)),
  );
  camera.position.set(look.pet ? 0.3 : 0, 1.3, distance);
  camera.lookAt(look.pet ? 0.3 : 0, 1.05, 0);
  const observer = new ResizeObserver(() => {
    const w = host.clientWidth,
      h = Math.max(160, host.clientHeight);
    if (!w) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.position.z = Math.max(
      4.2,
      (look.pet ? 1.3 : 0.72) /
        (camera.aspect * Math.tan((Math.PI * 35) / 360)),
    );
    camera.lookAt(look.pet ? 0.3 : 0, 1.05, 0);
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
