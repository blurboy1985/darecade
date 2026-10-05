import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceRelay,
  createRelay,
  relayAction,
  relayBarriers,
  relayCatchWindow,
  relayConfig,
  relayPlatform,
  setRelayConnected,
  RELAY_CATCH_RADIUS,
  RELAY_END_ZONE,
  RELAY_MAX_TICKS,
  RELAY_OBSTACLE_Z,
  RELAY_SAFE_X,
  RELAY_SOLO_TARGET,
  RELAY_STOPS,
  RELAY_TICK_RATE,
  type RelayDifficulty,
  type RelayInput,
  type RelayState,
} from "../shared/relay.ts";

const difficulties: RelayDifficulty[] = ["practice", "standard", "challenge"];
const neutral = { x: 0, z: 0, action: false };
const pulse = { ...neutral, action: true };
const clone = (s: RelayState): RelayState => JSON.parse(JSON.stringify(s));

function step(s: RelayState, ticks = 1) {
  for (let i = 0; i < ticks; i++) advanceRelay(s, {});
}

/** Inputs based on visible position and catch target; never assigns game state. */
function routeInputs(s: RelayState): Record<number, RelayInput> {
  const inputs: Record<number, RelayInput> = {};
  for (const r of s.runners.filter((r) => r.connected))
    inputs[r.slot] = { x: 0, z: r.z < 29.25 ? 1 : 0, action: false };
  if (s.bag.flight) {
    for (const input of Object.values(inputs)) input.z = 0;
    const r = s.runners.find((r) => r.slot === s.bag.flight!.to)!;
    const target = s.bag.flight;
    const x = target.x1 - r.x;
    const z = target.z1 - r.z;
    inputs[r.slot] = {
      x: Math.abs(x) > 0.1 ? Math.sign(x) : 0,
      z: Math.abs(z) > 0.1 ? Math.sign(z) : 0,
      action: s.tick + 1 === target.endTick,
    };
  } else if (s.bag.owner === null) {
    const r = s.runners
      .filter((r) => r.connected)
      .sort(
        (a, b) =>
          Math.hypot(a.x - s.bag.x, a.z - s.bag.z) -
          Math.hypot(b.x - s.bag.x, b.z - s.bag.z),
      )[0];
    if (r) {
      const x = s.bag.x - r.x;
      const z = s.bag.z - r.z;
      inputs[r.slot] = {
        x: Math.abs(x) > 0.1 ? Math.sign(x) : 0,
        z: Math.abs(z) > 0.1 ? Math.sign(z) : 0,
        action: relayAction(s, r.slot) === "recover" && !r.actionDown,
      };
    }
  } else {
    const owner = s.runners.find((r) => r.slot === s.bag.owner)!;
    if (owner.z >= 29.25 && relayAction(s, owner.slot) === "throw")
      inputs[owner.slot].action = !owner.actionDown;
  }
  return inputs;
}

function complete(s: RelayState) {
  while (s.status === "running") advanceRelay(s, routeInputs(s));
  return s;
}

/** Place a synthetic roster at one checkpoint for exact timing boundaries. */
function ready(difficulty: RelayDifficulty, solo = true) {
  const s = createRelay(difficulty, solo ? [0] : [0, 1], solo);
  for (const r of s.runners) {
    r.x = RELAY_SOLO_TARGET.x;
    r.z = RELAY_SOLO_TARGET.z;
  }
  s.bag.x = s.runners[0].x;
  s.bag.z = s.runners[0].z;
  return s;
}

