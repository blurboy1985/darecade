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
