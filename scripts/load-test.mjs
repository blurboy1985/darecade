// Node, Windows PowerShell/Linux/macOS: npm run load:test
// This owns an isolated LOCAL wrangler dev. There is deliberately no remote URL option.
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { once } from "node:events";
import WebSocket from "ws";
import { Simulation, rulesVersion } from "../shared/simulation.ts";
import { startProfile } from "./load-profile.mjs";
import { changedMetricInstances } from "./load-metrics.mjs";

const args = process.argv.slice(2);
const flags = [
  "--players",
  "--seconds",
  "--port",
  "--inspector-port",
  "--mode",
  "--registered",
  "--runs",
  "--iterations",
  "--profile",
];
if (
  args.length % 2 ||
  args.some((arg, i) => i % 2 === 0 && !flags.includes(arg))
)
  throw Error(
    `Only ${flags.join(", ")} are supported. Remote targets are forbidden.`,
  );
const options = Object.fromEntries(
  Array.from({ length: args.length / 2 }, (_, i) => [
    args[i * 2],
    args[i * 2 + 1],
  ]),
);
const players = Number(options["--players"] ?? 150),
  seconds = Number(options["--seconds"] ?? 300),
  port = Number(options["--port"] ?? 8799),
  inspector = Number(options["--inspector-port"] ?? 9249),
  registered = Number(options["--registered"] ?? 1000),
  runs = Number(options["--runs"] ?? 20000),
  iterations = Number(options["--iterations"] ?? 5),
  mode = options["--mode"] ?? "mixed",
  profiling = options["--profile"] ?? "on";
if (
  ![players, seconds, port, inspector, registered, runs, iterations].every(
    Number.isInteger,
  ) ||
  players < 1 ||
  players > 300 ||
  seconds < 5 ||
  seconds > 600 ||
  port < 1024 ||
  port > 65535 ||
  inspector < 1024 ||
  inspector > 65535 ||
  port === inspector ||
  registered < players ||
  registered > 2000 ||
  runs < 0 ||
  runs > 40000 ||
  iterations < 1 ||
  iterations > 50 ||
  !["mixed", "idle", "moving", "http", "probe"].includes(mode) ||
  !["on", "off"].includes(profiling)
)
  throw Error("Invalid local load parameters.");
// mixed keeps the original load unchanged. The other modes isolate a path.
// probe is a fixed request sequence, e.g. --mode probe --players 2 --registered 20 --runs 200.
const usesSockets = ["mixed", "idle", "moving"].includes(mode);
const origin = `http://127.0.0.1:${port}`;
// Fail before spawning if another service owns the requested ports.
const { createServer } = await import("node:net");
for (const p of [port, inspector]) {
  const server = createServer().listen(p, "127.0.0.1");
  await once(server, "listening");
  await new Promise((r) => server.close(r));
}
await mkdir(".browser", { recursive: true });
const directory = await mkdtemp(resolve(".browser/load-"));
const child = spawn(
  process.execPath,
  [
    "node_modules/wrangler/bin/wrangler.js",
    "dev",
    "--local",
    "--config",
    "scripts/wrangler.load.jsonc",
    "--port",
    String(port),
    "--inspector-port",
    String(inspector),
    "--persist-to",
    resolve(directory, "state"),
    "--log-level",
    "warn",
  ],
  {
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      WRANGLER_SEND_METRICS: "false",
      CLOUDFLARE_API_TOKEN: "",
      CLOUDFLARE_API_KEY: "",
    },
  },
);
let log = "";
child.stdout.on("data", (d) => {
  log += d;
});
child.stderr.on("data", (d) => {
  log += d;
});
const sockets = [],
  intervals = [],
  stateMs = [],
  sizes = [],
  errors = [];
let started = 0,
  sending,
  stateTimer,
  received = 0,
  sent = 0,
  measuring = false,
  completed = 0,
  stateCalls = 0,
  directoryCalls = 0,
  pollCalls = 0;
const tasks = new Set();
const recordError = (e) =>
  errors.push(e instanceof Error ? e.message : String(e));
