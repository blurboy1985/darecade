import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  clothingNames,
  hairNames,
  petNames,
  accessoryNames,
} from "../src/appearance.ts";

const file = readFileSync(
  new URL("../public/models/neighbour-chibi2.glb", import.meta.url),
);
const jsonSize = file.readUInt32LE(12);
const gltf = JSON.parse(file.toString("utf8", 20, 20 + jsonSize));
const binaryStart = 28 + jsonSize;
const node = (name: string) =>
  gltf.nodes.find((o: { name: string }) => o.name === name);
const read = (id: number, row: number, col: number) => {
  const a = gltf.accessors[id],
    view = gltf.bufferViews[a.bufferView];
  const size = a.componentType === 5126 ? 4 : a.componentType === 5123 ? 2 : 1;
  const comps =
    a.type === "VEC4" ? 4 : a.type === "VEC3" ? 3 : a.type === "VEC2" ? 2 : 1;
  const offset =
    binaryStart +
    (view.byteOffset || 0) +
    (a.byteOffset || 0) +
    row * (view.byteStride || comps * size) +
    col * size;
  const raw =
    size === 4
      ? file.readFloatLE(offset)
      : size === 2
        ? file.readUInt16LE(offset)
        : file.readUInt8(offset);
  return a.normalized ? raw / (size === 2 ? 65535 : 255) : raw;
};
const triangles = (name: string) =>
  gltf.meshes[node(name).mesh].primitives.reduce(
    (total: number, primitive: { indices: number }) =>
      total + gltf.accessors[primitive.indices].count / 3,
    0,
  );
// Every part the game shows by name. See bodySets and hairParts in character.ts.
const body = [
  "Skin_Top",
  "Skin_Legs",
  "Head",
  "Lashes",
  "Shirt",
  "Trim",
  "Socks",
];
const eyes = ["Eyes", "EyesB"];
const hair = ["Hair", "HairShort", "Buns", "Beads"];
const clothes = ["Jacket", "Skirt", "Shorts", "Trousers", "Shoes", "Cape"];
const hats = ["Hat_Wizard", "Hat_Knight", "Hat_Bear"];

test("the avatar fits the download budget and has one shared rig", (t) => {
  assert.equal(file.toString("utf8", 0, 4), "glTF");
  assert.ok(file.length < 1_500_000, "Character download budget: 1.5MB");
  assert.equal(gltf.animations?.length ?? 0, 0, "No baked clips");
  const joints = new Set(
    gltf.skins.map((s: { joints: number[] }) => s.joints.join()),
  );
  assert.equal(joints.size, 1, "Every part binds to the same skeleton");
  for (const side of ["l", "r"])
    for (const [parent, child] of [
      ["chest", `upperarm.${side}`],
      [`upperarm.${side}`, `lowerarm.${side}`],
      [`lowerarm.${side}`, `wrist.${side}`],
      [`upperleg.${side}`, `lowerleg.${side}`],
      [`lowerleg.${side}`, `foot.${side}`],
    ])
      assert.ok(
        node(parent).children.includes(gltf.nodes.indexOf(node(child))),
        `${child} must follow ${parent}`,
      );
  assert.ok(node("chest").children.includes(gltf.nodes.indexOf(node("head"))));
  // The heaviest look: twin buns, jacket, the largest bottoms, cape and hat.
  const worst =
    [...body, "Eyes", "Hair", "Buns", "Beads", "Jacket", "Shoes", "Cape"]
      .map(triangles)
      .reduce((a, b) => a + b) +
    Math.max(...["Skirt", "Shorts", "Trousers"].map(triangles)) +
    Math.max(...hats.map(triangles));
  t.diagnostic(`${file.length} bytes; heaviest look ${worst} triangles`);
  assert.ok(worst <= 15_000, "Every look fits the 15,000-triangle budget");
  for (const name of [...body, ...eyes, ...hair, ...clothes, ...hats])
    assert.equal(
      gltf.meshes[node(name).mesh].primitives.length,
      1,
      `${name} is one draw`,
    );
});

