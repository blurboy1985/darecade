# Coast Rush: multiplayer chat — 10 October 2026

Branch `coast-rush-chat`, stacked on `coast-rush-multiplayer` (pull request
#68). The owner asked for another pull request that adds chat to multiplayer
races.

## Done means

- Players in a race room can send each other short messages in the lobby,
  during the race and on the results screen, and see who said what.
- Works on the Node preview and on Cloudflare (both share `RaceHost`).
- `npm test`, `npm run build` and `npm run test:cloudflare` pass, and two
  players exchange messages end to end against the running server.

## Assumptions

- **Quick chat, not typed chat.** ACCOUNTS.md and PRIVACY-REVIEW.md both say
  the product has no free-text chat, accounts are age-banded and the only
  social signals are allowlisted emotes. So a player picks from a fixed list
  of lines and only the line's number travels. The room never relays text a
  player wrote. Typed chat would need a privacy review and moderation first;
  that is the owner's call and is not in this pull request.
- Chat is room-wide and not stored. It ends with the room.
- Blocked pairs are already kept out of the same room, so chat needs no
  block check of its own. Each player can also mute chat on their own screen.
- One line every 1.5 seconds per player.

## Steps

1. `shared/race-chat.ts`: the lines and the gap between them.
2. `shared/race-room.ts`: a `chat` message, checked and relayed with the
   sender's place in the player list.
3. `src/race-net.ts`: `say(line)` and a `chat` handler.
4. `tests/race-chat.test.ts`.
5. Client: `src/race-chat.ts` panel (recent lines, line picker, mute),
   mounted in the race screen so it shows over the lobby, the race and the
   results; number keys say a line.
6. ACCOUNTS.md, PRIVACY-REVIEW.md and COAST-RUSH.md; pull request against
   `coast-rush-multiplayer`.

## Risks

- Stacked on #68: if that branch changes, this one needs a rebase, and it
  should merge only after #68 does.
- The lobby and the results card re-render their contents, so the panel must
  live outside both.
- `tests/music-browser.test.ts` times out on this Windows machine on `main`.

## Outcome

- All six steps done. `npm test` 493 pass, 0 fail, 49 skipped (484 before);
  `npm run test:cloudflare` 16 of 16; `npm run build` clean.
- Checked in desktop Chrome against the Node preview with a scripted second
  player: lines went both ways in the lobby, during the race and on the
  results; a typed message was dropped; the picker and the number keys both
  send; muting empties the log and stops sending.
- One change from the first plan: the panel sits above the item button, not
  under the map, which moves down during a race.
- Not done here: nothing is merged or deployed, and nothing was tried on a
  phone. The picker is 260px wide, so it needs a look on a small screen.
