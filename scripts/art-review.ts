// Runs the production avatar, fitting room and LobbyWorld against synthetic local looks.
// This page never imports main/account and never reads or writes player progress.
import * as T from "three";
import type { Look } from "../src/character";
const character = await import(
  new URLSearchParams(location.search).has("before")
    ? "../.browser/baseline/review-entry.ts"
    : "./art-review-runtime.ts"
);
const {
  loadCharacter,
  createAvatar,
  applyLook,
  animateDetails,
  disposeAvatar,
  createCharacterPreview,
} = character;
import type { LobbyWorld as WorldType } from "../src/world";
const { LobbyWorld } = character;
import { fresh } from "../src/state";
import {
  clothingNames,
  hairNames,
  petNames,
  accessoryNames,
} from "../src/appearance";
import { thumbnailLook } from "../src/wardrobe";
import { legendarySets } from "../src/collections";
import type { SharedPlayer } from "../src/social";
const host = document.querySelector<HTMLElement>("#world")!;
const fitting = document.querySelector<HTMLElement>("#fitting")!;
const report = document.querySelector<HTMLElement>("#report")!;
const label = document.querySelector<HTMLElement>("#label")!;
const looks: Look[] = [
  { outfit: 3, skin: 0, hat: 0, clothing: 1, hair: 0, pet: 1, accessory: 1 },
  { outfit: 1, skin: 6, hat: 0, clothing: 3, hair: 5, pet: 4, accessory: 17 },
  { outfit: 4, skin: 2, hat: 0, clothing: 5, hair: 6, pet: 24, accessory: 26 },
  { outfit: 2, skin: 7, hat: 0, clothing: 7, hair: 3, pet: 1, accessory: 0 },
  { outfit: 0, skin: 3, hat: 0, clothing: 8, hair: 4, pet: 0, accessory: 0 },
  {
    outfit: 1,
    skin: 5,
    hat: 0,
    clothing: 25,
    hair: 29,
    pet: 27,
    accessory: 28,
  },
];
await loadCharacter();
const save = { ...fresh(), ...looks[0], reduced: true };
const world = new LobbyWorld(host, save, {
  interact() {},
  visit() {},
  coin() {},
  near() {},
  fallback() {
    label.textContent = "WebGL fallback requested";
  },
});
world.paused = true;
world.player.root.rotation.y = 0;
const preview = createCharacterPreview(fitting, { ...looks[0], reduced: true });
function draw() {
  world.renderer.render(world.scene, world.camera);
}
function summary() {
  let triangles = 0,
    calls = 0;
  world.player.model.traverse((o) => {
    if (o instanceof T.Mesh && o.visible) {
      calls++;
      triangles +=
        (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    }
  });
  return {
    visibleAvatarTriangles: triangles,
    visibleAvatarPrimitives: calls,
    worldDrawCalls: world.renderer.info.render.calls,
    remotes: world.renderer.domElement.dataset.sharedPlayers ?? "0",
    camera: world.cameraMode,
  };
}
function show(index: number) {
  Object.assign(save, looks[index]);
  world.updateAvatar();
  preview.mount(fitting, { ...looks[index], reduced: save.reduced });
  world.player.root.rotation.y = 0;
  draw();
  label.textContent = clothingNames[save.clothing];
  report.textContent = JSON.stringify(summary(), null, 2);
}
show(0);
document.querySelector<HTMLSelectElement>("#look")!.onchange = (e) =>
  show(Number((e.currentTarget as HTMLSelectElement).value));
document.querySelector<HTMLButtonElement>("#camera")!.onclick = (e) => {
  world.setCameraMode(world.cameraMode === "third" ? "isometric" : "third");
  draw();
  (e.currentTarget as HTMLButtonElement).textContent =
    world.cameraMode === "third" ? "Bird’s-eye" : "Third-person";
  report.textContent = JSON.stringify(summary(), null, 2);
};
document.querySelector<HTMLButtonElement>("#reduced")!.onclick = () => {
  save.reduced = !save.reduced;
  world.setReduced(save.reduced);
  preview.mount(fitting, { ...save });
  animateDetails(world.player, 4, "idle", save.reduced);
  draw();
  label.textContent = `${clothingNames[save.clothing]} · reduced=${save.reduced}`;
};
const players: SharedPlayer[] = Array.from({ length: 24 }, (_, i) => ({
  id: `art-fixture-${i}`,
  name: `Art fixture ${i + 1}`,
  look: looks[i % looks.length],
  activity: "jog",
  since: 0,
  x: ((i % 6) - 2.5) * 1.8,
  z: 8 + Math.floor(i / 6) * 1.8,
  yaw: 0,
  status: "offline",
  best: { ...save.best },
  points: 0,
  incoming: 0,
  outgoing: 0,
  wins: 0,
}));
document.querySelector<HTMLButtonElement>("#crowd")!.onclick = () => {
  world.syncPlayers(players, "local");
  draw();
  report.textContent = JSON.stringify(summary(), null, 2);
};
document.querySelector<HTMLButtonElement>("#clear")!.onclick = () => {
  world.syncPlayers([], "local");
  draw();
  report.textContent = JSON.stringify(summary(), null, 2);
};
function assert(ok: unknown, message: string) {
  if (!ok) throw Error(message);
}
function finiteSkin(a: ReturnType<typeof createAvatar>) {
  a.root.updateMatrixWorld(true);
  a.model.traverse((o) => {
    if (!(o instanceof T.SkinnedMesh) || !o.visible) return;
    o.skeleton.update();
    const p = new T.Vector3();
    for (let i = 0; i < o.geometry.attributes.position.count; i += 17) {
      o.getVertexPosition(i, p);
      assert(Number.isFinite(p.x + p.y + p.z), `Nonfinite vertex ${o.name}`);
    }
  });
}
async function verify() {
  const checks = [];
  const scene = new T.Scene();
  const a = createAvatar(scene, 0, 0, "#76cfe0", "#f6c9a1", 0, looks[0]);
  const b = createAvatar(scene, 2, 0, "#76cfe0", "#f6c9a1", 0, looks[0]);
  try {
    assert(
      a.rig.get("head")?.bone !== b.rig.get("head")?.bone,
      "Clones share a head bone",
    );
    const slots = {
      clothing: clothingNames,
      hair: hairNames,
      pet: petNames,
      accessory: accessoryNames,
    };
    let swaps = 0;
    for (const [slot, names] of Object.entries(slots))
      for (let i = 0; i < names.length; i++) {
        const previousPet = a.pet?.root;
        applyLook(a, { ...looks[0], [slot]: i });
        if (previousPet && previousPet !== a.pet?.root)
          assert(!previousPet.parent, "Replaced pet remains attached");
        for (const mode of [
          "idle",
          "wave",
          "walk",
          "bench",
          "swing",
          "drive",
          "arcade",
          "pet",
          "bell",
        ]) {
          animateDetails(a, 1.4, mode, true);
          finiteSkin(a);
        }
        swaps++;
      }
    checks.push({
      check: "All saved cosmetic indices and 9 pose modes",
      swaps,
      passed: true,
    });
    applyLook(a, looks[0]);
    applyLook(b, looks[0]);
    const maps = new Set(
      [...a.materials.values()].map((m) => m.map).filter(Boolean),
    );
    let released = 0;
    for (const map of maps) map!.addEventListener("dispose", () => released++);
    // The world/preview keep the same palette in use too. Disposing one clone must leave its peers live.
    disposeAvatar(a);
    assert(released === 0, "Disposing one avatar released a shared tint");
    assert(
      !a.root.parent && !a.pet?.root.parent,
      "Disposed avatar or companion remains attached",
    );
    assert(
      [...b.materials.values()].every(
        (m) => !m.map?.userData.tintKey || m.map.userData.users > 0,
      ),
      "Shared tint users underflow",
    );
    finiteSkin(b);
    checks.push({
      check: "Independent skeleton and shared tint survives peer disposal",
      passed: true,
    });
    const initial = world.renderer.domElement.dataset.sharedPlayers;
    world.syncPlayers(players, "local");
    assert(
      world.renderer.domElement.dataset.sharedPlayers === "24",
      "Remote fixtures absent",
    );
    world.syncPlayers(
      players.map((p) => ({ ...p, look: looks[3] })),
      "local",
    );
    draw();
    world.syncPlayers([], "local");
    assert(
      world.renderer.domElement.dataset.sharedPlayers === "0",
      "Remote fixtures remain",
    );
    checks.push({
      check: "24 remotes create, swap and remove",
      initial,
      passed: true,
    });
    for (let i = 0; i < 10; i++) {
      const h = document.createElement("div");
      h.style.cssText = "width:240px;height:220px;position:fixed;left:-1000px";
      document.body.append(h);
      const p = createCharacterPreview(h, { ...looks[i % 6], reduced: true });
      p.thumbnail(looks[(i + 1) % 6]);
      p.dispose();
      assert(
        !h.querySelector("canvas"),
        "Preview canvas remains after disposal",
      );
      h.remove();
    }
    checks.push({
      check: "10 fitting room open/swap/dispose cycles",
      passed: true,
    });
    const frozen = JSON.stringify(b.extras.toJSON());
    animateDetails(b, 100, "idle", true);
    assert(
      JSON.stringify(b.extras.toJSON()) === frozen,
      "Reduced effects changed with clock",
    );
    checks.push({ check: "Reduced motion effects freeze", passed: true });
    return checks;
  } finally {
    disposeAvatar(a);
    disposeAvatar(b);
  }
}
document.querySelector<HTMLButtonElement>("#verify")!.onclick = async () => {
  try {
    report.textContent = JSON.stringify(await verify(), null, 2);
  } catch (e) {
    report.textContent = `FAIL ${String(e)}`;
    throw e;
  }
};
async function thumbnails() {
  const images: Record<string, string> = {};
  for (const [slot, names] of Object.entries({
    clothing: clothingNames,
    hair: hairNames,
    pet: petNames,
    accessory: accessoryNames,
    sets: legendarySets,
  })) {
    for (let i = 0; i < names.length; i++) {
      images[`${slot}-${i}`] = preview.thumbnail(
        thumbnailLook(slot as Parameters<typeof thumbnailLook>[0], i),
        slot === "sets" ? "set" : slot,
      );
    }
  }
  return images;
}
async function saveThumbnails() {
  const images = await thumbnails();
  for (const [name, data] of Object.entries(images)) {
    const response = await fetch("/__art-thumbnails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: `${name}.png`, base64: data.split(",")[1] }),
    });
    if (!response.ok) throw Error(await response.text());
  }
  return { saved: Object.keys(images).length };
}
document.querySelector<HTMLButtonElement>("#thumbnails")!.onclick =
  async () => {
    const images = await thumbnails();
    report.textContent = `Rendered ${Object.keys(images).length} production thumbnails`;
  };
declare global {
  interface Window {
    artReview: {
      world: WorldType;
      preview: ReturnType<typeof createCharacterPreview>;
      verify: typeof verify;
      thumbnails: typeof thumbnails;
      summary: typeof summary;
      show: typeof show;
      saveThumbnails: typeof saveThumbnails;
    };
  }
}
window.artReview = {
  world,
  preview,
  verify,
  thumbnails,
  summary,
  show,
  saveThumbnails,
};
