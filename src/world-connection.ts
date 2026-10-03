import { api, type SharedPlayer } from "./social";
import type { ActivityId } from "./catalog";

type Movement = {
  x?: number;
  z?: number;
  yaw?: number;
  activity: ActivityId;
  away: boolean;
  emote?: string;
};
type Packet = {
  t: "sync" | "delta";
  at: number;
  world?: string;
  p: [number, string, string, SharedPlayer["look"]][];
  d: number[][];
  gone: number[];
};
const activities: ActivityId[] = ["jog", "dragon", "dance", "rest", "arcade"];

export class WorldConnection {
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private tick?: ReturnType<typeof setInterval>;
  private handshake?: ReturnType<typeof setTimeout>;
  private players = new Map<number, SharedPlayer>();
  private failures = 0;
  private stopped = true;
  private previous = "";
  private polling = false;
  private world = "";
  private connection = crypto.randomUUID();
  constructor(
    private position: () => Movement,
    private update: (players: SharedPlayer[]) => void,
  ) {}
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
    // A small margin avoids losing alternating updates to network timer jitter.
    this.tick = setInterval(() => this.send(), 210);
  }
  stop(notify = true) {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.handshake);
    clearInterval(this.tick);
    this.socket?.close();
    this.socket = undefined;
    if (notify && this.world)
      navigator.sendBeacon(
        `/api/world/leave?world=${this.world}&connection=${this.connection}`,
        new Blob(["{}"], { type: "application/json" }),
      );
    this.players.clear();
    this.update([]);
  }
  private connect() {
    if (this.stopped) return;
    const url = new URL("/api/world/connect", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    if (this.world) url.searchParams.set("world", this.world);
    url.searchParams.set("connection", this.connection);
    let opened = false;
    try {
      const ws = new WebSocket(url);
      this.socket = ws;
      this.handshake = setTimeout(() => ws.close(), 8000);
      ws.onmessage = (event) => {
        try {
          const packet = JSON.parse(event.data);
          clearTimeout(this.handshake);
          if (packet.t === "closed") {
            this.stop(false);
            return;
          }
          this.receive(packet);
          opened = true;
          this.failures = 0;
        } catch {
          ws.close();
        }
      };
      ws.onopen = () => {
        this.previous = "";
        this.send();
      };
      ws.onclose = () => {
        clearTimeout(this.handshake);
        if (this.stopped || this.socket !== ws) return;
        this.socket = undefined;
        // An established session reconnects; two failed attempts enable polling.
        if (!opened) this.failures++;
        this.retry();
      };
      ws.onerror = () => ws.close();
    } catch {
      this.failures++;
      this.retry();
    }
  }
  private retry() {
    if (this.failures >= 2) {
      this.polling = true;
      void this.poll();
    } else
      this.timer = setTimeout(
        () => this.connect(),
        Math.min(15000, 1000 * 2 ** this.failures) + Math.random() * 250,
      );
  }
  private send() {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const message = JSON.stringify(this.position());
    if (message !== this.previous) {
      this.socket.send(message);
      this.previous = message;
    }
  }
  private async poll() {
    if (this.stopped || !this.polling) return;
    try {
      const suffix =
        `?connection=${this.connection}` +
        (this.world ? `&world=${this.world}` : "");
      this.receive(await api<Packet>(`world/poll${suffix}`, this.position()));
    } catch {
      /* State refresh handles expired sessions and offline notices. */
    }
    if (!this.stopped) this.timer = setTimeout(() => void this.poll(), 2000);
  }
  private receive(packet: Packet) {
    if (packet.t !== "sync" && packet.t !== "delta") return;
    if (packet.world) this.world = packet.world;
    if (packet.t === "sync") this.players.clear();
    for (const slot of packet.gone) this.players.delete(slot);
    for (const [slot, id, name, look] of packet.p)
      this.players.set(slot, {
        id,
        name,
        look,
        x: 0,
        z: 0,
        yaw: 0,
        activity: "rest",
        status: "online",
        since: Date.now(),
        best: { hop: 0, brick: 0, swarm: 0, coast: 0, noodle: 0 },
        points: 0,
        incoming: 0,
        outgoing: 0,
        wins: 0,
      });
    for (const [slot, x, z, yaw, activity, away, emote] of packet.d) {
      const p = this.players.get(slot);
      if (p)
        Object.assign(p, {
          x: x / 100,
          z: z / 100,
          yaw: yaw / 100,
          activity: activities[activity] || "rest",
          status: away ? "resting" : "online",
          emote:
            ["", "wave", "cheer", "dance", "jump", "victory", "think"][emote] ||
            "",
        });
    }
    this.update([...this.players.values()].map((p) => ({ ...p })));
  }
}
