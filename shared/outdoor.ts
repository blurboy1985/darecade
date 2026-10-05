/** East Side rounds. Deterministic and replayed by the server, like the cabinets. */
import { fishSpecies, HOOPS_SHOTS } from "../src/state.ts";

class Random {
  private state: number;
  constructor(seed: number) {
    this.state = seed >>> 0;
  }
  next() {
    this.state = (Math.imul(this.state, 1664525) + 1013904223) >>> 0;
    return this.state / 4294967296;
  }
}

export const HOOPS_SHOT_TICKS = 240;
export const HOOPS_FLIGHT_TICKS = 40;
export type HoopsShot = "perfect" | "made" | "miss" | "late";

/** Ten shots against a shot clock. Stop the marker inside the green. */
export class HoopsRound {
  readonly kind = "hoops";
  ticks = 0;
  score = 0;
  ended = false;
  shot = 0;
  /** Shots deliberately taken, excluding expired shot clocks. */
  attempts = 0;
  made = 0;
  streak = 0;
  marker = 0;
  centre = 0.5;
  width = 0.27;
  clock = HOOPS_SHOT_TICKS;
  /** Ticks left of the ball's flight; the next shot is set up when it lands. */
  flight = 0;
  last: HoopsShot | null = null;
  lastPoints = 0;
  private phase = 0;
  private drift = 0;
  private held = false;
  private readonly random: Random;
  constructor(seed = 0) {
    this.random = new Random(seed);
    this.aim();
  }
  result() {
    return { made: this.made, attempts: this.attempts };
  }
  private aim() {
    this.width = Math.max(0.13, 0.27 - this.shot * 0.016);
    this.centre = 0.2 + this.random.next() * 0.6;
    // From the fourth shot the green slides as well.
    this.drift =
      this.shot < 3
        ? 0
        : (this.random.next() < 0.5 ? -1 : 1) * (0.12 + this.shot * 0.025);
    this.phase = this.random.next();
    this.clock = HOOPS_SHOT_TICKS;
  }
  advance(press: boolean) {
    if (this.ended) return;
    this.ticks++;
    const pressed = press && !this.held;
    this.held = press;
    if (this.flight) {
      if (--this.flight) return;
      if (this.shot >= HOOPS_SHOTS) this.ended = true;
      else this.aim();
      return;
    }
    // Each shot the marker is quicker. A triangle wave needs no trigonometry.
    this.phase = (this.phase + (0.5 + this.shot * 0.05) / 60) % 1;
    this.marker = this.phase < 0.5 ? this.phase * 2 : 2 - this.phase * 2;
    this.centre += this.drift / 60;
    const edge = this.width / 2 + 0.02;
    if (this.centre < edge || this.centre > 1 - edge) {
      this.centre = Math.max(edge, Math.min(1 - edge, this.centre));
      this.drift = -this.drift;
    }
    this.clock--;
    if (!pressed && this.clock) return;
    if (pressed) this.attempts++;
    const off = Math.abs(this.marker - this.centre);
    this.last = !pressed
      ? "late"
      : off <= this.width * 0.17
        ? "perfect"
        : off <= this.width / 2
          ? "made"
          : "miss";
    if (this.last === "perfect" || this.last === "made") {
      this.made++;
      this.streak++;
      // Two for a basket, three for a swish, and up to three more on a streak.
      this.lastPoints =
        (this.last === "perfect" ? 3 : 2) + Math.min(3, this.streak - 1);
    } else {
      this.streak = 0;
      this.lastPoints = 0;
    }
    this.score += this.lastPoints;
    this.shot++;
    this.flight = HOOPS_FLIGHT_TICKS;
  }
}

export const FISHING_TICKS = 3600;
/** Points and fight (0 gentle, 1 fierce) by species, rarest last. */
export const fishStats: Record<
  (typeof fishSpecies)[number]["id"],
  { points: number; fight: number }
> = {
  guppy: { points: 10, fight: 0.15 },
  tilapia: { points: 15, fight: 0.3 },
  catfish: { points: 25, fight: 0.5 },
  prawn: { points: 30, fight: 0.4 },
  terrapin: { points: 60, fight: 0.75 },
  koi: { points: 80, fight: 1 },
};
export type FishingState =
  | "idle"
  | "waiting"
  | "bite"
  | "reeling"
  | "landed"
  | "lost";
export type FishingLoss = "early" | "missed" | "snapped" | "escaped";

/** One minute on the jetty. Hook the bite, then reel without snapping the line. */
export class FishingRound {
  readonly kind = "fishing";
  ticks = 0;
  score = 0;
  ended = false;
  state: FishingState = "idle";
  /** Species on the line, or the last one landed. */
  fish: (typeof fishSpecies)[number] | null = null;
  progress = 0;
  tension = 0;
  surging = false;
  loss: FishingLoss | null = null;
  readonly catches: string[] = [];
  private timer = 0;
  private surge = 0;
  private held = false;
  private readonly random: Random;
  constructor(seed = 0) {
    this.random = new Random(seed);
  }
  result() {
    return { catches: [...this.catches] };
  }
  private lose(loss: FishingLoss) {
    this.state = "lost";
    this.loss = loss;
    this.timer = 40;
  }
  advance(hold: boolean) {
    if (this.ended) return;
    this.ticks++;
    const pressed = hold && !this.held;
    this.held = hold;
    if (this.state === "idle") {
      if (pressed) {
        this.state = "waiting";
        this.loss = null;
        this.timer = 60 + Math.floor(this.random.next() * 150);
      }
    } else if (this.state === "waiting") {
      if (pressed) this.lose("early");
      else if (!--this.timer) {
        // Rarer species simply turn up less often.
        let roll =
          this.random.next() * fishSpecies.reduce((n, f) => n + f.weight, 0);
        this.fish = fishSpecies.find((f) => (roll -= f.weight) < 0)!;
        this.state = "bite";
        this.timer = 54;
      }
    } else if (this.state === "bite") {
      if (pressed) {
        this.state = "reeling";
        this.progress = 0.2;
        this.tension = 0.25;
        this.surging = false;
        this.surge = 45;
      } else if (!--this.timer) this.lose("missed");
    } else if (this.state === "reeling") {
      const fight = fishStats[this.fish!.id].fight;
      if (!--this.surge) {
        this.surging = !this.surging;
        this.surge = this.surging
          ? 25 + Math.floor(this.random.next() * 30 * (0.6 + fight))
          : 35 + Math.floor(this.random.next() * 50 * (1.2 - fight * 0.6));
      }
      // Reeling through a surge gains little and strains the line.
      if (hold) {
        this.progress += (this.surging ? 0.12 : 0.5) / (0.7 + fight) / 60;
        this.tension += (this.surging ? 1 + fight : 0.3 + fight * 0.3) / 60;
      } else {
        this.progress -= (0.08 + fight * 0.14) / 60;
        this.tension -= 0.9 / 60;
      }
      this.tension = Math.max(0, this.tension);
      if (this.tension >= 1) this.lose("snapped");
      else if (this.progress <= 0) this.lose("escaped");
      else if (this.progress >= 1) {
        this.state = "landed";
        this.timer = 40;
        this.catches.push(this.fish!.id);
        this.score += fishStats[this.fish!.id].points;
      }
    } else if (!--this.timer) this.state = "idle";
    if (this.ticks >= FISHING_TICKS) this.ended = true;
  }
}
