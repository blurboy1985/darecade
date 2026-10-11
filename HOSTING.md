## Outfits with pet and magic, and single items — deployed 11 October 2026

PR #89 (merged as `d140909`) was deployed as Worker version **`a7d68460-d891-4d3a-ba77-2106ca848353`**, replacing the outfit-only offer deployed earlier the same day. The owner set the offer: an outfit is clothes, headwear, pet and magic for S$4.99; any one of those is S$1.99; Legendary looks also take Style tokens and Premium takes money only; outfit cards show the pet and magic. Before merging, `npm test` passed (607 tests: 558 pass, 0 fail, 49 browser checks skipped) with all 17 Cloudflare integration tests, the build and the dry run.

After deploying: health returned `ready: true`; the live `index-CCTlyjb8.js` and the first outfit card matched the local build byte-for-byte; unauthenticated payment config returned 401. Both Stripe catalogues were read back: sixteen outfit prices at SGD 499 tagged `kind=outfit`, four single-item prices at SGD 199 tagged `kind=piece`, each active and its product's default. Live Checkout Sessions on the Solar outfit price and the pet item price reported SGD 499 and SGD 199 and were expired unpaid. In the sandbox before the merge, a pet bought for S$1.99 with Stripe's test card unlocked that pet only, and an order from the outfit-only hours covered its set's magic.

`STRIPE_CATALOG` gained the four `piece-*` prices (24 entries). No schema, migration, binding or secret changed. Stage Party rooms and races in progress ended with the deployment. Not done: a completed live charge, opening the live site in a browser, a sandbox refund of a single item (unit test only), and a phone. Do not roll back past `d824baa`: older builds drop `piece:` purchases and `outfit:` grants.

## Outfit-only pricing and accessory magic — deployed 11 October 2026

PR #88 (`d824baa`, merged as `af98775`) was deployed as Worker version **`07316aa4-a191-405d-af17-ad7d2461a699`**. The owner asked for outfits to be sold without pets and magic at S$4.99, for more interesting magic, for Stripe to carry the new price, and then for the work to be shipped. On the merged tree `npm test` passed (607 tests: 558 pass, 0 fail, 49 browser checks skipped) with all 17 Cloudflare integration tests, the build and the dry run.

A purchase or an 8-token unlock now gives a set's clothes and headwear. Pets and magic cost 4 Style tokens each in Legendary and Premium sets. Whole sets bought for S$1.99 or unlocked earlier keep all four pieces. The 66 set magics are built from accessories. See PAYMENTS.md and WARDROBE.md.

After deploying: health returned `ready: true`; the live `index-CMyCwX9j.js` and the Solar magic thumbnail matched the local build byte-for-byte; unauthenticated payment config returned 401. In Stripe, the sixteen catalogued sets have an active SGD 499 price as their product default, in sandbox and live, and the sixteen S$1.99 prices are archived in both. A live Checkout Session on the new Solar price reported SGD 499 on `checkout.stripe.com` and was expired unpaid. A sandbox purchase of Solar at S$4.99 before the merge delivered a signed webhook (HTTP 200), granted `outfit:solar`, let the clothes be worn and refused the pet and magic.

`STRIPE_CATALOG` changed to the new live price IDs. No schema, migration, binding or secret changed. Stage Party rooms and races in progress ended with the deployment. Not done: a completed live charge, opening the live site in a browser, and a phone. Do not roll back to a build before `d824baa` once anyone holds an `outfit:<set>` entitlement: the older normaliser drops it, and the S$1.99 prices that build charges are archived.

# Cloudflare hosting

## Rankings, leaderboard rows and XP progress — deployed 11 October 2026

PR #86 (`ed5893d`) was merged and `main` was deployed as Worker version **`000cd78a-e47b-40cb-80d8-73a5534338ee`**. The owner asked for the PR, then for it to be merged and deployed. Before merging, the branch passed `npm test` (605 tests: 556 pass, 0 fail, 49 browser checks skipped) and all 17 Cloudflare integration tests, including the build and dry run. In installed Chrome, the seasons, Section 4, mobile lobby and experience files ran 25 tests, all passing; these ran before the last commit, which changed one CSS rule for the Coast Rush board and was looked at in a browser instead. `main` after the merge is the same tree as the one tested.

Rankings now opens on the period picker, the player's rank card and the board; level, the daily Play medal goal and game bests follow under **Your progress**. The season board keeps the Quests / Challenges / Rankings tabs. Board rows name their unit once in a header, show medals on the top three, mark the player's own row and truncate a long nickname, which used to widen the dialog. The list starts at rank 4 under a podium. The rank card names the player directly ahead. Level progress shows `65 / 100 XP` with a thicker bar, the profile panel shows it too, and a round receipt says when the round crossed a level.

After deploying: health returned `ready: true`; the live HTML and all 18 script and style files matched the local build byte-for-byte, including `index-PhmVFqfL.js`, `main-CK825HJ7.js` and `main-C01DlOgu.css`; unauthenticated state returned 401, auth config 200 and private server paths 404; the old address still answered. The change was reviewed locally at 390x844 and 1280x800 against a mocked `/api/state` with 12 players. It was not exercised in production: Rankings was not opened there, no round was played to see a receipt, and nothing was tried on a phone, in Firefox or in Safari, where the restyled progress bars use `appearance: none` and `::-moz-progress-bar`.

No schema, migration, binding, variable or secret changed. Stage Party rooms and races in progress ended with the deployment. Rollback is a redeploy of `5f542b0`.

## Play now on a first visit, activity discovery — deployed 11 October 2026

PR #83 (`f0e35fb`) and PR #84 (`585efa9`) had been merged on GitHub; local `main` was fast-forwarded to `585efa9` and deployed as Worker version **`3b1989e7-29a6-40e0-83d1-eb17e2d29a40`**. Both PRs were written as drafts with no browser playthrough. Before deploying, `main` passed `npm test` (601 tests: 552 pass, 0 fail, 49 browser checks skipped) and all 17 Cloudflare integration tests, including the build and dry run. In installed Chrome, the experience, mobile lobby, onboarding and Section 4 files ran 27 tests: 25 passed and 2 in `tests/experience-browser.test.ts` failed because the test helper looked for Fishing in the Arcade pager while Play now opens on Discover for a player with fewer than five rounds. With the helper choosing Arcade games first, all 13 tests in that file pass; the game was not changed.

