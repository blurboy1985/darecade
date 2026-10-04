# Donations and premium looks

Implemented for the local Node server and Cloudflare Worker. Premium set
purchases are enabled in production at S$1.99 per complete set. One-time
donations are S$2, S$5, S$10 or S$50, all in SGD. The separate
local sandbox purchase and refund passed; no real payment has been processed
as part of setup.

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
options**. Prices appear only after the operator configures them. A saved email
account is required before checkout. Players see the amount and the product
before choosing Stripe's hosted checkout. Purchases are one-time, in SGD, and
unlock all four pieces of a set without spending Style tokens or requiring
medals. The earned-token route remains available. Donations grant no items,
tokens or ranking advantages. There are no subscriptions or random paid rewards.

## Catalogue

Sandbox set prices are in `stripe-sandbox-catalog.json`; live set and donation
prices are in `stripe-live-catalog.json`.

Keep credentials in local environment files or Cloudflare secrets. Never put
them in source files, frontend environment variables or chat messages. A
publishable key is not needed for hosted Checkout.

## Configuration

| Variable | Purpose |
| --- | --- |
| `PAYMENTS_ENABLED` | Must be the string `true` to allow new checkout sessions. Defaults to `false`. |
| `STRIPE_SECRET_KEY` | Server-side Stripe secret. |
| `STRIPE_WEBHOOK_SECRET` | Signing secret for `/api/payments/webhook`. |
| `STRIPE_CATALOG` | JSON object mapping a product ID to `priceId` and integer `amount` in SGD cents. Defaults to `{}`. |
| `PUBLIC_ORIGIN` | The canonical game origin. Stripe return and cancellation URLs use this value, never a client-supplied URL. |

Set IDs: `solar`, `moon`, `storm`, `sakura`, `nova`, `abyss`, `tide`, `phoenix`,
`frost`, `galaxy`. Donation IDs start with `donation-`, such as `donation-small`.
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

Automated tests cover disabled configuration, saved-account requirements,
concurrent retries, unpaid and mismatched payments, forged and stale signatures,
fulfilment, refunds, donations, account deletion and ownership isolation.
External Stripe responses are simulated in the automated tests. The separate
browser-based Stripe sandbox purchase and refund above also passed on 4 October
2026. Production webhook delivery and unpaid live Checkout creation also
passed as recorded above. A completed live charge and payout were not tested.

The final pre-deployment checks passed 113 Node tests, 8 Cloudflare runtime
tests, TypeScript compilation, the production build and Wrangler dry run.

Implementation references: [Stripe Checkout fulfilment](https://docs.stripe.com/checkout/fulfillment),
[webhook signature verification](https://docs.stripe.com/webhooks#verify-manually),
[Checkout Session creation](https://docs.stripe.com/api/checkout/sessions/create).
