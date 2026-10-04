import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

const account = readFileSync(
  new URL("../src/account.ts", import.meta.url),
  "utf8",
);
const social = readFileSync(
  new URL("../src/social.ts", import.meta.url),
  "utf8",
);
const lobbyMenu = readFileSync(
  new URL("../src/lobby-menu.ts", import.meta.url),
  "utf8",
);
// Browser execution is opt-in because standard test environments may not allow
// Chromium processes, even when a Chromium binary is installed.
const chromium = process.env.DARECADE_TEST_CHROMIUM;

test("the full privacy notice retains visibility, retention and withdrawal details", () => {
  const notice = account.match(/export const privacyCopy = `([^`]+)`;/)?.[1];
  assert.ok(notice);
  for (const detail of [
    "nickname, avatar, activity, scores and dares",
    "They cannot see your email or age band",
    "rather than your real name or contact details",
    "Inputs are deleted after 30 days",
    "codes expire after 15 minutes",
    "Inactive profiles are deleted after 12 months",
    "download your data or withdraw consent and delete your profile",
    "It cannot be undone",
    "trusted adult or the arcade operator",
  ])
    assert.ok(notice.includes(detail), detail);
  assert.ok(account.includes("esc(config.storageNotice)"));
  assert.ok(account.includes("esc(config.privacyContact)"));
});

test("initial consent keeps the short summary outside the expandable full notice", () => {
  const summary = account.match(/const privacySummary = `([^`]+)`;/)?.[1];
  assert.ok(summary);
  for (const detail of [
    "nickname, avatar, activity, scores and dares",
    "not your real name or contact details",
    "We save your progress",
    "age band and optional email stay private",
    "Download your data or delete your profile",
    "Account &amp; privacy",
    "trusted adult",
  ])
    assert.ok(summary.includes(detail), detail);
  assert.match(
    account,
    /\$\{privacySummary\}<details class="account-details privacy-details"><summary>Full privacy notice · storage &amp; retention<\/summary>\$\{privacyNotice\(\)\}<\/details><form id="consent-form">/,
  );
  const checkbox = account.match(
    /<input type="checkbox" name="consent"[^>]*>/,
  )?.[0];
  assert.ok(checkbox);
  assert.match(checkbox, /required/);
  assert.doesNotMatch(checkbox, /checked/);
  assert.match(account, /id="decline"/);
  assert.match(account, /No profile was created/);
});

test("optional character saving stays skippable with concise email and code steps", () => {
  assert.match(account, /STEP 2 OF 2 · OPTIONAL/);
  assert.match(account, /Skip for now/);
  assert.match(account, /You can keep playing without an email/);
  assert.match(account, /Expires in 15 minutes/);
  assert.match(account, /maxlength="6"/);
  assert.match(account, /privacyVersion: config\.privacyVersion/);
  assert.match(account, /onSkipped\?: \(\) => void/);
  assert.match(
    account,
    /options\.guided\s*\? \(\) => \{\s*d\.close\(\);\s*options\.onSkipped\?\.\(\);\s*\}\s*: render/,
  );
});

