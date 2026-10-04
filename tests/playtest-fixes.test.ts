import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import {
  Simulation,
  replayRun,
  rulesVersion,
  type Input,
  type Replay,
} from "../shared/simulation.ts";
import { endReasonText, holdsForFirstMove } from "../src/catalog.ts";
import { dareBlock, dareHoldCopy, standingNote } from "../src/lobby-menu.ts";
import { visitsOnWalk } from "../src/navigation.ts";
import {
  IDLE_PAUSE_TICKS,
  edgeAssist,
  idleTicks,
  latchThrottle,
} from "../src/race-assist.ts";
import { claimGift, fresh } from "../src/state.ts";
import { hatShelf } from "../src/wardrobe.ts";

// One test per bug from the 4 October 2026 playtest of the live site.
const DAY = 86400000;
const consent = {
  month: 1,
  year: 2000,
  consent: true,
  privacyVersion: PRIVACY_VERSION,
};
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "darecade-playtest-"));
  // A Tuesday, so the next day is still inside the same ranking week.
  let time = Date.parse("2026-10-06T10:00:00+08:00");
  const store = new Store(":memory:", () => time),
    community = new Community(store, { directory });
  return {
    store,
    community,
    directory,
    tick: (ms: number) => (time += ms),
    close: () => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
type Setup = ReturnType<typeof setup>;
function emailedCode(s: Setup, email: string): string {
  return readdirSync(join(s.directory, "mail-outbox"))
    .map((n) =>
      JSON.parse(readFileSync(join(s.directory, "mail-outbox", n), "utf8")),
    )
    .find((m) => m.to === email && m.code).code;
}
async function register(s: Setup, email: string) {
  const guest = s.community.join(consent);
  await s.community.requestCode(guest.me.id, email);
  return s.community.verifyCode(email, emailedCode(s, email));
}
/** Plays a round from a per-tick input rule and records it as the browser does. */
function play(game: string, seed: number, rule: (sim: Simulation) => Input) {
  const sim = new Simulation(game, seed),
    events: Replay["events"] = [];
  let previous = "";
  while (!sim.ended) {
    const input = rule(sim);
    const stamp = JSON.stringify(input);
    if (stamp !== previous) {
      events.push([sim.ticks, ...input]);
      previous = stamp;
    }
    sim.advance(input);
  }
  return {
    sim,
    score: sim.score,
    replay: { version: rulesVersion(game), ticks: sim.ticks, events },
  };
}
const still: Input = [0, 0, -1, 0, -1, -1];
function finish(s: Setup, player: string, game: string, jump: boolean) {
  const run = s.community.begin(player, game);
  const round = play(game, run.seed, (sim) =>
    jump && sim.ticks % 60 === 0 ? [0, 0, -1, 1, -1, -1] : still,
  );
  s.tick(61000);
  s.community.finish(player, {
    id: run.id,
    score: round.score,
    replay: round.replay,
  });
  return { id: run.id, score: round.score };
}

test("1. a locked account is given the real time its dares open, and they open then", async () => {
  const s = setup();
  try {
    const host = await register(s, "host@example.test"),
      me = await register(s, "me@example.test");
    finish(s, host.me.id, "noodle", false);
    const state = s.community.state(me.me.id);
    assert.equal(state.competitionReady, false);
    assert.equal(
      state.profile.account.eligibleAt,
      state.profile.account.created + DAY,
    );
    const opens = /Your challenges open Wed, 7 Oct, 10:00 SGT, 24 hours after/;
    assert.throws(
      () => s.community.begin(me.me.id, "noodle", host.me.id),
      opens,
    );
    assert.throws(() => s.community.postDare(me.me.id, "none"), opens);
    // A guest is told to save first, not given a time that does not exist.
    const guest = s.community.join(consent);
    assert.throws(
      () => s.community.begin(guest.me.id, "noodle", host.me.id),
      /Save with email to challenge/,
    );
    s.tick(DAY);
    assert.equal(s.community.state(me.me.id).competitionReady, true);
    const dare = s.community.begin(me.me.id, "noodle", host.me.id);
    assert.ok(dare.targetScore > 0, "a verified account can play a dare now");
  } finally {
    s.close();
  }
});

test("1. the dare screen copy names the opening time and each reason a button is off", () => {
  const opens = Date.parse("2026-10-05T14:30:00+08:00");
  assert.equal(dareHoldCopy(true, { eligibleAt: opens }), "");
  assert.match(
    dareHoldCopy(false, { eligibleAt: opens }),
    /^Your challenges open Mon, 5 Oct, 14:30 SGT, 24 hours after your email was verified\./,
  );
  assert.match(dareHoldCopy(false, null), /Save with email/);
  const open = { connected: true, left: 3 };
  assert.equal(dareBlock(open), "");
  assert.match(dareBlock({ ...open, connected: false }), /connection/);
  assert.match(dareBlock({ ...open, left: 0 }), /No challenges left today/);
  assert.match(dareBlock({ ...open, own: true }), /your own challenge/);
  assert.match(dareBlock({ ...open, challenged: true }), /already challenged/);
  assert.match(dareBlock({ ...open, online: true }), /online now/);
  assert.match(dareBlock({ ...open, noScore: true }), /no saved score/);
});

test("2. today's board keeps a player's best score; a lower replay is saved but does not replace it", async () => {
  const s = setup();
  try {
    const a = await register(s, "ranked@example.test");
    const jumped = finish(s, a.me.id, "hop", true),
      walked = finish(s, a.me.id, "hop", false);
    assert.ok(jumped.score > 0 && walked.score > 0);
    assert.notEqual(jumped.score, walked.score);
    const best = Math.max(jumped.score, walked.score);
    const state = s.community.state(a.me.id);
    assert.deepEqual(
      state.boards.hop.map((p) => [p.id, p.score, p.rank]),
      [[a.me.id, best, 1]],
      "the finished ranked round is on today's board at once",
    );
    assert.equal(state.recentRuns[0].id, walked.id, "the latest round is kept");
    // Weekly ranks are medals, which are only awarded at midnight.
    assert.deepEqual(state.weekly, []);
    s.tick(DAY);
    assert.deepEqual(
      s.community.state(a.me.id).weekly.map((p) => [p.id, p.points, p.rank]),
      [[a.me.id, 3, 1]],
    );
  } finally {
    s.close();
  }
});

test("2. the result says which score holds the rank it shows", () => {
  const first = { rank: 1, score: 93 };
  assert.equal(
    standingNote(true, first, 93, "93"),
    "This round is your best today · +3 medals at midnight",
  );
  assert.equal(
    standingNote(true, first, 40, "93"),
    "Your best today, 93, holds this rank · +3 medals at midnight",
  );
  assert.equal(
    standingNote(true, { rank: 5, score: 40 }, 40, "40"),
    "This round is your best today",
  );
  assert.equal(
    standingNote(true, undefined, 0, "0"),
    "Score above 0 to join the board",
  );
  assert.equal(standingNote(false, undefined, 40, "0"), "");
});

test("3. a round that ends early records why, and the score is unchanged", () => {
  // Noodle Run: left alone, the noodle eats one dumpling and reaches the wall.
  const noodle = play("noodle", 7, () => still);
  assert.equal(noodle.sim.endReason, "wall");
  assert.ok(noodle.sim.elapsed < 3, "a wall is 2.2 seconds from the start");
  assert.equal(noodle.score, 20);
  assert.equal(replayRun("noodle", 7, noodle.replay).score, 20);
  assert.match(
    endReasonText("noodle", "wall", noodle.sim.elapsed),
    /^Your noodle hit the wall after 2s\./,
  );
  // A noodle that keeps turning lasts; the round is not on a hidden timer.
  const circling = play("noodle", 7, (sim) => [
    0,
    0,
    [0, 3, 2, 1][Math.floor(sim.ticks / 40) % 4],
    0,
    -1,
    -1,
  ]);
  assert.ok(circling.sim.elapsed > noodle.sim.elapsed * 3);
  // Hop Hop: the first hazard depends on the seed, and each is named.
  const reasons = new Set<string>();
  for (const seed of [0, 1, 2]) {
    const hop = play("hop", seed, () => still);
    assert.ok(["crate", "gap"].includes(hop.sim.endReason), hop.sim.endReason);
    assert.ok(hop.sim.elapsed < 10);
    assert.equal(replayRun("hop", seed, hop.replay).score, hop.score);
    assert.match(
      endReasonText("hop", hop.sim.endReason, hop.sim.elapsed),
      hop.sim.endReason === "crate" ? /ran into a crate/ : /fell into a gap/,
    );
    reasons.add(hop.sim.endReason);
  }
  assert.deepEqual([...reasons].sort(), ["crate", "gap"]);
  assert.equal(play("brick", 3, () => still).sim.endReason, "lives");
  assert.match(endReasonText("hop", "time", 60), /full 60 seconds/);
  assert.equal(endReasonText("noodle", "", 4), "");
});

test("4. a tap on GO keeps the kart driving, BRAKE lets go, and a parked kart stops the clock", () => {
  assert.equal(latchThrottle(false, "gas"), true, "a tap is enough");
  for (const control of ["left", "right", "drift", "item"])
    assert.equal(latchThrottle(true, control), true, control);
  assert.equal(latchThrottle(false, "item"), false);
  assert.equal(latchThrottle(true, "brake"), false);
  let idle = 0;
  for (let tick = 0; tick < IDLE_PAUSE_TICKS; tick++)
    idle = idleTicks(idle, 0, 0);
  assert.equal(idle, IDLE_PAUSE_TICKS, "five seconds parked");
  assert.equal(
    idleTicks(idle, 1, 0),
    0,
    "throttle is not idling, even when stopped",
  );
  assert.equal(idleTicks(idle, 0, 5), 0, "coasting is not parked");
  // Without the pause, rivals lapping a parked kart hit it until time runs out.
  const parked = play("coast", 11, () => still);
  assert.equal(parked.score, 0);
  assert.ok(parked.sim.race!.bumps > 3);
});

test("4. a driver with no finish completes three laps on GO alone, and the server accepts the race", () => {
  const drive = (assist: boolean) => {
    let steer = 0;
    return play("coast", 11, (sim) => {
      if (assist) steer = edgeAssist(sim.race!.offset, 0, steer);
      return [steer, 1, 0, 0, -1, -1];
    });
  };
  const alone = drive(false);
  assert.equal(alone.score, 0, "GO with no steering used to end as No finish");
  const helped = drive(true);
  assert.ok(helped.score > 0, "three laps inside the two-minute limit");
  assert.equal(helped.sim.race!.result().finished, true);
  const checked = replayRun("coast", 11, helped.replay);
  assert.equal(checked.score, helped.score);
  assert.equal(checked.race!.finished, true);
  // The driver's own steering always wins, even towards the edge.
  assert.equal(edgeAssist(5.5, 1, -1), 0);
  assert.equal(edgeAssist(5.5, 0, 0), -1);
  assert.equal(edgeAssist(-5.5, 0, 0), 1);
  assert.equal(edgeAssist(3, 0, -1), -1, "keeps correcting until well clear");
  assert.equal(edgeAssist(1, 0, -1), 0);
});

test("5. saving a guest to an email that already has a character never swaps the character", async () => {
  const s = setup();
  try {
    const email = "daniel@example.test";
    const first = s.community.join(consent);
    s.community.patch(first.me.id, { name: "Daniel" });
    await s.community.requestCode(first.me.id, email);
    const owner = s.community.verifyCode(email, emailedCode(s, email));
    assert.equal(owner.me.id, first.me.id, "a new email keeps the character");
    assert.equal(owner.me.name, "Daniel");

    const guest = s.community.join(consent);
    await s.community.requestCode(guest.me.id, email);
    const code = emailedCode(s, email);
    assert.deepEqual(s.community.verifyCode(email, code), {
      conflict: { name: "Daniel" },
    });
    const kept = s.community.privateProfile(guest.me.id);
    assert.equal(kept.account, null);
    assert.equal(kept.name, guest.me.name);
    assert.equal(
      s.community.lookup(guest.token),
      guest.me.id,
      "still signed in",
    );
    assert.equal(
      s.store.db.prepare("SELECT player FROM accounts WHERE email=?").get(email)
        .player,
      first.me.id,
    );
    // Only an explicit choice signs in to the other character; the code is then spent.
    const switched = s.community.verifyCode(email, code, {
      switchAccount: true,
    });
    assert.equal(switched.me.id, first.me.id);
    assert.throws(
      () => s.community.verifyCode(email, code, { switchAccount: true }),
      /incorrect or has expired/,
    );
    // The guest can still be saved, as itself, with another email.
    await s.community.requestCode(guest.me.id, "otter@example.test");
    const saved = s.community.verifyCode(
      "otter@example.test",
      emailedCode(s, "otter@example.test"),
    );
    assert.equal(saved.me.id, guest.me.id);
    assert.equal(saved.me.name, guest.me.name);
    assert.equal(saved.me.account.email, "otter@example.test");
  } finally {
    s.close();
  }
});

test("6. a claimed daily hat is listed with the headwear", () => {
  const save = fresh();
  assert.match(hatShelf(save), /No hats yet/);
  assert.equal(claimGift(save, 0, "2026-10-04"), true);
  const shelf = hatShelf(save);
  assert.match(
    shelf,
    /<button data-hat="1" aria-pressed="true">The Kopitiam Bucket · wearing<\/button>/,
  );
  assert.match(shelf, /<button data-hat="0" aria-pressed="false">No hat</);
  assert.doesNotMatch(shelf, /Sprout/, "hats not yet earned are not offered");
});

test("8. a walk to a chosen spot counts only that spot as visited", () => {
  const spots = [{ id: "garden" }, { id: "playground" }];
  assert.equal(visitsOnWalk("playground", "garden", spots), false);
  assert.equal(visitsOnWalk("garden", "garden", spots), true);
  // Free walking, and walks to an activity, still discover what they pass.
  assert.equal(visitsOnWalk("playground", "", spots), true);
  assert.equal(visitsOnWalk("playground", "perform:bell", spots), true);
});

test("9. Brick Bash holds for the player's first move, and a round lost on lives says so", () => {
  // The cause: left alone from PLAY, the ball passes the paddle three times in
  // 7.35 seconds for exactly 75 points, whatever the seed. A first swipe at
  // that moment looked as if it had ended the round.
  for (const seed of [1, 7, 314159]) {
    const idle = play("brick", seed, () => still);
    assert.equal(idle.sim.ticks, 441);
    assert.equal(idle.score, 75);
    assert.equal(idle.sim.endReason, "lives");
  }
  // So the round now starts with the first paddle move, as Noodle Run does.
  assert.equal(holdsForFirstMove("brick"), true);
  assert.equal(holdsForFirstMove("noodle"), true);
  assert.equal(holdsForFirstMove("hop"), false);
  // One swipe does not end a round: lives go one at a time, seconds apart.
  const swipe = new Simulation("brick", 7);
  for (let tick = 0; tick < 60; tick++) {
    swipe.advance([0, 0, -1, 0, Math.min(394, 220 + tick * 6), -1]);
    assert.equal(swipe.ended, false);
    assert.equal(swipe.lives, 3);
  }
  // A paddle kept under the ball plays on to the Big Brick at 0:35.
  const followed = play("brick", 7, (sim) => {
    const ball = [sim.ball, ...sim.extra].reduce((a, b) => (b.y > a.y ? b : a));
    return [0, 0, -1, 0, Math.round(ball.x), -1];
  });
  assert.equal(followed.sim.bossSpawned, true);
  assert.ok(["time", "cleared", "lives"].includes(followed.sim.endReason));
  assert.ok(followed.sim.elapsed > 35);
  // The rules are untouched: the server still accepts both rounds.
  assert.equal(replayRun("brick", 7, followed.replay).score, followed.score);
  assert.equal(rulesVersion("brick"), 1);
  assert.equal(
    endReasonText("brick", "lives", 7.35),
    "You lost all 3 lives after 7s. Keep the paddle under the ball.",
  );
  assert.equal(endReasonText("swarm", "lives", 12), "Out of lives after 12s.");
});
