import test from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { sessionKey } from "../cloudflare/world-auth.mjs";

// Run the actual World lifecycle without starting a Worker or seeding accounts.
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "cloudflare:workers")
      return {
        url:
          "data:text/javascript," +
          encodeURIComponent(
            "export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }",
          ),
        shortCircuit: true,
      };
    return nextResolve(specifier, context);
  },
});
const { World } = await import("../cloudflare/world.mjs");
hooks.deregister();

const identity = (id) => ({
  id,
  name: id,
  session: sessionKey(`darecade_session=${id}`),
  look: { outfit: 0, skin: 0, hat: 0 },
  blockedIds: [],
  x: 0,
  z: 0,
  yaw: 0,
  activity: "rest",
  away: false,
});

function socket(player) {
  let attachment = { world: "world-1", player };
  return {
    readyState: 1,
    messages: [],
    deserializeAttachment: () => structuredClone(attachment),
    serializeAttachment: (value) => {
      attachment = structuredClone(value);
    },
    send(value) {
      this.messages.push(JSON.parse(value));
    },
    close() {
      this.readyState = 3;
    },
  };
}

async function fixture(t, socketIds = ["p0"]) {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 0 });
  const stored = new Map([["name", "world-1"]]);
  const identities = new Map(["p0", "p1"].map((id) => [id, identity(id)]));
  const sockets = socketIds.map((id) => socket(identities.get(id)));
  const calls = { saves: [], refreshes: [], reports: [], departures: [] };
  let alarm = null;
  const records = {
    worldAuthorize: (cookie) =>
      [...identities.values()].find((p) => p.session === sessionKey(cookie)),
    worldChoose: () => "world-1",
    worldArrive() {},
    worldDepart: (name, id) => {
      calls.departures.push({ name, id });
    },
    worldRefresh(players) {
      calls.refreshes.push({
        at: Date.now(),
        players: structuredClone(players),
      });
      return players.flatMap(({ id, session }) => {
        const p = identities.get(id);
        return p?.session === session ? [structuredClone(p)] : [];
      });
    },
    worldSave(name, players, leaving) {
      const saved = structuredClone(players);
      calls.saves.push({ name, players: saved, leaving });
      for (const player of saved)
        if (identities.has(player.id))
          Object.assign(identities.get(player.id), {
            x: player.x,
            z: player.z,
            yaw: player.yaw,
            activity: player.activity,
          });
    },
    worldOccupancy(name, players) {
      calls.reports.push({
        at: Date.now(),
        name,
        players: structuredClone(players),
      });
    },
  };
  const f = {
    world: null,
    sockets,
    stored,
    identities,
    calls,
    records,
    alarm: () => alarm,
    async wake() {
      if (f.world?.timer) clearTimeout(f.world.timer);
      let ready;
      const ctx = {
        getWebSockets: () => sockets,
        blockConcurrencyWhile: (fn) => {
          ready = fn();
        },
        waitUntil: (promise) => promise,
        storage: {
          get: async (key) => structuredClone(stored.get(key)),
          put: async (key, value) => {
            stored.set(key, structuredClone(value));
          },
          delete: async (key) => stored.delete(key),
          getAlarm: async () => alarm,
          setAlarm: async (at) => {
            alarm = at;
          },
          deleteAlarm: async () => {
            alarm = null;
          },
        },
      };
      f.world = new World(ctx, {
        NEIGHBOURHOOD: { idFromName: (name) => name, get: () => records },
      });
      await ready;
    },
    async tick(ms = 10000) {
      t.mock.timers.tick(ms);
      alarm = null; // The runtime clears the fired alarm before invoking it.
      await f.world.alarm();
    },
    move(data, index = 0) {
      f.world.webSocketMessage(sockets[index], JSON.stringify(data));
    },
    poll(data = {}, id = "p0", connection = "poll-tab") {
      return f.world.fetch(
        new Request(
          `https://darecade.test/api/world/poll?world=world-1&connection=${connection}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Cookie: `darecade_session=${id}`,
            },
            body: JSON.stringify(data),
          },
        ),
      );
    },
  };
  await f.wake();
  return f;
}

test("idle checkpoints keep 30-second authorization refresh and 10-second occupancy freshness", async (t) => {
  const f = await fixture(t);
  for (let i = 0; i < 9; i++) {
    f.move({ x: 0 });
    await f.tick();
    assert.equal(f.alarm(), Date.now() + 10000);
  }
  assert.deepEqual(
    f.calls.refreshes.map((r) => r.at),
    [30000, 60000, 90000],
  );
  assert.deepEqual(
    f.calls.reports.map((r) => r.at),
    [10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000],
  );
  assert.equal(
    f.calls.saves.length,
    1,
    "one initial save, no identical periodic saves",
  );
  assert.equal(f.stored.get("lastSaved"), 90000);
  assert.doesNotMatch(
    JSON.stringify(f.sockets[0].messages),
    /checkpoint|session|blockedIds/,
    "checkpoint metadata stays inside private hibernation attachments",
  );
});

test("checkpoints save only changed durable fields and preserve exact coordinates", async (t) => {
  const f = await fixture(t, ["p0", "p1"]);
  await f.tick(30000);
  f.move({ x: 0.0001, z: 2, yaw: 0.0002, activity: "dance", away: true });
  await f.tick(30000);
  assert.equal(f.calls.saves.length, 2);
  assert.equal(f.calls.saves[1].players.length, 1);
  assert.equal(f.calls.saves[1].players[0].x, 0.0001);
  assert.equal(f.calls.saves[1].players[0].yaw, 0.0002);
  assert.equal(f.calls.reports.at(-1).players[0].away, true);

  f.move({ emote: "wave" });
  await f.tick(30000);
  assert.equal(
    f.calls.saves.length,
    2,
    "emotes and live timestamps do not change saved poses",
  );
  f.move({ x: 4 });
  t.mock.timers.tick(1000);
  f.move({ x: 0.0001 });
  await f.tick(30000);
  assert.equal(
    f.calls.saves.length,
    2,
    "returning to the saved pose needs no write",
  );

  for (const change of [
    { x: 3 },
    { z: 4 },
    { yaw: 2 },
    { activity: "jog" },
    { away: false },
  ]) {
    f.move(change);
    const before = f.calls.saves.length;
    await f.tick(30000);
    assert.equal(f.calls.saves.length, before + 1);
  }
});

test("hibernation restores both clean checkpoints and newer unsaved socket movement", async (t) => {
  const f = await fixture(t);
  await f.tick(30000);
  assert.equal(
    typeof f.sockets[0].deserializeAttachment().checkpoint,
    "string",
  );
  await f.wake();
  await f.tick(30000);
  assert.equal(f.calls.saves.length, 1);
  f.move({ x: 7, activity: "dragon" });
  await f.wake();
  assert.equal(f.world.state.players.get("p0").x, 7);
  await f.tick(30000);
  assert.equal(f.calls.saves.at(-1).players[0].x, 7);
  assert.equal(f.calls.saves.at(-1).players[0].activity, "dragon");
  assert.equal(f.calls.saves.length, 2);
  await f.wake();
  await f.tick(30000);
  assert.equal(f.calls.saves.length, 2);
});

test("poll fallback checkpoints survive restart, expire with the latest pose, and rejoin cleanly", async (t) => {
  const f = await fixture(t, []);
  assert.equal((await f.poll({ x: 5 })).status, 200);
  assert.equal(
    (await f.poll({ x: 9 })).status,
    429,
    "poll rate limit remains intact",
  );
  for (let i = 0; i < 3; i++) {
    t.mock.timers.tick(10000);
    assert.equal((await f.poll({ x: 5 })).status, 200);
    await f.tick(0);
  }
  assert.equal(f.calls.saves.length, 1);
  assert.equal(typeof f.stored.get("polls")[0].checkpoint, "string");
  await f.wake();
  for (let i = 0; i < 3; i++) {
    t.mock.timers.tick(10000);
    await f.poll({ x: 5 });
    await f.tick(0);
  }
  assert.equal(f.calls.saves.length, 1);
  t.mock.timers.tick(1000);
  await f.poll({ x: 11, activity: "arcade" });
  await f.wake();
  assert.equal(f.world.state.players.get("p0").x, 11);
  await f.tick(16000);
  assert.equal(f.calls.saves.at(-1).leaving, true);
  assert.equal(f.calls.saves.at(-1).players[0].x, 11);
  assert.equal(f.calls.saves.at(-1).players[0].activity, "arcade");
  assert.equal(f.world.state.players.size, 0);
  assert.equal(f.world.checkpoints.size, 0);
  assert.equal(f.stored.has("polls"), false);
  assert.equal(f.alarm(), null);
  assert.equal((await f.poll({ x: 11 })).status, 200);
  assert.equal(
    f.world.checkpoints.has("p0"),
    false,
    "a new membership cannot inherit an old acknowledgement",
  );
});

test("final departure always saves the latest pose and appearance, even after a clean checkpoint", async (t) => {
  const f = await fixture(t);
  await f.tick(30000);
  f.identities.get("p0").look.outfit = 2;
  await f.world.refresh();
  f.move({ x: 8, z: 9 });
  await f.world.webSocketClose(f.sockets[0]);
  assert.equal(f.calls.saves.length, 2);
  assert.equal(f.calls.saves[1].leaving, true);
  assert.equal(f.calls.saves[1].players[0].x, 8);
  assert.equal(f.calls.saves[1].players[0].look.outfit, 2);
  assert.equal(f.world.checkpoints.size, 0);
  await f.wake();
  assert.equal(
    f.world.state.players.size,
    0,
    "closed attachments cannot resurrect players",
  );

  assert.equal((await f.poll()).status, 200);
  await f.world.checkpoint();
  const before = f.calls.saves.length;
  await f.world.remove("p0");
  assert.equal(
    f.calls.saves.length,
    before + 1,
    "clean departure still updates offline state",
  );
  assert.equal(f.calls.saves.at(-1).leaving, true);
});

test("idle players still receive appearance, block, and session revocation updates", async (t) => {
  const f = await fixture(t, ["p0", "p1"]);
  await f.tick(30000);
  Object.assign(f.identities.get("p0"), {
    name: "Updated",
    look: { outfit: 2 },
    blockedIds: ["p1"],
  });
  await f.tick(30000);
  assert.equal(f.calls.saves.length, 1);
  assert.equal(f.world.state.players.get("p0").name, "Updated");
  assert.equal(f.sockets[0].deserializeAttachment().player.look.outfit, 2);
  assert.deepEqual(f.world.state.players.get("p0").blockedIds, ["p1"]);
  assert.ok(f.sockets[0].messages.some((p) => p.gone.includes(1)));
  f.identities.get("p0").session = "revoked";
  f.identities.delete("p1");
  await f.tick(30000);
  assert.equal(f.calls.refreshes.length, 3);
  assert.equal(f.world.state.players.size, 0);
  assert.equal(f.world.checkpoints.size, 0);
  assert.equal(
    f.calls.saves.length,
    1,
    "revoked or deleted players are removed without a final save",
  );
  assert.equal(f.alarm(), null);
});

test("failed checkpoint RPCs retain dirty state and retry without delaying authorization refresh", async (t) => {
  const f = await fixture(t);
  await f.tick(30000);
  f.move({ x: 12 });
  const save = f.records.worldSave;
  f.records.worldSave = () => {
    throw Error("Records unavailable");
  };
  await assert.rejects(f.tick(30000), /Records unavailable/);
  assert.equal(f.stored.get("lastSaved"), 30000);
  await f.wake();
  f.records.worldSave = save;
  await f.tick(10000);
  assert.equal(f.calls.saves.at(-1).players[0].x, 12);
  assert.deepEqual(
    f.calls.refreshes.map((r) => r.at),
    [30000, 60000, 70000],
  );
  await f.tick(30000);
  assert.equal(f.calls.saves.length, 2);
});

test("a movement during an in-flight save stays dirty across hibernation", async (t) => {
  const f = await fixture(t);
  await f.tick(30000);
  f.move({ x: 3 });
  const save = f.records.worldSave;
  const started = Promise.withResolvers();
  const release = Promise.withResolvers();
  f.records.worldSave = async (...args) => {
    save(...args);
    started.resolve();
    await release.promise;
  };
  const checkpoint = f.world.checkpoint();
  await started.promise;
  f.move({ x: 4 });
  release.resolve();
  await checkpoint;
  assert.equal(f.calls.saves.at(-1).players[0].x, 3);
  await f.wake();
  f.records.worldSave = save;
  await f.tick(30000);
  assert.equal(f.calls.saves.at(-1).players[0].x, 4);
  assert.equal(f.calls.saves.length, 3);
});

test("an in-flight checkpoint cannot acknowledge a removed and rejoined player", async (t) => {
  const f = await fixture(t);
  await f.tick(30000);
  f.move({ x: 3 });
  const save = f.records.worldSave;
  const release = Promise.withResolvers();
  f.records.worldSave = async (...args) => {
    save(...args);
    await release.promise;
  };
  const checkpoint = f.world.checkpoint();
  await f.world.remove("p0", true);
  t.mock.timers.tick(1000);
  assert.equal((await f.poll({ x: 4 })).status, 200);
  release.resolve();
  await checkpoint;
  assert.equal(f.world.checkpoints.has("p0"), false);
  f.records.worldSave = save;
  await f.world.checkpoint();
  assert.equal(f.calls.saves.at(-1).players[0].x, 4);
});
