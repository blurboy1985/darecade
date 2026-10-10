import { activityIds } from "../src/catalog.ts";
import { BOUNDS } from "../src/navigation.ts";
import {
  WORLD_CHAT_GAP_MS,
  WORLD_CHAT_KEEP_MS,
  worldChatText,
} from "../shared/world-chat.ts";
export const WORLD_CAP = 30;
export const activities = activityIds;
export const emotes = [
  "",
  "wave",
  "cheer",
  "dance",
  "jump",
  "victory",
  "think",
];
export function clampMovement(data, previous = {}) {
  const number = (key) =>
    typeof data[key] === "number" && Number.isFinite(data[key])
      ? Math.max(-25, Math.min(key === "x" ? BOUNDS.east : 25, data[key]))
      : previous[key] || 0;
  return {
    x: number("x"),
    z: number("z"),
    yaw: number("yaw"),
    activity: activities.includes(data.activity)
      ? data.activity
      : previous.activity || "rest",
    away: typeof data.away === "boolean" ? data.away : !!previous.away,
    emote: emotes.includes(data.emote) ? data.emote : previous.emote || "",
  };
}
export function encodeMovement(player) {
  return [
    player.slot,
    Math.round(player.x * 100),
    Math.round(player.z * 100),
    Math.round(player.yaw * 100),
    activities.indexOf(player.activity),
    Number(player.away),
    emotes.indexOf(player.emote),
  ];
}
export function publicPlayer(player) {
  return [player.slot, player.id, player.name, player.look];
}
export function visibleTo(a, b) {
  return !a.blockedIds.includes(b.id) && !b.blockedIds.includes(a.id);
}

// Transport-independent state. Each recipient remembers only public revisions.
export class WorldState {
  players = new Map();
  revision = 0;
  // Recent messages only; nothing a player says is stored.
  chat = [];
  chatId = 0;
  constructor(now = Date.now) {
    this.now = now;
  }
  join(identity, restored) {
    const existing = this.players.get(identity.id);
    if (!existing && this.players.size >= WORLD_CAP) return null;
    const slots = new Set([...this.players.values()].map((p) => p.slot));
    let slot = existing?.slot ?? restored?.slot ?? 0;
    if (!existing) while (slots.has(slot)) slot++;
    const player = {
      ...identity,
      ...clampMovement(restored || identity),
      slot,
      revision: ++this.revision,
      moveTimes: restored?.moveTimes || [],
      seen: this.now(),
    };
    this.players.set(identity.id, player);
    return player;
  }
  move(id, data) {
    const p = this.players.get(id);
    if (!p) return false;
    // A message rides on a movement update, so both transports carry it. It
    // has its own limit, so it is taken even when the movement is refused.
    const said = data.say !== undefined && this.say(id, data.say);
    p.moveTimes = p.moveTimes.filter((at) => at > this.now() - 1000);
    if (p.moveTimes.length >= 5) return said;
    p.moveTimes.push(this.now());
    p.seen = this.now();
    const next = clampMovement(data, p);
    if (Object.keys(next).every((key) => next[key] === p[key])) return said;
    Object.assign(p, next, { revision: ++this.revision });
    return true;
  }
  say(id, value) {
    const p = this.players.get(id);
    const text = worldChatText(value);
    const now = this.now();
    if (!p || !text || (p.saidAt && now - p.saidAt < WORLD_CHAT_GAP_MS))
      return false;
    p.saidAt = now;
    // Ids follow the clock, so they keep rising after a world restarts.
    this.chatId = Math.max(this.chatId + 1, now);
    this.chat = this.chat.filter((m) => m.at > now - WORLD_CHAT_KEEP_MS);
    this.chat.push({ id: this.chatId, from: id, text, at: now });
    return true;
  }
  snapshot(id, known = new Map(), full = false) {
    const recipient = this.players.get(id);
    if (!recipient) return null;
    if (full) known.clear();
    const p = [],
      d = [],
      gone = [];
    const visible = new Set();
    for (const player of this.players.values()) {
      if (!visibleTo(recipient, player)) continue;
      visible.add(player.id);
      const old = known.get(player.id);
      if (!old) p.push(publicPlayer(player));
      if (!old || old.revision !== player.revision)
        d.push(encodeMovement(player));
      known.set(player.id, { slot: player.slot, revision: player.revision });
    }
    for (const [key, old] of known)
      if (!visible.has(key)) {
        gone.push(old.slot);
        known.delete(key);
      }
    // A full snapshot repeats every recent message; ids let a client skip repeats.
    const c = [];
    const heard = full ? 0 : recipient.heard || 0;
    for (const m of this.chat) {
      const sender = this.players.get(m.from);
      if (
        m.id > heard &&
        m.at > this.now() - WORLD_CHAT_KEEP_MS &&
        sender &&
        visibleTo(recipient, sender)
      )
        c.push([m.id, sender.slot, m.text]);
    }
    if (this.chat.length) recipient.heard = this.chat.at(-1).id;
    if (!full && !p.length && !d.length && !gone.length && !c.length)
      return null;
    const packet = { t: full ? "sync" : "delta", at: this.now(), p, d, gone };
    if (c.length) packet.c = c;
    return packet;
  }
}
