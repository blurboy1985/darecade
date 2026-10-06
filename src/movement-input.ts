/** A press must survive at least one simulation frame, even between RAFs. */
export class MovementInput {
  private remaining = new Map<string, number>();
  press(key: string) {
    this.remaining.set(key, 0.08);
  }
  sample(held: Set<string>, dt: number) {
    const active = new Set(held);
    for (const [key, time] of this.remaining) {
      if (time > 0) active.add(key);
      if (time <= dt) this.remaining.delete(key);
      else this.remaining.set(key, time - dt);
    }
    return active;
  }
  clear() {
    this.remaining.clear();
  }
}
