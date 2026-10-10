# Coast Rush: multiplayer, drift track, bumps and rival items — 10 October 2026

Branch `coast-rush-multiplayer`. The owner asked for a pull request that adds
real-time multiplayer to Coast Rush, a more challenging track built for
drifting, a drift that looks like a drift, bumps that only slow the kart,
computer players that use items, and two more items.

## Done means

- **Multiplayer**: a player hosts a race and shares a four-letter code; 2–8
  players join, computer karts fill the grid to eight, the host starts, and
  everyone races the same three laps live, seeing each other's karts, items and
  finishing order. Works on the Node preview and on Cloudflare.
- **Track**: a new Palm Bay route with a hairpin, a long carousel, a chicane
  and bends that need a drift (or the brake) even at cruising speed.
- **Drift**: the kart hops, slides at an angle, counter-steers, leans, throws
  tier-coloured sparks and smoke, and leaves skid marks. Rivals slide too.
- **Bumps**: a wall or kart contact costs a little speed; nothing stops.
- **Rivals use items** in solo and multiplayer (not in a first-finish race).
- **Seven items**: the five existing ones plus Wave and Crab.
- `npm test`, `npm run build` and `npm run test:cloudflare` pass, and a
  two-player race is driven end to end against the running server.

## Assumptions

- The track, bump, item and rival changes apply to solo races too. That
  changes the replayed simulation, so Coast Rush moves to rules version 4 and
  v3 times are archived exactly as v2 times were (`coast_drift_from`).
- Multiplayer races are friendly: no XP, medals, records or ranked times, so
  there is nothing to cheat for and no replay check. Each player's browser
  drives its own kart; the room (server) owns computer karts, items in flight
  and the finishing order.
- Rooms are private by code, held in memory, and vanish when empty.
- An item hit (missile, crab, coconut, wave) is a short spin at reduced speed,
  not a stop. Shield still blocks hits.
- Multiplayer cannot pause: the clock is shared.

## Steps

1. `shared/racing.ts`: new route; bump physics; `RaceField` (items in flight,
   computer karts and their item use) shared by solo and the room; Wave and
   Crab; versus mode for a networked kart. Rules version 4 and its archive.
2. `shared/race-room.ts`: lobby, grid, snapshots, item events, results.
3. Transport: `cloudflare/race-room.mjs` Durable Object and worker route;
   `server/race-rooms.mjs` WebSocket endpoint for the Node preview.
4. Client: `src/race-net.ts`; lobby, versus HUD and results in
   `src/racing-game.ts`.
5. `src/race-view.ts`: drift animation, new items, human rivals, scenery that
   follows the route.
6. Tests, COAST-RUSH.md, README, pull request.

## Risks

- A new Durable Object class needs a wrangler migration (`v3`); it deploys
  with the Worker. Nothing is deployed by this pull request.
- The Node preview needs `ws`, already a dev dependency, for the socket.
- Feel (track difficulty, drift look, network smoothness) is judged in a
  desktop browser here, not on a phone or over a real network.
- `tests/music-browser.test.ts` times out on this Windows machine on `main`.

## Outcome

- All six steps done. `npm test` 484 pass, 0 fail, 49 skipped (472 before);
  `npm run test:cloudflare` 16 of 16; `npm run build` clean.
- Checked in desktop Chrome against the Node preview: hosted a room, a
  scripted second player joined by code, both raced three laps with computer
  karts using items, and both received the same results. A solo race on the
  new route showed the drift slide, smoke and tyre marks.
- Two changes from the first plan: bends push a little harder (so hairpins
  matter at cruising speed), and computer karts take about one crate row in
  five after a first tuning pass hit the player too often.
- Not done here: nothing is merged or deployed, and nothing was tried on a
  phone or across a real network.
