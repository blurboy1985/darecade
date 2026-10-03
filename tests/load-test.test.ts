import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

test("load runner rejects remote targets before starting a runtime", () => {
  for (const args of [
    ["--url", "https://example.invalid"],
    ["--remote"],
    ["--port", "443"],
  ]) {
    const result = spawnSync(
      process.execPath,
      ["scripts/load-test.mjs", ...args],
      {
        encoding: "utf8",
        windowsHide: true,
        timeout: 5000,
      },
    );
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Remote targets are forbidden|Invalid local load parameters/,
    );
    assert.doesNotMatch(result.stdout, /Seeded|Connecting/);
  }
});
