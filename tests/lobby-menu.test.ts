import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  menuPages,
  isMenuPage,
  firstVisitCopy,
  pageChoices,
} from "../src/lobby-menu.ts";

const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");

test("Menu exposes every destination directly without duplicate category screens", () => {
  assert.deepEqual(Object.keys(menuPages), ["phone-menu"]);
  const actions = menuPages["phone-menu"].actions;
  assert.equal(
    new Set(actions.map((action) => action.target)).size,
    actions.length,
  );
  assert.ok(
    actions.every(
      (action) => action.label && action.group && !isMenuPage(action.target),
    ),
  );
  assert.equal(isMenuPage("toString"), false);
  assert.equal(isMenuPage("__proto__"), false);
});

test("menu routes preserve rewards, social play and account access", () => {
  const seen = new Set<string>();
  function visit(id: string) {
    if (seen.has(id)) return;
    seen.add(id);
    if (isMenuPage(id))
      for (const action of menuPages[id].actions) visit(action.target);
  }
  visit("phone-menu");
  for (const destination of [
    "wardrobe",
    "support",
    "shop",
    "quests",
    "album",
    "account",
    "preferences",
    "controls",
    "invite",
    "away",
    "neighbours",
    "dares",
    "board",
    "worlds",
    "emotes",
  ]) {
    assert.ok(seen.has(destination), destination);
  }
});

test("first-visit prompt is short and names the game it starts", () => {
  assert.ok(firstVisitCopy.detail.split(/\s+/).length <= 15);
  assert.match(firstVisitCopy.detail, /Palm Bay/);
  assert.match(source, /a === "welcome-start"[\s\S]*?startGame\("coast"\)/);
});

test("world keeps three stable routes and a separate nearby action", () => {
  const dock = source.match(/<nav class="dock lobby-dock"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(dock);
  assert.deepEqual(
    [...dock.matchAll(/data-open="([^"]+)"/g)].map((m) => m[1]),
    ["arcade", "map", "phone-menu"],
  );
  assert.doesNotMatch(dock, /id="interaction"/);
  assert.match(source, /id="interaction" class="nearby-prompt"[^>]*hidden/);
  for (const removed of [
    "phone-next",
    "gift-teaser",
    "quest-card",
    "neighbour-tools",
    "world-controls",
  ]) {
    assert.ok(!source.includes(`class="${removed}"`), removed);
  }
});

test("first visit and 2D retain privacy and player reporting routes", () => {
  assert.match(source, /data-open="phone-menu"/);
  assert.ok(
    menuPages["phone-menu"].actions.some(
      (action) => action.target === "neighbours",
    ),
  );
  assert.ok(
    menuPages["phone-menu"].actions.some(
      (action) => action.target === "account",
    ),
  );
  const invitation =
    source.match(/const invitation =[\s\S]*?;\r?\n/)?.[0] || "";
  assert.match(invitation, /data-action="welcome-skip"/);
  const playerPanel = source.slice(
    source.indexOf("function showPlayer("),
    source.indexOf(
      "void syncSocial();",
      source.indexOf("function showPlayer("),
    ),
  );
  assert.match(playerPanel, /if \(is2d\)[\s\S]*?data-report/);
});

test("closing setup prevents a delayed name save from reopening email", () => {
  const setup = source.slice(
    source.indexOf('if (a === "setup-save")'),
    source.indexOf('if (a === "welcome-wear")'),
  );
  assert.match(setup, /const generation = gameGeneration/);
  assert.match(setup, /generation !== gameGeneration \|\| !modal.open/);
});

test("choice pages never expose more than three and never lose an item", () => {
  for (const length of [0, 1, 3, 4, 5, 10, 30]) {
    const items = Array.from({ length }, (_, i) => i);
    const first = pageChoices(items, 0);
    const visited: number[] = [];
    for (let page = 0; page < first.total; page++) {
      const shown = pageChoices(items, page);
      assert.ok(shown.items.length <= 3);
      visited.push(...shown.items);
    }
    assert.deepEqual(visited, items);
    assert.equal(pageChoices(items, -1).page, 0);
    assert.equal(pageChoices(items, NaN).page, 0);
    assert.equal(pageChoices(items, 100).page, first.total - 1);
  }
});

test("manual challenge posting is absent from the interface", () => {
  assert.doesNotMatch(source, /data-post-dare|Post a challenge|dares-post/);
});
