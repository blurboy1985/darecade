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
import * as wardrobe from "../src/wardrobe.ts";
import * as playMedals from "../src/play-medals.ts";
import { rooftops } from "../src/rooftops.ts";

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
      "questTabs",
      "open",
      "serverNote",
      "renderSharedNeighbours",
      "rankingPeriodPicker",
      "renderSeasonBoard",
      "renderSharedBoard",
      "personalBestCards",
      "challengeButtons",
      "renderSharedDares",
      "renderPlayerInspector",
      "playerProfile",
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
    localStorage: { getItem: () => null },
    ...state,
    ...catalog,
    ...appearance,
    ...menus,
    ...interactions,
    ...neighbourhood,
    ...wardrobe,
    ...playMedals,
    rooftops,
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
    dismissStyleReward: noop,
    boardTarget: "",
    currentProfile: { name: "Review player", account: {} },
    shared: {
      self: { best: {}, outgoing: 0, points: 0 },
      players,
      friends: players.map((p) => ({ ...p, relationship: "friend" })),
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
    wardrobeTab: "clothing",
    wardrobeSection: "Outfits",
    wardrobeFilter: "All",
    undoLook: null,
    wardrobeCollection: "starter",
    tryingLook: null,
    setupGuide: false,
    gamePage: 0,
    outdoorPage: 0,
    emotePage: 0,
    questPage: 0,
    challengeGameByPlayer: new Map(),
    neighbourRosterSignature: "",
    dareView: "home",
    boardTab: "week",
    boardPeriodChosen: false,
    boardGame: "noodle",
    playtestEnabled: false,
    socialPanel: "",
    characterPreview: null,
    mountAvatarCards: noop,
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
    if (
      /data-quest-tab|data-page=|class="[^"]*menu-back|class="[^"]*close-button/.test(
        token,
      )
    )
      continue;
    actions.push(token);
  }
  return actions;
}
function checkActions(html: string, label: string) {
  assert.ok(
    primaryActions(html).length <=
      (label.startsWith("quests")
        ? 7
        : ["phone-menu", "arcade", "map", "surroundings"].includes(label) ||
            label.startsWith("games page")
          ? 14
          : 3),
    `${label} has ${primaryActions(html).length} primary buttons`,
  );
}

test("menu pages stay compact; quests also expose the three rooftop routes", () => {
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
    "arcade",
    "map",
    "surroundings",
    "away",
    "shop",
    "quests",
    "album",
    "settings",
    "neighbours",
    "dares",
    "dares-find",
    "dares-neighbour",
    "board",
  ]) {
    h.run(`open(${JSON.stringify(id)})`);
    checkActions(h.body.innerHTML, id);
  }
  h.run('renderPlayerInspector("p0")');
  checkActions(h.inspector.innerHTML, "player inspector");
});

