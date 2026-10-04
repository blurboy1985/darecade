import { settle } from "./move";
// Nothing in the game may read a save or call the server before a move ends.
if (await settle()) await import("./main");