The first-visit card now puts **Play now** first, which goes straight to the age and privacy check, and offers the 40-second film as **Watch intro**. For a player with fewer than five saved rounds, Play opens on **Discover something fun**: three playable tiles a page across all 13 activities, Race, Dance and Hoops first. Arcade games and Play outside are still in the same selector. A round's result offers one different activity to try next, in place of the Neighbourhood button on arcade results.

After deploying: health returned `ready: true`; the live HTML and all 18 script and style files matched the local build byte-for-byte, including `index-BPl5NQ67.js`, `main-BKqXMLw8.js` and `intro-B2AijzWR.js`; unauthenticated state returned 401, auth config 200 and private server paths 404; the old address still answered. Neither change was exercised in production: the first-visit card and the Discover pages were not opened there in a browser, no round was played to see the next-activity button, and nothing was tried on a phone.

No schema, migration, binding, variable or secret changed. Stage Party rooms and races in progress ended with the deployment. Rollback is a redeploy of `622fe3a`.

## Open Stage pickers, lobby profile and world label, rival crates — deployed 11 October 2026

PR #79 (`99aa106`), PR #80 (`c3302d3`) and PR #81 (`7d58876`) were merged in that order and `main` was deployed as Worker version **`148ca2a9-8e08-49d4-b6dc-cc1c938af2c6`**. The three branches conflicted in `PLAN.md` only; `main` was merged into #80 and #81 and each branch's plan kept, and nothing was force-pushed. #81 was a draft; the owner said to merge the PRs and deploy. Before merging, the three branches merged together passed `npm test` (594 tests: 545 pass, 0 fail, 49 browser checks skipped), all 17 Cloudflare integration tests, including the build and dry run, and, in installed Chrome, the 37 tests in the Section 4, lobby render, first minute and stage UI files. `main` after the three merges is the same tree as the one tested (`49c4f01`).

The Open Stage now opens idle and waits for Start, with session and dance style as one-tap buttons, shorter copy and a slightly kinder show (a miss costs 0.08 hype, seven misses in a row end a show, Perfect is 83 ms and Great 150 ms). The lobby profile at the top left is a button that opens a profile panel, the world label reads `W1 · 1/30 players`, and Neighbours explains an empty world instead of showing an empty dropdown. In Coast Rush a crate hides for 1.2 seconds when a computer kart collects from it and the kart's nameplate shows the item it holds; race room snapshots carry that item as a sixth value per row.

After deploying: health returned `ready: true`; the live HTML and all 18 script and style files matched the local build byte-for-byte, including `main-CqKI_s-n.js`, `stage-view-CSO0gBRK.js` and `race-view-B6JK6DdA.js`; unauthenticated state returned 401, auth config 200 and a private server path 404; the old address still answered. None of the three changes was exercised in production: no show was played, no profile panel opened and no race run there, and nothing was tried on a phone. Nobody has played the easier Open Stage, and a race room showing a computer kart's item has not been watched in a browser.

No schema, migration, binding, variable or secret changed, and Coast Rush stays on rules version 5, so no personal best is archived. Stage Party rooms and races in progress ended with the deployment. Rollback is a redeploy of `09581e3`.

## Coast Rush solid karts and fighting rivals — deployed 10 October 2026

PR #76 was merged (`b92937e`) and `main` was deployed as Worker version **`5acb88de-c855-49d7-b6c6-e4313c496043`**. The PR was a draft because nobody had driven it; the owner said to merge and deploy it anyway. Before merging, the branch with `main` merged in passed `npm test` (540 pass, 0 fail, 49 browser checks skipped) and all 17 Cloudflare integration tests, including the build and dry run. `main` after the merge is the same tree as the one tested.

Karts in Coast Rush are now solid, for drivers and computer karts alike, and computer karts take about twice as many items and block or lean on other karts. A first race has no rival items and no blocking.

**Rules version 5.** The replayed simulation changed, so Coast Rush moves to rules version 5. On its first start the server writes `coast_contact_from` into the `rules` table with that day's date, and races from before that day settle under version 4. A saved `coastRecord` of version 4 is moved to `coastLegacyBest`, so every player's next race is a first finish again. This is the same path as versions 2, 3 and 4. No schema, migration, binding, variable or secret changed.

After deploying: health returned `ready: true`; the live HTML and all 18 script and style files matched the local build byte-for-byte, including `race-view-C2lUQuo9.js`; unauthenticated state returned 401, auth config 200 and a private server path 404; the old address still answered. No race was run in production and nothing was tried on a phone. The cost of replaying a race on Cloudflare was not measured; locally it is 14.6 ms against 8.3 ms before.

Rollback: redeploy `675a630`. That does not undo the rules change for players: `coast_contact_from` stays in the database, and a browser that has loaded this version holds a version 5 record, which the older code sets aside as a legacy best. Races in progress ended with the deployment.

## Open Stage song and timing, world chat window — deployed 10 October 2026

PR #74 (`bfd0a53`) and PR #75 (`6d944aa`) were merged in that order and `main` was deployed as Worker version **`1e032892-48cd-4190-98ff-db9b248d059a`**. Before merging, the two branches merged together passed `npm test` (536 pass, 0 fail, 49 browser checks skipped) and all 17 Cloudflare integration tests, including the build and dry run. `main` after both merges is the same tree as the one tested.

Every Open Stage show now plays a song written from its chart, and timing has a Great tier (±133 ms, 75 points) with Good widened from ±150 ms to ±200 ms. The keyboard lanes are the arrow keys or W A S D; D F J K no longer work. World chat opens as a window that keeps up to 100 messages heard since the page loaded and marks your own message as sending, sent or not sent. The world now takes a chat message before applying the movement limit, and the page spaces messages through an outbox, so messages are no longer dropped without notice. The world still keeps a message for 10 seconds and stores nothing.

After deploying: health returned `ready: true`; the live HTML and all 18 script and style files matched the local build byte-for-byte, including `main-BZV0B-Vl.js`, which carries the chat window; unauthenticated state returned 401, auth config 200 and a private server path 404; the old address still answered. Neither feature was exercised in production: chat needs two signed-up players, and none were created there. Nobody has listened to the stage song through speakers, and nothing was tried on a phone.

No schema, migration, binding, variable or secret changed. Stage Party rooms and races in progress ended with the deployment, as with every deployment. Rollback is a redeploy of `d76c049`.

PR #76 (Coast Rush contact) was left open as a draft. It moves Coast Rush to rules version 5, which archives every player's personal best on deployment, and nobody has driven it.

## Typed chat in the shared world — deployed 10 October 2026

