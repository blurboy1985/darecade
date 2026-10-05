import * as T from "three";
import { presentationTick } from "./relay-motion.ts";
import {
  animateDetails,
  createAvatar,
  disposeAvatar,
  type Avatar,
} from "./character";
import { outfits, skins } from "./state";
import type { RelaySnapshot } from "../shared/relay-protocol";
import {
  relayPlatform,
  relayBarriers,
  relayConfig,
  RELAY_TICK_RATE,
  RELAY_STOPS,
  RELAY_OBSTACLE_Z,
  RELAY_PLATFORM_START,
  RELAY_PLATFORM_END,
} from "../shared/relay";

type RunnerVisual = {
  avatar: Avatar;
  lookKey: string;
  from: T.Vector3;
  target: T.Vector3;
  moving: boolean;
};

/** A presentation of authoritative Relay snapshots, never a second simulation. */
export class RelayView {
  readonly renderer: T.WebGLRenderer;
  private readonly scene = new T.Scene();
  private readonly camera = new T.PerspectiveCamera(54, 1, 0.1, 100);
  private readonly geometries = new Set<T.BufferGeometry>();
  private readonly materials = new Map<string, T.MeshStandardMaterial>();
  private readonly textures: T.CanvasTexture[] = [];
  private readonly runners = new Map<number, RunnerVisual>();
  private readonly cube = this.geo(new T.BoxGeometry(1, 1, 1));
  private readonly platform: T.Mesh;
  private readonly barriers: T.Mesh[] = [];
  private readonly bag = new T.Group();
  private readonly observer: ResizeObserver;
  private elapsed = 0;
  private tick = -1;
  private snapshotAge = 0;
  private blend = 1;
  private interval = 0.1;
  private leg = -1;
  private lastOwner: number | null = null;
  private catchUntil = 0;
  private dropAt = -10;
  private inFlight = false;
  private finishLabel: T.CanvasTexture | undefined;
  private readonly destination = new T.Group();
  private disposed = false;
  private cameraReady = false;

