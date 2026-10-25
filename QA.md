# Play Simi verification


## Gameplay simplification — 5 October 2026, draft only

Built from fresh main at `b93a5e4094ee6a35d47369e7960684d9d3078cc0` in an isolated Mac checkout. No merge, deployment, real player email, credential creation or production mail/security setting change was performed.

- Full Node suite: 259 tests, 253 passed, 0 failed, 6 default opt-in Chromium checks skipped. The two new fallback checks were then enabled separately and both passed. The four older opt-in browser checks remain unverified in this session: their headless process waits stalled (including a bounded Edge retry). These four are not counted as passes.
- All 11 Cloudflare/Miniflare integration tests passed. TypeScript, Vite build, Worker deployment dry run and diff checks passed. The existing large Three.js bundle advisory remains.
- Server regressions cover Singapore midnight, ties (1, 1, 3), multi-game 3-token cap separate from XP, catch-up/restart idempotency, no old medal windfall, preserved balances/ownership, transactional settlement rollback, token-only purchases and forged browser rewards. XP notices accumulate exact counts, survive restart, acknowledge once and include passive inviter awards.
- Challenge coverage includes friends outside the top 50, daily displayed run versus lifetime best, frozen seed/target, attempt quota and distinct opponents, abandoning, cross-day replay rejection and legacy posted-attempt migration. Existing replay validation, rate-limit, blocking, suspension and privacy tests pass.
- Email fakes cover explicit opt-in, verified address/current consent, consolidated actual awards, cancellation/erasure, concurrent delivery, accepted-send/lost-response retry, persisted lease recovery and the conservative 23-hour needs_review hold. The actual Cloudflare alarm is exercised against fake Resend 503/recovery using one immutable provider key and one reward ledger row.
- Interactive Chrome QA used `.browser/qa-data`, synthetic verified players and private `MAIL_MODE=outbox`. Desktop and 390×844 mobile views verified Games/Neighbourhood/Menu, three game choices per page, Fishing/Hoops in Games, camera toggle and retained day/night controls. Checked menus, wardrobe, challenges and reward card had no horizontal overflow. A 1-token Street collection purchase deducted exactly one token and unlocked its pieces.
- The running Three.js token canvas displayed +1 and +2 correctly. Keep playing dismissed it; See looks opened the wardrobe. Reduced motion used a static card. Reload after acknowledgement showed no repeat popup. With two dialogs open, the popup attached to account-dialog; See looks closed that dialog and showed the correct wallet. Friend lookup started a challenge showing BEAT 10; abandoning consumed a slot and disabled another challenge to the same neighbour. Email opt-in/out both showed Email preference saved.
- Follow-up `tests/fallback-browser.test.ts` ran the actual Vite-built application and Three.js/CSS in isolated headless Chrome, inside a real 390×844 CSS viewport. Canned API responses replace all account/server/mail access. Saved 2D made zero WebGL attempts; forced startup WebGL failure made two failed attempts, entered the lightweight lobby and preserved `twoD=false`. Camera and nearby controls were hidden, Games opened, +2/+1 static rewards dismissed or opened looks, a third reward attached to the wardrobe dialog and disappeared on its close event (explicitly dispatched after closing under Chrome virtual time), three notices were claimed once, and no horizontal overflow occurred. Both cases passed. Run after `npm run build` with `DARECADE_TEST_CHROMIUM='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' node --test tests/fallback-browser.test.ts`.
- The bounded browser runner captures completed DOM output before killing only its own process group because this Mac's headless Chrome can hang at shutdown with `CVDisplayLinkCreateWithCGDisplay` errors. Fixture reports are `.browser/fallback-true.html` and `.browser/fallback-false.html`; prior screenshots `.browser/games-mobile.jpg` and `.browser/reward-mobile.jpg` are also excluded from Git. Interactive browser controls were unavailable after the earlier disconnect, so that earlier window's viewport reset was not performed.
- Independent exact-diff review found and verified the scoped follow-up fixes: deletion now removes local medal test-outbox files and frozen target-run references, 2D transition refreshes camera/nearby controls, and closing a reward's owner dialog disposes it. The new server regression exercises actual test-outbox creation/erasure and missing-file tolerance. Later WebGL loss after an already-visible nearby interaction is source-reviewed, not browser-tested. Physical-device GPU comfort and real inbox delivery remain unverified.

See ACCOUNTS.md for durable email retries and WARDROBE.md for prices and migration.

## Coast Rush steady-motion follow-up, 4 October 2026

All 176 Node tests, including opt-in Chromium checks, and eight Cloudflare integration tests passed. Build, deployment dry-run and diff checks passed. Visual-only interpolation now blends the player and all rivals between 60 Hz simulation ticks. A centred track chord removes abrupt sampled-heading changes. The chassis stays level during steering and drifting; rival hit spins, boost pulsing, shield blinking/scaling and driver cosmetic bobbing are disabled in the race view. Physics, inputs, timers and ranking rules are unchanged.

The running Three.js view passed assertions that alternating steering leaves chassis rotation and camera position unchanged for the same race state, stunned rivals do not spin, and boost/shield scale stays constant. A real 390px game was exercised at turbo speed with no horizontal overflow. Front steering now eases visual changes independently of the immediate driving input. Round 32-segment tyres and solid rims retain fixed surface orientations so rapid rolling cannot produce polygon strobing. The running view verified all 32 wheels at 31 m/s and rapid alternating steering, and regression tests cover steering response at 30/60/120 Hz. Regression tests verify uniform 120 Hz presentation over 60 Hz physics, continuous headings at segment/lap boundaries, and unmodified simulation state. Physical-device comfort remains a user observation, not a claim made by these automated checks.


## Coast Rush clarity and post-race setup, 4 October 2026

- All 171 Node tests passed, including the opt-in Chromium account and menu tests. Eight Cloudflare integration tests, TypeScript/build, deployment dry-run and `git diff --check` passed.
- The chase camera now carries kart translation before easing its orbit. Tests cover acceleration through turbo speed at mixed 30/120 Hz frame intervals and reduced-motion behavior. Nameplates use screen-space text, remain upright, and hide overlapping/distant labels. Real browser screenshots cover desktop acceleration and a 320px turbo run at 110 km/h.
- Completed real local browser races with server-validated inputs. The verified-email run finished in 1:03.72; the result showed 0.12s behind two tied 1:03.60 leaders and daily rank #3. These are isolated synthetic local fixtures, not production leaderboard entries. Guest board access and blocked-player filtering are covered by the replay-backed server tests.
- Inspected results at 320px, 390px and desktop. No horizontal overflow in the modal or comparison card. The initial card shows the run time, daily comparison, top three plus the player's row, and name/look action. Remaining leaderboard rows and race rewards/splits are collapsed.
- At 320px, an empty nickname could not advance to email. Typed `Coral Comet` survived a Sky outfit change. Name, outfit, chosen-name marker and completed setup persisted. The optional second email step rejected a wrong code and accepted the correct local-outbox code, preserving the same profile after session rotation. No real email was sent by this QA.
- Optional wardrobe collections are collapsed during setup. Existing signed-in players finish customization without an unnecessary email prompt. Existing guest rounds remain outside ranked results.
- Production served the expected `index-qoU7Lmhv.js` build. A disposable guest completed a verified 1:03.60 race, saved its name and outfit, completed setup, and passed duplicate-reward protection. The test guest was deleted and its session returned 401. No production email or ranked test entry was created.
- Physical-phone GPU performance and real inbox delivery were not retested in this change.

