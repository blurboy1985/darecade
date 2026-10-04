import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { runInNewContext } from "node:vm";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

const source = readFileSync(
  new URL("../src/world-picker.ts", import.meta.url),
  "utf8",
);
const chromium = process.env.DARECADE_TEST_CHROMIUM;

test("worlds use native choices and only three main join actions", () => {
  const menu = source.slice(
    source.indexOf('this.body.innerHTML = `<h2>Worlds</h2><p class="lead">'),
    source.indexOf("} catch (error)"),
  );
  assert.equal((menu.match(/data-main-action/g) ?? []).length, 3);
  assert.equal((menu.match(/<button /g) ?? []).length, 3);
  assert.equal((menu.match(/<select /g) ?? []).length, 2);
  for (const label of ["Join world", "Join friend", "Join room"])
    assert.ok(menu.includes(`>${label}</button>`), label);
  assert.doesNotMatch(menu, /data-world-refresh/);
  assert.doesNotMatch(menu, /data-world-join|data-world-friend|world-row/);
});

test("world choices retain labels, room-code validation and error retry", () => {
  for (const id of ["world-choice", "world-friend", "world-code"]) {
    assert.ok(source.includes(`for="${id}"`), id);
    assert.ok(source.includes(`id="${id}"`), id);
  }
  assert.match(source, /pattern="\[Ww\]\[1-9\]\[0-9\]\{0,5\}"/);
  assert.match(source, /maxlength="7"/);
  assert.match(source, /data-world-refresh/);
  assert.match(source, /request !== this\.request/);
});

// No DOM is needed to check rendering and asynchronous request ownership. The
// browser check below covers native selection and form events separately.
const compiledForNode = transpileModule(source, {
  compilerOptions: { module: ModuleKind.CommonJS, target: ScriptTarget.ES2022 },
}).outputText;
function runPickerScenario(scenario: string) {
  return runInNewContext(
    `
const exports = {};
const calls = [];
let handler = async () => ({worlds: [], neighbours: []});
function require(path) {
  assert.equal(path, './social');
  return {api: (...args) => { calls.push(args); return handler(...args); }};
}
${compiledForNode}
(async () => {
  let active = true, current = 'world-1', switchWait;
  const controls = [{disabled: false}, {disabled: false}];
  const body = {innerHTML: '', addEventListener() {}, querySelectorAll: () => controls};
  const switches = [], notices = [];
  const picker = new exports.WorldPicker(body, () => active, () => current, async world => {
    if (switchWait) await switchWait;
    switches.push(world);
    current = world;
  }, message => notices.push(message));
  ${scenario}
})();`,
    { assert },
  );
}

test("rendered worlds keep three actions for large and empty directories", async () => {
  await runPickerScenario(`
    handler = async () => ({
      worlds: Array.from({length: 40}, (_, i) => ({id: 'world-' + (i + 1), code: 'W' + (i + 1), count: i === 2 ? 30 : 10})),
      neighbours: Array.from({length: 40}, (_, i) => ({id: 'friend-' + (i + 1), name: 'Friend <img src=x>', world: 'world-' + (i + 1)})),
    });
    await picker.open();
    assert.equal((body.innerHTML.match(/data-main-action/g) ?? []).length, 3);
    assert.equal((body.innerHTML.match(/<button /g) ?? []).length, 3);
    assert.equal((body.innerHTML.match(/<option /g) ?? []).length, 82);
    assert.ok(body.innerHTML.includes('value="world-1" disabled>W1 · 10/30 · Here'));
    assert.ok(body.innerHTML.includes('value="world-3" disabled>W3 · 30/30 · Full'));
    assert.match(body.innerHTML, /value="friend-1" disabled/);
    assert.match(body.innerHTML, /value="friend-3" disabled/);
    assert.ok(!body.innerHTML.includes('<img'));
    handler = async () => ({worlds: [], neighbours: []});
    await picker.open();
    assert.equal((body.innerHTML.match(/data-main-action/g) ?? []).length, 3);
    assert.equal((body.innerHTML.match(/<button /g) ?? []).length, 3);
    assert.ok(body.innerHTML.includes('No worlds available'));
    assert.ok(body.innerHTML.includes('No friends online'));
  `);
});

