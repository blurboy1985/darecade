import { extraIndexFor, legendarySets, setIndexFor } from "./collections.ts";
import { setMagic, setMagicDust } from "./magic-props.ts";
// "Everyday magic" effects. Each effect mixes a few glowing meshes (wings,
// halos, crystals) with sparkle particle layers drawn by one small shader.
// Positions are avatar-local: feet at y 0, head centre ~1.35, crown ~1.8.
import * as T from "three";
import {
  mergeGeometries,
  mergeVertices,
} from "three/addons/utils/BufferGeometryUtils.js";
import { ball, material, node, part } from "./shapes.ts";

// Original star charms and an orchid compass. Recipes use shared geometry and
// vertex colours, so each static animated part costs one draw across its palette.
const charmParts = new Map<string, T.BufferGeometry>();
const charmMaterial = new T.MeshBasicMaterial({ vertexColors: true });
const compassRing = new T.TorusGeometry(1, 0.025, 3, 32);
const starShape = new T.Shape();
for (let i = 0; i < 10; i++) {
  const angle = (i / 10) * Math.PI * 2 + Math.PI / 2;
  const radius = i % 2 ? 0.46 : 1;
  const x = Math.cos(angle) * radius;
  const y = Math.sin(angle) * radius;
  if (i) starShape.lineTo(x, y);
  else starShape.moveTo(x, y);
}
starShape.closePath();
const starCharm = new T.ExtrudeGeometry(starShape, {
  depth: 0.12,
  bevelEnabled: true,
  bevelSize: 0.045,
  bevelThickness: 0.035,
  bevelSegments: 1,
  steps: 1,
});

function bakeCharm(group: T.Group, key: string) {
  const meshes = group.children.filter(
    (child): child is T.Mesh<T.BufferGeometry, T.MeshStandardMaterial> =>
      child instanceof T.Mesh &&
      child.material instanceof T.MeshStandardMaterial,
  );
  if (!meshes.length) return;
  let geometry = charmParts.get(key);
  if (!geometry) {
    const pieces = meshes.map((mesh) => {
      mesh.updateMatrix();
      const piece = mesh.geometry.index
        ? mesh.geometry.toNonIndexed()
        : mesh.geometry.clone();
      piece.applyMatrix4(mesh.matrix);
      const colors = new Float32Array(piece.getAttribute("position").count * 3);
      const color = mesh.material.color;
      for (let i = 0; i < colors.length; i += 3)
        colors.set([color.r, color.g, color.b], i);
      piece.setAttribute("color", new T.BufferAttribute(colors, 3));
      return piece;
    });
    const merged = mergeGeometries(pieces);
    pieces.forEach((piece) => piece.dispose());
    if (!merged) throw new Error("Magic charms must share geometry attributes");
    geometry = mergeVertices(merged);
    merged.dispose();
    charmParts.set(key, geometry);
  }
  meshes.forEach((mesh) => mesh.removeFromParent());
  const baked = new T.Mesh(geometry, charmMaterial);
  baked.name = "MagicCharm";
  baked.userData.sharedCosmeticGeometry = true;
  group.add(baked);
}

function charm(
  group: T.Group,
  geometry: T.BufferGeometry,
  color: string,
  scale: number,
  z = 0,
) {
  const mesh = new T.Mesh(geometry, material(color));
  mesh.scale.setScalar(scale);
  mesh.position.z = z;
  group.add(mesh);
  return mesh;
}

type Sprite =
  | "glow"
  | "star"
  | "heart"
  | "petal"
  | "flake"
  | "note"
  | "leaf"
  | "bubble";
const sprites = new Map<Sprite, T.Texture>();
function sprite(kind: Sprite) {
  const hit = sprites.get(kind);
  if (hit) return hit;
  const c =
    typeof document !== "undefined" ? document.createElement("canvas") : null;
  const tex = c ? new T.CanvasTexture(c) : new T.Texture();
  if (c) {
    c.width = c.height = 64;
    const x = c.getContext("2d")!;
    const glow = (r: number, a = 1) => {
      const g = x.createRadialGradient(32, 32, 0, 32, 32, r);
      g.addColorStop(0, `rgba(255,255,255,${a})`);
      g.addColorStop(0.35, `rgba(255,255,255,${a * 0.55})`);
      g.addColorStop(1, "rgba(255,255,255,0)");
      x.fillStyle = g;
      x.fillRect(0, 0, 64, 64);
    };
    x.fillStyle = "#fff";
    x.strokeStyle = "#fff";
    if (kind === "glow") glow(32);
    if (kind === "star") {
      glow(20, 0.7);
      x.beginPath();
      for (let i = 0; i < 8; i++) {
        const r = i % 2 ? 4 : 30;
        const a = (i / 8) * Math.PI * 2;
        x.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r);
      }
      x.fill();
    }
    if (kind === "heart") {
      glow(30, 0.35);
      x.beginPath();
      x.moveTo(32, 52);
      x.bezierCurveTo(4, 32, 14, 8, 32, 22);
      x.bezierCurveTo(50, 8, 60, 32, 32, 52);
      x.fill();
    }
    if (kind === "petal") {
      x.beginPath();
      x.ellipse(32, 32, 12, 24, 0.4, 0, Math.PI * 2);
      x.fill();
    }
    if (kind === "leaf") {
      x.beginPath();
      x.moveTo(32, 6);
      x.quadraticCurveTo(58, 32, 32, 58);
      x.quadraticCurveTo(6, 32, 32, 6);
      x.fill();
      x.globalCompositeOperation = "destination-out";
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(32, 17);
      x.lineTo(32, 48);
      x.moveTo(32, 30);
      x.lineTo(23, 23);
      x.moveTo(32, 38);
      x.lineTo(41, 31);
      x.stroke();
      x.globalCompositeOperation = "source-over";
    }
    if (kind === "flake") {
      glow(18, 0.6);
      x.lineWidth = 4;
      x.lineCap = "round";
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        x.beginPath();
        x.moveTo(32, 32);
        x.lineTo(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26);
        x.moveTo(32 + Math.cos(a) * 16, 32 + Math.sin(a) * 16);
        x.lineTo(32 + Math.cos(a + 0.5) * 22, 32 + Math.sin(a + 0.5) * 22);
        x.stroke();
      }
    }
    if (kind === "note") {
      x.beginPath();
      x.ellipse(24, 46, 11, 8, -0.4, 0, Math.PI * 2);
      x.fill();
      x.fillRect(32, 10, 5, 38);
      x.beginPath();
      x.moveTo(37, 10);
      x.quadraticCurveTo(54, 18, 50, 32);
      x.quadraticCurveTo(48, 22, 37, 22);
      x.fill();
    }
    if (kind === "bubble") {
      x.lineWidth = 3;
      x.beginPath();
      x.arc(32, 32, 26, 0, Math.PI * 2);
      x.stroke();
      x.globalAlpha = 0.25;
      x.fill();
      x.globalAlpha = 0.9;
      x.beginPath();
      x.ellipse(22, 20, 7, 4, -0.7, 0, Math.PI * 2);
      x.fill();
    }
    tex.needsUpdate = true;
  }
  tex.colorSpace = T.SRGBColorSpace;
  sprites.set(kind, tex);
  return tex;
}

