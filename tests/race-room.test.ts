import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import WebSocket from "ws";
import {
  COUNTDOWN_MS,
  FLAG,
  ROOM_CAP,
  ROOM_CODE,
  RaceRoom,
  gridPlace,
  roomCode,
  type Outgoing,
} from "../shared/race-room.ts";
import {
  CoastRace,
  RACE_DISTANCE,
  RACE_TICKS,
  RIVALS,
  trackCurve,
} from "../shared/racing.ts";
import { RaceHost } from "../server/race-host.mjs";
import { PRIVACY_VERSION } from "../server/community.mjs";

const person = (id: string, blockedIds: string[] = []) => ({
  id,
  name: id.toUpperCase(),
  look: { outfit: 1, skin: 0, hat: 0 },
  blockedIds,
});
const of = (out: Outgoing[], t: string, to?: string) =>
  out.filter((m) => m.data.t === t && (!to || m.to === to || m.to === null));

function started(players = 2) {
  let now = 1000;
  const room = new RaceRoom("BCDF", () => 0.5);
  const ids = Array.from({ length: players }, (_, i) => `p${i}`);
  for (const id of ids) assert.equal(room.join(person(id), now), "");
  room.drain();
  room.receive(ids[0], { t: "start" }, now);
  const go = room.drain();
  now += COUNTDOWN_MS;
  return {
    room,
    ids,
    go,
    get now() {
      return now;
    },
    wait(ms: number) {
      now += ms;
      return now;
    },
  };
}

test("room codes are four letters with no vowels, and the grid lines karts up two abreast", () => {
  for (let i = 0; i < 200; i++) assert.match(roomCode(), ROOM_CODE);
  assert.equal(
    roomCode(() => 0),
    "BBBB",
  );
  assert.equal(
    roomCode(() => 0.999),
    "ZZZZ",
  );
  const places = Array.from({ length: ROOM_CAP }, (_, i) => gridPlace(i));
  assert.equal(new Set(places.map((p) => `${p.distance}:${p.offset}`)).size, 8);
  for (let i = 0; i < ROOM_CAP; i += 2) {
    assert.equal(places[i].distance, places[i + 1].distance);
    assert.ok(Math.abs(places[i].offset - places[i + 1].offset) > 1.35);
    if (i) assert.ok(places[i - 1].distance - places[i].distance >= 1.8);
  }
});

test("a room seats two to eight players, hides blocked pairs, and only its host starts the race", () => {
  const room = new RaceRoom("BCDF");
  assert.equal(room.join(person("a"), 0), "");
  assert.equal(room.host, "a");
  let out = room.drain();
  assert.deepEqual(of(out, "room")[0].data, {
    t: "room",
    code: "BCDF",
    status: "lobby",
    you: 0,
    host: 0,
    min: 2,
    cap: 8,
    players: [{ name: "A", look: person("a").look }],
  });
  // One player cannot start, and says why.
  room.receive("a", { t: "start" }, 0);
  out = room.drain();
  assert.equal(room.status, "lobby");
  assert.match(String(of(out, "error", "a")[0].data.message), /at least 2/);
  // A player the host blocked, or who blocked the host, sees no such room.
  assert.equal(room.join(person("x", ["a"]), 0), "No race with that code.");
  const blocker = new RaceRoom("BCDF");
  blocker.join(person("a", ["x"]), 0);
  assert.equal(blocker.join(person("x"), 0), "No race with that code.");
  assert.equal(room.join(person("b"), 0), "");
  out = room.drain();
  assert.equal(of(out, "room").length, 2, "both players hear about the join");
  assert.equal(of(out, "room", "b")[0].data.you, 1);
  room.receive("b", { t: "start" }, 0);
  assert.equal(room.status, "lobby", "a guest cannot start");
  for (const id of ["c", "d", "e", "f", "g", "h"])
    assert.equal(room.join(person(id), 0), "");
  assert.equal(room.join(person("i"), 0), "That race is full.");
  // Joining again from another window keeps the same seat.
  assert.equal(room.join(person("c"), 0), "");
  assert.equal(room.members.size, 8);
  room.receive("a", { t: "start" }, 0);
  assert.equal(room.status, "countdown");
  assert.equal(room.karts.filter((k) => k.pace).length, 0);
  room.leave("h", 10);
  assert.match(room.join(person("late"), 20), /already started/);
  // The host leaving hands the room to the next player.
  room.leave("a", 30);
  assert.equal(room.host, "b");
  for (const id of ["b", "c", "d", "e", "f", "g"]) room.leave(id, 40);
  assert.equal(room.empty, true);
});