test("account and privacy screens each offer at most three main actions", () => {
  const root = account.slice(
    account.indexOf("const render = () => {"),
    account.indexOf("const renderPrivacy = () => {"),
  );
  assert.equal((root.match(/<button /g) ?? []).length, 3);
  for (const id of ["save-account", "read-privacy", "logout"])
    assert.ok(root.includes(`id="${id}"`));
  assert.ok(!root.includes('id="export-data"'));
  assert.ok(!root.includes('id="delete-data"'));
  const privacy = account.match(
    /const renderPrivacy = \(\) => \{\s*host.innerHTML = `([^`]+)`;/,
  )?.[1];
  assert.ok(privacy);
  assert.equal((privacy.match(/<button /g) ?? []).length, 3);
  for (const id of ["export-data", "delete-data", "privacy-back"])
    assert.ok(privacy.includes(`id="${id}"`));
  assert.ok(privacy.includes("${privacySummary}"));
  assert.ok(privacy.includes("${privacyNotice()}"));
  assert.match(account, /Type DELETE to confirm/);
  assert.match(account, /required pattern="DELETE"/);
  assert.match(
    account,
    /This permanently removes your account, avatar, progress, scores and dares/,
  );
  assert.match(account, /id="keep-account"/);
});

// Exercise the actual account module in a real DOM. Only its API boundary is
// faked, so these checks never create an account or send an email anywhere.
test(
  "onboarding keeps consent explicit and email skippable",
  {
    skip: chromium ? false : "Set DARECADE_TEST_CHROMIUM to run browser checks",
    timeout: 20000,
  },
  async () => {
    assert.ok(chromium);
    const directory = mkdtempSync(join(tmpdir(), "darecade-onboarding-"));
    const compile = (source: string) =>
      transpileModule(source, {
        compilerOptions: {
          module: ModuleKind.ESNext,
          target: ScriptTarget.ES2022,
        },
      }).outputText;
    const requests: { path: string; body: unknown }[] = [];
    let joined = false;
    const profile = {
      id: "test-player",
      name: "Comet",
      account: null,
      ageBand: "adult",
      privacyVersion: "test-notice",
      progress: {},
    };
    const script = `
import { ensureAccount, openAccount } from '/account.js';
const check = (value, label) => { if (!value) throw Error(label); };
const waitFor = async (selector) => {
  for (let attempt = 0; attempt < 100; attempt++) {
    const found = document.querySelector(selector);
    if (found) return found;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw Error('Missing ' + selector);
};
const buttons = () => document.querySelectorAll('#account-content .primary, #account-content .secondary').length;
const age = async () => {
  const form = await waitFor('#age-form');
  check(buttons() <= 3, 'too many age actions');
  form.elements.month.value = '1';
  form.elements.year.value = '2000';
  form.requestSubmit();
  return waitFor('#consent-form');
};
try {
  void ensureAccount();
  const consent = await age();
  const details = document.querySelector('.privacy-details');
  check(!details.open, 'full notice starts collapsed');
  check(!consent.elements.consent.checked && consent.elements.consent.required, 'explicit unchecked consent');
  check(buttons() <= 3, 'too many consent actions');
  check(document.querySelector('.privacy-summary').textContent.includes('age band and optional email stay private'), 'visible privacy summary');
  check(document.querySelector('.privacy-summary').textContent.includes('nickname, avatar, activity, scores and dares'), 'visible public data summary');
  consent.requestSubmit();
  check(!consent.checkValidity(), 'unchecked consent cannot submit');
  details.querySelector('summary').click();
  check(details.open && details.textContent.includes('30 days') && details.textContent.includes('12 months'), 'retention can be opened');
  check(details.textContent.includes('Local test storage only.') && details.textContent.includes('privacy@example.invalid'), 'configured notice is present');
  document.querySelector('#decline').click();
  check(document.querySelector('#account-content').textContent.includes('No profile was created'), 'decline is preserved');

  const entering = ensureAccount();
  const nextConsent = await age();
  nextConsent.elements.consent.checked = true;
  nextConsent.requestSubmit();
  await entering;
  check(!document.querySelector('#account-dialog').open, 'consent closes after joining');

  let skipped = 0;
  await openAccount({ create: true, guided: true, onSkipped: () => skipped++ });
  check(buttons() <= 3, 'too many email actions');
  check(document.querySelector('#account-back').textContent === 'Skip for now', 'visible skip');
  check(document.querySelector('#account-content').textContent.includes('keep playing without an email'), 'email is optional');
  document.querySelector('#account-back').click();
  check(!document.querySelector('#account-dialog').open && skipped === 1, 'guided skip closes the dialog and returns to play');
  await openAccount({ create: true, onSkipped: () => skipped++ });
  document.querySelector('#account-back').click();
  check(document.querySelector('#save-account') && skipped === 1, 'regular Back returns to account without skipping setup');

  let saved = 0;
  await openAccount({ create: true, guided: true, onSaved: () => saved++ });
  const requestCode = async () => {
    const form = await waitFor('#email-form');
    form.elements.email.value = 'player@example.invalid';
    form.requestSubmit();
    return waitFor('#code-form');
  };
  await requestCode();
  check(buttons() <= 3, 'too many code actions');
  check(document.querySelector('#account-content').textContent.includes('Expires in 15 minutes'), 'code expiry is visible');
  document.querySelector('#account-back').click();
  check(document.querySelector('#account-back').textContent === 'Skip for now', 'back restores optional email');
  const code = await requestCode();
  code.elements.code.value = '123456';
  code.requestSubmit();
  for (let attempt = 0; attempt < 100 && !saved; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
  check(saved === 1 && !document.querySelector('#account-dialog').open, 'saving finishes once');
  await openAccount();
  check(buttons() <= 3, 'too many account actions');
  document.querySelector('#read-privacy').click();
  check(buttons() <= 3, 'too many privacy actions');
  check(document.querySelector('#export-data') && document.querySelector('#delete-data'), 'data controls remain available');
  document.querySelector('#delete-data').click();
  check(buttons() <= 3 && !document.querySelector('form').checkValidity(), 'deletion still needs confirmation');
  document.querySelector('#keep-account').click();
  check(document.querySelector('#export-data'), 'cancel deletion returns to privacy');
  document.querySelector('#privacy-back').click();
  check(document.querySelector('#save-account') && document.querySelector('#logout'), 'back restores account actions');
  document.body.innerHTML = '<p data-result="pass">Account onboarding passed</p>';
} catch (error) {
  document.body.innerHTML = '<p data-result="fail"></p>';
  document.querySelector('p').textContent = error.message;
}
`;
    const server = createServer(async (request, response) => {
      const path = request.url ?? "/";
      // The account dialog's own imports, served as the browser asks for them.
      const modules: Record<string, string> = {
        "/account.js": account.replace('import "./account.css";', ""),
        "/social": social,
        "/lobby-menu": lobbyMenu,
      };
      if (modules[path]) {
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.end(compile(modules[path]));
        return;
      }
      if (path === "/") {
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end(
          `<html><body><script type="module">${script}</script></body></html>`,
        );
        return;
      }
      response.setHeader("Content-Type", "application/json");
      if (!path.startsWith("/api/")) {
        response.writeHead(404).end("{}");
        return;
      }
      let body = "";
      for await (const chunk of request) body += chunk;
      requests.push({ path, body: body ? JSON.parse(body) : null });
      if (path === "/api/auth/config")
        response.end(
          JSON.stringify({
            now: Date.parse("2026-10-04"),
            privacyVersion: "test-notice",
            mailMode: "test",
            storageNotice: "Local test storage only.",
            privacyContact: "privacy@example.invalid",
          }),
        );
      else if (path === "/api/auth/me" && !joined)
        response.writeHead(401).end('{"error":"No profile"}');
      else if (path === "/api/auth/join") {
        joined = true;
        response.end(JSON.stringify(profile));
      } else if (path === "/api/auth/me") response.end(JSON.stringify(profile));
      else if (path === "/api/auth/verify")
        response.end(
          JSON.stringify({
            ...profile,
            account: {
              email: "player@example.invalid",
              created: 0,
              eligibleAt: 0,
            },
          }),
        );
      else response.end("{}");
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
      assert.deepEqual(
        requests
          .filter(({ path }) => path === "/api/auth/join")
          .map(({ body }) => body),
        [
          {
            month: 1,
            year: 2000,
            consent: true,
            privacyVersion: "test-notice",
          },
        ],
      );
      assert.equal(
        requests.filter(({ path }) => path === "/api/auth/code").length,
        2,
      );
      assert.equal(
        requests.filter(({ path }) => path === "/api/auth/verify").length,
        1,
      );
    } finally {
      browser.kill();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
