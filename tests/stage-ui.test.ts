import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setImmediate as nextTurn } from "node:timers/promises";
import vm from "node:vm";
import ts from "typescript";
import * as rules from "../shared/stage.ts";
import * as partyRules from "../shared/stage-party.ts";
import * as moves from "../src/stage-moves.ts";
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
  scrollIntoView() {}
  append() {}
  remove() {}
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
  private cheers = Array.from({ length: 4 }, () => new EventTarget());
  querySelectorAll(selector: string) {
    if (selector === "[data-cheer]") return this.cheers;
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
  // Stands in for the polling client: the test plays the server.
  class FakeParty {
    snapshot: partyRules.PartySnapshot | null = null;
    calls: unknown[][] = [];
    clock = 0;
    report: () => partyRules.PartyTick;
    changed: (s: partyRules.PartySnapshot | null, reason?: string) => void;
    constructor(report: FakeParty["report"], changed: FakeParty["changed"]) {
      this.report = report;
      this.changed = changed;
      parties.push(this);
    }
    now() {
      return this.clock;
    }
    push(snapshot: partyRules.PartySnapshot) {
      this.snapshot = snapshot;
      this.changed(snapshot);
    }
    host(mode: string) {
      this.calls.push(["host", mode]);
      return Promise.resolve();
    }
    join(code: string) {
      this.calls.push(["join", code]);
      return Promise.resolve();
    }
    setMode(mode: string) {
      this.calls.push(["mode", mode]);
      return Promise.resolve();
    }
    start() {
      this.calls.push(["start"]);
      return Promise.resolve();
    }
    cheer(kind: number) {
      this.calls.push(["cheer", kind]);
    }
    flush() {
      this.calls.push(["flush"]);
    }
    leave() {
      this.calls.push(["leave"]);
      if (!this.snapshot) return;
      this.snapshot = null;
      this.changed(null);
    }
  }
  const parties: FakeParty[] = [];
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
        case "../shared/stage-party":
          return partyRules;
        case "./stage-moves":
          return moves;
        case "./stage-party":
          return { PartyClient: FakeParty };
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
      sound: (name: string) => void;
      report: (event: string, value?: unknown) => Promise<void>;
    },
  ) => void;
  mount(host, {
    save,
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
    cheers: root.querySelectorAll("[data-cheer]"),
    party: parties[0],
    click: (selector: string) => emit(find(selector), "click"),
    emit,
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

const returning = () =>
  Object.assign(state.fresh(), { stageBest: 5000 }) as state.Save;

test("an Encore with Fever reports the bonus score but stars from timing alone", async () => {
  const h = harness(returning());
  try {
    h.mode("encore");
    assert.match(h.find("#stage-start").textContent, /encore/);
    assert.match(h.find("#stage-goal").textContent, /double arrows/);
    assert.equal(h.find("#stage-fever").hidden, false);
    h.start();
    assert.equal(h.show().mode, "encore");
    assert.ok(h.lanes.every((lane) => !lane.disabled));
    // Space before the meter is full does nothing.
    h.key(" ");
    h.frame();
    assert.equal(h.show().fevers, 0);
    assert.equal(h.find("#stage-fever").disabled, true);
    const arrows = ["ArrowLeft", "ArrowDown", "ArrowUp", "ArrowRight"];
    let ready = false;
    while (!h.show().ended) {
      for (const note of h.show().notes)
        if (note.tick === h.show().tick + 1) h.key(arrows[note.lane]);
      if (h.show().fever >= 1) {
        ready ||= h.find("#stage-fever").dataset.state === "ready";
        h.key(" ");
      }
      h.frame();
      if (h.show().feverTicks > 0 && !h.show().ended)
        assert.equal(h.root.dataset.fever, "true");
    }
    await nextTurn();
    const show = h.show();
    assert.ok(ready, "the button announced a full meter");
    assert.ok(show.fevers >= 2);
    assert.equal(show.counts.perfect, show.notes.length);
    assert.ok(h.sounds.includes("sparkle"));
    assert.equal(h.root.dataset.fever, undefined);
    assert.ok(show.score > show.baseScore);
    assert.deepEqual(JSON.parse(JSON.stringify(h.reports)), [
      { event: "perform", value: { score: Math.round(show.score), stars: 3 } },
    ]);
    assert.equal(show.baseScore, rules.stageMaxScore(7, "encore"));
    assert.match(h.find(".activity-status").textContent, /★★★ .* Fevers/);
    assert.equal(h.save.stageBest, Math.round(show.score));
  } finally {
    h.dispose();
  }
});

test("a Fever cannot buy stars: sloppy timing with every Fever lit still earns what the timing earns", async () => {
  const h = harness(returning());
  try {
    h.mode("show");
    h.start();
    const arrows = ["ArrowLeft", "ArrowDown", "ArrowUp", "ArrowRight"];
    // Every note pressed late enough to be only Good.
    while (!h.show().ended) {
      for (const note of h.show().notes)
        if (note.tick + rules.STAGE_GOOD === h.show().tick + 1)
          h.key(arrows[note.lane]);
      h.key(" ");
      h.frame();
    }
    await nextTurn();
    const show = h.show();
    assert.ok(show.fevers >= 1);
    const stars = rules.stageStars(show.baseScore, rules.stageMaxScore(7));
    assert.equal(stars, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(h.reports[0].value)), {
      score: Math.round(show.score),
      stars,
    });
  } finally {
    h.dispose();
  }
});

/** The report as plain data: the panel runs in another realm. */
const told = (party: { report: () => partyRules.PartyTick }) =>
  JSON.parse(JSON.stringify(party.report()));
function snapshot(
  status: partyRules.PartyStatus,
  fields: Partial<partyRules.PartySnapshot> = {},
  players: Partial<partyRules.PartyPlayer>[] = [{}, {}],
): partyRules.PartySnapshot {
  return {
    code: "BCDF",
    you: 0,
    host: 0,
    status,
    mode: "show",
    round: status === "waiting" ? 0 : 1,
    seed: 7,
    startAt: 5000,
    serverAt: 1000,
    players: players.map((player, slot) => ({
      slot,
      name: slot ? "Bo<b>" : "Ann",
      look: {} as partyRules.PartyPlayer["look"],
      online: true,
      playing: status !== "waiting",
      style: 0,
      score: 0,
      combo: 0,
      hype: 0.5,
      fever: false,
      hits: 0,
      lane: 0,
      done: false,
      booed: false,
      stars: 0,
      cheer: 0,
      cheerKind: 0,
      ...player,
    })),
    ...fields,
  };
}

test("a party show starts on the shared clock, reports this dancer's show and crowns a winner", async () => {
  const h = harness(returning());
  const party = h.party;
  try {
    assert.equal(h.find("#party-in").hidden, true);
    assert.equal(h.find("#party-out").hidden, false);
    h.find("#party-code").value = "abc";
    h.click("#party-join");
    assert.match(h.find("#party-status").textContent, /four letters/);
    h.find("#party-code").value = " bcdf ";
    h.click("#party-join");
    h.click("#party-host");
    assert.deepEqual(party.calls, [
      ["join", "BCDF"],
      ["host", "show"],
    ]);
    assert.deepEqual(told(party), { style: 0 });

    // A show being played alone is dropped, unreported, on entering a party.
    h.start();
    h.frame();
    const alone = h.show();
    assert.equal(h.root.dataset.playing, "true");
    assert.equal(h.find("#party-host").disabled, false);
    // Alone in the room: the host cannot start yet.
    party.push(snapshot("waiting", {}, [{}]));
    assert.equal(h.root.dataset.playing, "false");
    assert.equal(h.root.dataset.party, "true");
    assert.ok(h.lanes.every((lane) => lane.disabled));
    for (let i = 0; i < 5; i++) h.frame();
    assert.equal(alone.tick, 1, "the abandoned show no longer runs");
    assert.equal(h.find("#party-in").hidden, false);
    assert.equal(h.find("#party-out").hidden, true);
    assert.equal(
      h.find("#stage-start").hidden,
      true,
      "no solo show in a party",
    );
    assert.equal(h.find("#party-code-shown").textContent, "BCDF");
    assert.equal(h.find("#party-start").disabled, true);
    assert.match(h.find("#party-status").textContent, /two dancers/);
    party.push(snapshot("waiting"));
    assert.equal(h.find("#party-start").disabled, false);
    assert.equal(h.find("#party-start").hidden, false);
    assert.match(
      h.find("#party-list").innerHTML,
      /Ann \(you\) · host.*Bo&#60;b&#62;/,
      "names are escaped",
    );
    // Warm-up is not a party session; Encore is, and the host chooses.
    h.mode("warmup");
    assert.equal(h.find("#stage-mode").value, "show");
    h.mode("encore");
    h.click("#party-start");
    h.emit(h.cheers[2], "click");
    assert.deepEqual(party.calls.slice(2), [
      ["mode", "encore"],
      ["start"],
      ["cheer", 2],
    ]);

    // The server starts the round four seconds from now.
    party.clock = 1000;
    party.push(snapshot("running"));
    assert.equal(h.show().mode, "show");
    assert.equal(h.find("#stage-mode").value, "show");
    assert.equal(h.find("#stage-mode").disabled, true);
    assert.equal(h.find("#party-start").hidden, true);
    assert.equal(h.find("#stage-board").hidden, false);
    for (let i = 0; i < 30; i++) h.frame();
    assert.equal(h.show().tick, 0, "nobody starts early");
    assert.equal(h.find(".stage-call").textContent, "4");
    party.clock = 4100;
    h.frame();
    assert.equal(h.find(".stage-call").textContent, "1");
    assert.deepEqual(told(party), {
      style: 0,
      round: 1,
      score: 0,
      combo: 0,
      hype: 0.5,
      fever: false,
      hits: 0,
      lane: 0,
      done: false,
      booed: false,
      stars: 0,
    });
    party.clock = 5000;
    h.frame();
    assert.equal(h.find(".stage-call").textContent, "Dance!");
    assert.equal(h.show().tick, 1);
    // The same snapshot again does not restart the song.
    const playing = h.show();
    party.push(snapshot("running", {}, [{}, { score: 900, hits: 4, lane: 2 }]));
    assert.equal(h.show(), playing);
    assert.match(
      h.find("#stage-board").innerHTML,
      /Bo&#60;b&#62;<\/span><b>900/,
    );

    play(h);
    await nextTurn();
    const mine = party.report();
    assert.deepEqual(
      [mine.round, mine.done, mine.booed, mine.stars, mine.score, mine.hits],
      [1, true, false, 3, rules.stageMaxScore(7), h.show().notes.length],
    );
    assert.ok(party.calls.some(([name]) => name === "flush"));
    assert.equal(h.reports.length, 1, "the show still earns its own XP");
    assert.equal(h.find("#stage-start").hidden, true);

    party.push(
      snapshot("results", {}, [
        { score: mine.score, done: true, stars: 3 },
        { score: 900, done: true, stars: 0 },
      ]),
    );
    assert.match(h.find("#party-status").textContent, /You win/);
    assert.match(h.find("#stage-board").innerHTML, /🥇Ann.*🥈Bo/);
    assert.equal(h.find("#party-start").hidden, false);
    assert.match(h.find("#party-start").textContent, /again/);

    h.click("#party-leave");
    assert.equal(h.find("#party-in").hidden, true);
    assert.equal(h.find("#stage-start").hidden, false);
    assert.equal(h.find("#stage-board").hidden, true);
    assert.deepEqual(told(party), { style: 0 });
  } finally {
    h.dispose();
  }
});

test("a guest follows the host's session, watches a round in progress, and a lost party ends its show", () => {
  const h = harness(returning());
  const party = h.party;
  try {
    party.clock = 9000;
    party.push(snapshot("waiting", { you: 1, mode: "encore" }));
    assert.equal(h.find("#stage-mode").value, "encore");
    assert.equal(h.find("#stage-mode").disabled, true);
    assert.equal(h.find("#party-start").hidden, true);
    assert.match(h.find("#party-status").textContent, /Waiting for the host/);
    // Joined mid-round: no show of our own, but the scores are on screen.
    party.push(
      snapshot("running", { you: 1 }, [{ score: 300 }, { playing: false }]),
    );
    assert.match(h.find("#party-status").textContent, /next/);
    assert.equal(h.find("#stage-board").hidden, false);
    assert.equal(h.find("#stage-start").hidden, true);
    // The next round includes us.
    party.push(snapshot("running", { you: 1, round: 2, mode: "encore" }));
    assert.equal(h.show().mode, "encore");
    h.frame();
    assert.equal(h.show().ended, false);
    // The room goes away under us.
    party.snapshot = null;
    party.changed(null, "The party has ended.");
    assert.equal(h.find("#party-status").textContent, "The party has ended.");
    assert.equal(h.root.dataset.playing, "false");
    assert.ok(h.lanes.every((lane) => lane.disabled));
    assert.equal(h.find("#stage-start").hidden, false);
    assert.equal(h.find("#party-out").hidden, false);
    assert.equal(h.reports.length, 0);
    // Removing the panel leaves any party behind.
    party.push(snapshot("waiting"));
    h.dispose();
    assert.equal(party.snapshot, null);
    assert.deepEqual(party.calls.at(-1), ["leave"]);
  } finally {
    if (h.root.isConnected) h.dispose();
  }
});