## Integrated production release — 4 October 2026

PRs #11–16 are integrated with grouped wardrobe previews, ten S$1.99 premium
sets, live Stripe configuration, and S$2/S$5/S$10/S$50 one-time donations.

- 166/166 Node tests passed, including both real headless Chromium checks;
  no skips. 8/8 Cloudflare integration tests passed. TypeScript, Vite and the
  Worker deployment dry run passed. Existing large-chunk advisory remains.
- The merged build was opened in the operator's Chrome using an isolated local
  database and synthetic email outbox. Play/Explore/Menu, My stuff, Support,
  all four donation amounts and ten premium prices were verified. All ten set
  thumbnails loaded before selection; a locked set could be previewed and
  reset without equipping. No browser errors were recorded.
- A requested 320px viewport produced a measured 355px Chrome viewport on this
  machine; the narrow wardrobe view had no horizontal overflow. Earlier 320px
  feature checks below are separate evidence, not a claim about this run.
- Earlier Stripe sandbox purchase and refund checks and the live unpaid
  checkout/webhook check are recorded in PAYMENTS.md. No real payment was made.
- (Superseded on 10 October 2026: Coast Rush now uses rules version 4; see COAST-RUSH.md.)
- Coast Rush uses route/rules version 3 and archives old bests while retaining
  medals. Pages open before deployment should reload before starting a round,
  because Hop Hop and Brick Bash simulation changes retain their version.
- Open Stage rewards remain bounded client reports (45 XP/day), unlike the
  replay-verified arcade and outdoor rounds. This is an existing documented
  limitation, not a score-verification guarantee.

The sections below preserve feature-branch test history. Their "Not deployed"
notes describe the state before this integrated release.


## Invite a friend, 4 October 2026

See [Invite a friend](INVITES.md) for the behaviour. Not deployed. Purchase prompts are not part of this change.

