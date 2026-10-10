# World chat — 10 October 2026

Branch `world-chat`, from `main`. The owner asked for chat in the shared
world and said to ignore the guidelines, which I read as the "no free-text
chat" rule in ACCOUNTS.md and PRIVACY-REVIEW.md. So this is typed chat.

## Done means

- A player in a world can type a message and everyone else in that world
  sees it with the sender's name, on both transports (HTTP polling on the
  Node preview, WebSockets on Cloudflare).
- Typing does not walk the avatar or trigger world shortcuts.
- `npm test`, `npm run build` and `npm run test:cloudflare` pass, and two
  players exchange messages against the running preview server.

## Assumptions

- Typed text, up to 120 characters, one message every 1.5 seconds per player.
- World-wide, not stored: the world keeps the last 10 seconds in memory so a
  2-second poll cannot miss a message, then drops it.
- Blocks already hide players from each other in a world; chat follows the
  same check. A muted player's messages are not shown, like their emotes.
- No word filter and no moderation queue. The owner chose to set the
  guidelines aside; this is recorded as an open risk, not solved here.
- Messages show in a panel, not as a bubble over the avatar.

## Steps

1. `shared/world-chat.ts`: limits and the text clean-up.
2. `server/world-core.mjs`: `say`, carried on a movement message as `say`,
   delivered in snapshots as `c: [id, slot, text]`.
3. `tests/world-chat.test.ts`.
4. `src/world-connection.ts`: `say(text)` and a `heard` callback.
5. `src/world-chat.ts` panel and its styles; mounted in `src/main.ts`.
6. Sign-up notice in `src/account.ts`, ACCOUNTS.md and PRIVACY-REVIEW.md:
   they say there is no chat, which stops being true.

## Risks

- Typed chat between teens (13–17) and adults with no moderation. The
  privacy review was written on the basis of no free-text chat.
- The sign-up notice changes. Players who already consented were told there
  is no chat.
- The phone HUD is already crowded.
- `tests/music-browser.test.ts` times out on this Windows machine on `main`.

## Outcome

- All six steps done. `npm test` 503 pass, 0 fail, 49 skipped (493 before);
  `npm run test:cloudflare` 17 of 17, with a new test that sends chat over
  real WebSockets and over polling; `npm run build` clean.
- Checked in desktop Chrome against the Node preview with a scripted second
  player: messages went both ways with the right names, markup in a message
  showed as text, a message sent too soon was dropped, and messages left the
  world after 10 seconds. Enter opened the box and sent.
- The browser player did not move while typing a message with w, a, s and d
  in it, but the tab was in the background and the 3D scene was not drawing,
  so try this once by hand.
- Merged as #72 (`5808948`) after merging `main` in; the merged tree passed
  `npm test` (525 pass, 0 fail, 49 skipped) and `npm run test:cloudflare`
  (17 of 17). Deployed as Worker version
  `58f32cb6-0d3d-4e85-8f37-6a929307fdfb`; HOSTING.md has the record.
- Not done: chat was not exercised in production, and nothing was tried on a
  phone, where the on-screen keyboard may cover the box.
- The owner chose to leave `PRIVACY_VERSION` at `2026-10-03`, so existing
  players are not asked to agree to the changed notice.
- Not built: a bubble over the avatar, a word filter, reporting a message.
