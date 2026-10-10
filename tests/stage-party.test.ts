import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import {
  PARTY_CAP,
  PARTY_COUNTDOWN_MS,
  PARTY_SHOW_MS,
  PARTY_TICK_MIN_MS,
  clockOffset,
  partyCode,
  partyRanking,
  type PartySnapshot,
} from "../shared/stage-party.ts";
import {
  PARTY_AWAY_MS,
  PARTY_GONE_MS,
  PARTY_GRACE_MS,
  PARTY_IDLE_MS,
  PARTY_JOINS_A_MINUTE,
  PARTY_ROOM_CAP,
  StageRooms,
} from "../server/stage-rooms.mjs";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";

function rooms(blocks: [string, string][] = []) {
  let now = 1_000_000;
  const stage = new StageRooms({
    now: () => now,
    identity: (id: string) =>
      id.startsWith("ghost")
        ? null
        : { name: id.toUpperCase(), look: { outfit: 0, skin: 0, hat: 0 } },
    blocked: (a: string, b: string) =>
      blocks.some(([x, y]) => (x === a && y === b) || (x === b && y === a)),
  });
  const go = (player: string, action: string, data: unknown = {}) => {
    // Every request is far enough from the last to pass the polling floor.
    now += PARTY_TICK_MIN_MS;
    return stage.request(player, action, data) as PartySnapshot;
  };
  return {
    stage,
    go,
    wait: (ms: number) => (now += ms),
    /** Time passes with these dancers still polling, as a browser would. */
    pass(ms: number, ...players: string[]) {
      for (let left = ms; left > 0; left -= 2000) {
        now += Math.min(left, 2000) - players.length * PARTY_TICK_MIN_MS;
        for (const player of players) go(player, "tick", {});
      }
    },
    fails: (run: () => unknown, status: number, message?: RegExp) =>
      assert.throws(run, (error: Error & { status?: number }) => {
        assert.equal(error.status, status, error.message);
        if (message) assert.match(error.message, message);
        return true;
      }),
  };
}

test("party helpers rank dancers, read codes and estimate the server clock", () => {
  assert.equal(partyCode(" bcdf "), "BCDF");
  for (const bad of ["", "BCD", "BCDFG", "ABCD", "B1DF", "BC F"])
    assert.equal(partyCode(bad), null, bad);
  const player = (
    slot: number,
    score: number,
    booed = false,
    playing = true,
  ) => ({
    slot,
    score,
    booed,
    playing,
  });
  assert.deepEqual(
    partyRanking([
      player(0, 500),
      player(1, 900, true),
      player(2, 700),
      player(3, 700),
      player(4, 9999, false, false),
    ]).map((p) => p.slot),
    [2, 3, 0, 1],
    "score first, ties by seat, booed last, and no one who sat the round out",
  );
  // Sent at 100, answered at 300; the server stamped 5200 in the middle.
  assert.equal(clockOffset(100, 300, 5200), 5000);
});

