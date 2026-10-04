# Rename the game to Play Simi — 5 October 2026

Branch `rename-play-simi` from `main`. The game's name changes from Darecade to **Play Simi** everywhere a player or reader sees it, and "dare" becomes **challenge**. Dare Plaza becomes **Simi Plaza**; its floor sign reads PLAY SIMI?.

Done means: no player-visible "Darecade" or "dare" remains in the interface, emails, page metadata or current documentation; `npm test`, `npm run build` and `npm run test:cloudflare` pass; the built app shows the new name in a browser; a pull request is open (not merged, not deployed).

## Deliberately unchanged

Renaming these would sign players out, lose saved data, change daily seeds or move the live address, so they keep the old name:

- Browser storage keys (`darecade-v1`, `darecade-preview-backup`, `darecade-invite`) and the `darecade_session` cookie.
- Durable Object name `darecade-main-v1`, Worker name `darecade`, the `workers.dev` address and the `darecade.danielquek.com` mail domain.
- The daily seed prefix, `x-darecade-*` headers, `DARECADE_DATA` and `DARECADE_TEST_CHROMIUM`, the `/api/dares` route, the `dares` table and code identifiers such as `postDare`.
- Stripe product, key and statement-descriptor names, which live in the Stripe dashboard (PAYMENTS.md records them as they are).
- Dated records in HOSTING.md and QA.md, the GitHub repository name and the package name.

## Steps

1. Interface: brand, page title and description, favicon, plaza, challenge copy in `index.html`, `public/favicon.svg`, `src/main.ts`, `src/lobby-menu.ts`, `src/account.ts`, `src/activities.ts`, `src/invite.ts`, `src/payments.ts`, `src/world.ts`, `src/race-view.ts`, `src/racing-game.ts`.
2. Server copy: emails, age notice, challenge errors, setup notice, sender display name and storage notice in `server/`, `cloudflare/worker.mjs`, `wrangler.jsonc`, `.env.example`.
3. Tests that assert the changed copy.
4. Documentation: README and the feature documents.
5. Verify: `npm test`, `npm run build`, `npm run test:cloudflare`, browser check of the built app.
6. Commit, push, open the pull request.

## Risks

- The longer word "challenge" may not fit narrow buttons and the HUD at 320 px. Check in the browser.
- The privacy notice wording changes from "dares" to "challenges" with no change of meaning, so the consent version does not move.
- `MAIL_FROM` and `STORAGE_NOTICE` in `wrangler.jsonc` only take effect at the next deployment.

## Verification — 5 October 2026

- `npm test`: 196 tests, 192 pass, 4 skipped (browser checks that need `DARECADE_TEST_CHROMIUM`). Five test files were updated to assert the new copy.
- `npm run test:cloudflare`: build and deployment dry-run pass, 8 of 8 integration tests pass.
- The Friends menu label is "Challenges & ranks" because "Challenges & rankings" is 21 characters and the menu test allows 20.
- Built app on a local server with throwaway data, desktop width: page title, description, header brand, privacy summary and the Coast Rush cover show Play Simi and "challenges"; no "Darecade" or "dare" in the visible text of those screens.
- Not verified in a browser: the challenge screens (covered by `tests/lobby-render.test.ts` only), the Simi Plaza floor sign and race banner in 3D, the new favicon's appearance, and the fit of the longer wording at 320 px. The preview pane did not animate, so the first race could not be finished to reach the lobby menus.
- Not deployed. The sender name and storage notice in `wrangler.jsonc` change at the next deployment.
