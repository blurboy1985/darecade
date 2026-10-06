import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { Group } from "three";

// Run the production action and animation methods with real Three objects and
// a controlled clock, without constructing the renderer or loading assets.
const source = readFileSync(
  new URL("../src/world.ts", import.meta.url),
  "utf8",
);
const tree = ts.createSourceFile(
  "world.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
const world = tree.statements.find(
  (node) => ts.isClassDeclaration(node) && node.name?.text === "LobbyWorld",
);
assert.ok(world && ts.isClassDeclaration(world));
const methods = ["act", "animatePlayer"].map((name) => {
  const method = world.members.find(
    (member) => member.name?.getText(tree) === name,
  );
  assert.ok(method, `Missing ${name}`);
  return method.getText(tree);
});
const compiled = ts.transpileModule(
  `class JumpHarness { ${methods.join("\n")} }`,
  {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  },
).outputText;

function run(scenario: string) {
  vm.runInNewContext(
    `${compiled}
    const world = new JumpHarness();
    Object.assign(world, {clock: 10, emote: '', emoteAt: 0, paused: false,
      save: {away: false}, inspectedId: '', interactionId: '',
      player: {root: new Group(), left: new Group(), right: new Group()}});
    ${scenario}`,
    { assert, Group },
  );
}

test("repeated jump inputs preserve airborne height and the original landing time", () => {
  run(`
    world.act('jump');
    for (const elapsed of [0.1, 0.5, 0.9]) {
      world.clock = 10 + elapsed;
      world.animatePlayer();
      const height = world.player.root.position.y;
      world.act('jump');
      world.animatePlayer();
      assert.equal(world.player.root.position.y, height, 'jump must not snap to ground');
      assert.equal(world.emoteAt, 10, 'airborne input must not restart the jump');
    }
    world.clock = 11;
    world.animatePlayer();
    assert.ok(Math.abs(world.player.root.position.y - 0.1) < 1e-8);
    world.act('jump');
    world.clock = 11.5;
    world.animatePlayer();
    assert.ok(world.player.root.position.y > 1.5, 'can jump again after landing');
  `);
});

test("jump respects paused, away, inspection and interaction states", () => {
  for (const state of [
    "world.paused = true",
    "world.save.away = true",
    "world.inspectedId = 'neighbour'",
    "world.interactionId = 'bench'",
  ]) {
    run(`${state}; world.act('jump'); assert.equal(world.emote, '');`);
  }
});
