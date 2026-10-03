// Darecade sound: original background music and sound effects, synthesised
// live with the Web Audio API. No audio files, samples or licences needed.
//
// Music has three moods that cross-fade: "day" (mellow lo-fi city-pop),
// "night" (soft pads and celesta) and "game" (bright chiptune for the arcade).

export type Sfx =
  | "click"
  | "open"
  | "close"
  | "coin"
  | "gift"
  | "levelup"
  | "equip"
  | "sparkle"
  | "step"
  | "bell"
  | "meow"
  | "woof"
  | "chirp"
  | "squeak"
  | "ribbit"
  | "boo"
  | "blip"
  | "roar"
  | "swing"
  | "slide"
  | "page"
  | "arcade"
  | "start"
  | "eat"
  | "brick"
  | "paddle"
  | "jump"
  | "pass"
  | "hurt"
  | "boom"
  | "bigboom"
  | "boss"
  | "shoot"
  | "powerup"
  | "win"
  | "finish"
  | "error";
export type Theme = "day" | "night" | "game";

let ctx: BaseAudioContext | null = null;
let master: GainNode,
  musicBus: GainNode,
  sfxBus: GainNode,
  reverb: ConvolverNode,
  wet: GainNode;
let noise: AudioBuffer;
let soundOn = false,
  musicOn = true,
  theme: Theme = "day",
  nextTheme: Theme = "day";
const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

function setup(offline?: BaseAudioContext) {
  if (ctx && !offline) return ctx;
  if (offline) ctx = offline;
  else {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0;
  musicBus.connect(master);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.8;
  sfxBus.connect(master);
  // A short synthetic room reverb shared by music and sparkly effects.
  reverb = ctx.createConvolver();
  const len = ctx.sampleRate * 2.2;
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++)
      d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  reverb.buffer = ir;
  wet = ctx.createGain();
  wet.gain.value = 0.3;
  reverb.connect(wet).connect(master);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const n = noise.getChannelData(0);
  for (let i = 0; i < n.length; i++) n[i] = Math.random() * 2 - 1;
  return ctx;
}

type Voice = {
  type?: OscillatorType;
  f: number;
  to?: number;
  at: number;
  dur: number;
  vol: number;
  attack?: number;
  out?: AudioNode;
  send?: number;
  filter?: number;
  detune?: number;
};
function tone(v: Voice) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = v.type ?? "sine";
  o.frequency.setValueAtTime(v.f, v.at);
  if (v.detune) o.detune.value = v.detune;
  if (v.to)
    o.frequency.exponentialRampToValueAtTime(Math.max(20, v.to), v.at + v.dur);
  const a = v.attack ?? 0.005;
  g.gain.setValueAtTime(0.0001, v.at);
  g.gain.exponentialRampToValueAtTime(v.vol, v.at + a);
  g.gain.exponentialRampToValueAtTime(0.0001, v.at + v.dur);
  let node: AudioNode = o.connect(g);
  if (v.filter) {
    const f = c.createBiquadFilter();
    f.type = "lowpass";
    f.frequency.value = v.filter;
    node = node.connect(f);
  }
  node.connect(v.out ?? sfxBus);
  if (v.send) {
    const s = c.createGain();
    s.gain.value = v.send;
    node.connect(s).connect(reverb);
  }
  o.start(v.at);
  o.stop(v.at + v.dur + 0.05);
}
function hiss(
  at: number,
  dur: number,
  vol: number,
  type: BiquadFilterType,
  freq: number,
  to?: number,
  out?: AudioNode,
  q = 1,
) {
  const c = ctx!;
  const s = c.createBufferSource();
  s.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, at);
  if (to) f.frequency.exponentialRampToValueAtTime(to, at + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(vol, at);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(f)
    .connect(g)
    .connect(out ?? sfxBus);
  s.start(at, Math.random() * 0.5);
  s.stop(at + dur + 0.02);
}

