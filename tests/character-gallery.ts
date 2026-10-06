import * as T from "three";
import {
  applyLook,
  createAvatar,
  loadCharacter,
  animateDetails,
} from "../src/character";
import { seededLook, distinctHair } from "../src/character-identity";
import { hairVisual, newHairNames, HAIR_START } from "../src/hair-catalog";
import { skins, outfits } from "../src/state";
await loadCharacter();
const host = document.querySelector<HTMLElement>("#view")!;
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
host.append(renderer.domElement);
renderer.outputColorSpace = T.SRGBColorSpace;
renderer.toneMapping = T.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.3;
const scene = new T.Scene();
scene.background = new T.Color("#f5f0e2");
scene.add(new T.HemisphereLight("#fff4e4", "#8b9e93", 2.6));
const light = new T.DirectionalLight("#fff3dd", 3.3);
light.position.set(-5, 10, 8);
scene.add(light);
const camera = new T.OrthographicCamera(
  -8,
  8,
  (8 * innerHeight) / innerWidth,
  (-8 * innerHeight) / innerWidth,
  0.1,
  100,
);
camera.position.set(0, 7, 12);
camera.lookAt(0, 1.4, 0);
const floor = new T.Mesh(
  new T.PlaneGeometry(60, 60),
  new T.MeshStandardMaterial({ color: "#e5dfcc" }),
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const used = new Set<number>();
const colours = new Set<number>();
const avatars = [];
for (let n = 0; n < 10000 && avatars.length < 10; n++) {
  const look = seededLook(`review-${n}`);
  const colour = hairVisual(look.hair).colour;
  if (
    colours.has(colour) ||
    (avatars.length < 8 && hairVisual(look.hair).shape !== avatars.length)
  )
    continue;
  look.hair = distinctHair(look.hair, used);
  used.add(look.hair);
  colours.add(colour);
  const i = avatars.length;
  const a = createAvatar(
    scene,
    ((i % 5) - 2) * 2.5,
    Math.floor(i / 5) * 3.4 - 2,
    outfits[look.outfit],
    skins[look.skin],
    0,
    { ...look, clothing: 0 },
  );
  a.root.userData.id = `review-${n}`;
  avatars.push(a);
  const label = document.createElement("div");
  label.textContent = `${i + 1}. ${newHairNames[look.hair - HAIR_START]} · skin ${look.skin + 1}`;
  document.querySelector("#legend")!.append(label);
}
let mode = "idle",
  back = false,
  blinks = 0,
  previousClosed = false;
for (const action of ["front", "back", "cheer", "wave", "dance", "idle"])
  document.querySelector("#" + action)!.addEventListener("click", () => {
    if (action === "front" || action === "back") back = action === "back";
    else {
      mode = action;
      back = false;
    }
  });
let freezeBlink = false;
function frame(now: number) {
  avatars.forEach((a) => {
    a.root.rotation.y = back ? Math.PI : 0;
    animateDetails(a, now / 1000, mode, false);
  });
  const closed = avatars.some((a) =>
    a.expressions.some(
      (m) =>
        (m.morphTargetInfluences?.[m.morphTargetDictionary?.Blink ?? -1] ?? 0) >
        0.9,
    ),
  );
  if (closed && !previousClosed) blinks++;
  previousClosed = closed;
  document.querySelector("#evidence")!.textContent =
    `10 characters · ${[...used].filter((h) => hairVisual(h).colour === 9).length} blue-haired · 0 identical hair pairs · mode: ${mode} · observed blinks: ${blinks}`;
  renderer.render(scene, camera);
  if (!(freezeBlink && closed && mode === "idle")) requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.querySelector("#classes")!.addEventListener("click", () => {
  avatars.forEach((a, i) =>
    applyLook(a, { ...a.look, clothing: [1, 3, 5, 7, 6][i % 5] }),
  );
  back = true;
});

document.querySelector("#freeze-blink")!.addEventListener("click", () => {
  mode = "idle";
  back = false;
  freezeBlink = true;
});