PR #72 was merged (`5808948`) and `main` was deployed as Worker version **`58f32cb6-0d3d-4e85-8f37-6a929307fdfb`**. Before merging, the merged tree passed `npm test` (525 pass, 0 fail, 49 browser checks skipped) and all 17 Cloudflare integration tests, including the build and dry run. One of the 17 is new and sends chat over real WebSockets and over polling.

Players in a world can now type messages of up to 120 characters, one every 1.5 seconds, to everyone in that world. A world keeps a message in memory for 10 seconds and stores nothing. Blocks and mutes apply. The owner asked for this with the earlier no-free-text-chat rule set aside: there is no word filter, no contact-detail check and no way to report a message, and it has not been through the privacy review (see PRIVACY-REVIEW.md). The sign-up notice now says world chat exists. The owner chose to leave `PRIVACY_VERSION` at `2026-10-03`, so existing players are not asked to agree to the changed notice.

After deploying: health returned `ready: true`; the live HTML named the same assets as the local build and all three matched byte-for-byte, as did `main-U5LsbUAW.js`, which carries the chat panel and the new notice text; unauthenticated state returned 401; the old address still answered. Chat itself was not exercised in production: that needs two signed-up players, and none were created there. It was not tried on a phone.

No schema, migration, binding, variable or secret changed. Rollback is a redeploy of `118179b`.

## Coast Rush multiplayer and chat, bigger action prompt, Open Stage party — deployed 10 October 2026

PRs #67 (`b74d211`) and #69 (`c8f3ace`) were merged and `main` was deployed as Worker version **`74aaede0-dae7-49fd-9263-26a7c79514a4`** at about **14:42 SGT**. The previous deployment was PR #65 (`4da7d3f`, version `9d12a1ea-df2c-4fad-a983-0843ab8cf65e`), so this one also carries #66 (an ignore rule), #68 (live multiplayer Coast Rush) and #70 (quick chat in race rooms) into production for the first time.

Both open branches conflicted with `main` in `PLAN.md` only. `main` was merged into each and the branch's plan kept; nothing was force-pushed. Before #69 was merged, its branch held exactly the tree that became `main` (`384a589`), and on it 564 Node tests ran (515 passed, 49 browser checks skipped) and all 16 Cloudflare integration tests passed, including the build and dry run.

After deploying: health returned `ready: true`; the live `index.html` matched the local build byte-for-byte and referenced `index-GHqD6uxl.js`; that file, `main-fdpy-6Oj.js`, `main-Ct0OjJvm.css`, `stage-view-BqhesCLM.js`, `stage-moves-kntQLZvl.js`, `race-view-D0cjuDXK.js`, `state-DbckJvOK.js` and `character-jUuAnb2i.js` also matched; the previous `index-C7o4rCJX.js` returned 404; unauthenticated state and `POST /api/stage/host` returned 401 and a private server path 404; `/api/race/connect` refused a bad code with 400 and another site with 403; the old address still answered. In headless Chromium the live page reached the welcome check with no page or console errors.

**New binding and migration:** `RACE` points at the new SQLite Durable Object class `Race`, added by migration `v3`. `Neighbourhood`, `World` and their data are untouched. No variable or secret changed. Stage Party rooms are held in memory, so every later deployment ends the parties in progress, as it ends races in progress.

Not verified in production: anything behind the welcome check. No production profile was created, so the `Race` object has not been reached live (it sits behind sign-in), and no multiplayer race, chat line, Stage Party, Fever or Encore show was played. The bigger action prompt was not seen on the live site. Phones were not tried.

Rollback: redeploy `4da7d3f` with the `RACE` binding and the `v3` migration left in `wrangler.jsonc`; a deployed migration cannot be dropped by removing it from the file.

## Lobby music in the intro film's style — deployed 8 October 2026

PR #60 was merged (`cd20115`) and `main` was deployed as Worker version **`75e90f4a-e292-4d42-beae-60ae2d096854`** about twelve minutes after the intro film below. Before merging, 519 Node tests ran (470 passed, 49 browser checks skipped) and all 15 Cloudflare integration tests passed, including the build and dry run.

The day and night lobby themes now play arcade pop like the intro: a square-wave lead on the film's hook, a bouncing bass and a backbeat at 120 beats a minute, with a slower, softer take at night. Game and Coast Rush music are unchanged. Rendered offline in Chromium, the new themes are slightly quieter than the ones they replace (day 0.0181 against 0.0216, night 0.0189 against 0.0201), with no clipping and no silent second over a full 16-bar loop.

After deploying: health returned `ready: true`; the live HTML referenced `index-BTtkUEZk.js`, and `main-D4TgoN4J.js`, which carries the new music, matched the local build byte-for-byte; unauthenticated state returned 401; the old address still answered; the game and the intro loaded in Chromium with no page or console errors.

No schema, migration, binding, variable or secret changed.

Not verified: the sound itself. Nobody but the owner can listen to it; the checks are numerical. `tests/music-browser.test.ts` times out on the Windows machine used here with or without this change, so its assertions were run through a separate Chromium harness.

Rollback: redeploy `2dff68a` (keeps the intro film, restores the earlier lobby music).

## Intro film — deployed 8 October 2026

PR #58 was merged (`2dff68a`) and `main` was deployed as Worker version **`4f5cf2f2-77b9-4f1b-ac39-73a2de9df0ed`** at about **23:29 SGT**. Before deploying, 519 Node tests ran on merged `main` (470 passed, 49 browser checks skipped) and all 15 Cloudflare integration tests passed, including the build and dry run.

After deploying: health returned `ready: true`; the live HTML referenced `index-D7ikb1ug.js`, and that file, `intro-BCv-jhEs.js`, `intro-script-CZMook2g.js` and `intro-CmY_W6Tn.css` matched the local build byte-for-byte; unauthenticated state returned 401; the old address still answered. In Chromium against production with `?intro=1`, the start card showed, the film played, **Skip intro** and Esc each removed it, set the seen flag and loaded the game, and a plain automated visit went straight to the game, all with no page or console errors, so the content security policy does not block the film.

No schema, migration, binding, variable or secret changed. The only new stored value is `playsimi-intro-seen` in the browser.

Not verified in production: the sound (nobody has listened to the score), a full 40-second run to the logo (checked locally only), Safari, Firefox and a real phone.

Rollback: redeploy `8b94c50`. The seen flag is ignored by older code.

## New avatar and six premium sets — deployed 5 October 2026

PR #35 was merged by the owner (`8aa97ec`) and `main` was deployed as Worker version **`521f60e1-8f21-4d1e-8a8a-ff517e58e48d`** at about **22:45 SGT**. Before deploying, 383 Node tests ran on merged `main` (366 passed, 17 browser checks skipped) and all 14 Cloudflare integration tests passed, including the build and dry run.

