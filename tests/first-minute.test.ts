import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  fresh,
  normalise,
  completeWelcomeRound,
  firstRoundGoalPending,
} from "../src/state.ts";
import { firstVisitCopy } from "../src/lobby-menu.ts";
import { worldPresenceCopy } from "../src/lobby-presence.ts";

test("new characters start in third person and explicit saved camera choices survive", () => {
  assert.equal(fresh().cameraMode, "third");
  for (const cameraMode of ["isometric", "third"] as const) {
    const saved = normalise(
      { cameraMode, xp: 400, rounds: 5, hat: 2, unlockedHats: [0, 2] },
      fresh(),
    );
    assert.equal(saved.cameraMode, cameraMode);
    assert.equal(saved.xp, 400);
    assert.equal(saved.rounds, 5);
    assert.equal(saved.hat, 2);
  }
});

test("presence counts live people including self, deduplicates and never counts offline cards", () => {
  assert.equal(worldPresenceCopy([], "me", "joining"), "Finding players…");
  assert.equal(worldPresenceCopy([], "me", "connected"), "Finding players…");
  const me = { id: "me", status: "online" } as const;
  assert.equal(worldPresenceCopy([me], "me", "connected"), "Just you here");
  const players = [
    me,
    me,
    { id: "friend", status: "online" },
    { id: "away", status: "resting" },
    { id: "saved", status: "offline" },
  ] as const;
  assert.equal(
    worldPresenceCopy(players, "me", "connected"),
    "3 players here · including you",
  );
  for (const state of ["offline", "reconnecting"] as const)
    assert.equal(
      worldPresenceCopy(players, "me", state),
      "Player count unavailable",
    );
  assert.equal(
    worldPresenceCopy(players, "me", "connected", false),
    "Player count unavailable",
  );
});

test("the first-race goal names the real cap reward and town access without changing rewards", () => {
  assert.match(firstVisitCopy.title, /lilac cap/);
  assert.match(firstVisitCopy.detail, /Finish a round.*Palm Bay/);
  assert.match(firstVisitCopy.explore, /town is open/);
  assert.doesNotMatch(JSON.stringify(firstVisitCopy), /open the town/);
  const progress = fresh();
  assert.equal(firstRoundGoalPending(progress), true);
  assert.equal(completeWelcomeRound(progress), true);
  assert.ok(progress.unlockedHats.includes(2));
  assert.equal(firstRoundGoalPending(progress), false);
  assert.equal(completeWelcomeRound(progress), false);
  assert.equal(firstRoundGoalPending({ rounds: 1, unlockedHats: [0] }), false);
  assert.equal(
    firstRoundGoalPending({ rounds: 0, unlockedHats: [0, 2] }),
    false,
  );
  const source = readFileSync(
    new URL("../src/main.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /const firstRace = firstRoundGoalPending\(save\)/);
  assert.match(source, /el\.hidden = !firstRace/);
  assert.match(
    source,
    /const returnFocus[\s\S]*?firstRoundGoalPending\(save\)/,
  );
  assert.match(
    source,
    /addEventListener\("offline", \(\) => \{\s*worldStatus = "offline";\s*renderWorldPresence\(\)/,
  );
  assert.match(
    source,
    /liveNeighbours = players;[\s\S]*?renderWorldPresence\(\)/,
  );
});