test("the start puts players ahead of computer karts and tells each one which kart is theirs", () => {
  const { room, go } = started(3);
  const packets = of(go, "go");
  assert.equal(packets.length, 3);
  assert.deepEqual(
    packets.map((p) => p.data.you),
    [0, 1, 2],
  );
  const karts = packets[0].data.karts as {
    name: string;
    pace: number;
    look: unknown;
    distance: number;
  }[];
  assert.equal(karts.length, ROOM_CAP);
  assert.deepEqual(
    karts.map((k) => k.name),
    ["P0", "P1", "P2", ...RIVALS.slice(0, 5).map((r) => r.name)],
  );
  assert.ok(karts.slice(0, 3).every((k) => k.look && !k.pace));
  assert.ok(karts.slice(3).every((k) => !k.look && k.pace));
  assert.ok(karts[0].distance >= karts[7].distance);
  assert.equal(packets[0].data.in, COUNTDOWN_MS);
  assert.equal(packets[0].data.seed, packets[2].data.seed);
  assert.equal(room.status, "countdown");
  assert.equal(of(go, "room")[0].data.status, "countdown");
});

test("the room moves computer karts on the clock, relays positions, and keeps a reported kart plausible", () => {
  const t = started(2);
  const { room, ids } = t;
  // Nothing moves until the countdown ends.
  room.receive(ids[0], { t: "s", s: [50, 0, 20, 0] }, t.now - 2000);
  assert.equal(room.karts[0].distance, gridPlace(0).distance);
  room.drain();
  room.receive(ids[0], { t: "s", s: [12, 1.5, 9, FLAG.boost] }, t.wait(1000));
  assert.equal(room.status, "racing");
  assert.equal(room.field!.ticks, 60);
  const [snapshot] = of(room.drain(), "w");
  const s = snapshot.data.s as number[][];
  assert.equal(snapshot.to, null, "everyone gets the same picture");
  assert.equal(snapshot.data.k, 60);
  assert.deepEqual(s[0], [12, 1.5, 9, FLAG.boost, 0]);
  assert.ok(s[2][0] > gridPlace(2).distance, "computer karts have set off");
  assert.equal(s[2][2], 6, "at six units a second after one second");
  // Snapshots are paced, not sent for every message.
  room.receive(ids[1], { t: "s", s: [11, -2, 9, 0] }, t.wait(10));
  assert.equal(of(room.drain(), "w").length, 0);
  room.receive(ids[1], { t: "s", s: [11.5, -2, 9, 0] }, t.wait(70));
  assert.equal(of(room.drain(), "w").length, 1);
  // A kart cannot teleport, leave the road, go backwards or claim server flags.
  room.receive(
    ids[0],
    { t: "s", s: [900, 40, 500, FLAG.finished | FLAG.gone | FLAG.shield] },
    t.wait(100),
  );
  const kart = room.karts[0];
  assert.ok(kart.distance < 30, String(kart.distance));
  assert.equal(kart.offset, 6.4);
  assert.equal(kart.speed, 40);
  assert.equal(kart.shield, 1);
  assert.equal(kart.finishTick, 0);
  const far = kart.distance;
  room.receive(ids[0], { t: "s", s: [0, 0, 5, 0] }, t.wait(100));
  assert.ok(kart.distance > far - 1);
  // Junk is ignored without ending the room.
  for (const junk of [null, 7, [], { t: "s", s: [1, 2] }, { t: "s", s: "x" }])
    room.receive(ids[0], junk, t.wait(20));
  assert.equal(room.status, "racing");
  // Sixty messages a second is the limit for one player.
  const before = room.karts[1].offset;
  for (let i = 0; i < 80; i++)
    room.receive(ids[1], { t: "s", s: [12, i % 2 ? 1 : -1, 9, 0] }, t.now);
  assert.equal(
    room.karts[1].offset,
    1,
    "the 60th message was the last applied",
  );
  assert.notEqual(before, 1);
});

