import test from "node:test";
import assert from "node:assert/strict";
import {
  STAGE_TICKS,
  StageShow,
  stageBeat,
  stageChart,
  type StageMode,
} from "../shared/stage.ts";
import { stageBeats, stageSong } from "../src/stage-song.ts";

const MODES: StageMode[] = ["warmup", "show", "encore"];

test("a song counts in, then keeps the chart's beat to the end of the show", () => {
  for (const mode of MODES) {
    const beats = stageBeats(mode),
      first = stageChart(7, mode)[0].tick;
    assert.equal(beats[3], first, "the first arrow is the first full beat");
    assert.ok(beats[0] >= 0, "the count-in fits before it");
    for (let i = 1; i < beats.length; i++)
      assert.equal(
        beats[i] - beats[i - 1],
        stageBeat(i <= 3 ? first : beats[i - 1], mode),
      );
    const song = stageSong(7, mode, stageChart(7, mode));
    const kicks = song.filter((s) => s.kind === "kick").map((s) => s.tick);
    assert.deepEqual(
      kicks.slice(0, -1),
      beats.slice(3),
      "a kick on every beat",
    );
    assert.deepEqual(
      song.slice(0, 3).map((s) => [s.kind, s.tick]),
      beats.slice(0, 3).map((tick) => ["hat", tick]),
      "three clicks before the first arrow",
    );
    for (const [i, sound] of song.entries()) {
      assert.ok(sound.tick >= 0 && sound.tick < STAGE_TICKS);
      assert.ok(sound.ticks > 0);
      if (i) assert.ok(sound.tick >= song[i - 1].tick, "in the order heard");
      assert.equal(
        sound.note > 0,
        ["bass", "chord", "lead"].includes(sound.kind),
      );
    }
    // The song lands on a last chord after the last arrow.
    assert.equal(song.at(-1)!.kind, "chord");
    assert.ok(song.at(-1)!.tick > stageChart(7, mode).at(-1)!.tick);
  }
});

test("every arrow is a note of the tune, on a drum or a hi-hat, pitched by its lane", () => {
  for (const mode of MODES)
    for (const seed of [3, 7, 42]) {
      const notes = new StageShow(seed, mode).notes,
        song = stageSong(seed, mode, notes),
        lead = song.filter((s) => s.kind === "lead"),
        rhythm = new Set(
          song
            .filter((s) => s.kind === "kick" || s.kind === "hat")
            .map((s) => s.tick),
        );
      assert.deepEqual(
        lead.map((s) => s.tick),
        notes.map((n) => n.tick),
      );
      for (const [i, note] of notes.entries()) {
        assert.ok(rhythm.has(note.tick), `${mode} ${seed} tick ${note.tick}`);
        // Within one bar's chord, a lane further right is a higher note.
        const before = notes[i - 1];
        if (before && before.tick === note.tick)
          assert.equal(
            lead[i].note > lead[i - 1].note,
            note.lane > before.lane,
          );
      }
      assert.deepEqual(
        song,
        stageSong(seed, mode, notes),
        "the same every time",
      );
    }
  const chords = (seed: number) =>
    stageSong(seed, "show", stageChart(seed))
      .filter((s) => s.kind === "chord")
      .map((s) => s.note)
      .join();
  assert.notEqual(chords(0), chords(1), "seeds choose different chords");
});
