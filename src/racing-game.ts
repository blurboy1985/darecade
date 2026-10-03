import {
  Simulation,
  RULES_VERSION,
  type Input,
  type Replay,
} from "../shared/simulation";
import {
  RACE_DISTANCE,
  RACE_TICKS,
  TRACK_LENGTH,
  raceTime,
  raceScoreTime,
  trackPoint,
} from "../shared/racing";
import { loadCharacter, type Look } from "./character";
import type { Sfx } from "./audio";
import type { RaceView } from "./race-view";
import "./racing.css";

export class RacingGame {
  private readonly sim: Simulation;
  private view: RaceView | null = null;
  private readonly events: Replay["events"] = [];
  private readonly keys = new Set<string>();
  private readonly pointers = new Map<number, string>();
  private previous = "";
  private frame = 0;
  private last = 0;
  private accumulator = 0;
  private countdown = 3;
  private status: "loading" | "ready" | "countdown" | "racing" | "finished" =
    "loading";
  private paused = false;
  private disposed = false;
  private readonly host: HTMLElement;
  private readonly cover: HTMLElement;
  private readonly map: HTMLCanvasElement;
  private readonly stats: HTMLElement;
  private readonly timer: HTMLElement;
  private readonly lap: HTMLElement;
  private readonly speed: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly meter: HTMLMeterElement;
  private readonly targetTicks: number;
  private readonly reduced: boolean;
  private readonly abort = new AbortController();
  constructor(
    private readonly container: HTMLElement,
    private readonly finish: (score: number, replay: Replay) => void,
    private readonly sound: (name: Sfx) => void,
    seed: number,
    look: Look,
    options: {
      reduced: boolean;
      simple: boolean;
      target: number;
      best: number;
    },
  ) {
    this.sim = new Simulation("coast", seed);
    this.reduced = options.reduced;
    this.targetTicks =
      options.target > 0
        ? RACE_TICKS + 1 - options.target
        : options.best > 0
          ? RACE_TICKS + 1 - options.best
          : 55 * 60;
    const targetLabel = options.target
      ? "DARE TO BEAT"
      : options.best
        ? "YOUR BEST"
        : "PACE GHOST";
    container.innerHTML = `<section class="coast-game" aria-label="Coast Rush time trial">
      <div class="race-head"><span>PALM BAY <b>02 LAPS</b></span><span>${targetLabel} <b>${raceTime(this.targetTicks)}</b></span></div>
      <div class="race-screen">
        <div class="race-view"></div>
        <div class="race-hud"><span>TIME <b id="race-time">0:00.00</b></span><span>LAP <b id="race-lap">1 / 2</b></span></div>
        <canvas class="race-map" width="180" height="130" aria-label="Circuit map. Your kart is coral and the pace ghost is gold."></canvas>
        <div class="race-speed"><b id="race-speed">0</b><span>KM/H</span></div>
        <div class="race-notice" role="status" aria-live="polite">Loading your driver…</div>
        <div class="race-cover"><span class="eyebrow">DARECADE / ISLAND CIRCUIT</span><h3>COAST<br><em>RUSH</em></h3><p>Two laps. Your avatar. One best time.</p><div class="race-instructions"><span>STEER<br><b>← → / A D</b></span><span>DRIFT<br><b>Hold SPACE</b></span><span>BRAKE<br><b>↓ / S</b></span></div><p class="race-tip">Auto-accelerate is on. Hold Drift while steering into a bend, then release for a turbo. Teal pads boost; cones slow you.</p><button class="primary" id="start-game" disabled>Getting your kart ready…</button><small>Same kart for everyone · 2 minute limit<br>Gold ghost is a non-colliding pace guide.</small></div>
      </div>
      <div class="race-charge"><label for="drift-charge">DRIFT TURBO <span id="drift-label">Hold through a bend</span></label><meter id="drift-charge" min="0" max="1" low=".45" optimum="1" value="0">0</meter></div>
      <div class="race-touch" aria-label="Driving controls"><div><button data-race-control="left" aria-label="Steer left">←</button><button data-race-control="right" aria-label="Steer right">→</button></div><div><button data-race-control="brake">BRAKE</button><button data-race-control="drift">DRIFT</button></div></div>
      <div class="race-footer"><span>Fastest complete race wins. Looks are cosmetic.</span><button class="text-button" id="pause-game" disabled>Pause</button></div>
    </section>`;
    this.host = container.querySelector(".race-view")!;
    this.cover = container.querySelector(".race-cover")!;
    this.map = container.querySelector(".race-map")!;
    this.stats = container.querySelector(".coast-game")!;
    this.timer = container.querySelector("#race-time")!;
    this.lap = container.querySelector("#race-lap")!;
    this.speed = container.querySelector("#race-speed")!;
    this.notice = container.querySelector(".race-notice")!;
    this.meter = container.querySelector("#drift-charge")!;
    const listener = { signal: this.abort.signal };
    container
      .querySelector("#start-game")!
      .addEventListener("click", () => this.start(), listener);
    container
      .querySelector("#pause-game")!
      .addEventListener("click", () => this.togglePause(), listener);
    window.addEventListener("keydown", this.keyDown, listener);
    window.addEventListener("keyup", this.keyUp, listener);
    window.addEventListener("blur", this.onBlur, listener);
    document.addEventListener("visibilitychange", this.hidden, listener);
    container
      .querySelectorAll<HTMLButtonElement>("[data-race-control]")
      .forEach((b) => {
        b.addEventListener(
          "pointerdown",
          (e) => {
            e.preventDefault();
            if (this.paused || this.status !== "racing") return;
            b.setPointerCapture(e.pointerId);
            this.pointers.set(e.pointerId, b.dataset.raceControl!);
            b.classList.add("held");
          },
          listener,
        );
        const release = (e: PointerEvent) => {
          this.pointers.delete(e.pointerId);
          if (![...this.pointers.values()].includes(b.dataset.raceControl!))
            b.classList.remove("held");
        };
        b.addEventListener("pointerup", release, listener);
        b.addEventListener("pointercancel", release, listener);
        b.addEventListener("lostpointercapture", release, listener);
      });
    void this.load(look, options.simple);
  }
  private async load(look: Look, simple: boolean) {
    try {
      if (!simple) {
        const [module] = await Promise.all([
          import("./race-view"),
          loadCharacter(),
        ]);
        if (this.disposed) return;
        this.view = new module.RaceView(
          this.host,
          look,
          this.reduced,
          this.targetTicks / 60,
        );
        this.view.renderer.domElement.addEventListener(
          "webglcontextlost",
          this.contextLost,
          { signal: this.abort.signal },
        );
      }
    } catch {
      // Physics and replay remain identical in the low-graphics view.
      this.view?.dispose();
      this.view = null;
    }
    if (this.disposed) return;
    if (!this.view) this.enableSimple();
    this.status = "ready";
    this.notice.textContent = "";
    const button =
      this.container.querySelector<HTMLButtonElement>("#start-game")!;
    button.disabled = false;
    button.textContent = "Start your lap →";
    this.frame = requestAnimationFrame(this.loop);
  }
  private enableSimple() {
    this.stats.classList.add("simple-race");
    this.host.replaceChildren();
    this.cover.querySelector(".race-tip")!.textContent =
      "Simple view: your kart is coral. Arrows steer across the track; hold Drift into bends and release for a turbo. Racing rules and scores are unchanged.";
  }
  private contextLost = (e: Event) => {
    e.preventDefault();
    if (this.disposed) return;
    this.onBlur();
    const view = this.view;
    this.view = null;
    view?.dispose();
    this.enableSimple();
    this.notice.textContent = "Graphics interrupted. Resume in simple view.";
  };
  private start() {
    if (this.status !== "ready") return;
    this.status = "countdown";
    this.cover.hidden = true;
    this.notice.textContent = "3";
    this.sound("blip");
    this.stats.focus();
    this.last = performance.now();
    this.container.querySelector<HTMLButtonElement>("#pause-game")!.disabled =
      false;
  }
  private keyDown = (e: KeyboardEvent) => {
    const key = e.key.toLowerCase();
    if (
      ["arrowleft", "arrowright", "arrowdown", "a", "d", "s", " "].includes(key)
    ) {
      e.preventDefault();
      if (!this.paused && this.status === "racing") this.keys.add(key);
    }
    if (key === "p" && !e.repeat) this.togglePause();
  };
  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
  private clearInput() {
    this.keys.clear();
    this.pointers.clear();
    this.container
      .querySelectorAll(".held")
      .forEach((b) => b.classList.remove("held"));
  }
  private onBlur = () => {
    if (!this.paused && ["racing", "countdown"].includes(this.status))
      this.togglePause();
    this.clearInput();
  };
  private hidden = () => {
    if (document.hidden) this.onBlur();
  };
  private togglePause() {
    if (!["racing", "countdown"].includes(this.status)) return;
    this.paused = !this.paused;
    this.clearInput();
    this.accumulator = 0;
    this.last = performance.now();
    this.container.querySelector("#pause-game")!.textContent = this.paused
      ? "Resume"
      : "Pause";
    this.notice.textContent = this.paused ? "Paused · tap Resume" : "";
    this.stats.dataset.paused = String(this.paused);
  }
  private controls(): Input {
    const touch = new Set(this.pointers.values());
    return [
      Number(
        touch.has("right") || this.keys.has("arrowright") || this.keys.has("d"),
      ) -
        Number(
          touch.has("left") || this.keys.has("arrowleft") || this.keys.has("a"),
        ),
      Number(
        touch.has("brake") || this.keys.has("arrowdown") || this.keys.has("s"),
      ),
      -1,
      Number(touch.has("drift") || this.keys.has(" ")),
      -1,
      -1,
    ];
  }
  private loop = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0;
    this.last = now;
    const race = this.sim.race!;
    const input = this.controls();
    if (!this.paused && this.status === "countdown") {
      const prev = Math.ceil(this.countdown);
      this.countdown -= dt;
      const next = Math.ceil(this.countdown);
      if (next !== prev && next > 0) this.sound("blip");
      this.notice.textContent = String(Math.max(1, next));
      if (this.countdown <= 0) {
        this.status = "racing";
        this.sound("start");
        this.notice.textContent = "GO!";
      }
    } else if (!this.paused && this.status === "racing") {
      this.accumulator += dt;
      while (this.accumulator >= 1 / 60 && !this.sim.ended) {
        const stamp = JSON.stringify(input);
        if (stamp !== this.previous) {
          this.events.push([this.sim.ticks, ...input]);
          this.previous = stamp;
        }
        const before = {
          boosts: race.boosts,
          bumps: race.bumps,
          laps: race.lapTicks.length,
        };
        this.sim.advance(input);
        // Audio observes the completed tick and never changes the simulation.
        if (race.boosts > before.boosts) this.sound("powerup");
        if (race.bumps > before.bumps) this.sound("hurt");
        if (race.lapTicks.length > before.laps) this.sound("pass");
        this.accumulator -= 1 / 60;
      }
      if (this.sim.ended) {
        this.status = "finished";
        cancelAnimationFrame(this.frame);
        this.finish(this.sim.score, {
          version: RULES_VERSION,
          ticks: this.sim.ticks,
          events: this.events,
        });
        return;
      }
      const message =
        race.boost > 0
          ? "TURBO!"
          : race.offroad
            ? "Sand slows you · steer back"
            : race.bumpCooldown > 0
              ? "Bump! Find a clean line"
              : race.charge >= 0.45
                ? "Release Drift for turbo"
                : this.sim.ticks < 90
                  ? "GO!"
                  : "";
      if (this.notice.textContent !== message)
        this.notice.textContent = message;
    }
    this.stats.dataset.status = this.status;
    this.stats.dataset.distance = race.distance.toFixed(2);
    this.stats.dataset.offset = race.offset.toFixed(2);
    this.stats.dataset.ticks = String(race.ticks);
    this.timer.textContent = raceTime(race.ticks);
    this.lap.textContent = `${race.lap} / 2`;
    this.speed.textContent = String(Math.round(race.speed * 3.6));
    this.meter.value = race.charge;
    this.container.querySelector("#drift-label")!.textContent =
      race.boost > 0
        ? "Turbo active"
        : race.charge >= 0.45
          ? "Release to boost!"
          : "Hold through a bend";
    this.view?.draw(race, now / 1000, input[0], this.status === "ready", dt);
    this.drawMap();
  };
  private drawMap() {
    const ctx = this.map.getContext("2d")!;
    const race = this.sim.race!;
    ctx.clearRect(0, 0, 180, 130);
    const plot = (distance: number, offset = 0) => {
      const p = trackPoint(distance, offset);
      return { x: p.x * 0.69 + 80, y: p.z * 0.69 + 65 };
    };
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i <= 160; i++) {
      const p = plot((i / 160) * TRACK_LENGTH);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = "#a9d5c6";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.strokeStyle = "#284c59";
    ctx.lineWidth = 5.5;
    ctx.stroke();
    const start = plot(0);
    ctx.fillStyle = "#fff5d2";
    ctx.fillRect(start.x - 4, start.y - 1, 8, 2);
    const ghost = plot(
      Math.min(
        RACE_DISTANCE,
        (Math.max(0, race.ticks) / this.targetTicks) * RACE_DISTANCE,
      ),
    );
    ctx.fillStyle = "#ffd68c";
    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y, 3, 0, Math.PI * 2);
    ctx.fill();
    const p = plot(race.distance, race.offset);
    ctx.fillStyle = "#ff927b";
    ctx.strokeStyle = "#fff7d7";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  summary() {
    const race = this.sim.race!;
    return `<div class="race-result-detail"><p>${race.score > 0 ? "Two laps completed. Shorter time ranks higher." : "Time limit reached. Finish both laps to set a ranked time."}</p><div>${race.lapTicks.map((t, i) => `<span>LAP ${i + 1}<b>${raceTime(t)}</b></span>`).join("")}<span>TURBOS<b>${race.boosts}</b></span><span>BUMPS<b>${race.bumps}</b></span></div><p>${race.score > 0 ? `Pace target ${raceTime(this.targetTicks)} · ${race.ticks < this.targetTicks ? "Beat it by " + raceTime(this.targetTicks - race.ticks) : race.ticks === this.targetTicks ? "Matched your target" : "Next target: gain " + raceTime(race.ticks - this.targetTicks)}.` : "Brake before tight bends and release Drift as the road opens."}</p><small>Palm Bay · ${raceScoreTime(race.score)}</small></div>`;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.clearInput();
    this.view?.dispose();
    this.view = null;
  }
}
