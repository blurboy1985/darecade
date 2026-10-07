import { costumeBody, costumeHead } from "./costume-design.ts";
import { fitHairUnderHeadwear } from "./headwear-fit.ts";
import type { Costume } from "./style-catalog.ts";
import { resizeRenderer } from "./render-budget.ts";
import { part, ball } from "./shapes.ts";
import { identitySeed } from "./character-identity.ts";
import { HAIR_START } from "./hair-catalog.ts";
import {
  buildClassBody,
  buildClassHead,
  classFor,
  animateCostume,
} from "./class-costumes.ts";
import {
  addWink,
  blinkAmount,
  buildHair,
  buildMouth,
  expressionFor,
  outlineModel,
  rimMaterial,
} from "./character-finish.ts";
import { extraIndexFor, legendarySets, setIndexFor } from "./collections.ts";
import * as T from "three";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { outfits, skins } from "./state.ts";
import { clothingNames } from "./appearance.ts";
import { makePet, animatePet, type Pet } from "./pets.ts";
import { buildMagic, disposeMagic, type Magic } from "./magic.ts";
import {
  buildBeard,
  buildHeadgear,
  buildHood,
  animateHeadgear,
  type Gear,
} from "./headgear.ts";
export {
  clothingNames,
  hairNames,
  petNames,
  accessoryNames,
} from "./appearance.ts";
export type Look = {
  outfit: number;
  skin: number;
  eye?: number;
  hat: number;
  /** 0 girl, 1 boy. */
  body?: number;
  clothing?: number;
  hair?: number;
  baseHair?: number;
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
  costume: T.Group;
  pet: Pet | null;
  magic: Magic | null;
  look: Look;
  last: T.Vector3;
  materials: Map<string, T.MeshStandardMaterial>;
  footrest: T.Mesh;
  moving: boolean;
  rig: Map<string, { bone: T.Object3D; rest: T.Quaternion }>;
  expressions: T.Mesh[];
};
let template: T.Group | null = null;
let loading: Promise<void> | null = null;
export function loadCharacter() {
  return (loading ??= new GLTFLoader()
    .register((parser) => {
      // Embedded GLB images are blob URLs. Load them as images (img-src blob:)
      // rather than ImageBitmapLoader's fetch, which our connect-src forbids.
      parser.textureLoader = new T.TextureLoader(parser.options.manager);
      return { name: "DarecadeEmbeddedImages" };
    })
    .loadAsync("/models/neighbour-chibi2.glb?v=6")
    .then((g) => {
      template = g.scene;
      addWink(template);
      template.scale.setScalar(CHARACTER_SCALE);
    })
    .catch((error: unknown) => {
      loading = null;
      throw error;
    }));
}
// The avatar is built from "Chibi Girl Character" by Syed's Creation (CC BY
// 4.0) by scripts/build_sketchfab_chibi.py, bound to the CC0 KayKit skeleton.
// One GLB holds every part; a look shows some of them and colours the rest.
const CHARACTER_SCALE = 0.86;
const BASE_SKIN = "#ffc8b6";
type Family = "cardigan" | "vest" | "blazer" | "explorer";
const tops: Record<
  Family,
  { jacket: boolean; paint: (primary: T.Color) => Record<string, T.Color> }
> = {
  cardigan: {
    jacket: true,
    paint: (primary) => ({
      jacket: primary,
      shirt: new T.Color("#e6fbff"),
      trim: new T.Color("#fbd6a6"),
    }),
  },
  vest: {
    jacket: false,
    paint: (primary) => ({ shirt: primary, trim: new T.Color("#ffffff") }),
  },
  blazer: {
    jacket: true,
    paint: (primary) => ({
      jacket: primary.clone().lerp(new T.Color("#1f2a44"), 0.7),
      shirt: new T.Color("#ffffff"),
      trim: primary,
    }),
  },
  explorer: {
    jacket: true,
    paint: (primary) => ({
      jacket: primary.clone().lerp(new T.Color("#8a6a45"), 0.55),
      shirt: new T.Color("#f3e6c8"),
      trim: new T.Color("#6b4a2f"),
    }),
  },
};
const bottoms: Record<
  Family,
  { part: string; color: string; socks: string; shoes: string | null }
