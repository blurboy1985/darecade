import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Execute the real click handler with a controlled API boundary. This tests
// cancellation and repeated clicks, not DOM focus, browser layout or networking.
const source = readFileSync(new URL("../src/main.ts", import.meta.url), "utf8");
const tree = ts.createSourceFile(
  "main.ts",
  source,
  ts.ScriptTarget.Latest,
  true,
);
const listener = tree.statements.find(
  (node) =>
    ts.isExpressionStatement(node) &&
    ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(tree) === "document.addEventListener" &&
    node.expression.arguments[0]?.getText(tree) === '"click"',
);
assert.ok(listener && ts.isExpressionStatement(listener));
assert.ok(ts.isCallExpression(listener.expression));
const handler = listener.expression.arguments[1].getText(tree);
const compiled = ts.transpileModule(`const handle = ${handler}`, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.None,
  },
}).outputText;
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

for (const outcome of [
  "success",
  "failure",
  "stale-success",
  "stale-failure",
]) {
  test(`setup-save handles ${outcome} without reopening dismissed setup`, async () => {
    let resolveRequest: (value: unknown) => void = () => {};
    let rejectRequest: (reason: Error) => void = () => {};
    const request = new Promise((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });
    let apiCalls = 0;
    let focusCalls = 0;
    let closeCalls = 0;
    const opened: { onSkipped: () => void }[] = [];
    const button = { disabled: false, dataset: { action: "setup-save" } };
    const status = { textContent: "" };
    const input = { value: "newname", focus: () => focusCalls++ };
    const body = {
      querySelector: (selector: string) =>
        selector === "#nickname" ? input : status,
    };
    const context = vm.createContext({
      gameGeneration: 1,
      modal: { open: true },
      body,
      currentProfile: { name: "oldname" },
      shared: { self: { name: "oldname" } },
      profileQueue: Promise.resolve(),
      api: () => {
        apiCalls++;
        return request;
      },
      acceptProfile: () => {},
      syncSocial: () => Promise.resolve(),
      close: () => closeCalls++,
      openAccount: (options: { onSkipped: () => void }) => opened.push(options),
      event: { target: { closest: () => button } },
    });
    vm.runInContext(`${compiled}\nhandle(event); handle(event);`, context);
    await flush();
    assert.equal(apiCalls, 1, "a second click while saving is ignored");
    if (outcome.startsWith("stale")) {
      context.gameGeneration = 2;
      context.modal.open = false;
      context.body = { querySelector: () => null };
    }
    if (outcome.endsWith("failure"))
      rejectRequest(new Error("Connection lost"));
    else resolveRequest({ name: "newname" });
    await flush();
    await flush();
    assert.equal(opened.length, outcome === "success" ? 1 : 0);
    assert.equal(button.disabled, false);
    assert.equal(
      status.textContent,
      outcome === "failure" ? "Connection lost" : "",
    );
    assert.equal(focusCalls, outcome === "failure" ? 1 : 0);
    if (opened.length) {
      opened[0].onSkipped();
      assert.equal(closeCalls, 1, "skipping optional email returns to play");
    }
  });
}

test("native menu selectors restore focus after their own redraw", () => {
  const changeListener = tree.statements.find(
    (node) =>
      ts.isExpressionStatement(node) &&
      ts.isCallExpression(node.expression) &&
      node.expression.expression.getText(tree) ===
        "document.addEventListener" &&
      node.expression.arguments[0]?.getText(tree) === '\"change\"',
  );
  assert.ok(
    changeListener &&
      ts.isExpressionStatement(changeListener) &&
      ts.isCallExpression(changeListener.expression),
  );
  const handle = changeListener.expression.arguments[1].getText(tree);
  const javascript = ts.transpileModule(`const change = ${handle}`, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.None,
    },
  }).outputText;
  for (const [id, value] of [
    ["dare-choice", "d1"],
    ["board-period", "daily"],
    ["board-game", "coast"],
  ]) {
    let redraws = 0;
    const focused: string[] = [];
    const context = vm.createContext({
      boardTab: "week",
      boardGame: "noodle",
      gameIds: ["noodle", "coast"],
      body: {
        querySelector: (selector: string) => ({
          focus: () => focused.push(selector),
        }),
      },
      renderSharedBoard: () => redraws++,
      renderSharedDares: () => redraws++,
    });
    vm.runInContext(javascript, context);
    vm.runInContext(
      `change({target: {id: ${JSON.stringify(id)}, value: ${JSON.stringify(value)}, dataset: {}}})`,
      context,
    );
    assert.equal(redraws, 1, id);
    assert.deepEqual(focused, [`#${id}`]);
  }
});
