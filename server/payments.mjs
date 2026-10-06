import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import {
  legendarySets,
  ownsSet,
  setItemIndex,
  setStarts,
} from "../src/collections.ts";

const fail = (message, status = 400) => {
  throw Object.assign(Error(message), { status });
};
export async function paymentBody(stream) {
  let size = 0;
  const chunks = [];
  for await (const chunk of stream || []) {
    const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    size += bytes.length;
    if (size > 262144) fail("Request too large.", 413);
    chunks.push(bytes);
  }
  return Buffer.concat(chunks).toString("utf8");
}
export function verifyStripeEvent(raw, signature, secret, now = Date.now()) {
  if (!secret) fail("Payments are not configured.", 503);
  const parts =
    typeof signature === "string"
      ? signature.split(",").map((v) => v.trim().split("="))
      : [];
  const timestamp = parts.find(([k]) => k === "t")?.[1];
  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    fail("Invalid webhook signature.");
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}.${raw}`)
    .digest();
  if (
    !parts.some(
      ([k, value]) =>
        k === "v1" &&
        /^[a-f0-9]{64}$/.test(value) &&
        timingSafeEqual(expected, Buffer.from(value, "hex")),
    )
  )
    fail("Invalid webhook signature.");
  try {
    return JSON.parse(raw);
  } catch {
    fail("Invalid webhook body.");
  }
}

export class Payments {
  constructor(
    community,
    env = {},
    request = (input, init) => fetch(input, init),
  ) {
    this.c = community;
    this.db = community.db;
    this.env = env;
    this.request = request;
  }
  configured() {
    return (
      /^(sk|rk)_(test|live)_/.test(this.env.STRIPE_SECRET_KEY || "") &&
      /^whsec_/.test(this.env.STRIPE_WEBHOOK_SECRET || "")
    );
  }
  liveMode() {
    return /^(sk|rk)_live_/.test(this.env.STRIPE_SECRET_KEY || "");
  }
  catalog() {
    let raw;
    try {
      raw = JSON.parse(this.env.STRIPE_CATALOG || "{}");
    } catch {
      raw = {};
    }
    const products = [];
    for (const [id, value] of Object.entries(raw || {})) {
      const set = legendarySets.find((s) => s.id === id);
      const donation = /^donation-[a-z0-9-]{1,30}$/.test(id);
      if (
        (!set && !donation) ||
        !value ||
        !/^price_[a-zA-Z0-9]+$/.test(value.priceId) ||
        !Number.isSafeInteger(value.amount) ||
        value.amount < 100 ||
        value.amount > 50000
      )
        continue;
      products.push({
        id,
        name: set?.name || "Support Play Simi",
        kind: set ? "set" : "donation",
        amount: value.amount,
        currency: "sgd",
        priceId: value.priceId,
      });
    }
    return products;
  }
  config() {
    return {
      enabled: this.env.PAYMENTS_ENABLED === "true" && this.configured(),
      testMode: !this.liveMode(),
      products: this.catalog().map(({ priceId, ...p }) => p),
    };
  }
  async stripe(path, body, key) {
    if (!this.configured()) fail("Payments are not configured.", 503);
    const response = await this.request(`https://api.stripe.com/v1/${path}`, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${this.env.STRIPE_SECRET_KEY}`,
        ...(body
          ? { "Content-Type": "application/x-www-form-urlencoded" }
          : {}),
        ...(key ? { "Idempotency-Key": key } : {}),
      },
      body: body?.toString(),
      signal: AbortSignal.timeout(15000),
      redirect: "manual",
    });
    if (!response.ok) {
      await response.body?.cancel();
      fail("Stripe is unavailable. Please try again shortly.", 502);
    }
    return JSON.parse(await paymentBody(response.body));
  }
  history(player) {
    return this.db
      .prepare(
        "SELECT id,product,kind,amount,currency,status,created FROM payment_orders WHERE player=? ORDER BY created DESC LIMIT 30",
      )
      .all(player);
  }
  async checkout(player, productId) {
    if (!this.config().enabled)
      fail(
        "Payments are coming soon. You can still earn sets by playing.",
        503,
      );
    const profile = this.c.privateProfile(player);
    if (profile.ageBand !== "18+")
      fail("Purchases are for players aged 18 and over only.", 403);
    if (!profile.account)
      fail("Save your account with email before making a payment.", 403);
    const product = this.catalog().find((p) => p.id === productId);
    if (!product) fail("This item is not available for purchase.");
    if (product.kind === "set" && ownsSet(profile.progress, product.id))
      fail("You already own this set.");
    const price = await this.stripe(`prices/${product.priceId}`);
    if (
      !price.active ||
      price.type !== "one_time" ||
      price.currency !== "sgd" ||
      price.unit_amount !== product.amount ||
      price.livemode !== this.liveMode()
    )
      fail("This price is being updated. Please try again later.", 503);
    const order = this.c.store.transaction(() => {
      const pending = this.db
        .prepare(
          "SELECT * FROM payment_orders WHERE player=? AND product=? AND status='pending' AND created>? ORDER BY created DESC LIMIT 1",
        )
        .get(player, product.id, this.c.now() - 29 * 60000);
      if (
        pending &&
        pending.price_id === product.priceId &&
        pending.amount === product.amount
      )
        return pending;
      const id = randomUUID();
      this.db
        .prepare(
          "INSERT INTO payment_orders(id,player,product,kind,price_id,amount,currency,status,created) VALUES(?,?,?,?,?,?,?,'pending',?)",
        )
        .run(
          id,
          player,
          product.id,
          product.kind,
          product.priceId,
          product.amount,
          "sgd",
          this.c.now(),
        );
      return this.db.prepare("SELECT * FROM payment_orders WHERE id=?").get(id);
    });
    const form = new URLSearchParams({
      mode: "payment",
      "payment_method_types[0]": "card",
      "line_items[0][price]": order.price_id,
      "line_items[0][quantity]": "1",
      client_reference_id: order.id,
      "metadata[order]": order.id,
      "payment_intent_data[metadata][order]": order.id,
      success_url: `${this.c.origin}/?payment=return&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${this.c.origin}/?payment=cancelled`,
      expires_at: String(Math.floor(order.created / 1000) + 1800),
    });
    const session = await this.stripe(
      "checkout/sessions",
      form,
      `darecade-${order.id}`,
    );
    if (!/^cs_(test_|live_)?[a-zA-Z0-9]+$/.test(session.id))
      fail("Invalid checkout response.", 502);
    const url = new URL(session.url);
    if (url.protocol !== "https:" || url.hostname !== "checkout.stripe.com")
      fail("Invalid checkout address.", 502);
    this.db
      .prepare(
        "UPDATE payment_orders SET session=? WHERE id=? AND session IS NULL",
      )
      .run(session.id, order.id);
    return { url: url.href };
  }
  async reconcile(sessionId, player) {
    if (
      typeof sessionId !== "string" ||
      !/^cs_(test_|live_)?[a-zA-Z0-9]+$/.test(sessionId)
    )
      fail("Invalid payment session.");
    if (
      player &&
      !this.db
        .prepare("SELECT 1 FROM payment_orders WHERE session=? AND player=?")
        .get(sessionId, player)
    )
      fail("Payment not found.", 404);
    const s = await this.stripe(
      `checkout/sessions/${sessionId}?expand[]=line_items&expand[]=payment_intent.latest_charge`,
    );
    return this.c.store.transaction(() => {
      const order = this.db
        .prepare("SELECT * FROM payment_orders WHERE id=?")
        .get(s.client_reference_id || "");
      if (!order) return { status: "ignored" };
      const line = s.line_items?.data?.[0];
      if (
        s.id !== sessionId ||
        s.metadata?.order !== order.id ||
        (order.session && order.session !== s.id) ||
        s.mode !== "payment" ||
        s.currency !== order.currency ||
        s.amount_total !== order.amount ||
        s.livemode !== this.liveMode() ||
        s.line_items?.data?.length !== 1 ||
        s.line_items?.has_more ||
        line.quantity !== 1 ||
        line.price?.id !== order.price_id
      )
        fail("Payment does not match this order.");
      const charge = s.payment_intent?.latest_charge;
      let status = order.status;
      if (!["refunded", "disputed"].includes(status)) {
        if (charge?.refunded) status = "refunded";
        else if (charge?.disputed) status = "disputed";
        else if (s.status === "complete" && s.payment_status === "paid")
          status = "paid";
        else if (s.status === "expired" && status === "pending")
          status = "expired";
      }
      this.db
        .prepare(
          "UPDATE payment_orders SET status=?,session=?,intent=? WHERE id=?",
        )
        .run(status, s.id, s.payment_intent?.id || null, order.id);
      if (order.player) {
        const progress = this.c.privateProfile(order.player).progress;
        progress.wardrobePurchased = this.db
          .prepare(
            "SELECT DISTINCT product FROM payment_orders WHERE player=? AND kind='set' AND status='paid'",
          )
          .all(order.player)
          .map((row) => row.product);
        this.c.save(order.player, progress);
      }
      if (order.player && ["refunded", "disputed"].includes(status))
        this.clearRevokedLook(order.player, order.product);
      return { status, kind: order.kind, product: order.product };
    });
  }
  clearRevokedLook(player, product) {
    const p = this.c.privateProfile(player).progress;
    if (ownsSet(p, product)) return;
    const index = legendarySets.findIndex((s) => s.id === product);
    if (index < 0) return;
    const patch = {};
    for (const slot of Object.keys(setStarts))
      if (p[slot] === setItemIndex(slot, index)) patch[slot] = 0;
    this.c.patch(player, patch);
  }
  async webhook(raw, signature) {
    const event = verifyStripeEvent(
      raw,
      signature,
      this.env.STRIPE_WEBHOOK_SECRET,
      this.c.now(),
    );
    if (event.livemode !== this.liveMode()) fail("Wrong payment mode.");
    const object = event.data?.object;
    if (
      [
        "checkout.session.completed",
        "checkout.session.async_payment_succeeded",
        "checkout.session.expired",
      ].includes(event.type)
    )
      await this.reconcile(object?.id);
    else if (
      ["charge.refunded", "charge.dispute.created"].includes(event.type)
    ) {
      const intent =
        typeof object?.payment_intent === "string"
          ? object.payment_intent
          : object?.payment_intent?.id;
      let source = object;
      if (
        event.type === "charge.dispute.created" &&
        typeof object?.charge === "string"
      )
        source = await this.stripe(
          `charges/${encodeURIComponent(object.charge)}`,
        );
      const order = this.db
        .prepare("SELECT session FROM payment_orders WHERE intent=? OR id=?")
        .get(intent || "", source?.metadata?.order || "");
      if (order?.session) await this.reconcile(order.session);
    }
    return { received: true };
  }
}
