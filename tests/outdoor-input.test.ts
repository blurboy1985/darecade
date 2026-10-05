import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  Simulation,
  replayRun,
  rulesVersion,
  type Replay,
} from "../shared/simulation.ts";
import * as outdoor from "../shared/outdoor.ts";
import { games } from "../src/catalog.ts";
import { fishSpecies, HOOPS_SHOTS } from "../src/state.ts";

// Exercise the entire real class, including its event listeners and animation
// loop. Only DOM, graphics/audio and the scheduling boundary are replaced.
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/outdoor-game.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

class Element extends EventTarget {
  innerHTML = "";
  textContent = "";
  hidden = false;
  disabled = false;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  classList = { add() {}, toggle() {} };
  private elements = new Map<string, Element>();
  querySelector(selector: string) {
    if (!this.elements.has(selector))
      this.elements.set(selector, new Element());
    return this.elements.get(selector)!;
  }
  focus() {}
  append() {}
  remove() {}
}

function harness(id: "hoops" | "fishing" = "hoops") {
  const container = new Element();
  const window = new EventTarget();
  const document = new Element();
  const frames = new Map<number, (now: number) => void>();
  const finished: { score: number; replay: Replay }[] = [];
  let now = 1000,
    nextFrame = 0;
  const exports: Record<string, any> = {};
  const context = vm.createContext({
    exports,
    require(path: string) {
      switch (path) {
        case "../shared/simulation":
          return { Simulation, rulesVersion };
        case "../shared/outdoor":
          return outdoor;
        case "./catalog":
          return { games };
        case "./state":
          return { fishSpecies, HOOPS_SHOTS };
        case "./outdoor.css":
          return {};
        default:
          throw Error(`Unexpected import: ${path}`);
      }
    },
    AbortController,
    window,
    document: Object.assign(document, { createElement: () => new Element() }),
    performance: { now: () => now },
    requestAnimationFrame(callback: (now: number) => void) {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (frame: number) => frames.delete(frame),
    setTimeout: () => 1,
  });
  vm.runInContext(compiled, context);
  const game = new exports.OutdoorGame(
    container,
    id,
    (score: number, replay: Replay) => finished.push({ score, replay }),
    () => {},
    77,
    { simple: true, reduced: true },
  );
  const sim: Simulation = game.sim;
  const emit = (target: EventTarget, type: string, properties = {}) =>
    target.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), properties),
    );
  const action = container.querySelector("#outdoor-action");
  return {
    sim,
    finished,
    game,
    start: () => emit(container.querySelector("#start-game"), "click"),
    pause: () => emit(container.querySelector("#pause-game"), "click"),
    down: () => emit(action, "pointerdown"),
    up: () => emit(action, "pointerup"),
    cancel: () => emit(action, "pointercancel"),
    leave: () => emit(action, "pointerleave"),
    blur: () => emit(window, "blur"),
    hidden() {
      document.hidden = true;
      emit(document, "visibilitychange");
    },
    key(type: "keydown" | "keyup", key = " ", repeat = false) {
      emit(window, type, { key, repeat });
    },
    frame(ms = 20) {
      now += ms;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(now));
    },
  };
}

test("a pointer click entirely between frames becomes exactly one recorded Hoops shot", () => {
  const h = harness();
  try {
    h.start();
    h.down();
    h.up();
    // At high refresh rates the latch must wait for an actual physics tick.
    h.frame(7);
    assert.equal((h.sim.outdoor as outdoor.HoopsRound).attempts, 0);
    h.frame(7);
    h.frame(7);
    assert.equal((h.sim.outdoor as outdoor.HoopsRound).attempts, 1);
    h.frame(100);
    assert.equal((h.sim.outdoor as outdoor.HoopsRound).attempts, 1);
    while (!h.sim.ended) h.frame(100);
    assert.equal(h.finished.length, 1);
    const { score, replay } = h.finished[0];
    assert.equal(replay.events.filter((event) => event[4] === 1).length, 1);
    assert.equal(replay.events[0][0], 0);
    assert.equal(replay.events[0][4], 1);
    assert.equal(replay.events[1][0], 1);
    assert.equal(replay.events[1][4], 0);
    const verified = replayRun("hoops", 77, replay);
    assert.equal(verified.score, score);
    assert.ok(verified.outdoor && "attempts" in verified.outdoor);
    assert.equal(verified.outdoor.attempts, 1);
  } finally {
    h.game.dispose();
  }
});

test("pointer leave after release preserves a completed tap for the next physics tick", () => {
  const h = harness();
  try {
    h.start();
    h.down();
    h.up();
    h.leave();
    h.frame();
    assert.equal((h.sim.outdoor as outdoor.HoopsRound).attempts, 1);
    h.frame(100);
    assert.equal((h.sim.outdoor as outdoor.HoopsRound).attempts, 1);
  } finally {
    h.game.dispose();
  }
});

test("quick Space and Enter presses are captured; keyboard repeat never queues another shot", () => {
  for (const key of [" ", "Enter"]) {
    const h = harness();
    try {
      h.start();
      h.key("keydown", key);
      h.key("keyup", key);
      h.frame();
      assert.equal((h.sim.outdoor as outdoor.HoopsRound).attempts, 1);
      for (let i = 0; i < 40; i++) {
        h.key("keydown", key, true);
        h.frame();
      }
      assert.equal((h.sim.outdoor as outdoor.HoopsRound).attempts, 1);
    } finally {
      h.game.dispose();
    }
  }
});

test("cancellation, pointer leave, pause, blur and background clear queued presses", () => {
  for (const reason of [
    "cancel",
    "leave",
    "pause",
    "blur",
    "hidden",
  ] as const) {
    const h = harness();
    try {
      h.start();
      h.down();
      h[reason]();
      if (reason === "pause" || reason === "blur" || reason === "hidden") {
        const ticks = h.sim.ticks;
        h.frame(100);
        assert.equal(h.sim.ticks, ticks);
        // Input while paused must not leak into the resumed round either.
        h.down();
        h.up();
        h.pause();
      }
      h.frame();
      assert.equal((h.sim.outdoor as outdoor.HoopsRound).attempts, 0, reason);
      h.down();
      h.up();
      h.frame();
      assert.equal((h.sim.outdoor as outdoor.HoopsRound).attempts, 1, reason);
    } finally {
      h.game.dispose();
    }
  }
});

test("holding Hoops shoots once and does not automatically shoot after the ball lands", () => {
  const h = harness();
  try {
    h.start();
    h.down();
    for (let i = 0; i < 60; i++) h.frame();
    const round = h.sim.outdoor as outdoor.HoopsRound;
    assert.equal(round.flight, 0);
    assert.equal(round.attempts, 1);
    h.up();
    h.frame();
    h.down();
    h.up();
    h.frame();
    assert.equal(round.attempts, 2);
  } finally {
    h.game.dispose();
  }
});

test("Fishing captures a quick cast while holding still reels continuously until release", () => {
  const h = harness("fishing");
  try {
    h.start();
    h.down();
    h.up();
    h.frame();
    const round = h.sim.outdoor as outdoor.FishingRound;
    assert.equal(round.state, "waiting");
    for (let i = 0; i < 200 && round.state === "waiting"; i++) h.frame();
    assert.equal(round.state, "bite");
    h.down();
    h.frame();
    assert.equal(round.state, "reeling");
    const hooked = round.progress;
    for (let i = 0; i < 10; i++) h.frame();
    assert.ok(round.progress > hooked);
    const reeled = round.progress;
    h.up();
    h.frame();
    assert.ok(round.progress < reeled);
  } finally {
    h.game.dispose();
  }
});
