# Two retention loops — 4 October 2026

Branch `retention-ghost-daily-dare`, from `origin/main`. No schema change, no rules-version change, no player data or personal bests touched.

## 1. Neighbourhood ghost (Coast Rush)

- The server names the ghost when a race starts: the player's most recent finished three-lap time, or a fixed beatable 1:45.00 neighbourhood ghost before their first finish. It is read from saved runs, so a missed day, a DNF or a dare changes nothing. No streak.
- The race cover names the ghost, the minimap shows it at even pace, and the result shows the gap.

## 2. One dare a day

- The 24-hour account hold goes. A player who has finished one verified round may start one dare per Singapore day and post one round per day.
- Dare screens show a Play dare button only when it can be played; otherwise they say why.
- The latest dare result, given and received, is shown on Rankings and on Dares.

## Steps

1. `shared/racing.ts`, `server/community-core.mjs`, `server/store-core.mjs`: ghost on `begin`, dare gate and limits, day on dare history.
2. `src/race-results.ts`, `src/racing-game.ts`: ghost gap, cover line, minimap marker.
3. `src/dares.ts` (new, pure) and `src/main.ts`: gate, targets, result card, screens.
4. Tests: update the three-dare and 24-hour tests; add `tests/retention.test.ts`.
5. `ACCOUNTS.md`, `COAST-RUSH.md`. Run `npm test`, `npm run build`, `npm run test:cloudflare`.

## Risks

- PR 17 edits the same dare and rankings templates in `src/main.ts`; whichever merges second needs a manual merge.
- Guests can now dare. Dare wins carry no medals and guest rounds stay off the boards; reports and blocks still apply.
