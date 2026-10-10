import test from "node:test";
import assert from "node:assert/strict";
import {
  STAGE_MOVE_IDS,
  STAGE_STYLES,
  comboMove,
  laneMove,
  moveSeconds,
  neutralPose,
  stagePose,
  type StageMoveId,
  type StagePose,
} from "../src/stage-moves.ts";

const keys = Object.keys(neutralPose()) as (keyof StagePose)[];
/** How far apart two poses are, summed over every joint. */
const distance = (a: StagePose, b: StagePose) =>
  keys.reduce((sum, key) => sum + Math.abs(a[key] - b[key]), 0);
/** A move at its height, with no groove underneath. */
const peak = (id: StageMoveId, at = 0.5) =>
  stagePose(
    { style: "pop", playing: false, move: { id, age: moveSeconds(id) * at } },
    0,
  );

test("every style has its own move for each lane, and each move is a real pose", () => {
  assert.equal(STAGE_STYLES.length, 4);
  const lanes = STAGE_STYLES.flatMap((style) =>
    [0, 1, 2, 3].map((lane) => laneMove(style.id, lane)),
  );
  assert.equal(new Set(lanes).size, 16);
  assert.equal(
    STAGE_MOVE_IDS.length,
    20,
    "sixteen lane moves and four of the show's own",
  );
  const poses = STAGE_MOVE_IDS.map((id) => [id, peak(id)] as const);
  for (const [id, pose] of poses) {
    assert.ok(moveSeconds(id) >= 0.4 && moveSeconds(id) < 1, id);
    for (const key of keys) {
      assert.ok(Number.isFinite(pose[key]), `${id} ${key}`);
      // Within what a shoulder, a spine or a jump can do.
      assert.ok(
        Math.abs(pose[key]) <= (key === "yaw" ? 7 : 3.2),
        `${id} ${key}`,
      );
    }
    assert.ok(distance(pose, neutralPose()) > 1, `${id} moves the dancer`);
    assert.ok(pose.squash > -0.5, `${id} never flattens the dancer`);
  }
  for (const [a, first] of poses)
    for (const [b, second] of poses)
      if (a < b)
        assert.ok(
          distance(first, second) > 0.5,
          `${a} and ${b} look different`,
        );
});

test("left and right are mirror images, and moves begin and end standing", () => {
  for (const style of STAGE_STYLES) {
    const left = peak(laneMove(style.id, 0)),
      right = peak(laneMove(style.id, 3));
    assert.ok(Math.abs(left.x + right.x) < 1e-9);
    assert.ok(Math.abs(left.yaw + right.yaw) < 1e-9);
    assert.ok(Math.abs(left.roll + right.roll) < 1e-9);
    assert.ok(Math.abs(left.armL - right.armR) < 1e-9);
    assert.ok(Math.abs(left.outL - right.outR) < 1e-9);
    assert.ok(Math.abs(left.elbowR - right.elbowL) < 1e-9);
    assert.ok(left.x < 0 && right.x > 0, `${style.id} steps towards its lane`);
  }
  for (const id of STAGE_MOVE_IDS) {
    if (id === "spin") continue;
    assert.ok(distance(peak(id, 0), neutralPose()) < 1e-6, `${id} starts`);
    assert.ok(distance(peak(id, 0.9999), neutralPose()) < 0.05, `${id} ends`);
  }
  // A spin ends one whole turn round, which looks the same as standing.
  assert.ok(Math.abs(peak("spin", 0.9999).yaw - Math.PI * 2) < 0.01);
  // A move that has run its time, or has not begun, is no longer played.
  const over = { id: laneMove("pop", 2), age: 5 };
  assert.deepEqual(
    stagePose({ style: "pop", playing: false, move: over }, 3),
    neutralPose(),
  );
  assert.deepEqual(
    stagePose({ style: "pop", playing: false, move: { ...over, age: -1 } }, 3),
    neutralPose(),
  );
});

test("combos earn a spin, a star jump and a wave in turn", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(comboMove), [
    "spin",
    "star",
    "wave",
    "spin",
    "star",
    "wave",
  ]);
  assert.equal(comboMove(0), "spin");
  assert.equal(laneMove("disco", 9), "disco-3");
  assert.equal(laneMove("disco", -2), "disco-0");
});

test("each style grooves its own way, Fever takes over, and the show ends in a pose", () => {
  const at = (
    style: (typeof STAGE_STYLES)[number]["id"],
    time: number,
    fever = false,
  ) => stagePose({ style, playing: true, fever }, time);
  const still = (style: (typeof STAGE_STYLES)[number]["id"]) =>
    stagePose({ style, playing: false }, 1.3);
  for (const style of STAGE_STYLES) {
    assert.deepEqual(
      still(style.id),
      neutralPose(),
      "no dancing before the show",
    );
    // The robot holds each click, so look across a whole bar.
    assert.ok(
      [0.55, 0.8, 1.05, 1.3].some(
        (time) => distance(at(style.id, 0.3), at(style.id, time)) > 0.1,
      ),
      `${style.id} keeps moving`,
    );
    for (const other of STAGE_STYLES)
      if (style.id < other.id)
        assert.ok(
          distance(at(style.id, 0.3), at(other.id, 0.3)) > 0.3,
          `${style.id} and ${other.id} groove differently`,
        );
    // Arms overhead in Fever, whatever the style.
    const fever = at(style.id, 0.3, true);
    assert.ok(fever.armL < -2 && fever.armR < -2);
    assert.deepEqual(fever, at("pop", 0.3, true));
  }
  const finish = stagePose({ style: "pop", playing: false, hold: "finish" }, 2),
    slump = stagePose({ style: "pop", playing: false, hold: "slump" }, 2);
  assert.ok(finish.outL > 2, "one arm high");
  assert.ok(slump.spine > 0.3 && slump.nod > 0.3, "head down");
  assert.ok(distance(finish, slump) > 2);
  // The pose is held: a move or a groove does not disturb it.
  const held = stagePose(
    {
      style: "robot",
      playing: true,
      fever: true,
      hold: "finish",
      move: { id: "spin", age: 0.3 },
    },
    2,
  );
  assert.deepEqual(held, finish);
});

test("reduce motion keeps the lane moves and drops the groove, spins and stumbles", () => {
  const calm = (id: StageMoveId | null) =>
    stagePose(
      {
        style: "street",
        playing: true,
        fever: true,
        reduced: true,
        move: id && { id, age: moveSeconds(id) / 2 },
      },
      0.7,
    );
  assert.deepEqual(calm(null), neutralPose());
  for (const id of ["spin", "star", "wave", "stumble"] as const)
    assert.deepEqual(calm(id), neutralPose(), id);
  assert.ok(distance(calm(laneMove("street", 1)), neutralPose()) > 1);
  const hold = stagePose(
    { style: "pop", playing: false, hold: "finish", reduced: true },
    1,
  );
  assert.deepEqual(
    hold,
    stagePose(
      { style: "pop", playing: false, hold: "finish", reduced: true },
      9,
    ),
    "a held pose does not breathe",
  );
});
