type Position = { x: number; z: number; yaw: number };
type Sample = Position & { at: number };
export class MovementBuffer {
  private samples: Sample[] = [];
  push(position: Position, at: number) {
    const last = this.samples.at(-1);
    if (
      last &&
      last.x === position.x &&
      last.z === position.z &&
      last.yaw === position.yaw
    )
      return;
    this.samples.push({ ...position, at });
    if (this.samples.length > 12) this.samples.shift();
  }
  sample(now: number): Position | undefined {
    const target = now - 150;
    while (this.samples.length > 2 && this.samples[1].at < target)
      this.samples.shift();
    const a = this.samples[0],
      b = this.samples[1];
    if (!a || !b) return a;
    if (now - b.at > 400) return b;
    // At most 50ms extrapolation covers the gap between 200ms network updates.
    const amount = Math.max(
      0,
      Math.min(
        1 + 50 / Math.max(1, b.at - a.at),
        (target - a.at) / Math.max(1, b.at - a.at),
      ),
    );
    const angle = Math.atan2(Math.sin(b.yaw - a.yaw), Math.cos(b.yaw - a.yaw));
    return {
      x: a.x + (b.x - a.x) * amount,
      z: a.z + (b.z - a.z) * amount,
      yaw: a.yaw + angle * amount,
    };
  }
}
