import { raceScoreTime } from "../shared/racing.ts";
import type { SharedState } from "./social";

const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** Compare this run with today's server board, never with the seven AI karts. */
export function raceComparison(
  score: number,
  state:
    | (Pick<SharedState, "day" | "me"> & {
        boards: Pick<SharedState["boards"], "coast">;
      })
    | null,
  ranked: boolean,
) {
  if (!state)
    return '<section class="race-comparison"><h3>Today’s leaderboard</h3><p>Today’s times are unavailable. Your race result is shown above.</p></section>';
  const board = state.boards.coast;
  const leader = board[0];
  const own = board.find((row) => row.id === state.me);
  const opponents = board.filter((row) => row.id !== state.me);
  const comparisonRank =
    1 + opponents.filter((row) => row.score > score).length;
  let comparison = "Finish all three laps to compare your time.";
  if (score > 0) {
    if (!leader) comparison = "No ranked times yet today. Set the first one!";
    else {
      const seconds = (Math.abs(leader.score - score) / 60).toFixed(2);
      comparison =
        score === leader.score
          ? "You matched today’s fastest time."
          : score > leader.score
            ? `${seconds}s faster than today’s leader.`
            : `${seconds}s behind today’s fastest time.`;
      comparison += ranked
        ? ` This race compares at #${comparisonRank} among these racers.`
        : ` Your guest time would place #${comparisonRank} among these racers.`;
    }
  }
  const row = (entry: (typeof board)[number]) =>
    `<li${entry.id === state.me ? ' class="is-you"' : ""}><span>#${entry.rank}</span><span>${escape(entry.name)}${entry.id === state.me ? " · You" : ""}</span><strong>${raceScoreTime(entry.score)}</strong></li>`;
  const top = board.slice(0, 3);
  return `<section class="race-comparison" aria-label="Today’s Coast Rush leaderboard"><h3>Today’s leaderboard <small>${escape(state.day)} · SGT</small></h3><p class="race-comparison-summary">${comparison}</p>${top.length ? `<ol class="race-result-board">${top.map(row).join("")}${own && !top.includes(own) ? row(own) : ""}</ol>` : '<p class="fine-print">The leaderboard starts with the first verified-email racer.</p>'}${board.length > 3 ? `<details><summary>All ${board.length} racers</summary><ol class="race-result-board">${board.map(row).join("")}</ol></details>` : ""}<p class="fine-print">${ranked ? "Each racer’s best time today counts." : "Guest comparison only. Verify your email, then race to join the board."} Resets at midnight SGT.</p></section>`;
}
