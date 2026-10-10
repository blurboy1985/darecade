import { api } from "./social";
import { SEEN_KEY } from "./intro-script";
import type { Save } from "./state";
import type { SeasonProgress } from "./season";
import type { PlayMedalProgress } from "../shared/play-medals";
import "./account.css";
import { guestSaveCopy, emailSaveCopy, latestPlayMedals } from "./play-medals";
export type Profile = {
  playMedals?: PlayMedalProgress;
  xpTokens?: number;
  styleRewards?: number;
  notifications?: { medalEmail: boolean };
  id: string;
  name: string;
  account: null | { email: string; created: number; eligibleAt: number };
  ageBand: string;
  purchasesConfirmed?: boolean;
  privacyVersion: string;
  progress: Save;
  season?: SeasonProgress | null;
};
type Config = {
  now: number;
  privacyVersion: string;
  mailMode: string;
  origin: string;
  privacyContact: string;
  storageNotice: string;
};
export let currentProfile: Profile | null = null;
let config: Config;
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function shell(closable = true) {
  window.dispatchEvent(new Event("account-opening"));
  document.querySelector("#account-dialog")?.remove();
  const d = document.createElement("dialog");
  d.id = "account-dialog";
  d.className = "account-dialog";
  d.innerHTML = `${closable ? '<button class="close-button" id="account-close" aria-label="Close account panel">×</button>' : ""}<div id="account-content"></div>${closable ? '<button class="secondary" id="account-cancel">Cancel</button>' : ""}`;
  document.body.append(d);
  d.addEventListener("cancel", (e) => {
    if (!closable) e.preventDefault();
  });
  d.querySelector("#account-close")?.addEventListener("click", () => d.close());
  d.querySelector("#account-cancel")?.addEventListener("click", () =>
    d.close(),
  );
  d.showModal();
  return { d, host: d.querySelector<HTMLElement>("#account-content")! };
}
export function acceptProfile(p: Profile) {
  if (currentProfile?.id === p.id)
    p.playMedals = latestPlayMedals(currentProfile.playMedals, p.playMedals);
  currentProfile = p;
  window.dispatchEvent(new CustomEvent("account-profile", { detail: p }));
}
export const privacyCopy = `<h2>Your play. Your privacy.</h2><p>We save your avatar, progress, scores, chosen nickname and age band. If you create an account, we also keep your email so you can sign in on another device. We do not keep your birth month or year.</p><p>Other players see your nickname, outfit and medals. Only accepted friends can see your online status and activity or find your world. They cannot see your email or age band. Choose a nickname rather than your real name or contact details. Anyone in your world can read what you type in world chat, so do not put your real name or contact details in a message. Messages are not saved. There is no photo upload or advertising tracker.</p><p>We check recorded game inputs before saving scores. Inputs are deleted after 30 days; scores stay with your profile. Sign-in codes expire after 15 minutes. Inactive profiles are deleted after 12 months. Optional phone-test feedback is saved only when you send it and is included in your data download and deletion.</p><p>You can download your data or withdraw consent and delete your profile under Account & privacy. Deleting removes your avatar, scores, challenges and access. It cannot be undone.</p><p>This local test stores data on the arcade operator's computer. Email delivery, when enabled, uses a transactional email provider. Optional purchases and donations use Stripe hosted checkout when enabled. We store order references, amounts, payment status and purchased sets, never card details. Deleting your profile removes its link to order records; payment records may remain with Stripe and in our order ledger for payment support. Optional daily medal emails list your actual awards. They are off until you choose them, and you can turn them off in Account &amp; privacy. No marketing emails are sent.</p><p>If anything is unclear, stop here and ask a trusted adult or the arcade operator. You do not need to agree to continue reading this notice.</p>`;
const privacySummary = `<ul class="privacy-summary"><li>Other players see your nickname, outfit and medals. Your status, activity and world are private to accepted friends. Use a nickname, not your real name or contact details.</li><li>We save your progress. Your age band and optional email stay private.</li><li>Download your data or delete your profile in Account &amp; privacy.</li></ul><p class="fine-print">Not sure? Ask a trusted adult or the arcade operator.</p>`;
function privacyNotice() {
  return (
    privacyCopy.replace(
      "This local test stores data on the arcade operator's computer.",
      esc(config.storageNotice),
    ) +
    (config.privacyContact
      ? "<p><strong>Privacy questions:</strong> " +
        esc(config.privacyContact) +
        "</p>"
      : "")
  );
}
function clearLocalProfile() {
  currentProfile = null;
  window.dispatchEvent(new Event("account-cleared"));
  localStorage.removeItem("darecade-v1");
  localStorage.removeItem("darecade-preview-backup");
}
type EmailFlow = {
  back: () => void;
  /** Called with the signed-in profile once the emailed code is accepted. */
  done: (profile: Profile) => void;
  /** Second step of the first-race character setup. */
  guided?: boolean;
};
const status = (host: HTMLElement, text: string) =>
  (host.querySelector("#account-status")!.textContent = text);