test("every saved wardrobe choice has its parts and colour channels", () => {
  // Saved looks store indices, so lists only ever grow; each has 20+ choices.
  assert.ok(clothingNames.length >= 20);
  assert.ok(hairNames.length >= 20);
  assert.ok(petNames.length > 20);
  assert.ok(accessoryNames.length > 20);
  assert.deepEqual(hairNames.slice(5, 8), [
    "Wizard hat",
    "Knight helmet",
    "Bear hat",
  ]);
  for (const name of [...body, ...eyes, ...hair, ...clothes, ...hats]) {
    assert.notEqual(node(name)?.mesh, undefined, name);
    assert.notEqual(node(name).skin, undefined, `${name} follows the rig`);
  }
  // The game colours materials by these names.
  assert.deepEqual(gltf.materials.map((m: { name: string }) => m.name).sort(), [
    "beads",
    "bottom",
    "cape",
    "eyes",
    "eyes_b",
    "face",
    "hair",
    "hat",
    "jacket",
    "shirt",
    "shoes",
    "skin",
    "socks",
    "trim",
  ]);
});

test("eyes and lashes blink, and painted textures keep their detail", () => {
  for (const name of ["Eyes", "EyesB", "Lashes"]) {
    const mesh = gltf.meshes[node(name).mesh];
    assert.deepEqual(mesh.extras.targetNames, ["Blink"]);
    assert.equal(mesh.primitives[0].targets.length, 1);
  }
  assert.equal(gltf.images.length, 3, "Face, girl eyes and boy eyes");
  for (const image of gltf.images) {
    assert.equal(image.mimeType, "image/png");
    const view = gltf.bufferViews[image.bufferView];
    const offset = binaryStart + view.byteOffset;
    assert.equal(file.readUInt32BE(offset + 16), 512);
    assert.equal(file.readUInt32BE(offset + 20), 512);
  }
  for (const name of ["face", "eyes", "eyes_b"])
    assert.notEqual(
      gltf.materials.find((m: { name: string }) => m.name === name)
        .pbrMetallicRoughness.baseColorTexture,
      undefined,
      `${name} is painted`,
    );
});

test("the source author's credit travels with the file", () => {
  assert.match(node("Simi_Chibi2_Rig").extras.source, /Syed's Creation/);
  assert.match(node("Simi_Chibi2_Rig").extras.source, /CC BY 4\.0/);
});

test("skinned parts have finite, normalised weights on valid joints", () => {
  let weighted = 0;
  for (const n of gltf.nodes.filter(
    (n: { skin?: number }) => n.skin !== undefined,
  )) {
    const skin = gltf.skins[n.skin];
    for (const p of gltf.meshes[n.mesh].primitives) {
      const weights = p.attributes.WEIGHTS_0,
        joints = p.attributes.JOINTS_0;
      const count = gltf.accessors[weights].count;
      for (let v = 0; v < count; v++) {
        let total = 0;
        for (let c = 0; c < 4; c++) {
          const w = read(weights, v, c);
          assert.ok(Number.isFinite(w) && w >= 0 && w <= 1);
          assert.ok(read(joints, v, c) < skin.joints.length);
          total += w;
        }
        assert.ok(
          Math.abs(total - 1) < 0.02,
          "No unweighted or exploding skin vertices",
        );
      }
      weighted += count;
    }
  }
  assert.ok(weighted > 5000);
});

test("feet rest on the ground and the head keeps its hat envelope", () => {
  const bounds = (name: string) => {
    const a =
      gltf.accessors[
        gltf.meshes[node(name).mesh].primitives[0].attributes.POSITION
      ];
    return { min: a.min as number[], max: a.max as number[] };
  };
  assert.ok(Math.abs(bounds("Skin_Legs").min[1]) < 0.02, "Soles at y = 0");
  // Procedural hats are placed for a head about 1.0 wide with its crown near 2.1.
  const hairBox = bounds("Hair");
  assert.ok(hairBox.max[1] > 2.05 && hairBox.max[1] < 2.25);
  assert.ok(hairBox.max[0] - hairBox.min[0] < 1.3);
});
