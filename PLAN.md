# Deploy PRs 83 and 84 — 11 October 2026

The owner asked for a fetch, a merge of the PRs and a deployment. PR #83
(`f0e35fb`, immediate play on a first visit) and PR #84 (`585efa9`, activity
discovery and next-game actions) were already merged on GitHub and no PR was
open, so the merge is a fast-forward of local `main` from `622fe3a` to
`585efa9`: seven files under `src/` and `tests/`, nothing in `wrangler.jsonc`,
`server/` or `shared/`.

## Done means

- Local `main` equals `origin/main` at `585efa9`.
- Production serves the build of that commit, checked byte-for-byte.
- HOSTING.md records the Worker version, the checks and the rollback.

## Steps

1. `git fetch`, then `git merge --ff-only origin/main`.
2. `npm test` on `main`.
3. `npm run test:cloudflare` (build, dry run and the integration tests).
4. `npm run cf:deploy`.
5. Live checks: health, HTML and every script and style file against `dist/`,
   unauthenticated state 401, auth config 200, a private path 404, the old
   address.
6. Record in HOSTING.md and here, on a branch, as a PR.

## Outcome

- Steps 1 to 5 done. `npm test`: 601 tests, 552 pass, 0 fail, 49 skipped.
  `npm run test:cloudflare`: 17 of 17.
- Not in the plan: four browser test files were run in installed Chrome before
  deploying. Two tests in `tests/experience-browser.test.ts` failed because
  the helper paged the Arcade list while Play now opens on Discover for a new
  player. `tests/experience-browser.js` now chooses Arcade games first and all
  13 pass. The game was not changed.
- Deployed as Worker version `3b1989e7-29a6-40e0-83d1-eb17e2d29a40`. Live
  health ready, HTML and 18 script and style files match `dist/`, state 401,
  auth config 200, private paths 404, old address answers. HOSTING.md has the
  record.
- Not done: nothing was opened or played in production, and no phone.

## Risks

- Stage Party rooms and races in progress end with the deployment.
- Rollback is a redeploy of `622fe3a`.