> = {
  // The girl wears the source skirt; the boy wears shorts in its place.
  cardigan: { part: "Skirt", color: "#98c2ef", socks: "#1c1c22", shoes: null },
  vest: {
    part: "Shorts",
    color: "#3d4f8f",
    socks: "#ffffff",
    shoes: "#ffffff",
  },
  blazer: {
    part: "Trousers",
    color: "#5b6270",
    socks: "#1c1c22",
    shoes: "#2b2b33",
  },
  explorer: {
    part: "Trousers",
    color: "#b89b6a",
    socks: "#6b4a2f",
    shoes: "#6b4a2f",
  },
};
// [top, bottoms, cape]. Order matches clothingNames.
const bodySets: [Family, Family, boolean][] = [
  ["cardigan", "cardigan", false],
  ["cardigan", "cardigan", true],
  ["vest", "vest", false],
  ["vest", "vest", true],
  ["blazer", "blazer", false],
  ["blazer", "blazer", true],
  ["explorer", "explorer", false],
  ["explorer", "explorer", true],
  ["cardigan", "blazer", false],
  ["cardigan", "cardigan", true],
  ["cardigan", "vest", true],
  ["vest", "cardigan", false],
  ["vest", "vest", true],
  ["vest", "blazer", true],
  ["blazer", "cardigan", false],
  ["blazer", "blazer", true],
  ["blazer", "explorer", true],
  ["explorer", "cardigan", true],
  ["explorer", "blazer", true],
  ["explorer", "vest", true],
  ["cardigan", "explorer", true],
  ["vest", "cardigan", true],
  ["blazer", "vest", false],
  ["explorer", "cardigan", false],
];
const costumeBodies: Record<Costume, [Family, Family, boolean]> = {
  street: ["cardigan", "explorer", false],
  rainshield: ["blazer", "blazer", false],
  wayfinder: ["explorer", "explorer", false],
  academy: ["blazer", "cardigan", false],
  otter: ["vest", "explorer", false],
  neighbour: ["cardigan", "explorer", false],
  hero: ["blazer", "blazer", false],
  fighter: ["vest", "explorer", false],
  ranger: ["explorer", "explorer", false],
  mage: ["blazer", "cardigan", false],
  mecha: ["blazer", "blazer", false],
  rogue: ["vest", "explorer", false],
  royal: ["blazer", "cardigan", false],
  idol: ["cardigan", "vest", false],
  trainer: ["explorer", "explorer", false],
  knight: ["blazer", "blazer", false],
};
const hairParts = {
  short: ["HairShort"],
  bob: ["Hair"],
  buns: ["Hair", "Buns", "Beads"],
};
const hairLooks: Record<
  string,
  { style: keyof typeof hairParts; color: string; beard?: true; hood?: true }
