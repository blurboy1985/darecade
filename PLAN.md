# Skippable intro film — 8 October 2026

Branch `intro-video`. Play a 40-second animated introduction when a player
starts Play Simi, with a way to skip it, and open a pull request.

## Done means

- A first-time visitor gets a start card, then a 40 s film drawn in HTML
  canvas with JavaScript, with original music synthesised in Web Audio.
- **Skip intro** is on screen from the start card to the last frame; Esc
  also skips. Skipping or finishing goes straight into the game.
- The film plays once per browser. `?intro=1` replays it, `?intro=0` never
  shows it.
- It works at 1280×720, 390×844 and 844×390 with the action inside the frame.
- No new dependencies, no audio or video files.
- `npm test` and `npm run build` pass; frames checked in a real browser.

## Story (120 beats a minute, so every cut lands on a beat)

| Seconds | Scene |
| --- | --- |
| 0–4.5 | A kart stops just short of the camera. Tea Alchemist: "You're late." You: "Late for what?" |
| 4.5–6 | Race countdown: 3, 2, 1, GO |
| 6–9 | Coast Rush: the corner taken too wide, into the tyres |
| 9–11.5 | Hoops Court: the ball clangs off the rim |
| 11.5–14 | Brick Bash: one brick left, paddle a hair short, GAME OVER |
| 14–16 | You: "Haha. Okay… one more try." Music drops out, then a riser |
| 16–19 | Hoops: swish |
| 19–23 | Coast Rush: inside line, overtake for 1st |
| 23–26 | Open Stage: three Perfects and a pose |
| 26–28 | Tea Alchemist: "That's more like it!" |
| 28–34 | Neighbourhood. Kopi pads across. "One more round?" Silence. "Or you scared?" |
| 34–40 | Music back in. Play Simi logo: "Your turn." |

Changes from the brief: the newcomer is "You" throughout and is never shown
except as a kart and a silhouette; the arcade round is Brick Bash; the film
runs 40 s rather than 36 so the logo has room.

## Steps

1. `src/intro-script.ts` — timings, captions and the rule for when to play
   (no browser calls, so it is unit-tested). `tests/intro.test.ts`.
2. `src/intro-score.ts` — the music and sound effects, scheduled against the
   same timings.
3. `src/intro-film.ts` — `drawFilm(ctx, t, w, h)`, one function per scene.
4. `src/intro.ts` + `src/intro.css` — start card, Skip button, Esc, playback,
   the seen flag.
5. `src/boot.ts` — play the intro before the game is imported, loaded only
   when it will be shown.
6. Verify: tests, build, browser screenshots at each scene in three sizes,
   skip and replay paths.
7. README note, commit, push, pull request.

## Assumptions

- A start card comes first because browsers refuse sound before a tap.
- Everyone sees it once, including players with an existing save.
- Players who ask for reduced motion do not get it, and neither do automated
  browsers (`navigator.webdriver`), so the existing QA scripts are unchanged.
- The game loads after the intro, not behind it, so the game's own music and
  sign-in prompts cannot start underneath the film.
- Dialogue is captions with short voice blips, not recorded speech.

## Risks

- Hand-drawn 2D art has to sit beside a 3D game; it uses the game's palette
  and Fredoka type to stay in the family.
- Loading the game after the film adds a short wait at the end; the logo card
  stays up until the game is ready.
