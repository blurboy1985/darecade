import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import {
  Simulation,
  replayRun,
  type Input,
  type Replay,
} from "../shared/simulation.ts";
import { StarFlight } from "../src/action-games.ts";
import { itemLook } from "../src/wardrobe.ts";
import { fresh, normalise } from "../src/state.ts";
import { createPlazaRelay, advancePlazaRelay } from "../shared/plaza-relay.ts";

test("13+ consent needs no birth date; adult purchase confirmation is separate and preserves progress", () => {
  const directory = mkdtempSync(join(tmpdir(), "round6-")),
    store = new Store(":memory:");
  try {
    const c = new Community(store, { directory });
    assert.throws(() =>
      c.join({ over13: false, consent: true, privacyVersion: PRIVACY_VERSION }),
    );
    assert.throws(() =>
      c.join({ over13: true, consent: false, privacyVersion: PRIVACY_VERSION }),
    );
    const joined = c.join({
        over13: true,
        consent: true,
        privacyVersion: PRIVACY_VERSION,
      }),
      p = joined.me;
    const room = c.relay.request(
      p.id,
      "create",
      { solo: true, difficulty: "standard", course: "plaza" },
      joined.token,
    );
    assert.equal(room.status, "waiting");
    const before = c.privateProfile(p.id);
    assert.equal(before.purchasesConfirmed, false);
    assert.throws(() => c.confirmAdult(p.id, { over18: false }));
    const after = c.confirmAdult(p.id, { over18: true });
    assert.equal(after.purchasesConfirmed, true);
    assert.equal(after.ageBand, "13+");
    assert.deepEqual(after.progress, before.progress);
    const old = c.join({
      month: 1,
      year: 2000,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    }).me;
    assert.equal(c.privateProfile(old.id).purchasesConfirmed, false);
    assert.equal(c.privateProfile(old.id).ageBand, "18+");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("zero score grants no XP, cap, tokens or medals, including an idempotent retry", () => {
  const directory = mkdtempSync(join(tmpdir(), "round6-zero-"));
  let time = Date.now();
  const store = new Store(":memory:", () => time);
  try {
    const c = new Community(store, { directory }),
      id = c.join({
        over13: true,
        consent: true,
        privacyVersion: PRIVACY_VERSION,
      }).me.id;
    const run = c.begin(id, "swarm"),
      s = new Simulation("swarm", run.seed, 3),
      input: Input = [0, 0, -1, 0, -1, -1];
    while (!s.ended) s.advance(input);
    time += 13000;
    const data = {
      id: run.id,
      score: s.score,
      replay: { version: 3, ticks: s.ticks, events: [[0, ...input]] },
    };
    const result = c.finish(id, data);
    assert.equal(result.score, 0);
    assert.equal(result.earnedXp, 0);
    assert.equal(result.profile.progress.xp, 0);
    assert.equal(result.profile.progress.rounds, 0);
    assert.equal(result.welcome, false);
    assert.equal(c.finish(id, data).earnedXp, 0);
    assert.equal(result.profile.progress.unlockedHats.includes(2), false);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("one nudge cannot farm Swarm, and the first 20 seconds provide a consistent warm-up", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = new Simulation("swarm", seed, 3);
    while (!s.ended) s.advance([s.ticks < 8 ? 1 : 0, 0, -1, 0, -1, -1]);
    assert.equal(s.score, 0);
    const warm = new Simulation("swarm", seed, 3);
    while (warm.ticks < 1200 && !warm.ended)
      warm.advance([
        Math.floor(warm.ticks / 110) % 2 ? 1 : -1,
        0,
        -1,
        0,
        -1,
        -1,
      ]);
    assert.equal(warm.ended, false, `seed ${seed}`);
  }
});
test("version 2 replays retain original rules while version 3 supports a real 60-second run", () => {
  for (const version of [2, 3]) {
    const s = new Simulation("swarm", 1, version),
      events: Replay["events"] = [];
    let previous = "";
    while (!s.ended) {
      const input: Input = [
        Math.floor(s.ticks / 110) % 2 ? 1 : -1,
        0,
        -1,
        0,
        -1,
        -1,
      ];
      const stamp = JSON.stringify(input);
      if (stamp !== previous) {
        events.push([s.ticks, ...input]);
        previous = stamp;
      }
      s.advance(input);
    }
    assert.equal(
      replayRun("swarm", 1, { version, ticks: s.ticks, events }).score,
      s.score,
    );
    if (version === 3) assert.ok(s.elapsed > 60);
  }
});
test("shield pills appear by 20 seconds and again 22 seconds later, without restoring health", () => {
  const s = new StarFlight();
  s.elapsed = 19.99;
  s.activeSeconds = 3;
  s.lives = 2;
  s.tick(0.02, 1);
  assert.equal(s.pickups.length, 1);
  s.pickups = [];
  s.elapsed = 41.99;
  s.tick(0.02, -1);
  assert.equal(s.pickups.length, 1);
  assert.equal(s.lives, 2);
});
test("helmet and tricorn retain chosen hair, and every rooftop ID survives save normalisation", () => {
  const p = fresh();
  p.hair = 38;
  p.baseHair = 38;
  for (const hat of [6, 25]) {
    const look = itemLook("hair", hat, p);
    assert.equal(look.baseHair, 38);
    assert.equal(look.hair, hat);
  }
  const ids = ["arcade", "shop", "dragon", "arcade-east", "shop-east"];
  assert.deepEqual(
    normalise({ ...p, roofDay: "2026-10-06", roofStars: ids }, fresh())
      .roofStars,
    ids,
  );
});
test("Relay grid is separated; connected idle runner is not replaced before 45 seconds", () => {
  const s = createPlazaRelay([0]);
  assert.equal(new Set(s.runners.map((r) => `${r.x},${r.z}`)).size, 8);
  // Hold rivals away from gates to exercise the idle timeout independently of a race finish.
  s.runners.forEach((r) => (r.bot = false));
  for (let tick = 0; tick < 2700; tick++) advancePlazaRelay(s);
  assert.equal(s.runners[0].bot, false);
  advancePlazaRelay(s);
  assert.equal(s.runners[0].bot, true);
});
