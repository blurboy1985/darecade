// The Open Stage's song, written from the chart: drums and bass keep the
// chart's beat, and every arrow is a note of the tune. Pure data, no audio.
import {
  STAGE_TICKS,
  stageBeat,
  type StageMode,
  type StageNote,
} from "../shared/stage.ts";

export type StageSound = {
  tick: number;
  kind: "kick" | "snare" | "hat" | "bass" | "chord" | "lead";
  /** A MIDI note for bass, chord and lead; 0 for the drums. */
  note: number;
  /** How long it sounds, in ticks. */
  ticks: number;
};

// Four bars each, in E minor, so the Perfect chime's B and E sit in every chord.
const E = [40, 43, 47],
  C = [36, 40, 43],
  G = [43, 47, 50],
  D = [38, 42, 45];
const PROGRESSIONS = [
  [E, C, G, D],
  [E, G, D, C],
  [C, D, E, E],
  [G, D, E, C],
];
/** Beats counted in before the first arrow. */
const COUNT_IN = 3;

/** The beats of a song: a count-in, then every beat the chart steps through. */
export function stageBeats(mode: StageMode = "show") {
  const first = mode === "warmup" ? 150 : 120,
    beats: number[] = [];
  for (let i = COUNT_IN; i > 0; i--)
    beats.push(first - i * stageBeat(first, mode));
  for (let tick = first; tick < STAGE_TICKS - 60; tick += stageBeat(tick, mode))
    beats.push(tick);
  return beats;
}

/** Every sound of the song for these notes, in the order it is heard. */
export function stageSong(
  seed: number,
  mode: StageMode,
  notes: readonly StageNote[],
) {
  const beats = stageBeats(mode),
    chords = PROGRESSIONS[(seed >>> 0) % PROGRESSIONS.length],
    chordAt = (beat: number) =>
      chords[Math.floor(Math.max(0, beat - COUNT_IN) / 4) % chords.length],
    song: StageSound[] = [];
  let next = 0;
  beats.forEach((tick, i) => {
    const beat = stageBeat(tick, mode),
      half = Math.round(beat / 2);
    if (i < COUNT_IN) {
      // Three clicks give the tempo before the first arrow.
      song.push({ tick, kind: "hat", note: 0, ticks: 3 });
      return;
    }
    const chord = chordAt(i),
      pos = (i - COUNT_IN) % 4;
    song.push({ tick, kind: "kick", note: 0, ticks: 8 });
    if (pos % 2) song.push({ tick, kind: "snare", note: 0, ticks: 7 });
    song.push({ tick: tick + half, kind: "hat", note: 0, ticks: 3 });
    song.push(
      { tick, kind: "bass", note: chord[0], ticks: half },
      { tick: tick + half, kind: "bass", note: chord[0] + 12, ticks: half },
    );
    if (!pos)
      for (const note of chord)
        song.push({ tick, kind: "chord", note: note + 12, ticks: beat * 4 });
    // The arrows of this beat are the tune: left is low, right is high.
    const end = beats[i + 1] ?? STAGE_TICKS;
    for (; next < notes.length && notes[next].tick < end; next++) {
      const { tick: at, lane } = notes[next];
      song.push({
        tick: at,
        kind: "lead",
        note: [chord[0], chord[1], chord[2], chord[0] + 12][lane] + 24,
        ticks: half,
      });
    }
  });
  // One last chord to land on.
  const last = beats[beats.length - 1],
    close = last + stageBeat(last, mode);
  song.push({ tick: close, kind: "kick", note: 0, ticks: 8 });
  for (const note of chords[0])
    song.push({ tick: close, kind: "chord", note: note + 12, ticks: 50 });
  return song.sort((a, b) => a.tick - b.tick);
}
