import {
  Simulation,
  rulesVersion,
  type Input,
  type Replay,
} from "../shared/simulation";
import {
  ordinal,
  itemCrates,
  pickups,
  RACE_TICKS,
  TRACK_LENGTH,
  raceTime,
  raceScoreTime,
  trackPoint,
} from "../shared/racing";
import { loadCharacter, type Look } from "./character";
import type { Sfx } from "./audio";
import type { FxEvent } from "./arcade-fx";
import type { RaceView } from "./race-view";
import { kartSteeringInput } from "./kart-motion";
import "./racing.css";

export class RacingGame {
  onFx: ((event: FxEvent, amount: number) => void) | null = null;
  onTime: ((secondsLeft: number) => void) | null = null;
  onPause: ((paused: boolean) => void) | null = null;
  private lastPop = 0;
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
          : RACE_TICKS;
    container.innerHTML = `<section class="coast-game" tabindex="-1" aria-label="Coast Rush street race">
      <div class="race-head"><span>PALM BAY <b>3 LAPS · 8 KARTS</b></span><span>7 GAME CHARACTERS</span></div>
      <div class="race-screen">
        <div class="race-view"></div>
        <div class="race-hud"><span class="stat-pill place-pill"><small>PLACE</small><b id="race-place">8th / 8</b></span><span class="stat-pill score-pill"><small>TIME</small><b id="run-score">0:00.00</b></span><span id="run-state">LAP <b id="race-lap">1 / 3</b></span><span class="stat-pill time-pill"><small>LEFT</small><b id="run-time">120</b></span></div>
        <div class="game-pops" aria-hidden="true"></div>
        <canvas class="race-map" width="180" height="130" aria-label="All eight karts. You are coral with a white ring. Seven coloured dots are game characters."></canvas>
        <div class="race-speed"><b id="race-speed">0</b><span>KM/H</span></div>
        <div class="race-item"><span>ITEM · E</span><b id="race-item">Empty</b><small id="race-pickups">0 shells</small></div><div class="race-notice" role="status" aria-live="polite">Loading your driver…</div>
        <div class="race-cover"><span class="eyebrow">DARECADE / ISLAND CIRCUIT</span><h3>COAST<br><em>RUSH</em></h3><p>Your avatar. Seven rivals. Three laps.</p><div class="race-instructions"><span>DRIVE<br><b>W A S D</b></span><span>DRIFT<br><b>Hold SPACE</b></span><span>ITEM<br><b>Tap E</b></span></div><p class="race-tip">Hold W to go. A/D steer, S brakes. Release Drift for Mini, Super or Ultra turbo. Crates give a shield or speed turbo. Collect shells!</p><button class="primary" id="start-game" disabled>Getting your kart ready…</button><small>Same kart for everyone · 2 minute limit<br>7 rivals are game characters, not real players.</small></div>
      </div>
      <div class="race-charge"><label for="drift-charge">DRIFT TURBO <span id="drift-label">Hold Space while moving</span></label><meter id="drift-charge" min="0" max="1" low=".333" optimum="1" value="0">0</meter></div>
      <div class="race-touch" aria-label="Driving controls"><div><button data-race-control="left" aria-label="Steer left">←</button><button data-race-control="right" aria-label="Steer right">→</button></div><div><button data-race-control="gas">GO</button><button data-race-control="brake">BRAKE</button><button data-race-control="drift">DRIFT</button><button data-race-control="item">ITEM</button></div></div>
      <div class="race-footer"><span>Hold GO to drive · Hits cost a 0.75s stop</span><button class="text-button" id="pause-game" disabled>Pause</button></div>
    </section>`;
    this.host = container.querySelector(".race-view")!;
    this.cover = container.querySelector(".race-cover")!;
    this.map = container.querySelector(".race-map")!;
    this.stats = container.querySelector(".coast-game")!;
    this.timer = container.querySelector("#run-score")!;
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
            if (this.paused || !["racing", "countdown"].includes(this.status))
              return;
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
        this.view = new module.RaceView(this.host, look, this.reduced);
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
    button.textContent = "Race! →";
    this.frame = requestAnimationFrame(this.loop);
  }
  private enableSimple() {
    this.stats.classList.add("simple-race");
    this.host.replaceChildren();
    this.cover.querySelector(".race-tip")!.textContent =
      "Simple view: coral is you; coloured dots are game characters. Hold W or GO, A/D steer, Space to drift, E for your item.";
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
      [
        "arrowleft",
        "arrowright",
        "arrowdown",
        "arrowup",
        "w",
        "a",
        "d",
        "s",
        " ",
        "e",
      ].includes(key)
    ) {
      e.preventDefault();
      if (!this.paused && ["racing", "countdown"].includes(this.status))
        this.keys.add(key);
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
    this.container.classList.toggle("is-paused", this.paused);
    this.onPause?.(this.paused);
  }
  private controls(): Input {
    const touch = new Set(this.pointers.values());
    return [
      kartSteeringInput(
        touch.has("left") || this.keys.has("arrowleft") || this.keys.has("a"),
        touch.has("right") || this.keys.has("arrowright") || this.keys.has("d"),
      ),
      touch.has("brake") || this.keys.has("arrowdown") || this.keys.has("s")
        ? -1
        : Number(
            touch.has("gas") || this.keys.has("w") || this.keys.has("arrowup"),
          ),
      Number(touch.has("item") || this.keys.has("e")),
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
        this.onFx?.("start", 0);
        this.host.insertAdjacentHTML(
          "afterend",
          '<div class="go-splash" aria-hidden="true">GO!</div>',
        );
        setTimeout(
          () => this.container.querySelector(".go-splash")?.remove(),
          1100,
        );
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
        this.cue(before, now);
        this.accumulator -= 1 / 60;
      }
      if (this.sim.ended) {
        this.status = "finished";
        cancelAnimationFrame(this.frame);
        this.finish(this.sim.score, {
          version: rulesVersion("coast"),
          ticks: this.sim.ticks,
          events: this.events,
        });
        return;
      }
      const message = race.stunTicks
        ? "HIT! +0.75s stop"
        : race.shield > 0
          ? `Shield · ${Math.ceil(race.shield)}s`
          : race.boost > 0
            ? `${race.lastTurbo || "Speed"} turbo!`
            : race.tier
              ? `${race.tier} ready · release Drift!`
              : race.ticks < 120
                ? "Hold W / GO to accelerate"
                : "";
      if (this.notice.textContent !== message)
        this.notice.textContent = message;
    }
    this.stats.dataset.status = this.status;
    this.stats.dataset.distance = race.distance.toFixed(2);
    this.stats.dataset.offset = race.offset.toFixed(2);
    this.stats.dataset.ticks = String(race.ticks);
    this.timer.textContent = raceTime(race.ticks);
    const left = Math.max(0, Math.ceil((RACE_TICKS - race.ticks) / 60));
    const time = this.container.querySelector("#run-time")!;
    if (time.textContent !== String(left)) {
      time.textContent = String(left);
      time.parentElement!.classList.toggle("hurry", left <= 10);
      this.onTime?.(left);
    }
    this.lap.textContent = `${race.lap} / 3`;
    this.speed.textContent = String(Math.round(race.speed * 3.6));
    this.meter.value = race.charge;
    this.container.querySelector("#drift-label")!.textContent =
      race.boost > 0
        ? `${race.lastTurbo || "Speed"} turbo active`
        : race.tier
          ? `${race.tier} · release to boost`
          : "Mini 0.8s · Super 1.6s · Ultra 2.4s";
    this.container.querySelector("#race-place")!.textContent =
      `${ordinal(race.place)} / 8`;
    this.container.querySelector("#race-item")!.textContent =
      race.item === "shield"
        ? "Shield"
        : race.item === "turbo"
          ? "Speed turbo"
          : "Empty";
    this.container.querySelector("#race-pickups")!.textContent =
      `${race.pickupCount} shells`;
    this.stats.dataset.place = String(race.place);
    this.stats.dataset.pickups = String(race.pickupCount);
    this.stats.dataset.item = race.item || "empty";
    this.stats.dataset.speed = race.speed.toFixed(2);
    this.stats.dataset.charge = race.charge.toFixed(3);
    this.view?.draw(race, now / 1000, input[0], this.status === "ready", dt);
    this.drawMap();
  };
  /** Sound and visual events only observe completed simulation ticks. */
  private cue(
    before: { boosts: number; bumps: number; laps: number },
    now: number,
  ) {
    const race = this.sim.race!;
    if (race.boosts > before.boosts) {
      this.sound("powerup");
      this.onFx?.("power", 0);
    }
    if (race.bumps > before.bumps) {
      this.sound("hurt");
      this.onFx?.("hurt", 0);
    }
    if (race.lapTicks.length > before.laps) {
      this.sound("pass");
      this.popScore(now);
      if (race.score > 0) this.onFx?.("big", race.score);
    }
  }
  private popScore(now: number) {
    if (now - this.lastPop < 400) return;
    this.lastPop = now;
    this.onFx?.("score", 1);
    const pop = document.createElement("span");
    pop.className = "pop big";
    pop.textContent = "LAP COMPLETE!";
    pop.style.left = "50%";
    this.container.querySelector(".game-pops")!.append(pop);
    setTimeout(() => pop.remove(), 900);
  }
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
    for (const [kind, objects] of [
      ["crate", itemCrates],
      ["pickup", pickups],
    ] as const)
      objects.forEach((object, i) => {
        if (race.collected.has(`${kind}:${race.lap - 1}:${i}`)) return;
        const point = plot(object.distance, object.offset);
        ctx.fillStyle = kind === "crate" ? "#83fff1" : "#fff0a6";
        ctx.fillRect(point.x - 1.5, point.y - 1.5, 3, 3);
      });
    for (const rival of race.rivals) {
      const point = plot(rival.distance, rival.offset);
      ctx.fillStyle = rival.color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
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
    const result = race.result();
    const ladder = [
      ...race.rivals.map((r) => ({
        name: r.name + " · Game character",
        distance: r.distance,
        time: r.finishTick || Infinity,
        you: false,
      })),
      {
        name: "You",
        distance: race.distance,
        time: race.score ? race.ticks : Infinity,
        you: true,
      },
    ].sort(
      (a, b) =>
        a.time - b.time ||
        b.distance - a.distance ||
        Number(a.you) - Number(b.you),
    );
    return `<div class="race-result-detail"><h3>${ordinal(result.place)} / 8${result.finished ? " · Finish!" : " · Time limit"}</h3><div><span>TOTAL TIME<b>${raceTime(result.timeTicks)}</b></span><span>BEST LAP<b>${result.bestLap ? raceTime(result.bestLap) : "—"}</b></span><span>SHELL PICKUPS<b>${result.pickups}</b></span><span>HIT STOPS<b>${raceTime(result.penaltyTicks)}</b></span></div><p>${result.finished ? "Three laps complete. Try a cleaner line or a longer drift." : "Hold W or GO to drive. Finish three laps to set a best time."}</p><details><summary>Street ladder · seven game characters</summary><ol class="street-ladder">${ladder.map((r) => `<li class="${r.you ? "is-you" : ""}"><span>${r.name}</span><b>${Number.isFinite(r.time) ? raceTime(r.time) : "Racing"}</b></li>`).join("")}</ol></details><small>Game characters never enter medal boards. Verified players rank by fastest three-lap time.${this.targetTicks < 7200 ? ` Your time target: ${raceScoreTime(7201 - this.targetTicks)}.` : ""}</small></div>`;
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
