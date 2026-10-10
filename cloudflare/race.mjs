import { DurableObject } from "cloudflare:workers";
import { RaceHost } from "../server/race-host.mjs";
import { json } from "./api.mjs";

/**
 * One Coast Rush multiplayer room, named by its code. The race lives in
 * memory for as long as a player is connected, so these sockets are accepted
 * directly rather than hibernated. Nothing is stored.
 */
export class Race extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.host = null;
  }
  fetch(request) {
    const url = new URL(request.url);
    const identity = JSON.parse(
      request.headers.get("x-darecade-world-player") || "null",
    );
    if (!identity || identity.suspended)
      return json({ error: "Sign in to join." }, 401);
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
      return json({ error: "WebSocket upgrade required." }, 426);
    const pair = new WebSocketPair();
    const ws = pair[1];
    ws.accept();
    this.host ??= new RaceHost(url.searchParams.get("code"));
    const host = this.host;
    const seat = {
      send: (text) => ws.readyState === 1 && ws.send(text),
      close: (status, reason) => {
        try {
          ws.close(status, reason);
        } catch {
          // Already closed by the other side.
        }
      },
    };
    const drop = () => {
      host.closed(identity.id, seat);
      if (host.empty && this.host === host) this.host = null;
    };
    ws.addEventListener("message", (event) =>
      host.message(identity.id, seat, event.data),
    );
    ws.addEventListener("close", drop);
    ws.addEventListener("error", drop);
    host.open(
      {
        id: identity.id,
        name: identity.name,
        look: identity.look,
        blockedIds: identity.blockedIds,
      },
      seat,
      url.searchParams.get("host") === "1",
    );
    if (host.empty && this.host === host) this.host = null;
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
}
