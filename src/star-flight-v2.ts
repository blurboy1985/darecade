import { LegacyStarFlight } from "./legacy-star-flight.ts";
/** Version 2 adds participation, finite shields and escalating aimed waves. */
export class StarFlightV2 extends LegacyStarFlight {
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
  override tick(dt: number, dx = 0, dy = 0, input = false) {
    if (!this.modern) {
      super.tick(dt, dx, dy, input);
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
  override draw(c: CanvasRenderingContext2D, avatar?: CanvasImageSource) {
    super.draw(c);
    if (avatar) c.drawImage(avatar, this.x - 13, this.y - 20, 26, 28);
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