After deploying: health returned `ready: true`; the live HTML referenced `index-d6_amCuS.js`, and both that file and `models/neighbour-chibi2.glb` matched the local build byte-for-byte; the new wardrobe pictures returned 200; the retired `models/neighbour-chibi.glb` returned 404; unauthenticated state returned 401 and private server paths 404; the old address still answered.

`STRIPE_CATALOG` now carries 20 entries (16 sets, 4 donations). No schema, migration, binding or secret changed. Looks gain an optional `body` field inside the existing JSON.

Not verified in production: a signed-in view of the wardrobe and the payment catalogue (that needs a production profile, and none was created), a purchase of a new set, and phones. The `Darecade server` Stripe key was given Products and Prices write to create the prices; the owner should remove it.

Rollback: redeploy `bd9c68f`. Players who chose Boy or a new item keep those values in their saved look; the older code ignores `body` and resets out-of-range items to the default.

## Move to playsimi.danielquek.com — deployed 5 October 2026

PRs #20 (rename to Play Simi) and #21 (the move) were merged and `main` (`3c3bb09`) was deployed as Worker version **`c9777ba6-0e14-4c97-8dd9-5103508f23ad`** at about **03:00 SGT**. Before deploying, 205 Node tests ran on `main` (201 passed, 4 browser checks skipped) and all nine Cloudflare integration tests passed.

Live checks straight after:

- `https://playsimi.danielquek.com` serves the game with the Play Simi title and security headers; `/api/health` reports ready, `/api/auth/config` returns 200, an unauthenticated profile request returns 401 and a private path returns 404.
- At the old address the page loads, `/api/auth/config`, `/api/auth/me` and `/api/world/connect` return 403, a handoff request without a key or from another site is refused, and one with a key but no session returns no code. An unsigned Stripe webhook is rejected with 400 at both addresses, so the old endpoint still reaches the signature check.
- In a browser with no session, opening the old address with an invite code arrived at the new address with the welcome check showing and the invite kept.

**Sign-in email failed from the deployment at about 03:00 until the key was changed at about 03:13 SGT.** The Worker sends from `hello@playsimi.danielquek.com`, and the stored `RESEND_API_KEY` was restricted to the old domain. The owner edited that key's domain in Resend to `playsimi.danielquek.com`; the Worker secret did not change. Guests and gameplay did not need email.

Checked at 03:14 SGT: the live game was asked for a sign-in notice to `hello@playsimi.danielquek.com`. Resend shows `Your Play Simi sign-in request` delivered from the new sender, and Cloudflare Email Routing shows the same message forwarded to the verified destination. This proves sending from the new domain and the new forwarding rule. TLS on the new Resend domain was then set to Enforced, matching the old domain.

Not verified live: a six-digit sign-in code used to sign in (no production account was created for this check), arrival in the destination inbox itself, a handoff carrying a real session, and a real purchase through the new webhook address.

Later on 5 October the Stripe webhook was repointed (step 6) and a re-sent event was delivered to the new address with HTTP 200; see PAYMENTS.md.

Cloudflare's Web Analytics script is injected into pages on the custom domain and is blocked by the page's content security policy, so it does not load. Turn off the automatic injection for the zone to remove the console error.

### Preparation and checklist

All seven steps are done. What has not been checked live is listed above.

What the deployment changes:

- The Worker keeps the name `darecade`, so the `Neighbourhood` Durable Object `darecade-main-v1` and every account stay attached. `wrangler.jsonc` adds `playsimi.danielquek.com` as a custom domain, sets `PUBLIC_ORIGIN` to it and names the old address in `LEGACY_ORIGIN`.
- The old address serves the same page, which now only hands the player over: the old address sends the browser to the new one, which makes a random key for that tab and sends it back; the old address swaps the session and browser saves for a single-use two-minute code tied to that key (`POST /api/move`); the new address swaps the code back with the key (`POST /api/move/claim`). A code is useless without the key held by the tab that asked for it, so a link carrying someone else's code signs nobody in. The old session ends when the code is claimed. Every other API request at the old address is refused, except Stripe's signed webhook.
- Sign-in email comes from `Play Simi <hello@playsimi.danielquek.com>`, which is also the privacy contact.
- The Records database gains one table, `moves`. It is created on first use, emptied of expired rows nightly and cleared on account deletion.

Checklist:

1. **Merge PR #20** (the rename) first; this change is stacked on it. Done.
2. **Resend — done 5 October 2026.** `playsimi.danielquek.com` was added in the Tokyo (`ap-northeast-1`) region with manual DNS setup, and Resend reported it Verified at 02:56. Three DNS-only records were added to the `danielquek.com` zone: TXT `resend._domainkey.playsimi` (DKIM), CNAME `rsend.playsimi` to `rsend-apne1.forge.rmta.net` and CNAME `send.playsimi` to `send.forge.rmta.net`; all three resolve on 1.1.1.1. Tracking is off. TLS is Enforced. The existing sending key, still named `Darecade production sign-in` in Resend, had its domain changed from `darecade.danielquek.com` to `playsimi.danielquek.com`, so no new key or secret was needed.
3. **Cloudflare Email Routing — done 5 October 2026.** The `playsimi` subdomain is enabled with locked DNS records; its three MX records and SPF TXT resolve on 1.1.1.1. The rule `hello@playsimi.danielquek.com` is active and forwards to the same verified destination as before. The `hello@darecade.danielquek.com` rule is kept so replies to earlier email still arrive, and catch-all remains disabled. Not yet verified: a real message arriving through the new rule.
4. **Deploy — done.** `npm run cf:deploy`. Wrangler created the custom domain and its certificate. The key's domain was changed in Resend afterwards (step 2), so `wrangler secret put RESEND_API_KEY` was not needed.
5. **Check — done except a real session handoff and a used sign-in code.** `https://playsimi.danielquek.com/api/health` returns ready; a sign-in code arrives from the new sender; opening the old address in a browser with an existing guest lands on the new address as the same character.
6. **Stripe — done 5 October 2026.** Change the webhook endpoint `we_1UMlTDA6Maf1zlslfAoUT1gA` to `https://playsimi.danielquek.com/api/payments/webhook`. Editing the address keeps its signing secret. Until then events sent to the old address are still accepted.
7. Record the Worker version and the checks here. Done.

Rollback: redeploy the previous commit. Sessions created at the new address stay valid in the database but their cookies belong to the new address, so those players sign in again or play as before at the old one.

