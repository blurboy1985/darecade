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
  type Input,
} from "../shared/simulation.ts";

// Run the real race animation callback against the real shared physics. Only
// DOM, graphics/audio and the scheduling boundary are replaced in this test.
const source = readFileSync(
  new URL("../src/racing-game.ts", import.meta.url),
  "utf8",
);
const tree = ts.createSourceFile(
  "racing-game.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
const racing = tree.statements.find(ts.isClassDeclaration)!;
const loop = racing.members.find(
  (node) =>
    ts.isPropertyDeclaration(node) && node.name.getText(tree) === "loop",
);
assert.ok(loop && ts.isPropertyDeclaration(loop) && loop.initializer);
const compiled = ts.transpileModule(
  `function makeLoop() { return ${loop.initializer.getText(tree)}; }`,
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
function harness(input: Input) {
  const sim = new Simulation("coast", 7);
  const elements = new Map<
    string,
    {
      textContent: string;
      parentElement: { classList: { toggle: () => void } };
    }
  >();
  const context = vm.createContext({
    requestAnimationFrame: () => 1,
    setTimeout: () => 1,
    RACE_TICKS: 7200,
    OUTRO_SECONDS: 9,
    ordinal: (n: number) => String(n),
    raceTime: (n: number) => String(n),
    ITEM_NAMES: {},
    SHELLS: 36,
    audio: { engineOff() {}, engine() {} },
  });
  vm.runInContext(compiled, context);
  const h = {
    sim,
    loop() {},
    last: 1000,
    status: "racing",
    countdown: 3,
    paused: false,
    disposed: false,
    accumulator: 0,
    previous: "",
    events: [] as Replay["events"],
    controls: () => input,
    motion: { capture() {} },
    cue() {},
    notice: { textContent: "" },
    host: { insertAdjacentHTML() {} },
    stats: { dataset: {} },
    timer: { textContent: "" },
    lap: { textContent: "" },
    speed: { textContent: "" },
    meter: { value: 0 },
    shells: { textContent: "" },
    container: {
      querySelector: (id: string) => {
        if (!elements.has(id))
          elements.set(id, {
            textContent: "",
            parentElement: { classList: { toggle() {} } },
          });
        return elements.get(id)!;
      },
    },
    sound() {},
    drawMap() {},
    end() {
      h.status = "finished";
    },
  };
  const callback = context.makeLoop.call(h);
  return {
    sim,
    h,
    frame: (now: number) => callback(now),
    replay: () => ({
      version: rulesVersion("coast"),
      ticks: sim.ticks,
      events: h.events,
    }),
  };
}
test("a long frame crossing GO advances only the active part of that frame immediately", () => {
  const h = harness([0, 1, 0, 0, -1, -1]);
  h.h.status = "countdown";
  h.frame(5000);
  assert.equal(h.h.status, "racing");
  assert.ok(Math.abs(h.sim.ticks - 60) <= 1);
  assert.ok(h.sim.race!.speed > 0, "the GO frame already drives");
});
for (const fps of [144, 60, 30, 6, 2]) {
  test(`race clock/physics retain ten active seconds at ${fps} FPS`, () => {
    const h = harness([0, 1, 0, 0, -1, -1]);
    for (let frame = 1; frame <= fps * 10; frame++)
      h.frame(1000 + (frame * 1000) / fps);
    assert.ok(Math.abs(h.sim.ticks - 600) <= 1, String(h.sim.ticks));
    const reference = new Simulation("coast", 7);
    for (let tick = 0; tick < h.sim.ticks; tick++)
      reference.advance([0, 1, 0, 0, -1, -1]);
    assert.deepEqual(h.sim.race!.result(), reference.race!.result());
    assert.ok(
      h.sim.race!.distance > 0,
      "throttle drives at every rendering cadence",
    );
  });
}
test("race clock runs without throttle and ends at the existing 120s limit with a valid replay", () => {
  const h = harness([0, 0, 0, 0, -1, -1]);
  for (let frame = 1; frame <= 721; frame++) h.frame(1000 + (frame * 1000) / 6);
  assert.equal(h.sim.ticks, 7200);
  assert.equal(h.sim.ended, true);
  assert.equal(h.h.status, "finished");
  assert.equal(replayRun("coast", 7, h.replay()).score, h.sim.score);
});
test("a paused/background interval does not advance the race or catch up after resuming", () => {
  const h = harness([0, 1, 0, 0, -1, -1]);
  h.frame(2000);
  const before = h.sim.ticks;
  h.h.paused = true;
  h.frame(62000);
  assert.equal(h.sim.ticks, before);
  // Resume resets the last-frame timestamp, including when background RAF was suspended.
  h.h.last = 62000;
  h.h.paused = false;
  h.frame(63000);
  assert.ok(Math.abs(h.sim.ticks - before - 60) <= 1);
});

test("Noodle wall-hit stops at 20 and subsequent advances cannot run its timer", () => {
  const sim = new Simulation("noodle", 7);
  const input: Input = [0, 0, 1, 0, -1, -1];
  while (!sim.ended) sim.advance(input);
  assert.equal(sim.score, 20);
  assert.equal(sim.endReason, "wall");
  const ticks = sim.ticks;
  for (let i = 0; i < 3600; i++) sim.advance(input);
  assert.equal(sim.ticks, ticks);
  assert.equal(sim.elapsed, ticks / 60);
});

const connectionSource = readFileSync(
  new URL("../src/world-connection.ts", import.meta.url),
  "utf8",
);
const connectionCompiled = ts.transpileModule(
  connectionSource
    .replace(/^import .*;\n/gm, "")
    .replace("export class", "class") + "\nthis.Connection = WorldConnection;",
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;
test("HTTP assigns a world while sockets hang; stale bootstrap cannot replace a refreshed session", async () => {
  const requests: ((packet: object) => void)[] = [];
  const worlds: string[] = [];
  const statuses: string[] = [];
  const context = vm.createContext({
    crypto: {
      randomUUID: (() => {
        let id = 0;
        return () => `connection-${++id}`;
      })(),
    },
    api: () => new Promise((resolve) => requests.push(resolve)),
    location: { href: "http://127.0.0.1:4185" },
    URL,
    WebSocket: class {
      close() {}
    },
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    activityIds: [],
  });
  vm.runInContext(connectionCompiled, context);
  const c = new context.Connection(
    () => ({}),
    () => {},
    (w: string) => worlds.push(w),
    (s: string) => statuses.push(s),
  );
  c.start();
  assert.equal(
    requests.length,
    1,
    "HTTP begins without waiting for WebSockets",
  );
  c.refreshSession();
  requests[0]({ t: "sync", world: "world-1", p: [], d: [], gone: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(worlds, [], "old session response ignored");
  requests[1]({ t: "sync", world: "world-2", p: [], d: [], gone: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(worlds, ["world-2"]);
  assert.equal(statuses.at(-1), "connected");
  c.stop(false);
});

for (const outcome of ["success", "failure"]) {
  test(`WebSocket takeover ignores older HTTP ${outcome}`, async () => {
    const requests: {
      resolve: (value: object) => void;
      reject: (reason: Error) => void;
    }[] = [];
    const updates: string[][] = [];
    const statuses: string[] = [];
    const sockets: Socket[] = [];
    class Socket {
      onmessage: ((event: { data: string }) => void) | null = null;
      constructor() {
        sockets.push(this);
      }
      close() {}
    }
    const context = vm.createContext({
      crypto: { randomUUID: () => "same-session" },
      api: () =>
        new Promise((resolve, reject) => requests.push({ resolve, reject })),
      location: { href: "http://127.0.0.1:4185" },
      URL,
      WebSocket: Socket,
      setTimeout: () => 1,
      clearTimeout() {},
      setInterval: () => 1,
      clearInterval() {},
      activityIds: [],
    });
    vm.runInContext(connectionCompiled, context);
    const c = new context.Connection(
      () => ({}),
      (players: { id: string }[]) =>
        updates.push(Array.from(players, (p) => p.id)),
      () => {},
      (status: string) => statuses.push(status),
    );
    c.start();
    requests[0].resolve({
      t: "sync",
      world: "world-1",
      p: [],
      d: [],
      gone: [],
    });
    await new Promise((resolve) => setImmediate(resolve));
    const pending = c.poll();
    assert.equal(requests.length, 2);
    sockets[0].onmessage!({
      data: JSON.stringify({
        t: "sync",
        world: "world-1",
        p: [[1, "new-player", "New", {}]],
        d: [],
        gone: [],
      }),
    });
    if (outcome === "success")
      requests[1].resolve({
        t: "sync",
        world: "world-1",
        p: [[2, "old-player", "Old", {}]],
        d: [],
        gone: [],
      });
    else requests[1].reject(new Error("Old HTTP request failed"));
    await pending;
    assert.deepEqual(updates.at(-1), ["new-player"]);
    assert.equal(statuses.at(-1), "connected");
    c.stop(false);
  });
}
test("stop/start with the same session ignores an older bootstrap and opens only one socket", async () => {
  const requests: ((value: object) => void)[] = [];
  const worlds: string[] = [];
  let sockets = 0;
  const context = vm.createContext({
    crypto: { randomUUID: () => "same-session" },
    api: () => new Promise((resolve) => requests.push(resolve)),
    location: { href: "http://127.0.0.1:4185" },
    URL,
    WebSocket: class {
      constructor() {
        sockets++;
      }
      close() {}
    },
    setTimeout: () => 1,
    clearTimeout() {},
    setInterval: () => 1,
    clearInterval() {},
    activityIds: [],
  });
  vm.runInContext(connectionCompiled, context);
  const c = new context.Connection(
    () => ({}),
    () => {},
    (world: string) => worlds.push(world),
  );
  c.start();
  c.stop(false);
  c.start();
  requests[0]({ t: "sync", world: "world-1", p: [], d: [], gone: [] });
  requests[1]({ t: "sync", world: "world-2", p: [], d: [], gone: [] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(worlds, ["world-2"]);
  assert.equal(sockets, 1);
  c.stop(false);
});
