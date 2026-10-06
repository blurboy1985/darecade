/** Coast Rush physics. No rendering, wall clock or avatar stats. Item draws are seeded. */
export const RACE_TICKS = 120 * 60;
export const FIRST_RACE_TICKS = 180 * 60;
export const RACE_LAPS = 3;
export const ROAD_HALF_WIDTH = 5.4;
const TAU = Math.PI * 2;
const SAMPLES = 720;
// The winding Palm Bay route as x,z pairs: east straight, harbour hairpin, west
// kink, then S-bends along the north shore. A closed Catmull-Rom spline runs
// through them, so the centre line needs arithmetic only.
// prettier-ignore
const ROUTE = [
  89.9,0, 89.7,9.6, 89,19.2, 87.3,28.7, 83.9,37.7, 78.5,45.6, 71.1,51.8, 62.2,55.2,
  52.6,55.8, 43.2,53.9, 34.9,49.2, 28.8,41.8, 25.6,32.7, 23.9,23.2, 21.9,13.8, 16.9,5.8,
  8.2,1.8, -1.4,1.4, -10.5,4.1, -16.8,11.1, -19.4,20.4, -21,29.9, -23.6,39.1, -28.8,47.2,
  -36.5,52.8, -45.7,55.7, -55.3,56.2, -64.7,54.3, -73.2,49.9, -79.6,42.8, -81.8,33.5, -79.9,24.1,
  -77.8,14.7, -78.5,5.1, -81.2,-4.1, -83.2,-13.5, -82.6,-23, -79.2,-32, -73.6,-39.8, -66.2,-45.9,
  -57.2,-49, -47.7,-48, -38.7,-44.5, -29.7,-41.2, -20.2,-41.3, -11.5,-45.4, -3.3,-50.4, 5.9,-53,
  15.1,-50.5, 23.4,-45.6, 32.1,-41.6, 41.5,-42.3, 50.1,-46.6, 58.9,-50.5, 68.3,-49.8, 76.3,-44.6,
  82.4,-37.2, 86.6,-28.6, 88.8,-19.2, 89.7,-9.6,
];
const POINTS = ROUTE.length / 2;
const STEPS = SAMPLES / POINTS;

function centre(i: number) {
  const segment = Math.floor(i / STEPS),
    u = (i % STEPS) / STEPS;
  const spline = (axis: number) => {
    const [a, b, c, d] = [-1, 0, 1, 2].map(
      (k) => ROUTE[((segment + k + POINTS) % POINTS) * 2 + axis],
    );
    return (
      0.5 *
      (2 * b +
        (c - a) * u +
        (2 * a - 5 * b + 4 * c - d) * u * u +
        (3 * b - a - 3 * c + d) * u * u * u)
    );
  };
  return { x: spline(0), z: spline(1) };
}
const nodes = Array.from({ length: SAMPLES + 1 }, (_, i) => ({
  ...centre(i),
  distance: 0,
}));
for (let i = 1; i < nodes.length; i++)
  nodes[i].distance =
    nodes[i - 1].distance +
    Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].z - nodes[i - 1].z);
export const TRACK_LENGTH = nodes[SAMPLES].distance;
/** Extent of the centre line, for the minimap. */
export const trackBounds = {
  minX: Math.min(...nodes.map((n) => n.x)),
  maxX: Math.max(...nodes.map((n) => n.x)),
  minZ: Math.min(...nodes.map((n) => n.z)),
  maxZ: Math.max(...nodes.map((n) => n.z)),
};
/** Distance from a point to the nearest part of the centre line, for scenery. */
export function trackClearance(x: number, z: number) {
  let nearest = Infinity;
  for (const n of nodes)
    nearest = Math.min(nearest, Math.hypot(n.x - x, n.z - z));
  return nearest;
}
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
export const boostPads = [0.13, 0.41, 0.62, 0.965].map((f, i) => ({
  distance: TRACK_LENGTH * f,
  offset: i % 2 ? 2.7 : -2.7,
}));

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

