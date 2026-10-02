import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Blender character has usable skin weights, connected joints and selectable wardrobe", () => {
  const file = readFileSync(
    new URL("../public/models/neighbour.glb", import.meta.url),
  );
  assert.equal(file.toString("utf8", 0, 4), "glTF");
  assert.ok(file.length < 3500000, "Character download budget: 3.5MB");
  const jsonSize = file.readUInt32LE(12);
  const gltf = JSON.parse(file.toString("utf8", 20, 20 + jsonSize));
  const binaryStart = 28 + jsonSize;
  const node = (name: string) =>
    gltf.nodes.find((o: { name: string }) => o.name === name);
  assert.ok(gltf.skins.length > 0);
  for (const side of ["l", "r"])
    for (const [parent, child] of [
      ["upperarm", "lowerarm"],
      ["lowerarm", "hand"],
      ["thigh", "calf"],
      ["calf", "foot"],
    ]) {
      const index = gltf.nodes.indexOf(node(`${child}_${side}`));
      assert.ok(index >= 0);
      assert.ok(
        node(`${parent}_${side}`).children.includes(index),
        `${child} must follow ${parent}`,
      );
    }
  for (let i = 0; i < 4; i++) {
    assert.notEqual(node("Clothing" + i).skin, undefined);
    assert.notEqual(node("Hair" + i).skin, undefined);
  }
  const read = (id: number, row: number, col: number) => {
    const a = gltf.accessors[id],
      view = gltf.bufferViews[a.bufferView];
    const size =
      a.componentType === 5126 ? 4 : a.componentType === 5123 ? 2 : 1;
    const offset =
      binaryStart +
      (view.byteOffset || 0) +
      (a.byteOffset || 0) +
      row * (view.byteStride || 4 * size) +
      col * size;
    return size === 4
      ? file.readFloatLE(offset)
      : size === 2
        ? file.readUInt16LE(offset)
        : file.readUInt8(offset);
  };
  let weightedVertices = 0;
  for (const n of gltf.nodes.filter(
    (n: { skin?: number }) => n.skin !== undefined,
  )) {
    const skin = gltf.skins[n.skin];
    for (const p of gltf.meshes[n.mesh].primitives) {
      assert.equal(
        p.attributes.COLOR_0,
        undefined,
        "Imported paint masks must not darken shared materials",
      );
      const weights = p.attributes.WEIGHTS_0,
        joints = p.attributes.JOINTS_0;
      assert.notEqual(weights, undefined);
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
          Math.abs(total - 1) < 0.001,
          "No unweighted or exploding skin vertices",
        );
      }
      weightedVertices += count;
    }
  }
  assert.ok(weightedVertices > 1000);
  for (const name of ["Skin", "Fabric", "Trim"])
    assert.ok(gltf.materials.some((m: { name: string }) => m.name === name));
});