test("items used by one player reach the others as hits, and a shield reported by a kart blocks them", () => {
  const t = started(2);
  const { room, ids } = t;
  room.receive(ids[0], { t: "s", s: [40, 0, 23, 0] }, t.wait(2000));
  room.receive(ids[1], { t: "s", s: [30, 0, 23, 0] }, t.wait(10));
  room.drain();
  // Player 1 is behind player 0: a missile goes for player 0.
  room.receive(ids[1], { t: "use", item: "missile" }, t.wait(10));
  let out = room.drain();
  assert.deepEqual(of(out, "used")[0].data, {
    t: "used",
    kart: 1,
    item: "missile",
  });
  assert.equal(room.field!.missiles[0].target, 0);
  // Items cannot be spammed, and only real items count.
  room.receive(ids[1], { t: "use", item: "wave" }, t.wait(100));
  assert.equal(of(room.drain(), "used").length, 0);
  room.receive(ids[1], { t: "s", s: [31, 0, 23, 0] }, t.wait(500));
  out = room.drain();
  assert.deepEqual(of(out, "hit")[0].data, {
    t: "hit",
    kind: "spin",
    kart: 0,
    by: 1,
    item: "missile",
  });
  assert.equal(of(out, "hit")[0].to, null, "every player sees the hit");
  room.receive(ids[1], { t: "use", item: "nuke" }, t.wait(500));
  assert.equal(of(room.drain(), "used").length, 0);
  // A wave from player 0 reaches player 1 ten units back, unless shielded.
  room.receive(ids[1], { t: "s", s: [32, 0, 23, FLAG.shield] }, t.wait(10));
  room.receive(ids[0], { t: "use", item: "wave" }, t.wait(10));
  out = room.drain();
  assert.equal(
    of(out, "hit").find((m) => m.data.kart === 1)!.data.kind,
    "block",
  );
  room.receive(ids[1], { t: "s", s: [33, 0, 23, 0] }, t.wait(10));
  room.receive(ids[0], { t: "use", item: "wave" }, t.wait(500));
  out = room.drain();
  assert.equal(
    of(out, "hit").find((m) => m.data.kart === 1)!.data.kind,
    "spin",
  );
  // Computer karts in the room use items too.
  let cpuUses = 0;
  for (let i = 0; i < 600; i++) {
    room.receive(ids[0], { t: "ping" }, t.wait(100));
    cpuUses += of(room.drain(), "used").filter(
      (m) => (m.data.kart as number) > 1,
    ).length;
  }
  assert.ok(cpuUses > 3, `${cpuUses} computer items in a minute`);
});

