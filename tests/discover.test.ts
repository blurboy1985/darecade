import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { discoveries, discoveryPage, discoveryCards, nextDiscovery } from "../src/discover.ts";

test("discovery exposes every existing arcade and outside activity in pages of three", () => {
  const seen: string[] = [];
  for (let page = 0; page < discoveryPage(0).total; page++) {
    const choice = discoveryPage(page);
    assert.ok(choice.items.length > 0 && choice.items.length <= 3);
    seen.push(...choice.items.map((item) => item.id));
    assert.equal((discoveryCards(page).match(/<button /g) || []).length, choice.items.length);
  }
  assert.equal(new Set(seen).size, seen.length);
  assert.deepEqual(new Set(seen), new Set([
    "coast", "stage", "hoops", "fishing", "pet", "plots", "hop",
    "brick", "swarm", "noodle", "dragon", "swing", "bench0",
  ]));
  assert.deepEqual(discoveryPage(0).items.map((item) => item.id), ["coast", "stage", "hoops"]);
  assert.equal(discoveryPage(-1).page, 0);
  assert.equal(discoveryPage(NaN).page, 0);
  assert.equal(discoveryPage(100).page, discoveryPage(0).total - 1);
});

test("every preview uses an existing action and a short hook", () => {
  for (const item of discoveries) {
    assert.ok(item.hook.split(/\s+/).length <= 5);
    if (item.kind === "game") assert.ok(["coast", "hoops", "fishing", "hop", "brick", "swarm", "noodle"].includes(item.id));
    if (item.kind === "open") assert.ok(["stage", "plots"].includes(item.id));
    if (item.kind === "environment") assert.ok(["pet", "dragon", "swing", "bench0"].includes(item.id));
  }
});

test("every round offers exactly one different, playable next activity", () => {
  for (const game of ["coast", "noodle", "brick", "hop", "swarm", "hoops", "fishing"]) {
    const html = nextDiscovery(game);
    const route = html.match(/data-(game|open|environment)="([^"]+)"/)!;
    assert.ok(route);
    assert.notEqual(route[2], game);
    assert.ok(discoveries.some((item) => item.kind === route[1] && item.id === route[2]));
    assert.equal((html.match(/<button /g) || []).length, 1);
  }
  assert.match(nextDiscovery("coast"), /data-open="stage"/);
});

test("new-player discovery and result recommendations are connected to the existing UI", () => {
  const main = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
  assert.match(main, /save.rounds < 5 \? "discover" : "arcade"/);
  const playRoute = main.slice(main.indexOf('if (b.dataset.open) {'), main.indexOf('if (b.dataset.walk) {'));
  assert.doesNotMatch(playRoute, /playSection = "arcade"/);
  assert.match(main, /b.dataset.page === "discover"/);
  assert.match(main, /discoveryIndex = discoveryPage\(Number\(b.dataset.pageIndex\)\).page/);
  assert.match(main, /e.target.value === "discover"/);
  assert.equal((main.match(/nextDiscovery\(id\)/g) || []).length, 2);
  assert.doesNotMatch(main, /firstSessionGuide/);
});
