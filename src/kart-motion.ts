import { Group } from "three";

// The chase camera looks along local +Z: local +X is the driver's left.
export function kartSteeringInput(left: boolean, right: boolean): number {
  return Number(left) - Number(right);
}

export const KART_WHEEL_RADIUS = 0.31;

export class KartWheel {
  readonly steering = new Group();
  readonly rolling = new Group();
  private readonly front: boolean;

  constructor(x: number, z: number) {
    this.front = z > 0;
    this.steering.position.set(x, 0.29, z);
    this.steering.add(this.rolling);
  }

  pose(distance: number, steer: number) {
    this.steering.rotation.y = this.front ? steer * 0.24 : 0;
    // Roll around the axle, independently of the front wheels' steering.
    this.rolling.rotation.x = distance / KART_WHEEL_RADIUS;
  }
}
