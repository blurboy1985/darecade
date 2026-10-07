import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.mjs";
import { Community, PRIVACY_VERSION } from "../server/community.mjs";
import {
  RELAY_INPUT_MS,
  RELAY_DISCONNECT_MS,
  RELAY_WAIT_MS,
  RELAY_RESULT_MS,
  RELAY_ROOM_CAP,
  RELAY_RUNNING_CAP,
} from "../server/relay.mjs";
import { handleApi } from "../cloudflare/api.mjs";
import { queueRelayExpiryAlarm } from "../cloudflare/relay-alarm.mjs";
import { RELAY_SOLO_TARGET, relayConfig } from "../shared/relay.ts";

const consent = {
  month: 1,
  year: 2000,
  consent: true,
  privacyVersion: PRIVACY_VERSION,
};
function setup() {
  const directory = mkdtempSync(join(tmpdir(), "darecade-relay-"));
  let time = Date.parse("2026-10-05T12:00:00+08:00");
  const store = new Store(":memory:", () => time);
  const community = new Community(store, { directory });
  const guest = (name = "Test neighbour") => {
    const p = community.join(consent);
    store.db.prepare("UPDATE players SET name=? WHERE id=?").run(name, p.me.id); // Existing named guest fixture.
    return { id: p.me.id, token: p.token };
  };
  const call = (p: ReturnType<typeof guest>, action: string, data: object) =>
    community.relay.request(p.id, action, data, p.token);
  return {
    community,
    store,
    guest,
    call,
    now: () => time,
    tick: (ms: number) => (time += ms),
    close: () => {
      store.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}
type Fixture = ReturnType<typeof setup>;
function team(s: Fixture, size = 2, solo = false, difficulty = "standard") {
  const people = Array.from({ length: size }, (_, i) =>
    s.guest("Neighbour " + String.fromCharCode(65 + i)),
  );
  const created = s.call(people[0], "create", { solo, difficulty });
  const snapshots = [
    created,
    ...people.slice(1).map((p) => s.call(p, "join", { code: created.code })),
  ];
  return { people, created, snapshots };
}
function start(s: Fixture, t: ReturnType<typeof team>) {
  t.people.forEach((p) =>
    s.call(p, "ready", { room: t.created.room, ready: true }),
  );
  return s.call(t.people[0], "start", { room: t.created.room });
}
function tick(
  s: Fixture,
  p: ReturnType<Fixture["guest"]>,
  snapshot: any,
  seq: number,
  x = 0,
  z = 0,
  actionSeq = 0,
) {
  return s.call(p, "tick", {
    room: snapshot.room,
    controlEpoch: snapshot.controlEpoch,
    seq,
    actionSeq,
    input: { x, z },
  });
}
function unrelatedRows(s: Fixture) {
  return Object.fromEntries(
    s.store.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'relay_%' ORDER BY name",
      )
      .all()
      .map((row: { name: string }) => [
        row.name,
        s.store.db.prepare(`SELECT * FROM ${row.name} ORDER BY rowid`).all(),
      ]),
  );
}

test("Relay rooms contain only actual ready participants and private hashed codes", () => {
  const s = setup();
  try {
    const t = team(s, 4),
      outsider = s.guest("Outsider");
    assert.match(t.created.code, /^[BCDFGHJKLMNPQRSTVWXZ23456789]{8}$/);
    const stored = s.store.db
      .prepare("SELECT * FROM relay_rooms WHERE id=?")
      .get(t.created.room);
    assert.equal(
      stored.code_hash,
      createHash("sha256").update(t.created.code).digest("hex"),
    );
    assert.ok(!Object.values(stored).includes(t.created.code));
    const last = t.snapshots[3];
    assert.deepEqual(
      last.players.map((p: any) => p.slot),
      [0, 1, 2, 3],
    );
    assert.deepEqual(
      last.players.map((p: any) => p.name),
      ["Neighbour A", "Neighbour B", "Neighbour C", "Neighbour D"],
    );
    assert.ok(
      last.players.every(
        (p: any) =>
          p.online &&
          !p.ready &&
          Object.keys(p).sort().join() === "look,name,online,ready,slot",
      ),
    );
    assert.equal(last.code, undefined);
    assert.equal(last.simulation, null);
    assert.throws(
      () => s.call(outsider, "join", { code: t.created.code }),
      /unavailable/,
    );
    assert.throws(
      () => s.call(outsider, "join", { room: t.created.room }),
      /unavailable/,
    );
    assert.throws(
      () =>
        s.call(t.people[0], "create", { solo: true, difficulty: "standard" }),
      /Leave/,
    );
    assert.throws(
      () => s.call(t.people[1], "start", { room: t.created.room }),
      /host/,
    );
    assert.throws(
      () => s.call(t.people[0], "start", { room: t.created.room }),
      /ready/,
    );
    const running = start(s, t);
    assert.equal(running.status, "running");
    assert.deepEqual(
      running.simulation.runners.map((r: any) => r.slot),
      [0, 1, 2, 3],
    );
    assert.equal(running.simulation.solo, false);
    assert.doesNotMatch(
      JSON.stringify(running.simulation),
      /email|player|token|epoch|session|Neighbour/,
    );
    assert.throws(
      () => s.call(outsider, "join", { code: t.created.code }),
      /unavailable/,
    );
    assert.deepEqual(
      s.call(t.people[0], "start", { room: t.created.room }).simulation,
      running.simulation,
    );
  } finally {
    s.close();
  }
});

test("solo is explicit, one teammate cannot start a team round, and readiness checks presence", () => {
  const s = setup();
  try {
    const t = team(s, 1);
    s.call(t.people[0], "ready", { room: t.created.room, ready: true });
    assert.throws(
      () => s.call(t.people[0], "start", { room: t.created.room }),
      /Everyone/,
    );
    s.call(t.people[0], "leave", {
      room: t.created.room,
      controlEpoch: t.created.controlEpoch,
    });
    const solo = team(s, 1, true, "practice"),
      outsider = s.guest();
    assert.throws(
      () => s.call(outsider, "join", { code: solo.created.code }),
      /unavailable/,
    );
    assert.equal(start(s, solo).simulation.solo, true);
    const pair = team(s);
    pair.people.forEach((p) =>
      s.call(p, "ready", { room: pair.created.room, ready: true }),
    );
    s.tick(RELAY_DISCONNECT_MS);
    assert.throws(
      () => s.call(pair.people[0], "start", { room: pair.created.room }),
      /Everyone/,
    );
  } finally {
    s.close();
  }
});

test("server time advances old controls first, expires held movement, and ignores client clocks", () => {
  const s = setup();
  try {
    const t = team(s, 1, true),
      running = start(s, t),
      p = t.people[0];
    tick(s, p, running, 0, 0, 1);
    assert.equal(s.community.relay.load(running.room).simulation.tick, 0);
    s.tick(1000);
    const stopped = tick(s, p, running, 1);
    assert.equal(stopped.simulation.tick, 60);
    assert.ok(
      Math.abs(
        stopped.simulation.runners[0].z -
          (relayConfig("standard").safeSpeed * RELAY_INPUT_MS) / 1000,
      ) < 1e-10,
    );
    s.tick(1000);
    const still = tick(s, p, running, 2, 0, 1);
    assert.equal(still.simulation.tick, 120);
    assert.equal(
      still.simulation.runners[0].z,
      stopped.simulation.runners[0].z,
      "new input cannot alter elapsed neutral ticks",
    );
    const forged = {
      room: running.room,
      controlEpoch: running.controlEpoch,
      seq: 3,
      actionSeq: 0,
      input: { x: 0, z: 0 },
      serverAt: s.now() + 1e9,
    };
    assert.throws(() => s.call(p, "tick", forged), /only/);
  } finally {
    s.close();
  }
});

test("positions, bag ownership, checkpoints, elapsed time and extra controls cannot be submitted", () => {
  const s = setup();
  try {
    const t = team(s, 1, true),
      r = start(s, t),
      p = t.people[0];
    const valid = {
      room: r.room,
      controlEpoch: r.controlEpoch,
      seq: 0,
      actionSeq: 0,
      input: { x: 0, z: 0 },
    };
    for (const extra of [
      { x: 999 },
      { bag: { owner: 0 } },
      { leg: 3 },
      { status: "finished" },
      { tick: 7200 },
      { score: 99999 },
    ])
      assert.throws(() => s.call(p, "tick", { ...valid, ...extra }), /only/);
    for (const input of [
      { x: 2, z: 0 },
      { x: NaN, z: 0 },
      { x: 0, z: Infinity },
      { x: "1", z: 0 },
      { x: 0, z: 0, action: true },
      { x: 0, z: 0, slot: 1 },
    ])
      assert.throws(() => s.call(p, "tick", { ...valid, input }), /valid|only/);
    assert.throws(() => s.call(p, "tick", { ...valid, seq: 0.5 }), /valid/);
    assert.throws(
      () => s.call(p, "tick", { ...valid, actionSeq: -1 }),
      /valid/,
    );
    assert.deepEqual(s.community.relay.load(r.room).simulation, r.simulation);
  } finally {
    s.close();
  }
});

test("reconnect explicitly rotates control epoch and replayed or out-of-order controls cannot replace input", () => {
  const s = setup();
  try {
    const t = team(s, 1, true),
      r = start(s, t),
      p = t.people[0];
    tick(s, p, r, 5, 0, 1, 2);
    tick(s, p, r, 5, 1, 0, 3);
    const member = s.store.db
      .prepare("SELECT * FROM relay_members WHERE player=?")
      .get(p.id);
    assert.equal(member.input_x, 0);
    assert.equal(member.input_z, 1);
    assert.equal(member.action_seq, 2);
    assert.throws(() => tick(s, p, r, 4), /out of order/);
    assert.throws(() => tick(s, p, r, 6, 0, 0, 1), /out of order/);
    const reconnected = s.call(p, "join", { room: r.room });
    assert.notEqual(reconnected.controlEpoch, r.controlEpoch);
    assert.throws(
      () => tick(s, p, r, 7, 0, 1, 3),
      /Relay controls moved to another tab\. Reconnect to take control\./,
    );
    assert.throws(
      () => s.call(p, "leave", { room: r.room, controlEpoch: r.controlEpoch }),
      /controls moved/,
    );
    assert.equal(
      s.store.db
        .prepare("SELECT count(*) n FROM relay_members WHERE player=?")
        .get(p.id).n,
      1,
    );
    assert.equal(
      tick(s, p, reconnected, 0).controlEpoch,
      reconnected.controlEpoch,
    );
    assert.equal(
      s.store.db
        .prepare("SELECT input_z FROM relay_members WHERE player=?")
        .get(p.id).input_z,
      0,
    );
  } finally {
    s.close();
  }
});

test("a queued contextual edge is applied once and duplicate action sequences cannot catch a second time", () => {
  const s = setup();
  try {
    const t = team(s, 1, true),
      r = start(s, t),
      p = t.people[0];
    const state = s.community.relay.load(r.room);
    Object.assign(state.simulation.runners[0], RELAY_SOLO_TARGET);
    Object.assign(state.simulation.bag, RELAY_SOLO_TARGET);
    s.community.relay.save(state); // Synthetic authoritative checkpoint fixture.
    tick(s, p, r, 0, 0, 0, 1);
    s.tick(17);
    const thrown = tick(s, p, r, 1, 0, 0, 1);
    assert.ok(thrown.simulation.bag.flight);
    assert.equal(thrown.simulation.runners[0].actionDown, true);
    s.tick(1500);
    const missed = tick(s, p, r, 2, 0, 0, 1);
    assert.equal(missed.simulation.bag.owner, null);
    assert.equal(missed.simulation.handoffs, 0);
    assert.equal(missed.simulation.drops, 1);
    assert.equal(
      s.store.db
        .prepare("SELECT pending FROM relay_members WHERE player=?")
        .get(p.id).pending,
      0,
    );
  } finally {
    s.close();
  }
});

test("carrier disconnection recovers the bag once before reconnect and leaves no invented active teammate", () => {
  const s = setup();
  try {
    const t = team(s),
      r = start(s, t),
      p = t.people[0];
    tick(s, p, r, 0, 0, 1);
    s.tick(RELAY_DISCONNECT_MS + 1);
    const resumed = s.call(p, "join", { room: r.room });
    assert.equal(resumed.simulation.bag.owner, null);
    assert.equal(resumed.simulation.drops, 1);
    assert.equal(resumed.simulation.runners[0].connected, true);
    assert.equal(resumed.simulation.runners[1].connected, false);
    assert.deepEqual(
      resumed.players.map((q: any) => q.online),
      [true, false],
    );
    assert.equal(resumed.simulation.solo, false);
    s.tick(250);
    assert.equal(tick(s, p, resumed, 0).simulation.drops, 1);
    const peer = s.call(t.people[1], "join", { room: r.room });
    const left = s.call(p, "leave", {
      room: r.room,
      controlEpoch: resumed.controlEpoch,
    });
    assert.deepEqual(left, { ok: true });
    const remaining = tick(s, t.people[1], peer, 0);
    assert.equal(remaining.host, 1);
    assert.deepEqual(
      remaining.players.map((q: any) => q.slot),
      [1],
    );
    assert.equal(remaining.simulation.runners[0].connected, false);
    assert.equal(remaining.simulation.solo, false);
  } finally {
    s.close();
  }
});

test("bilateral blocks reject a code join and cancel an existing roster without exposing the peer", () => {
  const s = setup();
  try {
    const t = team(s),
      r = start(s, t),
      [a, b] = t.people;
    s.community.moderate(b.id, a.id, "block");
    const cancelled = tick(s, a, r, 0);
    assert.equal(cancelled.status, "cancelled");
    assert.equal(cancelled.simulation, null);
    assert.deepEqual(
      cancelled.players.map((p: any) => p.name),
      ["Neighbour A"],
    );
    assert.ok(cancelled.expiresAt <= s.now() + 30000);
    s.call(a, "leave", { room: r.room, controlEpoch: r.controlEpoch });
    s.call(b, "leave", {
      room: r.room,
      controlEpoch: t.snapshots[1].controlEpoch,
    });
    const created = s.call(a, "create", {
      solo: false,
      difficulty: "standard",
    });
    assert.throws(
      () => s.call(b, "join", { code: created.code }),
      /unavailable/,
    );
    s.call(a, "leave", {
      room: created.room,
      controlEpoch: created.controlEpoch,
    });
    const other = s.call(b, "create", { solo: false, difficulty: "standard" });
    assert.throws(() => s.call(a, "join", { code: other.code }), /unavailable/);
  } finally {
    s.close();
  }
});

test("revoked consent, age eligibility, session expiry and suspension cancel before returning roster data", () => {
  for (const invalidate of [
    (s: Fixture, p: string) =>
      s.store.db
        .prepare("UPDATE profiles SET consent='old' WHERE player=?")
        .run(p),
    (s: Fixture, p: string) =>
      s.store.db
        .prepare("UPDATE profiles SET age_band='under-13' WHERE player=?")
        .run(p),
    (s: Fixture, p: string) =>
      s.store.db
        .prepare("UPDATE sessions SET expires=? WHERE player=?")
        .run(s.now(), p),
    (s: Fixture, p: string) =>
      s.store.db.prepare("INSERT INTO suspensions VALUES(?,?)").run(p, s.now()),
  ]) {
    const s = setup();
    try {
      const t = team(s),
        r = start(s, t);
      invalidate(s, t.people[1].id);
      const result = tick(s, t.people[0], r, 0);
      assert.equal(result.status, "cancelled");
      assert.equal(result.simulation, null);
      assert.deepEqual(
        result.players.map((p: any) => p.slot),
        [0],
      );
      assert.equal(
        s.store.db
          .prepare("SELECT count(*) n FROM relay_members WHERE player=?")
          .get(t.people[1].id).n,
        0,
      );
      assert.equal(
        s.store.db
          .prepare("SELECT state FROM relay_rooms WHERE id=?")
          .get(r.room).state,
        null,
      );
    } finally {
      s.close();
    }
  }
});

test("logout and deletion clear state immediately, while export contains only own ephemeral participation", () => {
  for (const action of ["logout", "delete"] as const) {
    const s = setup();
    try {
      const t = team(s),
        r = start(s, t),
        [a, b] = t.people;
      const participation = s.community.export(a.id).relay;
      assert.equal(participation.slot, 0);
      assert.doesNotMatch(
        JSON.stringify(participation),
        /name|Neighbour|code|token|epoch|session|input|simulation/,
      );
      if (action === "logout") s.community.logout(b.id, b.token);
      else s.community.delete(b.id);
      const result = tick(s, a, r, 0);
      assert.equal(result.status, "cancelled");
      assert.equal(result.simulation, null);
      assert.deepEqual(
        result.players.map((p: any) => p.slot),
        [0],
      );
      assert.equal(
        s.store.db
          .prepare("SELECT count(*) n FROM relay_members WHERE player=?")
          .get(b.id).n,
        0,
      );
      assert.throws(
        () =>
          s.call(b, "tick", {
            room: r.room,
            controlEpoch: t.snapshots[1].controlEpoch,
            seq: 0,
            actionSeq: 0,
            input: { x: 0, z: 0 },
          }),
        /Sign in/,
      );
    } finally {
      s.close();
    }
  }
});

test("all Relay room operations, timeout and cleanup preserve every existing ledger and profile byte", () => {
  const s = setup();
  try {
    const t = team(s, 1, true, "practice"),
      before = unrelatedRows(s),
      revision = s.store.db
        .prepare("SELECT revision FROM snapshot_revision")
        .get().revision;
    const r = start(s, t);
    tick(s, t.people[0], r, 0, 0, 1, 1);
    s.tick(180000);
    const ended = tick(s, t.people[0], r, 1, 0, 0, 1);
    assert.equal(ended.status, "timeout");
    assert.equal(ended.simulation.tick, 10800);
    assert.equal(ended.expiresAt, s.now() + RELAY_RESULT_MS);
    const terminal = structuredClone(ended.simulation);
    s.tick(250);
    assert.deepEqual(tick(s, t.people[0], r, 2, 1, 1, 2).simulation, terminal);
    assert.deepEqual(
      s.call(t.people[0], "join", { room: r.room }).simulation,
      terminal,
    );
    s.tick(RELAY_RESULT_MS);
    s.community.relay.cleanup();
    assert.equal(s.community.relay.nextExpiry(), null);
    assert.equal(
      s.store.db.prepare("SELECT count(*) n FROM relay_members").get().n,
      0,
    );
    assert.deepEqual(unrelatedRows(s), before);
    assert.equal(
      s.store.db.prepare("SELECT revision FROM snapshot_revision").get()
        .revision,
      revision,
    );
  } finally {
    s.close();
  }
});

test("waiting rooms expire without polling; repeated creation and duplicate leave stay bounded", () => {
  const s = setup();
  try {
    const t = team(s, 1, true),
      created = t.created;
    assert.equal(s.community.relay.nextExpiry(), s.now() + RELAY_WAIT_MS);
    assert.equal(
      s.call(t.people[0], "create", { solo: true, difficulty: "standard" })
        .room,
      created.room,
    );
    assert.equal(
      s.store.db.prepare("SELECT count(*) n FROM relay_rooms").get().n,
      1,
    );
    s.tick(RELAY_WAIT_MS);
    s.community.cleanup();
    assert.equal(s.community.relay.nextExpiry(), null);
    assert.throws(
      () => s.call(t.people[0], "join", { room: created.room }),
      /unavailable/,
    );
    const next = s.call(t.people[0], "create", {
      solo: true,
      difficulty: "standard",
    });
    s.call(t.people[0], "leave", {
      room: next.room,
      controlEpoch: next.controlEpoch,
    });
    assert.equal(s.community.relay.nextExpiry(), null);
    assert.throws(
      () =>
        s.call(t.people[0], "leave", {
          room: next.room,
          controlEpoch: next.controlEpoch,
        }),
      /unavailable/,
    );
  } finally {
    s.close();
  }
});

test("global waiting and running room caps reject overflow without creating additional rooms", () => {
  for (const kind of ["waiting", "running"]) {
    const s = setup();
    try {
      const cap = kind === "waiting" ? RELAY_ROOM_CAP : RELAY_RUNNING_CAP;
      for (let i = 0; i < cap; i++) {
        const t = team(s, 1, true);
        if (kind === "running") start(s, t);
      }
      const p = s.guest();
      if (kind === "waiting")
        assert.throws(
          () => s.call(p, "create", { solo: true, difficulty: "standard" }),
          /busy/,
        );
      else {
        const r = s.call(p, "create", { solo: true, difficulty: "standard" });
        s.call(p, "ready", { room: r.room, ready: true });
        assert.throws(() => s.call(p, "start", { room: r.room }), /busy/);
      }
      assert.equal(
        s.store.db
          .prepare("SELECT count(*) n FROM relay_rooms WHERE status=?")
          .get(kind).n,
        cap,
      );
    } finally {
      s.close();
    }
  }
});

test("Cloudflare API adapter authenticates retired Relay routes and preserves POST/origin protection", async () => {
  const s = setup();
  try {
    const p = s.guest(),
      rates: string[] = [];
    const api = async (
      path: string,
      data?: object,
      token = p.token,
      origin = s.community.origin,
    ) => {
      const request = new Request(s.community.origin + "/api/relay/" + path, {
        method: data ? "POST" : "GET",
        headers: {
          Origin: origin,
          ...(token ? { Cookie: "darecade_session=" + token } : {}),
          ...(data ? { "Content-Type": "application/json" } : {}),
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      const response = await handleApi(request, {
        community: s.community,
        store: s.store,
        files: {},
        rate: (scope: string) => rates.push(scope),
        worlds: {},
        payments: {},
      });
      return {
        status: response.status,
        data: await response.json(),
        headers: response.headers,
      };
    };
    assert.equal(
      (await api("create", { solo: true, difficulty: "standard" }, "")).status,
      401,
    );
    assert.equal((await api("create")).status, 405);
    assert.equal(
      (
        await api(
          "create",
          { solo: true, difficulty: "standard" },
          p.token,
          "https://foreign.test",
        )
      ).status,
      403,
    );
    for (const action of [
      "create",
      "join",
      "ready",
      "start",
      "tick",
      "leave",
    ]) {
      const r = await api(action, {});
      assert.equal(r.status, 410, action);
      assert.match(r.data.error, /has been removed/);
      assert.equal(r.headers.get("cache-control"), "no-store");
    }
    assert.ok(!rates.some((scope) => scope.startsWith("relay:")));
    assert.equal(
      s.store.db.prepare("SELECT count(*) n FROM relay_rooms").get().n,
      0,
    );
  } finally {
    s.close();
  }
});

test("Relay alarm scheduling retries get/set failures and serializes earlier deadlines", async () => {
  for (const failure of ["get", "set"]) {
    let alarm: number | null = null,
      expiry = 600000,
      failOnce = true;
    const waits: Promise<void>[] = [],
      sets: number[] = [];
    const owner: any = {
      relayAlarmAt: Infinity,
      community: { relay: { nextExpiry: () => expiry } },
      nextWork: () => expiry,
      ctx: {
        waitUntil: (task: Promise<void>) => {
          waits.push(task);
          task.catch(() => {});
        },
        storage: {
          getAlarm: async () => {
            if (failOnce && failure === "get") {
              failOnce = false;
              throw Error("synthetic get failure");
            }
            return alarm;
          },
          setAlarm: async (at: number) => {
            if (failOnce && failure === "set") {
              failOnce = false;
              throw Error("synthetic set failure");
            }
            alarm = at;
            sets.push(at);
          },
        },
      },
    };
    queueRelayExpiryAlarm(owner);
    await assert.rejects(owner.relayAlarmTask, /synthetic/);
    assert.equal(
      owner.relayAlarmAt,
      Infinity,
      "failed expiry is eligible for retry",
    );
    queueRelayExpiryAlarm(owner);
    await owner.relayAlarmTask;
    assert.equal(alarm, 600000);
    expiry = 180000;
    queueRelayExpiryAlarm(owner);
    expiry = 30000;
    queueRelayExpiryAlarm(owner);
    await owner.relayAlarmTask;
    assert.equal(alarm, 30000);
    assert.ok(sets.every((at, i) => i === 0 || at <= sets[i - 1]));
    const count = waits.length;
    queueRelayExpiryAlarm(owner);
    assert.equal(
      waits.length,
      count,
      "same deadline creates no scheduling work",
    );
  }
});
test("plaza uses existing private team codes and preserves every ledger", () => {
  const s = setup();
  try {
    const a = s.guest("Mango Runner"),
      b = s.guest("Peach Runner");
    const before = unrelatedRows(s);
    const room = s.call(a, "create", {
      solo: false,
      difficulty: "standard",
      course: "plaza",
    });
    const joined = s.call(b, "join", { code: room.code });
    for (const p of [a, b])
      s.call(p, "ready", { room: room.room, ready: true });
    const running = s.call(a, "start", { room: room.room });
    assert.equal(running.plaza.runners.filter((r) => r.bot).length, 6);
    assert.equal(running.simulation, null);
    s.tick(250);
    const next = s.call(a, "tick", {
      room: room.room,
      controlEpoch: running.controlEpoch,
      seq: 1,
      actionSeq: 0,
      input: { x: 0, z: 0 },
      position: { x: 2, y: 0.1, z: 5 },
    });
    assert.equal(next.plaza.tick, 15);
    assert.deepEqual(unrelatedRows(s), before);
    s.call(b, "leave", { room: room.room, controlEpoch: joined.controlEpoch });
    assert.deepEqual(unrelatedRows(s), before);
  } finally {
    s.close();
  }
});
