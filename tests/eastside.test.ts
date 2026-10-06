import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import {
  fresh,
  normalise,
  fishSpecies,
  crops,
  catchFish,
  scoreHoops,
  plantCrop,
  waterCrop,
  harvestCrop,
  cropReadyAt,
  missionProgress,
} from "../src/state.ts";
import { activities } from "../src/catalog.ts";
import { activityPose } from "../src/neighbourhood.ts";
import { blocked, route } from "../src/navigation.ts";

const HOUR = 3600000;
test("each fish species earns XP once; unknown catches are refused", () => {
  const s = fresh();
  assert.equal(catchFish(s, "koi"), true);
  assert.equal(catchFish(s, "koi"), false);
  assert.equal(catchFish(s, "shark"), null);
  assert.equal(catchFish(s, 7), null);
  for (const f of fishSpecies) catchFish(s, f.id);
  for (const f of fishSpecies) catchFish(s, f.id);
  assert.equal(s.fish.length, fishSpecies.length);
  assert.equal(s.xp, fishSpecies.length * 10);
});
test("hoops pays only for beating a personal best, up to ten shots", () => {
  const s = fresh();
  assert.equal(scoreHoops(s, 4), 20);
  assert.equal(scoreHoops(s, 4), 0);
  assert.equal(scoreHoops(s, 2), 0);
  assert.equal(scoreHoops(s, 6), 10);
  assert.equal(s.hoopsBest, 6);
  for (const bad of [11, -1, 2.5, "9", null])
    assert.equal(scoreHoops(s, bad), null);
  assert.equal(scoreHoops(s, 10), 20);
  assert.equal(s.xp, 50);
});
test("a crop grows on the clock, is watered once, never wilts and frees the plot", () => {
  const s = fresh(),
    start = 1_000_000;
  assert.equal(cropReadyAt(s), 0);
  assert.equal(harvestCrop(s, start), null);
  assert.equal(waterCrop(s, start), false);
  assert.equal(plantCrop(s, "durian", start), false);
  assert.equal(plantCrop(s, "pandan", start), true);
  assert.equal(plantCrop(s, "chilli", start), false, "one crop at a time");
  assert.equal(cropReadyAt(s), start + 3 * HOUR);
  assert.equal(harvestCrop(s, start + 3 * HOUR - 1), null);
  // Watering after one hour removes a quarter of the two hours left.
  assert.equal(waterCrop(s, start + HOUR), true);
  assert.equal(cropReadyAt(s), start + 2.5 * HOUR);
  assert.equal(waterCrop(s, start + HOUR), false, "once per crop");
  assert.equal(harvestCrop(s, start + 2.5 * HOUR - 1), null);
  // Coming back a month late still finds the crop waiting.
  assert.equal(harvestCrop(s, start + 720 * HOUR)?.id, "pandan");
  assert.equal(s.xp, 15);
  assert.equal(s.harvests, 1);
  assert.equal(s.plotCrop, "");
  assert.equal(plantCrop(s, "chilli", start), true);
  assert.equal(s.plotWatered, false);
  assert.deepEqual(
    crops.map((c) => [c.hours, c.xp]),
    [
      [1, 10],
      [3, 15],
      [8, 25],
    ],
  );
});
test("East Side saves survive reloads and reject tampered values", () => {
  const s = fresh();
  catchFish(s, "prawn");
  scoreHoops(s, 7);
  plantCrop(s, "sunflower", 5000);
  const again = normalise(JSON.parse(JSON.stringify(s)), fresh());
  assert.deepEqual(again.fish, ["prawn"]);
  assert.equal(again.hoopsBest, 7);
  assert.equal(again.plotCrop, "sunflower");
  assert.equal(again.plotPlanted, 5000);
  const bad = normalise(
    {
      fish: ["koi", "koi", "kraken", 4],
      hoopsBest: 99,
      plotCrop: "money-tree",
      plotPlanted: 1,
      harvests: -3,
    },
    fresh(),
  );
  assert.deepEqual(bad.fish, ["koi"]);
  assert.equal(bad.hoopsBest, 10);
  assert.equal(bad.plotCrop, "");
  assert.equal(bad.harvests, 0);
  // Saves from before East Side existed load with empty progress.
  const old = normalise({ xp: 50, rounds: 3 }, fresh());
  assert.deepEqual(old.fish, []);
  assert.equal(old.hoopsBest, 0);
});
test("the East Side mission counts two different activities", () => {
  const s = fresh();
  assert.equal(missionProgress(s, "eastside"), 0);
  catchFish(s, "guppy");
  catchFish(s, "koi");
  assert.equal(missionProgress(s, "eastside"), 1);
  plantCrop(s, "chilli", 1);
  assert.equal(missionProgress(s, "eastside"), 2);
  scoreHoops(s, 3);
  assert.equal(missionProgress(s, "eastside"), 2);
  assert.equal(missionProgress(s, "round"), 0);
});
test("the server decides East Side rewards, on its own clock", () => {
  const directory = mkdtempSync(join(tmpdir(), "darecade-eastside-"));
  let time = Date.parse("2026-10-04T09:00:00+08:00");
  const store = new Store(":memory:", () => time),
    community = new Community(store, { directory });
  try {
    const { me } = community.join({
      month: 1,
      year: 2000,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    });
    const go = (event: string, value?: unknown) =>
      community.progression(me.id, event, value).progress;
    for (const place of ["fishing", "hoops", "plots"]) go("visit", place);
    assert.equal(go("visit", "plots").xp, 0);
    assert.throws(() => go("visit", "moon"), /Unknown place/);
    // Catches and baskets come only from a replayed round (tests/outdoor.test.ts).
    assert.throws(() => go("fish", "catfish"), /Unknown progression/);
    assert.throws(() => go("hoops", 5), /Unknown progression/);
    // A browser cannot grant itself XP through a settings change.
    assert.equal(
      community.patch(me.id, { xp: 9999, hoopsBest: 10, fish: ["koi"] })
        .progress.xp,
      0,
    );
    assert.equal(community.privateProfile(me.id).progress.hoopsBest, 0);
    assert.throws(() => go("harvest"), /not ready/);
    assert.throws(() => go("water"), /nothing to water/);
    assert.equal(go("plant", "chilli").plotCrop, "chilli");
    assert.throws(() => go("plant", "pandan"), /already growing/);
    time += 30 * 60000;
    assert.throws(() => go("harvest"), /not ready/);
    go("water");
    assert.throws(() => go("water"), /nothing to water/);
    time += 22 * 60000;
    assert.throws(() => go("harvest"), /not ready/);
    time += 60000;
    const done = go("harvest");
    assert.equal(done.xp, 10);
    assert.equal(done.harvests, 1);
    // The mission needs two activities; a catch arrives through a replayed round.
    assert.throws(() => go("claim", "eastside"), /not ready to claim/);
    const progress = community.privateProfile(me.id).progress;
    progress.fish = ["catfish"];
    store.db
      .prepare("UPDATE profiles SET progress=? WHERE player=?")
      .run(JSON.stringify(progress), me.id);
    assert.equal(go("claim", "eastside").xp, 40);
    assert.throws(() => go("claim", "eastside"), /not ready to claim/);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("the wider island is walkable to the east and closed beyond it", () => {
  assert.equal(blocked(19, 0, []), false);
  assert.equal(blocked(33, 0, []), false);
  assert.equal(blocked(33.5, 0, []), true);
  assert.equal(blocked(-19.5, 0, []), true);
  assert.equal(blocked(26, 14.5, []), true);
  // The longest walk, corner to corner, still finds a route.
  const path = route({ x: -19, z: -14 }, { x: 33, z: 14 }, []);
  assert.deepEqual(path.at(-1), { x: 33, z: 14 });
});
test("away fishing and hoops stand inside the new district", () => {
  for (const id of ["fish", "hoops"] as const) {
    assert.ok(activities[id].name);
    for (const t of [0, 1.3, 40]) {
      const pose = activityPose(id, t);
      assert.ok(pose.x > 20 && pose.x < 33, `${id} x ${pose.x}`);
      assert.ok(Math.abs(pose.z) < 14);
      assert.ok(Number.isFinite(pose.yaw + pose.y + pose.arms));
    }
  }
});