> = {
  slate: { style: "short", color: "#4a6274" },
  brown: { style: "bob", color: "#7a4a3a" },
  midnight: { style: "buns", color: "#2f2a45" },
  grey: { style: "short", color: "#9aa3ab", beard: true },
  hood: { style: "short", color: "#4a6274", hood: true },
  pink: { style: "buns", color: "#fd7ba6" },
  blonde: { style: "bob", color: "#f2cf7a" },
  mint: { style: "buns", color: "#8fdcc4" },
};
// [hair, model headwear, procedural gear]. Order matches hairNames.
const headSets: [string, string | null, Gear | null][] = [
  ["slate", null, null],
  ["brown", null, null],
  ["midnight", null, null],
  ["grey", null, null],
  ["hood", null, null],
  ["brown", "Hat_Wizard", null],
  ["midnight", "Hat_Knight", null],
  ["grey", "Hat_Bear", null],
  ["slate", "Hat_Wizard", null],
  ["grey", "Hat_Knight", null],
  ["slate", "Hat_Bear", null],
  ["slate", null, "cat"],
  ["brown", null, "bunny"],
  ["midnight", null, "fox"],
  ["slate", null, "flowers"],
  ["midnight", null, "party"],
  ["brown", null, "beanie"],
  ["grey", null, "chef"],
  ["brown", null, "grad"],
  ["midnight", null, "headphones"],
  ["slate", null, "propeller"],
  ["grey", null, "viking"],
  ["brown", null, "tiara"],
  ["slate", null, "mushroom"],
  ["midnight", null, "antlers"],
  ["grey", null, "bandana"],
  ["midnight", null, "straw"],
  ["slate", null, "bow"],
];
// Later single headwear, in the order of its names in appearance.ts.
const laterHeads: [string, string | null, Gear | null][] = [
  ["pink", null, null],
  ["brown", null, "headband"],
  ["slate", null, "cap"],
  ["blonde", null, null],
  ["midnight", null, "frog"],
  ["brown", null, "beret"],
  ["mint", null, null],
  ["slate", null, "astronaut"],
  ["midnight", null, "unicorn"],
];
// Sets take their hair from these four in turn.
const setHair = ["slate", "brown", "midnight", "pink"];
const alwaysShown = [
  "Skin_Top",
  "Skin_Legs",
  "Head",
  "Lashes",
  "Shirt",
  // The source's "Trim" is a bag/strap crossing the outfit, not garment trim.
  "Socks",
];
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
  const expressions: T.Mesh[] = [];
  model.traverse((o) => {
    if (o instanceof T.Mesh) {
      const original = o.material as T.MeshStandardMaterial;
      let m = materials.get(original.name);
      if (!m) {
        // Each avatar colours its own copies; the textures stay shared.
        m = original.clone();
        rimMaterial(m);
        if (original.name === "eyes" || original.name === "eyes_b") {
          m.onBeforeCompile = (shader) => {
            shader.uniforms.irisTint = {
              value: m!.userData.irisTint ?? new T.Color("#795038"),
            };
            shader.uniforms.lidSkin = {
              value: m!.userData.lidSkin ?? new T.Color("#edc4a3"),
            };
            shader.uniforms.eyeClosed = m!.userData.eyeClosed ??= { value: 0 };
            shader.fragmentShader =
              "uniform vec3 irisTint; uniform vec3 lidSkin; uniform float eyeClosed;\n" +
              shader.fragmentShader;
            shader.fragmentShader = shader.fragmentShader.replace(
              "#include <map_fragment>",
              `
              #include <map_fragment>
              float chroma=max(diffuseColor.r,max(diffuseColor.g,diffuseColor.b))-min(diffuseColor.r,min(diffuseColor.g,diffuseColor.b)); float irisMask=step(0.07,chroma)*step(diffuseColor.g*1.1,max(diffuseColor.r,diffuseColor.b));
              diffuseColor.rgb = mix(diffuseColor.rgb, irisTint * (0.5 + diffuseColor.r), irisMask);
              float whiteMask = smoothstep(0.4, 0.8, max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)));
              diffuseColor.rgb = mix(diffuseColor.rgb, lidSkin, eyeClosed);
            `,
            );
          };
          m.customProgramCacheKey = () => "simi-iris-v2";
          if (m.map) m.map.anisotropy = 4;
        }
        if (original.name === "cape") {
          const time = { value: 0 },
            motion = { value: 0.4 };
          m.userData.capeTime = time;
          m.userData.capeMotion = motion;
          m.onBeforeCompile = (shader) => {
            shader.uniforms.capeTime = time;
            shader.uniforms.capeMotion = motion;
            shader.vertexShader =
              "uniform float capeTime;uniform float capeMotion;\n" +
              shader.vertexShader;
            shader.vertexShader = shader.vertexShader.replace(
              "#include <begin_vertex>",
              `#include <begin_vertex>
          float hem=clamp((1.19-position.y)/0.85,0.0,1.0);
          transformed.z += sin(capeTime*5.0+position.x*7.0)*0.12*hem*hem*capeMotion;`,
            );
          };
          m.customProgramCacheKey = () => "playsimi-cape-v1";
        }
        materials.set(original.name, m);
      }
      o.material = m;
      if (o.morphTargetDictionary && o.morphTargetInfluences)
        expressions.push(o);
      o.castShadow = true;
      o.receiveShadow = false;
    }
  });
  outlineModel(model);
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
    costume: new T.Group(),
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
    expressions,
  };
  for (const suffix of ["r", "l"]) {
    const wrist = rig.get("wrist" + suffix)?.bone;
    if (wrist) {
      const mitten = ellipsoid(wrist, [0, 0, 0], [0.075, 0.09, 0.065], skin);
      mitten.name = "Mitten";
    }
  }
  root.add(a.hat, a.extras, a.costume);
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
  for (const name of ["eyes", "eyes_b"]) {
    const material = a.materials.get(name);
    if (material) {
      (material.userData.lidSkin ??= new T.Color()).set(skin);
      const tint = (material.userData.irisTint ??= new T.Color());
      tint.set(
        look.eye
          ? ["#db779f", "#865035", "#328cca", "#469267", "#8763bd"][look.eye]
          : ["#ce558e", "#805135", "#3a9c79", "#3694cc", "#cf922c"][
              (look.skin + (look.baseHair ?? look.hair ?? 0)) % 5
            ],
      );
    }
  }
  const outfitSet = setIndexFor("clothing", look.clothing ?? 0);
  const headSet = setIndexFor("hair", look.hair ?? 0);
  const special = legendarySets[outfitSet];
  const starter = classFor(look.clothing ?? 0);
  if (special) color = special.color;
  else if (starter) color = starter.color;
  a.look = { body: 0, clothing: 0, hair: 0, pet: 0, accessory: 0, ...look };
  const boy = a.look.body === 1;
  const [top, legs, cape] = special
    ? costumeBodies[special.design.costume]
    : bodySets[a.look.clothing! % bodySets.length];
  const [hairName, wear, gear] =
    (a.look.hair! >= HAIR_START
      ? (["slate", null, null] as const)
      : laterHeads[extraIndexFor("hair", a.look.hair!)]) ??
    (headSet < 0
      ? headSets[a.look.hair! % headSets.length]
      : [setHair[headSet % setHair.length], null, null]);
  const hair = hairLooks[hairName];
  const below = bottoms[legs];
  const shown = new Set([
    ...alwaysShown,

    boy ? "EyesB" : "Eyes",
    boy && below.part === "Skirt" ? "Shorts" : below.part,
  ]);
  if (tops[top].jacket) shown.add("Jacket");
  if (starter?.prop === "staff") shown.delete("Skirt");
  if (cape && !special && !classFor(a.look.clothing!)) shown.add("Cape");
  if (below.shoes) shown.add("Shoes");
  if (wear === "Hat_Wizard" && !look.hat) shown.add(wear);
  a.model.traverse((o) => {
    if (o instanceof T.Mesh) {
      o.visible = o.name === "Mitten" || shown.has(o.name);
      if (o.name === "Hat_Wizard") o.position.y = -0.1 / CHARACTER_SCALE;
      if (o.userData.outline) o.userData.selected = o.visible;
      if (o.name === "Mitten") o.material = mat(skin);
    }
  });
  const primary = new T.Color(color);
  const hsl = { h: 0, s: 0, l: 0 };
  primary.getHSL(hsl);
  primary.setHSL(hsl.h, Math.min(1, hsl.s * 1.5), Math.min(0.58, hsl.l));
  const tone = new T.Color(skin),
    base = new T.Color(BASE_SKIN);
  const paint: Record<string, T.Color> = {
    skin: tone,
    // The face texture is painted in the source skin tone; scale it to this one.
    face: new T.Color(tone.r / base.r, tone.g / base.g, tone.b / base.b),
    hair: new T.Color(hair.color),
    hat: new T.Color(a.look.hair === 8 ? "#7392ac" : "#ffffff"),
    bottom: new T.Color(below.color),
    socks: new T.Color(below.socks),
    shoes: new T.Color(below.shoes ?? "#ffffff"),
    cape: primary.clone().multiplyScalar(0.7),
    ...tops[top].paint(primary),
  };
  if (starter) {
    paint.jacket = primary;
    paint.shirt = primary;
    paint.bottom = primary.clone().multiplyScalar(0.7);
  }
  if (special) {
    // Sets wear their two signature colours from collar to hem.
    const accent = new T.Color(special.accent);
    paint.shirt = accent.clone().lerp(new T.Color("#ffffff"), 0.45);
    paint.trim = accent;
    paint.jacket = primary;
    paint.cape = accent;
    paint.bottom = primary.clone().lerp(new T.Color("#20243a"), 0.45);
    paint.shoes = accent.clone().lerp(new T.Color("#20243a"), 0.45);
    paint.socks = primary;
  }
  for (const [name, value] of Object.entries(paint))
    a.materials.get(name)?.color.copy(value);
  a.costume.clear();
  // Set trim was sized for a broader chest; draw it in to this one.
  a.costume.scale.setScalar(0.82);
  if (special) costumeBody(a.costume, special, boy ? 1 : 0);
  const book = part(
    a.costume,
    "box",
    [0, 0.83, 0.34],
    [0.4, 0.05, 0.28],
    "#7b9eac",
    { rot: [-0.3, 0, 0] },
  );
  book.name = "IdleBook";
  book.visible = false;
  if (cape) {
    const collar = part(
      a.costume,
      "torus",
      [0, 1.2, -0.02],
      [0.25, 0.1, 0.23],
      special?.accent || color,
      { rot: [Math.PI / 2, 0, 0] },
    );
    collar.name = "CapeCollar";
  }
  if (!special) buildClassBody(a.costume, a.look.clothing!, false);
  a.root.userData.equippedAt = null;
  delete a.root.userData.detailLevel;
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
  // Earned hats were sized for the earlier head; fit them to the chibi head
  // (about 0.87 wide, crown at y 1.78 after scaling).
  for (const part of a.hat.children) {
    part.position.x *= 1.85;
    part.position.z *= 1.85;
    part.position.y -= 0.09;
    part.scale.x *= 1.85;
    part.scale.z *= 1.85;
    part.scale.y *= 1.25;
  }
  if (!look.hat && wear === "Hat_Knight") {
    ball(a.hat, [0, 1.65, -0.04], [0.48, 0.34, 0.47], "#91a1b0");
    part(a.hat, "box", [0, 1.55, 0.38], [0.77, 0.12, 0.08], "#384756");
    for (const side of [-1, 1])
      part(
        a.hat,
        "box",
        [side * 0.39, 1.45, 0.12],
        [0.1, 0.32, 0.3],
        "#91a1b0",
      );
    part(a.hat, "box", [0, 1.83, 0.05], [0.06, 0.3, 0.6], "#d9e4e9");
  }
  if (!look.hat && wear === "Hat_Bear") {
    const fur = a.look.hair === 10 ? "#526a80" : "#a8724f";
    const innerEar = a.look.hair === 10 ? "#b0c7db" : "#e9bc8f";
    ball(a.hat, [0, 1.68, -0.02], [0.49, 0.27, 0.46], fur);
    for (const side of [-1, 1]) {
      ball(a.hat, [side * 0.37, 1.94, -0.02], [0.15, 0.16, 0.1], fur);
      ball(a.hat, [side * 0.37, 1.94, 0.055], [0.085, 0.1, 0.03], innerEar);
    }
  }
  const classHeadVisible = !look.hat && !wear && !gear && headSet < 0;
  const hairVolume = buildHair(
    a.hat,
    a.look.baseHair ?? a.look.hair!,
    !!(
      look.hat === 1 ||
      look.hat === 2 ||
      wear ||
      (gear !== null &&
        [
          "beanie",
          "chef",
          "grad",
          "propeller",
          "viking",
          "mushroom",
          "straw",
          "cap",
          "frog",
          "beret",
          "astronaut",
        ].includes(gear)) ||
      hair.hood ||
      (headSet >= 0 &&
        ["mage", "ranger", "trainer", "otter", "neighbour"].includes(
          legendarySets[headSet].design.costume,
        )) ||
      (classHeadVisible &&
        starter &&
        ["staff", "bow", "cutlass"].includes(starter.prop))
    ),
  );
  const seatHeadwear = (
    build: (group: T.Group) => void,
    crown = false,
    seat = 1.7,
  ) => {
    const group = new T.Group();
    build(group);
    const bounds = new T.Box3().setFromObject(group);
    // Open crowns sit into the hair shell, with their lowest point at the scalp
    // crown. Raising them above the hair leaves a visible gap around the band.
    if (!bounds.isEmpty() && (crown || bounds.min.y > 1.7))
      group.position.y = (crown ? 1.72 : seat) - bounds.min.y;
    a.hat.add(group);
  };
  if (classHeadVisible)
    seatHeadwear((group) => buildClassHead(group, a.look.clothing!));
  if (hair.beard && !wear && !gear) buildBeard(a.hat, hair.color);
  if (hair.hood && !look.hat) buildHood(a.hat);
  // Wardrobe headgear sits under an earned hat's slot: the earned hat wins.
  if (headSet >= 0 && !look.hat)
    seatHeadwear(
      (group) => costumeHead(group, legendarySets[headSet]),
      ["royal", "knight"].includes(legendarySets[headSet].design.costume),
      ["mage", "neighbour"].includes(legendarySets[headSet].design.costume)
        ? 1.59
        : 1.7,
    );
  else if (gear && !look.hat)
    seatHeadwear((group) => buildHeadgear(group, gear));
  const headwear = a.hat.children.filter((child) => child !== hairVolume);
  if (wear === "Hat_Wizard" && !look.hat) {
    const wizard = a.model.getObjectByName("Hat_Wizard");
    if (wizard) headwear.push(wizard);
  }
  fitHairUnderHeadwear(
    hairVolume,
    headwear,
    `${look.hat ?? 0}:${wear}:${gear}:${headSet}:${classHeadVisible ? a.look.clothing : -1}:${hair.hood ?? false}`,
  );
  buildMouth(a.hat, skin);
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
// Release per-avatar resources; the model geometry and procedural shapes are shared.
const disposedAvatars = new WeakSet<Avatar>();
export function disposeAvatar(a: Avatar) {
  if (disposedAvatars.has(a)) return;
  disposedAvatars.add(a);
  a.root.removeFromParent();
  a.pet?.root.removeFromParent();
  disposeMagic(a.magic);
  a.pet = null;
  a.magic = null;
  for (const material of a.materials.values()) {
    material.dispose();
  }
  const skeletons = new Set<T.Skeleton>();
  a.model.traverse((object) => {
    if (object instanceof T.SkinnedMesh) skeletons.add(object.skeleton);
  });
  for (const skeleton of skeletons) skeleton.dispose();
  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>();
  const textures = new Set<T.Texture>();
  a.root.traverse((object) => {
    if (!object.userData.avatarDecoration) return;
    if (!(object instanceof T.Mesh || object instanceof T.Sprite)) return;
    // Sprites use Three's shared quad. Only world-created mesh geometry is owned.
    if (object instanceof T.Mesh) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material)
      ? object.material
      : [object.material]) {
      materials.add(material);
      if (
        (material instanceof T.MeshBasicMaterial ||
          material instanceof T.SpriteMaterial) &&
        material.map
      )
        textures.add(material.map);
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
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
  const book = a.costume.getObjectByName("IdleBook");
  if (book) book.visible = mode === "read";
  a.root.userData.poseTime = Math.max(0, time - a.root.userData.poseStarted);
  const cm = a.materials.get("cape");
  if (cm?.userData.capeTime) {
    cm.userData.capeTime.value = time;
    cm.userData.capeMotion.value = reduced ? 0 : a.moving ? 1 : 0.4;
  }
  const travel = a.root.position.distanceTo(a.last);
  a.moving = mode === "walk" || travel > 0.008;
  a.last.copy(a.root.position);
  const t = reduced ? 0 : time;
  // Sample the gait at display time, including frames between movement ticks.
  if (mode === "walk") {
    const stride = Math.sin(t * 12) * 0.55;
    a.legs[0].rotation.x = stride;
    a.legs[1].rotation.x = -stride;
  }
  a.root.userData.equippedAt ??= time;
  animateCostume(
    a.costume,
    t,
    a.moving,
    reduced,
    time - a.root.userData.equippedAt,
  );
  const blinkSeed = a.root.userData.id
    ? identitySeed(String(a.root.userData.id))
    : (a.look.hair ?? 0) * 37 + a.look.skin * 103;
  const expression = expressionFor(mode);
  const mouth = a.hat.getObjectByName("Mouth");
  if (mouth)
    mouth.scale.set(
      mode === "cheer"
        ? 0.06
        : mode === "wave" || mode === "dance"
          ? 0.045
          : expression === "surprised"
            ? 0.022
            : expression === "wink"
              ? 0.02
              : 0.027,
      mode === "cheer"
        ? 0.042
        : mode === "dance"
          ? 0.025
          : expression === "surprised"
            ? 0.028
            : expression === "sleepy"
              ? 0.004
              : 0.009,
      0.003,
    );
  const hairVolume = a.hat.getObjectByName("VolumetricHair");
  if (hairVolume && !hairVolume.userData.fittedHeadwear) {
    hairVolume.rotation.z =
      Math.sin(t * (a.moving ? 10 : 1.8)) * (a.moving ? 0.045 : 0.012);
    hairVolume.position.y = 1.46 + Math.sin(t * 3) * 0.008;
  }
  const blink = reduced ? 0 : blinkAmount(t, blinkSeed);
  const happyEyes = ["cheer", "dance"].includes(mode);
  for (const name of ["eyes", "eyes_b"]) {
    const material = a.materials.get(name);
    if (material)
      (material.userData.eyeClosed ??= { value: 0 }).value =
        mode === "nap" || happyEyes ? 1 : blink;
  }
  for (const mesh of a.expressions) {
    const dictionary = mesh.morphTargetDictionary!;
    const influences = mesh.morphTargetInfluences!;
    if (dictionary.Blink !== undefined)
      influences[dictionary.Blink] =
        mode === "nap" || happyEyes
          ? 1
          : expression === "sleepy"
            ? Math.max(0.55, blink)
            : blink;
    if (dictionary.Wink !== undefined)
      influences[dictionary.Wink] = expression === "wink" ? 0.95 : 0;
    if (dictionary.Smile !== undefined)
      influences[dictionary.Smile] = ["wave", "cheer", "dance", "pet"].includes(
        mode,
      )
        ? 0.35
        : 0;
  }
  const gait = Math.sin(t * 10);
  const seated = ["rest", "read", "nap", "bench", "swing", "drive"].includes(
    mode,
  );
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
    !performing && !a.moving
      ? Math.sin(t * 0.8) * 0.2 * Math.max(0, Math.sin(t * 0.35))
      : 0,
    mode === "think" ? 0.09 : 0,
  );
  a.spine.rotation.z = !performing
    ? a.moving
      ? gait * 0.025
      : Math.sin(t * 1.2) * 0.018
    : 0;
  // The older clip bends the whole root toward Kopi. Keep the larger KayKit
  // head upright while crouching so its face does not intersect the cat.
  a.spine.rotation.x = mode === "pet" ? -0.25 : 0;
  if (mode === "stretch") {
    a.left.rotation.z = -2.7;
    a.right.rotation.z = 2.7;
    a.spine.rotation.z = Math.sin(t * 1.2) * 0.12;
  }
  if (mode === "read") {
    a.head.rotation.x = 0.22;
    a.left.rotation.x = a.right.rotation.x = -0.9;
  }
  if (mode === "nap") {
    a.head.rotation.x = 0.35;
    a.spine.rotation.x = 0.25;
  }
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
  poseSkin(a, mode, t, reduced);
  if (!reduced && !performing) {
    const lift = a.moving
      ? Math.abs(Math.sin(t * 10)) * 0.025
      : Math.sin(t * 2) * 0.009;
    a.model.position.y += lift;
    a.hat.position.y += lift;
    a.costume.position.y += lift;
  }
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
function poseSkin(a: Avatar, mode: string, time = 0, reduced = false) {
  const breathing =
    !reduced && !a.moving && mode === "idle" ? Math.sin(time * 1.8) : 0;
  const pitch = -(a.legs[0].rotation.x + a.legs[1].rotation.x) / 2;
  const seated = [
    "rest",
    "read",
    "nap",
    "bench",
    "swing",
    "dragon",
    "drive",
  ].includes(mode)
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
    breathing * 0.012,
    (mode === "swing" ? 0.36 : 0.28) * seated +
      bellHop +
      stepLift +
      breathing * 0.018,
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
  a.root.getWorldQuaternion(rootQ);
  const set = (name: string, delta: T.Quaternion) => {
    const entry = a.rig.get(name);
    if (!entry) return;
    targetQ.copy(rootQ).multiply(delta).multiply(entry.rest);
    entry.bone.parent!.getWorldQuaternion(parentQ).invert();
    entry.bone.quaternion.copy(parentQ).multiply(targetQ);
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
  const pivot = new T.Vector3(0, 1.241 * CHARACTER_SCALE, 0);
  a.hat.quaternion.copy(head);
  a.hat.position.copy(pivot).sub(pivot.clone().applyQuaternion(head));
  a.hat.position.y += a.model.position.y;
  a.hat.position.x += a.model.position.x;
  a.hat.position.z += a.model.position.z;
  a.costume.position.copy(a.model.position);
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
  resizeRenderer(
    renderer,
    Math.max(1, host.clientWidth),
    Math.max(80, host.clientHeight),
  );
  renderer.setClearColor("#e8eadc", 0);
  host.append(renderer.domElement);
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight("#ffffff", "#7b7761", 2.5));
  const light = new T.DirectionalLight("#fff2d1", 3);
  light.position.set(2, 4, 3);
  scene.add(light);
  const camera = new T.PerspectiveCamera(
    35,
    Math.max(1, host.clientWidth) / Math.max(80, host.clientHeight),
    0.1,
    30,
  );
  let view: "body" | "face" = "body";
  let disposed = false;
  let capturing = false;
  function frameLook() {
    const face = view === "face";
    const x = !face && look.pet ? 0.3 : 0;
    const distance = Math.max(
      face ? 2.2 : 4.6,
      (face ? 0.48 : look.accessory ? 1.45 : look.pet ? 1.3 : 0.85) /
        (camera.aspect * Math.tan((Math.PI * 35) / 360)),
    );
    camera.position.set(x, face ? 1.82 : 1.45, distance);
    camera.lookAt(x, face ? 1.7 : 1.13, 0);
    camera.updateProjectionMatrix();
  }
  frameLook();
  const observer = new ResizeObserver(() => {
    const w = host.clientWidth,
      h = Math.max(80, host.clientHeight);
    if (!w) return;
    resizeRenderer(renderer, w, h);
    camera.aspect = w / h;
    frameLook();
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
    if (!host.isConnected || capturing || t - last < 33) return;
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
    setView(next: "body" | "face") {
      view = next;
      frameLook();
      renderer.render(scene, camera);
    },
    async thumbnail(itemLook: Look, slot = "set") {
      if (disposed || capturing) throw new Error("Preview capture unavailable");
      capturing = true;
      const oldSize = renderer.getSize(new T.Vector2());
      const oldRatio = renderer.getPixelRatio();
      const oldPosition = camera.position.clone();
      const oldRotation = camera.quaternion.clone();
      const oldAspect = camera.aspect;
      const oldTurn = a.root.rotation.y;
      renderer.setPixelRatio(1);
      renderer.setSize(240, 220, false);
      camera.aspect = 240 / 220;
      // [x, camera height, distance, target height] for each kind of card.
      const [x, y, z, aim] =
        slot === "portrait"
          ? [0, 1.45, 2.1, 1.43]
          : slot === "hair"
            ? [0, 1.75, 3.1, 1.68]
            : slot === "pet"
              ? [0.85, 0.65, 2.6, 0.45]
              : slot === "outfits"
                ? [0, 1.35, 4.1, 1.1]
                : slot === "clothing"
                  ? [0, 1.35, 4, 1.02]
                  : [0.25, 1.5, 5.2, 1.15];
      camera.position.set(x, y, z);
      camera.lookAt(x, aim, 0);
      camera.updateProjectionMatrix();
      applyLook(a, itemLook);
      a.root.rotation.y = 0.15;
      a.root.visible = slot !== "pet";
      animateDetails(a, 1.4, "idle", true);
      if (slot === "pet" && a.pet) {
        const bounds = new T.Box3().setFromObject(a.pet.root);
        const center = bounds.getCenter(new T.Vector3());
        const size = bounds.getSize(new T.Vector3());
        const distance =
          (Math.max(size.y, size.x / camera.aspect) /
            (2 * Math.tan(T.MathUtils.degToRad(camera.fov / 2)))) *
            1.18 +
          size.z / 2;
        camera.position.set(center.x, center.y + 0.08, center.z + distance);
        camera.lookAt(center);
      }
      renderer.render(scene, camera);
      try {
        return await new Promise<string>((resolve, reject) =>
          renderer.domElement.toBlob((blob) => {
            if (blob) resolve(URL.createObjectURL(blob));
            else reject(new Error("Portrait capture unavailable"));
          }, "image/png"),
        );
      } finally {
        capturing = false;
        if (!disposed) {
          a.root.visible = true;
          applyLook(a, look);
          a.root.rotation.y = oldTurn;
          renderer.setPixelRatio(oldRatio);
          renderer.setSize(oldSize.x, oldSize.y, false);
          camera.position.copy(oldPosition);
          camera.quaternion.copy(oldRotation);
          camera.aspect = oldAspect;
          camera.updateProjectionMatrix();
          renderer.render(scene, camera);
        }
      }
    },
    mount(nextHost: HTMLElement, nextLook: Look & { reduced?: boolean }) {
      observer.unobserve(host);
      host = nextHost;
      look = nextLook;
      if (renderer.domElement.parentElement !== host)
        host.append(renderer.domElement);
      applyLook(a, look);
      frameLook();
      observer.observe(host);
      animateDetails(a, performance.now() / 1000, "idle", look.reduced);
      renderer.render(scene, camera);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      disposeAvatar(a);
      renderer.dispose();
      // Release only when leaving the wardrobe, not on every choice.
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}

/** At gameplay distance, keep the silhouette but drop subpixel outline draws. */
export function setAvatarDetail(a: Avatar, near: boolean) {
  if (a.root.userData.detailLevel === near) return;
  a.root.userData.detailLevel = near;
  a.model.traverse((o) => {
    if (o.userData.outline) o.visible = near && !!o.userData.selected;
  });
  a.hat.traverse((o) => {
    if (o.userData.outline) o.visible = near;
  });
}
