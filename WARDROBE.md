# Menu and wardrobe

The dock has three main actions: Games, Neighbourhood and Menu. Menu groups My stuff,
Friends and Settings. My stuff contains My look, Rewards and Support & purchases.
An upfront camera button switches bird's-eye/third-person view. Menu uses a settings
gear; lighting, additional camera controls and account options remain in Settings.
Fishing and Hoops are included in Games. Social tools are under Friends.

My look separates browsing from equipping. Every card has a PNG rendered from
the actual 3D assets, including locked pieces and complete sets. Selecting a
card changes only the fitting-room preview. Equip saves the look; closing or
resetting the preview discards it. The lightweight lobby uses the same PNGs.

## Collections and progression

- Everyday: the original first eight choices in each category, available immediately.
- Street looks (existing Discovery pieces): 1 Style token for the collection.
- Weekend looks (existing Mastery pieces): 3 Style tokens for the collection.
- Legendary: redeem a full set, then mix its four pieces separately.

Each 100 lifetime XP earns one Style token. Available tokens equal
`floor(XP / 100) + medal tokens - tokens already exchanged`. Gold adds 3 medal
tokens, silver 2 and bronze 1, capped at 3 per player per Singapore day across
the five daily arcade games. XP tokens are separate. Medals remain prestige.
Exchanges preserve XP, level,
medals and rankings. Tokens cannot be bought with money. Optional Stripe payments can buy complete
sets directly for S$1.99; production checkout is enabled. See PAYMENTS.md. Existing saved appearance indices keep their meanings. An
already-worn older item remains wearable when other slots change.

Token prices are the only progression requirement. Existing Legendary prices and
owned sets remain unchanged. Existing Street/Weekend unlocks are grandfathered
without charging tokens, and old medals do not produce retroactive token rewards.
The sets use original superhero, anime and fantasy themes.

| Set | Style tokens |
| --- | ---: |
| Solar Sentinel | 12 |
| Moon Prism | 15 |
| Storm Ronin | 18 |
| Sakura Kitsune | 20 |
| Nova Mecha | 24 |
| Abyss Monarch | 28 |
| Tidal Empress | 32 |
| Phoenix Ascendant | 36 |
| Frost Seraph | 40 |
| Galaxy Idol | 45 |

Each includes an outfit, headwear, companion and animated magic effect.
The server checks progression and ownership, exchanges tokens transactionally,
and treats repeated requests for an owned set as a no-op. Profile patches cannot
grant XP, tokens or ownership. Presence updates cannot equip an unowned look.

Crossing XP token thresholds creates a durable notice with the exact number earned,
including passive invite awards. The browser consumes it once before showing a
brief Three.js coin reveal and “Style tokens buy outfits and looks.” Reconnecting
does not repeat an acknowledged notice. Reduced motion, 2D and WebGL failure use
the static card; closing, navigation and hiding the tab dispose the animation.

## Verification

See QA.md for the current simplification checks. The earlier release was
validated with the TypeScript/Vite build, 166 Node tests and 8 Cloudflare
integration tests, including the deployment dry run. Browser checks covered
desktop, 320px phone layout, locked previews, explicit equip, server persistence,
token exchange and the 2D fallback. Browser testing used a separate local test
database in `.browser/wardrobe-qa-data`.

The 155 previews in `public/wardrobe` cover every individual item and all ten
complete sets. To regenerate them, run `scripts/render-wardrobe-thumbnails.js`
in a browser on the local Vite page and save the returned name-to-data-URL map
as PNGs. Windows PowerShell can pass the script to `agent-browser eval -b`
using `[Convert]::ToBase64String([IO.File]::ReadAllBytes(...))` to preserve
multiline JavaScript. Run `npm run build` after changing the previews.

Integrated with PRs #11–16 for the 4 October production release. See QA.md for
merged-release checks and the historical feature-level checks.