function emailForm(host: HTMLElement, path: string, flow: EmailFlow) {
  const signIn = path === "auth/login-code";
  host.innerHTML = signIn
    ? `<span class="eyebrow">WELCOME BACK</span><h2>Sign in</h2><p>Enter your email. We'll send a 6-digit code. No password.</p><form id="email-form"><label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required></label><button class="primary">Send code →</button><p role="status" id="account-status"></p></form><button class="secondary" id="account-back">Back</button><details class="account-details"><summary>Played without email?</summary><p>Open Play Simi in the browser you used. Choose Account &amp; privacy → Save with email first.</p></details>`
    : `<span class="eyebrow">${flow.guided ? "STEP 2 OF 2 · OPTIONAL" : "OPTIONAL"}</span><h2>Save with email?</h2><p>Keep this character across devices. We'll send a 6-digit code. No password.</p><details class="account-details"><summary>What is already saved?</summary><p>${guestSaveCopy}</p><p>${emailSaveCopy}</p></details><form id="email-form"><label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required></label><button class="primary">Send code →</button><p role="status" id="account-status"></p></form><button class="secondary" id="account-back">${flow.guided ? "Skip for now" : "Back"}</button><p class="fine-print">You can keep playing without an email. If you're under 18, check with a parent or guardian before saving with email.</p><details class="account-details"><summary>Privacy notice</summary>${privacyNotice()}</details>`;
  host.querySelector("#account-back")!.addEventListener("click", flow.back);
  host.querySelector("form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const button = form.querySelector("button")!;
    const email = String(new FormData(form).get("email"));
    button.disabled = true;
    try {
      await api(path, { email });
      codeForm(host, path, email, flow);
    } catch (error) {
      status(host, (error as Error).message);
      button.disabled = false;
    }
  });
}
/**
 * The email already belongs to another character. Saving must never swap the
 * character being played, so the player chooses: keep this one and use a
 * different email, or sign in to the other and leave this one behind.
 */
