import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { HOME, MOVE_KEYS, OLD_HOST, settle } from "../src/move.ts";
import { MOVE_KEYS as serverKeys } from "../server/community-core.mjs";

const code = "ab".repeat(32);
/** A browser at `href` with the given saves; records what the page does. */
function browser(
  href: string,
  saves: Record<string, string>,
  respond: (path: string, body: any) => { status: number; data?: unknown },
) {
  const url = new URL(href);
  const seen = {
    posts: [] as [string, any][],
    replaced: "",
    address: url.pathname + url.search + url.hash,
    saves: { ...saves } as Record<string, string>,
  };
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
    localStorage: {
      getItem: (key: string) => seen.saves[key] ?? null,
      setItem: (key: string, value: string) => (seen.saves[key] = value),
    },
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

test("the old address sends its saves, then leaves with the code, path and invite kept", async () => {
  const seen = browser(
    `https://${OLD_HOST}/?invite=abc`,
    { "darecade-v1": '{"xp":40}', unrelated: "stays" },
    () => ({ status: 200, data: { code } }),
  );
  assert.equal(await settle(), false);
  assert.deepEqual(seen.posts, [
    ["/api/move", { saves: { "darecade-v1": '{"xp":40}' } }],
  ]);
  assert.equal(seen.replaced, `${HOME}/?invite=abc#move=${code}`);
});

test("the old address still forwards a visitor with no session, an oversized save or no connection", async () => {
  let seen = browser(`https://${OLD_HOST}/`, {}, () => ({
    status: 200,
    data: { code: null },
  }));
  assert.equal(await settle(), false);
  assert.equal(seen.replaced, `${HOME}/`);

  seen = browser(`https://${OLD_HOST}/`, { "darecade-v1": "big" }, (_, body) =>
    body.saves["darecade-v1"]
      ? { status: 413 }
      : { status: 200, data: { code } },
  );
  assert.equal(await settle(), false);
  assert.equal(seen.posts.length, 2);
  assert.equal(seen.replaced, `${HOME}/#move=${code}`);

  seen = browser(`https://${OLD_HOST}/`, {}, () => {
    throw Error("offline");
  });
  assert.equal(await settle(), false);
  assert.equal(seen.replaced, `${HOME}/`);
});

test("the new address claims the code, hides it and fills only empty saves", async () => {
  const seen = browser(
    `${HOME}/?invite=abc#move=${code}`,
    { "darecade-invite": "mine" },
    () => ({
      status: 200,
      data: {
        saves: {
          "darecade-v1": '{"xp":40}',
          "darecade-invite": "theirs",
          other: "ignored",
        },
      },
    }),
  );
  assert.equal(await settle(), true);
  assert.deepEqual(seen.posts, [["/api/move/claim", { code }]]);
  assert.equal(seen.address, "/?invite=abc");
  assert.deepEqual(seen.saves, {
    "darecade-invite": "mine",
    "darecade-v1": '{"xp":40}',
  });
});

test("the new address starts normally without a code, with a malformed one or when the claim fails", async () => {
  for (const hash of ["", "#move=not-a-code", "#other"]) {
    const seen = browser(`${HOME}/${hash}`, {}, () => ({ status: 200 }));
    assert.equal(await settle(), true);
    assert.equal(seen.posts.length, 0, hash);
  }
  const seen = browser(`${HOME}/#move=${code}`, {}, () => ({ status: 400 }));
  assert.equal(await settle(), true);
  assert.equal(seen.address, "/");
  assert.deepEqual(seen.saves, {});
});
