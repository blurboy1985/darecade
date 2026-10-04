# Accounts, progression and shared challenges

Implemented 3 October 2026 on the existing Node/SQLite service. The Cloudflare version is deployed at https://darecade.daniel-tianwen.workers.dev and moves to https://playsimi.danielquek.com (see HOSTING.md), with the historical account/email launch checks recorded in HOSTING.md. The multi-world changes require a separately approved deployment. The privacy/support contact is hello@darecade.danielquek.com, forwarding to the operator's verified inbox. The local service and its private data remain available. The existing cute Blender characters, outfits and interactions remain in use.

## Local run

Windows PowerShell, from the project folder:

```powershell
npm run build
npm test
npm start
```

Open http://127.0.0.1:4173. Node 25.7.0 was used for verification. The database is `data/neighbourhood.sqlite`, outside the public web root. Keep the server and its data folder available for all participating devices.

For phone testing, set `LAN_HOST` to the computer's current Wi-Fi IPv4 address and `PUBLIC_ORIGIN` to that same URL before starting. `.env.example` documents the configuration; a copied `.env` can be loaded with `node --env-file=.env server/index.mjs`. Do not commit credentials or send them through chat.

## Sign-in and recovery

Worlds share the same account, scores and privacy settings. Records remains `Neighbourhood` at `darecade-main-v1`; live rooms use the new SQLite `World` class, `WORLD` binding and additive `v2` migration. Joining automatically fills worlds to about 25 people. Use the top-bar Worlds button or More → Worlds & join friend to see counts, enter a room code such as W3, or join a visible neighbour up to the 30-player hard cap. The first Play still goes directly to the first game after consent.

Movement uses hibernating WebSockets with HTTP fallback. Worlds save away positions to Records every 30 seconds and on departure; empty worlds stop scheduling work and hibernate. Live messages contain only public avatar data. Email, consent, age band and session credentials never appear in world broadcasts. Switching rooms preserves progression and never bypasses bilateral blocks or suspensions.

The initial Free-plan estimate of roughly 100 player-hours/day assumes light use and needs a measured SQL/request budget. At 5 Hz, each player-hour alone costs about 900 Durable Object requests because 20 incoming WebSocket messages bill as one request. SQL history and HTTP fallback can reduce capacity. The 150-player load run with 20,000 stored runs exceeded the SQL budget when extrapolated to 100 player-hours; that target is not supported by this workload on Free. Workers Paid starts at US$5/month plus applicable overages; upgrading is the owner's decision. See [HOSTING.md](HOSTING.md#capacity-and-cost) for current official pricing links, quota caveats and the local load test.

1. A new player enters birth month/year, then reads the privacy notice. Nothing is written to the database before eligibility and explicit consent. Only the age band and consent version/time are retained.
2. A consenting guest can play and earn saved cosmetic progress. **More → Account & privacy** offers email account creation.
3. A random, single-use, six-digit email code verifies ownership and connects the existing guest avatar to the account. The player types it into the window they already have open; emails contain no link and nothing opens a second window. Codes expire after 15 minutes. The database stores only a hash of the code; sessions use HttpOnly, SameSite cookies. Production cookies require HTTPS.
   Saving never swaps the character being played. If the address already belongs to another character, the code is accepted but nothing changes: the dialog names that character and offers to keep the current one with a different email, or to sign in to the other. Only that explicit choice changes the session.
4. **I already have an account** emails a new code to recover the same avatar on another browser/device. There is no password to forget. The email form returns a generic response, including for unknown accounts. Addresses with no account receive a guidance email (no sign-in code, at most hourly, only a hash of the address is kept for one hour).
5. A new guest's first result leads with **Name & customise your character**: step 1 is the wardrobe with the nickname field open, step 2 is the email and code. Either step can be skipped; an account stays optional.

Code guessing is limited three ways. Five wrong tries retire a code. Fifteen wrong tries for one address within a day stop that address's codes from being sent or accepted until the day has passed; only a hash of the address is kept with the count. The existing per-client limits (6 email requests and 12 code checks per 15 minutes) still apply. A wrong code gets the same reply whether or not the address has an account. The daily limit means someone who knows a player's email could keep them from signing in for a day by guessing; it cannot give them the account.

Local default: `MAIL_MODE=outbox`. No external email is sent. The message is stored under `data/mail-outbox/` and is never served by HTTP. The operator can open the most recent test message locally and read its code; treat it as a private password. Consumed messages are removed. Use synthetic addresses for testing.

Configured delivery: `MAIL_MODE=resend`, `RESEND_API_KEY`, a verified `MAIL_FROM`, and `PUBLIC_ORIGIN` enable the [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email). The approved hosted delivery checks are recorded in HOSTING.md; local tests use an intercepted provider or private outbox. No Supabase service, domain or billable provider was created. Adding Supabase instead would be a separate account/data migration.

`NODE_ENV=production` refuses to start without HTTPS origin, email configuration, `PRIVACY_CONTACT`, and an accurate `STORAGE_NOTICE`. These checks do not replace a deployment/security review. The service binds localhost; use a reviewed HTTPS reverse proxy for public hosting. Configure trusted network routing and per-client rate limiting at that proxy before a public rollout.

## Progress and fairness

