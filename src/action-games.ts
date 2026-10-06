import { LegacyStarFlight } from "./legacy-star-flight.ts";
// The new games keep simulation separate from the browser controls and renderer.
/** Why a round stopped. Recorded for the player; it never changes a score. */
export type EndReason =
  | "idle"
  | ""
  | "time"
  | "wall"
  | "tail"
  | "full"
  | "lives"
  | "cleared"
  | "crate"
  | "gap";
export const HOP_POWER_SECONDS = 5;
export class HopRun {
  elapsed = 0;
  score = 0;
  /** Points from hazards and smashes, on top of the steady time points. */
  bonus = 0;
  ended = false;
  endReason: EndReason = "";
  height = 0;
  velocity = 0;
  spawn = 1.25;
  hazards: {
    x: number;
    width: number;
    kind: "gap" | "crate";
    passed: boolean;
  }[] = [];
  count = 0;
  /** True once the runner has stepped off into a gap. */
  falling = false;
  /** Seconds of star power left: crates smash and gaps are bridged. */
  power = 0;
  smashed = 0;
  stars: { x: number }[] = [];
  private starTimer = 7;
  private bridged = false;
  jump() {
    // A jump pressed just after stepping off an edge still counts.
    if (
      !this.ended &&
      (this.height === 0 || (this.falling && this.height > -12))
    ) {
      this.velocity = 480;
      this.falling = false;
      return true;
    }
    return false;
  }
  tick(dt: number) {
    if (this.ended) return;
    this.elapsed += dt;
    this.power = Math.max(0, this.power - dt);
    const speed = 165 + Math.min(90, this.elapsed * 1.5);
    this.spawn -= dt;
    if (this.spawn <= 0) {
      const kind = this.count++ % 3 === 2 ? "gap" : "crate";
      this.hazards.push({
        x: 460,
        width: kind === "gap" ? 65 : 28,
        kind,
        passed: false,
      });
      this.spawn = 1.55 + (this.count % 3) * 0.18;
    }
    this.starTimer -= dt;
    if (this.starTimer <= 0) {
      this.stars.push({ x: 460 });
      this.starTimer = 13;
    }
    for (const h of this.hazards) h.x -= speed * dt;
    for (const s of this.stars) s.x -= speed * dt;
    // The runner only falls when the gap is under the middle of its feet.
    const over = this.hazards.some(
      (h) => h.kind === "gap" && h.x < 84 && h.x + h.width > 92,
    );
    // A bridge under the runner holds until solid ground, even if power ends.
    this.bridged = over && (this.power > 0 || this.bridged);
    this.velocity -= 1400 * dt;
    this.height += this.velocity * dt;
    if (this.height <= 0 && !this.falling) {
      if (over && !this.bridged) this.falling = true;
      else {
        this.height = 0;
        this.velocity = 0;
      }
    }
    if (this.height < -90) {
      this.ended = true;
      this.endReason = "gap";
      return;
    }
    for (const h of this.hazards) {
      if (
        h.kind === "crate" &&
        h.x < 97 &&
        h.x + h.width > 79 &&
        this.height < 36 &&
        !this.falling
      ) {
        if (this.power > 0) {
          h.x = -100;
          h.passed = true;
          this.smashed++;
          this.bonus += 50;
          continue;
        }
        this.ended = true;
        this.endReason = "crate";
        return;
      }
      if (!h.passed && h.x + h.width < 76 && !this.falling) {
        h.passed = true;
        this.bonus += 25;
      }
    }
    // Stars float at jump height.
    for (const s of this.stars)
      if (s.x < 106 && s.x > 62 && this.height > 22) {
        s.x = -100;
        this.power = HOP_POWER_SECONDS;
        this.bonus += 25;
      }
    this.hazards = this.hazards.filter((h) => h.x + h.width > -10);
    this.stars = this.stars.filter((s) => s.x > -20);
    this.score = Math.floor(this.elapsed * 12) + this.bonus;
    if (this.elapsed >= 60) {
      this.ended = true;
      this.endReason = "time";
    }
  }
  draw(c: CanvasRenderingContext2D) {
    c.fillStyle = "#243b50";
    c.fillRect(0, 0, 440, 440);
    for (let i = 0; i < 9; i++) {
      const x = ((((i * 65 - this.elapsed * 13) % 585) + 585) % 585) - 70;
      c.fillStyle = i % 2 ? "#344c60" : "#3e5668";
      c.fillRect(x, 130 + (i % 3) * 24, 48, 200);
      c.fillStyle = "#b6c599";
      for (let y = 160 + (i % 3) * 24; y < 320; y += 30)
        c.fillRect(x + 10, y, 7, 10);
    }
    c.fillStyle = "#efcc92";
    c.beginPath();
    c.arc(351, 70, 27, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#b1c8a0";
    c.fillRect(0, 340, 440, 12);
    c.fillStyle = "#657c72";
    c.fillRect(0, 352, 440, 88);
    for (const h of this.hazards) {
      if (h.kind === "gap") {
        c.fillStyle = "#182d41";
        c.fillRect(h.x, 339, h.width, 101);
        c.fillStyle = "#edbe81";
        c.fillRect(h.x - 5, 340, 5, 12);
        c.fillRect(h.x + h.width, 340, 5, 12);
        // Star power lays a bridge across the gap.
        if (this.power > 0 || (this.bridged && h.x < 100)) {
          c.fillStyle = "#ffe27a";
          for (let x = h.x; x < h.x + h.width; x += 13)
            c.fillRect(x + 1, 340, 11, 5);
        }
      } else {
        c.fillStyle = "#dcaa73";
        c.fillRect(h.x, 300, h.width, 40);
        c.strokeStyle = "#947851";
        c.lineWidth = 3;
        c.strokeRect(h.x + 3, 304, h.width - 6, 32);
        c.beginPath();
        c.moveTo(h.x + 3, 304);
        c.lineTo(h.x + h.width - 3, 336);
        c.stroke();
      }
    }
    for (const s of this.stars) {
      const y = 262 + Math.sin(this.elapsed * 5) * 4;
      c.fillStyle = "#ffe27a";
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2,
          r = i % 2 ? 6 : 13;
        c.lineTo(s.x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      c.fill();
    }
    const y = 340 - this.height;
    if (this.power > 0) {
      // A glow that blinks through the last second, and a streak behind.
      const on = this.power > 1 || Math.sin(this.elapsed * 40) > 0;
      c.fillStyle = on ? "#ffe27a66" : "#ffe27a22";
      c.beginPath();
      c.arc(88, y - 24, 30, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#ffe27a55";
      for (let i = 1; i <= 3; i++)
        c.fillRect(76 - i * 14, y - 40 + i * 4, 10, 4);
      c.fillStyle = "#172e38";
      c.fillRect(150, 22, 140, 10);
      c.fillStyle = "#ffe27a";
      c.fillRect(152, 24, (136 * this.power) / HOP_POWER_SECONDS, 6);
    }
    c.fillStyle = "#bce98e";
    c.fillRect(76, y - 31, 23, 22);
    c.fillStyle = "#f1cca1";
    c.fillRect(77, y - 47, 22, 17);
    c.fillStyle = "#41435a";
    c.fillRect(76, y - 49, 24, 7);
    c.fillRect(93, y - 39, 3, 4);
    c.fillStyle = "#eae7ce";
    const swing = this.height ? 0 : Math.sin(this.elapsed * 18) * 5;
    c.fillRect(77 + swing, y - 9, 8, 9);
    c.fillRect(90 - swing, y - 9, 8, 9);
  }
}

/** Version 2 adds participation, finite shields and escalating aimed waves. */
export class StarFlight extends LegacyStarFlight {
  modern: boolean;
  shieldHits = 0;
  activeSeconds = 0;
  idleSeconds = 0;
  private previousX = 220;
  private previousY = 375;
  constructor(modern = true) {
    super();
    this.modern = modern;
    if (modern) this.enemyFire = 4;
  }
  get wave() {
    return 1 + Math.floor(this.elapsed / 12);
  }
  override tick(dt: number, dx = 0, dy = 0) {
    if (!this.modern) {
      super.tick(dt, dx, dy);
      return;
    }
    if (this.ended) return;
    this.elapsed += dt;
    this.x = Math.max(20, Math.min(420, this.x + dx * 250 * dt));
    this.y = Math.max(120, Math.min(414, this.y + dy * 250 * dt));
    const moved =
      Math.hypot(this.x - this.previousX, this.y - this.previousY) > 0.001;
    this.previousX = this.x;
    this.previousY = this.y;
    this.idleSeconds = moved ? 0 : this.idleSeconds + dt;
    if (moved) this.activeSeconds += dt;
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.shield = Math.max(0, this.shield - dt);
    if (!this.shield) this.shieldHits = 0;
    this.fire -= dt;
    // Auto-fire is earned by movement; an unattended ship cannot farm points.
    if (this.fire <= 0 && this.activeSeconds > 0 && this.idleSeconds < 2) {
      this.bullets.push({ x: this.x, y: this.y - 18, enemy: false });
      this.fire = 0.17;
    }
    this.spawn -= dt;
    if (this.spawn <= 0) {
      const x = 45 + this.random() * 350;
      this.enemies.push({
        x,
        origin: x,
        y: -20,
        phase: this.random() * 6,
        hp: 1,
        boss: false,
      });
      this.spawn = Math.max(0.32, 1.25 - this.wave * 0.16);
    }
    if (this.elapsed >= 35 && !this.bossSpawned) {
      this.bossSpawned = true;
      this.enemies.push({
        x: 220,
        origin: 220,
        y: 55,
        phase: 0,
        hp: 30,
        boss: true,
      });
    }
    for (const e of this.enemies) {
      e.phase += dt * (e.boss ? (e.hp < 15 ? 2 : 1) : 2);
      e.x = Math.max(
        25,
        Math.min(415, e.origin + Math.sin(e.phase) * (e.boss ? 140 : 25)),
      );
      if (!e.boss) e.y += (42 + this.wave * 9) * dt;
    }
    this.enemyFire -= dt;
    if (this.enemyFire <= 0) {
      for (const e of this.enemies
        .filter((e) => e.y > 0 && e.y < 240)
        .slice(-Math.min(6, this.wave + 1))) {
        const speed = 80 + this.wave * 18,
          aim = Math.atan2(this.y - e.y, this.x - e.x);
        const spread = e.boss
          ? e.hp < 15
            ? [-0.42, -0.21, 0, 0.21, 0.42]
            : [-0.25, 0, 0.25]
          : this.wave >= 3
            ? [-0.15, 0.15]
            : [0];
        for (const offset of spread)
          this.bullets.push({
            x: e.x,
            y: e.y + 18,
            enemy: true,
            vx: Math.cos(aim + offset) * speed,
            vy: Math.sin(aim + offset) * speed,
          });
      }
      this.enemyFire = Math.max(0.55, 1.9 - this.wave * 0.22);
    }
    for (const b of this.bullets) {
      b.x += (b.vx || 0) * dt;
      b.y += (b.enemy ? b.vy || 130 : -430) * dt;
      if (b.enemy) {
        if (Math.hypot(b.x - this.x, b.y - this.y) < 14) {
          b.y = 500;
          this.hit();
        }
      } else {
        const e = this.enemies.find(
          (e) =>
            e.hp > 0 &&
            Math.abs(e.x - b.x) < (e.boss ? 37 : 16) &&
            Math.abs(e.y - b.y) < (e.boss ? 24 : 15),
        );
        if (e) {
          b.y = -50;
          e.hp--;
          if (!e.hp) {
            if (this.idleSeconds < 2) this.score += e.boss ? 250 : 20;
            if (this.score > 0 && this.score % 100 === 0)
              this.pickups.push({ x: e.x, y: e.y });
          }
        }
      }
    }
    for (const e of this.enemies)
      if (
        e.hp > 0 &&
        Math.hypot(e.x - this.x, e.y - this.y) < (e.boss ? 40 : 23)
      ) {
        this.hit();
        if (!e.boss) e.hp = 0;
      }
    for (const p of this.pickups) {
      p.y += 75 * dt;
      if (Math.hypot(p.x - this.x, p.y - this.y) < 25) {
        this.shield = 8;
        this.shieldHits = 2;
        p.y = 500;
      }
    }
    this.bullets = this.bullets.filter(
      (b) => b.y > -30 && b.y < 470 && b.x > -20 && b.x < 460,
    );
    this.enemies = this.enemies.filter((e) => e.hp > 0 && e.y < 475);
    this.pickups = this.pickups.filter((p) => p.y < 460);
    if (this.idleSeconds >= 12) {
      this.ended = true;
      this.endReason = "idle";
    } else if (this.elapsed >= 60) {
      this.ended = true;
      this.endReason = "time";
    }
  }
  override hit() {
    if (!this.modern) {
      super.hit();
      return;
    }
    if (this.invulnerable > 0) return;
    if (this.shield > 0 && this.shieldHits > 0) {
      this.shieldHits--;
      if (!this.shieldHits) this.shield = 0;
      this.invulnerable = 0.35;
      return;
    }
    this.lives--;
    this.invulnerable = 2;
    if (this.lives <= 0) {
      this.ended = true;
      this.endReason = "lives";
    }
  }
  override draw(c: CanvasRenderingContext2D) {
    super.draw(c);
    c.font = "bold 13px sans-serif";
    c.textAlign = "left";
    c.fillStyle = "#294d63";
    const boss = this.enemies.find((e) => e.boss);
    c.fillText(
      boss ? `BOSS · PHASE ${boss.hp < 15 ? 2 : 1}` : `WAVE ${this.wave}`,
      14,
      22,
    );
    if (this.shield > 0)
      c.fillText(
        `SHIELD · ${this.shieldHits} hits · ${Math.ceil(this.shield)}s`,
        14,
        42,
      );
  }
}
