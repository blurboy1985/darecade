import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { once } from "node:events";
import { browserDOM } from "./browser-dom.ts";

const chromium = process.env.DARECADE_TEST_CHROMIUM;
const css = readFileSync(
  new URL("../src/arcade-theme.css", import.meta.url),
  "utf8",
);

for (const systemReduced of [false, true]) {
  test(
    `arcade controls keep their layout with system reduced motion ${systemReduced}`,
    {
      skip: chromium
        ? false
        : "Set DARECADE_TEST_CHROMIUM to run browser checks",
      timeout: 30000,
    },
    async () => {
      assert.ok(chromium);
      const directory = mkdtempSync(join(tmpdir(), "darecade-arcade-motion-"));
      const html = `<!doctype html><meta name="viewport" content="width=device-width"><style>${css}</style>
      <div style="position:relative;width:320px;height:440px">
        <span id="score" class="stat-pill bump"><small>SCORE</small><b>20</b></span>
        <span id="time" class="stat-pill hurry"><small>TIME</small><b>9</b></span>
        <div class="game-cover"><button class="primary">PLAY</button></div>
        <div class="round-over"><strong>Round over</strong><span>Your noodle hit the wall.</span></div>
      </div><pre id="result"></pre><script>
      try {
        const check = (ok, message) => { if (!ok) throw Error(message); };
        check(matchMedia('(prefers-reduced-motion: reduce)').matches === ${systemReduced}, 'system preference');
        const controls = [document.querySelector('button'), document.querySelector('#score'), document.querySelector('#time')];
        const report = [];
        for (const reduced of [false, true, false]) {
          document.body.classList.toggle('reduced', reduced);
          for (const element of controls) {
            const style = getComputedStyle(element);
            check(style.position !== 'absolute', element.outerHTML + ' became an overlay');
            check(style.pointerEvents !== 'none', element.outerHTML + ' lost pointer events');
            check(style.display !== 'grid', element.outerHTML + ' received overlay layout');
            check((style.animationName === 'none') === (reduced || ${systemReduced}), element.outerHTML + ' animation ' + style.animationName);
            if (reduced) check(style.transitionDuration === '0s', 'calm transition');
          }
          const button = controls[0];
          const rect = button.getBoundingClientRect();
          check(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) === button, 'PLAY hit target');
          const overlay = getComputedStyle(document.querySelector('.round-over'));
          check(overlay.position === 'absolute' && overlay.bottom === '12px' && overlay.display === 'grid', 'round end overlay layout');
          check(overlay.pointerEvents === 'none', 'round end overlay blocks controls');
          report.push({ reduced, systemReduced: ${systemReduced}, playWidth: rect.width });
        }
        document.querySelector('#result').textContent = JSON.stringify(report);
        document.body.dataset.result = 'pass';
      } catch (error) { document.querySelector('#result').textContent = error.stack; document.body.dataset.result = 'fail'; }
      </script>`;
      const server = createServer((_request, response) => {
        response.setHeader("Content-Type", "text/html");
        response.end(html);
      });
      server.listen(0, "127.0.0.1");
      await once(server, "listening");
      const address = server.address();
      assert.ok(address && typeof address !== "string");
      try {
        const output = await browserDOM(
          chromium,
          `http://127.0.0.1:${address.port}/`,
          directory,
          {
            virtualTime: 1000,
            flags: systemReduced ? ["--force-prefers-reduced-motion"] : [],
          },
        );
        assert.match(output, /data-result="pass"/, output);
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
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
