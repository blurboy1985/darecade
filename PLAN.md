# Hoops and Fishing review: dares, difficulty, 3D, lag

Branch `hoops-fishing-review`, from `origin/main`. Separate from the Coast Rush route PR (#11).

## Task

Review Hoops Court and Fishing Jetty. Make both playable as dares, make hoops harder, fix the lag when a fishing catch is submitted, and add three.js animation and effects while playing.

## Findings

- **Dares need replay.** Both activities report a result from the browser and the server trusts it. A dare compares scores between players, so each needs a deterministic simulation the server replays, like the cabinets.
- **Fishing lag.** Each catch sends a progress event. Every profile reply calls `world.updateAvatar()`, which rebuilds the 3D avatar even though a catch never changes the look. The reply also waits behind any queued profile save.
- **Hoops is easy.** One fixed green zone, a slow marker, no time pressure, ten shots.
- **No 3D.** Both are DOM panels with CSS shapes.

## Design

- `shared/outdoor.ts`: `HoopsRound` and `FishingRound`, run by `Simulation` and `replayRun`. One input: press or hold.
  - Hoops: ten shots, a four-second shot clock, a faster marker, a green zone that narrows and from the fourth shot slides, a perfect band worth 3, and a streak bonus.
  - Fishing: a 60-second round. Cast, hook the bite, then reel: holding reels and raises line tension, the fish surges, and the line snaps at full tension. Rarer fish score more and fight harder.
- Catalogue: both join `games` as playable rounds with dares. They are **not** cabinets: `gameIds` stays the five cabinets, so daily boards, medals and the 15-point daily maximum do not change.
- Rewards: the server takes shots made and species caught from the replay, so the album and hoops-best XP are now verified. The unverified `fish` and `hoops` progress events are removed.
- `src/outdoor-game.ts` and a lazily loaded `src/outdoor-view.ts` (three.js): ball arc, rim and net, swish sparks, streak flame; pond, rod, line, float, bite splash, fish leaping on a catch. A DOM fallback covers simple view and lost WebGL.
- Lag: rebuild the avatar only when a look field changed.

## Steps

1. Simulations, catalogue, save shape, `Simulation` wiring.
2. Server: begin, finish rewards, cards; drop the old events.
3. Client round, 3D view, styles; facility panels launch the round; challenge picker lists both.
4. Lag fix in `src/main.ts`.
5. Tests; docs (`EAST-SIDE.md`, `QA.md`, `README.md`).

## Verify

- `npm test`, `npm run build`, `npm run test:cloudflare`.
- Browser: play both rounds to a server-verified result; check the 3D view and no page errors.
- Not verifiable here: feel on a real phone, and whether the difficulty is right for a person.

## Decisions for Daniel

- Dares only, no medal boards for these two. Adding boards would raise the daily medal maximum.
