import { resizeRenderer } from "./render-budget.ts";
import { seededLook, distinctHair } from "./character-identity.ts";
import * as T from "three";
import { KartSteering, KartWheel, KART_WHEEL_RADIUS } from "./kart-motion";
import { RaceCameraFollow } from "./race-camera";
import { raceTrackPose, type RaceMotion } from "./race-motion";
import {
  animateDetails,
  createAvatar,
  type Avatar,
  type Look,
} from "./character";
import { disposeMagic } from "./magic";
import { animatePet } from "./pets";
import { outfits, skins } from "./state";
import {
  boostPads,
  HARBOUR,
  RIVALS,
  itemCrates,
  pickups,
  RACE_DISTANCE,
  ROAD_HALF_WIDTH,
  SPIN_TICKS,
  TRACK_LENGTH,
  WALL,
  WAVE_RANGE,
  trackBounds,
  trackClearance,
  trackCurve,
  trackPoint,
  type CoastRace,
  type TurboTier,
} from "../shared/racing";

/** Who is in each of the other karts: a computer driver, or a player's avatar. */
export type RivalKart = { name: string; color: string; look: Look | null };
const TIER_SPARKS: Record<TurboTier, string> = {
  Mini: "#6cd7ff",
  Super: "#ffb347",
  Ultra: "#ff6fd8",
};
const SLIP = 0.42;
const HOP = 0.24;

