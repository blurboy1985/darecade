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
    assert.equal("hat" in saved, false);
    assert.equal("unlockedHats" in saved, false);
  }
});

test("presence counts live people including self, deduplicates and never counts offline cards", () => {
  assert.equal(worldPresenceCopy([], "me", "joining"), "Joining world…");
  assert.equal(worldPresenceCopy([], "me", "connected"), "1 player");
  const me = { id: "me", status: "online" } as const;
  assert.equal(worldPresenceCopy([me], "me", "connected"), "1 player");
  const players = [
    me,
    me,
    { id: "friend", status: "online" },
    { id: "away", status: "resting" },
    { id: "saved", status: "offline" },
  ] as const;
  assert.equal(worldPresenceCopy(players, "me", "connected"), "3 players");
  assert.equal(
    worldPresenceCopy(players, "me", "reconnecting"),
    "Reconnecting…",
  );
  assert.equal(
    worldPresenceCopy(players, "me", "offline"),
    "Offline · player count unavailable",
  );
  assert.equal(
    worldPresenceCopy(players, "me", "connected", false),
    "Offline · player count unavailable",
  );
  // The fixed count of example residents is not shown as if it were players.
  for (const state of [
    "joining",
    "connected",
    "reconnecting",
    "offline",
  ] as const)
    assert.doesNotMatch(worldPresenceCopy(players, "me", state), /neighbours/);
});

test("the first-race goal names the XP reward and keeps town access", () => {
  assert.match(firstVisitCopy.title, /Palm Bay finish/);
  assert.match(firstVisitCopy.detail, /Finish a round.*Palm Bay/);
  assert.match(firstVisitCopy.explore, /town is open/);
  assert.doesNotMatch(JSON.stringify(firstVisitCopy), /open the town/);
  const progress = fresh();
  assert.equal(firstRoundGoalPending(progress), true);
  assert.equal(completeWelcomeRound(progress), true);
  assert.equal(firstRoundGoalPending(progress), false);
  assert.equal(completeWelcomeRound(progress), false);
  assert.equal(firstRoundGoalPending({ welcome: "cabinet" }), true);
  assert.equal(firstRoundGoalPending({ welcome: "played" }), false);
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
test("eye colour is optional for old saves and never changes owned cosmetics", () => {
  const old = fresh();
  old.wardrobePurchased = ["solar"];
  old.wardrobeUnlocked = ["moon"];
  old.xp = 350;
  const next = normalise({ ...old, eye: 3 }, fresh());
  assert.equal(next.eye, 3);
  assert.deepEqual(next.wardrobePurchased, old.wardrobePurchased);
  assert.equal(next.xp, 350);
  assert.equal(normalise({ ...old, eye: 999 }, fresh()).eye, fresh().eye);
});
