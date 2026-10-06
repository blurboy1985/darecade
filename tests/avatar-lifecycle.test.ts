import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import {
  loadCharacter,
  createAvatar,
  applyLook,
  animateDetails,
  disposeAvatar,
} from "../src/character.ts";
import { outfits, skins } from "../src/state.ts";
import { buildMagic } from "../src/magic.ts";
import { appearanceLimits } from "../src/appearance.ts";

let source: T.Group;
// Exercise the real GLB meshes and rig in Node. Only embedded image decoding is
// omitted, since Node has no browser Image implementation.
async function parseCharacter() {
  const file = readFileSync(
    new URL("../public/models/neighbour-chibi2.glb", import.meta.url),
  );
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(file.toString("utf8", 20, 20 + jsonLength));
  for (const material of json.materials) {
    delete material.pbrMetallicRoughness?.baseColorTexture;
  }
  delete json.images;
  delete json.textures;
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32);
  text.copy(padded);
  const binary = file.subarray(20 + jsonLength);
  const rebuilt = Buffer.alloc(20 + padded.length + binary.length);
  file.copy(rebuilt, 0, 0, 12);
  rebuilt.writeUInt32LE(rebuilt.length, 8);
  rebuilt.writeUInt32LE(padded.length, 12);
  rebuilt.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(rebuilt, 20);
  binary.copy(rebuilt, 20 + padded.length);
  const gltf = await new GLTFLoader().parseAsync(rebuilt.buffer, "");
  source = gltf.scene;
  return gltf;
}

test("a failed character download can retry, and successful loading is shared", async () => {
  const originalLoad = GLTFLoader.prototype.loadAsync;
  let attempts = 0;
  GLTFLoader.prototype.loadAsync = async () => {
    attempts++;
    if (attempts === 1) throw new Error("offline");
    return parseCharacter();
  };
  try {
    const first = loadCharacter();
    assert.equal(
      loadCharacter(),
      first,
      "Concurrent callers share one request",
    );
    await assert.rejects(first, /offline/);
    await loadCharacter();
    await loadCharacter();
    assert.equal(attempts, 2, "Success stays cached after a retry");
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoad;
  }
});

test("outfits never show the source bag across the chest", () => {
  const avatar = createAvatar(new T.Group(), 0, 0, outfits[0]);
  try {
    const bag = avatar.model.getObjectByName("Trim");
    assert.ok(bag instanceof T.Mesh);
    for (const body of [0, 1]) {
      for (let clothing = 0; clothing < appearanceLimits.clothing; clothing++) {
        applyLook(avatar, { outfit: 0, skin: 0, hat: 0, body, clothing });
        assert.equal(bag.visible, false, `body ${body}, outfit ${clothing}`);
        assert.equal(avatar.model.getObjectByName("Shirt")?.visible, true);
      }
    }
  } finally {
    disposeAvatar(avatar);
  }
});

test("avatar teardown disposes private materials, skeleton textures and magic once", () => {
  const scene = new T.Group();
  const remote = createAvatar(scene, 0, 0, outfits[0]);
  const local = createAvatar(scene, 2, 0, outfits[1], skins[6], 0, { pet: 1 });
  const companion = local.pet;
  local.magic = buildMagic(local.extras, 17);
  assert.ok(local.magic);
  let materialDisposals = 0;
  let skeletonTextureDisposals = 0;
  let particleDisposals = 0;
  let sharedDisposals = 0;
  const shared = new Set<T.BufferGeometry>();
  source.traverse((object) => {
    if (object instanceof T.Mesh) shared.add(object.geometry);
  });
  shared.forEach((geometry) =>
    geometry.addEventListener("dispose", () => sharedDisposals++),
  );
  local.materials.forEach((material) =>
    material.addEventListener("dispose", () => materialDisposals++),
  );
  const skeletons = new Set<T.Skeleton>();
  local.model.traverse((object) => {
    if (object instanceof T.SkinnedMesh) skeletons.add(object.skeleton);
  });
  skeletons.forEach((skeleton) => {
    skeleton.computeBoneTexture();
    skeleton.boneTexture!.addEventListener(
      "dispose",
      () => skeletonTextureDisposals++,
    );
  });
  for (const layer of local.magic.layers) {
    layer.points.geometry.addEventListener(
      "dispose",
      () => particleDisposals++,
    );
  }
  const layers = local.magic.layers.length;
  disposeAvatar(local);
  disposeAvatar(local);
  assert.equal(materialDisposals, local.materials.size);
  assert.equal(skeletonTextureDisposals, skeletons.size);
  assert.equal(particleDisposals, layers);
  assert.equal(sharedDisposals, 0);
  assert.equal(companion?.root.parent, null);
  assert.equal(scene.children.length, 1);
  assert.equal(remote.root.parent, scene);
  const nextPreview = createAvatar(scene, 0, 0, outfits[2]);
  animateDetails(remote, 2, "idle");
  animateDetails(nextPreview, 3, "walk");
  assert.equal(
    sharedDisposals,
    0,
    "The asset remains reusable after preview and player removal",
  );
  disposeAvatar(remote);
  disposeAvatar(nextPreview);
  assert.equal(scene.children.length, 0);
});

