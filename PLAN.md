# Remove the free hats and the Mama Shop daily pick — 13 October 2026

The owner asked for a PR that removes the free hats, because they are ugly,
and updates the Mama Shop to remove the daily pick.

## What exists

- Three free hats in their own `hat` slot: The Kopitiam Bucket (1), Lilac
  Daydream cap (2, grants already retired) and Just a Little Sprout (3).
- Sources: the Mama Shop daily pick (Bucket or Sprout, +30 XP) and the weekly
  pixel hunt (Sprout). "Wear my cap" is an unreachable leftover.
- The Mama Shop panel offers nothing except the daily pick.

## Assumptions (mine)

- "Free hats" means all three, for everyone: owners stop wearing and owning
  them. Wardrobe headwear (the Headwear tab) is not touched.
- The `hat` slot goes with them, from looks, saves, saved looks and the
  server's look keys. Stored rows that still carry `hat` are read and ignored.
- The Mama Shop stays a place to visit. Its panel keeps the line and button
  the claimed state already showed, pointing at My look.
- The gift box outside the shop goes; it advertised the pick.
- The pixel hunt keeps its +50 XP. The "Goodie two shoes" sticker goes, since
  it could no longer be earned.
- The +30 XP a day from the pick is not replaced.

## Done means

- No hat can be picked, earned, selected, saved or drawn; an old save or
  stored profile wearing one loads without it.
- The Mama Shop, Quests and the sticker album no longer mention a daily pick
  or a free hat; the server refuses the `gift` and `welcome-wear` events.
- `npm test` and `npm run build` pass; the shop panel and an avatar looked at
  in a browser.

## Steps

1. `src/state.ts`, `src/saved-looks.ts`: drop `hat`, `unlockedHats`, `gift`,
   `giftDay`, `claimGift`.
2. `server/community-core.mjs`, `server/store-core.mjs`: drop the events, the
   hat check, the Sprout grant and the `hat` look key.
3. `src/character.ts` and its callers: drop the three hats and the `hat`
   argument of `createAvatar`.
4. `src/wardrobe.ts`, `src/main.ts`, `src/world.ts`, `src/neighbourhood.ts`,
   CSS: the shelf, the pick, the gift box, copy.
5. Tests and review scripts.
6. Docs: `README.md`, `ACCOUNTS.md`, `WARDROBE.md`, `SEASONS.md`.

## Out of scope

Deploying. The shop sign "GOOD THINGS. ON THE HOUSE." Dated QA records.

## Risks

- Players lose hats they own. Once the server saves a profile after this
  ships, the stored unlocks are gone.
- `createAvatar` takes positional arguments and tests are not type-checked:
  every caller is found by search.

## Outcome

- Steps 1 to 6 done on branch `worktree-remove-free-hats`.
- Before the change, on `main`: 612 tests, 562 pass, 49 skipped, 1 fail
  (`tests/seasons.test.ts`, "mission, weekly hunt, stage and garden deltas",
  115 against 165). That test saves coins under the fixture's week and loads
  them under the real one, so it fails outside its own week. Not touched.
- After: `npm test` with `DARECADE_TEST_CHROMIUM` set to Chrome: 612 tests,
  611 pass, 0 skipped, the same 1 fail. `npm run build` passes.
  `npm run test:cloudflare`: 17 of 17.
- One test removed (the hat shelf) and one added: the Mama Shop, Quests, the
  sticker album and My look render with no pick, gift or hat control.
- Tests that used the gift as a +30 XP event now use the cat, a quest claim or
  rooftop stars. The Cloudflare one expects 290 XP and 40 season XP, not 280
  and 30.
- Not done: the 3D town looked at by eye. The browser tab available here was
  in a hidden window and never drew a frame; the headless Chrome tests cover
  the lobby, My look and hair fit instead.
- Left for the owner: the shop sign still reads "GOOD THINGS. ON THE HOUSE.";
  Prettier reports line endings on most files in this checkout, changed or not.
