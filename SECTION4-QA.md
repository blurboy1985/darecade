# Section 4: goals and a gentler Open Stage

Dependency: draft PR32, exact head `1459f8aeeffebf82c0c549fdbb4c58f8676c57a3`, which depends on PR31 and PR30. Branch `codex/section4-game-depth` targets `codex/section3-guest-retention`.

Status: implementation, independent review and automated Chrome browser QA are complete. The draft remains unmerged. Interactive browser tooling is absent, but the repository’s existing headless Chrome path works with the installed Mac browser and isolated synthetic fixtures.

## Baseline and scope

Coast Rush showed driving instructions before play but did not explain the player's next personal goal or the existing level reward. Fastest finish and best placing are independently saved records, so the new copy labels them separately. Existing Coast physics, score validation, 20 XP per verified round, personal record storage and Play medal criteria are unchanged.

Open Stage started everyone in the original four-lane Show. Five consecutive misses could exhaust the starting hype, ending the seed-7 show after 253 ticks, about 4.2 simulation seconds, with zero stars. Beginners now default to a labelled Warm-up when they have no positive saved Stage best. It lasts the full 40 simulation seconds, with a 2.5-second lead-in and one note every 1.5 seconds on the two outside lanes. The goal is five notes. Misses and stray taps cannot boo the player off.

Warm-up never reports `perform`, writes a best, consumes the Stage cooldown/cap or awards XP, stars, Play medals or tokens. The original Show is always selectable. Returning players with a positive Stage best start in Show. Original Show chart, hype, score, stars, cooldown and daily XP balance remain intact. Stage's existing reports remain excluded from new Play medals.

Both panels explain the shared avatar level: every 100 XP earns one level and one Style token. This is not a separate new game-level economy. Stage shows best score and remaining XP for the current Singapore day, including the reset when the saved Stage day is yesterday.

## What changed and how to check it

Use this branch locally with synthetic guest/account data. Do not clear real saves or create real accounts/emails. The checks below ran against the actual production build in Chrome at 1280×900, 390×844 and 844×390. The fixture controls animation frames and simulation time; it does not measure wall-clock timing or physical touch.

| Change | Browser steps | Checkable expected result | Evidence / limit |
| --- | --- | --- | --- |
| Coast goals before play | Games → Coast Rush. Open once with no finished race, and once with a synthetic saved time and placing. | First goal says finish all three laps. Returning goal says beat the saved fastest time; best place is listed separately. Existing verified-round XP and full-finish Play medal copy appear. | Guide tests cover both cases and preserve the input save. Automated Chrome passed at all three viewports. |
| Level rewards upfront | Open Coast Rush and Neighbourhood → Open Stage with synthetic XP values 99 and 100. | At 99 XP, Level 1 → 2 and 1 XP to the next token. At 100 XP, Level 2 → 3 and 100 XP to the next token. No balance changes from opening either panel. | Boundary tests pass. Automated Chrome passed at all three viewports. |
| Coast controls remain available | Expand Controls & items before starting. Use keyboard Tab/Enter as well as click. Check desktop, 390×844 and short landscape. | Original driving, drift, item and sound controls remain available. Cover scrolls to its content; Start is reachable. Starting still opens the race normally. | Chrome verified scrollability, no overflow, keyboard focus, expanded guide and unobstructed Start/sound/guide targets. Physical pointer/touch play remains untested. |
| Stage beginner warm-up | Open Stage with stageBest 0. Start Warm-up and leave all notes untouched for 40 active seconds. | Warm-up is selected, only outside buttons enabled, no hype bar, no booed-off or zero-star result. At completion it offers another try and reports no changed XP/best. | Shared rules tests pin full duration and no early failure. Real mountStage tests cover reward isolation. Automated Chrome passed at all three viewports. |
| Reach the warm-up goal | Start again. Hit at least five outside-lane notes with ←/→ or D/K; also try the two disabled middle inputs. | Notes count reaches 5, goal-complete result appears, no server `perform` request or saved reward changes. Disabled middle inputs have no effect. | Shared and real UI tests cover successful practice without reporting. Automated Chrome passed at all three viewports. |
| Preserve original Show | Choose Show and start. Separately open Stage with a positive saved best. | All four lanes and hype return; returning player defaults to Show. Existing stars and XP calculation apply, best/cap persist. A failed Show suggests Warm-up. | Original seeded chart/max score/early failure pinned in tests; UI report boundary covered. Automated Chrome passed at all three viewports. |
| Honest Stage progress | Open Stage with a synthetic same-day 45 XP total; repeat with yesterday's Stage day. | Same day shows 0/45 XP left. Yesterday shows 45/45 without mutating saved data. Best score remains visible. | Deterministic day-boundary guide test passes. Automated Chrome passed at all three viewports. |
| Playable Stage on small screens | At 390×844 and 844×390, start Warm-up or Show, then finish it. | Introduction compacts during play; the entire note highway and lane buttons remain visible together. The progress card returns at the result. | Actual Chrome geometry and hit-target checks pass for initial play, replay and Show. Physical touch remains untested. |
| New-mode proposal | Read [Neighbourhood Relay](SECTION4-MODE-PROPOSAL.md). | Proposal includes animated Three.js movement/handoffs, timed hazards, route choice, real-player teamwork and solo practice. It identifies new server work and removes no existing feature. | Proposal only. No Relay UI/gameplay, multiplayer or performance claim is implemented/tested. |

## Verification

- Production build passed.
- Final full regression with installed Chrome enabled: 342 tests passed, zero skips and zero failures. This includes the nine previously skipped browser scenarios and three new Section 4 viewport scenarios. All 18 focused Stage/progression tests also passed.
- Independent review covered default/returning selection, warm-up reward isolation, retained Show reporting and progress/cap copy. It caught stale practice HUD values when changing modes; switching sessions now resets that display. Review added tests against the real `mountStage` function, with only DOM/rendering/scheduling boundaries replaced.
- Cloudflare dry-run bundle and all 12 local Miniflare tests passed. The command exited at `--dry-run`; no deployment occurred.
- The interactive browser tool is still absent from the tool registry. The existing `DARECADE_TEST_CHROMIUM` path successfully used `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. No software was installed. Chrome screenshots and DOM assertion reports are in `.browser/section4-{desktop,phone,landscape}.{png,html}`.
- Older browser runners timed out waiting for Chrome process exit after output. The shared bounded runner now waits for rendered DOM results and terminates only its fixture process group. It strips inline scripts before checking pass/fail markers, preventing fixture-source false positives. The onboarding fixture also serves its existing imported Play medal module.
- Screenshot review prompted a mobile gameplay fix: the introduction compacts during play, keeping the entire note highway and lane buttons visible together, then restores at the result. Browser geometry and unobstructed-button assertions cover Warm-up, replay and Show at all three viewports.
- Physical phones, native OS backgrounding, screen-reader output and real network multiplayer for the proposed mode are untested.
- No merge/deploy, season activation, real account/email creation, feature removal, privacy/age-gate change, or real playerdata deletion/reset occurred.
