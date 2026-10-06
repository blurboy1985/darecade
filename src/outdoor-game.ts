import {
  Simulation,
  rulesVersion,
  type Input,
  type Replay,
} from "../shared/simulation";
import {
  FISHING_TICKS,
  fishStats,
  HoopsRound,
  HOOPS_SHOT_TICKS,
  type FishingRound,
} from "../shared/outdoor";
import { games, type OutdoorId } from "./catalog";
import { fishSpecies, HOOPS_SHOTS } from "./state";
import type { Sfx } from "./audio";
import type { FxEvent } from "./arcade-fx";
import type { OutdoorView } from "./outdoor-view";
import "./outdoor.css";

const LOSSES = {
  early: "Too soon. It swam off.",
  missed: "Too slow. It got away.",
  snapped: "The line snapped! Ease off when it thrashes.",
  escaped: "It slipped the hook. Keep reeling when it is calm.",
};

/** A Hoops Court or Fishing Jetty round. One control: press, or hold to reel. */
export class OutdoorGame {
  onFx: ((event: FxEvent, amount: number) => void) | null = null;
  onTime: ((secondsLeft: number) => void) | null = null;
  onPause: ((paused: boolean) => void) | null = null;
  private readonly sim: Simulation;
  private view: OutdoorView | null = null;
  private readonly events: Replay["events"] = [];
  private readonly abort = new AbortController();
  private readonly root: HTMLElement;
  private readonly status: HTMLElement;
  private readonly action: HTMLButtonElement;
  private previous = "";
  private frame = 0;
  private last = 0;
  private accumulator = 0;
  private held = false;
  private pendingPress = false;
  private started = false;
  private paused = false;
  private disposed = false;
  private lastPop = 0;
  constructor(
    private readonly container: HTMLElement,
    private readonly id: OutdoorId,
    private readonly finish: (score: number, replay: Replay) => void,
    private readonly sound: (name: Sfx) => void,
    seed: number,
    private readonly options: { reduced: boolean; simple: boolean },
  ) {
    this.sim = new Simulation(id, seed);
    const hoops = id === "hoops";
    const touch =
      typeof matchMedia === "function" &&
      matchMedia("(pointer: coarse)").matches;
    const press = touch ? "Tap" : "Press Space";
    container.innerHTML = `<section class="outdoor-game" data-game="${id}" data-status="ready" tabindex="-1" aria-label="${games[id].name}">
      <div class="game-stats"><span class="stat-pill score-pill"><small>SCORE</small><b id="run-score">0</b></span><span id="run-state">${hoops ? `SHOT <b>1 / ${HOOPS_SHOTS}</b>` : "CATCHES <b>0</b>"}</span><span class="stat-pill time-pill"><small>${hoops ? "CLOCK" : "TIME"}</small><b id="run-time">${hoops ? 4 : 60}</b></span></div>
      <div class="outdoor-screen">
        <div class="outdoor-view"></div>
        <div class="game-pops" aria-hidden="true"></div>
        <div class="outdoor-status" role="status" aria-live="polite"></div>
        ${
          hoops
            ? '<div class="outdoor-meter shot-meter" aria-hidden="true"><i class="shot-zone"><i></i></i><i class="shot-marker"></i></div>'
            : '<div class="outdoor-meter reel-meter" aria-hidden="true"><span>REEL<i><b id="reel-progress"></b></i></span><span>LINE<i><b id="reel-tension"></b></i></span></div>'
        }
        <div class="game-cover" id="game-cover"><span class="eyebrow">EAST SIDE</span><h3>${hoops ? "Ten shots. Four seconds each." : "One minute on the jetty."}</h3><p>${
          hoops
            ? `${press} to stop the marker in the green. The bright centre is a swish worth 3; the rest of the green is worth 2. Baskets in a row add up to 3 more. The green narrows, and from the fourth shot it slides.`
            : `${press} to cast, then again the moment the float dips. Hold to reel, and let go while the fish thrashes or the line snaps. Rare fish score more and fight harder.`
        }</p><button class="primary" id="start-game">PLAY <span>▶</span></button></div>
      </div>
      <button class="outdoor-action" id="outdoor-action" disabled>${hoops ? "SHOOT" : "CAST"}</button>
      <div class="game-controls"><span>${touch ? "Tap the big button or the scene" : "Space, Enter or click"}${hoops ? "" : " · hold to reel"}</span><button class="text-button" id="pause-game" disabled>Pause</button></div>
    </section>`;
    this.root = container.querySelector(".outdoor-game")!;
    this.status = container.querySelector(".outdoor-status")!;
    this.action = container.querySelector("#outdoor-action")!;
    const listener = { signal: this.abort.signal };
    container
      .querySelector("#start-game")!
      .addEventListener("click", () => this.start(), listener);
    container
      .querySelector("#pause-game")!
      .addEventListener("click", () => this.togglePause(), listener);
    const down = (e: Event) => {
      if (!this.started || this.paused) return;
      e.preventDefault();
      this.held = true;
      // A quick press and release can both happen between animation frames.
      this.pendingPress = true;
    };
    const up = () => (this.held = false);
    const cancel = () => {
      this.held = false;
      this.pendingPress = false;
    };
    for (const target of [
      this.action,
      container.querySelector<HTMLElement>(".outdoor-view")!,
    ]) {
      target.addEventListener("pointerdown", down, listener);
      target.addEventListener("pointerup", up, listener);
      target.addEventListener("pointercancel", cancel, listener);
      target.addEventListener(
        "pointerleave",
        () => {
          // Touch release can leave the button before the next animation frame.
          // Keep a completed tap; cancel only a still-held gesture dragged away.
          if (this.held) cancel();
        },
        listener,
      );
    }
    window.addEventListener(
      "keydown",
      (e) => {
        if (e.key === " " || e.key === "Enter") {
          if (this.started && !e.repeat) down(e);
          else if (this.started) e.preventDefault();
        } else if (e.key.toLowerCase() === "p" && !e.repeat) this.togglePause();
      },
      listener,
    );
    window.addEventListener(
      "keyup",
      (e) => (e.key === " " || e.key === "Enter") && up(),
      listener,
    );
    const away = () => {
      cancel();
      if (this.started && !this.paused && !this.sim.ended) this.togglePause();
    };
    window.addEventListener("blur", away, listener);
    document.addEventListener(
      "visibilitychange",
      () => document.hidden && away(),
      listener,
    );
    void this.load();
  }
  private async load() {
    if (!this.options.simple)
      try {
        const module = await import("./outdoor-view");
        if (this.disposed) return;
        this.view = new module.OutdoorView(
          this.container.querySelector(".outdoor-view")!,
          this.sim.outdoor!,
          this.options.reduced,
        );
        this.view.renderer.domElement.addEventListener(
          "webglcontextlost",
          (e) => {
            e.preventDefault();
            this.view?.dispose();
            this.view = null;
            this.root.classList.add("simple-outdoor");
          },
          { signal: this.abort.signal },
        );
      } catch {
        // The meters carry the whole round without the 3D scene.
        this.view?.dispose();
        this.view = null;
      }
    if (this.disposed) return;
    if (!this.view) this.root.classList.add("simple-outdoor");
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.loop);
  }
  private start() {
    if (this.started) return;
    this.started = true;
    this.container.querySelector<HTMLElement>("#game-cover")!.hidden = true;
    this.container.querySelector<HTMLButtonElement>("#pause-game")!.disabled =
      false;
    this.action.disabled = false;
    this.root.dataset.status = "playing";
    this.root.focus();
    this.sound("go");
    this.onFx?.("start", 0);
    this.last = performance.now();
  }
  private togglePause() {
    if (!this.started || this.sim.ended) return;
    this.paused = !this.paused;
    this.held = false;
    this.pendingPress = false;
    this.accumulator = 0;
    this.last = performance.now();
    this.container.querySelector("#pause-game")!.textContent = this.paused
      ? "Resume"
      : "Pause";
    this.root.dataset.paused = String(this.paused);
    this.onPause?.(this.paused);
  }
  private loop = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const round = this.sim.outdoor!;
    if (this.started && !this.paused && !this.sim.ended) {
      this.accumulator += dt;
      while (this.accumulator >= 1 / 60 && !this.sim.ended) {
        const input: Input = [
          0,
          0,
          -1,
          Number(this.held || this.pendingPress),
          -1,
          -1,
        ];
        this.pendingPress = false;
        const stamp = String(input[3]);
        if (stamp !== this.previous) {
          this.events.push([this.sim.ticks, ...input]);
          this.previous = stamp;
        }
        if (round instanceof HoopsRound) {
          const shot = round.shot;
          this.sim.advance(input);
          // A hoops press is a single shot, never a hold.
          if (round.shot > shot) this.hoopsCue(round, now);
        } else {
          const state = round.state;
          this.sim.advance(input);
          if (round.state !== state) this.fishingCue(round, state, now);
        }
        this.accumulator -= 1 / 60;
      }
      if (this.sim.ended) this.end();
    }
    this.render(round);
    this.view?.draw(now / 1000, this.paused ? 0 : dt);
  };
  private hoopsCue(round: HoopsRound, now: number) {
    const made = round.last === "perfect" || round.last === "made";
    this.sound(round.last === "perfect" ? "powerup" : made ? "coin" : "paddle");
    this.status.textContent =
      round.last === "perfect"
        ? "Swish!"
        : made
          ? "Basket!"
          : round.last === "late"
            ? "Shot clock! Too slow."
            : "Off the rim.";
    if (made) {
      this.pop(
        `+${round.lastPoints}${round.streak >= 3 ? " 🔥" : ""}${round.last === "perfect" ? " SWISH" : ""}`,
        now,
      );
      this.onFx?.(round.last === "perfect" ? "big" : "score", round.lastPoints);
    } else {
      this.onFx?.("hurt", 0);
      if (!this.options.reduced) navigator.vibrate?.(40);
    }
  }
  private fishingCue(round: FishingRound, before: string, now: number) {
    const state = round.state;
    if (state === "waiting") {
      this.sound("click");
      this.status.textContent = "Waiting for a bite…";
    } else if (state === "bite") {
      this.sound("blip");
      this.status.textContent = "A bite! Hook it!";
      if (!this.options.reduced) navigator.vibrate?.(60);
    } else if (state === "reeling") {
      this.sound("jump");
      this.status.textContent = "Hooked! Hold to reel.";
    } else if (state === "landed") {
      const fish = round.fish!;
      this.sound("powerup");
      this.status.textContent = `${fish.icon} ${fish.name}!`;
      this.pop(`${fish.icon} +${fishStats[fish.id].points}`, now);
      this.onFx?.(fishStats[fish.id].points >= 60 ? "big" : "score", 1);
    } else if (state === "lost") {
      this.sound(round.loss === "snapped" ? "crash" : "close");
      this.status.textContent = LOSSES[round.loss!];
      this.onFx?.("hurt", 0);
    } else if (before === "lost" || before === "landed")
      this.status.textContent = "Cast again.";
  }
  private render(round: HoopsRound | FishingRound) {
    const q = <E extends HTMLElement>(selector: string) =>
      this.container.querySelector<E>(selector)!;
    const set = (selector: string, text: string) => {
      const el = q(selector);
      if (el.textContent !== text) el.textContent = text;
    };
    set("#run-score", String(this.sim.score));
    let left: number;
    if (round instanceof HoopsRound) {
      left = round.flight ? 0 : Math.ceil(round.clock / 60);
      set(
        "#run-state b",
        `${Math.min(round.shot + 1, HOOPS_SHOTS)} / ${HOOPS_SHOTS}`,
      );
      const zone = q(".shot-zone");
      zone.style.left = `${(round.centre - round.width / 2) * 100}%`;
      zone.style.width = `${round.width * 100}%`;
      q(".shot-marker").style.left = `${round.marker * 100}%`;
      this.root.dataset.flight = String(round.flight > 0);
      this.root.dataset.hurry = String(
        !round.flight && round.clock < HOOPS_SHOT_TICKS * 0.3,
      );
      this.action.textContent = round.flight ? "…" : "SHOOT";
    } else {
      left = Math.ceil((FISHING_TICKS - round.ticks) / 60);
      set("#run-state b", String(round.catches.length));
      q("#reel-progress").style.width = `${Math.max(0, round.progress) * 100}%`;
      q("#reel-tension").style.width = `${round.tension * 100}%`;
      this.root.dataset.state = round.state;
      this.root.dataset.surging = String(round.surging);
      this.root.dataset.hurry = String(left <= 10);
      this.action.textContent =
        round.state === "idle"
          ? "CAST"
          : round.state === "bite"
            ? "HOOK!"
            : round.state === "reeling"
              ? round.surging || round.tension > 0.7
                ? "LET GO!"
                : "HOLD TO REEL"
              : "…";
    }
    this.action.classList.toggle("held", this.held);
    const time = q("#run-time");
    if (time.textContent !== String(left)) {
      time.textContent = String(left);
      if (round instanceof HoopsRound) return;
      if (left <= 10 && left > 0 && this.started) this.sound("tick");
      this.onTime?.(left);
    }
  }
  private end() {
    this.held = false;
    this.pendingPress = false;
    this.action.disabled = true;
    this.root.dataset.status = "finished";
    this.finish(this.sim.score, {
      version: rulesVersion(this.id),
      ticks: this.sim.ticks,
      events: this.events,
    });
  }
  /** A line for the result card: what the round's score was made of. */
  summary() {
    const round = this.sim.outdoor!;
    if (round instanceof HoopsRound)
      return `<p class="outdoor-summary">${round.made} of ${HOOPS_SHOTS} baskets</p>`;
    const counts = fishSpecies
      .map((f) => ({
        f,
        n: round.catches.filter((id) => id === f.id).length,
      }))
      .filter((c) => c.n);
    return `<p class="outdoor-summary">${counts.length ? counts.map((c) => `${c.f.icon} ${c.f.name} × ${c.n}`).join(" · ") : "Nothing landed this time."}</p>`;
  }
  private pop(text: string, now: number) {
    if (now - this.lastPop < 250) return;
    this.lastPop = now;
    const pop = document.createElement("span");
    pop.className = "pop big";
    pop.textContent = text;
    this.container.querySelector(".game-pops")!.append(pop);
    setTimeout(() => pop.remove(), 900);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.held = false;
    this.pendingPress = false;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.view?.dispose();
    this.view = null;
  }
}
