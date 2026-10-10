/** Coast Rush physics. No rendering, wall clock or avatar stats. Item draws are seeded. */
export const RACE_TICKS = 120 * 60;
export const FIRST_RACE_TICKS = 180 * 60;
export const RACE_LAPS = 3;
export const ROAD_HALF_WIDTH = 5.4;
const TAU = Math.PI * 2;
/** The wall: a kart cannot leave the road by more than the sand strip. */
export const WALL = 6.4;
// The Palm Bay drift route as x,z pairs, built from arcs and straights: a
// north-east sweeper, the harbour hairpin, a long carousel, an inland hairpin,
// the west hairpin, esses along the south shore and a sweeper back to the line.
// A closed Catmull-Rom spline runs through them, so the centre line needs
// arithmetic only.
// prettier-ignore
const ROUTE = [
  90,-5.4, 90,4.2, 90,13.7, 90,23.3, 88.7,32.7, 84.5,41.3, 77.9,48.1, 69.4,52.5,
  60,54, 50.5,54, 41.1,52.6, 33.6,46.8, 30.2,38, 30,28.5, 30,18.9, 28.7,9.5,
  22.8,2.1, 13.9,-1, 4.7,1.2, -1.9,7.9, -4,17.1, -4,26.6, -4.5,36.2, -8.6,44.7,
  -16.1,50.4, -25.5,52.1, -35,52, -44.6,52, -54.2,52, -63.7,51.9, -72.8,49.2, -79.9,42.8,
  -83.6,34.1, -83.3,24.6, -79.1,16.1, -71.7,10.2, -62.4,8, -52.9,8, -43.5,6.6, -36.4,0.4,
  -34,-8.7, -37.2,-17.6, -44.8,-23.1, -54.3,-24, -63.8,-24, -73.4,-24.4, -81.5,-29.1, -85.4,-37.7,
  -83.6,-46.9, -76.8,-53.4, -67.5,-55, -57.9,-55, -48.5,-53.6, -39.8,-49.7, -30.9,-46.4, -21.4,-46.8,
  -12.6,-50.5, -3.8,-54.1, 5.7,-54.6, 14.7,-51.4, 23.4,-47.4, 32.8,-46.1, 41.9,-48.8, 50.5,-52.8,
  59.8,-55, 69.2,-53.6, 77.7,-49.2, 84.4,-42.5, 88.6,-34, 90,-24.5, 90,-15,
];
const POINTS = ROUTE.length / 2;
const STEPS = 10;
const SAMPLES = POINTS * STEPS;

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
/** The apex of the harbour hairpin, where the jetty and lighthouse stand. */
export const HARBOUR = TRACK_LENGTH * 0.242;
// Pads sit before the carousel, into the esses and on the home straight.
export const boostPads = [0.365, 0.71, 0.985].map((f, i) => ({
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
  "wave",
  "crab",
] as const;
export type RaceItem = (typeof ITEMS)[number] | null;
// Missile, storm and crab need a kart ahead, so the leader never draws them.
const LEADER_ITEMS = ["shield", "turbo", "coconut", "wave"] as const;
// Normal steering holds the sweepers at cruising speed. The hairpins push the
// kart wide unless it drifts or brakes, and at turbo speed every bend does.
const GRIP = 6.4;
const DRIFT_GRIP = 11;
const SLIDE = 0.3;
const CRUISE = 23;
const TURBO = 31;
const MISSILE_SPEED = 80;
const CRAB_SPEED = 95;
/** A wave reaches this far along the road, ahead and behind. */
export const WAVE_RANGE = 14;
export const SPIN_TICKS = 75;
const STORM_TICKS = 180;
const CPU_CRATE_PERCENT = 40;
/** Two karts touch inside this box: nose to tail, and door to door. */
export const KART_LENGTH = 1.8;
export const KART_WIDTH = 1.35;
/** The most a touching kart is pushed across the road in one tick. */
const PUSH = 0.12;
const SLIDE_OFF = 5 / 60;
/** Pace of a kart rubbing against another, and how long the rub lingers. */
const RUB = 0.8;
const RUB_TICKS = 6;
/** How fast a computer kart moves across the road, and how far back it looks. */
const CPU_STEER = 3.5;
const BLOCK_RANGE = 9;
const CPU_AGGRESSION_PERCENT = 65;
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
export const itemCrates = [0.02, 0.29, 0.515, 0.745].flatMap((f) =>
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
  bumps: number;
  novice?: boolean;
};

/** Any kart on the road: the driver, a computer kart or another player. */
export type Racer = {
  name: string;
  color: string;
  /** Cruising speed of a computer kart. Zero for a driven one. */
  pace: number;
  distance: number;
  offset: number;
  speed: number;
  finishTick: number;
  /** Ticks left spinning after an item hit, and slowed by a storm. */
  spin: number;
  slow: number;
  /** Seconds of shield and of turbo left. */
  shield: number;
  boost: number;
  item: RaceItem;
  /** Ticks until a computer kart uses the item it holds. */
  itemDelay: number;
  /** Ticks left rubbing against another kart. */
  rub: number;
  /** The line a computer kart returns to when the road is clear. */
  lane?: number;
  /** Another player sliding: 1 left, -1 right. */
  drift?: number;
};
export function racer(
  name: string,
  color: string,
  pace: number,
  distance: number,
  offset: number,
): Racer {
  return {
    name,
    color,
    pace,
    distance,
    offset,
    speed: 0,
    finishTick: 0,
    spin: 0,
    slow: 0,
    shield: 0,
    boost: 0,
    item: null,
    itemDelay: 0,
    rub: 0,
    lane: offset,
  };
}
export type Hit = {
  kind: "spin" | "slow" | "block";
  kart: number;
  by: number;
  item: NonNullable<RaceItem>;
};
function mix(h: number) {
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}
const lapGap = (from: number, to: number) =>
  (((to - from) % TRACK_LENGTH) + TRACK_LENGTH) % TRACK_LENGTH;
/** How far `to` is ahead of `from` around the lap. Negative when it is behind. */
function ahead(from: Pick<Racer, "distance">, to: Pick<Racer, "distance">) {
  const gap = to.distance - from.distance;
  // Most karts are within half a lap of each other, which needs no wrapping.
  return Math.abs(gap) < TRACK_LENGTH / 2
    ? gap
    : lapGap(-TRACK_LENGTH / 2, gap) - TRACK_LENGTH / 2;
}
/**
 * The crate a computer kart here has just collected from: the nearest row, on
 * its side of the road. For drawing only; -1 on the centre line.
 */
export function crateTaken(distance: number, offset: number) {
  let crate = -1,
    nearest = Infinity;
  itemCrates.forEach((c, i) => {
    const gap = Math.abs(ahead(c, { distance }));
    if (c.offset * offset > 0 && gap < nearest) {
      crate = i;
      nearest = gap;
    }
  });
  return crate;
}
const onRoad = (k: Racer) => !k.finishTick && k.distance >= 0;
/**
 * Where kart `o` touches kart `k`, or nothing when they are apart. `tail` is
 * nose to tail rather than door to door, and `away` is the side `k` gives way to.
 */
function contact(k: Racer, o: Racer) {
  if (!onRoad(o)) return null;
  const gap = ahead(k, o),
    side = o.offset - k.offset;
  const across = KART_WIDTH - Math.abs(side);
  if (Math.abs(gap) >= KART_LENGTH || across <= 0) return null;
  // On the same line, the kart behind pulls out towards the middle of the road.
  const away = side
    ? -Math.sign(side)
    : (gap > 0 ? -1 : 1) * (Math.sign(k.offset) || 1);
  return {
    gap,
    across,
    away,
    tail: across / KART_WIDTH > (KART_LENGTH - Math.abs(gap)) / KART_LENGTH,
  };
}

/**
 * Everything on the road that is not a driver's own steering: computer karts,
 * the items they and the drivers use, and what those items hit. A solo race
 * and a multiplayer room run the same field.
 */
export class RaceField {
  ticks = 0;
  readonly missiles: {
    distance: number;
    offset: number;
    target: number;
    ticks: number;
    crab: boolean;
    owner: number;
  }[] = [];
  /** Dropped coconuts, by position around the lap. */
  readonly coconuts: { distance: number; offset: number; owner: number }[] = [];
  /** What this tick's items did, and which were used. The owner clears both. */
  readonly hits: Hit[] = [];
  readonly uses: { kart: number; item: NonNullable<RaceItem> }[] = [];
  /** Lets a first race hold computer karts back. */
  limit: ((kart: Racer, index: number, pace: number) => number) | null = null;
  readonly karts: Racer[];
  private readonly before: number[];
  private readonly seed: number;
  private readonly cpuItems: boolean;
  /** cpuItems: whether computer karts collect and use items, and block and lean on other karts. */
  constructor(karts: Racer[], seed: number, cpuItems: boolean) {
    this.karts = karts;
    this.seed = seed;
    this.cpuItems = cpuItems;
    this.before = karts.map((k) => k.distance);
  }
  /** 1 is leading. Finished karts rank by their time. */
  place(index: number) {
    const me = this.karts[index];
    return (
      1 +
      this.karts.filter((k) =>
        k === me
          ? false
          : k.finishTick
            ? !me.finishTick || k.finishTick < me.finishTick
            : !me.finishTick && k.distance > me.distance,
      ).length
    );
  }
  /** The run seed and the pickup tick decide the item, so a replay draws the same one. */
  draw(index: number, lap: number, crate: number): RaceItem {
    let h =
      (this.seed ^
        Math.imul(this.ticks, 0x9e3779b1) ^
        Math.imul(lap * 16 + crate + 1, 0x85ebca6b) ^
        Math.imul(index, 0xc2b2ae35)) >>>
      0;
    h = mix(h);
    const pool = this.place(index) === 1 ? LEADER_ITEMS : ITEMS;
    return pool[h % pool.length];
  }
  use(index: number, item: NonNullable<RaceItem>) {
    const user = this.karts[index];
    this.uses.push({ kart: index, item });
    const racing = (k: Racer) => k !== user && !k.finishTick;
    if (item === "shield") user.shield = 3;
    else if (item === "turbo") user.boost = 2;
    else if (item === "missile" || item === "crab") {
      // A missile homes on the next kart ahead and a crab on the leader. With
      // nobody ahead, either one flies off.
      let target = -1;
      this.karts.forEach((k, i) => {
        if (
          racing(k) &&
          k.distance > user.distance &&
          (target < 0 ||
            (item === "crab"
              ? k.distance > this.karts[target].distance
              : k.distance < this.karts[target].distance))
        )
          target = i;
      });
      this.missiles.push({
        distance: user.distance,
        offset: user.offset,
        target,
        ticks: 0,
        crab: item === "crab",
        owner: index,
      });
    } else if (item === "storm")
      this.karts.forEach((k, i) => {
        if (!racing(k) || k.distance <= user.distance) return;
        if (k.shield > 0)
          this.hits.push({ kind: "block", kart: i, by: index, item });
        else {
          k.slow = STORM_TICKS;
          this.hits.push({ kind: "slow", kart: i, by: index, item });
        }
      });
    else if (item === "wave")
      this.karts.forEach((k, i) => {
        if (racing(k) && Math.abs(k.distance - user.distance) < WAVE_RANGE)
          this.knock(i, index, item);
      });
    else {
      this.coconuts.push({
        distance: lapGap(0, user.distance - 3),
        offset: user.offset,
        owner: index,
      });
      // The road holds eight; the oldest rolls away.
      if (this.coconuts.length > 8) this.coconuts.shift();
    }
  }
  private knock(index: number, by: number, item: NonNullable<RaceItem>) {
    const kart = this.karts[index];
    if (kart.finishTick) return;
    if (kart.shield > 0) {
      this.hits.push({ kind: "block", kart: index, by, item });
      return;
    }
    kart.spin = SPIN_TICKS;
    this.hits.push({ kind: "spin", kart: index, by, item });
  }
  /** One tick for computer karts, items in flight and coconuts on the road. */
  step() {
    this.ticks++;
    const dt = 1 / 60;
    this.karts.forEach((r, index) => {
      const from = this.before[index];
      this.before[index] = r.distance;
      if (r.pace) {
        // A driven kart counts its own spin and storm down as it drives.
        if (r.spin) r.spin--;
        if (r.slow) r.slow--;
      }
      if (r.finishTick) return;
      if (r.pace) {
        r.shield = Math.max(0, r.shield - dt);
        r.boost = Math.max(0, r.boost - dt);
        const pace =
          r.pace *
          (r.spin
            ? 0.3
            : (r.slow ? 0.55 : 1) * (r.boost ? 1.3 : 1) * (r.rub ? RUB : 1));
        if (r.rub) r.rub--;
        if (!r.spin) this.steer(r, index, dt);
        const top = this.limit ? this.limit(r, index, pace) : pace;
        r.speed =
          r.speed > top
            ? Math.max(top, r.speed - dt * 30)
            : Math.min(top, r.speed + dt * 6);
        r.distance = Math.min(RACE_DISTANCE, r.distance + r.speed * dt);
        if (r.distance === RACE_DISTANCE) r.finishTick = this.ticks;
        this.before[index] = r.distance;
        if (this.cpuItems) this.cpu(r, index, from);
      }
      // A coconut spins the first kart to reach it, never the one who left it.
      // Drivers can steer round one; computer karts cannot.
      const hit = this.coconuts.findIndex(
        (c) =>
          c.owner !== index &&
          r.distance > from &&
          lapGap(from, c.distance) < r.distance - from &&
          (r.pace > 0 || Math.abs(c.offset - r.offset) < 1.6),
      );
      if (hit >= 0) {
        const [coconut] = this.coconuts.splice(hit, 1);
        this.knock(index, coconut.owner, "coconut");
      }
    });
    this.karts.forEach((r, index) => {
      if (r.pace && onRoad(r)) this.touch(r, index, dt);
    });
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i],
        r = this.karts[m.target];
      m.ticks++;
      m.distance += (m.crab ? CRAB_SPEED : MISSILE_SPEED) * dt;
      if (r) m.offset += (r.offset - m.offset) * 0.08;
      if (r && !r.finishTick && m.distance >= r.distance) {
        this.knock(m.target, m.owner, m.crab ? "crab" : "missile");
        this.missiles.splice(i, 1);
      } else if (r ? r.finishTick : m.ticks > 90) this.missiles.splice(i, 1);
    }
  }
  /**
   * A computer kart picks its line: round a slower kart ahead and, when it is
   * in the mood, across the road to block a kart catching it or lean on one
   * alongside. Otherwise it returns to its own lane.
   */
  private steer(r: Racer, index: number, dt: number) {
    // Only karts close enough to block, pass or lean on matter here.
    const near: { o: Racer; gap: number }[] = [];
    for (const o of this.karts) {
      if (o === r || !onRoad(o)) continue;
      const gap = ahead(r, o);
      if (Math.abs(gap) < BLOCK_RANGE) near.push({ o, gap });
    }
    let aim = r.lane ?? r.offset,
      target: Racer | null = null;
    // The mood changes every second and a half, so no kart fights all race.
    const mood = mix(
      this.seed ^
        Math.imul(index, 0x27d4eb2f) ^
        Math.imul(Math.floor(this.ticks / 90), 0x165667b1),
    );
    if (this.cpuItems && mood % 100 < CPU_AGGRESSION_PERCENT) {
      let nearest = BLOCK_RANGE;
      for (const { o, gap } of near) {
        if (
          o.shield > 0 ||
          o.spin ||
          gap >= KART_LENGTH ||
          Math.abs(gap) >= nearest ||
          (gap <= -KART_LENGTH && o.speed <= r.speed + 0.5)
        )
          continue;
        nearest = Math.abs(gap);
        target = o;
      }
      if (target) aim = target.offset;
    }
    const clear = KART_WIDTH + 0.3;
    for (const { o, gap } of near) {
      if (
        o === target ||
        gap <= -KART_LENGTH - 0.3 ||
        gap >= 7 ||
        (gap >= KART_LENGTH + 0.3 && o.speed >= r.speed) ||
        Math.abs(aim - o.offset) >= clear
      )
        continue;
      const side = r.offset - o.offset;
      aim =
        o.offset +
        (Math.abs(side) > 0.3 ? Math.sign(side) : o.offset > 0 ? -1 : 1) *
          clear;
    }
    const edge = ROAD_HALF_WIDTH - 0.7;
    const turn = Math.max(
      -CPU_STEER * dt,
      Math.min(CPU_STEER * dt, aim - r.offset),
    );
    r.offset = Math.max(-edge, Math.min(edge, r.offset + turn));
  }
  /**
   * Karts are solid. A computer kart that runs into the back of another is
   * held behind it and slides off to one side; door to door they push each
   * other apart. Either way it rubs speed off. A driver's kart does the same
   * for itself in `CoastRace`, so each kart gives way for its own half.
   */
  private touch(r: Racer, index: number, dt: number) {
    for (const o of this.karts) {
      const c = o === r ? null : contact(r, o);
      // A shielded kart keeps its line and its speed.
      if (!c || r.shield > 0) continue;
      const behind = c.tail && c.gap > 0;
      if (behind) {
        r.distance = Math.max(
          r.distance - r.speed * dt,
          r.distance - (KART_LENGTH - c.gap),
        );
        this.before[index] = Math.min(this.before[index], r.distance);
      }
      const push = c.tail
        ? Math.min(c.across, SLIDE_OFF)
        : Math.min(c.across / 2, PUSH);
      r.offset = Math.max(-WALL, Math.min(WALL, r.offset + c.away * push));
      if (c.tail && !behind) {
        // Hit from behind: shoved forwards a little, and not slowed.
        if (!r.spin) r.speed += Math.max(0, o.speed - r.speed) * 0.02;
        continue;
      }
      if (!r.rub) r.speed *= 0.9;
      r.rub = RUB_TICKS;
    }
  }
  /** A computer kart collects a crate it drives through and uses it a moment later. */
  private cpu(r: Racer, index: number, from: number) {
    if (!r.item) {
      const lap = Math.floor(r.distance / TRACK_LENGTH);
      const crate = itemCrates.findIndex(
        (c) =>
          c.offset * r.offset > 0 &&
          from < c.distance + lap * TRACK_LENGTH &&
          r.distance >= c.distance + lap * TRACK_LENGTH,
      );
      if (crate < 0) return;
      // Computer karts take most of the crate rows they drive through.
      const roll = mix(
        this.seed ^
          Math.imul(this.ticks, 0x9e3779b1) ^
          Math.imul(index, 0x27d4eb2f),
      );
      if (roll % 100 >= CPU_CRATE_PERCENT) return;
      r.item = this.draw(index, lap, crate);
      r.itemDelay = 20 + ((roll >>> 8) % 70);
      return;
    }
    if (--r.itemDelay > 0 || r.spin) return;
    const others = this.karts.filter((k) => k !== r && onRoad(k));
    // Every item waits for someone to use it on: a kart ahead to fire at, one
    // close behind to drop a coconut in front of, a missile to shield against.
    const useful =
      r.item === "wave"
        ? others.some((k) => Math.abs(k.distance - r.distance) < WAVE_RANGE)
        : r.item === "missile" || r.item === "storm" || r.item === "crab"
          ? others.some((k) => k.distance > r.distance)
          : r.item === "coconut"
            ? others.some(
                (k) => k.distance < r.distance && k.distance > r.distance - 25,
              )
            : r.item === "shield"
              ? this.missiles.some(
                  (m) =>
                    this.karts[m.target] === r && m.distance > r.distance - 30,
                )
              : true;
    // With no target for four seconds, a shield or coconut is used anyway and
    // anything else is let go.
    if (
      useful ||
      (r.itemDelay <= -240 && (r.item === "shield" || r.item === "coconut"))
    )
      this.use(index, r.item);
    else if (r.itemDelay > -240) return;
    r.item = null;
  }
}

