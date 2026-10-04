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
  RACE_LAPS,
  RACE_TICKS,
  TRACK_LENGTH,
  raceTime,
  raceScoreTime,
  trackBounds,
  trackPoint,
  type RaceItem,
} from "../shared/racing";
import { loadCharacter, type Look } from "./character";
import { audio, type Sfx, type Theme } from "./audio";
import type { FxEvent } from "./arcade-fx";
import type { RaceView } from "./race-view";
import { RaceMotion } from "./race-motion";
import { kartSteeringInput } from "./kart-motion";
import "./racing.css";

const SHELLS = pickups.length * RACE_LAPS;
const ITEM_NAMES: Record<NonNullable<RaceItem>, string> = {
  shield: "🛡 Shield",
  turbo: "⚡ Turbo",
  missile: "🚀 Missile",
  storm: "🌩 Storm",
  coconut: "🥥 Coconut",
};
// The minimap fits whatever route the simulation defines.
const MAP_SCALE = Math.min(
  160 / (trackBounds.maxX - trackBounds.minX),
  112 / (trackBounds.maxZ - trackBounds.minZ),
);
const OUTRO_SECONDS = 9;

export class RacingGame {
  onFx: ((event: FxEvent, amount: number) => void) | null = null;
  onTime: ((secondsLeft: number) => void) | null = null;
  onPause: ((paused: boolean) => void) | null = null;
  private lastPop = 0;
  private readonly sim: Simulation;
  private view: RaceView | null = null;
  private readonly motion = new RaceMotion();
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
  private outroTime = 0;
  private outroDone = false;
  private outroResolve: (() => void) | null = null;
  private previousTheme: Theme | null = null;
  private readonly touch: boolean;
  private readonly buttons: HTMLButtonElement[];
  private readonly finishCard: HTMLElement;
  private readonly itemBox: HTMLElement;
  private readonly shells: HTMLElement;
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
      playerName?: string;
      soundOn: () => boolean;
      toggleSound: () => void;
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
    // Phones get touch wording; keyboards keep the key names.
    const touch = (this.touch =
      typeof matchMedia === "function" &&
      matchMedia("(pointer: coarse)").matches);
    const use = touch ? "Tap ITEM" : "Press E";
    container.innerHTML = `<section class="coast-game" tabindex="-1" aria-label="Coast Rush street race">
      <div class="race-head"><span>PALM BAY <b>3 LAPS · 8 KARTS</b></span><span>7 GAME CHARACTERS</span></div>
      <div class="race-screen">
        <div class="race-view"></div>
        <div class="race-hud"><span class="stat-pill place-pill"><small>PLACE</small><b id="race-place">8th / 8</b></span><span class="stat-pill score-pill"><small>TIME</small><b id="run-score">0:00.00</b></span><span id="run-state">LAP <b id="race-lap">1 / 3</b></span><span class="stat-pill time-pill"><small>LEFT</small><b id="run-time">120</b></span></div>
        <div class="game-pops" aria-hidden="true"></div>
        <canvas class="race-map" width="180" height="130" aria-label="All eight karts. You are coral with a white ring. Seven coloured dots are game characters. Red squares are missiles and brown squares are coconuts."></canvas>
        <div class="race-speed"><b id="race-speed">0</b><span>KM/H</span></div>
        <div class="race-item"><span id="race-item-label">ITEM</span><b id="race-item">Empty</b><small id="race-pickups">🐚 0 / ${SHELLS}</small></div><div class="race-notice" role="status" aria-live="polite">Loading your driver…</div>
        <div class="race-finish" role="status" hidden></div>
        <div class="race-cover"><span class="eyebrow">DARECADE / ISLAND CIRCUIT</span><h3>COAST<br><em>RUSH</em></h3><p>Your avatar. Seven rivals. Three laps.</p><button class="primary" id="start-game" disabled>Getting your kart ready…</button><button class="race-sound" data-race-sound></button><div class="race-instructions">${touch ? "<span>STEER<br><b>← →</b></span><span>DRIVE<br><b>Hold GO</b></span><span>DRIFT<br><b>Hold, then release</b></span>" : "<span>DRIVE<br><b>W A S D</b></span><span>DRIFT<br><b>Hold SPACE</b></span><span>ITEM<br><b>Tap E</b></span>"}</div><ul class="race-legend"><li><b>🎁 Crates</b>Each gives one of five items at random. ${use} to use it.</li><li class="race-items"><span><b>🛡 Shield</b>blocks hits for 3s</span><span><b>⚡ Turbo</b>2s speed burst</span><span><b>🚀 Missile</b>spins the kart in front</span><span><b>🌩 Storm</b>slows every kart ahead</span><span><b>🥥 Coconut</b>dropped behind you; spins a chaser</span></li><li><b>🐚 Shells</b>Bonus pickups, 12 a lap. They never change your time or medals.</li></ul><p class="race-tip">${touch ? "Hold DRIFT through a bend, then let go for a Mini, Super or Ultra turbo. DRIFT and ITEM keep you accelerating, so one thumb can slide between them and GO." : "Hold W to go. A/D steer, S brakes. Hold Space through a bend, then release for a Mini, Super or Ultra turbo."} At turbo speed the tight bends push you wide unless you drift. A hit costs a 0.75s stop.</p><small>Same kart for everyone · 2 minute limit<br>7 rivals are game characters, not real players.</small></div>
      </div>
      <div class="race-charge"><label for="drift-charge">DRIFT TURBO <span id="drift-label">Hold ${touch ? "DRIFT" : "Space"} while moving</span></label><meter id="drift-charge" min="0" max="1" low=".333" optimum="1" value="0">0</meter></div>
      <div class="race-touch" aria-label="Driving controls"><div class="race-steer"><button data-race-control="left" aria-label="Steer left">←</button><button data-race-control="right" aria-label="Steer right">→</button></div><div class="race-pedals"><button data-race-control="item">ITEM</button><button data-race-control="brake">BRAKE</button><button data-race-control="drift">DRIFT</button><button data-race-control="gas">GO</button></div></div>
      <div class="race-footer"><span>${touch ? "Slide your thumb between GO, DRIFT and ITEM" : "Hold W or GO to drive · Hits cost a 0.75s stop"}</span><span><button class="text-button" data-race-sound></button><button class="text-button" id="pause-game" disabled>Pause</button></span></div>
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
    this.finishCard = container.querySelector(".race-finish")!;
    this.itemBox = container.querySelector(".race-item")!;
    this.shells = container.querySelector("#race-pickups")!;
    const listener = { signal: this.abort.signal };
    const soundButtons =
      container.querySelectorAll<HTMLButtonElement>("[data-race-sound]");
    const showSound = () =>
      soundButtons.forEach((b, i) => {
        const on = options.soundOn();
        b.setAttribute("aria-pressed", String(on));
        b.textContent = i
          ? on
            ? "🔊 Sound"
            : "🔇 Sound"
          : on
            ? "🔊 Sound and music are on"
            : "🔇 Sound is off · tap to turn on";
      });
    soundButtons.forEach((b) =>
      b.addEventListener(
        "click",
        () => {
          options.toggleSound();
          showSound();
        },
        listener,
      ),
    );
    showSound();
    this.finishCard.addEventListener(
      "click",
      (e) => {
        if ((e.target as Element).closest("button")) this.endOutro();
      },
      listener,
    );
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
    this.buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-race-control]"),
    );
    this.buttons.forEach((b) => {
      b.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();
          if (this.paused || !["racing", "countdown"].includes(this.status))
            return;
          b.setPointerCapture(e.pointerId);
          this.pointers.set(e.pointerId, b.dataset.raceControl!);
          this.showHeld();
        },
        listener,
      );
      // A thumb can slide to a neighbouring button without lifting. Off the
      // buttons it keeps its last control, so a small slip does not cut power.
      b.addEventListener(
        "pointermove",
        (e) => {
          if (!this.pointers.has(e.pointerId)) return;
          const over = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest<HTMLElement>("[data-race-control]");
          if (
            over?.parentElement !== b.parentElement ||
            over.dataset.raceControl === this.pointers.get(e.pointerId)
          )
            return;
          this.pointers.set(e.pointerId, over.dataset.raceControl!);
          this.showHeld();
        },
        listener,
      );
      const release = (e: PointerEvent) => {
        this.pointers.delete(e.pointerId);
        this.showHeld();
      };
      b.addEventListener("pointerup", release, listener);
      b.addEventListener("pointercancel", release, listener);
      b.addEventListener("lostpointercapture", release, listener);
    });
    void this.load(look, options.simple, options.playerName);
  }
  private async load(look: Look, simple: boolean, playerName?: string) {
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
          playerName,
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
    button.textContent = "Race! →";
    this.frame = requestAnimationFrame(this.loop);
  }
  private enableSimple() {
    this.stats.classList.add("simple-race");
    this.host.replaceChildren();
    this.cover.querySelector(".race-tip")!.textContent = this.touch
      ? "Simple view: coral is you; coloured dots are game characters. Hold GO, steer with the arrows, hold DRIFT in bends and tap ITEM."
      : "Simple view: coral is you; coloured dots are game characters. Hold W or GO, A/D steer, Space to drift, E for your item.";
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
    this.sound("count");
    this.previousTheme = audio.theme;
    audio.setTheme("race");
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
    if (key === "enter" && this.status === "finished" && this.outroTime > 1) {
      e.preventDefault();
      this.endOutro();
    }
  };
  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.key.toLowerCase());
  };
  private clearInput() {
    this.keys.clear();
    this.pointers.clear();
    this.showHeld();
  }
  private showHeld() {
    const held = new Set(this.pointers.values());
    this.buttons.forEach((b) =>
      b.classList.toggle("held", held.has(b.dataset.raceControl!)),
    );
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
        : // DRIFT and ITEM hold the throttle so one thumb can do all three.
          Number(
            touch.has("gas") ||
              touch.has("drift") ||
              touch.has("item") ||
              this.keys.has("w") ||
              this.keys.has("arrowup"),
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
      if (next !== prev && next > 0) this.sound("count");
      this.notice.textContent = String(Math.max(1, next));
      if (this.countdown <= 0) {
        this.status = "racing";
        this.sound("go");
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
          pickups: race.pickupCount,
          item: race.item,
          shield: race.shield,
          place: race.place,
          tier: race.tier,
          knocks: race.knocks,
        };
        this.motion.capture(race);
        this.sim.advance(input);
        this.cue(before, now);
        this.accumulator -= 1 / 60;
      }
      const message = this.sim.ended
        ? ""
        : race.stunTicks
          ? "HIT! +0.75s stop"
          : race.shield > 0
            ? `🛡 Shield on · hits blocked for ${Math.ceil(race.shield)}s`
            : race.boost > 0
              ? `${race.lastTurbo || "Speed"} turbo!`
              : race.tier
                ? `${race.tier} ready · release Drift!`
                : race.speed < 1
                  ? `Hold ${this.touch ? "GO" : "W"} to accelerate`
                  : "";
      if (this.notice.textContent !== message)
        this.notice.textContent = message;
      if (this.sim.ended) this.end();
    } else if (this.status === "finished") {
      this.outroTime += dt;
      if (this.outroTime > OUTRO_SECONDS) this.endOutro();
    }
    if (this.paused || !["racing", "countdown"].includes(this.status))
      audio.engineOff();
    else audio.engine(race.speed / 23, race.drifting, race.boost > 0);
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
      if (left <= 10 && left > 0 && this.status === "racing")
        this.sound("tick");
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
          : `Hold ${this.touch ? "DRIFT" : "Space"}: Mini 0.8s · Super 1.6s · Ultra 2.4s`;
    this.container.querySelector("#race-place")!.textContent =
      `${ordinal(race.place)} / 8`;
    const item = race.item ? ITEM_NAMES[race.item] : "Empty";
    const itemName = this.container.querySelector("#race-item")!;
    if (itemName.textContent !== item) {
      itemName.textContent = item;
      this.container.querySelector("#race-item-label")!.textContent = race.item
        ? this.touch
          ? "TAP ITEM"
          : "PRESS E"
        : "ITEM";
    }
    const shells = `🐚 ${race.pickupCount} / ${SHELLS}`;
    if (this.shells.textContent !== shells) this.shells.textContent = shells;
    this.stats.dataset.shield = race.shield > 0 ? "on" : "off";
    this.stats.dataset.place = String(race.place);
    this.stats.dataset.pickups = String(race.pickupCount);
    this.stats.dataset.item = race.item || "empty";
    this.stats.dataset.knocks = String(race.knocks);
    this.stats.dataset.speed = race.speed.toFixed(2);
    this.stats.dataset.charge = race.charge.toFixed(3);
    const finished = this.status === "finished";
    this.view?.draw(
      race,
      now / 1000,
      finished ? 0 : input[0],
      this.status === "ready",
      dt,
      finished ? this.outroTime : -1,
      this.motion.sample(
        race,
        !this.paused && this.status === "racing" ? this.accumulator * 60 : 1,
      ),
    );
    this.drawMap();
  };
  /** The flag falls: hand over the result, then let the moment land. */
  private end() {
    const race = this.sim.race!;
    const result = race.result();
    this.status = "finished";
    this.clearInput();
    audio.setTempo(1);
    this.container.querySelector<HTMLButtonElement>("#pause-game")!.disabled =
      true;
    this.sound(result.finished ? "checkered" : "timeup");
    this.finishCard.innerHTML = `<span class="eyebrow">PALM BAY · THREE LAPS</span><h3>${result.finished ? (result.place === 1 ? "WINNER!" : "FINISH!") : "TIME UP"}</h3><p class="finish-place">${ordinal(result.place)}<small> / 8</small></p><div class="finish-stats"><span>TIME<b>${result.finished ? raceTime(result.timeTicks) : "No finish"}</b></span><span>BEST LAP<b>${result.bestLap ? raceTime(result.bestLap) : "—"}</b></span><span>SHELLS<b>${result.pickups} / ${SHELLS}</b></span></div><button class="primary">See results →</button>`;
    this.finishCard.hidden = false;
    this.finish(this.sim.score, {
      version: rulesVersion("coast"),
      ticks: this.sim.ticks,
      events: this.events,
    });
  }
  /** Resolves when the finish sequence is skipped, runs out or the race closes. */
  outro() {
    return new Promise<void>((resolve) => {
      if (this.outroDone || this.status !== "finished") resolve();
      else this.outroResolve = resolve;
    });
  }
  private endOutro() {
    if (this.outroDone) return;
    this.outroDone = true;
    this.outroResolve?.();
  }
  /** Sound and visual events only observe completed simulation ticks. */
  private cue(
    before: {
      boosts: number;
      bumps: number;
      laps: number;
      pickups: number;
      item: RaceItem;
      shield: number;
      place: number;
      tier: string | null;
      knocks: number;
    },
    now: number,
  ) {
    const race = this.sim.race!;
    if (race.pickupCount > before.pickups) {
      this.sound("shell");
      this.flash(this.shells);
    }
    if (race.item && !before.item) {
      this.sound("crate");
      this.flash(this.itemBox);
      this.pop(ITEM_NAMES[race.item].toUpperCase() + "!", now);
    }
    // Shield and turbo already sound through their own state below.
    if (before.item && !race.item) {
      if (before.item === "missile") this.sound("shoot");
      else if (before.item === "storm") {
        this.sound("bigboom");
        this.pop("🌩 STORM!", now);
      } else if (before.item === "coconut") this.sound("blip");
    }
    if (race.knocks > before.knocks) {
      this.sound("boom");
      this.pop("💥 SPUN OUT!", now);
    }
    if (race.shield > 0 && before.shield <= 0) this.sound("shield");
    if (race.shield <= 0 && before.shield > 0) this.sound("shieldoff");
    if (race.tier && race.tier !== before.tier) this.sound("tier");
    if (race.boosts > before.boosts) {
      this.sound("turbo");
      this.onFx?.("power", 0);
    }
    if (race.bumps > before.bumps) {
      this.sound("crash");
      this.onFx?.("hurt", 0);
      if (this.touch && !this.reduced) navigator.vibrate?.(80);
    }
    // The grid shuffles for the first seconds; call out passes after that.
    if (race.ticks > 180 && race.place !== before.place && !race.score)
      this.sound(race.place < before.place ? "overtake" : "overtaken");
    if (race.lapTicks.length > before.laps) {
      this.onFx?.(race.score > 0 ? "big" : "score", race.score || 1);
      if (race.score > 0) return;
      const final = race.lapTicks.length === RACE_LAPS - 1;
      this.sound(final ? "finallap" : "lap");
      this.pop(final ? "FINAL LAP!" : `LAP ${race.lap} / ${RACE_LAPS}`, now);
      // The music pushes on for the last lap.
      if (final) audio.setTempo(1.12);
    }
  }
  private pop(text: string, now: number) {
    if (now - this.lastPop < 400) return;
    this.lastPop = now;
    const pop = document.createElement("span");
    pop.className = "pop big";
    pop.textContent = text;
    this.container.querySelector(".game-pops")!.append(pop);
    setTimeout(() => pop.remove(), 900);
  }
  /** Restarts a short CSS highlight on a HUD element. */
  private flash(el: HTMLElement) {
    el.classList.remove("got");
    void el.offsetWidth;
    el.classList.add("got");
  }
  private drawMap() {
    const ctx = this.map.getContext("2d")!;
    const race = this.sim.race!;
    ctx.clearRect(0, 0, 180, 130);
    const plot = (distance: number, offset = 0) => {
      const p = trackPoint(distance, offset);
      return {
        x: 90 + (p.x - (trackBounds.minX + trackBounds.maxX) / 2) * MAP_SCALE,
        y: 65 + (p.z - (trackBounds.minZ + trackBounds.maxZ) / 2) * MAP_SCALE,
      };
    };
    ctx.lineCap = "round";
    ctx.beginPath();
    for (let i = 0; i <= 240; i++) {
      const p = plot((i / 240) * TRACK_LENGTH);
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
    // Coconuts and missiles show here too, as the simple view has no 3D scene.
    for (const [objects, colour] of [
      [race.coconuts, "#c98a4b"],
      [race.missiles, "#ff5a4a"],
    ] as const)
      for (const object of objects) {
        const point = plot(object.distance, object.offset);
        ctx.fillStyle = colour;
        ctx.fillRect(point.x - 2, point.y - 2, 4, 4);
      }
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
    return `<div class="race-result-detail"><h3>${ordinal(result.place)} / 8${result.finished ? " · Finish!" : " · Time limit"}</h3><div><span>TOTAL TIME<b>${raceTime(result.timeTicks)}</b></span><span>BEST LAP<b>${result.bestLap ? raceTime(result.bestLap) : "—"}</b></span><span>SHELLS<b>${result.pickups} / ${SHELLS}</b></span><span>HIT STOPS<b>${raceTime(result.penaltyTicks)}</b></span></div><p>${result.finished ? "Three laps complete. Try a cleaner line or a longer drift." : `Hold ${this.touch ? "GO" : "W or GO"} to drive. Finish three laps to set a best time.`}</p><details><summary>Street ladder · seven game characters</summary><ol class="street-ladder">${ladder.map((r) => `<li class="${r.you ? "is-you" : ""}"><span>${r.name}</span><b>${Number.isFinite(r.time) ? raceTime(r.time) : "Racing"}</b></li>`).join("")}</ol></details><small>Game characters never enter medal boards. Verified players rank by fastest three-lap time.${this.targetTicks < 7200 ? ` Your time target: ${raceScoreTime(7201 - this.targetTicks)}.` : ""}</small></div>`;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.clearInput();
    this.endOutro();
    audio.engineOff();
    audio.setTempo(1);
    if (this.previousTheme) audio.setTheme(this.previousTheme);
    this.view?.dispose();
    this.view = null;
  }
}