test("Relay uses fixed private slots, serializable state and validated modes", () => {
  assert.deepEqual(RELAY_STOPS, [
    "Kopi",
    "Playground",
    "Palm Bay",
    "Mama Shop",
  ]);
  const s = createRelay("standard", [3, 0, 2, 1], false);
  assert.deepEqual(
    s.runners.map((r) => r.slot),
    [0, 1, 2, 3],
  );
  assert.equal(s.bag.owner, 0);
  assert.ok(s.runners.every((r) => r.x < RELAY_SAFE_X && r.z === 0));
  assert.deepEqual(clone(s), s);
  assert.doesNotMatch(
    JSON.stringify(s),
    /player|account|email|nickname|session|token|reward|xp/i,
  );
  for (const slots of [[], [0, 0], [-1], [4], [0.5], [0, 1, 2, 3, 4]])
    assert.throws(() => createRelay("standard", slots, false));
  for (const invalid of ["missing", "toString", "constructor", "__proto__"])
    assert.throws(() => createRelay(invalid as RelayDifficulty, [0], true));
  assert.throws(() => createRelay("practice", [0, 1], true));
});

test("all three presets are actually completable solo and with two or four active players", () => {
  for (const difficulty of difficulties) {
    for (const slots of [[0], [0, 1], [0, 1, 2, 3]]) {
      const s = complete(createRelay(difficulty, slots, slots.length === 1));
      assert.equal(
        s.status,
        "finished",
        `${difficulty}, ${slots.length} players`,
      );
      assert.equal(s.leg, 3);
      assert.equal(s.handoffs, 4);
      assert.equal(s.drops, 0);
      assert.equal(s.finishedTick, s.tick);
      assert.ok(s.tick < relayConfig(difficulty).limitTicks);
      assert.ok(
        s.tick / RELAY_TICK_RATE > 60 && s.tick / RELAY_TICK_RATE < 100,
      );
      assert.equal(s.bag.flight, null);
      assert.ok(s.bag.owner !== null);
    }
  }
});

test("movement clamps forged inputs, normalizes diagonals and cannot teleport or create slots", () => {
  const axis = createRelay("standard", [0], true);
  const diagonal = clone(axis);
  const forged = clone(axis);
  for (const s of [axis, diagonal, forged]) {
    s.runners[0].x = 0;
    s.runners[0].z = 2;
  }
  advanceRelay(axis, { 0: { x: 1, z: 0, action: false } });
  advanceRelay(diagonal, { 0: { x: 1, z: 1, action: false } });
  const a = axis.runners[0],
    d = diagonal.runners[0];
  assert.ok(
    Math.abs(Math.hypot(a.x, a.z - 2) - Math.hypot(d.x, d.z - 2)) < 1e-12,
  );
  advanceRelay(forged, {
    0: {
      x: 1e9,
      z: -1e9,
      action: "true",
      leg: 3,
      status: "finished",
    } as unknown as RelayInput,
    3: { x: 1, z: 1, action: true },
  });
  assert.ok(
    Math.hypot(forged.runners[0].x, forged.runners[0].z - 2) <=
      relayConfig("standard").speed / 60 + 1e-12,
  );
  assert.equal(forged.runners.length, 1);
  assert.equal(forged.leg, 0);
  assert.equal(forged.status, "running");
  const before = { x: forged.runners[0].x, z: forged.runners[0].z };
  for (let i = 0; i < 60; i++)
    advanceRelay(forged, { 0: { x: NaN, z: Infinity, action: false } });
  assert.equal(forged.runners[0].x, before.x);
  assert.equal(forged.runners[0].z, before.z);
  assert.ok(Number.isFinite(forged.bag.x) && Number.isFinite(forged.bag.z));
});

test("each preset times out on exactly its authoritative tick limit and terminal rounds freeze", () => {
  for (const difficulty of difficulties) {
    const s = createRelay(difficulty, [0], true);
    const limit = relayConfig(difficulty).limitTicks;
    assert.ok(limit <= RELAY_MAX_TICKS);
    step(s, limit - 1);
    assert.equal(s.status, "running");
    step(s);
    assert.equal(s.status, "timeout");
    assert.equal(s.tick, limit);
    assert.equal(s.finishedTick, null);
    const atEnd = clone(s);
    advanceRelay(s, { 0: { x: 1, z: 1, action: true } });
    assert.deepEqual(s, atEnd);
    const finished = complete(createRelay(difficulty, [0], true));
    const result = clone(finished);
    step(finished, 100);
    assert.deepEqual(finished, result);
  }
});

