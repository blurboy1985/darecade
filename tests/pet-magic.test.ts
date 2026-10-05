import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { makePet, animatePet } from "../src/pets.ts";
import { buildMagic, disposeMagic } from "../src/magic.ts";
import { petNames, accessoryNames } from "../src/appearance.ts";

function budget(root: T.Object3D) {
  let draws = 0;
  let triangles = 0;
  let particles = 0;
  let vertices = 0;
  let meshBytes = 0;
  root.traverse((child) => {
    if (child instanceof T.Mesh) {
      draws += Array.isArray(child.material) ? child.material.length : 1;
      triangles +=
        (child.geometry.index?.count ??
          child.geometry.getAttribute("position").count) / 3;
      vertices += child.geometry.getAttribute("position").count;
      meshBytes += child.geometry.index?.array.byteLength ?? 0;
      for (const attribute of Object.values(child.geometry.attributes))
        meshBytes += attribute.array.byteLength;
    } else if (child instanceof T.Points) {
      draws++;
      particles += child.geometry.getAttribute("position").count;
    }
  });
  return { draws, triangles, particles, vertices, meshBytes };
}

function meshes(root: T.Object3D) {
  const found: T.Mesh[] = [];
  root.traverse((child) => {
    if (child instanceof T.Mesh) found.push(child);
  });
  return found;
}

function snapshot(root: T.Object3D) {
  root.updateMatrixWorld(true);
  const transforms: number[][] = [];
  root.traverse((child) => transforms.push(child.matrixWorld.toArray()));
  return transforms;
}

test("original familiars preserve saved cosmetic IDs within mobile mesh budgets", (t) => {
  assert.equal(petNames[1], "Mochi the cat");
  assert.equal(petNames[4], "Peaches the bunny");
  assert.equal(petNames[24], "Mer the merlion cub");
  for (const kind of [1, 4, 24]) {
    const pet = makePet(new T.Group(), kind);
    const measured = budget(pet.root);
    t.diagnostic(`pet ${kind}: ${JSON.stringify(measured)}`);
    assert.equal(pet.kind, kind);
    assert.ok(measured.draws <= 8, "Eight opaque batches per familiar at most");
    assert.ok(
      measured.triangles <= 2800,
      "A familiar fits a 2,800-triangle budget",
    );
    assert.ok(measured.meshBytes <= 110_000, "Indexed batches fit 110 KB");
    for (const mesh of meshes(pet.root)) {
      assert.equal(Array.isArray(mesh.material), false);
      const index = mesh.geometry.index;
      assert.ok(index, "Shared batches reuse vertices with an index");
      assert.ok(
        Array.from(index.array).every(
          (vertex) => vertex < mesh.geometry.getAttribute("position").count,
        ),
        "Every index references an uploaded vertex",
      );
      for (const attribute of ["position", "normal", "color"]) {
        const values = mesh.geometry.getAttribute(attribute);
        assert.ok(values, `${attribute} is present`);
        assert.ok(Array.from(values.array).every(Number.isFinite));
      }
    }
  }
});

test("familiar batches stay shared and intact through repeated companion swaps", () => {
  const scene = new T.Group();
  for (const kind of [1, 4, 24]) {
    const remote = makePet(scene, kind);
    const remoteMeshes = meshes(remote.root);
    const original = remoteMeshes.map((mesh) => mesh.geometry);
    const geometryValues = original.map((geometry) =>
      Array.from(geometry.getAttribute("position").array),
    );
    let disposed = 0;
    original.forEach((geometry) =>
      geometry.addEventListener("dispose", () => disposed++),
    );
    for (const mesh of remoteMeshes) {
      assert.ok(mesh.material instanceof T.Material);
      mesh.material.addEventListener("dispose", () => disposed++);
    }
    for (let swap = 0; swap < 30; swap++) {
      const local = makePet(scene, kind);
      assert.deepEqual(
        meshes(local.root).map((mesh) => mesh.geometry),
        original,
      );
      meshes(local.root).forEach((mesh, i) => {
        assert.equal(mesh.geometry, remoteMeshes[i].geometry);
        assert.equal(mesh.material, remoteMeshes[i].material);
      });
      animatePet(local, swap * 0.2, true);
      local.root.removeFromParent();
    }
    assert.equal(
      disposed,
      0,
      "Removing one companion cannot dispose another player's batches or material",
    );
    assert.deepEqual(
      original.map((geometry) =>
        Array.from(geometry.getAttribute("position").array),
      ),
      geometryValues,
    );
    remote.root.removeFromParent();
  }
  assert.equal(scene.children.length, 0);
});

