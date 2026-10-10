/** Open Stage: a forty-second rhythm show. Pure rules, no rendering or clock. */
export const STAGE_LANES = 4;
export const STAGE_TICKS = 40 * 60;
/** Ticks either side of a note that still count. */
export const STAGE_PERFECT = 4;
export const STAGE_GOOD = 9;
export const STAGE_WARMUP_GOAL = 5;
/** Fever: double points for five seconds, once enough notes have landed. */
export const STAGE_FEVER_TICKS = 5 * 60;
export const STAGE_FEVER_PERFECT = 1 / 20;
export const STAGE_FEVER_GOOD = 1 / 40;
export type StageMode = "warmup" | "show" | "encore";
export type StageJudgement = "perfect" | "good" | "miss" | "stray";
export type StageNote = {
  tick: number;
  lane: number;
  hit: StageJudgement | null;
};

/** The seed decides the song: a beat that quickens, with more off-beats later. */
export function stageChart(
  seed: number,
  mode: StageMode = "show",
): StageNote[] {
  if (mode === "warmup") {
    const notes: StageNote[] = [];
    // Give the player time to find two controls, then one note every 1.5s.
    for (let tick = 150; tick < STAGE_TICKS - 60; tick += 90)
      notes.push({ tick, lane: notes.length % 2 ? 3 : 0, hit: null });
    return notes;
  }
  let state = seed >>> 0;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  const notes: StageNote[] = [];
  let tick = 120,
    lane = -1;
  if (mode === "encore") {
    // Quicker from the first bar, with double arrows: two lanes on one beat.
    while (tick < STAGE_TICKS - 60) {
      const progress = tick / STAGE_TICKS;
      const beat = Math.round(32 - progress * 10);
      // The lane just used is rested, so one press can never mean two notes.
      const rested = lane;
      let next = Math.floor(random() * STAGE_LANES);
      if (next === lane) next = (next + 1) % STAGE_LANES;
      lane = next;
      notes.push({ tick, lane, hit: null });
      let pair = -1;
      if (random() < 0.12 + progress * 0.26) {
        pair = Math.floor(random() * STAGE_LANES);
        while (pair === lane || pair === rested)
          pair = (pair + 1) % STAGE_LANES;
        notes.push({ tick, lane: pair, hit: null });
      }
      if (random() < 0.22 + progress * 0.3) {
        let off = Math.floor(random() * STAGE_LANES);
        while (off === lane || off === pair) off = (off + 1) % STAGE_LANES;
        notes.push({ tick: tick + Math.round(beat / 2), lane: off, hit: null });
        lane = off;
      }
      tick += beat;
    }
    return notes;
  }
  while (tick < STAGE_TICKS - 60) {
    const progress = tick / STAGE_TICKS;
    const beat = Math.round(36 - progress * 14);
    let next = Math.floor(random() * STAGE_LANES);
    if (next === lane) next = (next + 1) % STAGE_LANES;
    lane = next;
    notes.push({ tick, lane, hit: null });
    if (random() < 0.2 + progress * 0.3) {
      const off =
        (lane + 1 + Math.floor(random() * (STAGE_LANES - 1))) % STAGE_LANES;
      notes.push({ tick: tick + Math.round(beat / 2), lane: off, hit: null });
      lane = off;
    }
    tick += beat;
  }
  return notes;
}

export class StageShow {
  tick = 0;
  score = 0;
  /** The score without the Fever bonus: timing alone. Stars are judged on it. */
  baseScore = 0;
  /** The Fever meter, 0 to 1, and the ticks of Fever left once it is lit. */
  fever = 0;
  feverTicks = 0;
  fevers = 0;
  combo = 0;
  bestCombo = 0;
  /** The crowd's mood, 0 to 1. At zero a Show is booed off. */
  hype = 0.5;
  ended = false;
  booed = false;
  counts = { perfect: 0, good: 0, miss: 0, stray: 0 };
  last: { judgement: StageJudgement; lane: number; tick: number } | null = null;
  readonly notes: StageNote[];
  readonly mode: StageMode;
  private next = 0;
  constructor(seed = 0, mode: StageMode = "show") {
    this.mode = mode;
    this.notes = stageChart(seed, mode);
  }
  /** Each combo of eight adds half again, up to three times the points. */
  get multiplier() {
    return 1 + Math.min(4, Math.floor(this.combo / 8)) * 0.5;
  }
  private judge(judgement: StageJudgement, lane: number) {
    this.counts[judgement]++;
    this.last = { judgement, lane, tick: this.tick };
    if (judgement === "perfect" || judgement === "good") {
      const points = (judgement === "perfect" ? 100 : 50) * this.multiplier;
      this.baseScore += points;
      this.score += points * (this.feverTicks > 0 ? 2 : 1);
      if (this.mode !== "warmup" && this.feverTicks <= 0)
        this.fever = Math.min(
          1,
          this.fever +
            (judgement === "perfect" ? STAGE_FEVER_PERFECT : STAGE_FEVER_GOOD),
        );
      this.combo++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.hype = Math.min(
        1,
        this.hype + (judgement === "perfect" ? 0.04 : 0.02),
      );
    } else {
      this.combo = 0;
      if (this.mode !== "warmup") {
        this.hype -= judgement === "miss" ? 0.12 : 0.05;
        if (this.hype <= 0) {
          this.hype = 0;
          this.booed = true;
          this.ended = true;
        }
      }
    }
  }
  /** Spends a full meter on Fever. Returns false when there is none to spend. */
  ignite() {
    if (this.ended || this.fever < 1 || this.feverTicks > 0) return false;
    this.fever = 0;
    this.feverTicks = STAGE_FEVER_TICKS;
    this.fevers++;
    return true;
  }
  /** pressed holds the lanes pressed on this tick, not the ones held down. */
  advance(pressed: readonly boolean[]) {
    if (this.ended) return;
    this.tick++;
    if (this.feverTicks > 0) this.feverTicks--;
    for (let lane = 0; lane < STAGE_LANES && !this.ended; lane++) {
      if (!pressed[lane]) continue;
      const note = this.notes.find(
        (n) =>
          !n.hit &&
          n.lane === lane &&
          Math.abs(n.tick - this.tick) <= STAGE_GOOD,
      );
      if (!note) this.judge("stray", lane);
      else {
        note.hit =
          Math.abs(note.tick - this.tick) <= STAGE_PERFECT ? "perfect" : "good";
        this.judge(note.hit, lane);
      }
    }
    // Notes that slipped past the line are misses.
    while (
      !this.ended &&
      this.next < this.notes.length &&
      this.notes[this.next].tick < this.tick - STAGE_GOOD
    ) {
      const note = this.notes[this.next++];
      if (!note.hit) {
        note.hit = "miss";
        this.judge("miss", note.lane);
      }
    }
    if (this.tick >= STAGE_TICKS) this.ended = true;
  }
}

/** The score of a show with every note hit perfectly and no Fever. */
export function stageMaxScore(seed: number, mode: StageMode = "show") {
  const show = new StageShow(seed, mode);
  const pressed = [false, false, false, false];
  while (!show.ended) {
    pressed.fill(false);
    for (const n of show.notes)
      if (n.tick === show.tick + 1) pressed[n.lane] = true;
    show.advance(pressed);
  }
  return show.score;
}
/** Zero to three stars from the share of a perfect show's score. */
export function stageStars(score: number, max: number) {
  const share = max > 0 ? score / max : 0;
  return share >= 0.8 ? 3 : share >= 0.55 ? 2 : share >= 0.3 ? 1 : 0;
}
