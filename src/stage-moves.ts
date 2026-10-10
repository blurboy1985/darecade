// Open Stage dance moves: poses as plain numbers, so they can be tested
// without three.js. stage-view.ts applies a pose to an avatar's joints.

/** Every field is an offset from standing still; zero is neutral. */
export type StagePose = {
  /** Body: sideways step, height, turn, forward pitch, side roll, squash. */
  x: number;
  y: number;
  yaw: number;
  pitch: number;
  roll: number;
  squash: number;
  /** Shoulders: reach forward and up, and raise out to the side. */
  armL: number;
  armR: number;
  outL: number;
  outR: number;
  /** Elbow and knee bend, and legs swinging forward or splayed apart. */
  elbowL: number;
  elbowR: number;
  legL: number;
  legR: number;
  splay: number;
  kneeL: number;
  kneeR: number;
  /** Spine bending forward and to the side; head nod, turn and tilt. */
  spine: number;
  lean: number;
  nod: number;
  turn: number;
  tilt: number;
};
type Part = Partial<StagePose>;

const KEYS = [
  "x",
  "y",
  "yaw",
  "pitch",
  "roll",
  "squash",
  "armL",
  "armR",
  "outL",
  "outR",
  "elbowL",
  "elbowR",
  "legL",
  "legR",
  "splay",
  "kneeL",
  "kneeR",
  "spine",
  "lean",
  "nod",
  "turn",
  "tilt",
] as const;
export const neutralPose = (): StagePose =>
  Object.fromEntries(KEYS.map((key) => [key, 0])) as StagePose;

/** The same move facing the other way. */
function mirror(p: Part): Part {
  const sign = (v?: number) => (v === undefined ? undefined : -v);
  const m: Part = {
    ...p,
    x: sign(p.x),
    yaw: sign(p.yaw),
    roll: sign(p.roll),
    lean: sign(p.lean),
    turn: sign(p.turn),
    tilt: sign(p.tilt),
    armL: p.armR,
    armR: p.armL,
    outL: p.outR,
    outR: p.outL,
    elbowL: p.elbowR,
    elbowR: p.elbowL,
    legL: p.legR,
    legR: p.legL,
    kneeL: p.kneeR,
    kneeR: p.kneeL,
  };
  for (const key of KEYS) if (m[key] === undefined) delete m[key];
  return m;
}

export const STAGE_STYLES = [
  { id: "pop", name: "Pop", hint: "Big steps, a dip and a jump" },
  { id: "disco", name: "Disco", hint: "Points, hip sways and rolling arms" },
  { id: "street", name: "Street", hint: "Low, loose and leaning back" },
  { id: "robot", name: "Robot", hint: "Stiff arms that click into place" },
] as const;
export type StageStyle = (typeof STAGE_STYLES)[number]["id"];

/**
 * A move is played once. t runs 0 to 1; e rises and falls with it, and h is e
 * held at the top, for moves that strike a pose.
 */
type Move = {
  seconds: number;
  pose: (t: number, e: number, h: number) => Part;
};
const TAU = Math.PI * 2;
/** Robot joints arrive in three clicks instead of gliding. */
const click = (h: number) => Math.round(h * 3) / 3;

const popSide: Move["pose"] = (_t, _e, h) => ({
  x: -0.45 * h,
  yaw: -0.5 * h,
  roll: 0.15 * h,
  outL: 2.2 * h,
  outR: 0.5 * h,
  elbowR: 1.3 * h,
  splay: 0.2 * h,
  turn: -0.3 * h,
});
const discoPoint: Move["pose"] = (_t, _e, h) => ({
  x: -0.25 * h,
  roll: -0.14 * h,
  lean: 0.2 * h,
  outL: 2.7 * h,
  armR: -0.5 * h,
  outR: -0.5 * h,
  kneeR: 0.35 * h,
  nod: -0.25 * h,
  turn: -0.45 * h,
});
const streetLean: Move["pose"] = (_t, _e, h) => ({
  x: -0.3 * h,
  yaw: -0.35 * h,
  pitch: -0.2 * h,
  armL: -1.1 * h,
  armR: -1.1 * h,
  elbowL: 1.5 * h,
  elbowR: 1.5 * h,
  kneeL: 0.45 * h,
  legR: -0.3 * h,
  tilt: -0.2 * h,
});
const robotArm: Move["pose"] = (_t, _e, h) => {
  const q = click(h);
  return {
    x: -0.2 * q,
    yaw: -0.4 * q,
    armL: -1.5 * q,
    elbowL: 1.5 * q,
    elbowR: 0.4 * q,
    turn: -0.55 * q,
  };
};
const side =
  (pose: Move["pose"]): Move["pose"] =>
  (t, e, h) =>
    mirror(pose(t, e, h));

