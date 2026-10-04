import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import {
  crops,
  cropReadyAt,
  fresh,
  plantCrop,
  tendCrop,
  type Save,
} from "../src/state.ts";
import {
  createWaterTrail,
  pipeDirections,
  traceWater,
  trailTiles,
  validWaterTrail,
} from "../shared/plot-trail.ts";

// Run the actual mountPlots implementation with the real state/trail functions.
// This synthetic element fixture exercises handlers, rendering, async work and
// lifecycle bookkeeping. It does not prove native keyboard, CSS, WebGL or mobile
// behavior. The simple-renderer branch deliberately never imports WebGL.
const source = readFileSync(
  new URL("../src/plots.ts", import.meta.url),
  "utf8",
);
const tree = ts.createSourceFile(
  "plots.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
const compiled = ts.transpileModule(
  tree.statements
    .filter((node) => !ts.isImportDeclaration(node))
    .map((node) => node.getText(tree).replace(/^export /, ""))
    .join("\n"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  },
).outputText;
const NOW = Date.parse("2026-10-04T12:00:00Z");
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
type FixtureEvent = { target: unknown };
type Listener = (event: FixtureEvent) => void;
type Report = (event: string, value: unknown, save: Save) => Promise<void>;

function harness(
  options: { save?: Partial<Save>; report?: Report; osReduced?: boolean } = {},
) {
  let focused: FixtureElement | null = null;
  let now = NOW;
  const renders: string[] = [];
  class FixtureElement {
    tagName: string;
    parent: FixtureElement | null = null;
    children: FixtureElement[] = [];
    attributes = new Map<string, string>();
    listeners = new Map<string, Set<Listener>>();
    dataset: Record<string, string> = {};
    className = "";
    id = "";
    disabled = false;
    open = false;
    tabIndex = 0;
    textContent = "";
    connectedRoot = false;
    html = "";
    constructor(tag: string) {
      this.tagName = tag.toLowerCase();
    }
    get isConnected(): boolean {
      return this.connectedRoot || !!this.parent?.isConnected;
    }
    get innerHTML() {
      return this.html;
    }
    set innerHTML(html: string) {
      this.html = html;
      if (this.className === "plot-view") renders.push(html);
      this.replaceChildren();
      const stack: FixtureElement[] = [this];
      for (const [token] of html.matchAll(/<[^>]+>/g)) {
        if (token.startsWith("</")) {
          stack.pop();
          continue;
        }
        const tag = token.match(/^<([a-z][\w-]*)\b/i)?.[1];
        if (!tag) continue;
        const node = new FixtureElement(tag);
        for (const attribute of token
          .slice(tag.length + 1, -1)
          .matchAll(/([\w-]+)(?:="([^"]*)")?/g))
          node.setAttribute(attribute[1], attribute[2] || "");
        const parent = stack.at(-1);
        assert.ok(parent, `Unbalanced generated HTML at ${token}`);
        parent.append(node);
        if (
          !token.endsWith("/>") &&
          !["img", "br", "input", "hr"].includes(tag)
        )
          stack.push(node);
      }
      assert.equal(stack.length, 1, "Generated HTML must be balanced");
    }
    setAttribute(name: string, value: string) {
      this.attributes.set(name, value);
      if (name === "id") this.id = value;
      if (name === "class") this.className = value;
      if (name === "disabled") this.disabled = true;
      if (name.startsWith("data-"))
        this.dataset[
          name
            .slice(5)
            .replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
        ] = value;
    }
    hasAttribute(name: string) {
      return this.attributes.has(name);
    }
    append(...nodes: FixtureElement[]) {
      for (const node of nodes) {
        node.remove();
        node.parent = this;
        this.children.push(node);
      }
    }
    replaceChildren(...nodes: FixtureElement[]) {
      for (const child of this.children) child.parent = null;
      this.children = [];
      this.append(...nodes);
    }
    remove() {
      if (this.parent)
        this.parent.children = this.parent.children.filter(
          (child) => child !== this,
        );
      this.parent = null;
    }
    matches(selector: string): boolean {
      if (selector.startsWith("#")) return this.id === selector.slice(1);
      if (selector.startsWith("."))
        return this.className.split(/\s+/).includes(selector.slice(1));
      const attribute = selector.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
      if (attribute)
        return (
          this.hasAttribute(attribute[1]) &&
          (attribute[2] === undefined ||
            this.attributes.get(attribute[1]) === attribute[2])
        );
      return this.tagName === selector;
    }
    querySelectorAll(selector: string): FixtureElement[] {
      const choices = selector.split(",").map((part) => part.trim());
      return this.children.flatMap((child) => [
        ...(choices.some((choice) => child.matches(choice)) ? [child] : []),
        ...child.querySelectorAll(selector),
      ]);
    }
    querySelector(selector: string) {
      return this.querySelectorAll(selector)[0] || null;
    }
    closest(selector: string): FixtureElement | null {
      return this.matches(selector)
        ? this
        : this.parent?.closest(selector) || null;
    }
    addEventListener(name: string, listener: Listener) {
      if (!this.listeners.has(name)) this.listeners.set(name, new Set());
      this.listeners.get(name)?.add(listener);
    }
    removeEventListener(name: string, listener: Listener) {
      this.listeners.get(name)?.delete(listener);
    }
    dispatch(name: string, target: unknown = this) {
      for (const listener of this.listeners.get(name) || [])
        listener({ target });
    }
    focus() {
      focused = this;
    }
  }
  const intervals = new Map<number, () => void>();
  let nextInterval = 1;
  const observers: FixtureObserver[] = [];
  class FixtureObserver {
    callback: () => void;
    target: FixtureElement | null = null;
    observedOptions: unknown;
    constructor(callback: () => void) {
      this.callback = callback;
      observers.push(this);
    }
    observe(target: FixtureElement, options: unknown) {
      this.target = target;
      this.observedOptions = options;
    }
    disconnect() {
      this.target = null;
    }
  }
  const dialog = new FixtureElement("dialog");
  dialog.connectedRoot = true;
  dialog.open = true;
  const host = new FixtureElement("div");
  dialog.append(host);
  const save = { ...fresh(), ...options.save };
  const reports: { event: string; value: unknown }[] = [];
  const sounds: string[] = [];
  const context = vm.createContext({
    crops,
    cropReadyAt,
    createWaterTrail,
    pipeDirections,
    traceWater,
    trailTiles,
    Element: FixtureElement,
    MutationObserver: FixtureObserver,
    matchMedia:
      options.osReduced === undefined
        ? undefined
        : (query: string) => {
            assert.equal(query, "(prefers-reduced-motion: reduce)");
            return { matches: options.osReduced };
          },
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    document: {
      createElement: (tag: string) => new FixtureElement(tag),
      get activeElement() {
        return focused;
      },
    },
    window: {
      setInterval: (callback: () => void) => {
        const id = nextInterval++;
        intervals.set(id, callback);
        return id;
      },
    },
    clearInterval: (id: number) => intervals.delete(id),
    host,
    ctx: {
      save,
      simple: true,
      sound: (name: string) => sounds.push(name),
      report: (event: string, value: unknown) => {
        reports.push({ event, value: structuredClone(value) });
        return options.report?.(event, value, save) || Promise.resolve();
      },
    },
  });
  vm.runInContext(`${compiled}\nmountPlots(host, ctx);`, context);
  const root = host.children[0];
  assert.ok(root);
  const view = root.querySelector(".plot-view");
  const status = root.querySelector(".activity-status");
  assert.ok(view);
  assert.ok(status);
  const get = (selector: string) => {
    const node = view.querySelector(selector);
    assert.ok(node, `Missing rendered control: ${selector}`);
    return node;
  };
  return {
    save,
    reports,
    sounds,
    root,
    view,
    status,
    renders,
    dialog,
    host,
    intervals,
    observers,
    get,
    focused: () => focused,
    // Dispatch even for disabled/stale targets, to test the handler's own guard.
    click: (target: string | FixtureElement) =>
      root.dispatch("click", typeof target === "string" ? get(target) : target),
    tick: (advance = 1000) => {
      now += advance;
      for (const callback of [...intervals.values()]) callback();
    },
    removePanel: () => {
      host.replaceChildren();
      // Deliver the observed host child-list mutation, as a browser would.
      for (const observer of observers)
        if (observer.target === host) observer.callback();
    },
    close: () => {
      dialog.open = false;
      dialog.dispatch("close");
    },
  };
}
type Harness = ReturnType<typeof harness>;

function deferred() {
  const controls = Promise.withResolvers<void>();
  return { ...controls, report: () => controls.promise };
}
function planted(crop = "chilli", extra: Partial<Save> = {}) {
  return { plotCrop: crop, plotPlanted: NOW, ...extra };
}
function solution(crop: string, time: number, variation = 0) {
  const trail = createWaterTrail(crop, time, variation);
  const choices = Array.from({ length: 64 }, (_, n) => [
    n % 4,
    Math.floor(n / 4) % 4,
    Math.floor(n / 16),
  ]);
  choices.sort(
    (a, b) =>
      a.reduce((sum, turn) => sum + turn, 0) -
      b.reduce((sum, turn) => sum + turn, 0),
  );
  const turns = choices.find(
    (turns) => traceWater(trailTiles(trail, turns)).complete,
  );
  assert.ok(turns, "The trail must be solvable");
  return turns;
}
function solve(
  h: Harness,
  crop = h.save.plotCrop,
  time = h.save.plotPlanted,
  variation = 0,
) {
  const turns = solution(crop, time, variation);
  turns.forEach((count, gate) => {
    for (let n = 0; n < count; n++) h.click(`#pipe-${gate}`);
  });
  return { crop, planted: time, turns };
}
function checkActions(h: Harness) {
  for (const html of h.renders) {
    const choices = [...html.matchAll(/<button\b[^>]*>/g)].filter(
      ([button]) => !button.includes("data-plot-back"),
    );
    assert.ok(
      choices.length <= 3,
      `${choices.length} primary choices in ${html}`,
    );
  }
}
function checkCleaned(h: Harness) {
  assert.equal(h.intervals.size, 0, "The refresh interval must be cleared");
  assert.ok(
    h.observers.every((observer) => observer.target === null),
    "The removal observer must disconnect",
  );
  assert.equal(
    h.dialog.listeners.get("close")?.size,
    0,
    "The dialog-close listener must be removed",
  );
}
function checkUnconfirmedSave(h: Harness) {
  assert.match(h.status.textContent, /^No save confirmation yet\./);
  assert.match(h.status.textContent, /Try again/);
  assert.match(h.status.textContent, /reload the page/);
  assert.doesNotMatch(
    h.status.textContent,
    /wasn't saved|couldn't save|reopen/i,
  );
}

test("rapid planting across seed buttons submits only one write until it settles", async () => {
  const pending = deferred();
  const h = harness({ report: pending.report });
  const staleOtherSeed = h.get('[data-seed="pandan"]');
  h.click('[data-seed="chilli"]');
  h.click('[data-seed="sunflower"]');
  h.click(staleOtherSeed);
  assert.deepEqual(h.reports, [{ event: "plant", value: "chilli" }]);
  assert.ok(
    h.view.querySelectorAll("button").every((button) => button.disabled),
  );
  assert.equal(h.status.textContent, "Saving your plot…");
  plantCrop(h.save, "chilli", NOW);
  pending.resolve();
  await flush();
  assert.equal(h.get("#plot-tend").disabled, false);
  assert.deepEqual(h.sounds, ["coin"]);
  assert.equal(h.focused()?.tagName, "h2");
  checkActions(h);
  h.close();
});

for (const failure of [
  "promise rejection",
  "synchronous throw",
  "unchanged server response",
]) {
  test(`${failure} re-enables planting and allows a successful retry`, async () => {
    let attempt = 0;
    const h = harness({
      report: (event, value, save) => {
        attempt++;
        if (attempt === 1) {
          if (failure === "synchronous throw") throw new Error("offline");
          return failure === "promise rejection"
            ? Promise.reject(new Error("offline"))
            : Promise.resolve();
        }
        assert.equal(event, "plant");
        plantCrop(save, value, NOW);
        return Promise.resolve();
      },
    });
    h.click('[data-seed="pandan"]');
    await flush();
    checkUnconfirmedSave(h);
    assert.equal(h.get('[data-seed="pandan"]').disabled, false);
    assert.deepEqual(h.sounds, []);
    h.click('[data-seed="pandan"]');
    await flush();
    assert.equal(h.reports.length, 2);
    assert.equal(h.save.plotCrop, "pandan");
    assert.ok(h.view.querySelector("#plot-tend"));
    assert.deepEqual(h.sounds, ["coin"]);
    checkActions(h);
    h.close();
  });
}

for (const exit of ["panel replacement", "dialog close"]) {
  for (const settle of ["resolve", "reject"]) {
    test(`${settle} after ${exit} does not render, focus, or play a sound`, async () => {
      const pending = deferred();
      const h = harness({ report: pending.report });
      h.click('[data-seed="chilli"]');
      const renderCount = h.renders.length;
      const oldStatus = h.status.textContent;
      const oldFocus = h.focused();
      if (exit === "panel replacement") h.removePanel();
      else h.close();
      checkCleaned(h);
      if (settle === "resolve") {
        plantCrop(h.save, "chilli", NOW);
        pending.resolve();
      } else pending.reject(new Error("offline"));
      await flush();
      assert.equal(h.renders.length, renderCount);
      assert.equal(h.status.textContent, oldStatus);
      assert.equal(h.focused(), oldFocus);
      assert.deepEqual(h.sounds, []);
      checkCleaned(h);
    });
  }
}

for (const crop of crops) {
  test(`${crop.id} completion submits exactly one valid tend payload`, async () => {
    const pending = deferred();
    const h = harness({ save: planted(crop.id), report: pending.report });
    h.click("#plot-tend");
    assert.equal(h.view.querySelectorAll("[data-pipe]").length, 3);
    assert.equal(h.focused(), h.get("[data-pipe]"));
    assert.equal(h.reports.length, 0, "Opening a trail is local");
    const staleGate = h.get("#pipe-0");
    const expected = solve(h);
    assert.deepEqual(h.reports, [{ event: "tend", value: expected }]);
    assert.equal(validWaterTrail(crop.id, NOW, h.reports[0].value), true);
    h.click(staleGate);
    h.click("[data-plot-back]");
    assert.equal(
      h.reports.length,
      1,
      "Stale gate or Back cannot submit while pending",
    );
    assert.match(h.view.innerHTML, /Water trail/);
    assert.equal(h.view.querySelector("#plot-retry"), null);
    assert.equal(tendCrop(h.save, expected, NOW), true);
    pending.resolve();
    await flush();
    assert.equal(h.save.plotWatered, true);
    assert.equal(h.sounds.filter((sound) => sound === "plot-bloom").length, 1);
    assert.ok(h.view.querySelector("#plot-again"));
    assert.equal(h.view.querySelector("#plot-retry"), null);
    assert.match(h.status.textContent, /Water reached every root/);
    assert.equal(h.focused()?.tagName, "h2");
    checkActions(h);
    h.close();
  });
}

test("failed watering preserves the solved trail and retries the identical payload", async () => {
  let attempts = 0;
  const h = harness({
    save: planted("sunflower"),
    report: (event, value, save) => {
      assert.equal(event, "tend");
      if (++attempts === 1) return Promise.reject(new Error("offline"));
      assert.equal(tendCrop(save, value, NOW), true);
      return Promise.resolve();
    },
  });
  h.click("#plot-tend");
  const expected = solve(h);
  await flush();
  assert.equal(h.save.plotWatered, false);
  checkUnconfirmedSave(h);
  assert.match(h.status.textContent, /Your trail is still here/);
  assert.match(h.view.innerHTML, /Every channel is flowing!/);
  assert.equal(h.view.querySelectorAll("[data-pipe]").length, 0);
  assert.equal(h.get("#plot-retry").disabled, false);
  h.click("#plot-retry");
  await flush();
  assert.deepEqual(h.reports, [
    { event: "tend", value: expected },
    { event: "tend", value: expected },
  ]);
  assert.equal(h.save.plotWatered, true);
  assert.equal(h.sounds.filter((sound) => sound === "plot-bloom").length, 1);
  checkActions(h);
  h.close();
});

for (const response of ["rejected", "unchanged"]) {
  test(`${response} response after a server commit stays uncertain until refreshed state is mounted`, async () => {
    // Keep authoritative and local saves separate: the write can have succeeded
    // even if its response is lost. Remounting below represents receiving that
    // authoritative snapshot after a page reload, not an actual browser reload.
    const serverSave = { ...fresh(), ...planted("pandan") };
    const h = harness({
      save: structuredClone(serverSave),
      report: (event, value) => {
        assert.equal(event, "tend");
        tendCrop(serverSave, value, NOW);
        return response === "rejected"
          ? Promise.reject(new Error("response lost"))
          : Promise.resolve();
      },
    });
    h.click("#plot-tend");
    solve(h);
    await flush();
    assert.equal(serverSave.plotWatered, true);
    assert.equal(h.save.plotWatered, false);
    checkUnconfirmedSave(h);
    assert.equal(h.sounds.includes("plot-bloom"), false);
    assert.ok(h.view.querySelector("#plot-retry"));
    h.click("#plot-retry");
    await flush();
    assert.equal(h.reports.length, 2);
    checkUnconfirmedSave(h);
    assert.equal(h.sounds.includes("plot-bloom"), false);
    h.close();

    const refreshed = harness({ save: structuredClone(serverSave) });
    assert.match(refreshed.view.innerHTML, /HAPPILY WATERED/);
    assert.equal(refreshed.view.querySelector("#plot-tend"), null);
    assert.ok(refreshed.view.querySelector("#plot-practice"));
    assert.deepEqual(refreshed.reports, []);
    checkActions(h);
    checkActions(refreshed);
    refreshed.close();
  });
}

test("the plot respects reduced motion from either the saved preference or the OS", () => {
  for (const [saved, osReduced, expected] of [
    [false, true, true],
    [true, false, true],
    [false, false, false],
  ]) {
    const h = harness({ save: { reduced: saved }, osReduced });
    assert.equal(
      h.root.className.split(" ").includes("plot-reduced"),
      expected,
    );
    h.close();
  }
});

for (const crop of crops) {
  test(`${crop.id} practice, completion and another trail never persist or grant rewards`, () => {
    const h = harness({
      save: planted(crop.id, { plotWatered: true, xp: 100, harvests: 7 }),
    });
    const before = structuredClone(h.save);
    h.click("#plot-practice");
    assert.match(h.view.innerHTML, /JUST FOR FUN · NO EXTRA REWARDS/);
    solve(h, crop.id, NOW, 1);
    assert.equal(h.focused(), h.get("#plot-again"));
    assert.match(h.status.textContent, /whole patch has water/);
    h.click("#plot-again");
    assert.equal(h.view.querySelectorAll("[data-pipe]").length, 3);
    solve(h, crop.id, NOW, 2);
    assert.deepEqual(h.reports, []);
    assert.deepEqual(h.save, before);
    assert.equal(h.sounds.filter((sound) => sound === "plot-bloom").length, 2);
    h.click("[data-plot-back]");
    assert.equal(h.focused(), h.get("#plot-practice"));
    checkActions(h);
    h.close();
  });
}

test("each gate restores focus after a turn; refresh ticks do not replace the active trail", () => {
  for (let gate = 0; gate < 3; gate++) {
    const h = harness({ save: planted() });
    h.click("#plot-tend");
    const original = h.get(`#pipe-${gate}`);
    h.click(original);
    const replacement = h.get(`#pipe-${gate}`);
    assert.notEqual(replacement, original, "Turning redraws the actual trail");
    assert.equal(
      h.focused(),
      replacement,
      `Pipe ${gate + 1} must retain focus`,
    );
    const count = h.renders.length;
    h.tick(2 * 3_600_000);
    assert.equal(
      h.renders.length,
      count,
      "A growing/ready tick cannot interrupt a trail",
    );
    assert.equal(h.focused(), replacement);
    h.click("[data-plot-back]");
    assert.ok(h.view.querySelector("#plot-harvest"));
    checkActions(h);
    h.close();
  }
});

test("Back restores watering focus and countdown updates preserve the current control", () => {
  const h = harness({ save: planted() });
  h.click("#plot-tend");
  h.click("[data-plot-back]");
  const tend = h.get("#plot-tend");
  assert.equal(h.focused(), tend);
  const count = h.renders.length;
  h.tick(60_000);
  assert.equal(h.renders.length, count);
  assert.equal(h.focused(), tend);
  assert.match(h.get("#plot-left").textContent, /Ready in 59 min/);
  h.tick(3_600_000);
  assert.ok(h.view.querySelector("#plot-harvest"));
  assert.ok(h.view.querySelector("#plot-practice"));
  assert.equal(h.view.querySelector("#plot-tend"), null);
  assert.match(h.status.textContent, /ready to pick/);
  checkActions(h);
  h.close();
});

test("replacement observer and close event clean up immediately; interval is a fallback", () => {
  for (const exit of ["remove", "close", "disconnected tick", "closed tick"]) {
    const h = harness({ save: planted() });
    assert.equal(h.intervals.size, 1);
    assert.equal(h.observers.length, 1);
    assert.equal(h.observers[0].target, h.host);
    assert.deepEqual(structuredClone(h.observers[0].observedOptions), {
      childList: true,
    });
    const count = h.renders.length;
    if (exit === "remove") h.removePanel();
    else if (exit === "close") h.close();
    else if (exit === "disconnected tick") {
      h.host.replaceChildren();
      h.tick();
    } else {
      h.dialog.open = false;
      h.tick();
    }
    checkCleaned(h);
    h.tick();
    h.close();
    assert.equal(h.renders.length, count);
    checkCleaned(h);
  }
});