test("wardrobe swaps preserve independent skeletons and finite interaction poses", () => {
  const scene = new T.Group();
  const local = createAvatar(scene, 0, 0, outfits[0]);
  const remote = createAvatar(scene, 1, 0, outfits[0]);
  assert.notEqual(local.rig.get("head")!.bone, remote.rig.get("head")!.bone);
  const remoteRest = remote.rig.get("head")!.bone.quaternion.clone();
  for (const [index, name] of [
    "Kart_grip_r",
    "Kart_grip_l",
    "Swing_chain",
    "Swing_chain001",
    "Kopi_head",
    "Bell_lever",
    "Arcade_button",
    "Joystick_grip",
  ].entries()) {
    const target = new T.Object3D();
    target.name = name;
    target.position.set(index % 2 ? 0.4 : -0.4, 1.1, 0.4);
    scene.add(target);
  }
  for (let i = 0; i < 30; i++) {
    applyLook(local, {
      outfit: i % outfits.length,
      skin: i % skins.length,
      hat: 0,
      clothing: i % 24,
      hair: i % 28,
    });
    local.left.rotation.x = -1;
    local.right.rotation.x = -1;
    local.legs.forEach((leg) => {
      leg.rotation.x = -1.25;
    });
    for (const mode of [
      "idle",
      "walk",
      "arcade",
      "swing",
      "pet",
      "bell",
      "drive",
    ]) {
      animateDetails(local, i * 0.1, mode, i % 2 === 0);
      local.root.updateMatrixWorld(true);
      local.model.traverse((object) =>
        assert.ok(object.matrixWorld.elements.every(Number.isFinite)),
      );
    }
  }
  assert.ok(remote.rig.get("head")!.bone.quaternion.equals(remoteRest));
  disposeAvatar(local);
  disposeAvatar(remote);
});

test("private player decorations are disposed without destroying the shared sprite quad", () => {
  const avatar = createAvatar(new T.Group(), 0, 0, outfits[0]);
  const geometry = new T.PlaneGeometry();
  const texture = new T.Texture();
  const material = new T.MeshBasicMaterial({ map: texture });
  const label = new T.Mesh(geometry, material);
  const spriteMaterial = new T.SpriteMaterial({ map: texture });
  const sprite = new T.Sprite(spriteMaterial);
  label.userData.avatarDecoration = true;
  sprite.userData.avatarDecoration = true;
  avatar.root.add(label, sprite);
  let meshesDisposed = 0;
  let texturesDisposed = 0;
  let materialsDisposed = 0;
  let sharedQuadsDisposed = 0;
  geometry.addEventListener("dispose", () => meshesDisposed++);
  texture.addEventListener("dispose", () => texturesDisposed++);
  material.addEventListener("dispose", () => materialsDisposed++);
  spriteMaterial.addEventListener("dispose", () => materialsDisposed++);
  sprite.geometry.addEventListener("dispose", () => sharedQuadsDisposed++);
  disposeAvatar(avatar);
  disposeAvatar(avatar);
  assert.equal(meshesDisposed, 1);
  assert.equal(
    texturesDisposed,
    1,
    "Shared label texture is disposed once within the avatar",
  );
  assert.equal(materialsDisposed, 2);
  assert.equal(sharedQuadsDisposed, 0);
});

test("facial morphs blink independently and stay open with reduced animation", () => {
  const local = createAvatar(new T.Group(), 0, 0, outfits[0]);
  const remote = createAvatar(new T.Group(), 0, 0, outfits[0]);
  assert.equal(
    local.expressions.length,
    3,
    "Both pairs of eyes and the lashes blink",
  );
  animateDetails(local, 0.14, "wave");
  for (const mesh of local.expressions) {
    assert.equal(
      mesh.morphTargetInfluences![mesh.morphTargetDictionary!.Blink],
      1,
    );
  }
  for (const mesh of remote.expressions)
    assert.equal(
      mesh.morphTargetInfluences![mesh.morphTargetDictionary!.Blink],
      0,
    );
  animateDetails(local, 9.29, "idle", true);
  for (const mesh of local.expressions)
    assert.ok(mesh.morphTargetInfluences!.every((value) => value === 0));
  disposeAvatar(local);
  disposeAvatar(remote);
});

