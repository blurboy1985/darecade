# Merge the open PRs, deploy, remove unused branches — 13 October 2026

The owner asked for the PRs in progress to be watched until they were done,
then merged and deployed, and for branches no longer in use to be removed.

## What existed

- No PR was open. Three other sessions were each building one: the merged Play
  list (`merge-play-categories`), Challenges on Rankings
  (`worktree-merge-challenges-rankings`) and the free hats removal
  (`worktree-remove-free-hats`).
- The repository has no CI, so "done" meant a session had opened its PR and
  stopped working.

## Steps

1. Wait for each session to open its PR and go idle.
2. Merge `main` into each PR branch, test the result, merge the PR.
3. Deploy `main` once, check it live.
4. Record the deployment in `HOSTING.md` and here, on `main`.
5. Delete merged branches and the worktrees of finished sessions.

## Outcome

- PR #93 was merged, deployed (`aef4c64d-c8ed-4357-81fb-b0016a48eee9`) and
  recorded by its own session. Nothing was left to do but delete its branch.
- PR #94 conflicted with #93 in `PLAN.md` and `src/main.ts`. Both code hunks
  were lines #94 had only re-wrapped while #93 removed the Play outside
  section, so `main`'s version was kept. Merged as `e672028`.
- PR #95 conflicted in `PLAN.md` and `src/main.ts`. The code hunk was the
  "Wear my cap" button, which #95 deletes and `main` had only re-wrapped, so
  #95's version was kept. Merged as `e869ac1`.
- In both cases `main` was merged into the branch, the branch's plan was kept
  and nothing was force-pushed.
- `main` at `e869ac1` was deployed as Worker version
  `fb024007-ba7a-4fd9-b33e-6c7d82720da1`. Tests and live checks are in
  `HOSTING.md`.
- `merge-play-categories`, `worktree-merge-challenges-rankings` and
  `worktree-remove-free-hats` are deleted on GitHub. The local branches and
  worktrees are removed after this record is committed.
- Not done: the seasons test that fails outside its own week is still
  failing; nothing was looked at in a browser on the live site or on a phone.
