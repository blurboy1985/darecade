# Coast Rush review: items, mobile, sound, finish

Branch `scale/records`, edited in place. The unrelated uncommitted server/social work is left alone.

## Task

Review Coast Rush; explain shells and shields in the game itself; improve phone play; add race music and sound effects; give the race a proper ending.

## Findings

- **Shells**: 12 per lap, 36 per race. Counted on the result only. No speed, currency or medal effect. The game never says so, and collecting one gives no sound or visual feedback.
- **Shield**: a crate item. Using it blocks wall and kart hits (each a 0.75s stop) for 3 seconds. Crates alternate shield and turbo. Collecting or using one has no feedback beyond a small text label.
- **Mobile**: drifting needs GO and DRIFT held together, so two right-hand fingers. Buttons are 54×48. The cover shows keyboard keys (W A S D, Space, E) on phones.
- **Sound**: sound is off by default with no control inside the race. The race has no music of its own, no engine, and no sound for shells, crates, shield, laps or position changes.
- **Ending**: the frame the line is crossed, the race view is replaced by "Checking score…". Finished rivals also stack on the start line.

## Constraint

`shared/racing.ts` is replayed by the server and versioned (rules v2). It is not changed, so times, bests, medals and replays are unaffected. All work is presentation and input.

## Steps

1. `src/audio.ts`: race music mood, tempo control, engine/skid/wind loop, new effects.
2. `src/race-view.ts`: finish camera, coasting past the line, rivals parking beyond it, shield pulse and expiry blink.
3. `src/racing-game.ts`: item legend, touch wording, thumb sliding, DRIFT/ITEM keep throttle, pickup and position cues, final-lap moment, finish sequence, sound button.
4. `src/racing.css`: thumb-sized controls, item states, finish overlay.
5. `src/main.ts`: submit the result while the finish sequence plays; race music; shared sound toggle.
6. Docs: `COAST-RUSH.md`, `QA.md`.

## Verify

- `npm test` and `npm run build` pass.
- Browser at 390×844, 320×568 and 844×390: no overflow, controls reachable, a full race reaches the finish sequence and a server-verified result.
- Not verifiable here: real-phone touch feel and how the audio sounds to a person.

## Decisions left for Daniel

- Sound default: decided 4 October 2026, on by default for new players. A sound button is also on the race cover.
- Whether shells should ever affect anything is a rules change (version bump); not done.
