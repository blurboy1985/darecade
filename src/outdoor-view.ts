import { resizeRenderer } from "./render-budget.ts";
import * as T from "three";
import {
  HOOPS_FLIGHT_TICKS,
  HOOPS_SHOT_TICKS,
  type FishingRound,
  type FishingState,
  type HoopsRound,
} from "../shared/outdoor";

const TAU = Math.PI * 2;
const FISH_COLOURS: Record<string, string> = {
  guppy: "#7fb7d9",
  tilapia: "#f29b6b",
  catfish: "#8c7a6b",
  prawn: "#f47c7c",
  terrapin: "#6f9b5c",
  koi: "#ffd257",
};
type Spark = { mesh: T.Mesh; velocity: T.Vector3; life: number };

/** Hoops Court and Fishing Jetty scenes. The view only reads the round. */
export class OutdoorView {
  readonly renderer: T.WebGLRenderer;
  private readonly scene = new T.Scene();
  private readonly camera = new T.PerspectiveCamera(50, 1, 0.1, 120);
  private readonly geometries = new Set<T.BufferGeometry>();
  private readonly materials = new Map<string, T.MeshStandardMaterial>();
  private readonly sparks: Spark[] = [];
  private readonly observer: ResizeObserver;
  private readonly update: (time: number, dt: number) => void;
  private disposed = false;
  private shake = 0;
  constructor(
    host: HTMLElement,
    private readonly round: HoopsRound | FishingRound,
    private readonly reduced: boolean,
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.append(this.renderer.domElement);
    this.scene.add(new T.HemisphereLight("#fff6e6", "#5d7f86", 2.4));
    const sun = new T.DirectionalLight("#ffe9c4", 2.6);
    sun.position.set(-4, 9, 6);
    this.scene.add(sun);
    const dot = this.geo(new T.SphereGeometry(0.07, 6, 5));
    for (let i = 0; i < 36; i++) {
      const material = new T.MeshStandardMaterial({
        color: "#ffffff",
        emissive: "#ffffff",
        emissiveIntensity: 1.2,
        transparent: true,
      });
      this.materials.set("spark" + i, material);
      const mesh = new T.Mesh(dot, material);
      mesh.visible = false;
      this.scene.add(mesh);
      this.sparks.push({ mesh, velocity: new T.Vector3(), life: 0 });
    }
    this.update =
      round.kind === "hoops"
        ? this.buildHoops(round)
        : this.buildFishing(round);
    this.observer = new ResizeObserver(() => {
      const width = host.clientWidth,
        height = host.clientHeight;
      if (!width || !height || this.disposed) return;
      resizeRenderer(this.renderer, width, height, false);
      this.camera.aspect = width / height;
      // Narrow phone screens need a wider lens to keep the hoop or float in view.
      this.camera.fov = width < height ? 66 : 50;
      this.camera.updateProjectionMatrix();
    });
    this.observer.observe(host);
  }
  private geo<G extends T.BufferGeometry>(g: G): G {
    this.geometries.add(g);
    return g;
  }
  private mat(color: string, glow = 0, opacity = 1) {
    const key = color + glow + opacity;
    let m = this.materials.get(key);
    if (!m) {
      m = new T.MeshStandardMaterial({
        color,
        roughness: 0.75,
        emissive: color,
        emissiveIntensity: glow,
        transparent: opacity < 1,
        opacity,
      });
      this.materials.set(key, m);
    }
    return m;
  }
  private mesh(
    parent: T.Object3D,
    geometry: T.BufferGeometry,
    material: T.Material,
    x = 0,
    y = 0,
    z = 0,
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
    glow = 0,
  ) {
    const m = this.mesh(
      parent,
      (this.cube ??= this.geo(new T.BoxGeometry(1, 1, 1))),
      this.mat(color, glow),
      x,
      y,
      z,
    );
    m.scale.set(w, h, d);
    return m;
  }
  /** A burst of glowing dots. Decoration only, so it may use Math.random. */
  private burst(
    at: T.Vector3,
    color: string,
    count: number,
    speed: number,
    up = 1,
  ) {
    if (this.reduced) return;
    for (const spark of this.sparks) {
      if (!count) break;
      if (spark.life > 0) continue;
      count--;
      const angle = Math.random() * TAU;
      spark.velocity.set(
        Math.cos(angle) * speed * Math.random(),
        speed * up * (0.5 + Math.random()),
        Math.sin(angle) * speed * Math.random(),
      );
      spark.life = 0.5 + Math.random() * 0.5;
      spark.mesh.position.copy(at);
      spark.mesh.visible = true;
      const material = spark.mesh.material as T.MeshStandardMaterial;
      material.color.set(color);
      material.emissive.set(color);
    }
  }
  private stepSparks(dt: number) {
    for (const spark of this.sparks) {
      if (spark.life <= 0) continue;
      spark.life -= dt;
      spark.velocity.y -= 7 * dt;
      spark.mesh.position.addScaledVector(spark.velocity, dt);
      (spark.mesh.material as T.MeshStandardMaterial).opacity = Math.min(
        1,
        spark.life * 3,
      );
      spark.mesh.visible = spark.life > 0;
    }
  }

