# Coast Rush: show computer karts collecting crates — 11 October 2026

Branch `worktree-coast-rush-cpu-items`, from `main`. The owner reported that
computer karts "are unable to pick up the items" and so cannot use them.

## What is wrong today

- The simulation does give computer karts items. Measured on `main` with a
  scripted driver over seeds 314159, 1, 2 and 7: each computer kart crosses
  9 to 12 crate rows a race, collects 2 to 8 items and uses nearly all of them.
- Nothing on screen shows it. A crate only disappears when the player takes
  it (`race.collected`), so a computer kart drives through a crate that stays
  where it is, and no kart shows what it is holding. From the driver's seat
  the rivals look unable to collect anything.
- In a multiplayer room the browser is not even told what a computer kart
  holds: the snapshot carries position and flags only.
- By design, and unchanged here: in a first race (before a first finish)
  rivals leave the crates alone, and otherwise take about two rows in five.

## Done means

- A crate visibly pops when a computer kart collects from it, and comes back
  a moment later (the player can still collect it, as the rules allow).
- A computer kart's nameplate shows the item it holds until it is used or let
  go, in solo races and in rooms.
- `shared/racing.ts` behaves identically: no replay rules change, version 5
  stays, and every existing test passes.

## Steps

1. `shared/racing.ts`: export `crateTaken(distance, offset)`, the crate a
   computer kart at that spot has just collected from (same side test the
   pickup uses). Pure; the simulation does not call it.
2. `shared/race-room.ts`: add the held item (0 for none, else its place in
   `ITEMS` plus one) as a sixth value in each snapshot row. `src/race-net.ts`
   reads it into the rival; an older server sends none and it stays empty.
3. `src/race-view.ts`: when a rival's item appears, hide `crateTaken` for
   1.2 seconds; show the held item's icon on its nameplate.
4. Tests: `crateTaken` agrees with every pickup the simulation makes; the
   room snapshot carries a computer kart's item. Update `COAST-RUSH.md`.
5. Verify: `npm test` for racing and rooms, `npm run build`, and a browser
   race watching a rival collect a crate.

## Risks

- The pickup test is "same side of the road", not contact, so the crate that
  pops can be up to a lane away from the kart. Changing that is a rules change
  (new replay version, everyone's best archived) and is left for the owner.

## Outcome

- Steps 1 to 4 done as planned. The helper is `crateTaken` and picks the
  nearest row rather than the last one behind, so it still names the right
  crate when a kart is held back a tick or a room snapshot is a little old.
- `npm test`: 591 tests, 542 pass, 0 fail, 49 skipped. `npm run build` clean.
- In Chrome, a standard solo race (seed 314159) through a temporary local
  page that mounted `RacingGame` directly: Reef's nameplate read "Reef 🌊",
  Pebble's "Pebble 🥥" and Breeze's "Breeze 🛡" on the tick each collected,
  the crate hid on that tick and was back 72 ticks later, and each icon
  cleared when the item was used. No nameplate showed an icon without an item.
- Not done: `npm run test:cloudflare`, and a room has not been watched in a
  browser. The room's side is covered by the snapshot test only.
