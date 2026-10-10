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

test("Menu has the three permanent routes, with session and legal actions rendered separately", () => {
  assert.deepEqual(
    menuPages["phone-menu"].actions.map((a) => a.label),
    ["Quests & rankings", "Sound & display", "Neighbourhood"],
  );
  assert.ok(isMenuPage("phone-menu"));
  assert.equal(isMenuPage("toString"), false);
  assert.match(source, /Save with email/);
  assert.match(source, /Log out/);
  assert.match(source, /data-open="privacy"/);
  assert.match(source, /data-open="help"/);
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
    ["arcade", "wardrobe", "phone-menu"],
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

test("nearby action prompt stays large at every screen size", () => {
  const css = (name: string) =>
    readFileSync(new URL(`../src/${name}`, import.meta.url), "utf8");
  const rule = (sheet: string, selector: string) =>
    sheet.match(
      new RegExp(`(?:^|\\n)${selector.replace(/[.#]/g, "\\$&")} \\{([^}]*)\\}`),
    )?.[1] || "";
  const prompt = rule(css("lobby-ui.css"), ".nearby-prompt");
  assert.ok(Number(prompt.match(/min-height: (\d+)px/)?.[1]) >= 64);
  assert.ok(Number(prompt.match(/700 (\d+)px/)?.[1]) >= 18);
  const key = rule(css("lobby-ui.css"), ".nearby-prompt kbd");
  assert.ok(Number(key.match(/height: (\d+)px/)?.[1]) >= 36);
  // The HUD sheet loads last; it may place the prompt but must not shrink it.
  assert.doesNotMatch(
    rule(css("mobile-hud.css"), ".hud .nearby-prompt"),
    /font-size|min-height|max-width|padding/,
  );
  assert.match(css("lobby-ui.css"), /\.reduced \.nearby-prompt::after/);
});

test("first visit retains privacy and player reporting routes", () => {
  assert.match(source, /data-open="phone-menu"/);
  assert.match(source, /data-open="neighbours">Nearby players/);
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
  assert.match(playerPanel, /renderPlayerInspector/);
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
