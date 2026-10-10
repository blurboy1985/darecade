# World chat window — 10 October 2026

Branch `world-chat-window`, from `main` (`d76c049`). The owner tried the
world chat from #72 and reported that there is no chat history, and that a
message you send should appear in a chat window.

## What was wrong

- There was no window. A message was a floating pill that removed itself
  after 12 seconds, and only six were kept, so there was nothing to read back.
- Your own message only showed once the world sent it back. On polling that
  is up to two seconds; when the world dropped it, nothing showed at all.
- The world dropped messages without telling anyone:
  - The page and the world both enforce a 1.5 second gap, but the page timed
    it from the keypress and the world from arrival. Updates leave every
    210 ms, so two messages typed 1.5 s apart could arrive 1.47 s apart.
  - A message rides on a movement update, and the world refused the whole
    update when a player had sent five in a second.
  - On polling, a second message typed before the next poll replaced the
    first.
- On a phone the on-screen keyboard can cover the box (noted in #72).

## Done means

- Chat opens as a window with a scrolling history of what was said while you
  were in the world, and stays open until you close it.
- A message you send shows in the window at once, marked as sending, then as
  sent when the world passes it on, or as not sent if it never does.
- Messages are not dropped by the three causes above.
- `npm test`, `npm run build` and `npm run test:cloudflare` pass, and two
  players exchange messages in a browser against the preview server.

## Assumptions

- "History" is what this page heard since it loaded, up to 100 messages. It
  is kept in the page only. The world still keeps a message for 10 seconds
  and stores nothing, so a player who arrives later does not see earlier
  talk, and a reload starts empty. Changing that changes what ACCOUNTS.md and
  PRIVACY-REVIEW.md say, so it is left for the owner to decide.
- History survives a change of world, with a line marking the new world.
- With the window closed, new messages still float for 12 seconds as before,
  and the Chat button counts the unread ones.

## Steps

1. `shared/world-chat.ts`: an outbox that releases one message per gap, with
   a margin, and takes back one that did not get through.
2. `server/world-core.mjs`: a message is taken before the movement limit.
3. `src/world-connection.ts`: use the outbox; `say` reports whether it took
   the message.
4. `src/world-chat.ts` and `src/mobile-hud.css`: the window, history, the
   sending / not sent states, unread count, and lifting above the keyboard.
5. `src/main.ts`: tell the chat which world it is in.
6. Tests in `tests/world-chat.test.ts`.

## Risks

- The window covers more of a small screen than the pills did.
- Lifting above the keyboard relies on `visualViewport` and cannot be tried
  on a real phone from here.
- The server change needs a deployment to take effect; this branch does not
  deploy.

## Outcome

- All six steps done. `npm test` 529 pass, 0 fail, 49 skipped (525 before);
  `npm run test:cloudflare` 17 of 17, which includes the build and dry run.
- `tests/section1.test.ts` loads `world-connection.ts` in a sandbox with its
  imports supplied by hand, so it now supplies the outbox too.
- Checked in headless Chrome against the Node preview (polling) with a
  scripted second player, at 1264×569 and 390×844:
  - With the window closed, two messages floated and the button counted 2.
    Markup in a message showed as text.
  - Opening the window showed all five messages heard so far. A message
    sent from the box showed at once as sending, then as sent, and the other
    player heard it.
  - Four messages sent 1.5 seconds apart all arrived.
  - Escape closed the window; Enter opened it with the history still there.
  - With twelve messages the history scrolled and stayed on the newest.
  - With the server stopped, a message was marked "Not sent" after 10
    seconds; once the world answered again it went out and the mark cleared,
    with no second copy.
- Not checked: WebSockets in a browser (the preview only polls; the
  Cloudflare test covers the server side), a real phone and its keyboard,
  and whether typing w, a, s, d moves the avatar (same mechanism as #72,
  now on the window instead of the box).
- Not deployed. The server change in step 2 takes effect on deployment; the
  page changes do not depend on it.
- Found, not fixed: after the Node preview restarts, a page that asks for
  its old world by name gets "World unavailable" until some request without
  a name creates the world again. Preview only.
- For the owner to decide: whether a world should keep recent messages for
  players who arrive later, and whether history should survive a reload.
  Both mean keeping what players typed for longer than 10 seconds.
