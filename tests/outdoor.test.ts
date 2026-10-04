import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Simulation,
  replayRun,
  rulesVersion,
  type Input,
  type Replay,
} from "../shared/simulation.ts";
import {
  FishingRound,
  HoopsRound,
  fishStats,
  FISHING_TICKS,
  HOOPS_FLIGHT_TICKS,
  HOOPS_SHOT_TICKS,
} from "../shared/outdoor.ts";
import { fishSpecies, HOOPS_SHOTS } from "../src/state.ts";
import { gameIds, outdoorIds, playIds } from "../src/catalog.ts";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";

type Skill = "sharp" | "sloppy" | "idle";
/** Plays a round the way a person would: from what is on screen, never the seed. */
export function play(game: "hoops" | "fishing", seed: number, skill: Skill) {
  const sim = new Simulation(game, seed),
    events: Replay["events"] = [];
  let previous = "",
    down = false;
  while (!sim.ended) {
    const round = sim.outdoor!;
    let press = false;
    if (skill !== "idle" && round instanceof HoopsRound) {
      const off = Math.abs(round.marker - round.centre);
      // Sharp waits for the swish band; sloppy shoots anywhere in the green.
      press =
        !down &&
        !round.flight &&
        off <= round.width * (skill === "sharp" ? 0.14 : 0.6);
    } else if (skill !== "idle" && round instanceof FishingRound) {
      if (round.state === "idle" || round.state === "bite") press = !down;
      else if (round.state === "reeling")
        press = skill === "sharp" ? !round.surging : true;
    }
    down = press;
    const input: Input = [0, 0, -1, Number(press), -1, -1];
    const stamp = JSON.stringify(input);
    if (stamp !== previous) {
      events.push([sim.ticks, ...input]);
      previous = stamp;
    }
    sim.advance(input);
  }
  return {
    score: sim.score,
    round: sim.outdoor!,
    replay: { version: rulesVersion(game), ticks: sim.ticks, events },
  };
}

test("hoops and fishing are replayed rounds but not cabinets", () => {
  assert.deepEqual([...outdoorIds], ["hoops", "fishing"]);
  assert.equal(gameIds.length, 5);
  assert.equal(playIds.length, 7);
  for (const id of outdoorIds)
    assert.equal(gameIds.includes(id as never), false);
  for (const game of outdoorIds) {
    const a = play(game, 77, "sharp");
    assert.deepEqual(a, play(game, 77, "sharp"));
    assert.deepEqual(replayRun(game, 77, a.replay), {
      score: a.score,
      ticks: a.replay.ticks,
      outdoor: a.round.result(),
    });
    assert.ok(a.replay.ticks <= 3600);
    assert.throws(
      () => replayRun(game, 77, { ...a.replay, ticks: a.replay.ticks - 1 }),
      /Finish|Invalid/,
    );
    // The seed changes the round, so a replay cannot be reused on another one.
    assert.notDeepEqual(replayRun(game, 78, play(game, 78, "sharp").replay), {
      score: a.score,
      ticks: a.replay.ticks,
      outdoor: a.round.result(),
    });
  }
});

test("hoops rewards timing: swishes and streaks outscore loose shots, and the shot clock counts a miss", () => {
  let sharp = 0,
    sloppy = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const a = play("hoops", seed, "sharp"),
      b = play("hoops", seed, "sloppy");
    sharp += a.score;
    sloppy += b.score;
    const round = a.round as HoopsRound;
    assert.equal(round.shot, HOOPS_SHOTS);
    assert.ok(round.made <= HOOPS_SHOTS);
    assert.ok(a.score <= 3 + 4 + 5 + 6 * 7, "at most a streak of ten swishes");
  }
  assert.ok(sharp > sloppy * 1.5, `${sharp} against ${sloppy}`);
  const idle = play("hoops", 5, "idle");
  assert.equal(idle.score, 0);
  assert.equal((idle.round as HoopsRound).made, 0);
  assert.equal(
    idle.replay.ticks,
    HOOPS_SHOTS * (HOOPS_SHOT_TICKS + HOOPS_FLIGHT_TICKS),
  );
  // The green narrows every shot and slides from the fourth.
  const round = new HoopsRound(9);
  const widths: number[] = [];
  let moved = false;
  while (!round.ended) {
    if (!round.flight && round.clock === HOOPS_SHOT_TICKS) {
      widths.push(round.width);
      const centre = round.centre;
      round.advance(false);
      if (round.shot >= 3) moved ||= round.centre !== centre;
      else assert.equal(round.centre, centre);
    } else round.advance(false);
  }
  assert.equal(widths.length, HOOPS_SHOTS);
  assert.ok(widths.every((w, i) => !i || w <= widths[i - 1]));
  assert.ok(widths[9] < widths[0] / 2);
  assert.ok(moved);
  // Holding the button down shoots once, not every tick.
  const held = new HoopsRound(9);
  for (let i = 0; i < 100; i++) held.advance(true);
  assert.equal(held.shot, 1);
});

