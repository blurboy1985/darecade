# Cloudflare hosting

Opened 3 October 2026 at **https://darecade.daniel-tianwen.workers.dev** on the account's existing Workers Free plan. **Gameplay and accounts are enabled** (`LAUNCH_READY=true`) with a verified sending identity and private Resend secret. Worker version: `ab098607-aa47-4b3f-999b-4069a70c8d07`. The privacy/support contact is `hello@darecade.danielquek.com`. Wrangler authorization is verified with account/user read, Workers Scripts Write and background access only. No paid upgrade has been made.

Free Cloudflare Email Routing is enabled for the domain and the `darecade` subdomain. The literal rule `hello@darecade.danielquek.com` is active and forwards to the operator's verified Gmail destination. Catch-all remains disabled. Authoritative DNS and the 1.1.1.1 resolver return the three Cloudflare MX records. Receipt of a real test message has not yet been confirmed. This is incoming forwarding, not a separate mailbox or outgoing SMTP setup; ordinary replies from Gmail use the Gmail address until a separate authenticated sending configuration is added.

Pre-opening checks confirmed HTTPS HTML and the 3,296,036-byte character model returned 200, static security headers were present, the closed launch returned 503, and private database/server paths returned 404. After opening, health/config returned 200, unauthenticated neighbourhood access returned 401, and the browser displayed the birth-month/year gate. An isolated live test verified age and consent rejection, secure cookies, avatar persistence, a replay-validated practice round, duplicate-reward protection, tampered-result rejection, weekly-board access, own-data export, profile erasure and session revocation. That gameplay fixture was deleted; it never qualified for medals. No local profiles were uploaded. Current live physical-iPhone verification remains pending.

## What runs where

### Resend setup, 3 October 2026

The owned sending domain `darecade.danielquek.com` is verified in Resend's Tokyo (`ap-northeast-1`) region. Its DKIM TXT record and the DNS-only `rsend.darecade` and `send.darecade` CNAMEs resolve publicly. Sending is enabled, receiving remains disabled, and TLS is enforced. Tracking has not been configured. Existing Cloudflare incoming forwarding is preserved.

The sender is `Darecade <hello@darecade.danielquek.com>`. The user created and entered the prepared domain-restricted sending key directly into the production Worker secret `RESEND_API_KEY`; secret metadata was verified without revealing its value. Exactly one approved sign-in email was sent to the support alias, and Resend reports Delivered. Gmail receipt and link consumption remain pending the operator's confirmation. A temporary mail-only profile named `Mail Check` has no scores or medals and is retained for that check. The key is absent from source control and browser assets.

- Cloudflare Workers Static Assets delivers the built game, fonts and Blender models from `dist/` over HTTPS.
- A SQLite-backed Durable Object holds the shared neighbourhood, accounts, saved looks, progression, score replays, dares, medals and private feedback. It requests Southeast Asia placement. This is a latency hint, **not a Singapore residency guarantee**.
- The original game/account rules are shared with the local Node server in `server/store-core.mjs` and `server/community-core.mjs`. `server/store.mjs` and `server/community.mjs` retain local SQLite/filesystem adapters, so existing local data and commands keep working.
- Database transactions preserve one-time rewards and challenge limits. A daily Durable Object alarm awards Singapore-midnight medals and performs retention cleanup even when nobody is online. Requests also catch up missed medal settlements.
- Resend delivers account sign-in emails. No local email outbox is available in the hosted game. `RESEND_API_KEY` is a Worker secret, never a browser asset or tracked configuration.
- Private request limits use salted IP hashes in the database, shared across edge locations and retained through object eviction. Raw IP addresses are not stored by this application. Expired buckets are removed by daily cleanup (within approximately 24 hours). Cloudflare/provider infrastructure logs have their own policies.

The current design is one shared neighbourhood for an initial beta. Presence polling and SQL reads/writes consume quotas; this is not an unlimited-capacity deployment. It does not create paid subscriptions or purchase a domain. Local test accounts are not automatically copied to the cloud.

## Required before publishing

1. Sign in to the correct Cloudflare account with Wrangler. Inspect the account's existing Workers plan before deployment; do not enable paid services without the agreed budget.
2. Choose the default `workers.dev` address or an owned domain. Set its exact HTTPS origin in `wrangler.jsonc`.
3. Supply a verified sending domain/address and configure the Resend secret locally. Confirm a monitored privacy/support address and accurate provider/storage notice.
4. Keep `LAUNCH_READY=false` until these fields and the email secret are set. The hosted API returns a setup message and accepts no accounts while incomplete. `/api/health` returns 503 until ready.
5. Deploy, verify the live age/privacy gate and headers, test delivery to an explicitly authorized test recipient, then verify saved-look recovery, a completed round, the weekly board, export and deletion. Run a real iPhone check against the HTTPS URL. Local runtime tests do not establish these live results.

The existing `PRIVACY-REVIEW.md` describes the outstanding operator, moderation, storage and recovery requirements. This implementation is not a certification of regulatory compliance.

## Commands — Windows PowerShell

From `C:\Users\Admin\Documents\darecade`:

```powershell
# All local; these commands do not publish or create cloud resources.
npm ci
npm test
npm run test:cloudflare

# User-mediated account authorization.
npx wrangler login
npx wrangler whoami

# Enter the email provider key into the private terminal prompt, never chat.
npx wrangler secret put RESEND_API_KEY

# After final configuration and authorization are complete:
npm run cf:deploy
```

`wrangler.jsonc` uses a named SQLite Durable Object migration. Do not rename `Neighbourhood`, change the stable object name `darecade-main-v1`, or delete its namespace as part of a routine update. These identify the saved world. A rollback of code is not a rollback of player data.

## Operations and recovery

The public API exposes no administrator route. Use the authenticated Cloudflare dashboard's **Durable Objects → Data Studio**, select the `Neighbourhood` namespace and object name `darecade-main-v1`, and review open reports with:

```sql
SELECT r.id, r.target, p.name, r.reason, r.created, r.status
FROM reports r JOIN players p ON p.id=r.target
WHERE r.status='open' ORDER BY r.created;
```

Data Studio requires Cloudflare editor access and audits queries. Restrict that access. Operator suspension can be applied by inserting the reviewed player ID into `suspensions`; account lookup then refuses that player and scoreboards omit them. Never perform blanket production deletes or copy unreviewed SQL containing private data into chat. The local `community-admin.mjs` operates **only on the local database**, not the hosted one.

Cloudflare's SQLite point-in-time recovery history can retain data for up to 30 days. Before restoring a snapshot, keep public access closed and reapply deletions/suspensions that occurred after the snapshot. Test recovery and erasure with synthetic accounts before inviting real users. Do not treat code deployment rollback as a data restore.

## Verified locally

The Cloudflare runtime test uses the same bundled Worker under Miniflare/workerd, with synthetic addresses and an intercepted email provider (no email leaves the test). It checks secure cookies, age/consent, atomic single-use login, newest avatar persistence through object eviction, all four replay-validated games, duplicate reward rejection, private feedback/export/deletion, cross-origin rejection, body-size limits, durable rate limits and fail-closed launch configuration. The original Node tests still exercise daily/weekly settlement, ties, challenge limits and local restart persistence.

## Official references checked 3 October 2026

- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/)
- [SQLite Durable Object transactions and recovery](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Location hints and their limits](https://developers.cloudflare.com/durable-objects/reference/data-location/)
- [Durable Objects free/paid quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Private Data Studio access](https://developers.cloudflare.com/durable-objects/observability/data-studio/)
