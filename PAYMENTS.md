# Donations and premium looks

Implemented for the local Node server and Cloudflare Worker. Premium set
purchases are enabled in production at S$1.99 per complete set. One-time
donations are S$2, S$5, S$10 or S$50, all in SGD. The separate
local sandbox purchase and refund passed; no real payment has been processed
as part of setup.

## Guest purchases

The current code allows guest purchases with no email account. A selected set
opens its own purchase screen, with the configured SGD total and one checkout
button after adult confirmation. Optional email backup is tucked into details.
The purchase return reconciles payment with Stripe before caching the updated
owned looks in `darecade-v1`. Ownership remains server-authoritative.

Guests keep a HttpOnly device cookie for 365 days, renewed when the app opens.
Existing unexpired 30-day guest sessions upgrade on their next visit. Expired
or revoked sessions cannot be revived. Clearing browser data, changing browsers,
private browsing or inactivity can lose access; optional email backup enables
recovery and use on other devices. Account sessions retain their 30-day expiry.
The existing inactive-profile retention and deletion rules still apply.

## Stripe setup status — 4 October 2026

- Separate Darecade account: `acct_1UMkqGA6Maf1zlsl`.
- Separate Darecade sandbox: `acct_1UMkqOPB58tsspFG`.
- Business location is Singapore; the website and game description are entered.
- Sandbox integration preference is Prebuilt checkout (Stripe-hosted Checkout).
- All ten complete cosmetic sets are saved in the sandbox at the owner-approved
  S$1.99 each, one-time, in SGD. `stripe-sandbox-catalog.json` contains their
  verified Stripe Price IDs and amounts (199 cents), for this sandbox only.
- Live donations are configured at S$2, S$5, S$10 and S$50, one-time in SGD,
  under `Support Darecade` (`prod_VNWewgIXnal6PI`). All four prices passed
  authenticated API checks. Donations grant no items, tokens or rank.
- The sandbox secret key is stored only in the ignored `.env.stripe-sandbox`.
  All ten prices were verified against Stripe's API and the sandbox account ID.
- A real Stripe sandbox Checkout test passed for Solar Sentinel: S$1.99,
  successful signed webhook (HTTP 200), all four pieces unlocked and equipped,
  and no XP or Style token deduction. A sandbox refund also delivered a signed
  webhook (HTTP 200), revoked ownership and unequipped all four pieces. The
  browser payment history correctly displays `refunded`.
- The local listener forwards sandbox events only to `127.0.0.1:4174`, using an
  isolated database at `data/stripe-sandbox`. This is not a hosted webhook.
- The owner submitted live onboarding and Stripe opened the live dashboard.
  The ten products were copied to live mode and all ten live prices were
  verified in the Dashboard at S$1.99. `stripe-live-catalog.json` contains the
  live Price IDs (different from the sandbox IDs).
- A live restricted key named `Darecade server` was created: Checkout Sessions
  write; Charges and Refunds, Payment Intents, Prices and Products read. The
  backend accepts both restricted (`rk_`) and standard (`sk_`) server keys.
- Both live secrets are saved in the ignored `.env.stripe-live` and Cloudflare
  secret bindings. All ten live prices passed authenticated API checks.
- Live Checkout creation and expanded session retrieval passed with the
  restricted key. The unpaid S$1.99 preflight session was immediately expired;
  no card details or charge were submitted. This verifies checkout access,
  not bank payout completion. Account status retrieval is outside this key's
  permissions.
- Active webhook `we_1UMlTDA6Maf1zlslfAoUT1gA` sends the five events below to
  `https://playsimi.danielquek.com/api/payments/webhook`, using
  snapshot payloads and API version `2026-08-26.dahlia`. Until 5 October 2026
  it pointed at `https://darecade.daniel-tianwen.workers.dev/api/payments/webhook`,
  which still accepts signed events. The address was edited in place, so the
  signing secret is unchanged; the destination is now named `Play Simi
purchases`.
- Stripe delivered live event `evt_1UMlW5A6Maf1zlsltj5Rbx3y` with HTTP 200 and
  `received: true` at 17:15:48 SGT. Its initial attempt reached the previous
  deployment during propagation; Stripe's automatic retry recovered after
  15 seconds. Unsigned callbacks now return HTTP 400.
- After the move, the same event was re-sent by hand from the Stripe
  dashboard and delivered to the new address with HTTP 200 at 03:10:57 SGT on
  5 October 2026. It is the expired, unpaid preflight session, so no charge or
  order changed. A real purchase through the new address is not yet verified.
- Production purchases were enabled in Worker version
  `081d7958-76fc-4887-a0eb-f2c3ac24dd41`. The live browser shows all ten S$1.99
  sets with loaded previews; guest purchase buttons require saving an email
  account first. Donations are configured at the four owner-approved amounts.
