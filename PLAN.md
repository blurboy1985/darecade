# Open Stage on Dare Plaza

Branch `plaza-stage`, from `origin/main`. Separate from PRs #11 to #14.

## Task

Put a stage in the middle of the map, where it is empty, so a player can perform and earn XP. Add effects and animation so it is interesting and challenging.

## Findings

- The middle of the island is Dare Plaza: a paved circle with a floor sign and string lights, and nothing on it. Its only use is opening the dares window.
- Spots are found by distance to their approach point, so a second spot on the plaza needs its approach about four units from the plaza's own.

## Design

- **In the world**: a low dance floor on the back half of the plaza with a lighting truss, speakers and an OPEN STAGE sign. It is walkable. The dare floor sign moves forward; Dare Plaza keeps its spot.
- **The show**: a forty-second rhythm round in the neighbourhood window. Four lanes, a beat that quickens, Perfect and Good timing, a combo multiplier, and a hype meter that ends the show early at zero.
- **3D**: the player's avatar dances a move per lane under four lamps; beams flash, confetti falls on combos, the crowd bounces with the hype.
- **XP**: 5 a star, 45 a day, decided by the server from a reported result, with a 30-second minimum between reports. No board, medals or dares, so no replay.

## Steps

1. `shared/stage.ts`: song and scoring. `src/state.ts`: save fields and `performShow`.
2. `server/community-core.mjs`: `perform` event and the new place.
3. `src/world.ts`: the stage and its spot. `src/stage-game.ts`, `src/stage-view.ts`, `src/stage.css`, `src/main.ts`.
4. `tests/stage.test.ts`; `STAGE.md`, `README.md`, `QA.md`.

## Verify

- `npm test`, `npm run build`, `npm run test:cloudflare`.
- Browser: see the stage on the plaza, play a show, see XP arrive.
- Not verifiable here: how the timing feels to a person, or on a phone.

## Decisions for Daniel

- The show is reported, not replayed, so its XP is capped rather than proven. Adding a board or dares would need replay.
