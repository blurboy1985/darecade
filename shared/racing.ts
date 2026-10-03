/** Coast Rush physics. No rendering, wall clock, random rewards or avatar stats. */
export const RACE_TICKS = 120 * 60;
export const RACE_LAPS = 2;
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

/** Arc-length lookup is shared by physics, map and scenery. Positive offset is right. */
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
export const cones = [
  { distance: TRACK_LENGTH * 0.25, offset: 2.5 },
  { distance: TRACK_LENGTH * 0.57, offset: -2.2 },
  { distance: TRACK_LENGTH * 0.9, offset: 0 },
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

export class CoastRace {
  ticks = 0;
  distance = 0;
  offset = 0;
  speed = 0;
  lateralSpeed = 0;
  charge = 0;
  boost = 0;
  boosts = 0;
  bumps = 0;
  bumpCooldown = 0;
  drifting = false;
  ended = false;
  score = 0;
  lapTicks: number[] = [];
  private previousLapTick = 0;
  get offroad() {
    return Math.abs(this.offset) > ROAD_HALF_WIDTH;
  }
  get lap() {
    return Math.min(RACE_LAPS, Math.floor(this.distance / TRACK_LENGTH) + 1);
  }
  advance(steer: number, brake: boolean, drift: boolean) {
    if (this.ended) return;
    this.ticks++;
    const dt = 1 / 60;
    const curve = trackCurve(this.distance);
    const wasDrifting = this.drifting;
    this.drifting = drift && !brake && !this.offroad && this.speed > 10;
    // Charge only while steering into a real bend. Holding drift on a straight
    // or oscillating the steering cannot generate a free turbo.
    if (this.drifting && Math.abs(curve) > 0.007 && steer * curve > 0)
      this.charge = Math.min(1, this.charge + dt * 0.65);
    else if (!this.drifting) {
      if (wasDrifting && this.charge >= 0.45 && !brake && !this.offroad) {
        this.boost = Math.max(this.boost, 0.65 + this.charge * 1.15);
        this.boosts++;
      }
      this.charge = 0;
    }
    this.boost = Math.max(0, this.boost - dt);
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    const target = brake
      ? 6
      : this.offroad
        ? 10
        : this.boost > 0
          ? 30
          : this.drifting
            ? 21
            : 23;
    const acceleration = this.speed > target ? 18 : 9;
    this.speed += Math.max(
      -acceleration * dt,
      Math.min(acceleration * dt, target - this.speed),
    );
    const steering =
      steer * (this.drifting ? 6.8 : 5.6) * Math.min(1, this.speed / 12);
    const outward = -curve * this.speed * this.speed * 0.14;
    this.lateralSpeed +=
      (steering + outward - this.lateralSpeed) * (this.drifting ? 0.075 : 0.12);
    this.offset += this.lateralSpeed * dt;
    if (Math.abs(this.offset) > 8.2) {
      this.offset = Math.sign(this.offset) * 8.2;
      this.lateralSpeed = 0;
      if (!this.bumpCooldown) this.hit();
    }
    const previous = this.distance;
    this.distance = Math.min(RACE_DISTANCE, this.distance + this.speed * dt);
    for (let lap = 0; lap < RACE_LAPS; lap++) {
      for (const pad of boostPads) {
        const at = pad.distance + lap * TRACK_LENGTH;
        if (
          previous < at &&
          this.distance >= at &&
          Math.abs(this.offset - pad.offset) < 1.35
        ) {
          this.boost = 1.1;
          this.boosts++;
        }
      }
      for (const cone of cones) {
        const at = cone.distance + lap * TRACK_LENGTH;
        if (
          previous < at &&
          this.distance >= at &&
          Math.abs(this.offset - cone.offset) < 0.9
        )
          this.hit();
      }
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
    this.speed *= 0.55;
    this.boost = 0;
    this.charge = 0;
    this.bumps++;
    this.bumpCooldown = 0.8;
  }
}
