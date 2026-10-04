import type { CabinetId } from "./catalog";
import { games } from "./catalog";
import type { Sfx } from "./audio";
import type { FxEvent } from "./arcade-fx";
import { HopRun, StarFlight } from "./action-games";
import {
  Simulation,
  RULES_VERSION,
  type Input,
  type Replay,
} from "../shared/simulation";
export class ArcadeGame extends Simulation {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  frame = 0;
  last = 0;
  started = false;
  paused = false;
  keys = new Set<string>();
  pointerStart = { x: 0, y: 0 };
  accumulator = 0;
  input: Input = [0, 0, -1, 0, -1, -1];
  events: Replay["events"] = [];
  previous = "";
  shownScore = 0;
  lastPop = 0;
  /** Optional cosmetic hook for visual effects; never affects the simulation. */
  onFx: ((event: FxEvent, amount: number) => void) | null = null;
  onTime: ((secondsLeft: number) => void) | null = null;
  onPause: ((paused: boolean) => void) | null = null;
  constructor(
    id: Exclude<CabinetId, "coast">,
    public container: HTMLElement,
    public finish: (score: number, replay: Replay) => void,
    public sound: (name: Sfx) => void,
    seed = 314159,
  ) {
    super(id, seed);
    const info = games[id];
    container.innerHTML = `<div class="game-stats"><span class="stat-pill score-pill"><small>SCORE</small><b id="run-score">0</b></span><span id="run-state">READY</span><span class="stat-pill time-pill"><small>TIME</small><b id="run-time">60</b></span></div><div class="game-screen"><div class="game-pops" aria-hidden="true"></div><canvas width="440" height="440" aria-label="${id === "noodle" ? "Noodle Run: use arrow keys or swipe to eat dumplings" : "Brick Bash: drag or use left and right arrows to move the paddle"}" tabindex="0"></canvas><div class="game-cover" id="game-cover"><span class="eyebrow">READY?</span><h3>${id === "noodle" ? "Follow your appetite." : "Make a little noise."}</h3><p>${id === "noodle" ? "Eat dumplings. Grow your noodle.<br>Watch the walls and your own tail." : "Bounce the ball. Break every brick.<br>You have three chances."}</p><button class="primary" id="start-game">PLAY <span>▶</span></button></div></div><div class="game-controls"><span>${id === "noodle" ? "Arrow keys / WASD · swipe to turn" : "← → / A D · drag to move"}</span><button class="text-button" id="pause-game" disabled>Pause</button></div><div class="dpad" aria-label="Game direction controls"><button data-dir="up" aria-label="Up">↑</button><button data-dir="left" aria-label="Left">←</button><button data-dir="down" aria-label="Down">↓</button><button data-dir="right" aria-label="Right">→</button></div>`;
    this.canvas = container.querySelector("canvas")!;
    this.ctx = this.canvas.getContext("2d")!;
    this.canvas.setAttribute("aria-label", `${info.name}: ${info.controls}`);
    container.querySelector(".game-cover h3")!.textContent = info.tagline;
    container.querySelector(".game-cover p")!.textContent = info.rule;
    container.querySelector(".game-controls>span")!.textContent = info.controls;
    if (matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0)
      container.querySelector(".game-controls>span")!.textContent = {
        noodle: "Swipe to turn",
        brick: "Drag to move",
        hop: "Tap to jump",
        swarm: "Drag to fly",
      }[id];
    if (id === "hop")
      container.querySelector(".dpad")!.innerHTML =
        '<button data-dir="up" class="jump-control" aria-label="Jump">JUMP ↑</button>';
    if (id === "brick")
      container
        .querySelectorAll('[data-dir="up"],[data-dir="down"]')
        .forEach((e) => e.remove());
    container.querySelector("#start-game")!.addEventListener("click", () => {
      this.started = true;
      container.querySelector("#game-cover")!.remove();
      container
        .querySelector(".game-screen")!
        .insertAdjacentHTML(
          "beforeend",
          '<div class="go-splash" aria-hidden="true">GO!</div>',
        );
      setTimeout(() => container.querySelector(".go-splash")?.remove(), 1100);
      container.querySelector("#run-state")!.textContent = this.status();
      this.onFx?.("start", 0);
      (container.querySelector("#pause-game") as HTMLButtonElement).disabled =
        false;
      this.canvas.focus();
      this.sound("start");
    });
    container
      .querySelector("#pause-game")!
      .addEventListener("click", () => this.togglePause());
    container.querySelectorAll<HTMLButtonElement>("[data-dir]").forEach((b) => {
      b.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        b.setPointerCapture(e.pointerId);
        const dir = b.dataset.dir!;
        this.input[4] = -1;
        this.input[5] = -1;
        this.turn(dir);
        this.keys.add(`arrow${dir}`);
      });
      b.addEventListener("pointerup", () => this.keys.clear());
      b.addEventListener("pointercancel", () => this.keys.clear());
    });
    this.canvas.addEventListener("pointerdown", this.pointerDown);
    this.canvas.addEventListener("pointermove", this.pointerMove);
    this.canvas.addEventListener("pointerup", this.pointerUp);
    window.addEventListener("keydown", this.keyDown);
    window.addEventListener("keyup", this.keyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.hidden);
    this.frame = requestAnimationFrame(this.loop);
  }
  turn(dir: string) {
    if (!this.started || this.paused || this.ended) return;
    if (this.id === "hop" && dir === "up") this.input[3] = 1;
    else this.input[2] = ["up", "right", "down", "left"].indexOf(dir);
  }
  private keyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (this.id === "hop" && [" ", "arrowup", "w"].includes(k)) {
      e.preventDefault();
      if (!e.repeat) this.turn("up");
      return;
    }
    const map: Record<string, string> = {
      arrowup: "up",
      w: "up",
      arrowdown: "down",
      s: "down",
      arrowleft: "left",
      a: "left",
      arrowright: "right",
      d: "right",
    };
    if (map[k]) {
      e.preventDefault();
      this.input[4] = -1;
      this.input[5] = -1;
      this.keys.add(k);
      this.turn(map[k]);
    }
    if (k === "p" && !e.repeat) this.togglePause();
  };
  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
  private onBlur = () => {
    this.keys.clear();
    if (this.started && !this.ended && !this.paused) this.togglePause();
  };
  private hidden = () => {
    if (document.hidden) this.onBlur();
  };
  private pointerDown = (e: PointerEvent) => {
    this.pointerStart = { x: e.clientX, y: e.clientY };
    this.canvas.setPointerCapture(e.pointerId);
    if (this.id === "brick") this.setPaddle(e);
    if (this.id === "hop") this.turn("up");
    if (this.id === "swarm") this.setShip(e);
  };
  private pointerMove = (e: PointerEvent) => {
    if (this.id === "brick" && e.buttons) this.setPaddle(e);
    if (this.id === "swarm" && this.canvas.hasPointerCapture(e.pointerId))
      this.setShip(e);
  };
  private pointerUp = (e: PointerEvent) => {
    if (this.id !== "noodle") return;
    const dx = e.clientX - this.pointerStart.x,
      dy = e.clientY - this.pointerStart.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 10) return;
    this.turn(
      Math.abs(dx) > Math.abs(dy)
        ? dx > 0
          ? "right"
          : "left"
        : dy > 0
          ? "down"
          : "up",
    );
  };
  private setPaddle(e: PointerEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.input[4] = Math.round(
      Math.max(46, Math.min(394, ((e.clientX - r.left) / r.width) * 440)),
    );
  }
  private setShip(e: PointerEvent) {
    if (!this.started || this.paused || this.ended) return;
    const r = this.canvas.getBoundingClientRect();
    this.input[4] = Math.round(
      Math.max(20, Math.min(420, ((e.clientX - r.left) / r.width) * 440)),
    );
    this.input[5] = Math.round(
      Math.max(120, Math.min(414, ((e.clientY - r.top) / r.height) * 440)),
    );
  }

  togglePause() {
    if (!this.started || this.ended) return;
    this.paused = !this.paused;
    this.keys.clear();
    this.container.querySelector("#pause-game")!.textContent = this.paused
      ? "Resume"
      : "Pause";
    this.container.querySelector("#run-state")!.textContent = this.paused
      ? "PAUSED"
      : this.status();
    this.container.classList.toggle("is-paused", this.paused);
    this.onPause?.(this.paused);
  }
  /** Hearts for games with lives, otherwise a simple GO! tag. */
  private status() {
    if (this.id !== "brick" && this.id !== "swarm") return "GO!";
    return "♥".repeat(Math.max(0, this.snapshot().lives));
  }
  /** Read-only view of the simulation, used to pick sound effects. */
  private snapshot() {
    const a = this.action;
    return {
      score: this.score,
      lives: a instanceof StarFlight ? a.lives : this.lives,
      vy: this.ball.vy,
      jump: a instanceof HopRun ? a.velocity : 0,
      shield: a instanceof StarFlight ? a.shield : 0,
      boss: a instanceof StarFlight ? a.bossSpawned : false,
      shots:
        a instanceof StarFlight ? a.bullets.filter((b) => !b.enemy).length : 0,
      ended: this.ended,
    };
  }
  private cue(b: ReturnType<ArcadeGame["snapshot"]>) {
    const n = this.snapshot();
    const gained = n.score - b.score;
    if (this.onFx) {
      if (gained >= 200) this.onFx("big", gained);
      if (n.lives < b.lives || (n.ended && !b.ended)) this.onFx("hurt", 0);
      if (n.boss && !b.boss) this.onFx("boss", 0);
      if (n.shield > b.shield + 1) this.onFx("power", 0);
      if (n.lives !== b.lives)
        this.container.querySelector("#run-state")!.textContent = this.status();
    }
    if (n.ended && !b.ended && this.id !== "hop")
      this.sound(this.id === "swarm" ? "bigboom" : "hurt");
    else if (n.ended && !b.ended) this.sound("hurt");
    if (n.lives < b.lives) this.sound("hurt");
    if (n.boss && !b.boss) this.sound("boss");
    if (n.shield > b.shield + 1) this.sound("powerup");
    if (n.jump > 0 && b.jump <= 0) this.sound("jump");
    if (n.shots > b.shots) this.sound("shoot");
    if (this.id === "brick" && b.vy > 0 && n.vy < 0 && gained === 0)
      this.sound("paddle");
    if (gained > 0)
      this.sound(
        this.id === "noodle"
          ? "eat"
          : this.id === "brick"
            ? "brick"
            : this.id === "hop"
              ? "pass"
              : gained >= 200
                ? "bigboom"
                : "boom",
      );
  }
  private loop = (now: number) => {
    this.frame = requestAnimationFrame(this.loop);
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.15) : 0;
    this.last = now;
    if (this.started && !this.ended && !this.paused) {
      this.accumulator += dt;
      while (this.accumulator >= 1 / 60 && !this.ended) {
        this.input[0] =
          Number(this.keys.has("d") || this.keys.has("arrowright")) -
          Number(this.keys.has("a") || this.keys.has("arrowleft"));
        this.input[1] =
          Number(this.keys.has("s") || this.keys.has("arrowdown")) -
          Number(this.keys.has("w") || this.keys.has("arrowup"));
        const stamp = JSON.stringify(this.input);
        if (stamp !== this.previous) {
          this.events.push([this.ticks, ...this.input]);
          this.previous = stamp;
        }
        const before = this.snapshot();
        this.advance(this.input);
        this.cue(before);
        this.input[3] = 0;
        this.accumulator -= 1 / 60;
      }
      if (this.score !== this.shownScore) this.popScore(now);
      const left = Math.max(0, Math.ceil(60 - this.elapsed));
      const time = this.container.querySelector("#run-time")!;
      if (time.textContent !== String(left)) {
        time.textContent = String(left);
        time.parentElement!.classList.toggle("hurry", left <= 10);
        this.onTime?.(left);
      }
      if (this.ended) {
        this.finish(this.score, {
          version: RULES_VERSION,
          ticks: this.ticks,
          events: this.events,
        });
        return;
      }
    }
    this.draw();
  };
  /**
   * Updates the score and, at most every 400 ms, bumps the pill, floats a
   * "+N" label and fires a burst, so steady scoring (Hop Hop) stays calm.
   */
  private popScore(now: number) {
    const el = this.container.querySelector<HTMLElement>("#run-score")!;
    el.textContent = String(this.score);
    if (now - this.lastPop < 400) return;
    const gained = this.score - this.shownScore;
    this.shownScore = this.score;
    this.lastPop = now;
    if (gained > 0 && gained < 200) this.onFx?.("score", gained);
    const pill = el.parentElement!;
    pill.classList.remove("bump");
    void pill.offsetWidth;
    pill.classList.add("bump");
    if (gained <= 0) return;
    const pops = this.container.querySelector(".game-pops");
    if (!pops || pops.childElementCount > 6) return;
    const pop = document.createElement("span");
    pop.className = gained >= 100 ? "pop big" : "pop";
    pop.textContent = `+${gained}`;
    pop.style.left = `${30 + Math.random() * 40}%`;
    pops.append(pop);
    setTimeout(() => pop.remove(), 900);
  }
  private draw() {
    const c = this.ctx;
    c.fillStyle = "#172e38";
    c.fillRect(0, 0, 440, 440);
    c.strokeStyle = "#203b43";
    c.lineWidth = 1;
    for (let i = 0; i <= 20; i++) {
      c.beginPath();
      c.moveTo(i * 22, 0);
      c.lineTo(i * 22, 440);
      c.moveTo(0, i * 22);
      c.lineTo(440, i * 22);
      c.stroke();
    }
    if (this.action) {
      this.action.draw(c);
    } else if (this.id === "noodle") {
      const f = this.food;
      c.fillStyle = "#f2bd88";
      c.beginPath();
      c.arc(f.x * 22 + 11, f.y * 22 + 11, 8, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = "#fcdfac";
      c.fillRect(f.x * 22 + 6, f.y * 22 + 6, 9, 3);
      this.snake.forEach((p, i) => {
        c.fillStyle = i === 0 ? "#dcffa3" : "#abd377";
        c.beginPath();
        c.roundRect(p.x * 22 + 1, p.y * 22 + 1, 20, 20, i === 0 ? 6 : 4);
        c.fill();
        if (i === 0) {
          c.fillStyle = "#26433c";
          c.fillRect(p.x * 22 + 6, p.y * 22 + 6, 3, 3);
          c.fillRect(p.x * 22 + 13, p.y * 22 + 6, 3, 3);
        }
      });
    } else {
      this.bricks.forEach((r) => {
        if (!r.alive) return;
        c.fillStyle = r.color;
        c.beginPath();
        c.roundRect(r.x, r.y, 44, 18, 3);
        c.fill();
        c.fillStyle = "#ffffff38";
        c.fillRect(r.x + 3, r.y + 2, 38, 3);
      });
      c.fillStyle = "#dceabf";
      c.beginPath();
      c.roundRect(this.paddle - 42, 412, 84, 10, 5);
      c.fill();
      c.fillStyle = "#ffdab0";
      c.beginPath();
      c.arc(this.ball.x, this.ball.y, 7, 0, Math.PI * 2);
      c.fill();
    }
    if (this.paused) {
      c.fillStyle = "#172e38bb";
      c.fillRect(0, 0, 440, 440);
      c.fillStyle = "#e5f1c7";
      c.font = "700 40px Fredoka, sans-serif";
      c.textAlign = "center";
      c.fillText("PAUSED", 220, 220);
      c.font = "600 18px Fredoka, sans-serif";
      c.fillText("P to resume", 220, 250);
    }
  }
  dispose() {
    cancelAnimationFrame(this.frame);
    window.removeEventListener("keydown", this.keyDown);
    window.removeEventListener("keyup", this.keyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.hidden);
    this.canvas.removeEventListener("pointerdown", this.pointerDown);
    this.canvas.removeEventListener("pointermove", this.pointerMove);
    this.canvas.removeEventListener("pointerup", this.pointerUp);
  }
}
