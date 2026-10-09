import { ROOM_CODE, roomCode } from "../shared/race-room.ts";
import { RaceHost } from "./race-host.mjs";
import { PRIVACY_VERSION } from "./community-core.mjs";

// The preview server borrows the socket library the load tests already use.
// Without it, multiplayer answers 426 and everything else works as before.
let WebSocketServer = null;
try {
  ({ WebSocketServer } = await import("ws"));
} catch {
  /* Multiplayer needs the dev dependencies installed. */
}

/** Coast Rush rooms for the Node preview. Cloudflare keeps each room in a Durable Object. */
export class RaceRooms {
  constructor(community, origins) {
    this.community = community;
    this.db = community.store.db;
    this.origins = origins;
    this.hosts = new Map();
    this.server = WebSocketServer
      ? new WebSocketServer({ noServer: true, maxPayload: 1024 })
      : null;
  }
  identity(cookie) {
    const token = cookie
      ?.split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith("darecade_session="))
      ?.slice(17);
    const id = this.community.lookup(token);
    const row =
      id &&
      this.db
        .prepare(
          `SELECT p.id,p.name,p.look FROM players p JOIN profiles f ON f.player=p.id
        WHERE p.id=? AND f.consent=? AND NOT EXISTS(SELECT 1 FROM suspensions WHERE player=p.id)`,
        )
        .get(id, PRIVACY_VERSION);
    if (!row) return null;
    return {
      ...row,
      look: JSON.parse(row.look),
      blockedIds: this.db
        .prepare(
          "SELECT target id FROM blocks WHERE player=? UNION SELECT player id FROM blocks WHERE target=?",
        )
        .all(id, id)
        .map((r) => r.id),
    };
  }
  /** Answers a WebSocket upgrade. False when the request was not for a race. */
  upgrade(req, socket, head) {
    const url = new URL(req.url, "http://localhost");
    if (url.pathname !== "/api/race/connect" || !this.server) return false;
    const refuse = (status) => {
      socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\n\r\n`);
      return true;
    };
    if (req.headers.origin && !this.origins.has(req.headers.origin))
      return refuse("403 Forbidden");
    const identity = this.identity(req.headers.cookie);
    if (!identity) return refuse("401 Unauthorized");
    const creating = url.searchParams.get("host") === "1";
    let code = (url.searchParams.get("code") || "").toUpperCase();
    if (creating) {
      do code = roomCode();
      while (this.hosts.has(code));
    } else if (!ROOM_CODE.test(code)) return refuse("400 Bad Request");
    this.server.handleUpgrade(req, socket, head, (ws) => {
      const host = this.hosts.get(code) ?? new RaceHost(code);
      const seat = {
        send: (text) => ws.readyState === 1 && ws.send(text),
        close: (status, reason) => ws.close(status, reason),
      };
      const drop = () => {
        host.closed(identity.id, seat);
        if (host.empty && this.hosts.get(code) === host)
          this.hosts.delete(code);
      };
      ws.on("message", (raw, binary) =>
        binary
          ? ws.close(1003, "Text only")
          : host.message(identity.id, seat, raw.toString()),
      );
      ws.on("close", drop);
      ws.on("error", drop);
      if (host.open(identity, seat, creating)) this.hosts.set(code, host);
    });
    return true;
  }
}