test("fishing rewards easing off during a surge; reeling early, late or flat out loses the fish", () => {
  let sharp = 0,
    sloppy = 0;
  const seen = new Set<string>();
  for (let seed = 1; seed <= 40; seed++) {
    const a = play("fishing", seed, "sharp"),
      b = play("fishing", seed, "sloppy");
    sharp += a.score;
    sloppy += b.score;
    assert.equal(a.replay.ticks, FISHING_TICKS);
    const round = a.round as FishingRound;
    round.catches.forEach((id) => seen.add(id));
    assert.equal(
      a.score,
      round.catches.reduce(
        (n, id) => n + fishStats[id as keyof typeof fishStats].points,
        0,
      ),
    );
  }
  assert.ok(sharp > sloppy * 1.3, `${sharp} against ${sloppy}`);
  assert.ok(seen.size >= 5, `caught ${[...seen]}`);
  assert.deepEqual(
    Object.keys(fishStats).sort(),
    fishSpecies.map((f) => f.id).sort(),
  );
  assert.equal(play("fishing", 3, "idle").score, 0);

  const early = new FishingRound(1);
  early.advance(true);
  early.advance(false);
  early.advance(true);
  assert.equal(early.loss, "early");
  const late = new FishingRound(1);
  late.advance(true);
  while (late.state !== "lost") late.advance(false);
  assert.equal(late.loss, "missed");
  // The fiercest fish snaps the line if it is reeled through its surges.
  const snap = new FishingRound(1);
  snap.state = "reeling";
  snap.fish = fishSpecies.find((f) => f.id === "koi")!;
  snap.progress = 0.2;
  snap.advance(true);
  while (snap.state === "reeling") snap.advance(true);
  assert.equal(snap.loss, "snapped");
  assert.equal(snap.catches.length, 0);
});

test("outdoor rounds can be dared, pay album and hoops XP from the replay, and never reach medal boards", () => {
  const directory = mkdtempSync(join(tmpdir(), "darecade-outdoor-"));
  let now = Date.parse("2026-10-06T10:00:00+08:00");
  const store = new Store(":memory:", () => now),
    community = new Community(store, { directory });
  try {
    const [host, ...guests] = [0, 1, 2].map((i) => {
      const id = community.join({
        year: 2000,
        month: 1,
        consent: true,
        privacyVersion: PRIVACY_VERSION,
      }).me.id;
      store.db
        .prepare("INSERT INTO accounts VALUES(?,?,?)")
        .run(id, `outdoor${i}@example.test`, now - 172800000);
      return id;
    });
    const submit = (
      id: string,
      game: "hoops" | "fishing",
      skill: Skill,
      target: string | null = null,
    ) => {
      const session = community.begin(id, game, target);
      const run = play(game, session.seed, skill);
      now += (run.replay.ticks * 1000) / 60 + 1000;
      assert.throws(
        () =>
          community.finish(id, {
            id: session.id,
            score: run.score + 5,
            replay: run.replay,
          }),
        /does not match/,
      );
      return {
        run,
        session,
        result: community.finish(id, {
          id: session.id,
          score: run.score,
          replay: run.replay,
        }),
      };
    };
    const hoops = submit(host, "hoops", "sharp");
    const made = (hoops.run.round as HoopsRound).made;
    assert.ok(made > 0);
    assert.equal(hoops.result.profile.progress.hoopsBest, made);
    assert.equal(hoops.result.profile.progress.best.hoops, hoops.run.score);
    const fishing = submit(host, "fishing", "sharp");
    const species = new Set((fishing.run.round as FishingRound).catches);
    assert.ok(species.size > 0);
    assert.deepEqual(
      [...fishing.result.profile.progress.fish].sort(),
      [...species].sort(),
    );
    // Round XP, the welcome bonus, five a basket and ten a new species.
    assert.equal(
      fishing.result.profile.progress.xp,
      20 + 20 + 35 + made * 5 + species.size * 10,
    );
    assert.throws(
      () => community.progression(host, "fish", "koi"),
      /Unknown progression/,
    );
    assert.throws(
      () => community.progression(host, "hoops", 10),
      /Unknown progression/,
    );
    const state = community.state(host);
    assert.deepEqual(Object.keys(state.boards).sort(), [...gameIds].sort());
    // A neighbour's best becomes the target, on the same seed.
    for (const [i, game] of outdoorIds.entries()) {
      // One finished round opens the daily dare.
      submit(guests[i], game, "idle");
      const dare = submit(guests[i], game, "idle", host);
      assert.equal(
        dare.session.seed,
        (game === "hoops" ? hoops : fishing).session.seed,
      );
      assert.equal(
        dare.session.targetScore,
        (game === "hoops" ? hoops : fishing).run.score,
      );
      assert.equal(dare.result.won, false);
    }
    const posted = community.postDare(host, hoops.session.id);
    assert.ok(posted);
    now = Date.parse("2026-10-07T00:10:00+08:00");
    const settled = community.state(host);
    assert.equal(settled.weekly.length, 0, "no medals from outdoor rounds");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
