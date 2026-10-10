import test from "node:test";
import assert from "node:assert/strict";
import { WorldState } from "../server/world-core.mjs";
import {
  WORLD_CHAT_GAP_MS,
  WORLD_CHAT_KEEP_MS,
  WORLD_CHAT_MAX,
  worldChatText,
} from "../shared/world-chat.ts";

const identity = (id: string, blockedIds: string[] = []) => ({
  id,
  name: id,
  look: { outfit: 0, skin: 0, hat: 0 },
  blockedIds,
});
function world(...ids: string[]) {
  const clock = { now: 1_000_000 };
  const state = new WorldState(() => clock.now);
  for (const id of ids) state.join(identity(id));
  return { state, clock };
}

test("a message is one tidy line of at most 120 characters", () => {
  assert.equal(worldChatText("  hello\n\tthere\u0000  "), "hello there");
  assert.equal(worldChatText("   "), "");
  assert.equal(worldChatText(7), "");
  assert.equal(worldChatText(["hi"]), "");
  assert.equal([...worldChatText("x".repeat(500))].length, WORLD_CHAT_MAX);
  // An emoji at the limit is kept whole or dropped, never cut in half.
  assert.equal(
    worldChatText("x".repeat(WORLD_CHAT_MAX - 1) + "😀😀"),
    "x".repeat(WORLD_CHAT_MAX - 1) + "😀",
  );
});

test("everyone in the world hears a message once, with the sender's slot", () => {
  const { state } = world("a", "b", "c");
  const known = new Map();
  state.snapshot("b", known, true);
  assert.equal(state.move("a", { say: "hello <b>world</b>" }), true);
  const delta = state.snapshot("b", known);
  assert.equal(delta.t, "delta");
  assert.equal(delta.c.length, 1);
  assert.deepEqual(delta.c[0].slice(1), [
    state.players.get("a").slot,
    "hello <b>world</b>",
  ]);
  // The sender hears it too, and nobody hears it twice.
  assert.equal(state.snapshot("a", new Map(), true).c.length, 1);
  assert.equal(state.snapshot("b", known), null);
});

test("a packet without chat has no chat field", () => {
  const { state } = world("a", "b");
  assert.equal("c" in state.snapshot("b", new Map(), true), false);
});

test("a polling player gets recent messages again and can skip them by id", () => {
  const { state, clock } = world("a", "b");
  state.say("a", "one");
  const first = state.snapshot("b", new Map(), true).c;
  clock.now += 2000;
  state.say("a", "two");
  const second = state.snapshot("b", new Map(), true).c;
  assert.deepEqual(
    second.map((m) => m[2]),
    ["one", "two"],
  );
  assert.equal(second[0][0], first[0][0]);
  assert.ok(second[1][0] > second[0][0]);
});

test("a player waits between messages; others are not held up", () => {
  const { state, clock } = world("a", "b");
  assert.equal(state.say("a", "one"), true);
  assert.equal(state.say("a", "two"), false);
  assert.equal(state.say("b", "three"), true);
  clock.now += WORLD_CHAT_GAP_MS;
  assert.equal(state.say("a", "four"), true);
  assert.deepEqual(
    state.snapshot("b", new Map(), true).c.map((m) => m[2]),
    ["one", "three", "four"],
  );
});

test("nothing to say is not a message and does not start the wait", () => {
  const { state } = world("a", "b");
  assert.equal(state.say("a", "   "), false);
  assert.equal(state.say("a", { text: "hi" }), false);
  assert.equal(state.say("nobody", "hi"), false);
  assert.equal(state.say("a", "hi"), true);
});

test("blocked players do not hear each other", () => {
  const { state } = world("a", "b", "c");
  state.players.get("b").blockedIds = ["a"];
  state.say("a", "hello");
  assert.equal("c" in state.snapshot("b", new Map(), true), false);
  assert.equal(state.snapshot("c", new Map(), true).c.length, 1);
  state.say("b", "hi");
  assert.deepEqual(
    state.snapshot("a", new Map(), true).c.map((m) => m[2]),
    ["hello"],
  );
});

test("a message goes when its time is up or its sender leaves", () => {
  const { state, clock } = world("a", "b", "c");
  state.say("a", "old");
  state.say("c", "bye");
  state.players.delete("c");
  assert.deepEqual(
    state.snapshot("b", new Map(), true).c.map((m) => m[2]),
    ["old"],
  );
  clock.now += WORLD_CHAT_KEEP_MS;
  assert.equal("c" in state.snapshot("b", new Map(), true), false);
  state.say("a", "new");
  assert.equal(state.chat.length, 1);
});

test("message ids keep rising when a world starts again", () => {
  const { state, clock } = world("a", "b");
  state.say("a", "before");
  const before = state.snapshot("b", new Map(), true).c[0][0];
  clock.now += 5000;
  const restarted = new WorldState(() => clock.now);
  restarted.join(identity("a"));
  restarted.join(identity("b"));
  restarted.say("a", "after");
  assert.ok(restarted.snapshot("b", new Map(), true).c[0][0] > before);
});

test("a message sent with a movement update moves the player too", () => {
  const { state } = world("a", "b");
  assert.equal(state.move("a", { x: 3, say: "on my way" }), true);
  const packet = state.snapshot("b", new Map(), true);
  assert.equal(packet.c[0][2], "on my way");
  assert.equal(packet.d.find((d) => d[0] === 0)[1], 300);
  // A message is not part of a player's state.
  assert.doesNotMatch(JSON.stringify(packet.d), /on my way/);
});
