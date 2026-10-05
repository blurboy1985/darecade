// Play Simi sound: original background music and sound effects, synthesised
// live with the Web Audio API. No audio files, samples or licences needed.
//
// Day and night share a nostalgic heartland melody with plucked strings and
// soft organ. Games use energetic anime-inspired synth pop; Coast Rush has
// a faster companion theme that accelerates on the final lap. Themes change
// at bar boundaries. The engine, tyre and wind loops remain separate.

export type Sfx =
  | "click"
  | "plot-turn"
  | "plot-flow"
  | "plot-bloom"
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
  | "error"
  | "count"
  | "go"
  | "shell"
  | "crate"
  | "shield"
  | "shieldoff"
  | "turbo"
  | "crash"
  | "lap"
  | "finallap"
  | "overtake"
  | "overtaken"
  | "tier"
  | "tick"
  | "checkered"
  | "timeup";
export type Theme = "day" | "night" | "game" | "race";

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
  // Bound short combined music/effect peaks that a compressor can miss during
  // its attack, while keeping quiet sounds close to their original level.
  const limiter = ctx.createWaveShaper();
  limiter.curve = Float32Array.from({ length: 2048 }, (_, i) => {
    const x = (i / 2047) * 2 - 1;
    return 0.9 * Math.tanh(x / 0.9);
  });
  limiter.oversample = "2x";
  master.connect(comp).connect(limiter).connect(ctx.destination);
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
  "plot-turn": 0.08,
  "plot-flow": 0.12,
  "plot-bloom": 0.6,
  sparkle: 0.25,
  overtake: 0.5,
  overtaken: 0.5,
};
let shellStreak = 0;
const penta = [72, 74, 76, 79, 81, 84, 86, 88, 91];

