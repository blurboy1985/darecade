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

## Merge, deployment and the rest — 11 October 2026

The owner asked for the mismatch to be fixed and the open items done, bar a phone.

- All 66 magics looked at moving: `scripts/magic-review.html` puts each on a
  mannequin; viewed at two frozen times, every prop had moved and none left
  the avatar. Dust looks oversized on that page only (it scales to the whole
  canvas, not the cell).
- Sandbox purchase of Solar at S$4.99 with Stripe's test card: webhook 200,
  `outfit:solar`, clothes wearable, pet and magic refused with 400.
- PR #88 merged as `af98775`; 607 tests, 0 fail; Cloudflare 17 of 17.
- `npm run cf:deploy`: Worker version `07316aa4-a191-405d-af17-ad7d2461a699`.
  Live health ready, bundle and a magic thumbnail match the local build.
- Live Checkout Session on the new Solar price: SGD 499, expired unpaid.
- The sixteen S$1.99 prices are archived in sandbox and live.
- Not done: a completed live charge (needs the owner's card), opening the
  live site in a browser (that needs an account on the live site), a phone.

## Revised offer — 11 October 2026, later

The owner corrected the offer: an outfit is all four pieces at S$4.99, any
single piece is S$1.99, Legendary takes tokens, Premium takes money only,
outfit cards must show pet and magic, and Stripe pricing and tags must match.

Assumptions (mine): token prices stay 8 and 5/4/4/4; `outfit:<set>` grants
from the outfit-only hours become whole sets; wearing an outfit puts on its
pet and magic; one Stripe price per kind of single item, not one per item.

Done on branch `outfit-and-item-pricing`:

- `src/collections.ts`, `server/community-core.mjs`, `server/payments.mjs`,
  `src/payments.ts`, `src/wardrobe.ts`: the model above, order kind `piece`.
- `src/character.ts`: outfit card camera widened; 132 outfit cards
  re-rendered with pet and magic, none touching an edge.
- `scripts/stripe-add-sets.mjs`: tags the outfit products and makes the four
  single-item products. Run in the sandbox: 20 changed, then 0 on a re-run.
- `npm test`: 607 tests, 558 pass, 0 fail, 49 skipped. Cloudflare 17 of 17.
- Sandbox, in the browser: Outfits shows pet and magic on the card and in the
  preview; the purchase screen lists the outfit at $4.99 and four items at
  $1.99; Miso the moon rabbit bought for S$1.99 with Stripe's test card,
  webhook paid, the pet wearable, Moon's clothes and magic refused; the Solar
  order from the outfit-only hours now covers Solar's magic.

Then, the same day:

- Live Stripe retagged and the four item prices created (20 changed); both
  catalogues read back correct: 16 outfit prices at 499, 4 item prices at 199.
- PR #89 merged as `d140909` and deployed as Worker version
  `a7d68460-d891-4d3a-ba77-2106ca848353`. Live health ready; bundle and an
  outfit card match the local build.
- Live Checkout Sessions on the Solar outfit and the pet item: SGD 499 and
  SGD 199, both expired unpaid.
- Not done: a completed live charge, the live site in a browser, a sandbox
  refund of a single item, a phone.
