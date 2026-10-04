import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as state from "../src/state.ts";
import * as catalog from "../src/catalog.ts";
import * as appearance from "../src/appearance.ts";
import * as menus from "../src/lobby-menu.ts";
import * as interactions from "../src/interactions.ts";
import * as neighbourhood from "../src/neighbourhood.ts";

// Evaluate the actual render functions. The small element fixture only records
// generated HTML, selection and replacement; it is not a browser/DOM substitute.
// Back/Next/Close navigation and controls inside collapsed details are excluded
// from the primary-action count. Real keyboard, mobile and CSS QA is separate.
const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const tree = ts.createSourceFile(
  "main.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
function extract(name: string) {
  const fn = tree.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name,
  );
  assert.ok(fn, `Missing render function: ${name}`);
  return fn.getText(tree);
}
const world = readFileSync(new URL("../src/world.ts", import.meta.url), "utf8");
const worldTree = ts.createSourceFile(
  "world.ts",
  world,
  ts.ScriptTarget.Latest,
  true,
);
const spots = worldTree.statements.find(
  (node) =>
    ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(
      (declaration) => declaration.name.getText(worldTree) === "spots",
    ),
);
assert.ok(spots);
const compiled = ts.transpileModule(
  spots.getText(worldTree).replace("export ", "") +
    "\n" +
    [
      "actionButton",
      "pager",
      "cards",
      "open",
      "serverNote",
      "renderSharedNeighbours",
      "renderSharedBoard",
      "challengeButtons",
      "renderSharedDares",
      "renderPlayerInspector",
      "openDares",
    ]
      .map(extract)
      .join("\n"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  },
).outputText;

function harness() {
  const noop = () => {};
  let focused: { id?: string } | null = null;
  const element = () => ({
    innerHTML: "",
    textContent: "",
    value: "",
    id: "",
    disabled: false,
    dataset: {},
    options: [] as { value: string }[],
    querySelector: () => element(),
    addEventListener: noop,
    setAttribute: noop,
    classList: { add: noop, remove: noop, toggle: noop },
    style: { setProperty: noop },
    focus() {
      focused = this;
    },
  });
  let html = "";
  let replacements = 0;
  const nodes = new Map<string, ReturnType<typeof element>>();
  const body = {
    get innerHTML() {
      return html;
    },
    set innerHTML(value: string) {
      html = value;
      replacements++;
      nodes.clear();
    },
    querySelector(selector: string) {
      if (
        selector.startsWith("#") &&
        !html.includes(`id="${selector.slice(1)}"`)
      )
        return null;
      if (!nodes.has(selector)) {
        const node = element();
        if (selector.startsWith("#")) {
          node.id = selector.slice(1);
          const contents = html.match(
            new RegExp(
              `<select[^>]*id="${node.id}"[^>]*>([\\s\\S]*?)<\\/select>`,
            ),
          )?.[1];
          if (contents) {
            const options = [
              ...contents.matchAll(/<option value="([^"]+)"([^>]*)>/g),
            ];
            node.options = options.map((option) => ({ value: option[1] }));
            node.value =
              (options.find((option) => /\bselected\b/.test(option[2])) ||
                options.find(
                  (option) => !/\bdisabled\b/.test(option[2]),
                ))?.[1] || "";
          }
        }
        nodes.set(selector, node);
      }
      return nodes.get(selector)!;
    },
    insertAdjacentHTML(where: string, value: string) {
      body.innerHTML = where === "afterbegin" ? value + html : html + value;
    },
  };
  const players = Array.from({ length: 8 }, (_, i) => ({
    id: `p${i}`,
    name: `Player ${i}`,
    status: "offline",
    points: 4,
    wins: 1,
    activity: "jog",
    look: { outfit: 0, clothing: 0, pet: 0, accessory: 0 },
    best: Object.fromEntries(catalog.gameIds.map((id) => [id, 100])),
  }));
  const inspector = element();
  const context = vm.createContext({
    ...state,
    ...catalog,
    ...appearance,
    ...menus,
    ...interactions,
    ...neighbourhood,
    body,
    document: {
      querySelector: () => inspector,
      get activeElement() {
        return focused;
      },
    },
    modal: { ...element(), open: true },
    icon: () => "",
    escapeText: (value: string) => value,
    firstRacePending: () => false,
    openShell: noop,
    currentProfile: { name: "Review player", account: {} },
    shared: {
      self: { best: {}, outgoing: 0, points: 0 },
      players,
      me: "self",
      competitionReady: true,
      challenged: [],
      boards: Object.fromEntries(catalog.gameIds.map((id) => [id, []])),
      weekly: [],
      history: [],
      dares: [],
      recentRuns: [],
      lastWeek: [],
      week: "2026-10-05",
    },
    connected: true,
    save: { ...state.fresh(), rounds: 1 },
    is2d: true,
    innerWidth: 1024,
    world: null,
    wardrobeTab: "style",
    setupGuide: false,
    gamePage: 0,
    outdoorPage: 0,
    emotePage: 0,
    questPage: 0,
    challengeGameByPlayer: new Map(),
    neighbourRosterSignature: "",
    dareView: "home",
    boardTab: "week",
    boardGame: "noodle",
    playtestEnabled: false,
    socialPanel: "",
    characterPreview: null,
    profileQueue: Promise.resolve(),
    worldPicker: { open: noop },
    startOutdoor: noop,
    showPlayer: noop,
    showResident: noop,
    startGame: noop,
    openAccount: noop,
    visit: noop,
    progress: noop,
    persist: noop,
  });
  vm.runInContext(compiled, context);
  return {
    context,
    body,
    inspector,
    run: (code: string) => vm.runInContext(code, context),
    replacements: () => replacements,
  };
}
function primaryActions(html: string) {
  const actions: string[] = [];
  const closedDetails: boolean[] = [];
  for (const [token] of html.matchAll(
    /<details\b[^>]*>|<\/details>|<button\b[^>]*>[\s\S]*?<\/button>/g,
  )) {
    if (token.startsWith("<details")) {
      closedDetails.push(!/\bopen(?:[\s>])/.test(token));
      continue;
    }
    if (token === "</details>") {
      closedDetails.pop();
      continue;
    }
    if (closedDetails.some(Boolean)) continue;
    if (/data-page=|class="[^"]*menu-back|class="[^"]*close-button/.test(token))
      continue;
    actions.push(token);
  }
  return actions;
}
function checkActions(html: string, label: string) {
  assert.ok(
    primaryActions(html).length <= 3,
    `${label} has ${primaryActions(html).length} primary buttons`,
  );
}

