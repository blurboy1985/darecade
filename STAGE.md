# Open Stage

The Open Stage fills the back of Simi Plaza, in the middle of the island, added on 4 October 2026. It is a low dance floor anyone can walk onto, with a lighting truss, speakers and its name behind. The plaza's PLAY SIMI? floor sign moved forward to make room, and Simi Plaza still opens the challenges.

## The show

Walk onto the stage, or choose **Open Stage** under Explore. A show lasts forty seconds.

- Arrows fall down four lanes. Press the matching arrow key, W A S D (A left, S down, W up, D right), or the coloured button as each reaches the line.
- Within about 67 ms is **Perfect** (100 points), within 133 ms **Great** (75), and within 200 ms **Good** (50), early or late. A note that passes the line is a **Miss**, and pressing with no note there is **Too soon**.
- Every eight hits in a row add half again to the points, up to three times. A miss or a stray press resets the combo.
- The crowd's **hype** rises with hits and falls with misses and stray presses. At zero the show is booed off and ends early.
- The beat quickens from 100 to about 165 a minute, with more off-beat notes in the second half. Every show is a new song.
- Stars come from the share of a perfect show's score: 30% for one, 55% for two, 80% for three. A booed-off show earns at most one.

The scene is drawn in three.js: the player's own avatar does a move for each lane, a beam lights for the lane that was hit, confetti falls on every combo of eight, and the crowd bounces with the hype and turns away when a show is booed off. Reduce motion drops the confetti, bouncing and swaying. In the 2D lobby, or without WebGL, the note highway is the whole show.

## Dance styles, Fever and Encore — 10 October 2026

- **Dance style** (Pop, Disco, Street, Robot) is chosen above the stage and kept on the device. Each style has its own move for each of the four lanes and its own groove between notes; choosing one runs through its four moves. The show adds moves of its own: a spin on a combo of eight, a star jump on sixteen, a body wave on twenty-four (then round again), a stumble on a miss, a finishing pose, and a slump when booed off. Arms, elbows, knees, spine and head all move. Reduce motion keeps the lane moves and the held poses and drops the rest.
- **Fever**: every Perfect fills a twentieth of the bar under the lanes, every Great a thirtieth, every Good a fortieth. When it is full, tap it or press Space for five seconds of double points, with every lamp lit. The bar does not fill while Fever is lit, and Warm-up has none.
- **Stars are judged on timing alone.** The Fever bonus counts towards the score, the best score and a party's ranking, but stars and XP come from the score without it, against the same perfect show as before. Fever therefore does not make a star easier.
- **Encore** is a third session: quicker from the first bar, with double arrows (two lanes on one beat). It pays the same 5 XP a star under the same daily cap, judged against a perfect Encore.

Warm-up and the Show's chart, scoring, stars and XP are as they were.

## The song and kinder timing — 10 October 2026

- **Every show plays its own song**, and the arrows are its rhythm. The drums and bass keep the chart's beat: a kick on every beat, a hi-hat on every half-beat, a snare on the second and fourth. Each arrow is a note of the tune, pitched by its lane (left is low, right is high), so an arrow reaches the line exactly when its note sounds. Three clicks count the tempo in before the first arrow, and the song quickens with the arrows.
- The song is written from the chart (`src/stage-song.ts`), so the charts, the perfect score, stars, XP and Stage Party are unchanged. The seed picks one of four chord progressions.
- It is synthesised like the rest of the game's sound and follows the **Music** setting. The lobby theme waits while a show is on and returns after it. With music off the show plays as before, by sight.
- The panel cues each sound from the show's own tick clock, a fifth of a second ahead, so the song pauses with the show and cannot drift from the arrows. It starts each sound early by the output delay the browser reports (at most 100 ms). Bluetooth speakers can lag by more than that, and the browser may not report it.
- **Timing is kinder.** Good used to end at 150 ms and now reaches 200 ms, and **Great** sits between Perfect and Good, so a near miss of Perfect pays 75 instead of 50. Great raises the hype by 0.03 (Perfect 0.04, Good 0.02). A show of Greats earns two stars; a show of Goods still earns one.
- Notes in one lane are at least 22 ticks apart, so at the very fastest two Good windows (24 ticks) overlap by 2. The earlier note takes the press, as it always has.

## Stage Party

Under the stage, **Host a party** gives a four-letter code; a friend types it and presses **Join**. Up to four dancers share a party. The host chooses Show or Encore and starts; everyone gets the same song and a four-second countdown to the same moment.

- Every dancer is on the stage, on a ring of their own colour, doing the moves of their own style as their notes land. A scoreboard over the scene shows the scores live; the cheer buttons float an emoji on everyone's screen.
- When the last dancer finishes (or six seconds after the song), the scores are ranked. A dancer who was booed off ranks below one who stayed. The winner steps into a spotlight, and the host can start again.
- Joining during a round means watching it and dancing in the next. Joining a party walks off a show being played alone, and nothing is reported for it.
- If the host leaves, the next dancer hosts. Closing the stage leaves the party: the song's clock is shared and cannot pause.

A party is friendly. It writes no XP, medals or board of its own; each dancer's show is reported through the same `perform` event as a show played alone, so the daily cap and the 30-second rest apply unchanged. Scores in a party come from each browser and are not replayed, so a modified client could top a party's scoreboard, and gains nothing else by it.

Rooms are held in memory beside the community records (the Neighbourhood Durable Object on Cloudflare, the Node process in preview) and polled over HTTP: about once every 0.8 seconds during a show and every 1.5 seconds otherwise. There is no new Durable Object, table or migration. A deploy or an eviction ends the parties in progress, and each browser is told the party has ended. A dancer who stops polling is shown as away after 6 seconds and loses their place after 20; a party nobody starts for 20 minutes is closed. There can be 50 parties at once.

Names and looks in a party are the server's, as in a shared world. A wrong code and a party containing someone you have blocked (or who has blocked you) give the same answer; blocking a dancer takes the blocker out of a shared party; logging out or deleting a profile leaves it. Code guesses are limited to twelve a minute.

## Rewards and fairness

A show earns 5 XP a star, up to 45 XP a day (Singapore time), and the best score is kept. The stage also counts as a place to discover (10 XP once).

The browser reports the score and stars; the server does not replay the show. The rules in `src/state.ts` are shared with the server, which refuses malformed reports and any report less than 30 seconds after the last one, and applies the daily cap on its own clock. A modified client could claim three stars without playing, but gains only what an honest player can earn in three good shows a day. The stage has no board, medals or challenges; if it ever gets one, it would need server replay like the cabinets.

## Source

`shared/stage.ts` (charts, scoring, Fever), `src/stage-song.ts` (the song), `src/audio.ts` (`stageSound`), `src/stage-moves.ts` (the poses), `src/stage-game.ts`, `src/stage-view.ts`, `src/stage.css`, `src/world.ts` (`buildStage`, the spot), `src/state.ts` (`performShow`), `server/community-core.mjs` (`perform` event), `tests/stage.test.ts`, `tests/stage-encore.test.ts`, `tests/stage-moves.test.ts`, `tests/stage-song.test.ts`, `tests/stage-ui.test.ts`.

Stage Party: `shared/stage-party.ts` (protocol), `server/stage-rooms.mjs` (rooms), `/api/stage/*` in `server/index.mjs` and `cloudflare/api.mjs`, `src/stage-party.ts` (polling client), `tests/stage-party.test.ts`.
