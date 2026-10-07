import { resizeRenderer } from "./render-budget.ts";
import * as T from "three";

type Chip = {
  mesh: T.Mesh;
  velocity: T.Vector3;
  spin: T.Vector3;
  life: number;
};
type Ring = { mesh: T.Mesh; life: number };

/**
 * A transparent three.js layer over Brick Bash's 2D canvas: shattered bricks,
 * the boss and power-up rings. It only draws; the game never reads from it.
 * Game pixels map straight to scene units, with y flipped.
 */
export class BrickFx {
  private readonly renderer: T.WebGLRenderer;
  private readonly scene = new T.Scene();
  private readonly camera = new T.OrthographicCamera(0, 440, 0, -440, 1, 600);
  private readonly cube = new T.BoxGeometry(1, 1, 1);
  private readonly ringGeometry = new T.RingGeometry(0.82, 1, 32);
  private readonly materials: T.Material[] = [];
  private readonly chips: Chip[] = [];
  private readonly rings: Ring[] = [];
  private readonly boss = new T.Group();
  private readonly bossBody: T.MeshStandardMaterial;
  private readonly eyes: T.Mesh[] = [];
  private flinch = 0;
  private disposed = false;
  constructor(host: HTMLElement) {
    this.renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
    resizeRenderer(this.renderer, 440, 440, false);
    this.renderer.setClearColor(0, 0);
    const canvas = this.renderer.domElement;
    canvas.className = "brick-fx";
    canvas.setAttribute("aria-hidden", "true");
    host.append(canvas);
    this.camera.position.z = 300;
    this.scene.add(new T.HemisphereLight("#ffffff", "#5a6f7a", 2.2));
    const light = new T.DirectionalLight("#fff3d6", 2.4);
    light.position.set(-120, 200, 300);
    this.scene.add(light);
    for (let i = 0; i < 72; i++) {
      const material = new T.MeshStandardMaterial({
        roughness: 0.5,
        transparent: true,
      });
      this.materials.push(material);
      const mesh = new T.Mesh(this.cube, material);
      mesh.visible = false;
      this.scene.add(mesh);
      this.chips.push({
        mesh,
        velocity: new T.Vector3(),
        spin: new T.Vector3(),
        life: 0,
      });
    }
    for (let i = 0; i < 6; i++) {
      const material = new T.MeshBasicMaterial({
        transparent: true,
        side: T.DoubleSide,
      });
      this.materials.push(material);
      const mesh = new T.Mesh(this.ringGeometry, material);
      mesh.visible = false;
      this.scene.add(mesh);
      this.rings.push({ mesh, life: 0 });
    }
    // The Big Brick: a block with a brow and two eyes that follow its slide.
    this.bossBody = new T.MeshStandardMaterial({
      color: "#e8705f",
      roughness: 0.45,
      emissive: "#ffffff",
      emissiveIntensity: 0,
    });
    const dark = new T.MeshStandardMaterial({ color: "#2a1f2b" });
    const white = new T.MeshStandardMaterial({ color: "#fff7e6" });
    this.materials.push(this.bossBody, dark, white);
    const part = (
      material: T.Material,
      x: number,
      y: number,
      z: number,
      w: number,
      h: number,
      d: number,
    ) => {
      const mesh = new T.Mesh(this.cube, material);
      mesh.position.set(x, y, z);
      mesh.scale.set(w, h, d);
      this.boss.add(mesh);
      return mesh;
    };
    part(this.bossBody, 0, 0, 0, 92, 30, 30);
    part(dark, 0, 11, 16, 78, 5, 2);
    for (const x of [-22, 22]) {
      part(white, x, -1, 16, 16, 12, 2);
      this.eyes.push(part(dark, x, -2, 18, 6, 6, 2));
    }
    this.boss.visible = false;
    this.scene.add(this.boss);
  }
  private launch(
    x: number,
    y: number,
    color: string,
    count: number,
    speed: number,
    size: number,
  ) {
    for (const chip of this.chips) {
      if (!count) break;
      if (chip.life > 0) continue;
      count--;
      const angle = Math.random() * Math.PI * 2;
      chip.velocity.set(
        Math.cos(angle) * speed * (0.3 + Math.random()),
        Math.abs(Math.sin(angle)) * speed * (0.4 + Math.random()),
        (Math.random() - 0.5) * speed,
      );
      chip.spin.set(Math.random() * 9, Math.random() * 9, Math.random() * 9);
      chip.life = 0.6 + Math.random() * 0.5;
      chip.mesh.position.set(x, -y, 20);
      chip.mesh.scale.setScalar(size * (0.6 + Math.random() * 0.8));
      chip.mesh.visible = true;
      (chip.mesh.material as T.MeshStandardMaterial).color.set(color);
    }
  }
  private ring(x: number, y: number, color: string) {
    const ring = this.rings.find((r) => r.life <= 0);
    if (!ring) return;
    ring.life = 0.5;
    ring.mesh.position.set(x, -y, 30);
    ring.mesh.visible = true;
    (ring.mesh.material as T.MeshBasicMaterial).color.set(color);
  }
  /** A brick breaks into tumbling cubes of its own colour. */
  shatter(x: number, y: number, color: string) {
    this.launch(x, y, color, 7, 150, 7);
  }
  /** A capsule is caught. */
  power(x: number, y: number, color: string) {
    this.ring(x, y, color);
    this.launch(x, y, color, 6, 110, 4);
  }
  bossHit() {
    this.flinch = 1;
    this.launch(
      this.boss.position.x,
      -this.boss.position.y,
      "#ffd0a8",
      5,
      120,
      5,
    );
  }
  bossDown(x: number, y: number) {
    this.launch(x, y, "#e8705f", 26, 260, 11);
    this.launch(x, y, "#ffe27a", 14, 200, 6);
    this.ring(x, y, "#ffe27a");
    this.ring(x, y, "#ffffff");
  }
  bomb(x: number, y: number) {
    this.ring(x, y, "#ff6a55");
    this.launch(x, y, "#3a2a33", 10, 170, 5);
  }
  /** boss is its centre in game pixels and its slide direction, or null. */
  draw(dt: number, time: number, boss: { x: number; dir: number } | null) {
    if (this.disposed) return;
    for (const chip of this.chips) {
      if (chip.life <= 0) continue;
      chip.life -= dt;
      chip.velocity.y -= 520 * dt;
      chip.mesh.position.addScaledVector(chip.velocity, dt);
      chip.mesh.rotation.x += chip.spin.x * dt;
      chip.mesh.rotation.y += chip.spin.y * dt;
      chip.mesh.rotation.z += chip.spin.z * dt;
      (chip.mesh.material as T.MeshStandardMaterial).opacity = Math.min(
        1,
        chip.life * 3,
      );
      chip.mesh.visible = chip.life > 0;
    }
    for (const ring of this.rings) {
      if (ring.life <= 0) continue;
      ring.life -= dt;
      const t = 1 - ring.life / 0.5;
      ring.mesh.scale.setScalar(12 + t * 70);
      (ring.mesh.material as T.MeshBasicMaterial).opacity = Math.max(0, 1 - t);
      ring.mesh.visible = ring.life > 0;
    }
    this.boss.visible = !!boss;
    if (boss) {
      this.flinch = Math.max(0, this.flinch - dt * 4);
      this.boss.position.set(boss.x, -235 + Math.sin(time * 3) * 3, 0);
      // It leans into its slide and rocks back when struck.
      this.boss.rotation.set(
        -0.35 + this.flinch * 0.5,
        boss.dir * 0.28,
        Math.sin(time * 2.2) * 0.05 + this.flinch * 0.15,
      );
      this.boss.scale.setScalar(1 + this.flinch * 0.12);
      this.bossBody.emissiveIntensity = this.flinch * 0.9;
      for (const eye of this.eyes)
        eye.position.x = Math.sign(eye.position.x) * 22 + boss.dir * 3;
    }
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cube.dispose();
    this.ringGeometry.dispose();
    this.materials.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
