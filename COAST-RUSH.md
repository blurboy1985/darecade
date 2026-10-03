# Coast Rush

Darecade's fifth game is an original two-lap time trial around Palm Bay. It uses the player's saved KayKit character, colours, clothing, headgear, magic and companion. The companion rides in a sidecar. All karts have identical handling.

The requested reference, [Tidal Rush](https://github.com/hammadshakeelai/tidal-rush), contains a wrapper around a separately hosted game, not the game source. Coast Rush takes inspiration from the tropical kart-racing concept. Its course, scenery, kart, controls and deterministic simulation were built for Darecade. No hosted game code, music, branding or screenshots are bundled. KayKit remains credited in `art/characters/CREDITS.md`.

## Playing

- Acceleration is automatic. Left/right arrows or A/D steer; down/S brakes.
- Hold Space or the Drift button while steering into a bend. Release after the meter passes its threshold for a turbo. Drifting without steering into a bend earns no charge.
- Teal strips give a boost. Cones, the sand and the outer barrier slow the kart.
- Complete two laps before the two-minute limit. A gold translucent kart is a non-colliding, constant-pace guide based on the dare target, personal best or a 55-second starter target. It is not a live opponent or a recorded player replay.
- Pause, loss of focus and hidden tabs freeze the simulation and clear held controls. Simple graphics use the same simulation and controls. Graphics context loss pauses the game and offers Resume in simple view.

## Competition

The lowest completed two-lap time is best. Lap splits, boosts and bumps explain a run but do not add bonus points. Finishing late or quitting cannot produce a ranked time. The course and physics are fixed for everyone; cosmetics do not affect speed or collisions.

Only a player's best eligible time that day counts. At midnight Singapore time, the top three ranks earn +3/+2/+1 medal points, with competition ties such as 1, 1, 3. Coast Rush contributes at most three points per player per day, the same as every other cabinet. Five games therefore allow up to 15 medal points per day. Daily medals feed the existing weekly and lifetime boards.

Race dares lock the defender's best time at the start. A faster time wins and an equal tick time draws. The existing shared limit remains three outgoing attempts per day against three different neighbours, across all five games. Incoming dares are unlimited and never subtract medals. Account verification, the 24-hour eligibility wait, age/consent gates, privacy controls and retention rules remain in force.

## Implementation and compatibility

- `shared/racing.ts` owns arc-length track sampling and 60 Hz physics. No browser state, avatar values, frame time or random items enter the simulation.
- `shared/simulation.ts` replays recorded inputs for all five games. Coast Rush permits at most 7,200 ticks/events; the other games retain their 3,600-tick limit. The server checks the replay, claimed score, owner, run status and minimum elapsed wall time before saving.
- Completed times use the exact integer encoding `7201 - finishTicks`, so the existing descending-score board and dare comparisons remain valid. Zero means no finish. `formatScore` displays race times everywhere, including results, cards, boards and dares. Ties are exact simulation ticks, displayed to hundredths.
- The existing rules version remains unchanged because no previous game physics changed and Coast Rush had no previous scores. Any future race-physics change needs a rules/leaderboard migration strategy before deployment.
- `src/racing-game.ts` owns controls, countdown, replay collection and the result summary. `src/race-view.ts` loads only when racing is opened; it renders scenery, driver and pace ghost without changing the simulation.
- A driving pose and hand targets were added to `src/character.ts`. Other poses, the reused wardrobe preview and the KayKit GLB are preserved. No model rebuild or asset replacement was required.
- Legacy saves gain `best.coast = 0` through normalisation. Existing indices, scores, accounts and awards are retained. No production database migration or reset is required.

## Verification

Automated checks cover deterministic replay across seeds, faster times sorting first, lap completion, drift advantage, collision penalties, DNF exclusion, tampered and premature results, ties, midnight/weekly medals, idempotent finish retries and the shared dare limit. The Cloudflare runtime test exercises all five games, score validation, saved accounts and privacy controls.

Browser checks use an isolated local database under `.browser/coast-qa-data`, never production accounts. A keyboard-driven race completed in 42.78 seconds with two lap splits and a server-accepted replay. Responsive checks include 320×568, 390×844 and short landscape. These are desktop Chromium checks, not physical iPhone performance measurements.