test("a host opens a party, friends join by code, and everyone plays one shared song", () => {
  const { go, wait, pass, fails } = rooms();
  const opened = go("ann", "create", { mode: "show" });
  assert.match(opened.code, /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  assert.equal(opened.status, "waiting");
  assert.deepEqual([opened.you, opened.host, opened.round], [0, 0, 0]);
  fails(() => go("ann", "start"), 409, /friend/);
  fails(
    () => go("bob", "join", { code: "BCDF".replace(opened.code, "GHJK") }),
    404,
  );
  const joined = go("bob", "join", { code: opened.code.toLowerCase() });
  assert.equal(joined.you, 1);
  assert.deepEqual(
    joined.players.map((p) => [p.slot, p.name, p.online, p.playing]),
    [
      [0, "ANN", true, false],
      [1, "BOB", true, false],
    ],
    "names and looks come from the server, never from the request",
  );
  fails(() => go("bob", "start"), 403, /host/);
  fails(() => go("bob", "mode", { mode: "encore" }), 403);
  fails(() => go("ann", "mode", { mode: "warmup" }), 400);
  assert.equal(go("ann", "mode", { mode: "encore" }).mode, "encore");

  const started = go("ann", "start");
  assert.equal(started.status, "running");
  assert.equal(started.round, 1);
  assert.equal(started.startAt, started.serverAt + PARTY_COUNTDOWN_MS);
  assert.ok(started.players.every((p) => p.playing && p.score === 0));
  const bob = go("bob", "tick", {});
  assert.deepEqual(
    [bob.seed, bob.startAt, bob.mode, bob.round],
    [started.seed, started.startAt, "encore", 1],
    "every dancer is given the same song and the same start",
  );
  // A score sent during the countdown is not counted.
  assert.equal(
    go("bob", "tick", { round: 1, score: 5000 }).players[1].score,
    0,
  );
  wait(PARTY_COUNTDOWN_MS);
  go("ann", "tick", {
    round: 1,
    score: 1200,
    combo: 9,
    hype: 0.8,
    hits: 9,
    lane: 2,
    fever: true,
    style: 3,
  });
  const live = go("bob", "tick", {
    round: 1,
    score: 800,
    combo: 3,
    hits: 6,
    lane: 1,
  });
  assert.deepEqual(
    live.players.map((p) => [
      p.score,
      p.combo,
      p.hits,
      p.lane,
      p.fever,
      p.style,
    ]),
    [
      [1200, 9, 9, 2, true, 3],
      [800, 3, 6, 1, false, 0],
    ],
  );
  fails(() => go("ann", "start"), 409, /finish/);
  // A score never goes down, and nonsense is ignored rather than stored.
  const odd = go("bob", "tick", {
    round: 1,
    score: 100,
    combo: -4,
    hype: 7,
    hits: 2.5,
    lane: 9,
    style: 12,
    stars: 3,
  });
  assert.deepEqual(
    [
      odd.players[1].score,
      odd.players[1].combo,
      odd.players[1].hits,
      odd.players[1].lane,
      odd.players[1].style,
      odd.players[1].stars,
    ],
    [800, 3, 6, 1, 0, 0],
  );
  assert.equal(
    go("bob", "tick", { round: 1, score: 1e9 }).players[1].score,
    800,
  );
  // Another round's numbers are not this round's.
  assert.equal(
    go("bob", "tick", { round: 2, score: 9000 }).players[1].score,
    800,
  );
  pass(PARTY_SHOW_MS - 5000, "ann", "bob");
  const first = go("ann", "tick", {
    round: 1,
    score: 4000,
    done: true,
    stars: 2,
  });
  assert.equal(first.status, "running", "the show waits for the last dancer");
  assert.equal(first.players[0].fever, false);
  const done = go("bob", "tick", {
    round: 1,
    score: 5200,
    done: true,
    stars: 3,
    booed: false,
  });
  assert.equal(done.status, "results");
  assert.deepEqual(
    partyRanking(done.players).map((p) => [p.name, p.score, p.stars]),
    [
      ["BOB", 5200, 3],
      ["ANN", 4000, 2],
    ],
  );
  // The result stands: late numbers change nothing.
  assert.equal(
    go("bob", "tick", { round: 1, score: 99999 }).players[1].score,
    5200,
  );
  const again = go("ann", "start");
  assert.deepEqual([again.status, again.round], ["running", 2]);
  assert.notEqual(again.startAt, started.startAt);
  assert.ok(
    again.players.every((p) => p.score === 0 && !p.done && p.stars === 0),
  );
});

test("a show ends on time when a dancer never reports the end", () => {
  const { go, wait } = rooms();
  const { code } = go("ann", "create");
  go("bob", "join", { code });
  go("ann", "start");
  wait(PARTY_COUNTDOWN_MS + 1000);
  go("ann", "tick", { round: 1, score: 300 });
  go("bob", "tick", { round: 1, score: 100, done: true, booed: true });
  // Keep both here, without Ann ever finishing.
  for (let at = 0; at < PARTY_SHOW_MS + PARTY_GRACE_MS; at += 2000) {
    wait(2000 - 2 * PARTY_TICK_MIN_MS);
    go("ann", "tick", {});
    assert.equal(go("bob", "tick", {}).players.length, 2);
  }
  const over = go("ann", "tick", {});
  assert.equal(over.status, "results");
  assert.deepEqual(
    partyRanking(over.players).map((p) => p.name),
    ["ANN", "BOB"],
    "a dancer who was booed off ranks below one who stayed",
  );
});

test("late arrivals watch the round, the host's seat passes on, and silence empties the room", () => {
  const { stage, go, wait, pass, fails } = rooms();
  const { code } = go("ann", "create");
  go("bob", "join", { code });
  go("ann", "start");
  const late = go("cat", "join", { code });
  assert.equal(late.you, 2);
  assert.equal(late.status, "running");
  assert.equal(late.players[2].playing, false, "Cat is in the next round");
  wait(PARTY_COUNTDOWN_MS);
  assert.equal(
    go("cat", "tick", { round: 1, score: 7000 }).players[2].score,
    0,
  );
  // Ann leaves mid-show: Bob dances on and now hosts.
  assert.deepEqual(go("ann", "leave"), { ok: true });
  fails(() => go("ann", "tick", {}), 404, /ended/);
  const after = go("bob", "tick", { round: 1, score: 400, done: true });
  assert.deepEqual([after.host, after.status], [1, "results"]);
  assert.deepEqual(
    after.players.map((p) => p.slot),
    [1, 2],
  );
  // Bob stops polling: first away, then gone, and Cat inherits the room.
  go("cat", "tick", {});
  pass(PARTY_AWAY_MS, "cat");
  const away = go("cat", "tick", {});
  assert.equal(away.players[0].online, false);
  fails(() => go("cat", "start"), 403);
  pass(PARTY_GONE_MS, "cat");
  const alone = go("cat", "tick", {});
  assert.deepEqual([alone.host, alone.players.length], [2, 1]);
  fails(() => go("cat", "start"), 409, /friend/);
  // A room nobody starts is closed in the end, even with someone polling.
  for (let at = 0; at < PARTY_IDLE_MS; at += 4000) {
    wait(4000);
    try {
      go("cat", "tick", {});
    } catch {
      break;
    }
  }
  assert.equal(stage.rooms.size, 0);
  assert.equal(stage.seats.size, 0);
});

test("parties are capped, private to their code, and closed to blocked players", () => {
  const { stage, go, pass, fails } = rooms([["ann", "eve"]]);
  const { code } = go("ann", "create");
  fails(() => go("ghost", "join", { code }), 401);
  fails(() => go("ghost", "create"), 401);
  assert.equal(stage.rooms.size, 1, "a refused host leaves no empty room");
  fails(() => go("eve", "join", { code }), 404, /not open/);
  for (const bad of [undefined, 7, "BCD", "ABCD", { code }])
    fails(() => go("bob", "join", { code: bad }), 404, /not open/);
  for (const friend of ["bob", "cat", "dan"]) go(friend, "join", { code });
  assert.equal(stage.rooms.get(code).members.size, PARTY_CAP);
  fails(() => go("fay", "join", { code }), 409, /full/);
  // Rejoining is not a second seat, and hosting elsewhere gives the seat up.
  assert.equal(go("bob", "join", { code }).players.length, PARTY_CAP);
  const other = go("bob", "create");
  assert.notEqual(other.code, code);
  assert.equal(stage.rooms.get(code).members.size, PARTY_CAP - 1);
  // Guessing codes is rate limited.
  fails(() => {
    for (let i = 0; i <= PARTY_JOINS_A_MINUTE; i++)
      try {
        go("gus", "join", { code: "ZZZZ" });
      } catch (error) {
        if ((error as { status?: number }).status === 429) throw error;
      }
  }, 429);
  pass(60000, "cat", "dan");
  fails(() => go("gus", "join", { code: "ZZZZ" }), 404);
  // Polling faster than the floor is refused without touching the room.
  go("cat", "tick", {});
  assert.throws(() => stage.request("cat", "tick", {}), /slow down/);
  fails(() => go("cat", "dance"), 404);
  fails(() => go("cat", "tick", null), 400);
  // The stage has room for only so many parties.
  for (let i = 0; stage.rooms.size < PARTY_ROOM_CAP; i++)
    go(`host${i}`, "create");
  fails(() => go("zed", "create"), 429, /busy/);
});

test("cheers are counted once each and only from the fixed set", () => {
  const { go, wait } = rooms();
  const { code } = go("ann", "create");
  go("bob", "join", { code });
  assert.deepEqual(
    [
      go("bob", "tick", { cheer: 2 }).players[1].cheer,
      go("ann", "tick", {}).players[1].cheerKind,
    ],
    [1, 2],
  );
  // Too soon after the last one, or not a cheer at all.
  assert.equal(go("bob", "tick", { cheer: 1 }).players[1].cheer, 1);
  wait(1000);
  assert.equal(go("bob", "tick", { cheer: 9 }).players[1].cheer, 1);
  assert.equal(go("bob", "tick", { cheer: "🔥" }).players[1].cheer, 1);
  const cheered = go("bob", "tick", { cheer: 0 }).players[1];
  assert.deepEqual([cheered.cheer, cheered.cheerKind], [2, 0]);
});

test("logging out, deleting a profile or blocking a dancer leaves the party", () => {
  const directory = mkdtempSync(join(tmpdir(), "darecade-party-"));
  let time = Date.parse("2026-10-10T09:00:00+08:00");
  const store = new Store(":memory:", () => time),
    community = new Community(store, { directory });
  try {
    const enter = () =>
      community.join({
        month: 1,
        year: 2000,
        consent: true,
        privacyVersion: PRIVACY_VERSION,
      });
    const [ann, bob, cat] = [enter(), enter(), enter()];
    const go = (who: typeof ann, action: string, data: unknown = {}) => {
      time += PARTY_TICK_MIN_MS;
      return community.stage.request(who.me.id, action, data) as PartySnapshot;
    };
    const opened = go(ann, "create");
    go(bob, "join", { code: opened.code });
    const full = go(cat, "join", { code: opened.code });
    assert.deepEqual(
      full.players.map((p) => p.name),
      [ann, bob, cat].map((p) => p.me.name),
    );
    assert.equal(typeof full.players[0].look.outfit, "number");
    const before = structuredClone(
      community.privateProfile(ann.me.id).progress,
    );
    go(ann, "start");
    time += PARTY_COUNTDOWN_MS;
    go(ann, "tick", { round: 1, score: 9000, done: true, stars: 3 });
    assert.deepEqual(
      community.privateProfile(ann.me.id).progress,
      before,
      "a party never writes XP, stars or a best score by itself",
    );
    // Bob blocks Ann: Bob is taken out, and cannot come back to her party.
    community.moderate(bob.me.id, ann.me.id, "block");
    assert.throws(() => go(bob, "tick", {}), /ended/);
    assert.throws(() => go(bob, "join", { code: opened.code }), /not open/);
    assert.equal(go(cat, "tick", {}).players.length, 2);
    community.logout(cat.me.id, cat.token);
    assert.equal(go(ann, "tick", {}).players.length, 1);
    community.delete(ann.me.id);
    assert.equal(community.stage.rooms.size, 0);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test(
  "two browsers play a party show through the HTTP API",
  { timeout: 30000 },
  async () => {
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((r) => reservation.close(() => r()));
    const dir = mkdtempSync(join(tmpdir(), "darecade-party-http-"));
    const origin = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ["server/index.mjs"], {
      cwd: resolve("."),
      env: {
        ...process.env,
        PORT: String(port),
        LAN_HOST: "",
        DARECADE_DATA: dir,
        NODE_ENV: "test",
        MAIL_MODE: "outbox",
        PUBLIC_ORIGIN: origin,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(Error("Test server did not start")),
          8000,
        );
        child.once("error", reject);
        child.stdout.on("data", (data) => {
          if (String(data).includes("neighbourhood ready")) {
            clearTimeout(timer);
            resolve();
          }
        });
      });
      const post = (path: string, body: unknown, cookie = "") =>
        fetch(origin + "/api/" + path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            ...(cookie ? { Cookie: cookie } : {}),
          },
          body: JSON.stringify(body),
        });
      const config = await (await fetch(origin + "/api/auth/config")).json();
      const enter = async () => {
        const joined = await post("auth/join", {
          month: 1,
          year: 2000,
          consent: true,
          privacyVersion: config.privacyVersion,
        });
        assert.equal(joined.status, 200);
        return joined.headers.get("set-cookie")!.split(";")[0];
      };
      const [ann, bob] = [await enter(), await enter()];
      const pause = () =>
        new Promise((r) => setTimeout(r, PARTY_TICK_MIN_MS + 30));
      const go = async (cookie: string, action: string, body: unknown = {}) => {
        await pause();
        const response = await post(`stage/${action}`, body, cookie);
        return {
          status: response.status,
          body: (await response.json()) as PartySnapshot & { error?: string },
        };
      };
      assert.equal((await post("stage/create", {})).status, 401);
      assert.equal(
        (await fetch(origin + "/api/stage/tick", { headers: { Cookie: ann } }))
          .status,
        404,
        "party requests are POSTs",
      );
      assert.equal((await go(ann, "tick")).status, 404);
      const opened = await go(ann, "create", { mode: "show" });
      assert.equal(opened.status, 200);
      assert.equal((await go(bob, "join", { code: "ZZZZ" })).status, 404);
      const joined = await go(bob, "join", { code: opened.body.code });
      assert.equal(joined.body.players.length, 2);
      assert.equal((await go(bob, "start")).status, 403);
      const started = await go(ann, "start");
      assert.equal(started.body.status, "running");
      const seen = await go(bob, "tick");
      assert.equal(seen.body.seed, started.body.seed);
      assert.equal(seen.body.startAt, started.body.startAt);
      await new Promise((r) =>
        setTimeout(r, started.body.startAt - Date.now() + 50),
      );
      await go(ann, "tick", { round: 1, score: 2100, hits: 12, lane: 3 });
      const mid = await go(bob, "tick", { round: 1, score: 900, cheer: 1 });
      assert.deepEqual(
        mid.body.players.map((p) => [p.score, p.hits, p.lane, p.cheer]),
        [
          [2100, 12, 3, 0],
          [900, 0, 0, 1],
        ],
      );
      await go(ann, "tick", { round: 1, score: 3000, done: true, stars: 1 });
      const done = await go(bob, "tick", {
        round: 1,
        score: 2500,
        done: true,
        stars: 1,
      });
      assert.equal(done.body.status, "results");
      assert.deepEqual(
        partyRanking(done.body.players).map((p) => p.score),
        [3000, 2500],
      );
      assert.deepEqual((await go(bob, "leave")).body, { ok: true });
      assert.equal((await go(ann, "tick")).body.players.length, 1);
    } finally {
      child.kill();
      await once(child, "exit").catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
