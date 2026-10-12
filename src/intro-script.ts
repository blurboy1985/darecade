// The intro film's script: how long it runs, what is said when, and when the
// film should play at all. The film itself is a video (public/intro/), made
// in play-simi-promo/story.html; the lines here are its narration, shown to
// screen readers as it plays. Nothing here touches the browser.

export const DURATION = 60;
export const SEEN_KEY = "playsimi-intro-seen";

export type Caption = {
  who: "narrator" | "kid";
  from: number;
  to: number;
  text: string;
};
export const captions: Caption[] = [
  { who: "kid", from: 0.7, to: 2.9, text: "Oi! Come down lah!" },
  { who: "kid", from: 2.9, to: 4, text: "Coming! Wait ah!" },
  { who: "narrator", from: 4, to: 6.1, text: "No group chat, no plan." },
  { who: "narrator", from: 6.1, to: 8, text: "Meet you downstairs." },
  { who: "narrator", from: 8.3, to: 10.3, text: "The dragon playground." },
  { who: "narrator", from: 10.4, to: 12.2, text: "Chapteh till dinner." },
  { who: "narrator", from: 12.25, to: 14.1, text: "Ice pops from the mama shop." },
  { who: "narrator", from: 14.15, to: 16, text: "Catching at the void deck." },
  { who: "narrator", from: 18.7, to: 20.4, text: "Then we grew up." },
  {
    who: "narrator",
    from: 20.5,
    to: 24,
    text: "Everyone’s online. Nobody’s downstairs.",
  },
  { who: "narrator", from: 24.4, to: 26.8, text: "So one night, I asked myself." },
  { who: "narrator", from: 26.9, to: 29.9, text: "What if downstairs was online?" },
  { who: "narrator", from: 30, to: 32, text: "So I just started building." },
  {
    who: "narrator",
    from: 32.3,
    to: 38.4,
    text: "Nine days. Eighty-nine pull requests. One whole neighbourhood.",
  },
  { who: "narrator", from: 38.5, to: 40.5, text: "I call it Play Simi." },
  { who: "kid", from: 40.6, to: 42.2, text: "Eh, play simi?" },
  { who: "narrator", from: 42.5, to: 44.4, text: "So downstairs is open again." },
  { who: "kid", from: 44.5, to: 46.1, text: "Eh, come down!" },
  { who: "narrator", from: 46.2, to: 48.2, text: "Free, no download." },
  {
    who: "narrator",
    from: 48.3,
    to: 51.6,
    text: "Race, dance, or just hang out like we used to.",
  },
  { who: "narrator", from: 52.8, to: 55.2, text: "Play Simi. Meet you downstairs." },
  { who: "kid", from: 56.9, to: 59, text: "Eh, faster come down lah!" },
];

export function captionAt(t: number): Caption | null {
  return captions.find((line) => t >= line.from && t < line.to) || null;
}

/** The film is cut for both ways of holding a screen. */
export function filmFor(width: number, height: number): "landscape" | "vertical" {
  return height > width ? "vertical" : "landscape";
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
