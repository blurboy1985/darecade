import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as T from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { interactionSpecs } from "../src/interactions.ts";
import { blocked, route } from "../src/navigation.ts";

async function load(kind: string) {
  const bytes = await readFile(
    new URL(`../public/models/interactions/${kind}.glb`, import.meta.url),
  );
  return new GLTFLoader().parseAsync(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
    "",
  );
}
test("six Blender exports contain animated player and prop tracks on a common timeline", async () => {
  for (const [kind, prop] of Object.entries({
    swing: "SwingPivot",
    bench: "Turning_page",
    pet: "KopiTail",
    bell: "BicycleBell",
    arcade: "CabinetJoystick",
    dragon: "Slide_sparkle",
  })) {
    const g = await load(kind);
    const tracks = g.animations.flatMap((a) => a.tracks);
    assert.ok(
      tracks.some((t) => t.name.startsWith("PlayerRig.position")),
      kind + " player motion",
    );
    assert.ok(
      tracks.some((t) => t.name.startsWith("RightArm.quaternion")),
      kind + " arm motion",
    );
    assert.ok(
      tracks.some((t) => t.name.startsWith(prop + ".")),
      kind + " prop motion",
    );
    assert.equal(
      new Set(tracks.map((t) => t.name)).size,
      tracks.length,
      kind + " unambiguous bindings",
    );
    assert.ok(g.scene.getObjectByName("PlayerRig"));
    let previews = 0;
    g.scene.traverse((o) => {
      if (o.userData.preview_avatar) previews++;
    });
    assert.ok(previews >= 10, kind + " editable reference avatar");
    for (const t of tracks)
      assert.ok(Array.from(t.values).every(Number.isFinite));
  }
});
test("Blender swing seat and player remain synchronized through the moving part of the clip", async () => {
  const g = await load("swing");
  const mixer = new T.AnimationMixer(g.scene);
  const clip = new T.AnimationClip(
    "joint",
    9,
    g.animations.flatMap((a) => a.tracks),
  );
  mixer.clipAction(clip).setLoop(T.LoopOnce, 1).play();
  for (const t of [2, 3, 4, 5, 6, 7]) {
    mixer.setTime(t);
    const player = g.scene.getObjectByName("PlayerRig")!,
      pivot = g.scene.getObjectByName("SwingPivot")!;
    const seatAngle = new T.Euler().setFromQuaternion(pivot.quaternion).x;
    assert.ok(
      Math.abs(player.position.y - (3.05 - 2.92 * Math.cos(seatAngle))) < 0.002,
    );
    assert.ok(Math.abs(player.position.z + 2.92 * Math.sin(seatAngle)) < 0.002);
    assert.ok(Math.abs(player.quaternion.angleTo(pivot.quaternion)) < 0.002);
  }
});
test("all interaction approach and cancellation points remain reachable", () => {
  const obstacles = [
    { x: -5, z: -10, w: 18, d: 5 },
    { x: 12, z: -8, w: 7, d: 6 },
    { x: 15, z: 3, w: 3, d: 3.2 },
    { x: -15, z: -2.5, w: 4.2, d: 1.2 },
    { x: 11, z: 10, w: 5, d: 3 },
    { x: -2, z: 10, w: 3.2, d: 1.4 },
  ];
  for (const s of interactionSpecs) {
    assert.equal(blocked(...s.approach, obstacles), false, s.id + " approach");
    assert.equal(blocked(...s.exit, obstacles), false, s.id + " exit");
    assert.ok(
      route({ x: 0, z: 10 }, { x: s.approach[0], z: s.approach[1] }, obstacles)
        .length,
      s.id + " route",
    );
  }
});
