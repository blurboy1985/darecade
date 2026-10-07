import test from "node:test";
import assert from "node:assert/strict";
import { fresh, normalise, completeWelcomeRound } from "../src/state.ts";
test("first finished round grants one welcome XP reward and preserves the current look", () => {
  const s = fresh();
  s.hat = 3;
  s.unlockedHats.push(3);
  assert.equal(completeWelcomeRound(s), true);
  assert.equal(s.welcome, "played");
  assert.equal(s.xp, 35);
  assert.equal(s.unlockedHats.includes(2), false);
  assert.equal(s.hat, 3);
  assert.equal(completeWelcomeRound(s), false);
  assert.equal(s.xp, 35);
  assert.equal(s.unlockedHats.filter((x) => x === 2).length, 0);
});
test("welcome quest resumes after reload and never re-awards completed progress", () => {
  const s = fresh();
  s.welcome = "cabinet";
  s.welcomeDismissed = true;
  const reloaded = normalise(JSON.parse(JSON.stringify(s)), fresh());
  assert.equal(reloaded.welcome, "cabinet");
  assert.equal(reloaded.welcomeDismissed, true);
  completeWelcomeRound(reloaded);
  reloaded.welcome = "complete";
  const done = normalise(reloaded, fresh());
  assert.equal(completeWelcomeRound(done), false);
  assert.equal(done.xp, 35);
  assert.equal(done.unlockedHats.includes(2), false);
});
test("existing saves keep progress and get the optional welcome quest on their next completed round", () => {
  const s = normalise(
    { rounds: 10, xp: 400, hat: 1, unlockedHats: [0, 1] },
    fresh(),
  );
  assert.equal(s.welcome, "new");
  assert.equal(s.rounds, 10);
  completeWelcomeRound(s);
  assert.equal(s.xp, 435);
  assert.equal(s.hat, 1);
  const invalid = normalise(
    { welcome: "hacked", welcomeDismissed: "yes" },
    fresh(),
  );
  assert.equal(invalid.welcome, "new");
  assert.equal(invalid.welcomeDismissed, false);
});