function conflictChoice(
  host: HTMLElement,
  path: string,
  email: string,
  code: string,
  other: string,
  flow: EmailFlow,
) {
  const mine = currentProfile?.name || "this character";
  host.innerHTML = `<span class="eyebrow">EMAIL ALREADY IN USE</span><h2>Keep ${esc(mine)}?</h2><p><strong>${esc(email)}</strong> already has a saved character, <strong>${esc(other)}</strong>. One email keeps one character, so ${esc(mine)} was not changed and is not saved to it.</p><button class="primary" id="conflict-keep">Keep ${esc(mine)} · use another email</button><button class="secondary" id="conflict-switch">Switch to ${esc(other)}</button><p class="fine-print">Switching signs this browser in as ${esc(other)}. ${esc(mine)} stays an unsaved guest and can no longer be opened from here.</p><p role="status" id="account-status"></p>`;
  host
    .querySelector("#conflict-keep")!
    .addEventListener("click", () => emailForm(host, path, flow));
  const change = host.querySelector<HTMLButtonElement>("#conflict-switch")!;
  change.addEventListener("click", async () => {
    change.disabled = true;
    try {
      await api<Profile>("auth/verify", { email, code, switchAccount: true });
      // Everything on screen belongs to the guest; load the other character whole.
      clearLocalProfile();
      location.reload();
    } catch (error) {
      status(host, (error as Error).message);
      change.disabled = false;
    }
  });
}
/** The code is typed into this same dialog; no link, no second window. */
function codeForm(
  host: HTMLElement,
  path: string,
  email: string,
  flow: EmailFlow,
) {
  const sent =
    config.mailMode === "outbox"
      ? "Test mode: ask the operator for your code. No email was sent."
      : path === "auth/login-code"
        ? `If an account uses <strong>${esc(email)}</strong>, we emailed it a code. Check spam too.`
        : `We emailed a code to <strong>${esc(email)}</strong>. Check spam too.`;
  host.innerHTML = `<span class="eyebrow">CHECK YOUR EMAIL</span><h2>Enter your code</h2><p>${sent} Expires in 15 minutes.</p><form id="code-form"><label>6-digit code<input class="code-input" name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="000000" aria-describedby="account-status" required></label><button class="primary">${path === "auth/login-code" ? "Sign in" : "Save character"} →</button><p role="status" id="account-status"></p></form><button class="secondary" id="code-resend" disabled></button><button class="secondary" id="account-back">Back to email</button>`;
  const form = host.querySelector("form")!;
  const input = form.querySelector("input")!;
  const confirm = form.querySelector("button")!;
  const resend = host.querySelector<HTMLButtonElement>("#code-resend")!;
  host
    .querySelector("#account-back")!
    .addEventListener("click", () => emailForm(host, path, flow));
  // The server ignores a repeat request within a minute, so wait it out.
  const countdown = () => {
    let wait = 60;
    resend.disabled = true;
    const tick = () => {
      if (!resend.isConnected) return;
      if (wait <= 0) {
        resend.disabled = false;
        resend.textContent = "Send a new code";
        return;
      }
      resend.textContent = `Send a new code in ${wait--}s`;
      setTimeout(tick, 1000);
    };
    tick();
  };
  countdown();
  resend.addEventListener("click", async () => {
    resend.disabled = true;
    try {
      await api(path, { email });
      status(host, "New code sent. The earlier code no longer works.");
      countdown();
    } catch (error) {
      status(host, (error as Error).message);
      resend.disabled = false;
    }
  });
  input.addEventListener("input", () => {
    input.value = input.value.replace(/\D/g, "").slice(0, 6);
    if (input.value.length === 6 && !confirm.disabled) form.requestSubmit();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    confirm.disabled = true;
    try {
      const p = await api<Profile | { conflict: { name: string } }>(
        "auth/verify",
        { email, code: input.value },
      );
      if ("conflict" in p) {
        conflictChoice(host, path, email, input.value, p.conflict.name, flow);
        return;
      }
      acceptProfile(p);
      window.dispatchEvent(new Event("account-session"));
      flow.done(p);
    } catch (error) {
      status(host, (error as Error).message);
      input.value = "";
      confirm.disabled = false;
      input.focus();
    }
  });
  input.focus();
}
export async function ensureAccount(): Promise<Profile> {
  config = await api<Config>("auth/config");
  const existing = await api<Profile | null>("auth/session");
  if (existing) {
    acceptProfile(existing);
    return existing;
  }
  return new Promise((resolve) => {
    const { d, host } = shell(false);
    d.classList.add("welcome-consent");
    const welcome = () => {
      host.innerHTML = `<span class="eyebrow">BEFORE YOU PLAY</span><h2>Welcome to Play Simi</h2><p>A cosy neighbourhood for ages 13 and older.</p><form id="consent-form"><label for="welcome-name">Your nickname<input id="welcome-name" name="name" required minlength="2" maxlength="20" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="e.g. MoonOtter" aria-describedby="welcome-name-help"></label><p class="fine-print" id="welcome-name-help">Use a made-up name, 2–20 letters, numbers, underscores or hyphens. No real names or contact details.</p><label class="consent-choice"><input type="checkbox" name="over13" required> I'm 13 or older</label><label class="consent-choice"><input type="checkbox" name="consent" required> I understand how my information is used and agree to the privacy notice.</label><details class="account-details privacy-details"><summary>Privacy notice</summary>${privacySummary}${privacyNotice()}</details><button class="primary">Agree & play →</button><p role="status"></p></form><button class="secondary" id="existing-account">I have an account</button>`;
      host.querySelector("#existing-account")!.addEventListener("click", () =>
        emailForm(host, "auth/login-code", {
          back: welcome,
          done: (p) => {
            d.close();
            resolve(p);
          },
        }),
      );
      host.querySelector("form")!.addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget as HTMLFormElement;
        if (!form.reportValidity()) return;
        const button = form.querySelector("button")!;
        button.disabled = true;
        try {
          const p = await api<Profile>("auth/join", {
            name: String(new FormData(form).get("name") ?? "").trim(),
            over13: true,
            consent: true,
            privacyVersion: config.privacyVersion,
          });
          acceptProfile(p);
          d.close();
          resolve(p);
        } catch (error) {
          host.querySelector("[role=status]")!.textContent =
            error instanceof Error ? error.message : "Please try again.";
          button.disabled = false;
        }
      });
    };
    welcome();
  });
}

