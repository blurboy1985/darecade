# Outfit-only pricing and accessory magic — 11 October 2026

The owner asked for two things: the money purchase should cover outfits only
(no pet, no magic) at S$4.99, and the magic items should be more interesting,
built around different accessories; the current ones may be revised.

## Decisions from the owner

- Premium pets and magic unlock with 4 Style tokens each, like Legendary pieces.
- The 8-token unlock becomes outfit only too. Pet and magic are 4 tokens each.
- Players who already bought or unlocked a whole set keep all four pieces.

## Assumptions (mine)

- "Outfit" means the girl and boy clothes with their headwear, as the Outfits
  tab already applies them.
- Every set is charged through the server-owned inline Checkout price at 499
  cents, so no new Stripe products are needed. The sixteen S$1.99 Stripe prices
  stay in Stripe unused; their entries leave `STRIPE_CATALOG`.
- "Magic items" means the 66 set magics on the Magic tab. The 32 older effects
  are not listed there and keep their look.
- Item indices, set IDs and magic names that tests or saves rely on do not move.

## Done means

- A new S$4.99 purchase or 8-token unlock grants clothes and headwear only.
- An old `solar`-style entitlement or paid S$1.99 order still grants all four.
- Pets and magic of Legendary and Premium sets cost 4 tokens each; no money
  button on those cards. Copy no longer says a set includes pet and magic.
- Each of the 66 set magics is built from a themed accessory with its own
  motion, inside the existing mesh budgets.
- `npm test` and `npm run build` pass; magic thumbnails re-rendered; the Magic
  tab and the purchase screen looked at in a browser.

## Steps

1. `src/collections.ts`: `outfit:<set>` entitlement, `ownsOutfit`, Premium pet
   and magic pieces, outfit-only credit, `setPriceSGD = 499`.
2. `src/state.ts`, `server/community-core.mjs`: keep the new IDs; redeeming a
   set ID now grants its outfit.
3. `server/payments.mjs`: order kind `outfit`, inline 499 for every set,
   refunds unequip only what is no longer owned. `wrangler.jsonc` catalogue.
4. `src/wardrobe.ts`, `src/payments.ts`, `src/main.ts`: buttons and copy.
5. Tests for 1 to 4.
6. `src/magic-props.ts` (new): accessory builders and motions, one recipe per
   set. `src/legendary.ts` and `src/magic.ts` use it.
7. Tests for 6, thumbnails, browser check.
8. Docs: `PAYMENTS.md`, `WARDROBE.md`, `README.md`.

## Out of scope

Deploying, anything in the Stripe dashboard, pets, the 32 older effects.

## Risks

- Ownership is server-authoritative and involves paid orders: old orders must
  keep granting the whole set. Covered by a test.
- A stale client that redeems a set ID gets the outfit, not all four pieces.
- Magic meshes are shared across avatars and never disposed: props are cached
  templates, cloned per avatar.

## Change during the work

The owner said S$4.99 is a new price catalogue, so Stripe had to be updated
rather than relying on inline prices alone. The sixteen catalogued sets got a
new SGD 499 price on their existing product, in the sandbox and in live, and
`STRIPE_CATALOG` keeps its twenty entries with the new live IDs. Sets that
never had a Stripe product still use the inline price.

## Outcome

- Steps 1 to 8 done on branch `outfit-pricing-magic`. Nothing is committed.
- `npm test`: 607 tests, 558 pass, 0 fail, 49 browser checks skipped.
  `npm run test:cloudflare`: build passes, 17 of 17.
- New tests: an old paid `set` order keeps all four pieces beside a new
  outfit order; Premium pet and magic take tokens and Premium clothes do not;
  each of the 66 set magics is a different arrangement within 20 draws and
  2,000 triangles, frozen at time zero, sharing its meshes between wearers.
- Stripe: 16 sandbox and 16 live prices read back as active, one-time, SGD
  499 and the product default.
- Magic: the 66 cards in `public/wardrobe/accessory-*.png` were re-rendered
  from the new meshes and looked at as contact sheets, twice. Largest effect:
  19 draws, 1,912 triangles.
- Browser, local build at 1024x768 with a new guest: Magic, Premium shows
  "Unlock piece · 4 Style tokens" and no money button; Rainshield orbit
  previews with umbrella, shields and raindrops; Outfits, Premium shows "Buy
  outfit · S$4.99"; the purchase screen says pets and magic are separate.
- Not done: deployment; a sandbox or live checkout at S$4.99 (payments are
  off in the local build, so the priced button was not seen); archiving the
  old S$1.99 prices; a phone; magic watched in motion for all 66 (one was).
- Until deployment the live site still sells the whole set for S$1.99, now
  under Stripe products named "Outfit" whose description says pet and magic
  are not included.
