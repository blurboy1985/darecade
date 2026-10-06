import { DurableObject } from "cloudflare:workers";
import { WorldState } from "../server/world-core.mjs";
import { json, readBody } from "./api.mjs";
import { sessionKey } from "./world-auth.mjs";

// Live presence, appearance and emotes are refreshed separately from saved poses.
function checkpointKey(player) {
  return JSON.stringify([
    player.x,
    player.z,
    player.yaw,
    player.activity,
    player.away,
  ]);
}

export class World extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.state = new WorldState();
    this.sockets = new Map();
    this.known = new Map();
    this.polls = new Map();
    this.checkpoints = new Map();
    this.name = "";
    this.lastSaved = 0;
    this.lastBroadcast = 0;
    for (const ws of ctx.getWebSockets()) {
      const saved = ws.deserializeAttachment();
      if (saved.closed || ws.readyState !== 1) {
        ws.close(1000, "Left world");
        continue;
      }
      this.name = saved.world;
      this.state.join(saved.player, saved.player);
      this.state.players.get(saved.player.id).seen = saved.player.seen;
      this.sockets.set(saved.player.id, ws);
      this.known.set(saved.player.id, new Map());
      this.checkpoints.set(saved.player.id, saved.checkpoint);
    }
    ctx.blockConcurrencyWhile(async () => {
      this.name = (await ctx.storage.get("name")) || this.name;
      const saved = (await ctx.storage.get("polls")) || [];
      this.lastSaved = (await ctx.storage.get("lastSaved")) || 0;
      for (const item of saved)
        if (Date.now() - item.player.seen < 15000) {
          this.name = item.world;
          this.state.join(item.player, item.player);
          this.state.players.get(item.player.id).seen = item.player.seen;
          this.polls.set(item.player.id, item.player.seen);
          this.checkpoints.set(item.player.id, item.checkpoint);
        }
    });
  }
  records() {
    return this.env.NEIGHBOURHOOD.get(
      this.env.NEIGHBOURHOOD.idFromName("darecade-main-v1"),
    );
  }
  async fetch(request) {
    try {
      const url = new URL(request.url);
      const connection = url.searchParams.get("connection") || "";
      if (connection && !/^[a-zA-Z0-9-]{1,80}$/.test(connection))
        return json({ error: "Invalid connection." }, 400);
      const name = url.searchParams.get("world");
      if (this.name !== name) {
        this.name = name;
        await this.ctx.storage.put("name", name);
      }
      let identity;
      if (url.pathname === "/api/world/connect") {
        identity = JSON.parse(
          request.headers.get("x-darecade-world-player") || "null",
        );
        if (!identity || identity.suspended)
          return json({ error: "Sign in to join." }, 401);
        if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
          return json({ error: "WebSocket upgrade required." }, 426);
      } else {
        const cookie = request.headers.get("cookie") || "";
        const session = sessionKey(cookie);
        identity = [...this.state.players.values()].find(
          (p) => p.session === session,
        );
        if (!identity)
          identity = await this.records().worldAuthorize(
            cookie,
            request.headers.get("x-darecade-client-ip"),
          );
        if (!identity || identity.suspended)
          return json({ error: "Sign in to join." }, 401);
        if (
          !this.state.players.size &&
          !(await this.records().worldChoose(identity.id, this.name))
        )
          return json({ error: "World unavailable." }, 404);
      }
      const id = identity.id;
      if (url.pathname === "/api/world/leave") {
        if (
          (this.state.players.get(id)?.connection || "") ===
          (url.searchParams.get("connection") || "")
        )
          await this.remove(id);
        return json({ ok: true });
      }
      const poll = url.pathname === "/api/world/poll";
      const data = poll ? await readBody(request, 2048) : null;
      const existed = this.state.players.has(id);
      identity = {
        ...identity,
        blockedIds: identity.blockedIds.filter((blocked) =>
          this.state.players.has(blocked),
        ),
      };
      const p = existed
        ? this.state.players.get(id)
        : this.state.join(identity);
      if (!p) return json({ error: "This world is full." }, 409);
      if (!existed) await this.records().worldArrive(this.name, id);
      Object.assign(p, {
        session: identity.session,
        blockedIds: identity.blockedIds,
      });
      p.connection = url.searchParams.get("connection") || "";
      if (poll) {
        if (this.polls.has(id) && Date.now() - this.polls.get(id) < 200)
          return json({ error: "Please slow down." }, 429);
        this.state.move(id, data);
        p.seen = Date.now();
        this.polls.set(id, p.seen);
        await this.savePolls();
        if (!existed) await this.report();
        this.schedule();
        return json({
          ...this.state.snapshot(id, new Map(), true),
          world: this.name,
        });
      }
      const previous = this.sockets.get(id);
      if (previous) {
        previous.serializeAttachment({
          ...previous.deserializeAttachment(),
          closed: true,
        });
        previous.send(JSON.stringify({ t: "closed" }));
        previous.close(1000, "Reconnected");
      }
      this.polls.delete(id);
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      this.sockets.set(id, pair[1]);
      this.known.set(id, new Map());
      this.attach(id);
      await this.savePolls();
      pair[1].send(
        JSON.stringify({
          ...this.state.snapshot(id, this.known.get(id), true),
          world: this.name,
        }),
      );
      this.flush();
      await this.report();
      return new Response(null, { status: 101, webSocket: pair[0] });
    } catch (e) {
      return json(
        { error: e.status ? e.message : "Unable to join this world." },
        e.status || 400,
      );
    }
  }
  attach(id) {
    this.sockets.get(id)?.serializeAttachment({
      world: this.name,
      player: this.state.players.get(id),
      checkpoint: this.checkpoints.get(id),
    });
  }
  webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 2048) {
      ws.close(1009, "Message too large");
      return;
    }
    const id = ws.deserializeAttachment().player.id;
    if (this.sockets.get(id) !== ws) return;
    try {
      const data = JSON.parse(message);
      if (!data || typeof data !== "object" || Array.isArray(data))
        throw Error();
      const changed = this.state.move(id, data);
      this.attach(id);
      if (changed) this.schedule();
    } catch {
      ws.close(1007, "Invalid movement");
    }
  }
  schedule() {
    if (!this.timer)
      this.timer = setTimeout(
        () => {
          this.timer = null;
          this.flush();
        },
        Math.max(0, 200 - (Date.now() - this.lastBroadcast)),
      );
  }
  flush() {
    this.lastBroadcast = Date.now();
    for (const [id, ws] of this.sockets) {
      const known = this.known.get(id);
      const packet = this.state.snapshot(id, known, !known.size);
      if (packet)
        try {
          ws.send(JSON.stringify(packet));
        } catch {
          this.ctx.waitUntil(this.remove(id));
        }
    }
  }
  async webSocketClose(ws) {
    ws.close(1000, "Connection closed");
    const id = ws.deserializeAttachment().player.id;
    if (this.sockets.get(id) === ws) await this.remove(id);
  }
  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }
  async remove(id, erase = false) {
    const player = this.state.players.get(id);
    const socket = this.sockets.get(id);
    if (socket) {
      socket.serializeAttachment({
        ...socket.deserializeAttachment(),
        closed: true,
      });
      if (socket.readyState === 1) {
        socket.send(JSON.stringify({ t: "closed" }));
        socket.close(1000, "Left world");
      }
    }
    this.sockets.delete(id);
    this.known.delete(id);
    this.polls.delete(id);
    this.checkpoints.delete(id);
    this.state.players.delete(id);
    await this.records().worldDepart(this.name, id);
    if (player && !erase)
      await this.records().worldSave(this.name, [player], true);
    await this.savePolls();
    this.flush();
    await this.report();
  }
  async disconnect(id) {
    await this.remove(id, true);
  }
  async refresh() {
    const requested = [...this.state.players.values()].map((player) => ({
      player,
      id: player.id,
      session: player.session,
    }));
    const updates = await this.records().worldRefresh(
      requested.map((p) => ({
        id: p.id,
        session: p.session,
      })),
    );
    for (const request of requested) {
      const p = this.state.players.get(request.id);
      if (p !== request.player || p.session !== request.session) continue;
      const update = updates.find((x) => x.id === p.id);
      if (!update) await this.remove(p.id, true);
      else {
        const changed =
          p.name !== update.name ||
          JSON.stringify(p.look) !== JSON.stringify(update.look);
        Object.assign(p, {
          name: update.name,
          look: update.look,
          blockedIds: update.blockedIds.filter((id) =>
            this.state.players.has(id),
          ),
        });
        if (changed) {
          p.revision = ++this.state.revision;
          for (const known of this.known.values()) known.delete(p.id);
        }
        this.attach(p.id);
      }
    }
    this.flush();
    await this.savePolls();
  }
  async savePolls() {
    if (this.polls.size)
      await this.ctx.storage.put(
        "polls",
        [...this.polls.keys()].map((id) => ({
          world: this.name,
          player: this.state.players.get(id),
          checkpoint: this.checkpoints.get(id),
        })),
      );
    else await this.ctx.storage.delete("polls");
  }
  async checkpoint() {
    const pending = [...this.state.players.values()]
      .map((player) => ({
        player,
        snapshot: { ...player },
        key: checkpointKey(player),
      }))
      .filter(({ player, key }) => this.checkpoints.get(player.id) !== key);
    if (!pending.length) return;
    await this.records().worldSave(
      this.name,
      pending.map(({ snapshot }) => snapshot),
      false,
    );
    let pollsChanged = false;
    for (const { player, snapshot, key } of pending) {
      if (
        this.state.players.get(player.id) !== player ||
        player.session !== snapshot.session
      )
        continue;
      // A move during the RPC must remain dirty, including after hibernation.
      this.checkpoints.set(player.id, key);
      this.attach(player.id);
      if (this.polls.has(player.id)) pollsChanged = true;
    }
    if (pollsChanged) await this.savePolls();
  }
  async report() {
    if (!this.name) return;
    await this.records().worldOccupancy(
      this.name,
      [...this.state.players.values()].map((p) => ({ id: p.id, away: p.away })),
    );
    if (this.state.players.size) {
      const alarm = await this.ctx.storage.getAlarm();
      if (alarm === null || alarm > Date.now() + 3000)
        await this.ctx.storage.setAlarm(Date.now() + 3000);
    } else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    for (const [id, player] of this.state.players)
      if (Date.now() - player.seen >= 12000) await this.remove(id);
    if (Date.now() - this.lastSaved >= 30000) {
      // Authorization refresh keeps its cadence even when nobody has moved.
      await this.refresh();
      await this.checkpoint();
      this.lastSaved = Date.now();
      await this.ctx.storage.put("lastSaved", this.lastSaved);
    }
    await this.report();
  }
}