test("finishing order comes from the room; the race ends when every player is home, timed out or gone", () => {
  const t = started(3);
  const { room, ids } = t;
  room.receive(ids[0], { t: "s", s: [20, 0, 23, 0] }, t.wait(1000));
  // Nobody finishes ten seconds in, whatever they claim.
  room.receive(ids[0], { t: "finish", ticks: 100 }, t.wait(1000));
  assert.equal(room.karts[0].finishTick, 0);
  let out = room.drain();
  assert.equal(of(out, "finish")[0].data.ticks, 0);
  assert.equal(room.status, "racing", "the other two are still out");
  // Player 1 drives the whole way round, reporting as they go.
  const race = new CoastRace(7, {
    versus: { karts: [], ...gridPlace(1) },
  });
  while (!race.ended) {
    race.advance(
      Math.sign(
        trackCurve(race.distance) * race.speed ** 2 * 0.12 -
          race.offset * 2 -
          race.lateralSpeed * 0.5,
      ),
      1,
      false,
    );
    if (race.ticks % 4 === 0)
      room.receive(
        ids[1],
        { t: "s", s: [race.distance, race.offset, race.speed, 0] },
        t.wait(4000 / 60),
      );
  }
  assert.ok(race.score > 0);
  room.drain();
  room.receive(ids[1], { t: "finish", ticks: race.ticks }, t.wait(20));
  out = room.drain();
  const finish = of(out, "finish")[0].data;
  assert.equal(finish.kart, 1);
  assert.ok(Math.abs((finish.ticks as number) - race.ticks) < 240);
  assert.equal(room.karts[1].distance, RACE_DISTANCE);
  assert.equal(of(out, "end").length, 0);
  // Player 2 walks away; with nobody left racing the room posts the results.
  room.leave(ids[2], t.wait(100));
  out = room.drain();
  const results = of(out, "end")[0].data.results as {
    kart: number;
    name: string;
    cpu: boolean;
    ticks: number;
  }[];
  assert.equal(room.status, "results");
  assert.ok(
    !results.some((r) => r.kart === 2),
    "a kart that left is not listed",
  );
  assert.equal(results.length, 7);
  const finishers = results.filter((r) => r.ticks);
  assert.deepEqual(
    finishers.map((r) => r.ticks),
    [...finishers.map((r) => r.ticks)].sort((a, b) => a - b),
  );
  assert.ok(finishers.some((r) => r.kart === 1));
  assert.equal(results.at(-1)!.kart, 0, "the player who never moved is last");
  assert.equal(of(out, "room")[0].data.status, "results");
  // The host can go again with whoever is still here.
  room.receive(ids[0], { t: "start" }, t.wait(1000));
  assert.equal(room.status, "countdown");
  assert.equal(room.karts.filter((k) => !k.pace).length, 2);
  assert.equal(room.karts[0].finishTick, 0);
});

test("a race left running ends itself after the time limit", () => {
  const t = started(2);
  t.room.receive(t.ids[0], { t: "ping" }, t.wait(125000));
  const out = t.room.drain();
  assert.equal(t.room.status, "results");
  assert.equal(of(out, "end").length, 1);
  assert.equal(of(out, "pong", t.ids[0]).length, 1);
  // Computer karts get the same two minutes as the players.
  assert.equal(t.room.field!.ticks, RACE_TICKS);
  const results = of(out, "end")[0].data.results as { ticks: number }[];
  assert.ok(results.every((r) => r.ticks <= RACE_TICKS));
});