test("directory requests ignore older loads and dismissed screens", async () => {
  await runPickerScenario(`
    const pending = [];
    handler = () => new Promise((resolve, reject) => pending.push({resolve, reject}));
    const older = picker.open(), newer = picker.open();
    pending[1].resolve({worlds: [], neighbours: []});
    await newer;
    const latest = body.innerHTML;
    pending[0].resolve({worlds: [{id: 'world-9', code: 'W9', count: 1}], neighbours: []});
    await older;
    assert.equal(body.innerHTML, latest);
    const abandoned = picker.open();
    active = false;
    body.innerHTML = 'Other screen';
    pending[2].resolve({worlds: [], neighbours: []});
    await abandoned;
    assert.equal(body.innerHTML, 'Other screen');
    active = true;
    const failed = picker.open();
    active = false;
    body.innerHTML = 'Other screen';
    pending[3].reject(Error('Late failure'));
    await failed;
    assert.equal(body.innerHTML, 'Other screen');
  `);
});

test("joining locks controls, invalidates reads and releases after switching", async () => {
  await runPickerScenario(`
    const pendingReads = [], pendingJoins = [];
    handler = path => new Promise((resolve, reject) => (path === 'worlds' ? pendingReads : pendingJoins).push({resolve, reject}));
    const loading = picker.open();
    let releaseSwitch;
    switchWait = new Promise(resolve => releaseSwitch = resolve);
    const joining = picker.join({world: 'world-2'});
    assert.ok(controls.every(control => control.disabled));
    await picker.join({friend: 'friend-2'});
    assert.equal(pendingJoins.length, 1);
    pendingReads[0].resolve({worlds: [], neighbours: []});
    await loading;
    assert.ok(!body.innerHTML.includes('data-main-action'));
    await picker.open();
    assert.ok(body.innerHTML.includes('Joining world'));
    assert.equal(pendingReads.length, 1);
    pendingJoins[0].resolve({world: 'world-2'});
    await Promise.resolve();
    await picker.join({world: 'world-3'});
    assert.equal(pendingJoins.length, 1);
    active = false;
    body.innerHTML = 'Other screen';
    releaseSwitch();
    await joining;
    assert.equal(current, 'world-2');
    assert.equal(switches.length, 1);
    assert.equal(body.innerHTML, 'Other screen');
    assert.equal(pendingReads.length, 1);
    const retry = picker.join({friend: 'friend-3'});
    assert.equal(pendingJoins.length, 2);
    pendingJoins[1].reject(Error('World is full'));
    await retry;
    assert.equal(notices.at(-1), 'World is full');
    const afterFailure = picker.join({world: 'world-4'});
    assert.equal(pendingJoins.length, 3);
    pendingJoins[2].resolve({world: 'world-4'});
    await afterFailure;
    assert.equal(current, 'world-4');
  `);
});

