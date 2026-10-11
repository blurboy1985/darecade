// Local art review: every set magic on a mannequin, all animating at once.
// Open /scripts/magic-review.html?from=0&count=22 on the Vite dev server.
// window.magicReview.at(seconds) holds the clock for a still; .run() resumes.
import * as T from "three";
import { buildMagic } from "../src/magic.ts";
import { legendarySets, setItemIndex } from "../src/collections.ts";

const query = new URLSearchParams(location.search);
const from = Number(query.get("from") ?? 0);
const count = Number(query.get("count") ?? legendarySets.length);
const columns = Number(query.get("columns") ?? 6);
const sets = legendarySets.slice(from, from + count);
const cell = Math.floor(innerWidth / columns);
const rows = Math.ceil(sets.length / columns);
const renderer = new T.WebGLRenderer({ antialias: true });
renderer.setSize(cell * columns, cell * rows);
renderer.setScissorTest(true);
document.body.append(renderer.domElement);
const camera = new T.PerspectiveCamera(32, 1, 0.1, 50);
camera.position.set(0, 1.9, 6.4);
camera.lookAt(0, 1.2, 0);

const skin = new T.MeshStandardMaterial({ color: "#c9cfdb", roughness: 0.8 });
const scenes = sets.map((set, i) => {
  const scene = new T.Scene();
  scene.add(new T.HemisphereLight("#ffffff", "#5a6274", 2.2));
  const sun = new T.DirectionalLight("#ffffff", 1.6);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  // Chibi proportions: feet at 0, a large head centred near 1.35.
  const body = new T.Mesh(new T.CapsuleGeometry(0.22, 0.5, 4, 10), skin);
  body.position.y = 0.5;
  const head = new T.Mesh(new T.SphereGeometry(0.42, 16, 12), skin);
  head.position.y = 1.35;
  scene.add(body, head);
  const magic = buildMagic(scene, setItemIndex("accessory", from + i))!;
  return { scene, magic, set };
});

let held: number | null = null;
const started = performance.now();
function frame() {
  const t = held ?? (performance.now() - started) / 1000;
  scenes.forEach(({ scene, magic }, i) => {
    magic.tick(t, true);
    const x = (i % columns) * cell;
    const y = (rows - 1 - Math.floor(i / columns)) * cell;
    renderer.setViewport(x, y, cell, cell);
    renderer.setScissor(x, y, cell, cell);
    renderer.render(scene, camera);
  });
  requestAnimationFrame(frame);
}
frame();
Object.assign(window, {
  magicReview: {
    names: sets.map((set) => set.id),
    at: (seconds: number) => (held = seconds),
    run: () => (held = null),
  },
});
