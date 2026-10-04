# Open Stage

The Open Stage fills the back of Dare Plaza, in the middle of the island, added on 4 October 2026. It is a low dance floor anyone can walk onto, with a lighting truss, speakers and its name behind. The plaza's DARE TO PLAY floor sign moved forward to make room, and Dare Plaza still opens the dares.

## The show

Walk onto the stage, or choose **Open Stage** under Explore. A show lasts forty seconds.

- Arrows fall down four lanes. Press the matching arrow key, D F J K, or the coloured button as each reaches the line.
- Within about 67 ms is **Perfect** (100 points); within 150 ms is **Good** (50). A note that passes the line is a **Miss**, and pressing with no note there is **Too soon**.
- Every eight hits in a row add half again to the points, up to three times. A miss or a stray press resets the combo.
- The crowd's **hype** rises with hits and falls with misses and stray presses. At zero the show is booed off and ends early.
- The beat quickens from 100 to about 165 a minute, with more off-beat notes in the second half. Every show is a new song.
- Stars come from the share of a perfect show's score: 30% for one, 55% for two, 80% for three. A booed-off show earns at most one.

The scene is drawn in three.js: the player's own avatar does a move for each lane, a beam lights for the lane that was hit, confetti falls on every combo of eight, and the crowd bounces with the hype and turns away when a show is booed off. Reduce motion drops the confetti, bouncing and swaying. In the 2D lobby, or without WebGL, the note highway is the whole show.

## Rewards and fairness

A show earns 5 XP a star, up to 45 XP a day (Singapore time), and the best score is kept. The stage also counts as a place to discover (10 XP once).

The browser reports the score and stars; the server does not replay the show. The rules in `src/state.ts` are shared with the server, which refuses malformed reports and any report less than 30 seconds after the last one, and applies the daily cap on its own clock. A modified client could claim three stars without playing, but gains only what an honest player can earn in three good shows a day. The stage has no board, medals or dares; if it ever gets one, it would need server replay like the cabinets.

## Source

`shared/stage.ts` (song and scoring), `src/stage-game.ts`, `src/stage-view.ts`, `src/stage.css`, `src/world.ts` (`buildStage`, the spot), `src/state.ts` (`performShow`), `server/community-core.mjs` (`perform` event), `tests/stage.test.ts`.