// Run the real WorldPicker in a browser, with only its API boundary faked.
// The server is loopback-only and Chromium cannot resolve external hosts.
test(
  "world picker joins, disables unavailable destinations and ignores stale work",
  {
    skip: chromium ? false : "Set DARECADE_TEST_CHROMIUM to run browser checks",
    timeout: 20000,
  },
  async () => {
    assert.ok(chromium);
    const directory = mkdtempSync(join(tmpdir(), "darecade-world-picker-"));
    const compiled = transpileModule(source, {
      compilerOptions: {
        module: ModuleKind.ESNext,
        target: ScriptTarget.ES2022,
      },
    }).outputText;
    const script = `
import { WorldPicker } from '/world-picker.js';
const check = (value, label) => { if (!value) throw Error(label); };
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const body = document.querySelector('#worlds');
const directory = {
  worlds: Array.from({length: 40}, (_, i) => ({id: 'world-' + (i + 1), code: 'W' + (i + 1), count: i === 2 ? 30 : 10})),
  neighbours: Array.from({length: 40}, (_, i) => ({id: 'friend-' + (i + 1), name: i === 1 ? 'Sam <img src=x onerror=alert(1)>' : 'Friend ' + (i + 1), world: 'world-' + (i + 1)})),
};
const empty = { worlds: [], neighbours: [] };
let response = directory, active = true, current = 'world-1', reads = 'normal';
let switching = null;
const requests = [], pendingReads = [], pendingJoins = [], switches = [], notices = [];
window.testApi = (path, destination) => {
  requests.push({path, destination});
  if (path === 'worlds') {
    if (reads === 'manual') return new Promise((resolve, reject) => pendingReads.push({resolve, reject}));
    if (reads === 'error') return Promise.reject(Error('Unavailable <img src=x>'));
    return Promise.resolve(response);
  }
  check(path === 'worlds/join', 'unexpected API path');
  return new Promise((resolve, reject) => pendingJoins.push({resolve, reject}));
};
const picker = new WorldPicker(body, () => active, () => current, async world => {
  switches.push(world);
  if (switching) await switching;
  current = world;
}, message => notices.push(message));
const mainActions = () => body.querySelectorAll('[data-main-action]');
const choose = (selector, value) => {
  const select = body.querySelector(selector);
  select.value = value;
  select.dispatchEvent(new Event('change', {bubbles: true}));
  return select.form;
};
const submit = form => form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
const joins = () => requests.filter(request => request.path === 'worlds/join');
const option = (selector, value) => Array.from(body.querySelector(selector).options).find(option => option.value === value);
try {
  await picker.open();
  check(mainActions().length === 3, 'exactly three main actions with forty worlds and friends');
  check(body.querySelector('#world-choice').options.length === 41, 'every world is retained');
  check(body.querySelector('#world-friend').options.length === 41, 'every friend is retained');
  check(option('#world-choice', 'world-1').disabled, 'current world is disabled');
  check(option('#world-choice', 'world-3').disabled, 'full world is disabled');
  check(option('#world-friend', 'friend-1').disabled, 'friend in current world is disabled');
  check(option('#world-friend', 'friend-3').disabled, 'friend in full world is disabled');
  check(!body.querySelector('img'), 'friend names cannot inject markup');
  check(option('#world-friend', 'friend-2').textContent.includes('<img'), 'friend name is preserved as text');
  check(body.querySelector('[data-world-choice=world] button').disabled, 'world join needs a choice');
  check(body.querySelector('[data-world-choice=friend] button').disabled, 'friend join needs a choice');
  const unavailable = choose('#world-choice', 'world-3');
  check(unavailable.querySelector('button').disabled, 'full option cannot enable join');
  submit(unavailable);
  submit(choose('#world-friend', 'friend-1'));
  check(joins().length === 0, 'disabled choices cannot submit');

  const worldForm = choose('#world-choice', 'world-2');
  check(!worldForm.querySelector('button').disabled, 'available world enables join');
  worldForm.requestSubmit();
  check(joins().length === 1 && joins()[0].destination.world === 'world-2', 'world join sends chosen world');
  check(Array.from(body.querySelectorAll('[data-world-control]')).every(control => control.disabled), 'all picker controls lock during join');
  submit(worldForm);
  void picker.join({friend: 'friend-4'});
  check(joins().length === 1, 'repeated submissions share the busy guard');
  let releaseSwitch;
  switching = new Promise(resolve => releaseSwitch = resolve);
  pendingJoins.shift().resolve({world: 'world-2'});
  await tick();
  void picker.join({world: 'world-4'});
  check(joins().length === 1, 'busy guard remains until world switch finishes');
  releaseSwitch();
  switching = null;
  await tick();
  check(current === 'world-2' && body.textContent.includes('You’re in W2.'), 'completed join refreshes current world');
  check(option('#world-choice', 'world-2').disabled, 'new current room is disabled');

  choose('#world-friend', 'friend-4').requestSubmit();
  check(joins()[1].destination.friend === 'friend-4', 'friend join sends chosen player');
  pendingJoins.shift().resolve({world: 'world-4'});
  await tick();
  const codeForm = body.querySelector('#room-code');
  codeForm.elements.code.value = 'W0';
  submit(codeForm);
  check(joins().length === 2 && notices.at(-1).includes('W3'), 'invalid room code is rejected');
  codeForm.elements.code.value = 'w5';
  codeForm.requestSubmit();
  check(joins()[2].destination.world === 'world-5', 'lowercase room code is normalized');
  pendingJoins.shift().resolve({world: 'world-5'});
  await tick();

  directory.worlds[1].count = 30;
  const requestCount = requests.length;
  await picker.open();
  check(requests.length === requestCount + 1, 'reopening reads the latest directory');
  check(option('#world-choice', 'world-2').disabled, 'reopening disables a newly full world');
  check(option('#world-friend', 'friend-2').disabled, 'reopening disables friends in a newly full world');
  check(mainActions().length === 3, 'reopening keeps three main actions');

  response = empty;
  await picker.open();
  check(mainActions().length === 3, 'empty directory retains only three actions');
  check(body.querySelector('#world-choice').disabled && body.querySelector('#world-friend').disabled, 'empty selectors are disabled');
  check(body.textContent.includes('No worlds available') && body.textContent.includes('No friends online'), 'empty states explain unavailable choices');
  check(!body.querySelector('#room-code button').disabled, 'room code remains available with an empty directory');

  reads = 'manual';
  const older = picker.open(), newer = picker.open();
  pendingReads[1].resolve(empty);
  await newer;
  const latestMarkup = body.innerHTML;
  pendingReads[0].resolve(directory);
  await older;
  pendingReads.length = 0;
  check(body.innerHTML === latestMarkup, 'older directory response cannot replace newer state');
  const abandoned = picker.open();
  active = false;
  body.innerHTML = '<h2>Other screen</h2>';
  pendingReads.shift().resolve(directory);
  await abandoned;
  check(body.textContent === 'Other screen', 'leaving ignores the pending directory response');

  active = true;
  const staleRead = picker.open();
  const joining = picker.join({world: 'world-6'});
  pendingReads.shift().resolve(directory);
  await staleRead;
  check(!body.querySelector('#world-choice'), 'joining invalidates an older directory load');
  await picker.open();
  check(body.textContent.includes('Joining world'), 'opening during join shows progress');
  check(pendingReads.length === 0, 'opening during join avoids another directory request');
  active = false;
  body.innerHTML = '<h2>Other screen</h2>';
  pendingJoins.shift().resolve({world: 'world-6'});
  await joining;
  check(body.textContent === 'Other screen', 'completed join does not reopen a dismissed picker');

  active = true;
  reads = 'error';
  await picker.open();
  check(mainActions().length === 1 && body.querySelector('[role=alert]'), 'load failure shows one retry action');
  check(!body.querySelector('img'), 'load errors are escaped');
  reads = 'normal';
  response = directory;
  body.querySelector('[data-world-refresh]').click();
  await tick();
  check(mainActions().length === 3, 'retry restores the choices');
  choose('#world-choice', 'world-7').requestSubmit();
  pendingJoins.shift().reject(Error('This world is full.'));
  await tick();
  check(notices.at(-1) === 'This world is full.', 'join failure is reported');
  check(mainActions().length === 3 && !body.querySelector('#room-code button').disabled, 'join failure releases the busy state');

  const failedRead = (reads = 'manual', picker.open());
  active = false;
  body.innerHTML = '<h2>Other screen</h2>';
  pendingReads.shift().reject(Error('Late failure'));
  await failedRead;
  check(body.textContent === 'Other screen', 'late failure cannot replace another screen');
  document.body.innerHTML = '<p data-result="pass">World picker passed</p>';
} catch (error) {
  document.body.innerHTML = '<p data-result="fail"></p>';
  document.querySelector('p').textContent = error.stack;
}
`;
    const server = createServer((request, response) => {
      if (request.url === "/world-picker.js") {
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.end(compiled);
      } else if (request.url === "/social") {
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.end(
          "export const api = (path, destination) => window.testApi(path, destination);",
        );
      } else if (request.url === "/") {
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(
          `<html><body><main id="worlds"></main><script type="module">${script}</script></body></html>`,
        );
      } else response.writeHead(404).end();
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    const browser = spawn(
      chromium,
      [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--disable-background-networking",
        "--no-first-run",
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
        `--user-data-dir=${directory}`,
        "--dump-dom",
        "--virtual-time-budget=10000",
        `http://127.0.0.1:${address.port}/`,
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "",
      errors = "";
    browser.stdout.on("data", (data) => {
      output += data;
    });
    browser.stderr.on("data", (data) => {
      errors += data;
    });
    try {
      const [exit] = await once(browser, "exit");
      assert.equal(exit, 0, errors);
      assert.match(output, /data-result="pass"/, output);
    } finally {
      browser.kill();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
