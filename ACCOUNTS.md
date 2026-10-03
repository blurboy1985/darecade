# Accounts, progression and shared dares

Implemented 3 October 2026 on the existing Node/SQLite service. The Cloudflare version is deployed at https://darecade.daniel-tianwen.workers.dev (see HOSTING.md), with accounts and gameplay closed pending outgoing sign-in email setup. The privacy/support contact is hello@darecade.danielquek.com, forwarding to the operator's verified inbox. The local service and its private data remain available. The existing cute Blender characters, outfits and interactions remain in use.

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

1. A new player enters birth month/year, then reads the privacy notice. Nothing is written to the database before eligibility and explicit consent. Only the age band and consent version/time are retained.
2. A consenting guest can play and earn saved cosmetic progress. **More → Account & privacy** offers email account creation.
3. A random, single-use email link verifies ownership and connects the existing guest avatar to the account. Links expire after 15 minutes. The database stores token hashes; sessions use HttpOnly, SameSite cookies. Production cookies require HTTPS.
4. **I already have an account** sends a new link to recover the same avatar on another browser/device. There is no password to forget. The email form returns a generic response, including for unknown accounts.

Local default: `MAIL_MODE=outbox`. No external email is sent. The message is stored under `data/mail-outbox/` and is never served by HTTP. The operator can open the most recent test message locally and use its URL; treat it as a private password. Consumed messages are removed. Use synthetic addresses for testing.

Configured delivery: `MAIL_MODE=resend`, `RESEND_API_KEY`, a verified `MAIL_FROM`, and `PUBLIC_ORIGIN` enable the [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email). External delivery has **not** been tested in this environment. No Supabase service, domain or billable provider was created. Adding Supabase instead would be a separate account/data migration.

`NODE_ENV=production` refuses to start without HTTPS origin, email configuration, `PRIVACY_CONTACT`, and an accurate `STORAGE_NOTICE`. These checks do not replace a deployment/security review. The service binds localhost; use a reviewed HTTPS reverse proxy for public hosting. Configure trusted network routing and per-client rate limiting at that proxy before a public rollout.

## Progress and fairness

- The server saves avatar choices, cosmetic XP, unlocked hats, personal bests, first-round rewards, visits, the weekly coin hunt, gifts and mission claims. Browser storage is a display cache; editing XP or unlocks in a request cannot award them.
- Arcade rounds share a versioned simulation between browser and server. The server issues a seed and run ID, replays bounded 60 Hz input events, derives the score, checks ownership and elapsed time, and awards once. No raw score endpoint is exposed. All five games use this path. Coast Rush allows 7,200 ticks for two laps; the four existing games retain 3,600 ticks. Completed race times sort fastest first; incomplete races cannot rank.
- A first completed verified round grants the lilac cap and +35 bonus XP once, in addition to +20 round XP. Guest/practice rounds earn cosmetics. A disconnected round can retry saving the identical result within its ten-minute reservation; offline-only practice earns no saved rewards.
- Accounts enter ranked play and shared dares 24 hours after email verification. This is a modest barrier to throwaway-account abuse, not proof of one human per account.
- Each day's ranked game uses the same seed for everyone. Only positive, verified scores on that day's seed from eligible accounts enter daily medals. At Singapore midnight, shared ranks earn gold +3, silver +2 and bronze +1; ties share rank and skip places (1, 1, 3). Maximum 15 medal points per player per day. No purchase or outfit improves scores.
- The weekly board sums that week's settled daily medals. It starts fresh Monday at 00:00 Asia/Singapore. Last week's results remain visible; lifetime medals and cosmetics stay saved. Today's medals are pending until midnight. There is no inactivity penalty or streak loss.
- A player may post three positive verified rounds per Singapore day. Posts last 24 hours. A challenger receives the host's exact seed and target score, even when the host is online. Resting/offline avatars can also be challenged against their validated personal best.
- Each challenger gets **three outgoing attempts per day**, to different neighbours across all games. Starting uses a slot, including abandoning. Each posted dare gets at most one attempt per challenger, including across midnight. Incoming dares are unlimited and never deduct the defender's points. Wins/draws are recorded separately, with no farmable extra medal points. A dare only affects daily medals if its seed matches today's ranked seed.

The outgoing limit retains the prior fairness revision: a receiver limit could let other players exhaust someone's three slots. Cosmetic exploration events are bounded and idempotent, but are not position-proofed by a server world simulation. Replay validation rejects impossible/altered scores; it does not prevent bots that generate valid inputs, account sharing, or all forms of collusion. Do not attach cash prizes without stronger abuse controls and review.

## Privacy and operations

- Under-13 or declined-consent requests create no profile/account. This is self-declared age screening, not age verification. No date of birth is retained or logged by this application.
- Public: player-chosen nickname, avatar preferences, activity, positions, scores and dares. Private: email, age band, consent and reports. No free-text chat, photos, advertising tracker, purchases or marketing. Players are asked not to use real names or contact details; nickname moderation remains necessary.
- **Account & privacy** provides data download, sign-out, and explicit **DELETE** confirmation for consent withdrawal/erasure. Deletion revokes all sessions, removes owned scores/dares/medals/reports/feedback, removes pending links for the email, and anonymizes references in other players' rounds.
- Raw game-input replays expire after 30 days. Inactive profiles expire after 12 calendar months. Expired sessions and magic links are cleaned up while the server is running. Offline backups require a separate retention and erasure process; see `PRIVACY-REVIEW.md`.
- Reports immediately hide the player from the reporter and prevent mutual challenges. They do not automatically punish the reported account. The operator reviews them locally. There is no exposed administrative HTTP API.

Operator commands, **Windows PowerShell**:

```powershell
node scripts/community-admin.mjs reports
node scripts/community-admin.mjs suspend PLAYER_ID
node scripts/community-admin.mjs resolve-report REPORT_ID
node scripts/community-admin.mjs restore PLAYER_ID
# Only after confirming the correct player and reason:
node scripts/community-admin.mjs delete-player PLAYER_ID --confirm-delete
```

Suspending revokes access and removes the player from visible/ranked competition. Confirmed under-age accounts can be erased by the operator. Historical awarded medals are not automatically redistributed; resolve confirmed cheating with an explicit, reviewed correction rather than silently rewriting past results. Restored email accounts can request a new link.

## Migration and verification

Existing eligible guests can retain their preset nickname and saved look through the old cookie. Their prior browser save is archived once as `darecade-preview-backup` on that device. Old browser-only XP/bests are not trusted inputs to the new server progression or competitive board; new verified progression starts fresh. Historical lifetime medals stay in the database. Weekly results begin at the verified-rules cutover. Signing out/deleting clears the local profile cache and archive.

`tests/community.test.ts` covers age/consent, links, persistence, spoofed results, duplicate awards, warmup, same-level dares, attempt limits, weekly rollover, reports, erasure and retention. All browser test accounts and time adjustments use isolated `.browser/account-data`, never the real neighbourhood database. See `QA.md` for observed browser results and remaining physical-device/production checks.

Source: `server/community.mjs` (accounts/progression/dares/privacy), `server/store.mjs` (SQLite/presence/medals), `shared/simulation.ts` (verified game rules), `src/account.ts` (welcome/privacy/account screens), `src/games.ts` (fixed-step input recording), `src/main.ts` (lobby integration).