- The server saves avatar choices, cosmetic XP, unlocked hats, personal bests, first-round rewards, visits, the weekly coin hunt, gifts and mission claims. Browser storage is a display cache; editing XP or unlocks in a request cannot award them.
- Arcade rounds share a versioned simulation between browser and server. The server issues a seed and run ID, replays bounded 60 Hz input events, derives the score, checks ownership and elapsed time, and awards once. No raw score endpoint is exposed. All five games use this path. Coast Rush allows 7,200 ticks for three laps; the four existing games retain 3,600 ticks. Completed race times sort fastest first; incomplete races cannot rank.
- A first completed verified round grants the lilac cap and +35 bonus XP once, in addition to +20 round XP. Guest rounds earn cosmetics. A disconnected round can retry saving the identical result within its ten-minute reservation; offline-only rounds earn no saved rewards.
- Every round an email account finishes is ranked; there is no practice mode and no waiting period. Shared challenges open 24 hours after email verification; until then the challenge screens show the exact opening time and no daily count. This is a modest barrier to throwaway-account abuse, not proof of one human per account. Guest rounds save XP and personal bests but stay off the boards until the guest saves an account.
- Each day's regular rounds use the same seed for everyone; challenge rounds replay the host's seed. Every positive, verified score finished that day by an email account enters daily medals. At Singapore midnight, shared ranks earn gold +3, silver +2 and bronze +1; ties share rank and skip places (1, 1, 3). Maximum 15 medal points per player per day. No purchase or outfit improves scores.
- The weekly board sums that week's settled daily medals. It starts fresh Monday at 00:00 Asia/Singapore. Last week's results remain visible; lifetime medals and cosmetics stay saved. Today's medals are pending until midnight. There is no inactivity penalty or streak loss.
- A player may post three positive verified rounds per Singapore day. Posts last 24 hours. A challenger receives the host's exact seed and target score, even when the host is online. Resting/offline avatars can also be challenged against their validated personal best.
- Each challenger gets **three outgoing attempts per day**, to different neighbours across all games. Starting uses a slot, including abandoning. Each posted challenge gets at most one attempt per challenger, including across midnight. Incoming challenges are unlimited and never deduct the defender's points. Wins/draws are recorded separately, with no farmable extra medal points. Every verified round by an email account counts towards daily medals, including challenges with an older seed.

The outgoing limit retains the prior fairness revision: a receiver limit could let other players exhaust someone's three slots. Cosmetic exploration events are bounded and idempotent, but are not position-proofed by a server world simulation. Replay validation rejects impossible/altered scores; it does not prevent bots that generate valid inputs, account sharing, or all forms of collusion. Do not attach cash prizes without stronger abuse controls and review.

## Privacy and operations

- Under-13 or declined-consent requests create no profile/account. This is self-declared age screening, not age verification. No date of birth is retained or logged by this application.
- Public: player-chosen nickname, avatar preferences, activity, positions, scores and challenges. Private: email, age band, consent and reports. No free-text chat, photos, advertising tracker, purchases or marketing. Players are asked not to use real names or contact details; nickname moderation remains necessary.
- **Account & privacy** provides data download, sign-out, and explicit **DELETE** confirmation for consent withdrawal/erasure. Deletion disconnects the player from their world, removes their directory membership, revokes all sessions, removes owned scores/challenges/medals/reports/feedback, removes pending links for the email, and anonymizes references in other players' rounds.
- Raw game-input replays expire after 30 days. Inactive profiles expire after 12 calendar months. Expired sessions and magic links are cleaned up while the server is running. Offline backups require a separate retention and erasure process; see `PRIVACY-REVIEW.md`.
- Reports immediately refresh live block lists and hide both players from each other in movement snapshots, room neighbour lists and challenges. Room codes cannot bypass the filter. They do not automatically punish the reported account. The operator reviews them locally. There is no exposed administrative HTTP API.

Operator commands, **Windows PowerShell**:

```powershell
node scripts/community-admin.mjs reports
node scripts/community-admin.mjs suspend PLAYER_ID
node scripts/community-admin.mjs resolve-report REPORT_ID
node scripts/community-admin.mjs restore PLAYER_ID
# Only after confirming the correct player and reason:
node scripts/community-admin.mjs delete-player PLAYER_ID --confirm-delete
```

Suspending revokes access and removes the player from visible/ranked competition. Confirmed under-age accounts can be erased by the operator. Historical awarded medals are not automatically redistributed; resolve confirmed cheating with an explicit, reviewed correction rather than silently rewriting past results. Restored email accounts can request a new code.

## Migration and verification

Existing eligible guests can retain their preset nickname and saved look through the old cookie. Their prior browser save is archived once as `darecade-preview-backup` on that device. Old browser-only XP/bests are not trusted inputs to the new server progression or competitive board; new verified progression starts fresh. Historical lifetime medals stay in the database. Weekly results begin at the verified-rules cutover. Signing out/deleting clears the local profile cache and archive.

`tests/community.test.ts` covers age/consent, email codes and their guess limits, persistence, spoofed results, duplicate awards, warmup, same-level challenges, attempt limits, weekly rollover, reports, erasure and retention. All browser test accounts and time adjustments use isolated `.browser/account-data`, never the real neighbourhood database. See `QA.md` for observed browser results and remaining physical-device/production checks.

Source: `server/community.mjs` (accounts/progression/challenges/privacy), `server/store.mjs` (SQLite/presence/medals), `shared/simulation.ts` (verified game rules), `src/account.ts` (welcome/privacy/account screens), `src/games.ts` (fixed-step input recording), `src/main.ts` (lobby integration).

Coast Rush version 2 records personal best time and place from server replay. Old two-lap runs and earned medals are retained; old race targets are excluded from the new format. See [COAST-RUSH.md](COAST-RUSH.md) for cutover behaviour. A new guest's first result leads into naming, dressing and saving the character; later new-best results can open the same optional email form.
