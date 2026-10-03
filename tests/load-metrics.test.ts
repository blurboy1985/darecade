import test from "node:test";
import assert from "node:assert/strict";
import {
  LoadMetrics,
  measuredContext,
  changedMetricInstances,
} from "../scripts/load-metrics.mjs";

test("SQL metrics retain statement and operation totals without parameters", async () => {
  const metrics = new LoadMetrics();
  metrics.invoke("/api/state", () => {
    metrics.sql(" SELECT id\n FROM players WHERE id=? ", {
      rowsRead: 2,
      rowsWritten: 0,
    });
    metrics.sql("SELECT id FROM players WHERE id=?", {
      rowsRead: 3,
      rowsWritten: 0,
    });
  });
  metrics.invoke("worldSave", () => {
    metrics.sql("UPDATE players SET x=? WHERE id=?", {
      rowsRead: 1,
      rowsWritten: 1,
    });
    metrics.sql("SELECT id FROM players WHERE id=?", {
      rowsRead: 1,
      rowsWritten: 0,
    });
  });
  const result = metrics.snapshot();
  assert.equal(result.sqlCalls, 4);
  assert.equal(result.rowsRead, 7);
  assert.equal(result.rowsWritten, 1);
  assert.deepEqual(result.calls, { "/api/state": 1, worldSave: 1 });
  assert.equal(result.statements.length, 2);
  assert.deepEqual(result.statements[0], {
    sql: "SELECT id FROM players WHERE id=?",
    calls: 3,
    rowsRead: 6,
    rowsWritten: 0,
    operations: {
      "/api/state": { calls: 2, rowsRead: 5, rowsWritten: 0 },
      worldSave: { calls: 1, rowsRead: 1, rowsWritten: 0 },
    },
  });
  for (const field of ["rowsRead", "rowsWritten"])
    assert.equal(
      result[field],
      result.statements.reduce((n, entry) => n + entry[field], 0),
    );
  assert.equal(result.operations.worldSave.sqlCalls, 2);
  assert.equal(result.operations.worldSave.rowsWritten, 1);
});

test("asynchronous operation attribution survives interleaving and nested calls", async () => {
  const metrics = new LoadMetrics();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const first = metrics.invoke("first", async () => {
    await gate;
    metrics.sql("SELECT 1", { rowsRead: 7, rowsWritten: 0 });
    await metrics.invoke("nested", async () => {
      await Promise.resolve();
      metrics.sql("SELECT 1", { rowsRead: 3, rowsWritten: 0 });
    });
    metrics.sql("SELECT 1", { rowsRead: 2, rowsWritten: 0 });
  });
  await metrics.invoke("second", async () => {
    metrics.sql("SELECT 1", { rowsRead: 5, rowsWritten: 0 });
    release();
  });
  await first;
  const result = metrics.snapshot();
  assert.equal(result.operations.first.rowsRead, 9);
  assert.equal(result.operations.second.rowsRead, 5);
  assert.equal(result.operations.nested.rowsRead, 3);
  assert.equal(result.operations.unattributed, undefined);
});

test("snapshots and resets do not count readback or mutate prior reports", () => {
  const metrics = new LoadMetrics();
  metrics.invoke("before", () =>
    metrics.sql("SELECT 1", { rowsRead: 1, rowsWritten: 0 }),
  );
  const first = metrics.snapshot();
  const reset = metrics.snapshot(true);
  assert.deepEqual(reset, first);
  assert.equal(metrics.snapshot().sqlCalls, 0);
  assert.deepEqual(metrics.snapshot().calls, {});
  metrics.invoke("after", () =>
    metrics.sql("SELECT 1", { rowsRead: 4, rowsWritten: 0 }),
  );
  assert.equal(first.rowsRead, 1);
  assert.equal(reset.rowsRead, 1);
  assert.equal(metrics.snapshot().rowsRead, 4);
});

test("World storage API calls stay separate from SQL rows and preserve native receivers", async () => {
  const metrics = new LoadMetrics();
  const storage = {
    get(name) {
      assert.equal(this, storage);
      return Promise.resolve(name);
    },
    put() {
      assert.equal(this, storage);
      return Promise.resolve();
    },
    delete() {
      assert.equal(this, storage);
      return Promise.resolve(true);
    },
    getAlarm() {
      assert.equal(this, storage);
      return Promise.resolve(null);
    },
    setAlarm() {
      assert.equal(this, storage);
      return Promise.resolve();
    },
    deleteAlarm() {
      assert.equal(this, storage);
      return Promise.resolve();
    },
    transactionSync(fn) {
      assert.equal(this, storage);
      return fn();
    },
  };
  const original = {
    storage,
    getWebSockets() {
      assert.equal(this, original);
      return [];
    },
  };
  const ctx = measuredContext(original, metrics);
  await metrics.invoke("alarm", async () => {
    assert.deepEqual(ctx.getWebSockets(), []);
    assert.equal(await ctx.storage.get("name"), "name");
    await ctx.storage.put("polls", []);
    await ctx.storage.put("lastSaved", 123);
    await ctx.storage.delete("polls");
    assert.equal(await ctx.storage.getAlarm(), null);
    await ctx.storage.setAlarm(123);
    await ctx.storage.deleteAlarm();
    ctx.storage.transactionSync(() => {});
  });
  const result = metrics.snapshot();
  assert.deepEqual(result.storageOperations, {
    get: 1,
    put: 2,
    delete: 1,
    getAlarm: 1,
    setAlarm: 1,
    deleteAlarm: 1,
  });
  assert.deepEqual(
    result.operations.alarm.storageOperations,
    result.storageOperations,
  );
  assert.equal(result.sqlCalls, 0);
  assert.equal(result.rowsRead, 0);
  assert.equal(result.rowsWritten, 0);
});

test("metric instance guard detects reconstruction and missing World measurements", () => {
  const metrics = new LoadMetrics();
  const before = metrics.snapshot(true);
  const after = metrics.snapshot();
  assert.equal(before.instanceId, after.instanceId);
  assert.deepEqual(
    changedMetricInstances({ Records: before }, { Records: after }),
    [],
  );
  assert.deepEqual(
    changedMetricInstances(
      { Records: before },
      { Records: new LoadMetrics().snapshot() },
    ),
    ["Records"],
  );
  assert.deepEqual(changedMetricInstances({ "world-1": before }, {}), [
    "world-1",
  ]);
  assert.deepEqual(changedMetricInstances({}, { "world-1": before }), [
    "world-1",
  ]);
});
