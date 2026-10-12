# One Play list with Arcade and Play outside tags — 13 October 2026

The owner asked for the Play panel's "Arcade games" and "Play outside"
categories to become one, with each entry tagged:

- **Arcade:** Noodle Run, Brick Bash, Hop Hop, Star Swarm
- **Play outside:** Coast Rush, Hoops Court, Open Stage, Fishing Jetty

## Assumptions (mine)

- "Discover something fun" stays as the other choice in the selector. It is the
  new-player view and was not mentioned.
- The merged list holds exactly the eight named activities, in that order,
  paged in threes like the rest of the menu.
- Community Plots, Dragon Rooftop, Swings, Pet Kopi and Take a seat leave the
  Play list because they were not given a tag. They stay in Discover and in the
  world itself.
- The tag replaces the genre label (SNAKE, RACING…) on each card.
- Neighbourhood → Play outside still opens Play, now on the merged list.

## Done means

- The selector offers Discover and one merged list; no "Arcade games" or
  "Play outside" option.
- Eight cards, each showing its tag; Open Stage opens the stage panel.
- `npm test` and `npm run build` pass; the list looked at in a browser.

## Steps

1. `src/catalog.ts`: `playMenu`, the eight entries with their tags.
2. `src/main.ts`: `cards()` renders `playMenu`; drop the "outside" section,
   its list and its pager route.
3. CSS: Open Stage card art and the Play outside tag colour.
4. Tests: `discover`, `lobby-render` and the browser fixtures that chose the
   "outside" section.
5. Verify, then open the PR.
