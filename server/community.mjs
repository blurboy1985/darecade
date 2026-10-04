import {
  mkdirSync,
  writeFileSync,
  readdirSync,
  unlinkSync,
  statSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { CommunityCore } from "./community-core.mjs";
export {
  INVITE_CAP,
  INVITE_XP,
  PRIVACY_VERSION,
  seedFor,
} from "./community-core.mjs";
export class Community extends CommunityCore {
  constructor(store, options = {}) {
    const directory = options.directory || "data";
    const outbox = resolve(directory, "mail-outbox");
    super(store, {
      ...options,
      files: {
        writeOutbox(id, data) {
          mkdirSync(outbox, { recursive: true });
          writeFileSync(resolve(outbox, id + ".json"), JSON.stringify(data), {
            mode: 0o600,
          });
        },
        removeOutbox(id) {
          unlinkSync(resolve(outbox, id + ".json"));
        },
        playtests(id) {
          const files = [];
          try {
            for (const name of readdirSync(resolve(directory, "playtests"))) {
              if (!name.endsWith(".json")) continue;
              const path = resolve(directory, "playtests", name),
                data = JSON.parse(readFileSync(path, "utf8"));
              if (data.player === id) files.push({ path, data });
            }
          } catch {}
          return files;
        },
        removePlaytest(path) {
          unlinkSync(path);
        },
        cleanup(now) {
          try {
            for (const name of readdirSync(outbox))
              if (statSync(resolve(outbox, name)).mtimeMs < now - 15 * 60000)
                unlinkSync(resolve(outbox, name));
          } catch {}
        },
      },
    });
    this.directory = directory;
  }
}