/**
 * create opens the email step directly for a guest. guided marks it as the
 * second step of the first-race setup. onSaved runs once the guest's
 * character has been saved to an email. onSkipped runs when the player skips
 * the guided email step.
 */
export async function openAccount(
  options: {
    create?: boolean;
    privacy?: boolean;
    logout?: boolean;
    guided?: boolean;
    onSaved?: (profile: Profile) => void;
    onSkipped?: () => void;
  } = {},
) {
  const { d, host } = shell();
  try {
    let p = await api<Profile>("auth/me");
    acceptProfile(p);
    if (options.logout) {
      await api("auth/logout", {});
      clearLocalProfile();
      location.reload();
      return;
    }
    const create = (back: () => void) =>
      emailForm(host, "auth/code", {
        back,
        guided: options.guided,
        done: (saved) => {
          p = saved;
          if (options.onSaved) {
            d.close();
            options.onSaved(saved);
          } else render();
        },
      });
    const render = () => {
      host.innerHTML = `<span class="eyebrow">ACCOUNT & PRIVACY</span><h2>Your account</h2><p>${p.account ? `Signed in as <strong>${esc(p.account.email)}</strong>. Your avatar and progress follow this account.` : "Playing without email. Progress and purchases stay with this browser on this device. Email backup is optional."}</p>${!p.account ? `<details class="account-details"><summary>Your guest progress</summary><p>${guestSaveCopy}</p><p>${emailSaveCopy}</p></details>` : ""}<p>Rankings and challenges are open without email. Three outgoing challenges per day. No points lost when another player wins.</p>${p.season ? `<p>${esc(p.season.name)} · ${p.season.xp} Season XP · ${p.progress.xp} Lifetime XP</p>` : ""}${!p.account ? '<button class="primary" id="save-account">Save with email →</button>' : ""}${p.account ? `<label class="consent-choice"><input id="medal-email" type="checkbox" ${p.notifications?.medalEmail ? "checked" : ""}> Email my daily medal awards</label><p class="fine-print">One email on days you win medals. Turn off here anytime.</p>` : ""}<div class="account-actions"><button class="secondary" id="read-privacy">Privacy &amp; data</button>${p.account ? '<button class="secondary" id="logout">Sign out</button>' : '<button class="danger" id="reset-guest">Reset guest &amp; start afresh</button>'}</div><p role="status" id="account-status"></p>`;
      host
        .querySelector<HTMLInputElement>("#medal-email")
        ?.addEventListener("change", async (event) => {
          const input = event.currentTarget as HTMLInputElement;
          input.disabled = true;
          try {
            p = await api<Profile>("profile", { medalEmail: input.checked });
            acceptProfile(p);
            status(host, "Email preference saved.");
          } catch (error) {
            input.checked = !input.checked;
            status(host, (error as Error).message);
          } finally {
            input.disabled = false;
          }
        });
      host
        .querySelector("#save-account")
        ?.addEventListener("click", () => create(render));
      host
        .querySelector("#read-privacy")!
        .addEventListener("click", renderPrivacy);
      host
        .querySelector("#reset-guest")
        ?.addEventListener("click", () => renderDelete(true));
      host.querySelector("#logout")?.addEventListener("click", async () => {
        await api("auth/logout", {});
        clearLocalProfile();
        location.reload();
      });
    };
    const renderPrivacy = () => {
      host.innerHTML = `<span class="eyebrow">ACCOUNT & PRIVACY</span><h2>Privacy &amp; data</h2>${privacySummary}<details class="account-details privacy-details"><summary>Full privacy notice · storage &amp; retention</summary>${privacyNotice()}</details><div class="account-actions"><button class="secondary" id="export-data">Download my data</button><button class="danger" id="delete-data">Withdraw consent &amp; delete</button></div><button class="secondary" id="privacy-back">Back to account</button><p role="status"></p>`;
      host.querySelector("#privacy-back")!.addEventListener("click", render);
      host
        .querySelector("#export-data")!
        .addEventListener("click", async () => {
          try {
            const data = await api("privacy/export");
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(data, null, 2)], {
                type: "application/json",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "my-play-simi-data.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (e) {
            host.querySelector("[role=status]")!.textContent = (
              e as Error
            ).message;
          }
        });
      host
        .querySelector("#delete-data")!
        .addEventListener("click", () => renderDelete(false));
    };
    const renderDelete = (reset: boolean) => {
      if (reset && p.account) return;
      host.innerHTML = reset
        ? '<h2>Start afresh?</h2><p>This permanently deletes this guest profile, including your name, avatar, progress, scores, tokens, challenges and access to purchased items. Purchases are not refunded or transferred. You cannot undo this.</p><p>You will return to the welcome screen to choose a new name and agree again.</p><form><label>Type RESET to confirm<input name="confirm" required pattern="RESET" autocomplete="off"></label><button class="danger">Reset my guest account</button><p role="status"></p></form><button class="secondary" id="keep-account">Cancel · keep playing</button>'
        : '<h2>Leave no avatar behind.</h2><p>This permanently removes your account, avatar, progress, scores and challenges. You will be signed out on every device.</p><form><label>Type DELETE to confirm<input name="confirm" required pattern="DELETE" autocomplete="off"></label><button class="danger">Delete my profile</button><p role="status"></p></form><button class="secondary" id="keep-account">Cancel · keep my account</button>';
      host
        .querySelector("#keep-account")!
        .addEventListener("click", reset ? render : renderPrivacy);
      host.querySelector("form")!.addEventListener("submit", async (e) => {
        e.preventDefault();
        const form = e.currentTarget as HTMLFormElement;
        if (!form.reportValidity()) return;
        const button = form.querySelector("button")!;
        button.disabled = true;
        try {
          await api("privacy/delete", {
            guestOnly: reset,
            confirm: reset ? "DELETE" : new FormData(form).get("confirm"),
          });
          if (reset) localStorage.removeItem(SEEN_KEY);
          clearLocalProfile();
          location.reload();
        } catch (err) {
          host.querySelector("[role=status]")!.textContent = (
            err as Error
          ).message;
          button.disabled = false;
        }
      });
    };
    if (options.privacy) renderPrivacy();
    else if (options.create && !p.account)
      create(
        options.guided
          ? () => {
              d.close();
              options.onSkipped?.();
            }
          : render,
      );
    else render();
  } catch (error) {
    host.textContent = (error as Error).message;
  }
}
export function reportPlayer(target: string) {
  const { host } = shell();
  host.innerHTML =
    '<h2>Help keep the neighbourhood safe.</h2><p>The report goes privately to the arcade operator. Reporting does not block or mute them. You can choose those actions separately.</p><form><label>What concerns you?<select name="reason"><option value="under-age">They may be under 13</option><option value="suspected-cheating">Their score may be unfair</option><option value="unsafe-behaviour">Unsafe behaviour</option><option value="inappropriate-name">Inappropriate nickname or contact details</option></select></label><button class="primary">Send report</button><p role="status"></p></form>';
  host.querySelector("form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("report", {
        target,
        reason: new FormData(e.currentTarget as HTMLFormElement).get("reason"),
      });
      host.innerHTML =
        "<h2>Report received.</h2><p>The arcade operator can review your report. Block and Mute are separate actions.</p>";
      window.dispatchEvent(new Event("account-refresh"));
    } catch (error) {
      host.querySelector("[role=status]")!.textContent = (
        error as Error
      ).message;
    }
  });
}

export function moderatePlayer(
  target: string,
  action: "block" | "mute" | "unmute",
) {
  const { d, host } = shell();
  host.innerHTML = `<h2>${action === "block" ? "Block this player?" : action === "mute" ? "Mute their emotes?" : "Show their emotes again?"}</h2><p>${action === "block" ? "Their character, name tag and emotes will disappear. Visits, team invites and friend requests between you will be stopped." : "Mute only hides emotes. It does not send a report or hide their character."}</p><button class="primary" id="confirm-moderation">${action === "block" ? "Block player" : action === "mute" ? "Mute emotes" : "Unmute emotes"}</button><p role="status"></p>`;
  host
    .querySelector("#confirm-moderation")!
    .addEventListener("click", async () => {
      try {
        await api("moderate", { target, action });
        window.dispatchEvent(
          new CustomEvent("player-moderated", { detail: { target, action } }),
        );
        window.dispatchEvent(new Event("account-refresh"));
        d.close();
      } catch (error) {
        host.querySelector("[role=status]")!.textContent = (
          error as Error
        ).message;
      }
    });
}
