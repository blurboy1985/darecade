import test from "node:test";
import assert from "node:assert/strict";
import { latestPlayMedals, playMedalResult } from "../src/play-medals.ts";
const yesterday = {
  day: "2026-10-05",
  total: 3,
  today: 3,
  games: ["noodle", "hoops", "swarm"],
  limit: 3,
};
const today = { day: "2026-10-06", total: 3, today: 0, games: [], limit: 3 };
test("daily goal resets across midnight and ignores stale finish/poll responses", () => {
  assert.deepEqual(latestPlayMedals(yesterday, today), today);
  assert.deepEqual(latestPlayMedals(today, yesterday), today);
  const earned = { ...today, total: 4, today: 1, games: ["swarm"] };
  assert.deepEqual(latestPlayMedals(today, earned), earned);
  assert.deepEqual(latestPlayMedals(earned, today), earned);
  assert.match(
    playMedalResult(earned, 0, "swarm"),
    /Already collected for this game today/,
  );
  assert.match(playMedalResult(earned, 1, "swarm"), /\+1 Play medal point/);
});

test("all accepted profiles retain newer medal state only for the same identity", async () => {
  const { readFileSync } = await import("node:fs");
  const { default: vm } = await import("node:vm");
  const { default: ts } = await import("typescript");
  const source = readFileSync(
    new URL("../src/account.ts", import.meta.url),
    "utf8",
  );
  const tree = ts.createSourceFile(
    "account.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const fn = tree.statements.find(
    (n) => ts.isFunctionDeclaration(n) && n.name?.text === "acceptProfile",
  );
  assert.ok(fn);
  const emitted: unknown[] = [];
  const context = vm.createContext({
    currentProfile: { id: "same", playMedals: today },
    latestPlayMedals,
    window: { dispatchEvent: (e: unknown) => emitted.push(e) },
    CustomEvent: class {
      constructor(name: string, data: unknown) {
        Object.assign(this, { name, data });
      }
    },
  });
  const code = ts.transpileModule(fn.getText(tree).replace("export ", ""), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  vm.runInContext(code, context);
  context.incoming = { id: "same", playMedals: yesterday };
  vm.runInContext("acceptProfile(incoming)", context);
  assert.deepEqual(context.currentProfile.playMedals, today);
  assert.equal(emitted.length, 1);
  context.incoming = { id: "different", playMedals: { ...today, total: 0 } };
  vm.runInContext("acceptProfile(incoming)", context);
  assert.equal(context.currentProfile.playMedals.total, 0);
});
