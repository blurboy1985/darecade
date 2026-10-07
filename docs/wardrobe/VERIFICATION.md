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