test("catch windows have exact widths and accept only their first through last ticks", () => {
  for (const difficulty of difficulties) {
    for (const at of ["first", "last", "early", "late"] as const) {
      const s = ready(difficulty);
      advanceRelay(s, { 0: pulse });
      const flight = s.bag.flight!;
      const window = relayCatchWindow(flight, difficulty);
      assert.equal(
        window.end - window.start + 1,
        relayConfig(difficulty).catchTicks,
      );
      const tick =
        at === "first"
          ? window.start
          : at === "last"
            ? window.end
            : at === "early"
              ? window.start - 1
              : window.end + 1;
      step(s, tick - s.tick - 1);
      advanceRelay(s, { 0: pulse });
      const caught = at === "first" || at === "last";
      assert.equal(s.handoffs, caught ? 1 : 0, `${difficulty}/${at}`);
      assert.equal(s.leg, caught ? 1 : 0);
      assert.equal(s.drops, caught ? 0 : 1);
    }
  }
});

test("a valid final catch on the time limit finishes; a later input cannot rescue a timeout", () => {
  for (const difficulty of difficulties) {
    for (const catchesAtDeadline of [true, false]) {
      const s = ready(difficulty);
      const config = relayConfig(difficulty);
      s.leg = 3;
      s.handoffs = 3;
      s.tick = config.limitTicks - config.flightTicks - 1;
      advanceRelay(s, { 0: pulse });
      assert.equal(s.bag.flight!.endTick, config.limitTicks);
      step(s, config.flightTicks - 1);
      advanceRelay(s, { 0: catchesAtDeadline ? pulse : neutral });
      assert.equal(s.tick, config.limitTicks);
      assert.equal(s.status, catchesAtDeadline ? "finished" : "timeout");
      assert.equal(s.handoffs, catchesAtDeadline ? 4 : 3);
      assert.equal(
        s.finishedTick,
        catchesAtDeadline ? config.limitTicks : null,
      );
      const terminal = clone(s);
      advanceRelay(s, { 0: pulse });
      assert.deepEqual(s, terminal);
    }
  }
});

test("wrong or distant receivers cannot catch; missed catches remain recoverable", () => {
  const s = ready("standard", false);
  advanceRelay(s, { 0: pulse });
  assert.equal(s.bag.flight?.to, 1);
  const endTick = s.bag.flight!.endTick;
  step(s, endTick - s.tick - 1);
  advanceRelay(s, { 0: pulse });
  assert.equal(s.handoffs, 0);
  assert.ok(s.bag.flight, "thrower cannot catch a team handoff");
  const receiver = s.runners[1];
  receiver.x += RELAY_CATCH_RADIUS + 0.1;
  advanceRelay(s, { 0: pulse, 1: pulse });
  assert.equal(s.bag.flight, null);
  assert.equal(s.bag.owner, null);
  assert.equal(s.drops, 1);
  assert.equal(s.leg, 0);
  advanceRelay(s, { 0: pulse });
  assert.equal(s.bag.owner, null, "thrower's held pulse does not replay");
  advanceRelay(s, { 0: neutral });
  advanceRelay(s, { 0: pulse });
  assert.equal(s.bag.owner, 0);
  assert.equal(s.recoveries, 1);
});

test("held action and rapid rearmed pulses cannot repeatedly throw or advance checkpoints", () => {
  const s = ready("challenge");
  advanceRelay(s, { 0: pulse });
  const flightEnd = s.bag.flight!.endTick;
  while (s.tick <= flightEnd + relayConfig(s.difficulty).catchTicks)
    advanceRelay(s, { 0: pulse });
  assert.equal(s.handoffs, 0);
  assert.equal(s.drops, 1);
  assert.equal(s.bag.owner, null);
  advanceRelay(s, { 0: neutral });
  advanceRelay(s, { 0: pulse });
  assert.equal(s.recoveries, 1);
  advanceRelay(s, { 0: neutral });
  advanceRelay(s, { 0: pulse });
  assert.equal(
    s.bag.flight,
    null,
    "recovery cooldown rejects the immediate throw",
  );
  assert.equal(s.handoffs, 0);
});

