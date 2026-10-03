# East Side

East Side is a second district east of the original island, added on 4 October 2026. It holds three facilities whose activities are not arcade cabinets. None of them has a 60-second timer, a leaderboard or medals.

## Getting there

Walk east along the main path and under the EAST SIDE arch, or choose a facility under **Explore** or **Play outside**. Arriving opens its panel. In the 2D lobby the same panels open directly. The first race still comes first for a new player, as with every other part of the neighbourhood.

On a desktop screen the overview camera slides east, and a little south near the pond, as the player walks over. Phones already follow the player.

## Facilities

**Fishing Jetty.** Cast, wait for the float to dip, then reel within about a second. Reeling early scares the fish off; waiting too long lets it go. Six species turn up with different odds: Longkang guppy, Pond tilapia, Whiskered catfish, River prawn, Sunbathing terrapin and Golden koi. The first catch of each species gives 10 XP, 60 in total. Everything goes back in the pond.

**Hoops Court.** Ten shots. A marker sweeps across a bar and the player stops it inside the green zone. Each shot the marker is quicker and the zone narrower. Only a new personal best earns XP: 5 for each point above the previous best, 50 in total. It can be replayed freely.

**Community Plots.** One plot, one crop at a time.

| Crop        | Grows in | Harvest |
| ----------- | -------- | ------- |
| Chilli padi | 1 hour   | 10 XP   |
| Pandan      | 3 hours  | 15 XP   |
| Sunflower   | 8 hours  | 25 XP   |

Watering once per crop brings the harvest a quarter of the remaining time closer. Crops grow while the player is away and never wilt, so there is nothing to lose by coming back late.

## Also added

- Away activities **Fish off the jetty** and **Shoot some hoops**, which place a resting avatar at the jetty or on the court.
- Stickers **Gone fishing**, **Nothing but net** (5 of 10) and **Green fingers**.
- Mission **A breath of fresh air**: try two East Side activities, 30 XP.
- The three places count as discoveries (10 XP each) like the original eight.

## Fairness

All rewards are cosmetic XP decided by the server; the rules live in `src/state.ts` and are shared with it. Crop timing uses the server clock.

Catches and hoops scores are reported by the browser, as the existing exploration events are. The server does not replay them, so a modified client could claim a catch or a 10 of 10 without playing. The rewards are capped and paid once (60 XP for fish, 50 for hoops), so that gains nothing an honest player cannot also earn, and nothing here feeds medals, rankings or dares. If these activities ever get a board, they would need server replay like the cabinets.

## Source

`src/world.ts` (`buildEastSide`, spots, camera), `src/navigation.ts` (island bounds), `src/activities.ts` and `src/activities.css` (panels), `src/state.ts` (rules), `src/neighbourhood.ts` (away poses), `server/community-core.mjs` (progression events), `tests/eastside.test.ts`.

The district is built from the same procedural boxes and cylinders as the rest of the island and is merged into the static batches, so it adds geometry but few draw calls. It has no Blender-animated interaction of its own.
