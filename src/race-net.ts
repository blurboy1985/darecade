import { FLAG } from "../shared/race-room";
import {
  CoastRace,
  SPIN_TICKS,
  racer,
  type Hit,
  type RaceItem,
  type Racer,
} from "../shared/racing";
import type { Look } from "./character";

export type RoomState = {
  code: string;
  status: "lobby" | "countdown" | "racing" | "results";
  you: number;
  host: number;
  min: number;
  cap: number;
  players: { name: string; look: Look }[];
};
export type GridKart = {
  name: string;
  color: string;
  pace: number;
  distance: number;
  offset: number;
  /** A player's saved avatar. Computer karts have none. */
  look: Look | null;
};
export type Go = { seed: number; in: number; you: number; karts: GridKart[] };
export type ResultRow = {
  kart: number;
  name: string;
  cpu: boolean;
  ticks: number;
  distance: number;
};
type Handlers = {
  room(state: RoomState): void;
  go(go: Go): void;
  /** An item reached a kart, or a shield turned one away. */
  hit(hit: Hit): void;
  used(kart: number, item: NonNullable<RaceItem>): void;
  end(results: ResultRow[]): void;
  /** The room refused, or the connection dropped. */
  error(message: string): void;
};
const SEND_MS = 66;

/**
 * The browser's side of a multiplayer room. This kart is driven here and
 * reported to the room; every other kart, and every item in flight, is drawn
 * from what the room sends back.
 */
