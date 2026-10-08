// The intro film's script: when each scene starts, who says what, and when
// the film should play at all. The picture (intro-film.ts) and the music
// (intro-score.ts) both read these numbers, so a cut and its beat cannot
// drift apart. Nothing here touches the browser.
//
// The film runs at 120 beats a minute: a beat is half a second and every
// scene starts on one.

export const DURATION = 40;
export const SEEN_KEY = "playsimi-intro-seen";

export const scenes = [
  { id: "arrival", start: 0 },
  { id: "countdown", start: 4.5 },
  { id: "race-fail", start: 6 },
  { id: "hoops-fail", start: 9 },
  { id: "arcade-fail", start: 11.5 },
  { id: "retry", start: 14 },
  { id: "hoops-win", start: 16 },
  { id: "race-win", start: 19 },
  { id: "stage", start: 23 },
  { id: "praise", start: 26 },
  { id: "dare", start: 28 },
  { id: "logo", start: 34 },
] as const;
export type SceneId = (typeof scenes)[number]["id"];

/** The moments the picture and the sound both have to hit. */
export const cue = {
  brake: 2,
  count: [4.5, 5, 5.5],
  go: 6,
  crash: 8,
  rim: 10.5,
  bounces: [12, 12.5, 13],
  gameOver: 13.5,
  retry: 15.5,
  swish: 17.5,
  pass: 21,
  perfect: [24, 24.5, 25],
  pose: 25.5,
  meow: 29.5,
  silence: 32.5,
  logo: 34,
  tagline: 36,
  finale: 38,
} as const;

export type Caption = {
  who: "tea" | "you";
  from: number;
  to: number;
  text: string;
};
export const captions: Caption[] = [
  { who: "tea", from: 2.5, to: 3.6, text: "You’re late." },
  { who: "you", from: 3.6, to: 4.5, text: "Late for what?" },
  { who: "you", from: 14.2, to: 16, text: "Haha. Okay… one more try." },
  { who: "tea", from: 26.2, to: 28, text: "That’s more like it!" },
  { who: "tea", from: 31, to: 32.6, text: "One more round?" },
  { who: "tea", from: 33, to: 34, text: "Or you scared?" },
];

export function sceneAt(t: number): {
  id: SceneId;
  start: number;
  end: number;
} {
  let i = 0;
  while (i + 1 < scenes.length && scenes[i + 1].start <= t) i++;
  return {
    id: scenes[i].id,
    start: scenes[i].start,
    end: i + 1 < scenes.length ? scenes[i + 1].start : DURATION,
  };
}

export function captionAt(t: number): Caption | null {
  return captions.find((line) => t >= line.from && t < line.to) || null;
}

/**
 * The film plays once per browser. `?intro=1` replays it and `?intro=0`
 * turns it off; otherwise automated browsers and players who ask for less
 * motion go straight to the game.
 */
export function introWanted(visit: {
  search: string;
  seen: boolean;
  reducedMotion: boolean;
  automated: boolean;
}): boolean {
  const asked = new URLSearchParams(visit.search).get("intro");
  if (asked === "0") return false;
  if (asked === "1") return true;
  return !visit.seen && !visit.reducedMotion && !visit.automated;
}
