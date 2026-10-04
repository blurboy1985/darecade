import { Group } from "three";

// The chase camera looks along local +Z: local +X is the driver's left.
export function kartSteeringInput(left: boolean, right: boolean): number {
  return Number(left) - Number(right);
}

export const KART_WHEEL_RADIUS = 0.31;

/** Display-only steering; physics still receives the immediate input. */
export class KartSteering {
  private value = 0;

  update(input: number, dt: number): number {
    this.value += (input - this.value) * (1 - Math.exp(-10 * dt));
    return this.value;
  }
}

export class KartWheel {
  readonly steering = new Group();
  private readonly front: boolean;

  constructor(x: number, z: number) {
    this.front = z > 0;
    this.steering.position.set(x, 0.29, z);
  }

  pose(steer: number) {
    this.steering.rotation.y = this.front ? steer * 0.24 : 0;
    // Solid, untextured tyres and rims are rotationally symmetric. Keep their
    // surfaces fixed around the axle so polygon edges cannot strobe at speed.
  }
}
