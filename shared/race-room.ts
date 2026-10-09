/**
 * A multiplayer Coast Rush room. No sockets, storage or clock of its own: the
 * host process passes in the time and delivers what `drain` returns.
 *
 * Each player's browser drives its own kart and reports where it is. The room
 * owns the computer karts, every item in flight and the finishing order.
 * Races here are friendly. Nothing in a room reaches progress, medals or boards.
 */
import {
  ITEMS,
  RACE_DISTANCE,
  RACE_TICKS,
  RIVALS,
  RaceField,
  WALL,
  racer,
  type RaceItem,
  type Racer,
} from "./racing.ts";

export const ROOM_CAP = 8;
export const ROOM_MIN = 2;
/** No vowels, so a code never spells a word. */
export const CODE_LETTERS = "BCDFGHJKLMNPQRSTVWXZ";
export const ROOM_CODE = /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/;
/** Three, two, one, with a moment first for every grid to appear. */
export const COUNTDOWN_MS = 4500;
export const SNAPSHOT_MS = 66;
/** The room closes a race this long after the time limit. */
const GRACE_TICKS = 180;
const KART_COLOURS = [
  "#ff927b",
  "#6ec6ff",
  "#ffd166",
  "#9be564",
  "#c792ea",
  "#ff8fab",
  "#4dd0c8",
  "#f4a261",
];
export const FLAG = {
  driftLeft: 1,
  driftRight: 2,
  boost: 4,
  shield: 8,
  spin: 16,
  slow: 32,
  finished: 64,
  gone: 128,
} as const;

export type RoomIdentity = {
  id: string;
  name: string;
  look: unknown;
  blockedIds?: string[];
};
type Member = RoomIdentity & {
  /** Index into the grid while racing, otherwise -1. */
  kart: number;
  flags: number;
  /** Stopped racing: finished, timed out or left. */
  done: boolean;
  stateAt: number;
  usedAt: number;
  recent: number[];
};
export type Outgoing = { to: string | null; data: Record<string, unknown> };
export type RoomStatus = "lobby" | "countdown" | "racing" | "results";

export function roomCode(random: () => number = Math.random) {
  return Array.from(
    { length: 4 },
    () => CODE_LETTERS[Math.floor(random() * CODE_LETTERS.length)],
  ).join("");
}
/** Where kart `index` lines up: two abreast, drivers ahead of computer karts. */
export function gridPlace(index: number) {
  return {
    distance: 10.5 - Math.floor(index / 2) * 3,
    offset: index % 2 ? -2.2 : 2.2,
  };
}
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, low: number, high: number) =>
  Math.max(low, Math.min(high, value));

