import type { ActivityId } from "./catalog.ts";
export const residents = [
  {
    id: "sunny",
    name: "Sunny Otter 12",
    outfit: 4,
    skin: 1,
    hat: 1,
    activity: "jog",
    bio: "One more lap, then one more round.",
  },
  {
    id: "cosmic",
    name: "Cosmic Cat 08",
    outfit: 1,
    skin: 2,
    hat: 2,
    activity: "dragon",
    bio: "Never too old for the dragon slide.",
  },
  {
    id: "panda",
    name: "Brave Panda 31",
    outfit: 3,
    skin: 3,
    hat: 3,
    activity: "dance",
    bio: "The plaza is my dance floor.",
  },
  {
    id: "mellow",
    name: "Mellow Fox 19",
    outfit: 2,
    skin: 0,
    hat: 1,
    activity: "rest",
    bio: "Taking the scenic route, eventually.",
  },
  {
    id: "mint",
    name: "Mint Gecko 42",
    outfit: 0,
    skin: 4,
    hat: 2,
    activity: "arcade",
    bio: "Currently chasing a personal best.",
  },
] as const;
export type ActivityPose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  gait: number;
  sit: boolean;
  arms: number;
};
// Time-based activity snapshots can be reconstructed after re-entry without a background timer.
export function activityPose(id: ActivityId, seconds: number): ActivityPose {
  const t = Math.max(0, seconds);
  let pose: ActivityPose = {
    x: 5,
    y: 0.1,
    z: 3,
    yaw: 0,
    gait: 0,
    sit: false,
    arms: 0,
  };
  if (id === "jog") {
    const points = [
        [-18, 3],
        [-8, 3],
        [-8, 13],
        [-18, 13],
      ],
      phase = (t % 16) / 4,
      index = Math.floor(phase),
      u = phase - index,
      a = points[index],
      b = points[(index + 1) % 4];
    pose = {
      ...pose,
      x: a[0] + (b[0] - a[0]) * u,
      z: a[1] + (b[1] - a[1]) * u,
      yaw: Math.atan2(b[0] - a[0], b[1] - a[1]),
      gait: Math.sin(t * 11) * 0.7,
    };
  } else if (id === "dragon") {
    const points = [
        [14.4, 0.1, 11.5],
        [14.5, 0.3, 7.35],
        [12.15, 0.3, 7.35],
        [12.15, 1.61, 9.55],
        [12.15, 1.61, 10],
        [14.1, 0.47, 10],
        [14.4, 0.1, 11.5],
      ],
      durations = [2, 1.5, 2.5, 1, 1.7, 1.5];
    let phase = t % 10.2;
    let i = 0;
    while (i < durations.length - 1 && phase >= durations[i]) {
      phase -= durations[i];
      i++;
    }
    const u = phase / durations[i],
      a = points[i],
      b = points[i + 1];
    pose = {
      ...pose,
      x: a[0] + (b[0] - a[0]) * u,
      y: a[1] + (b[1] - a[1]) * u,
      z: a[2] + (b[2] - a[2]) * u,
      yaw: Math.atan2(b[0] - a[0], b[2] - a[2]),
      gait: i === 4 ? 0 : Math.sin(t * 9) * 0.45,
      sit: i === 4,
      arms: i === 4 ? 1.2 : 0,
    };
  } else if (id === "dance") {
    pose = {
      ...pose,
      x: 5.8,
      z: 3.3,
      y: 0.1 + Math.abs(Math.sin(t * 4)) * 0.13,
      yaw: Math.sin(t) * 1.4,
      gait: Math.sin(t * 5) * 0.3,
      arms: 1.2 + Math.sin(t * 4) * 0.65,
    };
  } else if (id === "rest") {
    pose = { ...pose, x: -13, z: 6, y: 0.25, sit: true, arms: 0.15 };
  } else {
    pose = { ...pose, x: 1.3, z: -6.8, yaw: Math.PI, arms: 0.65 };
  }
  return pose;
}