test("a host delivers room messages to the right sockets and replaces a player's older window", () => {
  const seat = () => {
    const sent: Record<string, unknown>[] = [];
    return {
      sent,
      closed: 0,
      send(text: string) {
        sent.push(JSON.parse(text));
      },
      close() {
        this.closed++;
      },
    };
  };
  const host = new RaceHost("BCDF", () => 5000);
  const stranger = seat();
  assert.equal(host.open(person("z"), stranger, false), false);
  assert.deepEqual(stranger.sent, [
    { t: "error", message: "No race with that code." },
  ]);
  assert.equal(stranger.closed, 1);
  const a = seat(),
    b = seat();
  assert.equal(host.open(person("a"), a, true), true);
  assert.equal(
    host.open(person("c"), seat(), true),
    false,
    "the code is taken",
  );
  assert.equal(host.open(person("b"), b, false), true);
  assert.equal(a.sent.filter((m) => m.t === "room").length, 2);
  assert.equal(b.sent.filter((m) => m.t === "room").length, 1);
  const again = seat();
  assert.equal(host.open(person("b"), again, false), true);
  assert.match(String(b.sent.at(-1)!.message), /another window/);
  assert.equal(b.closed, 1);
  // The old window's close and messages no longer count.
  host.closed("b", b);
  host.message("b", b, JSON.stringify({ t: "start" }));
  assert.equal(host.room.members.size, 2);
  host.message("a", a, JSON.stringify({ t: "start" }));
  assert.equal(a.sent.at(-2)!.t, "go");
  assert.equal(again.sent.at(-2)!.t, "go");
  host.message("a", a, "x".repeat(600));
  host.message("a", a, "{nope");
  assert.equal(a.closed, 2);
  host.closed("a", a);
  host.closed("b", again);
  assert.equal(host.empty, true);
});