  constructor(
    host: HTMLElement,
    private readonly localSlot: number,
    private readonly reduced: boolean,
  ) {
    // Creation errors deliberately reach the controller's lightweight fallback.
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.append(this.renderer.domElement);
    this.scene.background = new T.Color("#cbe4e5");
    this.scene.fog = new T.Fog("#cbe4e5", 32, 66);
    this.scene.add(new T.HemisphereLight("#fff8e6", "#66836a", 2.5));
    const sun = new T.DirectionalLight("#fff0cd", 2.1);
    sun.position.set(-8, 16, -5);
    this.scene.add(sun);
    this.box(0, -0.25, 15, 32, 0.4, 56, "#a8c499");
    this.box(0, -0.04, 15, 10, 0.1, 32, "#e4d7b8");
    // Left-hand detour remains visibly solid around the moving-platform gap.
    this.box(-3.7, 0.02, 11, 2.6, 0.08, 6, "#b4c6a0");
    this.box(
      1.4,
      0.025,
      11,
      7.2,
      0.08,
      RELAY_PLATFORM_END - RELAY_PLATFORM_START,
      "#80b8c5",
    );
    this.platform = this.box(0, 0.12, 11, 2, 0.24, 1.4, "#c49b73");
    this.box(1.4, 0.32, RELAY_OBSTACLE_Z, 7.2, 0.64, 0.8, "#db9b7d");
    for (const z of [17, 25])
      this.barriers.push(this.box(0, 0.75, z, 3.2, 1.5, 0.3, "#bc8da4"));
    for (let z = 2; z < 30; z += 3) {
      this.box(-4.8, 0.025, z, 0.16, 0.04, 0.7, "#fff2cb");
      this.box(4.8, 0.025, z, 0.16, 0.04, 0.7, "#fff2cb");
    }
    this.sign("Relay finish", 0, 3.2, 31);
    this.finishLabel = this.textures.at(-1);
    this.shop(-8, 1, "Mama Shop", "#e8ab85");
    this.shop(8, 10, "Kopi", "#b6c7a8");
    this.shop(-8, 27, "Palm Bay", "#a8ccd1");
    // A compact playground beyond the right verge, with no invented players.
    this.box(8, 0.12, 21, 4, 0.24, 5, "#e5ba95");
    for (const x of [6.7, 9.3])
      this.box(x, 1.2, 21, 0.16, 2.4, 0.16, "#cd947c");
    this.box(8, 2.4, 21, 3, 0.16, 0.16, "#cd947c");
    this.box(8, 0.6, 21, 1, 0.16, 0.6, "#8fb1a0");
    for (const x of [7.6, 8.4])
      this.box(x, 1.5, 21, 0.035, 1.8, 0.035, "#747965");
    this.sign("Playground", 8, 3, 21);
    const canopy = this.geo(new T.IcosahedronGeometry(1.2, 0));
    for (const [x, z] of [
      [-7, 8],
      [7, 3],
      [-7, 17],
      [7, 28],
    ]) {
      this.box(x, 0.8, z, 0.28, 1.6, 0.28, "#a98b6f");
      const leaf = new T.Mesh(canopy, this.mat("#80a889"));
      leaf.position.set(x, 2, z);
      this.scene.add(leaf);
    }
    const parcel = new T.Mesh(this.cube, this.mat("#d6a86f"));
    parcel.scale.set(0.46, 0.38, 0.34);
    this.bag.add(parcel);
    const ribbon = new T.Mesh(this.cube, this.mat("#f5e5b0"));
    ribbon.scale.set(0.08, 0.395, 0.35);
    this.bag.add(ribbon);
    this.scene.add(this.bag);
    const goal = new T.Mesh(
      this.geo(new T.TorusGeometry(1, 0.09, 6, 24)),
      this.mat("#ead58b"),
    );
    goal.rotation.x = -Math.PI / 2;
    this.destination.add(goal);
    this.destination.position.set(-3.2, 0.12, 29.3);
    this.scene.add(this.destination);
    // Increasing model z points away from the chase camera; x stays screen-right.
    for (const object of this.scene.children) object.position.z *= -1;
    const resize = () => {
      if (this.disposed || !host.clientWidth || !host.clientHeight) return;
      this.renderer.setSize(host.clientWidth, host.clientHeight, false);
      this.camera.aspect = host.clientWidth / host.clientHeight;
      this.camera.fov = host.clientWidth < host.clientHeight ? 68 : 54;
      this.camera.updateProjectionMatrix();
    };
    this.observer = new ResizeObserver(resize);
    this.observer.observe(host);
    resize();
  }
  private geo<G extends T.BufferGeometry>(geometry: G): G {
    this.geometries.add(geometry);
    return geometry;
  }
  private mat(color: string) {
    let material = this.materials.get(color);
    if (!material) {
      material = new T.MeshStandardMaterial({ color, roughness: 0.86 });
      this.materials.set(color, material);
    }
    return material;
  }
  private box(
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
  ) {
    const mesh = new T.Mesh(this.cube, this.mat(color));
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    this.scene.add(mesh);
    return mesh;
  }
  private sign(text: string, x: number, y: number, z: number) {
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.fillStyle = "#fff0cc";
    context.fillRect(0, 0, 384, 96);
    context.fillStyle = "#49645e";
    context.font = "bold 42px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(text, 192, 48);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    this.textures.push(texture);
    const material = new T.MeshStandardMaterial({
      map: texture,
      roughness: 1,
      side: T.DoubleSide,
    });
    this.materials.set(`sign:${text}`, material);
    const sign = new T.Mesh(this.geo(new T.PlaneGeometry(3.4, 0.85)), material);
    sign.position.set(x, y, z - 1.31);
    this.scene.add(sign);
  }
  private shop(x: number, z: number, name: string, color: string) {
    this.box(x, 1.5, z, 4, 3, 2.6, color);
    this.box(x, 3.08, z, 4.5, 0.24, 3, "#bb836b");
    this.box(x, 0.95, z - 1.32, 1.8, 1.9, 0.04, "#778b7d");
    this.sign(name, x, 2.5, z);
  }

