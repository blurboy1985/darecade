import { randomInt } from "node:crypto";
import {
  PARTY_CAP,
  PARTY_CHEERS,
  PARTY_CODE_LETTERS,
  PARTY_COUNTDOWN_MS,
  PARTY_MODES,
  PARTY_SHOW_MS,
  PARTY_TICK_MIN_MS,
  partyCode,
} from "../shared/stage-party.ts";

export const PARTY_ROOM_CAP = 50;
/** A dancer who stops polling shows as away, then loses their place. */
export const PARTY_AWAY_MS = 6000;
export const PARTY_GONE_MS = 20000;
/** A party nobody has started for this long is closed. */
export const PARTY_IDLE_MS = 20 * 60000;
/** Results wait this long after the song for the last scores to arrive. */
export const PARTY_GRACE_MS = 6000;
export const PARTY_JOINS_A_MINUTE = 12;
const SCORE_LIMIT = 100000;

class PartyError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const fail = (message, status) => {
  throw new PartyError(message, status);
};
const whole = (value, min, max) =>
  Number.isInteger(value) && value >= min && value <= max;

/**
 * Friendly, short-lived rooms held in memory. A room never writes progress or
 * rewards: each dancer's own show is still reported through `perform`.
 */
export class StageRooms {
  rooms = new Map();
  /** player id -> room code */
  seats = new Map();
  joins = new Map();
  constructor({ identity, blocked, now = Date.now, random = randomInt }) {
    this.identity = identity;
    this.blocked = blocked;
    this.now = now;
    this.random = random;
  }
  sweep(at) {
    for (const room of [...this.rooms.values()]) {
      for (const member of [...room.members.values()])
        if (at - member.seen > PARTY_GONE_MS) this.drop(room, member.player);
      if (this.rooms.has(room.code) && at - room.touched > PARTY_IDLE_MS)
        for (const player of [...room.members.keys()]) this.drop(room, player);
    }
    for (const [player, tries] of this.joins)
      if (tries.until <= at) this.joins.delete(player);
  }
  drop(room, player) {
    const member = room.members.get(player);
    if (!member) return;
    room.members.delete(player);
    this.seats.delete(player);
    if (!room.members.size) this.rooms.delete(room.code);
    else if (room.host === member.slot)
      room.host = Math.min(...[...room.members.values()].map((m) => m.slot));
  }
  /** Logout, deletion and suspension. */
  remove(player) {
    const room = this.rooms.get(this.seats.get(player));
    if (room) this.drop(room, player);
  }
  /** A block takes the blocker out of a party the two share. */
  separate(player, target) {
    const code = this.seats.get(player);
    if (code && code === this.seats.get(target)) this.remove(player);
  }
  seat(room, player, at) {
    const identity = this.identity(player);
    if (!identity) fail("Sign in to join a party.", 401);
    let slot = 0;
    const taken = new Set([...room.members.values()].map((m) => m.slot));
    while (taken.has(slot)) slot++;
    room.members.set(player, {
      player,
      slot,
      name: identity.name,
      look: identity.look,
      seen: at,
      tickAt: 0,
      style: 0,
      round: 0,
      cheer: 0,
      cheerKind: 0,
      cheerAt: 0,
      ...this.blank(),
    });
    this.seats.set(player, room.code);
  }
  blank() {
    return {
      score: 0,
      combo: 0,
      hype: 0.5,
      fever: false,
      hits: 0,
      lane: 0,
      done: false,
      booed: false,
      stars: 0,
    };
  }
  /** The round ends when every dancer still here has finished, or on time. */
  settle(room, at) {
    if (room.status !== "running") return;
    const dancing = [...room.members.values()].filter(
      (m) => m.round === room.round && at - m.seen < PARTY_AWAY_MS,
    );
    if (
      at > room.startAt + PARTY_SHOW_MS + PARTY_GRACE_MS ||
      (at > room.startAt && dancing.every((m) => m.done))
    ) {
      room.status = "results";
      room.touched = at;
    }
  }
  snapshot(room, player, at) {
    const me = room.members.get(player);
    return {
      code: room.code,
      you: me.slot,
      host: room.host,
      status: room.status,
      mode: room.mode,
      round: room.round,
      seed: room.seed,
      startAt: room.startAt,
      serverAt: at,
      players: [...room.members.values()]
        .sort((a, b) => a.slot - b.slot)
        .map((m) => ({
          slot: m.slot,
          name: m.name,
          look: m.look,
          online: at - m.seen < PARTY_AWAY_MS,
          playing: room.round > 0 && m.round === room.round,
          style: m.style,
          score: m.score,
          combo: m.combo,
          hype: m.hype,
          fever: m.fever,
          hits: m.hits,
          lane: m.lane,
          done: m.done,
          booed: m.booed,
          stars: m.stars,
          cheer: m.cheer,
          cheerKind: m.cheerKind,
        })),
    };
  }
  request(player, action, data) {
    if (!["create", "join", "mode", "start", "tick", "leave"].includes(action))
      fail("Not found.", 404);
    if (!data || typeof data !== "object" || Array.isArray(data))
      fail("Send the party details.");
    const at = this.now();
    this.sweep(at);
    if (action === "create") {
      const mode = data.mode ?? "show";
      if (!PARTY_MODES.includes(mode)) fail("Choose Show or Encore.");
      this.remove(player);
      if (this.rooms.size >= PARTY_ROOM_CAP)
        fail("The stage is busy. Try again shortly.", 429);
      let code;
      do {
        code = Array.from(
          { length: 4 },
          () => PARTY_CODE_LETTERS[this.random(PARTY_CODE_LETTERS.length)],
        ).join("");
      } while (this.rooms.has(code));
      const room = {
        code,
        host: 0,
        status: "waiting",
        mode,
        round: 0,
        seed: 0,
        startAt: 0,
        touched: at,
        members: new Map(),
      };
      this.rooms.set(code, room);
      try {
        this.seat(room, player, at);
      } catch (error) {
        this.rooms.delete(code);
        throw error;
      }
      return this.snapshot(room, player, at);
    }
    if (action === "join") {
      const tries = this.joins.get(player) || { n: 0, until: at + 60000 };
      this.joins.set(player, tries);
      if (++tries.n > PARTY_JOINS_A_MINUTE)
        fail("Please wait before trying another code.", 429);
      const code = typeof data.code === "string" ? partyCode(data.code) : null;
      const room = code ? this.rooms.get(code) : null;
      // One answer for a wrong code and for a party with a blocked player in it.
      const closed = () => fail("That party code is not open.", 404);
      if (!room) closed();
      if (!room.members.has(player)) {
        if ([...room.members.keys()].some((m) => this.blocked(player, m)))
          closed();
        if (room.members.size >= PARTY_CAP) fail("That party is full.", 409);
        this.remove(player);
        this.seat(room, player, at);
      }
      room.members.get(player).seen = at;
      this.settle(room, at);
      return this.snapshot(room, player, at);
    }
    const room = this.rooms.get(this.seats.get(player));
    if (action === "leave") {
      if (room) this.drop(room, player);
      return { ok: true };
    }
    if (!room) fail("This party has ended.", 404);
    const me = room.members.get(player);
    if (action === "tick") {
      if (at - me.tickAt < PARTY_TICK_MIN_MS) fail("Please slow down.", 429);
      me.tickAt = at;
      me.seen = at;
      if (whole(data.style, 0, 3)) me.style = data.style;
      if (
        whole(data.cheer, 0, PARTY_CHEERS.length - 1) &&
        at - me.cheerAt > 800
      ) {
        me.cheer++;
        me.cheerKind = data.cheer;
        me.cheerAt = at;
      }
      // Only the round being played, and only once the song has begun.
      if (
        room.status === "running" &&
        data.round === room.round &&
        me.round === room.round &&
        at >= room.startAt &&
        !me.done
      ) {
        if (whole(data.score, 0, SCORE_LIMIT))
          me.score = Math.max(me.score, data.score);
        if (whole(data.combo, 0, 999)) me.combo = data.combo;
        if (typeof data.hype === "number" && data.hype >= 0 && data.hype <= 1)
          me.hype = data.hype;
        if (typeof data.fever === "boolean") me.fever = data.fever;
        if (whole(data.hits, 0, 999)) me.hits = Math.max(me.hits, data.hits);
        if (whole(data.lane, 0, 3)) me.lane = data.lane;
        if (data.booed === true) me.booed = true;
        if (data.done === true) {
          me.done = true;
          me.fever = false;
          if (whole(data.stars, 0, 3)) me.stars = data.stars;
        }
      }
    } else {
      me.seen = at;
      if (me.slot !== room.host) fail("The host runs the party.", 403);
      this.settle(room, at);
      if (room.status === "running") fail("Wait for this show to finish.", 409);
      if (action === "mode") {
        if (!PARTY_MODES.includes(data.mode)) fail("Choose Show or Encore.");
        room.mode = data.mode;
      } else {
        const here = [...room.members.values()].filter(
          (m) => at - m.seen < PARTY_AWAY_MS,
        );
        if (here.length < 2) fail("Wait for a friend to join.", 409);
        room.round++;
        room.seed = this.random(2 ** 31);
        room.startAt = at + PARTY_COUNTDOWN_MS;
        room.status = "running";
        for (const m of here)
          Object.assign(m, this.blank(), { round: room.round });
      }
      room.touched = at;
    }
    this.settle(room, at);
    return this.snapshot(room, player, at);
  }
}
