import { crops, cropReadyAt } from "./state";
import type { ActivityContext } from "./activities";
import {
  createWaterTrail,
  pipeDirections,
  traceWater,
  trailTiles,
  type WaterTrail,
} from "../shared/plot-trail";
import type { createPlotView } from "./plot-view";

type TrailScreen = {
  kind: "trail";
  crop: string;
  planted: number;
  trail: WaterTrail;
  turns: number[];
  mode: "watering" | "practice" | "watered";
};
const clock = (ms: number) => {
  const minutes = Math.max(1, Math.ceil(ms / 60000));
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes} min`;
};
const flavours: Record<string, string> = {
  chilli: "A little spice for the block",
  pandan: "That pandan-cake smell",
  sunflower: "Sunshine for the neighbours",
};
const pipeSvg = (mask: number) =>
  `<svg viewBox="0 0 100 100" aria-hidden="true">${[
    [50, 0],
    [100, 50],
    [50, 100],
    [0, 50],
  ]
    .map(([x, y], d) => (mask & (1 << d) ? `<path d="M50 50L${x} ${y}"/>` : ""))
    .join("")}<circle cx="50" cy="50" r="9"/></svg>`;

export function mountPlots(host: HTMLElement, ctx: ActivityContext) {
  const reduced =
    ctx.save.reduced ||
    (typeof matchMedia === "function" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches);
  const root = document.createElement("div");
  root.className = `activity activity-plots${reduced ? " plot-reduced" : ""}`;
  const view = document.createElement("div");
  view.className = "plot-view";
  const status = document.createElement("p");
  status.className = "activity-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  root.append(view, status);
  host.replaceChildren(root);
  const live = () => root.isConnected && !!root.closest("dialog")?.open;
  let screen: { kind: "plot" } | TrailScreen = { kind: "plot" };
  let pending = false;
  let variation = 0;
  let visual: ReturnType<typeof createPlotView> = null;
  const visualHost = document.createElement("div");
  visualHost.className = "plot-visual";
  const disposeVisual = () => {
    visual?.dispose();
    visual = null;
    visualHost.remove();
  };

  const render = (focus?: string) => {
    const crop = crops.find((c) => c.id === ctx.save.plotCrop);
    if (screen.kind === "trail") {
      const tiles = trailTiles(screen.trail, screen.turns);
      const flow = traceWater(tiles);
      const game = screen;
      view.innerHTML = `<button class="text-button plot-back" data-plot-back ${pending ? "disabled" : ""}>← Back to plot</button><h2>Water trail</h2><p class="lead">Turn the 3 golden pipes. Join the tap to the plant.</p><p class="trail-rule">${game.crop === "sunflower" ? "Linked loop: each pipe also turns the next." : game.crop === "pandan" ? "Linked pair: pipe 1 also turns pipe 2." : "Easy flow: each pipe turns on its own."}</p><p class="plot-tag">${game.mode === "practice" ? "JUST FOR FUN · NO EXTRA REWARDS" : game.mode === "watered" ? "WATERING SAVED · HAPPY ROOTS" : "ONE WATERING · GROW A QUARTER SOONER"}</p><div class="trail-frame"><span class="trail-tap" aria-label="Tap, water enters from the left">💧<span>IN →</span></span><div class="water-trail" role="group" aria-label="Water pipes, 3 rows by 3 columns">${tiles
        .map((mask, cell) => {
          const gate = game.trail.gates.indexOf(cell);
          const wet = flow.wet.includes(cell);
          const cls = `trail-cell${wet ? " wet" : ""}${gate >= 0 ? " turnable" : ""}`;
          const label = `Row ${Math.floor(cell / 3) + 1}, column ${(cell % 3) + 1}. ${pipeDirections.filter((_, d) => mask & (1 << d)).join(" and ")}. ${wet ? "Water reached here." : "Dry."}`;
          const also =
            gate >= 0
              ? game.trail.links[gate]
                  .filter((n) => n !== gate)
                  .map((n) => n + 1)
                  .join(", ")
              : "";
          return gate >= 0 && !flow.complete
            ? `<button class="${cls}" data-pipe="${gate}" id="pipe-${gate}" aria-label="Turn pipe ${gate + 1} clockwise.${also ? ` Also turns pipe ${also}.` : ""} ${label}" ${pending ? "disabled" : ""}>${pipeSvg(mask)}<b>${gate + 1} ↻${also ? ` +${also}` : ""}</b></button>`
            : `<span class="${cls}" role="img" aria-label="${label}">${pipeSvg(mask)}${gate >= 0 ? `<b>${gate + 1} ✓</b>` : ""}</span>`;
        })
        .join(
          "",
        )}</div><span class="trail-plant" aria-label="Plant, water exits to the right"><span>→ OUT</span>${flow.complete ? crop?.icon || "🌻" : "🌱"}</span></div><p class="trail-meter">${flow.complete ? "Every channel is flowing!" : `${flow.wet.length} / 9 channels flowing`}</p>${flow.complete && !pending ? `<button class="primary" id="${game.mode !== "watering" ? "plot-again" : "plot-retry"}">${game.mode !== "watering" ? "Another trail" : "Save watering"}</button>` : ""}<p class="fine-print">No timer. No lost crops. ${flow.complete ? "" : "Tap a numbered pipe, or use Tab and Enter."}</p>`;
    } else if (!crop) {
      view.innerHTML = `<h2>Community Plots</h2><p class="lead">Pick a seed. Connect the water. Watch it grow.</p><div class="seed-grid">${crops.map((c) => `<button data-seed="${c.id}" ${pending ? "disabled" : ""}><i aria-hidden="true">${c.icon}</i><strong>${c.name}</strong><small>${flavours[c.id]}</small><small>${c.id === "chilli" ? "Easy flow" : c.id === "pandan" ? "Linked pair" : "Linked loop"} · ${c.hours}h · +${c.xp} XP</small></button>`).join("")}</div><p class="fine-print">${ctx.save.harvests} harvests grown. One crop at a time. Nothing wilts.</p>`;
    } else {
      const left = cropReadyAt(ctx.save) - Date.now();
      const grown = Math.max(0, Math.min(1, 1 - left / (crop.hours * 3600000)));
      const ready = left <= 0;
      view.innerHTML = `<h2>Community Plots</h2><p class="lead">${flavours[crop.id]}</p><div class="plot-bed ${ready ? "ready" : ""}"><span class="plot-tag">${ready ? "PICK OF THE PATCH" : ctx.save.plotWatered ? "HAPPILY WATERED" : "A LITTLE CARE GOES A LONG WAY"}</span><i aria-hidden="true">${ready ? crop.icon : grown < 0.4 ? "🌱" : "🪴"}</i><strong>${crop.name}${ready ? " is ready!" : ""}</strong><div class="plot-growth" role="progressbar" aria-label="Crop growth" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.floor(grown * 100)}"><span style="width:${grown * 100}%"></span></div><small id="plot-left">${ready ? "Ready whenever you are" : `Ready in ${clock(left)}`}</small></div>${ready ? `<button class="primary" id="plot-harvest" ${pending ? "disabled" : ""}>Harvest · +${crop.xp} XP</button>` : !ctx.save.plotWatered ? `<button class="primary" id="plot-tend" ${pending ? "disabled" : ""}>Connect the water →</button>` : ""}${ctx.save.plotWatered || ready ? `<button class="secondary" id="plot-practice" ${pending ? "disabled" : ""}>Play a water trail</button>` : ""}<p class="fine-print">${ctx.save.harvests} harvests grown. It keeps growing when you leave. Nothing wilts.</p>`;
    }
    if (screen.kind === "trail") {
      view.querySelector(".water-trail")?.append(visualHost);
      const tiles = trailTiles(screen.trail, screen.turns);
      const flow = traceWater(tiles);
      visual?.update(tiles, flow.wet, flow.complete, screen.crop);
    }
    if (focus) view.querySelector<HTMLElement>(focus)?.focus();
  };

  const send = async (event: string, value: unknown, done: string) => {
    if (pending) return;
    pending = true;
    const before = `${ctx.save.harvests}:${ctx.save.plotCrop}:${ctx.save.plotPlanted}:${ctx.save.plotWatered}`;
    const readyBefore = cropReadyAt(ctx.save);
    status.textContent = "Saving your plot…";
    render();
    try {
      await ctx.report(event, value);
      if (!live()) return;
      const changed =
        before !==
        `${ctx.save.harvests}:${ctx.save.plotCrop}:${ctx.save.plotPlanted}:${ctx.save.plotWatered}`;
      if (changed) {
        if (event === "tend" && screen.kind === "trail")
          screen.mode = "watered";
        else {
          disposeVisual();
          screen = { kind: "plot" };
        }
        status.textContent =
          event === "tend"
            ? `Water reached every root! Ready ${clock(readyBefore - cropReadyAt(ctx.save))} sooner.`
            : done;
        ctx.sound(
          event === "harvest"
            ? "levelup"
            : event === "tend"
              ? "plot-bloom"
              : "coin",
        );
      } else {
        status.textContent =
          "No save confirmation yet. Try again, or reload the page to refresh your plot.";
      }
    } catch {
      if (live())
        status.textContent =
          "No save confirmation yet. Your trail is still here. Try again, or reload the page.";
    } finally {
      pending = false;
      if (live()) {
        render();
        const target = view.querySelector<HTMLElement>("h2");
        if (target) {
          target.tabIndex = -1;
          target.focus();
        }
      }
    }
  };
  const startTrail = (practice: boolean) => {
    disposeVisual();
    screen = {
      kind: "trail",
      crop: ctx.save.plotCrop,
      planted: ctx.save.plotPlanted,
      trail: createWaterTrail(
        ctx.save.plotCrop,
        ctx.save.plotPlanted,
        practice ? ++variation : 0,
      ),
      turns: [0, 0, 0],
      mode: practice ? "practice" : "watering",
    };
    status.textContent =
      "Follow the water from IN to OUT. Only the golden pipes turn.";
    render("[data-pipe]");
    const game = screen;
    void import("./plot-view")
      .then(({ createPlotView }) => {
        if (!live() || screen !== game) return;
        visual = createPlotView(visualHost, {
          reduced,
        });
        const tiles = trailTiles(game.trail, game.turns);
        const flow = traceWater(tiles);
        visual?.update(tiles, flow.wet, flow.complete, game.crop);
      })
      .catch(() => {
        /* The HTML pipes remain fully playable without 3D. */
      });
  };
  const submitTrail = (game: TrailScreen) => {
    if (game.mode === "practice") {
      status.textContent = "Nice one! The whole patch has water.";
      ctx.sound("plot-bloom");
      render("#plot-again");
    } else
      void send(
        "tend",
        { crop: game.crop, planted: game.planted, turns: [...game.turns] },
        "Watered!",
      );
  };
  root.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest("button");
    if (!button || button.disabled || pending) return;
    if (button.hasAttribute("data-plot-back")) {
      disposeVisual();
      screen = { kind: "plot" };
      status.textContent = "";
      render("#plot-tend, #plot-practice");
    } else if (button.dataset.seed)
      void send(
        "plant",
        button.dataset.seed,
        "Seed planted. Give it a water trail!",
      );
    else if (button.id === "plot-tend") startTrail(false);
    else if (button.id === "plot-practice" || button.id === "plot-again")
      startTrail(true);
    else if (button.id === "plot-harvest")
      void send(
        "harvest",
        undefined,
        "Harvest picked! What shall we grow next?",
      );
    else if (button.id === "plot-retry" && screen.kind === "trail")
      submitTrail(screen);
    else if (button.dataset.pipe !== undefined && screen.kind === "trail") {
      const gate = Number(button.dataset.pipe);
      const reachedBefore = traceWater(trailTiles(screen.trail, screen.turns))
        .wet.length;
      screen.turns[gate] = (screen.turns[gate] + 1) % 4;
      const flow = traceWater(trailTiles(screen.trail, screen.turns));
      status.textContent = `${flow.wet.length} of 9 channels flowing.${flow.complete ? " Water reached the plant!" : " Keep turning the golden pipes."}`;
      if (flow.complete) submitTrail(screen);
      else {
        ctx.sound(flow.wet.length > reachedBefore ? "plot-flow" : "plot-turn");
        render(`#pipe-${gate}`);
      }
    }
  });
  const tick = window.setInterval(() => {
    if (!live()) return cleanup();
    if (pending || screen.kind !== "plot" || !ctx.save.plotCrop) return;
    const left = cropReadyAt(ctx.save) - Date.now();
    const label = view.querySelector("#plot-left");
    if (left > 0 && label) {
      label.textContent = `Ready in ${clock(left)}`;
      const crop = crops.find((c) => c.id === ctx.save.plotCrop);
      if (crop) {
        const grown = Math.max(
          0,
          Math.min(100, 100 * (1 - left / (crop.hours * 3600000))),
        );
        view
          .querySelector(".plot-growth")
          ?.setAttribute("aria-valuenow", String(Math.floor(grown)));
        const fill = view.querySelector<HTMLElement>(".plot-growth span");
        if (fill) fill.style.width = `${grown}%`;
      }
    } else if (!view.querySelector("#plot-harvest")) {
      status.textContent = "Your crop is ready to pick!";
      render();
    }
  }, 1000);
  const dialog = root.closest("dialog");
  const observer = new MutationObserver(() => {
    if (!root.isConnected) cleanup();
  });
  const cleanup = () => {
    clearInterval(tick);
    disposeVisual();
    observer.disconnect();
    dialog?.removeEventListener("close", cleanup);
  };
  observer.observe(host, { childList: true });
  dialog?.addEventListener("close", cleanup);
  render();
}
