import { CoastRace, RACE_TICKS } from "./racing.ts";
import { HopRun, StarFlight, type EndReason } from "../src/action-games.ts";
export type { EndReason } from "../src/action-games.ts";
import { FishingRound, HoopsRound } from "./outdoor.ts";
import { qualifiesForPlayMedal } from "./play-medals.ts";
export const RULES_VERSION = 1;
/** 3: winding route and five seeded items. 2: three laps on the old loop. */
export const COAST_RULES_VERSION = 3;
export const rulesVersion = (game: string) =>
  game === "coast" ? COAST_RULES_VERSION : game === "swarm" ? 2 : RULES_VERSION;
export const TICK_RATE = 60;
/** Brick Bash: the Big Brick arrives at this second, or once the wall is gone. */
export const BRICK_BOSS_AT = 35;
export const BRICK_BOSS_HP = 8;
type Ball = { x: number; y: number; vx: number; vy: number };
export type Input = [number, number, number, number, number, number];
export type Event = [number, ...Input];
export type Replay = { version: number; ticks: number; events: Event[] };
export class Simulation {
  ticks = 0;
  elapsed = 0;
  score = 0;
  ended = false;
  /** Why the round stopped, for the player. Scores never depend on it. */
  endReason: EndReason = "";
  step = 0;
  axis = 0;
  snake = [
    { x: 7, y: 10 },
    { x: 6, y: 10 },
    { x: 5, y: 10 },
  ];
  direction = { x: 1, y: 0 };
  next = { x: 1, y: 0 };
  food = { x: 12, y: 10 };
  seed = 314159;
  paddle = 220;
  ball = { x: 220, y: 395, vx: 125, vy: -230 };
  lives = 3;
  bricks: { x: number; y: number; alive: boolean; color: string }[] = [];
  /** Brick Bash extras: more balls, falling capsules, and the boss with its bombs. */
  extra: Ball[] = [];
  drops: { x: number; y: number; kind: "wide" | "multi" }[] = [];
  /** Seconds of wide paddle left. */
  wide = 0;
  boss: { x: number; hp: number; dir: number; fire: number } | null = null;
  bossSpawned = false;
  bossDefeated = false;
  bombs: { x: number; y: number }[] = [];
  /** Seconds during which another bomb cannot hurt. */
  guard = 0;