export class RaceRoom {
  readonly code: string;
  status: RoomStatus = "lobby";
  host = "";
  readonly members = new Map<string, Member>();
  karts: Racer[] = [];
  field: RaceField | null = null;
  private drivers: (Member | null)[] = [];
  private startAt = 0;
  private snapshotAt = 0;
  private out: Outgoing[] = [];
  private readonly random: () => number;
  constructor(code: string, random: () => number = Math.random) {
    this.code = code;
    this.random = random;
  }
  get empty() {
    return !this.members.size;
  }
  /** Messages queued since the last call. `to` is a player id, or null for everyone. */
  drain() {
    const out = this.out;
    this.out = [];
    return out;
  }
  private send(to: string | null, data: Record<string, unknown>) {
    this.out.push({ to, data });
  }
  /** Returns why the player cannot join, or nothing once they are in. */
  join(identity: RoomIdentity, now: number) {
    this.advance(now);
    const blocked = identity.blockedIds ?? [];
    if (!this.members.has(identity.id)) {
      // A blocked pair never learns the other is here.
      for (const member of this.members.values())
        if (
          blocked.includes(member.id) ||
          member.blockedIds?.includes(identity.id)
        )
          return "No race with that code.";
      if (this.status === "countdown" || this.status === "racing")
        return "That race has already started. Join the next one.";
      if (this.members.size >= ROOM_CAP) return "That race is full.";
      this.members.set(identity.id, {
        ...identity,
        kart: -1,
        flags: 0,
        done: false,
        stateAt: 0,
        usedAt: 0,
        recent: [],
      });
    } else
      Object.assign(this.members.get(identity.id)!, {
        name: identity.name,
        look: identity.look,
      });
    this.host ||= identity.id;
    this.announce();
    return "";
  }
  leave(id: string, now: number) {
    const member = this.members.get(id);
    if (!member) return;
    this.advance(now);
    this.members.delete(id);
    if (member.kart >= 0 && this.karts[member.kart]) {
      // The kart leaves the road: nothing can hit it or rank behind it.
      const kart = this.karts[member.kart];
      kart.distance = -1000;
      kart.speed = 0;
      member.flags = FLAG.gone;
      member.done = true;
    }
    if (this.host === id) this.host = this.members.keys().next().value ?? "";
    if (this.empty) return;
    // If that was the last kart still racing, the results carry the news.
    const status = this.status;
    this.settle(now);
    if (this.status === status) this.announce();
  }
  private announce() {
    const players = [...this.members.values()];
    players.forEach((member, index) =>
      this.send(member.id, {
        t: "room",
        code: this.code,
        status: this.status,
        you: index,
        host: players.findIndex((p) => p.id === this.host),
        min: ROOM_MIN,
        cap: ROOM_CAP,
        players: players.map((p) => ({ name: p.name, look: p.look })),
      }),
    );
  }
  receive(id: string, data: unknown, now: number) {
    const member = this.members.get(id);
    if (!member || !data || typeof data !== "object" || Array.isArray(data))
      return;
    // Sixty messages a second is four times what a kart sends.
    member.recent = member.recent.filter((at) => at > now - 1000);
    if (member.recent.length >= 60) return;
    member.recent.push(now);
    const message = data as Record<string, unknown>;
    this.advance(now);
    if (message.t === "ping") this.send(id, { t: "pong" });
    else if (message.t === "start") this.start(id, now);
    else if (this.status !== "racing" || member.kart < 0 || member.done) return;
    else if (message.t === "s") this.report(member, message.s, now);
    else if (message.t === "use") this.use(member, message.item, now);
    else if (message.t === "finish" || message.t === "done")
      this.finish(member, message.t === "finish" ? message.ticks : 0);
    this.settle(now);
  }
  private start(id: string, now: number) {
    if (
      id !== this.host ||
      (this.status !== "lobby" && this.status !== "results")
    )
      return;
    if (this.members.size < ROOM_MIN) {
      this.send(id, {
        t: "error",
        message: `A race needs at least ${ROOM_MIN} players.`,
      });
      return;
    }
    const players = [...this.members.values()];
    const cpus = RIVALS.slice(0, ROOM_CAP - players.length);
    this.karts = [
      ...players.map((p, i) => {
        const at = gridPlace(i);
        return racer(p.name, KART_COLOURS[i], 0, at.distance, at.offset);
      }),
      ...cpus.map((r, i) => {
        const at = gridPlace(players.length + i);
        return racer(r.name, r.color, r.pace, at.distance, at.offset);
      }),
    ];
    this.drivers = this.karts.map((_, i) => players[i] ?? null);
    players.forEach((p, i) =>
      Object.assign(p, { kart: i, flags: 0, done: false, stateAt: 0 }),
    );
    const seed = Math.floor(this.random() * 0x7fffffff);
    this.field = new RaceField(this.karts, seed, true);
    this.status = "countdown";
    this.startAt = now + COUNTDOWN_MS;
    this.snapshotAt = 0;
    for (const p of players)
      this.send(p.id, {
        t: "go",
        seed,
        in: COUNTDOWN_MS,
        you: p.kart,
        karts: this.karts.map((k, i) => ({
          name: k.name,
          color: k.color,
          pace: k.pace,
          distance: k.distance,
          offset: k.offset,
          look: this.drivers[i]?.look ?? null,
        })),
      });
    this.announce();
  }
  /** A kart says where it is. The room keeps it on the road and moving forwards at a plausible speed. */
  private report(member: Member, state: unknown, now: number) {
    if (!Array.isArray(state) || state.length !== 4 || !state.every(finite))
      return;
    const kart = this.karts[member.kart];
    const [distance, offset, speed, flags] = state as number[];
    const elapsed = member.stateAt
      ? clamp((now - member.stateAt) / 1000, 0, 2)
      : 2;
    kart.distance = clamp(
      distance,
      kart.distance - 0.5,
      Math.min(RACE_DISTANCE - 0.01, kart.distance + 40 * elapsed + 3),
    );
    kart.offset = clamp(offset, -WALL, WALL);
    kart.speed = clamp(speed, 0, 40);
    member.flags = Math.floor(clamp(flags, 0, 63));
    kart.shield = member.flags & FLAG.shield ? 1 : 0;
    kart.boost = member.flags & FLAG.boost ? 1 : 0;
    kart.spin = member.flags & FLAG.spin ? 1 : 0;
    kart.slow = member.flags & FLAG.slow ? 1 : 0;
    member.stateAt = now;
  }
  private use(member: Member, item: unknown, now: number) {
    if (!ITEMS.includes(item as never) || now - member.usedAt < 400) return;
    member.usedAt = now;
    this.field!.use(member.kart, item as NonNullable<RaceItem>);
  }
  private finish(member: Member, ticks: unknown) {
    const kart = this.karts[member.kart];
    member.done = true;
    // A finish counts only from a kart the room saw reach the last straight.
    if (
      finite(ticks) &&
      ticks > 0 &&
      kart.distance > RACE_DISTANCE - 80 &&
      this.field!.ticks > 600
    ) {
      kart.finishTick = Math.round(
        clamp(ticks, this.field!.ticks - 240, this.field!.ticks + 60),
      );
      kart.distance = RACE_DISTANCE;
      kart.speed = 0;
    }
    this.send(null, {
      t: "finish",
      kart: member.kart,
      ticks: kart.finishTick,
      place: kart.finishTick ? this.field!.place(member.kart) : 0,
    });
  }
  /** Brings the room up to `now`: the countdown, the field's ticks and their hits. */
  advance(now: number) {
    if (this.status === "countdown" && now >= this.startAt)
      this.status = "racing";
    if (this.status !== "racing" || !this.field) return;
    const target = Math.min(
      RACE_TICKS + GRACE_TICKS,
      Math.floor(((now - this.startAt) * 60) / 1000),
    );
    while (this.field.ticks < target) this.field.step();
    this.relay();
  }
  /** Tells everyone which items were used and what they hit. */
  private relay() {
    if (!this.field) return;
    for (const use of this.field.uses) this.send(null, { t: "used", ...use });
    for (const hit of this.field.hits) this.send(null, { t: "hit", ...hit });
    this.field.uses.length = 0;
    this.field.hits.length = 0;
  }
  /** Ends the race once no driver is still racing, and sends positions when due. */
  private settle(now: number) {
    if (this.status !== "racing" || !this.field) return;
    this.relay();
    const racing = this.drivers.some((d) => d && !d.done);
    if (!racing || this.field.ticks >= RACE_TICKS + GRACE_TICKS) {
      this.status = "results";
      for (const member of this.members.values()) member.kart = -1;
      this.send(null, { t: "end", results: this.results() });
      this.announce();
      return;
    }
    if (now - this.snapshotAt < SNAPSHOT_MS) return;
    this.snapshotAt = now;
    this.send(null, {
      t: "w",
      k: this.field.ticks,
      s: this.karts.map((k, i) => [
        Math.round(k.distance * 100) / 100,
        Math.round(k.offset * 100) / 100,
        Math.round(k.speed * 10) / 10,
        this.flags(i),
        k.finishTick,
      ]),
      m: this.field.missiles.map((m) => [
        Math.round(m.distance * 10) / 10,
        Math.round(m.offset * 10) / 10,
        Number(m.crab),
      ]),
      c: this.field.coconuts.map((c) => [
        Math.round(c.distance * 10) / 10,
        Math.round(c.offset * 10) / 10,
      ]),
    });
  }
  private flags(index: number) {
    const kart = this.karts[index];
    const driver = this.drivers[index];
    return (
      (driver
        ? driver.flags
        : (kart.boost > 0 ? FLAG.boost : 0) |
          (kart.shield > 0 ? FLAG.shield : 0) |
          (kart.spin ? FLAG.spin : 0) |
          (kart.slow ? FLAG.slow : 0)) | (kart.finishTick ? FLAG.finished : 0)
    );
  }
  /** Finishers by time, then everyone else by how far they got. Karts that left are not listed. */
  results() {
    return this.karts
      .map((k, kart) => ({
        kart,
        name: k.name,
        cpu: k.pace > 0,
        ticks: k.finishTick,
        distance: Math.round(k.distance),
      }))
      .filter((row) => row.distance >= 0)
      .sort(
        (a, b) =>
          (a.ticks || Infinity) - (b.ticks || Infinity) ||
          b.distance - a.distance,
      );
  }
}
