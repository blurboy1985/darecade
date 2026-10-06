import { api, type SharedPlayer } from "./social";
import { activityIds, type ActivityId } from "./catalog";

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

export class WorldConnection {
  private socket?: WebSocket;
  private timer?: ReturnType<typeof setTimeout>;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private tick?: ReturnType<typeof setInterval>;
  private handshake?: ReturnType<typeof setTimeout>;
  private players = new Map<number, SharedPlayer>();
  private failures = 0;
  private stopped = true;
  private previous = "";
  private polling = false;
  private world = "";
  private connection = crypto.randomUUID();
  private generation = 0;
  private lastReceived = 0;
  constructor(
    private position: () => Movement,
    private update: (players: SharedPlayer[]) => void,
    private changed: (world: string) => void = () => {},
    private status: (
      state: "joining" | "connected" | "reconnecting" | "offline",
    ) => void = () => {},
  ) {}
  async join(world: string) {
    if (world === this.world && !this.stopped) return;
    const connection = crypto.randomUUID();
    // Claim a place before closing the old transport. A full destination leaves us connected.
    const packet = await api<Packet>(
      `world/poll?world=${encodeURIComponent(world)}&connection=${connection}`,
      this.position(),
    );
    this.stop(false);
    this.connection = connection;
    this.world = world;
    this.failures = 0;
    this.polling = false;
    this.previous = "";
    this.receive(packet);
    this.start();
  }
  refreshSession() {
    this.stop(false);
    this.connection = crypto.randomUUID();
    this.failures = 0;
    this.polling = false;
    this.previous = "";
    this.start();
  }
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.generation++;
    if (Date.now() - this.lastReceived > 6000)
      this.status(this.world ? "reconnecting" : "joining");
    // HTTP assigns the room immediately, including on hosts without sockets.
    // A stale bootstrap must never replace a refreshed session or chosen room.
    void this.bootstrap();
    // A small margin avoids losing alternating updates to network timer jitter.
    this.tick = setInterval(() => this.send(), 210);
  }
  private async bootstrap() {
    const connection = this.connection;
    const generation = this.generation;
    try {
      const suffix =
        `?connection=${connection}` +
        (this.world ? `&world=${encodeURIComponent(this.world)}` : "");
      const packet = await api<Packet>(`world/poll${suffix}`, this.position());
      if (
        this.stopped ||
        connection !== this.connection ||
        generation !== this.generation
      )
        return;
      this.receive(packet);
      this.startPolling();
    } catch {
      if (
        this.stopped ||
        connection !== this.connection ||
        generation !== this.generation
      )
        return;
      this.status("offline");
    }
    this.connect();
  }
  stop(notify = true) {
    this.stopped = true;
    this.generation++;
    this.polling = false;
    clearTimeout(this.timer);
    clearTimeout(this.pollTimer);
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
        if (this.socket !== ws || this.stopped) return;
        try {
          const packet = JSON.parse(event.data);
          clearTimeout(this.handshake);
          if (packet.t === "closed") {
            this.stop(false);
            return;
          }
          this.receive(packet);
          this.polling = false;
          this.generation++;
          clearTimeout(this.pollTimer);
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
        this.startPolling();
        if (Date.now() - this.lastReceived > 6000) this.status("reconnecting");
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
      this.startPolling();
    } else
      this.timer = setTimeout(
        () => this.connect(),
        Math.min(15000, 1000 * 2 ** this.failures) + Math.random() * 250,
      );
  }
  private startPolling() {
    if (this.polling || this.stopped) return;
    this.polling = true;
    const generation = ++this.generation;
    this.pollTimer = setTimeout(() => void this.poll(generation), 2000);
  }
  private send() {
    if (this.socket?.readyState !== WebSocket.OPEN) return;
    const message = JSON.stringify(this.position());
    if (message !== this.previous) {
      this.socket.send(message);
      this.previous = message;
    }
  }
  private async poll(generation = this.generation) {
    if (this.stopped || !this.polling || generation !== this.generation) return;
    const connection = this.connection;
    try {
      const suffix =
        `?connection=${this.connection}` +
        (this.world ? `&world=${this.world}` : "");
      const packet = await api<Packet>(`world/poll${suffix}`, this.position());
      if (
        this.stopped ||
        !this.polling ||
        connection !== this.connection ||
        generation !== this.generation
      )
        return;
      this.receive(packet);
    } catch {
      if (
        !this.stopped &&
        this.polling &&
        connection === this.connection &&
        generation === this.generation
      )
        if (Date.now() - this.lastReceived > 6000) this.status("offline");
    }
    if (
      !this.stopped &&
      this.polling &&
      connection === this.connection &&
      generation === this.generation
    )
      this.pollTimer = setTimeout(() => void this.poll(generation), 2000);
  }
  private receive(packet: Packet) {
    if (packet.t !== "sync" && packet.t !== "delta") return;
    this.lastReceived = Date.now();
    this.status("connected");
    if (packet.world) {
      this.world = packet.world;
      this.changed(this.world);
    }
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
        best: {
          hop: 0,
          brick: 0,
          swarm: 0,
          coast: 0,
          noodle: 0,
          hoops: 0,
          fishing: 0,
        },
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
          activity: activityIds[activity] || "rest",
          status: away ? "resting" : "online",
          emote:
            ["", "wave", "cheer", "dance", "jump", "victory", "think"][emote] ||
            "",
        });
    }
    this.update([...this.players.values()].map((p) => ({ ...p })));
  }
}
