import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { browserDOM } from "./browser-dom.ts";
import { mobileLobbyFixture } from "./mobile-lobby-fixture.ts";

const chromium = process.env.DARECADE_TEST_CHROMIUM;
const scenarios = [
  ["unavailable", 390, 700],
  ["context-lost", 390, 700],
  ["hoops-context-lost", 390, 700],
  ["fishing-context-lost", 390, 700],
  ["ready", 390, 700],
  ["appearance", 390, 700],
  ...[360, 390, 430].flatMap((width) => [
    ["race", width, 700],
    ["race", 700, width],
  ]),
  ["race", 1280, 800],
] as const;
for (const [scenario, width, height] of scenarios)
  test(
    `3D experience ${scenario} at ${width}x${height}`,
    {
      skip: chromium ? false : "Set DARECADE_TEST_CHROMIUM",
      timeout: 90000,
    },
    async () => {
      assert.ok(chromium);
      const script =
        `const scenario=${JSON.stringify(scenario)};\n` +
        readFileSync(
          new URL("./experience-browser.js", import.meta.url),
          "utf8",
        );
      const server = mobileLobbyFixture(
        Number(width),
        Number(height),
        false,
        true,
        false,
        script,
      );
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const directory = mkdtempSync(join(tmpdir(), "simi-experience-"));
      const name = `experience-${scenario}-${width}-${height}`;
      mkdirSync(".browser", { recursive: true });
      try {
        const output = await browserDOM(
          chromium,
          `http://127.0.0.1:${address.port}/`,
          directory,
          {
            gpu: true,
            virtualTime: 90000,
            timeout: 80000,
            flags: [
              `--window-size=${Number(width) + 50},${Number(height) + 160}`,
            ],
          },
        );
        writeFileSync(resolve(".browser", name + ".html"), output);
        assert.match(
          output,
          /<body[^>]*data-result="pass"/,
          output.slice(-9000),
        );
      } finally {
        await new Promise<void>((done) => server.close(() => done()));
        rmSync(directory, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 100,
        });
      }
    },
  );
