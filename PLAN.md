# Brick Bash: power-ups, a boss and 3D effects

Branch `brick-bash-review`, from `origin/main`. Separate from PRs #11, #12 and #13.

## Task

Add features to Brick Bash, with three.js effects and a boss fight.

## Findings

- The round is one wall of 40 bricks, one ball and a fixed paddle. Nothing changes from the first second to the last, and clearing the wall simply ends the round.
- Breaking a brick has no visual effect beyond the brick vanishing.

## Design

- **Power-ups**: about one brick in six drops a capsule to catch with the paddle.
  - Wide: a wider paddle for eight seconds.
  - Multi: two extra balls. Losing an extra ball costs nothing; a life is lost only when the last ball falls.
- **Boss**: at 0:35, or as soon as the wall is cleared, the Big Brick arrives below the wall. It slides from side to side, blocks the ball, and drops bombs. A bomb on the paddle costs a life. Eight hits beat it: +40 a hit and +300 for the win. The round ends early only when both the wall and the boss are gone.
- **3D effects** (`src/brick-fx.ts`, three.js, loaded on demand): a transparent layer over the 2D game. Bricks shatter into tumbling cubes, the boss is a 3D block that flinches when hit and bursts when beaten, and power-ups ring out from the paddle. Without WebGL, or with reduce motion, the 2D canvas draws everything itself.

The brick simulation lives in `shared/simulation.ts` and is replayed by the server. Scores stay on the same scale, so the rules version is not bumped; see Decisions.

## Steps

1. `shared/simulation.ts`: balls, drops, wide paddle, boss, bombs.
2. `src/games.ts`: drawing, cues, status. `src/brick-fx.ts`: the 3D layer. `src/catalog.ts`: rule text.
3. Tests in `tests/brick.test.ts`; notes in `QA.md`.

## Verify

- `npm test`, `npm run build`, `npm run test:cloudflare`.
- Browser: play a round to the boss, see the effects, get a server-verified result.
- Not verifiable here: feel on a real phone.

## Decisions for Daniel

- No version bump: old Brick Bash bests stay and are easier to beat, since the boss adds points. A round in progress during deploy, or played on a page loaded before it, fails verification until the page is reloaded.
