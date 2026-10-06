// The Open Stage panel: a rhythm show played in the neighbourhood window.
// It reports the result; the server decides the XP.
import {
  STAGE_GOOD,
  STAGE_LANES,
  STAGE_TICKS,
  STAGE_WARMUP_GOAL,
  StageShow,
  stageMaxScore,
  stageStars,
  type StageMode,
} from "../shared/stage";
import { STAGE_DAILY_XP, STAGE_STAR_XP, type Save } from "./state";
import type { Sfx } from "./audio";
import { loadCharacter } from "./character";
import type { StageView } from "./stage-view";
import { stageProgress } from "./progression-guide";
import "./stage.css";

const COLOURS = ["#ff8fb8", "#7fe3e0", "#ffe27a", "#b9a4ff"];
const ARROWS = ["←", "↓", "↑", "→"];
const KEYS: Record<string, number> = {
  arrowleft: 0,
  arrowdown: 1,
  arrowup: 2,
  arrowright: 3,
  d: 0,
  f: 1,
  j: 2,
  k: 3,
};
/** Notes are drawn this many ticks before they reach the line. */
const AHEAD = 96;

export function mountStage(
  host: HTMLElement,
  ctx: {
    save: Save;
    sound: (name: Sfx) => void;
    report: (event: string, value?: unknown) => Promise<void>;
    simple: boolean;
  },
) {
  const root = document.createElement("div");
  root.className = "activity activity-stage";
  host.replaceChildren(root);
  const live = () => root.isConnected && !!root.closest("dialog")?.open;
  root.innerHTML = `<h2>Open Stage</h2><div id="stage-progress"></div><label class="field-label" for="stage-mode">Choose your session</label><select class="destination-select" id="stage-mode"><option value="warmup">Warm-up · learn the beat</option><option value="show">Show · stars & XP</option></select><p class="lead" id="stage-goal"></p><div class="stage-screen"><div class="stage-view"></div><div class="stage-hud"><span><span id="stage-score-label">SCORE</span><b id="stage-score">0</b></span><span>COMBO<b id="stage-combo">0</b></span><span class="stage-hype">HYPE<i><b id="stage-hype"></b></i></span></div><div class="stage-call" role="status" aria-live="polite"></div><canvas class="stage-notes" width="360" height="220" aria-hidden="true"></canvas></div><div class="stage-lanes">${ARROWS.map((a, i) => `<button data-lane="${i}" style="--lane:${COLOURS[i]}" aria-label="Lane ${i + 1}" disabled>${a}</button>`).join("")}</div><p class="activity-status" role="status"></p><button class="primary" id="stage-start">Start the show →</button><p class="fine-print" id="stage-note"></p>`;
  const canvas = root.querySelector<HTMLCanvasElement>(".stage-notes")!;
  const c = canvas.getContext("2d")!;
  const call = root.querySelector<HTMLElement>(".stage-call")!;
  const status = root.querySelector<HTMLElement>(".activity-status")!;
  const start = root.querySelector<HTMLButtonElement>("#stage-start")!;
  const lanes = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-lane]"),
  );
  const reduced = document.documentElement.classList.contains("reduced");
  let view: StageView | null = null,
    show: StageShow | null = null,
    max = 1,
    pressed = [false, false, false, false],
    judged = 0,
    last = performance.now(),
    accumulator = 0;
  const mode = root.querySelector<HTMLSelectElement>("#stage-mode")!;
  const goal = root.querySelector<HTMLElement>("#stage-goal")!;
  mode.value = ctx.save.stageBest === 0 ? "warmup" : "show";
  const note = () => {
    const warmup = mode.value === "warmup";
    root.querySelector("#stage-score-label")!.textContent = warmup
      ? "NOTES"
      : "SCORE";
    root.querySelector<HTMLElement>(".stage-hype")!.hidden = warmup;
    goal.textContent = warmup
      ? `Land ${STAGE_WARMUP_GOAL} notes. Use the two outer lanes: ← / → or D / K. No booing, no XP or saved score.`
      : "Aim for a star: 30% of a perfect show. Four lanes, left to right: ← ↓ ↑ → or D F J K.";
    start.textContent = warmup ? "Start warm-up →" : "Start the show →";
    root.querySelector("#stage-note")!.textContent = warmup
      ? "A slower 40-second rehearsal. Choose Show whenever you’re ready."
      : `+${STAGE_STAR_XP} XP a star, up to ${STAGE_DAILY_XP} XP a day. Hype runs out if too many notes are missed.`;
    root.querySelector("#stage-progress")!.innerHTML = stageProgress(ctx.save);
  };
  const resetHud = () => {
    root.querySelector("#stage-score")!.textContent =
      mode.value === "warmup" ? `0 / ${STAGE_WARMUP_GOAL}` : "0";
    root.querySelector("#stage-combo")!.textContent = "0";
    delete root.dataset.left;
    call.textContent = "";
    delete call.dataset.judgement;
    status.textContent = "";
  };
  mode.addEventListener("change", () => {
    show = null;
    resetHud();
    note();
  });
  resetHud();
  note();
  if (!ctx.simple)
    void Promise.all([import("./stage-view"), loadCharacter()])
      .then(([module]) => {
        if (live())
          view = new module.StageView(
            root.querySelector(".stage-view")!,
            ctx.save,
            reduced,
          );
      })
      // The note highway is the whole game; the scene is decoration.
      .catch(() => {});
  const press = (lane: number) => {
    if (!show || show.ended) return;
    if (show.mode === "warmup" && lane !== 0 && lane !== 3) return;
    pressed[lane] = true;
    lanes[lane].classList.add("hit");
    setTimeout(() => lanes[lane].classList.remove("hit"), 120);
  };
  const keyDown = (e: KeyboardEvent) => {
    const lane = KEYS[e.key.toLowerCase()];
    if (lane === undefined || !show || show.ended) return;
    e.preventDefault();
    if (!e.repeat) press(lane);
  };
  window.addEventListener("keydown", keyDown);
  lanes.forEach((b, i) =>
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      press(i);
    }),
  );
  const finish = async (done: StageShow) => {
    root.dataset.playing = "false";
    mode.disabled = false;
    if (done.mode === "warmup") {
      lanes.forEach((b) => (b.disabled = true));
      const hits = done.counts.perfect + done.counts.good;
      status.textContent = `${hits} notes landed · ${hits >= STAGE_WARMUP_GOAL ? "Warm-up goal complete! Ready for the show?" : `Try for ${STAGE_WARMUP_GOAL} next time. You can take your time here.`} No XP or best score changed.`;
      ctx.sound(hits >= STAGE_WARMUP_GOAL ? "win" : "finish");
      start.hidden = false;
      note();
      status.scrollIntoView({ block: "nearest" });
      return;
    }
    const score = Math.round(done.score),
      stars = done.booed
        ? Math.min(1, stageStars(score, max))
        : stageStars(score, max);
    lanes.forEach((b) => (b.disabled = true));
    ctx.sound(done.booed ? "error" : stars ? "win" : "finish");
    status.textContent = "Counting the applause…";
    const before = ctx.save.xp;
    await ctx.report("perform", { score, stars });
    if (!live()) return;
    const gain = ctx.save.xp - before;
    status.textContent =
      `${done.booed ? "The crowd needs a breather. Try Warm-up to find the beat. " : ""}${"★".repeat(stars)}${"☆".repeat(3 - stars)} · ${score} points · best combo ${done.bestCombo}` +
      (gain > 0
        ? ` · +${gain} XP`
        : stars && ctx.save.stageXp >= STAGE_DAILY_XP
          ? " · today's stage XP is all earned"
          : "");
    start.hidden = false;
    note();
    status.scrollIntoView({ block: "nearest" });
  };
  start.addEventListener("click", () => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const selected: StageMode = mode.value === "warmup" ? "warmup" : "show";
    show = new StageShow(seed, selected);
    max = selected === "show" ? stageMaxScore(seed) : 1;
    mode.disabled = true;
    root.dataset.playing = "true";
    pressed.fill(false);
    judged = 0;
    accumulator = 0;
    last = performance.now();
    start.hidden = true;
    resetHud();
    call.textContent = "Get ready…";
    lanes.forEach(
      (b, lane) =>
        (b.disabled = selected === "warmup" && lane !== 0 && lane !== 3),
    );
    ctx.sound("go");
    root.querySelector(".stage-screen")!.scrollIntoView({ block: "nearest" });
    root.querySelector(".stage-lanes")!.scrollIntoView({ block: "nearest" });
  });
  const draw = (tick: number) => {
    c.clearRect(0, 0, 360, 220);
    const line = 186;
    for (let lane = 0; lane < STAGE_LANES; lane++) {
      c.fillStyle = lane % 2 ? "#0b0c1a80" : "#0b0c1a66";
      c.fillRect(lane * 90, 0, 90, 220);
      c.strokeStyle = COLOURS[lane];
      c.lineWidth = 3;
      c.strokeRect(lane * 90 + 17, line - 20, 56, 40);
    }
    c.font = "700 26px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    if (!show) return;
    for (const n of show.notes) {
      const ahead = n.tick - tick;
      if (ahead > AHEAD) break;
      if (ahead < -STAGE_GOOD || (n.hit && n.hit !== "miss")) continue;
      const y = line - (ahead / AHEAD) * line;
      c.globalAlpha = n.hit === "miss" ? 0.25 : 1;
      c.fillStyle = COLOURS[n.lane];
      c.beginPath();
      c.roundRect(n.lane * 90 + 19, y - 18, 52, 36, 9);
      c.fill();
      c.fillStyle = "#1b1d38";
      c.fillText(ARROWS[n.lane], n.lane * 90 + 45, y + 1);
      c.globalAlpha = 1;
    }
  };
  const loop = (now: number) => {
    if (!root.isConnected) {
      window.removeEventListener("keydown", keyDown);
      view?.dispose();
      return;
    }
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const playing = show && !show.ended && live();
    if (playing) {
      accumulator += dt;
      while (accumulator >= 1 / 60 && !show!.ended) {
        show!.advance(pressed);
        pressed = [false, false, false, false];
        accumulator -= 1 / 60;
      }
      const s = show!;
      const total =
        s.counts.perfect + s.counts.good + s.counts.miss + s.counts.stray;
      if (total !== judged && s.last) {
        judged = total;
        const j = s.last.judgement;
        ctx.sound(j === "perfect" ? "coin" : j === "good" ? "blip" : "paddle");
        call.textContent =
          j === "perfect"
            ? "PERFECT!"
            : j === "good"
              ? "Good"
              : j === "miss"
                ? s.mode === "warmup"
                  ? "Next one!"
                  : "Miss"
                : "Too soon";
        call.dataset.judgement = j;
        if (j === "miss" && !reduced) navigator.vibrate?.(30);
      }
      root.querySelector("#stage-score")!.textContent =
        s.mode === "warmup"
          ? `${s.counts.perfect + s.counts.good} / ${STAGE_WARMUP_GOAL}`
          : String(Math.round(s.score));
      root.querySelector("#stage-combo")!.textContent =
        s.combo + (s.multiplier > 1 ? ` ×${s.multiplier}` : "");
      const hype = root.querySelector<HTMLElement>("#stage-hype")!;
      hype.style.width = `${s.hype * 100}%`;
      hype.dataset.low = String(s.hype < 0.25);
      root.dataset.left = String(Math.ceil((STAGE_TICKS - s.tick) / 60));
      if (s.ended) void finish(s);
    }
    draw(show ? show.tick + (playing ? accumulator * 60 : 0) : 0);
    view?.draw(show, now / 1000, dt);
  };
  requestAnimationFrame(loop);
}
