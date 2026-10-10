# Open Stage: pickers that work, a kinder crowd, shorter copy — 11 October 2026

Branch `open-stage-pickers`, from `main`. The owner reported that "Choose
your session" and "Dance style" are not working on the Open Stage, asked for
it to be slightly easier, said the explanations are too wordy, and asked for
better UX.

## What is wrong today

- `src/main.ts` clicks Start as soon as the stage opens (`3f6f48b`). A running
  show hides and locks both pickers, so nobody can choose before the first
  show.
- Both pickers are dropdowns: two taps each, options hidden.
- Three paragraphs of rules surround the stage, and repeat the progress card.
- Five missed notes in a row end a show.

## Done means

- The stage opens idle. Session and dance style are one-tap buttons, shown
  before every show; choosing a style shows its moves.
- Start sits on the stage itself, with one line of instruction and, after a
  show, the result.
- Slightly easier, without changing any chart, perfect score or star share:
  a miss costs 0.08 hype (was 0.12), a stray press 0.03 (was 0.05), Perfect
  is 5 ticks (was 4), Great is 9 (was 8). Good stays 12.
- `npm test` and `npm run build` pass; the panel is checked in a browser.

## Steps

1. `shared/stage.ts`: hype costs and windows.
2. `src/stage-game.ts`, `src/stage.css`, `src/mobile-hud.css`: button
   pickers, Start and result on the stage, shorter copy.
3. `src/main.ts`: stop starting the show on open.
4. Tests: `tests/stage-ui.test.ts`, `tests/stage.test.ts`,
   `tests/section4-browser.test.ts`.
5. `STAGE.md`.

## Outcome

- All five steps done.
- `tests/stage-ui.test.ts` has a new test for the button pickers; the tests
  that pinned five misses now pin seven; the pinned chart (106 notes) and
  perfect score (27,800) for seed 7 pass unchanged.
- In installed Chrome (`DARECADE_TEST_CHROMIUM`), Section 4 passes at
  1280×900, 390×844 and 844×390 against the built app, including the new
  checks that the panel waits for Start and that a style is one tap.
- Not done: nobody has played it. Whether seven misses and the wider
  Perfect feel "slightly" easier needs a person.

## Risks

- Undoes "start directly" for the stage only; the owner's report outranks it.
- Party scores are slightly higher for the same play; nothing is stored.
