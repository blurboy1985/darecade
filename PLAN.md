# Open Stage: dance styles, Fever, Encore and Stage Party — 10 October 2026

Branch `worktree-open-stage-party`, from `main`. The owner asked for one more
pull request that makes the Open Stage more fun: more features, more dance
moves for the avatar, and multiplayer.

## Done means

- **Dance moves**: four dance styles (Pop, Disco, Street, Robot), each with its
  own move per lane and its own groove, plus moves the show triggers by itself:
  a spin, a star jump and a body wave on combo milestones, a stumble on a miss,
  a Fever loop, a finishing pose and a slump when booed off. Arms, elbows,
  knees, spine and head all move (today only the body and legs visibly do).
- **Fever**: hits fill a meter; Space or the Fever button spends it on a few
  seconds of double points, with the lights and crowd going wild.
- **Encore**: a third session, faster and with double arrows.
- **Stage Party** (multiplayer): host a party, share a four-letter code, up to
  four dancers play the same song at the same moment, see each other dance on
  the stage, a live scoreboard, cheers, a podium, and a rematch.
- Warm-up and the original Show chart, score, stars and XP are unchanged.
- `npm test`, `npm run build` and `npm run test:cloudflare` pass, and a
  two-player party is driven end to end against the running server.

## Assumptions

- Stars and XP are judged on timing alone: the Fever bonus counts towards the
  score, the best score and the party ranking, but not towards stars. So the
  reward balance does not move.
- Encore pays the same 5 XP a star under the same daily cap.
- A party is friendly: no extra XP, medals or board. Each dancer's own show is
  still reported through the existing `perform` event, so the daily cap and
  the 30-second rest apply as they do alone. Scores in a party are reported by
  each browser and are not replayed.
- Party rooms live in memory beside the community records (the Neighbourhood
  Durable Object on Cloudflare, the Node process in preview), polled over
  HTTP like the world fallback. No new Durable Object, table or migration. A
  deploy or eviction ends the parties in progress.
- Names and looks shown in a party are the server's, as in a shared world.
  Blocked players cannot share a party.
- The chosen dance style is a per-device preference (localStorage).

## Steps

1. `shared/stage.ts`: Encore chart, Fever, timing-only base score.
2. `src/stage-moves.ts`: the pose library (pure); `src/character.ts` exports
   the skin pose so a caller can pose every joint.
3. `shared/stage-party.ts` (protocol) and `server/stage-rooms.mjs` (rooms);
   `/api/stage/*` in `server/index.mjs` and `cloudflare/api.mjs`; leave on
   logout, deletion and block.
4. `src/stage-view.ts`: several dancers, the pose library, Fever lights.
5. `src/stage-party.ts` (polling client), `src/stage-game.ts`, `src/stage.css`:
   style picker, Fever, Encore, party lobby, scoreboard, cheers, podium.
6. Tests, STAGE.md, README, pull request.

## Risks

- Party polling adds API requests (about one a second per dancer during a
  show). Each API request already writes two rate-limit rows on Cloudflare.
- `src/state.ts`, `server/index.mjs` and `cloudflare/worker.mjs` have
  uncommitted Coast Rush changes in the owner's checkout; this branch avoids
  the first and last and adds one route block to `server/index.mjs`.
- Dance feel and the look of the moves are judged in a desktop browser here,
  not on a phone.
