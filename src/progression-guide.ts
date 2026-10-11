import { raceTime } from "../shared/racing.ts";
import { singaporeDay, STAGE_DAILY_XP, type Save } from "./state.ts";

export function levelReward(xp: number) {
  const level = 1 + Math.floor(xp / 100);
  return `<div class="level-reward"><strong>Level ${level} → ${level + 1}</strong><b>${xp % 100} / 100 XP</b><span>${100 - (xp % 100)} XP to your next Style token</span><progress aria-label="Progress to next level" value="${xp % 100}" max="100"></progress><small>Every 100 XP: +1 level and +1 Style token for looks.</small></div>`;
}

export function coastProgress(save: Pick<Save, "xp" | "coastRecord">) {
  const record = save.coastRecord;
  return `<section class="game-progress" aria-label="Coast Rush goals"><strong>${record.timeTicks ? `Next goal: beat ${raceTime(record.timeTicks)}` : "First goal: finish all 3 laps"}</strong><p>${record.timeTicks ? `Personal records · fastest ${raceTime(record.timeTicks)} · best place ${record.place || "—"}` : "No finished race yet. Find your line through Palm Bay."}</p><p>Guests earn +20 XP per saved round and a Play medal for a full finish. After your first finish, standard races enter the leaderboard. No email needed.</p>${levelReward(save.xp)}</section>`;
}

export function stageProgress(
  save: Pick<Save, "xp" | "stageBest" | "stageDay" | "stageXp">,
  today = singaporeDay(),
) {
  const left = STAGE_DAILY_XP - (save.stageDay === today ? save.stageXp : 0);
  return `<section class="game-progress" aria-label="Open Stage progress"><strong>Best show: ${save.stageBest} points</strong><p>Show rewards: +5 XP a star · ${left}/${STAGE_DAILY_XP} XP left today.</p>${levelReward(save.xp)}</section>`;
}
