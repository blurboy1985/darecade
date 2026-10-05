import type { PlayMedalProgress } from "../shared/play-medals";

/** A delayed poll must not undo a newer finish or roll the goal back a day. */
export function latestPlayMedals(
  current?: PlayMedalProgress,
  incoming?: PlayMedalProgress,
) {
  if (!incoming) return current;
  if (!current) return incoming;
  return incoming.day >= current.day && incoming.total >= current.total
    ? incoming
    : current;
}

export function playMedalGoal(p?: PlayMedalProgress) {
  if (!p)
    return '<p class="note">Connect to see your daily Play medal goal.</p>';
  return `<section class="play-medal-goal" aria-label="Daily Play medal goal"><span class="eyebrow">YOUR DAILY GOAL · SINGAPORE TIME</span><h3>${p.today === p.limit ? "Today’s goal complete!" : "Play. Finish. Collect."}</h3><p><strong>${p.today} / ${p.limit}</strong> Play medal points today · <strong>${p.total}</strong> all time</p><progress aria-label="Daily Play medal points" value="${p.today}" max="${p.limit}"></progress><p>Earn 1 point in each of 3 different games. Guests and accounts earn the same.</p><details class="scoring-guide"><summary>Which finishes count?</summary><p>Noodle Run and Hop Hop: score and last 15 seconds. Brick Bash: score, last 15 seconds and move your paddle across 3 seconds. Star Swarm: score, last 15 seconds and steer across 10 seconds.</p><p>Coast Rush: finish all 3 laps. Fishing: finish with a catch. Hoops: finish 10 shots, take at least 3 and make at least 1.</p><p>Once per game per Singapore day, up to 3 points. Play medals are personal milestones: no ranked position or Style tokens. Open Stage keeps its existing XP rewards.</p></details></section>`;
}

export function playMedalResult(
  p: PlayMedalProgress | undefined,
  earned: number,
  game: string,
) {
  if (!p) return "";
  const headline = earned
    ? "+1 Play medal point"
    : p.today === p.limit
      ? "Today’s Play medal goal is complete"
      : p.games.includes(game)
        ? "Already collected for this game today"
        : "Keep going for your next Play medal";
  return `<p class="play-medal-result" role="status"><strong>${headline}</strong><span>${p.today}/${p.limit} today · ${p.total} all time · no token conversion</span></p><details class="scoring-guide"><summary>Your Play medal goal</summary>${playMedalGoal(p)}</details>`;
}

export const guestSaveCopy =
  "Your guest profile keeps XP, tokens, outfits, bests and Play medals on the server while this browser session gives you access. Browser storage keeps your local preferences. Clearing cookies, signing out or the 30-day session expiring can leave you unable to reopen it.";
export const emailSaveCopy =
  "Link an unused email to keep this same character and its rewards, recover access and play on another device. New arcade rounds then enter ranked boards; challenges open after 24 hours. Earlier guest rounds stay personal bests. An email that already has a character offers a switch, not a merge.";
