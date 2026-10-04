import { formatScore, games, playIds } from "./catalog.ts";
import type { SharedPlayer, SharedState } from "./social";

/** Dares a player may start each Singapore day, once a first round is finished. */
export const DAILY_DARES = 1;
type DareState = Pick<
  SharedState,
  | "competitionReady"
  | "self"
  | "me"
  | "day"
  | "players"
  | "dares"
  | "challenged"
  | "history"
>;
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

/** Whether today's dare can start, and the sentence that says so or says why not. */
export function dareGate(state: DareState | null, connected: boolean) {
  if (!state || !connected)
    return { open: false, note: "Offline · dares need a connection." };
  if (!state.competitionReady)
    return { open: false, note: "Finish one round to open your daily dare." };
  if ((state.self?.outgoing || 0) >= DAILY_DARES)
    return {
      open: false,
      note: "Today’s dare is played. Your next one opens at midnight SGT.",
    };
  return {
    open: true,
    note: "One dare today. Starting it uses it. Resets midnight SGT.",
  };
}
/** Why this neighbour cannot be dared, or "" when Play dare would work. */
export function neighbourBlock(state: DareState, p: SharedPlayer) {
  if (p.id === state.me) return "This is you.";
  if (p.status === "online")
    return "Online now. Dares are for resting neighbours.";
  if (!playIds.some((game) => p.best[game] > 0))
    return "No saved score to dare yet.";
  if (state.challenged.includes(p.id)) return "Already dared today.";
  return "";
}
/** Neighbours and posted dares that a Play dare button would really start. */
export function dareTargets(state: DareState) {
  return {
    neighbours: state.players.filter((p) => !neighbourBlock(state, p)),
    posted: state.dares.filter(
      (d) => d.host !== state.me && !state.challenged.includes(d.host),
    ),
  };
}
/** A way into today's dare, only when one can be played right now. */
export function dareInvite(state: DareState | null, connected: boolean) {
  if (!state || !dareGate(state, connected).open) return "";
  const { neighbours, posted } = dareTargets(state);
  return neighbours.length || posted.length
    ? '<button class="secondary" data-open="dares">Play today’s dare</button>'
    : "";
}
/** The latest finished dare the player started, and the latest one against them. */
export function dareResults(state: DareState) {
  const when = (day: string) =>
    !day
      ? ""
      : day === state.day
        ? " · today"
        : ` · ${new Date(`${day}T00:00:00Z`).toLocaleDateString("en-SG", { day: "numeric", month: "short", timeZone: "UTC" })}`;
  const finished = state.history.filter((r) => r.status === "finished");
  return [
    finished.find((r) => r.player === state.me),
    finished.find((r) => r.target === state.me),
  ]
    .map((r) => {
      if (!r) return "";
      const score = r.score || 0,
        mine = r.player === state.me,
        won = score > r.targetScore,
        tied = score === r.targetScore;
      const headline = mine
        ? `You ${won ? "beat" : tied ? "drew with" : "did not beat"} ${escape(r.defender)}`
        : `${escape(r.challenger)} dared you and ${won ? "won" : tied ? "drew" : "you held"}`;
      return `<div><strong>${headline}</strong><span>${games[r.game].name} · ${formatScore(r.game, score)} vs ${formatScore(r.game, r.targetScore)}${when(r.day)}</span></div>`;
    })
    .join("");
}
/** Results first, then today's state. `link` adds the way in where there is room. */
export function dareCard(
  state: DareState | null,
  connected: boolean,
  link: boolean,
) {
  const results = state ? dareResults(state) : "";
  return `<section class="dare-today" aria-label="Your dares">${results ? `<div class="challenge-history">${results}</div>` : ""}<p class="fine-print">${dareGate(state, connected).note}</p>${link ? dareInvite(state, connected) : ""}</section>`;
}
