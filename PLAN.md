# Lobby UX: neighbours list, world label and profile — 11 October 2026

Branch `worktree-ux-neighbours-profile`, from `main`. The owner reported three
problems on the main screen, on a phone:

1. In Neighbours, the "Choose a neighbour" dropdown does not work.
2. The label "W1 · 1/30 · 5 neighbours" is not understandable. What are the
   5 neighbours?
3. The profile at the top left is too small and cannot be tapped.

## What is wrong today

- The dropdown lists the other players in your world. When you are the only
  player (the "1/30" case) it is drawn with no options at all, and "View
  profile" then does nothing. Nothing says why.
- "5 neighbours" is the number of computer-controlled example residents in the
  town. It never changes and says nothing about real players. "W1" is the world
  code and "1/30" is players in the world out of the 30 it holds.
- The profile is a plain `div` with no action. On a phone it is 104 × 40 px
  with 10 px text.

## Done means

- Alone in a world, Neighbours says so in words and offers Worlds and Invite a
  friend. With other players, the dropdown and its buttons work as before.
- The label reads `W1 · 1/30 players`. The resident count is gone from every
  state of the label.
- The profile is a button, at least 44 px tall on a phone, with readable text.
  It opens a profile panel: name, level, XP, medals, and links to My look,
  Rankings and the account page.
- `npm test`, `npm run build` and the phone-size browser tests pass, and
  screenshots at 320 and 390 px wide show no overlap in the top row.

## Assumptions

- "Not working" is the empty dropdown. The owner was alone in W1.
- Example residents stay out of the dropdown. They were removed from it on
  purpose in early October.
- The profile opens a new small panel rather than the account page directly,
  because on a phone the name is hidden in the chip and the account page does
  not show it.

## Steps

1. `src/lobby-presence.ts`, `src/main.ts`: new label copy. Update
   `tests/first-minute.test.ts`.
2. `src/main.ts`: empty state for Neighbours. Test in
   `tests/lobby-render.test.ts`.
3. `src/main.ts`, CSS: profile button and profile panel. Test in
   `tests/lobby-render.test.ts` and the phone fixture.
4. Verify: tests, build, screenshots.
