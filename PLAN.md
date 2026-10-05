# New avatar from the Sketchfab "Chibi Girl Character" — 5 October 2026

Branch `chibi-girl-model`. Replace the current Play Simi chibi avatar with a
model built from **Chibi Girl Character** by Syed's Creation (@Dawood3D),
https://sketchfab.com/3d-models/chibi-girl-character-3e795731d68d416eb0b8770a6b363e65
(CC BY 4.0), add a boy version, and widen the wardrobe (outfits, headgear,
pets, magic) with free and premium tiers.

## What the source is

- One static mesh, 77.8k triangles, UV-mapped, **not rigged**. Pink twin-bun
  hair, open cardigan, top, pleated skirt, leg warmers.
- CC BY: commercial use and modification allowed; credit and a note of
  changes are required where players can see them.
- Download needs a Sketchfab sign-in. **The file is not in the repo yet.**

## Done means

- The game loads a GLB derived from the source: girl and boy bodies on the
  existing 41-bone skeleton, so every pose, seat, kart and prop still works.
- Each wardrobe slot has more items, each marked free, Style-token or premium.
- Saved looks keep working (existing indices keep their meaning).
- Credit to the author appears in-game and in `art/characters/CREDITS.md`.
- `npm test`, `npm run build`, `npm run test:cloudflare` pass; browser check of
  wardrobe, lobby, one cabinet, Coast Rush and a bench seat on desktop and 320px.
- Nothing deployed; no Stripe dashboard change made by this work.

## Steps

1. **Source in.** File placed at `art/characters/sketchfab-chibi-girl/` (not
   shipped). Inspect: object split, materials, textures, scale.
2. **Blender build** (`scripts/build_sketchfab_chibi.py`, Blender 5.2):
   separate head / hair / top / bottom / legs; decimate to about 12k triangles
   per worn look; bind to the KayKit rest skeleton; `Blink` and `Smile` keys;
   export `public/models/neighbour-chibi2.glb` with measured budgets.
3. **Boy version** in the same build: short hair without buns, shorts and
   straight-cut jacket from the same meshes, slightly wider shoulders.
4. **Runtime** (`src/character.ts`): load the new GLB, part visibility by
   body type and outfit, tinting for skin / hair / cloth. New saved field
   `body` (girl | boy), default girl; validated in `server/`.
5. **Catalogue** (`src/appearance.ts`, `collections.ts`, `headgear.ts`,
   `pets.ts`, `magic.ts`): append new items; tier per item.
6. **Wardrobe UI**: body-type switch, tier badges, regenerated thumbnails.
7. **Credits**: CREDITS.md, chibi README, in-game credits line.
8. **Verify**, commit, open a pull request.

## Assumptions

- The new model replaces the current one for all players, not an option
  beside it.
- Existing item indices are kept; new items are appended.
- Premium uses the existing complete-set purchase flow.

## Risks

- Automatic skin weights on a dense, unrigged chibi mesh (big head, short
  limbs, skirt) usually need hand correction at shoulders, hips and skirt.
- Decimating 77.8k to about 12k triangles softens the face; the eyes are
  texture, so they should hold.
- Outfits that are more than recolours need new geometry made in Blender.
- New paid items need new Stripe prices in the live account (owner action).
- One commenter on the model page asks whether the uploader made it; the
  CC BY grant is only as good as the uploader's right to give it.

## Decisions (owner, 5 October 2026)

1. The owner downloads the model and puts the archive in
   `art/characters/sketchfab-chibi-girl/`.
2. Premium means new S$1.99 complete sets through the existing checkout.
   The owner creates the Stripe prices; until their IDs are in
   `STRIPE_CATALOG` the new sets can only be had with Style tokens.

## Progress — all steps done, 5 October 2026

- [x] 1. Source unpacked in `art/characters/sketchfab-chibi-girl/` (not committed).
- [x] 2. `scripts/build_sketchfab_chibi.py` builds `public/models/neighbour-chibi2.glb`:
  904 KB, heaviest look 13,433 triangles, same 41-bone skeleton.
- [x] 3. Boy version: trimmed hair, blue eyes, shorts, shoes.
- [x] 4. Runtime in `src/character.ts`; new saved field `body`, checked by the server.
- [x] 5. Catalogue: six premium sets, 21 single items, tier label on every card.
- [x] 6. Girl / Boy switch in My look; 206 wardrobe pictures regenerated.
- [x] 7. Credit in Preferences, in the GLB, in CREDITS.md and the art README.
- [ ] 8. Commit and pull request: waiting for the owner's go-ahead.

## Differences from the plan

- The source was bound to the unchanged KayKit skeleton, so its body is about
  29% taller and its arms about 60% longer than on Sketchfab. The feet are
  0.04 closer together than KayKit's.
- No new single outfits were added (`extraCounts.clothing` is 0). The 24
  existing outfit slots were renamed and redrawn on the new model instead.
- There is no Smile morph; only Blink.
- The earlier avatar moved to `art/characters/chibi/` and is no longer shipped.
- New players start with the pink twin buns.
- The second archive offered (Hatsune Miku) was not used: it looks like
  assets taken from a SEGA game.

## Verification — 5 October 2026

- `npm test`: 383 tests, 366 pass, 0 fail, 17 skipped (browser checks that
  need `DARECADE_TEST_CHROMIUM`).
- `npm run test:cloudflare`: build and dry-run pass, 14 of 14 tests pass.
- Browser, local server: guest join, world view, wardrobe, Girl / Boy switch;
  contact sheets of all outfits, headwear, sets and eight game poses.
- Not checked: 320 px phone layout, a live kart race, a real bench or cabinet
  in the world (poses were checked outside the world), Stripe purchase of a
  new set.

## Owner actions

- Create six S$1.99 prices in Stripe (ids `candy`, `boba`, `pixel`, `witch`,
  `garden`, `dino`) and add them to `STRIPE_CATALOG`.
- Decide whether existing players should be told their character changed.
