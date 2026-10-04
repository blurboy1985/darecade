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

test("every menu page makes exactly three short choices", () => {
  for (const page of Object.values(menuPages)) {
    assert.equal(page.actions.length, 3, page.title);
    for (const action of page.actions) {
      assert.ok(action.label.length <= 20, action.label);
      assert.ok(action.target && action.icon);
    }
    if (page.back) assert.ok(isMenuPage(page.back));
  }
  assert.ok(isMenuPage("phone-menu"));
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
    "shop",
    "quests",
    "album",
    "account",
    "settings",
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

test("world has only the three routes and one replacing nearby action", () => {
  const dock = source.match(/<nav class="dock lobby-dock"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(dock);
  assert.deepEqual(
    [...dock.matchAll(/data-open="([^"]+)"/g)].map((m) => m[1]),
    ["arcade", "map", "phone-menu"],
  );
  assert.match(dock, /id="interaction"[^>]*hidden/);
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
  assert.match(
    source,
    /firstRacePending\(\) &&[\s\S]*?"settings"[\s\S]*?"neighbours"/,
  );
  const invitation = source.match(/const invitation =[\s\S]*?;\n/)?.[0] || "";
  assert.match(invitation, /data-account>Account & privacy/);
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

test("first reward cannot grow a fourth action through share disclosure", () => {
  assert.match(
    source,
    /run &&[\s\S]*?shared\?\.competitionReady &&[\s\S]*?!reward/,
  );
});
