import {
  createPlazaRelay,
  advancePlazaRelay,
  plazaPosition,
} from "../shared/plaza-relay.ts";
import { createHash, randomInt, randomUUID } from "node:crypto";
import {
  createRelay,
  advanceRelay,
  setRelayConnected,
  relayConfig,
  RELAY_TICK_RATE,
} from "../shared/relay.ts";

export const RELAY_INPUT_MS = 400;
export const RELAY_DISCONNECT_MS = 5000;
export const RELAY_WAIT_MS = 10 * 60000;
export const RELAY_RESULT_MS = 2 * 60000;
export const RELAY_ROOM_CAP = 100;
export const RELAY_RUNNING_CAP = 25;
const CODE_LETTERS = "BCDFGHJKLMNPQRSTVWXZ23456789";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const neutral = () => ({ x: 0, z: 0, action: false });
const MOVED = "Relay controls moved to another tab. Reconnect to take control.";
class RelayError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status) => {
  throw new RelayError(message, status);
};
const fields = (value, allowed) => {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  )
    fail("Send only the requested Relay controls.");
};
const roomId = (value) =>
  typeof value === "string" && /^[a-f0-9-]{36}$/.test(value);
const sequence = (value) =>
  Number.isSafeInteger(value) && value >= 0 && value <= 1000000000;

