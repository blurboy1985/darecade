// Invite links. The game shares a link through the device; it never asks for
// a friend's contact details. The server decides who is paid and when.
import { api } from "./social";
import "./activities.css";

type InviteSummary = {
  code: string;
  joined: number;
  played: number;
  xp: number;
  friendXp: number;
  cap: number;
};
const KEY = "darecade-invite";

/** Remembers ?invite=CODE across the age and privacy steps, and tidies the address bar. */
export function captureInvite() {
  try {
    const url = new URL(location.href);
    const code = url.searchParams.get("invite");
    if (!code) return;
    if (/^[A-Za-z0-9]{4,16}$/.test(code)) localStorage.setItem(KEY, code);
    url.searchParams.delete("invite");
    history.replaceState(null, "", url);
  } catch {
    /* Private browsing: the link simply does nothing. */
  }
}
/** Claims a remembered invite for a player who has not played yet. */
export async function acceptPendingInvite(rounds: number) {
  let code: string | null = null;
  try {
    code = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
  } catch {}
  if (!code || rounds > 0) return null;
  try {
    return await api<{ name: string; xp: number }>("invite/accept", { code });
  } catch {
    // An old or mistyped link is not the new player's problem.
    return null;
  }
}

export async function mountInvite(
  host: HTMLElement,
  toast: (message: string) => void,
) {
  const root = document.createElement("div");
  root.className = "activity activity-invite";
  root.innerHTML =
    '<h2>Invite a friend</h2><p role="status">Getting your link…</p>';
  host.replaceChildren(root);
  let summary: InviteSummary;
  try {
    summary = await api<InviteSummary>("invite", {});
  } catch (error) {
    if (root.isConnected)
      root.querySelector("p")!.textContent = (error as Error).message;
    return;
  }
  if (!root.isConnected) return;
  const link = `${location.origin}/?invite=${summary.code}`;
  const waiting = summary.joined - summary.played;
  const paid = Math.min(summary.cap, summary.played);
  root.innerHTML = `<h2>Invite a friend</h2><p class="lead">Send your link. When a friend finishes their first round, you both get +${summary.friendXp} XP.</p><label class="field-label" for="invite-link">Your link</label><input id="invite-link" class="invite-link" readonly><div class="button-row"><button class="primary" id="invite-share">Share link</button><button class="secondary" id="invite-copy">Copy link</button></div><div class="invite-progress" role="status"><strong></strong><span></span></div><p class="fine-print">Rewards are for your first ${summary.cap} friends who play. Darecade never asks for your friends’ contact details.</p>`;
  const input = root.querySelector<HTMLInputElement>("#invite-link")!;
  input.value = link;
  root.querySelector(".invite-progress strong")!.textContent =
    `${paid} of ${summary.cap} friends have played · +${summary.xp} XP`;
  root.querySelector(".invite-progress span")!.textContent = waiting
    ? `${waiting} more joined and ${waiting === 1 ? "has" : "have"} not played yet.`
    : summary.played > summary.cap
      ? "More friends have joined since. Thank you!"
      : "";
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast("Invite link copied.");
    } catch {
      input.select();
      toast("Select the link and copy it.");
    }
  };
  const share = root.querySelector<HTMLButtonElement>("#invite-share")!;
  // Desktop browsers without a share sheet just copy.
  if (typeof navigator.share !== "function") share.hidden = true;
  share.addEventListener("click", async () => {
    try {
      await navigator.share({
        title: "Darecade",
        text: "Come and play Darecade with me.",
        url: link,
      });
    } catch {
      /* Closing the share sheet is not an error. */
    }
  });
  root
    .querySelector("#invite-copy")!
    .addEventListener("click", () => void copy());
  input.addEventListener("focus", () => input.select());
}
