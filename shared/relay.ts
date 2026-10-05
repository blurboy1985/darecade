/** Neighbourhood Relay rules. Only ticks, numeric slots and serializable state. */
export const RELAY_TICK_RATE = 60;
export const RELAY_MAX_TICKS = 180 * RELAY_TICK_RATE;
export const RELAY_LEGS = 4;
export const RELAY_STOPS = [
  "Kopi",
  "Playground",
  "Palm Bay",
  "Mama Shop",
] as const;
export const RELAY_HALF_WIDTH = 5;
export const RELAY_SECTION_LENGTH = 30;
export const RELAY_SAFE_X = -2.2;
export const RELAY_PLATFORM_START = 9;
export const RELAY_PLATFORM_END = 13;
export const RELAY_OBSTACLE_Z = 20;
export const RELAY_END_ZONE = 28;
export const RELAY_SOLO_TARGET = { x: -3.2, z: 29.3 } as const;
export const RELAY_RUNNER_RADIUS = 0.22;
export const RELAY_CATCH_RADIUS = 0.9;
export const RELAY_PICKUP_RADIUS = 1;
export const RELAY_THROW_RANGE = 4;

export type RelayDifficulty = "practice" | "standard" | "challenge";
export type RelayInput = { x: number; z: number; action: boolean };
export type RelayRunner = {
  slot: number;
  x: number;
  z: number;
  yaw: number;
  connected: boolean;
  vaultUntil: number;
  stunUntil: number;
  /** Held input cannot produce a second contextual action. */
  actionDown: boolean;
  actionReadyTick: number;
};
export type RelayFlight = {
  from: number;
  to: number;
  startTick: number;
  endTick: number;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  /** True for solo practice or one remaining connected teammate. */
  solo: boolean;
};
export type RelayState = {
  tick: number;
  status: "running" | "finished" | "timeout";
  difficulty: RelayDifficulty;
  solo: boolean;
  leg: 0 | 1 | 2 | 3;
  runners: RelayRunner[];
  bag: {
    owner: number | null;
    x: number;
    z: number;
    flight: RelayFlight | null;
  };
  handoffs: number;
  drops: number;
  recoveries: number;
  finishedTick: number | null;
};
export type RelayAction = "catch" | "recover" | "throw" | "vault" | "wait";

const CONFIG = {
  practice: {
    limitTicks: RELAY_MAX_TICKS,
    speed: 2.05,
    safeSpeed: 1.55,
    catchTicks: 48,
    flightTicks: 72,
    vaultTicks: 90,
    stunTicks: 45,
    actionCooldownTicks: 18,
    platformPeriod: 480,
    platformWidth: 2.8,
    barrierPeriod: 360,
    barrierWidth: 0.7,
  },
  standard: {
    limitTicks: 120 * RELAY_TICK_RATE,
    speed: 2.05,
    safeSpeed: 1.55,
    catchTicks: 30,
    flightTicks: 60,
    vaultTicks: 78,
    stunTicks: 60,
    actionCooldownTicks: 18,
    platformPeriod: 360,
    platformWidth: 2.1,
    barrierPeriod: 288,
    barrierWidth: 1,
  },
  challenge: {
    limitTicks: 100 * RELAY_TICK_RATE,
    speed: 2.05,
    safeSpeed: 1.55,
    catchTicks: 21,
    flightTicks: 54,
    vaultTicks: 66,
    stunTicks: 75,
    actionCooldownTicks: 18,
    platformPeriod: 300,
    platformWidth: 1.5,
    barrierPeriod: 216,
    barrierWidth: 1.2,
  },
} as const;

export function relayConfig(difficulty: RelayDifficulty) {
  if (!Object.hasOwn(CONFIG, difficulty))
    throw Error("Invalid Relay difficulty.");
  return CONFIG[difficulty];
}

const clamp = (n: number, low: number, high: number) =>
  Math.max(low, Math.min(high, n));
const distance = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);
const spawnX = (index: number) => -3.8 + index * 0.45;
const phaseAt = (tick: number, period: number, offset: number) =>
  ((((tick + offset) % period) + period) % period) / period;

