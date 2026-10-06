type Point = { x: number; z: number };

/** Fixed movement ticks; only the displayed pose is interpolated. */
export class WorldMotion {
  private previous: Point | null = null;
  private current: Point | null = null;
  private remainder = 0;
  reset() {
    this.current = this.previous = null;
    this.remainder = 0;
  }
  sample(point: Point, dt: number, step: (dt: number) => void) {
    const tick = 1 / 60;
    if (!this.current || !this.previous)
      this.current = this.previous = { x: point.x, z: point.z };
    point.x = this.current.x;
    point.z = this.current.z;
    this.remainder += Math.min(dt, 0.1);
    while (this.remainder >= tick) {
      this.previous = { ...this.current };
      step(tick);
      this.current = { x: point.x, z: point.z };
      this.remainder -= tick;
    }
    const alpha = this.remainder / tick;
    point.x = this.previous.x + (this.current.x - this.previous.x) * alpha;
    point.z = this.previous.z + (this.current.z - this.previous.z) * alpha;
  }
}
