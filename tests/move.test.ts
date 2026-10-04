import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOME, MOVE_KEYS, OLD_HOST, settle } from "../src/move.ts";
import { MOVE_KEYS as serverKeys } from "../server/community-core.mjs";

const code = "ab".repeat(32),
  key = "cd".repeat(32);
/** A browser tab at `href`; records what the page does. */
function browser(
  href: string,
  {
    saves = {},
    tab = {},
    respond = () => ({ status: 200 }),
  }: {
    saves?: Record<string, string>;
    tab?: Record<string, string>;
    respond?: (path: string, body: any) => { status: number; data?: unknown };
  } = {},
) {
  const url = new URL(href);
  const seen = {
    posts: [] as [string, any][],
    replaced: "",
    address: url.pathname + url.search + url.hash,
    saves: { ...saves } as Record<string, string>,
    tab: { ...tab } as Record<string, string>,
  };
  const storage = (items: Record<string, string>) => ({
    getItem: (name: string) => items[name] ?? null,
    setItem: (name: string, value: string) => (items[name] = value),
    removeItem: (name: string) => delete items[name],
  });
  Object.assign(globalThis, {
    location: {
      hostname: url.hostname,
      pathname: url.pathname,
      search: url.search,
      hash: url.hash,
      replace: (to: string) => (seen.replaced = to),
    },
    history: {
      replaceState: (_: unknown, __: string, to: string) => (seen.address = to),
    },
    localStorage: storage(seen.saves),
    sessionStorage: storage(seen.tab),
    fetch: async (path: string, init: { body: string }) => {
      const body = JSON.parse(init.body);
      seen.posts.push([path, body]);
      const { status, data } = respond(path, body);
      return { ok: status === 200, json: async () => data };
    },
  });
  return seen;
}

test("the client and the deployment agree on both addresses and the saves that move", () => {
  const config = readFileSync(
    new URL("../wrangler.jsonc", import.meta.url),
    "utf8",
  );
  assert.ok(config.includes(`"PUBLIC_ORIGIN": "${HOME}"`));
  assert.ok(config.includes(`"LEGACY_ORIGIN": "https://${OLD_HOST}"`));
  assert.ok(config.includes(`"pattern": "${new URL(HOME).hostname}"`));
  assert.deepEqual(MOVE_KEYS, serverKeys);
});

test("the old address asks the new one to start, and makes no code without its key", async () => {
  for (const hash of ["", "#move-key=short", `#move=${code}`, "#other"]) {
    const seen = browser(`https://${OLD_HOST}/?invite=abc${hash}`);
    assert.equal(await settle(), false);
    assert.equal(seen.posts.length, 0, hash);
    assert.equal(seen.replaced, `${HOME}/?invite=abc#from-old`);
  }
});

test("the new address makes a key for this tab and sends it to the old address", async () => {
  const seen = browser(`${HOME}/?invite=abc#from-old`);
  assert.equal(await settle(), false);
  const made = seen.tab["play-simi-move-key"];
  assert.match(made, /^[0-9a-f]{64}$/);
  assert.equal(
    seen.replaced,
    `https://${OLD_HOST}/?invite=abc#move-key=${made}`,
  );
  assert.equal(seen.posts.length, 0);
});

test("the old address sends its saves with the key, then leaves with the code", async () => {
  const seen = browser(`https://${OLD_HOST}/?invite=abc#move-key=${key}`, {
    saves: { "darecade-v1": '{"xp":40}', unrelated: "stays" },
    respond: () => ({ status: 200, data: { code } }),
  });
  assert.equal(await settle(), false);
  assert.deepEqual(seen.posts, [
    ["/api/move", { key, saves: { "darecade-v1": '{"xp":40}' } }],
  ]);
  assert.equal(seen.replaced, `${HOME}/?invite=abc#move=${code}`);
});

test("the old address still forwards a visitor with no session, an oversized save or no connection", async () => {
  const at = `https://${OLD_HOST}/#move-key=${key}`;
  let seen = browser(at, {
    respond: () => ({ status: 200, data: { code: null } }),
  });
  assert.equal(await settle(), false);
  assert.equal(seen.replaced, `${HOME}/`);

  seen = browser(at, {
    saves: { "darecade-v1": "big" },
    respond: (_, body) =>
      body.saves["darecade-v1"]
        ? { status: 413 }
        : { status: 200, data: { code } },
  });
  assert.equal(await settle(), false);
  assert.equal(seen.posts.length, 2);
  assert.equal(seen.replaced, `${HOME}/#move=${code}`);

  seen = browser(at, {
    respond: () => {
      throw Error("offline");
    },
  });
  assert.equal(await settle(), false);
  assert.equal(seen.replaced, `${HOME}/`);
});

test("the new address claims the code with its key, hides it and fills only empty saves", async () => {
  const seen = browser(`${HOME}/?invite=abc#move=${code}`, {
    saves: { "darecade-invite": "mine" },
    tab: { "play-simi-move-key": key },
    respond: () => ({
      status: 200,
      data: {
        saves: {
          "darecade-v1": '{"xp":40}',
          "darecade-invite": "theirs",
          other: "ignored",
        },
      },
    }),
  });
  assert.equal(await settle(), true);
  assert.deepEqual(seen.posts, [["/api/move/claim", { code, key }]]);
  assert.equal(seen.address, "/?invite=abc");
  assert.deepEqual(seen.tab, {});
  assert.deepEqual(seen.saves, {
    "darecade-invite": "mine",
    "darecade-v1": '{"xp":40}',
  });
});

test("a link carrying someone else's code is never claimed", async () => {
  const seen = browser(`${HOME}/#move=${code}`);
  assert.equal(await settle(), true);
  assert.equal(seen.posts.length, 0);
  assert.equal(seen.address, "/");
  assert.deepEqual(seen.saves, {});
});

test("the new address starts normally without a code, with a malformed one or when the claim fails", async () => {
  for (const hash of ["", "#move=not-a-code", "#other", `#move-key=${key}`]) {
    const seen = browser(`${HOME}/${hash}`, {
      tab: { "play-simi-move-key": key },
    });
    assert.equal(await settle(), true);
    assert.equal(seen.posts.length, 0, hash);
    assert.equal(seen.replaced, "", hash);
  }
  const seen = browser(`${HOME}/#move=${code}`, {
    tab: { "play-simi-move-key": key },
    respond: () => ({ status: 400 }),
  });
  assert.equal(await settle(), true);
  assert.equal(seen.address, "/");
  assert.deepEqual(seen.saves, {});
});
