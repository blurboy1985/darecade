import { test } from "node:test";
import assert from "node:assert/strict";
import {
  singaporeDay,
  singaporeWeek,
  claimGift,
  fresh,
  normalise,
  missionProgress,
} from "../src/state.ts";
import { route, blocked } from "../src/navigation.ts";

test("gifts reset at Singapore midnight, not the browser timezone", () => {
  assert.equal(singaporeDay(new Date("2026-10-02T15:59:59Z")), "2026-10-02");
  assert.equal(singaporeDay(new Date("2026-10-02T16:00:00Z")), "2026-10-03");
  const s = fresh();
  assert.equal(claimGift(s, 1, "2026-10-02"), true);
  assert.equal(s.xp, 30);
  assert.equal(claimGift(s, 2, "2026-10-02"), false);
  assert.equal(s.xp, 30);
  assert.equal(s.hat, 2);
  assert.equal(claimGift(s, 2, "2026-10-03"), true);
  assert.equal(s.xp, 60);
  assert.equal(s.hat, 3);
  assert.equal(claimGift(s, 99, "2026-10-04"), false);
});
test("weekly hunt resets exactly on Monday Singapore time", () => {
  assert.equal(singaporeWeek(new Date("2026-10-04T15:59:59Z")), "2026-09-28");
  assert.equal(singaporeWeek(new Date("2026-10-04T16:00:00Z")), "2026-10-05");
  const fallback = fresh();
  fallback.week = "2026-10-05";
  const s = normalise(
    { week: "2026-09-28", coins: ["coin0", "coin1"], hat: 3, xp: 150 },
    fallback,
  );
  assert.deepEqual(s.coins, []);
  assert.equal(s.hat, 3);
  assert.equal(s.xp, 150);
});
test("malformed saves recover without invalid avatar parts or duplicate collectibles", () => {
  const f = fresh();
  const s = normalise(
    {
      outfit: 99,
      skin: -1,
      hat: "3",
      xp: NaN,
      rounds: -5,
      best: { noodle: "bad", brick: 75 },
      visited: ["shop", null, 5],
      week: f.week,
      coins: ["coin0", "coin0", "not-a-coin"],
      sound: "yes",
    },
    f,
  );
  assert.equal(s.outfit, 0);
  assert.equal(s.skin, 0);
  assert.equal(s.hat, 0);
  assert.equal(s.xp, 0);
  assert.equal(s.rounds, 0);
  assert.deepEqual(s.coins, ["coin0"]);
  assert.deepEqual(s.visited, ["shop"]);
  assert.deepEqual(s.best, {
    noodle: 0,
    brick: 75,
    hop: 0,
    swarm: 0,
    coast: 0,
  });
  assert.equal(s.sound, false);
  assert.deepEqual(normalise(null, f), f);
});
test("mission completion derives from saved activity, with bounded progress", () => {
  const s = fresh();
  assert.equal(missionProgress(s, "cat"), 0);
  s.cat = true;
  assert.equal(missionProgress(s, "cat"), 1);
  s.rounds = 12;
  assert.equal(missionProgress(s, "round"), 1);
  s.visited = ["arcade", "shop", "cat", "garden", "board"];
  assert.equal(missionProgress(s, "explore"), 4);
});
test("walking routes stay within the island and go around buildings", () => {
  const obstacles = [
    { x: 0, z: 0, w: 6, d: 8 },
    { x: 8, z: 7, w: 4, d: 4 },
  ];
  const start = { x: -8, z: 0 },
    end = { x: 8, z: 0 };
  const path = route(start, end, obstacles);
  assert.ok(path.length > 16);
  assert.deepEqual(path.at(-1), end);
  let previous = start;
  for (const p of path) {
    assert.equal(blocked(p.x, p.z, obstacles), false);
    assert.equal(Math.abs(p.x - previous.x) + Math.abs(p.z - previous.z), 1);
    previous = p;
  }
  assert.deepEqual(route(start, { x: 0, z: 0 }, obstacles), []);
  assert.deepEqual(route(start, { x: 36, z: 0 }, obstacles), []);
});
test("all five hunt coins can be reached around the actual structural footprints", () => {
  const obstacles = [
    { x: -5, z: -10, w: 18, d: 5 },
    { x: 12, z: -8, w: 7, d: 6 },
    { x: 15, z: 3, w: 3, d: 3.2 },
    { x: -15, z: -2.5, w: 4.2, d: 1.2 },
    { x: 11, z: 10, w: 5, d: 3 },
  ];
  for (const [x, z] of [
    [-16, 5],
    [-16, 11],
    [-11, 11],
  ])
    obstacles.push({ x, z, w: 1.5 * 0.85, d: 1.5 * 0.85 });
  for (const [x, z, s] of [
    [-18, -10, 1],
    [18, -12, 0.95],
    [18, 7, 0.8],
    [6, -13, 1],
    [4, 13, 0.7],
    [-7, 13, 0.7],
  ])
    obstacles.push({ x, z, w: 1.5 * s, d: 1.5 * s });
  for (const [x, z] of [
    [-17, 10],
    [-8, -4],
    [16, -2],
    [16, 11],
    [-1, -14],
  ]) {
    const path = route({ x: 0, z: 10 }, { x, z }, obstacles);
    assert.ok(path.length > 0, `coin at ${x},${z} is reachable`);
    assert.deepEqual(path.at(-1), { x, z });
  }
});
