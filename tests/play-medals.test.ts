import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import {
  Simulation,
  rulesVersion,
  type Input,
  type Replay,
} from "../shared/simulation.ts";
import { HoopsRound } from "../shared/outdoor.ts";
import { styleTokens } from "../src/collections.ts";

function fixture() {
  let now = Date.parse("2026-10-05T12:00:00+08:00");
  const directory = mkdtempSync(join(tmpdir(), "simi-play-medals-"));
  const store = new Store(join(directory, "local.sqlite"), () => now);
  const community = new Community(store, { directory });
  const guest = community.join({
    month: 1,
    year: 2000,
    consent: true,
    privacyVersion: PRIVACY_VERSION,
  });
  return {
    store,
    community,
    directory,
    id: guest.me.id,
    tick: (ms: number) => (now += ms),
    close: () => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
function completed(game: string, seed: number) {
  const sim = new Simulation(game, seed);
  const events: Replay["events"] = [];
  let previous = "";
  while (!sim.ended) {
    const input: Input = [0, 0, -1, 0, -1, -1];
    if (game === "brick") input[4] = Math.round(sim.ball.x);
    if (game === "swarm") input[0] = Math.floor(sim.ticks / 120) % 2 ? 1 : -1;
    if (sim.outdoor instanceof HoopsRound) {
      const r = sim.outdoor;
      input[3] =
        !r.flight && Math.abs(r.marker - r.centre) < r.width * 0.1 ? 1 : 0;
    }
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
function finish(s: ReturnType<typeof fixture>, game: string) {
  const run = s.community.begin(s.id, game);
  const data = { id: run.id, ...completed(game, run.seed) };
  s.tick((data.replay.ticks / 60) * 1000 + 1000);
  return { data, result: s.community.finish(s.id, data) };
}

test("Play medals validate finishes, cap three distinct games per SGT day and preserve ranked/token ledgers", () => {
  const s = fixture();
  try {
    s.community.progression(s.id, "gift", 0);
    const first = finish(s, "swarm");
    assert.equal(first.result.playMedal, 1);
    assert.equal(s.community.finish(s.id, first.data).playMedal, 1);
    assert.equal(s.community.privateProfile(s.id).playMedals.total, 1);
    assert.throws(
      () =>
        s.community.finish(s.id, {
          ...first.data,
          score: first.data.score + 1,
        }),
      /different result/,
    );
    assert.equal(finish(s, "swarm").result.playMedal, 0);
    assert.equal(finish(s, "brick").result.playMedal, 1);
    assert.equal(finish(s, "hoops").result.playMedal, 1);
    const progress = s.community.privateProfile(s.id).playMedals;
    assert.equal(progress.today, 3);
    assert.equal(progress.total, 3);
    assert.equal(progress.limit, 3);
    assert.equal(
      s.community.playMedals.award(
        s.id,
        "not-a-run",
        "noodle",
        Date.parse("2026-10-05T13:00:00+08:00"),
        true,
      ),
      0,
    );
    s.community.patch(s.id, {
      playMedals: { total: 999 },
      progress: { playMedals: 999, medalTokens: 999 },
    });
    const p = s.community.privateProfile(s.id);
    assert.equal(p.playMedals.total, 3);
    assert.equal(p.progress.medalTokens, 0);
    assert.equal(p.progress.unlockedHats.includes(2), false);
    assert.equal(
      styleTokens(p.progress),
      Math.floor(p.progress.xp / 100) - p.progress.wardrobeSpent,
    );
    s.store.settle();
    assert.equal(
      s.store.db.prepare("SELECT COUNT(*) n FROM medals").get().n,
      0,
    );
    assert.equal(
      s.store.db.prepare("SELECT COUNT(*) n FROM medal_rewards").get().n,
      0,
    );
    s.tick(86400000);
    assert.equal(finish(s, "swarm").result.playMedal, 1);
    const restarted = new Community(s.store, { directory: s.directory });
    assert.deepEqual(restarted.privateProfile(s.id).playMedals, {
      day: "2026-10-06",
      today: 1,
      total: 4,
      games: ["swarm"],
      limit: 3,
    });
    assert.equal(restarted.export(s.id).playMedals.length, 4);
    restarted.delete(s.id);
    assert.equal(
      s.store.db.prepare("SELECT COUNT(*) n FROM play_medals").get().n,
      0,
    );
  } finally {
    s.close();
  }
});

test("forged, fast, unfinished and abandoned rounds cannot award; finish and award roll back together", () => {
  const s = fixture();
  try {
    const run = s.community.begin(s.id, "swarm");
    const data = { id: run.id, ...completed("swarm", run.seed) };
    assert.throws(() => s.community.finish(s.id, data), /faster/);
    s.tick(121000);
    assert.throws(
      () => s.community.finish(s.id, { ...data, score: data.score + 1 }),
      /does not match/,
    );
    assert.throws(
      () =>
        s.community.finish(s.id, {
          ...data,
          replay: { ...data.replay, ticks: 1, events: [] },
        }),
      /Finish/,
    );
    const save = s.community.save.bind(s.community);
    s.community.save = () => {
      throw Error("synthetic persistence failure");
    };
    assert.throws(
      () => s.community.finish(s.id, data),
      /synthetic persistence/,
    );
    assert.equal(s.community.privateProfile(s.id).playMedals.total, 0);
    assert.equal(
      s.store.db.prepare("SELECT status FROM runs WHERE id=?").get(run.id)
        .status,
      "started",
    );
    s.community.save = save;
    assert.equal(s.community.finish(s.id, data).playMedal, 1);
    const abandoned = s.community.begin(s.id, "brick");
    s.store.abandon(s.id, abandoned.id);
    assert.throws(
      () =>
        s.community.finish(s.id, {
          id: abandoned.id,
          ...completed("brick", abandoned.seed),
        }),
      /expired/,
    );
    assert.equal(s.community.privateProfile(s.id).playMedals.total, 1);
  } finally {
    s.close();
  }
});

test("linking a synthetic email retains the guest identity and Play medals without changing ranked rounds", async () => {
  const s = fixture();
  try {
    finish(s, "swarm");
    const before = s.community.privateProfile(s.id);
    await s.community.requestCode(s.id, "play-medal-fixture@example.test");
    const email = readdirSync(join(s.directory, "mail-outbox"))
      .map((n) =>
        JSON.parse(readFileSync(join(s.directory, "mail-outbox", n), "utf8")),
      )
      .find((m) => m.code);
    assert.ok(email?.code);
    const linked = s.community.verifyCode(
      "play-medal-fixture@example.test",
      email.code,
    ).me;
    assert.equal(linked.id, s.id);
    assert.deepEqual(linked.playMedals, before.playMedals);
    assert.deepEqual(linked.progress, before.progress);
    assert.equal(s.community.state(s.id).self.points, 0);
    assert.equal(
      s.store.db.prepare("SELECT eligible FROM runs WHERE player=?").get(s.id)
        .eligible,
      1,
    );
    assert.equal(finish(s, "swarm").result.playMedal, 0);
    assert.equal(finish(s, "hoops").result.playMedal, 1);
  } finally {
    s.close();
  }
});
