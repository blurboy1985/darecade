import test from "node:test";
import assert from "node:assert/strict";
import { ScoreOutbox, type PendingScore } from "../src/score-outbox.ts";
const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};
for (const game of [
  "hop",
  "brick",
  "swarm",
  "coast",
  "noodle",
  "hoops",
  "fishing",
])
  test(`${game}: score retries without manual input and clears durable queue`, async () => {
    const disk = storage(),
      delays: number[] = [];
    let calls = 0,
      saved = 0,
      waiting = 0;
    const round = {
      owner: "guest",
      id: game,
      score: 10,
      replay: { events: [] },
      queuedAt: Date.now(),
    } as PendingScore;
    const outbox = new ScoreOutbox(
      disk,
      async () => {
        if (++calls < 5) throw Error("signal timed out");
        return 10;
      },
      () => "guest",
      () => saved++,
      () => waiting++,
      async (ms) => {
        delays.push(ms);
      },
    );
    assert.equal(await outbox.submit(round), 10);
    assert.equal(calls, 5);
    assert.equal(saved, 1);
    assert.ok(waiting > 0);
    assert.deepEqual(delays, [500, 1500, 4000, 30000]);
    assert.equal(disk.getItem("simi-pending-scores-v1"), "[]");
  });
test("reload resumes queued replay only for its owner", async () => {
  const disk = storage();
  disk.setItem(
    "simi-pending-scores-v1",
    JSON.stringify([
      {
        owner: "guest",
        id: "pending",
        score: 5,
        replay: { events: [] },
        queuedAt: Date.now(),
      },
    ]),
  );
  let sends = 0;
  const wrong = new ScoreOutbox(
    disk,
    async () => {
      sends++;
      return 1;
    },
    () => "other",
    () => {},
    () => {},
  );
  wrong.resume();
  assert.equal(sends, 0);
  const right = new ScoreOutbox(
    disk,
    async () => {
      sends++;
      return 1;
    },
    () => "guest",
    () => {},
    () => {},
  );
  right.resume();
  await new Promise((r) => setImmediate(r));
  assert.equal(sends, 1);
  assert.equal(disk.getItem("simi-pending-scores-v1"), "[]");
});
