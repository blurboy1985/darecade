import { Vector3 } from "three";

/** Smooth the orbit, while following all kart translation in the same frame. */
export class RaceCameraFollow {
  private ready = false;
  private readonly previous = new Vector3();

  update(
    position: Vector3,
    kart: Vector3,
    target: Vector3,
    dt: number,
    reduced: boolean,
  ) {
    if (!this.ready) {
      position.copy(target);
      this.ready = true;
    } else {
      position.add(kart).sub(this.previous);
      position.lerp(target, reduced ? 1 : 1 - Math.exp(-dt * 9));
    }
    this.previous.copy(kart);
  }
}
