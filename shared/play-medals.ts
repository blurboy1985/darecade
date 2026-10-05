/** Personal play recognition, separate from ranked medals and Style tokens. */
export const PLAY_MEDAL_DAILY_LIMIT = 3;
export const PLAY_MEDAL_MIN_SECONDS = 15;
export const PLAY_MEDAL_BRICK_MOVEMENT_SECONDS = 3;
export const PLAY_MEDAL_SWARM_MOVEMENT_SECONDS = 10;
export const PLAY_MEDAL_HOOPS_ATTEMPTS = 3;

export type PlayMedalProgress = {
  day: string;
  total: number;
  today: number;
  games: string[];
  limit: number;
};

/** Every value here comes from the server's completed replay. */
export type PlayMedalEvidence =
  | { game: "coast"; finished: boolean }
  | { game: "fishing"; completed: boolean; catches: number }
  | { game: "hoops"; completed: boolean; attempts: number; made: number }
  | { game: "noodle" | "hop"; seconds: number; score: number }
  | {
      game: "brick" | "swarm";
      seconds: number;
      score: number;
      /** Distinct replay seconds in which the controlled object actually moved. */
      movementSeconds: number;
    };

export function qualifiesForPlayMedal(evidence: PlayMedalEvidence) {
  switch (evidence.game) {
    case "coast":
      return evidence.finished;
    case "fishing":
      return evidence.completed && evidence.catches > 0;
    case "hoops":
      return (
        evidence.completed &&
        evidence.attempts >= PLAY_MEDAL_HOOPS_ATTEMPTS &&
        evidence.made > 0
      );
    case "noodle":
    case "hop":
      return evidence.seconds >= PLAY_MEDAL_MIN_SECONDS && evidence.score > 0;
    case "brick":
    case "swarm":
      return (
        evidence.seconds >= PLAY_MEDAL_MIN_SECONDS &&
        evidence.score > 0 &&
        evidence.movementSeconds >=
          (evidence.game === "brick"
            ? PLAY_MEDAL_BRICK_MOVEMENT_SECONDS
            : PLAY_MEDAL_SWARM_MOVEMENT_SECONDS)
      );
    default: {
      const exhaustive: never = evidence;
      return exhaustive;
    }
  }
}