  draw(snapshot: RelaySnapshot, dt: number) {
    if (this.disposed) return;
    const delta = Math.min(Math.max(dt, 0), 0.1);
    this.elapsed += delta;
    const state = snapshot.simulation;
    const changed =
      (state?.tick ?? 0) !== this.tick || this.leg !== (state?.leg ?? -1);
    const reset = this.leg !== (state?.leg ?? -1);
    if (changed) {
      this.interval = Math.min(
        0.25,
        Math.max(0.05, ((state?.tick ?? 0) - this.tick) / RELAY_TICK_RATE),
      );
      this.blend = 0;
      this.snapshotAge = 0;
      this.tick = state?.tick ?? 0;
      this.leg = state?.leg ?? -1;
      if (reset && this.finishLabel) {
        const canvas = this.finishLabel.image as HTMLCanvasElement;
        const context = canvas.getContext("2d");
        if (context) {
          context.fillStyle = "#fff0cc";
          context.fillRect(0, 0, 384, 96);
          context.fillStyle = "#49645e";
          context.font = "bold 42px sans-serif";
          context.textAlign = "center";
          context.textBaseline = "middle";
          context.fillText(RELAY_STOPS[state?.leg ?? 0], 192, 48);
          this.finishLabel.needsUpdate = true;
        }
      }
    }
    if (!changed) this.snapshotAge += Math.max(0, dt);
    this.blend = Math.min(1, this.blend + delta / this.interval);
    // Known phases advance at most one poll beyond the latest packet so catch
    // cues do not trail the server by a full interpolation interval. Runner
    // positions below still interpolate; gameplay remains server-authoritative.
    const renderTick = presentationTick(
      this.tick,
      this.snapshotAge,
      state?.status ?? "waiting",
    );
    const present = new Set(snapshot.players.map((player) => player.slot));
    for (const [slot, visual] of this.runners)
      if (!present.has(slot)) {
        disposeAvatar(visual.avatar);
        this.runners.delete(slot);
      }
    const config = relayConfig(snapshot.difficulty);
    for (const player of snapshot.players) {
      const runner = state?.runners.find(
        (runner) => runner.slot === player.slot,
      );
      const lookKey = JSON.stringify(player.look);
      let visual = this.runners.get(player.slot);
      if (visual && visual.lookKey !== lookKey) {
        disposeAvatar(visual.avatar);
        this.runners.delete(player.slot);
        visual = undefined;
      }
      if (!visual) {
        const look = player.look;
        const avatar = createAvatar(
          this.scene,
          0,
          0,
          outfits[look.outfit],
          skins[look.skin],
          look.hat,
          look,
        );
        const ring = new T.Mesh(
          this.geo(new T.TorusGeometry(0.42, 0.045, 6, 20)),
          this.mat(player.slot === this.localSlot ? "#fff3aa" : "#88b4b3"),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.025;
        avatar.root.add(ring);
        visual = {
          avatar,
          lookKey,
          from: new T.Vector3(),
          target: new T.Vector3(),
          moving: false,
        };
        this.runners.set(player.slot, visual);
        visual.target.set(
          runner?.x ?? -3.5 + player.slot * 0.8,
          0.1,
          -(runner?.z ?? 1),
        );
        visual.from.copy(visual.target);
        avatar.root.position.copy(visual.target);
      }
      const avatar = visual.avatar;
      avatar.root.visible = player.online;
      if (avatar.pet) avatar.pet.root.visible = player.online;
      if (changed) {
        visual.from.copy(avatar.root.position);
        visual.target.set(
          runner?.x ?? -3.5 + player.slot * 0.8,
          0.1,
          -(runner?.z ?? 1),
        );
        visual.moving = visual.from.distanceToSquared(visual.target) > 0.001;
        if (reset || visual.from.distanceToSquared(visual.target) > 36)
          visual.from.copy(visual.target);
      }
      avatar.root.position.lerpVectors(visual.from, visual.target, this.blend);
      const vault =
        runner && runner.vaultUntil > renderTick
          ? Math.sin(
              Math.PI *
                (1 - (runner.vaultUntil - renderTick) / config.vaultTicks),
            )
          : 0;
      avatar.root.position.y = 0.1 + Math.max(0, vault) * 0.95;
      const landingAge = runner ? renderTick - runner.vaultUntil : 20;
      const landing =
        !this.reduced &&
        runner &&
        runner.vaultUntil > 0 &&
        landingAge >= 0 &&
        landingAge < 10
          ? Math.sin((Math.PI * landingAge) / 10)
          : 0;
      avatar.root.scale.y = 1 - landing * 0.1;
      avatar.root.rotation.x =
        !this.reduced && runner && runner.stunUntil > renderTick ? 0.12 : 0;
      avatar.root.rotation.y = runner ? Math.PI - runner.yaw : Math.PI;
      const moving =
        visual.moving && this.blend < 1 && state?.status === "running";
      const gait =
        !this.reduced && moving ? Math.sin(this.elapsed * 12) * 0.65 : 0;
      avatar.legs[0].rotation.x = vault > 0 ? -0.65 : gait;
      avatar.legs[1].rotation.x = vault > 0 ? -0.4 : -gait;
      avatar.left.rotation.x = -gait * 0.7;
      avatar.right.rotation.x =
        state?.bag.owner === player.slot ? -0.85 : gait * 0.7;
      avatar.root.rotation.z =
        this.reduced || !moving ? 0 : Math.sin(this.elapsed * 12) * 0.025;
      const flight = state?.bag.flight;
      const catching =
        flight?.to === player.slot ||
        (state?.bag.owner === player.slot && this.elapsed < this.catchUntil);
      const throwing = flight?.from === player.slot;
      if (catching || throwing)
        avatar.left.rotation.x = avatar.right.rotation.x = -1.15;
      if (state?.status === "finished") {
        avatar.left.rotation.x = -2.5;
        avatar.right.rotation.x = -2.5;
        if (!this.reduced)
          avatar.root.position.y +=
            Math.abs(Math.sin(this.elapsed * 5 + player.slot)) * 0.16;
      }
      // Relay supplies limb poses; the shared detail pass applies the existing rig,
      // hats and pets without replacing those poses with the walking preset.
      animateDetails(
        avatar,
        this.elapsed,
        state?.status === "finished" ? "wave" : "relay",
        this.reduced,
      );
    }
    const phase = relayPlatform(
      renderTick,
      snapshot.difficulty,
      state?.leg ?? 0,
    );
    this.platform.position.set(phase.x, 0.12, -phase.z);
    this.platform.scale.set(phase.width, 0.24, phase.depth);
    relayBarriers(renderTick, snapshot.difficulty, state?.leg ?? 0).forEach(
      (barrier, index) => {
        const mesh = this.barriers[index];
        mesh.position.set(barrier.x, 0.75, -barrier.z);
        mesh.scale.set(barrier.width, 1.5, 0.9);
        // The collider is axis-aligned. Only the warning colour changes, never a
        // misleading rotating collision shape.
        mesh.material = this.mat(barrier.warning ? "#e1b562" : "#bc8da4");
      },
    );
    this.destination.visible =
      snapshot.solo ||
      state?.runners.filter((runner) => runner.connected).length === 1;
    this.bag.visible = !!state;
    if (state) {
      const bag = state.bag;
      if (this.inFlight && !bag.flight && bag.owner === null)
        this.dropAt = this.elapsed;
      this.inFlight = !!bag.flight;
      if (bag.owner !== this.lastOwner) {
        if (bag.owner === null && !bag.flight) this.dropAt = this.elapsed;
        else if (bag.owner !== null) this.catchUntil = this.elapsed + 0.4;
        this.lastOwner = bag.owner;
      }
      if (bag.flight) {
        const flight = bag.flight;
        const t = T.MathUtils.clamp(
          (renderTick - flight.startTick) / (flight.endTick - flight.startTick),
          0,
          1,
        );
        this.bag.position.set(
          T.MathUtils.lerp(flight.x0, flight.x1, t),
          0.9 + Math.sin(t * Math.PI) * 1.7,
          -T.MathUtils.lerp(flight.z0, flight.z1, t),
        );
        this.bag.rotation.set(
          0,
          this.reduced ? 0 : t * Math.PI * 2,
          this.reduced ? 0 : Math.sin(t * Math.PI) * 0.3,
        );
      } else if (bag.owner !== null && this.runners.has(bag.owner)) {
        const owner = this.runners.get(bag.owner)!.avatar.root;
        this.bag.position
          .copy(owner.position)
          .add(
            new T.Vector3(0.32, 0.78, 0.16).applyAxisAngle(
              new T.Vector3(0, 1, 0),
              owner.rotation.y,
            ),
          );
        this.bag.rotation.set(0, owner.rotation.y, 0);
      } else {
        const since = this.elapsed - this.dropAt;
        const bounce =
          this.reduced || since > 0.6
            ? 0
            : Math.abs(Math.sin(since * 17)) * (0.6 - since) * 0.3;
        this.bag.position.set(bag.x, 0.22 + bounce, -bag.z);
        this.bag.rotation.set(0, 0, 0.18);
      }
    }
    const local = this.runners.get(this.localSlot)?.avatar.root.position;
    if (local) {
      const target = new T.Vector3(local.x * 0.45, 5.6, local.z + 7.8);
      // Fixed-angle follow avoids head bob/shake; reduced motion also skips easing.
      if (!this.cameraReady || this.reduced || reset)
        this.camera.position.copy(target);
      else this.camera.position.lerp(target, 1 - Math.exp(-delta * 8));
      this.camera.lookAt(local.x * 0.45, 0.55, local.z - 3.3);
      this.cameraReady = true;
    }
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    for (const runner of this.runners.values()) disposeAvatar(runner.avatar);
    this.runners.clear();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    for (const texture of this.textures) texture.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
