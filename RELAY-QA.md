# Neighbourhood Relay: review and browser checks

This follow-up stacks on Section 4 PR33, exact base `d2fd70134d7e746834be896fa7f8bf3766aecc62`. Daniel requested more Three.js animation and challenging gameplay after reviewing the Relay proposal. No existing feature is removed. Nothing is merged or deployed.

## What changed and how to check

Use a local build with synthetic profiles that have completed the existing age/privacy gate. Open **Neighbourhood → Play outside → Relay**. Existing activities remain available on the other pages.

| Change | Browser check and expected result |
| --- | --- |
| One shared bag across four stops | Choose **Solo practice**. The page explicitly says there are no other players. Follow Kopi → Playground → Palm Bay → Mama Shop; each successful handoff advances exactly one stop. Finish shows elapsed time, handoffs and recoveries. |
| Three challenge levels | Leave, select Practice, Standard or Challenge, then start. Time limits are 180/120/100 seconds. Catch windows narrow from 48 to 30 to 21 simulation ticks; platforms and barriers also become harder. No rewards depend on difficulty. |
| Safe route and shortcut | Use WASD/arrows or the on-screen direction pad. The left route is slower and avoids hazards. The middle route requires moving-platform timing, avoiding moving barriers and pressing the context action to vault the low obstacle. A collision costs time and can drop the bag; nearby **Pick up** recovers it. |
| Timed handoffs | Carry the bag into the end zone near the marked target or a teammate, press **Throw**, then time **Catch** as the bag reaches its ring. The cue says **Catch now!** during the estimated window. Early/late input cannot force a server catch. The solo target is explicitly a target, not a fabricated teammate. |
| Three.js animation | With 3D enabled, check existing-style avatars running/turning, vaulting/landing, throwing/catching, stumbling, recoverable bag bounce, moving hazards and the finish pose. Geometry and collisions share the same deterministic phase. Visual phases advance at most one polling interval beyond the latest server snapshot; player position, bag ownership and results stay server-controlled. |
| Reduced motion and 2D | Enable OS reduced motion, reload and start. Extra gait/bounce/spin and camera easing are reduced. In the lightweight town, open Relay for the same route and controls on a 2D map. A lost WebGL context switches to that map with a persistent explanation. |
| Real private teams | In two separate local browser profiles, use **Host a team**, then join its code. Only actual members appear. Both choose Ready; only the host can start, with 2–4 ready players. One player's input cannot move another slot. Codes are hashed at rest and only disclosed when creating the room. |
| Recovery and privacy | Close/hide one participant, then recover the dropped bag after the disconnect timeout. Team time keeps running. Reconnect explicitly takes control from the old tab; its stale tick/leave cannot control or remove the new session. Blocking, expired consent/session or account removal cancels/removes participation under existing rules. |
| Stable controls | Hold movement, release outside the pad, switch tabs and return: no held input remains. Queue Ready/Start during a slow poll; actions execute once in order. Leave while a request is pending: late responses/errors must not restore the old room. An empty team code gives focused validation. |
| No economy change | Record XP, ranked medals, Play medals, tokens and owned outfits; finish or time out a Relay and reload. All remain unchanged. Relay has no reward or ranked score endpoint. |

## Implementation and limits

The server advances a fixed 60 Hz model from elapsed server time, accepts only bounded input/action sequences, and validates every handoff and checkpoint. Held input expires after 400 ms, disconnected runners after 5 seconds. Waiting rooms expire after 10 minutes; terminal rooms after 2 minutes. Node cleanup and Cloudflare alarms expire rooms without requiring another player request. Failed alarm scheduling is retryable. Local export/deletion and existing bilateral blocks are respected. No real player data was used.

The initial route uses translating timed barriers rather than swinging collision geometry, and visits Palm Bay as the fourth-leg approach. The finish uses avatar poses; bespoke confetti and an in-round celebration-emote UI from the concept are not included. Existing town emotes remain available. Replay uses Leave then a new round. These are prototype limits, not removals of existing features.

## Evidence

Build and Cloudflare dry-run succeeded. All 14 local Cloudflare runtime tests passed, including actual Relay SQLite routing, control epochs, privacy cancellation and alarm-driven idle expiry. Independent review cleared the model, backend integration, renderer and client lifecycle after the queue/late-response/stale-tab fixes. Five Chrome fixtures passed at desktop, phone and landscape sizes, including actual Three.js and reduced motion. Browser artifacts are under ignored `.browser/relay-*.png` and `.html`.

Final full regression: **382/382 passed, zero failures or skips**, with installed Chrome enabled (`/tmp/relay-all-final-recheck.log`). Cloudflare results: `/tmp/relay-cloudflare-final.log`; focused Chrome results: `/tmp/relay-browser-final-results.log`. One earlier HTTP fixture incorrectly sent a boolean deletion confirmation; it was corrected to the existing required literal `DELETE`, with no product change.

Browser fixtures use real installed Chrome, built application DOM/CSS and real Three.js rendering. They use synthetic API responses and controlled animation time; they do not prove real network multiplayer, native touch accuracy, round-trip latency or sustained phone frame rate. Server/model and local HTTP/Cloudflare runtime tests exercise actual authoritative behavior independently. Physical phone playtesting, screen-reader use and production operation remain untested. Do not claim deployment readiness from these checks alone.
