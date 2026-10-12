# Competition seasons

This feature is disabled by default. The checked-in configuration is `COMPETITION_SEASONS="[]"` and `SEASON_VIEW="false"`. Deploying the default code adds two empty tables and starts no season. It does not remove or rewrite existing accounts, sessions, scores, lifetime XP, levels, tokens, ownership, medals, settlement markers or orders. Normal retention and player-requested erasure still apply.

## Schedule before the boundary

A season needs a unique ID, a short name and a future Monday at midnight Singapore time. An example for a rollout approved before 12 October 2026 is:

```json
[
  {
    "id": "opening-2026",
    "name": "Opening season",
    "startsAt": "2026-10-12T00:00:00+08:00"
  }
]
```

This example is documentation only; it is not in the active configuration. Choose a later Monday if that date has passed. For Node, set `COMPETITION_SEASONS` to the JSON array in the environment. For Workers, set the same non-secret string in `wrangler.jsonc` or the deployment configuration. Set `SEASON_VIEW="true"` to display the active season. No new credential, admin endpoint or email configuration is involved.

Registration happens when Records constructs `CommunityCore`, not when the Worker version is uploaded. During an approved rollout, deploy and let an ordinary Records request construct the object **before** the boundary, and verify that registration succeeded. Do not assume a sleeping object registered the schedule. Late new registrations reject with an error instead of inventing historical seasonal XP. Register well ahead of the date, so this can be checked before the season begins.

The database records the schedule once. Repeating it is safe. Registered IDs, names and start times are immutable; subsequent seasons must append a future Monday strictly after the last registered start. Omitted definitions remain saved. The next registered start closes the preceding interval; all intervals include their start and exclude their end. At most 64 seasons are supported. No catch-up or backdating switch exists. An approved schedule is durable and cannot be cancelled by simply removing its environment value; correct a mistaken registration before rollout by reverting the unactivated isolated test database, or design a separate reviewed cancellation workflow. Do not edit live schedule rows as an ad hoc reset.

## Player experience

With the view enabled, Rankings opens the current season's medal standings. Show retains Today's scores and Weekly medals and adds past seasons. Season medals and Season XP begin at zero. Unranked players have no rank. Daily scores can rank immediately, while season medal points arrive when the ordinary daily awards settle. Guests earn seasonal XP but still need an email account to rank. Names and visibility continue to respect blocking and suspension.

Season standings sum existing daily medals whose Singapore award dates fall inside the interval. There is no second reward pool or end-of-season prize. Sunday awards at a Monday boundary belong to the preceding week/season, including when settled late. Daily ties, the 3/2/1 medal rule, Coast replay formats and the 3-token daily medal cap retain their existing behavior. The historical settlement query never receives a season display filter.

Lifetime XP remains the source for level and XP tokens. Each trusted positive XP delta also increments a separate `season_xp` row in the same progression transaction. A player with 250 lifetime XP keeps Level 3 and starts at 0 Season XP. Earning 60 XP produces 310 lifetime XP and 60 Season XP, with only the normal token for crossing lifetime XP 300. Crossing 100 Season XP awards no additional token. This covers regular rounds, gifts, missions, exploration, stage, garden and both sides of an invite bonus, including an offline inviter. Cosmetic changes and payment reconciliation add no seasonal XP.

First-round gifts, missions, visits, invite rewards and weekly hunt limits are not reset. Equipped, unlocked and purchased looks, wallet spending, lifetime personal bests and Coast records remain saved. Lifetime totals and game-card personal bests remain accessible; past seasonal XP is available in Show and private data export. Raw replays expire after 30 days and inactive profiles after one calendar year under the existing policy.

## Challenges and boundary rounds

New challenge target selection uses only eligible current-format runs finished on or after the current season's start. The server enforces this for automatic friend bests, explicit run IDs and legacy posted dares. Public friend/neighbour target cards use the same scope, even if the season view is hidden. Historical bests stay readable but cannot be resubmitted as fresh targets. Previously attempted run IDs and the three outgoing starts per Singapore day remain unchanged.

A valid reserved round begun before midnight may finish after it. It enters the new day/season by its first server finish time, matching existing daily admission. Its seed, frozen target run and target score stay unchanged. This also allows an already-started historical challenge to finish during the reservation's original ten-minute window. It can enter the new day's board using its frozen older seed, as existing midnight behavior allows; strict start-time admission would require a separate reward-policy change. Identical finish retries keep the original finish time and award no additional XP. No run is expired merely to clear a season.

## Rollback and concurrency

Set `SEASON_VIEW="false"` and deploy schema-compatible code to restore the weekly view. Keep the tracking code running; counters and new results stay saved while hidden. New competitive challenge targets still obey the current period, so hiding the UI cannot bypass it. Re-enable the view to recover the same totals. Do not restore the whole Records database, remove registered seasons, clear reward ledgers or change `darecade-main-v1`, bindings or namespaces.

Rolling back to code that predates XP tracking would leave missing seasonal XP. The existing database lacks a complete timestamped ledger of all lifetime XP sources, so those gaps cannot be reconstructed accurately. Restore only the display/configuration using this compatible version. Mixed old/new application versions during a rollout have the same limitation; complete the deployment and confirm Records registration before the future boundary. A schedule/configuration rollback cannot cancel an already registered boundary.

XP accounting uses the existing synchronous transaction with lifetime progress and token notices. The existing single Records object still coordinates all rooms. The snapshot cache includes the active target boundary and invalidates immediately at season transition. Season medal aggregates cache against the existing database snapshot revision. Responses copy cached rows before returning them, so one caller cannot mutate another caller's standings. Existing settlement identities, token ledgers and mail outbox leases are untouched.

## Verification

Run `npm run build`, `npm test`, and `npm run test:cloudflare` against local isolated data. For the repeatable responsive season/history/account smoke check, set `DARECADE_TEST_CHROMIUM` to a dedicated headless Chrome executable or the repository's macOS wrapper and run `node --test tests/seasons-browser.test.ts` after building. No fixture calls a real mail or payment provider.

`tests/seasons.test.ts` covers future-only registration, preservation of identity/progress/orders/history, lifetime-vs-season token thresholds, old target routes, frozen in-flight challenges/retries, Singapore Monday boundaries, tied medals, token caps, rollback, offline invite XP, archived transitions, export/normal erasure and transaction failure. The Cloudflare season fixture exercises real Durable Object SQLite transactions and concurrent progression requests. Browser fixtures exercise the built UI at narrow phone and desktop sizes, including archived selection, lifetime wallet/level and display rollback. Physical-device testing remains a rollout check.

Local verification on 5 October 2026 passed the build, all 285 regression tests with browser checks enabled, and all 12 Cloudflare integration tests using local Miniflare. The responsive season flow passed at 320, 390 and 1440 pixels, with no horizontal overflow. The existing 1,000-player/20,000-run fixture rebuilt snapshots in 53–57 ms and returned cached personal state at 1.22 ms p95. These checks used synthetic profiles and local provider stubs; no production season was registered or activated.
