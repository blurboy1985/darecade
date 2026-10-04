import { trackPoint, type CoastRace } from "../shared/racing.ts";

type Position = { distance: number; offset: number };
type Frame = Position & { rivals: Position[] };
const position = ({ distance, offset }: Position): Position => ({
  distance,
  offset,
});

/** One tick of visual interpolation. Never changes physics or recorded inputs. */
export class RaceMotion {
  private previous: Frame | null = null;

  capture(race: CoastRace) {
    this.previous = { ...position(race), rivals: race.rivals.map(position) };
  }

  sample(race: CoastRace, fraction: number): Frame {
    const alpha = Math.max(0, Math.min(1, fraction));
    const blend = (before: Position, after: Position): Position => ({
      distance: before.distance + (after.distance - before.distance) * alpha,
      offset: before.offset + (after.offset - before.offset) * alpha,
    });
    return {
      ...blend(this.previous ?? race, race),
      rivals: race.rivals.map((r, i) =>
        blend(this.previous?.rivals[i] ?? r, r),
      ),
    };
  }
}

/** Centre-line chord gives continuous visual headings across physics segments. */
export function raceTrackPose(distance: number, offset: number) {
  const centre = trackPoint(distance);
  const before = trackPoint(distance - 1);
  const after = trackPoint(distance + 1);
  const yaw = Math.atan2(after.x - before.x, after.z - before.z);
  return {
    x: centre.x + Math.cos(yaw) * offset,
    z: centre.z - Math.sin(yaw) * offset,
    yaw,
  };
}