## Ghost and one dare a day removed, 5 October 2026

At the owner's request, PR #19 (`6d6bdb86905d6f50bcf3aa78ae1a3d0ce91a3712`) reverted PR #18 about ten minutes after the deployment recorded below. Deployed `main` as Worker version **`c7b780be-ffb6-4259-99d0-c7ca25efb0af`**. At **02:16 SGT**, production health returned `ready: true`; the live HTML referenced `index-DoHLrHvf.js`, and both that asset and `race-view-CHiuMCLb.js` matched the local production build byte-for-byte. The live bundle no longer contains the ghost or daily-dare copy and again contains the 24-hour hold copy. Unauthenticated state returned 401.

The application code is identical to `main` before PR #18 (`d683a21`), so PR #17's playtest fixes remain live and dares are back to the 24-hour hold with three outgoing dares a day. The only kept change is the wardrobe render test claiming the daily hat on the current day. PR #18 stored no new data, so nothing was migrated back. 196 Node tests ran: 192 passed, 4 skipped (browser checks that need `DARECADE_TEST_CHROMIUM`). All eight Cloudflare integration tests, the build and the deployment dry-run passed.

Not verified live: a signed-in round or dare, and a physical phone. No production account was created for this check.

## Neighbourhood ghost, one dare a day and playtest fixes, 5 October 2026

Merged PR #18 (`eb853644915b7f1c382b70ef4ff85c19c33ad33f`), which also carries PR #17's playtest fixes into production for the first time, and deployed `main` as Worker version **`176977a6-a5b4-47c3-9add-e9f518042ba8`**. At **02:09 SGT**, production health returned `ready: true`; the live HTML referenced `index-Ck6QE6sh.js`, and both that asset and `race-view-Dtgm8LYE.js` matched the local production build byte-for-byte. Unauthenticated state returned 401 and private server paths returned 404.

Coast Rush now names a ghost to beat: the player's last finished time, or a fixed 1:45.00 neighbourhood ghost before a first finish. The 24-hour dare hold is replaced by one dare a day once a player, guest or account, has finished one verified round. PR #18 conflicted with PR #17 in seven files; the merge keeps PR #18's dare rules and drops PR #17's hold copy (`dareHoldCopy`, `dareBlock`) with its tests, and keeps the rest of PR #17: guest Rankings, weekly-board copy, tap GO, steering help before a first finish, end reasons and the account conflict choice.

200 Node tests ran: 196 passed, 4 skipped (browser checks that need `DARECADE_TEST_CHROMIUM`). All eight Cloudflare integration tests, the build and the deployment dry-run passed. One PR #17 test claimed the daily hat on a fixed 4 October and failed from 5 October; it now claims on the current day. No schema, migration, binding, secret or rules-version change.

Not verified live: a signed-in race showing the ghost, a played dare, and a physical phone. No production account was created for this check.

## Coast Rush stable kart and front wheels, 4 October 2026

Deployed source commit `ca88b8040f5ce12cc3f1758cfc1379321346d952` as Worker version **`42d95c6a-f43f-42a2-842e-653b1d167029`**. At **19:24 SGT**, production health returned `ready: true`; the live HTML referenced `index-BT4VnOZk.js`, and both that asset and `race-view-RXPOxWxF.js` matched the local production build byte-for-byte.

The release removes chassis rocking, rival hit spins and repeated boost/shield/cosmetic pulsing. Display interpolation and continuous track headings steady player and rival movement between physics ticks. Front-wheel steering eases visually while controls remain immediate. Round tyre/rim surfaces retain their orientation around the axle, eliminating the rapidly rotating polygon edges that resembled wheel shaking. Physics, race verification and leaderboard rules are unchanged.

All 176 Node tests and eight Cloudflare integration tests passed, including Chromium checks, build and deployment dry-run. The actual Three.js view verified stable surfaces on all 32 wheels at turbo speed and filtered rapid alternating steering. A real mobile-sized local race ran with no horizontal overflow. Physical-phone comfort is not established by automated tests.

## Coast Rush clarity and post-race setup, 4 October 2026

Deployed code commit `f7abbf7805094a284209f0ea157cb3a3e326f1f4` as Worker version **`c9e77b3e-44b3-4b3f-8195-d1d81e251a1c`**. Production HTML and the expected `index-qoU7Lmhv.js` asset returned 200. The browser reached the age/privacy onboarding screen. All 171 Node tests, eight Cloudflare integration tests, build and deployment dry-run passed.

The release stabilizes the chase camera during acceleration, renders upright screen-space racer names, and puts the player's time and today's SGT leaderboard before name/look setup. Guest Coast Rush comparisons can read ranked times while retaining blocked-player filtering. Guests still need email verification and a subsequent ranked race to enter the board. Optional details and extended wardrobe choices are collapsed.

Live verification succeeded at approximately **18:15 SGT**: a disposable guest completed a server-verified **1:03.60** Coast Rush replay after the full real duration, with duplicate-reward protection. Mandatory name selection, outfit persistence and setup completion passed. The guest did not enter the ranked board; its profile was deleted and session revocation returned 401. Today's live board was empty during this check; populated/tied comparisons were verified against isolated local fixtures. No production email was sent. Physical-phone performance and fresh real-inbox delivery remain unverified. Existing Worker bindings, migrations, billing, payment configuration and secrets were preserved.


## Remaining PR deployment, 4 October 2026

Redeployed main `646b81a` first as version `093907e0-d0f1-4a97-8dc1-ee8da794fd7b`. Then merged PR #8 (ready-screen controls, `1760a6d`), #9 (Records quota efficiency, `cdf5605`) and #6 (East Side activities, `098ab66`). Deployed combined main **`098ab664cf6da6f6371839483661c69be5139fe9`** as Worker version **`97e9c742-97cf-4c8b-a658-bcd7f7f69695`**. No open PRs remained at verification. All billing settings, secrets, Durable Object identities and migrations, ranked physics and rules versions were preserved.

**103 Node tests, seven Cloudflare integration tests, the production build and deployment dry-run passed.** For 1,000 players and 20,000 runs, cached personal state measured p95 **0.95 ms**, maximum **1.45 ms**, and full rebuilds **32.00–41.47 ms**. The isolated local database probe recorded 659 rows read / 25 rows written and no errors. QUOTA.md contains PR #9's five-minute before/after evidence (35.5% fewer writes and 7.2% fewer reads); the five-minute run was not repeated for this integration. QA.md records local 320px/390px browser checks of ready/countdown controls, fishing, 2D hoops/plots, persisted rewards and the World picker.