const runTask = (task) => {
  tasks.add(task);
  task.finally(() => tasks.delete(task));
};
const request = async (path, body, cookie = "") => {
  const response = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  const value = await response.json();
  if (!response.ok)
    throw Error(`${path}: ${response.status} ${value.error || ""}`);
  return value;
};
const interrupted = new AbortController();
const interrupt = () => interrupted.abort();
process.once("SIGINT", interrupt);
process.once("SIGTERM", interrupt);
try {
  let ready = false;
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw Error(`Wrangler exited: ${log}`);
    try {
      ready =
        (await request("/__load/health")).fixture === "darecade-local-load-v1";
    } catch {}
    if (ready) break;
    await sleep(250);
  }
  if (!ready) throw Error(`Local fixture failed to start: ${log}`);
  const users = await request("/__load/seed", {
    players,
    registered,
    runs,
  });
  console.log(
    `Seeded ${registered} synthetic accounts / ${runs} runs. ${mode}: ${players} players…`,
  );
  const worlds = {};
  for (const user of usesSockets ? users : []) {
    const ws = new WebSocket(
      `${origin.replace("http:", "ws:")}/api/world/connect?connection=load-${user.id}`,
      {
        headers: { Cookie: user.cookie, Origin: origin },
        handshakeTimeout: 15000,
        followRedirects: false,
      },
    );
    sockets.push(ws);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("No initial world snapshot")),
        15000,
      );
      ws.on("error", (e) => {
        clearTimeout(timer);
        recordError(e);
        reject(e);
      });
      let last = 0,
        joined = false;
      ws.on("message", (raw) => {
        const packet = JSON.parse(raw.toString());
        if (packet.t === "closed") {
          if (measuring) recordError("Server closed a player");
          ws.close();
          return;
        }
        if (!joined && packet.t === "sync") {
          joined = true;
          clearTimeout(timer);
          worlds[packet.world] = (worlds[packet.world] || 0) + 1;
          resolve();
        }
        if (measuring && packet.d?.length) {
          const now = performance.now();
          received++;
          sizes.push(raw.length);
          if (last) intervals.push(now - last);
          last = now;
        }
      });
      ws.on("close", () => {
        if (measuring) recordError("Unexpected socket close");
      });
    });
  }
  if (mode === "http") {
    for (const user of users) {
      const packet = await request(
        `/api/world/poll?connection=load-${user.id}`,
        {
          x: 0,
          z: 0,
          yaw: 0,
          activity: "rest",
          away: false,
          emote: "",
        },
        user.cookie,
      );
      user.world = packet.world;
      worlds[packet.world] = (worlds[packet.world] || 0) + 1;
    }
    // Avoid treating the first measured poll as a too-fast retry of the join.
    await sleep(250);
  }
  const worldMetrics = (reset = false) =>
    request("/__load/world-metrics", {
      worlds: Object.keys(worlds),
      reset,
    });
  // Warm the shared snapshot, then exclude seeding and connection setup from metrics.
  await request("/api/state", undefined, users[0].cookie);
  const stopProfile =
    profiling === "on" ? await startProfile(inspector) : async () => null;
  const recordsStart = await request("/__load/metrics", {});
  const worldsStart = await worldMetrics(true);
  started = performance.now();
  measuring = true;
  let tick = 0;
  if (mode === "mixed" || mode === "moving")
    sending = setInterval(() => {
      tick++;
      sockets.forEach((ws, n) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              x: Math.sin(tick / 20 + n) * 10,
              z: Math.cos(tick / 20 + n) * 10,
              yaw: (tick / 20 + n) % 6.28,
              activity: "jog",
              away: false,
              emote: "",
            }),
          );
          sent++;
        }
      });
    }, 200);
  const readStates = async () => {
    for (const user of users) {
      if (!measuring) break;
      const before = performance.now();
      try {
        await request("/api/state", undefined, user.cookie);
        stateMs.push(performance.now() - before);
        stateCalls++;
      } catch (e) {
        recordError(e);
      }
    }
  };
  if (mode === "mixed") {
    runTask(readStates());
    stateTimer = setInterval(() => runTask(readStates()), 30000);
  }
  if (mode === "http") {
    // One in-flight poll per player; never queue overlapping retries under load.
    for (const [n, user] of users.entries())
      runTask(
        (async () => {
          let tick = 0,
            last = 0;
          while (measuring && !interrupted.signal.aborted) {
            const before = performance.now();
            try {
              const packet = await request(
                `/api/world/poll?world=${user.world}&connection=load-${user.id}`,
                {
                  x: Math.sin(tick / 20 + n) * 10,
                  z: Math.cos(tick / 20 + n) * 10,
                  yaw: (tick / 20 + n) % 6.28,
                  activity: "jog",
                  away: false,
                  emote: "",
                },
                user.cookie,
              );
              sent++;
              pollCalls++;
              received++;
              sizes.push(Buffer.byteLength(JSON.stringify(packet)));
              const now = performance.now();
              if (last) intervals.push(now - last);
              last = now;
            } catch (e) {
              recordError(e);
            }
            tick++;
            // Match the browser fallback's two-second polling cadence.
            await sleep(2000);
          }
        })(),
      );
  }
  if (mode === "probe") {
    for (let i = 0; i < iterations; i++) {
      await readStates();
      for (const user of users) {
        await request("/api/worlds", undefined, user.cookie);
        directoryCalls++;
      }
    }
  }
  // Three real replay-validated rounds, honoring server elapsed-time validation.
  for (const user of mode === "mixed" ? users.slice(0, 3) : [])
    runTask(
      (async () => {
        try {
          const before = performance.now();
          const run = await request("/api/run", { game: "hop" }, user.cookie);
          const sim = new Simulation("hop", run.seed),
            events = [];
          let previous = "";
          while (!sim.ended) {
            const input = [0, 0, -1, Number(sim.ticks % 60 === 0), -1, -1],
              stamp = JSON.stringify(input);
            if (stamp !== previous) {
              events.push([sim.ticks, ...input]);
              previous = stamp;
            }
            sim.advance(input);
          }
          const wait =
            (sim.ticks / 60) * 1000 - (performance.now() - before) + 350;
          if (wait > seconds * 1000 - 500) return;
          await sleep(Math.max(0, wait));
          const result = await request(
            "/api/finish",
            {
              id: run.id,
              score: sim.score,
              replay: {
                version: rulesVersion("hop"),
                ticks: sim.ticks,
                events,
              },
            },
            user.cookie,
          );
          if (!result.verified) throw Error("Round was not verified");
          completed++;
        } catch (e) {
          recordError(e);
        }
      })(),
    );
  for (
    let elapsed = 0;
    mode !== "probe" && elapsed < seconds;
    elapsed += Math.min(30, seconds - elapsed)
  ) {
    await sleep(Math.min(30, seconds - elapsed) * 1000, undefined, {
      signal: interrupted.signal,
    });
    console.log(
      `${Math.min(seconds, elapsed + 30)}s: ${sockets.filter((s) => s.readyState === 1).length} connected, ${sent} sent, ${received} snapshots, ${errors.length} errors`,
    );
  }
  measuring = false;
  clearInterval(sending);
  clearInterval(stateTimer);
  await Promise.allSettled([...tasks]);
  const duration = (performance.now() - started) / 1000;
  const metrics = await request("/__load/metrics");
  const worldStorage = await worldMetrics();
  const counterResets = changedMetricInstances(
    { Records: recordsStart, ...worldsStart },
    { Records: metrics, ...worldStorage },
  );
  for (const name of counterResets)
    recordError(
      `${name} was reconstructed during measurement; its in-memory counters are incomplete`,
    );
  const cpu = await stopProfile();
  const calls = Object.values(metrics.calls).reduce((a, b) => a + b, 0);
  const p95 = (values) =>
    values.length
      ? values.sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]
      : null;
  const report = {
    date: new Date().toISOString(),
    runtime: "wrangler dev --local",
    mode,
    registered,
    seededRuns: runs,
    ...(mode === "probe"
      ? {
          iterations,
          workload:
            "fixed state/directory request sequence; no transports, timers or rounds",
        }
      : {}),
    players,
    durationSeconds: duration,
    worlds,
    connected: usesSockets
      ? sockets.filter((s) => s.readyState === 1).length
      : null,
    sent,
    received,
    sentPerSecond: sent / duration,
    snapshotsPerSecond: received / duration,
    errors: errors.length,
    errorDetails: errors.slice(0, 30),
    p95SnapshotIntervalMs: p95(intervals),
    maxSnapshotGapMs: intervals.reduce((max, value) => Math.max(max, value), 0),
    p95SnapshotBytes: p95(sizes),
    stateCalls,
    directoryCalls,
    pollCalls,
    p95StateWallMs: p95(stateMs),
    verifiedRounds: completed,
    records: metrics,
    worldStorage,
    measurement: {
      countersStable: counterResets.length === 0,
      counterResets,
      sqlUnit:
        "workerd cursor rowsRead/rowsWritten after cursor consumption; local runtime counts, not hosted billing",
      statements:
        "normalized SQL text; calls counts SQL executions, operations attributes them to Records requests/RPCs",
      excluded:
        "seeding, connection setup, initial state warmup, metric readback, reset and teardown",
      worldStorageUnit:
        "KV and alarm API invocation counts, not SQL rows or billed storage operations",
      persistence:
        "fixture-only in-memory counters; object eviction resets counters",
    },
    recordsCpu: cpu
      ? {
          method:
            "Local DevTools 1ms sampling, Records stack attribution; estimate, not hosted/billed CPU",
          samples: cpu.samples,
          totalEstimatedMs: cpu.sampledMs,
          meanEstimatedMsPerInvocation: cpu.samples
            ? cpu.sampledMs / calls
            : null,
        }
      : { method: "disabled with --profile off" },
  };
  if (cpu)
    await writeFile(
      resolve(directory, "records.cpuprofile"),
      JSON.stringify(cpu.profile),
    );
  await writeFile(
    resolve(directory, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(JSON.stringify(report, null, 2));
  console.log(`Evidence: ${directory}`);
  if (
    errors.length ||
    (usesSockets && report.connected !== players) ||
    (mode === "mixed" && seconds >= 90 && completed !== Math.min(3, players))
  )
    process.exitCode = 1;
} finally {
  process.removeListener("SIGINT", interrupt);
  process.removeListener("SIGTERM", interrupt);
  measuring = false;
  clearInterval(sending);
  clearInterval(stateTimer);
  for (const ws of sockets) ws.close();
  await sleep(500);
  for (const ws of sockets) ws.terminate();
  child.kill("SIGTERM");
  await writeFile(resolve(directory, "wrangler.log"), log);
}