/** A pool of short-lived instanced sprites: sparks, smoke and tyre marks. */
class Puffs {
  readonly mesh: T.InstancedMesh;
  private readonly items: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    life: number;
    span: number;
    size: number;
    yaw: number;
  }[];
  private next = 0;
  private readonly pose = new T.Object3D();
  private readonly colour = new T.Color();
  private readonly grow: number;
  private readonly gravity: number;
  constructor(
    scene: T.Scene,
    geometry: T.BufferGeometry,
    material: T.Material,
    count: number,
    grow: number,
    gravity: number,
  ) {
    this.grow = grow;
    this.gravity = gravity;
    this.mesh = new T.InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false;
    this.items = Array.from({ length: count }, () => ({
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      life: 0,
      span: 1,
      size: 0,
      yaw: 0,
    }));
    this.pose.scale.setScalar(0);
    this.pose.updateMatrix();
    for (let i = 0; i < count; i++) {
      this.mesh.setMatrixAt(i, this.pose.matrix);
      this.mesh.setColorAt(i, this.colour.set("#ffffff"));
    }
    scene.add(this.mesh);
  }
  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    span: number,
    size: number,
    colour: string,
    yaw = 0,
  ) {
    const i = this.next;
    this.next = (this.next + 1) % this.items.length;
    Object.assign(this.items[i], {
      x,
      y,
      z,
      vx,
      vy,
      vz,
      life: span,
      span,
      size,
      yaw,
    });
    this.mesh.setColorAt(i, this.colour.set(colour));
    this.mesh.instanceColor!.needsUpdate = true;
  }
  update(dt: number) {
    this.items.forEach((p, i) => {
      if (p.size === 0) return;
      p.life -= dt;
      p.vy -= this.gravity * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.16, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const age = 1 - Math.max(0, p.life) / p.span;
      // Smoke swells as it thins; sparks and tyre marks shrink away.
      const scale =
        p.life <= 0
          ? 0
          : p.size * (this.grow > 0 ? 1 + this.grow * age : 1 - age ** 4);
      if (p.life <= 0) p.size = 0;
      this.pose.position.set(p.x, p.y, p.z);
      this.pose.rotation.set(0, p.yaw, 0);
      this.pose.scale.setScalar(scale);
      this.pose.updateMatrix();
      this.mesh.setMatrixAt(i, this.pose.matrix);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Original Palm Bay scenery. The view never writes to the race simulation. */
export class RaceView {
  readonly scene = new T.Scene();
  readonly camera = new T.PerspectiveCamera(57, 1, 0.1, 600);
  readonly renderer: T.WebGLRenderer;
  readonly kart = new T.Group();
  readonly avatar: Avatar;
  private readonly geometries = new Set<T.BufferGeometry>();
  private readonly materials = new Map<string, T.MeshStandardMaterial>();
  private readonly textures: T.Texture[] = [];
  private readonly flats: T.Material[] = [];
  private readonly wheels: KartWheel[];
  private readonly wheel = new T.Group();
  private readonly steering = new KartSteering();
  private readonly rivals: {
    kart: T.Group;
    avatar: Avatar;
    wheels: KartWheel[];
    cloud: T.Mesh;
    bubble: T.Mesh;
    slip: number;
  }[] = [];
  private readonly missiles: { rocket: T.Group; crab: T.Group }[] = [];
  private readonly cloud: T.Mesh;
  private readonly rings: T.Mesh[] = [];
  private readonly sparks: Puffs;
  private readonly smoke: Puffs;
  private readonly skids: Puffs;
  /** The kart's slide angle, its hop when a drift starts, and where it last left a tyre mark. */
  private slip = 0;
  private hop = 0;
  private wasDrifting = false;
  private skidAt = 0;
  private puffClock = 0;
  private readonly coconuts: T.Mesh[] = [];
  private readonly trackItems: {
    group: T.Group;
    kind: string;
    index: number;
  }[] = [];
  private readonly shield: T.Mesh;
  private readonly flame: T.Mesh;
  private readonly sea: T.Mesh;
  private readonly observer: ResizeObserver;
  private readonly foam: T.InstancedMesh;
  private readonly cameraFollow = new RaceCameraFollow();
  private readonly nameLayer = document.createElement("div");
  private readonly nameplates: {
    kart: T.Group;
    element: HTMLElement;
    name: string;
    player: boolean;
    tag: string;
  }[] = [];
  private disposed = false;
  private readonly look: Look;
  private readonly reduced: boolean;
  constructor(
    host: HTMLElement,
    look: Look,
    reduced: boolean,
    playerName = "You",
  ) {
    this.look = look;
    this.reduced = reduced;
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Palm Bay circuit, with your saved avatar driving a kart",
    );
    this.renderer.domElement.tabIndex = 0;
    host.append(this.renderer.domElement);
    this.nameLayer.className = "race-nameplates";
    this.nameLayer.setAttribute("aria-hidden", "true");
    host.append(this.nameLayer);
    this.scene.background = new T.Color("#bcebf0");
    this.scene.fog = new T.Fog("#bcebf0", 145, 330);
    this.scene.add(new T.HemisphereLight("#f1fbff", "#659981", 2.6));
    const sun = new T.DirectionalLight("#fff0cd", 3.1);
    sun.position.set(-75, 110, 30);
    this.scene.add(sun);
    const ocean = this.mat("#159faa");
    ocean.roughness = 0.26;
    ocean.metalness = 0.25;
    this.sea = this.mesh(
      this.scene,
      this.geo(new T.PlaneGeometry(1000, 1000)),
      ocean,
      0,
      -0.5,
      0,
    );
    this.sea.rotation.x = -Math.PI / 2;
    this.buildTrack();
    this.buildIsland();
    // Repeated palms, rocks and ripples are instanced to keep phone draw calls low.
    this.buildPalms();
    this.foam = this.instances(
      this.geo(new T.PlaneGeometry(4, 0.13)),
      this.mat("#73d8d4"),
      120,
      (o, i) => {
        const a = i * 2.39996,
          radius = 110 + (i % 11) * 13;
        o.position.set(Math.cos(a) * radius, -0.46, Math.sin(a) * radius);
        o.rotation.set(-Math.PI / 2, 0, 0.15);
        o.scale.x = 1 + (i % 4) * 0.5;
      },
    );
    this.scene.add(this.kart);
    this.addNameplate(this.kart, playerName, true);
    this.wheels = this.buildKart(this.kart, outfits[look.outfit]);
    this.avatar = createAvatar(
      this.kart,
      0,
      -0.15,
      outfits[look.outfit],
      skins[look.skin],
      look.hat,
      look,
    );
    this.avatar.root.position.y = -0.14;
    this.avatar.root.scale.setScalar(0.94);
    // Companion travels in a sidecar; saved cosmetics are never changed.
    if (this.avatar.pet) {
      this.box(
        this.kart,
        1.12,
        0.3,
        -0.18,
        0.75,
        0.32,
        1.05,
        outfits[look.outfit],
      );
      this.box(this.kart, 0.8, 0.24, -0.18, 0.6, 0.12, 0.15, "#273b4c");
      const wheel = this.mesh(
        this.kart,
        this.geo(new T.CylinderGeometry(0.25, 0.25, 0.2, 12)),
        this.mat("#1d303c"),
        1.58,
        0.26,
        -0.18,
      );
      wheel.rotation.z = Math.PI / 2;
      this.avatar.pet.root.scale.multiplyScalar(0.54);
    }
    this.wheel.position.set(0, 0.95, -0.04);
    this.wheel.rotation.x = -0.55;
    this.kart.add(this.wheel);
    const column = this.mesh(
      this.kart,
      this.geo(new T.CylinderGeometry(0.045, 0.045, 0.41, 8)),
      this.mat("#607b85"),
      0,
      0.76,
      0.04,
    );
    column.rotation.x = -0.4;
    const ring = this.mesh(
      this.wheel,
      this.geo(new T.TorusGeometry(0.25, 0.035, 6, 18)),
      this.mat("#263c49"),
      0,
      0,
      0,
    );
    ring.rotation.x = 0;
    this.box(this.wheel, 0, 0, 0, 0.46, 0.04, 0.04, "#a7b9c2");
    for (const [name, x] of [
      ["Kart_grip_r", -0.22],
      ["Kart_grip_l", 0.22],
    ] as const) {
      const grip = new T.Object3D();
      grip.name = name;
      grip.position.x = x;
      this.wheel.add(grip);
    }
    this.flame = this.mesh(
      this.kart,
      this.geo(new T.ConeGeometry(0.2, 1, 7)),
      this.mat("#8dffff", 1.8),
      0,
      0.28,
      -1.35,
    );
    this.flame.rotation.x = -Math.PI / 2;
    this.flame.visible = false;
    this.shield = this.mesh(
      this.kart,
      this.geo(new T.SphereGeometry(1.6, 16, 10)),
      this.mat("#7ae9ed", 0.5),
      0,
      0.9,
      0,
    );
    const shieldMaterial = this.shield.material as T.MeshStandardMaterial;
    shieldMaterial.transparent = true;
    shieldMaterial.opacity = 0.22;
    shieldMaterial.depthWrite = false;
    this.cloud = this.stormCloud(this.kart);
    this.setRivals(
      RIVALS.map((r) => ({ name: r.name, color: r.color, look: null })),
    );
    for (let i = 0; i < 6; i++) {
      const missile = new T.Group();
      const body = this.mesh(
        missile,
        this.geo(new T.CylinderGeometry(0.2, 0.2, 1.1, 8)),
        this.mat("#f4f1e4"),
        0,
        0,
        0,
      );
      body.rotation.x = Math.PI / 2;
      const nose = this.mesh(
        missile,
        this.geo(new T.ConeGeometry(0.22, 0.5, 8)),
        this.mat("#f0624d", 0.5),
        0,
        0,
        0.8,
      );
      nose.rotation.x = Math.PI / 2;
      const trail = this.mesh(
        missile,
        this.geo(new T.ConeGeometry(0.17, 0.9, 6)),
        this.mat("#ffd36b", 1.8),
        0,
        0,
        -1,
      );
      trail.rotation.x = -Math.PI / 2;
      missile.visible = false;
      this.scene.add(missile);
      // A crab scuttles up the road after the leader.
      const crab = new T.Group();
      const shell = this.mesh(
        crab,
        this.geo(new T.SphereGeometry(0.55, 10, 8)),
        this.mat("#e4553f", 0.35),
        0,
        0,
        0,
      );
      shell.scale.set(1.25, 0.6, 0.9);
      for (const x of [-1, 1]) {
        const claw = this.mesh(
          crab,
          this.geo(new T.SphereGeometry(0.28, 8, 6)),
          this.mat("#f0705a", 0.35),
          x * 0.78,
          0.12,
          0.45,
        );
        claw.scale.set(0.9, 0.7, 1.3);
        for (const z of [-0.3, 0, 0.3])
          this.box(crab, x * 0.72, -0.25, z, 0.5, 0.08, 0.08, "#b8412f");
        this.box(crab, x * 0.22, 0.42, 0.3, 0.1, 0.3, 0.1, "#1d303c");
      }
      crab.visible = false;
      this.scene.add(crab);
      this.missiles.push({ rocket: missile, crab });
    }
    for (let i = 0; i < 8; i++) {
      const coconut = this.mesh(
        this.scene,
        this.geo(new T.SphereGeometry(0.5, 10, 8)),
        this.mat("#6e4a2c"),
        0,
        0.62,
        0,
      );
      coconut.visible = false;
      this.coconuts.push(coconut);
    }
    for (let i = 0; i < 3; i++) {
      const material = new T.MeshBasicMaterial({
        color: "#bff4ff",
        transparent: true,
        opacity: 0,
        side: T.DoubleSide,
        depthWrite: false,
      });
      this.flats.push(material);
      const ring = this.mesh(
        this.scene,
        this.geo(new T.RingGeometry(0.82, 1, 40)),
        material,
        0,
        0.3,
        0,
      );
      ring.rotation.x = -Math.PI / 2;
      ring.visible = false;
      this.rings.push(ring);
    }
    const flat = (opacity: number) => {
      const material = new T.MeshBasicMaterial({
        color: "#ffffff",
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity === 1,
      });
      this.flats.push(material);
      return material;
    };
    this.sparks = new Puffs(
      this.scene,
      this.geo(new T.OctahedronGeometry(0.11)),
      flat(1),
      90,
      0,
      9,
    );
    this.smoke = new Puffs(
      this.scene,
      this.geo(new T.IcosahedronGeometry(0.3, 1)),
      flat(0.3),
      60,
      2.6,
      -0.9,
    );
    const mark = this.geo(new T.PlaneGeometry(0.24, 0.85));
    mark.rotateX(-Math.PI / 2);
    this.skids = new Puffs(this.scene, mark, flat(0.5), 220, 0, 0);
    this.observer = new ResizeObserver(() => {
      const width = host.clientWidth,
        height = host.clientHeight;
      if (!width || !height || this.disposed) return;
      resizeRenderer(this.renderer, width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    });
    this.observer.observe(host);
  }
  /** Puts these drivers in the other karts. A multiplayer room calls it with each new grid. */
  setRivals(karts: RivalKart[]) {
    for (const { kart, avatar } of this.rivals.splice(0)) {
      this.scene.remove(kart);
      this.disposeAvatar(avatar);
    }
    for (let i = this.nameplates.length - 1; i >= 0; i--)
      if (!this.nameplates[i].player)
        this.nameplates.splice(i, 1)[0].element.remove();
    const rivalHair = new Set([this.look.hair ?? 0]);
    karts.forEach((r, i) => {
      const kart = new T.Group();
      this.scene.add(kart);
      // A player keeps their own outfit and hat; a computer driver wears its kart colour.
      const seeded = seededLook(`rival:${i}:${r.name}`);
      seeded.hair = distinctHair(seeded.hair, rivalHair);
      if (!r.look) rivalHair.add(seeded.hair);
      const look = r.look ?? seeded;
      const colour = r.look ? (outfits[look.outfit] ?? r.color) : r.color;
      const wheels = this.buildKart(kart, colour);
      const avatar = createAvatar(
        kart,
        0,
        -0.15,
        colour,
        skins[look.skin % skins.length],
        r.look ? look.hat : 0,
        look,
      );
      if (avatar.pet) avatar.pet.root.visible = false;
      avatar.root.position.y = -0.14;
      avatar.root.scale.setScalar(0.94);
      const wheel = this.mesh(
        kart,
        this.geo(new T.TorusGeometry(0.25, 0.035, 6, 18)),
        this.mat("#263c49"),
        0,
        0.95,
        -0.04,
      );
      wheel.rotation.x = -0.55;
      for (const [name, x] of [
        ["Kart_grip_r", -0.22],
        ["Kart_grip_l", 0.22],
      ] as const) {
        const grip = new T.Object3D();
        grip.name = name;
        grip.position.x = x;
        wheel.add(grip);
      }
      this.addNameplate(kart, r.name, false, !r.look);
      const cloud = this.stormCloud(kart);
      const bubble = this.mesh(
        kart,
        this.shield.geometry,
        this.shield.material as T.Material,
        0,
        0.9,
        0,
      );
      bubble.visible = false;
      this.rivals.push({ kart, avatar, wheels, cloud, bubble, slip: 0 });
    });
  }
  /** A storm cloud sits over a kart while it is slowed. */
  private stormCloud(kart: T.Group) {
    const cloud = this.mesh(
      kart,
      this.geo(new T.SphereGeometry(1, 10, 6)),
      this.mat("#56677a"),
      0,
      3.7,
      0,
    );
    cloud.scale.set(1.5, 0.55, 1.2);
    cloud.visible = false;
    const bolt = this.mesh(
      cloud,
      this.geo(new T.ConeGeometry(0.16, 1.1, 4)),
      this.mat("#ffe27a", 1.6),
      0,
      -1.3,
      0,
    );
    bolt.rotation.x = Math.PI;
    return cloud;
  }
  private disposeAvatar(avatar: Avatar) {
    avatar.materials.forEach((m) => m.dispose());
    disposeMagic(avatar.magic);
    avatar.model.traverse((o) => {
      if (o instanceof T.SkinnedMesh) o.skeleton.dispose();
    });
  }
  /** A wave spreads from where it was set off. */
  wave(distance: number, offset: number) {
    const ring = this.rings.find((r) => !r.visible) ?? this.rings[0];
    const at = trackPoint(distance, offset);
    ring.position.set(at.x, 0.3, at.z);
    ring.scale.setScalar(1);
    ring.visible = true;
  }
  private geo<G extends T.BufferGeometry>(g: G): G {
    this.geometries.add(g);
    return g;
  }
  private addNameplate(
    kart: T.Group,
    name: string,
    player: boolean,
    cpu = false,
  ) {
    const element = document.createElement("span");
    element.className = `race-nameplate${player ? " race-nameplate-player" : ""}${cpu || player ? "" : " race-nameplate-rival"}`;
    const tag = player ? " · You" : cpu ? " · CPU" : "";
    element.textContent = name + tag;
    this.nameLayer.append(element);
    this.nameplates.push({ kart, element, name, player, tag });
  }
  private drawNameplates() {
    const width = this.nameLayer.clientWidth;
    const height = this.nameLayer.clientHeight;
    const occupied: { x: number; y: number; width: number }[] = [];
    // Nearby racers get priority when labels overlap. Text stays at native
    // screen resolution rather than becoming a small, slanted 3D texture.
    const ordered = [...this.nameplates].sort(
      (a, b) =>
        a.kart.position.distanceToSquared(this.camera.position) -
        b.kart.position.distanceToSquared(this.camera.position),
    );
    const compact = width <= 600 || height <= 300;
    for (const { kart, element, name, player, tag } of ordered) {
      const label = compact ? (player ? "You" : name) : name + tag;
      if (element.textContent !== label) element.textContent = label;
      const projected = kart.position
        .clone()
        .add(new T.Vector3(0, 2.5, 0))
        .project(this.camera);
      const x = Math.round(((projected.x + 1) * width) / 2);
      const y = Math.round(((1 - projected.y) * height) / 2);
      element.hidden =
        (compact && !player && occupied.length >= 3) ||
        projected.z < -1 ||
        projected.z > 1 ||
        x < 0 ||
        x > width ||
        y < 85 ||
        y > height - 45 ||
        !kart.visible ||
        kart.position.distanceTo(this.camera.position) > 65;
      if (element.hidden) continue;
      const labelWidth = element.offsetWidth;
      const left = Math.max(
        0,
        Math.min(width - labelWidth, x - labelWidth / 2),
      );
      if (
        occupied.some(
          (r) =>
            Math.abs(r.y - y) < 26 &&
            left < r.x + r.width + 6 &&
            left + labelWidth + 6 > r.x,
        )
      ) {
        element.hidden = true;
        continue;
      }
      occupied.push({ x: left, y, width: labelWidth });
      element.style.left = `${Math.round(left)}px`;
      element.style.top = `${y}px`;
    }
  }
  private mat(color: string, glow = 0) {
    const key = color + glow;
    let m = this.materials.get(key);
    if (!m) {
      m = new T.MeshStandardMaterial({
        color,
        roughness: 0.78,
        emissive: color,
        emissiveIntensity: glow,
      });
      this.materials.set(key, m);
    }
    return m;
  }
  private mesh(
    parent: T.Object3D,
    geometry: T.BufferGeometry,
    material: T.Material,
    x: number,
    y: number,
    z: number,
  ) {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  private cube: T.BoxGeometry | null = null;
  private box(
    parent: T.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) {
    const m = this.mesh(
      parent,
      (this.cube ??= this.geo(new T.BoxGeometry(1, 1, 1))),
      this.mat(color),
      x,
      y,
      z,
    );
    m.scale.set(w, h, d);
    return m;
  }
  private instances(
    geometry: T.BufferGeometry,
    material: T.Material,
    count: number,
    pose: (o: T.Object3D, i: number) => void,
  ) {
    const m = new T.InstancedMesh(geometry, material, count);
    const o = new T.Object3D();
    for (let i = 0; i < count; i++) {
      o.position.set(0, 0, 0);
      o.rotation.set(0, 0, 0);
      o.scale.set(1, 1, 1);
      pose(o, i);
      o.updateMatrix();
      m.setMatrixAt(i, o.matrix);
    }
    m.computeBoundingSphere();
    this.scene.add(m);
    return m;
  }
  private ribbon(
    left: number,
    right: number,
    y: number,
    color: string,
    segments = 360,
    dashed = false,
  ) {
    const vertices: number[] = [];
    for (let i = 0; i < segments; i++) {
      if (dashed && i % 4 > 1) continue;
      const a = trackPoint((i / segments) * TRACK_LENGTH, left),
        b = trackPoint((i / segments) * TRACK_LENGTH, right);
      const c = trackPoint(((i + 1) / segments) * TRACK_LENGTH, left),
        d = trackPoint(((i + 1) / segments) * TRACK_LENGTH, right);
      vertices.push(
        a.x,
        y,
        a.z,
        c.x,
        y,
        c.z,
        b.x,
        y,
        b.z,
        b.x,
        y,
        b.z,
        c.x,
        y,
        c.z,
        d.x,
        y,
        d.z,
      );
    }
    const g = this.geo(new T.BufferGeometry());
    g.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
    g.computeVertexNormals();
    const material = this.mat(color);
    material.side = T.DoubleSide;
    this.mesh(this.scene, g, material, 0, 0, 0);
  }
  private onTrack(distance: number, offset = 0) {
    const p = trackPoint(distance, offset),
      g = new T.Group();
    g.position.set(p.x, 0.18, p.z);
    g.rotation.y = p.yaw;
    this.scene.add(g);
    return g;
  }
  private buildTrack() {
    this.ribbon(-18, 11.5, -0.05, "#eac994");
    this.ribbon(-6, 6, 0.12, "#faf2ce");
    this.ribbon(-5.75, -5.3, 0.15, "#f07963", 200, true);
    this.ribbon(5.3, 5.75, 0.15, "#f07963", 200, true);
    this.ribbon(-ROAD_HALF_WIDTH + 0.1, ROAD_HALF_WIDTH - 0.1, 0.14, "#455d67");
    this.ribbon(-0.06, 0.06, 0.155, "#d4cfad", 160, true);
    this.ribbon(-8.65, -8.25, 0.2, "#e3b07b");
    this.ribbon(8.25, 8.65, 0.2, "#e3b07b");
    const line = this.onTrack(0);
    for (let i = 0; i < 12; i++)
      for (let j = 0; j < 2; j++)
        this.box(
          line,
          -5 + i * 0.9,
          0,
          j * 0.6,
          0.9,
          0.025,
          0.6,
          (i + j) % 2 ? "#fcf4d5" : "#263d4a",
        );
    for (const x of [-6.5, 6.5]) {
      this.box(line, x, 3, 0, 0.45, 6, 0.45, "#fdc26f");
      this.box(line, x, 0.75, 0, 0.9, 1.5, 0.9, "#e8785e");
    }
    this.box(line, 0, 5.5, 0, 13.4, 1.6, 0.4, "#163e4a");
    this.label(
      line,
      "PALM BAY  /  COAST RUSH",
      0,
      5.5,
      -0.24,
      11.5,
      1.05,
      "#fff4cf",
      "#163e4a",
      Math.PI,
    );
    this.label(
      line,
      "PLAY SIMI",
      0,
      5.5,
      0.24,
      11.5,
      1.05,
      "#fff4cf",
      "#163e4a",
    );
    for (const pad of boostPads) {
      const g = this.onTrack(pad.distance, pad.offset);
      this.box(g, 0, 0.04, 0, 2.6, 0.08, 3.4, "#48e7d0");
      for (let i = 0; i < 3; i++) {
        const a = this.box(
          g,
          -0.35,
          0.1,
          i * 0.8 - 1,
          0.95,
          0.03,
          0.18,
          "#e7ffb5",
        );
        a.rotation.y = -0.65;
        const b = this.box(
          g,
          0.35,
          0.1,
          i * 0.8 - 1,
          0.95,
          0.03,
          0.18,
          "#e7ffb5",
        );
        b.rotation.y = 0.65;
      }
    }
    for (const [kind, objects] of [
      ["crate", itemCrates],
      ["pickup", pickups],
    ] as const)
      objects.forEach((object, index) => {
        const group = this.onTrack(object.distance, object.offset);
        if (kind === "crate") {
          this.box(group, 0, 0.85, 0, 1, 1, 1, "#54d8c5");
          this.box(group, 0, 0.85, 0, 1.04, 0.18, 1.04, "#fff5cb");
          // One sign per row of three crates.
          if (!object.offset)
            this.label(
              group,
              "? RANDOM ITEM ?",
              0,
              1.9,
              0,
              3.6,
              0.45,
              "#143d49",
              "#c1fce8",
              Math.PI,
            );
        } else {
          const shell = this.mesh(
            group,
            this.geo(new T.OctahedronGeometry(0.38)),
            this.mat("#ffe49b", 0.6),
            0,
            0.9,
            0,
          );
          shell.scale.z = 0.4;
        }
        this.trackItems.push({ group, kind, index });
      });
    for (let i = 0; i < 12; i++) {
      const g = this.onTrack(((i + 0.4) / 12) * TRACK_LENGTH, 7.1);
      this.box(g, 0, 1.3, 0, 0.15, 2.6, 0.15, "#735f52");
      this.label(
        g,
        "‹ ‹",
        0,
        2.15,
        -0.07,
        1.6,
        0.9,
        "#183c45",
        "#f4da85",
        Math.PI,
      );
    }
  }
  private label(
    parent: T.Object3D,
    text: string,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    color: string,
    bg: string,
    yaw = 0,
  ) {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 128;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.fillStyle = color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "700 68px sans-serif";
    ctx.fillText(text, 512, 67, 980);
    const texture = new T.CanvasTexture(c);
    texture.colorSpace = T.SRGBColorSpace;
    this.textures.push(texture);
    const material = new T.MeshStandardMaterial({ map: texture, roughness: 1 });
    this.materials.set("label" + this.textures.length, material);
    const m = this.mesh(
      parent,
      this.geo(new T.PlaneGeometry(w, h)),
      material,
      x,
      y,
      z,
    );
    m.rotation.y = yaw;
  }
  private buildIsland() {
    // The route winds, so the lawn is the triangulated inside edge of the sand.
    const ground = this.geo(
      new T.ShapeGeometry(
        new T.Shape(
          Array.from({ length: 240 }, (_, i) => {
            const p = trackPoint((i / 240) * TRACK_LENGTH, -11);
            return new T.Vector2(p.x, p.z);
          }),
        ),
      ),
    );
    ground.rotateX(Math.PI / 2);
    const grass = this.mat("#85af65");
    grass.side = T.DoubleSide;
    this.mesh(this.scene, ground, grass, 0, 0, 0);
    const rock = this.geo(new T.IcosahedronGeometry(1, 0));
    this.instances(rock, this.mat("#bdab83"), 45, (o, i) => {
      const p = trackPoint((i / 45) * TRACK_LENGTH, i % 2 ? -15 : 10);
      o.position.set(p.x, 0.4, p.z);
      o.scale.set(1.2 + (i % 3), 1 + (i % 2), 1.5);
      o.rotation.y = i * 0.8;
    });
    // Hills fill the widest gaps inside the route, wherever it leaves room.
    const shore = Array.from({ length: 120 }, (_, i) =>
      trackPoint((i / 120) * TRACK_LENGTH),
    );
    const inland = (x: number, z: number) =>
      shore.reduce((inside, a, i) => {
        const b = shore[(i + 1) % shore.length];
        return a.z > z !== b.z > z &&
          x < a.x + ((z - a.z) / (b.z - a.z)) * (b.x - a.x)
          ? !inside
          : inside;
      }, false);
    const spots: { x: number; z: number; room: number }[] = [];
    for (let x = trackBounds.minX; x < trackBounds.maxX; x += 6)
      for (let z = trackBounds.minZ; z < trackBounds.maxZ; z += 6) {
        const room = trackClearance(x, z) - 20;
        if (room > 4 && inland(x, z)) spots.push({ x, z, room });
      }
    const hills: typeof spots = [];
    for (const spot of spots.sort((a, b) => b.room - a.room))
      if (
        hills.length < 5 &&
        hills.every(
          (h) => Math.hypot(h.x - spot.x, h.z - spot.z) > h.room + spot.room,
        )
      )
        hills.push(spot);
    hills.forEach(({ x, z, room }, i) => {
      const mountain = this.mesh(
        this.scene,
        rock,
        this.mat(i % 2 ? "#7f9474" : "#8c9a78"),
        x,
        2,
        z,
      );
      mountain.scale.set(room, room * (0.7 + (i % 3) * 0.15), room * 0.85);
    });
    // Houses line the inland side wherever no other stretch of road is near.
    const plots = Array.from({ length: 48 }, (_, i) => (i / 48) * TRACK_LENGTH)
      .filter((d) => {
        const p = trackPoint(d, -18);
        return trackClearance(p.x, p.z) > 17.5;
      })
      .filter((_, i) => i % 3 === 0)
      .slice(0, 9);
    for (const [i, plot] of plots.entries()) {
      const g = this.onTrack(plot, -18);
      this.box(
        g,
        0,
        1.5,
        0,
        3.7,
        3,
        3.3,
        ["#e89a77", "#9fc8b5", "#e6ca83"][i % 3],
      );
      const roof = this.mesh(
        g,
        this.geo(new T.ConeGeometry(3.3, 2, 4)),
        this.mat("#507a79"),
        0,
        3.7,
        0,
      );
      roof.rotation.y = Math.PI / 4;
      this.box(g, 0, 1, 1.67, 1.1, 2, 0.06, "#405762");
    }
    // Jetty and lighthouse mark the harbour inside the hairpin.
    const pier = this.onTrack(HARBOUR, 6.6);
    pier.rotation.y += Math.PI / 2;
    for (let i = 0; i < 7; i++)
      this.box(pier, 0, -0.1, i * 1.1, 5, 0.25, 1, "#b88761");
    const lighthouse = this.onTrack(HARBOUR, 16.5);
    this.mesh(
      lighthouse,
      this.geo(new T.CylinderGeometry(1.2, 1.8, 9, 12)),
      this.mat("#fff0cb"),
      0,
      4,
      0,
    );
    this.mesh(
      lighthouse,
      this.geo(new T.CylinderGeometry(1.35, 1.5, 1.5, 12)),
      this.mat("#ee8865"),
      0,
      4.2,
      0,
    );
    this.mesh(
      lighthouse,
      this.geo(new T.CylinderGeometry(1.7, 1.7, 1.7, 12)),
      this.mat("#335f69"),
      0,
      9,
      0,
    );
    this.mesh(
      lighthouse,
      this.geo(new T.ConeGeometry(2.2, 1.5, 12)),
      this.mat("#ef9677"),
      0,
      10.5,
      0,
    );
  }
  private buildPalms() {
    const count = 68;
    const palmPose = (i: number) =>
      trackPoint(
        ((i + 0.3) / count) * TRACK_LENGTH,
        i % 3 ? -12.8 - (i % 3) * 2 : 10,
      );
    this.instances(
      this.geo(new T.CylinderGeometry(0.18, 0.35, 6.3, 7)),
      this.mat("#a2845f"),
      count,
      (o, i) => {
        const p = palmPose(i);
        o.position.set(p.x, 3, p.z);
        o.rotation.z = Math.sin(i * 9) * 0.09;
      },
    );
    const leaf = this.geo(new T.SphereGeometry(1, 6, 4));
    this.instances(leaf, this.mat("#388f67"), count * 5, (o, i) => {
      const p = palmPose(Math.floor(i / 5)),
        a = (i * TAU) / 5;
      o.position.set(p.x + Math.cos(a) * 1.4, 6.15, p.z + Math.sin(a) * 1.4);
      o.rotation.set(0.1, -a, -0.2);
      o.scale.set(2.6, 0.14, 0.7);
    });
    this.instances(
      this.geo(new T.IcosahedronGeometry(0.35, 0)),
      this.mat("#826745"),
      count,
      (o, i) => {
        const p = palmPose(i);
        o.position.set(p.x, 5.7, p.z);
      },
    );
  }
  private buildKart(parent: T.Group, color: string): KartWheel[] {
    const wheels: KartWheel[] = [];
    this.box(parent, 0, 0.38, 0.05, 1.3, 0.38, 1.85, color);
    this.box(parent, 0, 0.42, 0.88, 1.5, 0.24, 0.45, color);
    this.box(parent, 0, 0.32, 1.2, 1.75, 0.15, 0.16, "#273c4a");
    this.box(parent, 0, 0.32, -1.07, 1.75, 0.15, 0.16, "#273c4a");
    this.box(parent, 0, 0.64, -0.6, 0.8, 0.73, 0.18, "#29424c");
    this.box(parent, 0, 0.49, -0.25, 0.8, 0.12, 0.67, "#29424c");
    this.box(parent, 0, 0.69, 0.93, 0.38, 0.07, 0.65, "#fff7d8");
    const tireGeo = this.geo(
      new T.CylinderGeometry(KART_WHEEL_RADIUS, KART_WHEEL_RADIUS, 0.28, 32),
    );
    const rimGeo = this.geo(new T.CylinderGeometry(0.17, 0.17, 0.29, 32));
    for (const x of [-0.79, 0.79])
      for (const z of [-0.64, 0.73]) {
        const w = new KartWheel(x, z);
        parent.add(w.steering);
        const tire = this.mesh(
          w.steering,
          tireGeo,
          this.mat("#1d303c"),
          0,
          0,
          0,
        );
        tire.rotation.z = Math.PI / 2;
        const rim = this.mesh(w.steering, rimGeo, this.mat("#dbe4da"), 0, 0, 0);
        rim.rotation.z = Math.PI / 2;
        wheels.push(w);
      }
    return wheels;
  }

  /** outro is seconds since the race ended, or -1 while it is still running. */
  draw(
    race: CoastRace,
    time: number,
    steer: number,
    ready: boolean,
    dt: number,
    outro = -1,
    motion?: ReturnType<RaceMotion["sample"]>,
  ) {
    if (this.disposed) return;
    // After the flag the kart rolls to a stop. This is display only: the
    // simulation, and so the recorded time, stopped at the line.
    const roll = Math.min(Math.max(outro, 0), 2.5);
    const distance =
      (motion?.distance ?? race.distance) +
      race.speed * (roll - (roll * roll) / 5);
    const p = raceTrackPose(distance, motion?.offset ?? race.offset);
    const racing = outro < 0 && !ready;
    const ease = (rate: number) =>
      this.reduced ? 1 : 1 - Math.exp(-dt * rate);
    // A drift swings the nose into the bend and holds it there. Otherwise the
    // kart points a little the way it is sliding across the road.
    const slide = !racing
      ? 0
      : race.drifting
        ? race.driftDir * SLIP + steer * 0.14
        : Math.atan2(race.lateralSpeed, Math.max(race.speed, 10)) * 0.8;
    this.slip += (slide - this.slip) * ease(race.drifting ? 9 : 6);
    if (race.drifting && !this.wasDrifting) this.hop = HOP;
    this.wasDrifting = race.drifting;
    this.hop = Math.max(0, this.hop - dt);
    const lift = this.reduced ? 0 : Math.sin((this.hop / HOP) * Math.PI) * 0.3;
    // An item hit spins the kart twice round as it slows.
    const spun =
      race.spin && racing && !this.reduced
        ? (1 - race.spin / SPIN_TICKS) * Math.PI * 4
        : 0;
    this.kart.position.set(p.x, 0.15 + lift, p.z);
    // The body rolls away from the slide; the camera is not attached to it.
    this.kart.rotation.set(
      0,
      p.yaw + this.slip + spun,
      this.reduced ? 0 : this.slip * 0.16,
    );
    // Front wheels and the driver's hands counter-steer through a slide.
    const visualSteer = this.steering.update(steer, dt) - this.slip * 2.2;
    this.wheel.rotation.z = -visualSteer * 0.4;
    this.wheels.forEach((w) => w.pose(visualSteer));
    const tangent = new T.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const side = new T.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    this.puffClock = Math.min(4, this.puffClock + dt * 45);
    const puffs = Math.floor(this.puffClock);
    this.puffClock -= puffs;
    const scatter = () => Math.random() - 0.5;
    if (racing) {
      this.kart.updateMatrixWorld();
      const rear = [-0.79, 0.79].map((x) =>
        new T.Vector3(x, 0, -0.64).applyMatrix4(this.kart.matrixWorld),
      );
      if (race.drifting) {
        // Tyre marks stay on the road for a few seconds.
        if (Math.abs(distance - this.skidAt) > 0.5) {
          this.skidAt = distance;
          for (const w of rear)
            this.skids.emit(
              w.x,
              0.17,
              w.z,
              0,
              0,
              0,
              5,
              1,
              "#22313a",
              this.kart.rotation.y,
            );
        }
        // Sparks take the colour of the turbo the drift has earned so far.
        const colour = race.tier ? TIER_SPARKS[race.tier] : "";
        if (!this.reduced)
          for (let n = 0; n < puffs; n++)
            for (const w of rear) {
              this.smoke.emit(
                w.x,
                0.3,
                w.z,
                scatter() * 2,
                0.5,
                scatter() * 2,
                0.5,
                0.55,
                colour || "#eef3f5",
              );
              if (colour)
                this.sparks.emit(
                  w.x,
                  0.25,
                  w.z,
                  -tangent.x * 5 + scatter() * 4,
                  2.4 + Math.random() * 2,
                  -tangent.z * 5 + scatter() * 4,
                  0.4,
                  1,
                  colour,
                );
            }
      }
      // Rubbing the wall throws sparks from that side of the kart.
      if (race.scraping && race.speed > 4 && !this.reduced)
        for (let n = 0; n < puffs; n++) {
          const edge = Math.sign(race.offset) * 0.95;
          this.sparks.emit(
            p.x + side.x * edge,
            0.4,
            p.z + side.z * edge,
            -side.x * edge * 3 + scatter() * 3,
            2 + Math.random() * 2,
            -side.z * edge * 3 + scatter() * 3,
            0.35,
            1,
            "#ffc56b",
          );
        }
    }
    this.sparks.update(dt);
    this.smoke.update(dt);
    this.skids.update(dt);
    for (const ring of this.rings) {
      if (!ring.visible) continue;
      const size = ring.scale.x + (dt * WAVE_RANGE) / 0.45;
      ring.scale.setScalar(size);
      (ring.material as T.MeshBasicMaterial).opacity =
        0.8 * (1 - size / WAVE_RANGE);
      ring.visible = size < WAVE_RANGE;
    }
    this.cloud.visible = race.slow > 0 && racing;
    animateDetails(this.avatar, time, "drive", true);
    if (this.avatar.pet) {
      this.avatar.pet.root.position.set(1.12, 0.5, -0.18);
      this.avatar.pet.root.rotation.y = 0;
      animatePet(this.avatar.pet, 0, false);
    }
    this.flame.visible = race.boost > 0;
    this.flame.scale.y = 1;
    this.shield.visible = race.shield > 0;
    this.shield.scale.setScalar(1);
    race.rivals.forEach((r, i) => {
      const rival = this.rivals[i];
      if (!rival) return;
      const { kart, avatar, wheels } = rival;
      // A player who left a multiplayer race takes their kart with them.
      kart.visible = r.distance > -500;
      if (!kart.visible) return;
      // Finishers roll on and park beyond the line instead of stacking on it.
      const since = r.finishTick
        ? (race.ticks - r.finishTick) / 60 + Math.max(outro, 0)
        : 0;
      const park = 42 + i * 6;
      const along = r.finishTick
        ? RACE_DISTANCE +
          park * (1 - Math.exp((-since * (r.pace || 20)) / park))
        : (motion?.rivals[i].distance ?? r.distance) +
          r.speed * Math.max(outro, 0);
      const at = raceTrackPose(
        along,
        (motion?.rivals[i].offset ?? r.offset) +
          Math.sign(r.offset) * 1.4 * (1 - Math.exp(-since)),
      );
      // Another player's kart reports its drift. A computer kart slides
      // through anything tighter than a sweeper.
      const curve = trackCurve(r.distance);
      const drift = r.finishTick
        ? 0
        : (r.drift ??
          (Math.abs(curve) > 1 / 30 && r.speed > 12 ? Math.sign(curve) : 0));
      rival.slip += (drift * SLIP - rival.slip) * ease(7);
      const spin =
        r.spin && !r.finishTick && !this.reduced
          ? (1 - r.spin / SPIN_TICKS) * Math.PI * 4
          : 0;
      kart.position.set(at.x, 0.15, at.z);
      kart.rotation.set(
        0,
        at.yaw + rival.slip + spin,
        this.reduced ? 0 : rival.slip * 0.16,
      );
      rival.cloud.visible = r.slow > 0 && !r.finishTick;
      rival.bubble.visible = r.shield > 0 && !r.finishTick;
      wheels.forEach((w) => w.pose(-rival.slip * 2.2));
      if (
        drift &&
        racing &&
        puffs &&
        !this.reduced &&
        kart.position.distanceToSquared(this.kart.position) < 3600
      )
        this.smoke.emit(
          at.x - Math.sin(at.yaw) * 0.7 + scatter(),
          0.3,
          at.z - Math.cos(at.yaw) * 0.7 + scatter(),
          scatter() * 2,
          0.5,
          scatter() * 2,
          0.5,
          0.55,
          "#eef3f5",
        );
      animateDetails(avatar, time, "drive", true);
    });
    this.missiles.forEach(({ rocket, crab }, i) => {
      const m = race.missiles[i];
      rocket.visible = !!m && !m.crab && outro < 0;
      crab.visible = !!m && m.crab && outro < 0;
      if (!m) return;
      const at = trackPoint(m.distance, m.offset);
      if (m.crab) {
        crab.position.set(
          at.x,
          0.55 + Math.abs(Math.sin(time * 18)) * 0.15,
          at.z,
        );
        crab.rotation.y = at.yaw + Math.sin(time * 14) * 0.25;
      } else {
        rocket.position.set(at.x, 1, at.z);
        rocket.rotation.y = at.yaw;
      }
    });
    this.coconuts.forEach((mesh, i) => {
      const c = race.coconuts[i];
      mesh.visible = !!c;
      if (!c) return;
      const at = trackPoint(c.distance, c.offset);
      mesh.position.set(at.x, 0.62, at.z);
    });
    this.trackItems.forEach(({ group, kind, index }) => {
      group.visible = !race.collected.has(`${kind}:${race.lap - 1}:${index}`);
      if (!this.reduced && kind === "pickup")
        group.children[0].rotation.y = time * 1.5;
    });
    // The lobby shows the driver from the front. At the finish the chase
    // camera swings round the kart's left side to reach the same view.
    const swing =
      outro < 0 ? Number(ready) : this.reduced ? 1 : 1 - Math.exp(-outro * 1.3);
    const angle = Math.PI + swing * 2.486;
    const targetPosition = this.kart.position
      .clone()
      .addScaledVector(tangent, Math.cos(angle) * 6.6)
      .addScaledVector(side, Math.sin(angle) * 6.6);
    targetPosition.y += 3.25 - swing * 0.15;
    const aim = this.kart.position
      .clone()
      .addScaledVector(tangent, 7.5 * (1 - swing));
    aim.y += 0.8 + swing * 0.1;
    this.cameraFollow.update(
      this.camera.position,
      this.kart.position,
      targetPosition,
      dt,
      this.reduced,
    );
    this.camera.lookAt(aim);
    if (!this.reduced) {
      this.foam.position.x = Math.sin(time * 0.3) * 0.6;
      this.foam.position.z = Math.sin(time * 0.25) * 0.4;
    }
    this.renderer.render(this.scene, this.camera);
    this.drawNameplates();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    const skeletons = new Set<T.Skeleton>();
    for (const avatar of [this.avatar, ...this.rivals.map((r) => r.avatar)]) {
      avatar.materials.forEach((m) => m.dispose());
      disposeMagic(avatar.magic);
      avatar.model.traverse((o) => {
        if (o instanceof T.SkinnedMesh) skeletons.add(o.skeleton);
      });
    }
    skeletons.forEach((s) => s.dispose());
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.flats.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.nameLayer.remove();
  }
}
const TAU = Math.PI * 2;