test("one catch advances one checkpoint and final completion takes exactly four handoffs", () => {
  const s = ready("practice", false);
  advanceRelay(s, { 0: pulse });
  step(s, s.bag.flight!.endTick - s.tick - 1);
  advanceRelay(s, { 0: pulse, 1: pulse });
  assert.equal(s.handoffs, 1);
  assert.equal(s.leg, 1);
  assert.equal(s.bag.owner, 1);
  assert.ok(s.runners.every((r) => r.z === 0));
  assert.equal(s.bag.flight, null);
  assert.equal(complete(s).handoffs, 4);
  assert.equal(s.status, "finished");
});

test("platform and barrier collisions use the same exact poses exposed to rendering", () => {
  const carried = createRelay("standard", [0], true);
  carried.runners[0].x = relayPlatform(0, carried.difficulty).x;
  carried.runners[0].z = 11;
  for (let i = 0; i < 20; i++) {
    step(carried);
    assert.ok(
      Math.abs(
        carried.runners[0].x -
          relayPlatform(carried.tick, carried.difficulty).x,
      ) < 1e-12,
    );
    assert.equal(carried.drops, 0);
  }
  const gap = createRelay("standard", [0], true);
  gap.runners[0].x = 4.9;
  gap.runners[0].z = 8.99;
  advanceRelay(gap, { 0: { x: 0, z: 1, action: false } });
  assert.equal(gap.drops, 1);
  assert.equal(gap.bag.owner, null);
  assert.ok(gap.runners[0].z < 9);
  assert.ok(gap.runners[0].stunUntil > gap.tick);
  const barrier = createRelay("standard", [0], true);
  const pose = relayBarriers(1, barrier.difficulty)[0];
  barrier.runners[0].x = pose.x;
  barrier.runners[0].z = pose.z;
  step(barrier);
  assert.equal(barrier.drops, 1);
  assert.ok(barrier.runners[0].z < pose.z);
  step(barrier, relayConfig(barrier.difficulty).stunTicks);
  advanceRelay(barrier, { 0: pulse });
  assert.equal(barrier.bag.owner, 0);
  assert.equal(barrier.recoveries, 1);
});

test("a contextual vault crosses the low obstacle in every preset; a missed vault drops and stuns", () => {
  for (const difficulty of difficulties) {
    const s = createRelay(difficulty, [0], true);
    s.runners[0].x = 0;
    s.runners[0].z = RELAY_OBSTACLE_Z - 0.6;
    assert.equal(relayAction(s, 0), "vault");
    advanceRelay(s, { 0: { x: 0, z: 1, action: true } });
    for (let i = 0; i < 34; i++)
      advanceRelay(s, { 0: { x: 0, z: 1, action: false } });
    assert.ok(s.runners[0].z > RELAY_OBSTACLE_Z + 0.57);
    assert.equal(s.drops, 0);
    const missed = createRelay(difficulty, [0], true);
    missed.runners[0].x = 0;
    missed.runners[0].z = RELAY_OBSTACLE_Z - 0.6;
    advanceRelay(missed, { 0: { x: 0, z: 1, action: false } });
    assert.equal(missed.drops, 1);
    assert.ok(missed.runners[0].stunUntil > missed.tick);
  }
});

test("pressing Vault when its prompt first appears clears the obstacle in every preset", () => {
  for (const difficulty of difficulties) {
    const s = createRelay(difficulty, [0], true);
    const runner = s.runners[0];
    runner.x = 0;
    runner.z = 17.8;
    const forward = { x: 0, z: 1, action: false };
    while (relayAction(s, 0) !== "vault" && s.tick < 100)
      advanceRelay(s, { 0: forward });
    assert.equal(relayAction(s, 0), "vault");
    assert.ok(runner.z < RELAY_OBSTACLE_Z - 1.45);
    advanceRelay(s, { 0: { ...forward, action: true } });
    for (let i = 0; i < relayConfig(difficulty).vaultTicks; i++)
      advanceRelay(s, { 0: forward });
    assert.ok(runner.z > RELAY_OBSTACLE_Z + 0.57);
    assert.equal(s.drops, 0);
    assert.equal(runner.stunUntil, 0);
    assert.equal(s.bag.owner, 0);
  }
});