test("real menu renders have at most three primary actions with populated social data", () => {
  const h = harness();
  h.context.shared.dares = [
    {
      id: "d1",
      host: "p0",
      name: "Player 0",
      game: "hop",
      score: 100,
      expires: Date.now() + 10000,
    },
  ];
  h.context.shared.recentRuns = [{ id: "r1", game: "hop", score: 100 }];
  for (const id of [
    ...Object.keys(menus.menuPages),
    "arcade",
    "map",
    "surroundings",
    "emotes",
    "away",
    "shop",
    "quests",
    "album",
    "settings",
    "neighbours",
    "dares",
    "dares-open",
    "dares-neighbour",
    "dares-post",
    "board",
    "wardrobe",
  ]) {
    h.run(`open(${JSON.stringify(id)})`);
    checkActions(h.body.innerHTML, id);
  }
  h.context.setupGuide = true;
  h.run('open("wardrobe")');
  checkActions(h.body.innerHTML, "guided wardrobe");
  h.run('renderPlayerInspector("p0")');
  checkActions(h.inspector.innerHTML, "player inspector");
});

test("all paginated choices remain reachable, including later games and quests", () => {
  const h = harness();
  const games = new Set<string>();
  for (let page = 0; page < 2; page++) {
    h.context.gamePage = page;
    h.run('open("arcade")');
    checkActions(h.body.innerHTML, `games page ${page}`);
    for (const match of h.body.innerHTML.matchAll(/data-game="([^"]+)"/g))
      games.add(match[1]);
  }
  assert.deepEqual([...games].sort(), [...catalog.gameIds].sort());
  const quests = new Set<string>();
  for (let page = 0; page < 2; page++) {
    h.context.questPage = page;
    h.run('open("quests")');
    checkActions(h.body.innerHTML, `quests page ${page}`);
    for (const match of h.body.innerHTML.matchAll(/data-claim="([^"]+)"/g))
      quests.add(match[1]);
  }
  assert.deepEqual(
    [...quests].sort(),
    state.missions.map((mission) => mission.id).sort(),
  );
});

test("ranking templates have balanced buttons for weekly and daily views", () => {
  const h = harness();
  for (const period of ["week", "daily"]) {
    h.context.boardTab = period;
    h.run("renderSharedBoard()");
    const html = h.body.innerHTML;
    assert.equal(
      [...html.matchAll(/<button\b/g)].length,
      [...html.matchAll(/<\/button>/g)].length,
    );
    assert.doesNotMatch(html, /<\/select>(?:active)?" aria-pressed=/);
    checkActions(html, `rankings ${period}`);
  }
});

test("movement-only updates preserve the existing neighbour selector", () => {
  const h = harness();
  h.run("renderSharedNeighbours()");
  const picker = h.body.querySelector("#neighbour-choice")!;
  picker.value = "player:p4";
  picker.focus();
  const before = h.replacements();
  h.context.shared.players[0].x = 42;
  h.run("renderSharedNeighbours()");
  assert.equal(h.replacements(), before);
  assert.equal(h.body.querySelector("#neighbour-choice"), picker);
  h.context.shared.players[0].name = "Changed name";
  h.run("renderSharedNeighbours()");
  const next = h.body.querySelector("#neighbour-choice")!;
  assert.equal(next.value, "player:p4");
  assert.equal(h.context.document.activeElement, next);
});

test("live redraw retains the selected dare game for the same defender", () => {
  const h = harness();
  h.context.challengeGameByPlayer.set("p0", "coast");
  h.context.dareView = "neighbour";
  h.run("renderSharedDares()");
  assert.match(h.body.innerHTML, /data-challenge="coast" data-defender="p0"/);
  h.context.shared.players[0].points++;
  h.run("renderSharedDares()");
  assert.match(h.body.innerHTML, /data-challenge="coast" data-defender="p0"/);
  h.run('renderPlayerInspector("p0")');
  assert.match(
    h.inspector.innerHTML,
    /data-challenge="coast" data-defender="p0"/,
  );
});

test("first-visit settings paths never start a race and Back returns to welcome", () => {
  const h = harness();
  let races = 0;
  h.context.firstRacePending = () => true;
  h.context.startGame = () => {
    races++;
  };
  for (const id of [
    "settings",
    "preferences",
    "controls",
    "safety-menu",
    "neighbours",
    "away",
  ]) {
    h.run(`open(${JSON.stringify(id)})`);
    assert.match(h.body.innerHTML, /<h2>/, id);
    assert.equal(races, 0, id);
  }
  h.run('open("settings")');
  assert.match(h.body.innerHTML, /data-action="close">← Back/);
  assert.doesNotMatch(h.body.innerHTML, /data-open="phone-menu"/);
});
