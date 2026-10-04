# Coast Rush: winding route and five random items

Working tree on `main`, uncommitted. Nothing is deployed by this work.

## Task

Replace the gentle Palm Bay loop with a winding circuit where drifting is the fast way through bends, and replace the fixed shield/turbo crates with five randomly drawn items, including a missile that knocks out the kart in front.

## Consequence: rules version 3

`shared/racing.ts` is replayed by the server. A new route and new items change the simulation, so Coast Rush moves from rules v2 to v3. Old-route times cannot share a board, a dare or a personal best with new-route times. They are archived the same way two-lap times were: runs stay in the database, earned medals are untouched, the previous best moves to `coastLegacyBest`.

## Design

- **Route**: closed Catmull-Rom spline through fixed control points (arithmetic only, no trig). Hairpins, an S-bend and a chicane. Checked numerically for minimum radius, no crossing, and spacing between sections.
- **Drift**: bends push the kart outward harder; drift steering grips harder. At turbo speed a tight bend can only be held while drifting. Drift tiers and timings unchanged.
- **Items** (crate rows of three, four rows a lap): Shield, Turbo, Missile (homes on the next kart ahead, 1.5 s spin), Storm (slows every rival ahead for 3 s), Coconut (dropped behind; first rival to reach it spins). The draw mixes the run seed with the pickup tick, so replays are deterministic. The leader never draws Missile or Storm.

## Steps

1. `shared/racing.ts`: route, handling, items, rival stun/slow. `shared/simulation.ts`: seed to the race, version 3.
2. Server and save migration: `server/store-core.mjs`, `server/community-core.mjs`, `src/state.ts`.
3. `src/race-view.ts`: ground for a non-convex route, scenery kept clear of the road, missile, coconut, spin and storm visuals.
4. `src/racing-game.ts`, `src/racing.css`: item names, legend, cues, minimap fitted to the route.
5. Tests: `tests/racing.test.ts`, `tests/cloudflare.test.mjs`.
6. Docs: `COAST-RUSH.md`, `QA.md`, `README.md`.

## Verify

- Route script: minimum radius, section spacing, length, lap times for the test drivers.
- `npm test` and `npm run build`.
- Browser: a race on the new route, items picked up and used, no page errors.
- Not verifiable here: real-phone feel, and whether the route is fun.

## Decisions for Daniel

- Personal bests and daily boards for Coast Rush restart on the new route when this is deployed.
- Random items add some luck to a ranked time. Say if ranked runs should use a fixed sequence instead.
