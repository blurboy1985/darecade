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