/** One move per lane (left, down, up, right) for each style. */
const LANE_MOVES: Record<StageStyle, Move[]> = {
  pop: [
    { seconds: 0.42, pose: popSide },
    {
      seconds: 0.42,
      pose: (_t, _e, h) => ({
        squash: -0.2 * h,
        pitch: 0.25 * h,
        kneeL: 0.9 * h,
        kneeR: 0.9 * h,
        armL: -0.6 * h,
        armR: -0.6 * h,
        elbowL: 1.2 * h,
        elbowR: 1.2 * h,
        nod: 0.2 * h,
      }),
    },
    {
      seconds: 0.46,
      pose: (_t, e, h) => ({
        y: 0.55 * e,
        armL: -2.8 * h,
        armR: -2.8 * h,
        kneeL: 0.5 * e,
        kneeR: 0.5 * e,
        nod: -0.2 * h,
      }),
    },
    { seconds: 0.42, pose: side(popSide) },
  ],
  disco: [
    { seconds: 0.46, pose: discoPoint },
    {
      seconds: 0.5,
      // Fists rolling round each other, low.
      pose: (t, _e, h) => ({
        squash: -0.14 * h,
        kneeL: 0.6 * h,
        kneeR: 0.6 * h,
        spine: 0.2 * h,
        armL: (-0.9 + Math.sin(t * TAU * 2) * 0.35) * h,
        armR: (-0.9 - Math.sin(t * TAU * 2) * 0.35) * h,
        elbowL: 1.4 * h,
        elbowR: 1.4 * h,
        roll: Math.sin(t * TAU) * 0.1 * h,
      }),
    },
    {
      seconds: 0.5,
      // The same roll, climbing overhead into a V.
      pose: (t, e, h) => ({
        y: 0.22 * e,
        armL: -2.5 * h + Math.sin(t * TAU * 2) * 0.25 * e,
        armR: -2.5 * h - Math.sin(t * TAU * 2) * 0.25 * e,
        outL: 0.5 * h,
        outR: 0.5 * h,
        elbowL: 0.5 * e,
        elbowR: 0.5 * e,
        nod: -0.3 * h,
      }),
    },
    { seconds: 0.46, pose: side(discoPoint) },
  ],
  street: [
    { seconds: 0.44, pose: streetLean },
    {
      seconds: 0.46,
      pose: (_t, _e, h) => ({
        squash: -0.28 * h,
        kneeL: 1.2 * h,
        kneeR: 1.2 * h,
        splay: 0.35 * h,
        outL: 1.1 * h,
        outR: 1.1 * h,
        spine: 0.3 * h,
        nod: -0.15 * h,
      }),
    },
    {
      seconds: 0.5,
      // Raise the roof: two pushes with bent arms.
      pose: (t, e, h) => {
        const push = Math.abs(Math.sin(t * TAU));
        return {
          y: 0.3 * e,
          outL: 2 * h,
          outR: 2 * h,
          elbowL: (1.3 - push) * h,
          elbowR: (1.3 - push) * h,
          kneeL: 0.3 * e,
          kneeR: 0.3 * e,
          nod: -0.15 * h,
        };
      },
    },
    { seconds: 0.44, pose: side(streetLean) },
  ],
  robot: [
    { seconds: 0.44, pose: robotArm },
    {
      seconds: 0.46,
      pose: (_t, _e, h) => {
        const q = click(h);
        return {
          spine: 0.7 * q,
          pitch: 0.15 * q,
          armL: -0.4 * q,
          armR: -0.4 * q,
          nod: -0.4 * q,
        };
      },
    },
    {
      seconds: 0.46,
      pose: (_t, _e, h) => {
        const q = click(h);
        return {
          y: 0.12 * q,
          armL: -3 * q,
          armR: -3 * q,
          tilt: 0.25 * (q === 1 ? 1 : -q),
        };
      },
    },
    { seconds: 0.44, pose: side(robotArm) },
  ],
};