  private buildHoops(round: HoopsRound) {
    this.scene.background = new T.Color("#f6c98f");
    this.scene.fog = new T.Fog("#f6c98f", 14, 40);
    this.camera.position.set(0, 2.7, 7.2);
    this.camera.lookAt(0, 2.75, 0);
    const floor = this.mesh(
      this.scene,
      this.geo(new T.PlaneGeometry(26, 26)),
      this.mat("#d98a54"),
    );
    floor.rotation.x = -Math.PI / 2;
    // The key, the free-throw line and its arc.
    this.box(this.scene, 0, 0.01, 2.2, 3.6, 0.02, 5.6, "#e7a66b");
    this.box(this.scene, 0, 0.02, 5, 3.6, 0.02, 0.1, "#fff3d8");
    for (const x of [-1.8, 1.8])
      this.box(this.scene, x, 0.02, 2.2, 0.1, 0.02, 5.6, "#fff3d8");
    const arc = this.mesh(
      this.scene,
      this.geo(new T.TorusGeometry(1.8, 0.05, 4, 24, Math.PI)),
      this.mat("#fff3d8"),
      0,
      0.02,
      5,
    );
    arc.rotation.x = -Math.PI / 2;
    for (let i = -3; i <= 3; i++) {
      const palm = this.box(
        this.scene,
        i * 3.2,
        1.4,
        -5,
        0.22,
        2.8,
        0.22,
        "#a2845f",
      );
      palm.rotation.z = Math.sin(i * 7) * 0.08;
      const crown = this.mesh(
        this.scene,
        this.geo(new T.SphereGeometry(1, 6, 4)),
        this.mat("#388f67"),
        i * 3.2,
        3,
        -5,
      );
      crown.scale.set(1.5, 0.35, 1.5);
    }
    this.box(this.scene, 0, 1.7, -0.75, 0.22, 3.4, 0.22, "#44606b");
    const board = this.box(this.scene, 0, 3.6, -0.55, 2.3, 1.5, 0.1, "#fffaf0");
    const boardGlow = board.material as T.MeshStandardMaterial;
    this.box(this.scene, 0, 3.4, -0.49, 0.8, 0.6, 0.02, "#f0624d");
    this.box(this.scene, 0, 3.4, -0.48, 0.62, 0.42, 0.02, "#fffaf0");
    const rim = this.mesh(
      this.scene,
      this.geo(new T.TorusGeometry(0.42, 0.04, 8, 24)),
      this.mat("#ff7a3c", 0.3),
      0,
      3.05,
      0,
    );
    rim.rotation.x = Math.PI / 2;
    const netMaterial = new T.MeshStandardMaterial({
      color: "#ffffff",
      wireframe: true,
    });
    this.materials.set("net", netMaterial);
    const net = this.mesh(
      this.scene,
      this.geo(new T.CylinderGeometry(0.42, 0.26, 0.6, 12, 3, true)),
      netMaterial,
      0,
      2.74,
      0,
    );
    // The shot clock is a bar above the board that drains and turns red.
    const clock = this.box(
      this.scene,
      0,
      4.55,
      -0.55,
      2.3,
      0.14,
      0.12,
      "#8ff0c8",
      0.9,
    );
    const clockMaterial = new T.MeshStandardMaterial({
      color: "#8ff0c8",
      emissive: "#8ff0c8",
      emissiveIntensity: 0.9,
    });
    this.materials.set("clock", clockMaterial);
    clock.material = clockMaterial;
    const ballMaterial = new T.MeshStandardMaterial({
      color: "#f08a3c",
      roughness: 0.6,
      emissive: "#ff5a1f",
      emissiveIntensity: 0,
    });
    this.materials.set("ball", ballMaterial);
    const ball = this.mesh(
      this.scene,
      this.geo(new T.SphereGeometry(0.3, 16, 12)),
      ballMaterial,
    );
    const seam = this.mesh(
      ball,
      this.geo(new T.TorusGeometry(0.302, 0.012, 4, 20)),
      this.mat("#3a2a22"),
    );
    seam.rotation.y = Math.PI / 2;
    const shadow = this.mesh(
      this.scene,
      this.geo(new T.CircleGeometry(0.3, 14)),
      this.mat("#7a4a2c", 0, 0.45),
      0,
      0.03,
      0,
    );
    shadow.rotation.x = -Math.PI / 2;
    const start = new T.Vector3(0, 1.5, 5.2),
      hoop = new T.Vector3(0, 3.05, 0);
    let shots = 0,
      side = 1,
      swish = 0,
      flash = 0;
    return (time: number, dt: number) => {
      if (round.shot > shots) {
        shots = round.shot;
        side = Math.random() < 0.5 ? -1 : 1;
      }
      const made = round.last === "perfect" || round.last === "made";
      if (round.flight) {
        const t = 1 - round.flight / HOOPS_FLIGHT_TICKS;
        // The ball reaches the rim two thirds of the way through its flight.
        const rise = Math.min(1, t / 0.66);
        const end =
          round.last === "late"
            ? new T.Vector3(0, 0.3, 2.4)
            : made
              ? hoop
              : new T.Vector3(side * 0.44, 3.1, 0.05);
        ball.position.lerpVectors(start, end, rise);
        ball.position.y +=
          Math.sin(rise * Math.PI) * (round.last === "late" ? 1 : 2.3);
        if (t > 0.66) {
          const fall = (t - 0.66) / 0.34;
          if (made) ball.position.set(0, 3.05 - fall * 2.6, 0.05);
          else if (round.last === "miss")
            ball.position.set(
              side * (0.44 + fall * 2.2),
              3.1 + Math.sin(fall * Math.PI) * 0.7 - fall * 2.4,
              0.05 + fall * 1.6,
            );
          else ball.position.set(0, 0.3, 2.4 - fall);
          if (!swish && round.last !== "late") {
            swish = 1;
            flash = made ? 1 : 0;
            this.shake = made ? 0 : 0.5;
            this.burst(
              hoop,
              round.last === "perfect"
                ? "#ffe27a"
                : made
                  ? "#ffffff"
                  : "#ff7a5c",
              round.last === "perfect" ? 26 : made ? 12 : 6,
              round.last === "perfect" ? 3.6 : 2.4,
            );
          }
        }
        ball.rotation.x -= dt * 9;
      } else {
        swish = 0;
        // Between shots the ball is bounced at the free-throw line.
        const bounce = this.reduced ? 0.5 : Math.abs(Math.sin(time * 5));
        ball.position.set(start.x, 0.3 + bounce * 1.2, start.z);
        ball.rotation.x += dt * 2;
      }
      shadow.position.set(ball.position.x, 0.03, ball.position.z);
      shadow.scale.setScalar(Math.max(0.4, 1.3 - ball.position.y * 0.2));
      // A streak of three sets the ball alight.
      ballMaterial.emissiveIntensity = round.streak >= 3 ? 0.9 : 0;
      if (round.streak >= 3 && Math.random() < 0.5)
        this.burst(ball.position, "#ff9a3c", 1, 0.8, 0.4);
      swish = Math.max(0, swish - dt * 3);
      net.scale.y = 1 + (made ? swish * 0.5 : 0);
      net.position.y = 2.74 - (made ? swish * 0.15 : 0);
      rim.position.x = this.reduced
        ? 0
        : Math.sin(time * 60) * this.shake * 0.05;
      this.shake = Math.max(0, this.shake - dt * 2);
      flash = Math.max(0, flash - dt * 2.5);
      boardGlow.emissive.set("#ffe27a");
      boardGlow.emissiveIntensity = flash * 0.8;
      const left = round.flight ? 0 : round.clock / HOOPS_SHOT_TICKS;
      clock.scale.x = Math.max(0.001, 2.3 * left);
      clockMaterial.color.set(left < 0.3 ? "#ff6a55" : "#8ff0c8");
      clockMaterial.emissive.copy(clockMaterial.color);
    };
  }

