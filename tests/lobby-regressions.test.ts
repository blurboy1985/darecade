import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as T from "three";
import { rooftops } from "../src/rooftops.ts";
import { blocked, clearLanding, route } from "../src/navigation.ts";
import { JumpInput } from "../src/jump-input.ts";
import { interactionSpecs } from "../src/interactions.ts";

const tree = ts.createSourceFile(
  "world.ts",
  readFileSync(new URL("../src/world.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
);
const world = tree.statements.find(
  (n) => ts.isClassDeclaration(n) && n.name?.text === "LobbyWorld",
);
assert.ok(world && ts.isClassDeclaration(world));
const methods = [
  "jumpStep",
  "movementObstacles",
  "updateCamera",
  "setZoom",
].map((name) => {
  const method = world.members.find((n) => n.name?.getText(tree) === name);
  assert.ok(method);
  return method.getText(tree);
});
const compiled = ts.transpileModule(`class Harness { ${methods.join("\n")} }`, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
function run(scenario: string) {
  vm.runInNewContext(
    `${compiled}
    const world = new Harness();
    Object.assign(world, { player: {root: new T.Group()}, obstacles: [], elevation: 0.1, jumpVelocity: 0,
      jumpInput: new JumpInput(), padFlight: null, jumpSparkles: [], roofStars: [], clock: 0,
      host: {clientWidth: 390, clientHeight: 844}, sharedPlayers: new Map(), neighbours: [], inspectedId: '',
      followCamera: new T.PerspectiveCamera(), cameraMode: 'third', followDistance: 7, angle: 0, pitch: 0.24,
      mobile: true, renderer: {domElement: {dataset:{}}}, save: {} });
    ${scenario}`,
    {
      T,
      assert,
      rooftops,
      blocked,
      clearLanding,
      route,
      JumpInput,
      interactionSpecs,
      innerWidth: 390,
      innerHeight: 844,
      firstRoundGoalPending: () => false,
    },
  );
}

test("dropping past every rooftop edge lands clear and can route away", () => {
  run(`
    world.obstacles = [
      {x:-5,z:-10,w:18,d:5,cameraHeight:6},
      {x:12,z:-8,w:7,d:6,cameraHeight:5.4},
      {x:11,z:10,w:6,d:4,cameraHeight:3.5},
      {x:7.6,z:10,w:1.4,d:2.6,cameraHeight:2.8}
    ];
    for (const roof of rooftops) for (const [dx,dz] of [[roof.w/2+.05,0],[-roof.w/2-.05,0],[0,roof.d/2+.05],[0,-roof.d/2-.05]]) {
      world.player.root.position.set(roof.x+dx,roof.y+.1,roof.z+dz);
      world.elevation=roof.y+.1; world.jumpVelocity=0;
      for(let i=0;i<180;i++) world.jumpStep(1/60);
      const p=world.player.root.position;
      // Overlapping named rooftops may catch a fall; otherwise it reaches clear ground.
      if(world.elevation>.11) continue;
      assert.ok(!blocked(p.x,p.z,world.obstacles), roof.id+' landed inside a prop');
      assert.ok(route(p,{x:0,z:5},world.obstacles).length, roof.id+' can walk away');
    }
  `);
});

test("falling onto overlapping low props resolves to a clear footprint", () => {
  const obstacles = [
    { x: 0, z: 0, w: 2, d: 2 },
    { x: 1.5, z: 0, w: 2, d: 2 },
  ];
  const point = clearLanding(0.9, 0, obstacles);
  assert.equal(blocked(point.x, point.z, obstacles), false);
  assert.ok(Math.hypot(point.x - 0.9, point.z) < 1.5);
  assert.deepEqual(clearLanding(8, 8, obstacles), { x: 8, z: 8 });
});

test("activity props and repeated zoom never put the camera inside the avatar", () => {
  run(`
    for (const spec of interactionSpecs) for (const ratio of [390/844,1280/900,844/390]) {
      world.host.clientWidth=ratio*844;
      world.player.root.position.set(spec.anchor[0],0.1,spec.anchor[2]);
      world.obstacles=[{x:spec.anchor[0],z:spec.anchor[2],w:3.2,d:1.4,cameraHeight:3}];
      world.angle=spec.view; world.followDistance=spec.distance;
      world.updateCamera();
      const focus=world.player.root.position.clone().add(new T.Vector3(0,1.2,0));
      assert.ok(world.followCamera.position.distanceTo(focus)>=3.19, spec.id+' initial framing');
      for(let i=0;i<40;i++) world.setZoom(.15);
      assert.ok(world.followCamera.position.distanceTo(focus)>=3.19, spec.id+' closest framing');
    }
  `);
});
