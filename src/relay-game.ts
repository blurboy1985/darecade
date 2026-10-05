import { api } from "./social";
import { presentationTick } from "./relay-motion";
import { loadCharacter } from "./character";
import { currentProfile } from "./account";
import type { Save } from "./state";
import type { RelaySnapshot } from "../shared/relay-protocol";
import type { RelayView } from "./relay-view";
import {
  relayAction,
  relayBarriers,
  relayConfig,
  relayCatchWindow,
  relayPlatform,
  RELAY_END_ZONE,
  RELAY_OBSTACLE_Z,
  RELAY_PLATFORM_START,
  RELAY_PLATFORM_END,
  RELAY_SAFE_X,
  RELAY_SOLO_TARGET,
  RELAY_STOPS,
} from "../shared/relay";
import "./relay.css";

const SESSION = "playsimi-relay-session";
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );

export function mountRelay(
  host: HTMLElement,
  ctx: { save: Save; simple: boolean },
) {
  const root = document.createElement("section");
  root.className = "activity relay";
  host.replaceChildren(root);
  root.innerHTML = `<h2>Neighbourhood Relay</h2><p class="relay-intro">One bag. Four stops. Keep it moving together.</p>
    <div class="relay-setup"><label for="relay-difficulty">Choose the challenge</label><select id="relay-difficulty"><option value="practice">Practice · generous catches</option><option value="standard" selected>Standard · find your rhythm</option><option value="challenge">Challenge · tighter timing</option></select><div class="relay-choices"><button class="primary" data-relay="solo">Solo practice</button><button class="secondary" data-relay="create">Host a team</button></div><form id="relay-join"><label for="relay-code">Have a team code?</label><div><input id="relay-code" maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Team code"><button class="secondary" type="submit">Join team</button></div></form></div>
    <div class="relay-room" hidden><p class="relay-room-code"></p><ul class="relay-players" aria-label="Actual teammates"></ul><p class="relay-status" role="status"></p><div class="relay-lobby-actions"><button class="primary" data-relay="ready">Ready</button><button class="secondary" data-relay="start">Start together</button><button class="text-button" data-relay="leave">Leave team</button></div><div class="relay-play" hidden><div class="relay-hud"><span class="relay-stop"></span><strong class="relay-clock"></strong><span class="relay-count"></span></div><div class="relay-scene"><canvas class="relay-map" width="600" height="420" aria-label="Relay course map"></canvas></div><p class="relay-cue" role="status"></p><div class="relay-controls"><div class="relay-pad" aria-label="Move"><button data-relay-move="0,1" aria-label="Move forward">↑</button><button data-relay-move="-1,0" aria-label="Move left">←</button><button data-relay-move="0,-1" aria-label="Move back">↓</button><button data-relay-move="1,0" aria-label="Move right">→</button></div><button class="primary relay-action" type="button">Action</button></div><button class="text-button" data-relay="leave">Leave round</button></div></div>
    <p class="relay-error" role="alert"></p><button class="secondary relay-reconnect" hidden>Reconnect controls</button><details class="relay-help"><summary>How to relay</summary><p>Move with arrows or WASD. Space or E does the action shown on the button. Touch has a direction pad and the same action button.</p><p>The left path is safer but slower. The middle shortcut has moving platforms and barriers. Vault low obstacles, and recover a dropped bag nearby.</p><p>At each stop, bring the bag and a teammate to the handoff zone. Throw, then the receiver times the catch. Solo practice uses a marked catch target. Misses cost time; nobody gets kicked out.</p><p>Team time keeps running if you step away. A disconnected carrier returns the bag to the last checkpoint. This mode awards no XP, tokens or medals.</p></details>`;
  const q = <T extends HTMLElement = HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  const setup = q(".relay-setup"),
    room = q(".relay-room"),
    play = q(".relay-play");
  const error = q(".relay-error"),
    status = q(".relay-status"),
    reconnect = q<HTMLButtonElement>(".relay-reconnect");
  const action = q<HTMLButtonElement>(".relay-action"),
    canvas = q<HTMLCanvasElement>(".relay-map");
  const context = canvas.getContext("2d")!;
  const graphics = document.createElement("p");
  graphics.className = "relay-graphics";
  graphics.textContent = ctx.simple
    ? "2D course map · same route and controls."
    : "";
  root.insertBefore(graphics, q(".relay-help"));
  const abort = new AbortController();
  const keys = new Set<string>();
  const pointers = new Map<number, [number, number]>();
  const waitingRequests: (() => void)[] = [];
  const playerId = currentProfile?.id;
  let snapshot: RelaySnapshot | null = null;
  let snapshotReceivedAt = performance.now();
  let view: RelayView | null = null,
    viewLoading = false,
    viewFailed = false;
  let disposed = false,
    busy = false,
    stopped = false,
    seq = 0,
    actionSeq = 0,
    acknowledgedAction = 0,
    generation = 0;
  let code = "",
    signature = "",
    nextPoll = 0,
    lastAction = -Infinity,
    lastFrame = performance.now(),
    frame = 0;
  const live = () =>
    !disposed &&
    root.isConnected &&
    !!root.closest("dialog")?.open &&
    currentProfile?.id === playerId;
  const running = () =>
    live() && snapshot?.status === "running" && !stopped && !document.hidden;
  const clearInput = () => {
    keys.clear();
    pointers.clear();
  };
  const releaseRequest = () => {
    const resume = waitingRequests.shift();
    if (resume) resume();
    else busy = false;
  };
  async function waitForRequest() {
    if (busy)
      await new Promise<void>((resolve) => waitingRequests.push(resolve));
    else busy = true;
  }
  const remember = () => {
    try {
      if (snapshot)
        sessionStorage.setItem(
          SESSION,
          JSON.stringify({ room: snapshot.room, code }),
        );
      else sessionStorage.removeItem(SESSION);
    } catch {
      /* Storage can be unavailable; the open panel still works. */
    }
  };
  const input = () => {
    if (!running()) return { x: 0, z: 0 };
    let x =
      Number(keys.has("d") || keys.has("arrowright")) -
      Number(keys.has("a") || keys.has("arrowleft"));
    let z =
      Number(keys.has("w") || keys.has("arrowup")) -
      Number(keys.has("s") || keys.has("arrowdown"));
    for (const [px, pz] of pointers.values()) {
      x += px;
      z += pz;
    }
    return { x: Math.max(-1, Math.min(1, x)), z: Math.max(-1, Math.min(1, z)) };
  };
  const metadata = () => {
    if (!snapshot) return;
    const s = snapshot;
    setup.hidden = true;
    room.hidden = false;
    play.hidden = !s.simulation;
    root.dataset.phase = s.status;
    q(".relay-lobby-actions").hidden = s.status !== "waiting";
    q(".relay-room-code").textContent = s.solo
      ? "Solo practice · no other players"
      : code
        ? `Team code: ${code}`
        : s.host === s.slot
          ? "Team code wasn't received. Leave and host a new team."
          : "Your team · ask the host for its code";
    const next = JSON.stringify([
      s.host,
      s.status,
      s.players.map((p) => [p.slot, p.name, p.ready, p.online]),
    ]);
    if (signature !== next) {
      signature = next;
      q(".relay-players").innerHTML = s.players
        .map(
          (p) =>
            `<li>${escape(p.name)}${p.slot === s.slot ? " · you" : ""}<small>${!p.online ? "Disconnected" : s.status === "waiting" ? (p.ready ? "Ready" : "Getting ready") : "Playing"}</small></li>`,
        )
        .join("");
    }
    const mine = s.players.find((p) => p.slot === s.slot);
    q<HTMLButtonElement>('[data-relay="ready"]').textContent = mine?.ready
      ? "Not ready yet"
      : "Ready";
    const start = q<HTMLButtonElement>('[data-relay="start"]');
    start.hidden = s.host !== s.slot;
    start.disabled =
      s.status !== "waiting" ||
      (!s.solo && s.players.length < 2) ||
      s.players.some((p) => !p.online || !p.ready);
    if (s.status === "waiting")
      status.textContent = s.solo
        ? "Your practice route is ready."
        : "2–4 real players. Everyone chooses Ready before the host starts.";
    else if (s.status === "finished")
      status.textContent = `Delivery complete in ${((s.simulation?.finishedTick || 0) / 60).toFixed(1)}s! ${s.simulation?.handoffs || 0} handoffs · ${s.simulation?.recoveries || 0} recoveries. Leave to try a faster run. No rewards were added.`;
    else if (s.status === "timeout")
      status.textContent =
        "Time's up. Try a safer route or cleaner handoffs. Leave to start again.";
    else if (s.status === "cancelled")
      status.textContent =
        "This team is no longer available. Leave to start another run.";
    else status.textContent = "";
    if (s.status !== "running") clearInput();
    action.disabled = s.status !== "running" || stopped;
    root
      .querySelectorAll<HTMLButtonElement>("[data-relay-move]")
      .forEach((b) => (b.disabled = action.disabled));
    if (!ctx.simple && !view && !viewLoading && !viewFailed && s.simulation) {
      viewLoading = true;
      void Promise.all([import("./relay-view"), loadCharacter()])
        .then(([module]) => {
          if (!live() || !snapshot) return;
          view = new module.RelayView(
            q(".relay-scene"),
            snapshot.slot,
            ctx.save.reduced,
          );
          canvas.hidden = true;
          graphics.textContent = "";
          view.renderer.domElement.addEventListener(
            "webglcontextlost",
            () => {
              const lost = view;
              view = null;
              viewFailed = true;
              lost?.dispose();
              canvas.hidden = false;
              graphics.textContent =
                "3D interrupted. The course map uses the same route and controls.";
            },
            { signal: abort.signal },
          );
        })
        .catch(() => {
          viewFailed = true;
          canvas.hidden = false;
          graphics.textContent =
            "3D unavailable. The course map uses the same route and controls.";
        })
        .finally(() => {
          viewLoading = false;
        });
    }
  };
  const accept = (value: RelaySnapshot) => {
    snapshot = value;
    snapshotReceivedAt = performance.now();
    if (value.code) code = value.code;
    stopped = false;
    reconnect.hidden = true;
    error.textContent = "";
    remember();
    metadata();
  };
  async function command(path: string, data: unknown) {
    const requestedGeneration = generation;
    await waitForRequest();
    if (!live() || requestedGeneration !== generation) {
      releaseRequest();
      return null;
    }
    error.textContent = "";
    try {
      const value = await api<RelaySnapshot>(`relay/${path}`, data);
      if (!live() || requestedGeneration !== generation) {
        if (value?.room)
          void api("relay/leave", {
            room: value.room,
            controlEpoch: value.controlEpoch,
          }).catch(() => {});
        return null;
      }
      accept(value);
      return value;
    } catch (e) {
      if (live() && requestedGeneration === generation)
        error.textContent =
          e instanceof Error
            ? e.message
            : "The team could not connect. Try again.";
      return null;
    } finally {
      releaseRequest();
    }
  }
  async function tick() {
    if (!snapshot || busy || stopped || !live()) return;
    const requestedGeneration = generation;
    const current = snapshot,
      sentAction = actionSeq;
    busy = true;
    nextPoll = performance.now() + (current.status === "running" ? 250 : 1000);
    try {
      const result = await api<RelaySnapshot>("relay/tick", {
        room: current.room,
        controlEpoch: current.controlEpoch,
        seq: ++seq,
        actionSeq: sentAction,
        input: input(),
      });
      if (
        !live() ||
        snapshot?.room !== current.room ||
        requestedGeneration !== generation
      )
        return;
      acknowledgedAction = sentAction;
      accept(result);
    } catch (e) {
      if (
        !live() ||
        snapshot?.room !== current.room ||
        requestedGeneration !== generation
      )
        return;
      const message =
        e instanceof Error ? e.message : "Connection interrupted.";
      error.textContent = `${message} Team time keeps running.`;
      clearInput();
      nextPoll = performance.now() + 1500;
      if (/another tab|control|expired|unavailable|no longer/i.test(message)) {
        stopped = true;
        reconnect.hidden = false;
        snapshot = {
          ...current,
          players: [],
          simulation: null,
          status: "cancelled",
        };
        metadata();
      }
    } finally {
      releaseRequest();
    }
  }
  async function leave() {
    const previous = snapshot;
    generation++;
    clearInput();
    snapshot = null;
    code = "";
    signature = "";
    stopped = false;
    seq = actionSeq = acknowledgedAction = 0;
    remember();
    view?.dispose();
    view = null;
    viewFailed = false;
    canvas.hidden = false;
    room.hidden = true;
    setup.hidden = false;
    reconnect.hidden = true;
    error.textContent = "";
    root.dataset.phase = "setup";
    if (previous) {
      await waitForRequest();
      try {
        await api("relay/leave", {
          room: previous.room,
          controlEpoch: previous.controlEpoch,
        });
      } catch (e) {
        if (live())
          error.textContent = `Left on this device. ${e instanceof Error ? e.message : "The server will clear the inactive slot."}`;
      } finally {
        releaseRequest();
      }
    }
  }
  async function create(solo: boolean) {
    if (setup.dataset.starting === "true") return;
    setup.dataset.starting = "true";
    setup
      .querySelectorAll<HTMLButtonElement>("button")
      .forEach((button) => (button.disabled = true));
    seq = actionSeq = acknowledgedAction = 0;
    code = "";
    try {
      const value = await command("create", {
        solo,
        difficulty: q<HTMLSelectElement>("#relay-difficulty").value,
      });
      if (value && solo) {
        if (await command("ready", { room: value.room, ready: true }))
          await command("start", { room: value.room });
      }
    } finally {
      setup.dataset.starting = "false";
      setup
        .querySelectorAll<HTMLButtonElement>("button")
        .forEach((button) => (button.disabled = false));
    }
  }
  root.addEventListener(
    "click",
    (e) => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
        "[data-relay]",
      );
      if (!button || button.disabled) return;
      const kind = button.dataset.relay;
      if (kind === "solo" || kind === "create") void create(kind === "solo");
      else if (kind === "leave") void leave();
      else if (snapshot && kind === "ready")
        void command("ready", {
          room: snapshot.room,
          ready: !snapshot.players.find((p) => p.slot === snapshot!.slot)
            ?.ready,
        });
      else if (snapshot && kind === "start")
        void command("start", { room: snapshot.room });
    },
    { signal: abort.signal },
  );
  q<HTMLFormElement>("#relay-join").addEventListener(
    "submit",
    (e) => {
      e.preventDefault();
      if (setup.dataset.starting === "true") return;
      const value = q<HTMLInputElement>("#relay-code")
        .value.trim()
        .toUpperCase();
      if (!value) {
        error.textContent = "Enter your team's code first.";
        q("#relay-code").focus();
        return;
      }
      code = value;
      seq = actionSeq = acknowledgedAction = 0;
      setup.dataset.starting = "true";
      setup
        .querySelectorAll<HTMLButtonElement>("button")
        .forEach((button) => (button.disabled = true));
      void command("join", { code: value }).finally(() => {
        setup.dataset.starting = "false";
        setup
          .querySelectorAll<HTMLButtonElement>("button")
          .forEach((button) => (button.disabled = false));
      });
    },
    { signal: abort.signal },
  );
  reconnect.addEventListener(
    "click",
    () => {
      if (!snapshot || busy) return;
      seq = actionSeq = acknowledgedAction = 0;
      clearInput();
      void command("join", { room: snapshot.room });
    },
    { signal: abort.signal },
  );
  const actionEdge = () => {
    if (
      !running() ||
      performance.now() - lastAction < 250 ||
      actionSeq > acknowledgedAction
    )
      return;
    lastAction = performance.now();
    actionSeq++;
    void tick();
  };
  window.addEventListener(
    "keydown",
    (e) => {
      if (
        !running() ||
        /INPUT|SELECT|TEXTAREA/.test((e.target as HTMLElement)?.tagName)
      )
        return;
      const key = e.key.toLowerCase();
      if (
        ![
          "w",
          "a",
          "s",
          "d",
          "arrowup",
          "arrowdown",
          "arrowleft",
          "arrowright",
          " ",
          "e",
        ].includes(key)
      )
        return;
      e.preventDefault();
      if (key === " " || key === "e") {
        if (!e.repeat) actionEdge();
      } else keys.add(key);
    },
    { signal: abort.signal },
  );
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()), {
    signal: abort.signal,
  });
  window.addEventListener(
    "blur",
    () => {
      clearInput();
      void tick();
    },
    { signal: abort.signal },
  );
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) {
        clearInput();
        void tick();
      }
    },
    { signal: abort.signal },
  );
  window.addEventListener("session-expired", dispose, { signal: abort.signal });
  root
    .querySelectorAll<HTMLButtonElement>("[data-relay-move]")
    .forEach((button) => {
      button.addEventListener(
        "pointerdown",
        (e) => {
          if (!running()) return;
          e.preventDefault();
          button.setPointerCapture(e.pointerId);
          pointers.set(
            e.pointerId,
            button.dataset.relayMove!.split(",").map(Number) as [
              number,
              number,
            ],
          );
          void tick();
        },
        { signal: abort.signal },
      );
      const release = (e: PointerEvent) => {
        pointers.delete(e.pointerId);
        void tick();
      };
      button.addEventListener("pointerup", release, { signal: abort.signal });
      button.addEventListener("pointercancel", release, {
        signal: abort.signal,
      });
      button.addEventListener("lostpointercapture", release, {
        signal: abort.signal,
      });
    });
  action.addEventListener(
    "pointerdown",
    (e) => {
      e.preventDefault();
      actionEdge();
    },
    { signal: abort.signal },
  );
  action.addEventListener(
    "click",
    (e) => {
      if (e.detail === 0) actionEdge();
    },
    { signal: abort.signal },
  );

  function drawMap(s: RelaySnapshot) {
    const state = s.simulation;
    context.clearRect(0, 0, 600, 420);
    context.fillStyle = "#d8e5c9";
    context.fillRect(0, 0, 600, 420);
    context.fillStyle = "#e4cda1";
    context.fillRect(90, 10, 420, 400);
    context.fillStyle = "#bad59b";
    context.fillRect(90, 10, 116, 400);
    context.font = "bold 15px sans-serif";
    context.fillStyle = "#294d42";
    context.fillText("SAFE", 112, 34);
    context.fillText("SHORTCUT", 300, 34);
    if (!state) return;
    const visualTick = presentationTick(
      state.tick,
      (performance.now() - snapshotReceivedAt) / 1000,
      s.status,
    );
    const point = (x: number, z: number) => [300 + x * 40, 390 - z * 11.5];
    const rectangle = (
      x: number,
      z: number,
      width: number,
      depth: number,
      color: string,
    ) => {
      const [px, py] = point(x - width / 2, z + depth / 2);
      context.fillStyle = color;
      context.fillRect(px, py, width * 40, depth * 11.5);
    };
    rectangle(
      (RELAY_SAFE_X + 5) / 2,
      (RELAY_PLATFORM_START + RELAY_PLATFORM_END) / 2,
      5 - RELAY_SAFE_X,
      RELAY_PLATFORM_END - RELAY_PLATFORM_START,
      "#78b9c7",
    );
    const platform = relayPlatform(visualTick, state.difficulty, state.leg);
    rectangle(
      platform.x,
      platform.z,
      platform.width,
      platform.depth,
      "#a78058",
    );
    for (const barrier of relayBarriers(
      visualTick,
      state.difficulty,
      state.leg,
    ))
      rectangle(
        barrier.x,
        barrier.z,
        barrier.width,
        0.9,
        barrier.warning ? "#d49336" : "#af6286",
      );
    rectangle(
      (RELAY_SAFE_X + 5) / 2,
      RELAY_OBSTACLE_Z,
      5 - RELAY_SAFE_X,
      0.6,
      "#987c5e",
    );
    if (state.solo || state.runners.filter((r) => r.connected).length === 1) {
      const [tx, ty] = point(RELAY_SOLO_TARGET.x, RELAY_SOLO_TARGET.z);
      context.strokeStyle = "#7157ad";
      context.lineWidth = 3;
      context.beginPath();
      context.arc(tx, ty, 17, 0, Math.PI * 2);
      context.stroke();
    }
    context.strokeStyle = "#547b61";
    context.lineWidth = 3;
    context.strokeRect(105, 36, 390, 34);
    for (const runner of state.runners) {
      if (!runner.connected) continue;
      const [x, y] = point(runner.x, runner.z);
      context.fillStyle = runner.slot === s.slot ? "#596cdb" : "#e48a73";
      context.beginPath();
      context.arc(x, y, 11, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = "#243d35";
      context.textAlign = "center";
      context.fillText(
        runner.slot === s.slot
          ? "YOU"
          : s.players.find((p) => p.slot === runner.slot)?.name || "Teammate",
        x,
        y - 17,
      );
    }
    context.textAlign = "left";
    let bag =
      state.bag.owner === null
        ? state.bag
        : state.runners.find((p) => p.slot === state.bag.owner) || state.bag;
    if (state.bag.flight) {
      const f = state.bag.flight;
      const t = Math.max(
        0,
        Math.min(1, (visualTick - f.startTick) / (f.endTick - f.startTick)),
      );
      bag = {
        ...state.bag,
        x: f.x0 + (f.x1 - f.x0) * t,
        z: f.z0 + (f.z1 - f.z0) * t,
      };
    }
    const [bx, by] = point(bag.x, bag.z);
    context.fillStyle = "#bd784b";
    context.fillRect(bx + 9, by - 8, 12, 13);
  }
  function draw() {
    if (!snapshot?.simulation) return;
    const state = snapshot.simulation;
    q(".relay-stop").textContent =
      `${Math.min(4, state.leg + 1)}/4 · ${RELAY_STOPS[Math.min(3, state.leg)]}`;
    q(".relay-clock").textContent =
      `${Math.max(0, Math.ceil((relayConfig(state.difficulty).limitTicks - state.tick) / 60))}s left`;
    q(".relay-count").textContent =
      `${state.handoffs} handoffs · ${state.drops} drops`;
    const receiving = state.bag.flight?.to === snapshot.slot;
    const carrying = state.bag.owner === snapshot.slot;
    const me = state.runners.find((p) => p.slot === snapshot!.slot);
    const contextAction = relayAction(state, snapshot.slot);
    const flight = state.bag.flight;
    const visualTick = presentationTick(
      state.tick,
      (performance.now() - snapshotReceivedAt) / 1000,
      snapshot.status,
    );
    const catchWindow = flight
      ? relayCatchWindow(flight, state.difficulty)
      : null;
    action.textContent = {
      catch: "Catch!",
      recover: "Pick up",
      throw: "Throw",
      vault: "Vault",
      wait: "Action",
    }[contextAction];
    q(".relay-cue").textContent = receiving
      ? catchWindow &&
        visualTick >= catchWindow.start &&
        visualTick <= catchWindow.end
        ? "Catch now!"
        : "Watch the bag. Catch as it reaches the ring."
      : contextAction === "recover"
        ? "Your bag is here. Pick it up and keep going."
        : carrying && (me?.z || 0) >= RELAY_END_ZONE && contextAction === "wait"
          ? "Bring the bag close to the catch ring or your teammate."
          : carrying
            ? "You have the bag. Head for the next stop."
            : "Stay with your teammate and be ready to catch.";
    if (view)
      view.draw(
        snapshot,
        Math.min(0.1, (performance.now() - lastFrame) / 1000),
      );
    else drawMap(snapshot);
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    abort.abort();
    clearInput();
    cancelAnimationFrame(frame);
    view?.dispose();
    if (snapshot)
      void api("relay/leave", {
        room: snapshot.room,
        controlEpoch: snapshot.controlEpoch,
      }).catch(() => {});
    snapshot = null;
    remember();
    if (root.isConnected) root.textContent = "Relay closed.";
  }
  const loop = (now: number) => {
    if (!live()) {
      dispose();
      return;
    }
    if (snapshot && now >= nextPoll) void tick();
    draw();
    lastFrame = now;
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
  try {
    const old = JSON.parse(sessionStorage.getItem(SESSION) || "null");
    if (old && typeof old.room === "string") {
      code = typeof old.code === "string" ? old.code : "";
      void command("join", { room: old.room }).then((result) => {
        if (!result) {
          snapshot = null;
          remember();
        }
      });
    }
  } catch {
    /* Start a new room if the local resume hint is unavailable. */
  }
}
