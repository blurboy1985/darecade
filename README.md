# Play Simi — meet you downstairs

Play Simi was called Darecade until 5 October 2026, and dares are now called challenges. The web address, mail domain, storage keys, Durable Object name, environment variables and code identifiers keep the old name so that saved accounts and progress carry over; see [PLAN.md](PLAN.md).

A working shared 3D neighbourhood with persistent accounts, saved avatars, server-validated arcade progression and shared challenges, inspired by the supplied Darecade implementation plan. Original Singapore neighbourhood scenery, five playable arcade games, and a hand-built Blender dragon playground.

## Integrated release — 4 October 2026

The current menu has three main actions: Games, Neighbourhood and Menu. Find grouped,
preview-first cosmetics under Menu → My stuff → My look. Ten original themed
sets can be earned through play or bought for S$1.99 each. Support & purchases
also offers one-time S$2, S$5, S$10 and S$50 donations in SGD. Donations grant
no gameplay advantage. See [WARDROBE.md](WARDROBE.md), [PAYMENTS.md](PAYMENTS.md)
and [QA.md](QA.md). PRs #11–16 are integrated; the combined build passes all
166 Node and 8 Cloudflare tests.

## Cloudflare hosting — 3 October 2026

The game is live at **https://playsimi.danielquek.com** (moved on 5 October 2026, see [HOSTING.md](HOSTING.md)); the earlier address, https://darecade.daniel-tianwen.workers.dev, forwards each player there with their character. It runs on Workers Free, with accounts and the persistent SQLite Durable Object binding enabled. Resend sends sign-in links from the verified `hello@darecade.danielquek.com` identity (`hello@playsimi.danielquek.com` after the move) using a private Cloudflare secret. The same support/privacy address has active free Cloudflare forwarding to the operator's verified inbox. Live checks verified age/consent rejection, avatar persistence, a replay-validated practice round, duplicate reward protection, weekly-board access, export and disposable-profile deletion. Resend reports the single approved test email as delivered, and the operator confirmed Gmail receipt and successful entry to the neighbourhood through its sign-in link. See [HOSTING.md](HOSTING.md) for details and remaining operational checks. No paid service or domain was purchased. The local Node service and its data remain supported.

## Connected progression — 3 October 2026

The welcome check, age/privacy consent, guest-to-email account linking, saved avatar and progression, input-replay score validation, saved-score challenges, weekly medals, reports, data download and deletion are connected to the server. See [ACCOUNTS.md](ACCOUNTS.md) for setup, fairness rules, optional daily award emails and recovery, and [PRIVACY-REVIEW.md](PRIVACY-REVIEW.md) for the pre-launch review.

The local server uses a **private local test outbox**; the hosted service uses Resend for live email. New verified progress starts fresh; previous browser saves are archived locally and legacy medal totals are preserved. The 3 October launch checks passed **65/65 Node tests and 3/3 Cloudflare runtime tests**, plus local browser-verified arcade, shared challenge and account/privacy journeys and the live launch checks above.

## Invite a friend — 4 October 2026

Every player has an invite link. A new friend who follows it and finishes a first round earns 30 XP for both players, for up to five friends. See [INVITES.md](INVITES.md).

## Open Stage — 4 October 2026

Simi Plaza, in the middle of the island, now has a stage. A forty-second rhythm show with the player's avatar dancing under the lights earns up to 45 XP a day. See [STAGE.md](STAGE.md).

## East Side — 4 October 2026

A second district east of the island adds three facilities with non-arcade activities: a Fishing Jetty, a Hoops Court and Community Plots. Fishing and hoops are server-replayed rounds with three.js scenes that can be played as challenges; they have no daily boards or medals. See [EAST-SIDE.md](EAST-SIDE.md).

## Run it

### Worlds and scaling

Records keeps accounts, scores, medals, challenges and moderation in the existing `Neighbourhood` Durable Object named `darecade-main-v1`. Shared results are cached for 30 seconds and refreshed on relevant events. The new SQLite `World` class uses the `WORLD` binding and additive `v2` migration; `v1` stays unchanged. Each world has hibernating WebSockets, compact movement updates up to 5 Hz, interpolation, and a two-second HTTP fallback. Empty rooms stop scheduling work and hibernate.

