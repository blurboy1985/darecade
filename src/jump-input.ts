export const isJumpKey = (key: string) => key === " " || key === "Space";
export class JumpInput {
  private pendingUntil = 0;
  press(now = performance.now()) {
    this.pendingUntil = now + 180;
  }
  take(grounded: boolean, now = performance.now()) {
    if (!grounded || now > this.pendingUntil || !this.pendingUntil)
      return false;
    this.pendingUntil = 0;
    return true;
  }
  clear() {
    this.pendingUntil = 0;
  }
}
