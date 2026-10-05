#!/usr/bin/env node
// Work around installed macOS Chrome hanging after dump-dom is complete.
import { spawn } from "node:child_process";
const child = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ["--use-mock-keychain", "--password-store=basic", ...process.argv.slice(2)],
  { detached: true, stdio: ["ignore", "pipe", "pipe"] },
);
let output = "",
  finished = false;
const finish = (code) => {
  if (finished) return;
  finished = true;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {}
  process.exit(code);
};
child.stdout.on("data", (data) => {
  process.stdout.write(data);
  output += data;
  if (output.includes("</html>")) finish(0);
});
child.stderr.on("data", (data) => process.stderr.write(data));
child.on("error", () => finish(1));
child.on("exit", (code) => finish(code ?? 1));
setTimeout(() => finish(1), 35000);