// ---------------------------------------------------------------- effects
const last = new Map<string, number>();
const throttle: Partial<Record<Sfx, number>> = {
  step: 0.22,
  shoot: 0.14,
  brick: 0.04,
  click: 0.05,
  sparkle: 0.25,
};
const penta = [72, 74, 76, 79, 81, 84, 86, 88, 91];

export function play(name: Sfx) {
  if (!soundOn || !setup() || ctx!.state !== "running") return;
  const t = ctx!.currentTime + 0.01;
  const gap = throttle[name];
  if (gap && t - (last.get(name) ?? -1) < gap) return;
  last.set(name, t);
  const r = Math.random();
  switch (name) {
    case "click":
      tone({ type: "triangle", f: 1300, to: 950, at: t, dur: 0.05, vol: 0.12 });
      break;
    case "open":
      tone({ f: 520, to: 820, at: t, dur: 0.16, vol: 0.12, send: 0.2 });
      hiss(t, 0.18, 0.05, "bandpass", 900, 3000);
      break;
    case "close":
      tone({ f: 760, to: 470, at: t, dur: 0.14, vol: 0.1 });
      hiss(t, 0.14, 0.04, "bandpass", 2500, 800);
      break;
    case "coin":
      tone({ type: "square", f: midi(83), at: t, dur: 0.08, vol: 0.07 });
      tone({
        type: "square",
        f: midi(88),
        at: t + 0.07,
        dur: 0.32,
        vol: 0.07,
        send: 0.25,
      });
      break;
    case "gift":
    case "levelup": {
      const notes =
        name === "gift" ? [72, 76, 79, 84] : [67, 72, 76, 79, 84, 88];
      notes.forEach((n, i) =>
        tone({
          type: "triangle",
          f: midi(n),
          at: t + i * 0.07,
          dur: 0.4,
          vol: 0.12,
          send: 0.4,
        }),
      );
      [76, 79, 84].forEach((n) =>
        tone({
          f: midi(n),
          at: t + notes.length * 0.07,
          dur: 0.9,
          vol: 0.06,
          send: 0.5,
        }),
      );
      break;
    }
    case "equip":
      hiss(t, 0.18, 0.08, "bandpass", 2400, 700, undefined, 2);
      tone({
        type: "triangle",
        f: midi(76 + Math.floor(r * 3) * 2),
        at: t + 0.06,
        dur: 0.18,
        vol: 0.08,
        send: 0.2,
      });
      break;
    case "sparkle":
      for (let i = 0; i < 7; i++)
        tone({
          f: midi(penta[Math.floor(Math.random() * penta.length)] + 12),
          at: t + i * 0.045,
          dur: 0.35,
          vol: 0.05,
          send: 0.7,
        });
      tone({
        type: "triangle",
        f: midi(96),
        at: t + 0.32,
        dur: 0.6,
        vol: 0.03,
        send: 0.8,
      });
      break;
    case "step":
      hiss(t, 0.06, 0.06, "lowpass", 500 + r * 300);
      break;
    case "bell":
      for (const k of [0, 0.28])
        for (const [f, v] of [
          [1568, 0.08],
          [2350, 0.04],
          [3920, 0.02],
        ] as const)
          tone({
            f: f * (1 + r * 0.002),
            at: t + k,
            dur: 0.9,
            vol: v,
            send: 0.4,
          });
      break;
    case "meow":
      tone({
        type: "sawtooth",
        f: 620,
        to: 980,
        at: t,
        dur: 0.18,
        vol: 0.05,
        filter: 1800,
      });
      tone({
        type: "sawtooth",
        f: 980,
        to: 560,
        at: t + 0.17,
        dur: 0.3,
        vol: 0.05,
        filter: 1600,
      });
      break;
    case "woof":
      for (const k of [0, 0.2]) {
        tone({
          type: "square",
          f: 260,
          to: 150,
          at: t + k,
          dur: 0.12,
          vol: 0.07,
          filter: 900,
        });
        hiss(t + k, 0.08, 0.05, "lowpass", 900);
      }
      break;
    case "chirp":
      for (const k of [0, 0.12, 0.24])
        tone({ f: 2200 + r * 400, to: 3400, at: t + k, dur: 0.07, vol: 0.06 });
      break;
    case "squeak":
      tone({ f: 1500, to: 2400, at: t, dur: 0.1, vol: 0.07 });
      tone({ f: 1800, to: 2600, at: t + 0.13, dur: 0.08, vol: 0.05 });
      break;
    case "ribbit":
      for (let i = 0; i < 4; i++)
        tone({
          type: "sawtooth",
          f: 140,
          to: 110,
          at: t + i * 0.045,
          dur: 0.04,
          vol: 0.06,
          filter: 700,
        });
      break;
    case "boo":
      tone({
        f: 520,
        to: 300,
        at: t,
        dur: 0.7,
        vol: 0.06,
        attack: 0.15,
        send: 0.6,
      });
      tone({
        f: 527,
        to: 305,
        at: t,
        dur: 0.7,
        vol: 0.04,
        attack: 0.15,
        send: 0.6,
      });
      break;
    case "blip":
      tone({ f: 600, to: 1300, at: t, dur: 0.12, vol: 0.08, send: 0.2 });
      tone({ f: 900, to: 1800, at: t + 0.12, dur: 0.1, vol: 0.06, send: 0.3 });
      break;
    case "roar":
      hiss(t, 0.45, 0.08, "lowpass", 700, 300);
      tone({
        type: "sawtooth",
        f: 180,
        to: 140,
        at: t,
        dur: 0.45,
        vol: 0.05,
        filter: 600,
      });
      break;
    case "swing":
      for (const k of [0, 0.7])
        hiss(t + k, 0.5, 0.06, "bandpass", 400, 1400, undefined, 3);
      break;
    case "slide":
      tone({ f: 1300, to: 420, at: t, dur: 1.1, vol: 0.06, send: 0.3 });
      hiss(t, 1.1, 0.04, "bandpass", 3000, 600, undefined, 1.5);
      break;
    case "page":
      for (const k of [0, 0.16]) hiss(t + k, 0.09, 0.07, "highpass", 2500);
      break;
    case "arcade":
      for (let i = 0; i < 5; i++)
        tone({
          type: "square",
          f: midi(72 + Math.floor(Math.random() * 12)),
          at: t + i * 0.08,
          dur: 0.07,
          vol: 0.05,
        });
      break;
    case "start":
      [72, 72, 72, 84].forEach((n, i) =>
        tone({
          type: "square",
          f: midi(n),
          at: t + i * 0.16,
          dur: i === 3 ? 0.3 : 0.08,
          vol: 0.06,
        }),
      );
      break;
    case "eat":
      tone({ type: "triangle", f: 660, to: 990, at: t, dur: 0.09, vol: 0.12 });
      break;
    case "brick":
      tone({
        type: "square",
        f: midi(76 + Math.floor(r * 8)),
        at: t,
        dur: 0.06,
        vol: 0.05,
      });
      hiss(t, 0.04, 0.05, "highpass", 3000);
      break;
    case "paddle":
      tone({ type: "triangle", f: 330, at: t, dur: 0.07, vol: 0.12 });
      break;
    case "jump":
      tone({ type: "square", f: 320, to: 760, at: t, dur: 0.13, vol: 0.05 });
      break;
    case "pass":
      tone({ type: "triangle", f: midi(84), at: t, dur: 0.12, vol: 0.08 });
      break;
    case "hurt":
      tone({
        type: "sawtooth",
        f: 360,
        to: 80,
        at: t,
        dur: 0.32,
        vol: 0.07,
        filter: 1500,
      });
      hiss(t, 0.2, 0.05, "lowpass", 1200);
      break;
    case "boom":
      hiss(t, 0.3, 0.12, "lowpass", 1400, 200);
      tone({ f: 120, to: 45, at: t, dur: 0.25, vol: 0.12 });
      break;
    case "bigboom":
      hiss(t, 0.9, 0.16, "lowpass", 1800, 120);
      tone({ f: 90, to: 30, at: t, dur: 0.8, vol: 0.16 });
      break;
    case "boss":
      for (let i = 0; i < 3; i++)
        tone({
          type: "sawtooth",
          f: 82,
          to: 70,
          at: t + i * 0.3,
          dur: 0.26,
          vol: 0.07,
          filter: 500,
        });
      break;
    case "shoot":
      tone({ type: "square", f: 1000, to: 620, at: t, dur: 0.05, vol: 0.018 });
      break;
    case "powerup":
      [64, 67, 71, 76, 79, 83].forEach((n, i) =>
        tone({
          type: "square",
          f: midi(n),
          at: t + i * 0.04,
          dur: 0.08,
          vol: 0.05,
        }),
      );
      break;
    case "win":
      [72, 76, 79, 84].forEach((n, i) =>
        tone({
          type: "square",
          f: midi(n),
          at: t + i * 0.11,
          dur: 0.14,
          vol: 0.06,
        }),
      );
      [72, 76, 79, 84].forEach((n) =>
        tone({
          type: "triangle",
          f: midi(n),
          at: t + 0.48,
          dur: 1,
          vol: 0.06,
          send: 0.4,
        }),
      );
      break;
    case "finish":
      [79, 76, 72].forEach((n, i) =>
        tone({
          type: "triangle",
          f: midi(n),
          at: t + i * 0.13,
          dur: 0.3,
          vol: 0.09,
          send: 0.3,
        }),
      );
      break;
    case "error":
      tone({ type: "triangle", f: 330, at: t, dur: 0.12, vol: 0.08 });
      tone({ type: "triangle", f: 247, at: t + 0.13, dur: 0.18, vol: 0.08 });
      break;
  }
}

