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
  new URL("../public/models/neighbour-chibi.glb", import.meta.url),
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

test("original chibi character fits the download budget and has one shared rig", (t) => {
  assert.equal(file.toString("utf8", 0, 4), "glTF");
  assert.ok(file.length < 1_500_000, "Character download budget: 1.5MB");
  assert.equal(gltf.animations?.length ?? 0, 0, "Baked clips are stripped");
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
  const triangles = (name: string) =>
    gltf.meshes[node(name).mesh].primitives.reduce(
      (total: number, primitive: { indices: number }) =>
        total + gltf.accessors[primitive.indices].count / 3,
      0,
    );
  const parts = [
    "Body",
    "ArmLeft",
    "ArmRight",
    "LegLeft",
    "LegRight",
    "Head",
    "Cape",
  ];
  const families = ["Rogue", "Mage", "Knight", "Barbarian"];
  const maxPart = (part: string) =>
    Math.max(...families.map((who) => triangles(`${who}_${part}`)));
  const maxHat = Math.max(
    ...["Mage_Hat", "Knight_Helmet", "Barbarian_Hat"].map(triangles),
  );
  const maxHead = Math.max(maxPart("Head"), triangles("Rogue_Head_Hooded"));
  const worst = parts
    .filter((part) => part !== "Head")
    .reduce((total, part) => total + maxPart(part), maxHead + maxHat);
  t.diagnostic(
    `${file.length} bytes; worst mixed outfit with cape and hat ${worst} triangles`,
  );
  assert.ok(
    worst <= 12_000,
    "Even mixed wardrobe looks fit the 12,000-triangle budget",
  );
  for (const name of [
    ...families.flatMap((who) => parts.map((part) => `${who}_${part}`)),
    "Rogue_Head_Hooded",
    "Mage_Hat",
    "Knight_Helmet",
    "Barbarian_Hat",
  ])
    assert.equal(
      gltf.meshes[node(name).mesh].primitives.length,
      1,
      `${name} is one draw, at most eight per dressed avatar`,
    );
});

test("every saved wardrobe choice has its original meshes", () => {
  // Saved looks store indices, so lists only ever grow; each has 20+ choices.
  assert.ok(clothingNames.length >= 20);
  assert.ok(hairNames.length >= 20);
  assert.ok(petNames.length > 20);
  assert.ok(accessoryNames.length > 20);
  assert.deepEqual(clothingNames.slice(0, 2), [
    "Ranger tunic",
    "Ranger tunic & cape",
  ]);
  assert.deepEqual(hairNames.slice(5, 8), [
    "Wizard hat",
    "Knight helmet",
    "Bear hat",
  ]);
  for (const who of ["Rogue", "Mage", "Knight", "Barbarian"]) {
    for (const part of [
      "Body",
      "ArmLeft",
      "ArmRight",
      "LegLeft",
      "LegRight",
      "Head",
      "Cape",
    ])
      assert.notEqual(
        node(`${who}_${part}`)?.mesh,
        undefined,
        `${who}_${part}`,
      );
  }
  assert.notEqual(node("Rogue_Head_Hooded")?.skin, undefined);
  for (const [hat, bone] of [
    ["Mage_Hat", "head"],
    ["Knight_Helmet", "head"],
    ["Barbarian_Hat", "head"],
  ]) {
    assert.ok(
      node(hat).skin !== undefined ||
        node(bone).children.includes(gltf.nodes.indexOf(node(hat))),
      `${hat} follows the shared head rig`,
    );
  }
  const weapons = gltf.nodes.filter((n: { name: string }) =>
    /Sword|Axe|Shield|Crossbow|Knife|Staff|Wand|Spellbook|Mug|Throwable/.test(
      n.name,
    ),
  );
  assert.deepEqual(weapons, [], "No weapons or props are shipped");
  assert.deepEqual(gltf.materials.map((m: { name: string }) => m.name).sort(), [
    "barbarian",
    "knight",
    "mage",
    "rogue",
  ]);
});

test("all face choices have named expressions and retain the painted atlas", () => {
  for (const who of [
    "Rogue",
    "Mage",
    "Knight",
    "Barbarian",
    "Rogue_Head_Hooded",
  ]) {
    const name = who === "Rogue_Head_Hooded" ? who : `${who}_Head`;
    const mesh = gltf.meshes[node(name).mesh];
    assert.deepEqual(mesh.extras.targetNames, ["Blink", "Smile"]);
    assert.equal(mesh.primitives[0].targets.length, 2);
  }
  for (const image of gltf.images) {
    assert.equal(image.mimeType, "image/png");
    const view = gltf.bufferViews[image.bufferView];
    const offset = binaryStart + view.byteOffset;
    assert.equal(
      file.readUInt32BE(offset + 16),
      512,
      "Face paint is not reduced to palette swatches",
    );
    assert.equal(file.readUInt32BE(offset + 20), 512);
  }
  for (const material of gltf.materials) {
    const base =
      gltf.textures[material.pbrMetallicRoughness.baseColorTexture.index];
    const emission = gltf.textures[material.emissiveTexture.index];
    assert.equal(
      base.source,
      emission.source,
      "Skin and emission share the same authored atlas",
    );
  }
});

test("each body family's main clothing uses the outfit tint cells", () => {
  for (const family of ["Rogue", "Mage", "Knight", "Barbarian"]) {
    const primitive = gltf.meshes[node(`${family}_Body`).mesh].primitives[0];
    const uv = primitive.attributes.TEXCOORD_0;
    const count = gltf.accessors[uv].count;
    let tintable = 0;
    for (let vertex = 0; vertex < count; vertex++) {
      const col = Math.floor(read(uv, vertex, 0) * 8);
      const row = Math.floor(read(uv, vertex, 1) * 8);
      if (row === 1 && (col === 0 || col === 1)) tintable++;
    }
    assert.ok(
      tintable / count >= 0.15,
      `${family}: ${tintable}/${count} body vertices must sample outfit cells 8/9, beyond a small accent`,
    );
  }
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
