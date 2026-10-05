import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate as nextTurn } from "node:timers/promises";
import vm from "node:vm";
import ts from "typescript";
import * as rules from "../shared/stage.ts";
import * as state from "../src/state.ts";
import * as guide from "../src/progression-guide.ts";

// Run the real mount function. Replace only the DOM, drawing and frame boundary.
const compiled = ts.transpileModule(
  readFileSync(new URL("../src/stage-game.ts", import.meta.url), "utf8"),
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
  className = "";
  hidden = false;
  disabled = false;
  value = "";
  isConnected = true;
  dataset: Record<string, string> = {};
  style: Record<string, string> = {};
  classList = { add() {}, remove() {}, contains: () => true };
  child?: Element;
  dialog = { open: true };
  private elements = new Map<string, Element>();
  private lanes = Array.from({ length: 4 }, () =>
    Object.assign(new EventTarget(), {
      disabled: true,
      classList: { add() {}, remove() {} },
    }),
  );
  querySelector(selector: string) {
    if (!this.elements.has(selector))
      this.elements.set(selector, new Element());
    return this.elements.get(selector)!;
  }
  querySelectorAll(selector: string) {
    assert.equal(selector, "[data-lane]");
    return this.lanes;
  }
  replaceChildren(child: Element) {
    this.child = child;
  }
  closest() {
    return this.dialog;
  }
  getContext() {
    return {
      clearRect() {},
      fillRect() {},
      strokeRect() {},
      beginPath() {},
      roundRect() {},
      fill() {},
      fillText() {},
    };
  }
}

class KeyboardTarget extends EventTarget {
  keyListeners = 0;
  override addEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (type === "keydown") this.keyListeners++;
    super.addEventListener(type, callback, options);
  }
  override removeEventListener(
    type: string,
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    if (type === "keydown") this.keyListeners--;
    super.removeEventListener(type, callback, options);
  }
}

function harness(save = state.fresh()) {
  const host = new Element();
  const window = new KeyboardTarget();
  const shows: rules.StageShow[] = [];
  const reports: { event: string; value: unknown }[] = [];
  const sounds: string[] = [];
  const frames = new Map<number, (now: number) => void>();
  let now = 1000,
    frameId = 0;
  class ObservedShow extends rules.StageShow {
    constructor(seed?: number, mode?: rules.StageMode) {
      super(seed, mode);
      shows.push(this);
    }
  }
  const exports: Record<string, unknown> = {};
  const context = vm.createContext({
    exports,
    require(path: string) {
      switch (path) {
        case "../shared/stage":
          return { ...rules, StageShow: ObservedShow };
        case "./state":
          return state;
        case "./progression-guide":
          return guide;
        case "./character":
          return { loadCharacter: () => Promise.resolve() };
        case "./stage.css":
          return {};
        default:
          throw Error(`Unexpected import: ${path}`);
      }
    },
    window,
    document: {
      createElement: () => new Element(),
      documentElement: { classList: { contains: () => true } },
    },
    navigator: {},
    performance: { now: () => now },
    Math: Object.assign(Object.create(Math), { random: () => 7 / 2 ** 31 }),
    setTimeout: () => 1,
    requestAnimationFrame(callback: (now: number) => void) {
      frames.set(++frameId, callback);
      return frameId;
    },
  });
  vm.runInContext(compiled, context);
  const mount = exports.mountStage as (
    host: Element,
    ctx: {
      save: state.Save;
      simple: boolean;
      sound: (name: string) => void;
      report: (event: string, value?: unknown) => Promise<void>;
    },
  ) => void;
  mount(host, {
    save,
    simple: true,
    sound: (name) => sounds.push(name),
    report: async (event, value) => {
      reports.push({ event, value });
      assert.equal(event, "perform");
      assert.notEqual(
        state.performShow(save, value, 1_000_000, state.singaporeDay()),
        null,
      );
    },
  });
  const root = host.child!;
  const find = (selector: string) => root.querySelector(selector);
  const emit = (target: EventTarget, type: string, fields = {}) =>
    target.dispatchEvent(
      Object.assign(new Event(type, { cancelable: true }), fields),
    );
  return {
    root,
    save,
    reports,
    sounds,
    window,
    frames,
    find,
    lanes: root.querySelectorAll("[data-lane]"),
    show: () => shows.at(-1)!,
    start: () => emit(find("#stage-start"), "click"),
    mode(value: rules.StageMode) {
      find("#stage-mode").value = value;
      emit(find("#stage-mode"), "change");
    },
    key(key: string, repeat = false) {
      emit(window, "keydown", { key, repeat });
    },
    frame(ms = 1000 / 60 + 0.000001) {
      now += ms;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(now));
    },
    dispose() {
      root.isConnected = false;
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback(now));
    },
  };
}

function play(h: ReturnType<typeof harness>, hitLimit = Infinity) {
  const arrows = ["ArrowLeft", "ArrowDown", "ArrowUp", "ArrowRight"];
  let hit = 0;
  while (!h.show().ended) {
    for (const note of h.show().notes) {
      if (note.tick === h.show().tick + 1 && hit < hitLimit) {
        h.key(arrows[note.lane]);
        hit++;
      }
    }
    h.frame();
  }
}

