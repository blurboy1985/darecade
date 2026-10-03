import * as T from "three";
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
  cones,
  ROAD_HALF_WIDTH,
  TRACK_LENGTH,
  RACE_DISTANCE,
  trackPoint,
  type CoastRace,
} from "../shared/racing";

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
  private readonly wheels: T.Group[] = [];
  private readonly frontWheels: T.Group[] = [];
  private readonly wheel = new T.Group();
  private readonly ghost = new T.Group();
  private readonly flame: T.Mesh;
  private readonly sea: T.Mesh;
  private readonly observer: ResizeObserver;
  private readonly foam: T.InstancedMesh;
  private cameraReady = false;
  private disposed = false;
  private readonly look: Look;
  private readonly reduced: boolean;
  private readonly ghostSeconds: number;
  constructor(
    host: HTMLElement,
    look: Look,
    reduced: boolean,
    ghostSeconds: number,
  ) {
    this.look = look;
    this.reduced = reduced;
    this.ghostSeconds = ghostSeconds;
    this.renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.2;
    this.renderer.domElement.setAttribute(
      "aria-label",
      "Palm Bay circuit, with your saved avatar driving a kart",
    );
    this.renderer.domElement.tabIndex = 0;
    host.append(this.renderer.domElement);
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
    this.buildKart(this.kart, outfits[look.outfit], false);
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
    this.scene.add(this.ghost);
    this.buildKart(this.ghost, "#ffe9a0", true);
    this.observer = new ResizeObserver(() => {
      const width = host.clientWidth,
        height = host.clientHeight;
      if (!width || !height || this.disposed) return;
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    });
    this.observer.observe(host);
  }
  private geo<G extends T.BufferGeometry>(g: G): G {
    this.geometries.add(g);
    return g;
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
      "DARECADE",
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
    const cone = this.geo(new T.ConeGeometry(0.48, 1, 8));
    for (const c of cones) {
      const g = this.onTrack(c.distance, c.offset);
      this.box(g, 0, 0.06, 0, 1, 0.12, 1, "#203d48");
      this.mesh(g, cone, this.mat("#f98958"), 0, 0.6, 0);
      this.mesh(
        g,
        this.geo(new T.CylinderGeometry(0.2, 0.3, 0.18, 8)),
        this.mat("#fff3ce"),
        0,
        0.62,
        0,
      );
    }
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
    const vertices: number[] = [];
    for (let i = 0; i < 180; i++) {
      const a = trackPoint((i / 180) * TRACK_LENGTH, -11),
        b = trackPoint(((i + 1) / 180) * TRACK_LENGTH, -11);
      vertices.push(0, 0, 0, a.x, 0, a.z, b.x, 0, b.z);
    }
    const ground = this.geo(new T.BufferGeometry());
    ground.setAttribute("position", new T.Float32BufferAttribute(vertices, 3));
    ground.computeVertexNormals();
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
    for (let i = 0; i < 5; i++) {
      const mountain = this.mesh(
        this.scene,
        rock,
        this.mat(i % 2 ? "#7f9474" : "#8c9a78"),
        -28 + i * 12,
        4,
        -5,
      );
      mountain.scale.set(16, 9 + (i % 3) * 4, 13);
    }
    for (let i = 0; i < 7; i++) {
      const g = this.onTrack((0.14 + i * 0.037) * TRACK_LENGTH, -18);
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
    // Jetty and lighthouse give the back straight a recognisable landmark.
    const pier = this.onTrack(TRACK_LENGTH * 0.72, 11);
    for (let i = 0; i < 7; i++)
      this.box(pier, 0, -0.1, i * 1.1, 5, 0.25, 1, "#b88761");
    const lighthouse = this.onTrack(TRACK_LENGTH * 0.7, 20);
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
  private buildKart(parent: T.Group, color: string, ghost: boolean) {
    const body = this.box(parent, 0, 0.38, 0.05, 1.3, 0.38, 1.85, color);
    this.box(parent, 0, 0.42, 0.88, 1.5, 0.24, 0.45, color);
    this.box(parent, 0, 0.32, 1.2, 1.75, 0.15, 0.16, "#273c4a");
    this.box(parent, 0, 0.32, -1.07, 1.75, 0.15, 0.16, "#273c4a");
    this.box(parent, 0, 0.64, -0.6, 0.8, 0.73, 0.18, "#29424c");
    this.box(parent, 0, 0.49, -0.25, 0.8, 0.12, 0.67, "#29424c");
    this.box(parent, 0, 0.69, 0.93, 0.38, 0.07, 0.65, "#fff7d8");
    const tireGeo = this.geo(new T.CylinderGeometry(0.31, 0.31, 0.28, 14));
    const rimGeo = this.geo(new T.CylinderGeometry(0.17, 0.17, 0.29, 8));
    for (const x of [-0.79, 0.79])
      for (const z of [-0.64, 0.73]) {
        const w = new T.Group();
        w.position.set(x, 0.29, z);
        parent.add(w);
        const tire = this.mesh(w, tireGeo, this.mat("#1d303c"), 0, 0, 0);
        tire.rotation.z = Math.PI / 2;
        const rim = this.mesh(w, rimGeo, this.mat("#dbe4da"), 0, 0, 0);
        rim.rotation.z = Math.PI / 2;
        if (!ghost) {
          this.wheels.push(w);
          if (z > 0) this.frontWheels.push(w);
        }
      }
    if (ghost) {
      parent.traverse((o) => {
        if (o instanceof T.Mesh) {
          const m = new T.MeshStandardMaterial({
            color: "#ffe9a0",
            transparent: true,
            opacity: 0.32,
            depthWrite: false,
            emissive: "#fed98a",
            emissiveIntensity: 0.7,
          });
          this.materials.set("ghost" + o.uuid, m);
          o.material = m;
        }
      });
      body.scale.y = 0.55;
    }
  }
  draw(
    race: CoastRace,
    time: number,
    steer: number,
    ready: boolean,
    dt: number,
  ) {
    if (this.disposed) return;
    const p = trackPoint(race.distance, race.offset);
    this.kart.position.set(p.x, 0.15, p.z);
    this.kart.rotation.set(
      0,
      p.yaw + (race.drifting ? steer * -0.22 : race.lateralSpeed * 0.018),
      this.reduced ? 0 : -steer * 0.035,
    );
    this.wheel.rotation.z = -steer * 0.4;
    this.frontWheels.forEach((w) => (w.rotation.y = steer * 0.24));
    this.wheels.forEach((w) =>
      w.children.forEach((c) => (c.rotation.y = race.distance * 3)),
    );
    animateDetails(this.avatar, time, "drive", this.reduced);
    if (this.avatar.pet) {
      this.avatar.pet.root.position.set(1.12, 0.5, -0.18);
      this.avatar.pet.root.rotation.y = 0;
      animatePet(this.avatar.pet, this.reduced ? 0 : time, false);
    }
    this.flame.visible = race.boost > 0;
    this.flame.scale.y = this.reduced ? 1 : 0.9 + Math.sin(time * 32) * 0.18;
    const gd = Math.min(
      RACE_DISTANCE,
      (Math.max(0, race.ticks / 60) / this.ghostSeconds) * RACE_DISTANCE,
    );
    const gp = trackPoint(gd, 1.8);
    this.ghost.position.set(gp.x, 0.17, gp.z);
    this.ghost.rotation.y = gp.yaw;
    this.ghost.visible = !ready && gd < RACE_DISTANCE;
    const tangent = new T.Vector3(Math.sin(p.yaw), 0, Math.cos(p.yaw));
    const side = new T.Vector3(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const targetPosition = this.kart.position.clone();
    targetPosition
      .addScaledVector(tangent, ready ? 5.2 : -6.6)
      .addScaledVector(side, ready ? -4 : 0);
    targetPosition.y += ready ? 3.1 : 3.25;
    const aim = this.kart.position
      .clone()
      .addScaledVector(tangent, ready ? 0 : 7.5);
    aim.y += ready ? 0.9 : 0.8;
    if (!this.cameraReady) {
      this.camera.position.copy(targetPosition);
      this.cameraReady = true;
    } else
      this.camera.position.lerp(
        targetPosition,
        this.reduced ? 1 : 1 - Math.exp(-dt * 9),
      );
    this.camera.lookAt(aim);
    if (!this.reduced) {
      this.foam.position.x = Math.sin(time * 0.3) * 0.6;
      this.foam.position.z = Math.sin(time * 0.25) * 0.4;
    }
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.avatar.materials.forEach((m) => m.dispose());
    disposeMagic(this.avatar.magic);
    const skeletons = new Set<T.Skeleton>();
    this.avatar.model.traverse((o) => {
      if (o instanceof T.SkinnedMesh) skeletons.add(o.skeleton);
    });
    skeletons.forEach((s) => s.dispose());
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
const TAU = Math.PI * 2;
