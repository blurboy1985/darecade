import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import { petNames, accessoryNames } from "../src/appearance.ts";
import { makePet, animatePet } from "../src/pets.ts";
import { buildMagic, disposeMagic } from "../src/magic.ts";
import { buildHeadgear, type Gear } from "../src/headgear.ts";

test("every pet builds, animates and stays finite", () => {
  for (let kind = 1; kind < petNames.length; kind++) {
    const scene = new T.Scene();
    const pet = makePet(scene, kind);
    for (const t of [0, 0.4, 1.3]) animatePet(pet, t, t > 0.5);
    let meshes = 0;
    pet.root.traverse((o) => {
      if (o instanceof T.Mesh) meshes++;
      for (const v of [o.position, o.scale])
        assert.ok(v.toArray().every(Number.isFinite), petNames[kind]);
    });
    assert.ok(meshes >= 4, `${petNames[kind]} has a body`);
  }
});

test("every magic effect builds sparkles that stay near the avatar", () => {
  for (let kind = 1; kind < accessoryNames.length; kind++) {
    const scene = new T.Scene();
    const m = buildMagic(scene, kind)!;
    assert.ok(m, accessoryNames[kind]);
    for (const t of [0.2, 3.7, 11]) m.tick(t, t > 3);
    let visible = 0;
    m.group.traverse((o) => {
      if (o instanceof T.Mesh) visible++;
    });
    for (const l of m.layers) {
      const p = l.points.geometry.getAttribute("position")
        .array as Float32Array;
      for (let i = 0; i < p.length; i += 3) {
        assert.ok(
          [p[i], p[i + 1], p[i + 2]].every(Number.isFinite),
          accessoryNames[kind],
        );
        assert.ok(
          Math.hypot(p[i], p[i + 2]) < 2 && p[i + 1] > -0.1 && p[i + 1] < 3.3,
          accessoryNames[kind],
        );
      }
      visible += l.count;
    }
    assert.ok(visible >= 8, `${accessoryNames[kind]} shows something`);
    disposeMagic(m);
  }
  assert.equal(buildMagic(new T.Scene(), 0), null);
});

test("every procedural headgear builds", () => {
  const gear: Gear[] = [
    "cat",
    "bunny",
    "fox",
    "flowers",
    "party",
    "beanie",
    "chef",
    "grad",
    "headphones",
    "propeller",
    "viking",
    "tiara",
    "mushroom",
    "antlers",
    "bandana",
    "straw",
    "bow",
  ];
  for (const g of gear) {
    const group = new T.Group();
    buildHeadgear(group, g);
    assert.ok(group.children.length >= 2, g);
  }
});
