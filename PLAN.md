# Move Play Simi to playsimi.danielquek.com — 5 October 2026

Branch `move-to-playsimi-domain`, stacked on `rename-play-simi` (PR #20). The game moves from `https://darecade.daniel-tianwen.workers.dev` to **`https://playsimi.danielquek.com`**, mail moves from `darecade.danielquek.com` to **`playsimi.danielquek.com`**, and the old address hands each player's session and browser save to the new one.

Done means: the Worker serves the new address as a custom domain and keeps its name and data; the old address only forwards; a guest or signed-in player arriving at the old address continues at the new one with the same character; `npm test`, `npm run build` and `npm run test:cloudflare` pass; a pull request is open. **Nothing is deployed and no dashboard setting is changed by this work.** The pull request must not be merged and deployed until the checklist in HOSTING.md is complete.

## Design

- **Address.** `wrangler.jsonc` adds the custom domain route and sets `PUBLIC_ORIGIN` to the new address. The Worker stays named `darecade`, so the `Neighbourhood` Durable Object `darecade-main-v1` and every account stay attached. `workers_dev` stays on so the old address still answers. `LEGACY_ORIGIN` names the old address.
- **Old address.** It serves the same static app. The API there answers only `POST /api/move` and the Stripe webhook (signature-checked, so the existing endpoint keeps working until it is repointed). Everything else is refused as before.
- **Handoff.** A new entry script `src/boot.ts` runs before the game loads.
  - On the old address it posts the browser saves to `/api/move`. The server stores them against a random single-use code that lasts two minutes, and the page goes to the new address with the code in the URL fragment (never sent to a server or in a referrer).
  - On the new address it removes the fragment, posts the code to `/api/move/claim`, receives a fresh session cookie for the same player and the saves, and writes each save only if that key is empty. The old session is deleted when the code is claimed, so a failed handoff can be retried from the old address.
  - Someone already signed in at the new address keeps that session; the code is used up and only empty saves are filled.
  - No session at the old address: plain forward, with the path and query (invite links) kept.
- **Storage.** One additive table, `moves(code, player, session, saves, expires)`, holding hashes of the code and old session. Rows are removed on claim, on expiry at the nightly clean-up, and on account deletion.
- **Mail.** `MAIL_FROM` and `PRIVACY_CONTACT` use `hello@playsimi.danielquek.com`.

## Steps

1. Server: `moveOut` / `moveIn` in `server/community-core.mjs`; routes in `cloudflare/api.mjs`; old-address gate in `cloudflare/worker.mjs`. Tests in `tests/community.test.ts` and `tests/cloudflare.test.mjs`.
2. Client: `src/move.ts`, `src/boot.ts`, `index.html`. Test in `tests/move.test.ts`.
3. Config: `wrangler.jsonc`.
4. Documentation: go-live checklist in HOSTING.md; current address in README and ACCOUNTS. PAYMENTS.md keeps its record of the existing webhook until the checklist repoints it.
5. Verify, commit, push, open the pull request.

## Risks

- Deploying before the Resend domain is verified stops sign-in email. The checklist orders the steps.
- Browser saves and cookies cannot cross addresses without the handoff; a player who never returns to the old address in a browser that still has the cookie cannot be carried over. Email accounts can always sign in again.
- A custom domain and mail records share one hostname. The Worker's address records and the MX/TXT records for mail are different record types and can coexist.

## Verification — 5 October 2026

- `npm test`: 202 tests, 198 pass, 4 skipped (browser checks that need `DARECADE_TEST_CHROMIUM`). Six are new: one in `tests/community.test.ts` and five in `tests/move.test.ts`.
- `npm run test:cloudflare`: build and deployment dry-run pass with the new address and sender in the bindings; 9 of 9 integration tests pass. The new one runs the whole handoff in the Workers runtime: the old address refuses everything but the handoff and the Stripe webhook, issues a code, and the new address continues as the same player with the old session ended.
- Built app on a local server: the game still starts through the new entry script with its styles, and a code in the address is removed on a fresh load.
- Not verified: the handoff between the two real addresses, the custom domain and certificate, Resend sending from the new domain, mail forwarding and the Stripe endpoint. These need the HOSTING.md checklist, which changes live settings and has not been started.