  private buildFishing(round: FishingRound) {
    this.scene.background = new T.Color("#bfeaf0");
    this.scene.fog = new T.Fog("#bfeaf0", 16, 44);
    this.camera.position.set(0, 3.4, 7.6);
    this.camera.lookAt(0, 0.4, -1.5);
    const waterMaterial = this.mat("#2aa7b0");
    waterMaterial.roughness = 0.25;
    waterMaterial.metalness = 0.2;
    const water = this.mesh(
      this.scene,
      this.geo(new T.PlaneGeometry(60, 40)),
      waterMaterial,
      0,
      0,
      -8,
    );
    water.rotation.x = -Math.PI / 2;
    this.box(this.scene, 0, -0.1, -24, 60, 1.4, 6, "#85af65");
    for (let i = 0; i < 9; i++) {
      this.box(this.scene, -9 + i * 2.3, 1.6, -22, 0.2, 2.6, 0.2, "#a2845f");
      const crown = this.mesh(
        this.scene,
        this.geo(new T.SphereGeometry(1, 6, 4)),
        this.mat("#388f67"),
        -9 + i * 2.3,
        3,
        -22,
      );
      crown.scale.set(1.4, 0.35, 1.4);
    }
    for (let i = 0; i < 7; i++) {
      const pad = this.mesh(
        this.scene,
        this.geo(new T.CircleGeometry(0.45 + (i % 3) * 0.12, 9)),
        this.mat("#6fb36a"),
        Math.sin(i * 2.4) * 5,
        0.02,
        -3 - i * 1.5,
      );
      pad.rotation.x = -Math.PI / 2;
    }
    for (let i = 0; i < 6; i++)
      this.box(this.scene, -2 + i * 0.8, 0.35, 5.6, 0.74, 0.12, 3.4, "#b88761");
    for (const x of [-2.2, 2.2])
      this.box(this.scene, x, 0.1, 4.4, 0.2, 1, 0.2, "#7c5a43");
    const rod = new T.Group();
    rod.position.set(0.9, 0.6, 5);
    this.scene.add(rod);
    this.mesh(
      rod,
      this.geo(new T.CylinderGeometry(0.02, 0.05, 3.4, 6)),
      this.mat("#5b4636"),
      0,
      1.7,
      0,
    );
    const tip = new T.Object3D();
    tip.position.y = 3.4;
    rod.add(tip);
    const lineGeometry = this.geo(new T.BufferGeometry());
    lineGeometry.setAttribute(
      "position",
      new T.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 3),
    );
    const lineMaterial = new T.LineBasicMaterial({ color: "#ffffff" });
    const line = new T.Line(lineGeometry, lineMaterial);
    line.frustumCulled = false;
    this.scene.add(line);
    const float = new T.Group();
    this.scene.add(float);
    this.mesh(
      float,
      this.geo(new T.SphereGeometry(0.16, 10, 8)),
      this.mat("#f0624d", 0.2),
    );
    this.mesh(
      float,
      this.geo(new T.SphereGeometry(0.13, 10, 8)),
      this.mat("#fffaf0"),
      0,
      0.12,
      0,
    );
    const ringGeometry = this.geo(new T.RingGeometry(0.9, 1, 28));
    const rings = [0, 1, 2].map((i) => {
      const material = new T.MeshStandardMaterial({
        color: "#e9ffff",
        transparent: true,
        opacity: 0,
        side: T.DoubleSide,
        depthWrite: false,
      });
      this.materials.set("ring" + i, material);
      const ring = this.mesh(this.scene, ringGeometry, material, 0, 0.03, 0);
      ring.rotation.x = -Math.PI / 2;
      return { ring, material };
    });
    const shade = this.mesh(
      this.scene,
      this.geo(new T.CircleGeometry(0.5, 12)),
      this.mat("#12565f", 0, 0.55),
      0,
      0.015,
      0,
    );
    shade.rotation.x = -Math.PI / 2;
    shade.scale.set(1.6, 0.7, 1);
    const fishMaterial = new T.MeshStandardMaterial({ roughness: 0.4 });
    this.materials.set("fish", fishMaterial);
    const fish = new T.Group();
    const body = this.mesh(
      fish,
      this.geo(new T.SphereGeometry(0.5, 12, 8)),
      fishMaterial,
    );
    body.scale.set(1.5, 0.75, 0.5);
    const tail = this.mesh(
      fish,
      this.geo(new T.ConeGeometry(0.34, 0.6, 4)),
      fishMaterial,
      -0.95,
      0,
      0,
    );
    tail.rotation.z = -Math.PI / 2;
    tail.scale.z = 0.3;
    this.mesh(
      fish,
      this.geo(new T.SphereGeometry(0.06, 6, 5)),
      this.mat("#1c2a30"),
      0.5,
      0.12,
      0.2,
    );
    fish.visible = false;
    this.scene.add(fish);
    const hook = new T.Vector3(),
      from = new T.Vector3(),
      at = new T.Vector3();
    let state: FishingState = "idle",
      since = 0,
      darting = 0;
    return (time: number, dt: number) => {
      if (round.state !== state) {
        state = round.state;
        since = 0;
        if (state === "waiting")
          this.burst(at.set(0, 0.1, -3), "#e9ffff", 8, 1.6);
        if (state === "bite") this.burst(hook, "#ffffff", 14, 2.4);
        if (state === "landed") {
          fishMaterial.color.set(FISH_COLOURS[round.fish!.id]);
          this.burst(hook, "#e9ffff", 24, 3.4);
          this.burst(hook, "#ffe27a", 10, 2.6);
        }
        if (state === "lost" && round.loss !== "early") {
          this.burst(hook, "#e9ffff", 10, 2);
          darting = 1;
        }
      }
      since += dt;
      const reeling = state === "reeling";
      // The float starts far out and comes in as the fish is reeled.
      const pull = reeling || state === "landed" ? round.progress : 0;
      const wobble =
        reeling && round.surging && !this.reduced
          ? Math.sin(time * 22) * 0.5
          : 0;
      const bob = this.reduced ? 0 : Math.sin(time * 2.4) * 0.04;
      const dip = state === "bite" ? -0.22 + Math.sin(time * 30) * 0.05 : 0;
      hook.set(wobble, 0.06 + bob + dip, -3 + pull * 5.4);
      float.visible = state !== "idle" && state !== "landed";
      float.position.copy(hook);
      // Tension bends the rod toward the water.
      rod.rotation.x = -0.5 - (reeling ? round.tension * 0.55 : 0);
      rod.rotation.z = reeling && round.surging ? wobble * 0.12 : 0;
      tip.getWorldPosition(from);
      const points = lineGeometry.getAttribute("position") as T.BufferAttribute;
      const end = state === "idle" || state === "lost" ? from : hook;
      points.setXYZ(0, from.x, from.y, from.z);
      points.setXYZ(1, end.x, end.y, end.z);
      points.needsUpdate = true;
      lineMaterial.color.setRGB(
        1,
        1 - (reeling ? round.tension * 0.8 : 0),
        1 - (reeling ? round.tension * 0.9 : 0),
      );
      rings.forEach(({ ring, material }, i) => {
        const pace = state === "bite" || (reeling && round.surging) ? 2.2 : 0.7;
        const life = (time * pace + i / 3) % 1;
        ring.position.set(hook.x, 0.03, hook.z);
        ring.scale.setScalar(0.25 + life * (state === "bite" ? 1.4 : 0.9));
        material.opacity =
          float.visible && !this.reduced ? (1 - life) * 0.7 : 0;
      });
      darting = Math.max(0, darting - dt * 1.2);
      shade.visible = state === "bite" || reeling || darting > 0;
      shade.position.set(
        hook.x +
          (darting
            ? (1 - darting) * 6
            : reeling
              ? Math.sin(time * 5) * 0.4
              : 0),
        0.015,
        hook.z - 0.5 - (darting ? (1 - darting) * 5 : 0),
      );
      shade.scale.set(1.6 + round.tension * 0.4, 0.7, 1);
      // A landed fish leaps from the water toward the jetty.
      fish.visible = state === "landed";
      if (fish.visible) {
        const t = Math.min(1, since / 0.6);
        fish.position.set(
          hook.x,
          0.2 + Math.sin(t * Math.PI) * 2.4 + t * 1.2,
          hook.z + t * 1.6,
        );
        fish.rotation.z = 0.9 - t * 1.6;
        fish.rotation.y = this.reduced ? 0 : Math.sin(time * 16) * 0.3;
        // Rarer fish are bigger.
        fish.scale.setScalar(1.3 - round.fish!.weight * 0.012);
      }
      water.position.y = this.reduced ? 0 : Math.sin(time * 0.8) * 0.015;
    };
  }

  draw(time: number, dt: number) {
    if (this.disposed) return;
    this.update(time, dt);
    this.stepSparks(dt);
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.scene.traverse((o) => {
      if (o instanceof T.Line) (o.material as T.Material).dispose();
    });
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
