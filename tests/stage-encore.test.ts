import test from "node:test";
import assert from "node:assert/strict";
import {
  STAGE_FEVER_PERFECT,
  STAGE_FEVER_TICKS,
  STAGE_GOOD,
  STAGE_GREAT,
  STAGE_LANES,
  STAGE_TICKS,
  StageShow,
  stageChart,
  stageMaxScore,
  stageStars,
  type StageMode,
} from "../shared/stage.ts";
import { STAGE_SCORE_LIMIT } from "../src/state.ts";

/** Plays every note perfectly, lighting Fever whenever `fever` allows it. */
function play(
  seed: number,
  mode: StageMode,
  fever: (show: StageShow) => boolean = () => false,
) {
  const show = new StageShow(seed, mode);
  const pressed = [false, false, false, false];
  while (!show.ended) {
    pressed.fill(false);
    for (const n of show.notes)
      if (n.tick === show.tick + 1) pressed[n.lane] = true;
    if (fever(show)) show.ignite();
    show.advance(pressed);
  }
  return show;
}

test("an encore is seeded, faster than the show, and has double arrows that can be told apart", () => {
  for (const seed of [1, 7, 42, 2 ** 31 - 1]) {
    const chart = stageChart(seed, "encore"),
      original = stageChart(seed);
    assert.deepEqual(chart, stageChart(seed, "encore"));
    assert.ok(
      chart.length > original.length * 1.15,
      `${chart.length} notes against ${original.length}`,
    );
    let doubles = 0;
    for (const [i, n] of chart.entries()) {
      assert.ok(n.lane >= 0 && n.lane < STAGE_LANES);
      assert.ok(n.tick >= 120 && n.tick < STAGE_TICKS);
      if (!i) continue;
      const before = chart[i - 1];
      assert.ok(n.tick >= before.tick, "in order");
      if (n.tick === before.tick) {
        doubles++;
        assert.notEqual(n.lane, before.lane, "a double is two lanes");
      }
    }
    assert.ok(doubles >= 8, `${doubles} double arrows`);
    assert.ok(
      chart.every(
        (n, i) =>
          chart.filter((m, j) => j !== i && m.tick === n.tick).length <= 1,
      ),
      "never three at once",
    );
    // Two notes in one lane keep their Great windows apart, and a press on
    // one is never inside the other's window at all.
    for (let lane = 0; lane < STAGE_LANES; lane++) {
      const ticks = chart.filter((n) => n.lane === lane).map((n) => n.tick);
      for (let i = 1; i < ticks.length; i++) {
        assert.ok(ticks[i] - ticks[i - 1] > 2 * STAGE_GREAT);
        assert.ok(ticks[i] - ticks[i - 1] > STAGE_GOOD);
      }
    }
  }
  assert.notDeepEqual(stageChart(7, "encore"), stageChart(8, "encore"));
});

test("a perfect encore lands every note, and an idle one is booed off like a show", () => {
  const perfect = play(7, "encore");
  assert.equal(perfect.counts.perfect, perfect.notes.length);
  assert.equal(perfect.counts.miss + perfect.counts.stray, 0);
  assert.equal(perfect.score, stageMaxScore(7, "encore"));
  assert.equal(stageStars(perfect.score, stageMaxScore(7, "encore")), 3);
  assert.ok(stageMaxScore(7, "encore") > stageMaxScore(7));
  const idle = new StageShow(7, "encore");
  while (!idle.ended) idle.advance([false, false, false, false]);
  assert.equal(idle.booed, true);
  assert.ok(idle.tick < STAGE_TICKS / 2);
});

test("Fever fills with hits, doubles points while lit, and leaves the timing score alone", () => {
  const plain = play(7, "show");
  assert.equal(plain.fevers, 0);
  assert.equal(plain.fever, 1, "an unspent meter stays full");
  assert.equal(plain.baseScore, plain.score);

  const lit = play(7, "show", (show) => show.fever >= 1);
  assert.ok(lit.fevers >= 2, `${lit.fevers} Fevers in a perfect show`);
  assert.equal(lit.baseScore, plain.score, "stars are judged on timing alone");
  assert.ok(lit.score > plain.score * 1.15);
  assert.ok(lit.score < plain.score * 2);
  assert.equal(
    stageStars(lit.baseScore, stageMaxScore(7)),
    stageStars(plain.score, stageMaxScore(7)),
  );

  // The meter needs twenty perfect notes, and cannot be lit before then.
  const show = new StageShow(7);
  const pressed = [false, false, false, false];
  const hit = () => {
    do {
      assert.equal(show.ended, false, "the song is long enough for this");
      pressed.fill(false);
      for (const n of show.notes)
        if (n.tick === show.tick + 1) pressed[n.lane] = true;
      show.advance(pressed);
    } while (!pressed.includes(true));
  };
  assert.equal(show.ignite(), false);
  const needed = Math.round(1 / STAGE_FEVER_PERFECT);
  for (let i = 0; i < needed - 1; i++) hit();
  assert.ok(show.fever < 1);
  assert.equal(show.ignite(), false);
  hit();
  assert.equal(show.fever, 1);
  const before = show.score,
    base = show.baseScore;
  assert.equal(show.ignite(), true);
  assert.deepEqual(
    [show.fever, show.feverTicks, show.fevers],
    [0, STAGE_FEVER_TICKS, 1],
  );
  assert.equal(show.ignite(), false, "Fever cannot be lit twice at once");
  hit();
  assert.equal(show.score - before, (show.baseScore - base) * 2);
  assert.equal(show.fever, 0, "the meter rests while Fever is lit");
  while (show.feverTicks > 0) hit();
  // Five seconds later the points are single again.
  const after = show.score,
    afterBase = show.baseScore;
  hit();
  assert.equal(show.score - after, show.baseScore - afterBase);
});

test("warm-up has no Fever, and no show can outgrow the score the server accepts", () => {
  const warmup = play(7, "warmup", () => true);
  assert.deepEqual([warmup.fever, warmup.fevers, warmup.feverTicks], [0, 0, 0]);
  assert.equal(warmup.baseScore, warmup.score);
  for (const seed of [1, 7, 42, 99, 123456, 2 ** 31 - 1])
    for (const mode of ["show", "encore"] as const) {
      const best = play(seed, mode, (show) => show.fever >= 1);
      assert.ok(
        best.score < STAGE_SCORE_LIMIT,
        `${mode} ${seed}: ${best.score}`,
      );
    }
});