/** Collision and animation use this same moving platform rectangle. */
export function relayPlatform(
  tick: number,
  difficulty: RelayDifficulty,
  leg = 0,
) {
  const config = relayConfig(difficulty);
  const phase = phaseAt(tick, config.platformPeriod, leg * 47);
  return {
    x: 1.35 + Math.sin(phase * Math.PI * 2) * 2.2,
    z: (RELAY_PLATFORM_START + RELAY_PLATFORM_END) / 2,
    width: config.platformWidth,
    depth: RELAY_PLATFORM_END - RELAY_PLATFORM_START,
    phase,
  };
}

/** Each gate occupies x ± width/2 and z ± .45; safe-left bypasses both. */
export function relayBarriers(
  tick: number,
  difficulty: RelayDifficulty,
  leg = 0,
) {
  const config = relayConfig(difficulty);
  return [17, 25].map((z, index) => {
    const phase = phaseAt(tick, config.barrierPeriod, leg * 37 + index * 113);
    const angle = phase * Math.PI * 2;
    return {
      x: 1.35 + Math.sin(angle) * 2.5,
      z,
      width: config.barrierWidth,
      phase,
      warning: Math.cos(angle) > 0.65,
      angle,
    };
  });
}

/** Inclusive bounds contain exactly catchTicks authoritative ticks. */
export function relayCatchWindow(
  flight: RelayFlight,
  difficulty: RelayDifficulty,
) {
  const width = relayConfig(difficulty).catchTicks;
  const start = flight.endTick - Math.floor(width / 2);
  return { start, end: start + width - 1 };
}

export function createRelay(
  difficulty: RelayDifficulty,
  slots: number[],
  solo: boolean,
): RelayState {
  relayConfig(difficulty);
  if (
    !Array.isArray(slots) ||
    slots.length < 1 ||
    slots.length > 4 ||
    new Set(slots).size !== slots.length ||
    slots.some((slot) => !Number.isInteger(slot) || slot < 0 || slot > 3) ||
    typeof solo !== "boolean" ||
    (solo && slots.length !== 1)
  )
    throw Error("Relay needs one to four distinct numeric slots.");
  const runners = [...slots]
    .sort((a, b) => a - b)
    .map((slot, index) => ({
      slot,
      x: spawnX(index),
      z: 0,
      yaw: 0,
      connected: true,
      vaultUntil: 0,
      stunUntil: 0,
      actionDown: false,
      actionReadyTick: 0,
    }));
  return {
    tick: 0,
    status: "running",
    difficulty,
    solo,
    leg: 0,
    runners,
    bag: { owner: runners[0].slot, x: runners[0].x, z: 0, flight: null },
    handoffs: 0,
    drops: 0,
    recoveries: 0,
    finishedTick: null,
  };
}

function throwTarget(state: RelayState, owner: RelayRunner) {
  const others = state.runners.filter(
    (r) => r.connected && r.slot !== owner.slot,
  );
  if (state.solo || !others.length)
    return distance(owner, RELAY_SOLO_TARGET) <= RELAY_THROW_RANGE
      ? { slot: owner.slot, ...RELAY_SOLO_TARGET, solo: true }
      : null;
  const target = others
    .filter(
      (r) =>
        r.z >= RELAY_END_ZONE &&
        r.stunUntil <= state.tick &&
        distance(owner, r) <= RELAY_THROW_RANGE,
    )
    .sort(
      (a, b) => distance(owner, a) - distance(owner, b) || a.slot - b.slot,
    )[0];
  return target
    ? { slot: target.slot, x: target.x, z: target.z, solo: false }
    : null;
}

/** A truthful prompt for the one context action; simulation also rechecks it. */
export function relayAction(state: RelayState, slot: number): RelayAction {
  const runner = state.runners.find((r) => r.slot === slot);
  if (
    state.status !== "running" ||
    !runner?.connected ||
    runner.stunUntil > state.tick
  )
    return "wait";
  if (state.bag.flight?.to === slot) return "catch";
  if (
    state.bag.owner === null &&
    !state.bag.flight &&
    distance(runner, state.bag) <= RELAY_PICKUP_RADIUS
  )
    return "recover";
  if (state.bag.owner === slot && runner.z >= RELAY_END_ZONE)
    return throwTarget(state, runner) ? "throw" : "wait";
  if (
    runner.x >= RELAY_SAFE_X &&
    runner.z >= RELAY_OBSTACLE_Z - 1.5 &&
    runner.z <= RELAY_OBSTACLE_Z + 0.6 &&
    runner.vaultUntil <= state.tick
  )
    return "vault";
  return "wait";
}