- Live onboarding now shows the business section complete. Category: Games;
  description: one-time S$1.99 cosmetic sets; statement descriptor: DARECADE.
  The prefilled support phone is hidden on receipts. The owner completed payout
  bank entry. The final review shows business and bank sections complete,
  two-step authentication on, included Radar Lite on, and optional Stripe Tax
  and Climate contributions off. The owner completed `Agree and submit`.

### Resume local sandbox testing

Windows PowerShell, from this repository (the listener and server must remain running):

```powershell
npm install --prefix .browser/stripe-tools --no-audit --no-fund @stripe/cli
node scripts/stripe-sandbox.mjs
```

The helper checks the sandbox account and localhost configuration, captures the
CLI's signing secret directly into the ignored environment file without displaying
it, and starts the local server. Open `http://127.0.0.1:4174`. Use only
[Stripe test cards](https://docs.stripe.com/testing). Ctrl+C stops both processes.

Players can open **More → Support & purchases**, or **My look → Sets → Buy set
options**. Prices appear only after the operator configures them. Guests can
check out after confirming they are 18 or older. Email backup is optional.
Players see the amount and the product
before choosing Stripe's hosted checkout. Purchases are one-time, in SGD, and
unlock all four pieces of a set without spending Style tokens or requiring
medals. The earned-token route remains available. Donations grant no items,
tokens or ranking advantages. There are no subscriptions or random paid rewards.

## Catalogue

### Six new sets — 5 October 2026

- Sandbox: products and S$1.99 one-time SGD prices exist for all six and are in
  `stripe-sandbox-catalog.json`. The server's catalogue check accepts all 16.
  No sandbox checkout of a new set has been run.
- Live: created on 5 October 2026 with `scripts/stripe-add-sets.mjs live`,
  after the owner gave the `Darecade server` key Products and Prices write.
  Stripe confirms each of the six prices is live, active, one-time, SGD 199.
  They are in `stripe-live-catalog.json` and in `STRIPE_CATALOG` in
  `wrangler.jsonc` (20 entries: 16 sets and 4 donations).
- Not yet done: deploying this change, a real purchase of a new set, and
  removing the write permission from the key, which the server does not need.

Sandbox set prices are in `stripe-sandbox-catalog.json`; live set and donation
prices are in `stripe-live-catalog.json`.

Keep credentials in local environment files or Cloudflare secrets. Never put
them in source files, frontend environment variables or chat messages. A
publishable key is not needed for hosted Checkout.

## Configuration

| Variable                | Purpose                                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- |
| `PAYMENTS_ENABLED`      | Must be the string `true` to allow new checkout sessions. Defaults to `false`.                              |
| `STRIPE_SECRET_KEY`     | Server-side Stripe secret.                                                                                  |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/payments/webhook`.                                                                 |
| `STRIPE_CATALOG`        | JSON object mapping a product ID to `priceId` and integer `amount` in SGD cents. Defaults to `{}`.          |
| `PUBLIC_ORIGIN`         | The canonical game origin. Stripe return and cancellation URLs use this value, never a client-supplied URL. |

Set IDs: `solar`, `moon`, `storm`, `sakura`, `nova`, `abyss`, `tide`, `phoenix`,
`frost`, `galaxy`, and from 5 October 2026 `candy`, `boba`, `pixel`, `witch`,
`garden`, `dino`. Donation IDs start with `donation-`, such as `donation-small`.
Each product accepts `{ "priceId": "price_ID_FROM_STRIPE", "amount": 199 }`.
The owner approved S$1.99 for each complete cosmetic set. The server
checks the configured amount, SGD currency, one-time price type and test/live
mode against Stripe before creating checkout. Supported configured amounts are
S$1–S$500. Finalise prices and any applicable tax treatment before enabling.

Windows PowerShell, after supplying prices and setting up the webhook:

```powershell
# These commands prompt for secrets; never append the values to the commands.
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

Set non-secret catalogue configuration in `wrangler.jsonc`. Keep
`PAYMENTS_ENABLED=false` until testing is complete. Local development uses the
variables in `.env.example`; start with `node --env-file=.env server/index.mjs`.

Use an isolated local database or a separate staging Worker with Stripe test
keys. Do not mix sandbox purchases into the production account database. Test
Checkout, webhook delivery, cancellation, retries and refunds before switching
to live keys and enabling the production catalogue.

## Webhook and fulfilment

Create the endpoint at `https://YOUR_GAME_ORIGIN/api/payments/webhook` with:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.expired`
- `charge.refunded`
- `charge.dispute.created`

The implementation currently offers card payments only. A raw-body HMAC-SHA256
check uses Stripe's `v1` signatures, constant-time comparison and a five-minute
timestamp tolerance. Checkout completion and authenticated return-page checks
retrieve the canonical session from Stripe with line items and charge details.
They verify the order, price, currency, amount, mode and paid status before
granting anything. A success URL alone never grants a set.

Checkout retries reuse a persisted order and Stripe idempotency key for the
same pending product. Fulfilment and entitlements update in one SQLite
transaction. Paid entitlements are separate from earned unlocks, so purchases
cannot consume earned tokens and a refunded purchase does not erase an earned
copy. Full refunds revoke the bought entitlement and unequip its pieces unless
the player also earned the set. Partial refunds retain access. Disputes place
the purchase on hold; restoration after a resolved dispute requires operator
review. Turning off new checkout does not disable signed payment callbacks.

## Records and privacy

Players see their payment history in Support & purchases and in their account
data export. The app stores order IDs, product, amount, currency, status,
timestamps and Stripe session/payment references, not card details. Account
deletion removes the player link from the ledger. Later callbacks cannot
recreate that account. Stripe retains its own payment records. Enable receipt
emails and complete your merchant/support details in Stripe before launch.

## Validation

Automated tests cover disabled configuration, guest checkout and age requirements,
concurrent retries, unpaid and mismatched payments, forged and stale signatures,
fulfilment, refunds, donations, account deletion and ownership isolation.
External Stripe responses are simulated in the automated tests. The separate
browser-based Stripe sandbox purchase and refund above also passed on 4 October 2026. Production webhook delivery and unpaid live Checkout creation also
passed as recorded above. A completed live charge and payout were not tested.

The final pre-deployment checks passed 113 Node tests, 8 Cloudflare runtime
tests, TypeScript compilation, the production build and Wrangler dry run.

Implementation references: [Stripe Checkout fulfilment](https://docs.stripe.com/checkout/fulfillment),
[webhook signature verification](https://docs.stripe.com/webhooks#verify-manually),
[Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create).

## Outfit-only pricing — 11 October 2026

The owner changed what money buys. A purchase is now an **outfit**: the girl
and boy clothes with their headwear, for **S$4.99**. Pets and magic are not
included; in Legendary and Premium sets they cost 4 Style tokens each. The
8-token unlock is outfit-only too. Everything above this section that says
S$1.99 or "all four pieces" describes the earlier offer.

- New orders are stored with kind `outfit` and grant `outfit:<set>`. A paid
  order of kind `set` (the S$1.99 offer) and an older token unlock keep all
  four pieces. No migration is needed.
- Stripe: each of the sixteen catalogued sets has a new one-time SGD 499 price
  on its existing product, made by `scripts/stripe-add-sets.mjs` in the sandbox
  and in live. The products are renamed "… Outfit" and their description says
  the pet and magic are not included. All 32 prices were read back from Stripe
  as active, one-time, SGD 499 and the product default. The new IDs are in the
  two catalogue files and, for live, in `STRIPE_CATALOG` in `wrangler.jsonc`.
- The other paid sets use the server's inline Checkout price, now 499.
- Deployed on 11 October 2026 as Worker version
  `07316aa4-a191-405d-af17-ad7d2461a699`. The sixteen S$1.99 prices were then
  archived in sandbox and live.
- A sandbox purchase of Solar Sentinel at S$4.99 passed: signed webhook (HTTP
  200), `outfit:solar` granted, clothes wearable, pet and magic refused.
- A live Checkout Session on the new Solar price reported SGD 499 and was
  expired unpaid. A completed live charge has not been made.

## Outfits and single items — 11 October 2026, later the same day

The owner replaced the outfit-only offer above. This section is the current
offer; where it differs from anything earlier in this file, this is right.

| What                                                  | Price  | Tokens instead?                     |
| ----------------------------------------------------- | ------ | ----------------------------------- |
| Outfit: girl and boy clothes, headwear, pet and magic | S$4.99 | Legendary: 8. Premium: no.          |
| One item: the clothes, the headwear, the pet or magic | S$1.99 | Legendary: 5, 4, 4, 4. Premium: no. |

- An outfit order has kind `set` and grants the bare set ID, as it did before
  11 October. A single item has kind `piece`, product `piece:<set>:<slot>`,
  and grants that ID. Orders of kind `outfit` (the few hours of outfit-only
  sales) and `outfit:<set>` entitlements count as the whole set.
- A refund takes back what it paid for and unequips any set piece the player
  can no longer wear.
- Stripe products, made by `scripts/stripe-add-sets.mjs`:
  - sixteen outfit products, "Play Simi — <set> Outfit", SGD 499, tagged
    `kind=outfit`, `set`, `tier`, `includes=clothes,headwear,pet,magic`;
  - four single-item products, "Play Simi — Single item: Clothes / Headwear /
    Pet / Magic", SGD 199, tagged `kind=piece`, `slot`, `includes`. One price
    serves that kind of item from every set; Checkout shows "You are buying
    <item> (<set>)" above the Pay button.
  - Catalogue keys for the item prices are `piece-clothing`, `piece-hair`,
    `piece-pet` and `piece-accessory`.
- Every Checkout Session and PaymentIntent carries `order`, `kind` and
  `product` metadata.
- Sets without a Stripe product, and item prices missing from
  `STRIPE_CATALOG`, use the server's inline price at the same amounts.
