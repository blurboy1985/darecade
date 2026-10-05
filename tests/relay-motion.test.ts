import test from "node:test";
import assert from "node:assert/strict";
import { presentationTick } from "../src/relay-motion.ts";
import { relayCatchWindow, type RelayFlight } from "../shared/relay.ts";

test("4 Hz presentation reaches Challenge bag arrival inside its authoritative catch window", () => {
  const flight: RelayFlight = {
    from: 0,
    to: 1,
    startTick: 60,
    endTick: 114,
    x0: -3.2,
    z0: 28,
    x1: -3.2,
    z1: 29.3,
    solo: false,
  };
  const window = relayCatchWindow(flight, "challenge");
  // Server sends tick 105. The parcel arrives 150 ms later, before tick 120's
  // next packet. Interpolating from the preceding packet would miss this cue.
  const arrival = presentationTick(105, 0.15, "running");
  assert.equal(arrival, flight.endTick);
  assert.ok(arrival >= window.start && arrival <= window.end);
  assert.equal(presentationTick(105, 0, "running"), 105);
  assert.equal(presentationTick(105, 0.25, "running"), 120);
});

test("a delayed packet freezes visual phases at one poll interval", () => {
  assert.equal(presentationTick(300, 0.5, "running"), 315);
  assert.equal(presentationTick(300, 60, "running"), 315);
  assert.equal(presentationTick(315, 0, "running"), 315);
  assert.equal(presentationTick(315, 0.1, "running"), 321);
});

test("non-running states never advance phases and invalid age never rewinds", () => {
  for (const status of [
    "waiting",
    "finished",
    "timeout",
    "cancelled",
    "paused",
  ])
    assert.equal(presentationTick(420, 0.25, status), 420);
  for (const age of [-1, NaN, Infinity])
    assert.equal(presentationTick(420, age, "running"), 420);
});