function dropBag(state: RelayState, x: number, z: number) {
  if (state.bag.owner === null && !state.bag.flight) return;
  state.bag.owner = null;
  state.bag.flight = null;
  state.bag.x = clamp(x, -RELAY_HALF_WIDTH, RELAY_HALF_WIDTH);
  state.bag.z = clamp(z, 0, RELAY_SECTION_LENGTH);
  state.drops++;
}

/** Idempotent connection changes never remove a slot or invent a teammate. */
export function setRelayConnected(
  state: RelayState,
  slot: number,
  connected: boolean,
) {
  const runner = state.runners.find((r) => r.slot === slot);
  if (
    !runner ||
    typeof connected !== "boolean" ||
    runner.connected === connected
  )
    return state;
  runner.connected = connected;
  runner.actionDown = false;
  if (state.status !== "running") return state;
  if (
    !connected &&
    (state.bag.owner === slot ||
      state.bag.flight?.from === slot ||
      state.bag.flight?.to === slot)
  )
    dropBag(state, RELAY_SOLO_TARGET.x, 0);
  if (connected) {
    runner.x = spawnX(state.runners.indexOf(runner));
    runner.z = 0;
    runner.yaw = 0;
    runner.stunUntil = 0;
    runner.vaultUntil = 0;
    runner.actionReadyTick =
      state.tick + relayConfig(state.difficulty).actionCooldownTicks;
  }
  return state;
}

function normalise(input?: RelayInput): RelayInput {
  if (!input || typeof input !== "object") return { x: 0, z: 0, action: false };
  const x = Number.isFinite(input.x) ? clamp(input.x, -1, 1) : 0;
  const z = Number.isFinite(input.z) ? clamp(input.z, -1, 1) : 0;
  const length = Math.max(1, Math.hypot(x, z));
  return { x: x / length, z: z / length, action: input.action === true };
}

function completeLeg(state: RelayState, receiver: RelayRunner) {
  state.handoffs++;
  state.bag.flight = null;
  state.bag.owner = receiver.slot;
  if (state.leg === RELAY_LEGS - 1) {
    state.status = "finished";
    state.finishedTick = state.tick;
    state.bag.x = receiver.x;
    state.bag.z = receiver.z;
    return;
  }
  state.leg = (state.leg + 1) as RelayState["leg"];
  state.runners.forEach((runner, index) => {
    runner.x = spawnX(index);
    runner.z = 0;
    runner.yaw = 0;
    runner.vaultUntil = 0;
    runner.stunUntil = 0;
  });
  state.bag.x = receiver.x;
  state.bag.z = receiver.z;
}