/** The sound a companion makes when chosen, by petNames index. */
export function petSound(kind: number): Sfx {
  return (
    (
      {
        1: "meow",
        2: "woof",
        3: "blip",
        4: "squeak",
        5: "squeak",
        6: "roar",
        7: "chirp",
        8: "squeak",
        9: "chirp",
        10: "squeak",
        11: "squeak",
        12: "squeak",
        13: "squeak",
        14: "ribbit",
        15: "blip",
        16: "chirp",
        17: "woof",
        18: "blip",
        19: "blip",
        20: "sparkle",
        21: "chirp",
        22: "blip",
        23: "boo",
        24: "roar",
        25: "sparkle",
      } as Record<number, Sfx>
    )[kind] ?? "click"
  );
}

// ---------------------------------------------------------------- music
type Song = {
  bpm: number;
  swing: number;
  chords: number[][];
  scale: number[];
  lead: "epiano" | "celesta" | "chip";
  drums: "lofi" | "soft" | "chip";
  density: number;
};
const songs: Record<Theme, Song> = {
  day: {
    bpm: 86,
    swing: 0.12,
    chords: [
      [53, 57, 60, 64],
      [57, 60, 64, 67],
      [58, 62, 65, 69],
      [55, 60, 62, 65],
      [50, 53, 57, 60],
      [57, 60, 64, 67],
      [58, 62, 65, 69],
      [48, 55, 58, 64],
    ],
    scale: [65, 67, 69, 72, 74, 77, 79, 81],
    lead: "epiano",
    drums: "lofi",
    density: 0.42,
  },
  night: {
    bpm: 68,
    swing: 0.08,
    chords: [
      [49, 53, 56, 60],
      [46, 49, 53, 56],
      [54, 58, 61, 65],
      [44, 48, 51, 55],
    ],
    scale: [73, 75, 77, 80, 82, 85, 87, 89],
    lead: "celesta",
    drums: "soft",
    density: 0.3,
  },
  game: {
    bpm: 132,
    swing: 0,
    chords: [
      [57, 60, 64],
      [53, 57, 60],
      [48, 52, 55],
      [55, 59, 62],
    ],
    scale: [69, 72, 74, 76, 79, 81, 84],
    lead: "chip",
    drums: "chip",
    density: 0.62,
  },
};
let timer = 0,
  step = 0,
  nextAt = 0,
  phrase = 0,
  melodyNote = 3;

