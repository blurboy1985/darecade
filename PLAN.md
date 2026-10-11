# Rankings, leaderboard and XP: player UI/UX pass — 11 October 2026

The owner asked for a PR that improves what a player sees on the ranking,
leaderboard and experience (XP/level) screens. Reviewed in a browser at
390x844 and 1280x800 against the local server, with a mocked `/api/state`
(12 players, a season, the player at rank 7) so the boards had rows.

## Found in review

1. Rankings opens on an XP bar, fine print, a bests disclosure and the daily
   goal card. The player's rank and the board start below the fold on a phone.
2. The season board (the default when a season runs) drops the
   Quests / Challenges / Rankings tabs, so there is no way sideways.
3. A long nickname pushes the row wider than the dialog: horizontal scrollbar
   and the unit label wraps.
4. Row unit ("MEDAL PTS") repeats on every row at 7px; rank number is low
   contrast; the top three look like everyone else in the list.
5. The podium and the list both show ranks 1 to 3.
6. The rank card says "Nice!" at any rank and gives no next target.
7. "Show" / "Game" labels are 8px; the two pickers stack and push the board down.
8. Sticky tabs leave a see-through band above them while scrolling.
9. Empty-state button overlaps its paragraph; the "score / leader" label
   overlaps its progress bar.
10. Week shown as `2026-10-05`.
11. Level progress is a 12px text block with a default `<progress>`; the round
    receipt does not say when a round crossed a level.

## Done means

- Rank card and board are the first things on Rankings; progress (level, daily
  goal, bests) follows the board. No copy or rule is removed.
- Items 2 to 11 fixed, at 390px and 1280px, no horizontal scroll.
- `npm test` and `npm run build` pass; new pure helpers have unit tests.
- Before/after screenshots checked in the browser.

## Steps

1. `src/lobby-menu.ts`: pure helpers `boardRows`, `nextRankNote`, `weekLabel`.
   Tests in `tests/lobby-menu.test.ts`.
2. `src/main.ts`: reorder `renderSharedBoard` / `renderSeasonBoard`, tabs on
   the season board, pickers in one row, helpers wired in, profile panel bar.
3. `src/progression-guide.ts`, `src/reward-receipt.ts`: level card markup and
   a "Level up" line on the receipt. Existing test strings kept.
4. CSS in `src/style.css`, `src/lobby-ui.css`, `src/mobile-hud.css`.
5. Verify: tests, build, browser at both sizes.

## Out of scope

Server, scoring rules, the HUD chip, the Coast Rush result board, challenges.

## Risks

- `tests/lobby-render.test.ts` evaluates the render functions from source and
  caps primary buttons at 3 on Rankings: no new buttons.
- Browser tests (`DARECADE_TEST_CHROMIUM`) select `#board-period` /
  `#board-game` and read `.leaderboard` / `.level-reward`: ids and classes stay.

## Outcome

- Steps 1 to 5 done on branch `player-progress-ux`.
- `npm test`: 605 tests, 556 pass, 0 fail, 49 browser checks skipped. Four new
  tests: board rows, next-rank note, week label, receipt level-up.
- `npm run build` passes. In installed Chrome the seasons, Section 4, mobile
  lobby and experience browser files ran 25 tests, all pass.
- Looked at in headless Chrome at 390x844 and 1280x800 with the mocked state:
  season, weekly, daily, empty weekly and the profile panel. No horizontal
  scroll (dialog scrollWidth equals clientWidth) with a 25-character nickname.
- The Coast Rush daily board was opened after the PR: `racing.css` narrowed
  its rows to a 28px rank column under the new 52px header. Fixed in
  `lobby-ui.css` and looked at again.
- Also changed: `reward-receipt.ts` imports `./progression-guide.ts` with its
  extension, so the receipt can be unit tested like the other modules.
- Not done: the round receipt's "Level up!" line and the level bar on the
  game covers were not seen in a browser (covered by unit and Section 4 tests
  only); nothing was tried on a real phone or in Firefox/Safari, where the restyled
  `<progress>` bars rely on `::-moz-progress-bar` and `appearance: none`.

## Merge and deployment

The owner then asked for the PR to be merged and deployed.

- PR #86 merged as `ed5893d`; `main` is the tree that was tested.
- `npm test` 605 tests, 0 fail; `npm run test:cloudflare` 17 of 17.
- `npm run cf:deploy`: Worker version `000cd78a-e47b-40cb-80d8-73a5534338ee`.
- Live: health ready, HTML and 18 script and style files match `dist/`, state
  401, auth config 200, private paths 404, old address answers.
- Not done: nothing was opened or played in production, and no phone.
- Rollback is a redeploy of `5f542b0`.
