# Coast Rush: solid karts and rivals that fight — 10 October 2026

Branch `coast-rush-contact`, from `main`. The owner asked for one more Coast
Rush PR: computer karts should be more aggressive and use items on each other
and the player, and karts that touch should rub and slow instead of passing
through each other "like ghosts".

## What is wrong today

- A kart that touches another loses a seventh of its speed once, then has a
  0.7-second cooldown in which it drives straight through the other kart.
- Computer karts never touch each other at all, and never leave their lane.
- Computer karts take about one crate row in five and hold the item for one
  to four seconds, so an item from a rival is rare.

## Done means

- Two karts cannot occupy the same piece of road: a kart that runs into the
  back of another is held behind it and slides off to one side; karts side by
  side push each other apart. Both lose pace for as long as they touch.
- Computer karts collide with each other and with drivers under the same rule.
- Computer karts take most crates, use items sooner and with a target in
  mind, and move across the road to block and lean on other karts.
- A first race stays gentle: no rival items, no blocking.
- The same rules hold in a multiplayer room.
- `npm test`, `npm run build` and `npm run test:cloudflare` pass.

## Assumptions

- This changes the replayed simulation, so Coast Rush moves to rules version
  5 and version 4 times are archived the way every earlier version's were
  (`coast_contact_from` on the server, `coastRecord.version` in the save).
  A consequence, as before: every player's next race is a first-finish race.
- Rival paces stay as they are. "Aggressive" is items and contact, not speed.
- No new art. A blocking kart is seen moving across the road.

## Steps

1. `shared/racing.ts`: contact between karts (`RaceField` for computer karts,
   `CoastRace` for the driver), computer karts' steering, and their item use.
2. `shared/simulation.ts`, `server/store-core.mjs`, `src/state.ts`: version 5.
3. `shared/race-room.ts` / `src/race-net.ts`: only if the room needs it.
4. Tests in `tests/racing.test.ts` and `tests/race-room.test.ts`; fix the
   tests that pin version 4 or the old bump.
5. Tune against scripted drivers so a drifting driver can still win and a
   first race still ends in the top four.
6. `COAST-RUSH.md`, cover text if it describes bumps.

## Risks

- Balance: rivals that rub each other get slower, rivals with more items make
  the race harder. Measured with scripted drivers, not with people.
- Personal bests are archived on deploy.
- Multiplayer contact uses positions that are a few frames old.

## Outcome

- Steps 1, 2, 4, 5 and 6 done. Step 3 needed no change: the room already
  runs the shared field, and each browser already resolves its own kart.
- Scripted drivers over 12 seeds, before and after:

  | Driver               | Time before | Time after | Struck before | Struck after | Place after |
  | -------------------- | ----------- | ---------- | ------------- | ------------ | ----------- |
  | Drifts, uses items   | 79.1 s      | 85.2 s     | 3.3           | 6.8          | 1st, all 12 |
  | Never drifts         | 93.6 s      | 96.4 s     | 3.3           | 3.6          | 2nd or 3rd  |

  Rivals used 10 to 14 items a race before and 23 to 25 after. A driver who
  never avoids other karts spends 6 to 8 seconds a race in contact. Nobody
  ran out of time. A first race is unchanged at 89.8 s.
- Computer karts were first set to take 70% of crate rows. That struck the
  leader about 12 times a race, so it is 40%.
- Leaning on a kart first gave a knock every 0.7 seconds. It is now one knock
  and then a rub.
- One seed in 30 puts a driver who coasts ahead of one who does not, because
  of where rival items land. The skill test now totals four seeds.
- A full-length replay costs 14.6 ms on this machine against 8.3 ms on
  `main`. Not measured on Cloudflare.
- `npm test`: 578 tests, 529 pass, 0 fail, 49 skipped (525 pass on `main`).
  `npm run test:cloudflare`: build clean, 17 of 17.
- In installed Chrome (`DARECADE_TEST_CHROMIUM`): the built race page at
  seven viewports, 13 of 13, and Section 4, 3 of 3. Section 4 was failing on
  `main` because its fixture saved a version 3 record; it now saves version 5.
- Merged as #76 (`b92937e`) after merging `main` in, at the owner's
  instruction while it was still a draft. The merged tree passed `npm test`
  (540 pass, 0 fail, 49 skipped) and `npm run test:cloudflare` (17 of 17).
  Deployed as Worker version `5acb88de-c855-49d7-b6c6-e4313c496043`;
  HOSTING.md has the record. Personal bests are archived from 10 October.
- Not done: nobody has driven it. The feel of a block, a lean and a rub, and
  whether five or six hits a race is fun, need a person at the wheel.
