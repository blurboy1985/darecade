import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { once } from "node:events";
import { browserDOM } from "./browser-dom.ts";
import { mobileLobbyFixture } from "./mobile-lobby-fixture.ts";

const chromium = process.env.DARECADE_TEST_CHROMIUM;
for (const [width, height, account, twoD] of [
  [320, 568, false, false],
  [390, 844, false, false],
  [390, 844, true, false],
  [844, 390, false, false],
  [1280, 900, true, false],
  [320, 568, false, true],
] as const) {
  test(
    `wardrobe scrolling and all emotes at ${width}x${height} ${account ? "account" : "guest"} ${twoD ? "migrated 2D preference" : "3D"}`,
    { skip: chromium ? false : "Set DARECADE_TEST_CHROMIUM", timeout: 45000 },
    async () => {
      assert.ok(chromium);
      const server = mobileLobbyFixture(
        width,
        height,
        account,
        twoD,
        "wardrobe",
      );
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      const directory = mkdtempSync(join(tmpdir(), "simi-mobile-lobby-"));
      const name = `wardrobe-menu-${width}-${height}-${account}-${twoD}`;
      mkdirSync(".browser", { recursive: true });
      try {
        const output = await browserDOM(
          chromium,
          `http://127.0.0.1:${address.port}/`,
          directory,
          {
            gpu: true,
            virtualTime: 35000,
            timeout: 40000,
            flags: [
              `--window-size=${width},${height + 160}`,
              `--screenshot=${resolve(".browser", name + ".png")}`,
            ],
          },
        );
        writeFileSync(resolve(".browser", name + ".html"), output);
        assert.match(
          output,
          /<body[^>]*data-result="pass"/,
          output.slice(-7000),
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
}