**Production remains blocked by the Free account's SQL-write quota.** Fresh tail logs after the final deployment, at approximately **08:14 SGT on 4 October**, still reported `Exceeded allowed rows written in Durable Objects free tier.` during Records construction. The HTML returned 200 with expected `index-mIwoEDF4.js`; private server paths returned 404; health returned 200/ready (configuration only). Account config and state returned 500. The smoke stopped before creating a profile, so no production test account or score needs cleanup. Live account, WebSocket/poll, ranked-result, export and deletion verification is still pending. The expected daily reset had passed, but recovery was not observed; do not infer recovery from the clock or successful deployment. No Paid upgrade was made. Physical-phone performance, human audio/touch checks and real inbox delivery of email codes remain unverified.
## Deployment of scaling and PRs #3 / #5, 4 October 2026

Merged PR C #7 (`5ccd267`), PR #3 (`949c1fd`) and PR #5 (`48a1bfb`) in that order. Deployed tested main `48a1bfbd9e6a5181fb3e6a36186433a9c94f205c` as Worker version **`559210a7-cffa-418b-9acb-7dbaf6b56a84`**. This includes the World SQLite class/v2 migration, room picker, Coast Rush presentation and code-based account saving. Neighbourhood identity, v1 migration, physics, rules versions and secrets were preserved. The dashboard still shows Workers Free; no upgrade was made.

Local acceptance: **74 Node tests, six Cloudflare integration tests, build and dry-run passed**. The combined browser check exercised first-race results, nickname/outfit persistence, wrong/right codes and world reconnection after session rotation. A 320px tap-through issue on the World button was found and fixed; the picker then opened through a real pointer click. Detailed measurements are in QA.md and the local load section below.

**Production verification is blocked by the Free account's daily SQL-write quota.** Live tail reports `Exceeded allowed rows written in Durable Objects free tier.` from StoreCore initialization; account/state requests return 500 before a synthetic profile can be created. No production fixture was created by this verification. The HTML returns 200 and references the expected `index-CNm2J3H3.js` asset, security headers are present, health reports ready, and private paths return 404. The browser shows the retry screen. Health currently checks configuration only; it does not establish database availability.

The dashboard showed 31.92k writes for its displayed active namespaces, while runtime enforcement rejected further writes. That counter does not resolve the account-wide error; the earlier temporary hosted CPU benchmark also consumed account quota. The 150-player/five-minute load test remained entirely local. No quota bypass or paid-plan change was attempted.

Cloudflare documents daily limits resetting at 00:00 UTC (**08:00 SGT**). At verification time the next reset was **4 October 2026, 08:00 SGT**. Live account, WebSocket, poll, completed-round, export and deletion checks remain pending a reset or an owner-managed Paid upgrade. Real inbox delivery and physical iPhone/audio checks also remain unverified. The deployed code is in place; this entry does not claim the game is operational while its database quota is exhausted.

Opened 3 October 2026 at **https://darecade.daniel-tianwen.workers.dev** on the account's existing Workers Free plan. **Gameplay and accounts are enabled** (`LAUNCH_READY=true`) with a verified sending identity and private Resend secret. Initial opening version: `b4d4835f-7789-4099-89eb-2e52b529f4fb`. The privacy/support contact is `hello@darecade.danielquek.com`. Wrangler authorization is verified with account/user read, Workers Scripts Write and background access only. No paid upgrade has been made.

Free Cloudflare Email Routing is enabled for the domain and the `darecade` subdomain. The literal rule `hello@darecade.danielquek.com` is active and forwards to the operator's verified Gmail destination. Catch-all remains disabled. Authoritative DNS and the 1.1.1.1 resolver return the three Cloudflare MX records. The operator confirmed receipt of the approved sign-in test message in Gmail and successfully opened the neighbourhood from its link. This is incoming forwarding, not a separate mailbox or outgoing SMTP setup; ordinary replies from Gmail use the Gmail address until a separate authenticated sending configuration is added.

Pre-opening checks confirmed HTTPS HTML and the 3,296,036-byte character model returned 200, static security headers were present, the closed launch returned 503, and private database/server paths returned 404. After opening, health/config returned 200, unauthenticated neighbourhood access returned 401, and the browser displayed the birth-month/year gate. An isolated live test verified age and consent rejection, secure cookies, avatar persistence, a replay-validated practice round, duplicate-reward protection, tampered-result rejection, weekly-board access, own-data export, profile erasure and session revocation. That gameplay fixture was deleted; it never qualified for medals. No local profiles were uploaded. Current live physical-iPhone verification remains pending.

## Coast Rush deployment, 3 October 2026

Fast-forwarded `codex/coast-rush-grand-prix` into `main` at `8df18e2`, pushed to GitHub and deployed Worker version `b4d4835f-7789-4099-89eb-2e52b529f4fb`. This publishes the three-lap, eight-kart race and first-visit flow, including the corrected keyboard/touch steering and independent tyre rolling/steering pivots.

All **65 Node tests and three Cloudflare integration tests passed**, together with the production build and deployment dry-run. The existing bundle-size warning remains. Live `/api/health` returned `ready: true`, and the public HTML referenced the expected `index-CjZeC_gw.js` build. The live browser passed the age/privacy gates, opened Coast Rush through Play now, rendered all eight karts, and confirmed corrected A/D steering and pause. Existing account storage, the Durable Object identity, secrets, Wrangler variables and privacy version are unchanged. Historical two-lap results are preserved separately from the new race format.

The isolated live guest finished **1st/8 in 46.78s with 17 shells**, and the server verified the practice result. The cap reward and new-best result appeared; Another round reopened the race without a reload. The browser automation connection needed a reconnect during the run, but the race completed. The temporary guest profile was then deleted successfully, and its session returned 401. No real email was sent and no test score entered the ranked boards.

## Login email fix deployment, 3 October 2026

Merged `claude/fix-login-email` without conflicts in `9292e35` and deployed Worker version `323a512c-9c50-471b-abe8-2fabbc4a1a73`. All 57 Node tests, three Cloudflare integration tests and the production build passed. The deployed health endpoint returns `ready: true`. Resend secrets, Wrangler variables, rate limits and `PRIVACY_VERSION` are unchanged.

Exactly three live emails were approved and confirmed in the operator's Gmail Inbox: guidance at 21:31 SGT, account verification at 21:34 SGT and a fresh sign-in link at 21:35 SGT. The guidance arrived within seconds and contains no `#login=` token. The operator completed account creation in their own browser and confirmed successful sign-in using the latest email. Later attempts to reuse the links returned the expected invalid/expired message; no fourth email was sent. Separate local browser checks verified that recovery restores the same player ID and avatar. No replacement production avatar was created by the agent.

