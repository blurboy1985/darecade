# Challenges join Rankings, per-game boards first — 13 October 2026

The owner asked for the "Challenges" and "Rankings" tabs to become one, for
Rankings to show the leaderboard of each game, and said the dropdown does not
work.

## What was wrong with the dropdown

Reproduced in Chrome with a real mouse: the list opens, but pressing an option
closes it and nothing changes. The styled select (`src/ui-controls.ts`) closed
its list on `focusout` by reading `document.activeElement` in a microtask. That
runs before focus reaches the pressed option, so the list hid under the pointer
and the click never arrived. Every styled select in the app was affected. The
existing tests set the native select's value directly, so they never saw it.

## Assumptions (mine)

- The merged tab is called "Rankings & challenges"; the panel heading stays
  "Rankings". The tabs are now Quests and Rankings & challenges.
- "Leaderboards for each game" means Rankings opens on today's scores for one
  game, with a Game dropdown to move between the five ranked games. It used to
  open on season medals, with the game boards two choices away.
- Weekly medals and seasons stay in the Show dropdown, after Today's scores.
- The old Challenges home page goes. Its allowance line, Friends & requests and
  Recent challenges move into a Challenges section on Rankings; "Challenge a
  saved score" stays on the daily board. Find a friend is reached from Friends
  & requests.
- Simi Plaza in the world, which opened Challenges, opens the merged panel.

## Done means

- Two tabs; no separate Challenges tab or page.
- Rankings opens on a game's board and the Game dropdown changes it by mouse,
  touch and keyboard.
- Friends, requests, finding a friend and challenge history are all reachable.
- `npm test` and `npm run build` pass; the panel is driven in a browser.

## Steps

1. `src/ui-controls.ts`: keep the list open while an option is pressed; return
   focus to the dropdown after its panel redraws.
2. `src/main.ts`: two tabs; Rankings defaults to today's scores; a Challenges
   section on every Rankings view; the Challenges home view and its route go.
3. `src/lobby-ui.css`: the Challenges section.
4. Tests: `lobby-render`, `seasons-browser`, and a new browser test that
   presses the real dropdown.
5. Verify, then open the PR.
