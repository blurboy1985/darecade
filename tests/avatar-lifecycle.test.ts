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

let source: T.Group;
// Exercise the real GLB meshes and rig in Node. Only embedded image decoding is
// omitted, since Node has no browser Image implementation.
async function parseCharacter() {
  const file = readFileSync(
    new URL("../public/models/neighbour-chibi.glb", import.meta.url),
  );
  const jsonLength = file.readUInt32LE(12);
  const json = JSON.parse(file.toString("utf8", 20, 20 + jsonLength));
  for (const material of json.materials) {
    delete material.pbrMetallicRoughness.baseColorTexture;
    delete material.emissiveTexture;
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
    5,
    "All saved head families have expressions",
  );
  animateDetails(local, 0.09, "wave");
  for (const mesh of local.expressions) {
    assert.equal(
      mesh.morphTargetInfluences![mesh.morphTargetDictionary!.Blink],
      1,
    );
    assert.equal(
      mesh.morphTargetInfluences![mesh.morphTargetDictionary!.Smile],
      0.35,
    );
  }
  for (const mesh of remote.expressions)
    assert.equal(
      mesh.morphTargetInfluences![mesh.morphTargetDictionary!.Blink],
      0,
    );
  animateDetails(local, 9.29, "idle", true);
  for (const mesh of local.expressions)
    assert.deepEqual(mesh.morphTargetInfluences, [0, 0]);
  disposeAvatar(local);
  disposeAvatar(remote);
});

// A small in-memory Canvas implementation tests pixel ownership in Node. It
// copies the image and rectangles exactly, without faking the tint functions.
class RasterCanvas {
  width = 0;
  height = 0;
  pixels = new Uint8ClampedArray();
  getContext() {
    return {
      drawImage: (image: { pixels: Uint8ClampedArray }) => {
        this.pixels = image.pixels.slice();
      },
      getImageData: (x: number, y: number, width: number, height: number) => {
        const data = new Uint8ClampedArray(width * height * 4);
        for (let row = 0; row < height; row++)
          data.set(
            this.pixels.subarray(
              ((y + row) * this.width + x) * 4,
              ((y + row) * this.width + x + width) * 4,
            ),
            row * width * 4,
          );
        return { data, width, height };
      },
      putImageData: (
        image: { data: Uint8ClampedArray; width: number; height: number },
        x: number,
        y: number,
      ) => {
        for (let row = 0; row < image.height; row++)
          this.pixels.set(
            image.data.subarray(
              row * image.width * 4,
              (row + 1) * image.width * 4,
            ),
            ((y + row) * this.width + x) * 4,
          );
      },
    };
  }
}

test("skin tint preserves eye paint and releases cached textures only after their last avatar", () => {
  const image = new RasterCanvas();
  image.width = image.height = 512;
  image.pixels = new Uint8ClampedArray(512 * 512 * 4);
  for (let i = 0; i < image.pixels.length; i += 4)
    image.pixels.set([247, 217, 198, 255], i);
  // Eye highlights and iris detail must survive every palette and skin swap.
  for (let y = 256; y < 512; y++)
    for (let x = 256; x < 512; x++)
      image.pixels.set(
        [x % 256, y % 256, (x + y) % 256, 255],
        (y * 512 + x) * 4,
      );
  const originalTexture = new T.Texture(image);
  originalTexture.colorSpace = T.SRGBColorSpace;
  const originals = new Set<T.MeshStandardMaterial>();
  source.traverse((object) => {
    if (
      object instanceof T.Mesh &&
      object.material instanceof T.MeshStandardMaterial
    )
      originals.add(object.material);
  });
  originals.forEach((material) => {
    material.map = originalTexture;
    material.emissiveMap = originalTexture;
  });
  const originalDocument = Object.getOwnPropertyDescriptor(
    globalThis,
    "document",
  );
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { createElement: () => new RasterCanvas() },
  });
  let sourceDisposed = 0;
  originalTexture.addEventListener("dispose", () => sourceDisposed++);
  try {
    const scene = new T.Group();
    const remote = createAvatar(scene, 0, 0, outfits[0], skins[6]);
    const local = createAvatar(scene, 0, 0, outfits[0], skins[6]);
    const sharedMap = remote.materials.values().next().value!.map!;
    let sharedDisposed = 0;
    sharedMap.addEventListener("dispose", () => sharedDisposed++);
    assert.equal(local.materials.values().next().value!.map, sharedMap);
    for (let i = 0; i < 30; i++) {
      applyLook(local, {
        outfit: i % outfits.length,
        skin: i % skins.length,
        hat: 0,
      });
      for (const material of local.materials.values()) {
        assert.equal(
          material.map,
          material.emissiveMap,
          "Emission follows the selected skin",
        );
        const painted = material.map!.image;
        assert.equal(painted.width, 512);
        assert.equal(painted.height, 512);
        const iris = painted.getContext().getImageData(256, 256, 256, 256).data;
        assert.deepEqual(
          iris,
          image.getContext().getImageData(256, 256, 256, 256).data,
        );
      }
    }
    const dark = sharedMap.image.getContext().getImageData(0, 256, 1, 1).data;
    assert.deepEqual(
      Array.from(dark),
      [105, 69, 54, 255],
      "Dark painted skin follows the saved skin index",
    );
    disposeAvatar(local);
    assert.equal(sharedDisposed, 0, "A remote avatar still owns the tint");
    disposeAvatar(remote);
    disposeAvatar(remote);
    assert.equal(sharedDisposed, 1);
    assert.equal(sourceDisposed, 0, "The template atlas stays alive");
  } finally {
    if (originalDocument)
      Object.defineProperty(globalThis, "document", originalDocument);
    else Reflect.deleteProperty(globalThis, "document");
    originals.forEach((material) => {
      material.map = null;
      material.emissiveMap = null;
    });
  }
});