/** Private, short-lived coordination. It never writes progress or rewards. */
export class RelayRooms {
  constructor(community, privacyVersion) {
    this.community = community;
    this.store = community.store;
    this.db = community.db;
    this.now = community.now;
    this.privacyVersion = privacyVersion;
    this.onChange = null;
    this.db.exec(`CREATE TABLE IF NOT EXISTS relay_rooms(
      id TEXT PRIMARY KEY,code_hash TEXT UNIQUE NOT NULL,solo INTEGER NOT NULL,
      difficulty TEXT NOT NULL,host INTEGER NOT NULL,status TEXT NOT NULL,
      created INTEGER NOT NULL,started INTEGER,updated INTEGER NOT NULL,
      expires INTEGER NOT NULL,state TEXT);
      CREATE INDEX IF NOT EXISTS relay_rooms_expiry ON relay_rooms(expires);
      CREATE TABLE IF NOT EXISTS relay_members(
      player TEXT PRIMARY KEY REFERENCES players(id),room TEXT NOT NULL REFERENCES relay_rooms(id),
      slot INTEGER NOT NULL,session TEXT NOT NULL,epoch TEXT NOT NULL,seen INTEGER NOT NULL,
      ready INTEGER NOT NULL DEFAULT 0,seq INTEGER NOT NULL DEFAULT -1,action_seq INTEGER NOT NULL DEFAULT 0,
      input_x REAL NOT NULL DEFAULT 0,input_z REAL NOT NULL DEFAULT 0,input_at INTEGER NOT NULL DEFAULT 0,
      pending INTEGER NOT NULL DEFAULT 0,UNIQUE(room,slot));
      CREATE INDEX IF NOT EXISTS relay_members_room ON relay_members(room);`);
  }
  members(room) {
    return this.db
      .prepare("SELECT * FROM relay_members WHERE room=? ORDER BY slot")
      .all(room);
  }
  identity(member, at) {
    return this.db
      .prepare(
        `SELECT p.name,p.look FROM players p JOIN profiles f ON f.player=p.id
      WHERE p.id=? AND f.consent=? AND f.age_band IN('13+','13–17','18+')
      AND NOT EXISTS(SELECT 1 FROM suspensions WHERE player=p.id)
      AND EXISTS(SELECT 1 FROM sessions WHERE player=p.id AND token=? AND expires>?)`,
      )
      .get(member.player, this.privacyVersion, member.session, at);
  }
  blocked(a, b) {
    return !!this.db
      .prepare(
        "SELECT 1 FROM blocks WHERE (player=? AND target=?) OR (player=? AND target=?)",
      )
      .get(a, b, b, a);
  }
  save(room) {
    const state = room.simulation ? JSON.stringify(room.simulation) : null;
    if (state && state.length > 16384)
      fail("The Relay room could not continue safely.");
    this.db
      .prepare(
        "UPDATE relay_rooms SET host=?,status=?,updated=?,expires=?,state=? WHERE id=?",
      )
      .run(room.host, room.status, room.updated, room.expires, state, room.id);
  }
  load(id) {
    const row = this.db.prepare("SELECT * FROM relay_rooms WHERE id=?").get(id);
    return row
      ? { ...row, simulation: row.state ? JSON.parse(row.state) : null }
      : null;
  }
  cancel(room, at) {
    room.status = "cancelled";
    room.simulation = null;
    room.updated = at;
    room.expires = Math.min(room.expires, at + 30000);
    this.db
      .prepare(
        "UPDATE relay_members SET ready=0,input_x=0,input_z=0,pending=0 WHERE room=?",
      )
      .run(room.id);
    this.save(room);
  }
  reconcile(room, at) {
    const members = this.members(room.id);
    const invalid = members.filter((member) => !this.identity(member, at));
    const conflict = members.some((a, i) =>
      members.slice(i + 1).some((b) => this.blocked(a.player, b.player)),
    );
    if (invalid.length || conflict) {
      this.cancel(room, at);
      for (const member of invalid)
        this.db
          .prepare("DELETE FROM relay_members WHERE player=?")
          .run(member.player);
    }
    return this.members(room.id);
  }
  advance(room, members, at) {
    const state = room.simulation;
    if (!state || room.status !== "running") return;
    if (state.kind === "plaza") {
      const target = Math.min(
        7200,
        Math.max(state.tick, Math.floor((at - room.started) * 0.06)),
      );
      while (state.tick < target && state.status === "running")
        advancePlazaRelay(state);
      room.status = state.status;
      room.updated = at;
      this.save(room);
      return;
    }
    const target = Math.min(
      relayConfig(room.difficulty).limitTicks,
      Math.max(
        state.tick,
        Math.floor(((at - room.started) * RELAY_TICK_RATE) / 1000),
      ),
    );
    while (state.tick < target && state.status === "running") {
      const tickAt = room.started + ((state.tick + 1) * 1000) / RELAY_TICK_RATE;
      const inputs = {};
      for (const member of members) {
        const online = tickAt - member.seen < RELAY_DISCONNECT_MS;
        setRelayConnected(state, member.slot, online);
        inputs[member.slot] =
          online && tickAt - member.input_at <= RELAY_INPUT_MS
            ? { x: member.input_x, z: member.input_z, action: !!member.pending }
            : neutral();
        member.pending = 0;
      }
      advanceRelay(state, inputs);
    }
    for (const member of members)
      this.db
        .prepare("UPDATE relay_members SET pending=? WHERE player=?")
        .run(member.pending, member.player);
    room.status = state.status;
    room.updated = at;
    if (room.status !== "running")
      room.expires = Math.min(
        room.expires,
        room.started + (state.tick * 1000) / RELAY_TICK_RATE + RELAY_RESULT_MS,
      );
    this.save(room);
  }
  snapshot(room, actor, at, code) {
    const me = this.db
      .prepare("SELECT * FROM relay_members WHERE player=? AND room=?")
      .get(actor, room.id);
    if (!me) fail("This Relay room is unavailable.", 404);
    const members = room.status === "cancelled" ? [me] : this.members(room.id);
    const players = members
      .map((member) => {
        const identity = this.identity(member, at);
        if (!identity) return null;
        return {
          slot: member.slot,
          name: identity.name,
          look: JSON.parse(identity.look),
          ready: !!member.ready,
          online: at - member.seen < RELAY_DISCONNECT_MS,
        };
      })
      .filter(Boolean);
    return {
      room: room.id,
      ...(code ? { code } : {}),
      slot: me.slot,
      host: room.status === "cancelled" ? me.slot : room.host,
      controlEpoch: me.epoch,
      solo: !!room.solo,
      difficulty: room.difficulty,
      status: room.status,
      players,
      simulation: room.simulation?.kind === "plaza" ? null : room.simulation,
      ...(room.simulation?.kind === "plaza" ? { plaza: room.simulation } : {}),
      serverAt: at,
      expiresAt: room.expires,
    };
  }
  cleanupRaw(at) {
    this.db
      .prepare(
        "DELETE FROM relay_members WHERE room IN(SELECT id FROM relay_rooms WHERE expires<=?)",
      )
      .run(at);
    this.db
      .prepare(
        "DELETE FROM relay_rooms WHERE expires<=? OR NOT EXISTS(SELECT 1 FROM relay_members WHERE room=relay_rooms.id)",
      )
      .run(at);
  }
  cleanup() {
    this.store.transaction(() => this.cleanupRaw(this.now()));
  }
  nextExpiry() {
    return (
      this.db.prepare("SELECT MIN(expires) at FROM relay_rooms").get()?.at ??
      null
    );
  }
  request(player, action, data, token) {
    const allowed = {
      create: ["solo", "difficulty", "course"],
      join: ["code", "room"],
      ready: ["room", "ready"],
      start: ["room"],
      tick: ["room", "controlEpoch", "seq", "actionSeq", "input", "position"],
      leave: ["room", "controlEpoch"],
    }[action];
    if (!allowed) fail("Not found.", 404);
    fields(data, allowed);
    if (this.community.lookup(token) !== player)
      fail("Sign in to join Relay.", 401);
    const at = this.now(),
      session = hash(token);
    // Domain failures commit privacy cancellation/expiry cleanup; SQL failures
    // still roll back. A rejected command must not restore unsafe room data.
    const result = this.store.transaction(() => {
      this.cleanupRaw(at);
      try {
        return this.command(player, action, data, session, at);
      } catch (error) {
        if (error instanceof RelayError) return { failure: error };
        throw error;
      }
    });
    this.onChange?.();
    if (result.failure) throw result.failure;
    return result;
  }
  command(player, action, data, session, at) {
    let member = this.db
      .prepare("SELECT * FROM relay_members WHERE player=?")
      .get(player);
    if (action === "create") {
      if (
        (data.course !== undefined && data.course !== "plaza") ||
        typeof data.solo !== "boolean" ||
        !["practice", "standard", "challenge"].includes(data.difficulty)
      )
        fail("Choose solo or team play and a Relay difficulty.");
      if (member) {
        const existing = this.load(member.room);
        this.reconcile(existing, at);
        if (
          !!existing.solo !== data.solo ||
          existing.difficulty !== data.difficulty ||
          (existing.simulation?.kind === "plaza") !== (data.course === "plaza")
        )
          fail("Leave your current Relay before creating another.");
        return this.snapshot(existing, player, at);
      }
      if (!this.identity({ player, session }, at))
        fail("Sign in to join Relay.", 401);
      if (
        this.db.prepare("SELECT COUNT(*) n FROM relay_rooms").get().n >=
        RELAY_ROOM_CAP
      )
        fail("Relay is busy. Try again shortly.", 429);
      let code;
      do {
        code = Array.from(
          { length: 8 },
          () => CODE_LETTERS[randomInt(CODE_LETTERS.length)],
        ).join("");
      } while (
        this.db
          .prepare("SELECT 1 FROM relay_rooms WHERE code_hash=?")
          .get(hash(code))
      );
      const room = {
        id: randomUUID(),
        solo: Number(data.solo),
        difficulty: data.difficulty,
        host: 0,
        status: "waiting",
        created: at,
        started: null,
        updated: at,
        expires: at + RELAY_WAIT_MS,
        simulation: data.course === "plaza" ? createPlazaRelay([]) : null,
      };
      this.db
        .prepare("INSERT INTO relay_rooms VALUES(?,?,?,?,?,?,?,?,?,?,?)")
        .run(
          room.id,
          hash(code),
          room.solo,
          room.difficulty,
          0,
          room.status,
          at,
          null,
          at,
          room.expires,
          room.simulation ? JSON.stringify(room.simulation) : null,
        );
      this.insertMember(player, room.id, 0, session, at);
      return this.snapshot(room, player, at, code);
    }
    if (action === "join") {
      if (!!data.code === !!data.room) fail("Choose one Relay room code.");
      let room;
      if (data.room) {
        if (!roomId(data.room) || member?.room !== data.room)
          fail("This Relay room is unavailable.", 404);
        room = this.load(data.room);
      } else {
        if (
          typeof data.code !== "string" ||
          !/^[BCDFGHJKLMNPQRSTVWXZ23456789]{8}$/i.test(data.code)
        )
          fail("That Relay code is unavailable.");
        const found = this.db
          .prepare("SELECT id FROM relay_rooms WHERE code_hash=?")
          .get(hash(data.code.toUpperCase()));
        room = found ? this.load(found.id) : null;
      }
      if (!room || (member && member.room !== room.id))
        fail("That Relay code is unavailable.");
      if (!this.identity({ player, session }, at))
        fail("Sign in to join Relay.", 401);
      if (member) {
        // Authorize the new session first, but advance the old heartbeat and
        // controls before reconnecting. A carrier's absence still recovers bag.
        this.db
          .prepare("UPDATE relay_members SET session=?,epoch=? WHERE player=?")
          .run(session, randomUUID(), player);
        const members = this.reconcile(room, at);
        this.advance(room, members, at);
        this.db
          .prepare(
            "UPDATE relay_members SET seen=?,seq=-1,action_seq=0,input_x=0,input_z=0,input_at=?,pending=0 WHERE player=?",
          )
          .run(at, at, player);
        if (room.status === "running" && room.simulation) {
          if (room.simulation.kind !== "plaza")
            setRelayConnected(room.simulation, member.slot, true);
          this.save(room);
        }
      } else {
        const members = this.reconcile(room, at);
        if (
          room.status !== "waiting" ||
          room.solo ||
          members.length >= 4 ||
          members.some((other) => this.blocked(player, other.player))
        )
          fail("That Relay code is unavailable.");
        let slot = 0;
        while (members.some((other) => other.slot === slot)) slot++;
        this.insertMember(player, room.id, slot, session, at);
      }
      return this.snapshot(room, player, at);
    }
    if (!roomId(data.room) || member?.room !== data.room)
      fail("This Relay room is unavailable.", 404);
    const room = this.load(data.room);
    const members = this.reconcile(room, at);
    this.advance(room, members, at);
    member = this.db
      .prepare("SELECT * FROM relay_members WHERE player=?")
      .get(player);
    if (!member) fail("This Relay room is unavailable.", 404);
    if (action === "leave") {
      if (data.controlEpoch !== member.epoch || member.session !== session)
        fail(MOVED, 409);
      this.removeRaw(player, false);
      return { ok: true };
    }
    if (action === "tick") {
      if (data.controlEpoch !== member.epoch || member.session !== session)
        fail(MOVED, 409);
      if (data.position !== undefined && room.simulation?.kind !== "plaza")
        fail("Send only the requested Relay controls.");
      fields(data.input, ["x", "z"]);
      if (
        !sequence(data.seq) ||
        !sequence(data.actionSeq) ||
        ![data.input.x, data.input.z].every(
          (value) =>
            typeof value === "number" &&
            Number.isFinite(value) &&
            Math.abs(value) <= 1,
        )
      )
        fail("Send valid Relay controls.");
      if (data.seq < member.seq || data.actionSeq < member.action_seq)
        fail("Those Relay controls are out of order.", 409);
      if (data.seq === member.seq) return this.snapshot(room, player, at);
      if (
        room.status === "running" &&
        room.simulation?.kind === "plaza" &&
        data.position
      ) {
        fields(data.position, ["x", "y", "z"]);
        try {
          plazaPosition(room.simulation, member.slot, data.position);
        } catch (e) {
          fail(e.message);
        }
      }
      this.db
        .prepare(
          "UPDATE relay_members SET seq=?,action_seq=?,input_x=?,input_z=?,input_at=?,pending=MAX(pending,?),seen=? WHERE player=?",
        )
        .run(
          data.seq,
          data.actionSeq,
          data.input.x,
          data.input.z,
          at,
          Number(data.actionSeq > member.action_seq),
          at,
          player,
        );
      if (room.status === "running" && room.simulation) {
        if (room.simulation.kind !== "plaza")
          setRelayConnected(room.simulation, member.slot, true);
        this.save(room);
      }
    } else if (action === "ready") {
      if (typeof data.ready !== "boolean" || room.status !== "waiting")
        fail("This Relay is not waiting for readiness.");
      this.db
        .prepare("UPDATE relay_members SET ready=?,seen=? WHERE player=?")
        .run(Number(data.ready), at, player);
    } else if (action === "start") {
      if (member.slot !== room.host) fail("The room host starts Relay.", 403);
      if (room.status !== "waiting") return this.snapshot(room, player, at);
      const live = members.filter(
        (other) => at - other.seen < RELAY_DISCONNECT_MS,
      );
      if (
        live.length !== members.length ||
        members.some((other) => !other.ready) ||
        members.length <
          (room.solo || room.simulation?.kind === "plaza" ? 1 : 2)
      )
        fail("Everyone must be here and ready before Relay starts.");
      if (
        this.db
          .prepare("SELECT COUNT(*) n FROM relay_rooms WHERE status='running'")
          .get().n >= RELAY_RUNNING_CAP
      )
        fail("Relay is busy. Try again shortly.", 429);
      room.simulation =
        room.simulation?.kind === "plaza"
          ? createPlazaRelay(members.map((m) => m.slot))
          : createRelay(
              room.difficulty,
              members.map((other) => other.slot),
              !!room.solo,
            );
      room.status = "running";
      room.started = at;
      room.updated = at;
      room.expires =
        at +
        (relayConfig(room.difficulty).limitTicks * 1000) / RELAY_TICK_RATE +
        RELAY_RESULT_MS;
      this.db
        .prepare("UPDATE relay_rooms SET started=? WHERE id=?")
        .run(at, room.id);
      this.db
        .prepare(
          "UPDATE relay_members SET input_x=0,input_z=0,input_at=?,pending=0 WHERE room=?",
        )
        .run(at, room.id);
      this.save(room);
    }
    return this.snapshot(room, player, at);
  }
  insertMember(player, room, slot, session, at) {
    this.db
      .prepare(
        "INSERT INTO relay_members(player,room,slot,session,epoch,seen,input_at) VALUES(?,?,?,?,?,?,?)",
      )
      .run(player, room, slot, session, randomUUID(), at, at);
  }
  /** Called inside the caller's transaction for logout, deletion and leave. */
  removeRaw(player, cancel = true) {
    const member = this.db
      .prepare("SELECT * FROM relay_members WHERE player=?")
      .get(player);
    if (!member) return;
    const room = this.load(member.room),
      at = this.now();
    if (cancel) this.cancel(room, at);
    else if (room.status === "running" && room.simulation) {
      if (room.simulation.kind !== "plaza")
        setRelayConnected(room.simulation, member.slot, false);
      this.save(room);
    }
    this.db.prepare("DELETE FROM relay_members WHERE player=?").run(player);
    const left = this.members(room.id);
    if (!left.length)
      this.db.prepare("DELETE FROM relay_rooms WHERE id=?").run(room.id);
    else if (room.host === member.slot) {
      room.host = left[0].slot;
      this.save(room);
    }
  }
  cancelPairRaw(a, b) {
    const first = this.db
      .prepare("SELECT room FROM relay_members WHERE player=?")
      .get(a);
    const second = this.db
      .prepare("SELECT room FROM relay_members WHERE player=?")
      .get(b);
    if (first && first.room === second?.room)
      this.cancel(this.load(first.room), this.now());
  }
  export(player) {
    this.cleanup();
    const member = this.db
      .prepare("SELECT * FROM relay_members WHERE player=?")
      .get(player);
    if (!member) return null;
    const room = this.load(member.room);
    return {
      room: room.id,
      slot: member.slot,
      solo: !!room.solo,
      difficulty: room.difficulty,
      status: room.status,
      ready: !!member.ready,
      createdAt: room.created,
      expiresAt: room.expires,
    };
  }
}
