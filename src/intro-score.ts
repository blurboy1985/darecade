// Music and sound for the intro film, synthesised with the Web Audio API
// like the rest of the game's sound. No audio files.
//
// The whole forty seconds is scheduled the moment the film starts, against
// the timings in intro-script.ts. Four bars of a stumbling minor riff for the
// failed attempts, a stop, a riser, six bars of the same riff turned major
// for the wins, a quiet stretch in the neighbourhood, one bar of nothing
// before "Or you scared?", and the hook again under the logo.
import { cue, captions, DURATION } from "./intro-script";

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);
const BEAT = 0.5;
const EIGHTH = BEAT / 2;

export type Score = { stop(): void };

/** Starts the score now. Returns null where the browser has no Web Audio. */
export function startScore(): Score | null {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  let ctx: AudioContext;
  try {
    ctx = new AC();
  } catch {
    return null;
  }
  void ctx.resume();
  const t0 = ctx.currentTime + 0.06;

  const master = ctx.createGain();
  master.gain.value = 0.55;
  const squash = ctx.createDynamicsCompressor();
  squash.threshold.value = -16;
  squash.ratio.value = 5;
  master.connect(squash).connect(ctx.destination);
  const music = ctx.createGain();
  const sfx = ctx.createGain();
  music.connect(master);
  sfx.connect(master);
  // The beat of silence: the band stops dead, then comes back with the logo.
  music.gain.setValueAtTime(1, t0);
  music.gain.setValueAtTime(1, t0 + cue.silence - 0.03);
  music.gain.linearRampToValueAtTime(0, t0 + cue.silence);
  music.gain.setValueAtTime(1, t0 + cue.logo - 0.01);

  const hiss = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const samples = hiss.getChannelData(0);
  let seed = 7;
  for (let i = 0; i < samples.length; i++) {
    seed = (seed * 16807) % 2147483647;
    samples[i] = (seed / 2147483647) * 2 - 1;
  }

  function tone(
    at: number,
    note: number,
    length: number,
    volume: number,
    type: OscillatorType = "triangle",
    out: AudioNode = music,
    slideTo = 0,
  ) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const start = t0 + at;
    osc.type = type;
    osc.frequency.setValueAtTime(note, start);
    if (slideTo)
      osc.frequency.exponentialRampToValueAtTime(slideTo, start + length);
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(volume, start + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(amp).connect(out);
    osc.start(start);
    osc.stop(start + length + 0.02);
  }
  function noise(
    at: number,
    length: number,
    volume: number,
    kind: BiquadFilterType,
    from: number,
    to = from,
    out: AudioNode = sfx,
    swell = false,
  ) {
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const amp = ctx.createGain();
    const start = t0 + at;
    src.buffer = hiss;
    src.loop = true;
    filter.type = kind;
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(to, start + length);
    if (swell) {
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(volume, start + length * 0.92);
      amp.gain.linearRampToValueAtTime(0, start + length);
    } else {
      amp.gain.setValueAtTime(volume, start);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + length);
    }
    src.connect(filter).connect(amp).connect(out);
    src.start(start);
    src.stop(start + length + 0.02);
  }

  const kick = (at: number) => tone(at, 150, 0.2, 0.9, "sine", music, 42);
  const snare = (at: number, volume = 0.3) => {
    noise(at, 0.16, volume, "highpass", 1800, 1800, music);
    tone(at, 190, 0.1, volume * 0.6, "triangle", music, 120);
  };
  const hat = (at: number, volume = 0.08) =>
    noise(at, 0.045, volume, "highpass", 7500, 7500, music);
  const crash = (at: number) =>
    noise(at, 1.4, 0.2, "highpass", 5200, 3800, music);
  const lead = (at: number, note: number, length = EIGHTH * 0.9) => {
    tone(at, midi(note), length, 0.11, "square");
    tone(at, midi(note + 12), length, 0.05, "triangle");
  };
  const chime = (at: number, note: number, volume = 0.16) => {
    tone(at, midi(note), 0.5, volume, "sine", sfx);
    tone(at, midi(note + 12), 0.25, volume * 0.4, "sine", sfx);
  };
  const pad = (at: number, notes: number[], length: number, volume = 0.045) => {
    for (const n of notes) tone(at, midi(n), length, volume, "triangle");
  };

  // The bass goes through a low-pass so the sawtooth stays round.
  const lowpass = ctx.createBiquadFilter();
  lowpass.type = "lowpass";
  lowpass.frequency.value = 520;
  lowpass.connect(music);

  /** One two-second bar: drums, a bouncing bass and an eight-step riff. */
  function bar(at: number, root: number, riff: number[], drive: boolean) {
    for (let step = 0; step < 8; step++) {
      const when = at + step * EIGHTH;
      if (drive ? step % 2 === 0 : step === 0 || step === 4 || step === 5)
        kick(when);
      if (step === 2 || step === 6) snare(when);
      hat(when, step % 2 ? 0.1 : 0.06);
      if (drive) hat(when + EIGHTH / 2, 0.04);
      const bass =
        step === 2 || step === 5 ? root + 12 : step === 7 ? root + 7 : root;
      tone(when, midi(bass), EIGHTH * 0.85, 0.3, "sawtooth", lowpass);
      if (riff[step]) lead(when, riff[step]);
    }
  }

  // 0–4.5 s: a kart arrives out of the evening and brakes hard.
  pad(0, [45, 57, 64], 4.6, 0.05);
  {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const mute = ctx.createBiquadFilter();
    osc.type = "sawtooth";
    mute.type = "lowpass";
    mute.frequency.value = 700;
    osc.frequency.setValueAtTime(60, t0);
    osc.frequency.exponentialRampToValueAtTime(190, t0 + 1.5);
    osc.frequency.exponentialRampToValueAtTime(48, t0 + cue.brake + 0.1);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(0.22, t0 + 1.5);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + cue.brake + 0.15);
    osc.connect(mute).connect(amp).connect(sfx);
    osc.start(t0);
    osc.stop(t0 + cue.brake + 0.2);
  }
  noise(cue.brake - 0.5, 0.5, 0.1, "bandpass", 2600, 1900);
  tone(cue.brake, 95, 0.25, 0.5, "sine", sfx, 45);

  for (const at of cue.count) tone(at, 660, 0.14, 0.2, "square", sfx);
  tone(cue.go, 1320, 0.5, 0.2, "square", sfx);

  // 6–14 s: three attempts, three near misses.
  const stumble = [
    [45, [69, 72, 76, 0, 74, 72, 69, 0]],
    [41, [65, 69, 72, 0, 74, 72, 69, 0]],
    [48, [67, 72, 76, 0, 79, 76, 72, 0]],
    [43, [67, 71, 74, 0, 79, 77, 0, 0]],
  ] as const;
  crash(cue.go);
  stumble.forEach(([root, riff], i) => bar(6 + i * 2, root, [...riff], false));
  noise(cue.crash, 0.5, 0.4, "lowpass", 1400, 300);
  tone(cue.crash, 210, 0.35, 0.4, "sine", sfx, 55);
  tone(cue.crash + 0.14, 120, 0.12, 0.3, "sine", sfx, 70);
  tone(cue.crash + 0.3, 140, 0.12, 0.22, "sine", sfx, 80);
  tone(cue.rim, 523, 0.4, 0.14, "square", sfx);
  tone(cue.rim, 790, 0.4, 0.1, "square", sfx);
  tone(cue.rim + 0.06, 320, 0.4, 0.2, "sine", sfx, 170);
  for (const at of cue.bounces) tone(at, 880, 0.06, 0.12, "square", sfx);
  [76, 72, 69, 64].forEach((n, i) =>
    tone(cue.gameOver + i * 0.14, midi(n), 0.2, 0.14, "square", sfx),
  );

  // 14–16 s: the band has stopped. A laugh, a button, a riser.
  tone(cue.retry, 440, 0.12, 0.18, "square", sfx, 880);
  noise(15, 1, 0.16, "bandpass", 500, 6000, sfx, true);
  for (let i = 0; i < 8; i++) snare(15 + i * 0.125, 0.08 + i * 0.03);

  // 16–28 s: the same riff, in a major key, and this time it lands.
  const landed = [
    [48, [76, 0, 79, 76, 84, 0, 83, 79], [48, 64, 67]],
    [43, [74, 0, 79, 74, 83, 0, 81, 79], [55, 62, 71]],
    [45, [72, 0, 76, 72, 81, 0, 79, 76], [57, 64, 72]],
    [41, [72, 0, 77, 72, 81, 79, 77, 76], [53, 65, 72]],
    [48, [76, 0, 79, 76, 84, 0, 83, 79], [48, 64, 67]],
    [43, [74, 0, 79, 74, 83, 0, 86, 0], [55, 62, 71]],
  ] as const;
  crash(16);
  landed.forEach(([root, riff, chord], i) => {
    bar(16 + i * 2, root, [...riff], true);
    pad(16 + i * 2, [...chord], 2, 0.05);
  });
  noise(cue.swish, 0.28, 0.22, "highpass", 2400, 6500);
  [84, 88, 91].forEach((n, i) => chime(cue.swish + 0.05 + i * 0.09, n));
  noise(cue.pass - 0.2, 0.5, 0.22, "bandpass", 400, 3600);
  chime(cue.pass, 79);
  chime(cue.pass + 0.12, 84);
  cue.perfect.forEach((at, i) => chime(at, [88, 91, 96][i], 0.2));
  [72, 76, 79, 84].forEach((n) => chime(cue.pose, n, 0.12));
  noise(cue.pose, 2.2, 0.07, "bandpass", 900, 1500);

  // 28–32.5 s: back downstairs. Plucked notes, a cat, then nothing at all.
  pad(28, [45, 57, 60, 64], 2.1, 0.06);
  pad(30, [41, 57, 60, 65], 2.1, 0.06);
  pad(32, [48, 55, 64], 0.6, 0.06);
  [76, 81, 84, 81, 77, 81, 84, 88, 79].forEach((n, i) =>
    tone(28 + i * BEAT, midi(n), 0.6, 0.1, "sine"),
  );
  {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const mouth = ctx.createBiquadFilter();
    const at = t0 + cue.meow;
    osc.type = "sawtooth";
    mouth.type = "bandpass";
    mouth.frequency.value = 1500;
    mouth.Q.value = 3;
    osc.frequency.setValueAtTime(620, at);
    osc.frequency.linearRampToValueAtTime(940, at + 0.14);
    osc.frequency.linearRampToValueAtTime(560, at + 0.45);
    amp.gain.setValueAtTime(0.0001, at);
    amp.gain.exponentialRampToValueAtTime(0.3, at + 0.08);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.48);
    osc.connect(mouth).connect(amp).connect(sfx);
    osc.start(at);
    osc.stop(at + 0.5);
  }

  // 34–40 s: the hook comes back under the logo and ends on one big chord.
  crash(cue.logo);
  bar(34, 41, [77, 81, 84, 0, 79, 83, 86, 0], true);
  bar(36, 48, [84, 0, 88, 84, 91, 0, 88, 0], true);
  pad(34, [53, 65, 69], 1, 0.05);
  pad(35, [55, 67, 71], 1, 0.05);
  pad(36, [48, 64, 67], 2, 0.05);
  chime(cue.tagline, 96, 0.12);
  kick(cue.finale);
  crash(cue.finale);
  tone(cue.finale, midi(36), 1.8, 0.35, "sawtooth", lowpass);
  pad(cue.finale, [60, 64, 67, 72], DURATION - cue.finale, 0.09);
  lead(cue.finale, 84, 1.2);

  // Speech is a run of short blips under each caption, higher for Tea
  // Alchemist than for the newcomer.
  for (const line of captions) {
    const base = line.who === "tea" ? 560 : 370;
    const count = Math.min(14, Math.ceil(line.text.length / 2));
    for (let i = 0; i < count; i++) {
      const lift = 1 + (((i * 7) % 5) - 2) * 0.05;
      tone(line.from + i * 0.065, base * lift, 0.05, 0.1, "triangle", sfx);
    }
  }

  return {
    stop() {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setTargetAtTime(0, ctx.currentTime, 0.05);
      setTimeout(() => void ctx.close().catch(() => {}), 400);
    },
  };
}
