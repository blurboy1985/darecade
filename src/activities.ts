// East Side activities: fishing, hoops and the community plot. Each runs in
// the neighbourhood panel, works in the 2D lobby too, and only reports results;
// the server decides every reward.
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
  const { root, live } = panel(host, "fishing");
  root.innerHTML = `<h2>Fishing Jetty</h2><p class="lead">Cast, wait for the float to dip, then reel. Everything goes back in the pond.</p><div class="pond" data-state="idle" aria-hidden="true"><i class="pond-ripple"></i><i class="pond-float"></i><b class="pond-catch"></b></div><p class="activity-status" role="status">The water is calm.</p><button class="primary" id="fish-action">Cast →</button><h3>Your catches · <span id="fish-count"></span></h3><div class="fish-album"></div><p class="fine-print">+10 XP for each new species. No timer, no score.</p>`;
  const pond = root.querySelector<HTMLElement>(".pond")!;
  const status = root.querySelector(".activity-status")!;
  const action = root.querySelector<HTMLButtonElement>("#fish-action")!;
  let state: "idle" | "waiting" | "bite" = "idle";
  let timer = 0;
  const album = () => {
    root.querySelector("#fish-count")!.textContent =
      `${ctx.save.fish.length} / ${fishSpecies.length}`;
    root.querySelector(".fish-album")!.innerHTML = fishSpecies
      .map((f) =>
        ctx.save.fish.includes(f.id)
          ? `<span class="caught"><i>${f.icon}</i>${f.name}</span>`
          : "<span><i>?</i>Not yet</span>",
      )
      .join("");
  };
  const set = (next: typeof state, message: string, label: string) => {
    state = next;
    pond.dataset.state = next;
    status.textContent = message;
    action.textContent = label;
  };
  const bite = () => {
    if (!live()) return;
    set("bite", "A bite! Reel it in!", "Reel! →");
    ctx.sound("blip");
    navigator.vibrate?.(60);
    timer = window.setTimeout(() => {
      if (!live()) return;
      set(
        "idle",
        "It got away. The pond is patient; try again.",
        "Cast again →",
      );
      ctx.sound("close");
    }, 1300);
  };
  action.addEventListener("click", async () => {
    clearTimeout(timer);
    if (state === "idle") {
      pond.querySelector(".pond-catch")!.textContent = "";
      set("waiting", "Waiting for a bite…", "Reel →");
      ctx.sound("click");
      timer = window.setTimeout(bite, 1400 + Math.random() * 3600);
    } else if (state === "waiting") {
      set("idle", "Too soon. Whatever was nibbling swam off.", "Cast again →");
    } else {
      // Rarer species simply turn up less often.
      let roll =
        Math.random() * fishSpecies.reduce((sum, f) => sum + f.weight, 0);
      const fish = fishSpecies.find((f) => (roll -= f.weight) < 0)!;
      const fresh = !ctx.save.fish.includes(fish.id);
      pond.querySelector(".pond-catch")!.textContent = fish.icon;
      set(
        "idle",
        fresh
          ? `${fish.name}! A new species · +10 XP`
          : `${fish.name}. Back it goes.`,
        "Cast again →",
      );
      pond.dataset.state = "landed";
      ctx.sound(fresh ? "levelup" : "coin");
      await ctx.report("fish", fish.id);
      if (live()) album();
    }
  });
  album();
}

export function mountHoops(host: HTMLElement, ctx: ActivityContext) {
  const { root, live } = panel(host, "hoops");
  root.innerHTML = `<h2>Hoops Court</h2><p class="lead">Ten shots. Stop the marker inside the green.</p><div class="hoops-meter" aria-hidden="true"><i class="hoops-zone"></i><i class="hoops-marker"></i></div><div class="hoops-score"><span>SHOT<b id="hoops-shot"></b></span><span>MADE<b id="hoops-made"></b></span><span>BEST<b id="hoops-best"></b></span></div><p class="activity-status" role="status">Take your time.</p><button class="primary" id="hoops-shoot">Shoot</button><p class="fine-print">+5 XP for each point you beat your best by. Play as often as you like.</p>`;
  const zone = root.querySelector<HTMLElement>(".hoops-zone")!;
  const marker = root.querySelector<HTMLElement>(".hoops-marker")!;
  const status = root.querySelector(".activity-status")!;
  const shoot = root.querySelector<HTMLButtonElement>("#hoops-shoot")!;
  let shot = 0,
    made = 0,
    centre = 0.5,
    width = 0.3,
    phase = 0,
    position = 0,
    last = 0,
    moving = false;
  const score = () => {
    root.querySelector("#hoops-shot")!.textContent =
      `${Math.min(shot + 1, HOOPS_SHOTS)} / ${HOOPS_SHOTS}`;
    root.querySelector("#hoops-made")!.textContent = String(made);
    root.querySelector("#hoops-best")!.textContent = String(ctx.save.hoopsBest);
  };
  const frame = (now: number) => {
    if (!moving || !live()) return;
    // Each shot the marker is a little quicker.
    phase += Math.min(0.05, (now - last) / 1000) * (2.2 + shot * 0.25);
    last = now;
    position = 0.5 - 0.5 * Math.cos(phase);
    marker.style.left = `${position * 100}%`;
    requestAnimationFrame(frame);
  };
  const aim = () => {
    // ...and the green is a little narrower.
    width = Math.max(0.12, 0.3 - shot * 0.018);
    centre = 0.2 + Math.random() * 0.6;
    zone.style.left = `${(centre - width / 2) * 100}%`;
    zone.style.width = `${width * 100}%`;
    shoot.disabled = false;
    shoot.textContent = "Shoot";
    moving = true;
    last = performance.now();
    requestAnimationFrame(frame);
    score();
  };
  shoot.addEventListener("click", async () => {
    if (!moving) {
      // Play again.
      shot = made = phase = 0;
      status.textContent = "Take your time.";
      aim();
      return;
    }
    moving = false;
    shoot.disabled = true;
    const good = Math.abs(position - centre) <= width / 2;
    if (good) made++;
    ctx.sound(good ? "coin" : "paddle");
    status.textContent = good ? "Swish!" : "Off the rim.";
    shot++;
    score();
    if (shot < HOOPS_SHOTS) {
      setTimeout(() => live() && aim(), 650);
      return;
    }
    const before = ctx.save.hoopsBest;
    await ctx.report("hoops", made);
    if (!live()) return;
    const gain = (ctx.save.hoopsBest - before) * 5;
    status.textContent =
      `${made} of ${HOOPS_SHOTS}. ` +
      (gain > 0
        ? `New best · +${gain} XP`
        : `Your best is ${ctx.save.hoopsBest}.`);
    if (gain > 0) ctx.sound("levelup");
    score();
    shoot.disabled = false;
    shoot.textContent = "Play again";
  });
  aim();
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