  race: CoastRace | null;
  action: HopRun | StarFlight | null;
  outdoor: HoopsRound | FishingRound | null;
  id: string;
  constructor(id: string, seed = 314159, version = rulesVersion(id)) {
    if (
      ![
        "noodle",
        "brick",
        "hop",
        "swarm",
        "coast",
        "hoops",
        "fishing",
      ].includes(id)
    )
      throw Error("Invalid game.");
    this.id = id;
    this.seed = seed >>> 0;
    this.race = id === "coast" ? new CoastRace(this.seed) : null;
    this.outdoor =
      id === "hoops"
        ? new HoopsRound(this.seed)
        : id === "fishing"
          ? new FishingRound(this.seed)
          : null;
    this.action =
      id === "hop"
        ? new HopRun()
        : id === "swarm"
          ? new StarFlight(version >= 2)
          : null;
    if (this.action instanceof StarFlight) this.action.seed = this.seed;
    if (this.action instanceof HopRun) this.action.count = this.seed % 3;
    this.ball.vx = 110 + (this.seed % 41);
    for (let row = 0; row < 5; row++)
      for (let col = 0; col < 8; col++)
        this.bricks.push({
          x: 22 + col * 50,
          y: 48 + row * 25,
          alive: true,
          color: ["#b9e976", "#a9d8b3", "#8dcbd2", "#aca0e7", "#efad96"][row],
        });
  }
  advance(input: Input) {
    if (this.ended) return;
    const [dx, dy, turn, jump, px, py] = input;
    if (this.race) {
      this.race.advance(dx, dy, jump > 0, turn === 1);
      this.ticks = this.race.ticks;
      this.elapsed = this.ticks / TICK_RATE;
      this.score = this.race.score;
      this.ended = this.race.ended;
      return;
    }
    if (this.outdoor) {
      // One control: press to shoot, cast and hook; hold to reel.
      this.outdoor.advance(jump > 0);
      this.ticks = this.outdoor.ticks;
      this.elapsed = this.ticks / TICK_RATE;
      this.score = this.outdoor.score;
      this.ended = this.outdoor.ended || this.ticks >= 3600;
      return;
    }
    this.axis = this.id === "brick" && px >= 0 ? 0 : dx;
    if (turn >= 0) {
      const n = [
        { x: 0, y: -1 },
        { x: 1, y: 0 },
        { x: 0, y: 1 },
        { x: -1, y: 0 },
      ][turn];
      if (n.x !== -this.direction.x || n.y !== -this.direction.y) this.next = n;
    }
    if (this.action instanceof HopRun && jump) this.action.jump();
    // Pointer movement has the same maximum speed as keyboard movement.
    if (this.id === "brick" && px >= 0)
      this.paddle += Math.max(-6.5, Math.min(6.5, px - this.paddle));
    let ax = dx,
      ay = dy;
    if (this.action instanceof StarFlight && px >= 0) {
      ax = Math.max(-1, Math.min(1, (px - this.action.x) / 4.1667));
      ay = Math.max(-1, Math.min(1, (py - this.action.y) / 4.1667));
    }
    const length = Math.max(1, Math.hypot(ax, ay));
    this.ticks++;
    this.elapsed = this.ticks / TICK_RATE;
    if (this.id === "noodle") {
      this.step += 1 / TICK_RATE;
      if (this.step >= Math.max(0.095, 0.17 - this.score * 0.00015)) {
        this.step = 0;
        this.tickSnake();
      }
    } else
      for (let i = 0; i < 4 && !this.ended; i++) {
        if (this.action instanceof StarFlight)
          this.action.tick(1 / 240, ax / length, ay / length);
        else if (this.action) this.action.tick(1 / 240);
        else this.tickBrick(1 / 240);
        if (this.action) {
          this.score = this.action.score;
          if (this.action.ended) this.end(this.action.endReason);
        }
      }
    if (this.ticks >= 3600) this.end("time");
  }
  end(reason: EndReason = "") {
    // The first cause stands when two fall on the same tick.
    if (!this.ended) this.endReason = reason;
    this.ended = true;
  }
  random() {
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }
  tickSnake() {
    this.direction = this.next;
    const h = {
      x: this.snake[0].x + this.direction.x,
      y: this.snake[0].y + this.direction.y,
    };
    const eat = h.x === this.food.x && h.y === this.food.y;
    const wall = h.x < 0 || h.x >= 20 || h.y < 0 || h.y >= 20;
    if (
      wall ||
      this.snake
        .slice(0, eat ? undefined : -1)
        .some((p) => p.x === h.x && p.y === h.y)
    ) {
      this.end(wall ? "wall" : "tail");
      return;
    }
    this.snake.unshift(h);
    if (eat) {
      this.score += 20;

      if (this.snake.length === 400) {
        this.end("full");
        return;
      }
      do {
        this.food = {
          x: Math.floor(this.random() * 20),
          y: Math.floor(this.random() * 20),
        };
      } while (
        this.snake.some((p) => p.x === this.food.x && p.y === this.food.y)
      );
    } else this.snake.pop();
  }
  get paddleHalf() {
    return this.wide > 0 ? 66 : 46;
  }
  tickBrick(dt: number) {
    if (this.ended) return;
    const half = this.paddleHalf;
    this.paddle = Math.max(
      half,
      Math.min(440 - half, this.paddle + this.axis * 390 * dt),
    );
    this.wide = Math.max(0, this.wide - dt);
    this.guard = Math.max(0, this.guard - dt);
    if (
      !this.bossSpawned &&
      (this.elapsed >= BRICK_BOSS_AT || this.bricks.every((r) => !r.alive))
    ) {
      this.bossSpawned = true;
      this.boss = { x: 220, hp: BRICK_BOSS_HP, dir: 1, fire: 1.2 };
    }
    const boss = this.boss;
    if (boss) {
      boss.x += boss.dir * 70 * dt;
      if (boss.x < 60 || boss.x > 380) {
        boss.x = Math.max(60, Math.min(380, boss.x));
        boss.dir = -boss.dir;
      }
      boss.fire -= dt;
      if (boss.fire <= 0) {
        this.bombs.push({ x: boss.x, y: 252 });
        boss.fire = 1.5;
      }
    }
    const caught = (p: { x: number; y: number }) =>
      p.y >= 406 && p.y <= 424 && Math.abs(p.x - this.paddle) < half + 6;
    for (const bomb of this.bombs) {
      bomb.y += 150 * dt;
      if (caught(bomb)) {
        bomb.y = 999;
        if (this.guard > 0) continue;
        this.guard = 1.2;
        this.lives--;
        if (!this.lives) {
          this.end("lives");
          return;
        }
      }
    }
    this.bombs = this.bombs.filter((b) => b.y < 450);
    for (const drop of this.drops) {
      drop.y += 110 * dt;
      if (!caught(drop)) continue;
      drop.y = 999;
      if (drop.kind === "wide") this.wide = 8;
      else if (this.extra.length < 2) {
        // Two more balls fan out from the first.
        for (const turn of [-120, 120]) {
          const vx = Math.max(-245, Math.min(245, this.ball.vx + turn));
          this.extra.push({
            x: this.ball.x,
            y: this.ball.y,
            vx,
            vy: -Math.sqrt(290 * 290 - vx * vx),
          });
        }
      } else this.score += 30;
    }
    this.drops = this.drops.filter((d) => d.y < 450);
    for (const b of [this.ball, ...this.extra]) {
      this.stepBall(b, dt);
      if (this.ended) return;
    }
    this.extra = this.extra.filter((b) => b.y <= 450);
    if (this.ball.y > 450) {
      // A life is lost only when the last ball falls.
      if (this.extra.length) this.ball = this.extra.shift()!;
      else {
        this.lives--;
        if (!this.lives) {
          this.end("lives");
          return;
        }
        this.ball = { x: this.paddle, y: 390, vx: 125, vy: -230 };
      }
    }
  }
  private stepBall(b: Ball, dt: number) {
    const half = this.paddleHalf;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.x < 10) {
      b.x = 10;
      b.vx = Math.abs(b.vx);
    }
    if (b.x > 430) {
      b.x = 430;
      b.vx = -Math.abs(b.vx);
    }
    if (b.y < 10) {
      b.y = 10;
      b.vy = Math.abs(b.vy);
    }
    if (
      b.y > 403 &&
      b.y < 420 &&
      Math.abs(b.x - this.paddle) < half + 3 &&
      b.vy > 0
    ) {
      const fraction = (b.x - this.paddle) / (half + 2);
      b.vx = fraction * 245;
      b.vy = -Math.sqrt(290 * 290 - b.vx * b.vx);
      b.y = 403;
    }
    const boss = this.boss;
    if (boss && Math.abs(b.x - boss.x) < 53 && b.y > 215 && b.y < 255) {
      // The ball leaves the way it came.
      b.vy = b.vy > 0 ? -Math.abs(b.vy) : Math.abs(b.vy);
      b.y = b.vy > 0 ? 255 : 215;
      boss.hp--;
      this.score += 40;
      if (!boss.hp) {
        this.boss = null;
        this.bossDefeated = true;
        this.bombs = [];
        this.score += 300;
      }
    }
    for (const r of this.bricks)
      if (
        r.alive &&
        b.x > r.x - 7 &&
        b.x < r.x + 51 &&
        b.y > r.y - 7 &&
        b.y < r.y + 25
      ) {
        r.alive = false;
        b.vy = -b.vy;
        this.score += 15;
        // About one brick in six drops a capsule.
        if (this.random() < 0.17)
          this.drops.push({
            x: r.x + 22,
            y: r.y + 9,
            kind: this.random() < 0.5 ? "wide" : "multi",
          });
        break;
      }
    if (this.bossDefeated && this.bricks.every((r) => !r.alive)) {
      this.score += 100;
      this.end("cleared");
    }
  }
}
export function replayRun(game: string, seed: number, replay: Replay) {
  if (
    !replay ||
    (replay.version !== rulesVersion(game) &&
      !(game === "swarm" && replay.version === 1)) ||
    !Number.isInteger(replay.ticks) ||
    replay.ticks < 1 ||
    replay.ticks > (game === "coast" ? RACE_TICKS : 3600) ||
    !Array.isArray(replay.events) ||
    replay.events.length > (game === "coast" ? RACE_TICKS : 3600)
  )
    throw Error("Invalid replay.");
  let previous = -1;
  for (const e of replay.events) {
    if (
      !Array.isArray(e) ||
      e.length !== 7 ||
      !e.every(Number.isInteger) ||
      e[0] <= previous ||
      e[0] < 0 ||
      e[0] >= replay.ticks ||
      Math.abs(e[1]) > 1 ||
      Math.abs(e[2]) > 1 ||
      e[3] < -1 ||
      e[3] > 3 ||
      e[4] < 0 ||
      e[4] > 1 ||
      e[5] < -1 ||
      e[5] > 440 ||
      e[6] < -1 ||
      e[6] > 440
    )
      throw Error("Invalid replay inputs.");
    previous = e[0];
  }
  const sim = new Simulation(game, seed, replay.version);
  const movementSeconds = new Set<number>();
  let input: Input = [0, 0, -1, 0, -1, -1],
    cursor = 0;
  for (let tick = 0; tick < replay.ticks; tick++) {
    if (sim.ended) throw Error("Replay continues after game over.");
    if (replay.events[cursor]?.[0] === tick)
      input = replay.events[cursor++].slice(1) as Input;
    const paddle = sim.paddle;
    const ship =
      sim.action instanceof StarFlight
        ? { x: sim.action.x, y: sim.action.y }
        : null;
    sim.advance(input);
    // Width capsules may clamp an idle paddle. Only movement toward a
    // requested direction counts as participation, never that automatic clamp.
    const paddleDirection =
      input[4] >= 0 ? Math.sign(input[4] - paddle) : input[0];
    if (
      (game === "brick" && paddleDirection * (sim.paddle - paddle) > 0.001) ||
      (ship &&
        sim.action instanceof StarFlight &&
        Math.hypot(sim.action.x - ship.x, sim.action.y - ship.y) > 0.001)
    )
      movementSeconds.add(Math.floor(tick / TICK_RATE));
  }
  if (!sim.ended) throw Error("Finish the round before submitting.");
  const played = { seconds: sim.ticks / TICK_RATE, score: sim.score };
  let playMedalEligible = false;
  if (sim.race)
    playMedalEligible = qualifiesForPlayMedal({
      game: "coast",
      finished: sim.race.result().finished,
    });
  else if (sim.outdoor instanceof FishingRound)
    playMedalEligible = qualifiesForPlayMedal({
      game: "fishing",
      completed: sim.outdoor.ended,
      catches: sim.outdoor.catches.length,
    });
  else if (sim.outdoor instanceof HoopsRound)
    playMedalEligible = qualifiesForPlayMedal({
      game: "hoops",
      completed: sim.outdoor.ended,
      attempts: sim.outdoor.attempts,
      made: sim.outdoor.made,
    });
  else if (game === "noodle" || game === "hop")
    playMedalEligible = qualifiesForPlayMedal({ game, ...played });
  else if (game === "brick" || game === "swarm")
    playMedalEligible = qualifiesForPlayMedal({
      game,
      ...played,
      movementSeconds: movementSeconds.size,
    });
  return {
    score: sim.score,
    ticks: sim.ticks,
    playMedalEligible,
    ...(sim.race ? { race: sim.race.result() } : {}),
    ...(sim.outdoor ? { outdoor: sim.outdoor.result() } : {}),
  };
}