function seeded(n: number) {
  const v = Math.sin(n * 91.7 + phrase * 13.1) * 43758.5453;
  return v - Math.floor(v);
}
function scheduleStep(s: Song, i: number, at: number, spb: number) {
  const out = musicBus;
  const bar = Math.floor(i / 16);
  const pos = i % 16;
  const chord = s.chords[bar % s.chords.length];
  const root = chord[0] - 12;
  // Harmony
  if (pos === 0) {
    if (s.lead === "chip") {
      // fast arpeggio handled per 16th below
    } else if (s.lead === "celesta") {
      chord.forEach((n) => {
        tone({
          type: "sawtooth",
          f: midi(n),
          at,
          dur: spb * 16,
          vol: 0.012,
          attack: 0.8,
          filter: 900,
          out,
          send: 0.5,
          detune: -6,
        });
        tone({
          type: "sawtooth",
          f: midi(n),
          at,
          dur: spb * 16,
          vol: 0.012,
          attack: 0.8,
          filter: 900,
          out,
          send: 0.5,
          detune: 6,
        });
      });
    } else
      chord.forEach((n, k) => {
        const t = at + k * 0.012;
        tone({
          f: midi(n),
          at: t,
          dur: spb * 7,
          vol: 0.035,
          attack: 0.01,
          out,
          send: 0.25,
        });
        tone({
          type: "triangle",
          f: midi(n + 12),
          at: t,
          dur: spb * 3,
          vol: 0.008,
          out,
        });
      });
  }
  if (s.lead === "epiano" && pos === 10)
    chord.forEach((n) =>
      tone({ f: midi(n), at, dur: spb * 5, vol: 0.022, out, send: 0.25 }),
    );
  if (s.lead === "chip")
    tone({
      type: "square",
      f: midi(chord[pos % chord.length] + 12),
      at,
      dur: spb * 0.6,
      vol: 0.012,
      out,
    });
  // Bass
  const bassHits =
    s.drums === "chip"
      ? [0, 2, 4, 6, 8, 10, 12, 14]
      : s.drums === "lofi"
        ? [0, 7, 10]
        : [0];
  if (bassHits.includes(pos)) {
    const note =
      s.drums === "chip" && pos % 4 === 2
        ? root + 12
        : pos === 10
          ? root + 7
          : root;
    tone({
      type: s.drums === "chip" ? "triangle" : "sine",
      f: midi(note),
      at,
      dur: spb * (s.drums === "soft" ? 14 : 1.8),
      vol: s.drums === "chip" ? 0.06 : 0.09,
      attack: 0.01,
      out,
      filter: 700,
    });
  }
  // Drums
  if (s.drums === "lofi") {
    if (pos === 0 || pos === 8 || (pos === 11 && seeded(bar) > 0.6)) {
      tone({ f: 110, to: 45, at, dur: 0.22, vol: 0.12, out });
    }
    if (pos === 4 || pos === 12)
      hiss(at, 0.09, 0.04, "bandpass", 1900, undefined, out, 1.2);
    if (pos % 2 === 0)
      hiss(
        at,
        0.035,
        pos % 4 === 2 ? 0.02 : 0.012,
        "highpass",
        7000,
        undefined,
        out,
      );
  } else if (s.drums === "soft") {
    if (pos % 4 === 2) hiss(at, 0.06, 0.008, "highpass", 6000, undefined, out);
  } else {
    if (pos === 0 || pos === 8 || pos === 10)
      tone({ type: "square", f: 140, to: 50, at, dur: 0.08, vol: 0.05, out });
    if (pos === 4 || pos === 12)
      hiss(at, 0.1, 0.05, "bandpass", 1800, undefined, out);
    if (pos % 2 === 1) hiss(at, 0.02, 0.018, "highpass", 8000, undefined, out);
  }
  // Melody: a seeded walk over the scale, landing on chord tones on the beat.
  const grid = s.lead === "chip" ? 2 : 2;
  if (
    pos % grid === 0 &&
    seeded(i) < s.density &&
    !(s.lead !== "chip" && bar % 8 >= 6 && pos > 8)
  ) {
    melodyNote = Math.max(
      0,
      Math.min(
        s.scale.length - 1,
        melodyNote + Math.round((seeded(i + 0.5) - 0.5) * 4),
      ),
    );
    let n = s.scale[melodyNote];
    if (pos % 8 === 0) {
      const tones = chord.map((c) => c + 12 * Math.round((n - c) / 12));
      n = tones.reduce(
        (a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a),
        n,
      );
    }
    const len = spb * (seeded(i + 2) > 0.7 ? 4 : 2);
    if (s.lead === "epiano") {
      tone({ f: midi(n), at, dur: len * 1.4, vol: 0.05, out, send: 0.35 });
      tone({
        type: "triangle",
        f: midi(n + 12),
        at,
        dur: len * 0.5,
        vol: 0.01,
        out,
      });
    } else if (s.lead === "celesta") {
      tone({ f: midi(n), at, dur: 1.2, vol: 0.04, out, send: 0.6 });
      tone({ f: midi(n + 19), at, dur: 0.5, vol: 0.01, out, send: 0.6 });
    } else
      tone({
        type: "square",
        f: midi(n),
        at,
        dur: len * 0.8,
        vol: 0.022,
        out,
        filter: 3500,
      });
  }
}
function scheduler() {
  if (!ctx) return;
  const s = songs[theme];
  const spb = 60 / s.bpm / 4;
  while (nextAt < ctx.currentTime + 0.15) {
    const swing = step % 2 ? s.swing * spb : 0;
    scheduleStep(s, step, nextAt + swing, spb);
    nextAt += spb;
    step++;
    if (step % 128 === 0) phrase++;
    // Change mood only on a bar line so chords never cut off mid-bar.
    if (step % 16 === 0 && nextTheme !== theme) {
      theme = nextTheme;
      step = 0;
      melodyNote = 3;
    }
  }
}
function startMusic() {
  if (!ctx || timer) return;
  nextAt = ctx.currentTime + 0.1;
  step = 0;
  timer = window.setInterval(scheduler, 40);
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setTargetAtTime(1.3, ctx.currentTime, 0.8);
}
function stopMusic() {
  if (!ctx || !timer) return;
  clearInterval(timer);
  timer = 0;
  musicBus.gain.cancelScheduledValues(ctx.currentTime);
  musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
}

