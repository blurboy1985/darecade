/** Coast Rush physics. No rendering, wall clock, random rewards or avatar stats. */
export const RACE_TICKS = 120 * 60;
export const RACE_LAPS = 3;
export const ROAD_HALF_WIDTH = 5.4;
const TAU = Math.PI * 2;
const SAMPLES = 720;

function centre(t: number) {
  return {
    x: 77 * Math.cos(t) + 18 * Math.cos(2 * t) - 8 * Math.sin(3 * t),
    z: 57 * Math.sin(t) + 12 * Math.sin(2 * t),
  };
}
const nodes = Array.from({ length: SAMPLES + 1 }, (_, i) => {
  const t = (i / SAMPLES) * TAU;
  return { ...centre(t), distance: 0 };
});
for (let i = 1; i < nodes.length; i++)
  nodes[i].distance =
    nodes[i - 1].distance +
    Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].z - nodes[i - 1].z);
export const TRACK_LENGTH = nodes[SAMPLES].distance;
export const RACE_DISTANCE = TRACK_LENGTH * RACE_LAPS;

/** Arc-length lookup is shared by physics, map and scenery. Positive offset is driver-left. */
export function trackPoint(distance: number, offset = 0) {
  const d = ((distance % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
  let low = 0,
    high = SAMPLES;
  while (low + 1 < high) {
    const mid = (low + high) >> 1;
    if (nodes[mid].distance <= d) low = mid;
    else high = mid;
  }
  const a = nodes[low],
    b = nodes[low + 1];
  const u = (d - a.distance) / (b.distance - a.distance);
  const dx = b.x - a.x,
    dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  return {
    x: a.x + dx * u + (dz / length) * offset,
    z: a.z + dz * u - (dx / length) * offset,
    yaw: Math.atan2(dx, dz),
  };
}
export function trackCurve(distance: number) {
  let angle = trackPoint(distance + 5).yaw - trackPoint(distance - 5).yaw;
  while (angle > Math.PI) angle -= TAU;
  while (angle < -Math.PI) angle += TAU;
  return angle / 10;
}
export const boostPads = [
  { distance: TRACK_LENGTH * 0.12, offset: -2.7 },
  { distance: TRACK_LENGTH * 0.43, offset: 2.7 },
  { distance: TRACK_LENGTH * 0.77, offset: -2.7 },
] as const;

export function raceTime(ticks: number) {
  const centiseconds = Math.round((ticks * 100) / 60);
  return `${Math.floor(centiseconds / 6000)}:${String(Math.floor(centiseconds / 100) % 60).padStart(2, "0")}.${String(centiseconds % 100).padStart(2, "0")}`;
}
// Existing boards sort high to low. This lossless tick encoding makes shorter
// times larger, keeps DNF at zero and retains the existing medal/dare contracts.
export function raceScore(ticks: number) {
  return RACE_TICKS + 1 - ticks;
}
export function raceScoreTime(score: number) {
  return score > 0 ? raceTime(RACE_TICKS + 1 - score) : "No finish";
}

export type RaceItem = "shield" | "turbo" | null;
export type TurboTier = "Mini" | "Super" | "Ultra";
export const RIVALS = [
  { name: "Marina", pace: 24.2, color: "#ab94ed" },
  { name: "Reef", pace: 22.8, color: "#59c8d8" },
  { name: "Sunny", pace: 21.4, color: "#f5c65e" },
  { name: "Pebble", pace: 20, color: "#87c989" },
  { name: "Mango", pace: 18.6, color: "#f9a267" },
  { name: "Breeze", pace: 17, color: "#dfa5cb" },
  { name: "Coco", pace: 14.5, color: "#b8c8d5" },
] as const;
export const itemCrates = [0.08, 0.37, 0.68].map((f, i) => ({
  distance: TRACK_LENGTH * f,
  offset: [0, 2.7, -2.7][i],
}));
export const pickups = Array.from({ length: 12 }, (_, i) => ({
  distance: TRACK_LENGTH * (0.05 + i * 0.078),
  offset: [0, -2.7, 0, 2.7][i % 4],
}));
export const ordinal = (place: number) =>
  `${place}${place === 1 ? "st" : place === 2 ? "nd" : place === 3 ? "rd" : "th"}`;
export function driftTier(seconds: number): TurboTier | null {
  return seconds >= 2.4
    ? "Ultra"
    : seconds >= 1.6
      ? "Super"
      : seconds >= 0.8
        ? "Mini"
        : null;
}
export type RaceResult = {
  place: number;
  finished: boolean;
  timeTicks: number;
  bestLap: number;
  pickups: number;
  penaltyTicks: number;
};

export class CoastRace {
  ticks = 0;
  distance = 0;
  offset = -1.7;
  speed = 0;
  lateralSpeed = 0;
  charge = 0;
  boost = 0;
  boosts = 0;
  bumps = 0;
  bumpCooldown = 0;
  penaltyTicks = 0;
  stunTicks = 0;
  shield = 0;
  item: RaceItem = null;
  pickupCount = 0;
  lastTurbo: TurboTier | null = null;
  drifting = false;
  ended = false;
  score = 0;
  lapTicks: number[] = [];
  readonly collected = new Set<string>();
  readonly rivals = RIVALS.map((r, i) => ({
    ...r,
    distance: 24 - i * 3,
    offset: i % 2 ? -2.8 : 2.8,
    speed: 0,
    finishTick: 0,
  }));
  private previousLapTick = 0;
  private itemHeld = false;
  get offroad() {
    return Math.abs(this.offset) > ROAD_HALF_WIDTH;
  }
  get lap() {
    return Math.min(RACE_LAPS, Math.floor(this.distance / TRACK_LENGTH) + 1);
  }
  get place() {
    return (
      1 +
      this.rivals.filter((r) =>
        r.finishTick
          ? !this.score || r.finishTick <= this.ticks
          : r.distance > this.distance,
      ).length
    );
  }
  get tier() {
    return driftTier(this.charge * 2.4 + 1e-8);
  }
  result(): RaceResult {
    return {
      place: this.place,
      finished: this.score > 0,
      timeTicks: this.ticks,
      bestLap: this.lapTicks.length ? Math.min(...this.lapTicks) : 0,
      pickups: this.pickupCount,
      penaltyTicks: this.penaltyTicks,
    };
  }
  /** throttle is -1 brake, 0 coast, 1 accelerate. Item use is edge-triggered. */
  advance(steer: number, throttle: number, drift: boolean, useItem = false) {
    if (this.ended) return;
    this.ticks++;
    const dt = 1 / 60;
    if (useItem && !this.itemHeld && this.item) {
      if (this.item === "shield") this.shield = 3;
      else {
        this.boost = 2;
        this.boosts++;
        this.lastTurbo = null;
      }
      this.item = null;
    }
    this.itemHeld = useItem;
    this.shield = Math.max(0, this.shield - dt);
    this.boost = Math.max(0, this.boost - dt);
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    for (const r of this.rivals) {
      if (r.finishTick) continue;
      r.speed = Math.min(r.pace, r.speed + dt * 6);
      r.distance = Math.min(RACE_DISTANCE, r.distance + r.speed * dt);
      if (r.distance === RACE_DISTANCE) r.finishTick = this.ticks;
    }
    const wasDrifting = this.drifting;
    this.drifting = drift && throttle > 0 && this.speed > 9 && !this.stunTicks;
    if (this.drifting) {
      // Holding a moving drift charges predictably; steering is still needed to keep a clean line.
      this.charge = Math.min(1, this.charge + dt / 2.4);
    } else {
      const tier = this.tier;
      if (wasDrifting && tier && throttle > 0 && !this.stunTicks) {
        this.lastTurbo = tier;
        this.boost = Math.max(
          this.boost,
          { Mini: 0.8, Super: 1.4, Ultra: 2.1 }[tier],
        );
        this.boosts++;
      }
      this.charge = 0;
    }
    const previous = this.distance;
    if (this.stunTicks) {
      this.stunTicks--;
      this.penaltyTicks++;
      this.speed = 0;
      this.lateralSpeed = 0;
    } else {
      const target =
        throttle <= 0 ? 0 : this.boost > 0 ? 31 : this.offroad ? 22 : 23;
      const acceleration = throttle < 0 ? 30 : this.speed > target ? 12 : 12;
      this.speed += Math.max(
        -acceleration * dt,
        Math.min(acceleration * dt, target - this.speed),
      );
      const steering =
        steer * (this.drifting ? 7.5 : 6.4) * Math.min(1, this.speed / 10);
      const outward =
        -trackCurve(this.distance) * this.speed * this.speed * 0.1;
      this.lateralSpeed += (steering + outward - this.lateralSpeed) * 0.15;
      this.offset += this.lateralSpeed * dt;
      if (Math.abs(this.offset) > 6.4) {
        this.offset = Math.sign(this.offset) * 6.4;
        this.lateralSpeed = 0;
        this.hit();
      }
      this.distance = Math.min(RACE_DISTANCE, this.distance + this.speed * dt);
      for (const r of this.rivals) {
        const gap =
          ((((r.distance - this.distance) % TRACK_LENGTH) +
            TRACK_LENGTH * 1.5) %
            TRACK_LENGTH) -
          TRACK_LENGTH / 2;
        if (
          !r.finishTick &&
          Math.abs(gap) < 1.8 &&
          Math.abs(r.offset - this.offset) < 1.35
        )
          this.hit();
      }
    }
    for (let lap = 0; lap < RACE_LAPS; lap++) {
      const crossed = (
        p: { distance: number; offset: number },
        width: number,
      ) =>
        previous < p.distance + lap * TRACK_LENGTH &&
        this.distance >= p.distance + lap * TRACK_LENGTH &&
        Math.abs(this.offset - p.offset) < width;
      for (const pad of boostPads)
        if (crossed(pad, 1.35)) {
          this.boost = Math.max(this.boost, 1.1);
          this.boosts++;
          this.lastTurbo = null;
        }
      itemCrates.forEach((p, i) => {
        if (crossed(p, 1.45) && !this.item) {
          this.item = (lap + i) % 2 ? "turbo" : "shield";
          this.collected.add(`crate:${lap}:${i}`);
        }
      });
      pickups.forEach((p, i) => {
        if (crossed(p, 1.1)) {
          this.pickupCount++;
          this.collected.add(`pickup:${lap}:${i}`);
        }
      });
      const line = (lap + 1) * TRACK_LENGTH;
      if (previous < line && this.distance >= line) {
        this.lapTicks.push(this.ticks - this.previousLapTick);
        this.previousLapTick = this.ticks;
      }
    }
    if (this.distance >= RACE_DISTANCE) {
      this.score = raceScore(this.ticks);
      this.ended = true;
    } else if (this.ticks >= RACE_TICKS) this.ended = true;
  }
  private hit() {
    if (this.shield > 0 || this.bumpCooldown > 0) return;
    this.speed = 0;
    this.boost = 0;
    this.charge = 0;
    this.bumps++;
    this.stunTicks = 45;
    this.bumpCooldown = 1.75;
  }
}
