# Cloudflare hosting

Opened 3 October 2026 at **https://darecade.daniel-tianwen.workers.dev** on the account's existing Workers Free plan. **Gameplay and accounts are enabled** (`LAUNCH_READY=true`) with a verified sending identity and private Resend secret. Worker version: `b4d4835f-7789-4099-89eb-2e52b529f4fb`. The privacy/support contact is `hello@darecade.danielquek.com`. Wrangler authorization is verified with account/user read, Workers Scripts Write and background access only. No paid upgrade has been made.

Free Cloudflare Email Routing is enabled for the domain and the `darecade` subdomain. The literal rule `hello@darecade.danielquek.com` is active and forwards to the operator's verified Gmail destination. Catch-all remains disabled. Authoritative DNS and the 1.1.1.1 resolver return the three Cloudflare MX records. The operator confirmed receipt of the approved sign-in test message in Gmail and successfully opened the neighbourhood from its link. This is incoming forwarding, not a separate mailbox or outgoing SMTP setup; ordinary replies from Gmail use the Gmail address until a separate authenticated sending configuration is added.

Pre-opening checks confirmed HTTPS HTML and the 3,296,036-byte character model returned 200, static security headers were present, the closed launch returned 503, and private database/server paths returned 404. After opening, health/config returned 200, unauthenticated neighbourhood access returned 401, and the browser displayed the birth-month/year gate. An isolated live test verified age and consent rejection, secure cookies, avatar persistence, a replay-validated practice round, duplicate-reward protection, tampered-result rejection, weekly-board access, own-data export, profile erasure and session revocation. That gameplay fixture was deleted; it never qualified for medals. No local profiles were uploaded. Current live physical-iPhone verification remains pending.

## Coast Rush deployment, 3 October 2026

Fast-forwarded `codex/coast-rush-grand-prix` into `main` at `8df18e2`, pushed to GitHub and deployed Worker version `b4d4835f-7789-4099-89eb-2e52b529f4fb`. This publishes the three-lap, eight-kart race and first-visit flow, including the corrected keyboard/touch steering and independent tyre rolling/steering pivots.

All **65 Node tests and three Cloudflare integration tests passed**, together with the production build and deployment dry-run. The existing bundle-size warning remains. Live `/api/health` returned `ready: true`, and the public HTML referenced the expected `index-CjZeC_gw.js` build. The live browser passed the age/privacy gates, opened Coast Rush through Play now, rendered all eight karts, and confirmed corrected A/D steering and pause. Existing account storage, the Durable Object identity, secrets, Wrangler variables and privacy version are unchanged. Historical two-lap results are preserved separately from the new race format.

The isolated live guest finished **1st/8 in 46.78s with 17 shells**, and the server verified the practice result. The cap reward and new-best result appeared; Another round reopened the race without a reload. The browser automation connection needed a reconnect during the run, but the race completed. The temporary guest profile was then deleted successfully, and its session returned 401. No real email was sent and no test score entered the ranked boards.

## Login email fix deployment, 3 October 2026

Merged `claude/fix-login-email` without conflicts in `9292e35` and deployed Worker version `323a512c-9c50-471b-abe8-2fabbc4a1a73`. All 57 Node tests, three Cloudflare integration tests and the production build passed. The deployed health endpoint returns `ready: true`. Resend secrets, Wrangler variables, rate limits and `PRIVACY_VERSION` are unchanged.

Exactly three live emails were approved and confirmed in the operator's Gmail Inbox: guidance at 21:31 SGT, account verification at 21:34 SGT and a fresh sign-in link at 21:35 SGT. The guidance arrived within seconds and contains no `#login=` token. The operator completed account creation in their own browser and confirmed successful sign-in using the latest email. Later attempts to reuse the links returned the expected invalid/expired message; no fourth email was sent. Separate local browser checks verified that recovery restores the same player ID and avatar. No replacement production avatar was created by the agent.

## What runs where

### Resend setup, 3 October 2026

The owned sending domain `darecade.danielquek.com` is verified in Resend's Tokyo (`ap-northeast-1`) region. Its DKIM TXT record and the DNS-only `rsend.darecade` and `send.darecade` CNAMEs resolve publicly. Sending is enabled, receiving remains disabled, and TLS is enforced. Tracking has not been configured. Existing Cloudflare incoming forwarding is preserved.