export class RaceNet {
  private socket: WebSocket | null = null;
  private race: CoastRace | null = null;
  private you = 0;
  private targets: ({ d: number; o: number; v: number; at: number } | null)[] =
    [];
  private sentAt = 0;
  private told = false;
  private heard = false;
  private ping = 0;
  private readonly handlers: Handlers;
  constructor(handlers: Handlers) {
    this.handlers = handlers;
  }
  get open() {
    return this.socket?.readyState === WebSocket.OPEN;
  }
  /** Hosts a new room, or joins the one with this code. */
  connect(code: string | null) {
    this.close();
    const url = new URL("/api/race/connect", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    if (code) url.searchParams.set("code", code);
    else url.searchParams.set("host", "1");
    const socket = new WebSocket(url);
    this.socket = socket;
    this.heard = false;
    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      try {
        this.receive(JSON.parse(event.data));
      } catch {
        // One bad packet is skipped; the next snapshot corrects everything.
      }
    };
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      clearInterval(this.ping);
      this.handlers.error(
        this.heard
          ? "The connection to the race was lost."
          : "Could not reach the race. Check your connection and try again.",
      );
    };
    socket.onerror = () => socket.close();
    // Quiet lobbies still need traffic to keep the connection open.
    this.ping = window.setInterval(() => this.send({ t: "ping" }), 20000);
  }
  close() {
    clearInterval(this.ping);
    const socket = this.socket;
    this.socket = null;
    this.race = null;
    socket?.close();
  }
  start() {
    this.send({ t: "start" });
  }
  private send(data: Record<string, unknown>) {
    if (this.open) this.socket!.send(JSON.stringify(data));
  }
  /** This player's race on the grid the room drew. */
  begin(go: Go) {
    this.you = go.you;
    const mine = go.karts[go.you];
    const karts = go.karts
      .filter((_, i) => i !== go.you)
      .map((k) => racer(k.name, k.color, k.pace, k.distance, k.offset));
    this.targets = karts.map(() => null);
    this.sentAt = 0;
    this.told = false;
    this.race = new CoastRace(go.seed, {
      versus: { karts, distance: mine.distance, offset: mine.offset },
    });
    return this.race;
  }
  /** The rival for a kart number, or nothing for this player's own. */
  private rival(kart: number): Racer | undefined {
    return kart === this.you
      ? undefined
      : this.race?.rivals[kart < this.you ? kart : kart - 1];
  }
  private receive(packet: Record<string, any>) {
    this.heard = true;
    if (packet.t === "room") this.handlers.room(packet as RoomState);
    else if (packet.t === "go") this.handlers.go(packet as Go);
    else if (packet.t === "error") {
      // The room said why; its close that follows adds nothing.
      const socket = this.socket;
      this.socket = null;
      clearInterval(this.ping);
      socket?.close();
      this.handlers.error(String(packet.message));
    } else if (packet.t === "end") this.handlers.end(packet.results);
    else if (!this.race) return;
    else if (packet.t === "w") this.snapshot(packet);
    else if (packet.t === "hit") {
      const hit = packet as Hit;
      const race = this.race;
      if (hit.kart === this.you) {
        if (hit.kind === "block") race.blocks++;
        else race.strike(hit.kind, this.rival(hit.by)?.name ?? "You", hit.item);
      } else if (hit.by === this.you && hit.kind === "spin") race.knocks++;
      const rival = this.rival(hit.kart);
      if (rival && hit.kind === "spin") rival.spin = SPIN_TICKS;
      this.handlers.hit(hit);
    } else if (packet.t === "used")
      this.handlers.used(packet.kart, packet.item);
    else if (packet.t === "finish") {
      const rival = this.rival(packet.kart);
      if (rival) rival.finishTick = packet.ticks;
    }
  }
  private snapshot(packet: Record<string, any>) {
    const race = this.race!;
    const now = performance.now();
    (packet.s as number[][]).forEach(([d, o, v, flags, finish], kart) => {
      const rival = this.rival(kart);
      if (!rival) return;
      const index = kart < this.you ? kart : kart - 1;
      if (flags & FLAG.gone) {
        // A player who left takes their kart off the road.
        rival.distance = -1000;
        rival.speed = 0;
        this.targets[index] = null;
        return;
      }
      this.targets[index] = { d, o, v, at: now };
      rival.finishTick = finish;
      rival.boost = flags & FLAG.boost ? 1 : 0;
      rival.shield = flags & FLAG.shield ? 1 : 0;
      rival.slow = flags & FLAG.slow ? 1 : 0;
      if (flags & FLAG.spin) rival.spin ||= SPIN_TICKS;
      rival.drift =
        flags & FLAG.driftLeft ? 1 : flags & FLAG.driftRight ? -1 : 0;
    });
    race.missiles.length = 0;
    for (const [distance, offset, crab] of packet.m as number[][])
      race.missiles.push({
        distance,
        offset,
        crab: !!crab,
        target: -1,
        ticks: 0,
        owner: -1,
      });
    race.coconuts.length = 0;
    for (const [distance, offset] of packet.c as number[][])
      race.coconuts.push({ distance, offset, owner: -1 });
  }
  /**
   * Once a frame: glide every other kart towards where the room last saw it,
   * and tell the room where this one is.
   */
  frame(dt: number) {
    const race = this.race;
    if (!race) return;
    const now = performance.now();
    const pull = 1 - Math.exp(-dt * 10);
    race.rivals.forEach((r, i) => {
      const target = this.targets[i];
      if (r.spin) r.spin = Math.max(0, r.spin - dt * 60);
      if (!target) return;
      // Snapshots are a few frames old, so run them forward at the kart's speed.
      const age = (now - target.at) / 1000;
      const moving = r.finishTick || age > 0.3 ? 0 : target.v;
      const predicted =
        target.d + (r.finishTick ? 0 : target.v * Math.min(age, 0.3));
      r.speed = target.v;
      r.distance += moving * dt;
      r.distance += (predicted - r.distance) * pull;
      r.offset += (target.o - r.offset) * pull;
    });
    for (const m of race.missiles) m.distance += (m.crab ? 95 : 80) * dt;
    for (const item of race.used.splice(0)) this.send({ t: "use", item });
    if (race.ended) {
      if (!this.told)
        this.send(
          race.score ? { t: "finish", ticks: race.ticks } : { t: "done" },
        );
      this.told = true;
      return;
    }
    if (race.ticks && now - this.sentAt >= SEND_MS) {
      this.sentAt = now;
      this.send({
        t: "s",
        s: [
          Math.round(race.distance * 100) / 100,
          Math.round(race.offset * 100) / 100,
          Math.round(race.speed * 10) / 10,
          (race.drifting
            ? race.driftDir > 0
              ? FLAG.driftLeft
              : FLAG.driftRight
            : 0) |
            (race.boost > 0 ? FLAG.boost : 0) |
            (race.shield > 0 ? FLAG.shield : 0) |
            (race.spin ? FLAG.spin : 0) |
            (race.slow ? FLAG.slow : 0),
        ],
      });
    }
  }
}
