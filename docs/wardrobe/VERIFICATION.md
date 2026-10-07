# Wardrobe implementation verification

## PR 1 — Fitting room

Character settings precede the catalogue. Face/full-body cameras and an expanded
preview retain the selected avatar, pet and magic. In 2D the art is explicitly a
catalogue sample; it cannot represent custom combinations. Owned tap-to-equip,
Undo, locked try-on and payment entry points remain.

Validated on isolated synthetic profiles: production build, 21 avatar/catalogue
regression checks and 6 Chrome browser fixtures (320×568, 390×844 guest/account,
844×390, 1280×900, and 320×568 2D). Browser checks include the new camera controls,
expanded preview, settings ordering, catalogue scrolling, free equip, Undo and
locked previews. This is browser emulation, not physical-device certification.
Evidence: `.browser/wardrobe-menu-*.png` and corresponding HTML assertion reports.

Thumbnail capture is serialized by the review page, awaited before disposal, and
blob URLs are released. The preview restores its camera even if encoding fails.
No account, privacy, age gate, ownership, price or earning-rule changes.

## PR 2 — Mix and match

Adds Clothes, Hair and Headwear alongside complete outfits, pets and magic.
Uses existing clothing/hair/baseHair/hat fields and original item indices: no
migration, price change or entitlement conversion. All 80 existing hairstyles
remain free. No-headwear preserves the visible hairstyle. Undo captures visual
fields only. Server ownership enforcement remains authoritative.

Validation: build; 12 catalogue/component/ownership regression checks; all six
browser fixtures with independent hair/headwear/clothes interactions. Rendered
120 clothing/headwear PNGs from the production builder. Existing saves roundtrip
without losing identity, pets, magic or purchases. Fixtures use synthetic data.

## PR 3 — Six original families

Appends six sets (indices 60–65); all 60 existing sets remain available with their
original IDs, visuals, costs and entitlements. After-school Circuit and Void Deck
Weekend are free; Monsoon Wayfinder costs 18 tokens and Canal Otter Club 24;
Rainshield Guardian and Moonbell Society use the existing S$1.99 Premium path.
The server already supports inline prices for appended sets. No Stripe request
or real purchase was made. Purchase age confirmation is unchanged.

These are original primitive meshes fitted to the existing body/skeleton, with
existing free hairstyles and no new textures or third-party asset licences.
Each adds two cached overlay draws and fewer than 4,000 overlay triangles.
The clothed base model is additional to that budget. Both bodies are supported.

Validation: build and 44 avatar, catalogue, geometry-budget, browser and payment
checks. Real WebGL review captured all six families on both bodies at gameplay
and fitting-room distances. Bench, swing and arcade screenshots use Void Deck
Weekend; all families pass finite-pose checks for idle/walk/dance/bench/swing/
arcade. Art-review verified 470 cosmetic swaps across nine modes, independent
rigs, 24 remote avatars, preview teardown and reduced motion. These checks are
not a claim that every possible mix is clipping-free. Evidence is in
`output/playwright/wardrobe-implementation/`. No physical-phone test or teen
preference study has been performed.

## PR 4 — Saved looks, collecting goals and companion identity

Adds four visual-only saved slots and one favourite-set preference. The client
and server validate components, reject saving unowned pieces, and recheck ownership
when applying snapshots. Refunded snapshots cannot restore entitlement. Existing
clients can patch preferences without erasing the new fields. Old saves receive
empty slots. No SQL migration, earning-rate change, timer or notification added.

Drakes now have upright bodies, two feet and broad wings; wolves have longer legs;
Canal Otter has a low body and paddle tail. Books/notebooks and paper planes render
literal objects. The Wayfinder compass uses shared merged geometry. Preview images
were regenerated from the production builders. No player accounts, email sends,
real checkout requests or live purchases were used during verification.

Final verification:

- Production TypeScript/Vite build passes (existing Three.js chunk-size advisory remains).
- 489 tests pass with the installed Chrome executable, no skips. This includes
  mobile/desktop/fallback, saved looks, ownership, payment and safety checks.
- 14 Cloudflare integration tests pass, including payment, world privacy and
  durable storage; Wrangler deployment was a dry run only.
- After the final effect optimisation, 24 avatar/companion/effect checks pass.
- The ordinary mobile workload benchmark passes. All six complete new sets,
  including their pets and magic, also pass at 390×844 and 844×390 in both cameras.
  Peak draws by family: Circuit 516, Rainshield 519, Wayfinder 515, Moonbell 519,
  Otter 515, Void Deck 520 (limit 520). Matrix updates peak at 2054 (limit 2300).
  Pixel ratio remains capped at 1.25, with shadows off. This measures workload in
  desktop Chrome with emulated phone dimensions, not real-phone frame rate.
- New drake/wolf/otter meshes measure 3672/4608/4544 triangles and 8/6/6 draws.
  Notebook magic uses 120 triangles and paper planes 84; both retain 32 particles.
- Stale fallback/season test fixtures now use auth/session. Onboarding tests now
  exercise the current unchecked 13+ and privacy checkboxes instead of the retired
  date-of-birth form. Production age/privacy implementation was not changed.

Evidence: `.browser/pr4-final-tests.log`, `.browser/pr4-cloudflare.log`,
`.browser/wardrobe-render-report.json`, `.browser/pr4-effects-recheck.log`,
`output/playwright/wardrobe-implementation/saved-and-favourite-desktop.png`,
`expanded-mobile.png`, `face-preview-desktop.png`, and the family/pose captures.

Rollout gates: merge PRs in order; deploy server and client together; retain new
catalogue IDs on any rollback after new ownership is granted. Current safeguards
and receipts stay in place. Before a broad release, validate on physical Android/
iPhone devices and run a small opt-in style-preference study with suitable age
and privacy handling. No measured retention or sales uplift is claimed.

## Review screenshots

These captures use an isolated synthetic profile. They show the implemented
favourite goal, saved-look slot and expanded mobile fitting room.

![Saved looks and favourite progress](evidence/saved-and-favourite-desktop.png)

![Expanded mobile fitting room](evidence/expanded-mobile.png)

The current production-builder outfit thumbnails for the six families:

| Circuit | Rainshield | Wayfinder |
| --- | --- | --- |
| ![Circuit](../../public/wardrobe/outfits-120.png) | ![Rainshield](../../public/wardrobe/outfits-122.png) | ![Wayfinder](../../public/wardrobe/outfits-124.png) |

| Moonbell | Otter Club | Void Deck |
| --- | --- | --- |
| ![Moonbell](../../public/wardrobe/outfits-126.png) | ![Otter Club](../../public/wardrobe/outfits-128.png) | ![Void Deck](../../public/wardrobe/outfits-130.png) |
