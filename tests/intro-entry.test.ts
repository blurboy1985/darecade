import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";

// Exercise the real entry handlers without a browser, film renderer or audio.
// This checks the boot handoff; visual and real-device QA remain separate.
const source = readFileSync(new URL("../src/intro.ts", import.meta.url), "utf8")
  .replace(/^import .*;\r?\n/gm, "")
  .replace("export function playIntro", "function playIntro");

function harness() {
  const elements = new Map<string, any>();
  const classes = new Set<string>();
  let focused = "";
  let audioStarts = 0;
  let audioStops = 0;
  let seenWrites = 0;
  let removed = false;
  const element = (selector: string) => {
    if (!elements.has(selector)) elements.set(selector, {
      hidden: true, textContent: "", width: 0, height: 0,
      handlers: new Map<string, () => void>(),
      addEventListener(name: string, fn: () => void) { this.handlers.set(name, fn); },
      focus() { focused = selector; },
      getContext() { return {}; },
    });
    return elements.get(selector);
  };
  const root = {
    innerHTML: "", className: "", clientWidth: 0, clientHeight: 0,
    setAttribute() {},
    classList: { add(name: string) { classes.add(name); } },
    querySelector: element,
    remove() { removed = true; },
  };
  const keys = new Map<string, (event: { key: string }) => void>();
  const start = new Function(
    "document", "window", "localStorage", "performance", "requestAnimationFrame",
    "cancelAnimationFrame", "setTimeout", "startScore", "drawFilm", "captionAt", "DURATION", "SEEN_KEY",
    stripTypeScriptTypes(source) + "\nreturn playIntro();",
  );
  const done = start(
    { createElement: () => root, body: { append() {} } },
    { addEventListener: (name: string, fn: any) => keys.set(name, fn),
      removeEventListener: (name: string) => keys.delete(name) },
    { getItem: () => null, setItem() { seenWrites++; } },
    { now: () => 100 }, () => 1, () => {}, (fn: () => void) => fn(),
    () => { audioStarts++; return { stop() { audioStops++; } }; },
    () => {}, () => null, 40, "seen",
  ) as Promise<{ close(): void }>;
  return {
    done, root, classes,
    click: (selector: string) => element(selector).handlers.get("click")?.(),
    escape: () => keys.get("keydown")?.({ key: "Escape" }),
    state: () => ({ focused, audioStarts, audioStops, seenWrites, removed }),
  };
}

test("Play now hands off without starting the film or audio", async () => {
  const h = harness();
  assert.equal(h.state().focused, ".intro-enter");
  assert.match(h.root.innerHTML, />Play now</);
  assert.match(h.root.innerHTML, /Watch intro · 40 seconds/);
  h.click(".intro-enter");
  const film = await h.done;
  assert.equal(h.state().audioStarts, 0);
  assert.equal(h.state().seenWrites, 1);
  assert.ok(h.classes.has("intro-done"));
  film.close();
  assert.equal(h.state().removed, true);
});

test("watch remains optional, starts once and Skip stops its sound", async () => {
  const h = harness();
  h.click(".intro-play");
  h.click(".intro-play");
  assert.equal(h.state().audioStarts, 1);
  assert.equal(h.state().focused, ".intro-skip");
  h.click(".intro-skip");
  await h.done;
  h.click(".intro-enter");
  h.click(".intro-play");
  assert.equal(h.state().audioStarts, 1);
  assert.equal(h.state().audioStops, 1);
  assert.equal(h.state().seenWrites, 1);
});

test("Escape also reaches the game from the entry card", async () => {
  const h = harness();
  h.escape();
  await h.done;
  assert.equal(h.state().audioStarts, 0);
  assert.equal(h.state().seenWrites, 1);
});
