# Stage song and kinder timing — 10 October 2026

Branch `stage-music`, from `main`. The owner asked for the Open Stage to
have music, with the arrows pressed to its rhythm, and for timing to be more
lenient: Perfect, Great, Good or Miss.

## Done means

- A show plays its own song, and every arrow reaches the line on a beat or
  half-beat of that song. The lobby theme waits while it plays.
- A press is judged Perfect, Great or Good by how close it is, over a wider
  window than before; a note left alone is a Miss.
- `npm test` and `npm run build` pass, and a show is played in a browser.

## Assumptions

- The charts stay as they are (same seeds, same notes, same perfect score),
  so stars, XP, the server's rules and Stage Party need no change. The song
  is written from the chart instead: drums and bass on its beat grid, and a
  lead note on every arrow, pitched by lane.
- The song is synthesised like the rest of the game's sound, follows the
  Music setting, and is scheduled from the show's tick clock so it cannot
  drift from the arrows.
- Windows: Perfect ±4 ticks (67 ms, as before), Great ±8 (133 ms), Good ±12
  (200 ms, was 150). Points 100 / 75 / 50. "Too soon" stays for a press with
  no note near, so mashing still costs hype.

## Steps

1. `shared/stage.ts`: `stageBeat`, the Great tier, the wider Good window.
2. `src/stage-song.ts`: the song as a list of timed sounds, from the chart.
3. `src/audio.ts`: a bus and voices for the song; `stage(on)` hushes the theme.
4. `src/stage-game.ts`, `src/stage-view.ts`, `src/stage.css`, `src/main.ts`:
   schedule the song, show Great.
5. Tests: rules, song, panel, audio. STAGE.md.

## Risks

- Same-lane notes are 22 ticks apart at the fastest, so two Good windows
  (24) now overlap by 2 ticks there. The earlier note takes the press, as
  before; the Encore test that asserted no overlap is restated for Great.
- Sound latency (Bluetooth especially) cannot be measured from a test.

## Outcome

- All five steps done. `npm test` 531 pass, 0 fail, 49 skipped (the browser
  checks that need `DARECADE_TEST_CHROMIUM`); `npm run build` clean.
- Played in desktop Chrome against the built preview, with the audio graph
  instrumented. A Warm-up cued three clicks 0.75 s apart and then the full
  beat; the lobby theme stopped being scheduled when the show began and
  came back after it. A Show called Perfect, Miss and Too soon, and was
  booed off as an unskilled one should be. No console errors.
- The automation tab was in the background, so frames were pumped from a
  worker and nobody listened. How the song sounds, and whether it feels on
  the beat through real speakers, needs a person with the sound on.
- Great and Good were not produced by hand in the browser; the rules and
  panel tests cover them.
- Not built: a latency setting for Bluetooth speakers, a tally of
  Perfect/Great/Good on the result line, a count-in for Stage Party's
  countdown.