export const ITEMS = [
  "shield",
  "turbo",
  "missile",
  "storm",
  "coconut",
] as const;
export type RaceItem = (typeof ITEMS)[number] | null;
// Missile and storm need a kart ahead, so the leader never draws them.
const LEADER_ITEMS = ["shield", "turbo", "coconut"] as const;
// Normal steering holds every bend at cruising speed. At turbo speed the tight
// ones push the kart wide unless it is drifting.
const GRIP = 6.4;
const DRIFT_GRIP = 11;
const SLIDE = 0.24;
const MISSILE_SPEED = 80;
const SPIN_TICKS = 90;
const STORM_TICKS = 180;
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
// Four rows a lap, three crates across, so a row is hard to miss.
export const itemCrates = [0.03, 0.222, 0.555, 0.81].flatMap((f) =>
  [-2.7, 0, 2.7].map((offset) => ({ distance: TRACK_LENGTH * f, offset })),
);
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
  novice?: boolean;
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
  /** Rivals spun out by a missile or a coconut. */
  knocks = 0;
  readonly missiles: {
    distance: number;
    offset: number;
    target: number;
    ticks: number;
  }[] = [];
  /** Dropped coconuts, by position around the lap. */
  readonly coconuts: { distance: number; offset: number }[] = [];
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
    stun: 0,
    slow: 0,
  }));
  private previousLapTick = 0;
  private itemHeld = false;
  private readonly seed: number;
  readonly novice: boolean;
  readonly limitTicks: number;
  constructor(seed = 0) {
    this.novice = seed < 0;
    this.limitTicks = this.novice ? FIRST_RACE_TICKS : RACE_TICKS;
    this.seed = (seed < 0 ? -seed - 1 : seed) >>> 0;
  }
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
      ...(this.novice ? { novice: true } : {}),
    };
  }
  /** throttle is -1 brake, 0 coast, 1 accelerate. Item use is edge-triggered. */
  advance(steer: number, throttle: number, drift: boolean, useItem = false) {
    if (this.ended) return;
    this.ticks++;
    const dt = 1 / 60;
    if (useItem && !this.itemHeld && this.item) {
      this.use(this.item);
      this.item = null;
    }
    this.itemHeld = useItem;
    this.shield = Math.max(0, this.shield - dt);
    this.boost = Math.max(0, this.boost - dt);
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    for (const r of this.rivals) {
      if (r.finishTick) continue;
      const from = r.distance;
      if (r.stun) {
        r.stun--;
        r.speed = 0;
      } else {
        // Onboarding rivals ease off ahead of the player. Standard seeds retain
        // their exact historical physics and replay results.
        const lead = r.distance - this.distance;
        const support = this.novice
          ? Math.max(0.42, Math.min(0.94, 0.85 - lead / 180))
          : 1;
        const pace = (r.slow ? r.pace * 0.55 : r.pace) * support;
        const top =
          this.novice && this.rivals.indexOf(r) >= 3 && lead > -18
            ? Math.min(pace, Math.max(3, this.speed * 0.8))
            : pace;
        r.speed =
          r.speed > top
            ? Math.max(top, r.speed - dt * 30)
            : Math.min(top, r.speed + dt * 6);
      }
      if (r.slow) r.slow--;
      r.distance = Math.min(RACE_DISTANCE, r.distance + r.speed * dt);
      if (r.distance === RACE_DISTANCE) r.finishTick = this.ticks;
      // The first rival to reach a coconut spins and clears it.
      const hit = this.coconuts.findIndex(
        (c) =>
          r.distance > from &&
          (((c.distance - from) % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH <
            r.distance - from,
      );
      if (hit >= 0) {
        this.coconuts.splice(hit, 1);
        this.knock(r);
      }
    }
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i],
        r = this.rivals[m.target];
      m.ticks++;
      m.distance += MISSILE_SPEED * dt;
      if (r) m.offset += (r.offset - m.offset) * 0.08;
      if (r && !r.finishTick && m.distance >= r.distance) {
        this.knock(r);
        this.missiles.splice(i, 1);
      } else if (r ? r.finishTick : m.ticks > 90) this.missiles.splice(i, 1);
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
        steer *
        (this.drifting ? DRIFT_GRIP : GRIP) *
        Math.min(1, this.speed / 10);
      const outward =
        -trackCurve(this.distance) * this.speed * this.speed * SLIDE;
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
          this.item = this.draw(lap, i);
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
      this.score = this.limitTicks + 1 - this.ticks;
      this.ended = true;
    } else if (this.ticks >= this.limitTicks) this.ended = true;
  }
  private use(item: NonNullable<RaceItem>) {
    if (item === "shield") this.shield = 3;
    else if (item === "turbo") {
      this.boost = 2;
      this.boosts++;
      this.lastTurbo = null;
    } else if (item === "missile") {
      // Homes on the next kart ahead in the race; with none, it flies off.
      let target = -1;
      this.rivals.forEach((r, i) => {
        if (
          !r.finishTick &&
          r.distance > this.distance &&
          (target < 0 || r.distance < this.rivals[target].distance)
        )
          target = i;
      });
      this.missiles.push({
        distance: this.distance,
        offset: this.offset,
        target,
        ticks: 0,
      });
    } else if (item === "storm") {
      for (const r of this.rivals)
        if (!r.finishTick && r.distance > this.distance) r.slow = STORM_TICKS;
    } else
      this.coconuts.push({
        distance:
          (((this.distance - 3) % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH,
        offset: this.offset,
      });
  }
  /** The run seed and the pickup tick decide the item, so a replay draws the same one. */
  private draw(lap: number, crate: number): RaceItem {
    let h =
      (this.seed ^
        Math.imul(this.ticks, 0x9e3779b1) ^
        Math.imul(lap * 16 + crate + 1, 0x85ebca6b)) >>>
      0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    const pool = this.place === 1 ? LEADER_ITEMS : ITEMS;
    return pool[h % pool.length];
  }
  private knock(rival: { stun: number; speed: number }) {
    rival.stun = SPIN_TICKS;
    rival.speed = 0;
    this.knocks++;
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
