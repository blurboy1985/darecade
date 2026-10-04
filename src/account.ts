import { api } from "./social";
import type { Save } from "./state";
import "./account.css";
export type Profile = {
  id: string;
  name: string;
  account: null | { email: string; created: number; eligibleAt: number };
  ageBand: string;
  privacyVersion: string;
  progress: Save;
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
  document.querySelector("#account-dialog")?.remove();
  const d = document.createElement("dialog");
  d.id = "account-dialog";
  d.className = "account-dialog";
  d.innerHTML = `${closable ? '<button class="close-button" id="account-close" aria-label="Close account panel">×</button>' : ""}<div id="account-content"></div>`;
  document.body.append(d);
  d.addEventListener("cancel", (e) => {
    if (!closable) e.preventDefault();
  });
  d.querySelector("#account-close")?.addEventListener("click", () => d.close());
  d.showModal();
  return { d, host: d.querySelector<HTMLElement>("#account-content")! };
}
export function acceptProfile(p: Profile) {
  currentProfile = p;
  window.dispatchEvent(new CustomEvent("account-profile", { detail: p }));
}
export const privacyCopy = `<h2>Your play. Your privacy.</h2><p>We save your avatar, progress, scores, chosen nickname and age band. If you create an account, we also keep your email so you can sign in on another device. We do not keep your birth month or year.</p><p>Other players can see your nickname, avatar, activity, scores and dares. They cannot see your email or age band. Choose a nickname rather than your real name or contact details. There is no chat, photo upload or advertising tracker.</p><p>We check recorded game inputs before saving scores. Inputs are deleted after 30 days; scores stay with your profile. Sign-in codes expire after 15 minutes. Inactive profiles are deleted after 12 months. Optional phone-test feedback is saved only when you send it and is included in your data download and deletion.</p><p>You can download your data or withdraw consent and delete your profile under Account & privacy. Deleting removes your avatar, scores, dares and access. It cannot be undone.</p><p>This local test stores data on the arcade operator's computer. Email delivery, when enabled, uses a transactional email provider. No purchases or marketing emails are enabled.</p><p>If anything is unclear, stop here and ask a trusted adult or the arcade operator. You do not need to agree to continue reading this notice.</p>`;
const privacySummary = `<ul class="privacy-summary"><li>Other players see your nickname, avatar, activity, scores and dares. Use a nickname, not your real name or contact details.</li><li>We save your progress. Your age band and optional email stay private.</li><li>Download your data or delete your profile in Account &amp; privacy.</li></ul><p class="fine-print">Not sure? Ask a trusted adult or the arcade operator.</p>`;
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
    ? `<span class="eyebrow">WELCOME BACK</span><h2>Sign in</h2><p>Enter your email. We'll send a 6-digit code. No password.</p><form id="email-form"><label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required></label><button class="primary">Send code →</button><p role="status" id="account-status"></p></form><button class="secondary" id="account-back">Back</button><details class="account-details"><summary>Played without email?</summary><p>Open Darecade in the browser you used. Choose Account &amp; privacy → Save with email first.</p></details>`
    : `<span class="eyebrow">${flow.guided ? "STEP 2 OF 2 · OPTIONAL" : "OPTIONAL"}</span><h2>Save with email?</h2><p>Keep your character and scores on any device. We'll send a 6-digit code. No password.</p><form id="email-form"><label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required></label><button class="primary">Send code →</button><p role="status" id="account-status"></p></form><button class="secondary" id="account-back">${flow.guided ? "Skip for now" : "Back"}</button><p class="fine-print">You can keep playing without an email.</p>`;
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
      const p = await api<Profile>("auth/verify", { email, code: input.value });
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
  try {
    const p = await api<Profile>("auth/me");
    acceptProfile(p);
    return p;
  } catch {}
  return new Promise((resolve) => {
    const { d, host } = shell(false);
    const welcome = () => {
      host.innerHTML = `<span class="eyebrow">BEFORE YOU PLAY</span><h2>When were you born?</h2><p>We check your birth month and year, then discard them.</p><form id="age-form"><div class="age-fields"><label>Birth month<select name="month" required><option value="">Choose month</option>${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => `<option value="${i + 1}">${m}</option>`).join("")}</select></label><label>Birth year<input name="year" inputmode="numeric" type="number" min="1900" max="${new Date(config.now).getUTCFullYear()}" placeholder="Year" required></label></div><button class="primary">Continue →</button><p role="status"></p></form><button class="secondary" id="existing-account">I have an account</button>`;
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
        const form = e.currentTarget as HTMLFormElement,
          values = new FormData(form);
        let month = Number(values.get("month")),
          year = Number(values.get("year"));
        const button = form.querySelector("button")!;
        button.disabled = true;
        try {
          await api("auth/check", { month, year });
          host.innerHTML = `<span class="eyebrow">BEFORE YOU JOIN</span><h2>Your play. Your privacy.</h2>${privacySummary}<details class="account-details privacy-details"><summary>Full privacy notice · storage &amp; retention</summary>${privacyNotice()}</details><form id="consent-form"><label class="consent-choice"><input type="checkbox" name="consent" required> I understand how my information is used and agree.</label><button class="primary">Agree & play →</button><p role="status"></p></form><button class="secondary" id="decline">I don’t agree</button>`;
          host.querySelector("#decline")!.addEventListener("click", () => {
            month = 0;
            year = 0;
            host.innerHTML =
              "<h2>That is your choice.</h2><p>No profile was created. You can close this page.</p>";
          });
          host.querySelector("form")!.addEventListener("submit", async (ev) => {
            ev.preventDefault();
            const b = host.querySelector<HTMLButtonElement>("button")!;
            b.disabled = true;
            try {
              const p = await api<Profile>("auth/join", {
                month,
                year,
                consent: true,
                privacyVersion: config.privacyVersion,
              });
              month = 0;
              year = 0;
              acceptProfile(p);
              d.close();
              resolve(p);
            } catch (err) {
              host.querySelector("[role=status]")!.textContent = (
                err as Error
              ).message;
              b.disabled = false;
            }
          });
        } catch (error) {
          month = 0;
          year = 0;
          form.reset();
          host.querySelector("[role=status]")!.textContent = (
            error as Error
          ).message;
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
    guided?: boolean;
    onSaved?: (profile: Profile) => void;
    onSkipped?: () => void;
  } = {},
) {
  const { d, host } = shell();
  try {
    let p = await api<Profile>("auth/me");
    acceptProfile(p);
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
      host.innerHTML = `<span class="eyebrow">ACCOUNT & PRIVACY</span><h2>Your account</h2><p>${p.account ? `Signed in as <strong>${esc(p.account.email)}</strong>. Your avatar and progress follow this account.` : "Playing without email. Add one to use your character and progress on another device."}</p><p>${p.account && p.account.eligibleAt > Date.now() ? "Every round you finish is ranked. Shared dares open 24 hours after your account was verified." : "Three outgoing dares per day. No points lost when another player wins."}</p>${!p.account ? '<button class="primary" id="save-account">Save with email →</button>' : ""}<div class="account-actions"><button class="secondary" id="read-privacy">Privacy &amp; data</button><button class="secondary" id="logout">Sign out</button></div><p role="status"></p>`;
      host
        .querySelector("#save-account")
        ?.addEventListener("click", () => create(render));
      host
        .querySelector("#read-privacy")!
        .addEventListener("click", renderPrivacy);
      host.querySelector("#logout")!.addEventListener("click", async () => {
        await api("auth/logout", {});
        clearLocalProfile();
        location.reload();
      });
    };
    const renderPrivacy = () => {
      host.innerHTML = `<span class="eyebrow">ACCOUNT & PRIVACY</span><h2>Privacy &amp; data</h2>${privacySummary}<details class="account-details privacy-details"><summary>Full privacy notice · storage &amp; retention</summary>${privacyNotice()}</details><div class="account-actions"><button class="secondary" id="export-data">Download my data</button><button class="secondary" id="delete-data">Withdraw consent &amp; delete</button></div><button class="secondary" id="privacy-back">Back to account</button><p role="status"></p>`;
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
            a.download = "my-darecade-data.json";
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (e) {
            host.querySelector("[role=status]")!.textContent = (
              e as Error
            ).message;
          }
        });
      host.querySelector("#delete-data")!.addEventListener("click", () => {
        host.innerHTML =
          '<h2>Leave no avatar behind.</h2><p>This permanently removes your account, avatar, progress, scores and dares. You will be signed out on every device.</p><form><label>Type DELETE to confirm<input name="confirm" required pattern="DELETE" autocomplete="off"></label><button class="primary">Delete my profile</button><p role="status"></p></form><button class="secondary" id="keep-account">Keep my account</button>';
        host
          .querySelector("#keep-account")!
          .addEventListener("click", renderPrivacy);
        host.querySelector("form")!.addEventListener("submit", async (e) => {
          e.preventDefault();
          try {
            await api("privacy/delete", {
              confirm: new FormData(e.currentTarget as HTMLFormElement).get(
                "confirm",
              ),
            });
            clearLocalProfile();
            location.reload();
          } catch (err) {
            host.querySelector("[role=status]")!.textContent = (
              err as Error
            ).message;
          }
        });
      });
    };
    if (options.create && !p.account)
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
    '<h2>Help keep the neighbourhood safe.</h2><p>The report goes privately to the arcade operator. This player will be hidden from your neighbourhood.</p><form><label>What concerns you?<select name="reason"><option value="under-age">They may be under 13</option><option value="suspected-cheating">Their score may be unfair</option><option value="unsafe-behaviour">Unsafe behaviour</option><option value="inappropriate-name">Inappropriate nickname or contact details</option></select></label><button class="primary">Send report & hide player</button><p role="status"></p></form>';
  host.querySelector("form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      await api("report", {
        target,
        reason: new FormData(e.currentTarget as HTMLFormElement).get("reason"),
      });
      host.innerHTML =
        "<h2>Report received.</h2><p>The player is hidden from your view. The arcade operator can review your report.</p>";
      window.dispatchEvent(new Event("account-refresh"));
    } catch (error) {
      host.querySelector("[role=status]")!.textContent = (
        error as Error
      ).message;
    }
  });
}