const vertex = /* glsl */ `
  attribute float aSize; attribute float aAlpha; attribute float aSpin;
  varying vec3 vColor; varying float vAlpha; varying float vSpin;
  uniform float uScale; uniform float uOrtho;
  void main() {
    vColor = color; vAlpha = aAlpha; vSpin = aSpin;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / (uOrtho > 0.5 ? 1.0 : max(0.1, -mv.z));
    gl_Position = projectionMatrix * mv;
  }`;
const fragment = /* glsl */ `
  uniform sampler2D uMap; uniform float uCore; varying vec3 vColor; varying float vAlpha; varying float vSpin;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float c = cos(vSpin), s = sin(vSpin);
    p = mat2(c, -s, s, c) * p + 0.5;
    vec4 t = texture2D(uMap, p);
    float a = t.a * vAlpha;
    if (a < 0.02) discard;
    // A white-hot core with a saturated edge reads as "sparkly" on both the
    // pale daytime plaza and the night palette.
    vec3 col = mix(vColor, vec3(1.0), pow(t.a, 3.0) * uCore);
    gl_FragColor = vec4(col, a);
  }`;

type Out = { x: number; y: number; z: number; a: number; s: number; r: number };
type Layer = {
  points: T.Points;
  count: number;
  size: number;
  colors: T.Color[];
  fn: (i: number, t: number, o: Out, moving: boolean) => void;
};
export type Magic = {
  group: T.Group;
  layers: Layer[];
  tick: (t: number, moving: boolean) => void;
};
const disposedMagic = new WeakSet<Magic>();

const hash = (i: number, k = 0) => {
  const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return v - Math.floor(v);
};
const tau = Math.PI * 2;
const size2 = new T.Vector2();

function layer(
  m: Magic,
  kind: Sprite,
  count: number,
  size: number,
  colors: string[],
  fn: Layer["fn"],
  additive = false,
) {
  const g = new T.BufferGeometry();
  g.setAttribute(
    "position",
    new T.BufferAttribute(new Float32Array(count * 3), 3),
  );
  g.setAttribute(
    "color",
    new T.BufferAttribute(new Float32Array(count * 3), 3),
  );
  g.setAttribute("aSize", new T.BufferAttribute(new Float32Array(count), 1));
  g.setAttribute("aAlpha", new T.BufferAttribute(new Float32Array(count), 1));
  g.setAttribute("aSpin", new T.BufferAttribute(new Float32Array(count), 1));
  const mat = new T.ShaderMaterial({
    uniforms: {
      uMap: { value: sprite(kind) },
      uScale: { value: 400 },
      uOrtho: { value: 0 },
      uCore: { value: additive ? 0.75 : 0.25 },
    },
    vertexShader: vertex,
    fragmentShader: fragment,
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: T.NormalBlending,
  });
  const points = new T.Points(g, mat);
  points.frustumCulled = false;
  points.renderOrder = 5;
  points.onBeforeRender = (renderer, _s, camera) => {
    const h = renderer.getDrawingBufferSize(size2).y;
    const ortho = camera as T.OrthographicCamera;
    if (ortho.isOrthographicCamera) {
      mat.uniforms.uOrtho.value = 1;
      mat.uniforms.uScale.value = (h * ortho.zoom) / (ortho.top - ortho.bottom);
    } else {
      const fov = (camera as T.PerspectiveCamera).fov;
      mat.uniforms.uOrtho.value = 0;
      mat.uniforms.uScale.value = h / 2 / Math.tan((fov * Math.PI) / 360);
    }
  };
  m.group.add(points);
  m.layers.push({
    points,
    count,
    size: size * 2.4,
    colors: colors.map((c) => new T.Color(c)),
    fn,
  });
}

function update(l: Layer, t: number, moving: boolean) {
  const g = l.points.geometry;
  const pos = g.getAttribute("position") as T.BufferAttribute;
  const col = g.getAttribute("color") as T.BufferAttribute;
  const size = g.getAttribute("aSize") as T.BufferAttribute;
  const alpha = g.getAttribute("aAlpha") as T.BufferAttribute;
  const spin = g.getAttribute("aSpin") as T.BufferAttribute;
  const o: Out = { x: 0, y: 0, z: 0, a: 1, s: 1, r: 0 };
  for (let i = 0; i < l.count; i++) {
    o.a = 1;
    o.s = 1;
    o.r = 0;
    l.fn(i, t, o, moving);
    pos.setXYZ(i, o.x, o.y, o.z);
    const c = l.colors[i % l.colors.length];
    col.setXYZ(i, c.r, c.g, c.b);
    size.setX(i, l.size * o.s);
    alpha.setX(i, Math.max(0, Math.min(1, o.a)));
    spin.setX(i, o.r);
  }
  pos.needsUpdate =
    col.needsUpdate =
    size.needsUpdate =
    alpha.needsUpdate =
    spin.needsUpdate =
      true;
}

