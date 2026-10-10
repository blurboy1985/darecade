import { mountGraphicsMessage } from "./graphics-support";
import { bindJoystick, joystickMarkup } from "./joystick";
import { MovementInput } from "./movement-input";
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
  type CoastRace,
  type RaceItem,
  type Racer,
} from "../shared/racing";
import { ROOM_CODE } from "../shared/race-room";
import { RaceNet, type Go, type ResultRow, type RoomState } from "./race-net";
import { RaceChat } from "./race-chat";
import { loadCharacter, type Look } from "./character";
import { audio, type Sfx, type Theme } from "./audio";
import type { FxEvent } from "./arcade-fx";
import type { RaceView } from "./race-view";
import { RaceMotion } from "./race-motion";
import { kartSteeringInput } from "./kart-motion";
import { edgeAssist, latchThrottle } from "./race-assist";
import { coastProgress } from "./progression-guide";
import type { Save } from "./state";
import "./racing.css";

const SHELLS = pickups.length * RACE_LAPS;
const ITEM_NAMES: Record<NonNullable<RaceItem>, string> = {
  shield: "🛡 Shield",
  turbo: "⚡ Turbo",
  missile: "🚀 Missile",
  storm: "🌩 Storm",
  coconut: "🥥 Coconut",
  wave: "🌊 Wave",
  crab: "🦀 Crab",
};
const safe = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
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
  /** The solo race the server will replay, or the kart this player drives in a room. */
  private race: CoastRace;
  private net: RaceNet | null = null;
  private room: RoomState | null = null;
  private chat: RaceChat;
  private grid: Go["karts"] = [];
  private you = 0;
  private results: ResultRow[] | null = null;
  private card = "";
  private readonly lobby: HTMLElement;
  private view: RaceView | null = null;
  private readonly motion = new RaceMotion();
  private readonly events: Replay["events"] = [];
  private readonly keys = new Set<string>();
  private readonly keyboard = new MovementInput();
  private readonly pointers = new Map<number, string>();
  private previous = "";
  private frame = 0;
  private last = 0;
  private visibleTicks = 0;
  private driveStarted = false;
  private accumulator = 0;
  private countdown = 3;
  private stick: ReturnType<typeof bindJoystick>;
  private touchSteer = 0;
  private touchBrake = false;
  private status: "loading" | "ready" | "countdown" | "racing" | "finished" =
    "loading";
  private paused = false;
  /** Touch throttle stays on after a tap on GO, until BRAKE. */
  private cruise = false;
  private assistSteer = 0;
  private readonly assist: boolean;
  private pausePanel!: HTMLElement;
  private disposed = false;
  private outroTime = 0;
  private outroDone = false;
  private outroResolve: (() => void) | null = null;
  private previousTheme: Theme | null = null;
  private touch: boolean;
  private readonly graphicsFailure: (lost: boolean) => void;
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
      graphicsFailure?: (lost: boolean) => void;
      target: number;
      best: number;
      /** Edge steering help, for a driver with no finished race yet. */
      assist?: boolean;
      playerName?: string;
      progress?: Pick<Save, "xp" | "coastRecord">;
      soundOn: () => boolean;
      toggleSound: () => void;
    },
  ) {
    this.sim = new Simulation("coast", seed);
    this.race = this.sim.race!;
    this.reduced = options.reduced;
    this.assist = !!options.assist || this.race.novice;
    this.targetTicks =
      options.target > 0
        ? RACE_TICKS + 1 - options.target
        : options.best > 0
          ? RACE_TICKS + 1 - options.best
          : RACE_TICKS;
    // Phones get touch wording; keyboards keep the key names.
    const touch = (this.touch =
      typeof matchMedia === "function" &&
      matchMedia("(any-pointer: coarse)").matches);
    const use = touch ? "Tap ITEM" : "Press E";
    container.innerHTML = `<section class="coast-game" tabindex="-1" aria-label="Coast Rush street race">
      <div class="race-head"><span>PALM BAY <b>3 LAPS · 8 KARTS</b></span><span id="race-field">7 GAME CHARACTERS</span></div>
      <div class="race-screen">
        <div class="race-view"></div>
        <div class="race-hud"><span class="stat-pill place-pill"><small>PLACE</small><b id="race-place">8th / 8</b></span><span class="stat-pill score-pill"><small>TIME</small><b id="run-score">0:00.00</b></span><span id="run-state">LAP <b id="race-lap">1 / 3</b></span><span class="stat-pill time-pill"><small>TIME LEFT</small><b id="run-time">${this.race.limitTicks / 60}s</b></span></div>
        <div class="game-pops" aria-hidden="true"></div>
        <canvas class="race-map" width="180" height="130" aria-label="All eight karts. You are coral with a white ring. The other coloured dots are rival karts. Red squares are missiles, orange squares are crabs and brown squares are coconuts."></canvas>
        <div class="race-speed"><b id="race-speed">0</b><span>KM/H</span></div>
        <button class="race-item" data-race-control="item" aria-label="Use held item"><span id="race-item-label">ITEM</span><b id="race-item">Empty</b><small id="race-pickups">🐚 0 / ${SHELLS}</small></button><div class="race-notice" role="status" aria-live="polite">Loading your driver…</div>
        <div class="race-finish" role="status" hidden></div>
        <div class="race-pause" hidden><h3>Taking a breather</h3><button class="primary" data-resume-race>Resume</button><button class="secondary" data-quit-race>Quit race</button></div><div class="race-cover"><span class="eyebrow">PLAY SIMI / ISLAND CIRCUIT</span><h3>COAST<br><em>RUSH</em></h3>${options.progress ? coastProgress(options.progress) : "<p>Your avatar. Seven rivals. Three laps.</p>"}<progress class="race-loading" max="3" value="0" aria-label="Loading race"></progress><button class="primary" id="start-game" disabled>Getting your kart ready…</button><button class="secondary race-versus" id="versus-open" disabled>👥 Race friends live</button><div class="race-lobby" hidden></div><button class="race-sound" data-race-sound></button><details class="race-guide"><summary>Controls & items</summary><div class="race-instructions">${touch ? "<span>STEER<br><b>Joystick</b></span><span>DRIVE<br><b>Tap GO</b></span><span>DRIFT<br><b>Hold, then release</b></span>" : "<span>DRIVE<br><b>W A S D</b></span><span>DRIFT<br><b>Hold SPACE</b></span><span>ITEM<br><b>Tap E</b></span>"}</div><ul class="race-legend"><li><b>🎁 Crates</b>Each gives one of seven items at random. <span class="race-use">${use}</span> to use it.</li><li class="race-items"><span><b>🛡 Shield</b>blocks bumps and items for 3s</span><span><b>⚡ Turbo</b>2s speed burst</span><span><b>🚀 Missile</b>spins the kart in front</span><span><b>🌩 Storm</b>slows every kart ahead</span><span><b>🥥 Coconut</b>dropped behind you; spins a chaser</span><span><b>🌊 Wave</b>spins every kart close to you</span><span><b>🦀 Crab</b>chases down the leader</span></li><li><b>🐚 Shells</b>Bonus pickups, 12 a lap. They never change your time or medals.</li></ul><p class="race-tip"><span class="race-tip-input">${touch ? "Tap GO once and the kart keeps driving; pull the joystick down to brake. Hold DRIFT through a bend, then let go for a Mini, Super or Ultra turbo." : "Hold W to go. A/D steer, S brakes. Hold Space through a bend, then release for a Mini, Super or Ultra turbo."}</span> The hairpins push you wide unless you drift or brake. Walls and bumps only rub off speed; rivals use items too.${options.assist ? " Until your first finish, the kart steers itself back from the road edge when you are not steering." : ""}</p><small>Same kart for everyone · ${this.race.novice ? "3 minute first-finish" : "2 minute"} limit · Pause or P stops the clock<br>In a solo race the 7 rivals are game characters, not real players.</small></details></div>
      </div>
      <div class="race-charge"><label for="drift-charge">DRIFT TURBO <span id="drift-label">Hold ${touch ? "DRIFT" : "Space"} while moving</span></label><meter id="drift-charge" min="0" max="1" low=".333" optimum="1" value="0">0</meter></div>
      <div class="race-touch" aria-label="Driving controls"><div class="race-steer">${joystickMarkup("Steer")}</div><div class="race-pedals"><button data-race-control="drift">DRIFT</button><button data-race-control="gas" aria-pressed="false">GO</button></div></div>
      <div class="race-footer"><span class="race-footer-guidance">${touch ? "Tap GO to drive · pull the joystick down to brake" : "Hold W or tap GO to drive · Space to drift"}</span><span><button class="text-button" data-race-sound></button><button class="text-button" id="pause-game" disabled>Pause</button></span></div>
    </section>`;
    this.pausePanel = container.querySelector(".race-pause")!;
    this.pausePanel
      .querySelector("[data-resume-race]")!
      .addEventListener("click", () => {
        if (this.paused || this.race.versus) this.togglePause();
      });
    this.pausePanel
      .querySelector("[data-quit-race]")!
      .addEventListener("click", () => this.quit());
    this.host = container.querySelector(".race-view")!;
    this.cover = container.querySelector(".race-cover")!;
    this.lobby = container.querySelector(".race-lobby")!;
    // The lobby and the results redraw themselves, so chat sits beside them.
    this.chat = new RaceChat((line) => this.net?.say(line));
    this.chat.element.hidden = true;
    container.querySelector(".race-screen")!.append(this.chat.element);
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
    this.setInput(touch);
    this.stats.addEventListener(
      "pointerdown",
      (event) => {
        if (
          event.pointerType === "touch" ||
          event.pointerType === "pen" ||
          (event.target instanceof Element &&
            event.target.closest(".race-touch, .race-item"))
        )
          this.setInput(true);
      },
      { ...listener, capture: true },
    );
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
        const button = (e.target as Element).closest("button");
        if (button?.dataset.versus === "start") this.net?.start();
        else if (button?.dataset.versus === "leave")
          this.leaveRoom("You left the race.");
        else if (button) this.endOutro();
      },
      listener,
    );
    container.querySelector("#versus-open")!.addEventListener(
      "click",
      () => {
        this.cover.classList.add("in-lobby");
        this.lobby.hidden = false;
        this.showLobby();
      },
      listener,
    );
    this.lobby.addEventListener(
      "click",
      (e) => {
        const action = (e.target as Element).closest<HTMLElement>(
          "[data-versus]",
        )?.dataset.versus;
        if (action === "host") this.connect(null);
        else if (action === "start") this.net?.start();
        else if (action === "leave" || action === "back") {
          this.net?.close();
          this.setRoom(null);
          if (action === "leave") this.showLobby();
          else {
            this.cover.classList.remove("in-lobby");
            this.lobby.hidden = true;
          }
        }
      },
      listener,
    );
    this.lobby.addEventListener(
      "submit",
      (e) => {
        e.preventDefault();
        const code = this.lobby
          .querySelector<HTMLInputElement>("#race-code")!
          .value.trim()
          .toUpperCase();
        if (ROOM_CODE.test(code)) this.connect(code);
        else this.showLobby("Enter the four-letter code your friend shared.");
      },
      listener,
    );
    container
      .querySelector("#start-game")!
      .addEventListener("click", () => this.start(), listener);
    container
      .querySelector("#pause-game")!
      .addEventListener("click", () => this.togglePause(), listener);
    window.addEventListener("keydown", this.keyDown, {
      ...listener,
      capture: true,
    });
    window.addEventListener("keyup", this.keyUp, listener);
    window.addEventListener("blur", this.onBlur, listener);
    document.addEventListener("visibilitychange", this.hidden, listener);
    this.stick = bindJoystick(
      container.querySelector<HTMLElement>("[data-joystick]")!,
      (x, y) => {
        this.touchSteer = Math.sign(x);
        this.touchBrake = y > 0.65;
        if (this.touchBrake) this.cruise = false;
      },
    );
    this.buttons = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-race-control]"),
    );
    // A long press must drive the kart, never open the browser's menu.
    this.stats.addEventListener(
      "contextmenu",
      (e) => e.preventDefault(),
      listener,
    );
    this.buttons.forEach((b) => {
      const control = b.dataset.raceControl!;
      b.addEventListener(
        "pointerdown",
        (e) => {
          e.preventDefault();
          if (!this.press(control)) return;
          this.pointers.set(e.pointerId, control);
          try {
            b.setPointerCapture(e.pointerId);
          } catch {
            // The control is already held; capture only follows a sliding thumb.
          }
          this.showHeld();
        },
        listener,
      );
      // Keyboard, switch and assistive activation arrive as a click alone.
      b.addEventListener(
        "click",
        () => {
          if (this.press(control)) this.showHeld();
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
          this.cruise = latchThrottle(this.cruise, over.dataset.raceControl!);
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
    this.graphicsFailure =
      options.graphicsFailure ??
      ((lost) => mountGraphicsMessage(this.container, lost));
    void this.load(look, options.playerName);
  }
  /**
   * A control was pressed. Wakes a kart that paused itself, and latches or
   * releases the throttle. False while the race is not taking input.
   */
  private press(control: string) {
    if (this.paused || !["racing", "countdown"].includes(this.status))
      return false;
    this.cruise = latchThrottle(this.cruise, control);
    return true;
  }
  private async load(look: Look, playerName?: string) {
    const progress =
      this.container.querySelector<HTMLProgressElement>(".race-loading")!;
    progress.value = 1;
    try {
      {
        const [module] = await Promise.all([
          import("./race-view"),
          loadCharacter(),
        ]);
        if (this.disposed) return;
        progress.value = 2;
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
      if (!this.disposed) this.graphicsFailure(false);
      return;
    }
    if (this.disposed) return;
    progress.value = 3;
    progress.hidden = true;
    this.status = "ready";
    this.notice.textContent = "";
    const button =
      this.container.querySelector<HTMLButtonElement>("#start-game")!;
    button.disabled = false;
    button.textContent = "Race! →";
    this.container.querySelector<HTMLButtonElement>("#versus-open")!.disabled =
      false;
    this.frame = requestAnimationFrame(this.loop);
  }
  private contextLost = (e: Event) => {
    e.preventDefault();
    if (this.disposed) return;
    this.onBlur();
    cancelAnimationFrame(this.frame);
    this.graphicsFailure(true);
  };
  /** The multiplayer panel on the cover: host or join, then wait for the start. */
  private showLobby(note = "") {
    const room = this.room;
    if (!room) {
      this.lobby.innerHTML = `<h4>Race friends live</h4><p>2 to 8 players race the same three laps at once. Computer karts fill the rest of the grid. These are friendly races: no XP, medals or records.</p><button class="primary" data-versus="host">Host a race</button><form class="race-join"><label for="race-code">Have a code?</label><input id="race-code" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CODE" aria-label="Four-letter race code"><button class="secondary">Join</button></form><p class="race-lobby-note" role="status">${safe(note)}</p><button class="text-button" data-versus="back">← Solo race</button>`;
      return;
    }
    const hosting = room.host === room.you;
    const waiting = room.players.length < room.min;
    this.lobby.innerHTML = `<span class="eyebrow">RACE CODE</span><strong class="race-code">${room.code}</strong><p>Friends open Coast Rush, choose Race friends live and enter this code.</p><ol class="race-roster">${room.players.map((p, i) => `<li class="${i === room.you ? "is-you" : ""}"><span>${safe(p.name)}</span><b>${[i === room.host ? "Host" : "", i === room.you ? "You" : ""].filter(Boolean).join(" · ")}</b></li>`).join("")}</ol><p class="race-lobby-note" role="status">${safe(note) || (waiting ? "Waiting for another player to join…" : hosting ? `${room.players.length} players · ${room.cap - room.players.length} computer karts fill the grid.` : `Waiting for ${safe(room.players[room.host]?.name ?? "the host")} to start.`)}</p>${hosting ? `<button class="primary" data-versus="start"${waiting ? " disabled" : ""}>Start race →</button>` : ""}<button class="text-button" data-versus="leave">Leave</button>`;
  }
  /** Chat is there for as long as the player is in a room. */
  private setRoom(room: RoomState | null) {
    this.room = room;
    this.chat.element.hidden = !room;
    if (room) this.chat.setPlayers(room.players, room.you);
    else this.chat.clear();
  }
  private connect(code: string | null) {
    this.net ??= new RaceNet({
      room: (state) => {
        this.setRoom(state);
        if (this.status === "ready") this.showLobby();
      },
      go: (go) => this.beginVersus(go),
      hit: (hit) => {
        // This kart's own hits are cued from its simulation.
        if (hit.kart !== this.you || hit.kind !== "block") return;
        this.sound("shield");
        this.pop("🛡 BLOCKED!", performance.now());
      },
      used: (kart, item) => {
        const rival =
          kart === this.you
            ? null
            : this.race.rivals[kart < this.you ? kart : kart - 1];
        if (rival) this.rivalUsed(rival, item);
      },
      end: (results) => {
        this.results = results;
      },
      chat: (from, line) => this.chat.heard(from, line),
      error: (message) => {
        this.setRoom(null);
        if (this.status === "ready") this.showLobby(message);
        else if (this.race.versus) this.leaveRoom(message);
      },
    });
    this.showLobby(code ? "Joining…" : "Setting up your race…");
    this.net.connect(code);
  }
  /** The room dropped the flag: line up on its grid and count down with everyone else. */
  private beginVersus(go: Go) {
    if (!this.view || !this.net) return;
    this.race = this.net.begin(go);
    this.grid = go.karts;
    this.you = go.you;
    this.results = null;
    this.card = "";
    this.view.setRivals(
      go.karts
        .filter((_, i) => i !== go.you)
        .map((k) => ({ name: k.name, color: k.color, look: k.look })),
    );
    this.events.length = 0;
    this.previous = "";
    this.accumulator = 0;
    this.visibleTicks = 0;
    this.driveStarted = true;
    this.cruise = false;
    this.paused = false;
    this.outroTime = 0;
    this.outroDone = false;
    this.clearInput();
    this.motion.capture(this.race);
    this.countdown = go.in / 1000;
    this.status = "countdown";
    this.cover.hidden = true;
    this.finishCard.hidden = true;
    this.pausePanel.hidden = true;
    this.notice.textContent = "Get ready…";
    this.previousTheme ??= audio.theme;
    audio.setTheme("race");
    audio.setTempo(1);
    const players = go.karts.filter((k) => k.look).length;
    this.container.querySelector("#race-field")!.textContent =
      `LIVE · ${players} PLAYERS`;
    const leave =
      this.container.querySelector<HTMLButtonElement>("#pause-game")!;
    leave.disabled = false;
    leave.textContent = "Leave";
    this.stats.focus();
    this.last = performance.now();
  }
  /** Leaves the room, or reports that it was lost. A solo race is one tap away. */
  private leaveRoom(message: string) {
    this.net?.close();
    this.setRoom(null);
    this.status = "finished";
    this.outroDone = true;
    this.pausePanel.hidden = true;
    this.clearInput();
    this.container.querySelector<HTMLButtonElement>("#pause-game")!.disabled =
      true;
    this.notice.textContent = "";
    this.card = "";
    this.finishCard.innerHTML = `<h3>Race over</h3><p>${safe(message)}</p><button data-replay="coast" class="primary">Back to Coast Rush</button><button data-action="close" class="secondary">Back to world</button>`;
    this.finishCard.hidden = false;
  }
  /** Standings for a multiplayer race: live while karts are still out, final once the room says so. */
  private versusCard() {
    const race = this.race;
    const rows = this.results
      ? this.results.map((r) => ({
          name: r.name,
          cpu: r.cpu,
          ticks: r.ticks,
          you: r.kart === this.you,
          racing: false,
        }))
      : [
          {
            name: this.grid[this.you]?.name ?? "You",
            cpu: false,
            ticks: race.finishTick,
            distance: race.distance,
            you: true,
            racing: false,
          },
          ...race.rivals
            .filter((r) => r.distance > -500)
            .map((r) => ({
              name: r.name,
              cpu: r.pace > 0,
              ticks: r.finishTick,
              distance: r.distance,
              you: false,
              racing: !r.finishTick,
            })),
        ].sort(
          (a, b) =>
            (a.ticks || Infinity) - (b.ticks || Infinity) ||
            b.distance - a.distance,
        );
    const place = rows.findIndex((r) => r.you) + 1;
    const room = this.room;
    const hosting = !!room && room.host === room.you;
    return `<span class="eyebrow">PALM BAY · LIVE RACE</span><h3>${race.score ? (place === 1 ? "WINNER!" : "FINISH!") : "Out of time"}</h3><p class="finish-place">${ordinal(place)}<small> / ${rows.length}</small></p><ol class="street-ladder versus-ladder">${rows.map((r) => `<li class="${r.you ? "is-you" : ""}"><span>${safe(r.name)}${r.you ? " · You" : r.cpu ? " · CPU" : ""}</span><b>${r.ticks ? raceTime(r.ticks) : r.racing ? "Racing" : "No finish"}</b></li>`).join("")}</ol><p class="race-lobby-note" role="status">${this.results ? (hosting ? "" : `Waiting for ${safe(room?.players[room.host]?.name ?? "the host")} to start the next race.`) : "Waiting for the other racers…"}</p>${this.results && hosting ? `<button class="primary" data-versus="start"${room!.players.length < room!.min ? " disabled" : ""}>Race again →</button>` : ""}<button class="secondary" data-versus="leave">Leave race</button>`;
  }
  /** Another kart used an item: show the ones a driver should see coming. */
  private rivalUsed(rival: Racer, item: NonNullable<RaceItem>) {
    if (item !== "wave") return;
    this.view?.wave(rival.distance, rival.offset);
    if (Math.abs(rival.distance - this.race.distance) < 40) this.sound("boom");
  }
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
  private setInput(touch: boolean) {
    this.touch = touch;
    this.stats.dataset.input = touch ? "touch" : "keyboard";
    this.container.querySelector(".race-instructions")!.innerHTML = touch
      ? "<span>STEER<br><b>Joystick</b></span><span>DRIVE<br><b>Tap GO</b></span><span>DRIFT<br><b>Hold DRIFT</b></span>"
      : "<span>DRIVE<br><b>W A S D / arrows</b></span><span>DRIFT<br><b>Hold Space</b></span><span>ITEM<br><b>Press E</b></span>";
    this.container.querySelector(".race-use")!.textContent = touch
      ? "Tap ITEM"
      : "Press E";
    this.container.querySelector(".race-tip-input")!.textContent = touch
      ? "Tap GO once to keep driving; pull the joystick down to brake. Hold DRIFT through a bend, then release for a turbo."
      : "Hold W or Up to accelerate; A/D or Left/Right steer; S or Down brakes. Hold Space through a bend, then release for a turbo.";
    this.container.querySelector(".race-footer-guidance")!.textContent = touch
      ? "Tap GO to drive · joystick to steer and brake"
      : "Hold W / ↑ to drive · A/D to steer · E for item";
  }
  private keyDown = (e: KeyboardEvent) => {
    // Typing a room code is not driving.
    if (e.target instanceof HTMLInputElement) return;
    // In a room, the number keys say a line without leaving the wheel.
    if (this.room && !e.repeat && this.chat.key(e.key)) {
      e.preventDefault();
      return;
    }
    const key = /^Key[WASDE]$/.test(e.code)
      ? e.code.slice(3).toLowerCase()
      : e.key.toLowerCase();
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
      if (!this.paused && ["racing", "countdown"].includes(this.status)) {
        this.setInput(false);
        this.keys.add(key);
        if (!e.repeat) this.keyboard.press(key);
        if (key === "s" || key === "arrowdown") this.cruise = false;
      }
    }
    if (
      [
        "w",
        "a",
        "s",
        "d",
        "e",
        " ",
        "arrowup",
        "arrowdown",
        "arrowleft",
        "arrowright",
      ].includes(key)
    )
      this.setInput(false);
    if (key === "p" && !e.repeat) this.togglePause();
    if (key === "enter" && this.status === "finished" && this.outroTime > 1) {
      e.preventDefault();
      this.endOutro();
    }
  };
  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(
      /^Key[WASDE]$/.test(e.code)
        ? e.code.slice(3).toLowerCase()
        : e.key.toLowerCase(),
    );
  };
  private clearInput() {
    this.touchSteer = 0;
    this.touchBrake = false;
    this.keys.clear();
    this.keyboard.clear();
    this.pointers.clear();
    this.showHeld();
  }
  private showHeld() {
    const held = new Set(this.pointers.values());
    if (this.cruise) held.add("gas");
    this.buttons.forEach((b) => {
      const on = held.has(b.dataset.raceControl!);
      b.classList.toggle("held", on);
      if (b.dataset.raceControl === "gas")
        b.setAttribute("aria-pressed", String(on));
    });
  }
  private onBlur = () => {
    if (
      !this.paused &&
      !this.race.versus &&
      ["racing", "countdown"].includes(this.status)
    )
      this.togglePause();
    this.clearInput();
  };
  private hidden = () => {
    if (document.hidden) this.onBlur();
  };
  pause() {
    if (!this.paused && !this.race.versus) this.togglePause();
  }
  requestQuit() {
    if (!["racing", "countdown"].includes(this.status)) return false;
    if (this.race.versus) {
      if (this.pausePanel.hidden) this.togglePause();
      return true;
    }
    this.pause();
    this.pausePanel.querySelector("h3")!.textContent = "Leave this race?";
    return true;
  }
  private quit() {
    if (!["racing", "countdown"].includes(this.status)) return;
    if (this.race.versus) {
      this.leaveRoom("You left the race.");
      return;
    }
    // A quit is a local incomplete result, never a fabricated replay finish.
    this.paused = false;
    this.pausePanel.hidden = true;
    this.status = "finished";
    this.container.querySelector<HTMLButtonElement>("#pause-game")!.disabled =
      true;
    this.container.classList.remove("is-paused");
    this.notice.textContent = "";
    this.clearInput();
    this.finishCard.innerHTML = `<h3>Race result</h3><p>${raceTime(this.race.ticks)} · ${ordinal(this.race.place)} place · Race left early</p><button data-replay="coast" class="primary">Race again</button><button data-action="close" class="secondary">Back to world</button>`;
    this.finishCard.hidden = false;
  }
  private togglePause() {
    if (!["racing", "countdown"].includes(this.status)) return;
    if (this.race.versus) {
      // Everyone shares the clock, so it cannot stop. This only offers the way out.
      this.pausePanel.hidden = !this.pausePanel.hidden;
      this.pausePanel.querySelector("h3")!.textContent =
        "Leave this race? It carries on without you.";
      return;
    }
    this.paused = !this.paused;
    this.pausePanel.hidden = !this.paused;
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
  private controls(dt: number): Input {
    const keys = this.keyboard.sample(this.keys, dt);
    const touch = new Set(this.pointers.values());
    let steer = kartSteeringInput(
      this.touchSteer < 0 ||
        touch.has("left") ||
        keys.has("arrowleft") ||
        keys.has("a"),
      this.touchSteer > 0 ||
        touch.has("right") ||
        keys.has("arrowright") ||
        keys.has("d"),
    );
    if (this.assist && !this.race.versus && this.status === "racing") {
      this.assistSteer = edgeAssist(this.race.offset, steer, this.assistSteer);
      steer ||= this.assistSteer;
    }
    return [
      steer,
      this.touchBrake ||
      touch.has("brake") ||
      keys.has("arrowdown") ||
      keys.has("s")
        ? -1
        : // DRIFT and ITEM hold the throttle so one thumb can do all three.
          Number(
            this.cruise ||
              touch.has("gas") ||
              touch.has("drift") ||
              touch.has("item") ||
              keys.has("w") ||
              keys.has("arrowup"),
          ),
      Number(touch.has("item") || keys.has("e")),
      Number(touch.has("drift") || keys.has(" ")),
      -1,
      -1,
    ];
  }
  private loop = (now: number) => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.loop);
    // Rendering may be slow. Every active second still gets 60 replayable ticks.
    const dt = this.last ? Math.max(0, (now - this.last) / 1000) : 0;
    let activeDt = dt;
    this.last = Math.max(this.last, now);
    const race = this.race;
    const input = this.controls(dt);
    if (!this.paused && this.status === "countdown") {
      const prev = Math.ceil(this.countdown);
      this.countdown -= dt;
      const next = Math.ceil(this.countdown);
      if (next !== prev && next > 0 && next <= 3) this.sound("count");
      this.notice.textContent =
        next > 3 ? "Get ready…" : String(Math.max(1, next));
      if (this.countdown <= 0) {
        activeDt = -this.countdown;
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
    }
    if (!this.paused && this.status === "racing") {
      this.driveStarted ||= input[1] > 0;
      if (this.driveStarted) this.accumulator += activeDt;
      while (this.accumulator >= 1 / 60 && !race.ended) {
        const stamp = JSON.stringify(input);
        if (stamp !== this.previous) {
          this.events.push([race.ticks, ...input]);
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
          struck: race.struck,
          blocks: race.blocks,
        };
        this.motion.capture(race);
        // A solo race goes through the replayable simulation. In a room the
        // kart is driven directly: there is no replay to check.
        if (race.versus)
          race.advance(input[0], input[1], input[3] > 0, input[2] === 1);
        else this.sim.advance(input);
        this.cue(before, now);
        this.accumulator -= 1 / 60;
      }
      const message = race.ended
        ? ""
        : race.spin
          ? "Spun out!"
          : race.slow
            ? "🌩 Storm · slowed"
            : race.scraping
              ? "Off the wall!"
              : race.shield > 0
                ? `🛡 Shield on · hits blocked for ${Math.ceil(race.shield)}s`
                : race.boost > 0
                  ? `${race.lastTurbo || "Speed"} turbo!`
                  : race.tier
                    ? `${race.tier} ready · release Drift!`
                    : race.speed < 1
                      ? `${this.touch ? "Tap GO" : "Hold W"} to accelerate`
                      : "";
      if (!this.paused && this.notice.textContent !== message)
        this.notice.textContent = message;
      if (race.ended) this.end();
    } else if (this.status === "finished") {
      this.outroTime += dt;
      if (this.outroTime > OUTRO_SECONDS) this.endOutro();
      if (race.versus && this.net?.open) {
        // Standings fill in as the other karts come home.
        const card = this.versusCard();
        if (card !== this.card) this.finishCard.innerHTML = this.card = card;
      }
    }
    if (race.versus) this.net?.frame(Math.min(dt, 0.25));
    if (this.paused || !["racing", "countdown"].includes(this.status))
      audio.engineOff();
    else audio.engine(race.speed / 23, race.drifting, race.boost > 0);
    this.stats.dataset.status = this.status;
    this.stats.dataset.distance = race.distance.toFixed(2);
    this.stats.dataset.offset = race.offset.toFixed(2);
    this.stats.dataset.ticks = String(race.ticks);
    this.visibleTicks = Math.max(this.visibleTicks, race.ticks);
    this.timer.textContent = raceTime(this.visibleTicks);
    const left = Math.max(
      0,
      Math.ceil((race.limitTicks - this.visibleTicks) / 60),
    );
    const time = this.container.querySelector("#run-time")!;
    if (time.textContent !== `${left}s`) {
      time.textContent = `${left}s`;
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
    this.stats.dataset.mode = race.versus ? "versus" : "solo";
    this.stats.dataset.room = this.room?.code ?? "";
    this.stats.dataset.drift = String(race.drifting ? race.driftDir : 0);
    this.stats.dataset.bumps = String(race.bumps);
    this.stats.dataset.charge = race.charge.toFixed(3);
    const finished = this.status === "finished";
    this.view?.draw(
      race,
      now / 1000,
      finished ? 0 : input[0],
      this.status === "ready",
      Math.min(dt, 0.1),
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
    const race = this.race;
    const result = race.result();
    this.status = "finished";
    this.cruise = false;
    this.clearInput();
    audio.setTempo(1);
    this.container.querySelector<HTMLButtonElement>("#pause-game")!.disabled =
      true;
    this.sound(result.finished ? "checkered" : "timeup");
    if (race.versus) {
      this.finishCard.innerHTML = this.card = this.versusCard();
      this.finishCard.hidden = false;
      return;
    }
    this.finishCard.innerHTML = `<span class="eyebrow">PALM BAY · THREE LAPS</span><h3>${result.finished ? (result.place === 1 ? "WINNER!" : "FINISH!") : `So close! Lap ${race.lap} of 3 — try again?`}</h3>${result.finished ? `<p class="finish-place">${ordinal(result.place)}<small> / 8</small></p>` : ""}<div class="finish-stats"><span>TIME<b>${raceTime(result.timeTicks)}</b></span><span>BEST LAP<b>${result.bestLap ? raceTime(result.bestLap) : "—"}</b></span><span>SHELLS<b>${result.pickups} / ${SHELLS}</b></span></div><button class="primary">See results →</button>`;
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
      struck: number;
      blocks: number;
    },
    now: number,
  ) {
    const race = this.race;
    if (!race.versus) {
      for (const use of race.field.uses)
        if (use.kart) this.rivalUsed(race.rivals[use.kart - 1], use.item);
      if (race.blocks > before.blocks) {
        this.sound("shield");
        this.pop("🛡 BLOCKED!", now);
      }
    }
    if (race.struck > before.struck && race.lastStruck) {
      // Say who did it: a rival's item is part of the race now.
      const { by, item } = race.lastStruck;
      this.sound(item === "storm" ? "bigboom" : "boom");
      this.pop(
        `${ITEM_NAMES[item].split(" ")[0]} ${by.toUpperCase()}’S ${ITEM_NAMES[item].split(" ")[1].toUpperCase()}!`,
        now,
      );
      this.onFx?.("hurt", 0);
      if (this.touch && !this.reduced) navigator.vibrate?.(80);
    }
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
      else if (before.item === "crab") this.sound("shoot");
      else if (before.item === "wave") {
        this.sound("bigboom");
        this.pop("🌊 WAVE!", now);
        this.view?.wave(race.distance, race.offset);
      }
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
    // A bump only rubs off speed, so it gets a knock and no red flash.
    if (race.bumps > before.bumps) {
      this.sound("crash");
      if (this.touch && !this.reduced) navigator.vibrate?.(25);
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
    const race = this.race;
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
    // Coconuts and missiles stay visible on the shared minimap.
    for (const object of [...race.coconuts, ...race.missiles]) {
      const point = plot(object.distance, object.offset);
      ctx.fillStyle = !("crab" in object)
        ? "#c98a4b"
        : object.crab
          ? "#ff9a3d"
          : "#ff5a4a";
      ctx.fillRect(point.x - 2, point.y - 2, 4, 4);
    }
    for (const rival of race.rivals) {
      if (rival.distance < -500) continue;
      const point = plot(rival.distance, rival.offset);
      ctx.fillStyle = rival.color;
      ctx.beginPath();
      ctx.arc(point.x, point.y, rival.pace ? 3 : 3.6, 0, Math.PI * 2);
      ctx.fill();
      // Other players get a dark ring; computer karts are plain dots.
      if (!rival.pace) {
        ctx.strokeStyle = "#16313b";
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
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
    const race = this.race;
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
    return `<div class="race-result-detail"><h3>${ordinal(result.place)} / 8${result.finished ? " · Finish!" : " · Time limit"}</h3><div><span>TOTAL TIME<b>${raceTime(result.timeTicks)}</b></span><span>BEST LAP<b>${result.bestLap ? raceTime(result.bestLap) : "—"}</b></span><span>SHELLS<b>${result.pickups} / ${SHELLS}</b></span><span>BUMPS<b>${result.bumps}</b></span></div><p>${result.finished ? "Three laps complete. Drift the hairpins and keep off the walls to go faster." : `${this.touch ? "Tap GO" : "Hold W or tap GO"} to drive, and steer through the bends. Finish three laps to set a best time.`}</p><details><summary>Street ladder · seven game characters</summary><ol class="street-ladder">${ladder.map((r) => `<li class="${r.you ? "is-you" : ""}"><span>${r.name}</span><b>${Number.isFinite(r.time) ? raceTime(r.time) : "Racing"}</b></li>`).join("")}</ol></details><small>Game characters never enter medal boards. Verified players rank by fastest three-lap time.${this.targetTicks < 7200 ? ` Your time target: ${raceScoreTime(7201 - this.targetTicks)}.` : ""}</small></div>`;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.abort.abort();
    this.net?.close();
    this.stick.dispose();
    this.clearInput();
    this.endOutro();
    audio.engineOff();
    audio.setTempo(1);
    if (this.previousTheme) audio.setTheme(this.previousTheme);
    this.view?.dispose();
    this.view = null;
  }
}