/** Moves the show plays by itself. */
const SPECIAL_MOVES = {
  /** A full turn with the arms flung out. */
  spin: {
    seconds: 0.7,
    pose: (t, e) => ({
      yaw: TAU * (t * t * (3 - 2 * t)),
      y: 0.15 * e,
      outL: 1.5 * e,
      outR: 1.5 * e,
      legR: -0.25 * e,
      kneeR: 0.5 * e,
    }),
  },
  /** A star jump. */
  star: {
    seconds: 0.62,
    pose: (_t, e, h) => ({
      y: 0.7 * e,
      outL: 2.3 * h,
      outR: 2.3 * h,
      splay: 0.6 * h,
      nod: -0.2 * h,
    }),
  },
  /** A body wave rolling from the head down to the knees. */
  wave: {
    seconds: 0.95,
    pose: (t, e) => ({
      nod: Math.sin(t * TAU) * 0.35 * e,
      spine: Math.sin(t * TAU - 0.9) * 0.4 * e,
      pitch: Math.sin(t * TAU - 1.8) * 0.18 * e,
      kneeL: (0.4 + Math.sin(t * TAU - 2.7) * 0.4) * e,
      kneeR: (0.4 + Math.sin(t * TAU - 2.7) * 0.4) * e,
      armL: -0.5 * e,
      armR: -0.5 * e,
      outL: (0.7 + Math.sin(t * TAU) * 0.5) * e,
      outR: (0.7 - Math.sin(t * TAU) * 0.5) * e,
    }),
  },
  /** A missed note: a wobble backwards, arms out for balance. */
  stumble: {
    seconds: 0.5,
    pose: (t, e) => ({
      pitch: -0.28 * e,
      roll: Math.sin(t * TAU * 1.5) * 0.2 * e,
      outL: 1.2 * e,
      outR: 0.9 * e,
      kneeL: 0.5 * e,
      legR: -0.35 * e,
      nod: 0.25 * e,
    }),
  },
} satisfies Record<string, Move>;
export type StageSpecial = keyof typeof SPECIAL_MOVES;
export type StageMoveId = `${StageStyle}-${0 | 1 | 2 | 3}` | StageSpecial;

/** The combo of eight earns a spin, sixteen a star jump, twenty-four a wave. */
export function comboMove(tier: number): StageSpecial {
  return (["spin", "star", "wave"] as const)[(Math.max(1, tier) - 1) % 3];
}
export function laneMove(style: StageStyle, lane: number): StageMoveId {
  return `${style}-${Math.max(0, Math.min(3, Math.floor(lane)))}` as StageMoveId;
}
function find(id: StageMoveId): Move {
  if (id in SPECIAL_MOVES) return SPECIAL_MOVES[id as StageSpecial];
  const [style, lane] = id.split("-");
  return LANE_MOVES[style as StageStyle][Number(lane)];
}
export const moveSeconds = (id: StageMoveId) => find(id).seconds;
export const STAGE_MOVE_IDS: StageMoveId[] = [
  ...STAGE_STYLES.flatMap((style) =>
    [0, 1, 2, 3].map((lane) => laneMove(style.id, lane)),
  ),
  ...(Object.keys(SPECIAL_MOVES) as StageSpecial[]),
];