## What runs where

### Resend setup, 3 October 2026

The owned sending domain `darecade.danielquek.com` is verified in Resend's Tokyo (`ap-northeast-1`) region. Its DKIM TXT record and the DNS-only `rsend.darecade` and `send.darecade` CNAMEs resolve publicly. Sending is enabled, receiving remains disabled, and TLS is enforced. Tracking has not been configured. Existing Cloudflare incoming forwarding is preserved.

The sender is `Darecade <hello@darecade.danielquek.com>`. The user created and entered the prepared domain-restricted sending key directly into the production Worker secret `RESEND_API_KEY`; secret metadata was verified without revealing its value. Exactly one approved sign-in email was sent to the support alias, and Resend reports Delivered. The operator confirmed Gmail receipt and successful sign-in. The signed-in `Mail Check` profile is retained for the operator; it has no seeded scores or medals. The pre-verification guest session was revoked by account creation, and the local test-session credential was discarded. The key is absent from source control and browser assets.

- Cloudflare Workers Static Assets delivers the built game, fonts and Blender models from `dist/` over HTTPS.
- Records, the existing SQLite Durable Object class `Neighbourhood` at `darecade-main-v1`, holds accounts, profiles, runs, medals, dares, reports, blocks and suspensions. The new SQLite class `World` holds each live room. It requests Southeast Asia placement. This is a latency hint, **not a Singapore residency guarantee**.
- The original game/account rules are shared with the local Node server in `server/store-core.mjs` and `server/community-core.mjs`. `server/store.mjs` and `server/community.mjs` retain local SQLite/filesystem adapters, so existing local data and commands keep working.
- Database transactions preserve one-time rewards and challenge limits. A daily Durable Object alarm awards Singapore-midnight medals and performs retention cleanup even when nobody is online. Requests also catch up missed medal settlements.
- Resend delivers account sign-in emails. No local email outbox is available in the hosted game. `RESEND_API_KEY` is a Worker secret, never a browser asset or tracked configuration.
- Private request limits use salted IP hashes in the database, shared across edge locations and retained through object eviction. Raw IP addresses are not stored by this application. Expired buckets are removed by daily cleanup (within approximately 24 hours). Cloudflare/provider infrastructure logs have their own policies.

The scaling code described below is included in the deployments recorded above. Merging a PR alone does not deploy it. Local test accounts are never copied to the cloud.

## Multi-world scaling

### Architecture and migration

Keep the existing `v1` migration, `Neighbourhood` class, and object name `darecade-main-v1`. The `WORLD` binding points to the new `World` class with migration `{"tag":"v2","new_sqlite_classes":["World"]}`. Rooms use `WORLD.idFromName("world-1")`, `world-2`, and so on. Never replace the Records namespace to install this release.

Records computes shared boards, weekly results, dares and public cards in a 30-second memory cache, invalidated by completed rounds, posted dares, settlement and suspensions. Clients fetch their personal state every 30 seconds and on panel/game events. The Worker validates session cookies through Records before forwarding a WebSocket upgrade, replacing internal identity headers. Worlds retain public movement in hibernating sockets, send compact changed-player snapshots up to five times per second, and save position/activity to Records every 30 seconds and on departure. Each World reports occupancy every 10 seconds while occupied.

Auto-join chooses the fullest available world below 25 players; manual room codes and Join friend can fill its remaining places up to the hard cap of 30. The destination enforces the cap even when directory counts are stale. Worlds are created on demand. Empty worlds have no recurring alarm or movement timer and can hibernate with no active compute charge. A small stored metadata footprint remains subject to storage quotas. The Worlds panel and top-bar room code do not add a step before the first game.

Blocked pairs never receive each other's live or saved public cards, and the directory does not reveal a blocked player's room. Reports refresh affected worlds immediately. Suspension and session validity are refreshed within 30 seconds; new joins reject suspended players. Profile deletion and logout disconnect the live player before removing their identity/session. Away neighbours remain static between state refreshes. Node preview implements the same room selection and privacy rules over HTTP polling.

### Capacity and cost

The capacity target is about **25 players per world**, not 25 players for the whole service. Free supports SQLite Durable Objects and hibernating WebSockets. As checked on 4 October 2026, Free allows 100,000 Durable Object billable requests, 13,000 GB-s of active duration, 5 million SQL rows read and 100,000 rows written per day, with 5 GB stored across objects. Free quotas are shared across the account and reset at 00:00 UTC, or 08:00 Singapore time; exceeding one causes affected operations to fail until reset. Ordinary Worker requests have their own daily allowance. [Cloudflare quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/)