The sender is `Darecade <hello@darecade.danielquek.com>`. The user created and entered the prepared domain-restricted sending key directly into the production Worker secret `RESEND_API_KEY`; secret metadata was verified without revealing its value. Exactly one approved sign-in email was sent to the support alias, and Resend reports Delivered. The operator confirmed Gmail receipt and successful sign-in. The signed-in `Mail Check` profile is retained for the operator; it has no seeded scores or medals. The pre-verification guest session was revoked by account creation, and the local test-session credential was discarded. The key is absent from source control and browser assets.

- Cloudflare Workers Static Assets delivers the built game, fonts and Blender models from `dist/` over HTTPS.
- Records, the existing SQLite Durable Object class `Neighbourhood` at `darecade-main-v1`, holds accounts, profiles, runs, medals, dares, reports, blocks and suspensions. The new SQLite class `World` holds each live room. It requests Southeast Asia placement. This is a latency hint, **not a Singapore residency guarantee**.
- The original game/account rules are shared with the local Node server in `server/store-core.mjs` and `server/community-core.mjs`. `server/store.mjs` and `server/community.mjs` retain local SQLite/filesystem adapters, so existing local data and commands keep working.
- Database transactions preserve one-time rewards and challenge limits. A daily Durable Object alarm awards Singapore-midnight medals and performs retention cleanup even when nobody is online. Requests also catch up missed medal settlements.
- Resend delivers account sign-in emails. No local email outbox is available in the hosted game. `RESEND_API_KEY` is a Worker secret, never a browser asset or tracked configuration.
- Private request limits use salted IP hashes in the database, shared across edge locations and retained through object eviction. Raw IP addresses are not stored by this application. Expired buckets are removed by daily cleanup (within approximately 24 hours). Cloudflare/provider infrastructure logs have their own policies.

The scaling code described below is ready for review separately from the historical deployments above. Merging a PR does not deploy it. Local test accounts are never copied to the cloud.

## Multi-world scaling

### Architecture and migration

Keep the existing `v1` migration, `Neighbourhood` class, and object name `darecade-main-v1`. The `WORLD` binding points to the new `World` class with migration `{"tag":"v2","new_sqlite_classes":["World"]}`. Rooms use `WORLD.idFromName("world-1")`, `world-2`, and so on. Never replace the Records namespace to install this release.

Records computes shared boards, weekly results, dares and public cards in a 30-second memory cache, invalidated by completed rounds, posted dares, settlement and suspensions. Clients fetch their personal state every 30 seconds and on panel/game events. The Worker validates session cookies through Records before forwarding a WebSocket upgrade, replacing internal identity headers. Worlds retain public movement in hibernating sockets, send compact changed-player snapshots up to five times per second, and save position/activity to Records every 30 seconds and on departure. Each World reports occupancy every 10 seconds while occupied.

Auto-join chooses the fullest available world below 25 players; manual room codes and Join friend can fill its remaining places up to the hard cap of 30. The destination enforces the cap even when directory counts are stale. Worlds are created on demand. Empty worlds have no recurring alarm or movement timer and can hibernate with no active compute charge. A small stored metadata footprint remains subject to storage quotas. The Worlds panel and top-bar room code do not add a step before the first game.

Blocked pairs never receive each other's live or saved public cards, and the directory does not reveal a blocked player's room. Reports refresh affected worlds immediately. Suspension and session validity are refreshed within 30 seconds; new joins reject suspended players. Profile deletion and logout disconnect the live player before removing their identity/session. Away neighbours remain static between state refreshes. Node preview implements the same room selection and privacy rules over HTTP polling.

### Capacity and cost

The capacity target is about **25 players per world**, not 25 players for the whole service. Free supports SQLite Durable Objects and hibernating WebSockets. As checked on 4 October 2026, Free allows 100,000 Durable Object billable requests, 13,000 GB-s of active duration, 5 million SQL rows read and 100,000 rows written per day, with 5 GB stored across objects. Free quotas are shared across the account and reset at 00:00 UTC, or 08:00 Singapore time; exceeding one causes affected operations to fail until reset. Ordinary Worker requests have their own daily allowance. [Cloudflare quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/)

