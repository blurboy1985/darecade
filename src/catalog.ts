import { raceScoreTime } from "../shared/racing.ts";
export const games = {
  noodle: {
    name: "Noodle Run",
    tagline: "Follow your appetite.",
    rule: "Eat dumplings. Grow your noodle. Watch the walls and your own tail.",
    controls: "Arrows / WASD · swipe to turn",
    genre: "A LITTLE TWIST ON SNAKE",
    description: "Big appetite. Bigger high score.",
  },
  brick: {
    name: "Brick Bash",
    tagline: "Make a little noise.",
    rule: "Bounce the ball. Break every brick. You have three chances.",
    controls: "← → / A D · drag to move",
    genre: "FIND YOUR RHYTHM",
    description: "Clear the wall. Catch the rebound.",
  },
  hop: {
    name: "Hop Hop",
    tagline: "Catch a little air.",
    rule: "Hop over crates and gaps. Tap or press Space to jump. Keep going for 60 seconds!",
    controls: "Space / ↑ · tap anywhere to jump",
    genre: "ONE BUTTON. BIG LITTLE LEAPS.",
    description: "Rooftop runs. Perfect little landings.",
  },
  swarm: {
    name: "Star Swarm",
    tagline: "Light up the night.",
    rule: "Move to dodge. Your ship fires automatically. Collect green shields and face the boss at 35 seconds.",
    controls: "Arrows / WASD · drag to fly · auto-fire",
    genre: "YOUR OWN POCKET GALAXY",
    description: "Dodge the swarm. Take on the boss.",
  },
  coast: {
    name: "Coast Rush",
    tagline: "Your look. Your kart. Your fastest lap.",
    rule: "Race two laps of Palm Bay. Steer into corners, hold Drift to charge, then release for a boost. Finish within two minutes. Fastest time wins.",
    controls: "← → / A D steer · S / ↓ brake · Space drift · auto-accelerate",
    genre: "PALM BAY TIME TRIAL",
    description: "Your avatar at the wheel. Chase a faster finish.",
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