Cloudflare bills **20 incoming WebSocket messages as one Durable Object request**. The initial connection, HTTP calls, RPC calls and alarms also count; outgoing WebSocket messages do not. At continuous 5 Hz movement, one player-hour produces 18,000 messages, or 900 billable requests before those other calls. Worlds hibernate when idle, but sustained movement keeps them active. [WebSocket billing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

The initial planning estimate was roughly **100 player-hours/day** on Free, meaning 100 people for an hour or 25 people for four hours. Treat that as an optimistic light-use estimate, not a tested allowance. Continuous movement alone would use about 90,000 requests at that volume, before state reads and coordination. Snapshot rebuilds scan stored runs, so SQL reads can become the first limit as history grows. Use the local measurements below and hosted account usage to establish a safe operating budget.

Workers Paid starts at **US$5/month** and includes larger monthly allowances, with additional usage billed beyond them. It is not a fixed $5 spending cap. Upgrading is the owner's decision; this code neither enables Paid nor changes billing, secrets or production deployment. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)

### Local load test

See [Database quota measurements](QUOTA.md) for per-statement SQL counts, separate World storage-operation counts, comparison commands, and measurement limits.

Windows PowerShell, from the repository root:

```powershell
npm ci
npm run build
npm run load:test
# Short diagnostic run, not the acceptance load:
npm run load:test -- --players 3 --seconds 5
```

The test starts its own `wrangler dev --local` on loopback port 8799, with inspector port 9249. It uses `scripts/wrangler.load.jsonc`, a separate Worker name, disposable `.browser/load-*/state` storage, synthetic email accounts and no production bindings. The fixture is not imported into the deployed Worker. It refuses non-loopback requests and the runner accepts no target URL or remote flag. Never deploy the fixture or run load traffic against production. `ws` is a development dependency only.

The default run seeds 1,000 accounts and 20,000 runs, joins 150 players automatically across worlds, moves each at 5 Hz for five minutes, requests state every 30 seconds, and submits three actual replay-validated rounds after their required elapsed time. Seeding bypasses the public join rate limit without changing that limit in the application; it sends no email. Setup is excluded from the steady-state measurements. The fixture remains on disk for inspection and is not reused by subsequent runs.

Each run writes `report.json`, `records.cpuprofile` and `wrangler.log` under its evidence directory. The report includes connections, both message rates, errors, p95 snapshot interval/size, state wall latency, completed rounds, Records HTTP/RPC counts and SQL cursor rows read/written. SQL counters cover Records queries; they exclude World KV/alarm writes and are a lower bound on total storage usage. CPU is a **local 1 ms DevTools sampling estimate attributed to Records stacks**, divided by Records invocations. Sample count is used because workerd's sample time gaps can include idle time. It is not a per-request percentile or Cloudflare billed CPU measurement. Physical phone performance, WAN jitter, hosted CPU and billing still require separate verification.

#### Measured on 4 October 2026, 06:30 SGT

The five-minute local run used 150 players in six worlds of 25, with 1,000 registered accounts and 20,000 stored runs. All 150 stayed connected, no errors occurred, and three submitted rounds passed replay validation.

| Measurement | Result |
| --- | ---: |
| Incoming movement messages | 224,250 total, 747.46/s |
| Outgoing snapshots | 217,100 total, 723.63/s |
| Snapshot interval p95 / maximum | 213.59 / 409.45 ms |
| Snapshot size p95 | 641 bytes |
| State requests / p95 wall latency | 1,501 / 20.74 ms |
| Records invocations including RPC | 1,807 |
| Estimated local Records CPU per invocation | 0.705 ms mean, 1,274 attributed samples |
| Records SQL rows read / written | 3,358,227 / 16,898 |

This is 12.5 player-hours of continuous movement. Eight repeats of this same workload, equivalent to 100 player-hours, would read about **26.9 million rows** and write **135,184 rows in Records alone**. That exceeds Free's 5 million daily reads and 100,000 writes before counting World storage. The original 100 player-hours/day Free estimate is therefore **not supported for this stored history and workload**. Fewer stored runs and a different activity mix change the result; a smaller pilot needs its own usage budget. For sustained public use at this level, consider Workers Paid or further reductions in database reads. The owner must approve any upgrade.

The corresponding Node benchmark measured cached-state p95 1.05 ms and full rebuilds of 35.77–46.58 ms. The earlier hosted PR A CPU check measured cached state/presence at 1–3 ms and rebuilds at 53–75 ms. These are separate measurements; the local load sample does not prove hosted CPU, physical iPhone rendering, or internet network performance. Neither the load run nor this PR deploys scaling code.

## Required before publishing

1. Sign in to the correct Cloudflare account with Wrangler. Inspect the account's existing Workers plan before deployment; do not enable paid services without the agreed budget.
2. Choose the default `workers.dev` address or an owned domain. Set its exact HTTPS origin in `wrangler.jsonc`.
3. Supply a verified sending domain/address and configure the Resend secret locally. Confirm a monitored privacy/support address and accurate provider/storage notice.
4. Keep `LAUNCH_READY=false` until these fields and the email secret are set. The hosted API returns a setup message and accepts no accounts while incomplete. `/api/health` returns 503 until ready.
5. Deploy, verify the live age/privacy gate and headers, test delivery to an explicitly authorized test recipient, then verify saved-look recovery, a completed round, the weekly board, export and deletion. Run a real iPhone check against the HTTPS URL. Local runtime tests do not establish these live results.

The existing `PRIVACY-REVIEW.md` describes the outstanding operator, moderation, storage and recovery requirements. This implementation is not a certification of regulatory compliance.

## Commands — Windows PowerShell

From `C:\Users\Admin\Documents\darecade`:

```powershell
# All local; these commands do not publish or create cloud resources.
npm ci
npm test
npm run test:cloudflare

# User-mediated account authorization.
npx wrangler login
npx wrangler whoami

# Enter the email provider key into the private terminal prompt, never chat.
npx wrangler secret put RESEND_API_KEY

# After final configuration and authorization are complete:
npm run cf:deploy
```

`wrangler.jsonc` uses a named SQLite Durable Object migration. Do not rename `Neighbourhood`, change the stable object name `darecade-main-v1`, or delete its namespace as part of a routine update. These identify the saved world. A rollback of code is not a rollback of player data.

## Operations and recovery

The public API exposes no administrator route. Use the authenticated Cloudflare dashboard's **Durable Objects → Data Studio**, select the `Neighbourhood` namespace and object name `darecade-main-v1`, and review open reports with:

```sql
SELECT r.id, r.target, p.name, r.reason, r.created, r.status
FROM reports r JOIN players p ON p.id=r.target
WHERE r.status='open' ORDER BY r.created;
```

Data Studio requires Cloudflare editor access and audits queries. Restrict that access. Operator suspension can be applied by inserting the reviewed player ID into `suspensions`; account lookup then refuses that player and scoreboards omit them. Never perform blanket production deletes or copy unreviewed SQL containing private data into chat. The local `community-admin.mjs` operates **only on the local database**, not the hosted one.

Cloudflare's SQLite point-in-time recovery history can retain data for up to 30 days. Before restoring a snapshot, keep public access closed and reapply deletions/suspensions that occurred after the snapshot. Test recovery and erasure with synthetic accounts before inviting real users. Do not treat code deployment rollback as a data restore.

## Verified locally

The Cloudflare runtime test uses the same bundled Worker under Miniflare/workerd, with synthetic addresses and an intercepted email provider (no email leaves the test). It checks secure cookies, age/consent, atomic single-use login, newest avatar persistence through object eviction, all five replay-validated games, duplicate reward rejection, private feedback/export/deletion, cross-origin rejection, body-size limits, durable rate limits and fail-closed launch configuration. The original Node tests still exercise daily/weekly settlement, ties, challenge limits and local restart persistence.

## Official references checked 4 October 2026

- [Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/binding/)
- [SQLite Durable Object transactions and recovery](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
- [Location hints and their limits](https://developers.cloudflare.com/durable-objects/reference/data-location/)
- [Durable Objects free/paid quotas](https://developers.cloudflare.com/durable-objects/platform/pricing/)
- [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Private Data Studio access](https://developers.cloudflare.com/durable-objects/observability/data-studio/)