- **132 Node tests passed, none failed, and the two browser checks that need `DARECADE_TEST_CHROMIUM` were skipped; 7/7 Cloudflare integration tests passed.** TypeScript and the Vite build passed. New `tests/invite.test.ts` covers one link per player, a player's own link, unknown codes, a veteran trying to claim, a second invite, payment only after a verified first round, payment once, the five-friend cap, the data export and account deletion.
- Tested in an isolated local Chromium on port 4190 with two synthetic guests in separate browser sessions. The first reached the Invite window through Menu, Friends, Neighbours, Bring a friend, and it showed a link and 0 of 5. The second opened that link: the code left the address bar, and after the age check and privacy notice a toast named the inviter. After the second guest's first race the result card showed the extra 30 XP, and the first guest's window showed 1 of 5 friends and +30 XP. No page errors.
- The menu rule of at most three main actions still passes; the invite buttons sit inside closed expandable sections.
- **Not verified:** the device share sheet, which desktop Chromium does not have, so only Copy was shown; clipboard copy itself; phone sizes; the Cloudflare routes in a browser (the Worker's integration tests pass but do not call them).

## Open Stage, 4 October 2026

See [Open Stage](STAGE.md) for the behaviour. Not deployed.

- **135 Node tests passed, none failed, and the two browser checks that need `DARECADE_TEST_CHROMIUM` were skipped; 7/7 Cloudflare integration tests passed.** TypeScript and the Vite build passed; the 3D scene is a separate 4.7 kB chunk. New `tests/stage.test.ts` covers the seeded song, Perfect and Good timing, the combo multiplier, being booed off by idling or mashing, the star thresholds, the daily cap, the 30-second minimum, malformed reports and save recovery.
- Tested in an isolated local Chromium on port 4191 with a synthetic guest. The stage, truss, sign and speakers stand on the plaza, and Explore lists Open Stage as a twelfth place. Walking there opened the panel with the avatar under the lamps. A player that read the note highway and pressed arrow keys hit all 101 notes as Good: combo 101 at ×3, confetti, **13150 points, one star, +5 XP** from the server. 5,896 frames, none over 50 ms. No page errors.
- **Not verified:** how the timing windows feel to a person; Perfect hits, a booed-off ending and the daily cap on screen (tests only); touch buttons, phone sizes and a physical phone; the 2D lobby.

## Brick Bash power-ups, boss and 3D effects, 4 October 2026

Not deployed. The Brick Bash simulation changed; its rules version did not, so a round in progress during a deploy, or played on a page loaded before it, fails verification until the page is reloaded.

- **Power-ups.** About one brick in six drops a capsule. WIDE widens the paddle for eight seconds. ×3 adds two balls; only losing the last ball costs a life, and a ×3 caught with three balls in play pays 30 points instead.
- **Boss.** The Big Brick arrives at 0:35, or as soon as the wall is cleared. It slides below the wall, blocks the ball and drops a bomb every 1.5 seconds; a bomb on the paddle costs a life. Eight hits beat it, at +40 a hit and +300 for the win. The round ends early only when the wall and the boss are both gone.
- **3D effects.** A transparent three.js layer over the 2D game, loaded on demand (3.7 kB): bricks shatter into tumbling cubes, the boss is a 3D block that flinches when hit and bursts when beaten, and capsules and bombs ring out from the paddle. With reduce motion, or without WebGL, the 2D canvas draws the boss itself.
- **135 Node tests passed, none failed, and the two browser checks that need `DARECADE_TEST_CHROMIUM` were skipped; 7/7 Cloudflare integration tests passed.** TypeScript and the Vite build passed. New `tests/brick.test.ts` covers the boss's arrival, bombs, the eight hits and both endings, both capsules, ball loss, and a full replayed round.
- Tested in an isolated local Chromium on port 4192 with a synthetic guest and a player that found the ball on the canvas and dragged the paddle under it. The round reached the boss, beat it in eight hits while losing two lives to bombs, and finished on **1320**, server-verified. Shattering bricks, a WIDE capsule, the 3D boss, its health bar and a bomb were seen on screen. No page errors.
- **Not verified:** the reduce-motion 2D boss on screen; multi-ball on screen (tests only); touch input and a physical phone; whether the boss is the right difficulty for a person.

## Hop Hop review, 4 October 2026

Not deployed. The Hop Hop simulation changed; its rules version did not, so a round in progress during a deploy, or played on a page loaded before it, fails verification until the page is reloaded.

- **Point spam fixed.** Time points (one every 83 ms) no longer pop, sound or burst; only hazards, stars and smashes do. Bonuses are now added to time points instead of being overtaken by them.
- **Cliff edges.** The runner falls only when the gap is under the middle of its feet, falls for about a third of a second before the round ends, and can still jump in the first moment of the fall. Crates have a slightly smaller hit box.
- **Power star.** A star floats at jump height about every 13 seconds. Catching it gives five seconds in which crates are smashed for +50 and gaps are bridged; a bridge under the runner holds until solid ground.
- **136 Node tests passed, none failed, and the two browser checks that need `DARECADE_TEST_CHROMIUM` were skipped; 7/7 Cloudflare integration tests passed.** TypeScript and the Vite build passed. New tests cover additive scoring, toe and heel forgiveness, the fall and the late jump, the star, smashing, the bridge, and a full replayed round.
- Tested in an isolated local Chromium on port 4193 with a synthetic guest. A player that read the canvas and pressed Space ran the full 60 seconds: 35 pops, one per hazard or smash and none from time, star power twice, **1645**, server-verified. A fixed-beat round that hit the first crate showed no pops at all. No page errors.
- **Not verified:** the fall and the bridge on screen (covered by tests only); touch input and a physical phone; whether the difficulty suits a person.

## Hoops and Fishing rounds, 4 October 2026

See [East Side](EAST-SIDE.md) for the behaviour. Not deployed.

- **135 Node tests passed, none failed, and the two browser checks that need `DARECADE_TEST_CHROMIUM` were skipped; 7/7 Cloudflare integration tests passed.** TypeScript and the Vite build passed with the existing large-bundle warning. The 3D scene is a separate 9.6 kB chunk loaded when a round opens.
- New tests cover replay determinism for both rounds, sharp play outscoring loose play, the shot clock, the narrowing and sliding green, hooking early and late, a snapped line, verified album and hoops XP, dares on the defender's seed, removal of the unverified progress events, and no medal boards.
- **Fishing lag.** Each catch used to send a progress event, and every profile reply rebuilt the 3D avatar. A round now sends nothing until it ends, and the avatar is rebuilt only when a look field changes. In the browser a full fishing round ran 8,638 frames with none over 50 ms.
- Tested in an isolated local Chromium on port 4194 with a synthetic guest and scripted Space-key input. Hoops: 49, then 50 after the difficulty tune, both 10 of 10 and server-verified. Fishing: 200 from two koi, a catfish and a tilapia, server-verified. The court, ball arc, net, sparks and streak flame, and the pond, rod, float, ripples, fish shadow and leaping fish were seen on screen. No page errors.
- **390×844**: no horizontal overflow and no modal scrolling in a hoops round.
- **Not verified:** how hard either round is for a person, since the scripted player reacts within a frame; a dare between two real accounts in the browser (covered by the server test only); the simple view; touch input and performance on a physical phone; fishing at phone size.

## Concise onboarding and menus, 4 October 2026

The world has Play, Explore and Menu. Nearby interaction, Stop and I’m back replace a main action rather than adding another. Player inspection hides the dock. Desktop and phone use the same three-action structure.

Menu groups and task pages expose at most three main actions. Games, outdoor activities, emotes and quests page through three choices. Wardrobe, away activity, rankings, neighbours and worlds use labelled selection inputs. Back, Close, page navigation are utility controls. Gameplay inputs are unchanged.

The age check, consent version, complete privacy notice, reporting and deletion checks are preserved. The visible privacy summary is shorter. Email saving is optional and skipping it returns to play. Delayed nickname saves cannot reopen dismissed setup. Live movement updates do not replace an unchanged neighbour selector, and a selected dare game survives shared-state refreshes.

Verified against the final local diff:

- `npm test` with `DARECADE_TEST_CHROMIUM` set to the installed Chrome executable: 133 passed, none skipped
- `npm run build`: TypeScript and production bundle passed
- `npm run test:cloudflare`: deployment dry-run and 7 integration tests passed using local test storage
- `git diff --check`: passed
- New structural/controller checks exercise populated and empty menu views, pagination, native selection request ownership, stale setup responses, repeated clicks, selected-game retention and movement-only updates

The local Windows review fixed a CRLF-sensitive source test and declared UTF-8 in both browser test fixtures. The two opt-in Chromium tests now exercise consent, optional email saving, world joins, disabled destinations and stale requests.

Against the actual bundled Worker/World in disposable local storage, browser checks covered the age/consent flow, expandable full privacy notice, first-race entry, ready-screen controls remaining hidden, Menu/Settings/Preferences, switching to 2D, Explore/Worlds and game pagination. Later navigation used a fixture-marked first-round completion; this was not a human-completed race. DOM measurements showed no horizontal overflow in the sampled panels at 320x700, 390x843, 843x390 and the restored 1908x1348 desktop viewport. Screenshot capture timed out, so no new visual captures or full visual review are claimed. Physical-phone touch, Safari, haptics and performance remain unverified. The existing large-bundle warning remains.

The 1,000-player / 20,000-run regression benchmark measured cached personal state at 1.14 ms p95 (1.18 ms maximum), with full rebuilds at 33.12-40.39 ms. Index-free snapshot plus personal state remained at 28 queries. No new load test was run for this UI change.

No production accounts, scores, age submissions, deployment or billing changes were made for this pass.


## Remaining PR integration, 4 October 2026

- PR #8 hides Coast Rush controls on its ready screen; verified hidden while ready and visible during the countdown at 390px. PR #9 reduces repeated Records writes and grouped leaderboard reads; 94 Node tests and seven Cloudflare tests passed before its merge.
- Integrated PR #6 with current main. Kept the World picker and East Side panels, widened the shared World/Records movement clamp to the new east boundary, and appended fishing/hoops to stable activity wire indices. Regression tests cover positions and activities in encoded snapshots, stored checkpoints and real Miniflare sockets. Physics and rules versions are unchanged.
- **103/103 Node tests and 7/7 Cloudflare tests passed**, including TypeScript, production build and deployment dry-run. A local disposable quota probe (2 players, 20 registered profiles, 200 runs, 3 iterations) recorded **659 rows read, 25 rows written, zero errors**, with counters stable across eviction. Full five-minute before/after evidence for #9 remains in QUOTA.md; no production load was run.
- Local Chromium with the actual bundled Worker/World at 390px and 320px: walked east to the fishing jetty, caught a new tilapia, switched to the 2D lobby, planted and watered chilli (45 minutes remaining), completed ten UI-driven hoops shots (10/10, +50 XP), and opened Worlds through a pointer click. The server profile retained the catch, hoop best, crop and watered flag. No horizontal overflow in the activity panels and no page errors. Corrected Explore's tenth/eleventh location labels.
- Remaining checks: physical-phone performance and real touch/haptics; human assessment of sound and activity feel; real delivery of the new email-code format.
## East Side district and activities, 4 October 2026

See [EAST-SIDE.md](EAST-SIDE.md) for the rules.

- **80/80 Node tests and 5/5 Cloudflare integration tests passed**; TypeScript, the Vite build and the Cloudflare dry-run passed. Eight new tests cover the fish, hoops and crop rules, tampered and pre-existing saves, the mission, server-side rewards on the server clock, the wider walkable bounds and the new away poses.
- Tested in an isolated local Chromium against `.browser/east-qa-data` on port 4199 with a synthetic guest who had finished a first race. Explore listed eleven places. Walking to Hoops Court, Fishing Jetty (onto the jetty itself) and Community Plots each opened the right panel on arrival, and the desktop camera followed east.
- **Hoops:** a scripted ten-shot round scored 7; the panel showed New best · +35 XP and the server profile held `hoopsBest` 7.
- **Fishing:** five casts gave two new species (+10 XP each) and two repeats; reeling early showed the too-soon message. The server profile held both species.
- **Plots:** planting chilli showed Ready in 1h 0m; watering changed it to 45 min and disabled the button. With the QA database backdated by two hours, the reloaded panel offered the harvest; the server gave +10 XP, counted one harvest and freed the plot.
- The three new stickers showed as earned (6 / 9 collected), and the East Side mission showed 2/2. Fish off the jetty and Shoot some hoops appeared as away activities; stepping away placed the avatar on the jetty.
- At 390×844 the fishing panel had no horizontal overflow and a 240×55 action button. No page errors throughout.
- **Not verified:** whether the activities are fun to a person; frame rate of the larger scene on a physical phone; the 2D lobby panels (they use the same code path as other places but were not opened in this run); hoops and fishing by real touch.

## Combined scaling, Coast Rush and email-code integration, 4 October 2026

- Merged PR C (#7), then Coast Rush presentation (#3), preserving the World picker and both QA histories. Resolved the account/world route conflict in #5 by retaining the directory routes and new code endpoints.
- Added an explicit world reconnect after email verification rotates the session. Retained erasure of legacy magic-link outbox messages, with regression coverage.
- **74/74 Node tests and 6/6 Cloudflare tests passed**, including the build and deployment dry-run. Cloudflare coverage now opens a world socket, verifies an email, rejects the old session and reconnects with the new session. Shared simulation, racing physics and rules versions are unchanged.
- Combined Node benchmark, 1,000 players / 20,000 runs: cached p95 **0.79 ms**, maximum **1.00 ms**; full rebuilds **33.46–40.57 ms**. The five-minute, 150-player PR C load measurements remain in HOSTING.md; that load was not run against production.
- Local Chromium at 390×844 with the actual bundled Worker/World classes and an intercepted email provider: age/consent → Play now → Coast Rush → time-limit finish sequence → server-accepted result → name and outfit → code. The unsaved nickname survived an outfit change; a wrong code showed its error, the correct code saved the character and opened a replacement world WebSocket. No email left the fixture and no browser page errors occurred.
- At 320px the Worlds pill inherited the mobile top bar's `pointer-events: none`; explicitly restored pointer events on the button so a tap opens the picker instead of reaching the scene.
- Remaining checks: physical iPhone rendering/touch/haptics, human listening to the new audio, and real inbox delivery of the new code format.

## First-race character setup and email codes, 4 October 2026

See [ACCOUNTS.md](ACCOUNTS.md) for the rules. Sign-in links are replaced by typed codes.

- **70/70 Node tests and 4/4 Cloudflare integration tests passed**; TypeScript, the Vite build and the Cloudflare dry-run passed. New coverage: six-digit single-use codes, hashed storage, no link in the email, one-minute resend throttle, expiry, five wrong tries per code, the fifteen-per-day address limit and its reset, and identical replies for unknown addresses.
- Tested in an isolated local Chromium at 390×844 against `.browser/otp-qa-data` on port 4198 with a synthetic guest and `mango@example.test`, mail in outbox mode. A new player finished the first race; the result offered Name & customise your character and Another round. The wardrobe opened as step 1 of 2 wearing the lilac cap; a typed nickname survived choosing an outfit and was saved by Next. Step 2 took the email and showed the code field in the same dialog. A wrong code showed the error and cleared the field; the right code closed the dialog, showed the saved toast and left the account signed in with the name, outfit, cap and race best. The browser had one tab throughout. The outbox message contained a code and no link, and was removed once used.
- Signed out, then signed back in from the welcome screen with a fresh code (email typed in different case): the same character returned. No page errors.
- **Not verified:** real delivery through Resend, including how the code email looks in an inbox and whether phones offer the code from the keyboard; a physical phone.

## Coast Rush winding route and five items, 4 October 2026

See [Coast Rush](COAST-RUSH.md) for the behaviour. This changes the race simulation: Coast Rush is now rules version 3 and old-loop bests are archived. Not deployed.

- **135 Node tests passed, none failed, and the two browser checks that need `DARECADE_TEST_CHROMIUM` were skipped; 7/7 Cloudflare integration tests passed.** TypeScript and the Vite build passed with the existing large-bundle warning.
- Route measured from the simulation: 577 units a lap (the old loop was shorter), tightest bend about 15 units radius, sections at least 30 units apart, bends in both directions. Scripted drivers: holding a drift at turbo speed clears the hairpin, the same line without a drift hits the wall.
- Tested in an isolated local Chromium against `.browser/route-qa-data` on port 4195 with a synthetic guest and scripted keyboard input. Three races finished and were server-verified: **1:03.22, 1st/8** (drifting throughout), **1:16.83, 1st/8** (no drift) and **1:23.43, 2nd/8** (late start, no drift). The third used twelve items, including five missiles, and spun rivals seven times. Missile, storm clouds, coconut and spin-outs were seen on screen. No page errors.
- **390×844**: no horizontal overflow. The race cover is 35 px taller than its panel with the longer legend, so its small print scrolls; Race! stays visible.
- **Not verified:** whether the route is fun or the difficulty is right for a person, since all driving was scripted; 320×568 and landscape layouts; the simple (no WebGL) view; how the reused effects sound; a physical phone.
- Balance note: rivals keep their old paces and do not use items, so a player who drifts leads early and then draws only shield, turbo or coconut.

## Coast Rush items, touch, sound and finish, 4 October 2026

See [Coast Rush](COAST-RUSH.md) for the behaviour. The race simulation was not changed.

- **69/69 Node tests passed**; TypeScript and the Vite build passed with the existing large-bundle warning. The Cloudflare integration tests were not re-run.
- Tested in an isolated local Chromium against `.browser/coast-finish-qa-data` on port 4197 with a synthetic guest. With sound switched on from the race cover, a keyboard-driven race finished in **0:46.00, 1st/8, 18/36 shells**. The finish sequence showed WINNER!, place, time, best lap and shells, then gave way to a server-verified result with New best and the lilac cap. A second race (1:04.77, 4th/8) was skipped to results with the button. No page errors in either.
- **390×844 and 320×568**: no horizontal overflow and no modal scrolling; the race view is 526 px and 250 px tall respectively above 124 px steering buttons and a 2×2 pedal pad. **844×390**: no overflow or scrolling after moving the item box clear of the minimap.
- Synthetic pointer events confirmed one pointer sliding GO → DRIFT → ITEM moves the held highlight with it and keeps the kart accelerating, and that lifting clears it.
- **Not verified:** how the music and effects sound, since the automated browser has no listener; touch feel, haptics and performance on a physical phone; the coarse-pointer landscape layout, which the desktop browser does not report.

## Coast Rush steering and wheel fix, 3 October 2026

- Corrected keyboard and on-screen left/right input to match the chase camera. The simulation and replay rules are unchanged; only input mapping and the incorrect track-coordinate comment changed.
- Tyres now roll around a separate axle pivot. Only the front wheels steer; the rear pair remain aligned. Rolling follows distance, so it stops with the kart. Rivals use the same wheel setup, and drift body yaw follows the steering direction.
- **65/65 Node tests passed**, including camera-projection checks around the full track and wheel-axis checks across roll phases, steering angles and stationary frames. TypeScript/Vite build passed with the existing bundle-size warning.
- In an isolated local browser, checked A/D and held pointer left/right buttons at 390px, pause and the rendered wheel alignment. No horizontal overflow. Finished a three-lap race in **59.67s, 2nd/8, 17 shells**, including the manual steering checks; the server accepted the replay. Browser automation needed reconnection during the race; the game completed successfully. This was a desktop browser test, not a physical phone test.

## Coast Rush street race branch, 3 October 2026

- Work is isolated on `codex/coast-rush-grand-prix`. This branch was deployed on 3 October 2026; see HOSTING.md for the version and live checks. Player data, the KayKit model, appearance indices, privacy version and mail configuration are unchanged.
- **63/63 Node tests and 3/3 Cloudflare integration tests passed.** TypeScript/Vite build and Cloudflare dry-run passed; the pre-existing large-main-bundle warning remains. The four other simulations retain version 1. Coast Rush uses version 2 and excludes old two-lap records from new-format competition while preserving historical data and earned medals.
- Tested against `.browser/grand-prix-qa-data` on port 4196 with synthetic guest profiles. Age/consent led to a simple Play now invitation; it opened Coast Rush directly. Shop, hunt, camera tools and extra menus were hidden. Completing a race restored the neighbourhood menus and unlocked the lilac cap exactly once.
- Completed desktop races in **55.13s**, then **46.52s**, both 1st/8 with 18 shells and server-accepted replays. New best appeared after each improvement. Another round opened a fresh countdown without reload. Save your avatar and this score opened the email form; no test email was sent. Seven rivals remained labelled Game character and did not create real player/board records.
- Verified the stationary start without acceleration, three-second countdown, updating place/lap/time, eight-dot minimap, held touch GO, shield slot/use, wall stops, and frozen ticks while paused. Closing mid-race returned to the lobby. Result details included total time, best lap, shells and hit-stop duration.
- Checked **320×568 and 390×844**: no document or modal horizontal overflow; steering, GO, brake, drift, item and pause remained available. Result replay is above the detailed ladder. CPU labels, saved avatar driving and original coastal scenery remained visible.
- Reduce motion disabled the decorative WebGL backdrop and moving flourishes while racing continued. A reduced-motion race completed at **46.25s** and saved. The four other cabinets also completed server-verified browser rounds: Noodle Run 20, Brick Bash 75, Hop Hop 40, Star Swarm 570. No application console errors were observed.
- Browser automation briefly lost its connection. Reconnecting to the same isolated Chromium session showed the completed, saved race; the game itself had continued. These are desktop browser and synthetic-control checks, not physical-iPhone performance or human-fun findings.

## Login email fix, 3 October 2026

- Merged `claude/fix-login-email` without conflicts; retained all five-game tests and racing helpers. Current totals: **57/57 Node tests and 3/3 Cloudflare runtime tests**. TypeScript/Vite build passed with the existing bundle-size warning.
- In fresh local browser sessions at port 4173, an unknown synthetic address displayed the disabled `Send again in 60s` button and produced a guidance outbox message with no URL. A locally registered address received a real login link; consuming it from a separate browser session restored the same player ID, name and avatar choices.
- QA storage was isolated in `.browser/login-email-qa-data`, including its private `mail-outbox`; no existing local player data was changed. No application console errors were observed.
- The new automated tests cover identical API responses for known/unknown addresses, invalid-email rejection, hourly notice suppression, hashed notice keys and expiry cleanup. Existing per-IP rate limits and `PRIVACY_VERSION` are unchanged. Live delivery results and the deployed version are recorded in `HOSTING.md`.

## Arcade UI refresh merge, 3 October 2026

- Merged `claude/arcade-ui-refresh` over Coast Rush. Only `src/main.ts` conflicted: retained the shorter copy and effects lifecycle alongside the five-game catalogue, race construction, time formatting, race results and 15-point daily maximum. The shared simulation, race physics, character model and server scoring were unchanged.
- Added an explicit Coast Rush backdrop palette, matching CSS theme and cosmetic start/score/lap/boost/bump/time/pause hooks. Racing still ranks completed two-lap times, with no points for visual effects. The theme is imported after the racing styles.
- 56 automated tests, TypeScript/Vite production build and both Cloudflare integration tests passed. Vite still reports the existing large-main-bundle warning.
- Played all five games in isolated local Chromium against the local server: Noodle Run 20, Brick Bash 465, Hop Hop 40, Star Swarm 320, Coast Rush 0:43.85. Every result was server-verified. Checked the backdrop, GO splash, changing score/time pills, score pops, pause/resume, large result cards and Brick Bash's final-ten-second warning.
- At 390×844, game screens and results had no horizontal overflow. Mid-round closing removed the backdrop for all five games; the same close checks also passed at 320×740. Added responsive sizing for the longer Coast Rush result time.
- Settings → Reduce motion removed the decorative WebGL backdrop and hid animated pops in all five games while gameplay continued. No application console errors were observed. These are browser viewport checks, not new physical-iPhone testing.

## Coast Rush, 3 October 2026

See [Coast Rush](COAST-RUSH.md) for controls, competition rules and the reference/source distinction.

- 56 automated tests passed, including new race replay, timing, DNF, drift/collision, daily/weekly medals and dare-limit checks. Cloudflare's two integration tests now validate all five games.
- Isolated local Chromium race completed in 42.78 seconds, with 22.28/20.50-second lap splits, three turbos and two bumps. The server replay accepted the finish and saved the personal best. Production player data was not used.
- Saved Royal ranger clothing, lilac colours, bunny ears, a dragon companion in its sidecar and firefly magic were visible in the kart. Both wrist targets align with the steering wheel at neutral and full steering; the seat aligns with the hip joints. The KayKit model file is unchanged.
- Controls remain visible at 320×568, 390×844 and 844×390 without horizontal overflow or hidden pause controls. Steering release clears its held state; pause freezes ticks. Forced race-context loss paused cleanly, resumed in simple view and returned to an intact 3D lobby. Browser sizes do not establish physical-phone performance.
- A populated Coast Rush board displays 0:37.97, 0:41.00 and 0:42.78 in the correct order with +3/+2/+1 pending medals. Compact time cards and rows fit at 320 px. A browser dare opened with the correct 0:37.97 target. These fixtures exist only in the isolated QA database.
- The fifth physical cabinet plays its Blender control interaction and opens Coast Rush. Visible cabinet taps now take priority over the broad invisible Arcade Row hit area; direct pointer interaction was verified. The new cabinet is also available under Play outside.
- All four existing simulations retain their 60-second rules. Prior scores, avatars, consent and account rules remain intact. Five cabinets now offer at most 15 medal points per player per day.

The sections below retain earlier QA observations; this section supersedes their four-game counts and daily maximum.

## Cloudflare hosting — deployed with accounts closed

- Production client build and Wrangler deployment dry run pass; the Worker bundle is approximately 72 KiB before gzip, separate from the static models/client assets.
- **45/45 existing Node tests** still pass after extracting shared account/store logic. The local SQLite/filesystem wrappers preserve existing behaviour and data paths.
- **2/2 Cloudflare runtime integration tests** pass under the pinned Miniflare/workerd runtime. These execute the actual bundled Worker and SQLite Durable Object, with no external email delivery. Coverage includes under-age rejection, Secure cookies, concurrent single-use token consumption, saved looks/account recovery across object eviction, replay validation for all four games, idempotent finish rewards, feedback/export/delete, private-path and origin rejection, request size bounds, persistent IP-bucket limits and the closed launch switch.
- Cloudflare authorization and deployment succeeded on the existing Workers Free plan at https://darecade.daniel-tianwen.workers.dev. Live HTML/model requests return 200 with security headers; health/config requests intentionally return 503 while launch is closed, and private database/server paths return 404. The browser shows the opening-soon screen. Only synthetic local runtime records were used; no live accounts were created and no local profiles were uploaded. Actual email delivery, live gameplay, custom-domain routing, operational recovery and physical-phone checks remain unverified.

## Current My Look and ranking refresh

- **45/45 automated tests pass** and the production TypeScript/Vite build passes. New coverage checks nickname validation before writes, inappropriate-name reports, cosmetic edits cannot add XP/medals, all eight clothing/hair skins, and newest appearance indices/name/gender surviving a database restart.
- The rebuilt Blender character is **3,296,036 bytes**, within the existing 3.5 MB asset budget. Six fitted hairstyles are authored for the cute head; double buns and long layers no longer stretch adult hair meshes. All eight clothing and hair variants retain normalized skin weights.
- Chromium selected all eight choices in each of the outfit, hair, pet and accessory categories (including no pet/magic), verified selected states and server persistence. Rapid successive hair changes and a reload retained the last choice; nickname also survived reload. Four new hair silhouettes, fitted buns/layers and the new pets were visually inspected.
- 320×844, 390×844 and 844×390 browser layouts have no page/dialog horizontal overflow. Wardrobe tabs have 44 px targets; the narrow-phone Pets label was shortened after visual review. A bunny was selected using CDP touch events, not just a scripted click. Companion previews face the camera and drag with the avatar.
- A real browser Hop Hop round finished at 40, was server verified, and showed the Three.js star burst plus separate game score/XP/practice rank. The burst canvas was removed after 3.8 seconds. A separate completed round with reduced motion enabled created no burst canvas. No uncaught app errors in these journeys.
- Synthetic **browser response fixtures only** exercised the weekly/daily podium at ranks 1, 1, 3, the own-rank highlight, weekly 3 / pending +1 / lifetime 19 distinction, and the 40/200 score meter. These numbers were never inserted into the real neighbourhood database. Actual settlement/tie logic remains covered by server tests.
- The central plaza is visibly clear of its three decorative mannequins and podiums. Other decorative activity residents and real shared players remain.
- Evidence: `.browser/look-qa.json`, `.browser/look-final.json`, `.browser/community-look-layers.png`, `.browser/community-look-buns.png`, `.browser/community-final-look-320.png`, `.browser/community-finish-celebration.png`, `.browser/community-fixture-weekly-320.png`, `.browser/community-open-plaza.png`. All test profiles live under `.browser/look-data`; the real data directory was not seeded with test scores.
- **This revision has not been tested on a physical iPhone.** Browser touch emulation does not establish Safari performance, phone temperature or human replay desire. Existing physical-phone feedback describes earlier builds.

## Current accounts and progression revision

- **44/44 automated tests pass**, including a real HTTP server test. Coverage: no account before age/consent, hashed single-use expiring links, session ownership and restart persistence, replay-derived scores for four games, forged/early/malformed result rejection, duplicate rewards, warmup, daily/shared seed eligibility, three outgoing attempts, cross-midnight posted-dare retry rejection, weekly Monday rollover, suspension, export, deletion and retention. HTTP checks cover unauthenticated requests, cross-origin writes, cookie flags, private-file isolation and throttling.
- In Chromium, an under-13 attempt and declined consent created no database profiles. An eligible guest entered, chose an outfit and pet, completed Noodle Run for 20, and received the server-verified first-round cap and XP. Equipping the cap saved the welcome quest completion.
- Account creation used a synthetic email and the private local outbox. Verification preserved the same guest identity and look. After signing out, another identity joined; signing into the original account restored its saved avatar and exact progression. No live email provider was used.
- Four genuine browser rounds were recorded and accepted by server replay: Noodle Run 20, Brick Bash 75, Hop Hop 40 (keyboard jump events), Star Swarm 570. These are test observations, not example scores injected into the real neighbourhood. Warmup was advanced only for synthetic accounts in `.browser/account-data`.
- One eligible test account posted its Noodle Run round. A second account saw the post, played the identical seed and target, and finished a server-verified 20–20 draw. Defender medals stayed unchanged. Attempt/expiry boundaries are separately covered by tests.
- The account/weekly panels fit 320px and 390px layouts without horizontal overflow; age, consent, wardrobe and round-result screenshots were inspected at 390px. Data download, private reporting/hiding and confirmed deletion were exercised through the UI. Deletion removed the account, runs and posted dares and returned to the age gate. No uncaught runtime errors in the completed journeys.
- Screenshots/reports: `.browser/community-age-390.png`, `.browser/community-privacy-390.png`, `.browser/community-saved-look-390.png`, `.browser/community-first-verified-round-390.png`, `.browser/community-account-320.png`, `.browser/community-weekly-390.png`, `.browser/community-shared-dare-result.png`, `.browser/community-browser.json`, `.browser/community-games.json`, `.browser/community-shared.json`.
- Before the main upgrade, a SQLite `VACUUM INTO` snapshot of the two legacy players was checked with `PRAGMA quick_check = ok`. The main server was restarted with the final account service; localhost and LAN returned HTTP 200, and the served welcome gate was checked without creating test players in real storage.
- Physical iPhone testing of these account/game-input changes remains pending. Earlier user reports below concern previous revisions. Live email delivery, public HTTPS hosting, production load/abuse testing and operational privacy readiness are not verified; see ACCOUNTS.md and PRIVACY-REVIEW.md. The large Three.js bundle still produces Vite's advisory chunk-size warning.

## Cute-character revision retained

- At the character-only checkpoint, TypeScript/build succeeded and **29/29 tests passed**; current total is 44/44. Character tests inspect the exported GLB's bone hierarchy, wardrobe bindings, finite normalized skin weights, valid bone indices, absence of imported paint-mask colours, and a 3.5 MB download budget. Scoring tests include daily-only qualification, equal-score ranks, migration preserving past medals, three outgoing attempts, distinct defenders and unlimited incoming challenges.
- The user-provided reference guided a new rounded face, expressive eyes, compact proportions and tailored clothing, on an adapted CC0 Quaternius humanoid rig. The current model is 2,908,380 bytes. Each avatar has an independently cloned skeleton; shared players and decorative residents retain their own looks and motions.
- Browser playback was inspected for reading, swinging, petting Kopi, ringing the bell, dragon climbing and cabinet play. These remain authored clips rather than a physics or hand-contact solver; some reaching/contact poses can still be refined. The final clothing pass removes shoulder trim artifacts.
- Wardrobe layout has no horizontal overflow at 320×740, 390×844, 844×390 and 1440×960. Four outfits were selected with native Chromium-emulated touch; drag-to-turn was captured. This is browser emulation, not an iPhone test.
- A repeated-choice test exposed WebGL context exhaustion in the preview. Preview disposal now explicitly releases its context. After the fix, 29 consecutive outfit replacements preserved both the main world and the preview. No uncaught browser errors were reported in the subsequent checks.
- Chromium frame-rate observations varied from approximately 10 to 144 FPS across the same session, including long idle/throttled intervals. They are not a reliable physical-phone benchmark. The FPS counter now uses actual elapsed time rather than the physics time-step cap. Quality reduction remains automatic.
- The main server serves localhost and **the computer's LAN address on port 4173**. The LAN URL returned HTTP 200 from this computer; the previous LAN address had changed. The user was given the updated iPhone link. Real-iPhone appearance and performance for this cute revision remain pending. Prior iPhone reports below concern earlier character versions.
- Captures and reports: `.browser/character-bench3.png`, `.browser/character-swing.png`, `.browser/character-pet.png`, `.browser/character-bell.png`, `.browser/character-dragon.png`, `.browser/character-cabinet-noodle.png`, `.browser/character-cute-wardrobe-320.png`, `.browser/cute-layout.json`, `.browser/cute-touch.json`. Earlier captures may precede the final shoulder-trim material cleanup.

## Current competition rules

Everyone starts at zero. Daily positive scores qualify for 3/2/1 medals at midnight Singapore time; equal scores share ranks (1,1,3), and inactive days earn nothing new. Maximum 12 medal points per player per day. Lifetime bests remain ghost targets. Each player sends three challenges to different resting/offline neighbours per day; starting or abandoning consumes an outgoing attempt. Incoming challenges are unlimited and never subtract defender points. Wins are separate from medals. All regular arcade games remain unlimited. Existing awarded medals are preserved by migration.

This remains a local shared-server service. Scores now use server replay; account recovery is implemented and tested with a private outbox. Remote live prop/emote animation, live email delivery, public hosting and broader physical-device testing remain unfinished product work. New ranked accounts have a 24-hour warmup; the separate weekly board sums settled medals and resets Monday in Singapore time.

## Historical verification — earlier revisions

The records below describe earlier versions. Their old scoring rules, model sizes, server address and test counts are superseded by the current sections above.
Historical server addresses at verification time: localhost:4173 and the development server at localhost:5173.

## Shared neighbourhood scoring — latest verification

### Welcome quest and phone testing

- **26/26 tests pass.** New checks cover the one-time reward, zero-score eligibility, preserving the current look until equip, reload/skip recovery, malformed progress and existing-save migration.
- The browser completed cabinet walk and Blender interaction → Noodle Run → 20-point finish → cap unlock and +35 bonus XP → cap equipped → path to Kopi. No score threshold is required. The welcome bonus cannot repeat.
- A separate browser with WebGL disabled completed the same first-round reward in 2D.
- Welcome layout passed at 320×740, 390×844, 844×390 and 1440×960: no horizontal overflow, a 48 px primary action and a card clear of bottom navigation. Portrait and landscape captures were inspected.
- Native Chromium-emulated touch moved the player from `(0,10)` to approximately `(-1.55,6.85)`. This is desktop emulation, not physical-phone evidence.
- The feedback form fit 390 px and saved an explicitly labelled synthetic submission to isolated QA storage.
- The main server listens on localhost and the computer's LAN address on port 4173. The LAN URL returned HTTP 200 from this computer. The user identified an iPhone on the same Wi-Fi and received the test link.
- **A physical iPhone Safari test was received on 2 October at 21:49 SGT.** The user confirmed the same-Wi-Fi link opened and submitted a 268-second report. Movement: Easy. Performance: Smooth. The 92 sampled world FPS readings had a median of 60 and a lower-decile value of 59.5. These are sampled world readings, not a continuous game or thermal benchmark.
- Readability: Some were too small. Next step: I had to look for it. Replay interest: Maybe later. The comment reported too many buttons blocking the view. One replay choice was recorded, which does not establish sustained engagement.
- The first recorded round completion was 173.5 seconds after opening the page, beyond the two-minute aspiration. The first welcome-to-cabinet interval was 63.1 seconds; the cause is not established. Additional loading/walking/playing/cancellation markers now help distinguish a future delay.
- **Changes following that report:** phone navigation reduced to Explore, Arcade and More; secondary controls, gifts, camera options and test feedback moved into More; marketing panels hidden after onboarding; larger text and game controls; touch-specific instructions; one compact next-activity prompt; reward/next-action buttons moved above score details. Revised portrait/landscape layout, touch movement, three-button navigation and feedback access were verified in desktop Chromium.
- **Second physical iPhone check:** after receiving the revised layout, the user confirmed “Yes, it feels clearer.” This confirms improved perceived space and next-step clarity for this player. No second structured performance report was received; the FPS figures above belong to the first test. Only one phone/player has been tested; wider device coverage and replay appeal remain unestablished.

- **23/23 automated tests pass**, including the prior 15 game, movement and Blender checks. Eight new server tests cover zero starting values; all four podium awards; exact Singapore midnight settlement; duplicate settlement and result retries; zero-score exclusion; tie order; score snapshots; the three incoming challenge cap shared across games and challengers; daily reset; online/self-challenge rejection; wrong-owner/abandoned results; multiple tabs; disconnect; and SQLite restart persistence/catch-up.
- **Two independent browser guests** started at zero. One completed a real Hop Hop round with 40 points, selected the dragon away activity and rested. The second saw the saved score, started a challenge and completed a real 40-point tied result. The tie was recorded without a win or immediate medal points.
- Two further started-and-abandoned attempts consumed the remaining slots. The UI disabled a fourth challenge, and a direct API retry returned HTTP 400 with the daily cap explanation.
- Navigating all owner tabs away retained the avatar, outfit, dragon activity and score. The other browser saw OFFLINE, one real shared avatar, and successfully inspected it in third person.
- Rankings, Dares and Neighbours passed overflow checks at **320 × 740, 390 × 844 and 1440 × 960**. Board and offline-avatar screenshots were visually inspected. The name label was changed to face the camera after inspection showed it mirrored from behind.
- The production TypeScript/build check passes. Test browser players and scores use a separate database under `.browser/social-data`, not the delivered neighbourhood database.
- Captures: `.browser/social-board-320.png`, `.browser/social-board-1440.png`, `.browser/social-offline-avatar.png`; measured checks in `.browser/social-report.json`.
- Scope: shared guest identities on a local server, not public hosting or account authentication. The server enforces medals and attempts; game scores remain client-reported and need replay validation before competitive production use. Active remote prop interactions/emotes are not synchronized. Earlier checks below describe the previous local-only build where stated.

## Checks completed

- **Production build:** TypeScript checking and Vite production build pass. The production page was opened separately in a fresh Chromium session; no browser errors or warnings were reported on initial load. The Blender dragon was visually confirmed in the rendered scene.
- **Automated logic checks:** 15/15 tests pass. They cover the Singapore midnight gift boundary, Monday weekly reset, duplicate gift rejection, malformed saved data, mission progress, routing around buildings, island boundaries, routes to all five coin positions, migration from two-game saves, runner obstacles/jumps, shooter damage/pickups/boss spawning, and deterministic away poses.
- **Noodle Run:** a real round started, collected a dumpling, ended on collision, and saved a score of 20. A practice dare also completed and showed the remaining score needed to beat its target.
- **Brick Bash:** a real round destroyed bricks, exhausted its lives, displayed 75 points, and saved its personal best. Pause held the displayed timer at 60 across an additional 1.1 seconds before resuming.
- **Hop Hop:** completed a browser round and saved a 40-point personal best. Keyboard jumping was exercised. The JUMP button visibly lifted the runner in the 320 px production viewport.
- **Star Swarm:** completed a browser round with 630 points and verified the saved personal best. Dragging moved the ship in the 320 px production viewport; pause/resume and the results flow were exercised. Boss and shield rules have separate simulation checks.
- **Third-person camera:** verified switching, camera-relative walking (position moved from `(0,10)` to `(0,7.57)`), all five resident inspection panels, close-up zoom and return controls. Native Chromium input changed camera distance from 7.00 to 7.52 by wheel, changed orbit from `(6.28,0.34)` to `(5.68,0.46)` by dragging, and reduced distance to 5.12 through a two-finger pinch. This was browser-emulated input, not a physical phone.
- **Away activities:** all five choices persisted their activity and timestamp, displayed the away banner, and moved the avatar to the expected activity zone. XP, coins, visited places, completed rounds and scores stayed unchanged. A simulated browser offline event started the saved preference; reconnect kept the avatar away until the player chose to return. Reload retained the dragon activity and the exact start timestamp. These checks do not establish real multi-user presence.
- **Blender update:** regenerated both editable `.blend` and runtime `.glb`; visually checked the new stairs, handrails, landing and moving resident in the browser.
- **Walking and interaction:** Explore → Mama Shop walked the avatar across the world and opened the shop on arrival. Explore → Kopi walked to the cat, opened its panel, and updated local progress. Directly clicking a rendered coin walked to it and collected `coin1`.
- **Touch-style movement:** the on-screen joystick was dragged and released using browser pointer input. The measured avatar position changed from `(-8.00, 6.00)` to approximately `(-7.93, 0.23)` during the interaction. The release handler reset the joystick.
- **Customisation and persistence:** outfit, skin tone and hat changed; the resulting avatar was visually checked. A reload retained the look, scores, gift claim and visited locations. Gift selection disabled further selections for the same Singapore day.
- **Narrow layouts:** all twelve panels were checked at **320 × 740**, **390 × 844**, **844 × 390**, and **1440 × 960**. Visible panel entries opened without horizontal overflow; the Mama Shop remains reachable through Explore where its direct card is hidden. New game, resident inspection, third-person and desktop arcade screenshots were inspected.
- **Fallback:** manually switching to 2D retained progress and gift eligibility. A separate browser session forcibly disabled WebGL before page load; the lightweight lobby appeared automatically, and Noodle Run completed successfully there.
- **Asset budget:** the expanded production output is approximately **2.79 MB uncompressed**, including the **1,389,564-byte** original Blender GLB and locally hosted font files. The main JavaScript bundle is approximately 198 KB gzipped. Vite emits its informational warning for a minified JavaScript chunk over 500 KB; it does not block the build.
- **Dependencies:** the installed production dependency audit reported zero known vulnerabilities at verification time.

## Representative captures

The surroundings expansion was checked in the production browser build:

- All six authored Blender scenes loaded, with animation channels for both the player rig and props. Automated checks parse the actual exported GLBs, reject ambiguous track bindings, check finite values, and sample the swing to verify the seat and avatar share the same pendulum motion.
- Dragon climbing/sliding, swing riding, bench reading/page-turning, Kopi petting/tail motion, bell ringing/ripples, and arcade controls/screens were visually inspected during playback. The arcade scene completed and opened the Noodle Run ready screen.
- Clicking the rendered swing seat in the world walked the player over and began its clip. Changing to a lilac outfit before this interaction preserved the selected outfit. Pressing a movement key interrupted the scene, hid its banner, restored the previous camera and returned the player to `(-2,11.9)` on the path.
- After a bench scene completed, pressing E restarted it; Escape stopped it safely. Clip completion restores normal navigation. The Play outside menu and an active swing scene were inspected at 320 px.
- All defined entry and exit points, including four benches and four cabinets, pass structural path checks. This is not a full physics/contact solver; these are authored short scenes, with supported stop/return points.

New captures:

- `art/swing-custom-outfit.png` — direct world interaction with the player's lilac outfit.
- `art/swing-action-320.png` — narrow-screen swing playback and Stop control.
- `art/dragon-slide-action.png` — player sliding down the dragon.
- `art/bench-book-action.png` — seated reading and animated book.
- `art/kopi-petting-action.png` — petting Kopi with a responding cat.
- `art/bell-action.png` — bicycle bell and visual sound ripples.
- `art/arcade-controls-action.png` — player operating the cabinet before a game.
- `art/play-outside-320.png` — mobile activity picker.

- `art/neighbourhood-third-person.png` — avatar-following perspective.
- `art/neighbour-inspection-final.png` — close-up resident outfit/action view.
- `art/dragon-stairs-desktop.png` — Blender stairs and climbing resident.
- `art/arcade-four-games.png` — four playable cabinets.
- `art/hop-touch-320.png` — mobile jump control in use.
- `art/swarm-touch-320.png` — mobile ship movement and pause.
- `art/darecade-lobby.png` — fresh production build, desktop.
- `art/lobby-320.png` — narrow phone lobby.
- `art/wardrobe-320.png` — customisation at 320 px.
- `art/brick-mobile.png` — Brick Bash ready screen.
- `art/brick-result-320.png` — completed Brick Bash round.
- `art/kopi-mobile.png` — cat interaction.
- `art/fallback-320.png` — lightweight lobby.
- `art/lobby-landscape.png` — short landscape viewport.

## Historical prototype limits

Testing used desktop Chromium with resized browser viewports and pointer input. Physical Android/iPhone performance, Safari/Firefox differences, sustained thermal behaviour, and the plan's 30-avatar/30-FPS device target are not verified. The 30-minute reminder is implemented but was not exercised by waiting for a full 30-minute foreground session.

At the time of this historical baseline, the prototype did not implement authentication/logout, public multiplayer, trusted scores, server-side challenge accounting, payments or cloud persistence. The current sections above supersede those account and scoring limits. Away activities resume locally from saved timestamps; a closed browser does not render them for other users. The demo names and scores are clearly identified in their panels. It is not a validated launch of the entire implementation plan.
