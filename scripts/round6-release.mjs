import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Simulation } from "../shared/simulation.ts";
import { PRIVACY_VERSION } from "../server/community-core.mjs";
// Creates one disposable guest, never sends email or creates a checkout, and
// deletes only that guest in finally. Do not use this as a production load test.
const origin = "https://playsimi.danielquek.com";
const report = {
  origin,
  checkedAt: new Date().toISOString(),
  assets: [],
  checks: [],
  cleanup: [],
};
let cookie;
const hash = (b) => createHash("sha256").update(b).digest("hex");
async function api(path, data, status = 200) {
  const r = await fetch(`${origin}/api/${path}`, {
    method: data === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      ...(cookie ? { Cookie: cookie } : {}),
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    signal: AbortSignal.timeout(20000),
  });
  if (path === "auth/join") cookie = r.headers.get("set-cookie")?.split(";")[0];
  const body = await r.json();
  assert.equal(r.status, status, `${path}: ${JSON.stringify(body)}`);
  return body;
}
try {
  const r = await fetch(origin, { signal: AbortSignal.timeout(20000) });
  assert.equal(r.status, 200);
  const html = await r.text();
  const local = readFileSync("dist/index.html", "utf8");
  for (const [, asset] of local.matchAll(/(?:src|href)="(\/assets\/[^\"]+)"/g))
    assert.ok(html.includes(asset), `entry ${asset}`);
  report.checks.push("Live HTML references the local build entries");
  const files = readdirSync("dist/assets")
    .filter((f) => /\.(js|css)$/.test(f))
    .map((f) => "assets/" + f)
    .concat([
      "models/neighbour-chibi2.glb",
      "hoops-card.svg",
      "fishing-card.svg",
      "wardrobe/hair-0.png",
      "wardrobe/hair-38.png",
      "wardrobe/hair-132.png",
      "wardrobe/sets--1.png",
    ]);
  for (const path of files) {
    const asset = await fetch(`${origin}/${path}`, {
      signal: AbortSignal.timeout(20000),
    });
    assert.equal(asset.status, 200, path);
    const digest = hash(Buffer.from(await asset.arrayBuffer()));
    assert.equal(digest, hash(readFileSync("dist/" + path)), path);
    report.assets.push({ path, sha256: digest });
  }
  assert.equal((await api("health")).ready, true);
  assert.equal(await api("auth/session"), null);
  report.checks.push(
    "Health ready and anonymous session returns 200 without a 401",
  );
  await api("auth/join", {
    over13: true,
    consent: true,
    privacyVersion: PRIVACY_VERSION,
  });
  assert.ok(cookie);
  const before = await api("auth/me");
  assert.equal(before.purchasesConfirmed, false);
  assert.equal(before.ageBand, "13+");
  const adult = await api("auth/adult", { over18: true });
  assert.equal(adult.purchasesConfirmed, true);
  assert.deepEqual(adult.progress, before.progress);
  report.checks.push(
    "Birth-date-free consent and separate adult confirmation preserve guest progress",
  );
  const products = await api("payments/config");
  assert.ok(products.products.length >= 20);
  report.checks.push(
    "Existing purchase catalogue available; no checkout was created",
  );
  const room = await api("relay/create", {
    solo: true,
    difficulty: "standard",
    course: "plaza",
  });
  await api("relay/ready", { room: room.room, ready: true });
  const started = await api("relay/start", { room: room.room });
  assert.equal(started.status, "running");
  await api("relay/leave", {
    room: room.room,
    controlEpoch: room.controlEpoch,
  });
  report.checks.push("13+ guest CPU Relay starts and leaves cleanly");
  const run = await api("run", { game: "swarm" }),
    s = new Simulation("swarm", run.seed, 3),
    input = [0, 0, -1, 0, -1, -1];
  while (!s.ended) s.advance(input);
  assert.equal(s.score, 0);
  await new Promise((resolve) => setTimeout(resolve, 13000));
  const data = {
    id: run.id,
    score: 0,
    replay: { version: 3, ticks: s.ticks, events: [[0, ...input]] },
  };
  const finished = await api("finish", data);
  assert.equal(finished.earnedXp, 0);
  assert.equal(finished.profile.progress.xp, before.progress.xp);
  assert.equal(finished.profile.progress.rounds, 0);
  assert.equal((await api("finish", data)).earnedXp, 0);
  report.checks.push(
    "Live validated zero-score Swarm run grants zero XP and retry grants nothing",
  );
  const exported = await api("privacy/export");
  assert.ok(exported.profile);
  report.checks.push("Guest export works");
} finally {
  if (cookie) {
    await api("privacy/delete", { confirm: "DELETE" });
    assert.equal(await api("auth/session"), null);
    report.cleanup.push("Disposable guest deleted and session revoked");
  }
  writeFileSync(
    ".browser/round6-production-verification.json",
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
}
