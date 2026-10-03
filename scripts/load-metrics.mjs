// In-memory instrumentation for the disposable local fixture only.
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";

const rowCounts = () => ({ calls: 0, rowsRead: 0, rowsWritten: 0 });
const addRows = (target, read, written) => {
  target.calls++;
  target.rowsRead += read;
  target.rowsWritten += written;
};

export class LoadMetrics {
  constructor() {
    this.instanceId = randomUUID();
    this.context = new AsyncLocalStorage();
    this.reset();
  }
  reset() {
    this.calls = {};
    this.statements = new Map();
    this.operations = {};
    this.storageOperations = {};
    this.rowsRead = 0;
    this.rowsWritten = 0;
    this.sqlCalls = 0;
  }
  operation() {
    const name = this.context.getStore() || "unattributed";
    return (this.operations[name] ||= {
      calls: 0,
      sqlCalls: 0,
      rowsRead: 0,
      rowsWritten: 0,
      storageOperations: {},
    });
  }
  invoke(name, callback) {
    this.calls[name] = (this.calls[name] || 0) + 1;
    return this.context.run(name, () => {
      this.operation().calls++;
      return callback();
    });
  }
  sql(sql, cursor) {
    // Values are never recorded. Whitespace normalization groups prepared SQL.
    const statement = sql.trim().replace(/\s+/g, " ");
    const entry = this.statements.get(statement) || {
      sql: statement,
      ...rowCounts(),
      operations: {},
    };
    const read = cursor.rowsRead,
      written = cursor.rowsWritten,
      name = this.context.getStore() || "unattributed";
    addRows(entry, read, written);
    addRows((entry.operations[name] ||= rowCounts()), read, written);
    this.statements.set(statement, entry);
    this.sqlCalls++;
    this.rowsRead += read;
    this.rowsWritten += written;
    const operation = this.operation();
    operation.sqlCalls++;
    operation.rowsRead += read;
    operation.rowsWritten += written;
  }
  storage(method) {
    this.storageOperations[method] = (this.storageOperations[method] || 0) + 1;
    const operation = this.operation();
    operation.storageOperations[method] =
      (operation.storageOperations[method] || 0) + 1;
  }
  snapshot(reset = false) {
    const result = structuredClone({
      instanceId: this.instanceId,
      calls: this.calls,
      sqlCalls: this.sqlCalls,
      rowsRead: this.rowsRead,
      rowsWritten: this.rowsWritten,
      statements: [...this.statements.values()].sort((a, b) =>
        a.sql.localeCompare(b.sql),
      ),
      operations: this.operations,
      storageOperations: this.storageOperations,
    });
    if (reset) this.reset();
    return result;
  }
}

// Preserve native receivers for workerd's branded objects. These are storage API
// invocation counts, including reads served by a cache. They are not billed rows.
export function measuredContext(ctx, metrics) {
  const methods = new Set([
    "get",
    "put",
    "delete",
    "list",
    "deleteAll",
    "getAlarm",
    "setAlarm",
    "deleteAlarm",
  ]);
  const storage = new Proxy(ctx.storage, {
    get(target, key) {
      const value = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      return (...args) => {
        if (methods.has(key)) metrics.storage(key);
        return Reflect.apply(value, target, args);
      };
    },
  });
  return new Proxy(ctx, {
    get(target, key) {
      if (key === "storage") return storage;
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
}

// A lost/reconstructed DO makes the in-memory measurement incomplete.
export function changedMetricInstances(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (name) =>
      !before[name]?.instanceId ||
      before[name].instanceId !== after[name]?.instanceId,
  );
}
