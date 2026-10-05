# Neighbourhood Relay

Daniel reviewed the initial Relay concept and requested more Three.js animation and challenging gameplay. This specification incorporates that direction for implementation. The mode is not implemented in this PR; do not request approval of the same concept again.

## The round

Two to four actual players carry one shared delivery bag from Mama Shop through Kopi and the playground, then back to the shop. A round targets about 90 seconds. Each checkpoint requires a handoff inside a marked zone: the carrier throws, the next player times the catch. A clean catch keeps momentum; a dropped bag costs time and can be recovered. There are no invented teammates. Solo practice uses the same route and catch targets without claiming other players are present.

Movement and one context action keep the controls small. The action vaults a marked low obstacle, throws when carrying near a handoff zone, or catches an incoming bag. Clear prompts distinguish these actions. Touch gets a direction pad and one large action button; keyboard gets movement plus Space.

## Challenge worth learning

The safe route is wider but longer. A shortcut crosses a moving platform and timed swinging barriers. Hazards visibly wind up before moving; collisions drop the bag and cost time rather than removing a player from the round. The team chooses who tackles the shortcut and when to pass.

Three difficulty presets use the same compact route. Practice has generous catches and slow hazards. Standard adds tighter handoffs and quicker moving platforms. Challenge combines narrower timing windows with alternate hazard phases. Difficulty comes from timing, recovery and coordination, not just longer health bars. Exact timers need playtesting before they are promised.

The finish shows shared time, clean handoffs and recoveries. Teammates can trigger the existing allowlisted emotes for a joint celebration and run the route again to improve their time. No chat or new public identity fields are needed.

## Three.js animation

Keep the existing low-poly neighbourhood and avatars. Add visible run anticipation, leaning into turns, vault takeoff and landing, a bag throw arc and catch reaction, and a short stumble with recoverable bag bounce. Animate the platform and barriers using the same deterministic phase as collisions, so decoration never lies about safe timing. A successful team finish gets a brief coordinated pose and restrained confetti.

Use a readable third-person camera, with small handoff framing shifts rather than camera cuts. Reduced-motion mode keeps the camera steady and removes shake, confetti and extra bounce. Limit particles and reuse geometry/materials; phone performance and readable controls must pass browser QA before release.

## Scope and effects on existing features

First playable scope is one route, these three difficulty presets, solo practice, private round coordination for two to four real participants, and a shared results panel. It adds one Neighbourhood activity. It removes or replaces no existing game, shop, progression path or cosmetic.

Multiplayer needs explicit start/readiness, server-owned round identity and clock, validated checkpoint order, distance/speed limits and handoff ownership. A disconnected carrier returns the bag to the last checkpoint; the remaining team can finish. Existing age gating, bilateral blocks, privacy rules and allowlisted emotes must apply before grouping and throughout the round.

The first prototype awards no currency, XP or Play medals. Any future rewards need replay/server validation, idempotent completion and the existing daily caps, with a separately reviewed economy change. Do not treat a client-declared finish as a reward claim.

## Review and browser acceptance

The parent task should use this specification for the next implementation after completing the pending Coast Rush/Open Stage browser checks. Nothing from this new mode has been built in this draft. Material changes to this scope, especially any removal of existing features, still require Daniel's approval.

The eventual browser acceptance checks are: finish solo on keyboard and touch; recover a missed catch; distinguish safe route from shortcut; finish with two actual synthetic guests; disconnect the carrier and recover; reject impossible checkpoint/handoff requests; respect blocks and reduced motion; verify no reward ledger changes. Measure frame/input timing on desktop and a real phone. No claim of tested multiplayer or phone performance is made for this proposal.
