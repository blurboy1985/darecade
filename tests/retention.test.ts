import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  Simulation,
  rulesVersion,
  type Input,
  type Replay,
} from "../shared/simulation.ts";
import {
  FIRST_GHOST_TICKS,
  RACE_TICKS,
  raceScore,
  raceTime,
  trackCurve,
} from "../shared/racing.ts";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import { ghostGap } from "../src/race-results.ts";
import {
  dareCard,
  dareGate,
  dareInvite,
  dareResults,
  dareTargets,
  neighbourBlock,
} from "../src/dares.ts";

const DAY = 86400000;
const consent = {
  month: 1,
  year: 2000,
  consent: true,
  privacyVersion: PRIVACY_VERSION,
};
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "darecade-retention-"));
  let time = Date.parse("2026-10-05T09:00:00+08:00");
  const store = new Store(":memory:", () => time),
    community = new Community(store, { directory });
  /** Plays a whole round for a guest and lets the clock run for its length. */
  const round = (
    id: string,
    game: string,
    style: "clean" | "idle" | "brake" = "clean",
    target: string | null = null,
  ) => {
    const session = community.begin(id, game, target);
    const sim = new Simulation(game, session.seed),
      events: Replay["events"] = [];
    let previous = "";
    while (!sim.ended) {
      const r = sim.race;
      const input: Input = r
        ? [
            style === "brake"
              ? 0
              : Math.sign(
                  trackCurve(r.distance) * r.speed * r.speed * 0.1 -
                    r.offset * 2 -
                    r.lateralSpeed * 0.5,
                ),
            style === "brake"
              ? -1
              : style === "idle" && sim.ticks % 180 > 120
                ? 0
                : 1,
            -1,
            0,
            -1,
            -1,
          ]
        : [0, 0, -1, 0, -1, -1];
      const stamp = JSON.stringify(input);
      if (stamp !== previous) {
        events.push([sim.ticks, ...input]);
        previous = stamp;
      }
      sim.advance(input);
    }
    time += (sim.ticks * 1000) / 60 + 1000;
    const result = community.finish(id, {
      id: session.id,
      score: sim.score,
      replay: { version: rulesVersion(game), ticks: sim.ticks, events },
    });
    return { session, result, ticks: sim.ticks, score: sim.score };
  };
  return {
    community,
    round,
    guest: () => community.join(consent).me.id as string,
    tick: (ms: number) => (time += ms),
    close: () => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

test("the first Coast Rush has a beatable ghost; afterwards it is the previous finish, through missed days and a DNF", () => {
  const s = setup();
  try {
    const id = s.guest();
    const first = s.round(id, "coast", "clean");
    assert.deepEqual(first.session.ghost, {
      ticks: FIRST_GHOST_TICKS,
      own: false,
    });
    assert.ok(FIRST_GHOST_TICKS < RACE_TICKS, "the ghost finishes in time");
    assert.ok(first.score > 0 && first.ticks < FIRST_GHOST_TICKS);
    assert.equal(s.community.begin(id, "noodle").ghost, undefined);

    // Three days away: no streak to lose, and the ghost is still that finish.
    s.tick(3 * DAY);
    const dnf = s.round(id, "coast", "brake");
    assert.deepEqual(dnf.session.ghost, { ticks: first.ticks, own: true });
    assert.equal(dnf.score, 0);

    // An unfinished race is not a finish time, so the ghost stays.
    const slow = s.round(id, "coast", "idle");
    assert.deepEqual(slow.session.ghost, { ticks: first.ticks, own: true });
    assert.ok(slow.ticks > first.ticks);

    // The ghost is the previous finish, even a slower one; the best is kept.
    s.tick(DAY);
    assert.deepEqual(s.community.begin(id, "coast").ghost, {
      ticks: slow.ticks,
      own: true,
    });
    const progress = s.community.privateProfile(id).progress;
    assert.equal(progress.coastRecord.timeTicks, first.ticks);
    assert.equal(progress.best.coast, first.score);
    assert.equal("streak" in progress, false);
  } finally {
    s.close();
  }
});

test("the result names the gap to the ghost and the next ghost", () => {
  const neighbourhood = { ticks: FIRST_GHOST_TICKS, own: false };
  const ahead = ghostGap(raceScore(FIRST_GHOST_TICKS - 90), neighbourhood);
  assert.match(ahead, /1\.50s ahead of the neighbourhood ghost/);
  assert.match(ahead, /Neighbourhood ghost · 1:45\.00/);
  assert.match(ahead, /your ghost is this race: 1:43\.50/);
  const own = { ticks: 4200, own: true };
  assert.match(
    ghostGap(raceScore(4320), own),
    /2\.00s behind your last finish/,
  );
  assert.match(ghostGap(raceScore(4320), own), /Your last finish · 1:10\.00/);
  assert.match(ghostGap(raceScore(4200), own), /Level with your last finish/);
  assert.match(ghostGap(0, own), /No finish\. Your last finish stays/);
  assert.match(ghostGap(0, neighbourhood), /waits for your next race/);
  assert.equal(raceTime(FIRST_GHOST_TICKS), "1:45.00");
});

test("a guest's first round opens one dare that day; the result is on the board the next day", () => {
  const s = setup();
  try {
    const host = s.guest(),
      other = s.guest(),
      player = s.guest();
    s.round(host, "noodle");
    s.round(other, "noodle");

    // Before a first round: no dare, and the state says so.
    assert.throws(
      () => s.community.begin(player, "noodle", host),
      /Finish one round/,
    );
    assert.equal(s.community.state(player).competitionReady, false);

    // Day 1: one round, then one dare, with no email and no waiting.
    s.round(player, "noodle");
    let state = s.community.state(player);
    assert.equal(state.competitionReady, true);
    assert.equal(dareGate(state, true).open, true);
    assert.match(dareInvite(state, true), /Play today’s dare/);
    const dare = s.round(player, "noodle", "clean", host);
    assert.equal(dare.session.target, host);
    assert.throws(
      () => s.community.begin(player, "noodle", other),
      /today’s dare/,
    );
    state = s.community.state(player);
    assert.equal(state.self.outgoing, 1);
    assert.equal(dareGate(state, true).open, false);
    assert.equal(dareInvite(state, true), "");

    // Day 2: both sides see yesterday's result, and a new dare is open.
    s.tick(DAY);
    state = s.community.state(player);
    assert.equal(state.history[0].day, "2026-10-05");
    assert.match(dareResults(state), /You drew with .* · 5 Oct/);
    assert.match(dareCard(state, true, true), /One dare today/);
    assert.match(dareCard(state, true, true), /Play today’s dare/);
    assert.match(
      dareResults(s.community.state(host)),
      /dared you and drew.* · 5 Oct/,
    );
    assert.ok(s.community.begin(player, "noodle", other).id);
  } finally {
    s.close();
  }
});

test("posting is one round a day with no waiting period", () => {
  const s = setup();
  try {
    const id = s.guest();
    const a = s.round(id, "noodle"),
      b = s.round(id, "noodle");
    assert.ok(a.score > 0);
    assert.ok(s.community.postDare(id, a.session.id).id);
    assert.throws(
      () => s.community.postDare(id, b.session.id),
      /posted today’s dare/,
    );
    s.tick(DAY);
    assert.ok(s.community.postDare(id, b.session.id).id);
  } finally {
    s.close();
  }
});

test("a way into a dare is offered only when Play dare would start one", () => {
  const best = { noodle: 40, brick: 0, hop: 0, swarm: 0, coast: 0 };
  const neighbour = (id: string, status: string, scores = best) =>
    ({ id, name: id, status, best: scores }) as never;
  const base = {
    competitionReady: true,
    me: "me",
    day: "2026-10-05",
    self: { outgoing: 0 } as never,
    players: [neighbour("resting", "resting"), neighbour("online", "online")],
    dares: [],
    challenged: [],
    history: [],
  };
  assert.equal(neighbourBlock(base, base.players[0]), "");
  assert.match(neighbourBlock(base, base.players[1]), /Online now/);
  assert.match(
    neighbourBlock(base, neighbour("new", "offline", { ...best, noodle: 0 })),
    /No saved score/,
  );
  assert.equal(dareTargets(base).neighbours.length, 1);
  assert.match(dareInvite(base, true), /data-open="dares"/);
  for (const [state, connected, note] of [
    [base, false, /Offline/],
    [{ ...base, competitionReady: false }, true, /Finish one round/],
    [{ ...base, self: { outgoing: 1 } as never }, true, /midnight SGT/],
    [{ ...base, players: [base.players[1]] }, true, /One dare today/],
  ] as const) {
    assert.equal(dareInvite(state, connected), "");
    assert.match(dareCard(state, connected, true), note);
    assert.doesNotMatch(dareCard(state, connected, true), /<button/);
  }
  // A dare posted by someone else is a target even with no resting neighbour.
  const posted = {
    ...base,
    players: [],
    dares: [
      { id: "d", host: "h", name: "H", game: "hop", score: 9, expires: 1 },
    ],
  } as never;
  assert.match(dareInvite(posted, true), /Play today’s dare/);
});
