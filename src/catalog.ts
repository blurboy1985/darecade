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
    rule: "Smash every brick. 3 lives.",
    controls: "← → · A D · drag",
    genre: "BREAKER",
    description: "Smash the wall.",
  },
  hop: {
    name: "Hop Hop",
    tagline: "Hop Hop",
    rule: "Jump crates and gaps.",
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
    rule: "Two laps. Drift. Boost. Beat your time.",
    controls: "← → steer · ↓ brake · Space drift",
    genre: "RACING",
    description: "Your avatar. Your fastest time.",
  },
} as const;
export type GameId = keyof typeof games;
export const gameIds = Object.keys(games) as GameId[];
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
} as const;
export type ActivityId = keyof typeof activities;

export function formatScore(game: GameId, score: number) {
  return game === "coast" ? raceScoreTime(score) : String(score);
}