test("a new performer defaults to two-lane warmup and can choose the existing Show", () => {
  const h = harness();
  try {
    assert.equal(h.find("#stage-mode").value, "warmup");
    assert.match(h.find("#stage-goal").textContent, /No booing, no XP/);
    assert.equal(h.find(".stage-hype").hidden, true);
    h.start();
    assert.equal(h.find("#stage-mode").disabled, true);
    assert.deepEqual(
      h.lanes.map((lane) => lane.disabled),
      [false, true, true, false],
    );
    play(h, 0);
    assert.equal(h.show().tick, rules.STAGE_TICKS);
    assert.equal(h.show().booed, false);
    assert.equal(h.reports.length, 0);
    assert.equal(h.find("#stage-mode").disabled, false);
    assert.equal(h.find("#stage-start").hidden, false);
    assert.ok(h.lanes.every((lane) => lane.disabled));
    h.mode("show");
    assert.equal(h.find(".stage-hype").hidden, false);
    assert.equal(h.find("#stage-score-label").textContent, "SCORE");
    h.start();
    assert.equal(h.show().mode, "show");
    assert.ok(h.lanes.every((lane) => !lane.disabled));
  } finally {
    h.dispose();
  }
});

test("meeting the five-note warmup goal leaves saved progress and rewards untouched", () => {
  const h = harness();
  const before = structuredClone(h.save);
  try {
    h.start();
    play(h, rules.STAGE_WARMUP_GOAL);
    assert.equal(h.show().counts.perfect, rules.STAGE_WARMUP_GOAL);
    assert.match(
      h.find(".activity-status").textContent,
      /Warm-up goal complete/,
    );
    assert.match(
      h.find(".activity-status").textContent,
      /No XP or best score changed/,
    );
    assert.ok(h.sounds.includes("win"));
    assert.deepEqual(h.save, before);
    assert.equal(h.reports.length, 0);
    h.mode("show");
    assert.equal(h.find("#stage-score-label").textContent, "SCORE");
    assert.equal(h.find("#stage-score").textContent, "0");
    assert.equal(h.find("#stage-combo").textContent, "0");
    assert.equal(h.find(".stage-call").textContent, "");
    assert.equal(h.find(".activity-status").textContent, "");
    assert.equal(h.root.dataset.left, undefined);
    assert.equal(h.find("#stage-start").hidden, false);
    assert.deepEqual(h.save, before);
    assert.equal(h.reports.length, 0);
  } finally {
    h.dispose();
  }
});

test("warmup ignores unused lanes and repeated keys without changing the two-lane lesson", () => {
  const h = harness();
  try {
    h.start();
    for (const key of ["f", "j", "ArrowDown", "ArrowUp"]) h.key(key);
    h.frame();
    h.key("d", true);
    h.key("k", true);
    h.frame();
    assert.equal(h.show().counts.stray, 0);
    assert.equal(h.show().ended, false);
    assert.equal(h.find("#stage-mode").disabled, true);
    h.key("d");
    h.frame();
    assert.equal(h.show().counts.stray, 1);
    assert.equal(h.show().booed, false);
    assert.equal(h.reports.length, 0);
  } finally {
    h.dispose();
  }
});

test("a returning performer's Show reports once and preserves the existing daily XP cap", async () => {
  const save = Object.assign(state.fresh(), {
    xp: 95,
    stageBest: 5000,
    stageDay: state.singaporeDay(),
    stageXp: state.STAGE_DAILY_XP - state.STAGE_STAR_XP,
  });
  const h = harness(save);
  try {
    assert.equal(h.find("#stage-mode").value, "show");
    assert.match(h.find("#stage-progress").innerHTML, /Best show: 5000 points/);
    h.start();
    play(h);
    // Await the cross-context report promise and the panel's result update.
    await nextTurn();
    assert.equal(h.reports.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(h.reports[0])), {
      event: "perform",
      value: { score: rules.stageMaxScore(7), stars: 3 },
    });
    assert.equal(save.xp, 100);
    assert.equal(save.stageXp, state.STAGE_DAILY_XP);
    assert.equal(save.stageBest, rules.stageMaxScore(7));
    assert.match(h.find(".activity-status").textContent, /\+5 XP/);
    assert.match(h.find("#stage-progress").innerHTML, /0\/45 XP left today/);
    for (let i = 0; i < 10; i++) h.frame();
    assert.equal(h.reports.length, 1);
  } finally {
    h.dispose();
  }
});

test("a missed original Show keeps zero-star rewards and suggests the available warmup", async () => {
  const h = harness();
  const before = structuredClone(h.save);
  try {
    h.mode("show");
    h.start();
    play(h, 0);
    await nextTurn();
    assert.equal(h.show().tick, 253);
    assert.equal(h.show().booed, true);
    assert.equal(h.reports.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(h.reports[0])), {
      event: "perform",
      value: { score: 0, stars: 0 },
    });
    assert.equal(h.save.xp, before.xp);
    assert.equal(h.save.stageBest, before.stageBest);
    assert.match(h.find(".activity-status").textContent, /Try Warm-up/);
    assert.equal(h.find("#stage-mode").disabled, false);
    h.mode("warmup");
    h.start();
    assert.equal(h.show().mode, "warmup");
    assert.deepEqual(
      h.lanes.map((lane) => lane.disabled),
      [false, true, true, false],
    );
  } finally {
    h.dispose();
  }
});

test("closing or removing the Stage panel pauses the session and removes its keyboard listener", () => {
  const h = harness();
  try {
    h.start();
    h.frame();
    const tick = h.show().tick;
    h.root.dialog.open = false;
    for (let i = 0; i < 10; i++) h.frame();
    assert.equal(h.show().tick, tick);
    assert.equal(h.reports.length, 0);
    assert.equal(h.window.keyListeners, 1);
    h.dispose();
    assert.equal(h.window.keyListeners, 0);
    assert.equal(h.frames.size, 0);
  } finally {
    if (h.root.isConnected) h.dispose();
  }
});
