import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  STAGE_GOOD,
  STAGE_LANES,
  STAGE_PERFECT,
  STAGE_TICKS,
  STAGE_WARMUP_GOAL,
  StageShow,
  stageChart,
  stageMaxScore,
  stageStars,
} from "../shared/stage.ts";
import {
  fresh,
  normalise,
  performShow,
  STAGE_DAILY_XP,
  STAGE_REST_MS,
} from "../src/state.ts";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";

/** Plays every note, each pressed `late` ticks after it reaches the line. */
function play(seed: number, late: number, skip = 0) {
  const show = new StageShow(seed);
  const pressed = [false, false, false, false];
  while (!show.ended) {
    pressed.fill(false);
    show.notes.forEach((n, i) => {
      if (n.tick + late === show.tick + 1 && (!skip || i % skip))
        pressed[n.lane] = true;
    });
    show.advance(pressed);
  }
  return show;
}

test("a stage song is seeded, quickens, and stays inside the show", () => {
  const chart = stageChart(42);
  assert.deepEqual(chart, stageChart(42));
  assert.notDeepEqual(chart, stageChart(43));
  assert.ok(chart.length > 80 && chart.length < 140, `${chart.length} notes`);
  for (const [i, n] of chart.entries()) {
    assert.ok(n.lane >= 0 && n.lane < STAGE_LANES);
    assert.ok(n.tick >= 120 && n.tick < STAGE_TICKS);
    if (i)
      assert.ok(n.tick > chart[i - 1].tick, "one note at a time, in order");
  }
  const half = STAGE_TICKS / 2;
  assert.ok(
    chart.filter((n) => n.tick >= half).length >
      chart.filter((n) => n.tick < half).length * 1.2,
    "the second half is busier",
  );
});

test("timing decides the score: perfect beats good, and combos multiply", () => {
  const perfect = play(7, 0),
    close = play(7, STAGE_PERFECT),
    good = play(7, STAGE_GOOD),
    gappy = play(7, 0, 6);
  assert.equal(perfect.counts.perfect, perfect.notes.length);
  assert.equal(perfect.score, stageMaxScore(7));
  assert.equal(close.score, perfect.score);
  assert.equal(good.counts.good, good.notes.length);
  assert.ok(good.score < perfect.score * 0.55);
  assert.equal(perfect.bestCombo, perfect.notes.length);
  assert.equal(perfect.multiplier, 3);
  // Dropping every sixth note keeps breaking the combo.
  assert.ok(gappy.bestCombo < 8);
  assert.equal(gappy.booed, false);
  assert.ok(gappy.score < perfect.score * 0.45);
  assert.equal(stageStars(perfect.score, perfect.score), 3);
  assert.equal(stageStars(good.score, perfect.score), 1);
  assert.equal(stageStars(0, perfect.score), 0);
  assert.equal(perfect.tick, STAGE_TICKS);
});

test("misses and stray presses drain the hype until the show is booed off", () => {
  const idle = play(7, 99999);
  assert.equal(idle.booed, true);
  assert.equal(idle.score, 0);
  assert.ok(idle.tick < STAGE_TICKS / 2, "an idle show ends early");
  assert.equal(idle.counts.miss, 5);
  // Mashing every lane costs hype too, so it cannot stand in for timing.
  const mash = new StageShow(7);
  while (!mash.ended) mash.advance([true, true, true, true]);
  assert.equal(mash.booed, true);
  assert.ok(mash.tick < 120);
  const after = mash.score;
  mash.advance([true, true, true, true]);
  assert.equal(mash.score, after);
  // Just outside the window is a miss, not a late hit.
  const late = play(7, STAGE_GOOD + 1);
  assert.equal(late.counts.perfect + late.counts.good, 0);
});

test("the default and explicit Show retain the original seeded chart and rewards score", () => {
  assert.deepEqual(stageChart(7), stageChart(7, "show"));
  assert.equal(stageChart(7).length, 106);
  assert.equal(stageMaxScore(7), 27800);
  assert.equal(stageMaxScore(7, "show"), 27800);
  const original = new StageShow(7),
    explicit = new StageShow(7, "show");
  while (!original.ended) {
    original.advance([false, false, false, false]);
    explicit.advance([false, false, false, false]);
  }
  assert.deepEqual(original, explicit);
  assert.equal(original.tick, 253);
  assert.equal(original.counts.miss, 5);
  assert.equal(original.booed, true);
});

test("warm-up has a 2.5-second lead-in, two alternating lanes and slower notes without offbeats", () => {
  const chart = stageChart(7, "warmup");
  assert.deepEqual(chart, stageChart(42, "warmup"));
  assert.equal(chart[0].tick, 150);
  assert.equal(chart.length, 25);
  for (const [i, note] of chart.entries()) {
    assert.equal(note.lane, i % 2 ? 3 : 0);
    if (i) assert.equal(note.tick - chart[i - 1].tick, 90);
  }
  assert.ok(chart[chart.length - 1].tick < STAGE_TICKS);
});

