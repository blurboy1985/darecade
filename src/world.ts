import { resizeRenderer } from "./render-budget.ts";
import {
  seededLook,
  identitySeed,
  distinctHair,
  separateCharacter,
} from "./character-identity";
import { MovementInput } from "./movement-input";
import {
  createAvatar as avatar,
  applyLook,
  animateDetails,
  setAvatarDetail,
  disposeAvatar,
  type Avatar,
  type Look,
} from "./character";
import type { SharedPlayer } from "./social";
import { MovementBuffer } from "./movement-buffer";
import * as T from "three";
import { WorldMotion } from "./world-motion.ts";
import { JumpInput, isJumpKey } from "./jump-input";
import { rooftops } from "./rooftops.ts";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  blocked,
  clearLanding,
  route,
  visitsOnWalk,
  type Obstacle,
} from "./navigation";
import {
  outfits,
  skins,
  firstRoundGoalPending,
  singaporeDay,
  type Save,
} from "./state";
import { gameIds, type ActivityId } from "./catalog";
import { residents, activityPose } from "./neighbourhood";
import {
  InteractionScenes,
  interactionSpecs,
  type InteractionSpec,
} from "./interactions";

export type Spot = {
  id: string;
  name: string;
  x: number;
  z: number;
  approach: [number, number];
};
export const spots: Spot[] = [
  { id: "arcade", name: "Arcade Row", x: -5, z: -9, approach: [-5, -5] },
  { id: "dares", name: "Simi Plaza", x: 0, z: 1, approach: [0, 4] },
  { id: "shop", name: "Mama Shop", x: 12, z: -7, approach: [12, -3] },
  { id: "wardrobe", name: "Wardrobe", x: 14, z: 3, approach: [11, 4] },
  { id: "board", name: "The Daily Board", x: -15, z: -3, approach: [-12, -1] },
  { id: "garden", name: "Pocket Garden", x: -13, z: 8, approach: [-10, 8] },
  { id: "cat", name: "Kopi the cat", x: -9, z: 6, approach: [-8, 6] },
  {
    id: "playground",
    name: "Dragon Rooftop",
    x: 9,
    z: 10,
    approach: [6, 10],
  },
  // East Side: activities that are not arcade cabinets.
  { id: "hoops", name: "Hoops Court", x: 27, z: -11, approach: [27, -8] },
  { id: "plots", name: "Community Plots", x: 28, z: 3, approach: [24, 3] },
  { id: "fishing", name: "Fishing Jetty", x: 27, z: 11, approach: [27, 11] },
  // The stage fills the back of Simi Plaza; the floor sign is in front.
  { id: "stage", name: "Open Stage", x: 0, z: -0.2, approach: [0, -0.4] },
];
const matCache = new Map<string, T.MeshStandardMaterial>();
function material(color: string, emissive = false) {
  const k = color + emissive;
  if (!matCache.has(k))
    matCache.set(
      k,
      new T.MeshStandardMaterial({
        color,
        roughness: 0.88,
        flatShading: true,
        emissive: emissive ? color : "#000000",
        emissiveIntensity: emissive ? 0.65 : 0,
      }),
    );
  return matCache.get(k)!;
}
const boxGeo = new T.BoxGeometry(1, 1, 1);
function box(
  parent: T.Object3D,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  d: number,
  c: string,
  glow = false,
) {
  const m = new T.Mesh(boxGeo, material(c, glow));
  m.position.set(x, y, z);
  m.scale.set(w, h, d);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function cylinder(
  parent: T.Object3D,
  x: number,
  y: number,
  z: number,
  r: number,
  h: number,
  c: string,
  sides = 12,
  top = r,
) {
  const m = new T.Mesh(new T.CylinderGeometry(top, r, h, sides), material(c));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function sphere(
  parent: T.Object3D,
  x: number,
  y: number,
  z: number,
  r: number,
  c: string,
  detail = 1,
) {
  const m = new T.Mesh(new T.IcosahedronGeometry(r, detail), material(c));
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function sign(
  parent: T.Object3D,
  text: string,
  x: number,
  y: number,
  z: number,
  w: number,
  h: number,
  bg = "#253448",
  fg = "#fff5d8",
  size = 58,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = Math.round((1024 * h) / w);
  const c = canvas.getContext("2d")!;
  c.fillStyle = bg;
  c.fillRect(0, 0, canvas.width, canvas.height);
  c.fillStyle = fg;
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.font = `900 ${Math.max((size * 1024) / 512, canvas.height * 0.6)}px Arial, sans-serif`;
  c.fillText(text, 512, canvas.height / 2, 970);
  const tex = new T.CanvasTexture(canvas);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  const mesh = new T.Mesh(
    new T.PlaneGeometry(w, h),
    new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide }),
  );
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
// Static architecture is batched by material; moving and interactive objects stay independent.
function batchStatic(root: T.Object3D, preserve = new Set<T.Object3D>()) {
  root.updateMatrixWorld(true);
  const inverse = root.matrixWorld.clone().invert();
  const groups = new Map<T.Material, T.Mesh[]>();
  root.traverse((o) => {
    if (
      !(o instanceof T.Mesh) ||
      Array.isArray(o.material) ||
      !o.material.visible ||
      o.material instanceof T.MeshBasicMaterial
    )
      return;
    let p: T.Object3D | null = o;
    while (p && p !== root) {
      if (preserve.has(p)) return;
      p = p.parent;
    }
    if (!groups.has(o.material)) groups.set(o.material, []);
    groups.get(o.material)!.push(o);
  });
  for (const [mat, meshes] of groups) {
    if (meshes.length < 2) continue;
    const geometries = meshes.map((m) => {
      const g = m.geometry
        .clone()
        .applyMatrix4(inverse.clone().multiply(m.matrixWorld));
      if (g.getAttribute("tangent")) g.deleteAttribute("tangent");
      if (g.getAttribute("color")) g.deleteAttribute("color");
      if (!g.getAttribute("uv"))
        g.setAttribute(
          "uv",
          new T.BufferAttribute(
            new Float32Array(g.getAttribute("position").count * 2),
            2,
          ),
        );
      return g.index ? g.toNonIndexed() : g;
    });
    const merged = mergeGeometries(geometries);
    geometries.forEach((g) => g.dispose());
    if (!merged) continue;
    meshes.forEach((m) => m.removeFromParent());
    const mesh = new T.Mesh(merged, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.updateMatrix();
    mesh.matrixAutoUpdate = false;
    root.add(mesh);
  }
}

export class LobbyWorld {
  renderer: T.WebGLRenderer;
  scene = new T.Scene();
  mapCamera = new T.OrthographicCamera();
  followCamera = new T.PerspectiveCamera(52, 1, 0.08, 200);
  camera: T.OrthographicCamera | T.PerspectiveCamera = this.mapCamera;
  cameraMode: "isometric" | "third" = "isometric";
  pitch = 0.34;
  private revealAt = -Infinity;
  private revealYaw = 0;
  followDistance = 7;
  inspectedId = "";
  private sharedPlayers = new Map<
    string,
    {
      data: SharedPlayer;
      avatar: Avatar;
      look: string;
      buffer: MovementBuffer;
      live: boolean;
      simple: T.Group;
    }
  >();
  neighbours: {
    id: string;
    avatar: Avatar;
    activity: ActivityId;
    offset: number;
    path: { x: number; z: number }[];
    stopUntil: number;
    destination: number;
  }[] = [];
  private movementInput = new MovementInput();
  private pointers = new Map<number, { x: number; y: number }>();
  private dragStart = { x: 0, y: 0 };
  private dragged = false;
  private pinchDistance = 0;
  private birds: T.Group[] = [];
  root = new T.Group();
  player: Avatar;
  obstacles: (Obstacle & { cameraHeight: number })[] = [];
  targets: { mesh: T.Object3D; id: string }[] = [];
  coins: T.Group[] = [];
  keys = new Set<string>();
  path: { x: number; z: number }[] = [];
  onInteract: (id: string) => void;
  onVisit: (id: string) => void;
  onCoin: (id: string) => void;
  onNear: (name: string, id: string) => void;
  paused = false;
  reduced = false;
  angle = 0.63;
  zoom = 1;
  mobile = false;
  running = true;
  frame = 0;
  near = "";
  pending = "";
  emote = "";
  emoteAt = 0;
  joystick = { x: 0, y: 0 };
  sun: T.DirectionalLight;
  ambient: T.HemisphereLight;
  lamps: T.Mesh[] = [];
  lanterns: T.Object3D[] = [];
  cat: T.Group;
  ball: T.Mesh;
  ballVelocity = new T.Vector3();
  private clock = 0;
  private last = 0;
  private accumulator = 0;
  private frames = 0;
  private monitor = 0;
  private motion = new WorldMotion();
  private jumpVelocity = 0;
  private jumpInput = new JumpInput();
  private elevation = 0.1;
  private padFlight: { from: T.Vector3; to: T.Vector3; time: number } | null =
    null;
  private roofStars: T.Group[] = [];
  private afterPadFlight: { x: number; z: number; pending: string } | null =
    null;
  private jumpSparkles: { mesh: T.Mesh; life: number; velocity: T.Vector3 }[] =
    [];
  private roofStarDay = singaporeDay();
  private beforeAway: T.Vector3 | null = null;
  private phoneOverview = true;
  private overviewBlend = 1;

  private marker: T.Mesh;
  private listener: ResizeObserver;
  interactions!: InteractionScenes;
  private interactionId = "";
  private interactionToken = 0;
  private interactionCamera: {
    mode: "isometric" | "third";
    angle: number;
    pitch: number;
    distance: number;
  } | null = null;
  private benchCount = 0;
  private ray = new T.Raycaster();
  private ground = new T.Plane(new T.Vector3(0, 1, 0), -0.12);
  private targetPoint = new T.Vector3();
  private home = new T.Vector3(0, 0, -1);
  constructor(
    public host: HTMLElement,
    public save: Save,
    callbacks: {
      interact: (id: string) => void;
      visit: (id: string) => void;
      coin: (id: string) => void;
      near: (name: string, id: string) => void;
      graphicsLost: () => void;
      playerName?: string;
    },
  ) {
    this.onInteract = (id) => {
      if (id.startsWith("perform:")) {
        this.beginInteraction(id.slice(8));
        return;
      }
      if (id.startsWith("action:")) {
        void this.interact(id.slice(7));
        return;
      }
      callbacks.interact(id);
    };
    this.onVisit = callbacks.visit;
    this.onCoin = callbacks.coin;
    this.onNear = callbacks.near;
    this.reduced = save.reduced;
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;
    host.append(this.renderer.domElement);
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Interactive 3D neighbourhood. Click a spot to walk, or use WASD. Accessible locations are in the Neighbourhood menu.",
    );
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.running = false;
      callbacks.graphicsLost();
    });
    this.scene.add(this.root);
    this.ambient = new T.HemisphereLight("#ffe9da", "#687e84", 2.6);
    this.scene.add(this.ambient);
    this.sun = new T.DirectionalLight("#ffd0a1", 3.3);
    this.sun.position.set(-15, 25, 10);
    this.scene.add(this.sun);
    this.buildGround();
    this.buildArcade();
    this.buildShop();
    this.buildWardrobe();
    this.buildPlaza();
    this.buildBoard();
    this.buildGarden();
    this.buildSurroundings();
    this.buildPlayground();
    this.buildEastSide();
    this.buildNeighbours();
    this.buildLiveliness();
    this.buildRooftops();
    this.cat = this.buildCat();
    this.ball = sphere(this.root, 7, 0.47, 6, 0.38, "#f3bb64", 2);
    this.ball.userData.id = "ball";
    this.targets.push({ mesh: this.ball, id: "ball" });
    this.player = avatar(
      this.root,
      0,
      10,
      outfits[save.outfit],
      skins[save.skin],
      save.hat,
      save,
    );
    this.player.root.rotation.y = Math.PI;
    const markerGeo = new T.RingGeometry(0.55, 0.68, 32);
    this.marker = new T.Mesh(
      markerGeo,
      new T.MeshBasicMaterial({
        color: "#e3ff9b",
        side: T.DoubleSide,
        transparent: true,
        opacity: 0.85,
      }),
    );
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.position.y = 0.13;
    this.marker.visible = false;
    this.scene.add(this.marker);
    for (const [i, p] of [
      [-17, 10],
      [-8, -4],
      [16, -2],
      [16, 11],
      [-1, -14],
    ].entries()) {
      const g = new T.Group();
      g.position.set(p[0], 0.8, p[1]);
      const c = cylinder(g, 0, 0, 0, 0.27, 0.11, "#ffd261", 8);
      c.rotation.x = Math.PI / 2;
      box(g, 0, 0, 0.065, 0.07, 0.31, 0.03, "#fff4bc");
      g.userData.id = `coin${i}`;
      g.visible = !save.coins.includes(`coin${i}`);
      this.root.add(g);
      this.coins.push(g);
      this.targets.push({ mesh: g, id: `coin${i}` });
    }
    this.addHitAreas();
    this.setLighting(save.light);
    // Batch each clickable building inside its own boundary, retaining its
    // cabinets and moving lights. Its roof, walls and signs keep the same id.
    for (const target of this.targets.filter(
      (t) =>
        ["arcade", "shop", "wardrobe", "board"].includes(t.id) &&
        t.mesh instanceof T.Group,
    ))
      batchStatic(
        target.mesh,
        new Set([
          ...this.targets
            .filter((t) => t.mesh !== target.mesh)
            .map((t) => t.mesh),
          ...this.lamps,
        ]),
      );
    batchStatic(
      this.root,
      new Set<T.Object3D>([
        this.player.root,
        ...this.targets.map((t) => t.mesh),
        ...this.lamps,
        ...this.lanterns,
        ...this.birds,
        ...this.root.children.filter(
          (o) => o.userData.companion || o.userData.avatar,
        ),
      ]),
    );
    const playerRing = new T.Mesh(
      new T.RingGeometry(0.52, 0.7, 32),
      new T.MeshBasicMaterial({ color: "#e7ffab", side: T.DoubleSide }),
    );
    playerRing.rotation.x = -Math.PI / 2;
    playerRing.name = "PlayerGroundRing";
    playerRing.userData.avatarDecoration = true;
    playerRing.position.y = 0.05;
    playerRing.material.color.set("#86be58");
    this.player.root.add(playerRing);
    const you = sign(
      this.player.root,
      `YOU · ${callbacks.playerName || "Neighbour"}`,
      0,
      2.55,
      0,
      1.65,
      0.22,
      "#394d36",
      "#edffa9",
      28,
    );
    you.name = "PlayerNameTag";
    you.userData.avatarDecoration = true;
    you.renderOrder = 1000;
    you.material.depthTest = false;
    you.material.depthWrite = false;
    this.obstacle(-2, 10, 3.2, 1.4);
    this.interactions = new InteractionScenes(this.root, (scene, id) => {
      this.targets.push({ mesh: scene, id: `action:${id}` });
      if (id === "pet") this.cat.visible = false;
    });
    this.cameraMode = save.cameraMode;
    if (this.cameraMode === "third") this.angle = 0;
    host.addEventListener("pointerdown", this.pointerDown);
    host.addEventListener("pointermove", this.pointerMove);
    host.addEventListener("pointerup", this.pointerUp);
    host.addEventListener("pointercancel", this.pointerCancel);
    host.addEventListener("wheel", this.wheel, { passive: false });
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.clearKeys);
    document.addEventListener("visibilitychange", this.visibility);
    this.listener = new ResizeObserver(() => this.resize());
    this.listener.observe(host);
    this.resize();
    this.frame = requestAnimationFrame(this.animate);
  }
  private obstacle(
    x: number,
    z: number,
    w: number,
    d: number,
    cameraHeight = 1.4,
  ) {
    this.obstacles.push({ x, z, w, d, cameraHeight });
  }
  private burstStars(position: T.Vector3) {
    for (const [i, spark] of this.jumpSparkles.entries()) {
      spark.mesh.position.copy(position).y += 0.4;
      spark.life = 0.65;
      spark.velocity.set(
        Math.cos(i * 2.4) * 2,
        2 + (i % 3),
        Math.sin(i * 2.4) * 2,
      );
      spark.mesh.visible = true;
    }
  }
  private buildRooftops() {
    for (let i = 0; i < 16; i++) {
      const mesh = sphere(this.root, 0, 0, 0, 0.08, "#ffe28a");
      mesh.visible = false;
      this.jumpSparkles.push({ mesh, life: 0, velocity: new T.Vector3() });
    }
    for (const roof of rooftops) {
      const pad = cylinder(
        this.root,
        roof.pad[0],
        0.2,
        roof.pad[1],
        0.65,
        0.18,
        "#c9ef8b",
        24,
      );
      pad.name = `JumpPad-${roof.id}`;
      sign(
        this.root,
        "JUMP ↑",
        roof.pad[0],
        0.34,
        roof.pad[1],
        1.1,
        0.5,
        "#c9ef8b",
        "#263447",
      ).rotation.x = -Math.PI / 2;
      const star = new T.Group();
      star.position.set(roof.x, roof.y + 2.2, roof.z);
      const outline = new T.Shape();
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5 + Math.PI / 2;
        const radius = i % 2 ? 0.18 : 0.42;
        const x = Math.cos(angle) * radius,
          y = Math.sin(angle) * radius;
        if (i) outline.lineTo(x, y);
        else outline.moveTo(x, y);
      }
      outline.closePath();
      const jewel = new T.Mesh(
        new T.ExtrudeGeometry(outline, { depth: 0.12, bevelEnabled: false }),
        new T.MeshStandardMaterial({
          color: "#ffd261",
          emissive: "#e9a32e",
          emissiveIntensity: 0.5,
        }),
      );
      star.add(jewel);
      star.name = `RooftopStar-${roof.id}`;
      star.userData.roof = roof.id;
      star.userData.baseY = star.position.y;
      star.userData.avatar = undefined;
      star.visible =
        this.save.roofDay !== singaporeDay() ||
        !this.save.roofStars.includes(roof.id);
      this.root.add(star);
      this.roofStars.push(star);
      this.targets.push({ mesh: star, id: `roof:${roof.id}` });
    }
  }
  private jumpStep(dt: number) {
    const p = this.player.root.position;
    if (this.jumpInput.take(!this.jumpVelocity && !this.padFlight)) {
      const roof = rooftops.find(
        (r) =>
          Math.hypot(p.x - r.pad[0], p.z - r.pad[1]) < 1.3 &&
          this.elevation < 0.3,
      );
      if (roof)
        this.padFlight = {
          from: p.clone(),
          to: new T.Vector3(roof.x, roof.y + 0.1, roof.z),
          time: 0,
        };
      else this.jumpVelocity = 6.8;
      this.burstStars(p);
      window.dispatchEvent(
        new CustomEvent("world-jump", { detail: { pad: !!roof } }),
      );
    }
    if (this.padFlight) {
      const f = this.padFlight;
      f.time = Math.min(1, f.time + dt / 1.5);
      p.lerpVectors(f.from, f.to, f.time);
      p.y += Math.sin(Math.PI * f.time) * 3.8;
      this.elevation = p.y;
      this.motion.reset();
      if (f.time === 1) {
        this.padFlight = null;
        const destination = this.afterPadFlight;
        this.afterPadFlight = null;
        if (destination)
          this.walkTo(destination.x, destination.z, destination.pending);
      }
    } else {
      const surface = rooftops
        .filter(
          (r) =>
            Math.abs(p.x - r.x) < r.w / 2 &&
            Math.abs(p.z - r.z) < r.d / 2 &&
            this.elevation >= r.y - 0.05,
        )
        .reduce((y, r) => Math.max(y, r.y + 0.1), 0.1);
      if (this.elevation > surface || this.jumpVelocity > 0) {
        const previousHeight = this.elevation;
        this.jumpVelocity -= dt * 15;
        this.elevation = Math.max(
          surface,
          this.elevation + this.jumpVelocity * dt,
        );
        if (this.elevation === surface) this.jumpVelocity = 0;
        if (this.elevation < previousHeight) {
          const landing = clearLanding(p.x, p.z, this.movementObstacles());
          if (landing.x !== p.x || landing.z !== p.z) {
            p.x = landing.x;
            p.z = landing.z;
            // Discard the pre-landing pose so interpolation cannot put us
            // back inside the obstacle on the next movement tick.
            this.motion.reset();
          }
        }
      }
      p.y = this.elevation;
    }
    for (const spark of this.jumpSparkles) {
      if (spark.life <= 0) continue;
      spark.life -= dt;
      spark.mesh.visible = spark.life > 0;
      spark.mesh.position.addScaledVector(spark.velocity, dt);
      spark.velocity.y -= dt * 7;
      spark.mesh.scale.setScalar(Math.max(0, spark.life / 0.65));
    }
    for (const star of this.roofStars) {
      star.rotation.y = this.clock;
      star.position.y = star.userData.baseY + Math.sin(this.clock * 2.4) * 0.16;
      if (
        star.visible &&
        Math.hypot(p.x - star.position.x, p.z - star.position.z) < 0.7 &&
        Math.abs(p.y + 1.3 - star.position.y) < 1.1
      ) {
        star.visible = false;
        this.burstStars(star.position);
        this.onCoin(`roof:${star.userData.roof}`);
      }
    }
  }
  private buildGround() {
    box(this.root, 0, -0.75, 0, 41, 1.5, 31, "#9299a2");
    box(this.root, 0, -0.18, 0, 40.4, 0.55, 30.4, "#ded1be");
    box(this.root, 0, 0.04, 0, 39.5, 0.13, 29.5, "#d5caba");
    for (let x = -19; x < 20; x += 2)
      for (let z = -14; z < 15; z += 2) {
        box(
          this.root,
          x,
          0.112,
          z,
          1.97,
          0.025,
          1.97,
          (Math.abs(x) + Math.abs(z)) % 6 === 0 ? "#dcd3c5" : "#d0c7bb",
        );
      }
    box(this.root, 0, 0.13, 6, 4, 0.025, 15, "#edddc4");
    box(this.root, 0, 0.13, -3, 31, 0.025, 3.4, "#edddc4");
    for (let i = 0; i < 7; i++)
      box(this.root, -1.1 + i * 0.37, 0.15, 12.5, 0.15, 0.02, 1.4, "#a99d8d");
    // A miniature city outside the playable island gives the plaza a neighbourhood context.
    const backdrop = box(this.scene, 0, -1.65, 0, 220, 0.1, 220, "#9da9b8");
    backdrop.receiveShadow = true;
    box(this.root, 0, -0.7, -19, 100, 0.15, 6, "#828d9d");
    for (let x = -45; x < 45; x += 5)
      box(this.root, x, -0.61, -19, 2.2, 0.02, 0.13, "#ced0c9");
    box(this.root, -24, -0.7, 1, 5, 0.15, 50, "#828d9d");
    for (let i = 0; i < 10; i++) {
      box(this.root, -23, -0.6, -12 + i * 0.6, 3, 0.02, 0.24, "#dbe0d6");
    }
    for (let i = 0; i < 11; i++)
      box(
        this.root,
        -19 + i * 3.7,
        -0.15,
        15.1,
        0.5,
        0.5,
        0.25,
        i % 2 ? "#f0e3c7" : "#83928b",
      );
  }
  private buildArcade() {
    const g = new T.Group();
    g.userData.id = "arcade";
    this.targets.push({ mesh: g, id: "arcade" });
    g.position.set(-5, 0, -9.5);
    this.root.add(g);
    this.obstacle(-5, -10, 18, 5, 6);
    box(g, 0, 0.28, 0, 19, 0.4, 6.5, "#b5beb5");
    box(g, 0, 2.4, -2.4, 18, 4.5, 0.35, "#9dbbad");
    box(g, 0, 4.8, -1.8, 19.5, 0.65, 2.9, "#7f9990");
    box(g, 0, 5.18, -1.8, 19.8, 0.18, 2.9, "#c4ccac");
    for (const x of [-8.8, -1.8, 1.8, 8.8]) {
      this.obstacle(-5 + x, -8.6, 0.7, 0.73, 4.4);
      box(g, x, 2.3, 0.9, 0.55, 4.4, 0.6, "#dce4c6");
      box(g, x, 0.55, 0.9, 0.7, 0.45, 0.73, "#e9e8cc");
    }
    box(g, 0, 4.3, 3.25, 19.1, 0.72, 0.17, "#38434e");
    sign(g, "ARCADE ROW", 1.5, 4.32, 3.35, 8, 0.66, "#38434e", "#f5e9ac", 48);
    for (let x = -8.5; x <= 8.5; x += 1.55) {
      const bulb = sphere(g, x, 3.83, 3.12, 0.1, "#ffe7ad");
      (bulb.material as T.MeshStandardMaterial) = material("#ffe7ad", true);
      this.lamps.push(bulb);
    }
    const names = [
        "NOODLE RUN",
        "BRICK BASH",
        "HOP HOP",
        "STAR SWARM",
        "COAST RUSH",
      ],
      cols = ["#b8da66", "#af9bee", "#f2ba6b", "#78c5d0", "#f7a782"];
    for (let i = 0; i < gameIds.length; i++) {
      const c = new T.Group();
      c.position.set(-7.2 + i * 3.6, 0.48, 0.7);
      this.obstacle(-12.2 + i * 3.6, -8.2, 1.75, 2.4, 2.8);
      g.add(c);
      box(c, 0, 1.13, 0, 1.72, 2.25, 1.12, cols[i]);
      box(c, 0, 1.82, 0.62, 1.42, 1.15, 0.13, "#263747");
      box(c, 0, 1.81, 0.7, 1.17, 0.81, 0.035, "#142b37");
      box(c, 0, 0.91, 0.85, 1.75, 0.25, 0.72, "#394755");
      const controls = box(c, 0, 1.05, 0.96, 1.55, 0.12, 0.5, cols[i]);
      controls.rotation.x = -0.16;
      // Blender interaction assets supply the animated joystick and buttons.
      box(c, 0, 0.35, 0.58, 0.4, 0.16, 0.025, "#34434c");
      sign(c, names[i], 0, 2.69, 0.65, 2.5, 0.56, "#20283b", "#fff5d8", 42);
      const screen = sign(
        c,
        ["● ━ ━ ●", "▰ ▰ ▰", "↑ HOP ↑", "✦ SWARM", "COAST GP"][i],
        0,
        1.8,
        0.73,
        1.17,
        0.65,
        "#142b37",
        cols[i],
        i < 2 ? 60 : 28,
      );
      screen.userData.id = gameIds[i];
      c.userData.id = gameIds[i];
      this.targets.push({ mesh: c, id: c.userData.id });
      const glow = new T.PointLight(cols[i], 1.4, 4, 2);
      glow.position.set(c.position.x, 1.8, 2);
      g.add(glow);
    }
    // Rooftop ventilation and planters, visible from the isometric view.
    for (let i = 0; i < 3; i++) {
      box(g, -6 + i * 5, 5.5, -1.2, 2, 0.5, 1.4, "#b5bcb0");
      for (let j = 0; j < 5; j++)
        box(g, -6.8 + i * 5 + j * 0.38, 5.78, -1.2, 0.15, 0.05, 1, "#798e87");
    }
    sign(g, "BLK 08", -7.5, 3.35, 0.95, 1.2, 0.7, "#e2e9cc", "#50786e", 38);
  }
  private buildShop() {
    const g = new T.Group();
    g.userData.id = "shop";
    this.targets.push({ mesh: g, id: "shop" });
    g.position.set(12, 0, -8);
    this.root.add(g);
    this.obstacle(12, -8, 7, 6, 5.4);
    box(g, 0, 1.9, 0, 6.8, 3.8, 5.5, "#d89080");
    box(g, 0, 4, 0, 7.4, 0.42, 6, "#f3cba5");
    box(g, 0, 1.8, 2.8, 5.8, 2.7, 0.12, "#4b5960");
    for (let i = 0; i < 8; i++)
      box(
        g,
        -3.05 + i * 0.86,
        3.24,
        3.3,
        0.86,
        0.2,
        1.5,
        i % 2 ? "#fff0c9" : "#dd796a",
      );
    for (let i = 0; i < 8; i++)
      box(
        g,
        -3.05 + i * 0.86,
        3.03,
        4,
        0.86,
        0.42,
        0.1,
        i % 2 ? "#fff0c9" : "#dd796a",
      );
    sign(g, "MAMA SHOP", 0, 4.42, 2.9, 6.5, 0.85, "#326f64", "#fff0c9", 46);
    sign(
      g,
      "GOOD THINGS. ON THE HOUSE.",
      0,
      3.74,
      2.96,
      5.5,
      0.35,
      "#326f64",
      "#d4e9b5",
      22,
    );
    for (let row = 0; row < 3; row++) {
      box(g, -1.4, 0.8 + row * 0.65, 2.96, 2.7, 0.12, 0.6, "#e7bb8d");
      for (let col = 0; col < 7; col++)
        box(
          g,
          -2.5 + col * 0.36,
          1.04 + row * 0.65,
          2.9,
          0.23,
          0.35,
          0.25,
          ["#b6d182", "#f4d37b", "#8eb9b5", "#d88b7e"][col % 4],
        );
    }
    box(g, 1.55, 1.2, 3, 1.5, 2.35, 0.15, "#354447");
    box(g, 1.55, 1.4, 3.1, 1.18, 1.4, 0.08, "#8ab7af");
    box(g, 1.94, 1.12, 3.17, 0.07, 0.22, 0.05, "#edd69a");
    box(g, -0.5, 0.54, 4.2, 2.2, 0.9, 0.95, "#ac8564");
    for (let i = 0; i < 8; i++)
      sphere(
        g,
        -1.2 + (i % 4) * 0.45,
        1.08,
        4 + (i > 3 ? 0.35 : 0),
        0.21,
        i % 2 ? "#ecd380" : "#adc66b",
      );
    const gift = new T.Group();
    gift.position.set(2.8, 0.5, 4.1);
    box(gift, 0, 0.4, 0, 0.85, 0.8, 0.85, "#b6d888");
    box(gift, 0, 0.85, 0, 0.96, 0.18, 0.96, "#d1eda4");
    box(gift, 0, 0.5, 0.44, 0.17, 0.85, 0.03, "#fff1d0");
    box(gift, 0, 0.96, 0, 0.9, 0.06, 0.17, "#fff1d0");
    g.add(gift);
    gift.userData.id = "shop";
    this.targets.push({ mesh: gift, id: "shop" });
  }
  private buildWardrobe() {
    const g = new T.Group();
    g.userData.id = "wardrobe";
    this.targets.push({ mesh: g, id: "wardrobe" });
    g.position.set(15, 0, 3);
    this.root.add(g);
    this.obstacle(15, 3, 3, 3.2, 4);
    box(g, 0, 0.25, 0, 3.7, 0.4, 3.6, "#baabca");
    box(g, 0, 1.85, -0.9, 3.1, 3.2, 0.4, "#aa90bc");
    box(g, -1.5, 1.8, 0, 0.2, 3.3, 2.5, "#ba9fca");
    box(g, 1.5, 1.8, 0, 0.2, 3.3, 2.5, "#ba9fca");
    box(g, 0, 3.6, 0, 3.7, 0.35, 3.3, "#e2b8c8");
    box(g, 0, 1.9, -0.65, 1.7, 2.7, 0.09, "#e3d5c2");
    box(g, 0, 1.9, -0.58, 1.5, 2.45, 0.07, "#87a9b2");
    sign(
      g,
      "NEW LOOK, WHO DIS?",
      0,
      3.6,
      1.7,
      3.4,
      0.45,
      "#694c80",
      "#f4e5cf",
      27,
    );
    sign(g, "WARDROBE", 0, 4.15, 0, 3.8, 0.6, "#b5a0d0", "#302e45", 34);
  }
  /** The Open Stage: a low dance floor anyone can walk onto, with lights behind. */
  private buildStage() {
    const r = this.root;
    cylinder(r, 0, 0.31, -0.2, 2.25, 0.12, "#2f3558", 40);
    cylinder(r, 0, 0.36, -0.2, 2.05, 0.06, "#444b7a", 40);
    const tiles = ["#ff8fb8", "#7fe3e0", "#ffe27a", "#b9a4ff"];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const tile = box(
        r,
        Math.cos(a) * 1.5,
        0.395,
        -0.2 + Math.sin(a) * 1.5,
        0.5,
        0.02,
        0.5,
        tiles[i % 4],
      );
      tile.material = material(tiles[i % 4], true);
      tile.rotation.y = -a;
    }
    // A truss with three lamps, two speakers and the name over the back edge.
    for (const x of [-2.3, 2.3]) {
      cylinder(r, x, 1.95, -2.1, 0.07, 3.3, "#3a4250");
      box(r, x * 0.87, 0.75, -1.9, 0.6, 0.9, 0.5, "#232833");
      this.obstacle(x * 0.87, -1.9, 0.6, 0.5, 1.3);
      cylinder(r, x * 0.87, 0.8, -1.64, 0.2, 0.04, "#596273").rotation.x =
        Math.PI / 2;
    }
    box(r, 0, 3.55, -2.1, 4.9, 0.14, 0.14, "#3a4250");
    ["#ff8fb8", "#ffe27a", "#7fe3e0"].forEach((c, i) => {
      const lamp = sphere(r, -1.4 + i * 1.4, 3.36, -2.1, 0.17, c);
      lamp.material = material(c, true);
    });
    sign(r, "OPEN STAGE", 0, 2.85, -2.1, 3, 0.55, "#2f3558", "#ffe27a", 60);
  }
  private buildPlaza() {
    cylinder(this.root, 0, 0.16, 1, 4, 0.1, "#b5bbb0", 48);
    cylinder(this.root, 0, 0.23, 1, 3.65, 0.08, "#e4dabf", 48);
    const ring = new T.Mesh(
      new T.RingGeometry(3.2, 3.25, 48),
      material("#bdab8e"),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.29, 1);
    this.root.add(ring);
    this.buildStage();
    const floor = sign(
      this.root,
      "PLAY SIMI?",
      0,
      0.3,
      3.75,
      4,
      0.5,
      "#e4dabf",
      "#9e8f79",
      26,
    );
    floor.rotation.x = -Math.PI / 2;
    // Keep the plaza open; rankings live on the board, without mannequin placeholders.
    for (const x of [-5, 5]) {
      this.obstacle(x, 0, 0.17, 0.17, 5.8);
      cylinder(this.root, x, 2.9, 0, 0.085, 5.8, "#556c69");
      sphere(this.root, x, 5.85, 0, 0.18, "#e3c58c");
    }
    const curve = new T.CatmullRomCurve3([
      new T.Vector3(-5, 5.7, 0),
      new T.Vector3(0, 4.6, 0),
      new T.Vector3(5, 5.7, 0),
    ]);
    this.root.add(
      new T.Mesh(
        new T.TubeGeometry(curve, 24, 0.025, 4, false),
        material("#5b6865"),
      ),
    );
    for (let i = 0; i < 9; i++) {
      const p = curve.getPoint((i + 0.5) / 9);
      const lantern = cylinder(
        this.root,
        p.x,
        p.y - 0.24,
        p.z,
        0.21,
        0.4,
        i % 2 ? "#f6ca84" : "#e8997d",
        10,
      );
      this.lanterns.push(lantern);
      box(this.root, p.x, p.y - 0.5, p.z, 0.03, 0.16, 0.03, "#b56b55");
    }
  }
  private buildBoard() {
    const g = new T.Group();
    g.userData.id = "board";
    this.targets.push({ mesh: g, id: "board" });
    g.position.set(-15, 0, -2.5);
    g.rotation.y = 0.25;
    this.root.add(g);
    this.obstacle(-15, -2.5, 4.2, 1.2);
    for (const x of [-1.7, 1.7]) box(g, x, 1.7, 0, 0.2, 3.4, 0.2, "#687a75");
    box(g, 0, 2.8, 0, 4.6, 3.1, 0.28, "#50655f");
    sign(g, "DAILY BOARD", 0, 3.95, 0.17, 4.2, 0.55, "#50655f", "#f4d797", 48);
    sign(
      g,
      "GOLD  +3 POINTS / DAY",
      0,
      3.26,
      0.18,
      4.1,
      0.45,
      "#50655f",
      "#e9dfc0",
      24,
    );
    sign(
      g,
      "SILVER  +2 POINTS / DAY",
      0,
      2.65,
      0.18,
      4.1,
      0.45,
      "#50655f",
      "#e9dfc0",
      24,
    );
    sign(
      g,
      "BRONZE  +1 POINT / DAY",
      0,
      2.04,
      0.18,
      4.1,
      0.45,
      "#50655f",
      "#e9dfc0",
      24,
    );
    sign(
      g,
      "TAP TO SEE LIVE RANKINGS",
      0,
      1.46,
      0.18,
      4,
      0.32,
      "#50655f",
      "#a3c0ac",
      20,
    );
    box(g, 0, 4.45, 0, 5, 0.22, 1, "#deb486");
  }
  private tree(x: number, z: number, scale = 1) {
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.scale.setScalar(scale);
    this.root.add(g);
    cylinder(g, 0, 0.32, 0, 1.05, 0.5, "#a7ada1", 8);
    cylinder(g, 0, 0.6, 0, 0.9, 0.13, "#7d9978");
    cylinder(g, 0, 1.7, 0, 0.17, 2.8, "#937967", 7);
    const crown = sphere(g, 0, 3.1, 0, 1.45, "#7da891", 1);
    crown.scale.set(1, 1.05, 1);
    sphere(g, -0.65, 2.8, 0.3, 0.9, "#8eb49a", 1);
    sphere(g, 0.4, 3.9, 0, 0.9, "#a0bd94", 1);
    this.obstacle(x, z, 2.1 * scale, 2.1 * scale, 2.8 * scale);
  }
  private bench(x: number, z: number, rot = 0) {
    this.obstacle(
      x,
      z,
      Math.abs(Math.cos(rot)) * 2.4 + Math.abs(Math.sin(rot)) * 0.8,
      Math.abs(Math.sin(rot)) * 2.4 + Math.abs(Math.cos(rot)) * 0.8,
      1.4,
    );
    const g = new T.Group();
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.root.add(g);
    for (let i = 0; i < 4; i++)
      box(g, 0, 0.68, -0.3 + i * 0.2, 2.4, 0.12, 0.14, "#bf9975");
    for (let i = 0; i < 3; i++)
      box(g, 0, 1.05 + i * 0.17, -0.35, 2.4, 0.12, 0.12, "#bf9975");
    for (const s of [-1, 1]) {
      box(g, s * 0.9, 0.38, 0, 0.12, 0.65, 0.6, "#5d7771");
      box(g, s * 0.9, 0.94, -0.35, 0.12, 1.1, 0.1, "#5d7771");
    }
    g.userData.id = `action:bench${this.benchCount++}`;
    this.targets.push({ mesh: g, id: g.userData.id });
  }
  private buildGarden() {
    box(this.root, -13, 0.16, 8, 8, 0.17, 9, "#92a795");
    for (const [x, z] of [
      [-16, 5],
      [-16, 11],
      [-11, 11],
    ])
      this.tree(x, z, 0.85);
    this.bench(-13, 6);
    this.bench(-13, 10, Math.PI);
    cylinder(this.root, -13, 0.5, 8, 0.8, 0.9, "#c0b39a");
    cylinder(this.root, -13, 1, 8, 1.1, 0.15, "#d8c7a4");
    this.obstacle(-13, 8, 2.2, 2.2, 1.1);
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      sphere(
        this.root,
        -13 + Math.sin(a) * 0.6,
        1.2,
        8 + Math.cos(a) * 0.6,
        0.19,
        ["#d2b772", "#cf9199", "#b3c479"][i % 3],
      );
    }
    const a = avatar(this.root, -12, 6.9, "#d58f87");
    a.root.rotation.y = -0.5;
    sign(
      this.root,
      "TAKE IT SLOW",
      -13,
      2,
      12,
      4,
      0.6,
      "#7f9b89",
      "#f1e9ce",
      29,
    );
  }
  private buildSurroundings() {
    for (const [x, z, s] of [
      [-18, -10, 1],
      [18, -12, 0.95],
      [18, 7, 0.8],
      [6, -13, 1],
      [4, 13, 0.7],
      [-7, 13, 0.7],
    ])
      this.tree(x, z, s);
    for (const x of [-18, 18])
      for (const z of [-5, 12]) {
        this.obstacle(x, z, 0.14, 0.14, 3.6);
        cylinder(this.root, x, 1.8, z, 0.07, 3.6, "#526761");
        box(this.root, x, 3.65, z, 0.55, 0.7, 0.55, "#55675f");
        const bulb = box(
          this.root,
          x,
          3.65,
          z,
          0.39,
          0.49,
          0.59,
          "#ffe4a1",
          true,
        );
        this.lamps.push(bulb);
        box(this.root, x, 4.04, z, 0.75, 0.13, 0.75, "#586c66");
      }
    const blocks = [
      [-20, -32, 9, 16, 7, "#bdc2bc"],
      [-7, -31, 9, 20, 7, "#bec7c0"],
      [6, -31, 8, 15, 7, "#acb9b5"],
      [18, -30, 10, 22, 7, "#b5b5b1"],
      [-32, -10, 7, 12, 9, "#a2b8b3"],
    ];
    for (const [x, z, w, h, d, c] of blocks as [
      number,
      number,
      number,
      number,
      number,
      string,
    ][]) {
      box(this.root, x, h / 2 - 1, z, w, h, d, c);
      box(this.root, x, h - 1, z, w + 0.4, 0.4, d + 0.4, "#9aa9a5");
      for (let row = 0; row < h / 2.8 - 1; row++)
        for (let col = 0; col < Math.floor(w / 2); col++) {
          box(
            this.root,
            x - w / 2 + 1.15 + col * 2,
            1.5 + row * 2.6,
            z + d / 2 + 0.04,
            0.9,
            1.15,
            0.08,
            (row + col) % 4 === 0 ? "#dbcdaa" : "#8eaaa9",
          );
          box(
            this.root,
            x - w / 2 + 1.15 + col * 2,
            1.1 + row * 2.6,
            z + d / 2 + 0.14,
            1.15,
            0.07,
            0.3,
            "#d2d3c4",
          );
        }
    }
    this.bench(8, -1, 0.1);
    this.bench(-6, 9, -0.6);
    // A teal bicycle tucked against the arcade wall.
    for (const x of [-18, -16.9]) {
      const m = new T.Mesh(
        new T.TorusGeometry(0.44, 0.055, 6, 18),
        material("#566363"),
      );
      m.position.set(x, 0.65, -7);
      this.root.add(m);
    }
    box(this.root, -17.45, 0.9, -7, 1.1, 0.09, 0.08, "#61a0a0");
    box(this.root, -17.4, 1.24, -7, 0.08, 0.7, 0.08, "#61a0a0");
    box(this.root, -17.4, 1.61, -7, 0.44, 0.08, 0.2, "#51605b");
    // The bell is loaded with its synchronized Blender animation.
  }
  /** A second district east of the original island: court, plots and pond. */
  private buildEastSide() {
    const r = this.root;
    // Ground, matching the original island's layers and paving.
    box(r, 27.5, -0.75, 0, 14, 1.5, 31, "#9299a2");
    box(r, 27.2, -0.18, 0, 14, 0.55, 30.4, "#ded1be");
    box(r, 26.75, 0.04, 0, 14, 0.13, 29.5, "#d5caba");
    for (let x = 21; x < 34; x += 2)
      for (let z = -14; z < 15; z += 2)
        box(
          r,
          x,
          0.112,
          z,
          1.97,
          0.025,
          1.97,
          (Math.abs(x) + Math.abs(z)) % 6 === 0 ? "#dcd3c5" : "#d0c7bb",
        );
    box(r, 24.5, 0.13, -3, 18, 0.025, 3.4, "#edddc4");
    box(r, 23.6, 0.13, 3.6, 2.6, 0.025, 9.8, "#edddc4");
    for (let i = 11; i < 15; i++)
      box(
        r,
        -19 + i * 3.7,
        -0.15,
        15.1,
        0.5,
        0.5,
        0.25,
        i % 2 ? "#f0e3c7" : "#83928b",
      );
    const arch = sign(r, "EAST SIDE", 20.6, 3.35, -3, 3.4, 0.7, "#2f5560");
    arch.rotation.y = -Math.PI / 2;
    for (const z of [-4.9, -1.1]) {
      box(r, 20.6, 1.85, z, 0.22, 3.7, 0.22, "#586c66");
      this.obstacle(20.6, z, 0.3, 0.3);
    }
    box(r, 20.6, 3.8, -3, 0.26, 0.2, 4.2, "#586c66");
    for (const [x, z] of [
      [33, -5],
      [22, 7],
    ]) {
      cylinder(r, x, 1.8, z, 0.07, 3.6, "#526761");
      box(r, x, 3.65, z, 0.55, 0.7, 0.55, "#55675f");
      this.lamps.push(box(r, x, 3.65, z, 0.39, 0.49, 0.59, "#ffe4a1", true));
      box(r, x, 4.04, z, 0.75, 0.13, 0.75, "#586c66");
    }
    this.tree(32.4, -0.4, 0.8);
    this.tree(21.4, 13, 0.7);

    // Hoops Court: a half court with one hoop at the north end.
    box(r, 27, 0.135, -9.5, 10, 0.03, 8, "#d98f6a");
    const line = "#fbf3e2";
    for (const [x, z, w, d] of [
      [27, -5.55, 10, 0.1],
      [27, -13.45, 10, 0.1],
      [22.05, -9.5, 0.1, 8],
      [31.95, -9.5, 0.1, 8],
      [27, -9.2, 3.6, 0.1],
      [25.2, -11.3, 0.1, 4.3],
      [28.8, -11.3, 0.1, 4.3],
    ])
      box(r, x, 0.155, z, w, 0.012, d, line);
    box(r, 27, 0.15, -11.3, 3.5, 0.012, 4.2, "#c97b5c");
    const arc = new T.Mesh(
      new T.TorusGeometry(1.8, 0.05, 4, 20, Math.PI),
      material(line),
    );
    arc.rotation.x = Math.PI / 2;
    arc.position.set(27, 0.16, -9.2);
    r.add(arc);
    cylinder(r, 27, 1.75, -13.6, 0.11, 3.5, "#566363");
    box(r, 27, 3.3, -13.25, 0.12, 0.12, 0.8, "#566363");
    box(r, 27, 3.25, -12.85, 1.9, 1.2, 0.09, "#f4efe2");
    box(r, 27, 3.1, -12.79, 0.62, 0.46, 0.03, "#e8785e");
    const rim = new T.Mesh(
      new T.TorusGeometry(0.28, 0.035, 6, 16),
      material("#ee7b4f"),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(27, 2.86, -12.5);
    r.add(rim);
    cylinder(r, 27, 2.66, -12.5, 0.17, 0.4, "#fdf8ec", 8, 0.27);
    this.obstacle(27, -13.4, 0.9, 0.9);
    box(r, 31.3, 0.42, -12.6, 1.5, 0.12, 0.6, "#566363");
    for (const x of [30.7, 31.9])
      box(r, x, 0.24, -12.6, 0.1, 0.3, 0.5, "#566363");
    for (const x of [30.85, 31.3, 31.75])
      sphere(r, x, 0.66, -12.6, 0.19, "#e88a4a", 1);
    this.obstacle(31.3, -12.6, 1.5, 0.6);

    // Community Plots: six raised beds and a tool shed.
    const greens = ["#7da891", "#8eb49a", "#a0bd94"];
    [26.2, 29.2].forEach((x, column) =>
      [0.4, 3, 5.6].forEach((z, row) => {
        box(r, x, 0.32, z, 2.3, 0.42, 1.7, "#a9825c");
        box(r, x, 0.55, z, 2, 0.06, 1.4, "#5b4636");
        const mine = column === 0 && row === 1;
        for (let i = 0; i < (mine ? 3 : 5); i++) {
          const px = x - 0.75 + ((i * 0.37 + row * 0.2) % 1.5),
            pz = z - 0.45 + ((i * 0.53 + column * 0.3) % 0.9);
          if ((i + row + column) % 3 === 0) {
            cylinder(r, px, 0.85, pz, 0.03, 0.6, "#7a9a68", 5);
            sphere(r, px, 1.2, pz, 0.14, ["#f2c14e", "#e8785e"][i % 2], 0);
          } else sphere(r, px, 0.72, pz, 0.2, greens[(i + row) % 3], 0);
        }
        if (mine) {
          cylinder(r, x + 0.8, 0.95, z + 0.55, 0.035, 0.8, "#937967", 5);
          sign(r, "YOUR PLOT", x + 0.8, 1.45, z + 0.56, 1.3, 0.34, "#3f6b5a");
        }
        this.obstacle(x, z, 2.3, 1.7);
      }),
    );
    box(r, 32, 1.05, 3, 1.7, 2.1, 2.4, "#7fa39a");
    box(r, 32, 2.2, 3, 2.1, 0.2, 2.8, "#55675f");
    box(r, 31.13, 0.95, 3, 0.06, 1.7, 0.9, "#566f6a");
    this.obstacle(32, 3, 1.7, 2.4);
    cylinder(r, 30.9, 0.36, 1.4, 0.2, 0.42, "#6aa7b0", 10);
    box(r, 31.15, 0.46, 1.4, 0.34, 0.05, 0.05, "#6aa7b0");

    // Fishing Jetty: a sunken pond with a short jetty from its west bank.
    box(r, 28.5, 0.15, 11, 9, 0.05, 5.5, "#5fb4c4");
    for (const [x, z, w, d] of [
      [28.5, 8.1, 9.5, 0.4],
      [28.5, 13.9, 9.5, 0.4],
      [33.15, 11, 0.4, 5.5],
      [23.85, 8.95, 0.4, 1.9],
      [23.85, 13.05, 0.4, 1.9],
    ])
      box(r, x, 0.25, z, w, 0.28, d, "#b9b3a4");
    box(r, 26, 0.36, 11, 4.3, 0.12, 1.6, "#b88761");
    for (let i = 0; i < 8; i++)
      box(r, 24.1 + i * 0.54, 0.425, 11, 0.04, 0.012, 1.6, "#9a7252");
    for (const x of [24.6, 27.9])
      for (const z of [10.3, 11.7])
        cylinder(r, x, 0.35, z, 0.09, 0.6, "#8a6a52", 6);
    for (const [x, z, s] of [
      [30.6, 9.4, 0.5],
      [31.7, 12.6, 0.4],
      [25.4, 12.9, 0.36],
      [29.6, 12.9, 0.3],
    ])
      cylinder(r, x, 0.19, z, s, 0.03, "#7da891", 9);
    sphere(r, 31.75, 0.3, 12.55, 0.13, "#f3b3c6", 0);
    for (const [x, z] of [
      [32.6, 9],
      [32.4, 9.5],
      [32.7, 9.9],
      [24.6, 13.4],
    ])
      cylinder(r, x, 0.65, z, 0.035, 1, "#7a9a68", 5);
    const rod = cylinder(r, 28.35, 1.05, 11.45, 0.025, 2, "#6d5a4c", 5);
    rod.rotation.z = -0.95;
    sphere(r, 29.5, 0.24, 11.45, 0.1, "#e8785e", 1);
    cylinder(r, 27.6, 0.57, 10.5, 0.17, 0.3, "#6aa7b0", 10, 0.21);
    cylinder(r, 23.2, 0.9, 9.3, 0.04, 1.6, "#937967", 5);
    sign(r, "FISHING JETTY", 23.2, 1.75, 9.31, 2.1, 0.4, "#2f5560");
    // Water is closed to walking except along the jetty.
    this.obstacle(28.5, 9.1, 9, 1.7);
    this.obstacle(28.5, 12.9, 9, 1.7);
    this.obstacle(30.75, 11, 4.5, 2.2);
  }
  private buildPlayground() {
    box(this.root, 11, 0.18, 10, 11, 0.18, 7, "#b7b9a0");
    box(this.root, 11, 0.28, 10, 10.6, 0.04, 6.6, "#d8c292");
    const placeholder = new T.Group();
    placeholder.position.set(11, 0.3, 10);
    this.root.add(placeholder);
    this.obstacle(11, 10, 6, 4, 3.5);
    this.obstacle(7.6, 10, 1.4, 2.6, 2.8);
    // The authored Blender mesh is optional; the procedural shape keeps the scene usable if it fails to load.
    for (let i = 0; i < 5; i++) {
      const a = i * 0.5;
      box(
        placeholder,
        -1.5 + i * 0.7,
        0.5 + Math.sin(a) * 0.6,
        0,
        0.8,
        1,
        0.8,
        "#d99267",
      );
    }
    box(placeholder, -1.7, 1.8, 0, 1, 1.2, 1, "#d99267");
    sphere(placeholder, -1.7, 2.2, 0.54, 0.13, "#f5eee0");
    new GLTFLoader().load(
      "/models/dragon-playground.glb",
      (gltf) => {
        batchStatic(gltf.scene);
        placeholder.clear();
        placeholder.add(gltf.scene);
        gltf.scene.traverse((o) => {
          if (o instanceof T.Mesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
      },
      undefined,
      () => {},
    );
    placeholder.userData.id = "playground";
    this.targets.push({ mesh: placeholder, id: "playground" });
    sign(
      this.root,
      "DRAGON ROOFTOP",
      11,
      1,
      13.45,
      5,
      0.65,
      "#947b60",
      "#f9e4b8",
      27,
    );
  }
  private buildCat() {
    const g = new T.Group();
    g.position.set(-9, 0.2, 6);
    this.root.add(g);
    sphere(g, 0, 0.3, 0, 0.32, "#d39460");
    sphere(g, 0, 0.64, 0.15, 0.27, "#dba16d");
    const e1 = new T.Mesh(
      new T.ConeGeometry(0.13, 0.28, 3),
      material("#cd875a"),
    );
    e1.position.set(-0.17, 0.94, 0.14);
    g.add(e1);
    const e2 = e1.clone();
    e2.position.x = 0.17;
    g.add(e2);
    box(g, -0.1, 0.68, 0.39, 0.045, 0.075, 0.02, "#3d443d");
    box(g, 0.1, 0.68, 0.39, 0.045, 0.075, 0.02, "#3d443d");
    box(g, 0, 0.58, 0.41, 0.055, 0.045, 0.02, "#af685a");
    const tail = new T.Mesh(
      new T.TorusGeometry(0.28, 0.08, 6, 12, Math.PI * 1.45),
      material("#d39460"),
    );
    tail.position.set(0.23, 0.28, -0.21);
    tail.rotation.x = Math.PI / 2;
    g.add(tail);
    g.userData.id = "cat";
    this.targets.push({ mesh: g, id: "cat" });
    return g;
  }
  private addHitAreas() {
    for (const s of spots) {
      const hit = new T.Mesh(
        new T.BoxGeometry(
          s.id === "arcade" ? 18 : 4,
          4,
          s.id === "arcade" ? 4 : 3,
        ),
        new T.MeshBasicMaterial({ visible: false }),
      );
      hit.position.set(s.x, 2, s.z);
      hit.userData.id = s.id;
      this.root.add(hit);
      this.targets.push({ mesh: hit, id: s.id });
    }
  }
  updateAvatar(look: Look = this.save) {
    if (
      [
        "outfit",
        "skin",
        "body",
        "hair",
        "baseHair",
        "clothing",
        "hat",
        "pet",
        "accessory",
      ].some(
        (key) =>
          (this.player.look[key as keyof Look] ?? 0) !==
          (look[key as keyof Look] ?? 0),
      )
    ) {
      applyLook(this.player, look);
      this.revealAt = this.clock;
      this.revealYaw = this.player.root.rotation.y;
    }
    const occupied = new Set([
      look.hair ?? 0,
      ...[...this.sharedPlayers.values()].map((p) => p.avatar.look.hair ?? 0),
    ]);
    for (const resident of this.neighbours) {
      const other = resident.avatar.look;
      const hair = distinctHair(other.hair ?? 0, occupied);
      occupied.add(hair);
      if (hair !== other.hair)
        applyLook(resident.avatar, { ...other, hair, baseHair: hair });
    }
  }
  syncPlayers(
    players: SharedPlayer[],
    me: string,
    liveIds = new Set<string>(),
  ) {
    const ids = new Set(players.map((p) => p.id));
    for (const [id, item] of this.sharedPlayers)
      if (!ids.has(id)) {
        disposeAvatar(item.avatar);
        this.targets = this.targets.filter(
          (target) => target.id !== `player:${id}`,
        );
        this.sharedPlayers.delete(id);
      }
    for (const p of players) {
      if (p.id === me) continue;
      const look = JSON.stringify(p.look);
      let item = this.sharedPlayers.get(p.id);
      if (item && item.look !== look) {
        applyLook(item.avatar, p.look);
        item.look = look;
      }
      if (!item) {
        const a = avatar(
          this.root,
          p.x,
          p.z,
          outfits[p.look.outfit] || outfits[0],
          skins[p.look.skin] || skins[0],
          p.look.hat,
          p.look,
        );
        a.root.userData.id = `player:${p.id}`;
        this.targets.push({ mesh: a.root, id: a.root.userData.id });
        const label = sign(
          a.root,
          p.name,
          0,
          2.3,
          0,
          1.2,
          0.18,
          "#354c43",
          "#fff5d8",
          24,
        );
        label.userData.playerLabel = true;
        label.userData.avatarDecoration = true;
        const simple = new T.Group();
        const body = new T.Mesh(
          new T.CylinderGeometry(0.24, 0.3, 0.9, 5),
          new T.MeshBasicMaterial({
            color: outfits[p.look.outfit] || outfits[0],
          }),
        );
        body.position.y = 0.75;
        const head = new T.Mesh(
          new T.SphereGeometry(0.23, 6, 4),
          new T.MeshBasicMaterial({ color: skins[p.look.skin] || skins[0] }),
        );
        head.position.y = 1.45;
        body.userData.avatarDecoration = true;
        head.userData.avatarDecoration = true;
        simple.add(body, head);
        simple.visible = false;
        a.root.add(simple);
        item = {
          data: p,
          avatar: a,
          look,
          buffer: new MovementBuffer(),
          live: false,
          simple,
        };
        this.sharedPlayers.set(p.id, item);
      }
      if (item.data.name !== p.name) {
        const label = item.avatar.root.children.find(
          (c) => c.userData.playerLabel,
        ) as T.Mesh<T.PlaneGeometry, T.MeshBasicMaterial> | undefined;
        if (label) {
          const canvas = label.material.map!.image as HTMLCanvasElement;
          const ctx = canvas.getContext("2d")!;
          ctx.fillStyle = "#354c43";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#fff5d8";
          ctx.fillText(p.name, 512, canvas.height / 2, 970);
          label.material.map!.needsUpdate = true;
        }
      }
      item.data = p;
      item.live = liveIds.has(p.id);
      if (item.live) item.buffer.push(p, performance.now());
    }
    this.updateAvatar(this.player.look);
    this.renderer.domElement.dataset.sharedPlayers = String(
      this.sharedPlayers.size,
    );
  }
  private buildNeighbours() {
    const occupied = new Set([this.save.hair]);
    for (const [index, r] of residents.entries()) {
      const look = seededLook(r.id);
      look.hair = distinctHair(look.hair, occupied);
      occupied.add(look.hair);
      const a = avatar(
        this.root,
        0,
        0,
        outfits[look.outfit],
        skins[look.skin],
        0,
        {
          ...look,
          pet: index === 0 ? 2 : index === 3 ? 1 : 0,
          accessory: index === 2 ? 2 : index === 1 ? 1 : 0,
        },
      );

      a.root.userData.id = `resident:${r.id}`;
      this.targets.push({ mesh: a.root, id: a.root.userData.id });
      this.neighbours.push({
        id: r.id,
        avatar: a,
        activity: r.activity,
        offset: index * 2.7,
        path: [],
        stopUntil: 3 + index * 1.2,
        destination: index,
      });
      this.applyActivity(a, r.activity, index * 2.7);
      const label = sign(
        a.root,
        r.name,
        0,
        2.45,
        0,
        1.25,
        0.18,
        "#4e655c",
        "#fff5d8",
        24,
      );
      label.userData.playerLabel = true;
      label.userData.avatarDecoration = true;
      label.material.transparent = true;
    }
  }
  private applyActivity(a: Avatar, id: ActivityId, time: number) {
    const p = activityPose(id, this.reduced ? 0 : time);
    if (a === this.player) {
      if (id === "rest") p.x += 0.85;
      if (id === "dance") {
        p.x += 1.9;
        p.z += 0.6;
      }
      if (id === "arcade") p.x -= 4.2;
    }
    a.root.position.set(p.x, p.y, p.z);
    a.root.rotation.set(0, p.yaw, 0);
    a.legs[0].rotation.x = p.sit ? -1.35 : p.gait;
    a.legs[1].rotation.x = p.sit ? -1.35 : -p.gait;
    a.left.rotation.set(id === "arcade" ? -0.8 : -p.gait * 0.7, 0, p.arms);
    a.right.rotation.set(id === "arcade" ? -0.8 : p.gait * 0.7, 0, -p.arms);
  }
  private buildLiveliness() {
    for (const [x, z] of [
      [-18, 8],
      [-8, 8],
    ])
      box(this.root, x, 0.16, z, 0.8, 0.035, 10, "#d6c2a1");
    for (const z of [3, 13])
      box(this.root, -13, 0.16, z, 10, 0.035, 0.8, "#d6c2a1");
    sign(
      this.root,
      "THE SLOW LANE  ↻",
      -13,
      0.19,
      3,
      4,
      0.5,
      "#d6c2a1",
      "#7f8a67",
      24,
    ).rotation.x = -Math.PI / 2;
    for (let i = 0; i < 6; i++) {
      const x = 5 + i * 1.7,
        z = 5.5;
      const flag = new T.Mesh(
        new T.ConeGeometry(0.24, 0.55, 3),
        material(["#e58e82", "#b8d184", "#a999cf"][i % 3]),
      );
      flag.rotation.z = Math.PI;
      flag.position.set(x, 3.5 + Math.sin(i * 0.65) * 0.4, z);
      this.root.add(flag);
    }
    for (const x of [4.6, 14]) {
      this.obstacle(x, 5.5, 0.09, 0.09, 3.8);
      cylinder(this.root, x, 1.9, 5.5, 0.045, 3.8, "#72948a");
    }
    for (const [x, z] of [
      [-6, 6],
      [7, 13],
      [17, -1],
    ]) {
      box(this.root, x, 0.35, z, 1.6, 0.55, 0.7, "#b18c72");
      this.obstacle(x, z, 1.6, 0.7, 0.8);
      for (let i = 0; i < 7; i++) {
        cylinder(
          this.root,
          x - 0.6 + i * 0.19,
          0.85,
          z,
          0.023,
          0.7,
          "#709564",
          5,
        );
        sphere(
          this.root,
          x - 0.6 + i * 0.19,
          1.15 + (i % 2) * 0.13,
          z,
          0.15,
          ["#f2c778", "#d993a7", "#acbde0"][i % 3],
        );
      }
    }
    sign(
      this.root,
      "HELLO, NEIGHBOUR!",
      6,
      2.2,
      6,
      3,
      0.55,
      "#668f80",
      "#fff0c6",
      28,
    );
    for (let i = 0; i < 3; i++) {
      const g = new T.Group();
      sphere(g, 0, 0.17, 0, 0.17, "#7e98a1");
      sphere(g, 0, 0.31, 0.14, 0.1, "#9cafb0");
      box(g, 0, 0.3, 0.24, 0.06, 0.035, 0.08, "#dca874");
      g.position.set(3 + i * 0.6, 0.13, 7);
      g.userData.originX = 3 + i * 0.6;
      g.userData.phase = i * 2;
      this.root.add(g);
      this.birds.push(g);
    }
  }
  private interactionEvent(
    phase: string,
    spec?: InteractionSpec,
    message = "",
  ) {
    this.renderer.domElement.dataset.interaction = spec?.id || "";
    this.renderer.domElement.dataset.interactionState = phase;
    window.dispatchEvent(
      new CustomEvent("world-interaction", {
        detail: { phase, id: spec?.id, title: spec?.title, message },
      }),
    );
  }
  async interact(id: string, immediate = false) {
    const spec = interactionSpecs.find((s) => s.id === id);
    if (!spec) return;
    this.cancelInteraction();
    if (this.inspectedId) this.endInspection();
    if (this.save.away) {
      this.save.awaySince = 0;
      this.setAway(false);
    }
    const token = ++this.interactionToken;
    this.interactionId = id;
    this.interactionEvent("loading", spec);
    await this.interactions.ready;
    if (token !== this.interactionToken || !this.running) return;
    if (!this.interactions.stages.has(id)) {
      this.interactionId = "";
      this.interactionEvent(
        "error",
        spec,
        "This animation could not load. Refresh to try again.",
      );
      return;
    }
    if (
      immediate ||
      Math.hypot(
        this.player.root.position.x - spec.approach[0],
        this.player.root.position.z - spec.approach[1],
      ) < 1.6
    ) {
      this.player.root.position.set(spec.approach[0], 0.1, spec.approach[1]);
      this.elevation = 0.1;
      this.motion.reset();
      this.beginInteraction(id);
      return;
    }
    this.interactionEvent("walking", spec);
    this.walkTo(...spec.approach, `perform:${id}`);
    if (!this.path.length && !this.interactions.active && this.interactionId) {
      this.interactionId = "";
      this.interactionEvent(
        "error",
        spec,
        "Move into the open path and try again.",
      );
    }
  }
  private beginInteraction(id: string) {
    if (id !== this.interactionId) return;
    const spec = interactionSpecs.find((s) => s.id === id)!;
    if (!this.interactions.start(id)) return;
    this.player.root.getObjectByName("PlayerGroundRing")!.visible = false;
    this.path = [];
    this.pending = "";
    this.marker.visible = false;
    this.keys.clear();
    this.joystick = { x: 0, y: 0 };
    this.interactionCamera = {
      mode: this.cameraMode,
      angle: this.angle,
      pitch: this.pitch,
      distance: this.followDistance,
    };
    this.cameraMode = "third";
    this.angle = spec.view;
    this.pitch = ["dragon", "pet", "bench"].includes(spec.kind) ? 0.4 : 0.24;
    this.followDistance = spec.distance;
    this.interactions.sample(0, this.player);
    this.updateCamera();
    this.interactionEvent("playing", spec);
  }
  cancelInteraction(completed = false) {
    this.interactionToken++;
    if (!this.interactionId) return;
    const spec = interactionSpecs.find((s) => s.id === this.interactionId)!;
    const wasPlaying = !!this.interactions.active;
    this.interactionRegistered = false;
    this.interactions.stop();
    this.interactionId = "";
    this.path = [];
    this.pending = "";
    this.marker.visible = false;
    if (wasPlaying) {
      this.player.root.getObjectByName("PlayerGroundRing")!.visible = true;
      const point = completed ? spec.exit : spec.approach;
      this.player.root.position.set(point[0], 0.1, point[1]);
      this.player.root.rotation.set(0, spec.yaw, 0);
      for (const limb of [
        this.player.left,
        this.player.right,
        ...this.player.legs,
      ])
        limb.rotation.set(0, 0, 0);
    }
    if (this.interactionCamera) {
      this.cameraMode = this.interactionCamera.mode;
      this.angle = this.interactionCamera.angle;
      this.pitch = this.interactionCamera.pitch;
      this.followDistance = this.interactionCamera.distance;
      this.interactionCamera = null;
    }
    this.renderer.domElement.dataset.interactionTime = "0";
    this.updateCamera();
    this.interactionEvent(completed ? "complete" : "idle", spec);
    if (completed && spec.game) this.onInteract(spec.game);
  }
  setAway(value: boolean) {
    this.cancelInteraction();
    if (value && !this.beforeAway)
      this.beforeAway = this.player.root.position.clone();
    this.save.away = value;
    this.path = [];
    this.pending = "";
    this.keys.clear();
    this.joystick = { x: 0, y: 0 };
    this.marker.visible = false;
    if (!value) {
      this.player.root.position.copy(
        this.beforeAway || new T.Vector3(0, 0.1, 10),
      );
      this.beforeAway = null;
      this.elevation = this.player.root.position.y;
      this.jumpVelocity = 0;
      this.padFlight = null;
      this.afterPadFlight = null;
      this.motion.reset();
      this.player.legs.forEach((l) => (l.rotation.x = 0));
      this.inspectedId = "";
    }
    this.updateCamera();
  }
  setCameraMode(mode: "isometric" | "third") {
    this.cancelInteraction();
    this.cameraMode = mode;
    this.save.cameraMode = mode;
    this.inspectedId = "";
    if (mode === "third") {
      this.angle = this.player.root.rotation.y + Math.PI;
      this.followDistance = 7;
      this.pitch = 0.34;
    } else {
      this.home.set(0, 0, -1);
      this.angle = 0.63;
    }
    this.updateCamera();
  }
  inspectResident(id: string) {
    this.cancelInteraction();
    const remote = this.sharedPlayers.get(id.replace("player:", ""));
    const r = remote
      ? { avatar: remote.avatar, activity: remote.data.activity }
      : this.neighbours.find((r) => r.id === id);
    if (!r) return;
    this.path = [];
    this.pending = "";
    this.marker.visible = false;
    this.keys.clear();
    this.joystick = { x: 0, y: 0 };
    this.inspectedId = id;
    this.cameraMode = "third";
    this.followDistance = r.activity === "dragon" ? 5.8 : 4.5;
    this.pitch = r.activity === "dragon" ? 0.5 : 0.18;
    this.angle =
      r.activity === "dragon"
        ? 0.35
        : r.activity === "arcade"
          ? 0.6
          : r.avatar.root.rotation.y + 0.2;
    this.updateCamera();
  }
  endInspection() {
    this.inspectedId = "";
    this.setCameraMode(this.save.cameraMode);
  }
  setLighting(mode: string) {
    const hour = new Date().getHours();
    const night =
      mode === "night" || (mode === "auto" && (hour >= 19 || hour < 7));
    const day = mode === "day" || (mode === "auto" && hour >= 7 && hour < 17);
    this.ambient.intensity = night ? 1.3 : day ? 3 : 2.6;
    this.sun.intensity = night ? 0.6 : day ? 3.4 : 3.3;
    this.sun.color.set(night ? "#a5b8ff" : day ? "#fff0d4" : "#ffd0a1");
    this.scene.fog = new T.Fog(
      night ? "#4c617b" : day ? "#bcced0" : "#bbb7c1",
      65,
      125,
    );
    this.renderer.setClearColor(
      night ? "#78859c" : day ? "#cadbd9" : "#c6bdc7",
    );
    for (const lamp of this.lamps)
      (lamp.material as T.MeshStandardMaterial).emissiveIntensity = day
        ? 0.05
        : 1.1;
  }
  private resize() {
    const w = this.host.clientWidth,
      h = this.host.clientHeight;
    if (!w || !h) return;
    this.mobile =
      matchMedia("(pointer: coarse)").matches || Math.min(w, h) < 600;
    resizeRenderer(this.renderer, w, h);
    this.updateCamera();
  }
  private updateCamera() {
    const ratio = this.host.clientWidth / this.host.clientHeight;
    for (const child of this.player.root.children) {
      if (child.userData.avatarDecoration)
        child.visible = this.cameraMode !== "third" || this.followDistance > 3;
    }
    if (this.cameraMode === "third") {
      this.camera = this.followCamera;
      const subject =
        this.sharedPlayers.get(this.inspectedId.replace("player:", ""))
          ?.avatar ||
        this.neighbours.find((n) => n.id === this.inspectedId)?.avatar ||
        this.player;
      const focus = subject.root.position
        .clone()
        .add(new T.Vector3(0, this.followDistance < 3 ? 1.05 : 1.2, 0));
      const offset = new T.Vector3(
        Math.sin(this.angle) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        Math.cos(this.angle) * Math.cos(this.pitch),
      );
      this.followCamera.fov = this.mobile ? 60 : 52;
      // Keep the chosen orbit fixed: switching among obstruction candidates
      // makes walking shake. Foreground props retain their solid silhouettes.
      this.followCamera.position
        .copy(focus)
        .addScaledVector(offset, this.followDistance);
      this.followCamera.position.y = Math.max(
        0.35,
        this.followCamera.position.y,
      );
      this.followCamera.aspect = ratio;
      this.followCamera.lookAt(
        focus
          .clone()
          .add(
            new T.Vector3(
              0,
              this.mobile
                ? this.followDistance < 3
                  ? 0
                  : this.inspectedId
                    ? -0.65
                    : firstRoundGoalPending(this.save)
                      ? 0.8
                      : 0
                : 0,
              0,
            ),
          ),
      );
      this.followCamera.updateProjectionMatrix();
      this.renderer.domElement.dataset.camera = "third";
      this.renderer.domElement.dataset.zoom = this.followDistance.toFixed(2);
      this.renderer.domElement.dataset.inspect = this.inspectedId;
      this.renderer.domElement.dataset.orbit = `${this.angle.toFixed(2)},${this.pitch.toFixed(2)}`;
      return;
    }
    this.camera = this.mapCamera;
    const span = (this.mobile ? 33 : 36) / this.zoom;
    this.camera.left = (-span * ratio) / 2;
    this.camera.right = (span * ratio) / 2;
    this.camera.top = span / 2;
    this.camera.bottom = -span / 2;
    this.camera.near = 0.1;
    this.camera.far = 200;
    this.camera.position.set(
      this.home.x + Math.sin(this.angle) * 40,
      35,
      this.home.z + Math.cos(this.angle) * 40,
    );
    this.camera.lookAt(this.home);
    this.camera.updateProjectionMatrix();
    this.renderer.domElement.dataset.camera = "isometric";
    this.renderer.domElement.dataset.zoom = this.zoom.toFixed(2);
    this.renderer.domElement.dataset.inspect = "";
  }
  rotate(amount: number) {
    this.angle += amount;
    this.updateCamera();
  }
  setZoom(delta: number) {
    if (this.cameraMode === "third")
      this.followDistance = T.MathUtils.clamp(
        this.followDistance - delta * 4,
        innerWidth > innerHeight ? 3.6 : 3.2,
        16,
      );
    else this.zoom = T.MathUtils.clamp(this.zoom + delta, 0.7, 12);
    this.updateCamera();
  }
  /** Walks to a spot. False when there is no way to get there. */
  goRooftop(id: string) {
    const roof = rooftops.find((r) => r.id === id);
    return roof ? this.walkTo(roof.pad[0], roof.pad[1]) : false;
  }
  go(id: string) {
    this.cancelInteraction();
    if (this.save.away) return false;
    const spot = spots.find((s) => s.id === id);
    return !!spot && this.walkTo(spot.approach[0], spot.approach[1], id);
  }
  /** Landing on a spot the player chose counts as visiting it. */
  private arrive(id: string) {
    if (spots.some((s) => s.id === id)) this.onVisit(id);
    this.onInteract(id);
  }
  private interactionRegistered = false;
  walkTo(x: number, z: number, pending = "") {
    this.phoneOverview = false;
    if (this.save.away || this.inspectedId) return false;
    const start = this.player.root.position;
    const roof = rooftops.find(
      (r) =>
        this.elevation >= r.y &&
        Math.abs(start.x - r.x) < r.w / 2 &&
        Math.abs(start.z - r.z) < r.d / 2,
    );
    if (roof) {
      // Return along the pad's clear arc before routing on the ground. A
      // straight ground route from a roof would descend inside its building.
      this.path = [];
      this.pending = "";
      this.jumpVelocity = 0;
      this.afterPadFlight = { x, z, pending };
      this.padFlight = {
        from: start.clone(),
        to: new T.Vector3(roof.pad[0], 0.1, roof.pad[1]),
        time: 0,
      };
      this.burstStars(start);
      window.dispatchEvent(
        new CustomEvent("world-jump", { detail: { pad: true } }),
      );
      return true;
    }
    this.path = route(start, { x, z }, this.obstacles);
    this.pending = pending;
    if (this.path.length) {
      const end = this.path[this.path.length - 1];
      this.marker.position.set(end.x, 0.16, end.z);
      this.marker.visible = true;
      return true;
    }
    this.pending = "";
    if (
      Math.hypot(
        this.player.root.position.x - x,
        this.player.root.position.z - z,
      ) < 1.6
    ) {
      if (pending) this.arrive(pending);
      return true;
    }
    return false;
  }
  private pointerDown = (e: PointerEvent) => {
    if (this.paused || e.button !== 0) return;
    this.host.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 1) {
      this.dragStart = { x: e.clientX, y: e.clientY };
      this.dragged = false;
    } else {
      this.dragged = true;
      const a = [...this.pointers.values()];
      this.pinchDistance = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
    }
  };
  private pointerMove = (e: PointerEvent) => {
    const previous = this.pointers.get(e.pointerId);
    if (!previous || this.paused) return;
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size > 1) {
      const a = [...this.pointers.values()],
        distance = Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
      this.setZoom((distance - this.pinchDistance) * 0.006);
      this.pinchDistance = distance;
      return;
    }
    if (
      Math.hypot(e.clientX - this.dragStart.x, e.clientY - this.dragStart.y) > 5
    )
      this.dragged = true;
    if (this.dragged && this.cameraMode === "third") {
      this.angle -= (e.clientX - previous.x) * 0.006;
      this.pitch = T.MathUtils.clamp(
        this.pitch + (e.clientY - previous.y) * 0.004,
        -0.06,
        1.1,
      );
      this.updateCamera();
    }
  };
  private pointerUp = (e: PointerEvent) => {
    const had = this.pointers.has(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (had && !this.dragged && !this.pointers.size) this.pointer(e);
  };
  private pointerCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.dragged = true;
  };
  private wheel = (e: WheelEvent) => {
    if (this.paused) return;
    e.preventDefault();
    this.setZoom(-Math.sign(e.deltaY) * 0.13);
  };
  private pointer = (e: PointerEvent) => {
    if (this.paused || e.button !== 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.ray.setFromCamera(
      new T.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const intersections = this.ray.intersectObjects(
      this.targets.map((t) => t.mesh),
      true,
    );
    const visibleHits = intersections.filter((h) => {
      let owner: T.Object3D | null = h.object;
      while (owner && !owner.userData.avatar) owner = owner.parent;
      if (owner) {
        const avatar = owner.userData.avatar as Avatar;
        let part: T.Object3D | null = h.object;
        while (part && part !== avatar.model && !part.userData.playerLabel)
          part = part.parent;
        if (!part) return false;
      }
      let p: T.Object3D | null = h.object;
      while (p) {
        if (!p.visible) return false;
        p = p.parent;
      }
      return true;
    });
    // Broad invisible location boxes are fallbacks. A visible cabinet or prop
    // under the same pointer should get the interaction, even behind that box.
    const hit =
      visibleHits.find(({ object }) => {
        if (!(object instanceof T.Mesh)) return true;
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        return materials.some((material) => material.visible);
      }) ?? visibleHits[0];
    if (hit) {
      let obj: T.Object3D | null = hit.object;
      while (obj && !obj.userData.id) obj = obj.parent;
      const id = obj?.userData.id;
      if (id) {
        if (id.startsWith("action:")) {
          void this.interact(id.slice(7));
          return;
        }
        if (id === "playground") {
          void this.interact("dragon");
          return;
        }
        if (id === "cat") {
          void this.interact("pet");
          return;
        }
        const spot = spots.find((s) => s.id === id);
        if (spot) {
          this.go(id);
          return;
        }
        if (id.startsWith("coin")) {
          const c = this.coins.find((c) => c.userData.id === id)!;
          this.walkTo(c.position.x, c.position.z);
          return;
        }
        if (gameIds.includes(id)) {
          void this.interact(`cabinet-${id}`);
          return;
        }
        if (id.startsWith("dare")) {
          this.walkTo(0, 4, id);
          return;
        }
        if (id === "ball") {
          this.ballVelocity.set(3, 0, -4);
          return;
        }
        this.onInteract(id);
        return;
      }
    }
    if (this.interactionId) return;
    if (this.ray.ray.intersectPlane(this.ground, this.targetPoint))
      this.walkTo(this.targetPoint.x, this.targetPoint.z);
  };
  private keyDown = (e: KeyboardEvent) => {
    if (this.paused || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (this.interactionId && k === "e") return;
    if (
      this.interactionId &&
      [
        "escape",
        "w",
        "a",
        "s",
        "d",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ].includes(k)
    )
      this.cancelInteraction();
    if (this.save.away || this.inspectedId) return;
    if (
      [
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
        "w",
        "a",
        "s",
        "d",
        " ",
        "e",
      ].includes(k)
    ) {
      e.preventDefault();
      this.keys.add(k);
      if (
        !e.repeat &&
        [
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
        ].includes(k)
      )
        this.movementInput.press(k);
      if (k === "e" && !e.repeat && this.near) this.onInteract(this.near);
      if (isJumpKey(k) && !e.repeat) this.act("jump");
    }
  };
  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
  private clearKeys = () => {
    this.keys.clear();
    this.movementInput.clear();
    this.joystick = { x: 0, y: 0 };
  };
  private visibility = () => {
    this.clearKeys();
    this.last = 0;
  };
  act(id: string) {
    if (id === "jump") {
      if (
        this.paused ||
        this.save.away ||
        this.inspectedId ||
        this.interactionId
      )
        return;
      this.jumpInput.press();
      return;
    }
    this.emote = id;
    this.emoteAt = this.clock;
  }
  placePlayer(x: number, z: number) {
    this.cancelInteraction();
    this.path = [];
    if (blocked(x, z, this.obstacles)) {
      const free = route({ x: 2, z: 5 }, { x, z }, this.obstacles);
      const safe = free.at(-1);
      x = safe?.x ?? 2;
      z = safe?.z ?? 5;
    }
    this.player.root.position.set(x, 0.1, z);
    this.elevation = 0.1;
    this.jumpVelocity = 0;
    this.motion.reset();
  }
  resetView() {
    this.cancelInteraction();
    this.inspectedId = "";
    this.angle = this.cameraMode === "third" ? 0 : 0.63;
    this.zoom = 1;
    this.followDistance = 7;
    this.pitch = 0.34;
    this.home.set(0, 0, -1);
    this.updateCamera();
  }
  private animate = (now: number) => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.animate);
    if (document.hidden) {
      this.last = 0;
      return;
    }
    if (this.paused) {
      this.last = now;
      return;
    }
    const elapsed = this.last ? (now - this.last) / 1000 : 0.016;
    const dt = Math.min(elapsed, 0.1);
    this.last = now;
    this.clock += dt;
    if (
      Math.floor(this.clock) % 60 === 0 &&
      this.roofStarDay !== singaporeDay()
    ) {
      this.roofStarDay = singaporeDay();
      for (const star of this.roofStars)
        star.visible =
          this.save.roofDay !== this.roofStarDay ||
          !this.save.roofStars.includes(star.userData.roof);
    }
    if (!this.paused) {
      if (this.interactions.active) {
        this.motion.reset();
        const finished = this.interactions.sample(dt, this.player);
        if (
          this.interactionId === "pet" &&
          !this.interactionRegistered &&
          this.interactions.elapsed >= 2
        ) {
          this.interactionRegistered = true;
          this.interactionEvent(
            "registered",
            interactionSpecs.find((s) => s.id === "pet")!,
          );
        }
        this.renderer.domElement.dataset.interactionTime =
          this.interactions.elapsed.toFixed(2);
        const duration = this.interactions.active.clip.duration;
        window.dispatchEvent(
          new CustomEvent("world-interaction-progress", {
            detail: this.interactions.elapsed / duration,
          }),
        );
        if (finished) this.cancelInteraction(true);
      } else if (this.save.away) {
        this.motion.reset();
        this.applyActivity(
          this.player,
          this.save.awayActivity,
          (Date.now() - this.save.awaySince) / 1000,
        );
      } else if (!this.inspectedId) {
        if (!this.padFlight)
          this.motion.sample(this.player.root.position, dt, (step) =>
            this.move(step),
          );
        this.animatePlayer();
        this.jumpStep(dt);
      }
      const remotes = [...this.sharedPlayers.values()].sort(
        (a, b) =>
          a.avatar.root.position.distanceToSquared(this.player.root.position) -
          b.avatar.root.position.distanceToSquared(this.player.root.position),
      );
      for (const [index, item] of remotes.entries()) {
        const { data: p, avatar: a } = item;
        const detailed = !this.mobile || index < 15;
        for (const child of a.root.children) {
          if (child === item.simple || child.userData.playerLabel) continue;
          if (!detailed && child.userData.worldVisible === undefined)
            child.userData.worldVisible = child.visible;
          if (detailed && child.userData.worldVisible !== undefined) {
            child.visible = child.userData.worldVisible;
            delete child.userData.worldVisible;
          } else if (!detailed) child.visible = false;
        }
        item.simple.visible = !detailed;
        if (a.pet) a.pet.root.visible = detailed;
        if (!item.live || p.status !== "online") {
          a.root.position.set(p.x, 0.1, p.z);
          a.root.rotation.y = p.yaw;
        } else {
          const position = item.buffer.sample(performance.now()) || p;
          const distance = Math.hypot(
            position.x - a.root.position.x,
            position.z - a.root.position.z,
          );
          a.root.position.lerp(
            new T.Vector3(position.x, 0.1, position.z),
            Math.min(1, dt * 25),
          );
          a.root.rotation.y = position.yaw;
          const gait =
            distance > 0.005 && !this.reduced && detailed
              ? Math.sin(this.clock * 10) * 0.65
              : 0;
          a.legs[0].rotation.x = gait;
          a.legs[1].rotation.x = -gait;
          a.left.rotation.set(-gait * 0.6, 0, 0);
          a.right.rotation.set(gait * 0.6, 0, 0);
        }
        for (const child of a.root.children)
          if (child.userData.playerLabel)
            child.quaternion
              .copy(a.root.quaternion)
              .invert()
              .multiply(this.camera.quaternion);
      }
      const destinations = spots.filter((s) =>
        ["arcade", "shop", "board", "garden", "wardrobe"].includes(s.id),
      );
      for (const r of this.neighbours) {
        const a = r.avatar;
        if (!r.path.length && this.clock >= r.stopUntil) {
          const spot = destinations[r.destination++ % destinations.length];
          r.path = route(
            a.root.position,
            { x: spot.approach[0], z: spot.approach[1] },
            this.obstacles,
          );
          r.stopUntil = this.clock + 5 + (identitySeed(r.id) % 5);
        }
        const next = r.path[0];
        if (next) {
          const dx = next.x - a.root.position.x,
            dz = next.z - a.root.position.z,
            distance = Math.hypot(dx, dz);
          const step = Math.min(distance, dt * 1.1);
          if (distance < 0.08) r.path.shift();
          else {
            a.root.position.x += (dx / distance) * step;
            a.root.position.z += (dz / distance) * step;
            a.root.rotation.y = Math.atan2(dx, dz);
          }
          if (!r.path.length)
            r.stopUntil = this.clock + 5 + (identitySeed(r.id) % 5);
        }
        a.root.position.y = 0.1;
        const gait = r.path.length
          ? Math.sin(this.clock * 8 + r.offset) * 0.45
          : 0;
        a.legs[0].rotation.x = gait;
        a.legs[1].rotation.x = -gait;
        a.left.rotation.set(-gait * 0.6, 0, 0);
        a.right.rotation.set(gait * 0.6, 0, 0);
      }
      if (!this.reduced)
        this.birds.forEach((b, i) => {
          b.position.x =
            b.userData.originX + Math.sin(this.clock * 0.45 + i) * 0.8;
          b.rotation.y = Math.cos(this.clock * 0.45 + i) * 1.5;
          b.position.y =
            0.13 + Math.max(0, Math.sin(this.clock * 3 + i)) * 0.04;
        });
      if (!this.reduced) {
        for (const c of this.coins)
          if (c.visible) {
            c.rotation.y = this.clock * 1.5;
            c.position.y =
              0.85 + Math.sin(this.clock * 2 + c.position.x) * 0.12;
          }
        this.lanterns.forEach(
          (l, i) => (l.rotation.z = Math.sin(this.clock + i) * 0.03),
        );
      }
      this.ball.position.addScaledVector(this.ballVelocity, dt);
      this.ballVelocity.multiplyScalar(Math.exp(-dt * 1.4));
      if (blocked(this.ball.position.x, this.ball.position.z, []))
        this.ballVelocity.multiplyScalar(-1);
      this.ball.position.x = T.MathUtils.clamp(this.ball.position.x, -18, 18);
      this.ball.position.z = T.MathUtils.clamp(this.ball.position.z, -13, 13);
      const p = this.player.root.position;
      if (p.distanceTo(this.ball.position) < 0.9)
        this.ballVelocity
          .copy(this.ball.position)
          .sub(p)
          .setY(0)
          .normalize()
          .multiplyScalar(5);
    }
    if (this.mobile && this.cameraMode === "isometric") {
      this.home.x = T.MathUtils.lerp(
        this.home.x,
        this.player.root.position.x,
        1 - Math.exp(-1.52 * dt),
      );
      this.home.z = T.MathUtils.lerp(
        this.home.z,
        this.player.root.position.z,
        1 - Math.exp(-1.52 * dt),
      );
      this.updateCamera();
    } else if (this.cameraMode === "isometric") {
      // The desktop overview slides east with the player so East Side stays in frame.
      const x = T.MathUtils.clamp(this.player.root.position.x - 8, 0, 14);
      // The pond sits at the south edge, so lean south when the player is by it.
      const p = this.player.root.position;
      const z = p.x > 20 ? T.MathUtils.clamp(p.z - 5, -1, 5) : -1;
      if (Math.abs(x - this.home.x) + Math.abs(z - this.home.z) > 0.02) {
        this.home.x = T.MathUtils.lerp(
          this.home.x,
          x,
          1 - Math.exp(-3.71 * dt),
        );
        this.home.z = T.MathUtils.lerp(
          this.home.z,
          z,
          1 - Math.exp(-3.71 * dt),
        );
        this.updateCamera();
      }
    }
    const occupiedPositions = [this.player.root.position];
    const neighbours = [
      ...[...this.sharedPlayers.entries()].map(([id, item]) => ({
        id,
        avatar: item.avatar,
      })),
      ...this.neighbours,
    ];
    const labelPoints: T.Vector3[] = [];
    const sizeLabel = (label: T.Object3D) => {
      if (!(label instanceof T.Mesh)) return;
      const height = (label.geometry as T.PlaneGeometry).parameters.height;
      const distance = this.camera.position.distanceTo(
        label.getWorldPosition(new T.Vector3()),
      );
      const span =
        this.camera instanceof T.PerspectiveCamera
          ? 2 * distance * Math.tan(T.MathUtils.degToRad(this.camera.fov / 2))
          : this.mapCamera.top - this.mapCamera.bottom;
      label.scale.setScalar((17 * span) / this.host.clientHeight / height);
    };
    const you = this.player.root.getObjectByName("PlayerNameTag");
    if (you) sizeLabel(you);
    if (you)
      you.quaternion
        .copy(this.player.root.quaternion)
        .invert()
        .multiply(this.camera.quaternion);
    for (const [index, neighbour] of neighbours.entries()) {
      separateCharacter(
        neighbour.avatar.root.position,
        occupiedPositions,
        identitySeed(neighbour.id),
      );
      occupiedPositions.push(neighbour.avatar.root.position);
      for (const label of neighbour.avatar.root.children)
        if (label.userData.playerLabel) {
          sizeLabel(label);
          label.position.y = 2.45 + (index % 3) * 0.18;
          label.quaternion
            .copy(neighbour.avatar.root.quaternion)
            .invert()
            .multiply(this.camera.quaternion);
          const screen = neighbour.avatar.root.position
            .clone()
            .add(new T.Vector3(0, 2.45, 0))
            .project(this.camera);
          if (
            label instanceof T.Mesh &&
            label.material instanceof T.MeshBasicMaterial
          ) {
            label.material.transparent = true;
            label.material.opacity = labelPoints.some(
              (p) =>
                Math.abs(p.x - screen.x) < 0.15 &&
                Math.abs(p.y - screen.y) < 0.07,
            )
              ? 0.25
              : 0.9;
          }
          labelPoints.push(screen);
        }
    }
    for (const object of this.root.children) {
      const a = object.userData.avatar as Avatar | undefined;
      if (!a) continue;
      const remote = [...this.sharedPlayers.values()].find(
        (p) => p.avatar === a,
      );
      const resident = this.neighbours.find((p) => p.avatar === a);
      if (
        remote &&
        (!remote.live ||
          remote.simple.visible ||
          remote.data.status !== "online")
      )
        continue;
      const mode =
        a === this.player
          ? this.interactions.active?.spec.kind ||
            (this.save.away
              ? this.save.awayActivity
              : this.emote ||
                (Math.hypot(
                  a.root.position.x - a.last.x,
                  a.root.position.z - a.last.z,
                ) > 0.00001
                  ? "walk"
                  : "idle"))
          : remote?.data.emote ||
            (remote?.data.status !== "online"
              ? remote?.data.activity
              : undefined) ||
            (resident ? (resident.path.length ? "walk" : "idle") : undefined) ||
            "idle";
      const near =
        a === this.player ||
        a.root.position.distanceToSquared(this.camera.position) < 144;
      setAvatarDetail(a, near);
      animateDetails(a, this.clock, mode, this.reduced || !near);
    }
    // Finalize the character and skeleton before following that exact displayed pose.
    if (this.cameraMode === "third") this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    this.renderer.domElement.dataset.elevation =
      this.player.root.position.y.toFixed(2);
    this.renderer.domElement.dataset.position = `${this.player.root.position.x.toFixed(2)},${this.player.root.position.z.toFixed(2)}`;
    this.accumulator += elapsed;
    this.frames++;
    if (++this.monitor >= 120) {
      const fps = this.frames / this.accumulator;
      this.renderer.domElement.dataset.fps = fps.toFixed(1);
      this.renderer.domElement.dataset.drawCalls = String(
        this.renderer.info.render.calls,
      );
      this.monitor = 0;
      this.frames = 0;
      this.accumulator = 0;
    }
  };
  private movementObstacles() {
    return this.obstacles.filter(
      (o) =>
        !rooftops.some(
          (r) => this.elevation >= r.y && Math.hypot(o.x - r.x, o.z - r.z) < 5,
        ) &&
        (o.cameraHeight === 0 || this.elevation < o.cameraHeight),
    );
  }
  private move(dt: number) {
    const keys = this.movementInput.sample(this.keys, dt);
    const p = this.player.root.position;
    let dx = 0,
      dz = 0;
    const x =
      Number(keys.has("d") || keys.has("arrowright")) -
      Number(keys.has("a") || keys.has("arrowleft")) +
      this.joystick.x;
    const y =
      Number(keys.has("s") || keys.has("arrowdown")) -
      Number(keys.has("w") || keys.has("arrowup")) +
      this.joystick.y;
    if (x || y) {
      this.phoneOverview = false;
      this.path = [];
      this.pending = "";
      this.marker.visible = false;
      dx = x * Math.cos(this.angle) + y * Math.sin(this.angle);
      dz = -x * Math.sin(this.angle) + y * Math.cos(this.angle);
    } else if (this.path.length) {
      const t = this.path[0];
      dx = t.x - p.x;
      dz = t.z - p.z;
      if (Math.hypot(dx, dz) < 0.15) {
        p.x = t.x;
        p.z = t.z;
        this.path.shift();
        if (!this.path.length) {
          this.marker.visible = false;
          if (this.pending) {
            const id = this.pending;
            this.pending = "";
            this.arrive(id);
          }
        }
        return;
      }
    }
    const len = Math.hypot(dx, dz);
    if (len) {
      const speed = Math.min(dt * (this.path.length ? 6.8 : 4.8), len);
      dx = (dx / len) * speed;
      dz = (dz / len) * speed;
      const obstacles = this.movementObstacles();
      if (!blocked(p.x + dx, p.z, obstacles)) p.x += dx;
      if (!blocked(p.x, p.z + dz, obstacles)) p.z += dz;
      this.player.root.rotation.y = Math.atan2(dx, dz);
    }
    for (const c of this.coins)
      if (
        c.visible &&
        Math.hypot(p.x - c.position.x, p.z - c.position.z) < 0.8
      ) {
        c.visible = false;
        this.onCoin(c.userData.id);
      }
    let near = "";
    for (const s of spots)
      if (Math.hypot(p.x - s.approach[0], p.z - s.approach[1]) < 2.3) {
        near = s.id;
        if (visitsOnWalk(s.id, this.pending, spots)) this.onVisit(s.id);
      }
    const nearby = interactionSpecs
      .map((s) => ({
        s,
        d: Math.hypot(p.x - s.approach[0], p.z - s.approach[1]),
      }))
      .filter((n) => n.d < 2)
      .sort((a, b) => a.d - b.d)[0];
    if (nearby) near = `action:${nearby.s.id}`;
    if (near !== this.near) {
      this.near = near;
      this.onNear(
        nearby?.s.title || spots.find((s) => s.id === near)?.name || "",
        near,
      );
    }
  }
  private animatePlayer() {
    const p = this.player,
      t = this.clock - this.emoteAt;
    const active = this.emote && t < 2.5;
    p.root.position.y = 0.1;
    p.root.rotation.z = 0;
    const revealAge = this.clock - this.revealAt;
    if (revealAge < 1.25) {
      const turn = Math.atan2(
        Math.sin(this.angle - this.revealYaw),
        Math.cos(this.angle - this.revealYaw),
      );
      const progress = Math.min(1, revealAge / 0.3);
      p.root.rotation.y = this.revealYaw + turn * (1 - (1 - progress) ** 3);
    }
    p.left.rotation.set(0, 0, 0);
    p.right.rotation.set(0, 0, 0);
    p.legs.forEach((leg) => (leg.rotation.x = 0));
    if (!active) {
      this.emote = "";
      return;
    }
    if (this.emote === "jump")
      p.root.position.y =
        0.1 + Math.max(0, Math.sin(Math.min(t, 1) * Math.PI)) * 1.5;
    if (this.emote === "wave") {
      p.right.rotation.z = 2.1 + Math.sin(t * 10) * 0.25;
    }
    if (this.emote === "cheer" || this.emote === "victory") {
      p.left.rotation.z = -2.1;
      p.right.rotation.z = 2.1;
    }
    if (this.emote === "dance") {
      p.left.rotation.z = Math.sin(t * 8);
      p.right.rotation.z = Math.sin(t * 8);
      p.root.rotation.y += 0.055;
      if (!this.reduced) p.root.position.y += Math.abs(Math.sin(t * 7)) * 0.18;
    }
    if (this.emote === "think") {
      p.right.rotation.x = -1.5;
      p.root.rotation.z = 0.1;
    }
  }
  setReduced(value: boolean) {
    this.reduced = value;
  }
  dispose() {
    this.cancelInteraction();
    this.interactions.dispose();
    this.running = false;
    cancelAnimationFrame(this.frame);
    this.listener.disconnect();
    this.host.removeEventListener("pointerdown", this.pointerDown);
    this.host.removeEventListener("pointermove", this.pointerMove);
    this.host.removeEventListener("pointerup", this.pointerUp);
    this.host.removeEventListener("pointercancel", this.pointerCancel);
    this.host.removeEventListener("wheel", this.wheel);
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.clearKeys);
    document.removeEventListener("visibilitychange", this.visibility);
    // Remote labels and reduced-detail meshes belong to this world, while the
    // avatar's shared geometry remains available to the next lobby or preview.
    this.syncPlayers([], "");
    const avatars = new Set<Avatar>([this.player]);
    this.root.traverse((object) => {
      const a = object.userData.avatar as Avatar | undefined;
      if (a) avatars.add(a);
    });
    avatars.forEach(disposeAvatar);
    this.renderer.dispose();
  }
}
