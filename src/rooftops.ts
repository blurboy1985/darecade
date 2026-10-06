/** Stable collectible IDs; the server caps each reward to once per Singapore day. */
export const rooftops = [
  {
    id: "arcade",
    name: "Arcade roof",
    x: -7,
    z: -10.5,
    y: 5.3,
    w: 18,
    d: 2.8,
    pad: [-7, -5.8],
  },
  {
    id: "shop",
    name: "Mama Shop roof",
    x: 12,
    z: -8,
    y: 4.4,
    w: 7,
    d: 6,
    pad: [8, -4],
  },
  {
    id: "dragon",
    name: "Dragon rooftop",
    x: 11,
    z: 10,
    y: 2.8,
    w: 5,
    d: 3,
    pad: [7, 8],
  },
] as const;
