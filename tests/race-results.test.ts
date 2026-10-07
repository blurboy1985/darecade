import test from "node:test";
import assert from "node:assert/strict";
import { raceComparison } from "../src/race-results.ts";
import { raceScore } from "../shared/racing.ts";

const board = [
  { id: "a", name: "Fast <Racer>", score: raceScore(3000), rank: 1 },
  { id: "b", name: "Breeze", score: raceScore(3060), rank: 2 },
  { id: "c", name: "Coco", score: raceScore(3060), rank: 2 },
  { id: "me", name: "Moon", score: raceScore(3200), rank: 4 },
];
// The renderer only consumes the board, date and current player ID.
const state = { boards: { coast: board }, day: "2026-10-04", me: "me" };

test("practice comparison uses today's times, preserves ties and cannot claim ranked entry", () => {
  const html = raceComparison(raceScore(3060), state, false);
  assert.match(html, /1.00s behind today’s fastest/);
  assert.match(html, /would place #2/);
  assert.match(html, /Practice comparison only/);
  assert.match(html, /2026-10-04 · SGT/);
  assert.match(html, /Fast &lt;Racer&gt;/);
  assert.match(html, /Moon · You/);
  assert.match(html, /0:50.00/);
  assert.match(html, /All 4 racers/);
});

test("ranked run comparison is distinct from the player's better daily best", () => {
  const html = raceComparison(raceScore(3300), state, true);
  assert.match(html, /5.00s behind/);
  assert.match(html, /This race compares at #4/);
  assert.match(html, /Each racer’s best time today counts/);
  assert.match(html, /0:53.33/);
});

test("no finish, empty boards and unavailable boards never invent rankings", () => {
  assert.match(raceComparison(0, state, false), /Finish all three laps/);
  assert.doesNotMatch(raceComparison(0, state, false), /would place/);
  const empty = { ...state, boards: { ...state.boards, coast: [] } };
  assert.match(
    raceComparison(raceScore(3000), empty, false),
    /No ranked times yet/,
  );
  assert.match(
    raceComparison(raceScore(3000), null, true),
    /times are unavailable/,
  );
  assert.match(
    raceComparison(raceScore(3000), state, true),
    /matched today’s fastest/,
  );
  assert.match(raceComparison(raceScore(2940), state, false), /1.00s faster/);
});