test("an idle warm-up completes all forty seconds without booing", () => {
  const warmup = new StageShow(7, "warmup");
  while (!warmup.ended) warmup.advance([false, false, false, false]);
  assert.equal(warmup.tick, STAGE_TICKS);
  assert.equal(warmup.mode, "warmup");
  assert.equal(warmup.booed, false);
  assert.equal(warmup.score, 0);
  assert.equal(warmup.counts.miss, warmup.notes.length);
});

test("five timed warm-up hits meet the practice goal and later misses cannot end it early", () => {
  const warmup = new StageShow(7, "warmup");
  while (!warmup.ended) {
    const pressed = [false, false, false, false];
    for (const note of warmup.notes.slice(0, STAGE_WARMUP_GOAL))
      if (note.tick === warmup.tick + 1) pressed[note.lane] = true;
    warmup.advance(pressed);
  }
  assert.equal(warmup.counts.perfect, STAGE_WARMUP_GOAL);
  assert.equal(warmup.counts.good, 0);
  assert.equal(warmup.bestCombo, STAGE_WARMUP_GOAL);
  assert.equal(warmup.score, 500);
  assert.equal(warmup.counts.miss, warmup.notes.length - STAGE_WARMUP_GOAL);
  assert.equal(warmup.tick, STAGE_TICKS);
  assert.equal(warmup.booed, false);
});

test("warm-up stray taps never end the lesson early, and perfect-score calculation uses its chart", () => {
  const mash = new StageShow(7, "warmup"),
    perfect = new StageShow(7, "warmup");
  while (!mash.ended) mash.advance([true, true, true, true]);
  assert.equal(mash.tick, STAGE_TICKS);
  assert.equal(mash.booed, false);
  assert.ok(mash.counts.stray > 0);
  while (!perfect.ended) {
    const pressed = [false, false, false, false];
    for (const note of perfect.notes)
      if (note.tick === perfect.tick + 1) pressed[note.lane] = true;
    perfect.advance(pressed);
  }
  assert.equal(perfect.counts.perfect, perfect.notes.length);
  assert.equal(perfect.score, stageMaxScore(7, "warmup"));
  const after = perfect.score;
  perfect.advance([true, true, true, true]);
  assert.equal(perfect.score, after);
});

test("the server pays five XP a star, capped per day, and refuses rapid or malformed reports", () => {
  const s = fresh();
  let now = 1_000_000;
  assert.equal(
    performShow(s, { score: 5000, stars: 3 }, now, "2026-10-04"),
    15,
  );
  assert.equal(s.stageBest, 5000);
  assert.equal(
    performShow(
      s,
      { score: 9000, stars: 3 },
      now + STAGE_REST_MS - 1,
      "2026-10-04",
    ),
    null,
    "a second show cannot finish this soon",
  );
  assert.equal(s.xp, 15);
  for (const bad of [
    null,
    { score: 1, stars: 4 },
    { score: -1, stars: 1 },
    { score: 1e9, stars: 1 },
    { score: 1.5, stars: 1 },
    { stars: 2 },
  ])
    assert.equal(
      performShow(s, bad, now + 10 * STAGE_REST_MS, "2026-10-04"),
      null,
    );
  for (let i = 0; i < 5; i++) {
    now += STAGE_REST_MS;
    performShow(s, { score: 100, stars: 3 }, now, "2026-10-04");
  }
  assert.equal(s.stageXp, STAGE_DAILY_XP);
  assert.equal(s.xp, STAGE_DAILY_XP);
  assert.equal(s.stageBest, 5000, "a lower score never replaces the best");
  now += STAGE_REST_MS;
  assert.equal(performShow(s, { score: 100, stars: 2 }, now, "2026-10-05"), 10);
  assert.equal(s.stageXp, 10);
  const again = normalise(JSON.parse(JSON.stringify(s)), fresh());
  assert.equal(again.stageBest, 5000);
  assert.equal(again.stageDay, "2026-10-05");
  const bad = normalise(
    { stageBest: 1e12, stageXp: 999, stageDay: "soon" },
    fresh(),
  );
  assert.equal(bad.stageXp, STAGE_DAILY_XP);
  assert.equal(bad.stageDay, "");

  const directory = mkdtempSync(join(tmpdir(), "darecade-stage-"));
  let time = Date.parse("2026-10-04T09:00:00+08:00");
  const store = new Store(":memory:", () => time),
    community = new Community(store, { directory });
  try {
    const { me } = community.join({
      month: 1,
      year: 2000,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    });
    const go = (event: string, value?: unknown) =>
      community.progression(me.id, event, value).progress;
    assert.equal(go("visit", "stage").xp, 0);
    assert.equal(go("perform", { score: 3000, stars: 2 }).xp, 10);
    assert.throws(() => go("perform", { score: 3000, stars: 3 }), /breath/);
    time += STAGE_REST_MS;
    assert.throws(() => go("perform", { score: 3000, stars: 9 }), /breath/);
    assert.equal(
      community.patch(me.id, { xp: 9999, stageBest: 99999, stageXp: 0 })
        .progress.xp,
      10,
      "a settings change cannot grant stage XP",
    );
    assert.equal(community.privateProfile(me.id).progress.stageBest, 3000);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