test("familiar articulation survives batching and reduced-motion time stays fixed", () => {
  for (const kind of [1, 4, 24]) {
    const pet = makePet(new T.Group(), kind);
    animatePet(pet, 0, false);
    const frozen = snapshot(pet.root);
    animatePet(pet, 1.1, true);
    assert.notDeepEqual(snapshot(pet.root), frozen);
    if (kind === 24) assert.equal(pet.wings.length, 2);
    else assert.equal(pet.legs.length, 4);
    if (kind === 4) assert.equal(pet.sway.length, 2);
    animatePet(pet, 0, false);
    assert.deepEqual(snapshot(pet.root), frozen);
    animatePet(pet, 0, false);
    assert.deepEqual(snapshot(pet.root), frozen);
  }
});

test("selected original spells keep their IDs and fit bounded mesh and particle budgets", (t) => {
  assert.equal(accessoryNames[1], "Orbiting stars");
  assert.equal(accessoryNames[17], "Rune circle");
  assert.equal(accessoryNames[26], "Forest spirits");
  for (const kind of [1, 17, 26]) {
    const magic = buildMagic(new T.Group(), kind);
    assert.ok(magic);
    const measured = budget(magic.group);
    t.diagnostic(`magic ${kind}: ${JSON.stringify(measured)}`);
    assert.ok(measured.draws <= (kind === 1 ? 4 : 2));
    assert.ok(measured.triangles <= 650);
    assert.ok(measured.particles <= 20);
    assert.ok(measured.meshBytes <= 55_000, "Charm batches fit 55 KB");
    magic.tick(0, false);
    const transforms = snapshot(magic.group);
    const frozen = magic.layers.map((layer) =>
      Array.from(layer.points.geometry.getAttribute("position").array),
    );
    magic.tick(0, false);
    assert.deepEqual(snapshot(magic.group), transforms);
    assert.deepEqual(
      magic.layers.map((layer) =>
        Array.from(layer.points.geometry.getAttribute("position").array),
      ),
      frozen,
    );
    magic.tick(4, true);
    assert.notDeepEqual(
      magic.layers.map((layer) =>
        Array.from(layer.points.geometry.getAttribute("position").array),
      ),
      frozen,
      "The unfrozen clock animates particle positions",
    );
    for (const layer of magic.layers) {
      const geometry = layer.points.geometry;
      for (const name of ["position", "aSize", "aAlpha", "aSpin"])
        assert.ok(
          Array.from(geometry.getAttribute(name).array).every(Number.isFinite),
        );
      assert.ok(
        Array.from(geometry.getAttribute("aAlpha").array).every(
          (alpha) => alpha >= 0 && alpha <= 1,
        ),
      );
    }
    disposeMagic(magic);
  }
});

test("effect replacement disposes private particles once and keeps shared charms alive", () => {
  const scene = new T.Group();
  for (const kind of [1, 17, 26]) {
    const remote = buildMagic(scene, kind);
    assert.ok(remote);
    const remoteMeshes = meshes(remote.group);
    const remoteGeometry = remoteMeshes.map((mesh) => mesh.geometry);
    let sharedDisposals = 0;
    remoteGeometry.forEach((geometry) =>
      geometry.addEventListener("dispose", () => sharedDisposals++),
    );
    for (const mesh of remoteMeshes) {
      assert.ok(mesh.material instanceof T.Material);
      mesh.material.addEventListener("dispose", () => sharedDisposals++);
    }
    for (let swap = 0; swap < 30; swap++) {
      const local = buildMagic(scene, kind);
      assert.ok(local);
      assert.deepEqual(
        meshes(local.group).map((mesh) => mesh.geometry),
        remoteGeometry,
      );
      meshes(local.group).forEach((mesh, i) => {
        assert.equal(mesh.geometry, remoteMeshes[i].geometry);
        assert.equal(mesh.material, remoteMeshes[i].material);
      });
      let geometryDisposals = 0;
      let materialDisposals = 0;
      for (const layer of local.layers) {
        layer.points.geometry.addEventListener(
          "dispose",
          () => geometryDisposals++,
        );
        assert.ok(layer.points.material instanceof T.Material);
        layer.points.material.addEventListener(
          "dispose",
          () => materialDisposals++,
        );
      }
      const positions = local.layers.map((layer) =>
        Array.from(layer.points.geometry.getAttribute("position").array),
      );
      disposeMagic(local);
      disposeMagic(local);
      local.tick(50, true);
      assert.equal(geometryDisposals, local.layers.length);
      assert.equal(materialDisposals, local.layers.length);
      assert.deepEqual(
        local.layers.map((layer) =>
          Array.from(layer.points.geometry.getAttribute("position").array),
        ),
        positions,
      );
    }
    assert.equal(scene.children.length, 1);
    assert.equal(sharedDisposals, 0);
    remote.tick(2, false);
    disposeMagic(remote);
  }
  assert.equal(scene.children.length, 0);
});
