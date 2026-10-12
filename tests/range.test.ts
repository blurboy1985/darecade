import test from "node:test";
import assert from "node:assert/strict";
import { ranged, wholeFile } from "../cloudflare/range.mjs";

const film = () =>
  new Response(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), {
    headers: { "Content-Type": "video/mp4", ETag: '"a"' },
  });
const bytes = async (r: Response) => [...new Uint8Array(await r.arrayBuffer())];

test("a byte range of the intro film comes back as 206 with its place in the file", async () => {
  const part = await ranged(film(), "bytes=2-5");
  assert.equal(part.status, 206);
  assert.equal(part.headers.get("Content-Range"), "bytes 2-5/10");
  assert.equal(part.headers.get("Content-Length"), "4");
  assert.equal(part.headers.get("Content-Type"), "video/mp4");
  assert.deepEqual(await bytes(part), [2, 3, 4, 5]);
  // Safari's first question is for two bytes.
  assert.deepEqual(await bytes(await ranged(film(), "bytes=0-1")), [0, 1]);
});

test("open-ended, suffix and over-long ranges stay inside the file", async () => {
  assert.deepEqual(await bytes(await ranged(film(), "bytes=7-")), [7, 8, 9]);
  assert.deepEqual(await bytes(await ranged(film(), "bytes=-3")), [7, 8, 9]);
  const long = await ranged(film(), "bytes=8-500");
  assert.equal(long.headers.get("Content-Range"), "bytes 8-9/10");
  assert.deepEqual(await bytes(long), [8, 9]);
});

test("a range past the end is refused and anything unreadable gets the whole film", async () => {
  const past = await ranged(film(), "bytes=10-12");
  assert.equal(past.status, 416);
  assert.equal(past.headers.get("Content-Range"), "bytes */10");
  for (const odd of ["bytes=-", "items=0-1", "bytes=0-1,4-5", ""]) {
    const whole = await ranged(film(), odd);
    assert.equal(whole.status, 200, odd);
    assert.equal(whole.headers.get("Accept-Ranges"), "bytes");
    assert.equal((await bytes(whole)).length, 10);
  }
  const missing = await ranged(new Response("no", { status: 404 }), "bytes=0-1");
  assert.equal(missing.status, 404);
});

test("the asset is asked for whole and without conditions", () => {
  const asked = wholeFile(
    new Request("https://example.test/intro/story-vertical.mp4", {
      headers: { Range: "bytes=0-1", "If-None-Match": '"a"', Accept: "*/*" },
    }),
  );
  assert.equal(asked.headers.get("range"), null);
  assert.equal(asked.headers.get("if-none-match"), null);
  assert.equal(asked.headers.get("accept"), "*/*");
  assert.equal(asked.url, "https://example.test/intro/story-vertical.mp4");
});
