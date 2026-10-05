// Local-only art inspection server. This configuration is never used by builds.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
export default {
  server: { host: "127.0.0.1", port: 5176, strictPort: true },
  plugins: [
    {
      name: "local-art-evidence",
      configureServer(server) {
        server.middlewares.use("/__art-thumbnails", async (req, res) => {
          if (
            req.method !== "POST" ||
            req.headers.origin !== "http://127.0.0.1:5176"
          ) {
            res.statusCode = 403;
            res.end();
            return;
          }
          try {
            let text = "";
            for await (const chunk of req) {
              text += chunk;
              if (text.length > 2_000_000) throw Error("Too large");
            }
            const { name, base64 } = JSON.parse(text);
            const match =
              /^(clothing|hair|pet|accessory|sets)-(\d+)\.png$/.exec(name);
            const limits = {
              clothing: 34,
              hair: 38,
              pet: 36,
              accessory: 37,
              sets: 10,
            };
            if (
              !match ||
              Number(match[2]) >= limits[match[1]] ||
              typeof base64 !== "string"
            )
              throw Error("Invalid thumbnail");
            const dir = resolve("public/wardrobe");
            mkdirSync(dir, { recursive: true });
            writeFileSync(resolve(dir, name), Buffer.from(base64, "base64"));
            res.end(JSON.stringify({ saved: name }));
          } catch (error) {
            res.statusCode = 400;
            res.end(String(error));
          }
        });
        server.middlewares.use("/__art-evidence", async (req, res) => {
          if (
            req.method !== "POST" ||
            (req.headers.origin &&
              req.headers.origin !== "http://127.0.0.1:5176")
          ) {
            res.statusCode = 403;
            res.end();
            return;
          }
          try {
            let text = "";
            for await (const chunk of req) {
              text += chunk;
              if (text.length > 8_000_000) throw Error("Evidence too large");
            }
            const { name, base64 } = JSON.parse(text);
            if (
              !/^[a-z0-9-]+\.(png|jpg|json)$/.test(name) ||
              typeof base64 !== "string"
            )
              throw Error("Invalid evidence");
            const dir = resolve(".browser/art-evidence");
            mkdirSync(dir, { recursive: true });
            writeFileSync(resolve(dir, name), Buffer.from(base64, "base64"));
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ saved: name }));
          } catch (error) {
            res.statusCode = 400;
            res.end(String(error));
          }
        });
      },
    },
  ],
};
