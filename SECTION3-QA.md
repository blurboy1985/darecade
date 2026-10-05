# Section 3: guest retention

Dependency: draft PR31, exact head `5203feae71642cdcf1ba64b230fa10da7036d3ea` (which depends on PR30).
Branch: `codex/section3-guest-retention`, stacked on `codex/section2-first-minute`.

## Reward decision

Daniel approved separate **Play medal points**, capped at three per Singapore day, once per game, for both guests and accounts. Existing ranked medals also generate Style tokens; putting completion awards into that ledger would change the economy. Play medals have their own server ledger and never affect ranks, ranked medals, XP, tokens or cosmetic ownership. Existing content continues to grant its established XP independently.

Only new, qualifying, server-replayed finishes count. There is no retrospective award or client-imported balance. The same transaction saves the validated round and award. Identical retries return the same result; changed retries are rejected. The per-player/day/game key, unique run and transaction enforce the caps. The existing export and deletion paths include the new records; no real player data was deleted during this work.

Qualifying finishes:

- Noodle Run / Hop Hop: positive score, at least 15 simulation seconds.
- Brick Bash: positive score, at least 15 seconds, controlled paddle movement in at least three distinct simulation seconds.
- Star Swarm: positive score, at least 15 seconds, controlled movement in at least ten distinct simulation seconds. Idle shooting, unused keys and holding against a wall do not qualify.
- Coast Rush: finish all three laps.
- Fishing: finish the round with a catch.
- Hoops: finish all ten shots, deliberately take at least three and make at least one. Expired shot clocks are not deliberate attempts.

Open Stage currently submits a score/stars report with a cooldown, rather than a deterministic replay. It keeps its existing XP and is explicitly excluded from Play medals. No unverified stage report can mint the new points.

## Baseline

3D guests already see actual players and can send all six emotes through the existing privacy-filtered world. Emotes were buried under Challenges & ranks. The 2D emote button only showed a toast: with no active world, it never broadcast an emote. The new 2D path now uses the same allowlisted world protocol and expires its emote after four seconds.

Actual Hoops browser play also exposed a dropped-input bug: a press and release between animation frames disappeared before the simulation sampled it. The corrected input latch retains one press until a simulation tick, preserves Fishing holds, and cancels unfinished input on cancellation/pause/background. This support fix is included because it directly blocked qualifying guest play.

## What changed and how to check it

Use the local branch or a separately authorized preview. Keep existing player saves; use synthetic local guest/account fixtures.

| Change | Browser steps and expected result | Verification |
| --- | --- | --- |
| Guest social access | Menu → Friends exposes Neighbours, Emotes and Worlds & scores. With another actual guest connected, Neighbours lists them under Players. Example residents are labelled separately. Choose an emote without adding email. | Existing guest and a second synthetic local protocol participant used. Guest roster showed the actual online neighbour; no account prompt appeared. |
| 2D emotes | Settings → Preferences → Use 2D. Menu → Friends → Emotes → Hello, neighbour. Another participant in the same world receives the wave, then it clears. Both emote pages remain available. | Browser-selected wave reached the second local guest as protocol emote 1, followed by 0. Server allowlist, rate limits, bilateral blocks and privacy rules remain unchanged. |
| Daily completion goal | Menu → Friends → Worlds & scores → Rankings. Read today’s Play medal progress and expand Which finishes count. Ranked standings remain available in a separate disclosure for guests. | Browser rendering checked; deterministic replay fixtures cover all seven games and reject idle/insufficient play. |
| Earn and retain points | Complete one qualifying game. The result shows +1 Play medal point; reopen Rankings or reload to see it retained. Repeat that game today: it says already collected. Complete two other qualifying games: stop at 3/3. After midnight Singapore time, today resets while all-time points remain. | Real finish, cap, retries, forged scores, elapsed-time validation, rollback, next-day reset, account linking and restart are covered by integration tests. Browser: a local guest Hoops round made 2 baskets from 4 deliberate attempts, earned +1 point, and retained 1/3 today and 1 all time after reload. The preceding zero-basket round earned no Play medal. |
| Reliable quick taps | In Hoops, tap SHOOT briefly. Each completed tap records one shot. Holding does not auto-fire. In Fishing, quick CAST works and holding still reels. Pause/cancel/background cannot leave a queued shot. | Real-class/real-loop tests cover pointer and keyboard edges, holds, pause, cancellation and replay recording. |
| Honest save copy | Rankings → How guest progress is saved, or Account & privacy → Your guest progress. Read what is already saved and what email adds. Optional email entry can be closed without sending. | Copy states server profile + browser session/local preferences; cookie clearing, sign-out and 30-day session expiry can lose guest access. Linking an unused email retains that identity; existing-account conflicts offer a switch, not a merge. No real emails/accounts were created. |

## Validation and limits

- Production build passed.
- `npm test`: 325 total, 316 passed, 9 browser-only skips, zero failures.
- Cloudflare dry-run bundle and all 12 Miniflare checks passed, including capped points, duplicate finishes and unchanged token balances.
- Independent review cleared the ledger, privacy/account behavior, SGT day rollover and input handling after fixes for stale poll/profile responses and touch release ordering.
- Browser: guest roster, actual 2D wave receipt/expiry, qualifying Hoops award, persisted daily goal, optional email flow and 390×844 layout verified. Screenshots: task `section3-evidence/guest-hoops-medal.jpg` and `daily-goal-phone.jpg`.
- Guest linking/conflict, rollback, cap, exact SGT boundary, reset and privacy checks use synthetic tests. Real emails, physical phones, native OS background and a second same-day qualifying browser run were not exercised.
- `git diff --check` passed.

 Browser tests use the supported in-app browser; physical device touch and native OS backgrounding are not claimed. No merge/deploy occurred, seasons remain disabled, and age/privacy rules were preserved.
