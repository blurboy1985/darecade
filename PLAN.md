# Bigger, more obvious nearby action prompt — 10 October 2026

Branch `worktree-bigger-action-prompt`. The owner asked for the "E" action
button to be bigger and more obvious when the player is near any structure
that has an action, as its own pull request.

## Done means

- The `#interaction` prompt is clearly larger on desktop and phones, with a
  prominent `E` keycap, and draws the eye when it appears.
- It applies to every nearby structure: they all share the one prompt through
  the `near` callback in `src/world.ts`.
- It still clears Jump, the zoom buttons and the dock at every tested size,
  and stays hidden while away, interacting or inspecting.
- Calm mode and `prefers-reduced-motion` get no animation.
- `npm test` and `npm run build` pass.

## Steps

1. `src/lobby-ui.css`: larger prompt, keycap, appear and pulse animations.
2. `src/mobile-hud.css`: drop the global size overrides that shrink it to
   11px text; keep its position.
3. Test that pins the size so it cannot quietly shrink again.
4. Screenshot it in Chromium at phone and desktop sizes.
5. Tests, build, pull request.

## Assumptions

- "Bigger and more obvious" is a styling change; the range at which the
  prompt appears and what `E` does are unchanged.
- On touch screens the `E` keycap stays hidden (as all `kbd` are); the prompt
  itself is the tap target and grows the same way.

## Risks

- `src/mobile-lobby.css` also positions the prompt but is only loaded by one
  browser test, not the app; it is left alone.
