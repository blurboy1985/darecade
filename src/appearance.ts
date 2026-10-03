// Shared by the renderer and server validation; indices remain stable for saved looks.
export const clothingNames = [
  "Ranger tunic",
  "Ranger tunic & cape",
  "Wizard robe",
  "Wizard robe & cape",
  "Knight armour",
  "Knight armour & cape",
  "Explorer furs",
  "Explorer furs & cloak",
];
export const hairNames = [
  "Auburn locks",
  "Neat black crop",
  "Sandy short cut",
  "Grey beard",
  "Green hood",
  "Wizard hat",
  "Knight helmet",
  "Bear hat",
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
  clothing: clothingNames.length,
  hair: hairNames.length,
  pet: petNames.length,
  accessory: accessoryNames.length,
};
