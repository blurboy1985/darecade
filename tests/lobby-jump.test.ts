import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { JumpInput } from "../src/jump-input.ts";
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
const methods = ["act", "animatePlayer", "jumpStep"].map((name) => {
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
    Object.assign(world, {jumpInput: new JumpInput(), jumpSparkles: [], burstStars() {}, clock: 10, emote: '', emoteAt: 0, paused: false,
      save: {away: false}, elevation: 0.1, jumpVelocity: 0, padFlight: null, roofStars: [], inspectedId: '', interactionId: '',
      player: {root: new Group(), left: new Group(), right: new Group()}});
    ${scenario}`,
    {
      assert,
      Group,
      JumpInput,
      rooftops: [],
      window: { dispatchEvent() {} },
      CustomEvent: class {},
    },
  );
}

test("repeated jump inputs preserve airborne height and the original landing time", () => {
  run(`
    world.act('jump');
    for (let i=0;i<25;i++) {
      world.jumpStep(1/60);
      const height=world.player.root.position.y;
      const velocity=world.jumpVelocity;
      world.act('jump');
      assert.equal(world.player.root.position.y,height);
      assert.equal(world.jumpVelocity,velocity,'airborne input must not restart jump');
    }
    assert.ok(world.player.root.position.y>1.5);
    world.jumpInput.clear();
    for(let i=0;i<40;i++) world.jumpStep(1/60);
    assert.equal(world.player.root.position.y,0.1);
    world.act('jump'); world.jumpStep(1/60);
    assert.ok(world.player.root.position.y>0.1,'can jump after landing');
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
