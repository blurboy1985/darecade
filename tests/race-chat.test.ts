import test from "node:test";
import assert from "node:assert/strict";
import { CHAT_GAP_MS, CHAT_LINES, chatLine } from "../shared/race-chat.ts";
import { COUNTDOWN_MS, RaceRoom } from "../shared/race-room.ts";
import { RaceHost } from "../server/race-host.mjs";

const player = (id: string) => ({ id, name: id.toUpperCase(), look: {} });
function room(...ids: string[]) {
  const r = new RaceRoom("BCDF", () => 0.5);
  for (const id of ids) assert.equal(r.join(player(id), 0), "");
  r.drain();
  return r;
}
const chats = (r: RaceRoom) => r.drain().filter((m) => m.data.t === "chat");

test("only the fixed lines have a number", () => {
  assert.equal(chatLine(0), 0);
  assert.equal(chatLine(CHAT_LINES.length - 1), CHAT_LINES.length - 1);
  for (const bad of [-1, CHAT_LINES.length, 1.5, "1", "hello", null, [0], NaN])
    assert.equal(chatLine(bad), -1);
  for (const line of CHAT_LINES) assert.ok(line.length <= 24);
});

test("a line reaches everyone in the room with who said it", () => {
  const r = room("ann", "ben", "cat");
  r.receive("ben", { t: "chat", line: 3 }, 1000);
  assert.deepEqual(chats(r), [
    { to: null, data: { t: "chat", from: 1, line: 3 } },
  ]);
});

test("the room never passes on words a player wrote", () => {
  const r = room("ann", "ben");
  for (const line of ["call me on 91234567", 99, -1, 2.5, null, { line: 1 }])
    r.receive("ann", { t: "chat", line }, 1000);
  r.receive("ann", { t: "chat", line: 1, text: "my number is 91234567" }, 1000);
  const sent = chats(r);
  assert.deepEqual(sent, [{ to: null, data: { t: "chat", from: 0, line: 1 } }]);
  assert.doesNotMatch(JSON.stringify(sent), /91234567/);
});

test("a player waits between lines; others are not held up", () => {
  const r = room("ann", "ben");
  r.receive("ann", { t: "chat", line: 0 }, 1000);
  r.receive("ann", { t: "chat", line: 1 }, 1000 + CHAT_GAP_MS - 1);
  r.receive("ben", { t: "chat", line: 2 }, 1000 + CHAT_GAP_MS - 1);
  r.receive("ann", { t: "chat", line: 4 }, 1000 + CHAT_GAP_MS);
  assert.deepEqual(
    chats(r).map((m) => [m.data.from, m.data.line]),
    [
      [0, 0],
      [1, 2],
      [0, 4],
    ],
  );
});

test("a refused line does not start the wait", () => {
  const r = room("ann", "ben");
  r.receive("ann", { t: "chat", line: "hi" }, 1000);
  r.receive("ann", { t: "chat", line: 0 }, 1001);
  assert.equal(chats(r).length, 1);
});

test("someone outside the room cannot speak in it", () => {
  const r = room("ann", "ben");
  r.receive("zed", { t: "chat", line: 0 }, 1000);
  assert.deepEqual(r.drain(), []);
});

test("chat works in the lobby, the countdown, the race and the results", () => {
  const r = room("ann", "ben");
  r.receive("ann", { t: "chat", line: 0 }, 1000);
  assert.equal(r.status, "lobby");
  assert.equal(chats(r).length, 1);

  r.receive("ann", { t: "start" }, 5000);
  assert.equal(r.status, "countdown");
  r.receive("ben", { t: "chat", line: 1 }, 5100);
  assert.equal(chats(r).length, 1);

  const go = 5000 + COUNTDOWN_MS;
  r.receive("ann", { t: "chat", line: 3 }, go + 2000);
  assert.equal(r.status, "racing");
  assert.equal(chats(r).length, 1);

  r.receive("ann", { t: "done" }, go + 3000);
  r.receive("ben", { t: "done" }, go + 3000);
  assert.equal(r.status, "results");
  r.receive("ben", { t: "chat", line: 6 }, go + 4000);
  assert.deepEqual(
    chats(r).map((m) => m.data),
    [{ t: "chat", from: 1, line: 6 }],
  );
});

test("the sender's number follows the player list when someone leaves", () => {
  const r = room("ann", "ben", "cat");
  r.leave("ann", 500);
  r.drain();
  r.receive("cat", { t: "chat", line: 2 }, 1000);
  assert.deepEqual(chats(r)[0].data, { t: "chat", from: 1, line: 2 });
});

test("both transports carry chat: every socket in the host hears the line", () => {
  let now = 0;
  const host = new RaceHost("BCDF", () => now);
  const heard: Record<string, any[]> = { ann: [], ben: [] };
  const seat = (id: string) => ({
    send: (text: string) => heard[id].push(JSON.parse(text)),
    close() {},
  });
  const ann = seat("ann");
  const ben = seat("ben");
  assert.ok(host.open(player("ann"), ann, true));
  assert.ok(host.open(player("ben"), ben, false));
  now = 1000;
  host.message("ben", ben, JSON.stringify({ t: "chat", line: 4 }));
  host.message("ben", ben, JSON.stringify({ t: "chat", line: "typed words" }));
  for (const id of ["ann", "ben"])
    assert.deepEqual(
      heard[id].filter((m) => m.t === "chat"),
      [{ t: "chat", from: 1, line: 4 }],
    );
});
