import test from "node:test";
import assert from "node:assert/strict";
import {
  coastProgress,
  levelReward,
  stageProgress,
} from "../src/progression-guide.ts";
import { raceTime } from "../shared/racing.ts";

test("progress guide follows existing avatar level and token boundaries", () => {
  assert.match(levelReward(0), /Level 1 → 2/);
  assert.match(levelReward(99), /1 XP to your next Style token/);
  assert.match(levelReward(100), /Level 2 → 3/);
  assert.match(levelReward(100), /100 XP to your next Style token/);
});

test("Coast goal distinguishes first finish from separate personal records", () => {
  assert.match(
    coastProgress({
      xp: 0,
      coastRecord: { version: 3, timeTicks: 0, place: 0 },
    }),
    /finish all 3 laps/,
  );
  const saved = {
    xp: 120,
    coastRecord: { version: 3 as const, timeTicks: 3600, place: 2 },
  };
  const before = structuredClone(saved);
  const guide = coastProgress(saved);
  assert.ok(guide.includes(`Next goal: beat ${raceTime(3600)}`));
  assert.match(guide, /best place 2/);
  assert.match(guide, /Verified round: \+20 XP/);
  assert.deepEqual(saved, before);
});

test("Stage daily reward guide resets yesterday's cap without changing saved data", () => {
  const saved = {
    xp: 99,
    stageBest: 3000,
    stageDay: "2026-10-04",
    stageXp: 45,
  };
  assert.match(stageProgress(saved, "2026-10-04"), /0\/45 XP left today/);
  assert.match(stageProgress(saved, "2026-10-05"), /45\/45 XP left today/);
  assert.match(stageProgress(saved, "2026-10-05"), /Best show: 3000 points/);
  assert.equal(saved.stageXp, 45);
});