function apply() {
  if (!ctx) return;
  if (soundOn && musicOn && !document.hidden) startMusic();
  else stopMusic();
}

export const audio = {
  play,
  /** Call from a click/tap handler: browsers only allow audio after a gesture. */
  unlock() {
    if (!soundOn || !setup()) return;
    const live = ctx as AudioContext;
    if (live.state !== "running") void live.resume().then(apply);
    else apply();
  },
  configure(sound: boolean, music: boolean) {
    soundOn = sound;
    musicOn = music;
    if (sound) this.unlock();
    else stopMusic();
  },
  setTheme(next: Theme) {
    nextTheme = next;
    if (!timer) theme = next;
  },
  get theme() {
    return nextTheme;
  },
};

if (typeof document !== "undefined")
  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.hidden) {
      stopMusic();
      void (ctx as AudioContext).suspend();
    } else if (soundOn) void (ctx as AudioContext).resume().then(apply);
  });

/** Renders a few seconds of one mood offline (for previews and checks). */
export async function renderMusic(mood: Theme, seconds: number, rate = 44100) {
  const offline = new OfflineAudioContext(2, rate * seconds, rate);
  const saved = { ctx, master, musicBus, sfxBus, reverb, wet, noise };
  setup(offline);
  musicBus.gain.value = 1.3;
  theme = nextTheme = mood;
  const s = songs[mood];
  const spb = 60 / s.bpm / 4;
  phrase = 0;
  melodyNote = 3;
  for (let i = 0, at = 0.05; at < seconds - 0.2; i++, at += spb)
    scheduleStep(s, i, at + (i % 2 ? s.swing * spb : 0), spb);
  const buffer = await offline.startRendering();
  ({ ctx, master, musicBus, sfxBus, reverb, wet, noise } = saved);
  return buffer;
}
