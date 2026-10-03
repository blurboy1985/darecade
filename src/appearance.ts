// Shared by the renderer and server validation; indices remain stable for saved looks.
export const genderNames = ["Not specified", "Girl", "Boy", "Non-binary"];
export const clothingNames = [
  "Weekend hoodie",
  "Arcade varsity",
  "Trail explorer",
  "Everyday tee",
  "Petal dress",
  "Cloud cardigan",
  "Sport club",
  "Starlight jacket",
];
export const hairNames = [
  "Side-swept waves",
  "Soft double buns",
  "Close crop",
  "Silky long layers",
  "Rounded bob",
  "High ponytail",
  "Cloud curls",
  "Twin braids",
];
export const petNames = [
  "No companion",
  "Mochi the cat",
  "Biscuit the pup",
  "Little cloudbot",
  "Peaches the bunny",
  "Ember the fox",
  "Bean the dragon",
  "Luna the owl",
];
export const accessoryNames = [
  "Keep it simple",
  "Orbiting stars",
  "Butterfly wings",
  "Firefly friends",
  "Moon halo",
  "Crystal crown",
  "Rainbow ribbon",
  "Bubble spell",
];
export const appearanceLimits = {
  gender: genderNames.length,
  clothing: clothingNames.length,
  hair: hairNames.length,
  pet: petNames.length,
  accessory: accessoryNames.length,
};
