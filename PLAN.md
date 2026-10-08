# Lobby music in the intro film's style — 8 October 2026

Branch `lobby-arcade-music`. The owner liked the intro film's score and asked
for the lobby and world background music in a similar genre, as a new pull
request, then merged and deployed.

## Done means

- The lobby's day and night music is arcade pop like the intro: square-wave
  lead, bouncing sawtooth bass, kick, snare and hats, using the film's hook.
- Night is the same tune, slower and softer, so evenings stay calm.
- Game and Coast Rush music are unchanged.
- No louder than the music it replaces; no clipping and no silent stretches.
- `npm test`, `npm run build` and `npm run test:cloudflare` pass.

## Steps

1. Measure the current moods with `renderMusic` (peak, loudness).
2. `src/audio.ts`: add the `arcade` and `arcade-night` arrangements and a
   16-bar lobby tune; remove the plucked-string arrangement they replace.
3. Re-measure and match the old loudness.
4. README, tests, pull request.
5. Merge, deploy, check production, record it in `HOSTING.md`.

## Assumptions

- "Lobby/world" means the day and night themes, which play everywhere
  outside a game.
- It loops for a whole visit, so it is mixed well below the film's level and
  the second eight bars are sparser than the first.

## Risks

- Nobody can hear it before it ships except the owner. The checks are
  numerical: loudness, clipping, silence.
- `tests/music-browser.test.ts` times out on this Windows machine on `main`
  as well; its assertions were run through a separate Chromium harness.
