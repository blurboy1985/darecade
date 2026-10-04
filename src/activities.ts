// East Side panels. Fishing and hoops are rounds the server replays, so
// their panels show progress and start a round; the plot only reports actions
// and the server decides every reward.
import { fishSpecies, HOOPS_SHOTS, type Save } from "./state";
import type { Sfx } from "./audio";
import "./activities.css";

export type ActivityContext = {
  /** The live save; it reflects the server's answer once report() resolves. */
  save: Save;
  simple?: boolean;
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
  root.innerHTML = `<h2>Fishing Jetty</h2><p class="lead">One minute. Cast, hook the bite, then reel without snapping the line. Rare fish score more and fight harder.</p><div class="hoops-score"><span>BEST ROUND<b>${ctx.save.best.fishing}</b></span><span>SPECIES<b>${ctx.save.fish.length} / ${fishSpecies.length}</b></span></div><button class="primary" data-game="fishing">Play a round →</button><button class="secondary" data-open="dares">Challenge a neighbour</button><h3>Your catches</h3><div class="fish-album">${fishSpecies
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
  root.innerHTML = `<h2>Hoops Court</h2><p class="lead">Ten shots, four seconds each. Stop the marker in the green; the bright centre is a swish. From the fourth shot the green slides.</p><div class="hoops-score"><span>BEST ROUND<b>${ctx.save.best.hoops}</b></span><span>MOST BASKETS<b>${ctx.save.hoopsBest} / ${HOOPS_SHOTS}</b></span></div><button class="primary" data-game="hoops">Play a round →</button><button class="secondary" data-open="dares">Challenge a neighbour</button><p class="fine-print">+20 XP a round, +5 XP for each basket you beat your most by.</p>`;
}

export { mountPlots } from "./plots";
