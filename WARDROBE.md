# My look wardrobe

The lobby dock exposes Play, My look and Menu. My look keeps a persistent 3D
fitting room beside a scrolling catalogue, with Face / Full body camera controls
and an expanded preview. Character settings precede the catalogue. Owned cards
equip on tap with Undo; locked cards only change the preview. In 2D, static
catalogue art is labelled as a reference, not an exact custom combination.

## Collection and personalisation

There are 66 complete sets: 22 Free, 22 Legendary and 22 Premium. Each supports
Girl and Boy. Outfits apply matching clothing, headwear and hairstyle; Clothes,
Hair, Headwear, Pets and Magic can be selected independently. The 80 existing
hairstyles are free. Earned hats remain accessible under Headwear. Removing
headwear preserves the underlying hairstyle. Skin, eyes, identity, pets and
magic are not reset by an outfit choice.

Four saved looks store visual fields only. Saving a locked preview is impossible;
Save current look saves the worn look. The server validates new snapshots and
rechecks current entitlement on application. Refunded pieces cannot be recovered
from a snapshot. Exact saved-combination thumbnails render lazily in 3D, with an
explicitly labelled outfit reference in 2D.

A favourite pins one set above the catalogue. Legendary goals show available
Style tokens and the amount still needed; Premium goals clearly state that tokens
do not unlock the set. Favourites have no expiry, notifications or streak penalty.

## Earning and optional purchases

One token is earned per 100 lifetime XP. Ranked medals add 3/2/1 for gold/silver/
bronze, capped at 3 per Singapore day across eligible daily games. Available
balance is floor(XP / 100) + medal tokens - tokens exchanged. Earning rates and existing ownership remain unchanged. Legendary prices are now
standardised: complete sets cost 8 tokens, clothes 5, and headwear, pets or magic
4 each. Standalone hairstyles stay free. Already-unlocked pieces are credited
toward the 8-token complete-set upgrade. The saved debit ledger preserves the
amount actually spent, including historical prices and discounted upgrades.

New sets:

| Family               | Access                                     |
| -------------------- | ------------------------------------------ |
| After-school Circuit | Free                                       |
| Void Deck Weekend    | Free                                       |
| Monsoon Wayfinder    | 8 Style tokens or optional S$1.99 purchase |
| Canal Otter Club     | 8 Style tokens or optional S$1.99 purchase |
| Rainshield Guardian  | S$1.99 Premium                             |
| Moonbell Society     | S$1.99 Premium                             |

All purchases use the existing saved-account and **18+ confirmation** requirements.
The game remains 13+. Stripe handles payment details. New sets use the existing
server-owned inline-price mechanism; grants require verified payment and are
idempotent. No paid randomness, pressure timers, purchasable tokens or pay-to-win.
See PAYMENTS.md for deployment configuration and payment operations.

## Compatibility and art

Existing item indices, IDs and first 60 sets never move. New families append at
set indices 60–65. `src/collections.ts` owns the index layout. No SQL migration is
needed: `savedLooks` (four nullable visual snapshots) and `favouriteSet` are additive
profile preferences. Older clients omit them; the server preserves them.
`wardrobePurchased`, `wardrobeUnlocked`, spent tokens, XP, medal tokens, earned
hats, accounts and receipts retain their existing meanings.

The original families use the current body and skeleton with cached vertex-colour
overlays and no new textures. Each body/head overlay is one draw. The existing
CC BY Chibi Girl Character attribution remains in
`art/characters/sketchfab-chibi-girl/README.md`; no third-party assets were purchased
or imported. Pet drakes now stand upright; wolves have longer legs, and the new
otter has a low body and paddle tail. Named books and paper-plane magic use literal
props. Teen appeal is a design hypothesis, not a tested demographic claim.

## Verification and rollout

See `docs/wardrobe/VERIFICATION.md` for tests, limits and screenshot locations.
Generate PNGs from production meshes with the Windows PowerShell commands:

```powershell
$env:DARECADE_TEST_CHROMIUM = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
node --experimental-strip-types scripts/render-complete-catalog.mjs
npm run build
npm test
npm run test:cloudflare
$env:RENDER_WARDROBE = '1'
npm run test:mobile-render
```

Merge the four stacked PRs in order. Deploy the compatible server and matching
client together. After anyone owns a newly appended set, do not roll back the
server to a catalogue that predates its ID: that older normaliser does not know
how to retain the new entitlement. If needed, hide the new UI while retaining the
catalogue, entitlement validation and profile fields. Preserve the payment ledger
and take a database backup before deployment. These PRs have not been deployed.

## Hair and pricing corrections, 7 October 2026

Eight hairstyles now have different fringe and nape shapes instead of five shared
front/rear clumps. Crowns preserve full hair volume and sit above the scalp;
solid hats still use fitted hair. Hair cards use the same thumbnail-ready path as
other categories. Catalogue PNGs are rebuilt with `scripts/wardrobe-thumbnails.mjs`
against the local art server, using `PLAYWRIGHT_CORE` for the installed browser runtime.

The Lilac Daydream cap is retired from the welcome reward and daily gift choices.
The first Palm Bay finish keeps its one-time 35 XP bonus. Existing cap owners
retain the hat and can still equip it; its ID and mesh remain stable.

Individual Legendary unlock IDs use `piece:<set-id>:<slot>` in the existing
server-owned `wardrobeUnlocked` array. Old full-set entitlements still unlock all
pieces. Premium items cannot be redeemed as token pieces. Concurrent retries
and upgrades debit only once. Old clients cannot patch ownership or the debit
ledger. After new pieces are granted, retain these IDs and ledger handling in
any rollback rather than restoring an older catalogue normaliser.

## Outfits, pieces and accessory magic, 11 October 2026

An outfit is the clothes and headwear of a set. It costs 8 Style tokens
(Legendary) or S$4.99 (Legendary and Premium). Pets and magic are separate
pieces at 4 tokens each in both paid tiers; they are never sold for money.
Earlier sections that say a set includes its pet and magic, or cost S$1.99,
describe the previous offer. Entitlements: `outfit:<set-id>` for an outfit,
`piece:<set-id>:<slot>` for a piece. A bare `<set-id>` is a whole set from
before this change and still covers all four pieces.

The 66 set magics are built from accessories in `src/magic-props.ts`: a
library of 58 props (lanterns, blades, umbrellas, teacups, kites,
talismans, gears) and nine motions. Each set has one recipe naming its props,
how they move and its sparkle. A prop is baked once into at most three shared
batches and cloned per avatar; no effect exceeds 20 draws or 2,000 triangles.
Item indices and names are unchanged. The 32 older effects that are not on
the Magic tab are untouched. Re-render the cards with:

```powershell
$env:DARECADE_TEST_CHROMIUM = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:CATALOG_ONLY = 'accessory'
node --experimental-strip-types scripts/render-complete-catalog.mjs
```

## Outfits include pet and magic, 11 October 2026 (later)

This replaces the outfit rules in the section above; the accessory magic it
describes is unchanged. An outfit is the whole set again: clothes, headwear,
pet and magic. It costs S$4.99, or 8 Style tokens if Legendary. Any one of
the four can be had alone for S$1.99, or for 5 (clothes) or 4 tokens if
Legendary. Premium takes money only, for outfits and single items.

Outfit cards and the try-on preview show the pet and magic, and wearing an
outfit puts them on. That changes an earlier rule: an outfit choice now does
replace the pet and magic you had on. Skin, eyes and name are still kept.
The outfit card camera sits further back so the pet fits.
