// Builds public/models/neighbour-kaykit.glb from the KayKit Adventurers (CC0) pack.
// Every KayKit character shares one 41-bone rig, so all body parts are merged
// onto the Knight's skeleton and swapped at runtime by visibility.
//
// Source files (not committed, ~18 MB): download the five Character GLBs from
// https://github.com/KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0
// (commit 672074b, addons/kaykit_character_pack_adventures/Characters/gltf/)
// into art/characters/kaykit/, then run:  node scripts/build_kaykit_character.mjs
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import {
  mergeDocuments,
  prune,
  dedup,
  quantize,
  unpartition,
} from "@gltf-transform/functions";

const dir = new URL("../art/characters/kaykit/", import.meta.url);
const out = new URL("../public/models/neighbour-kaykit.glb", import.meta.url);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const sources = ["Knight", "Barbarian", "Mage", "Rogue", "Rogue_Hooded"];

const doc = await io.read(new URL("Knight.glb", dir).pathname);
const root = doc.getRoot();
const baseScene = root.listScenes()[0];
const baseRig = baseScene.listChildren().find((n) => n.getName() === "Rig");
const baseSkin = root.listSkins()[0];
const bones = new Map(baseSkin.listJoints().map((j) => [j.getName(), j]));

// Parts we keep. Everything else (weapons, shields, mugs, duplicate Rogue body) is dropped.
const keep = /_(Body|ArmLeft|ArmRight|LegLeft|LegRight|Head|Head_Hooded|Helmet|Hat|Cape)$/;

for (const name of sources.slice(1)) {
  const other = await io.read(new URL(name + ".glb", dir).pathname);
  // Rogue_Hooded repeats Rogue's body; take only its hooded head.
  const only = name === "Rogue_Hooded" ? /_Head_Hooded$/ : keep;
  const map = mergeDocuments(doc, other);
  for (const scene of other.getRoot().listScenes()) {
    const merged = map.get(scene);
    merged.traverse((node) => {
      const mesh = node.getMesh();
      if (!mesh || !only.test(node.getName())) return;
      if (node.getSkin()) {
        node.setSkin(baseSkin);
        baseRig.addChild(node);
      } else {
        // Rigid attachments (helmet, hats, capes) sit under a bone; reparent to the
        // matching bone on the shared skeleton, keeping the local transform.
        const bone = bones.get(node.getParentNode().getName());
        if (bone) bone.addChild(node);
      }
    });
    // Whatever was not moved onto the shared rig (second skeleton, weapons) goes.
    const leftovers = [];
    merged.traverse((n) => leftovers.push(n));
    for (const n of leftovers) n.dispose();
    merged.dispose();
  }
}

// Drop weapons and props from the Knight too, plus all 76 baked clips: Darecade
// drives the rig procedurally and from its own Blender interaction scenes.
baseScene.traverse((node) => {
  if (node.getMesh() && !keep.test(node.getName())) node.dispose();
});
for (const a of root.listAnimations()) {
  for (const s of a.listSamplers()) {
    s.getInput()?.dispose();
    s.getOutput()?.dispose();
  }
  a.dispose();
}
for (const n of root.listNodes()) if (n.getSkin()) n.setSkin(baseSkin);
for (const s of root.listSkins()) if (s !== baseSkin) s.dispose();
for (const s of root.listScenes()) if (s !== baseScene) s.dispose();
root.setDefaultScene(baseScene);
for (const m of root.listMaterials()) {
  const tex = m.getBaseColorTexture();
  m.setName((tex?.getName() || m.getName()).replace("_texture", ""));
  m.setMetallicFactor(0).setRoughnessFactor(0.85);
}

await doc.transform(
  prune(),
  dedup(),
  quantize({ quantizeNormal: 10, quantizePosition: 14 }),
  unpartition(),
);
await io.write(out.pathname, doc);
const parts = baseScene
  .listChildren()
  .flatMap((n) => [n, ...n.listChildren()])
  .length;
console.log("Wrote", out.pathname, "nodes:", root.listNodes().length, parts);
