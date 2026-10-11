import { mountAvatarCards } from "./avatar-portraits";
import { api } from "./social";
import {
  acceptProfile,
  currentProfile,
  openAccount,
  type Profile,
} from "./account";
import { legendarySets, ownsOutfit } from "./collections";

type Product = {
  id: string;
  name: string;
  kind: "outfit" | "donation";
  amount: number;
  currency: "sgd";
};
type PaymentConfig = {
  enabled: boolean;
  testMode: boolean;
  products: Product[];
};
type Order = {
  id: string;
  product: string;
  kind: string;
  amount: number;
  currency: string;
  status: string;
  created: number;
};
const money = (amount: number) =>
  new Intl.NumberFormat("en-SG", { style: "currency", currency: "SGD" }).format(
    amount / 100,
  );
const text = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] ?? c,
  );
const productName = (id: string) =>
  legendarySets.find((s) => s.id === id)?.name ?? "Donation to Play Simi";

export async function mountPayments(
  host: HTMLElement,
  selectedSet = "",
  session = "",
  cancelled = false,
) {
  host.innerHTML =
    '<section class="payment-panel"><h2>Buy looks</h2><p role="status">Loading payment options…</p></section>';
  const panel = host.querySelector<HTMLElement>(".payment-panel")!;
  let message = cancelled
    ? "Checkout was cancelled. No new look has been granted."
    : "";
  try {
    if (session) {
      const result = await api<{
        status: string;
        kind: string;
        product: string;
      }>("payments/status", { session });
      acceptProfile(await api<Profile>("auth/me"));
      message =
        result.status === "paid"
          ? result.kind === "outfit"
            ? `The ${productName(result.product)} outfit is yours. Find it in My look.`
            : result.kind === "set"
              ? `${productName(result.product)} is yours. Find it in My look.`
              : "Thank you for supporting Play Simi! Your donation is confirmed."
          : `Payment status: ${result.status}. Refresh to check again. Outfits unlock only after payment is confirmed.`;
    }
    const [config, orders] = await Promise.all([
      api<PaymentConfig>("payments/config"),
      api<Order[]>("payments/history"),
    ]);
    if (!panel.isConnected) return;
    const selected = legendarySets.find((s) => s.id === selectedSet);
    const donations = config.products.filter((p) => p.kind === "donation");
    const purchase = (p: Product | undefined, id: string) => {
      const owned = currentProfile && ownsOutfit(currentProfile.progress, id);
      if (owned) return '<span class="item-state">Already owned</span>';
      if (!currentProfile?.purchasesConfirmed)
        return '<button class="secondary premium-age-lock" disabled>🔒 18+ only</button>';
      if (!config.enabled || !p)
        return '<button class="secondary" disabled>Payments coming soon</button>';
      return `<button class="primary" data-checkout="${text(p.id)}" ${currentProfile?.purchasesConfirmed ? "" : "disabled"}>${p.kind === "donation" ? "Donate" : "Buy outfit"} · ${money(p.amount)}</button>`;
    };
    panel.innerHTML = `<button class="text-button" data-open="wardrobe">← My look</button><span class="eyebrow">OPTIONAL PURCHASES · 18+</span><h2>${selected ? text(selected.name) : "Buy looks"}</h2>${selected ? "" : '<p class="lead">Choose a look to make your own.</p>'}<p class="payment-status" role="status">${text(message)}</p>${!config.enabled ? '<div class="note">Payments are not open yet. Prices will appear when checkout is ready. You can still earn Style Tokens and unlock token looks by playing.</div>' : config.testMode ? '<div class="note">Test checkout. No real payments.</div>' : ""}${!currentProfile?.account ? '<p class="device-save-note">No account needed. Saved to this browser on this device. Clearing browser data can lose access.</p><details><summary>Optional email backup</summary><p>Recover purchases and progress on another device.</p><button class="secondary" data-payment-account>Add email backup</button></details>' : ""}${!currentProfile?.purchasesConfirmed ? `<section class="adult-confirm"><strong>🔒 18+ only</strong><p>Purchases are locked. Confirm your age before buying.</p><button class="secondary" data-confirm-adult>I'm 18 or older</button></section>` : ""}<section>${selected ? "" : "<h3>Outfits</h3>"}<p>One-time purchase. Includes the girl and boy outfits with headwear. Pets and magic are separate: unlock them with Style tokens. Cosmetic only. No tokens spent.</p><div class="payment-products">${(selected
      ? [selected]
      : legendarySets.filter((s) => s.tier !== "Free")
    )
      .map(
        (s) =>
          `<article class="payment-product"><img class="avatar-thumbnail is-ready" src="/wardrobe/outfits-${legendarySets.indexOf(s) * 2 + (currentProfile?.progress.body ?? 0)}.png" data-thumbnail="outfits:${legendarySets.indexOf(s) * 2 + (currentProfile?.progress.body ?? 0)}" alt="${text(s.name)}" width="100" height="92" loading="lazy"><div><strong>${text(s.name)}</strong><small>Girl and boy outfit · headwear</small>${purchase(
            config.products.find((p) => p.id === s.id),
            s.id,
          )}</div></article>`,
      )
      .join(
        "",
      )}</div></section>${currentProfile?.purchasesConfirmed && !selected ? `<section><h3>Make a donation</h3><p>A one-time contribution to the game. Donations do not grant items, tokens or leaderboard benefits.</p><div class="payment-donations">${donations.length ? donations.map((p) => purchase(p, p.id)).join("") : '<button class="secondary" disabled>Donations coming soon</button>'}</div></section>` : ""}<p class="fine-print">${config.enabled ? "Stripe handles card details on its hosted checkout. The next step shows your total before you pay. No subscriptions." : "No payment details are collected while checkout is unavailable."}</p><details><summary>Payment history</summary>${orders.length ? orders.map((o) => `<div class="payment-order"><span>${text(productName(o.product))}<small>${new Date(o.created).toLocaleDateString("en-SG", { timeZone: "Asia/Singapore" })} · ${text(o.status)}</small></span><strong>${money(o.amount)}</strong></div>`).join("") : "<p>No payments yet.</p>"}</details><div class="payment-links"><button class="secondary" data-payment-refresh>Refresh payment status</button><button class="secondary" data-open="wardrobe">Back to My look</button></div>`;
    panel
      .querySelector("[data-confirm-adult]")
      ?.addEventListener("click", async () => {
        try {
          acceptProfile(await api<Profile>("auth/adult", { over18: true }));
          await mountPayments(host, selectedSet);
        } catch (error) {
          panel.querySelector(".payment-status")!.textContent =
            error instanceof Error ? error.message : "Please try again.";
        }
      });
    if (currentProfile) mountAvatarCards(panel, currentProfile.progress);
    panel
      .querySelector("[data-payment-account]")
      ?.addEventListener("click", () => void openAccount({ create: true }));
    panel
      .querySelector("[data-payment-refresh]")
      ?.addEventListener(
        "click",
        () => void mountPayments(host, selectedSet, session),
      );
    panel
      .querySelectorAll<HTMLButtonElement>("[data-checkout]")
      .forEach((button) =>
        button.addEventListener("click", async () => {
          panel
            .querySelectorAll<HTMLButtonElement>("[data-checkout]")
            .forEach((b) => (b.disabled = true));
          const status = panel.querySelector<HTMLElement>(".payment-status")!;
          status.textContent = "Opening secure checkout…";
          try {
            const result = await api<{ url: string }>("payments/checkout", {
              product: button.dataset.checkout,
            });
            const url = new URL(result.url);
            if (
              url.protocol !== "https:" ||
              url.hostname !== "checkout.stripe.com"
            )
              throw Error("Checkout address is unavailable.");
            location.assign(url.href);
          } catch (error) {
            status.textContent =
              error instanceof Error
                ? error.message
                : "Checkout is unavailable. Please try again.";
            panel
              .querySelectorAll<HTMLButtonElement>("[data-checkout]")
              .forEach((b) => (b.disabled = false));
          }
        }),
      );
  } catch (error) {
    if (!panel.isConnected) return;
    panel.innerHTML = `<h2>Payments</h2><p role="status">${text(error instanceof Error ? error.message : "Unable to load payments.")}</p><button class="secondary" data-retry-payment>Try again</button><button class="secondary" data-open="wardrobe">Back to My look</button>`;
    panel
      .querySelector("[data-retry-payment]")
      ?.addEventListener(
        "click",
        () => void mountPayments(host, selectedSet, session, cancelled),
      );
  }
}
