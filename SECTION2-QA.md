# Section 2: the first minute

Dependency: draft PR30, exact head `68c9355bd26c60f7d26784dfd2a0d74dd3914871`.
Branch: `codex/section2-first-minute`, stacked on `codex/section1-lobby-race-fixes`.
This PR contains only first-minute presentation, presence copy, camera normalization and their regression coverage. Section 1 is unchanged.

## Baseline and goal decision

New profiles defaulted to bird's-eye view. The third-person CSS also hid the first-round invitation. The header's “Shared neighbourhood” claim gave no useful indication of who was actually there.

The existing reward is a lilac cap plus 35 bonus XP for the first validated completed round, in any game, even at zero score. The town has no separate unlock flag and its locations already work before that round. Mama Shop can also give this cap. The requested “Finish your first race to open the town” would therefore be false. The parent approved “Finish a round at Palm Bay to unlock your lilac cap” with “The town is open to explore,” and clearing the goal for completed rounds or existing cap ownership. No town lock, feature removal or reward change was added.

## What changed and how to check it

Use this branch's local build or a separately authorized preview. Production is unchanged. Use separate browser profiles and synthetic local guest data; preserve existing player saves.

| Change | Browser steps and expected result | Verified |
| --- | --- | --- |
| Third person from the start | Create a fresh local guest after the unchanged age/consent screen. The view follows behind the avatar; YOU and its larger ground ring identify it. Tap open ground to walk before playing. | Supported in-app browser at 1280×720 and 390×844. Ground click moved the new guest before any round. The phone goal uses a slightly higher camera target so its marker and body remain below the card. Physical phone, held WASD and touch joystick were not manually tested. |
| Saved camera preferences | Choose bird's-eye, then reload. It remains bird's-eye. Switch back to third person and reload; that choice also remains. | Both explicit choices verified; normalization tests preserve existing progress and look. |
| Accurate presence | Alone in an isolated local world, read “Just you here” despite animated example residents. Connect a second synthetic local guest to that same world: read “2 players here · including you.” Let it disconnect and expire: return to “Just you here.” In browser network emulation, go offline: immediately read “Player count unavailable.” Restore normal networking; count returns only after a successful world update. | Actual local protocol with two synthetic guests, arrival and departure verified. Offline and restore tested through tab-scoped DevTools emulation, then reset. Deduplication, away participants, offline cards and known-offline lingering packets have regression coverage. A silent half-open network without a browser offline event remains subject to transport detection; the server sends changes, so no arbitrary snapshot expiry was added. |
| Truthful, visible goal | Before the first round, read “Race for your cap,” the round/cap goal, and “The town is open to explore.” Choose Neighbourhood → Mama Shop → Go there: the shop opens before racing. The goal's Play now starts Coast Rush. Finish any validated round, close its result, then reload: the goal stays gone and existing cap/bonus are retained. A zero-round cap owner from Mama Shop also sees no duplicate promise. | Mama Shop accessible before any round. A Noodle wall-hit completion earned the unchanged cap/+35 XP and cleared the goal after reload. Zero-round cap ownership and fallback keyboard focus independently tested. Coast launch wiring covered by existing tests/Section 1 browser checks; this section did not repeat a complete Coast race. |

The goal card and presence label use the existing cream/coral palette and typography. Three primary dock actions are retained. Age, consent, account privacy, score validation, competitive medals, cosmetic ownership and reward ledgers are unchanged. Seasons remain disabled.

## Validation

- `npm run build`: passed. The existing large Three.js chunk warning remains.
- `npm test`: 305 total, 296 passed, 9 browser-only skips, zero failures. The supported in-app browser checks above supplement these skips; no Chromium installation was added.
- `npm run test:cloudflare`: dry-run bundle plus 12 Miniflare tests passed. No deployment occurred.
- Independent read-only review found offline-count invalidation and zero-round cap-owner focus issues. Both were corrected and the real handlers re-executed; no confirmed issue remains.
- `git diff --check`: passed.

Local screenshot evidence is preserved in the task's `section2-evidence/` directory: first-minute-desktop.jpg, first-minute-phone.jpg and completed-goal.jpg. No production player records or credentials are included.
