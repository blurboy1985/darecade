# Darecade — meet you downstairs

A working shared 3D neighbourhood with persistent accounts, saved avatars, server-validated arcade progression and shared dares, inspired by the supplied Darecade implementation plan. Original Singapore neighbourhood scenery, four playable arcade games, and a hand-built Blender dragon playground.

## Cloudflare hosting — 3 October 2026

The site is deployed at **https://darecade.daniel-tianwen.workers.dev** on Workers Free, with the persistent SQLite Durable Object binding. **It currently shows an opening-soon screen; gameplay and accounts remain closed** until sign-in email and privacy contact settings are complete. HTTPS assets, closed-launch responses and private-path protection were verified live. See [HOSTING.md](HOSTING.md) for the remaining setup and verification steps. No paid service or domain was purchased. The local Node service and its data remain supported.

## Connected progression — 3 October 2026

The welcome check, age/privacy consent, guest-to-email account linking, saved avatar and progression, input-replay score validation, posted dares, weekly medals, reports, data download and deletion are connected to the server. See [ACCOUNTS.md](ACCOUNTS.md) for setup, fairness rules and recovery, and [PRIVACY-REVIEW.md](PRIVACY-REVIEW.md) for the pre-launch review.

The local server uses a **private local test outbox**; live email delivery is not configured. The hosted service stays closed until email and privacy disclosure settings are supplied. New verified progress starts fresh; previous browser saves are archived locally and legacy medal totals are preserved. Current checks: **45/45 Node tests and 2/2 Cloudflare runtime tests**, plus local browser-verified arcade, shared dare and account/privacy journeys.

## Run it

### First-round welcome quest

The optional welcome quest guides players to Noodle Run, plays the Blender cabinet interaction, and opens a short round. Completing a first round at any score unlocks the Lilac cap and grants +35 bonus cosmetic XP once, alongside the normal +20 round XP. “Wear my cap & meet Kopi” equips it and guides the player to the cat. “Another round” remains available. Skipping, interrupted walks and reloads retain progress. The 2D fallback offers the same reward. The reward is issued once per server profile after a verified round; existing preview saves are archived during the server-progression migration.

### Real-phone playtest

The current phone link is `http://192.168.1.109:4173/?playtest=1&revision=look12`, for an iPhone on the same home network. The server keeps its localhost listener and additionally binds this explicit LAN address when `LAN_HOST` is set. No public tunnel or internet hosting is created. The LAN address can change after reconnecting the computer. Keep the server running during the test.

Explore for roughly two minutes, then tap **More → Phone test · feedback** on the phone. Only an explicit Save sends the report. It includes device/browser details, movement/readability/performance observations, clarity of the next step, desire for another round, optional notes, quest timings and sampled world FPS. Reports save in `data/playtests/`, outside the public files. Desktop synthetic reports use isolated QA storage and are never physical-device or human-fun evidence. Replay desire is self-reported; replay clicks are recorded independently.

The first physical iPhone test found easy movement and smooth rendering but crowded controls, small text and an unclear next action. The revised phone HUD uses Explore, Arcade and More, with secondary actions inside More. First-round results place the next action above score details. See QA.md for the measured findings and remaining device-test limits.

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