export type RaceOptions = {
  /**
   * A multiplayer race. The room owns every other kart and all items in
   * flight; this kart only drives itself and reports the items it uses.
   */
  versus?: { karts: Racer[]; distance: number; offset: number };
};

export class CoastRace implements Racer {
  readonly name = "You";
  readonly color = "#ff927b";
  readonly pace = 0;
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
  spin = 0;
  slow = 0;
  shield = 0;
  finishTick = 0;
  item: RaceItem = null;
  itemDelay = 0;
  rub = 0;
  pickupCount = 0;
  lastTurbo: TurboTier | null = null;
  /** Rivals spun out by this kart's items, and times this kart was spun or slowed. */
  knocks = 0;
  struck = 0;
  /** Hits this kart's shield has absorbed. */
  blocks = 0;
  lastStruck: { by: string; item: NonNullable<RaceItem> } | null = null;
  drifting = false;
  /** 1 while sliding left, -1 right. Chosen when the drift starts. */
  driftDir = 0;
  /** Touching the wall this tick. */
  scraping = false;
  ended = false;
  score = 0;
  lapTicks: number[] = [];
  readonly collected = new Set<string>();
  readonly rivals: Racer[];
  readonly field: RaceField;
  /** Items used in a multiplayer race, for the room. */
  readonly used: NonNullable<RaceItem>[] = [];
  readonly versus: boolean;
  private previousLapTick = 0;
  private itemHeld = false;
  readonly novice: boolean;
  readonly limitTicks: number;
  constructor(seed = 0, options: RaceOptions = {}) {
    this.versus = !!options.versus;
    this.novice = seed < 0 && !this.versus;
    this.limitTicks = this.novice ? FIRST_RACE_TICKS : RACE_TICKS;
    if (options.versus) {
      this.rivals = options.versus.karts;
      this.distance = options.versus.distance;
      this.offset = options.versus.offset;
    } else
      this.rivals = RIVALS.map((r, i) =>
        racer(r.name, r.color, r.pace, 24 - i * 3, i % 2 ? -2.8 : 2.8),
      );
    // A first race stays gentle: rivals ease off and leave the crates alone.
    this.field = new RaceField(
      [this, ...this.rivals],
      (seed < 0 ? -seed - 1 : seed) >>> 0,
      !this.novice,
    );
    if (this.novice)
      this.field.limit = (r, index, pace) => {
        const lead = r.distance - this.distance;
        const eased = pace * Math.max(0.42, Math.min(0.94, 0.85 - lead / 180));
        return index > 3 && lead > -18
          ? Math.min(eased, Math.max(3, this.speed * 0.8))
          : eased;
      };
  }
  get missiles() {
    return this.field.missiles;
  }
  get coconuts() {
    return this.field.coconuts;
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
      bumps: this.bumps,
      ...(this.novice ? { novice: true } : {}),
    };
  }
  /** An item from another kart reached this one. The shield turns it away. */
  strike(kind: "spin" | "slow", by: string, item: NonNullable<RaceItem>) {
    if (this.shield > 0) {
      this.blocks++;
      return false;
    }
    if (kind === "spin") this.spin = SPIN_TICKS;
    else this.slow = STORM_TICKS;
    this.struck++;
    this.lastStruck = { by, item };
    return true;
  }
  /** throttle is -1 brake, 0 coast, 1 accelerate. Item use is edge-triggered. */
  advance(steer: number, throttle: number, drift: boolean, useItem = false) {
    if (this.ended) return;
    this.ticks++;
    const dt = 1 / 60;
    if (useItem && !this.itemHeld && this.item) {
      const item = this.item;
      this.item = null;
      if (item === "turbo") {
        this.boosts++;
        this.lastTurbo = null;
      }
      // In a room, shield and turbo act at once and the room works out the rest.
      if (!this.versus || item === "shield" || item === "turbo")
        this.field.use(0, item);
      if (this.versus) this.used.push(item);
    }
    this.itemHeld = useItem;
    if (!this.versus) {
      this.field.uses.length = 0;
      this.field.step();
      for (const hit of this.field.hits)
        if (hit.kart === 0) {
          if (hit.kind === "block") this.blocks++;
          else {
            this.struck++;
            this.lastStruck = {
              by: this.field.karts[hit.by].name,
              item: hit.item,
            };
          }
        } else if (hit.by === 0 && hit.kind === "spin") this.knocks++;
      this.field.hits.length = 0;
    }
    this.shield = Math.max(0, this.shield - dt);
    this.boost = Math.max(0, this.boost - dt);
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    const wasDrifting = this.drifting;
    this.drifting = drift && throttle > 0 && this.speed > 9 && !this.spin;
    if (this.drifting) {
      if (!wasDrifting)
        this.driftDir =
          Math.sign(steer) || Math.sign(trackCurve(this.distance)) || 1;
      // Holding a moving drift charges predictably; steering is still needed to keep a clean line.
      this.charge = Math.min(1, this.charge + dt / 2.4);
    } else {
      const tier = this.tier;
      if (wasDrifting && tier && throttle > 0 && !this.spin) {
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
    // A spun kart rolls on slowly with no steering. Nothing stops it dead.
    if (this.spin) this.boost = 0;
    let target = this.spin
      ? 7
      : throttle <= 0
        ? 0
        : this.boost > 0
          ? TURBO
          : this.offroad
            ? 20
            : CRUISE;
    if (this.slow) target *= 0.6;
    if (this.scraping && this.shield <= 0) target *= 0.72;
    else if (this.rub) target *= RUB;
    const acceleration =
      throttle < 0 || this.spin ? 30 : this.speed > target ? 18 : 12;
    this.speed += Math.max(
      -acceleration * dt,
      Math.min(acceleration * dt, target - this.speed),
    );
    const steering = this.spin
      ? 0
      : steer *
        (this.drifting ? DRIFT_GRIP : GRIP) *
        Math.min(1, this.speed / 10);
    const outward =
      -trackCurve(this.distance) * this.speed * this.speed * SLIDE;
    this.lateralSpeed += (steering + outward - this.lateralSpeed) * 0.15;
    this.offset += this.lateralSpeed * dt;
    this.scraping = Math.abs(this.offset) > WALL;
    if (this.scraping) {
      // The wall holds the kart on the road and rubs speed off while it touches.
      this.offset = Math.sign(this.offset) * WALL;
      this.lateralSpeed = 0;
      if (this.bump(0.82)) this.charge = 0;
    }
    this.distance = Math.min(RACE_DISTANCE, this.distance + this.speed * dt);
    if (this.rub) this.rub--;
    for (const r of this.rivals) {
      const c = contact(this, r);
      // Karts are solid: this one is held behind a kart it runs into and
      // slides off to one side, and door to door the two push each other
      // apart. The first touch knocks speed off and the rub holds it down.
      // A shielded kart keeps its line and its speed.
      if (!c || this.shield > 0) continue;
      const behind = c.tail && c.gap > 0;
      if (behind)
        this.distance = Math.max(
          previous,
          this.distance - (KART_LENGTH - c.gap),
        );
      const push = c.tail
        ? Math.min(c.across, SLIDE_OFF)
        : Math.min(c.across / 2, PUSH);
      this.offset = Math.max(
        -WALL,
        Math.min(WALL, this.offset + c.away * push),
      );
      if (this.lateralSpeed * c.away < 0) this.lateralSpeed = 0;
      if (c.tail && !behind) {
        // Hit from behind: shoved forwards a little, and not slowed.
        this.speed += Math.max(0, r.speed - this.speed) * 0.02;
        if (this.bump(1)) this.lateralSpeed += c.away * 2;
      } else {
        // One knock as they meet. Staying in contact is a rub, not more knocks.
        if (!this.rub && this.bump(0.86)) this.lateralSpeed += c.away * 3;
        this.rub = RUB_TICKS;
      }
    }
    if (this.spin) this.spin--;
    if (this.slow) this.slow--;
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
          this.item = this.field.draw(0, lap, i);
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
      this.finishTick = this.ticks;
      this.ended = true;
    } else if (this.ticks >= this.limitTicks) this.ended = true;
  }
  /** A wall or kart contact: lose a little speed, never all of it. False while shielded or just bumped. */
  private bump(keep: number) {
    if (this.shield > 0 || this.bumpCooldown > 0) return false;
    this.speed *= keep;
    this.bumps++;
    this.bumpCooldown = 0.7;
    return true;
  }
}
