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
  new URL("../public/models/neighbour-kaykit.glb", import.meta.url),
);
const jsonSize = file.readUInt32LE(12);
const gltf = JSON.parse(file.toString("utf8", 20, 20 + jsonSize));
const binaryStart = 28 + jsonSize;
const node = (name: string) =>
  gltf.nodes.find((o: { name: string }) => o.name === name);

test("KayKit character fits the download budget and has one shared rig", () => {
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
});

test("every wardrobe choice has its KayKit meshes", () => {
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
  ])
    assert.ok(node(bone).children.includes(gltf.nodes.indexOf(node(hat))), hat);
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

test("skinned parts have finite, normalised weights on valid joints", () => {
  const read = (id: number, row: number, col: number) => {
    const a = gltf.accessors[id],
      view = gltf.bufferViews[a.bufferView];
    const size =
      a.componentType === 5126 ? 4 : a.componentType === 5123 ? 2 : 1;
    const comps = a.type === "VEC4" ? 4 : 1;
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
