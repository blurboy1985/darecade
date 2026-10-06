// Append-only IDs: 0–52 retain their original wardrobe meaning.
export const HAIR_START = 53;
export const hairShapes = [
  "spiky",
  "flowing",
  "buns",
  "messy",
  "ponytail",
  "bob",
  "braid",
  "tails",
] as const;
export const hairColours = [
  ["Pink", "#f681af"],
  ["Magenta", "#d936a0"],
  ["Mint", "#50d9b8"],
  ["Green", "#329a60"],
  ["Gold", "#f3c343"],
  ["Red", "#d94342"],
  ["Silver", "#dce5f2"],
  ["Black", "#30283e"],
  ["Brown", "#885136"],
  ["Blue", "#359be9"],
] as const;
export const HAIR_COUNT = hairShapes.length * hairColours.length;
const shapeNames = [
  "spiky cut",
  "long straight hair",
  "twin buns",
  "short messy hair",
  "ponytail",
  "bob with bangs",
  "long braid",
  "twin tails",
];
export const newHairNames = Array.from(
  { length: HAIR_COUNT },
  (_, n) => `${hairColours[Math.floor(n / 8)][0]} ${shapeNames[n % 8]}`,
);
export function hairVisual(index: number) {
  if (index >= HAIR_START && index < HAIR_START + HAIR_COUNT) {
    const n = index - HAIR_START;
    return {
      shape: n % 8,
      colour: Math.floor(n / 8),
      color: hairColours[Math.floor(n / 8)][1],
    };
  }
  const shape =
    index === 38 ? 2 : index === 41 ? 5 : index === 44 ? 7 : index % 8;
  const colors = [
    "#309cf4",
    "#ee446c",
    "#34304e",
    "#c5d4ec",
    "#f5bc28",
    "#be64f0",
    "#f33c98",
    "#26cda6",
  ];
  const color =
    index === 38 ? "#f33c98" : index === 41 ? "#f5bc28" : colors[shape];
  return { shape, colour: [9, 5, 7, 6, 4, 1, 1, 2][shape], color };
}
export const hairKey = (index: number) => {
  const v = hairVisual(index);
  return `${v.shape}:${v.colour}`;
};
