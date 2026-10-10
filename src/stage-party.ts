// Stage Party client: joins a room and polls it, reporting this dancer's show.
import { api } from "./social";
import {
  PARTY_LOBBY_POLL_MS,
  PARTY_POLL_MS,
  clockOffset,
  type PartyMode,
  type PartySnapshot,
  type PartyTick,
} from "../shared/stage-party";

export class PartyClient {
  snapshot: PartySnapshot | null = null;
  /** Server clock minus this browser's, from the quickest reply so far. */
  offset = 0;
  private quickest = Infinity;
  private timer?: ReturnType<typeof setTimeout>;
  private busy = false;
  private failures = 0;
  private cheering: number | undefined;
  constructor(
    private readonly report: () => PartyTick,
    /** Called with every reply, and with null and a reason when the party ends. */
    private readonly changed: (
      snapshot: PartySnapshot | null,
      reason?: string,
    ) => void,
  ) {}
  /** Server time now, as near as this browser can tell. */
  now() {
    return Date.now() + this.offset;
  }
  host(mode: PartyMode) {
    return this.enter("create", { mode });
  }
  join(code: string) {
    return this.enter("join", { code });
  }
  setMode(mode: PartyMode) {
    return this.send("mode", { mode });
  }
  start() {
    return this.send("start", {});
  }
  cheer(kind: number) {
    this.cheering = kind;
  }
  /** Reports now instead of at the next poll: a show has just finished. */
  flush() {
    if (!this.snapshot) return;
    clearTimeout(this.timer);
    void this.poll();
  }
  leave() {
    if (!this.snapshot) return;
    this.end();
    void api("stage/leave", {}).catch(() => {});
  }
  private end(reason?: string) {
    clearTimeout(this.timer);
    this.snapshot = null;
    this.quickest = Infinity;
    this.changed(null, reason);
  }
  private async enter(action: string, data: unknown) {
    this.failures = 0;
    await this.send(action, data);
    this.schedule();
  }
  private async send(action: string, data: unknown) {
    const sent = Date.now();
    const snapshot = await api<PartySnapshot>(`stage/${action}`, data);
    const received = Date.now();
    if (received - sent < this.quickest) {
      this.quickest = received - sent;
      this.offset = clockOffset(sent, received, snapshot.serverAt);
    }
    this.snapshot = snapshot;
    this.changed(snapshot);
  }
  private schedule() {
    clearTimeout(this.timer);
    if (!this.snapshot) return;
    this.timer = setTimeout(
      () => void this.poll(),
      this.snapshot.status === "running" ? PARTY_POLL_MS : PARTY_LOBBY_POLL_MS,
    );
  }
  private async poll() {
    if (this.busy || !this.snapshot) return;
    this.busy = true;
    const tick = this.report();
    if (this.cheering !== undefined) tick.cheer = this.cheering;
    this.cheering = undefined;
    try {
      await this.send("tick", tick);
      this.failures = 0;
    } catch (error) {
      const status = (error as { status?: number }).status;
      // The room has gone, or the network has: either way the party is over.
      if (status === 404 || status === 401 || ++this.failures >= 6)
        this.end(
          status === 404
            ? "The party has ended."
            : "The party lost its connection.",
        );
    }
    this.busy = false;
    this.schedule();
  }
}
