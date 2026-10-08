import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { CommunityCore, PRIVACY_VERSION } from "../server/community-core.mjs";
import {
  Simulation,
  rulesVersion,
  type Input,
  type Replay,
} from "../shared/simulation.ts";
import { HoopsRound, FishingRound } from "../shared/outdoor.ts";
import { trackCurve } from "../shared/racing.ts";
import { fresh, normalise } from "../src/state.ts";

function play(game: "coast" | "hoops" | "fishing", seed: number) {
  const sim = new Simulation(game, seed),
    events: Replay["events"] = [];
  let previous = "",
    held = false;
  while (!sim.ended) {
    const input: Input = [0, 0, -1, 0, -1, -1];
    if (sim.race) {
      const r = sim.race;
      input[0] = Math.sign(
        trackCurve(r.distance) * r.speed * r.speed * 0.1 -
          r.offset * 2 -
          r.lateralSpeed * 0.5,
      );
      input[1] = 1;
    } else if (sim.outdoor instanceof HoopsRound) {
      const r = sim.outdoor;
      // Reproduce QA's two-basket +1 round XP, +10 personal-best XP result.
      input[3] = Number(
        r.made < 2 &&
          !held &&
          !r.flight &&
          Math.abs(r.marker - r.centre) < r.width * 0.14,
      );
    } else if (sim.outdoor instanceof FishingRound) {
      const r = sim.outdoor;
      input[3] = Number(
        r.state === "idle" || r.state === "bite"
          ? !held
          : r.state === "reeling" && !r.surging,
      );
    }
    held = !!input[3];
    const stamp = JSON.stringify(input);
    if (stamp !== previous) {
      events.push([sim.ticks, ...input]);
      previous = stamp;
    }
    sim.advance(input);
  }
  return {
    score: sim.score,
    replay: { version: rulesVersion(game), ticks: sim.ticks, events },
  };
}

test("receipts reconcile race, hoops and fishing including retries and database reopen", () => {
  const directory = mkdtempSync(join(tmpdir(), "simi-receipts-"));
  let now = Date.parse("2026-10-08T10:00:00+08:00");
  let store = new Store(join(directory, "qa.sqlite"), () => now);
  let community = new CommunityCore(store);
  try {
    const id = community.join({
      month: 1,
      year: 2000,
      consent: true,
      privacyVersion: PRIVACY_VERSION,
    }).me.id;
    for (const game of ["coast", "hoops", "fishing"] as const) {
      const before = community.privateProfile(id).progress.xp;
      const session = community.begin(id, game);
      const played = play(game, session.seed);
      now += (played.replay.ticks / 60) * 1000 + 1000;
      const payload = { id: session.id, ...played };
      const result = community.finish(id, payload);
      assert.equal(result.rewards.totalXp, result.profile.progress.xp - before);
      assert.equal(
        result.rewards.components.reduce(
          (sum: number, c: { xp: number }) => sum + c.xp,
          0,
        ),
        result.rewards.totalXp,
      );
      if (game === "coast") assert.equal(result.rewards.totalXp, 55);
      if (game === "hoops") {
        assert.equal(result.earnedXp, 1);
        assert.equal(result.rewards.totalXp, 11);
        assert.equal(result.profile.progress.xp, 66);
      }
      if (game === "fishing")
        assert.ok(
          result.rewards.components.some(
            (c: { kind: string }) => c.kind === "fish",
          ),
        );
      for (let retry = 0; retry < 3; retry++) {
        const again = community.finish(id, payload);
        assert.deepEqual(again.rewards, result.rewards);
        assert.equal(again.welcome, result.welcome);
        assert.equal(again.profile.progress.xp, result.profile.progress.xp);
      }
      store.close();
      store = new Store(join(directory, "qa.sqlite"), () => now);
      community = new CommunityCore(store);
      assert.deepEqual(community.finish(id, payload).rewards, result.rewards);
      assert.equal(
        community.privateProfile(id).progress.xp,
        result.rewards.xpAfter,
      );
      assert.throws(
        () => community.finish(id, { ...payload, score: played.score + 1 }),
        /different result/,
      );
    }
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("retiring the 2D preference preserves all other save fields", () => {
  const original = {
    ...fresh(),
    xp: 455,
    eye: 3,
    sound: false,
    music: false,
    reduced: true,
    cameraMode: "isometric",
    wardrobePurchased: ["solar"],
    rounds: 7,
  };
  const expected = normalise(original, fresh());
  for (const twoD of [true, false]) {
    const migrated = normalise({ ...original, twoD }, fresh());
    assert.deepEqual(migrated, expected);
    assert.equal("twoD" in migrated, false);
  }
});
