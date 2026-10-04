// East Side panels. Fishing and hoops are rounds the server replays, so
// their panels show progress and start a round; the plot only reports actions
// and the server decides every reward.
import {
  crops,
  cropReadyAt,
  fishSpecies,
  HOOPS_SHOTS,
  type Save,
} from "./state";
import type { Sfx } from "./audio";
import "./activities.css";

export type ActivityContext = {
  /** The live save; it reflects the server's answer once report() resolves. */
  save: Save;
  sound: (name: Sfx) => void;
  report: (event: string, value?: unknown) => Promise<void>;
};

function panel(host: HTMLElement, name: string) {
  const root = document.createElement("div");
  root.className = `activity activity-${name}`;
  host.replaceChildren(root);
  // Timers stop as soon as another panel replaces this one or the window closes.
  const live = () => root.isConnected && !!root.closest("dialog")?.open;
  return { root, live };
}

export function mountFishing(host: HTMLElement, ctx: ActivityContext) {
  const { root } = panel(host, "fishing");
  root.innerHTML = `<h2>Fishing Jetty</h2><p class="lead">One minute. Cast, hook the bite, then reel without snapping the line. Rare fish score more and fight harder.</p><div class="hoops-score"><span>BEST ROUND<b>${ctx.save.best.fishing}</b></span><span>SPECIES<b>${ctx.save.fish.length} / ${fishSpecies.length}</b></span></div><button class="primary" data-game="fishing">Play a round →</button><button class="secondary" data-open="dares">Dare a neighbour</button><h3>Your catches</h3><div class="fish-album">${fishSpecies
    .map((f) =>
      ctx.save.fish.includes(f.id)
        ? `<span class="caught"><i>${f.icon}</i>${f.name}</span>`
        : "<span><i>?</i>Not yet</span>",
    )
    .join(
      "",
    )}</div><p class="fine-print">+20 XP a round, +10 XP for each new species. Everything goes back in the pond.</p>`;
}

export function mountHoops(host: HTMLElement, ctx: ActivityContext) {
  const { root } = panel(host, "hoops");
  root.innerHTML = `<h2>Hoops Court</h2><p class="lead">Ten shots, four seconds each. Stop the marker in the green; the bright centre is a swish. From the fourth shot the green slides.</p><div class="hoops-score"><span>BEST ROUND<b>${ctx.save.best.hoops}</b></span><span>MOST BASKETS<b>${ctx.save.hoopsBest} / ${HOOPS_SHOTS}</b></span></div><button class="primary" data-game="hoops">Play a round →</button><button class="secondary" data-open="dares">Dare a neighbour</button><p class="fine-print">+20 XP a round, +5 XP for each basket you beat your most by.</p>`;
}

const clock = (ms: number) => {
  const minutes = Math.ceil(ms / 60000);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes} min`;
};
export function mountPlots(host: HTMLElement, ctx: ActivityContext) {
  const { root, live } = panel(host, "plots");
  let message = "";
  const render = () => {
    const crop = crops.find((c) => c.id === ctx.save.plotCrop);
    const left = cropReadyAt(ctx.save) - Date.now();
    const grown = crop ? 1 - left / (crop.hours * 3600000) : 0;
    root.innerHTML =
      `<h2>Community Plots</h2><p class="lead">Plant something, then come back when it has grown. Nothing wilts.</p>` +
      (!crop
        ? `<div class="seed-grid">${crops.map((c) => `<button data-seed="${c.id}"><i>${c.icon}</i><strong>${c.name}</strong><small>${c.hours} hour${c.hours > 1 ? "s" : ""} · +${c.xp} XP</small></button>`).join("")}</div>`
        : left <= 0
          ? `<div class="plot-bed ready"><i>${crop.icon}</i><strong>${crop.name} is ready!</strong></div><button class="primary" id="plot-harvest">Harvest · +${crop.xp} XP</button>`
          : `<div class="plot-bed"><i>${grown < 0.4 ? "🌱" : "🪴"}</i><strong>${crop.name}</strong><div class="plot-growth"><span style="width:${Math.max(4, grown * 100).toFixed(1)}%"></span></div><small id="plot-left">Ready in ${clock(left)}</small></div><button class="primary" id="plot-water" ${ctx.save.plotWatered ? "disabled" : ""}>${ctx.save.plotWatered ? "Watered ✓" : "Water it · grows a quarter sooner"}</button>`) +
      `<p class="activity-status" role="status">${message}</p><p class="fine-print">Harvests so far: ${ctx.save.harvests}. One crop at a time. You can leave; it keeps growing.</p>`;
  };
  const send = async (event: string, value: unknown, done: string) => {
    const before = ctx.save.harvests + ctx.save.plotCrop + ctx.save.plotWatered;
    await ctx.report(event, value);
    if (!live()) return;
    // A refused request leaves the plot as it was; the reason is shown as a toast.
    const changed =
      before !== ctx.save.harvests + ctx.save.plotCrop + ctx.save.plotWatered;
    message = changed ? done : "";
    if (changed) ctx.sound(event === "harvest" ? "levelup" : "coin");
    render();
  };
  root.addEventListener("click", (e) => {
    const b = (e.target as Element).closest("button");
    if (!b || b.disabled) return;
    b.disabled = true;
    if (b.dataset.seed) void send("plant", b.dataset.seed, "Planted.");
    else if (b.id === "plot-water")
      void send("water", undefined, "Watered. It will be ready sooner.");
    else if (b.id === "plot-harvest")
      void send("harvest", undefined, "Harvested! The plot is free again.");
  });
  const tick = window.setInterval(() => {
    if (!live()) return clearInterval(tick);
    const left = cropReadyAt(ctx.save) - Date.now();
    const label = root.querySelector("#plot-left");
    if (label && left > 0) label.textContent = `Ready in ${clock(left)}`;
    else if (label) render();
  }, 1000);
  render();
}