export function play(name: Sfx) {
  if (!soundOn || !ctx || ctx.state !== "running") return;
  const t = ctx!.currentTime + 0.01;
  const gap = throttle[name];
  if (gap && t - (last.get(name) ?? -1) < gap) return;
  last.set(name, t);
  const r = Math.random();
  switch (name) {
    case "plot-turn":
      tone({ type: "triangle", f: 340, to: 190, at: t, dur: 0.09, vol: 0.1 });
      hiss(t, 0.07, 0.025, "bandpass", 1200, 600);
      break;
    case "plot-flow":
      [660, 880].forEach((f, i) =>
        tone({ f, to: f * 1.2, at: t + i * 0.07, dur: 0.15, vol: 0.07 }),
      );
      hiss(t, 0.2, 0.035, "lowpass", 1700, 700);
      break;
    case "plot-bloom":
      [60, 64, 67, 72].forEach((n, i) =>
        tone({
          type: "triangle",
          f: midi(n),
          at: t + i * 0.1,
          dur: 0.3,
          vol: 0.08,
          send: 0.15,
        }),
      );
      break;
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
    case "count":
      tone({ type: "square", f: 440, at: t, dur: 0.2, vol: 0.07, send: 0.2 });
      break;
    case "go":
      tone({ type: "square", f: 880, at: t, dur: 0.55, vol: 0.07, send: 0.3 });
      tone({ type: "triangle", f: 1320, at: t, dur: 0.55, vol: 0.05 });
      break;
    case "shell": {
      // Shells collected in quick succession climb the scale.
      shellStreak =
        t - (last.get("shell-run") ?? -9) < 2.5
          ? Math.min(penta.length - 1, shellStreak + 1)
          : 0;
      last.set("shell-run", t);
      const n = penta[shellStreak] + 12;
      tone({ type: "triangle", f: midi(n), at: t, dur: 0.07, vol: 0.08 });
      tone({
        type: "triangle",
        f: midi(n + 7),
        at: t + 0.06,
        dur: 0.22,
        vol: 0.07,
        send: 0.35,
      });
      break;
    }
    case "crate":
      hiss(t, 0.08, 0.09, "bandpass", 1400, 500, undefined, 2);
      [72, 79, 84].forEach((n, i) =>
        tone({
          type: "triangle",
          f: midi(n),
          at: t + 0.04 + i * 0.06,
          dur: 0.2,
          vol: 0.09,
          send: 0.3,
        }),
      );
      break;
    case "shield":
      tone({ f: 300, to: 900, at: t, dur: 0.4, vol: 0.09, send: 0.5 });
      tone({ f: 1200, to: 1800, at: t + 0.1, dur: 0.5, vol: 0.04, send: 0.7 });
      hiss(t, 0.4, 0.03, "bandpass", 1500, 5000, undefined, 2);
      break;
    case "shieldoff":
      tone({ f: 900, to: 300, at: t, dur: 0.28, vol: 0.06, send: 0.3 });
      break;
    case "turbo":
      hiss(t, 0.55, 0.1, "bandpass", 400, 3200, undefined, 1.2);
      tone({
        type: "sawtooth",
        f: 180,
        to: 560,
        at: t,
        dur: 0.45,
        vol: 0.05,
        filter: 1800,
      });
      break;
    case "crash":
      hiss(t, 0.38, 0.14, "lowpass", 1700, 180);
      tone({ f: 140, to: 40, at: t, dur: 0.32, vol: 0.14 });
      tone({ type: "square", f: 320, to: 90, at: t, dur: 0.13, vol: 0.05 });
      break;
    case "lap":
      [79, 84, 88].forEach((n, i) =>
        tone({
          type: "triangle",
          f: midi(n),
          at: t + i * 0.08,
          dur: 0.22,
          vol: 0.09,
          send: 0.3,
        }),
      );
      break;
    case "finallap":
      [84, 84, 84, 91].forEach((n, i) =>
        tone({
          type: "square",
          f: midi(n),
          at: t + i * 0.11,
          dur: i === 3 ? 0.5 : 0.09,
          vol: 0.06,
          send: 0.3,
        }),
      );
      break;
    case "overtake":
      tone({ type: "triangle", f: midi(76), at: t, dur: 0.07, vol: 0.07 });
      tone({
        type: "triangle",
        f: midi(83),
        at: t + 0.07,
        dur: 0.16,
        vol: 0.07,
        send: 0.2,
      });
      break;
    case "overtaken":
      tone({ type: "triangle", f: midi(71), at: t, dur: 0.07, vol: 0.05 });
      tone({
        type: "triangle",
        f: midi(64),
        at: t + 0.07,
        dur: 0.16,
        vol: 0.05,
      });
      break;
    case "tier":
      tone({ type: "square", f: midi(86), at: t, dur: 0.06, vol: 0.045 });
      tone({
        type: "square",
        f: midi(93),
        at: t + 0.05,
        dur: 0.09,
        vol: 0.045,
      });
      break;
    case "tick":
      tone({ type: "triangle", f: 1000, at: t, dur: 0.05, vol: 0.06 });
      break;
    case "checkered": {
      const fanfare = [72, 76, 79, 84, 79, 84, 88];
      fanfare.forEach((n, i) =>
        tone({
          type: "square",
          f: midi(n),
          at: t + i * 0.12,
          dur: i === fanfare.length - 1 ? 0.5 : 0.11,
          vol: 0.055,
          send: 0.3,
        }),
      );
      [60, 72, 76, 79, 84, 88].forEach((n) =>
        tone({
          type: "triangle",
          f: midi(n),
          at: t + fanfare.length * 0.12,
          dur: 1.8,
          vol: 0.05,
          send: 0.5,
        }),
      );
      hiss(t + fanfare.length * 0.12, 1.2, 0.03, "highpass", 6000);
      break;
    }
    case "timeup":
      [67, 63, 60, 55].forEach((n, i) =>
        tone({
          type: "triangle",
          f: midi(n),
          at: t + i * 0.2,
          dur: i === 3 ? 0.8 : 0.24,
          vol: 0.08,
          send: 0.35,
        }),
      );
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
// Written eight-bar melodies give each place a recognisable hook. Nulls are
// rests on an eighth-note grid; the second half answers the first half.
type MelodyBar = readonly [
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
  number | null,
];
type Song = {
  bpm: number;
  swing: number;
  chords: readonly (readonly [number, number, number, ...number[]])[];
  melody: readonly MelodyBar[];
  arrangement: "heartland" | "evening" | "anime" | "race";
};
const heartlandMelody: readonly MelodyBar[] = [
  [72, null, 76, 79, 81, null, 79, 76],
  [74, null, 72, 69, 72, null, null, null],
  [69, 72, 74, null, 76, 74, 72, null],
  [67, null, 69, 72, 74, null, null, null],
  [76, null, 79, 81, 84, null, 81, 79],
  [76, 74, 72, null, 69, null, 72, 74],
  [77, null, 76, 74, 72, 69, 67, null],
  [71, 74, 79, null, 72, null, null, null],
];
const songs: Record<Theme, Song> = {
  // A small tribute to heartland evenings: plucked strings, rounded organ,
  // pentatonic phrases and a gently lilting old-radio accompaniment.
  day: {
    bpm: 92,
    swing: 0.16,
    arrangement: "heartland",
    chords: [
      [48, 52, 55, 59],
      [45, 48, 52, 55],
      [53, 57, 60, 64],
      [43, 47, 50, 53],
      [48, 52, 55, 59],
      [45, 48, 52, 55],
      [50, 53, 57, 60],
      [43, 47, 50, 53],
    ],
    melody: heartlandMelody,
  },
  night: {
    bpm: 76,
    swing: 0.12,
    arrangement: "evening",
    chords: [
      [48, 52, 55, 59],
      [45, 48, 52, 55],
      [53, 57, 60, 64],
      [43, 47, 50, 53],
      [52, 55, 59, 62],
      [45, 48, 52, 55],
      [50, 53, 57, 60],
      [43, 47, 50, 53],
    ],
    melody: heartlandMelody,
  },
  // Original anime-opening-inspired pop: IV-V-iii-vi lift, answered hooks,
  // octave bass, bright synth strings and a full backbeat.
  game: {
    bpm: 160,
    swing: 0,
    arrangement: "anime",
    chords: [
      [53, 57, 60, 64],
      [55, 59, 62, 65],
      [52, 55, 59, 62],
      [57, 60, 64, 67],
      [53, 57, 60, 64],
      [55, 59, 62, 65],
      [48, 52, 55, 59],
      [57, 60, 64, 67],
    ],
    melody: [
      [77, 76, 72, 76, 79, null, 81, 79],
      [79, 74, 77, 79, 83, null, 81, 79],
      [76, 79, 83, null, 86, 83, 79, 76],
      [81, null, 84, 83, 81, 76, 79, null],
      [81, 79, 77, 76, 77, 81, 84, null],
      [83, 81, 79, 77, 79, 83, 86, null],
      [84, null, 79, 76, 79, 84, 83, 79],
      [81, 79, 76, null, 72, 76, 79, 76],
    ],
  },
  race: {
    bpm: 172,
    swing: 0,
    arrangement: "race",
    chords: [
      [50, 53, 57],
      [46, 50, 53],
      [53, 57, 60],
      [48, 52, 55],
      [46, 50, 53],
      [48, 52, 55],
      [50, 53, 57],
      [45, 49, 52],
    ],
    melody: [
      [74, 77, 81, 77, 84, 81, 77, 81],
      [82, null, 81, 77, 74, 77, 81, 82],
      [81, 84, 89, null, 88, 84, 81, 77],
      [79, 84, 88, 84, 91, null, 88, 84],
      [86, 84, 82, 81, 82, null, 77, 74],
      [84, 83, 79, 76, 79, 84, 88, null],
      [86, 81, 77, 74, 77, 81, 86, 89],
      [85, null, 81, 76, 73, 76, 81, 73],
    ],
  },
};
let tempo = 1;
let timer = 0,
  step = 0,
  nextAt = 0;

function scheduleStep(s: Song, i: number, at: number, spb: number) {
  const out = musicBus;
  const bar = Math.floor(i / 16);
  const pos = i % 16;
  const chord = s.chords[bar % s.chords.length];
  const energetic = s.arrangement === "anime" || s.arrangement === "race";
  const evening = s.arrangement === "evening";
  const race = s.arrangement === "race";
  const root = chord[0] - 12;

  if (energetic) {
    // Sustained strings under short guitar-like offbeat strums.
    if (pos === 0)
      chord.forEach((n) =>
        tone({
          type: "sawtooth",
          f: midi(n),
          at,
          dur: spb * 15,
          vol: 0.009,
          attack: 0.035,
          filter: 1800,
          out,
        }),
      );
    if (pos % 4 === 2)
      chord.forEach((n, k) =>
        tone({
          type: "sawtooth",
          f: midi(n + 12),
          at: at + k * 0.006,
          dur: spb * 1.4,
          vol: 0.009,
          filter: 2400,
          out,
        }),
      );
    // Quieter sixteenths keep the pulse moving beneath the lead.
    if (pos % 2 === 1)
      tone({
        type: "triangle",
        f: midi(chord[(pos >> 1) % chord.length] + 24),
        at,
        dur: spb * 0.7,
        vol: 0.012,
        out,
      });
    if (pos % 2 === 0)
      tone({
        type: "sawtooth",
        f: midi(root + (pos % 4 === 2 ? 12 : 0)),
        at,
        dur: spb * 1.7,
        vol: 0.047,
        attack: 0.008,
        filter: 650,
        out,
      });
    if (pos % 4 === 0 || (race && pos === 14))
      tone({ f: 145, to: 43, at, dur: 0.14, vol: 0.11, out });
    if (pos === 4 || pos === 12 || (bar % 4 === 3 && pos >= 14)) {
      hiss(at, 0.12, 0.045, "bandpass", 2200, undefined, out, 0.8);
      tone({
        type: "triangle",
        f: 190,
        to: 125,
        at,
        dur: 0.09,
        vol: 0.035,
        out,
      });
    }
    hiss(
      at,
      pos % 4 === 2 ? 0.075 : 0.025,
      pos % 2 ? 0.009 : 0.017,
      "highpass",
      7500,
      undefined,
      out,
    );
    if (pos === 0 && bar % 4 === 0)
      hiss(at, 0.55, 0.027, "highpass", 5500, undefined, out);
  } else {
    // Alternating bass and lightly brushed rhythm leave room for the tune.
    if (pos === 0 || pos === 8)
      tone({
        f: midi(root + (pos === 8 ? 7 : 0)),
        at,
        dur: spb * 5,
        vol: evening ? 0.065 : 0.08,
        attack: 0.012,
        out,
      });
    if (pos === 0 || pos === 6 || pos === 10)
      chord.forEach((n, k) => {
        tone({
          type: "triangle",
          f: midi(n + 12),
          at: at + k * 0.018,
          dur: spb * (evening ? 6 : 3),
          vol: evening ? 0.014 : 0.021,
          filter: 1900,
          out,
          send: 0.12,
        });
      });
    if (pos === 0)
      chord.forEach((n) =>
        tone({
          f: midi(n),
          at,
          dur: spb * 15,
          vol: evening ? 0.017 : 0.012,
          attack: 0.16,
          out,
          send: 0.12,
        }),
      );
    if (pos === 4 || pos === 12) {
      hiss(at, 0.12, evening ? 0.008 : 0.016, "bandpass", 2400, undefined, out);
      tone({
        f: 720,
        to: 480,
        at,
        dur: 0.035,
        vol: evening ? 0.008 : 0.016,
        out,
      });
    }
    if (pos % 2 === 0)
      hiss(
        at,
        0.035,
        evening ? 0.004 : 0.009,
        "highpass",
        6500,
        undefined,
        out,
      );
  }

  if (pos % 2 !== 0) return;
  const melody = s.melody[bar % s.melody.length];
  const note = melody[pos / 2];
  if (note === null) return;
  const dur = spb * (melody[pos / 2 + 1] === null ? 3.6 : 1.8);
  if (energetic) {
    tone({
      type: "sawtooth",
      f: midi(note),
      at,
      dur,
      vol: 0.026,
      attack: 0.012,
      filter: 3200,
      out,
      send: 0.08,
    });
    tone({
      type: "triangle",
      f: midi(note + 12),
      at,
      dur: dur * 0.75,
      vol: 0.012,
      out,
    });
  } else {
    const n = note - (evening ? 12 : 0);
    tone({
      type: "triangle",
      f: midi(n),
      at,
      dur: dur * 1.4,
      vol: evening ? 0.045 : 0.052,
      filter: 2400,
      out,
      send: 0.18,
    });
    // A quick upper partial gives the rounded pluck a small metallic attack.
    tone({ f: midi(n + 19), at, dur: 0.09, vol: 0.008, out });
  }
}
function scheduler() {
  if (!ctx) return;
  while (nextAt < ctx.currentTime + 0.15) {
    const s = songs[theme];
    const spb = 60 / (s.bpm * tempo) / 4;
    const swing = step % 2 ? s.swing * spb : 0;
    scheduleStep(s, step, nextAt + swing, spb);
    nextAt += spb;
    step++;
    // Change mood only on a bar line so chords never cut off mid-bar.
    if (step % 16 === 0 && nextTheme !== theme) {
      theme = nextTheme;
      step = 0;
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

// ---------------------------------------------------------------- kart loop
let kart: {
  low: OscillatorNode;
  high: OscillatorNode;
  filter: BiquadFilterNode;
  gain: GainNode;
  skid: GainNode;
  wind: GainNode;
  sources: AudioScheduledSourceNode[];
} | null = null;
function stopEngine() {
  const k = kart;
  kart = null;
  if (!k || !ctx) return;
  const t = ctx.currentTime;
  for (const g of [k.gain, k.skid, k.wind]) {
    g.gain.cancelScheduledValues(t);
    g.gain.setTargetAtTime(0, t, 0.05);
  }
  k.sources.forEach((s) => s.stop(t + 0.4));
}
/** speed is 0 at rest and 1 at cruising pace; the loop is created on demand. */
function engine(speed: number, drifting: boolean, boosting: boolean) {
  if (!soundOn || !ctx || ctx.state !== "running") return stopEngine();
  const c = ctx;
  if (!kart) {
    const gain = c.createGain();
    gain.gain.value = 0;
    const filter = c.createBiquadFilter();
    filter.type = "lowpass";
    filter.Q.value = 2;
    const low = c.createOscillator();
    low.type = "sawtooth";
    const high = c.createOscillator();
    high.type = "square";
    const highLevel = c.createGain();
    highLevel.gain.value = 0.35;
    low.connect(filter);
    high.connect(highLevel).connect(filter);
    filter.connect(gain).connect(sfxBus);
    const air = c.createBufferSource();
    air.buffer = noise;
    air.loop = true;
    const skid = c.createGain();
    skid.gain.value = 0;
    const squeal = c.createBiquadFilter();
    squeal.type = "bandpass";
    squeal.frequency.value = 2700;
    squeal.Q.value = 7;
    air.connect(squeal).connect(skid).connect(sfxBus);
    const wind = c.createGain();
    wind.gain.value = 0;
    const rush = c.createBiquadFilter();
    rush.type = "bandpass";
    rush.frequency.value = 900;
    rush.Q.value = 0.6;
    air.connect(rush).connect(wind).connect(sfxBus);
    const sources = [low, high, air];
    sources.forEach((s) => s.start());
    kart = { low, high, filter, gain, skid, wind, sources };
  }
  const t = c.currentTime;
  const pitch = 52 + speed * 88;
  kart.low.frequency.setTargetAtTime(pitch, t, 0.06);
  kart.high.frequency.setTargetAtTime(pitch * 2.01, t, 0.06);
  kart.filter.frequency.setTargetAtTime(320 + speed * 1100, t, 0.08);
  kart.gain.gain.setTargetAtTime(0.02 + Math.min(1, speed) * 0.028, t, 0.08);
  kart.skid.gain.setTargetAtTime(drifting ? 0.03 : 0, t, 0.05);
  kart.wind.gain.setTargetAtTime(boosting ? 0.05 : speed * 0.012, t, 0.1);
}

function apply() {
  if (!ctx) return;
  if (!soundOn) stopEngine();
  master.gain.setTargetAtTime(soundOn ? 0.9 : 0, ctx.currentTime, 0.02);
  if (soundOn && musicOn && !document.hidden && ctx.state === "running")
    startMusic();
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
    // Configuration also runs while restoring a saved profile. Only unlock(),
    // called by input handlers, may create or resume the live audio context.
    apply();
  },
  setTheme(next: Theme) {
    nextTheme = next;
    if (!timer) theme = next;
  },
  get theme() {
    return nextTheme;
  },
  /** 1 is the written tempo. Coast Rush raises it for the final lap. */
  setTempo(scale: number) {
    tempo = scale;
  },
  engine,
  engineOff: stopEngine,
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
  const saved = {
    ctx,
    master,
    musicBus,
    sfxBus,
    reverb,
    wet,
    noise,
    theme,
    nextTheme,
  };
  setup(offline);
  musicBus.gain.value = 1.3;
  theme = nextTheme = mood;
  const s = songs[mood];
  const spb = 60 / s.bpm / 4;
  for (let i = 0, at = 0.05; at < seconds - 0.2; i++, at += spb)
    scheduleStep(s, i, at + (i % 2 ? s.swing * spb : 0), spb);
  try {
    return await offline.startRendering();
  } finally {
    ({ ctx, master, musicBus, sfxBus, reverb, wet, noise, theme, nextTheme } =
      saved);
  }
}