test(
  "two players race each other over sockets on the preview server",
  { timeout: 40000 },
  async () => {
    const reservation = createServer();
    reservation.listen(0, "127.0.0.1");
    await once(reservation, "listening");
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((r) => reservation.close(() => r()));
    const dir = mkdtempSync(join(tmpdir(), "darecade-race-room-"));
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
    const sockets: WebSocket[] = [];
    try {
      await new Promise<void>((done, reject) => {
        const timer = setTimeout(
          () => reject(Error("Test server did not start")),
          8000,
        );
        child.once("error", reject);
        child.stdout.on("data", (data) => {
          if (String(data).includes("neighbourhood ready")) {
            clearTimeout(timer);
            done();
          }
        });
      });
      const guest = async (name: string) => {
        const joined = await fetch(origin + "/api/auth/join", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: origin },
          body: JSON.stringify({
            over13: true,
            consent: true,
            privacyVersion: PRIVACY_VERSION,
          }),
        });
        assert.equal(joined.status, 200);
        const cookie = joined.headers.get("set-cookie")!.split(";")[0];
        await fetch(origin + "/api/profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: origin,
            Cookie: cookie,
          },
          body: JSON.stringify({ name }),
        });
        return cookie;
      };
      const connect = (query: string, cookie = "", from = origin) => {
        const socket = new WebSocket(
          `ws://127.0.0.1:${port}/api/race/connect?${query}`,
          { headers: { Origin: from, ...(cookie ? { Cookie: cookie } : {}) } },
        );
        sockets.push(socket);
        socket.on("error", () => {});
        const inbox: Record<string, any>[] = [];
        const waiting: (() => void)[] = [];
        socket.on("message", (raw) => {
          inbox.push(JSON.parse(String(raw)));
          waiting.splice(0).forEach((wake) => wake());
        });
        const next = async (t: string) => {
          const until = Date.now() + 5000;
          for (;;) {
            const i = inbox.findIndex((m) => m.t === t);
            if (i >= 0) return inbox.splice(i, 1)[0];
            if (Date.now() > until)
              throw Error(`No "${t}" message; got ${JSON.stringify(inbox)}`);
            await new Promise<void>((wake) => {
              waiting.push(wake);
              setTimeout(wake, 250);
            });
          }
        };
        return { socket, inbox, next };
      };
      const refused = async (query: string, cookie = "", from = origin) => {
        const { socket } = connect(query, cookie, from);
        const [, response] = (await once(socket, "unexpected-response")) as [
          unknown,
          { statusCode: number },
        ];
        socket.terminate();
        return response.statusCode;
      };
      const [hostCookie, friendCookie] = [
        await guest("Ana"),
        await guest("Ben"),
      ];
      assert.equal(await refused("host=1"), 401, "a session is required");
      assert.equal(
        await refused("host=1", hostCookie, "https://elsewhere.test"),
        403,
      );
      assert.equal(await refused("code=nope", hostCookie), 400);
      assert.equal(
        (await connect("code=ZZZZ", hostCookie).next("error")).message,
        "No race with that code.",
      );
      const host = connect("host=1", hostCookie);
      const lobby = await host.next("room");
      assert.match(lobby.code, ROOM_CODE);
      assert.equal(lobby.players.length, 1);
      // Codes are typed by people, so lower case works.
      const friend = connect("code=" + lobby.code.toLowerCase(), friendCookie);
      assert.equal((await friend.next("room")).players.length, 2);
      assert.equal((await host.next("room")).players.length, 2);
      friend.socket.send(JSON.stringify({ t: "start" }));
      host.socket.send(JSON.stringify({ t: "start" }));
      const [goHost, goFriend] = [
        await host.next("go"),
        await friend.next("go"),
      ];
      assert.equal(goHost.seed, goFriend.seed);
      assert.deepEqual([goHost.you, goFriend.you], [0, 1]);
      assert.equal(goHost.karts.filter((k: any) => k.look).length, 2);
      await new Promise((r) => setTimeout(r, goHost.in + 100));
      // Each player drives for a second and a half and sees the other move.
      const drive = async (
        player: typeof host,
        go: Record<string, any>,
        steps: number,
        stride: number,
      ) => {
        const mine = go.karts[go.you];
        for (let i = 1; i <= steps; i++) {
          player.socket.send(
            JSON.stringify({
              t: "s",
              s: [mine.distance + i * stride, mine.offset, 18, 0],
            }),
          );
          await new Promise((r) => setTimeout(r, 70));
        }
      };
      await Promise.all([
        drive(host, goHost, 20, 1.4),
        drive(friend, goFriend, 20, 1),
      ]);
      const seen = host.inbox.filter((m) => m.t === "w").at(-1)!;
      assert.ok(
        seen.s[1][0] > goHost.karts[1].distance + 15,
        "the friend moved",
      );
      assert.ok(seen.s[0][0] > goHost.karts[0].distance + 15);
      assert.ok(
        seen.s[4][0] > goHost.karts[4].distance,
        "so did computer karts",
      );
      assert.ok(seen.k > 60);
      assert.ok(
        host.inbox.filter((m) => m.t === "w").length >= 10,
        "positions stream several times a second",
      );
      // The friend's missile hits the host, who is just ahead.
      friend.socket.send(JSON.stringify({ t: "use", item: "missile" }));
      // The room keeps time from its players' traffic, as live karts provide.
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 70));
        host.socket.send(JSON.stringify({ t: "ping" }));
      }
      const hit = await host.next("hit");
      assert.deepEqual(hit, {
        t: "hit",
        kind: "spin",
        kart: 0,
        by: 1,
        item: "missile",
      });
      assert.equal((await friend.next("hit")).kart, 0);
      // The friend closes the window; the host stops racing and gets results.
      host.inbox.length = 0;
      friend.socket.close();
      assert.equal((await host.next("room")).players.length, 1);
      host.socket.send(JSON.stringify({ t: "done" }));
      const end = await host.next("end");
      assert.equal(end.results.length, 7);
      assert.ok(end.results.every((r: any) => r.kart !== 1));
      host.socket.close();
      await once(host.socket, "close");
      await new Promise((r) => setTimeout(r, 100));
      assert.equal(
        (await connect("code=" + lobby.code, friendCookie).next("error"))
          .message,
        "No race with that code.",
        "an empty room is gone",
      );
      // Nothing from a room reaches progress.
      const me = await (
        await fetch(origin + "/api/auth/me", {
          headers: { Cookie: hostCookie },
        })
      ).json();
      assert.equal(me.progress.xp, 0);
      assert.equal(me.progress.coastRecord.timeTicks, 0);
    } finally {
      for (const socket of sockets) socket.terminate();
      child.kill();
      await once(child, "exit").catch(() => {});
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