test("skin and outfit colours belong to each avatar and leave the shared eye paint alone", () => {
  // Stand-in for the painted eyes, which Node cannot decode.
  const eyePaint = new T.Texture();
  const eyeMaterials = new Set<T.MeshStandardMaterial>();
  source.traverse((object) => {
    if (
      object instanceof T.Mesh &&
      object.material instanceof T.MeshStandardMaterial &&
      object.material.name.startsWith("eyes")
    )
      eyeMaterials.add(object.material);
  });
  assert.equal(eyeMaterials.size, 2, "Girl and boy eyes");
  eyeMaterials.forEach((material) => (material.map = eyePaint));
  let paintDisposed = 0;
  eyePaint.addEventListener("dispose", () => paintDisposed++);
  try {
    const scene = new T.Group();
    const remote = createAvatar(scene, 0, 0, outfits[0], skins[6]);
    const local = createAvatar(scene, 0, 0, outfits[1], skins[0]);
    assert.notEqual(local.materials.get("skin"), remote.materials.get("skin"));
    const hex = (avatar: typeof local, name: string) =>
      "#" + avatar.materials.get(name)!.color.getHexString();
    assert.equal(hex(remote, "skin"), skins[6]);
    assert.equal(hex(local, "skin"), skins[0]);
    assert.equal(
      hex(local, "jacket"),
      "#996fff",
      "Character palette is more saturated than the world",
    );
    const base = new T.Color("#ffc8b6");
    for (let i = 0; i < 30; i++) {
      applyLook(local, {
        outfit: i % outfits.length,
        skin: i % skins.length,
        hat: 0,
        body: i % 2,
        clothing: i % 24,
      });
      for (const name of ["eyes", "eyes_b"]) {
        const eye = local.materials.get(name)!;
        assert.equal(eye.map, eyePaint, "Eye paint is shared, never redrawn");
        assert.equal(eye.color.getHexString(), "ffffff");
      }
      // The face texture is painted in the source tone and scaled to this one.
      const tone = new T.Color(skins[i % skins.length]);
      const face = local.materials.get("face")!.color;
      for (const channel of ["r", "g", "b"] as const)
        assert.ok(
          Math.abs(face[channel] * base[channel] - tone[channel]) < 1e-6,
        );
      const visible: string[] = [];
      local.model.traverse((object) => {
        if (
          object instanceof T.Mesh &&
          object.visible &&
          !object.userData.outline
        )
          visible.push(object.name);
      });
      assert.equal(visible.includes("EyesB"), i % 2 === 1);
      assert.equal(visible.includes("Eyes"), i % 2 === 0);
      assert.ok(!(i % 2 && visible.includes("Skirt")), "The boy wears shorts");
      assert.equal(
        visible.filter((n) => ["Skirt", "Shorts", "Trousers"].includes(n))
          .length,
        1,
      );
    }
    assert.equal(hex(remote, "skin"), skins[6], "Other avatars are untouched");
    disposeAvatar(local);
    disposeAvatar(remote);
    assert.equal(paintDisposed, 0, "The shared paint outlives its avatars");
  } finally {
    eyeMaterials.forEach((material) => (material.map = null));
  }
});

test("emotes change the real mouth and one-eye wink without changing the saved look", () => {
  const avatar = createAvatar(new T.Group(), 0, 0, outfits[0]);
  const before = { ...avatar.look };
  const mouths = new Set<string>();
  for (const mode of ["dance", "cheer", "wave", "think"]) {
    animateDetails(avatar, 1.2, mode);
    mouths.add(avatar.hat.getObjectByName("Mouth")!.scale.toArray().join(","));
    if (mode === "wave")
      for (const mesh of avatar.expressions)
        assert.equal(
          mesh.morphTargetInfluences![mesh.morphTargetDictionary!.Wink],
          0.95,
        );
  }
  assert.equal(mouths.size, 4);
  assert.deepEqual(avatar.look, before);
  disposeAvatar(avatar);
});

test("cheer wrists stay outside the large head so both hands are visible", () => {
  const a = createAvatar(new T.Group(), 0, 0, outfits[0]);
  a.left.rotation.z = -2.1;
  a.right.rotation.z = 2.1;
  animateDetails(a, 1, "cheer");
  a.root.updateMatrixWorld(true);
  for (const side of ["r", "l"]) {
    const wrist = a.rig
      .get("wrist" + side)!
      .bone.getWorldPosition(new T.Vector3());
    assert.ok(Math.abs(wrist.x) > 0.43);
    assert.ok(wrist.y > 1.2);
  }
  disposeAvatar(a);
});
