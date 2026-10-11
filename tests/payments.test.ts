import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import { Payments, verifyStripeEvent } from "../server/payments.mjs";
import {
  canWear,
  outfitLook,
  setItemIndex,
  styleTokens,
} from "../src/collections.ts";

type Session = Record<string, unknown> & {
  id: string;
  status: string;
  payment_status: string;
  payment_intent: {
    id: string;
    latest_charge: { refunded: boolean; disputed: boolean };
  };
};

function setup(secretKey = "sk_test_fixture", livemode = false) {
  const directory = mkdtempSync(join(tmpdir(), "darecade-payments-"));
  const store = new Store(":memory:");
  const c = new Community(store, { directory });
  const player = c.join({
    month: 1,
    year: 2000,
    consent: true,
    privacyVersion: PRIVACY_VERSION,
  }).me.id;
  c.confirmAdult(player, { over18: true });
  const env = {
    PAYMENTS_ENABLED: "true",
    STRIPE_SECRET_KEY: secretKey,
    STRIPE_WEBHOOK_SECRET: "whsec_fixture",
    STRIPE_CATALOG: JSON.stringify({
      solar: { priceId: "price_solar", amount: 490 },
      "donation-small": { priceId: "price_donation", amount: 300 },
    }),
  };
  // Only the external Stripe boundary is simulated. Persistence and rules use real SQLite.
  const sessions = new Map<string, Session>();
  const byKey = new Map<string, string>();
  let calls = 0;
  const request = async (
    url: string,
    init: { body?: string; headers: Record<string, string> },
  ) => {
    calls++;
    if (url.includes("/prices/"))
      return Response.json({
        active: true,
        type: "one_time",
        currency: "sgd",
        unit_amount: url.endsWith("price_solar") ? 490 : 300,
        livemode,
      });
    if (init.body) {
      const key = init.headers["Idempotency-Key"];
      const existing = byKey.get(key);
      if (existing) return Response.json(sessions.get(existing));
      const form = new URLSearchParams(init.body);
      assert.equal(form.get("payment_method_types[0]"), "card");
      assert.equal(form.get("mode"), "payment");
      assert.ok(form.get("success_url")?.startsWith(c.origin));
      const id = `cs_test_fixture${sessions.size}`;
      const price = form.get("line_items[0][price]");
      const inlineAmount = form.get("line_items[0][price_data][unit_amount]");
      const inlineSet = form.get(
        "line_items[0][price_data][product_data][metadata][set]",
      );
      if (inlineAmount) {
        assert.equal(price, null);
        assert.equal(inlineAmount, "499");
        assert.equal(form.get("line_items[0][price_data][currency]"), "sgd");
        assert.ok(form.get("line_items[0][price_data][product_data][name]"));
      }
      const session = {
        id,
        url: `https://checkout.stripe.com/c/pay/${id}`,
        mode: "payment",
        currency: "sgd",
        amount_total: inlineAmount
          ? Number(inlineAmount)
          : price === "price_solar"
            ? 490
            : 300,
        livemode,
        client_reference_id: form.get("client_reference_id"),
        metadata: { order: form.get("metadata[order]") },
        status: "open",
        payment_status: "unpaid",
        payment_intent: {
          id: `pi_fixture${sessions.size}`,
          latest_charge: { refunded: false, disputed: false },
        },
        line_items: {
          has_more: false,
          data: [
            {
              quantity: 1,
              price: inlineAmount
                ? {
                    id: "price_generated",
                    unit_amount: Number(inlineAmount),
                    currency: "sgd",
                    type: "one_time",
                    product: { metadata: { set: inlineSet } },
                  }
                : { id: price },
            },
          ],
        },
      };
      sessions.set(id, session);
      byKey.set(key, id);
      return Response.json(session);
    }
    return Response.json(
      sessions.get(url.split("/sessions/")[1].split("?")[0]),
    );
  };
  const payments = new Payments(c, env, request);
  const account = () =>
    store.db
      .prepare("INSERT INTO accounts VALUES(?,?,?)")
      .run(player, "payment@example.test", Date.now());
  const event = (
    session: Record<string, unknown>,
    type = "checkout.session.completed",
  ) => {
    const raw = JSON.stringify({
      id: "evt_fixture",
      type,
      livemode,
      data: { object: session },
    });
    const t = Math.floor(Date.now() / 1000);
    const signature = `t=${t},v1=${createHmac("sha256", env.STRIPE_WEBHOOK_SECRET).update(`${t}.${raw}`).digest("hex")}`;
    return payments.webhook(raw, signature);
  };
  return {
    c,
    store,
    player,
    env,
    payments,
    sessions,
    account,
    event,
    calls: () => calls,
    close: () => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("guest purchases survive a new device session, retry safely and still revoke refunds", async () => {
  const s = setup();
  try {
    assert.equal(s.c.privateProfile(s.player).account, null);
    const checkout = await s.payments.checkout(s.player, "solar");
    assert.equal(
      (await s.payments.checkout(s.player, "solar")).url,
      checkout.url,
    );
    const session = [...s.sessions.values()][0];
    assert.deepEqual(
      s.c.privateProfile(s.player).progress.wardrobePurchased,
      [],
    );
    const other = s.c.join({
      over13: true,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    });
    await assert.rejects(
      s.payments.reconcile(session.id, other.me.id),
      /not found/,
    );
    session.status = "complete";
    session.payment_status = "paid";
    await s.event(session);
    await s.event(session);
    const device = s.c.issue(s.player);
    const restored = s.c.privateProfile(s.c.lookup(device));
    assert.equal(restored.account, null);
    assert.deepEqual(restored.progress.wardrobePurchased, ["outfit:solar"]);
    assert.equal(s.payments.history(restored.id).length, 1);
    s.c.patch(restored.id, outfitLook(0, 0));
    session.payment_intent.latest_charge.refunded = true;
    await s.payments.reconcile(session.id, restored.id);
    assert.deepEqual(
      s.c.privateProfile(restored.id).progress.wardrobePurchased,
      [],
    );
    assert.equal(
      s.store.db.prepare("SELECT count(*) n FROM accounts").get().n,
      0,
    );
  } finally {
    s.close();
  }
});

test("under-18 checkout is rejected before any Stripe request", async () => {
  const s = setup();
  try {
    s.store.db
      .prepare("DELETE FROM adult_confirmations WHERE player=?")
      .run(s.player);
    s.store.db
      .prepare("UPDATE profiles SET age_band='13–17' WHERE player=?")
      .run(s.player);
    await assert.rejects(s.payments.checkout(s.player, "solar"), /18 and over/);
    assert.equal(s.sessions.size, 0);
  } finally {
    s.close();
  }
});

test("payment configuration stays closed without secrets; prices stay server-owned", async () => {
  const s = setup();
  try {
    const off = new Payments(s.c);
    assert.deepEqual(off.config(), {
      enabled: false,
      testMode: true,
      products: [],
    });
    await assert.rejects(() => off.checkout(s.player, "solar"), /coming soon/);
    await assert.rejects(
      () => s.payments.checkout(s.player, "forged-price"),
      /not available/,
    );
    assert.ok(!JSON.stringify(s.payments.config()).includes("sk_test"));
    assert.ok(!JSON.stringify(s.payments.config()).includes("price_solar"));
    assert.equal(s.calls(), 0);
  } finally {
    s.close();
  }
});

for (const live of [false, true]) {
  test(`restricted ${live ? "live" : "test"} keys support checkout and signed fulfillment`, async () => {
    const s = setup(`rk_${live ? "live" : "test"}_fixture`, live);
    try {
      assert.equal(s.payments.config().enabled, true);
      assert.equal(s.payments.config().testMode, !live);
      s.account();
      await s.payments.checkout(s.player, "solar");
      const session = [...s.sessions.values()][0];
      session.status = "complete";
      session.payment_status = "paid";
      await s.event(session);
      assert.deepEqual(
        s.c.privateProfile(s.player).progress.wardrobePurchased,
        ["outfit:solar"],
      );
    } finally {
      s.close();
    }
  });
}

test("concurrent checkout retries reuse one session; only verified paid orders unlock the outfit, without pet or magic", async () => {
  const s = setup();
  try {
    s.account();
    const urls = await Promise.all([
      s.payments.checkout(s.player, "solar"),
      s.payments.checkout(s.player, "solar"),
    ]);
    assert.equal(urls[0].url, urls[1].url);
    assert.equal(s.sessions.size, 1);
    const session = [...s.sessions.values()][0];
    await s.event(session);
    assert.deepEqual(
      s.c.privateProfile(s.player).progress.wardrobePurchased,
      [],
    );
    await assert.rejects(
      () => s.payments.reconcile(session.id, "another-player"),
      /not found/,
    );
    session.status = "complete";
    session.payment_status = "paid";
    await Promise.all([
      s.event(session),
      s.payments.reconcile(session.id, s.player),
    ]);
    const p = s.c.privateProfile(s.player).progress;
    assert.deepEqual(p.wardrobePurchased, ["outfit:solar"]);
    assert.deepEqual(p.wardrobeUnlocked, []);
    assert.equal(p.xp, 0);
    assert.equal(styleTokens(p), 0);
    s.c.patch(s.player, outfitLook(0, 0));
    const worn = s.c.privateProfile(s.player).progress;
    assert.equal(worn.clothing, 24);
    assert.equal(worn.hair, setItemIndex("hair", 0));
    for (const slot of ["pet", "accessory"] as const)
      assert.throws(
        () => s.c.patch(s.player, { [slot]: setItemIndex(slot, 0) }),
        /Unlock/,
      );
    assert.equal(s.payments.history(s.player).length, 1);
    await assert.rejects(
      () => s.payments.checkout(s.player, "solar"),
      /already own/,
    );
    s.c.patch(s.player, { wardrobePurchased: ["moon"], wardrobeSpent: -1000 });
    assert.deepEqual(s.c.privateProfile(s.player).progress.wardrobePurchased, [
      "outfit:solar",
    ]);
  } finally {
    s.close();
  }
});

test("wrong amount, currency, product, metadata and mode never grant ownership", async () => {
  const s = setup();
  try {
    s.account();
    await s.payments.checkout(s.player, "solar");
    const session = [...s.sessions.values()][0];
    session.status = "complete";
    session.payment_status = "paid";
    for (const [key, value] of [
      ["amount_total", 1],
      ["currency", "usd"],
      ["livemode", true],
      ["mode", "subscription"],
      ["metadata", { order: "forged" }],
      ["line_items", { data: [{ quantity: 1, price: { id: "price_other" } }] }],
    ]) {
      const original = session[String(key)];
      session[String(key)] = value;
      await assert.rejects(
        () => s.payments.reconcile(session.id, s.player),
        /does not match/,
      );
      session[String(key)] = original;
    }
    assert.deepEqual(
      s.c.privateProfile(s.player).progress.wardrobePurchased,
      [],
    );
  } finally {
    s.close();
  }
});

test("refund removes bought entitlement and equipped pieces, but preserves an earned unlock", async () => {
  const s = setup();
  try {
    s.account();
    await s.payments.checkout(s.player, "solar");
    const session = [...s.sessions.values()][0];
    session.status = "complete";
    session.payment_status = "paid";
    await s.event(session);
    s.c.patch(s.player, outfitLook(0, 0));
    session.payment_intent.latest_charge.refunded = true;
    await s.event(
      { payment_intent: session.payment_intent.id },
      "charge.refunded",
    );
    assert.equal(s.c.privateProfile(s.player).progress.clothing, 0);
    assert.deepEqual(
      s.c.privateProfile(s.player).progress.wardrobePurchased,
      [],
    );
    await s.event(session);
    assert.equal(s.payments.history(s.player)[0].status, "refunded");
    const p = s.c.privateProfile(s.player).progress;
    p.xp = 1200;
    p.rounds = 30;
    s.c.save(s.player, p);
    s.c.progression(s.player, "redeem-style", "solar");
    s.c.patch(s.player, outfitLook(0, 0));
    await s.event(session);
    assert.equal(s.c.privateProfile(s.player).progress.clothing, 24);
  } finally {
    s.close();
  }
});

test("donations grant no cosmetics; deletion removes player links and later callbacks cannot recreate profiles", async () => {
  const s = setup();
  try {
    s.account();
    await s.payments.checkout(s.player, "donation-small");
    const session = [...s.sessions.values()][0];
    session.status = "complete";
    session.payment_status = "paid";
    await s.event(session);
    assert.deepEqual(
      s.c.privateProfile(s.player).progress.wardrobePurchased,
      [],
    );
    assert.equal(s.c.export(s.player).payments.length, 1);
    s.c.delete(s.player);
    await s.event(session);
    assert.equal(
      s.store.db.prepare("SELECT player FROM payment_orders").get().player,
      null,
    );
    assert.equal(
      s.store.db.prepare("SELECT count(*) n FROM profiles").get().n,
      0,
    );
  } finally {
    s.close();
  }
});

test("webhook verification rejects forged, mutated and stale bodies; accepts rotated v1 signatures", () => {
  const now = Date.now(),
    t = Math.floor(now / 1000),
    raw = '{"type":"checkout.session.completed"}',
    secret = "whsec_fixture";
  const signature = createHmac("sha256", secret)
    .update(`${t}.${raw}`)
    .digest("hex");
  assert.throws(
    () => verifyStripeEvent(raw, `t=${t},v1=${"0".repeat(64)}`, secret, now),
    /signature/,
  );
  assert.throws(
    () => verifyStripeEvent(raw + " ", `t=${t},v1=${signature}`, secret, now),
    /signature/,
  );
  assert.throws(
    () =>
      verifyStripeEvent(raw, `t=${t},v1=${signature}`, secret, now + 301000),
    /signature/,
  );
  assert.equal(
    verifyStripeEvent(
      raw,
      `t=${t},v1=${"0".repeat(64)},v1=${signature}`,
      secret,
      now,
    ).type,
    "checkout.session.completed",
  );
});

test("under-18 donation attempts fail before contacting Stripe", async () => {
  const f = setup();
  try {
    f.account();
    f.store.db
      .prepare("UPDATE profiles SET age_band=? WHERE player=?")
      .run("13–17", f.player);
    f.store.db
      .prepare("DELETE FROM adult_confirmations WHERE player=?")
      .run(f.player);
    const before = f.calls();
    await assert.rejects(
      f.payments.checkout(f.player, "donation-small"),
      /18 and over/,
    );
    assert.equal(f.calls(), before);
    assert.equal(f.payments.history(f.player).length, 0);
  } finally {
    f.close();
  }
});

for (const product of [
  "jade-fist",
  "aegis-prime",
  "rainshield-guardian",
  "moonbell-society",
]) {
  test(`${product} has a server-priced S$4.99 outfit checkout with verified, idempotent ownership and refunds`, async () => {
    const s = setup();
    try {
      s.account();
      const urls = await Promise.all([
        s.payments.checkout(s.player, product),
        s.payments.checkout(s.player, product),
      ]);
      assert.equal(urls[0].url, urls[1].url);
      assert.equal(s.sessions.size, 1);
      const session = [...s.sessions.values()][0];
      assert.equal(session.amount_total, 499);
      session.status = "complete";
      session.payment_status = "paid";
      const original = session.line_items;
      for (const change of [
        { unit_amount: 1 },
        { currency: "usd" },
        { type: "recurring" },
        { product: { metadata: { set: "solar" } } },
      ]) {
        session.line_items = {
          data: [
            {
              quantity: 1,
              price: {
                id: "price_generated",
                unit_amount: 499,
                currency: "sgd",
                type: "one_time",
                product: { metadata: { set: product } },
                ...change,
              },
            },
          ],
        };
        await assert.rejects(
          () => s.payments.reconcile(session.id, s.player),
          /does not match/,
        );
      }
      assert.deepEqual(
        s.c.privateProfile(s.player).progress.wardrobePurchased,
        [],
      );
      session.line_items = original;
      await Promise.all([
        s.event(session),
        s.payments.reconcile(session.id, s.player),
      ]);
      assert.deepEqual(
        s.c.privateProfile(s.player).progress.wardrobePurchased,
        [`outfit:${product}`],
      );
      await assert.rejects(
        () => s.payments.checkout(s.player, product),
        /already own/,
      );
      session.payment_intent.latest_charge.refunded = true;
      await s.event(
        { payment_intent: session.payment_intent.id },
        "charge.refunded",
      );
      assert.deepEqual(
        s.c.privateProfile(s.player).progress.wardrobePurchased,
        [],
      );
    } finally {
      s.close();
    }
  });
}

test("a whole set paid for before outfit-only sales keeps all four pieces", async () => {
  const s = setup();
  try {
    s.account();
    s.store.db
      .prepare(
        "INSERT INTO payment_orders(id,player,product,kind,price_id,amount,currency,status,created) VALUES('old',?,'moon','set','price_moon',199,'sgd','paid',1)",
      )
      .run(s.player);
    await s.payments.checkout(s.player, "solar");
    const session = [...s.sessions.values()][0];
    session.status = "complete";
    session.payment_status = "paid";
    await s.event(session);
    const p = s.c.privateProfile(s.player).progress;
    assert.deepEqual(p.wardrobePurchased, ["moon", "outfit:solar"]);
    for (const slot of ["clothing", "hair", "pet", "accessory"] as const) {
      assert.equal(canWear(slot, setItemIndex(slot, 1), p, 0), true);
      assert.equal(
        canWear(slot, setItemIndex(slot, 0), p, 0),
        slot === "clothing" || slot === "hair",
      );
    }
    await assert.rejects(
      () => s.payments.checkout(s.player, "moon"),
      /already own/,
    );
  } finally {
    s.close();
  }
});

test("free sets cannot be charged or consume Style tokens", async () => {
  const s = setup();
  try {
    s.account();
    await assert.rejects(
      () => s.payments.checkout(s.player, "rookie-hero"),
      /not available/,
    );
    assert.throws(
      () => s.c.progression(s.player, "redeem-style", "rookie-hero"),
      /free/,
    );
    assert.equal(s.calls(), 0);
    assert.equal(s.c.privateProfile(s.player).progress.wardrobeSpent, 0);
  } finally {
    s.close();
  }
});
