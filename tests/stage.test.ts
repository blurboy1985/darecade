import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  STAGE_GOOD,
  STAGE_GREAT,
  STAGE_LANES,
  STAGE_PERFECT,
  STAGE_TICKS,
  STAGE_WARMUP_GOAL,
  StageShow,
  stageBeat,
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

test("a press is Perfect, Great or Good by how close it is, early or late", () => {
  const max = stageMaxScore(7);
  for (const late of [STAGE_PERFECT + 1, STAGE_GREAT, -STAGE_GREAT]) {
    const great = play(7, late);
    assert.equal(great.counts.great, great.notes.length, `${late} ticks`);
    assert.equal(great.score, max * 0.75);
    assert.equal(great.booed, false);
    assert.equal(stageStars(great.score, max), 2);
  }
  for (const late of [STAGE_GREAT + 1, STAGE_GOOD, -STAGE_GOOD]) {
    const good = play(7, late);
    assert.equal(good.counts.good, good.notes.length, `${late} ticks`);
    assert.equal(good.score, max * 0.5);
  }
  // A fifth of a second either side still lands: kinder than the old 150 ms.
  assert.ok(STAGE_GOOD / 60 >= 0.2);
  assert.ok(STAGE_PERFECT < STAGE_GREAT && STAGE_GREAT < STAGE_GOOD);
  const early = play(7, -STAGE_GOOD - 1);
  assert.equal(
    early.counts.perfect + early.counts.great + early.counts.good,
    0,
  );
  assert.ok(early.counts.stray > 0, "too soon is a stray press");
  // Great fills the Fever bar and the hype between Perfect and Good.
  const one = (late: number) => {
    const show = new StageShow(7);
    while (show.tick < show.notes[0].tick + late - 1)
      show.advance([false, false, false, false]);
    const pressed = [false, false, false, false];
    pressed[show.notes[0].lane] = true;
    show.advance(pressed);
    return show;
  };
  const [perfect, great, good] = [0, STAGE_GREAT, STAGE_GOOD].map(one);
  assert.deepEqual(
    [perfect, great, good].map((s) => s.last?.judgement),
    ["perfect", "great", "good"],
  );
  assert.ok(perfect.fever > great.fever && great.fever > good.fever);
  assert.ok(perfect.hype > great.hype && great.hype > good.hype);
  assert.ok(good.hype > 0.5);
});

test("every arrow of every session falls on a beat or half-beat of its song", () => {
  for (const mode of ["warmup", "show", "encore"] as const)
    for (const seed of [1, 7, 42]) {
      const first = mode === "warmup" ? 150 : 120,
        beats = new Set<number>();
      for (let tick = first; tick < STAGE_TICKS; ) {
        const beat = stageBeat(tick, mode);
        beats.add(tick).add(tick + Math.round(beat / 2));
        tick += beat;
      }
      for (const note of stageChart(seed, mode))
        assert.ok(beats.has(note.tick), `${mode} ${seed} tick ${note.tick}`);
    }
  // The beat quickens from 100 to about 165 a minute.
  assert.equal(stageBeat(0), 36);
  assert.equal(stageBeat(STAGE_TICKS - 61), 22);
  assert.equal(stageBeat(0, "encore"), 32);
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
  assert.equal(late.counts.perfect + late.counts.great + late.counts.good, 0);
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
  // The fifth note is missed once the Good window has passed it.
  assert.equal(original.tick, original.notes[4].tick + STAGE_GOOD + 1);
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
test("zero-score Stage reports cannot grant stars or XP", () => {
  const s = fresh();
  assert.equal(
    performShow(s, { score: 0, stars: 3 }, Date.now(), "2026-10-06"),
    0,
  );
  assert.equal(s.xp, 0);
  assert.equal(s.stageXp, 0);
});