/** What the dancer does between moves, in time with the beat. */
function groove(style: StageStyle, time: number): Part {
  const beat = time * 7,
    s = Math.sin(beat),
    bounce = Math.abs(s);
  if (style === "disco")
    return {
      x: Math.sin(beat / 2) * 0.12,
      roll: Math.sin(beat / 2) * 0.08,
      y: bounce * 0.03,
      armL: -0.5 - s * 0.35,
      armR: -0.5 + s * 0.35,
      elbowL: 0.9,
      elbowR: 0.9,
      kneeL: 0.15 + Math.max(0, s) * 0.2,
      kneeR: 0.15 + Math.max(0, -s) * 0.2,
    };
  if (style === "street")
    return {
      y: -0.03 + bounce * 0.07,
      squash: -0.04,
      pitch: 0.08,
      yaw: Math.sin(beat / 2) * 0.18,
      armL: -0.3 - s * 0.3,
      armR: -0.3 + s * 0.3,
      elbowL: 0.7,
      elbowR: 0.7,
      kneeL: 0.4,
      kneeR: 0.4,
      nod: bounce * 0.18,
    };
  if (style === "robot") {
    const step = Math.round(Math.sin(beat / 2) * 2) / 2;
    return {
      yaw: step * 0.22,
      armL: -0.75,
      armR: -0.75,
      elbowL: 1.5 + step * 0.3,
      elbowR: 1.5 - step * 0.3,
      turn: -step * 0.3,
    };
  }
  return {
    y: bounce * 0.04,
    yaw: s * 0.12,
    armL: -s * 0.5,
    armR: s * 0.5,
    elbowL: 0.3,
    elbowR: 0.3,
    legL: s * 0.25,
    legR: -s * 0.25,
  };
}
/** Fever: both arms pumping overhead, whatever the style. */
function feverLoop(time: number): Part {
  const s = Math.sin(time * 12);
  return {
    y: Math.abs(s) * 0.12,
    yaw: Math.sin(time * 6) * 0.25,
    armL: -2.6 + s * 0.35,
    armR: -2.6 - s * 0.35,
    outL: 0.35,
    outR: 0.35,
    elbowL: 0.4 + s * 0.3,
    elbowR: 0.4 - s * 0.3,
    kneeL: 0.25 + Math.max(0, s) * 0.3,
    kneeR: 0.25 + Math.max(0, -s) * 0.3,
    nod: -0.2,
  };
}
const FINISH: Part = {
  roll: 0.08,
  outL: 2.6,
  outR: 0.5,
  elbowR: 1.3,
  splay: 0.25,
  nod: -0.25,
  turn: -0.2,
};
const SLUMP: Part = {
  spine: 0.5,
  nod: 0.5,
  squash: -0.05,
  kneeL: 0.2,
  kneeR: 0.2,
  armL: 0.1,
  armR: 0.1,
};

export type StageDance = {
  style: StageStyle;
  /** A show is being played: keep the groove going. */
  playing: boolean;
  fever?: boolean;
  /** The move being played and how many seconds ago it began. */
  move?: { id: StageMoveId; age: number } | null;
  /** The pose held once the show is over. */
  hold?: "finish" | "slump" | null;
  /** Reduce motion: no groove, spin or stumble; lane moves still play. */
  reduced?: boolean;
};

export function stagePose(dance: StageDance, time: number): StagePose {
  const pose = neutralPose();
  const add = (part: Part, weight = 1) => {
    for (const key of KEYS) pose[key] += (part[key] ?? 0) * weight;
  };
  const move =
    dance.move &&
    dance.move.age >= 0 &&
    dance.move.age < moveSeconds(dance.move.id) &&
    !(dance.reduced && dance.move.id in SPECIAL_MOVES)
      ? dance.move
      : null;
  const t = move ? move.age / moveSeconds(move.id) : 0,
    e = Math.sin(t * Math.PI),
    h = Math.min(1, e * 1.5);
  if (dance.hold) {
    add(dance.hold === "finish" ? FINISH : SLUMP);
    if (!dance.reduced) pose.y += Math.sin(time * 2) * 0.01;
    return pose;
  }
  // The groove gives way while a move is at its height.
  if (dance.playing && !dance.reduced)
    add(
      dance.fever ? feverLoop(time) : groove(dance.style, time),
      1 - h * 0.85,
    );
  if (move) add(find(move.id).pose(t, e, h));
  return pose;
}
