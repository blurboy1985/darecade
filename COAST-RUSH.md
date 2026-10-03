# Coast Rush

Coast Rush is Darecade's original three-lap race around Palm Bay. Eight karts share the grid: the saved player avatar and seven named game characters. The coastal course, scenery, kart and simulation are Darecade's own work. No Tidal Rush art, name, code or audio is included. KayKit characters remain credited in `art/characters/CREDITS.md`.

## Playing

- W/up or the touch GO button accelerates. A/D or left/right steers. S/down brakes. There is no automatic acceleration.
- On touch screens, steering sits under the left thumb and a 2×2 pad (ITEM, BRAKE, DRIFT, GO) under the right. Holding DRIFT or ITEM also holds the throttle, and a thumb can slide between neighbouring buttons without lifting, so drifting needs one right-hand finger. Keyboard throttle is unchanged. The cover and prompts use touch wording on touch devices.
- Hold Space or DRIFT while moving, then release for Mini (0.8 seconds held), Super (1.6 seconds) or Ultra (2.4 seconds). The meter names the available tier. Turbos last 0.8, 1.4 or 2.1 seconds respectively.
- The cover explains the three pickups before the race: shield, turbo and shells.
- Crates give either a three-second shield or a two-second speed turbo. E or ITEM uses the current item once per press. Holding E cannot use a subsequently collected item. Crate contents follow a fixed lap/position sequence, with no purchases or random reward system.
- Teal boost pads stay. Shells are optional track pickups, up to 36 across three laps. They are counted at the finish and do not grant speed, currency or medal bonuses. The HUD shows the running count out of 36.
- Hitting a wall or another kart causes a visible 0.75-second stop plus acceleration recovery. Shield prevents these hits. Sand only slightly reduces cruising speed. Repeated contact has a short cooldown.
- The 3, 2, 1 countdown precedes the race clock. Place is always shown as, for example, 3rd / 8, and all eight karts appear on the minimap.
- Marina, Reef, Sunny, Pebble, Mango, Breeze and Coco form the street ladder. Every rival is labelled Game character in the scene and results. Fixed, staggered paces make a first-lap pass possible without drifting. They never create player accounts, shared challenges or medal entries.
- Results show place, total time, best lap, shells and hit-stop time. A first completed race or an improvement in personal time or place displays New best. Another round starts in the same page. A two-minute unfinished race records No finish, earns the normal completion cosmetic reward, and cannot set a racing best or rank.
- Pause, loss of focus and hidden tabs freeze the simulation and clear controls. Simple graphics uses the same race rules. Graphics context loss pauses the race and allows resuming in the map view.

## Sound and the finish

- Sound is on by default for new players, and starts with their first tap, as browsers require. Players who already have a saved profile keep their existing setting. The race cover and footer each have a sound button; it changes the same saved setting as the top-bar toggle.
- With sound on, the race has its own music, which speeds up on the final lap, and a continuous engine, tyre-squeal and wind loop that follows speed, drifting and turbo. Effects cover the countdown, shells (rising in pitch when collected in a run), crates, shield on and off, drift tiers, turbo, hits, position changes, laps, the final lap, the last ten seconds, the flag and a time-limit ending. Everything is synthesised; there are no audio files.
- Collecting a crate, using a shield and starting the final lap also show on screen. The shield bubble pulses and blinks through its last second, and the screen edge glows while it is active.
- Crossing the line starts a finish sequence of up to nine seconds: the kart rolls to a stop, the camera swings round to the driver, and place, time, best lap and shells appear in turn. See results, or Enter, skips it. Rivals that have finished park beyond the line. The clock stops at the line, so the sequence never changes a time.
- The result is sent to the server when the line is crossed, not after the sequence, so closing the window during it does not lose the round.

## First visit and accounts

Age and privacy consent still come first. Play now opens Coast Rush directly. Before the first completed round, the neighbourhood's shop, hunt, camera tools and extra menus are hidden and walking is paused. Sound, accessibility settings and account/privacy controls remain accessible. Closing an unfinished race returns to Play now.

Any completed game round, including a zero-score finish, still unlocks the lilac cap and its one-time welcome XP. The first race result reveals the neighbourhood and the other four cabinets. A guest's new-best result offers Save your avatar and this score, opening the existing email form. Creating an account is optional; guest progress remains saved on the current session. No email is sent without submitting that form.

## Competition and preservation

Verified players compete by fastest completed three-lap time. Street-ladder place and shells never add medal points. Account verification remains; every verified round is ranked immediately, with no practice mode or waiting period. Gold/silver/bronze award 3/2/1 at midnight Singapore time, ties share ranks, and five cabinets allow up to 15 points per day. Missing a day never subtracts points. The existing shared-dare rules remain unchanged.

Coast Rush now uses replay rules version 2. The other four games stay on version 1 with unchanged simulation behaviour. Completed race scores remain the exact integer `7201 - finishTicks`; zero is DNF. The server replays inputs to derive time, place, lap and pickup results. It stores personal bests and the run's result transactionally so retries neither duplicate rewards nor lose the original New best flag. Graphics and sound only observe simulation state. The touch, sound and finish changes of 4 October 2026 did not alter `shared/racing.ts`, so rules version 2, saved bests and replays are unaffected.

Old two-lap runs are retained in the database. The previous personal best is retained as `coastLegacyBest` in progress/export data. Old race times and posted dares are excluded from the new race boards and targets. Historical awarded medals remain unchanged; unprocessed days before the Singapore cutover day settle against the old race version. On the cutover day, only three-lap runs compete for Coast Rush's pending medals. Other games, saved avatars and cosmetic indices are preserved.

## Checks

Automated coverage includes manual throttle, first-lap passing, all drift tiers, both items, one-use input edges, shield protection, collision stops, replay determinism, tampering, DNF, personal records, retry handling, old-score migration, midnight medals and the shared dare limit. The Cloudflare test completes a three-lap race and checks its persisted result and real-player board entry.

Browser testing uses isolated local data and synthetic guest accounts. Desktop phone-size checks do not establish performance or touch feel on a physical iPhone.
