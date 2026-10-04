# Hop Hop review: point spam, cliff edges, power star

Branch `hop-hop-review`, from `origin/main`. Separate from PRs #11 and #12.

## Task

Review Hop Hop. Fix the stream of points at the start, stop the round ending abruptly at a cliff edge, and add one feature that helps the player.

## Findings

- **Point spam.** The score rises one point every 83 ms from time alone. Each rise fires a "+N" label, a sound and a particle burst, so the screen fills with small numbers from the first second. Hazard bonuses were also not added: the score was `max(bonus, time)`, so a +25 showed and then stalled until time caught up.
- **Cliff edge.** On the ground, any overlap between the runner's 24 px box and a gap ended the round in the same tick: a toe over the near edge, or landing a few pixels short of the far edge. There was no fall, so it read as a sudden stop.
- Crates use the same full box, so a clipped corner also ends the round.

## Design

- **Scoring**: time points plus bonuses, added together. Only bonuses pop, sound and burst.
- **Edges**: the runner falls only when the gap is under the middle of its feet. It then falls into the gap for about a third of a second before the round ends, and a jump pressed in the first moment of the fall still works. Crates get a slightly smaller hit box.
- **Power star**: a star floats at jump height every so often. Catching it gives five seconds of power: crates are smashed for +50 and gaps are bridged. A bridge under the runner holds until solid ground even if the power runs out.
- No boss: a 60-second runner has no room for one, and the star is the helping feature asked for.

`HopRun` is replayed by the server. Scores stay on the same scale, so the rules version is not bumped; see Decisions.

## Steps

1. `src/action-games.ts`: `HopRun` rules and drawing.
2. `src/games.ts`: quiet time points, cues for star, smash and fall. `src/catalog.ts`: rule text.
3. Tests in `tests/neighbourhood.test.ts`; docs in `README.md` and `QA.md`.

## Verify

- `npm test`, `npm run build`, `npm run test:cloudflare`.
- Browser: play Hop Hop, confirm no point spam, a visible fall, a star pickup, and a server-verified result.
- Not verifiable here: feel on a real phone.

## Decisions for Daniel

- No version bump: old Hop Hop bests stay, and are a little easier to beat because bonuses now add up. A round in progress during deploy, or played on a page loaded before it, will fail verification until the page is reloaded.
