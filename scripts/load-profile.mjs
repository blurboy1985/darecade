import WebSocket from "ws";
import { once } from "node:events";

// DevTools sampling estimates CPU locally. It is not Cloudflare's billed CPU metric.
export async function startProfile(port) {
  const targets = await fetch(`http://127.0.0.1:${port}/json/list`, {
    redirect: "error",
  }).then((r) => r.json());
  const target = targets.find((t) => t.webSocketDebuggerUrl);
  if (!target) throw Error("Wrangler inspector is unavailable");
  const url = new URL(target.webSocketDebuggerUrl);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw Error("Inspector must be local");
  const ws = new WebSocket(url);
  await once(ws, "open");
  let next = 0;
  const pending = new Map();
  const sources = new Map();
  ws.on("message", (raw) => {
    const packet = JSON.parse(raw.toString());
    if (packet.id) pending.get(packet.id)?.(packet);
    if (packet.method === "Debugger.scriptParsed")
      sources.set(packet.params.scriptId, null);
  });
  const call = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(Error(`${method} timed out`));
      }, 15000);
      pending.set(id, (packet) => {
        clearTimeout(timer);
        pending.delete(id);
        packet.error
          ? reject(Error(packet.error.message))
          : resolve(packet.result);
      });
      ws.send(JSON.stringify({ id, method, params }));
    });
  await call("Debugger.enable");
  await call("Profiler.enable");
  await call("Profiler.setSamplingInterval", { interval: 1000 });
  await call("Profiler.start");
  return async () => {
    try {
      const { profile } = await call("Profiler.stop");
      for (const id of sources.keys()) {
        const { scriptSource } = await call("Debugger.getScriptSource", {
          scriptId: id,
        });
        let module = "",
          recordsClass = false;
        sources.set(
          id,
          scriptSource.split("\n").map((line) => {
            const header = line.match(/^\/\/ (.+\.(?:mjs|ts))$/);
            if (header) {
              module = header[1];
              recordsClass = false;
            }
            if (
              module.endsWith("cloudflare/worker.mjs") &&
              /Neighbourhood = class/.test(line)
            )
              recordsClass = true;
            return (
              /server\/(store-core|community-core)\.mjs$|cloudflare\/sqlite\.mjs$/.test(
                module,
              ) || recordsClass
            );
          }),
        );
      }
      const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
      const parents = new Map();
      for (const n of profile.nodes)
        for (const id of n.children || []) parents.set(id, n.id);
      const records = new Map();
      const isRecords = (id) => {
        if (records.has(id)) return records.get(id);
        const frame = nodes.get(id)?.callFrame;
        const own = !!sources.get(frame?.scriptId)?.[frame?.lineNumber];
        const result = own || (parents.has(id) && isRecords(parents.get(id)));
        records.set(id, result);
        return result;
      };
      let sampledMs = 0,
        samples = 0;
      profile.samples?.forEach((id, i) => {
        if (isRecords(id)) {
          // workerd pauses sampling between invocations. timeDeltas includes that
          // idle wall time, so weight each sample by the requested 1ms interval.
          sampledMs += 1;
          samples++;
        }
      });
      return { profile, sampledMs, samples };
    } finally {
      ws.close();
    }
  };
}