const twinkle = (i: number, t: number, speed = 5) =>
  0.45 + 0.55 * Math.max(0, Math.sin(t * speed + hash(i) * tau));
/** 0..1 lifecycle of particle i with a given period, offset per particle. */
const life = (i: number, t: number, period: number) =>
  (t / period + hash(i, 3)) % 1;

export function buildMagic(parent: T.Object3D, kind: number): Magic | null {
  if (!kind) return null;
  const m: Magic = {
    group: node(parent, [0, 0, 0], "Magic"),
    layers: [],
    tick: () => {},
  };
  const g = m.group;
  const anim: ((t: number, moving: boolean) => void)[] = [];
  const glowDust = (
    colors: string[],
    y0: number,
    y1: number,
    r: number,
    count = 16,
    kind: Sprite = "star",
  ) =>
    layer(
      m,
      kind,
      count,
      0.07,
      colors,
      (i, t, o) => {
        const k = life(i, t, 2.4);
        const a = hash(i) * tau + t * 0.4;
        o.x = Math.cos(a) * r * (0.6 + hash(i, 1) * 0.4);
        o.z = Math.sin(a) * r * (0.6 + hash(i, 1) * 0.4);
        o.y = y0 + (y1 - y0) * k;
        o.a = Math.sin(k * Math.PI) * twinkle(i, t, 7);
        o.s = 0.6 + hash(i, 2) * 0.8;
      },
      true,
    );

  const setIndex = setIndexFor("accessory", kind);
  const special = legendarySets[setIndex];
  if (special) {
    anim.push(setMagic(node(g), special));
    glowDust(
      [special.color, special.accent],
      0.2,
      2.4,
      0.9,
      20,
      setMagicDust(special),
    );
  }
  // Later single effects, in the order of their names in appearance.ts.
  switch (extraIndexFor("accessory", kind)) {
    case 0:
      // Confetti pop: a burst above the head that flutters down.
      layer(
        m,
        "petal",
        26,
        0.09,
        ["#ff7aa8", "#ffd84a", "#7ad7ff", "#9be88a", "#c4a5ff"],
        (i, t, o) => {
          const k = life(i, t, 2.6);
          const a = hash(i) * tau;
          const r = 0.15 + k * 0.75 * (0.5 + hash(i, 1) * 0.5);
          o.x = Math.cos(a) * r;
          o.z = Math.sin(a) * r;
          o.y = 2.2 + Math.sin(k * Math.PI * 0.6) * 0.5 - k * k * 2;
          o.r = t * 3 + i;
          o.a = 1 - k * k;
        },
      );
      break;
    case 1:
      // Dandelion drift: seeds carried across on a slow breeze.
      layer(m, "flake", 16, 0.1, ["#ffffff", "#f3f7e4"], (i, t, o) => {
        const k = life(i, t, 5);
        o.x = -0.85 + k * 1.7;
        o.z = (hash(i, 2) - 0.5) * 1.1;
        o.y = 0.5 + hash(i) * 1.3 + k * 0.35 + Math.sin(t * 1.4 + i) * 0.08;
        o.r = t * 0.5 + i;
        o.a = Math.sin(k * Math.PI) * 0.85;
      });
      glowDust(["#fff6c9", "#e9ffd9"], 0.3, 1.6, 0.7, 8);
      break;
    case 2: {
      // Neon hoops: three rings rise from the feet and shrink away.
      const hoops = ["#ff5c95", "#49e5e2", "#ffd84a"].map((c) =>
        part(g, "ring", [0, 0, 0], [0.7, 0.7, 0.7], c, {
          glow: 1,
          rot: [Math.PI / 2, 0, 0],
        }),
      );
      anim.push((t) =>
        hoops.forEach((h, i) => {
          const k = (t * 0.35 + i / 3) % 1;
          const s = 0.35 + Math.sin(k * Math.PI) * 0.4;
          h.position.y = 0.15 + k * 1.95;
          h.scale.set(s, s, s);
        }),
      );
      glowDust(["#ff5c95", "#49e5e2", "#ffd84a"], 0.2, 2.1, 0.6, 12);
      break;
    }
    case 3:
      // Autumn leaves spiralling to the ground.
      layer(
        m,
        "leaf",
        16,
        0.15,
        ["#e8843c", "#d9542f", "#f2c14e", "#b5651d"],
        (i, t, o) => {
          const k = life(i, t, 4.5);
          const a = hash(i) * tau + t * 0.6;
          const r = 0.5 + Math.sin(k * 6 + i) * 0.15;
          o.x = Math.cos(a) * r;
          o.z = Math.sin(a) * r;
          o.y = 2.3 - k * 2.2;
          o.r = t * 1.5 + i;
          o.a = Math.sin(k * Math.PI);
        },
      );
      break;
    case 4:
      // Shooting stars: five streaks cross behind the shoulders.
      layer(
        m,
        "star",
        30,
        0.09,
        ["#fff3b0", "#bfe3ff", "#ffd1f0"],
        (i, t, o) => {
          const star = i % 5,
            lag = Math.floor(i / 5) * 0.05;
          const u = ((((t - lag) * 0.45 + star * 0.2) % 1) + 1) % 1;
          o.x = -1 + u * 2;
          o.y = 2.5 - u * 0.9 - (star % 3) * 0.28;
          o.z = -0.45 + (hash(star) - 0.5) * 0.5;
          o.a = Math.sin(u * Math.PI) * (1 - lag * 3.2);
          o.s = 1.25 - lag * 3.5;
        },
        true,
      );
      break;
    case 5: {
      // Koi spirits: two fish circle the waist, trailing bubbles.
      const koi = [
        ["#fff6ee", "#ff8a3c"],
        ["#ffd9c2", "#f2f2f2"],
      ].map(([body, mark]) => {
        const f = node(g, [0, 0, 0], "Koi");
        ball(f, [0, 0, 0], [0.065, 0.055, 0.16], body, { glow: 0.35 });
        ball(f, [0, 0.03, 0.04], [0.05, 0.035, 0.07], mark, { glow: 0.35 });
        ball(f, [0, 0.025, -0.08], [0.035, 0.03, 0.04], mark, { glow: 0.35 });
        part(f, "cone", [0, 0, -0.21], [0.07, 0.14, 0.02], body, {
          glow: 0.35,
          rot: [Math.PI / 2, 0, 0],
        });
        for (const side of [-1, 1])
          ball(f, [side * 0.06, -0.01, 0.03], [0.04, 0.01, 0.03], mark, {
            glow: 0.35,
          });
        return f;
      });
      anim.push((t) =>
        koi.forEach((f, i) => {
          const a = t * 0.9 + i * Math.PI;
          f.position.set(
            Math.cos(a) * 0.62,
            1 + Math.sin(t * 1.3 + i * 2) * 0.18,
            Math.sin(a) * 0.62,
          );
          f.rotation.y = -a + Math.sin(t * 6 + i) * 0.15;
        }),
      );
      layer(m, "bubble", 10, 0.07, ["#dff6ff", "#ffffff"], (i, t, o) => {
        const k = life(i, t, 3);
        const a = hash(i) * tau + t * 0.3;
        o.x = Math.cos(a) * 0.62;
        o.z = Math.sin(a) * 0.62;
        o.y = 0.9 + k * 0.9;
        o.a = Math.sin(k * Math.PI) * 0.7;
      });
      break;
    }
  }
  switch (kind) {
    case 1: {
      // Three five-point wishing charms with short, slow sparkle tails.
      const stars = [0, 1, 2].map((i) => {
        const s = node(g, [0, 0, 0], "WishingStar");
        charm(s, starCharm, ["#e5b65d", "#d397b0", "#77bdb6"][i], 0.12);
        charm(s, starCharm, "#fff3ca", 0.078, 0.015);
        bakeCharm(s, `star/${i}`);
        s.rotation.x = -0.65;
        return s;
      });
      anim.push((t) =>
        stars.forEach((s, i) => {
          const a = t * 0.65 + (i * tau) / 3;
          s.position.set(
            Math.cos(a) * 0.56,
            1.98 + Math.sin(t * 1.2 + i) * 0.08,
            Math.sin(a) * 0.56,
          );
          // Keep the five-point face readable while the charms orbit and tilt.
          s.rotation.y = Math.sin(t * 0.7 + i) * 0.22;
          s.rotation.z = Math.sin(t * 0.9 + i) * 0.16;
        }),
      );
      layer(
        m,
        "star",
        18,
        0.055,
        ["#ffe9a6", "#f1c0d5", "#c6f0dc"],
        (i, t, o) => {
          const star = i % 3,
            lag = Math.floor(i / 3) * 0.09;
          const a = (t - lag) * 0.65 + (star * tau) / 3;
          o.x = Math.cos(a) * 0.56;
          o.z = Math.sin(a) * 0.56;
          o.y = 1.98 + Math.sin((t - lag) * 1.2 + star) * 0.08;
          o.a = (0.72 - lag) * twinkle(i, t, 2);
          o.s = 0.9 - lag;
        },
        true,
      );
      break;
    }
    case 2: {
      // Butterfly wings with drifting glitter.
      for (const side of [-1, 1]) {
        const w = node(g, [side * 0.12, 1.12, -0.32], "Wing");
        w.userData.side = side;
        const top = ball(
          w,
          [side * 0.26, 0.14, -0.04],
          [0.3, 0.37, 0.035],
          "#c8a7ed",
          { glow: 0.25, opacity: 0.92 },
        );
        top.rotation.z = -side * 0.45;
        ball(w, [side * 0.19, -0.22, 0], [0.21, 0.23, 0.03], "#9ddccb", {
          glow: 0.25,
          opacity: 0.92,
        });
        ball(w, [side * 0.27, 0.17, 0.015], [0.13, 0.2, 0.02], "#f8d89a", {
          glow: 0.5,
        });
        ball(w, [side * 0.2, -0.22, 0.015], [0.08, 0.09, 0.02], "#ffffff", {
          glow: 0.6,
        });
      }
      layer(
        m,
        "star",
        22,
        0.06,
        ["#f8d89a", "#e7d2ff", "#bff5e4"],
        (i, t, o) => {
          const k = life(i, t, 2.2);
          const side = i % 2 ? 1 : -1;
          o.x = side * (0.25 + hash(i) * 0.35);
          o.z = -0.36 - hash(i, 1) * 0.1;
          o.y = 1.45 - k * 1.2;
          o.a = (1 - k) * twinkle(i, t, 8);
        },
        true,
      );
      break;
    }
    case 3:
      layer(
        m,
        "glow",
        12,
        0.22,
        ["#d9ff4a", "#ffe94a", "#9dff6a"],
        (i, t, o) => {
          const s = 0.35 + hash(i) * 0.3;
          o.x = Math.sin(t * s + i * 1.7) * (0.55 + hash(i, 1) * 0.35);
          o.z = Math.cos(t * s * 1.3 + i * 2.3) * (0.55 + hash(i, 2) * 0.35);
          o.y = 0.6 + hash(i, 3) * 1.4 + Math.sin(t * 1.7 + i) * 0.15;
          o.a = 0.55 + 0.45 * Math.max(0, Math.sin(t * 2.2 + i * 1.3)) ** 2;
          o.s = 0.6 + o.a * 0.5;
        },
        true,
      );
      layer(
        m,
        "glow",
        12,
        0.05,
        ["#ffffff"],
        (i, t, o) => {
          const s = 0.35 + hash(i) * 0.3;
          o.x = Math.sin(t * s + i * 1.7) * (0.55 + hash(i, 1) * 0.35);
          o.z = Math.cos(t * s * 1.3 + i * 2.3) * (0.55 + hash(i, 2) * 0.35);
          o.y = 0.6 + hash(i, 3) * 1.4 + Math.sin(t * 1.7 + i) * 0.15;
          o.a = Math.max(0, Math.sin(t * 2.2 + i * 1.3));
        },
        true,
      );
      break;
    case 4: {
      const halo = node(g, [0, 2.0, 0], "Halo");
      part(halo, "torus", [0, 0, 0], [0.36, 0.36, 0.3], "#ffe6a2", {
        glow: 1,
        rot: [Math.PI / 2, 0, 0],
      });
      const moon = node(halo, [0.38, 0.06, 0]);
      ball(moon, [0, 0, 0], [0.09, 0.09, 0.03], "#fff6cf", { glow: 1 });
      ball(moon, [0.04, 0.02, 0.012], [0.075, 0.08, 0.03], "#fde58a", {
        glow: 0.2,
      });
      anim.push((t) => (halo.rotation.y = t * 0.5));
      layer(
        m,
        "star",
        18,
        0.07,
        ["#fff6cf", "#ffffff", "#ffe6a2"],
        (i, t, o) => {
          const a = (i / 18) * tau + t * 0.5;
          o.x = Math.cos(a) * 0.36;
          o.z = Math.sin(a) * 0.36;
          o.y = 2.0 + Math.sin(t * 3 + i) * 0.03;
          o.a = twinkle(i, t, 6);
          o.s = 0.5 + o.a;
        },
        true,
      );
      break;
    }
    case 5: {
      const crown = node(g, [0, 1.8, 0], "Crown");
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * tau;
        const h = i % 2 ? 0.11 : 0.17;
        part(
          crown,
          "oct",
          [Math.cos(a) * 0.32, h * 0.6, Math.sin(a) * 0.32],
          [0.05, h, 0.04],
          ["#bd9aff", "#86ede6", "#ffe1a4"][i % 3],
          { glow: 0.8, opacity: 0.9 },
        );
      }
      part(crown, "torus", [0, 0, 0], [0.33, 0.33, 0.25], "#e9d7ff", {
        glow: 0.6,
        rot: [Math.PI / 2, 0, 0],
      });
      anim.push((t) => (crown.rotation.y = Math.sin(t * 0.8) * 0.2));
      glowDust(["#ffffff", "#c4f5ff", "#efd9ff"], 1.8, 2.3, 0.35, 14);
      break;
    }
    case 6: {
      const ribbon = node(g, [0, 1.15, -0.25], "Ribbon");
      const colors = ["#ff8fa6", "#ffcf7a", "#a8eccb", "#8fd3ff", "#b8acfa"];
      for (let j = 0; j < 5; j++)
        for (let i = 0; i < 18; i++) {
          const a = (i / 17) * Math.PI;
          ball(
            ribbon,
            [
              Math.cos(a) * (0.42 + j * 0.045),
              Math.sin(a) * (0.42 + j * 0.045),
              0,
            ],
            [0.035, 0.035, 0.022],
            colors[j],
            { glow: 0.6 },
          );
        }
      anim.push((t) => (ribbon.rotation.y = Math.sin(t * 1.8) * 0.08));
      layer(
        m,
        "star",
        24,
        0.07,
        colors,
        (i, t, o) => {
          const a = ((i / 24 + t * 0.15) % 1) * Math.PI;
          const r = 0.42 + (i % 5) * 0.045;
          o.x = Math.cos(a) * r;
          o.y = 1.15 + Math.sin(a) * r;
          o.z = -0.22;
          o.a = twinkle(i, t, 8);
        },
        true,
      );
      break;
    }
    case 7:
      layer(
        m,
        "bubble",
        14,
        0.2,
        ["#c1eaff", "#e5c2fa", "#c9ffe5", "#fff1b8"],
        (i, t, o) => {
          const k = life(i, t, 4.2);
          const a = hash(i) * tau;
          o.x = Math.cos(a) * 0.5 + Math.sin(t * 2 + i) * 0.06;
          o.z = Math.sin(a) * 0.5;
          o.y = 0.5 + k * 1.9;
          o.s = 0.5 + hash(i, 1) * 0.7;
          o.a = k < 0.92 ? Math.min(1, k * 6) * 0.9 : 0;
        },
      );
      break;
    case 8:
      // Fairy dust: a spiral of gold and pink sparkles that streams behind you.
      layer(
        m,
        "star",
        48,
        0.11,
        ["#ffcf3d", "#ff8fc8", "#ffe680", "#a98bff"],
        (i, t, o, moving) => {
          const k = life(i, t, 2.6);
          const a = k * tau * 1.5 + hash(i) * tau;
          const r = 0.3 + k * 0.3;
          o.x = Math.cos(a) * r;
          o.z = Math.sin(a) * r - (moving ? k * 0.9 : 0);
          o.y = 1.5 - k * 1.4;
          o.a = (1 - k) * twinkle(i, t, 10);
          o.s = 1.2 - k * 0.7;
        },
        true,
      );
      break;
    case 9:
      layer(
        m,
        "flake",
        34,
        0.12,
        ["#ffffff", "#d8f1ff", "#b8e2ff"],
        (i, t, o) => {
          const k = life(i, t, 5);
          const a = hash(i) * tau + t * 0.8;
          const r = 0.45 + hash(i, 1) * 0.3;
          o.x = Math.cos(a) * r;
          o.z = Math.sin(a) * r;
          o.y = 2.3 - k * 2.2;
          o.r = t * (hash(i, 2) - 0.5) * 3;
          o.a = Math.sin(k * Math.PI);
          o.s = 0.6 + hash(i, 3) * 0.6;
        },
      );
      glowDust(["#e6f7ff", "#ffffff"], 0.3, 2.1, 0.55, 14);
      break;
    case 10:
      layer(
        m,
        "petal",
        30,
        0.11,
        ["#ffc1d6", "#ffd9e5", "#ff9fbf", "#fff0f5"],
        (i, t, o) => {
          const k = life(i, t, 4.5);
          const a = hash(i) * tau + t * 0.6;
          o.x = Math.cos(a) * (0.4 + hash(i, 1) * 0.4) + k * 0.4;
          o.z = Math.sin(a) * (0.4 + hash(i, 1) * 0.4);
          o.y = 2.4 - k * 2.3 + Math.sin(t * 3 + i) * 0.05;
          o.r = t * 2 + i;
          o.a = Math.min(1, Math.sin(k * Math.PI) * 2);
        },
      );
      break;
    case 11:
      // Aurora: a rippling ribbon of colour around the waist.
      layer(
        m,
        "glow",
        72,
        0.14,
        ["#7dffb2"],
        (i, t, o) => {
          const a = (i / 72) * tau + t * 0.6;
          o.x = Math.cos(a) * 0.62;
          o.z = Math.sin(a) * 0.62;
          o.y = 0.8 + Math.sin(a * 3 + t * 2) * 0.12 + (i % 3) * 0.07;
          o.a = 0.5 + 0.5 * Math.sin(a * 2 - t * 3);
        },
        true,
      );
      anim.push((t) => {
        const l = m.layers[0];
        const hue = (t * 0.05) % 1;
        l.colors = [0, 0.12, 0.24].map((d) =>
          new T.Color().setHSL((hue + 0.35 + d) % 1, 0.9, 0.62),
        );
      });
      break;
    case 12:
      layer(
        m,
        "glow",
        46,
        0.12,
        ["#ffb347", "#ff6a3d", "#ffd86b", "#ff3d2e"],
        (i, t, o) => {
          const k = life(i, t, 1.8);
          const a = hash(i) * tau;
          const r = 0.15 + hash(i, 1) * 0.4;
          o.x = Math.cos(a) * r + Math.sin(t * 6 + i) * 0.04;
          o.z = Math.sin(a) * r;
          o.y = 0.05 + k * 2.1;
          o.a = (1 - k) * (0.6 + 0.4 * Math.sin(t * 20 + i));
          o.s = 1.3 - k;
        },
        true,
      );
      {
        const ring = node(g, [0, 0.06, 0]);
        part(ring, "ring", [0, 0, 0], [0.55, 0.55, 0.55], "#ff8a3d", {
          glow: 1,
          rot: [Math.PI / 2, 0, 0],
        });
        anim.push((t) => ring.scale.setScalar(1 + Math.sin(t * 4) * 0.05));
      }
      break;
    case 13:
      layer(
        m,
        "star",
        34,
        0.12,
        ["#e4f6ff", "#8fd3ff", "#ffffff", "#b3a6ff"],
        (i, t, o) => {
          const step = Math.floor(t * 12 + hash(i) * 10);
          const a = hash(i, step) * tau;
          const r = 0.35 + hash(i + 7, step) * 0.35;
          o.x = Math.cos(a) * r;
          o.z = Math.sin(a) * r;
          o.y = 0.3 + hash(i + 13, step) * 1.8;
          o.a = hash(i + 21, step) > 0.45 ? 1 : 0;
          o.s = 0.5 + hash(i + 5, step);
          o.r = hash(i, step) * tau;
        },
        true,
      );
      break;
    case 14:
      layer(
        m,
        "star",
        56,
        0.09,
        ["#ffc93d", "#ffe27a", "#ffae1f", "#fff0b0"],
        (i, t, o) => {
          const k = life(i, t, 2.2);
          const a = hash(i) * tau;
          const r = hash(i, 1) * 0.55;
          o.x = Math.cos(a) * r;
          o.z = Math.sin(a) * r;
          o.y = 2.5 - k * 2.4;
          o.a = twinkle(i, t, 12) * (k < 0.9 ? 1 : (1 - k) * 10);
          o.s = 0.5 + hash(i, 2);
        },
        true,
      );
      break;
    case 15:
      layer(
        m,
        "heart",
        16,
        0.16,
        ["#ff6f9b", "#ff9fbf", "#ff4f7d", "#ffc1d6"],
        (i, t, o) => {
          const k = life(i, t, 3.2);
          o.x = (hash(i) - 0.5) * 0.8 + Math.sin(t * 2 + i) * 0.1;
          o.z = 0.25 + hash(i, 1) * 0.2;
          o.y = 1.0 + k * 1.4;
          o.a = Math.min(1, Math.sin(k * Math.PI) * 1.6);
          o.s = 0.6 + k * 0.6;
          o.r = Math.sin(t * 3 + i) * 0.3;
        },
      );
      break;
    case 16:
      layer(
        m,
        "note",
        12,
        0.16,
        ["#7a5cff", "#ff6fb0", "#2fb8a8", "#ff9f3d"],
        (i, t, o) => {
          const k = life(i, t, 3.6);
          const a = k * tau + (i * tau) / 12;
          o.x = Math.cos(a) * 0.55;
          o.z = Math.sin(a) * 0.55;
          o.y = 0.9 + k * 1.4;
          o.a = Math.min(1, Math.sin(k * Math.PI) * 1.8);
          o.r = Math.sin(t * 4 + i) * 0.25;
        },
      );
      break;
    case 17: {
      // A small orchid compass, with hand-built glyphs and rising pearl motes.
      const circle = node(g, [0, 0.04, 0], "Runes");
      for (const [radius, color] of [
        [0.72, "#aa84c0"],
        [0.53, "#e3b989"],
      ] as const) {
        const ring = charm(circle, compassRing, color, radius);
        ring.rotation.x = Math.PI / 2;
      }
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * tau;
        // Three strokes make each open-ended glyph, rather than a copied rune.
        for (let stroke = 0; stroke < 3; stroke++) {
          const bar = part(
            circle,
            "box",
            [Math.cos(a) * 0.622, 0.005, Math.sin(a) * 0.622],
            [stroke === 1 ? 0.06 : 0.015, 0.012, stroke === 1 ? 0.015 : 0.06],
            "#d5b8df",
          );
          bar.rotation.y = -a;
          if (stroke !== 1) {
            bar.position.x += Math.cos(a) * (stroke ? 0.028 : -0.028);
            bar.position.z += Math.sin(a) * (stroke ? 0.028 : -0.028);
          }
        }
        part(
          circle,
          "oct",
          [Math.cos(a) * 0.415, 0.008, Math.sin(a) * 0.415],
          [0.035, 0.014, 0.072],
          "#e8cd95",
          { rot: [0, -a + Math.PI / 2, 0] },
        );
      }
      bakeCharm(circle, "orchid-compass");
      anim.push((t) => (circle.rotation.y = t * 0.18));
      glowDust(["#dbc2e2", "#ead29d", "#eaf8df"], 0.08, 0.9, 0.61, 12);
      break;
    }
    case 18:
      for (const [tilt, n, col] of [
        [0.35, 40, ["#b48cff", "#7fb2ff", "#ffffff"]],
        [-0.5, 36, ["#ff9ad5", "#9be7ff", "#fff3c4"]],
      ] as const)
        layer(
          m,
          "star",
          n,
          0.07,
          [...col],
          (i, t, o) => {
            const a = (i / n) * tau + t * (tilt > 0 ? 0.7 : -0.5);
            const x = Math.cos(a) * 0.7,
              z = Math.sin(a) * 0.7;
            o.x = x;
            o.y = 1.2 + z * Math.sin(tilt);
            o.z = z * Math.cos(tilt);
            o.a = twinkle(i, t, 6);
            o.s = 0.5 + hash(i) * 0.8;
          },
          true,
        );
      layer(
        m,
        "glow",
        5,
        0.6,
        ["#6f4bd8", "#3b6fd8", "#c04bd8"],
        (i, t, o) => {
          o.x = Math.cos(i * 1.3 + t * 0.2) * 0.25;
          o.z = Math.sin(i * 1.3 + t * 0.2) * 0.25 - 0.1;
          o.y = 1.2 + (i - 2) * 0.12;
          o.a = 0.35;
        },
        true,
      );
      break;
    case 19: {
      for (const side of [-1, 1]) {
        const w = node(g, [side * 0.16, 1.2, -0.32], "Wing");
        w.userData.side = side;
        for (let r = 0; r < 4; r++)
          for (let f = 0; f < 5 - r; f++) {
            const x = side * (0.12 + f * 0.13 + r * 0.04);
            const y = 0.22 - r * 0.15 - f * 0.05;
            const feather = ball(
              w,
              [x, y, -r * 0.01],
              [0.09, 0.2 - r * 0.02, 0.03],
              r % 2 ? "#fffaf0" : "#ffffff",
              { glow: 0.35 },
            );
            feather.rotation.z = -side * (0.6 + f * 0.12);
          }
      }
      layer(m, "petal", 14, 0.09, ["#ffffff", "#fff6dc"], (i, t, o) => {
        const k = life(i, t, 3.4);
        o.x = (i % 2 ? 1 : -1) * (0.3 + hash(i) * 0.45);
        o.z = -0.4 - hash(i, 1) * 0.2;
        o.y = 1.45 - k * 1.4;
        o.r = t * 1.5 + i;
        o.a = Math.min(1, (1 - k) * 2);
      });
      glowDust(["#fff3c4", "#ffffff"], 1.4, 2.2, 0.3, 10);
      break;
    }
    case 20: {
      for (const side of [-1, 1]) {
        const w = node(g, [side * 0.14, 1.2, -0.3], "Wing");
        w.userData.side = side;
        w.userData.slow = true;
        for (let f = 0; f < 4; f++) {
          const bone = part(
            w,
            "cyl",
            [side * (0.1 + f * 0.13), 0.28 - f * 0.12, 0],
            [0.018, 0.3 - f * 0.04, 0.018],
            "#2f6f73",
          );
          bone.rotation.z = -side * (0.3 + f * 0.35);
          const web = ball(
            w,
            [side * (0.16 + f * 0.11), 0.05 - f * 0.08, 0],
            [0.13, 0.2, 0.012],
            "#48b3a8",
            { opacity: 0.88, glow: 0.15 },
          );
          web.rotation.z = -side * (0.4 + f * 0.3);
        }
      }
      layer(
        m,
        "glow",
        20,
        0.08,
        ["#7fffe0", "#3fd6c0", "#ffd86b"],
        (i, t, o) => {
          const k = life(i, t, 1.6);
          o.x = (i % 2 ? 1 : -1) * (0.3 + hash(i) * 0.4);
          o.z = -0.35;
          o.y = 1.2 + k * 0.7;
          o.a = (1 - k) * 0.9;
        },
        true,
      );
      break;
    }
    case 21: {
      const shards = [0, 1, 2, 3, 4, 5].map((i) => {
        const s = node(g);
        part(
          s,
          "oct",
          [0, 0, 0],
          [0.06, 0.16, 0.06],
          i % 2 ? "#bfeaff" : "#e9f8ff",
          { glow: 0.7, opacity: 0.85 },
        );
        return s;
      });
      anim.push((t) =>
        shards.forEach((s, i) => {
          const a = t * 0.9 + (i * tau) / 6;
          s.position.set(
            Math.cos(a) * 0.6,
            1.05 + Math.sin(t * 2 + i) * 0.25,
            Math.sin(a) * 0.6,
          );
          s.rotation.set(t + i, t * 1.4, 0);
        }),
      );
      layer(
        m,
        "flake",
        20,
        0.06,
        ["#ffffff", "#cfefff"],
        (i, t, o) => {
          const a =
            t * 0.9 + ((i % 6) * tau) / 6 - 0.15 - Math.floor(i / 6) * 0.08;
          o.x = Math.cos(a) * 0.6;
          o.z = Math.sin(a) * 0.6;
          o.y = 1.05 + Math.sin(t * 2 + (i % 6)) * 0.25;
          o.a = twinkle(i, t, 8) * (1 - Math.floor(i / 6) * 0.25);
          o.r = t;
        },
        true,
      );
      break;
    }
    case 22: {
      const wisps = [0, 1, 2].map((i) => {
        const w = node(g);
        ball(
          w,
          [0, 0, 0],
          [0.07, 0.07, 0.07],
          ["#9ff5ff", "#c3a8ff", "#a8ffcf"][i],
          { glow: 1 },
        );
        return w;
      });
      const at = (i: number, t: number) => [
        Math.sin(t * 0.9 + i * 2.1) * 0.7,
        1.1 + Math.sin(t * 1.3 + i) * 0.45,
        Math.cos(t * 0.7 + i * 2.1) * 0.7,
      ];
      anim.push((t) =>
        wisps.forEach((w, i) =>
          w.position.set(...(at(i, t) as [number, number, number])),
        ),
      );
      layer(
        m,
        "glow",
        30,
        0.16,
        ["#9ff5ff", "#c3a8ff", "#a8ffcf"],
        (i, t, o) => {
          const lag = Math.floor(i / 3) * 0.07;
          const p = at(i % 3, t - lag);
          o.x = p[0];
          o.y = p[1];
          o.z = p[2];
          o.a = 0.8 - lag;
          o.s = 1 - lag * 1.1;
        },
        true,
      );
      break;
    }
    case 23:
      layer(
        m,
        "star",
        60,
        0.08,
        ["#bff9ff", "#ffffff", "#d7c4ff", "#fff3c4"],
        (i, t, o) => {
          const k = life(i, t, 2.4);
          const a = hash(i) * tau + k * 1.5;
          o.x = Math.cos(a) * 0.55;
          o.z = Math.sin(a) * 0.55;
          o.y = k * 2.6;
          o.a = Math.sin(k * Math.PI) * twinkle(i, t, 9);
          o.s = 0.5 + hash(i, 1) * 0.8;
        },
        true,
      );
      {
        const base = node(g, [0, 0.03, 0]);
        part(base, "ring", [0, 0, 0], [0.56, 0.56, 0.56], "#bff9ff", {
          glow: 1,
          rot: [Math.PI / 2, 0, 0],
        });
      }
      break;
    case 24:
      layer(
        m,
        "star",
        36,
        0.12,
        ["#ff6b6b", "#ffb347", "#ffe66b", "#7dff9a", "#6bc7ff", "#b48cff"],
        (i, t, o) => {
          const lag = i * 0.035;
          const a = (t - lag) * 1.6;
          const x = Math.cos(a) * 0.75,
            z = Math.sin(a) * 0.75;
          o.x = x;
          o.y = 1.3 + z * 0.45;
          o.z = z * 0.9;
          o.a = 1 - i / 36;
          o.s = i === 0 ? 2.2 : 1.1 - i / 40;
          o.r = t * 2;
        },
        true,
      );
      break;
    case 25: {
      const beam = node(g, [0, 0, 0], "Beam");
      part(beam, "cyl", [0, 1.4, 0], [0.5, 2.8, 0.5], "#bcd9ff", {
        glow: 0.5,
        opacity: 0.09,
      });
      part(beam, "cyl", [0, 1.4, 0], [0.3, 2.8, 0.3], "#eaf4ff", {
        glow: 0.8,
        opacity: 0.1,
      });
      anim.push((t) =>
        beam.scale.set(
          1 + Math.sin(t * 1.5) * 0.05,
          1,
          1 + Math.sin(t * 1.5) * 0.05,
        ),
      );
      layer(
        m,
        "star",
        30,
        0.07,
        ["#ffffff", "#dbe9ff"],
        (i, t, o) => {
          const k = life(i, t, 4);
          const a = hash(i) * tau + t * 0.3;
          const r = hash(i, 1) * 0.45;
          o.x = Math.cos(a) * r;
          o.z = Math.sin(a) * r;
          o.y = 3 - k * 3;
          o.a = Math.sin(k * Math.PI) * twinkle(i, t, 5);
        },
        true,
      );
      break;
    }
    case 26:
      layer(
        m,
        "leaf",
        14,
        0.145,
        ["#68bc9e", "#a0ca72", "#77b878", "#d2dfa0"],
        (i, t, o) => {
          const k = life(i, t, 5);
          const a = hash(i) * tau + t * 0.48;
          const r = 0.42 + Math.sin(k * Math.PI) * 0.17;
          o.x = Math.cos(a) * r;
          o.z = Math.sin(a) * r;
          o.y = 0.16 + k * 1.45;
          o.r = Math.sin(t * 0.7 + i) * 0.8 + i;
          o.a = Math.sin(k * Math.PI) * 0.75;
        },
      );
      layer(
        m,
        "glow",
        6,
        0.09,
        ["#f6eab8", "#d7f5d2"],
        (i, t, o) => {
          o.x = Math.sin(t * 0.4 + i * 1.9) * 0.54;
          o.z = Math.cos(t * 0.3 + i * 2.7) * 0.54;
          o.y = 0.35 + hash(i) * 1.15 + Math.sin(t * 0.8 + i) * 0.08;
          o.a = 0.35 + 0.25 * Math.max(0, Math.sin(t * 1.3 + i));
        },
        true,
      );
      break;
  }
  m.tick = (t, moving) => {
    for (const a of anim) a(t, moving);
    for (const child of g.children)
      if (child.name === "Wing")
        child.rotation.y =
          child.userData.side *
          (0.15 +
            Math.sin(t * (child.userData.slow ? 2 : 3.5)) *
              (child.userData.slow ? 0.3 : 0.22));
    for (const l of m.layers) update(l, t, moving);
  };
  m.tick(0, false);
  return m;
}

export function disposeMagic(m: Magic | null) {
  if (!m || disposedMagic.has(m)) return;
  disposedMagic.add(m);
  m.tick = () => {};
  for (const l of m.layers) {
    l.points.geometry.dispose();
    (l.points.material as T.Material).dispose();
  }
  m.group.removeFromParent();
}
