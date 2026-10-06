import type { EndReason } from "./action-games.ts";
type Enemy = {
  x: number;
  y: number;
  origin: number;
  phase: number;
  hp: number;
  boss: boolean;
};
export class LegacyStarFlight {
  elapsed = 0;
  score = 0;
  ended = false;
  endReason: EndReason = "";
  x = 220;
  y = 375;
  lives = 3;
  invulnerable = 0;
  shield = 0;
  fire = 0;
  spawn = 0;
  enemyFire = 1.8;
  seed = 71237;
  bossSpawned = false;
  bullets: {
    x: number;
    y: number;
    enemy: boolean;
    vx?: number;
    vy?: number;
  }[] = [];
  enemies: Enemy[] = [];
  pickups: { x: number; y: number }[] = [];
  random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  tick(dt: number, dx = 0, dy = 0) {
    if (this.ended) return;
    this.elapsed += dt;
    this.x = Math.max(20, Math.min(420, this.x + dx * 250 * dt));
    this.y = Math.max(120, Math.min(414, this.y + dy * 250 * dt));
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.shield = Math.max(0, this.shield - dt);
    this.fire -= dt;
    if (this.fire <= 0) {
      this.bullets.push({ x: this.x, y: this.y - 18, enemy: false });
      if (this.shield > 0)
        this.bullets.push(
          { x: this.x - 13, y: this.y - 10, enemy: false },
          { x: this.x + 13, y: this.y - 10, enemy: false },
        );
      this.fire = 0.17;
    }
    this.spawn -= dt;
    if (this.spawn <= 0) {
      const x = 30 + this.random() * 380;
      this.enemies.push({
        x,
        origin: x,
        y: -20,
        phase: this.random() * 6,
        hp: 1,
        boss: false,
      });
      this.spawn = Math.max(0.4, 0.95 - this.elapsed * 0.006);
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
      e.phase += dt * (e.boss ? 1 : 2);
      e.x = Math.max(
        20,
        Math.min(420, e.origin + Math.sin(e.phase) * (e.boss ? 140 : 25)),
      );
      if (!e.boss) e.y += (55 + this.elapsed * 0.7) * dt;
    }
    this.enemyFire -= dt;
    if (this.enemyFire <= 0) {
      this.enemies
        .filter((e) => e.y > 0 && e.y < 270)
        .slice(-4)
        .forEach((e) => {
          this.bullets.push({ x: e.x, y: e.y + 18, enemy: true });
          if (e.boss)
            this.bullets.push(
              { x: e.x - 26, y: e.y + 18, enemy: true },
              { x: e.x + 26, y: e.y + 18, enemy: true },
            );
        });
      this.enemyFire = 1.2;
    }
    for (const b of this.bullets) {
      b.y += (b.enemy ? 170 : -430) * dt;
      if (b.enemy) {
        if (Math.hypot(b.x - this.x, b.y - this.y) < 17) {
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
          if (e.hp === 0) {
            this.score += e.boss ? 250 : 20;
            if (this.score % 100 === 0) this.pickups.push({ x: e.x, y: e.y });
          }
        }
      }
    }
    for (const e of this.enemies)
      if (
        e.hp > 0 &&
        Math.hypot(e.x - this.x, e.y - this.y) < (e.boss ? 40 : 25)
      ) {
        this.hit();
        if (!e.boss) e.hp = 0;
      }
    for (const p of this.pickups) {
      p.y += 90 * dt;
      if (Math.hypot(p.x - this.x, p.y - this.y) < 25) {
        this.shield = 6;
        this.lives = Math.min(3, this.lives + 1);
        p.y = 500;
      }
    }
    this.bullets = this.bullets.filter((b) => b.y > -30 && b.y < 470);
    this.enemies = this.enemies.filter((e) => e.hp > 0 && e.y < 475);
    this.pickups = this.pickups.filter((p) => p.y < 460);
    if (this.elapsed >= 60 && !this.ended) {
      this.ended = true;
      this.endReason = "time";
    }
  }
  hit() {
    if (this.invulnerable > 0 || this.shield > 0) return;
    this.lives--;
    this.invulnerable = 1.5;
    if (this.lives <= 0 && !this.ended) {
      this.ended = true;
      this.endReason = "lives";
    }
  }
  draw(c: CanvasRenderingContext2D) {
    c.fillStyle = "#d9f1ed";
    c.fillRect(0, 0, 440, 440);
    for (let i = 0; i < 65; i++) {
      c.fillStyle = i % 3 ? "#a3c9c2" : "#ffffff";
      c.fillRect(
        (i * 83) % 440,
        (i * 61 + this.elapsed * 25) % 440,
        i % 3 ? 1 : 2,
        i % 3 ? 1 : 2,
      );
    }
    for (const b of this.bullets) {
      c.save();
      c.shadowColor = b.enemy ? "#ff6736" : "#13727f";
      c.shadowBlur = b.enemy ? 9 : 0;
      c.strokeStyle = "#552c39";
      c.lineWidth = 3;
      c.fillStyle = b.enemy ? "#ff4e27" : "#086f81";
      c.beginPath();
      c.roundRect(b.x - 3, b.y - 7, 6, 14, 3);
      c.fill();
      if (b.enemy) c.stroke();
      c.restore();
    }
    for (const e of this.enemies) {
      c.fillStyle = e.boss ? "#7850aa" : "#bb4058";
      c.beginPath();
      c.moveTo(e.x, e.y + 18);
      c.lineTo(e.x - (e.boss ? 38 : 16), e.y - 8);
      c.lineTo(e.x + (e.boss ? 38 : 16), e.y - 8);
      c.closePath();
      c.fill();
      c.fillStyle = "#253248";
      c.fillRect(e.x - 7, e.y - 5, 14, 6);
      if (e.boss) {
        c.fillStyle = "#3d4861";
        c.fillRect(e.x - 35, e.y - 25, 70, 4);
        c.fillStyle = "#d9bcec";
        c.fillRect(e.x - 35, e.y - 25, (70 * e.hp) / 30, 4);
      }
    }
    for (const p of this.pickups) {
      c.fillStyle = "#b3e68a";
      c.beginPath();
      c.arc(p.x, p.y, 10, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#3b6855";
      c.beginPath();
      c.moveTo(p.x - 5, p.y - 5);
      c.lineTo(p.x + 5, p.y - 5);
      c.lineTo(p.x + 4, p.y + 2);
      c.lineTo(p.x, p.y + 6);
      c.lineTo(p.x - 4, p.y + 2);
      c.closePath();
      c.fill();
    }
    c.globalAlpha = this.invulnerable > 0 ? 0.55 : 1;
    c.fillStyle = "#087d93";
    c.beginPath();
    c.moveTo(this.x, this.y - 20);
    c.lineTo(this.x - 16, this.y + 15);
    c.lineTo(this.x, this.y + 8);
    c.lineTo(this.x + 16, this.y + 15);
    c.closePath();
    c.fill();
    c.fillStyle = "#f2cb91";
    c.fillRect(this.x - 4, this.y + 13, 8, 8);
    c.globalAlpha = 1;
    if (this.shield > 0) {
      c.strokeStyle = "#1686b4";
      c.lineWidth = 2;
      c.beginPath();
      c.arc(this.x, this.y, 26, 0, Math.PI * 2);
      c.stroke();
    }
    const tag = this.shield > 0 ? "SHIELD!" : this.bossSpawned ? "BOSS!" : "";
    if (tag) {
      c.font = "700 20px Fredoka, sans-serif";
      c.textAlign = "left";
      c.lineWidth = 4;
      c.strokeStyle = "#0b1430";
      c.strokeText(tag, 16, 428);
      c.fillStyle = this.shield > 0 ? "#a9db6e" : "#ff9baf";
      c.fillText(tag, 16, 428);
    }
  }
}