/** Advance one 60Hz tick. Caller positions, time, targets and results are ignored. */
export function advanceRelay(
  state: RelayState,
  inputs: Record<number, RelayInput>,
) {
  if (state.status !== "running") return state;
  const config = relayConfig(state.difficulty);
  state.tick++;
  const sampled = new Map<number, RelayInput>();
  const pulses = new Set<number>();
  const used = new Set<number>();
  for (const runner of state.runners) {
    const input = normalise(
      runner.connected ? inputs?.[runner.slot] : undefined,
    );
    sampled.set(runner.slot, input);
    if (
      input.action &&
      !runner.actionDown &&
      runner.actionReadyTick <= state.tick
    )
      pulses.add(runner.slot);
    runner.actionDown = input.action;
    // Vault must start before this tick's movement reaches the obstacle.
    if (
      pulses.has(runner.slot) &&
      relayAction(state, runner.slot) === "vault"
    ) {
      runner.vaultUntil = state.tick + config.vaultTicks;
      runner.actionReadyTick = state.tick + config.actionCooldownTicks;
      used.add(runner.slot);
    }
  }

  const platform = relayPlatform(state.tick, state.difficulty, state.leg);
  const previousPlatform = relayPlatform(
    state.tick - 1,
    state.difficulty,
    state.leg,
  );
  const barriers = relayBarriers(state.tick, state.difficulty, state.leg);
  for (const runner of state.runners) {
    if (!runner.connected || runner.stunUntil > state.tick) continue;
    const input = sampled.get(runner.slot)!;
    const oldX = runner.x;
    const oldZ = runner.z;
    if (
      oldX >= RELAY_SAFE_X &&
      oldZ >= RELAY_PLATFORM_START &&
      oldZ <= RELAY_PLATFORM_END
    )
      runner.x += platform.x - previousPlatform.x;
    const speed = oldX < RELAY_SAFE_X ? config.safeSpeed : config.speed;
    runner.x = clamp(
      runner.x + (input.x * speed) / RELAY_TICK_RATE,
      -RELAY_HALF_WIDTH,
      RELAY_HALF_WIDTH,
    );
    runner.z = clamp(
      runner.z + (input.z * speed) / RELAY_TICK_RATE,
      0,
      RELAY_SECTION_LENGTH,
    );
    if (input.x || input.z) runner.yaw = Math.atan2(input.x, input.z);
    if (runner.x < RELAY_SAFE_X) continue;
    let backTo: number | null = null;
    if (
      runner.z >= RELAY_PLATFORM_START &&
      runner.z <= RELAY_PLATFORM_END &&
      Math.abs(runner.x - platform.x) + RELAY_RUNNER_RADIUS > platform.width / 2
    )
      backTo = RELAY_PLATFORM_START - 0.8;
    if (backTo === null && runner.vaultUntil <= state.tick) {
      const barrier = barriers.find(
        (b) =>
          Math.abs(runner.z - b.z) <= 0.45 + RELAY_RUNNER_RADIUS &&
          Math.abs(runner.x - b.x) <= b.width / 2 + RELAY_RUNNER_RADIUS,
      );
      if (barrier) backTo = barrier.z - 0.9;
      else if (
        Math.abs(runner.z - RELAY_OBSTACLE_Z) <=
        0.35 + RELAY_RUNNER_RADIUS
      )
        backTo = RELAY_OBSTACLE_Z - 0.8;
    }
    if (backTo !== null) {
      runner.x = oldX;
      runner.z = Math.min(oldZ, backTo);
      runner.vaultUntil = 0;
      runner.stunUntil = state.tick + config.stunTicks;
      if (state.bag.owner === runner.slot) dropBag(state, runner.x, runner.z);
    }
  }

  if (state.bag.flight) {
    const flight = state.bag.flight;
    const t = clamp(
      (state.tick - flight.startTick) / (flight.endTick - flight.startTick),
      0,
      1,
    );
    state.bag.x = flight.x0 + (flight.x1 - flight.x0) * t;
    state.bag.z = flight.z0 + (flight.z1 - flight.z0) * t;
  } else if (state.bag.owner !== null) {
    const owner = state.runners.find((r) => r.slot === state.bag.owner)!;
    state.bag.x = owner.x;
    state.bag.z = owner.z;
  }

  for (const runner of state.runners) {
    if (!pulses.has(runner.slot) || used.has(runner.slot)) continue;
    const action = relayAction(state, runner.slot);
    if (action === "wait" || action === "vault") continue;
    runner.actionReadyTick = state.tick + config.actionCooldownTicks;
    if (action === "catch") {
      const flight = state.bag.flight!;
      const window = relayCatchWindow(flight, state.difficulty);
      if (
        state.tick >= window.start &&
        state.tick <= window.end &&
        distance(runner, { x: flight.x1, z: flight.z1 }) <= RELAY_CATCH_RADIUS
      ) {
        completeLeg(state, runner);
        // No second actor can recover/throw on a freshly advanced checkpoint.
        break;
      } else dropBag(state, flight.x1, flight.z1);
    } else if (action === "recover") {
      state.bag.owner = runner.slot;
      state.bag.x = runner.x;
      state.bag.z = runner.z;
      state.recoveries++;
    } else if (action === "throw") {
      const target = throwTarget(state, runner)!;
      state.bag.owner = null;
      state.bag.flight = {
        from: runner.slot,
        to: target.slot,
        startTick: state.tick,
        endTick: state.tick + config.flightTicks,
        x0: runner.x,
        z0: runner.z,
        x1: target.x,
        z1: target.z,
        solo: target.solo,
      };
    }
  }
  if (
    state.bag.flight &&
    state.tick > relayCatchWindow(state.bag.flight, state.difficulty).end
  )
    dropBag(state, state.bag.flight.x1, state.bag.flight.z1);
  if (state.status === "running" && state.tick >= config.limitTicks)
    state.status = "timeout";
  return state;
}
