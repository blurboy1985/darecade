import { raceScoreTime } from "../shared/racing.ts";
export const games = {
  noodle: {
    name: "Noodle Run",
    tagline: "Noodle Run",
    rule: "Eat dumplings. Dodge walls and your tail.",
    controls: "Arrows · WASD · swipe",
    genre: "SNAKE",
    description: "Eat. Grow. Don’t crash.",
  },
  brick: {
    name: "Brick Bash",
    tagline: "Brick Bash",
    rule: "Smash bricks, catch power-ups, and beat the Big Brick at 0:35. 3 lives.",
    controls: "← → · A D · drag",
    genre: "BREAKER",
    description: "Smash the wall.",
  },
  hop: {
    name: "Hop Hop",
    tagline: "Hop Hop",
    rule: "Jump crates and gaps. Catch a star to smash crates and bridge gaps.",
    controls: "Space · ↑ · tap",
    genre: "RUNNER",
    description: "Run the rooftops.",
  },
  swarm: {
    name: "Star Swarm",
    tagline: "Star Swarm",
    rule: "Dodge. Auto-fire. Boss at 0:35.",
    controls: "Arrows · WASD · drag",
    genre: "SHOOTER",
    description: "Blast the swarm.",
  },
  coast: {
    name: "Coast Rush",
    tagline: "Coast Rush",
    rule: "Three laps. Seven rivals. Race your avatar.",
    controls: "WASD drive · Space drift · E item",
    genre: "RACING",
    description: "Eight karts. One coastal finish.",
  },
  hoops: {
    name: "Hoops Court",
    tagline: "Hoops Court",
    rule: "Ten shots. Stop the marker in the green before the shot clock runs out.",
    controls: "Space · tap",
    genre: "HOOPS",
    description: "Ten shots against the clock.",
  },
  fishing: {
    name: "Fishing Jetty",
    tagline: "Fishing Jetty",
    rule: "One minute. Hook the bite, then reel without snapping the line.",
    controls: "Space · tap, then hold to reel",
    genre: "FISHING",
    description: "Sixty seconds on the jetty.",
  },
} as const;
export type GameId = keyof typeof games;
/** Every round the server replays, so every one can be a dare. */
export const playIds = Object.keys(games) as GameId[];
/** East Side rounds are played at their facility, not at a cabinet. */
export const outdoorIds = ["hoops", "fishing"] as const;
export type OutdoorId = (typeof outdoorIds)[number];
export type CabinetId = Exclude<GameId, OutdoorId>;
/** The arcade cabinets. Only these have daily boards and medals. */
export const gameIds = playIds.filter(
  (id) => !(outdoorIds as readonly string[]).includes(id),
) as CabinetId[];
export const activities = {
  jog: {
    name: "Jog around the park",
    icon: "🏃",
    description: "A gentle loop around the Pocket Garden.",
  },
  dragon: {
    name: "Play on the dragon",
    icon: "🐉",
    description: "Climb the steps, slide down, do it again.",
  },
  dance: {
    name: "Dance in the plaza",
    icon: "🪩",
    description: "Keep the neighbourhood dance floor going.",
  },
  rest: {
    name: "Take a bench break",
    icon: "🌿",
    description: "Put your feet up under the trees.",
  },
  arcade: {
    name: "Play at Arcade Row",
    icon: "🕹",
    description: "Have a go at your favourite cabinet.",
  },
  fish: {
    name: "Fish off the jetty",
    icon: "🎣",
    description: "Watch the float and wait for a bite.",
  },
  hoops: {
    name: "Shoot some hoops",
    icon: "🏀",
    description: "A few free throws at the East Side court.",
  },
} as const;
export type ActivityId = keyof typeof activities;
/** Stable wire positions: append new activities so existing indices never change. */
export const activityIds: readonly ActivityId[] = [
  "jog",
  "dragon",
  "dance",
  "rest",
  "arcade",
  "fish",
  "hoops",
];

/** Says why a round stopped, so an early finish is never a mystery. */
export function endReasonText(game: GameId, reason: string, seconds: number) {
  const after = `after ${Math.max(1, Math.round(seconds))}s`;
  if (game === "noodle") {
    if (reason === "wall")
      return `Your noodle hit the wall ${after}. Turn before the edge.`;
    if (reason === "tail")
      return `Your noodle bit its own tail ${after}. Leave yourself room to turn.`;
    if (reason === "full") return "You filled the whole board!";
  }
  if (game === "hop") {
    if (reason === "crate")
      return `You ran into a crate ${after}. Jump a little earlier.`;
    if (reason === "gap")
      return `You fell into a gap ${after}. Jump before the edge.`;
  }
  if (reason === "lives") return `Out of lives ${after}.`;
  if (reason === "cleared") return "Wall and Big Brick cleared!";
  if (reason === "time") return "Time! You lasted the full 60 seconds.";
  return "";
}
export function formatScore(game: GameId, score: number) {
  return game === "coast" ? raceScoreTime(score) : String(score);
}
