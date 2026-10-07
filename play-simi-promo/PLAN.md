# Play Simi promo — plan

Goal: real footage of https://playsimi.danielquek.com captured as a guest, then a
30 s vertical promo (`promo.html`) rendered to MP4 by `render.mjs`.

Rules: guest only. No email entered, nothing bought, no chat with or reports of
real players. Other players' name tags never shown unblurred.

## Steps

1. Set up `play-simi-promo/` + `assets/`, install Playwright + Chromium.
2. Explore the live game (`explore.mjs`, throwaway) and note selectors and what looks good → `NOTES.md`.
3. `capture.mjs`: phone (390×844 @3x) and desktop (1920×1080) stills and clips.
4. Trim clips with ffmpeg → WebM + MP4. Write `assets/SHOTLIST.md`, `assets/contact-sheet.png`.
5. Footage reviewer subagent → recapture flagged shots (max 2 extra rounds) → update SHOTLIST.
6. `promo.html`: config object, fixed 30 fps timeline, phone-frame mockups, Web Audio music, controls, `?landscape=1`, `?cut=15`, record mode (R).
7. `render.mjs`: frame-stepped Playwright render + offline audio → three MP4s.
8. Video reviewer subagent → fix → re-render (max 3 rounds, target 9/10).
9. Report.

## Done means

- All deliverable files exist and each MP4 is checked with ffprobe (H.264 + AAC, 30 fps, right size and length).
- Frames from the final render are looked at, not assumed.

## Progress log

- Explored the live game, wrote `capture.mjs` (bots play each mini-game; names swapped for made-up ones).
- The live game was redeployed several times during capture; avatar footage reshot on the newest build each time.
- Footage review: round 1 (first pass), round 2 (after reshoot; caught generated guest names leaking, fixed), round 3 (final scores, no name rejections). Scores are in `assets/SHOTLIST.md`; each round is kept in `review/footage-review-round*.json`.
- `promo.html` + `render.mjs` built; three MP4s rendered and checked with ffprobe.
- Video review: round 1 = 6/10, round 2 = 7/10, round 3 = see `review/` and the final report.
