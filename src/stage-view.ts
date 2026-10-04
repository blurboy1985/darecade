import * as T from "three";
import {
  animateDetails,
  createAvatar,
  disposeAvatar,
  type Avatar,
  type Look,
} from "./character";
import { outfits, skins } from "./state";
import type { StageShow } from "../shared/stage";

export const LANE_COLOURS = ["#ff8fb8", "#7fe3e0", "#ffe27a", "#b9a4ff"];
type Bit = { mesh: T.Mesh; velocity: T.Vector3; life: number };

/** The Open Stage in three.js: the avatar dancing, lamps, beams and a crowd. */
export class StageView {
  readonly renderer: T.WebGLRenderer;
  private readonly scene = new T.Scene();
  private readonly camera = new T.PerspectiveCamera(46, 1, 0.1, 80);
  private readonly geometries: T.BufferGeometry[] = [];
  private readonly materials: T.Material[] = [];
  private readonly avatar: Avatar;
  private readonly beams: T.Mesh[] = [];
  private readonly crowd: T.Group[] = [];
  private readonly confetti: Bit[] = [];
  private readonly observer: ResizeObserver;
  private move = { lane: -1, at: -9 };
  private flash = [0, 0, 0, 0];
  private judged = 0;
  private celebrated = 0;
  private disposed = false;
  constructor(
    host: HTMLElement,
    look: Look,
    private readonly reduced: boolean,
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.append(this.renderer.domElement);
    this.scene.background = new T.Color("#1b1d38");
    this.scene.fog = new T.Fog("#1b1d38", 9, 24);
    this.scene.add(new T.HemisphereLight("#cfd6ff", "#3a2f55", 1.5));
    const key = new T.DirectionalLight("#fff0d6", 2.4);
    key.position.set(2, 6, 6);
    this.scene.add(key);
    this.camera.position.set(0, 2.1, 6.4);
    this.camera.lookAt(0, 1.25, 0);
    const mesh = (
      geometry: T.BufferGeometry,
      material: T.Material,
      x: number,
      y: number,
      z: number,
      parent: T.Object3D = this.scene,
    ) => {
      const m = new T.Mesh(geometry, material);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const geo = <G extends T.BufferGeometry>(g: G) => {
      this.geometries.push(g);
      return g;
    };
    const mat = (color: string, glow = 0, opacity = 1) => {
      const m = new T.MeshStandardMaterial({
        color,
        roughness: 0.7,
        emissive: color,
        emissiveIntensity: glow,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      });
      this.materials.push(m);
      return m;
    };
    mesh(
      geo(new T.CylinderGeometry(3.4, 3.6, 0.3, 40)),
      mat("#2f3558"),
      0,
      -0.05,
      0,
    );
    mesh(
      geo(new T.CylinderGeometry(3.1, 3.1, 0.04, 40)),
      mat("#444b7a"),
      0,
      0.12,
      0,
    );
    const ground = mesh(
      geo(new T.PlaneGeometry(60, 60)),
      mat("#15172b"),
      0,
      -0.2,
      0,
    );
    ground.rotation.x = -Math.PI / 2;
    const cube = geo(new T.BoxGeometry(1, 1, 1));
    for (const x of [-3.2, 3.2]) {
      mesh(cube, mat("#3a4250"), x, 2.2, -2.4).scale.set(0.14, 4.4, 0.14);
      mesh(cube, mat("#232833"), x * 0.82, 0.75, -1.9).scale.set(0.8, 1.2, 0.6);
    }
    mesh(cube, mat("#3a4250"), 0, 4.4, -2.4).scale.set(6.6, 0.16, 0.16);
    // One lamp and one beam per lane; a beam lights up when its lane is hit.
    const cone = geo(new T.ConeGeometry(0.9, 4.2, 18, 1, true));
    LANE_COLOURS.forEach((colour, i) => {
      const x = -2.4 + i * 1.6;
      mesh(
        geo(new T.SphereGeometry(0.2, 10, 8)),
        mat(colour, 1.4),
        x,
        4.2,
        -2.4,
      );
      const beam = mesh(cone, mat(colour, 1, 0.12), x * 0.55, 2.1, -1.1);
      (beam.material as T.MeshStandardMaterial).side = T.DoubleSide;
      beam.rotation.z = -x * 0.1;
      this.beams.push(beam);
    });
    // The crowd stands between the camera and the stage and bounces with the hype.
    const head = geo(new T.SphereGeometry(0.24, 8, 6));
    const body = geo(new T.CylinderGeometry(0.2, 0.28, 0.7, 8));
    const dark = mat("#0f1122");
    for (let i = 0; i < 16; i++) {
      const fan = new T.Group();
      fan.position.set(
        -4.2 + (i % 8) * 1.2 + (i > 7 ? 0.6 : 0),
        -0.2,
        i > 7 ? 4.4 : 3.6,
      );
      mesh(body, dark, 0, 0.35, 0, fan);
      mesh(head, dark, 0, 0.9, 0, fan);
      this.scene.add(fan);
      this.crowd.push(fan);
    }
    const scrap = geo(new T.PlaneGeometry(0.12, 0.2));
    for (let i = 0; i < 60; i++) {
      const material = new T.MeshBasicMaterial({
        color: LANE_COLOURS[i % 4],
        side: T.DoubleSide,
        transparent: true,
      });
      this.materials.push(material);
      const m = mesh(scrap, material, 0, 0, 0);
      m.visible = false;
      this.confetti.push({ mesh: m, velocity: new T.Vector3(), life: 0 });
    }
    this.avatar = createAvatar(
      this.scene,
      0,
      0,
      outfits[look.outfit],
      skins[look.skin],
      look.hat,
      look,
    );
    this.avatar.root.position.y = 0.14;
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
  private burst() {
    if (this.reduced) return;
    for (const bit of this.confetti) {
      bit.life = 1.2 + Math.random() * 0.8;
      bit.mesh.position.set(
        (Math.random() - 0.5) * 5,
        3.6 + Math.random(),
        -0.5,
      );
      bit.velocity.set(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.5,
        Math.random() * 2,
      );
      bit.mesh.visible = true;
    }
  }
  /** show is null before the first show and between shows. */
  draw(show: StageShow | null, time: number, dt: number) {
    if (this.disposed) return;
    const a = this.avatar;
    animateDetails(a, time, "idle", this.reduced);
    if (
      show?.last &&
      show.counts.perfect +
        show.counts.good +
        show.counts.miss +
        show.counts.stray !==
        this.judged
    ) {
      this.judged =
        show.counts.perfect +
        show.counts.good +
        show.counts.miss +
        show.counts.stray;
      if (show.last.judgement === "perfect" || show.last.judgement === "good") {
        this.move = { lane: show.last.lane, at: time };
        this.flash[show.last.lane] =
          show.last.judgement === "perfect" ? 1 : 0.6;
      }
    }
    if (!show) this.judged = this.celebrated = 0;
    // Every combo of eight brings confetti down.
    const tier = show ? Math.floor(show.combo / 8) : 0;
    if (tier > this.celebrated) this.burst();
    this.celebrated = tier;
    // Each lane is its own dance move, held for a third of a second.
    const t = Math.min(1, (time - this.move.at) / 0.34);
    const swing = this.move.lane < 0 || t >= 1 ? 0 : Math.sin(t * Math.PI);
    const lane = this.move.lane;
    const groove =
      show && !show.ended && !this.reduced ? Math.sin(time * 7) : 0;
    a.root.position.set(
      (lane === 0 ? -0.5 : lane === 3 ? 0.5 : 0) * swing,
      0.14 + (lane === 2 ? 0.55 * swing : 0) + Math.abs(groove) * 0.04,
      0,
    );
    a.root.rotation.set(
      lane === 1 ? 0.35 * swing : 0,
      (lane === 0 ? -0.7 : lane === 3 ? 0.7 : 0) * swing + groove * 0.12,
      (lane === 0 ? 0.25 : lane === 3 ? -0.25 : 0) * swing,
    );
    a.root.scale.setScalar(1.35);
    a.root.scale.y = 1.35 * (lane === 1 ? 1 - 0.22 * swing : 1);
    const up = lane === 2 ? -2.7 * swing : 0;
    a.left.rotation.x = up + (lane === 0 ? -1.9 * swing : 0) - groove * 0.5;
    a.right.rotation.x = up + (lane === 3 ? -1.9 * swing : 0) + groove * 0.5;
    a.legs[0].rotation.x = groove * 0.25;
    a.legs[1].rotation.x = -groove * 0.25;
    this.beams.forEach((beam, i) => {
      this.flash[i] = Math.max(0, this.flash[i] - dt * 2.6);
      const material = beam.material as T.MeshStandardMaterial;
      material.opacity = 0.08 + this.flash[i] * 0.5;
      beam.rotation.x = this.reduced ? 0 : Math.sin(time * 1.3 + i) * 0.12;
    });
    const hype = show ? show.hype : 0.5;
    this.crowd.forEach((fan, i) => {
      fan.position.y =
        -0.2 +
        (this.reduced
          ? 0
          : Math.abs(Math.sin(time * (3 + hype * 5) + i * 1.7)) * hype * 0.35);
      // A booed-off show turns the crowd away.
      fan.rotation.y = show?.booed ? Math.PI : 0;
    });
    for (const bit of this.confetti) {
      if (bit.life <= 0) continue;
      bit.life -= dt;
      bit.velocity.y -= 2.2 * dt;
      bit.mesh.position.addScaledVector(bit.velocity, dt);
      bit.mesh.rotation.x += dt * 6;
      bit.mesh.rotation.z += dt * 4;
      (bit.mesh.material as T.MeshBasicMaterial).opacity = Math.min(
        1,
        bit.life,
      );
      bit.mesh.visible = bit.life > 0;
    }
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    disposeAvatar(this.avatar);
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
