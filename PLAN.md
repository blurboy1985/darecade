# Merge and deploy the open pull requests — 10 October 2026

Branch `worktree-merge-deploy-prs`. The owner asked for every open pull
request to be merged and deployed. Two are open: #67 (bigger nearby action
prompt) and #69 (Open Stage: dance styles, Fever, Encore and Stage Party).

## Done means

- #67 and #69 are merged into `main`.
- `npm test`, `npm run build` and `npm run test:cloudflare` pass on the merged
  code.
- `main` is deployed with `npm run cf:deploy` and the live site is checked:
  health, the asset names in the live page, and asset bytes against the build.
- The deployment is recorded in HOSTING.md.

## Found

- Both branches are one commit ahead of `main` and seven behind (#68 and #70
  landed after they were cut). Each conflicts with `main` in `PLAN.md` only;
  `README.md` and `server/index.mjs` merge by themselves.
- No CI checks and no branch protection, so the tests run here.

## Steps

1. Merge `main` into `bigger-action-prompt`, keep that branch's `PLAN.md`,
   test, push, merge #67.
2. Merge the new `main` into `open-stage-party`, keep that branch's
   `PLAN.md`, run all three suites (this tree is what `main` becomes), push,
   merge #69.
3. Build merged `main` and deploy it.
4. Check production.
5. Record the deployment in HOSTING.md and this file, as a pull request.

## Assumptions

- Conflicts are resolved by merging `main` into each branch, not by rebasing,
  so nothing is force-pushed.
- `PLAN.md` holds one task's plan at a time; the earlier plans stay in history.

## Risks

- #69 keeps party rooms in memory: this deploy ends nothing today, but every
  later deploy ends parties in progress.
- A deploy restarts the Race rooms, so a Coast Rush multiplayer race in
  progress at that moment is cut off.
- Rollback is a redeploy of `f0ce6e2`. Neither pull request changes a schema,
  migration, binding, variable or secret.

## Outcome

- #67 merged as `b74d211` and #69 as `c8f3ace`. No pull request was open
  afterwards.
- The tree that became `main` passed `npm test` (515 pass, 0 fail, 49
  skipped), `npm run test:cloudflare` (16 of 16) and `npm run build`.
- Deployed as Worker version `74aaede0-dae7-49fd-9263-26a7c79514a4` at about
  14:42 SGT. Health is ready, and the live page and eight of its assets match
  the build byte-for-byte.
- One thing the plan did not expect: the last deployment was #65, so this one
  also put #66, #68 and #70 live, with the new `Race` Durable Object and
  migration `v3`. The rollback above is therefore a redeploy of `4da7d3f`
  that keeps the `RACE` binding and the `v3` migration.
- Not done: nothing behind the welcome check was tried in production, and
  nothing was tried on a phone. HOSTING.md has the full record.