- Original isometric neighbourhood: void-deck Arcade Row, Dare Plaza, Mama Shop, wardrobe booth, shared daily board, Pocket Garden, Kopi the cat, and dragon playground.
- Click-to-walk routes around buildings, WASD/arrows, touch joystick, proximity interactions, orbit controls, zoom, and a clear player marker. Space jumps; E interacts with the nearby location. Explore provides accessible navigation to each destination.
- Four games with rounds of up to 60 seconds, keyboard and touch controls, pause/resume, retries, saved personal bests, and shared score challenges: Noodle Run (snake), Brick Bash (brick breaker), Hop Hop (rooftop runner with crates and gaps), and Star Swarm (auto-fire shooter with shields, three lives and a boss).
- A third-person perspective follows your avatar with camera-relative walking, drag-to-orbit, wheel/pinch zoom and building collision checks. Switch back to the original bird’s-eye view at any time. Inspect a resident to follow their action and examine their outfit.
- Five animated example residents jog, climb and slide, dance, sit on a bench and play a cabinet. Accessories, garden paths, flowers, bunting and moving pigeons add neighbourhood activity. The Blender playground has a stair flight, handrails and a slide landing matched to the animation route.
- Choose an away activity, save the preference or step away immediately. Closing the page and browser disconnect events save the selected activity and its start time; reopening reconstructs its current phase. No away XP, coins, visits or game scores are awarded.
- Direct surroundings interactions: tap a prop, press E nearby, or use **Play outside**. Walk to the dragon and climb/slide, ride the new swing, sit and open a book on any of four benches, pet Kopi, ring the bicycle bell, or operate any of four arcade cabinets before its game opens. Six original Blender animation scenes synchronize the player's body and the props. Camera orbit/zoom remain available; Stop, Escape, movement keys, or opening another panel safely interrupt the action. The player's outfit stays intact.
- Cute Blender-built characters with a connected humanoid skeleton, expressive eyes, eight outfits, eight hairstyles, six outfit colours, eight skin tones, earnable hats, seven companion pets and seven animated accessory choices. Clothing and effects are cosmetic only. Six avatar actions, a kickable ball and a bicycle bell remain available.
- Five reachable treasure coins, a free Sprout hat on completion, a named sticker album, three claimable exploration missions, XP and cosmetic level progression.
- Pick one of three named daily gifts. Daily eligibility uses Singapore midnight; the weekly coin hunt resets on Monday, Singapore time. Earned items persist. No missed-day penalty.
- Day, golden-hour and night lighting, plus an option to follow Singapore time. Sound is opt-in and synthesized locally. Reduced decorative motion, a 30-active-minute break reminder, and a functional 2D lobby when WebGL fails or is disabled in Settings.
- Local persistence with malformed-save recovery. Fonts and art are served locally. The background world stops rendering while an activity panel is open.

## Controls

| Action                 | Control                                                            |
| ---------------------- | ------------------------------------------------------------------ |
| Walk                   | WASD, arrows, tap the ground, or mobile joystick                   |
| Walk to a destination  | Explore → choose a spot                                            |
| Nearby interaction     | E or the on-screen location button                                 |
| Jump                   | Space                                                              |
| Change the view        | Bottom-right rotate, compass reset, and zoom buttons               |
| Third-person view      | V or the camera button; drag to orbit; scroll/pinch to zoom        |
| Inspect an outfit      | Neighbours → a resident, or click one in the world; Esc returns    |
| Away activity          | Step away → choose an activity → Save & step away                  |
| Play with surroundings | Play outside, click a prop, or press E at its nearby prompt        |
| Stop an interaction    | Stop, Escape, or a movement key; the player returns to the path    |
| Noodle Run             | Arrows/WASD, swipe, or on-screen direction buttons                 |
| Brick Bash             | A/D, left/right, drag, or on-screen left/right buttons             |
| Hop Hop                | Space, W, up arrow, tap the game or the JUMP button                |
| Star Swarm             | WASD/arrows, drag the ship or on-screen directions; automatic fire |
| Pause a game           | P or Pause; losing focus pauses automatically                      |

## Scope and remaining product work

This is a shared local-server prototype, not a deployed public service. Multiple independent browser profiles connected to the same server see saved player avatars and rankings. Five community characters remain decorative and are excluded from competition. Guest identity uses an HttpOnly cookie; clearing cookies creates a new player. Email-link account recovery is implemented; friend leagues, purchasing and public hosting are not configured.

The server owns medal awards, challenge limits, score snapshots and idempotent result storage. Game scores are derived by server input replay, with seeded rules, elapsed-time and ownership checks. Valid-input bots and collusion are still possible; this is not approval for valuable competitive prizes. Online positions update every two seconds. Remote active prop/emote animation is not yet synchronized; resting/offline activities are reconstructed from saved timestamps. Keep the server running for other visitors; clients cannot see the neighbourhood if its server is stopped. No internet hosting was configured.

Accounts, the neutral age check, server run replay, privacy/consent and reporting now work on the existing Node/SQLite service. The plan's Supabase migration, production hosting, payments, Holiday Pass, community rooftop unlock and dated seasonal releases remain separate product work. The Pocket Garden is accessible now; it is not presented as an unlocked community rooftop.

The plan was used as design context. Its dates, legal statements, commercial assumptions, and external service decisions were not treated as instructions to register accounts, purchase services, publish publicly, or claim regulatory compliance.

## Source map

