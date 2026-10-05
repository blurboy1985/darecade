import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Materialize the exact pre-art renderer without editing another checkout.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ref = process.argv[2] || "665603f840c37aa86ceefea21da0dafc1a23774c";
const git = (...args) => execFileSync("git", args, { cwd: root });
git("rev-parse", "--verify", `${ref}^{commit}`);
for (const file of git("ls-tree", "-r", "--name-only", ref, "src", "shared")
  .toString()
  .trim()
  .split("\n")) {
  const target = resolve(
    root,
    ".browser",
    file.startsWith("src/") ? "baseline/" + file.slice(4) : file,
  );
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, git("show", `${ref}:${file}`));
}
writeFileSync(
  resolve(root, ".browser/baseline/review-entry.ts"),
  "export * from './character';\nexport { LobbyWorld } from './world';\n",
);
console.log(`Art baseline prepared from ${ref}`);