test("wardrobe renders previews before selection without equipping them", () => {
  const h = harness();
  const before = structuredClone(h.context.save);
  for (const tab of wardrobe.wardrobeSections) {
    h.context.wardrobeSection = tab;
    h.run('open("wardrobe")');
    const html = h.body.innerHTML;
    const cards = [
      ...html.matchAll(/<article class="collection-card[\s\S]*?<\/article>/g),
    ];
    assert.ok(cards.length > 0, tab);
    for (const [card] of cards) {
      assert.match(card, /<img[^>]+data-thumbnail=/);
      assert.match(card, /aria-label="(?:Equip|Preview) /);
    }
    assert.match(html, /data-undo-look/);
    assert.deepEqual(h.context.save, before);
  }
});

test("all paginated choices remain reachable, including later games and quests", () => {
  const h = harness();
  const games = new Set<string>();
  for (let page = 0; page < 3; page++) {
    h.context.gamePage = page;
    h.run('open("arcade")');
    checkActions(h.body.innerHTML, `games page ${page}`);
    for (const match of h.body.innerHTML.matchAll(/data-game="([^"]+)"/g))
      games.add(match[1]);
  }
  assert.deepEqual([...games].sort(), [...catalog.playIds].sort());
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
  h.context.save = state.fresh();
  h.context.startGame = () => {
    races++;
  };
  for (const id of [
    "settings",
    "preferences",
    "controls",
    "neighbours",
    "away",
  ]) {
    h.run(`open(${JSON.stringify(id)})`);
    assert.match(h.body.innerHTML, /<h2>/, id);
    assert.equal(races, 0, id);
  }
  h.run('open("settings")');
  assert.match(h.body.innerHTML, /data-open="phone-menu">← Back/);

  h.context.save.unlockedHats.push(2);
  h.run('open("settings")');
  assert.match(h.body.innerHTML, /data-open="phone-menu">← Back/);
  h.run('open("phone-menu")');
  for (const action of menus.menuPages["phone-menu"].actions) {
    assert.ok(
      h.body.innerHTML.includes(
        action.target === "account"
          ? "data-account"
          : `data-open="${action.target}"`,
      ),
      action.target,
    );
  }
});

// The remaining tests cover bugs from the 4 October 2026 playtest.
test("locked dares show their real opening time and never promise dares for today", () => {
  const h = harness();
  h.context.shared.competitionReady = false;
  h.context.currentProfile = {
    name: "Sunny Otter 06",
    account: { eligibleAt: Date.parse("2026-10-05T14:30:00+08:00") },
  };
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
  const playButtons = (html: string) =>
    [...html.matchAll(/<button\b[^>]*>(?:Play|Post) challenge<\/button>/g)].map(
      ([button]) => button,
    );
  for (const view of ["home", "neighbour"]) {
    h.context.dareView = view;
    h.run("renderSharedDares()");
    const html = h.body.innerHTML;
    assert.match(html, /Your challenges open Mon, 5 Oct, 14:30 SGT/, view);
    assert.doesNotMatch(html, /left today/, view);
    for (const button of playButtons(html)) assert.match(button, /disabled/);
    checkActions(html, `locked dares ${view}`);
  }
  h.run('renderPlayerInspector("p0")');
  assert.match(h.inspector.innerHTML, /Challenges are not open for you yet/);
  assert.match(
    h.inspector.innerHTML,
    /Your challenges open Mon, 5 Oct, 14:30 SGT/,
  );
  assert.doesNotMatch(h.inspector.innerHTML, /Ready for a friendly challenge/);

  // Once the wait is over, the count and a playable button appear together.
  h.context.shared.competitionReady = true;
  h.context.dareView = "neighbour";
  h.run("renderSharedDares()");
  assert.match(h.body.innerHTML, /3\/3 left today/);
  assert.doesNotMatch(playButtons(h.body.innerHTML)[0], /disabled/);
  // A disabled button always says why.
  h.context.shared.self.outgoing = 3;
  for (const view of ["neighbour", "open"]) {
    h.context.dareView = view;
    h.run("renderSharedDares()");
    assert.match(h.body.innerHTML, /0\/3 left today/);
    assert.match(playButtons(h.body.innerHTML)[0], /disabled/);
    assert.match(h.body.innerHTML, /No challenges left today/);
  }
});

test("the weekly board tells a player with scores today when their medals arrive", () => {
  const h = harness();
  h.context.shared.day = "2026-10-06";
  h.context.shared.boards.hop = [
    { id: "self", name: "Sunny Otter 06", score: 93, rank: 1 },
  ];
  h.context.boardTab = "week";
  h.run("renderSharedBoard()");
  let html = h.body.innerHTML;
  assert.match(html, /\+3 medal points pending · awarded at 00:00 SGT/);
  assert.match(html, /Medals land at midnight/);
  assert.match(html, /then appear here/);
  assert.match(html, /data-board-tab="daily">See today’s scores/);
  assert.doesNotMatch(html, /Finish a round to join the board/);
  assert.doesNotMatch(html, /Nothing yet!/);
  checkActions(html, "weekly board with scores today");
  // Sunday's medals count for the week that closes at the same midnight.
  h.context.shared.day = "2026-10-04";
  h.run("renderSharedBoard()");
  assert.match(h.body.innerHTML, /Last week’s champions tomorrow/);
  // Today's board lists the best score and says a lower replay is not shown.
  h.context.boardTab = "daily";
  h.context.boardGame = "hop";
  h.run("renderSharedBoard()");
  html = h.body.innerHTML;
  assert.match(html, /Your personal best: <b>0<\/b>/);
  assert.match(html, /Hop Hop<strong>0<\/strong>/);
  assert.match(html, /a lower replay does not replace it/);
  // A player with no round today still gets the original invitation.
  h.context.shared.boards.hop = [];
  h.context.boardTab = "week";
  h.run("renderSharedBoard()");
  assert.match(h.body.innerHTML, /Finish a round to join the board/);
  assert.match(h.body.innerHTML, /Nothing yet!/);
});

test("My look, Head lists a claimed daily hat", () => {
  const h = harness();
  assert.equal(state.claimGift(h.context.save, 0), true);
  h.run('open("shop")');
  assert.match(h.body.innerHTML, /data-look-tab="hair">See it in My look/);
  h.context.wardrobeSection = "Hats";
  h.run('open("wardrobe")');
  assert.match(
    h.body.innerHTML,
    /class="hat-shelf"[\s\S]*The Kopitiam Bucket · wearing/,
  );
  h.context.wardrobeSection = "Outfits";
  h.run('open("wardrobe")');
  assert.doesNotMatch(h.body.innerHTML, /class="hat-shelf"/);
});

test("a finished quest offers Claim, and a claimed quest says so", () => {
  const h = harness();
  const button = (id: string) =>
    h.body.innerHTML.match(
      new RegExp(`<button data-claim="${id}"[^>]*>[^<]*</button>`),
    )![0];
  h.run('open("quests")');
  assert.match(button("explore"), /disabled>0\/4 · \+40 XP</);
  // Two East Side activities done: "A breath of fresh air" is at 2/2.
  h.context.save.fish = ["guppy"];
  h.context.save.hoopsBest = 4;
  h.context.questPage = 1;
  h.run('open("quests")');
  assert.match(h.body.innerHTML, /A breath of fresh air[\s\S]*2\/2/);
  assert.match(
    button("eastside"),
    /^<button data-claim="eastside" >CLAIM \+30 XP</,
  );
  h.context.save.claims.push("eastside");
  h.run('open("quests")');
  assert.match(button("eastside"), /disabled>CLAIMED ✓</);
});

test("Rankings shows a guest the board and never opens the account dialog", () => {
  const h = harness();
  let accounts = 0;
  h.context.openAccount = () => {
    accounts++;
  };
  h.context.currentProfile = {
    name: "Sunny Otter 06",
    account: null,
    playMedals: {
      day: "2026-10-05",
      total: 2,
      today: 1,
      games: ["swarm"],
      limit: 3,
    },
  };
  h.context.shared.competitionReady = false;
  h.context.shared.boards.hop = [
    { id: "p1", name: "Player 1", score: 93, rank: 1 },
  ];
  for (const period of ["week", "daily"]) {
    h.context.boardTab = period;
    h.context.boardGame = "hop";
    h.run('open("board")');
    const html = h.body.innerHTML;
    assert.equal(accounts, 0, period);
    assert.match(html, /<h2>Rankings<\/h2>/);
    assert.match(html, /Daily Play medal goal/);
    assert.match(html, /<strong>1 \/ 3<\/strong> Play medal points today/);
    assert.doesNotMatch(html, /Guest rounds are not ranked/);
    assert.doesNotMatch(html, /Playing without email/);
    assert.doesNotMatch(html, /Finish a round to (join the board|claim #1)/);
    // Saving stays an offer on the board, not a wall in front of it.
    assert.match(html, /data-account>Link an email</);
    checkActions(html, `guest rankings ${period}`);
  }
  assert.match(h.body.innerHTML, /Player 1[\s\S]*93/);
  // A saved account still sees its own invitation and no guest copy.
  h.context.currentProfile = { name: "Review player", account: {} };
  h.context.shared.boards.hop = [];
  h.run('open("board")');
  assert.match(h.body.innerHTML, /Finish a round to join the board/);
  assert.doesNotMatch(h.body.innerHTML, /Guest rounds|Save with email/);
});

test("slot filters retain new hair, free classes and premium full sets", () => {
  const p = state.fresh();
  const hair = wardrobe.wardrobeBrowser("Hair", "All", p, 0, null);
  const hats = wardrobe.wardrobeBrowser("Hats", "All", p, 0, null);
  assert.match(hair, /data-try-index="54"/);
  assert.doesNotMatch(hats, /data-try-index="54"/);
  const free = wardrobe.wardrobeBrowser("Full sets", "Free", p, 0, null);
  assert.match(free, /Lantern Mage/);
  assert.doesNotMatch(free, /Solar Sentinel/);
  const premium = wardrobe.wardrobeBrowser("Full sets", "Premium", p, 0, null);
  assert.doesNotMatch(premium, /Lantern Mage/);
  assert.match(premium, /data-try-index="9"/);
});

test("More emotes shows all six choices immediately", () => {
  const h = harness();
  h.run('open("emotes")');
  assert.equal([...h.body.innerHTML.matchAll(/data-emote=/g)].length, 6);
  assert.doesNotMatch(h.body.innerHTML, /data-page=/);
});
