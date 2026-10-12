import test from "node:test";
import assert from "node:assert/strict";
import * as T from "three";
import {
  buildHair,
  hairStyles,
  expressionFor,
} from "../src/character-finish.ts";
import {
  starterClasses,
  buildClassBody,
  buildClassHead,
  animateCostume,
} from "../src/class-costumes.ts";
import { itemLook } from "../src/wardrobe.ts";
import { fresh, normalise } from "../src/state.ts";
import { legendarySets, setLook } from "../src/collections.ts";

test("eight hair silhouettes have distinct geometry and stay in the head envelope", () => {
  const shapes = new Set();
  for (let i = 0; i < 8; i++) {
    const parent = new T.Group();
    const hair = buildHair(parent, i);
    const box = new T.Box3().setFromObject(hair);
    assert.ok(box.max.x - box.min.x < 1.5);
    shapes.add(
      JSON.stringify(
        hair.children.map((o) =>
          o instanceof T.Mesh
            ? Array.from(o.geometry.getAttribute("position").array)
            : o.position.toArray(),
        ),
      ),
    );
  }
  assert.equal(hairStyles.length, 8);
  assert.equal(shapes.size, 8);
  assert.deepEqual(
    new Set(["dance", "jump", "victory", "think"].map(expressionFor)),
    new Set(["happy", "surprised", "wink", "sleepy"]),
  );
});
test("five free class remaps have volume, rear capes and finite cloth motion", () => {
  for (const c of starterClasses) {
    const body = new T.Group(),
      head = new T.Group();
    buildClassBody(body, c.clothing, false);
    buildClassHead(head, c.clothing);
    const cape = body.getObjectByName("SwayCape")!;
    assert.ok(cape, c.name);
    assert.ok(cape.position.z < 0);
    assert.ok(body.getObjectByName("EquipSparkles"));
    for (const time of [0, 0.4, 2])
      animateCostume(body, time, true, false, time);
    body.updateMatrixWorld(true);
    body.traverse((o) =>
      assert.ok(o.matrixWorld.elements.every(Number.isFinite)),
    );
  }
});
test("try-ons preserve player identity and never mutate saved progression", () => {
  const save = {
    ...fresh(),
    skin: 6,
    body: 1,
    hair: 44,
    xp: 1400,
    wardrobeSpent: 12,
    wardrobeUnlocked: ["solar"],
    wardrobePurchased: ["galaxy"],
  };
  const before = JSON.stringify(save);
  for (const [slot, index] of [
    ["clothing", 1],
    ["sets", -1],
    ["pet", 2],
  ] as const) {
    const look = itemLook(slot, index, save);
    assert.equal(look.skin, 6);
    assert.equal(look.body, 1);
    assert.equal(look.hair, 44);
  }
  for (let i = 0; i < legendarySets.length; i++) {
    const old = { ...save, ...setLook(i) };
    const loaded = normalise(JSON.parse(JSON.stringify(old)), fresh());
    for (const key of [
      "clothing",
      "hair",
      "pet",
      "accessory",
      "xp",
      "wardrobeSpent",
      "wardrobeUnlocked",
      "wardrobePurchased",
    ] as const)
      assert.deepEqual(loaded[key], old[key], `${legendarySets[i].id}: ${key}`);
  }
  assert.equal(JSON.stringify(save), before);
});

test("class capes flare from a narrow shoulder and have curved depth", () => {
 const body=new T.Group();buildClassBody(body,1,false);
 const cloth=body.getObjectByName("CurvedCape");assert.ok(cloth instanceof T.Mesh);
 const p=cloth.geometry.getAttribute("position");let top=0,bottom=0;const depths=new Set();
 for(let i=0;i<p.count;i++){if(p.getY(i)>-0.01)top=Math.max(top,Math.abs(p.getX(i)));if(p.getY(i)<-0.8)bottom=Math.max(bottom,Math.abs(p.getX(i)));depths.add(p.getZ(i).toFixed(3));}
 assert.ok(bottom>top*2);assert.ok(depths.size>10);
});
