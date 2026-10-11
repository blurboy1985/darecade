import { levelReward } from "./progression-guide.ts";

export type RewardReceipt = {
  totalXp: number;
  xpBefore: number;
  xpAfter: number;
  components: {
    kind: "round" | "hoops" | "fish" | "welcome" | "invite";
    xp: number;
  }[];
};
const labels = {
  round: "Round score",
  hoops: "New hoops personal best",
  fish: "New fish species",
  welcome: "First-finish bonus",
  invite: "Invite bonus",
};

export function rewardReceipt(
  receipt: RewardReceipt | undefined,
  currentXp: number,
) {
  if (!receipt)
    return `<section class="reward-receipt"><p>Round saved. This earlier result has no stored bonus breakdown.</p><p>Saved progress: ${currentXp} XP</p>${levelReward(currentXp)}</section>`;
  const level = 1 + Math.floor(receipt.xpAfter / 100);
  const levelUp =
    level > 1 + Math.floor(receipt.xpBefore / 100)
      ? `<p class="level-up">Level up! You reached Level ${level}.</p>`
      : "";
  return `<section class="reward-receipt" aria-label="XP earned"><h3>+${receipt.totalXp} XP <small>total earned</small></h3><ul>${receipt.components.map(({ kind, xp }) => `<li><span>${labels[kind]}</span><strong>+${xp} XP</strong></li>`).join("")}</ul>${levelUp}<p>${receipt.xpBefore} → ${receipt.xpAfter} XP after this round${currentXp !== receipt.xpAfter ? ` · ${currentXp} XP now` : ""}</p>${levelReward(currentXp)}</section>`;
}
