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
window.addEventListener("hashchange", () => {
  if (new URLSearchParams(location.hash.slice(1)).has("login"))
    location.reload();
});
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
export const privacyCopy = `<h2>Your play. Your privacy.</h2><p>We save your avatar, progress, scores, chosen nickname, avatar gender preference and age band. If you create an account, we also keep your email so you can sign in on another device. We do not keep your birth month or year.</p><p>Other players can see your nickname, avatar, activity, scores and dares. They cannot see your email or age band. Choose a nickname rather than your real name or contact details. Avatar gender is an optional character preference, not a request for your real gender. There is no chat, photo upload or advertising tracker.</p><p>We check recorded game inputs before saving scores. Inputs are deleted after 30 days; scores stay with your profile. Sign-in links expire after 15 minutes. Inactive profiles are deleted after 12 months. Optional phone-test feedback is saved only when you send it and is included in your data download and deletion.</p><p>You can download your data or withdraw consent and delete your profile under Account & privacy. Deleting removes your avatar, scores, dares and access. It cannot be undone.</p><p>This local test stores data on the arcade operator's computer. Email delivery, when enabled, uses a transactional email provider. No purchases or marketing emails are enabled.</p><p>If anything is unclear, stop here and ask a trusted adult or the arcade operator. You do not need to agree to continue reading this notice.</p>`;
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
function deliveryText() {
  return config.mailMode === "outbox"
    ? "Local testing: the sign-in message was saved to the operator’s private test outbox. Live email delivery is not connected. Ask the operator for your test link."
    : "If the address can be used, a sign-in link will arrive shortly. It lasts 15 minutes and works once.";
}
function emailForm(host: HTMLElement, path: string, back: () => void) {
  host.innerHTML = `<span class="eyebrow">KEEP YOUR PLACE</span><h2>One email. Your neighbourhood.</h2><p>Use the same email to return on another device. We send a sign-in link; there is no password.</p><form id="email-form"><label>Email<input name="email" type="email" autocomplete="email" maxlength="254" required></label><button class="primary">Send sign-in link →</button><p role="status" id="account-status"></p></form><button class="secondary" id="account-back">Back</button>`;
  host.querySelector("#account-back")!.addEventListener("click", back);
  host.querySelector("form")!.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.currentTarget as HTMLFormElement;
    const button = form.querySelector("button")!;
    button.disabled = true;
    try {
      await api(path, { email: new FormData(form).get("email") });
      host.querySelector("#account-status")!.textContent = deliveryText();
    } catch (error) {
      host.querySelector("#account-status")!.textContent = (
        error as Error
      ).message;
    } finally {
      button.disabled = false;
    }
  });
}
export async function ensureAccount(): Promise<Profile> {
  config = await api<Config>("auth/config");
  const token = new URLSearchParams(location.hash.slice(1)).get("login");
  if (token) {
    history.replaceState(null, "", location.pathname + location.search);
    return new Promise((resolve) => {
      const { d, host } = shell(false);
      host.innerHTML =
        '<h2>Welcome back downstairs.</h2><p>Continue to sign in with this private link.</p><button class="primary" id="consume-link">Sign in →</button><p role="status"></p>';
      host.querySelector("button")!.addEventListener("click", async () => {
        try {
          const p = await api<Profile>("auth/consume", { token });
          acceptProfile(p);
          d.close();
          resolve(p);
        } catch (error) {
          host.querySelector("[role=status]")!.textContent = (
            error as Error
          ).message;
          const b = document.createElement("button");
          b.className = "secondary";
          b.textContent = "Request a new link";
          b.onclick = () =>
            emailForm(host, "auth/login-link", () => location.reload());
          host.append(b);
        }
      });
    });
  }
  try {
    const p = await api<Profile>("auth/me");
    acceptProfile(p);
    return p;
  } catch {}
  return new Promise((resolve) => {
    const { d, host } = shell(false);
    const welcome = () => {
      host.innerHTML = `<span class="eyebrow">WELCOME DOWNSTAIRS</span><h2>A little about you.</h2><p>Choose your birth month and year. We use them for the welcome check, then discard them.</p><form id="age-form"><div class="age-fields"><label>Birth month<select name="month" required><option value="">Choose month</option>${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].map((m, i) => `<option value="${i + 1}">${m}</option>`).join("")}</select></label><label>Birth year<input name="year" inputmode="numeric" type="number" min="1900" max="${new Date(config.now).getUTCFullYear()}" placeholder="Year" required></label></div><button class="primary">Continue →</button><p role="status"></p></form><button class="secondary" id="existing-account">I already have an account</button>`;
      host
        .querySelector("#existing-account")!
        .addEventListener("click", () =>
          emailForm(host, "auth/login-link", welcome),
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
          host.innerHTML = `${privacyNotice()}<form id="consent-form"><label class="consent-choice"><input type="checkbox" name="consent" required> I understand how my information is used and agree to this.</label><button class="primary">Agree & enter the neighbourhood →</button><p role="status"></p></form><button class="secondary" id="decline">I don’t agree</button>`;
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
export async function openAccount() {
  const { host } = shell();
  try {
    const p = await api<Profile>("auth/me");
    acceptProfile(p);
    const render = () => {
      host.innerHTML = `<span class="eyebrow">ACCOUNT & PRIVACY</span><h2>Your place, saved.</h2><p>${p.account ? `Signed in as <strong>${esc(p.account.email)}</strong>. Your avatar and progress follow this account.` : "You are playing as a guest. Create an email account to keep your avatar and progress across devices."}</p><p>${p.account && p.account.eligibleAt > Date.now() ? "Regular rounds earn progress now. Ranked boards and shared dares open 24 hours after your account was verified." : "Three outgoing dares per day. No points lost when another player wins."}</p>${!p.account ? '<button class="primary" id="save-account">Create my account →</button>' : ""}<div class="account-actions"><button class="secondary" id="read-privacy">Read privacy notice</button><button class="secondary" id="export-data">Download my data</button><button class="secondary" id="logout">Sign out</button><button class="secondary" id="delete-data">Withdraw consent & delete</button></div><p role="status"></p>`;
      host
        .querySelector("#save-account")
        ?.addEventListener("click", () => emailForm(host, "auth/link", render));
      host.querySelector("#read-privacy")!.addEventListener("click", () => {
        host.innerHTML =
          privacyNotice() +
          '<button class="primary" id="privacy-back">Back to account</button>';
        host.querySelector("button")!.addEventListener("click", render);
      });
      host.querySelector("#logout")!.addEventListener("click", async () => {
        await api("auth/logout", {});
        clearLocalProfile();
        location.reload();
      });
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
        host.querySelector("#keep-account")!.addEventListener("click", render);
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
    render();
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
