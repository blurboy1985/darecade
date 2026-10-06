import type { Replay } from "../shared/simulation";
export type PendingScore = {
  owner: string;
  id: string;
  score: number;
  replay: Replay;
  queuedAt: number;
};
export type ScoreStorage = Pick<Storage, "getItem" | "setItem">;
const key = "simi-pending-scores-v1";
/** Separate from the avatar save. The server's run ID makes every retry idempotent. */
export class ScoreOutbox<T> {
  private entries: PendingScore[] = [];
  private active = new Map<string, Promise<T>>();
  private storage: ScoreStorage;
  private send: (round: PendingScore) => Promise<T>;
  private owner: () => string;
  private saved: (value: T) => void;
  private waiting: (persisted: boolean) => void;
  private pause: (ms: number) => Promise<void>;
  constructor(
    storage: ScoreStorage,
    send: (round: PendingScore) => Promise<T>,
    owner: () => string,
    saved: (value: T) => void,
    waiting: (persisted: boolean) => void,
    pause: (ms: number) => Promise<void> = (ms) =>
      new Promise((r) => setTimeout(r, ms)),
  ) {
    this.storage=storage;this.send=send;this.owner=owner;this.saved=saved;this.waiting=waiting;this.pause=pause;
    try {
      const rows: unknown = JSON.parse(storage.getItem(key) || "[]");
      if (Array.isArray(rows))
        this.entries = rows.filter(
          (p): p is PendingScore =>
            !!p &&
            typeof p.owner === "string" &&
            typeof p.id === "string" &&
            typeof p.score === "number" &&
            typeof p.queuedAt === "number" &&
            p.replay &&
            Array.isArray(p.replay.events),
        );
    } catch {}
  }
  private persist() {
    try {
      this.storage.setItem(key, JSON.stringify(this.entries));
      return true;
    } catch {
      return false;
    }
  }
  submit(round: PendingScore): Promise<T> {
    const prior = this.active.get(round.id);
    if (prior) return prior;
    if (!this.entries.some((p) => p.id === round.id)) {
      this.entries.push(round);
      this.persist();
    }
    const task = this.deliver(round).finally(() =>
      this.active.delete(round.id),
    );
    this.active.set(round.id, task);
    return task;
  }
  resume() {
    for (const round of this.entries)
      if (round.owner === this.owner()) void this.submit(round).catch(() => {});
  }
  private async deliver(round: PendingScore): Promise<T> {
    let attempts = 0;
    while (true) {
      if (round.owner !== this.owner()) {
        await this.pause(30000);
        continue;
      }
      try {
        const result = await this.send(round);
        this.entries = this.entries.filter((p) => p.id !== round.id);
        this.persist();
        this.saved(result);
        return result;
      } catch (error) {
        const status =
          error instanceof Error && "status" in error ? error.status : 0;
        if (
          (typeof status === "number" &&
            status >= 400 &&
            status < 500 &&
            ![408, 429].includes(status)) ||
          Date.now() - round.queuedAt > 86400000
        ) {
          this.entries = this.entries.filter((p) => p.id !== round.id);
          this.persist();
          throw error;
        }
        attempts++;
        if (attempts >= 3) this.waiting(this.persist());
        await this.pause([500, 1500, 4000, 30000][Math.min(attempts - 1, 3)]);
      }
    }
  }
}