test("carrier disconnect returns the bag to the current checkpoint; remaining actual runner can finish", () => {
  for (const difficulty of difficulties) {
    const s = createRelay(difficulty, [0, 1], false);
    setRelayConnected(s, 0, false);
    setRelayConnected(s, 0, false);
    assert.equal(s.drops, 1);
    assert.equal(s.bag.owner, null);
    assert.equal(s.bag.z, 0);
    assert.equal(s.runners.filter((r) => r.connected).length, 1);
    assert.equal(
      s.solo,
      false,
      "the original multiplayer round is not relabelled solo",
    );
    advanceRelay(s, { 1: pulse });
    assert.equal(s.bag.owner, 1);
    while (s.status === "running" && !s.bag.flight)
      advanceRelay(s, routeInputs(s));
    assert.equal(s.bag.flight?.solo, true);
    assert.equal(s.bag.flight?.from, 1);
    assert.equal(s.bag.flight?.to, 1);
    assert.equal(complete(s).status, "finished");
    assert.equal(s.handoffs, 4);
    assert.equal(s.runners.length, 2, "no replacement teammate is invented");
  }
});

test("flight endpoint disconnect drops once and reconnect retains its slot without resetting time/progress", () => {
  const s = ready("practice", false);
  s.leg = 2;
  s.handoffs = 2;
  advanceRelay(s, { 0: pulse });
  setRelayConnected(s, 1, false);
  assert.equal(s.bag.flight, null);
  assert.equal(s.bag.owner, null);
  assert.equal(s.bag.z, 0);
  assert.equal(s.drops, 1);
  const before = s.tick;
  setRelayConnected(s, 1, true);
  assert.equal(s.tick, before);
  assert.equal(s.leg, 2);
  assert.equal(s.handoffs, 2);
  assert.equal(s.runners[1].slot, 1);
  assert.equal(s.runners[1].connected, true);
  assert.equal(s.runners[1].z, 0);
  assert.equal(s.runners[1].actionDown, false);
  setRelayConnected(s, 99, true);
  assert.equal(s.runners.length, 2);
});

test("a serialized mid-flight checkpoint resumes with identical physics, timing and results", () => {
  for (const difficulty of difficulties) {
    const a = createRelay(difficulty, [0, 1], false);
    while (!a.bag.flight) advanceRelay(a, routeInputs(a));
    step(a, 10);
    const b = clone(a);
    while (a.status === "running") {
      const inputs = routeInputs(a);
      advanceRelay(a, inputs);
      advanceRelay(b, inputs);
    }
    assert.deepEqual(a, b);
    assert.equal(a.status, "finished");
  }
});

test("throwing requires the end zone and an active nearby receiver, with no invented handoff target", () => {
  const s = createRelay("standard", [0, 1], false);
  advanceRelay(s, { 0: pulse });
  assert.equal(s.bag.flight, null);
  s.runners[0].z = RELAY_END_ZONE + 1;
  assert.equal(relayAction(s, 0), "wait");
  s.runners[1].z = s.runners[0].z;
  s.runners[1].x = 4.9;
  assert.equal(relayAction(s, 0), "wait");
  s.runners[1].x = s.runners[0].x + 0.5;
  assert.equal(relayAction(s, 0), "throw");
  advanceRelay(s, { 0: neutral });
  advanceRelay(s, { 0: pulse });
  assert.equal(s.bag.flight?.to, 1);
  assert.equal(s.bag.flight?.solo, false);
  assert.ok(s.bag.flight!.x1 <= 5 && s.bag.flight!.z1 <= 30);
});
