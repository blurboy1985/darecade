import test from "node:test";
import assert from "node:assert/strict";
import { CoastRace, TRACK_LENGTH, trackPoint } from "../shared/racing.ts";
import { RaceMotion, raceTrackPose } from "../src/race-motion.ts";

test("player and opponents move between simulation ticks without changing race state", () => {
  const race = new CoastRace();
  const motion = new RaceMotion();
  const before = motion.sample(race, 0);
  motion.capture(race);
  race.distance += 0.6;
  race.offset += 0.2;
  for (const rival of race.rivals) rival.distance += 0.4;
  const saved = JSON.stringify(race);
  const middle = motion.sample(race, 0.5);
  assert.ok(Math.abs(middle.distance - before.distance - 0.3) < 1e-9);
  assert.ok(Math.abs(middle.offset - before.offset - 0.1) < 1e-9);
  for (let i = 0; i < middle.rivals.length; i++)
    assert.ok(
      Math.abs(middle.rivals[i].distance - before.rivals[i].distance - 0.2) <
        1e-9,
    );
  assert.equal(JSON.stringify(race), saved);
  assert.equal(motion.sample(race, 1).distance, race.distance);
});

test("120Hz rendering stays evenly paced around 60Hz simulation ticks", () => {
  const race = new CoastRace();
  const motion = new RaceMotion();
  let last = 0;
  for (let tick = 0; tick < 120; tick++) {
    motion.capture(race);
    race.distance += 0.6;
    for (const alpha of [0, 0.5]) {
      const now = motion.sample(race, alpha).distance;
      if (tick || alpha) assert.ok(Math.abs(now - last - 0.3) < 1e-9);
      last = now;
    }
  }
});

test("visual heading removes track-segment jumps and stays continuous across laps", () => {
  const angle = (a: number, b: number) =>
    Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  let rawJump = 0;
  let smoothJump = 0;
  for (let d = 0; d <= TRACK_LENGTH; d += 0.02) {
    rawJump = Math.max(
      rawJump,
      angle(trackPoint(d).yaw, trackPoint(d - 0.02).yaw),
    );
    smoothJump = Math.max(
      smoothJump,
      angle(raceTrackPose(d, 0).yaw, raceTrackPose(d - 0.02, 0).yaw),
    );
  }
  assert.ok(smoothJump < rawJump / 4, `${smoothJump} versus ${rawJump}`);
  assert.ok(
    angle(
      raceTrackPose(TRACK_LENGTH - 0.001, 0).yaw,
      raceTrackPose(TRACK_LENGTH + 0.001, 0).yaw,
    ) < 0.001,
  );
});
