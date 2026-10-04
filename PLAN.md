# Playtest bug fixes — 4 October 2026

Branch `fix/playtest-bugs` from `origin/main`. Eight bugs from the live playtest, fixed in priority order. No player data, personal bests or production state is wiped. Game rules and replay validation are unchanged, so no rules version moves.

Done means: each bug has a code change and a test, `npm test` and `npm run build` pass, and a pull request is open (not merged).

## Root causes and fixes

1. **Dares locked for a verified account.** The 24-hour hold after email verification is deliberate (ACCOUNTS.md), but the screen showed "3/3 left today" beside a disabled button and never gave the opening time. Keep the hold. Show the real opening time, drop the "left today" line while locked, and state why any Play dare button is disabled.
2. **Ranked round missing from the board.** The weekly board lists medals, which only exist after midnight, yet said "Finish a round to join". Today's board keeps each player's best score, so a lower replay never appears, and the result screen showed the rank of the earlier best as if it belonged to the new round. Fix the copy on both screens and always load fresh standings for the result.
3. **Hop Hop and Noodle Run end with no reason.** The rounds end on a real failure (wall, tail, crate, gap) but nothing says so, and the noodle reaches a wall 2.2 s after PLAY. Record the reason in the simulation, hold the final frame with the reason, repeat it on the result, and start Noodle Run on the first turn.
4. **Coast Rush stuck at 0 KM/H.** GO only worked while held, a tap did nothing, a long press could be cancelled by the browser menu, and lapping rivals hit the parked kart until time ran out. GO now latches on a tap, the browser menu is suppressed, an idle kart pauses the clock, and drivers without a finish get edge steering help. Client inputs only; physics untouched.
5. **Email save swapped the character.** Saving a guest to an email that already had an account silently signed in to the older account. The server now refuses to switch without an explicit choice, and the dialog offers to keep the current character or switch.
6. **Claimed hat missing from the wardrobe.** Daily hats lived only in a collapsed section. Show owned daily hats under My look → Head.
7. **Finished quest with a dead button.** The claim button read "+30 XP" beside a disabled pager Next. Label it "Claim +30 XP" / "Claimed ✓" and hide the pager button that cannot move.
8. **Explore announced the wrong place.** A walk announced whichever spot was discovered on the way and never the destination. Announce the chosen place, keep discoveries on the way quiet, and record the destination on arrival.

## Steps

1. Server: account conflict on verify, clearer dare errors. Tests in `tests/community.test.ts`.
2. Shared simulation: end reasons. Tests in `tests/hop.test.ts`, `tests/core.test.ts`.
3. Client copy helpers in `src/lobby-menu.ts`; dares, board, quests, wardrobe, explore in `src/main.ts`, `src/wardrobe.ts`, `src/world.ts`. Tests in `tests/lobby-render.test.ts`, `tests/lobby-menu.test.ts`, `tests/wardrobe.test.ts`.
4. Arcade end reason and noodle start in `src/games.ts`.
5. Coast Rush touch controls in `src/racing-game.ts`, `src/race-assist.ts`. Tests in `tests/racing.test.ts`.
6. Account dialog conflict choice in `src/account.ts`.
7. Verify: `npm test`, `npm run build`, `npm run test:cloudflare`, browser check of the changed screens.
8. Commit, push, open the pull request.

## Risks

- Render tests evaluate `src/main.ts` functions in a fixture; new helpers must come from modules the fixture loads.
- The live site cannot be tested from this branch until it is deployed.

## Verification — 4 October 2026

- `npm test`: 192 tests, 190 pass, 2 skipped (browser checks that need `DARECADE_TEST_CHROMIUM`). With local Chrome set, the onboarding browser check passes too.
- `npm run build` and `npm run test:cloudflare` (8 of 8) pass.
- Built app driven in headless Chrome against a local server on throwaway data: a parked kart stopped the clock at 5 s; one tap on GO reached 83 km/h and, hands-off, finished three laps in 1:22.73; Noodle Run waited for the first turn and named the wall; Hop Hop named the crate; the claimed Kopitiam Bucket showed under Head; a finished quest claimed; Explore announced and landed on Pocket Garden only; an email owned by another character left the guest unchanged; a new account saw its dare opening time and no daily count; the weekly board showed pending medals.
- Not verified: the live site (needs a deployment) and a physical phone.