- `src/world.ts`: scene construction, original procedural art, Blender asset loading, material batching, navigation, movement, lighting and animations.
- `src/navigation.ts`: bounded grid routing and collision checks.
- `src/main.ts`: accessible UI panels, server-connected progression, gift and game flows, controls and sound.
- `src/games.ts` and `shared/simulation.ts`: fixed-step game input recording, deterministic rules and server replay.
- `src/action-games.ts`: Hop Hop and Star Swarm simulation and Canvas rendering.
- `src/catalog.ts`: four-game and away-activity definitions.
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

`art/dragon-playground.blend` is the editable master. `public/models/dragon-playground.glb` is the runtime model. Both were generated from the original script `scripts/build_dragon.py`; the playground and arcade art are original. Character body topology, skeleton and base hairstyles use the CC0 Quaternius Universal Base Characters pack; see `art/characters/CREDITS.md`.

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
- At midnight Singapore time, the top three ranks based on **positive scores completed that day** in each game earn +3 gold, +2 silver and +1 bronze. Equal scores receive equal ranks and points (for example, 1, 1, 3). A player can earn up to 12 points per day. A score submitted earlier that day can earn its award while the player is offline; an inactive day earns no new medals. Lifetime bests remain challenge targets. Lifetime medal totals remain saved. A separate weekly board resets on Monday at 00:00 SGT and retains last week’s standings.
- Awards use each closed day’s score snapshot, are recorded only once, and catch up after a server restart. No points are given merely for opening the board.
- Each challenger has **three outgoing attempts per Singapore day**, against three different resting/offline neighbours across all games. Starting or abandoning uses the challenger's allowance. Incoming challenges are uncapped, so another player cannot exhaust your defender slots. Defenders never lose points. Regular arcade rounds remain unlimited. The allowance resets at midnight Singapore time.
- Challenge targets snapshot the defender’s saved best on acceptance. A strictly higher score wins; a tie is not a win. Wins are recorded separately with no extra medal points. Challenger scores improve their verified personal best; only eligible scores matching today’s seed enter the daily ranked board. A reserved round expires after ten minutes.
- A heartbeat preserves outfit, away activity and position. A closed page signals departure; a lost connection becomes offline after 15 seconds. Another active tab keeps that guest online. Away avatars stay available after restart.
- `npm test` includes isolated in-memory database tests. Browser QA uses `.browser/social-data`, separate from the actual neighbourhood data. `PORT` and `DARECADE_DATA` environment variables allow an isolated QA server.


## Cute character revision — 3 October 2026

The active master is `art/characters/neighbour-cute.blend`, exported by `scripts/build_cute_character.py`. It adapts CC0 connected humanoid topology and hairstyles, with a new rounded face, large eyes, compact proportions, eight tailored outfit variants and cream trainers. The approximately 3.30 MB GLB includes all choices. `src/character.ts` clones independent skeletons for each neighbour and retargets the movement and Blender interaction timelines to shoulders, elbows, wrists, hips and knees. Wardrobe previews support drag-to-turn and release their WebGL contexts when replaced.

To rebuild (Windows PowerShell):

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --python scripts/build_cute_character.py
npm run build
```

Increment the model URL revision in `src/character.ts` when exporting a changed model, so returning browsers fetch the new asset. The model source folder must be present to rebuild; Blender is unnecessary for normal play. See `art/characters/CREDITS.md` for provenance.


## My Look and scoring refresh — 3 October 2026

My Look now has a server-saved nickname (2–20 letters/numbers/spaces/hyphens), an optional avatar gender preference, eight outfits and eight hairstyles. Every style is available for every gender. The double buns and long layers are rebuilt for the chibi head. New styles include a petal dress, cardigan, sports kit, starlight jacket, bob, ponytail, curls and braids. All new fitted hair and clothing are authored in the editable Blender master.

Seven companions include a bunny, fox, small dragon and owl; seven magic choices include a moon halo, crystal crown, rainbow ribbon and bubbles. A lightweight Three.js star burst celebrates completed rounds, releases its GPU resources, and respects reduced motion and 2D mode. The three decorative podium mannequins have been removed from the central plaza; actual shared players remain.

Rankings have separate weekly and daily views, tied-rank podium cards and a personal summary showing awarded weekly medals, pending midnight medals and lifetime medals. Round results distinguish game score, cosmetic XP and daily rank. Existing server scoring and Singapore reset rules are unchanged. Nicknames are public; email, link and phone-like strings are rejected, and inappropriate-name reporting uses the existing private report/hide flow. Free-form names still require operator moderation before a public launch.
