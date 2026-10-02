// Local operator only. Never expose this script as a web route.
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { Store } from "../server/store.mjs";
import { Community } from "../server/community.mjs";
const [command, id] = process.argv.slice(2);
const directory = resolve(process.env.DARECADE_DATA || "data");
const path = resolve(directory, "neighbourhood.sqlite");
if (!existsSync(path))
  throw Error("No neighbourhood database at DARECADE_DATA.");
if (
  ![
    "reports",
    "suspend",
    "restore",
    "resolve-report",
    "delete-player",
  ].includes(command)
) {
  console.log(
    "Windows PowerShell: node scripts/community-admin.mjs reports | suspend PLAYER_ID | restore PLAYER_ID | resolve-report REPORT_ID | delete-player PLAYER_ID --confirm-delete",
  );
  process.exit(0);
}
const store = new Store(path),
  community = new Community(store, { directory });
try {
  if (command === "reports")
    console.table(
      store.db
        .prepare(
          "SELECT r.id,r.target,p.name,r.reason,r.created,r.status FROM reports r JOIN players p ON p.id=r.target WHERE r.status='open' ORDER BY r.created",
        )
        .all()
        .map((r) => ({ ...r, created: new Date(r.created).toISOString() })),
    );
  else if (command === "resolve-report") {
    const changed = store.db
      .prepare("UPDATE reports SET status='reviewed' WHERE id=?")
      .run(id);
    console.log(
      changed.changes ? "Report marked reviewed." : "Report not found.",
    );
  } else {
    if (!store.db.prepare("SELECT 1 FROM profiles WHERE player=?").get(id))
      throw Error("Player not found.");
    if (command === "suspend")
      store.transaction(() => {
        store.db
          .prepare("INSERT OR REPLACE INTO suspensions VALUES(?,?)")
          .run(id, Date.now());
        store.db.prepare("DELETE FROM sessions WHERE player=?").run(id);
        store.db.prepare("DELETE FROM presence WHERE player=?").run(id);
      });
    if (command === "restore")
      store.db.prepare("DELETE FROM suspensions WHERE player=?").run(id);
    if (command === "delete-player") {
      if (!process.argv.includes("--confirm-delete"))
        throw Error(
          "Review the player ID, then add --confirm-delete to permanently erase this player.",
        );
      community.delete(id);
    }
    console.log(
      command === "delete-player"
        ? "Player data deleted."
        : command === "suspend"
          ? "Player suspended and signed out."
          : "Player restored. They can request a new sign-in link.",
    );
  }
} finally {
  store.close();
}