Cloudflare bills **20 incoming WebSocket messages as one Durable Object request**. The initial connection, HTTP calls, RPC calls and alarms also count; outgoing WebSocket messages do not. At continuous 5 Hz movement, one player-hour produces 18,000 messages, or 900 billable requests before those other calls. Worlds hibernate when idle, but sustained movement keeps them active. [WebSocket billing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

The initial planning estimate was roughly **100 player-hours/day** on Free, meaning 100 people for an hour or 25 people for four hours. Treat that as an optimistic light-use estimate, not a tested allowance. Continuous movement alone would use about 90,000 requests at that volume, before state reads and coordination. Snapshot rebuilds scan stored runs, so SQL reads can become the first limit as history grows. Use the local measurements below and hosted account usage to establish a safe operating budget.

Workers Paid starts at **US$5/month** and includes larger monthly allowances, with additional usage billed beyond them. It is not a fixed $5 spending cap. Upgrading is the owner's decision; this code neither enables Paid nor changes billing, secrets or production deployment. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

### Local load test

Windows PowerShell, from the repository root:

```powershell
npm ci
npm run build
npm run load:test
# Short diagnostic run, not the acceptance load:
npm run load:test -- --players 3 --seconds 5
```

The test starts its own `wrangler dev --local` on loopback port 8799, with inspector port 9249. It uses `scripts/wrangler.load.jsonc`, a separate Worker name, disposable `.browser/load-*/state` storage, synthetic email accounts and no production bindings. The fixture is not imported into the deployed Worker. It refuses non-loopback requests and the runner accepts no target URL or remote flag. Never deploy the fixture or run load traffic against production. `ws` is a development dependency only.

The default run seeds 1,000 accounts and 20,000 runs, joins 150 players automatically across worlds, moves each at 5 Hz for five minutes, requests state every 30 seconds, and submits three actual replay-validated rounds after their required elapsed time. Seeding bypasses the public join rate limit without changing that limit in the application; it sends no email. Setup is excluded from the steady-state measurements. The fixture remains on disk for inspection and is not reused by subsequent runs.

Each run writes `report.json`, `records.cpuprofile` and `wrangler.log` under its evidence directory. The report includes connections, both message rates, errors, p95 snapshot interval/size, state wall latency, completed rounds, Records HTTP/RPC counts and SQL cursor rows read/written. SQL counters cover Records queries; they exclude World KV/alarm writes and are a lower bound on total storage usage. CPU is a **local 1 ms DevTools sampling estimate attributed to Records stacks**, divided by Records invocations. Sample count is used because workerd's sample time gaps can include idle time. It is not a per-request percentile or Cloudflare billed CPU measurement. Physical phone performance, WAN jitter, hosted CPU and billing still require separate verification.

#### Measured on 4 October 2026, 06:30 SGT

The five-minute local run used 150 players in six worlds of 25, with 1,000 registered accounts and 20,000 stored runs. All 150 stayed connected, no errors occurred, and three submitted rounds passed replay validation.

| Measurement | Result |
| --- | ---: |
| Incoming movement messages | 224,250 total, 747.46/s |
| Outgoing snapshots | 217,100 total, 723.63/s |
| Snapshot interval p95 / maximum | 213.59 / 409.45 ms |
| Snapshot size p95 | 641 bytes |
| State requests / p95 wall latency | 1,501 / 20.74 ms |
| Records invocations including RPC | 1,807 |
| Estimated local Records CPU per invocation | 0.705 ms mean, 1,274 attributed samples |
| Records SQL rows read / written | 3,358,227 / 16,898 |

This is 12.5 player-hours of continuous movement. Eight repeats of this same workload, equivalent to 100 player-hours, would read about **26.9 million rows** and write **135,184 rows in Records alone**. That exceeds Free's 5 million daily reads and 100,000 writes before counting World storage. The original 100 player-hours/day Free estimate is therefore **not supported for this stored history and workload**. Fewer stored runs and a different activity mix change the result; a smaller pilot needs its own usage budget. For sustained public use at this level, consider Workers Paid or further reductions in database reads. The owner must approve any upgrade.

The corresponding Node benchmark measured cached-state p95 1.05 ms and full rebuilds of 35.77–46.58 ms. The earlier hosted PR A CPU check measured cached state/presence at 1–3 ms and rebuilds at 53–75 ms. These are separate measurements; the local load sample does not prove hosted CPU, physical iPhone rendering, or internet network performance. Neither the load run nor this PR deploys scaling code.

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

The Cloudflare runtime test uses the same bundled Worker under Miniflare/workerd, with synthetic addresses and an intercepted email provider (no email leaves the test). It checks secure cookies, age/consent, atomic single-use login, newest avatar persistence through object eviction, all five replay-validated games, duplicate reward rejection, private feedback/export/deletion, cross-origin rejection, body-size limits, durable rate limits and fail-closed launch configuration. The original Node tests still exercise daily/weekly settlement, ties, challenge limits and local restart persistence.

## Official references checked 4 October 2026

- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/)
- [SQLite Durable Object transactions and recovery](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Location hints and their limits](https://developers.cloudflare.com/durable-objects/reference/data-location/)
- [Durable Objects free/paid quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Private Data Studio access](https://developers.cloudflare.com/durable-objects/observability/data-studio/)
