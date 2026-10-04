# East Side

East Side is a second district east of the original island, added on 4 October 2026. It holds three facilities whose activities are not arcade cabinets. None of them has a daily board or medals. Fishing and hoops are short rounds that can be played as challenges.

## Getting there

Walk east along the main path and under the EAST SIDE arch, or choose a facility under **Explore** or **Play outside**. Arriving opens its panel. In the 2D lobby the same panels open directly. The first race still comes first for a new player, as with every other part of the neighbourhood.

On a desktop screen the overview camera slides east, and a little south near the pond, as the player walks over. Phones already follow the player.

## Facilities

**Fishing Jetty.** A one-minute round with one control. Press to cast, press again the moment the float dips, then hold to reel. Holding raises the line's tension, and the fish surges every so often: reeling through a surge gains little and strains the line, so let go until it calms. The line snaps at full tension, and a fish left alone too long slips the hook. Hooking early or late loses the bite. Six species turn up with different odds; rarer ones score more and fight harder.

| Species             | Points |
| ------------------- | ------ |
| Longkang guppy      | 10     |
| Pond tilapia        | 15     |
| Whiskered catfish   | 25     |
| River prawn         | 30     |
| Sunbathing terrapin | 60     |
| Golden koi          | 80     |

The first catch of each species still gives 10 XP, 60 in total. Everything goes back in the pond.

**Hoops Court.** Ten shots with a four-second shot clock each. A marker sweeps across a bar and the player stops it inside the green zone. The middle third of the green is a swish worth 3 points; the rest is worth 2. Baskets in a row add 1, 2, then 3 more. Each shot the marker is quicker and the green narrower, and from the fourth shot the green slides. Running out the clock counts as a miss. The most a round can score is 54. Beating the most baskets made in a round still earns 5 XP a basket, 50 in total.

Both rounds give the usual 20 XP, show a personal best, and can be played as a challenge from the neighbour list or posted from the result, like the cabinets. They do not have daily boards and never earn medals, so the 15-point daily maximum is unchanged.

The round is drawn in three.js: the ball's arc, the rim and net, sparks on a basket, a burning ball on a streak of three, and a shot-clock bar above the board; the pond, rod, line and float, splashes on a bite, the fish's shadow, and the fish leaping out when landed. Reduce motion drops the particles and bobbing. In the simple view, or if the graphics context is lost, the meters carry the round on their own.

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

Fishing and hoops rounds are replayed by the server from the player's inputs (`shared/outdoor.ts`), exactly as the cabinets are, so scores, catches and baskets cannot be claimed without playing. Species and hoops-best XP are paid from the replay. The earlier `fish` and `hoops` progress events, which took the browser's word, are removed. Fish, surges and the green's position come from the round's seed; a challenge is played on the defender's seed.

## Source

`src/world.ts` (`buildEastSide`, spots, camera), `src/navigation.ts` (island bounds), `src/activities.ts` and `src/activities.css` (panels), `shared/outdoor.ts` (round rules), `src/outdoor-game.ts`, `src/outdoor-view.ts` and `src/outdoor.css` (the rounds), `src/state.ts` (rules), `src/neighbourhood.ts` (away poses), `server/community-core.mjs` (progression events), `tests/eastside.test.ts`, `tests/outdoor.test.ts`.

The district is built from the same procedural boxes and cylinders as the rest of the island and is merged into the static batches, so it adds geometry but few draw calls. It has no Blender-animated interaction of its own.