Your first visit auto-joins the fullest world below 25 players without adding a picker before the first game. The top bar shows your world and short room code. Choose Neighbourhood → Change world, enter a code such as W3, or use Join friend to visit a neighbour, up to a hard cap of 30. Accounts and results follow you between worlds. Blocks, suspensions and deletion apply across all worlds. Node preview uses HTTP polling for rooms.

Capacity is about 25 players per world. The original Free-plan estimate of roughly 100 player-hours/day is an optimistic light-use target, not a guarantee. Twenty incoming WebSocket messages bill as one request, while SQL reads, writes, HTTP/RPC calls and active duration have separate quotas. The 150-player load run with 20,000 stored runs exceeded the SQL budget when extrapolated to 100 player-hours; that target is not supported by this workload on Free. Workers Paid starts at US$5/month with possible overages; upgrading is the owner's decision. [HOSTING.md](HOSTING.md#capacity-and-cost) explains the architecture, migration, current pricing sources and quota limits.

Run `npm run load:test` after building to test 150 synthetic players for five minutes against a disposable local `wrangler dev`. It never accepts a production URL. Reports include message rates, errors, p95 snapshot interval, SQL usage and an estimated local Records CPU average. See [the load-test instructions](HOSTING.md#local-load-test) for commands and measurement limits.

### First-round welcome quest

The first Play opens Coast Rush after the age and consent checks. A world is assigned automatically in the background, with no room picker before the first game. Completing a first round at any score unlocks the Lilac cap and grants +35 bonus cosmetic XP once, alongside the normal +20 round XP. “Make it yours” opens the optional character setup. “Play again” and “Explore” remain available. Skipping, interrupted walks and reloads retain progress. The 2D fallback offers the same reward. The reward is issued once per server profile after a verified round; existing preview saves are archived during the server-progression migration.

### Real-phone playtest

The current phone link is `http://192.168.1.109:4173/?playtest=1&revision=look12`, for an iPhone on the same home network. The server keeps its localhost listener and additionally binds this explicit LAN address when `LAN_HOST` is set. No public tunnel or internet hosting is created. The LAN address can change after reconnecting the computer. Keep the server running during the test.

Explore for roughly two minutes, then tap **Menu → Settings → Preferences → Phone test** on the phone. Only an explicit Save sends the report. It includes device/browser details, movement/readability/performance observations, clarity of the next step, desire for another round, optional notes, quest timings and sampled world FPS. Reports save in `data/playtests/`, outside the public files. Desktop synthetic reports use isolated QA storage and are never physical-device or human-fun evidence. Replay desire is self-reported; replay clicks are recorded independently.

The first physical iPhone test found easy movement and smooth rendering but crowded controls, small text and an unclear next action. The current HUD uses Games, Neighbourhood and Menu on desktop and phone. Menu groups have three choices; games, outdoor activities, emotes and quests show up to three choices per page. First-round results place the next action above score details. See QA.md for the measured findings and remaining device-test limits.

A successful local HTTP check does not establish phone reachability. Windows denied adding a firewall rule during setup; existing Node inbound allow rules were present and left unchanged. Wi-Fi isolation or firewall settings may still affect the phone connection.

Windows PowerShell, from this folder:

```powershell
npm install
npm run build
npm start
```

Open http://127.0.0.1:4173. The server binds only to this computer. This build uses Node’s built-in SQLite support and was verified on Node 25.7.0. For development, keep `npm start` running and run `npm run dev` in a second PowerShell terminal; port 5173 proxies its API to 4173.

```powershell
npm test
npm run build
npm run preview
```

The production site is emitted to `dist/`. `npm run preview` serves it at http://127.0.0.1:4173. No external account, API keys, database service, Blender installation, or remote font service is needed. SQLite data is created automatically in `data/neighbourhood.sqlite`; keep this folder to retain guest identities, scores and medals.

## What works

- Original isometric neighbourhood: void-deck Arcade Row, Simi Plaza, Mama Shop, wardrobe booth, shared daily board, Pocket Garden, Kopi the cat, and dragon playground.
- Click-to-walk routes around buildings, WASD/arrows, touch joystick, proximity interactions, orbit controls, zoom, and a clear player marker. Space jumps; E interacts with the nearby location. Explore provides accessible navigation to each destination.
- Five games with keyboard and touch controls, pause/resume, saved bests and shared challenges. Noodle Run, Brick Bash, Hop Hop and Star Swarm have rounds up to 60 seconds. [Coast Rush](COAST-RUSH.md) is an original eight-kart street race: three laps of a winding route, seven labelled game characters, your saved avatar driving, drift tiers, five random crate items (shield, turbo, missile, storm, coconut), shells and fastest-time rankings.
- A third-person perspective follows your avatar with camera-relative walking, drag-to-orbit, wheel/pinch zoom and building collision checks. Switch back to the original bird’s-eye view at any time. Inspect a resident to follow their action and examine their outfit.
- Five animated example residents jog, climb and slide, dance, sit on a bench and play a cabinet. Accessories, garden paths, flowers, bunting and moving pigeons add neighbourhood activity. The Blender playground has a stair flight, handrails and a slide landing matched to the animation route.
- Choose an away activity, save the preference or step away immediately. Closing the page and browser disconnect events save the selected activity and its start time; reopening reconstructs its current phase. No away XP, coins, visits or game scores are awarded.
- Direct surroundings interactions: tap a prop, press E nearby, or use **Play outside**. Walk to the dragon and climb/slide, ride the new swing, sit and open a book on any of four benches, pet Kopi, ring the bicycle bell, or operate any of five arcade cabinets before its game opens. Six original Blender animation scenes synchronize the player's body and the props. Camera orbit/zoom remain available; Stop, Escape, movement keys, or opening another panel safely interrupt the action. The player's outfit stays intact.
- Chibi characters from the CC0 KayKit Adventurers pack: eight outfits (ranger, wizard, knight and explorer, each with or without a cape), eight heads and hats, six outfit colours, eight skin tones, earnable hats, seven companion pets and seven animated accessory choices. Clothing and effects are cosmetic only. Six avatar actions, a kickable ball and a bicycle bell remain available.
- Five reachable treasure coins, a free Sprout hat on completion, a named sticker album, three claimable exploration missions, XP and cosmetic level progression.
- Pick one of three named daily gifts. Daily eligibility uses Singapore midnight; the weekly coin hunt resets on Monday, Singapore time. Earned items persist. No missed-day penalty.
- Day, golden-hour and night lighting, plus an option to follow Singapore time. Sound is synthesized locally, enabled for new profiles after a browser gesture, and can be muted; existing sound preferences are preserved. Reduced decorative motion, a 30-active-minute break reminder, and a functional 2D lobby when WebGL fails or is disabled in Settings.
- Local persistence with malformed-save recovery. Fonts and art are served locally. The background world stops rendering while an activity panel is open.

## Short onboarding and three-action menus

Games, Neighbourhood and Menu are the three persistent primary world actions. A nearby interaction replaces Neighbourhood while available. Stop and I’m back replace the third world action during an activity or away state. An unobtrusive upfront camera button toggles bird's-eye/third-person view; Menu uses a gear. Player inspection hides the dock and offers three actions plus Close.

Menu pages have at most three main action buttons. Larger game, activity, emote and quest lists use three-item pages. Wardrobe choices, rankings filters, neighbours and world destinations use labelled native form inputs. Back, Close, pagination are navigation controls; text fields, dropdowns and checkboxes are form inputs. These do not count as additional main actions. Game movement controls remain available during play.

The age check and explicit consent are unchanged. The first privacy screen has a short summary and an expandable full notice. Email saving stays optional; Skip for now returns straight to the world. Account data export, consent withdrawal, deletion and player reporting remain available.

The changes have automated structural and request-flow coverage. New browser-only tests can run with `DARECADE_TEST_CHROMIUM=/path/to/chromium npm test`. They are skipped by default. Visual phone and desktop verification is still required; the current test environment cannot launch Chromium or reach the local preview from its browser.

## Controls

| Action                 | Control                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| Walk                   | WASD, arrows, tap the ground, or mobile joystick                   |
| Walk to a destination  | Neighbourhood → choose a spot                                            |
| Nearby interaction     | E or the on-screen location button                                 |
| Jump                   | Space                                                              |
| Change the view        | Upfront camera button; also Menu → Settings → Camera & controls |
| Third-person view      | V or Camera & controls; drag to orbit; scroll/pinch to zoom        |
| Inspect an outfit      | Menu → Friends → Neighbours, or click one in the world; Esc returns    |
| Away activity          | Menu → Settings → Account & safety → Step away                  |
| Play with surroundings | Play outside, click a prop, or press E at its nearby prompt        |
| Stop an interaction    | Stop, Escape, or a movement key; the player returns to the path    |
| Noodle Run             | Arrows/WASD, swipe, or on-screen direction buttons                 |
| Brick Bash             | A/D, left/right, drag, or on-screen left/right buttons             |
| Hop Hop                | Space, W, up arrow, tap the game or the JUMP button                |
| Star Swarm             | WASD/arrows, drag the ship or on-screen directions; automatic fire |
| Coast Rush             | W/up to accelerate; A/D steer; S/down brake; Space drift; E item; matching touch buttons |
| Pause a game           | P or Pause; losing focus pauses automatically                      |

## Scope and remaining product work

The project supports local Node preview and Cloudflare hosting. Independent browser profiles share saved accounts and rankings through Records and see live avatars within their selected world. Five community characters remain decorative and are excluded from competition. Guest identity uses an HttpOnly cookie; clearing cookies creates a new player. Email-link account recovery and public hosting are implemented; friend leagues and purchasing remain outside this release.

The server owns medal awards, challenge limits, score snapshots and idempotent result storage. Game scores are derived by server input replay, with seeded rules, elapsed-time and ownership checks. Valid-input bots and collusion are still possible; this is not approval for valuable competitive prizes. Cloudflare worlds send movement changes at up to 5 Hz with a 150 ms interpolation buffer. If WebSockets fail twice, the same world supports two-second HTTP polling. Resting/offline neighbours use saved activity snapshots. Keep the server running for other visitors; clients cannot see the neighbourhood if its server is stopped. The deployment history is in HOSTING.md; scaling PRs require separate deployment approval.

Accounts, the neutral age check, server run replay, privacy/consent and reporting now work on the existing Node/SQLite service. The plan's Supabase migration, payments, Holiday Pass, community rooftop unlock and dated seasonal releases remain separate product work. The Pocket Garden is accessible now; it is not presented as an unlocked community rooftop.

The plan was used as design context. Its dates, legal statements, commercial assumptions, and external service decisions were not treated as instructions to register accounts, purchase services, publish publicly, or claim regulatory compliance.

## Source map

- `src/world.ts`: scene construction, original procedural art, Blender asset loading, material batching, navigation, movement, lighting and animations.
- `src/navigation.ts`: bounded grid routing and collision checks.
- `src/main.ts`: accessible UI panels, server-connected progression, gift and game flows, controls and sound.
- `src/games.ts` and `shared/simulation.ts`: fixed-step game input recording, deterministic rules and server replay.
- `src/action-games.ts`: Hop Hop and Star Swarm simulation and Canvas rendering.
- `shared/racing.ts`: deterministic Coast Rush physics and race-time encoding.
- `src/racing-game.ts`, `src/race-view.ts`: racing controls/replays and the separately loaded Three.js track/driver view.
- `src/catalog.ts`: game and away-activity definitions.
- `src/neighbourhood.ts`: resident presets and timestamp-based activity routes and poses.
- `src/interactions.ts`: prop locations, Blender clip loading, synchronized playback and animation retargeting to the player's current avatar.
- `src/state.ts`: saved-state validation, Singapore date boundaries, unlocks and mission progress.
- `src/style.css`, `src/neighbourhood.css`: responsive interface, inspection/away controls and locally hosted fonts.
- `tests/core.test.ts`: date-boundary, gift, save recovery, mission and reachability checks.
- `tests/neighbourhood.test.ts`: save migration, new game rules, and activity reconstruction checks.
- `tests/interactions.test.ts`: exported player/prop animation bindings, swing synchronization and reachable action entry/exit points.
- `scripts/browser-audit.js`: browser-side narrow-screen panel audit, used with the installed agent-browser QA tool.
- `scripts/neighbourhood-audit.js`: browser-side inspection, movement, away, reward and disconnect checks.
- `scripts/camera-input-audit.cjs`: native Chromium wheel, drag and two-finger pinch checks in an isolated QA browser.

## Blender asset

`art/dragon-playground.blend` is the editable master. `public/models/dragon-playground.glb` is the runtime model. Both were generated from the original script `scripts/build_dragon.py`; the playground and arcade art are original. Avatars use original Blender chibi meshes and painted faces on the compatible CC0 KayKit rest skeleton; see `art/characters/chibi/README.md` and `art/characters/CREDITS.md`.

To rebuild the model on this Windows machine:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python scripts/build_dragon.py
```

The dragon is an original stylised neighbourhood playground inspired by Singapore's mosaic-playground tradition. It is not a dimensionally accurate survey or replica of a specific monument. Tiles, rounded snout, friendly eyes, arch tunnel, horns, steps, and slide remain editable in Blender.

The six interaction masters are `art/interactions/{swing,bench,pet,bell,arcade,dragon}.blend`. Each contains an animated reference avatar and prop keyframes. The matching GLBs in `public/models/interactions/` include those tracks; the browser hides the reference meshes and transfers their motion to the customized player. Original clips range from 3.2 to 9 seconds and share a clock for player and scenery. The six runtime assets total approximately 531 KB.

To regenerate the interaction scenes (Windows PowerShell):

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python scripts/build_interactions.py
```

DM Sans and Space Grotesk are distributed under the SIL Open Font License; copies are in `public/fonts/`. JavaScript dependencies retain their respective package licences.

## Verification

See `QA.md` for checked behaviours, screenshots, and limits. Mobile browser emulation is not a substitute for testing on physical Android and iOS hardware before launch.

## Daily medals and offline challenges

- Everyone begins with zero shared game scores and zero medal points. Old browser-only bests are not imported into competition. Cosmetic XP is separate.
- At midnight Singapore time, the top three ranks based on **positive scores completed that day** in each game earn +3 gold, +2 silver and +1 bronze. Equal scores receive equal ranks and points (for example, 1, 1, 3). A player can earn up to 15 points per day. A score submitted earlier that day can earn its award while the player is offline; an inactive day earns no new medals. Lifetime bests remain challenge targets. Lifetime medal totals remain saved. A separate weekly board resets on Monday at 00:00 SGT and retains last week’s standings.
- Awards use each closed day’s score snapshot, are recorded only once, and catch up after a server restart. No points are given merely for opening the board.
- Each challenger has **three outgoing attempts per Singapore day**, against three different resting/offline neighbours across all games. Starting or abandoning uses the challenger's allowance. Incoming challenges are uncapped, so another player cannot exhaust your defender slots. Defenders never lose points. Regular arcade rounds remain unlimited. The allowance resets at midnight Singapore time.
- Challenge targets snapshot the defender’s saved best on acceptance. A strictly higher score wins; a tie is not a win. Wins are recorded separately with no extra medal points. Challenger scores improve their verified personal best; every verified round by an email account, challenges included, enters the daily ranked board. A reserved round expires after ten minutes.
- A heartbeat preserves outfit, away activity and position. A closed page signals departure; a lost connection becomes offline after 15 seconds. Another active tab keeps that guest online. Away avatars stay available after restart.
- `npm test` includes isolated in-memory database tests. Browser QA uses `.browser/social-data`, separate from the actual neighbourhood data. `PORT` and `DARECADE_DATA` environment variables allow an isolated QA server.


## Wardrobe, magic and sound expansion — 3 October 2026

- **Outfits (24):** the eight KayKit sets plus mix-and-match tops, legs and capes (for example Spellblade, Battle mage, Forest druid). See `bodySets` in `src/character.ts`.
- **Heads & headgear (28):** five KayKit heads, their helmet/wizard/bear hats in new combinations, and 17 procedural pieces in `src/headgear.ts` (ears, flower crown, party hat, headphones, propeller cap, viking horns, tiara, antlers and more).
- **Pets (25):** the original seven plus otter, penguin, panda, red panda, hamster, hedgehog, frog, turtle, duckling, corgi, sheep, axolotl, unicorn foal, phoenix, slime, ghost, merlion cub and jellyfish (`src/pets.ts`), each with its own movement style.
- **Magic (26):** rebuilt in `src/magic.ts` as glowing meshes plus a small sparkle-particle shader: stardust trails, snow, sakura, aurora, embers, lightning, glitter rain, hearts, music notes, rune circle, galaxy orbit, angel and dragon wings, ice crystals, wisps, starfall, rainbow comet, moonbeam and forest spirits.
- Saved looks keep their meaning: every list kept its first eight entries and only grew. Server validation reads the new list lengths from `src/appearance.ts`.
- **Sound (`src/audio.ts`):** original music and effects synthesised live with Web Audio — no audio files or licences. Music has three moods that change on a bar line: mellow lo-fi by day, soft pads and celesta at night/dusk, and chiptune while a game is open. Effects cover menus, footsteps, coins, gifts, level-ups, wardrobe changes, each pet, the bell, swing, slide, bench and cabinet, plus per-game events (eat, brick, paddle, jump, hits, explosions, boss, power-up, win). Sound stays opt-in; Settings has separate **Sound effects** and **Background music** switches. Game sounds only read the simulation, so server replay validation is unchanged.

## Original chibi character art — 5 October 2026

The game loads `public/models/neighbour-chibi.glb`. Its editable master is `art/characters/chibi/simi-chibi.blend`, with a reproducible Blender builder in `scripts/build_chibi_character.py`. Four original outfit and hair families share the existing 41-bone rest hierarchy, so saved cosmetic indices and interaction poses continue to work. Painted faces include blink and smile morphs; skin and outfit colours remain customizable. The former KayKit GLB is retained only as the CC0 skeleton input to the builder.

For provenance, topology budgets and rebuilding, see [the character source notes](art/characters/chibi/README.md). For local browser comparisons and the actual game with synthetic accounts, see [art verification](art/characters/ART-QA.md).

## KayKit character swap — 3 October 2026

Avatars now use the free KayKit Adventurers pack (CC0). `scripts/build_kaykit_character.mjs` merges the Knight, Barbarian, Mage, Rogue and hooded Rogue parts onto one shared rig and strips weapons and baked clips, giving a ~0.7 MB `public/models/neighbour-kaykit.glb` (the previous model was 3.3 MB). `src/character.ts` keeps the same avatar API: the existing arm/leg/head controls and Blender interaction scenes drive the KayKit bones, the skin and main outfit swatches are tinted per player, and the hips lift while seated so benches, the swing and the slide line up. Saved clothing/hair indices are unchanged in range but now point to KayKit outfits and heads.

Rebuild (Windows PowerShell, after placing the five KayKit Character GLBs in `art/characters/kaykit/`):

```powershell
node scripts/build_kaykit_character.mjs
```

## Cute character revision — 3 October 2026 (retired)

The active master is `art/characters/neighbour-cute.blend`, exported by `scripts/build_cute_character.py`. It adapts CC0 connected humanoid topology and hairstyles, with a new rounded face, large eyes, compact proportions, eight tailored outfit variants and cream trainers. The approximately 3.30 MB GLB includes all choices. `src/character.ts` clones independent skeletons for each neighbour and retargets the movement and Blender interaction timelines to shoulders, elbows, wrists, hips and knees. Wardrobe previews support drag-to-turn and release their WebGL contexts when replaced.

To rebuild (Windows PowerShell):

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python scripts/build_cute_character.py
npm run build
```

Increment the model URL revision in `src/character.ts` when exporting a changed model, so returning browsers fetch the new asset. The model source folder must be present to rebuild; Blender is unnecessary for normal play. See `art/characters/CREDITS.md` for provenance.


## My Look and scoring refresh — 3 October 2026

My Look has a server-saved nickname (2–20 letters/numbers/spaces/hyphens), eight KayKit outfits and eight head options. Gender is not collected. Mix any head with any outfit; clothes include ranger, wizard, knight and explorer styles, with or without a cape.

Seven companions include a bunny, fox, small dragon and owl; seven magic choices include a moon halo, crystal crown, rainbow ribbon and bubbles. A lightweight Three.js star burst celebrates completed rounds, releases its GPU resources, and respects reduced motion and 2D mode. The three decorative podium mannequins have been removed from the central plaza; actual shared players remain.

Rankings have separate weekly and daily views, tied-rank podium cards and a personal summary showing awarded weekly medals, pending midnight medals and lifetime medals. Round results distinguish game score, cosmetic XP and daily rank. Existing server scoring and Singapore reset rules are unchanged. Nicknames are public; email, link and phone-like strings are rejected, and inappropriate-name reporting uses the existing private report/hide flow. Free-form names still require operator moderation before a public launch.
