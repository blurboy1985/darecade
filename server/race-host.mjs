import { RaceRoom } from "../shared/race-room.ts";

/**
 * One Coast Rush room and the sockets of the players in it. A socket is
 * anything with `send(text)` and `close(code, reason)`, so the Node preview
 * and the Cloudflare Durable Object share this.
 */
export class RaceHost {
  constructor(code, now = Date.now) {
    this.room = new RaceRoom(code);
    this.sockets = new Map();
    this.now = now;
  }
  get empty() {
    return this.room.empty;
  }
  /** Seats a player. False when they were turned away; the socket is then closed. */
  open(identity, socket, creating) {
    const error =
      creating && !this.empty
        ? "Please try again."
        : !creating && this.empty
          ? "No race with that code."
          : this.room.join(identity, this.now());
    if (error) {
      this.room.drain();
      socket.send(JSON.stringify({ t: "error", message: error }));
      socket.close(1000, "Not joined");
      return false;
    }
    const previous = this.sockets.get(identity.id);
    this.sockets.set(identity.id, socket);
    if (previous && previous !== socket) {
      previous.send(
        JSON.stringify({
          t: "error",
          message: "This race moved to another window.",
        }),
      );
      previous.close(1000, "Reconnected");
    }
    this.flush();
    return true;
  }
  message(id, socket, text) {
    if (this.sockets.get(id) !== socket) return;
    if (typeof text !== "string" || text.length > 512) {
      socket.close(1009, "Message too large");
      return;
    }
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      socket.close(1007, "Invalid message");
      return;
    }
    this.room.receive(id, data, this.now());
    this.flush();
  }
  closed(id, socket) {
    if (this.sockets.get(id) !== socket) return;
    this.sockets.delete(id);
    this.room.leave(id, this.now());
    this.flush();
  }
  flush() {
    for (const { to, data } of this.room.drain()) {
      const text = JSON.stringify(data);
      for (const [id, socket] of this.sockets)
        if (!to || to === id)
          try {
            socket.send(text);
          } catch {
            // A socket that cannot be written to reports its own close.
          }
    }
  }
}
