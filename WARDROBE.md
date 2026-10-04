# Menu and wardrobe

The dock has four destinations: Play, Explore, My look and More. More groups
rewards, social features, outdoor activities and preferences. Camera options
are in Settings. Emotes and the album remain accessible through More.

My look separates browsing from equipping. Every card has a PNG rendered from
the actual 3D assets, including locked pieces and complete sets. Selecting a
card changes only the fitting-room preview. Equip saves the look; closing or
resetting the preview discards it. The lightweight lobby uses the same PNGs.

## Collections and progression

- Everyday: the original first eight choices in each category, available immediately.
- Discovery: 300 XP or 1 lifetime medal point.
- Mastery: 1,000 XP or 3 lifetime medal points.
- Legendary: redeem a full set, then mix its four pieces separately.

Each 100 lifetime XP earns one Style token. Available tokens equal
`floor(XP / 100) - tokens already exchanged`. Exchanges preserve XP, level,
medals and rankings. Tokens cannot be bought with money. Optional Stripe payments can buy complete
sets directly; checkout is disabled until configured. See PAYMENTS.md. Existing saved appearance indices keep their meanings. An
already-worn older item remains wearable when other slots change.

Each Legendary set costs tokens AND requires the listed lifetime medal points
OR completed rounds. The sets use original superhero, anime and fantasy themes.

| Set | Style tokens | Medal points OR rounds |
| --- | ---: | --- |
| Solar Sentinel | 12 | 3 OR 30 |
| Moon Prism | 15 | 4 OR 40 |
| Storm Ronin | 18 | 5 OR 50 |
| Sakura Kitsune | 20 | 6 OR 60 |
| Nova Mecha | 24 | 8 OR 75 |
| Abyss Monarch | 28 | 10 OR 90 |
| Tidal Empress | 32 | 12 OR 110 |
| Phoenix Ascendant | 36 | 15 OR 130 |
| Frost Seraph | 40 | 18 OR 150 |
| Galaxy Idol | 45 | 21 OR 180 |

Each includes an outfit, headwear, companion and animated magic effect.
The server checks progression and ownership, exchanges tokens transactionally,
and treats repeated requests for an owned set as a no-op. Profile patches cannot
grant XP, tokens or ownership. Presence updates cannot equip an unowned look.

## Verification

Validated with the TypeScript/Vite build, 105 Node tests and 7 Cloudflare
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

This change was verified locally; it has not been deployed or pushed.
