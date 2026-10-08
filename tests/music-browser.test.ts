import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "vite";
import { spawn } from "node:child_process";
import { stopBrowser } from "./browser-dom.ts";

const chromium = process.env.DARECADE_TEST_CHROMIUM;
test(
  "all music arrangements render complete phrases without clipping or silence",
  {
    skip: chromium
      ? false
      : "Set DARECADE_TEST_CHROMIUM to render real Web Audio",
    timeout: 60000,
  },
  async () => {
    assert.ok(chromium);
    const server = await createServer({
      appType: "custom",
      server: { host: "127.0.0.1", port: 0 },
    });
    let complete: (result: string) => void = () => {};
    const result = new Promise<string>((resolve) => {
      complete = resolve;
    });
    server.middlewares.use("/music-done", (request, response) => {
      let body = "";
      request.on("data", (chunk) => {
        body += chunk;
      });
      request.on("end", () => {
        complete(body);
        response.end("done");
      });
    });
    server.middlewares.use("/music-check", (_request, response) => {
      response.setHeader("Content-Type", "text/html");
      response.end(`<!doctype html><html><body><pre id="result"></pre><script type="module">
      import { audio, renderMusic } from '/src/audio.ts';
      try {
        const reports = [];
        audio.setTheme('race');
        for (const mood of ['day', 'night', 'game', 'race']) {
          // The slower night arrangement needs 38.4 seconds for all 16 bars.
          const buffer = await renderMusic(mood, 42, 22050);
          if (audio.theme !== 'race') throw Error('Preview changed the selected theme');
          let peak = 0, energy = 0;
          for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
            const samples = buffer.getChannelData(channel);
            for (let start = 0; start < samples.length; start += buffer.sampleRate) {
              let windowEnergy = 0;
              const end = Math.min(samples.length, start + buffer.sampleRate);
              for (let i = start; i < end; i++) {
                if (!Number.isFinite(samples[i])) throw Error(mood + ' non-finite sample');
                peak = Math.max(peak, Math.abs(samples[i]));
                windowEnergy += samples[i] ** 2;
              }
              if (Math.sqrt(windowEnergy / (end - start)) < 0.001)
                throw Error(mood + ' silent second at ' + start / buffer.sampleRate);
              energy += windowEnergy;
            }
          }
          if (peak >= 0.99) throw Error(mood + ' clips: ' + peak);
          if (mood === 'day' && peak > 0.25)
            throw Error('Day background music has a loud spike: ' + peak);
          reports.push({ mood, peak, rms: Math.sqrt(energy / (buffer.length * 2)) });
        }
        document.querySelector('#result').textContent = JSON.stringify(reports);
        document.body.dataset.result = 'pass';
      } catch (error) {
        document.querySelector('#result').textContent = error.stack;
        document.body.dataset.result = 'fail';
      } finally {
        await fetch('/music-done', {method: 'POST', body: JSON.stringify({status: document.body.dataset.result, report: document.querySelector('#result').textContent})});
      }
    </script></body></html>`);
    });
    const directory = mkdtempSync(join(tmpdir(), "simi-music-"));
    try {
      await server.listen();
      const address = server.httpServer?.address();
      assert.ok(address && typeof address !== "string");
      const browser = spawn(
        chromium,
        [
          "--headless",
          "--disable-gpu",
          "--no-first-run",
          "--use-mock-keychain",
          "--password-store=basic",
          `--user-data-dir=${directory}`,
          `http://127.0.0.1:${address.port}/music-check`,
        ],
        { detached: true, stdio: "ignore" },
      );
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const report = await Promise.race([
          result,
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(
              () => reject(Error("Audio render timed out")),
              45000,
            );
            browser.once("error", reject);
          }),
        ]);
        assert.equal(JSON.parse(report).status, "pass", report);
      } finally {
        clearTimeout(timeout);
        await stopBrowser(browser);
      }
    } finally {
      await server.close();
      rmSync(directory, { recursive: true, force: true });
    }
  },
);
