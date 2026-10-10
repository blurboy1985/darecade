// The Open Stage panel: a rhythm show played in the neighbourhood window.
// It reports the result; the server decides the XP.
import {
  STAGE_FEVER_TICKS,
  STAGE_GOOD,
  STAGE_LANES,
  STAGE_TICKS,
  STAGE_WARMUP_GOAL,
  StageShow,
  stageMaxScore,
  stageStars,
  type StageMode,
} from "../shared/stage";
import {
  PARTY_CAP,
  PARTY_CHEERS,
  partyCode,
  partyRanking,
  type PartyMode,
  type PartySnapshot,
  type PartyTick,
} from "../shared/stage-party";
import {
  STAGE_DAILY_XP,
  STAGE_SCORE_LIMIT,
  STAGE_STAR_XP,
  type Save,
} from "./state";
import type { Sfx } from "./audio";
import { loadCharacter } from "./character";
import type { StageParty, StageView } from "./stage-view";
import { STAGE_STYLES } from "./stage-moves";
import { stageSong, type StageSound } from "./stage-song";
import { PartyClient } from "./stage-party";
import { stageProgress } from "./progression-guide";
import "./stage.css";

const COLOURS = ["#ff8fb8", "#7fe3e0", "#ffe27a", "#b9a4ff"];
const ARROWS = ["←", "↓", "↑", "→"];
const KEYS: Record<string, number> = {
  arrowleft: 0,
  arrowdown: 1,
  arrowup: 2,
  arrowright: 3,
  a: 0,
  s: 1,
  w: 2,
  d: 3,
};
/** Notes are drawn this many ticks before they reach the line. */
const AHEAD = 96;
/** The song is handed to the sound clock this many ticks before it is heard. */
const CUE = 12;
/** The dance style is a preference of this device, not of the save. */
const STYLE_KEY = "darecade-stage-style";
const esc = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
function savedStyle() {
  try {
    const index = STAGE_STYLES.findIndex(
      (s) => s.id === localStorage.getItem(STYLE_KEY),
    );
    return Math.max(0, index);
  } catch {
    return 0;
  }
}

export function mountStage(
  host: HTMLElement,
  ctx: {
    save: Save;
    sound: (name: Sfx) => void;
    /** The show's song: hush quiets the background theme while it plays. */
    song: {
      hush: (on: boolean) => void;
      play: (sound: StageSound, delay: number) => void;
    };
    report: (event: string, value?: unknown) => Promise<void>;
  },
) {
  const root = document.createElement("div");
  root.className = "activity activity-stage";
  host.replaceChildren(root);
  const live = () => root.isConnected && !!root.closest("dialog")?.open;
  root.innerHTML = `<h2>Open Stage</h2><div id="stage-progress"></div><label class="field-label" for="stage-mode">Choose your session</label><select class="destination-select" id="stage-mode"><option value="warmup">Warm-up · learn the beat</option><option value="show">Show · stars & XP</option><option value="encore">Encore · faster, double arrows</option></select><label class="field-label" for="stage-style">Dance style</label><select class="destination-select" id="stage-style">${STAGE_STYLES.map((s, i) => `<option value="${i}">${s.name} · ${s.hint}</option>`).join("")}</select><p class="lead" id="stage-goal"></p><div class="stage-screen"><div class="stage-view"></div><div class="stage-hud"><span><span id="stage-score-label">SCORE</span><b id="stage-score">0</b></span><span>COMBO<b id="stage-combo">0</b></span><span class="stage-hype">HYPE<i><b id="stage-hype"></b></i></span></div><ol class="stage-board" id="stage-board" aria-label="Party scores" hidden></ol><div class="stage-cheers" aria-hidden="true"></div><div class="stage-call" role="status" aria-live="polite"></div><canvas class="stage-notes" width="360" height="220" aria-hidden="true"></canvas></div><div class="stage-lanes">${ARROWS.map((a, i) => `<button data-lane="${i}" style="--lane:${COLOURS[i]}" aria-label="Lane ${i + 1}" disabled>${a}</button>`).join("")}</div><button class="stage-fever" id="stage-fever" data-state="filling" disabled><i><b id="stage-fever-fill"></b></i><span id="stage-fever-label">Fever</span></button><p class="activity-status" role="status"></p><button class="primary" id="stage-start">Start the show →</button><p class="fine-print" id="stage-note"></p><section class="stage-party" aria-labelledby="stage-party-title"><h3 id="stage-party-title">Stage Party</h3><div id="party-out"><p class="fine-print">Dance the same song with up to ${PARTY_CAP - 1} friends, live.</p><div class="party-row"><button class="text-button" id="party-host">Host a party</button><input id="party-code" maxlength="4" placeholder="CODE" aria-label="Party code" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="text-button" id="party-join">Join</button></div></div><div id="party-in" hidden><p class="party-code">Party code <b id="party-code-shown"></b><button class="text-button" id="party-copy">Copy</button></p><ul id="party-list"></ul><div class="party-row" role="group" aria-label="Cheer">${PARTY_CHEERS.map((c, i) => `<button class="party-cheer" data-cheer="${i}" aria-label="Cheer ${c}">${c}</button>`).join("")}</div><button class="primary" id="party-start">Start the party show →</button><button class="text-button" id="party-leave">Leave party</button></div><p class="party-status" id="party-status" role="status"></p></section>`;
  const find = <T extends HTMLElement>(selector: string) =>
    root.querySelector<T>(selector)!;
  const canvas = find<HTMLCanvasElement>(".stage-notes");
  const c = canvas.getContext("2d")!;
  const call = find(".stage-call");
  const status = find(".activity-status");
  const start = find<HTMLButtonElement>("#stage-start");
  const feverButton = find<HTMLButtonElement>("#stage-fever");
  const lanes = Array.from(
    root.querySelectorAll<HTMLButtonElement>("[data-lane]"),
  );
  const board = find("#stage-board");
  const partyStatus = find("#party-status");
  const partyStart = find<HTMLButtonElement>("#party-start");
  const hostButton = find<HTMLButtonElement>("#party-host");
  const joinButton = find<HTMLButtonElement>("#party-join");
  const reduced = document.documentElement.classList.contains("reduced");
  let view: StageView | null = null,
    show: StageShow | null = null,
    max = 1,
    pressed = [false, false, false, false],
    judged = 0,
    last = performance.now(),
    accumulator = 0,
    lastLane = 0,
    song: StageSound[] = [],
    cued = 0,
    hushed = false;
  // Stage Party: the room as the server last described it, the round this
  // browser's show belongs to, and the server time that show begins.
  let room: PartySnapshot | null = null,
    party: StageParty | null = null,
    round = 0,
    startAt = 0,
    counting = false,
    announced = 0,
    settling = false;
  const cheered = new Map<number, number>();
  const mode = find<HTMLSelectElement>("#stage-mode");
  const style = find<HTMLSelectElement>("#stage-style");
  const goal = find("#stage-goal");
  mode.value = ctx.save.stageBest === 0 ? "warmup" : "show";
  style.value = String(savedStyle());
  const styleIndex = () =>
    Math.max(0, Math.min(STAGE_STYLES.length - 1, Number(style.value) || 0));
  const selected = (): StageMode =>
    mode.value === "warmup"
      ? "warmup"
      : mode.value === "encore"
        ? "encore"
        : "show";
  const active = () => !!show && !show.ended;
  const stars = (done: StageShow) => {
    // Stars judge timing alone; the Fever bonus only raises the score.
    const earned = stageStars(Math.round(done.baseScore), max);
    return done.booed ? Math.min(1, earned) : earned;
  };
  const note = () => {
    const warmup = mode.value === "warmup",
      encore = mode.value === "encore";
    find("#stage-score-label").textContent = warmup ? "NOTES" : "SCORE";
    find(".stage-hype").hidden = warmup;
    feverButton.hidden = warmup;
    goal.textContent = warmup
      ? `Land ${STAGE_WARMUP_GOAL} notes. Use the two outer lanes: ← / → or A / D. No booing, no XP or saved score.`
      : encore
        ? "A faster song with double arrows: press both lanes together. Aim for a star: 30% of a perfect show."
        : "Press each arrow on the beat of the song. Aim for a star: 30% of a perfect show. Four lanes, left to right: ← ↓ ↑ → or A S W D.";
    start.textContent = warmup
      ? "Start warm-up →"
      : encore
        ? "Start the encore →"
        : "Start the show →";
    find("#stage-note").textContent = warmup
      ? "A slower 40-second rehearsal. Choose Show whenever you’re ready."
      : `+${STAGE_STAR_XP} XP a star, up to ${STAGE_DAILY_XP} XP a day. Hype runs out if too many notes are missed. Fill the Fever bar, then tap it or press Space for double points; stars still judge your timing.`;
    find("#stage-progress").innerHTML = stageProgress(ctx.save);
  };
  const resetHud = () => {
    find("#stage-score").textContent =
      mode.value === "warmup" ? `0 / ${STAGE_WARMUP_GOAL}` : "0";
    find("#stage-combo").textContent = "0";
    delete root.dataset.left;
    delete root.dataset.fever;
    find("#stage-fever-fill").style.width = "0%";
    find("#stage-fever-label").textContent = "Fever";
    feverButton.dataset.state = "filling";
    feverButton.disabled = true;
    call.textContent = "";
    delete call.dataset.judgement;
    status.textContent = "";
  };
  /** Who may press what, from the show and the party as they stand. */
  const controls = () => {
    const hosting = !!room && room.you === room.host;
    mode.disabled = active() || (!!room && !hosting);
    start.hidden = active() || settling || !!room;
    hostButton.disabled = joinButton.disabled = settling;
    root.dataset.party = String(!!room);
    find("#party-out").hidden = !!room;
    find("#party-in").hidden = !room;
    if (!room) return;
    const here = room.players.filter((p) => p.online).length;
    partyStart.hidden = !hosting || room.status === "running";
    partyStart.disabled = here < 2;
    partyStart.textContent = room.round
      ? "Dance again →"
      : "Start the party show →";
  };

  const renderBoard = () => {
    board.hidden = !room || room.status === "waiting";
    if (!room || board.hidden) return;
    const mine = show && startAt && round === room.round ? show : null;
    const rows = partyRanking(
      room.players.map((p) =>
        p.slot === room!.you && mine
          ? { ...p, score: Math.round(mine.score), booed: mine.booed }
          : p,
      ),
    );
    const medals = ["🥇", "🥈", "🥉", ""];
    board.innerHTML = rows
      .map(
        (p, i) =>
          `<li style="--slot:${COLOURS[p.slot % 4]}" data-you="${p.slot === room!.you}" data-fever="${!!p.fever}" data-out="${!!p.booed || !p.online}"><span>${room!.status === "results" ? medals[i] : ""}${esc(p.name)}</span><b>${Math.round(Number(p.score)) || 0}</b></li>`,
      )
      .join("");
  };
  const renderParty = () => {
    if (!room) return;
    find("#party-code-shown").textContent = room.code;
    find("#party-list").innerHTML = room.players
      .map(
        (p) =>
          `<li style="--slot:${COLOURS[p.slot % 4]}" data-away="${!p.online}">${esc(p.name)}${p.slot === room!.you ? " (you)" : ""}${p.slot === room!.host ? " · host" : ""}${p.online ? "" : " · away"}</li>`,
      )
      .join("");
    const hosting = room.you === room.host,
      me = room.players.find((p) => p.slot === room!.you),
      here = room.players.filter((p) => p.online).length;
    if (room.status === "results" && room.round !== announced) {
      announced = room.round;
      const winner = partyRanking(room.players)[0];
      if (winner && !winner.score)
        partyStatus.textContent = "Nobody scored this time. Dance again?";
      else if (winner) {
        const won = winner.slot === room.you;
        partyStatus.textContent = won
          ? "🏆 You win the party show!"
          : `🏆 ${winner.name} wins the party show!`;
        if (won) {
          ctx.sound("win");
          view?.celebrate();
        }
      }
    } else if (room.status === "running")
      partyStatus.textContent = me?.playing
        ? ""
        : "A show is on. Watch this one; you’re in the next.";
    else if (room.status === "waiting")
      partyStatus.textContent =
        here < 2
          ? "Share the code. A party show needs two dancers."
          : hosting
            ? "Everyone’s here. Start when you’re ready."
            : "Waiting for the host to start…";
    renderBoard();
  };
  const float = (slot: number, kind: number) => {
    const bubble = document.createElement("span");
    bubble.textContent = PARTY_CHEERS[kind] ?? "";
    bubble.style.left = `${14 + ((slot * 23 + cheered.size * 7) % 70)}%`;
    find(".stage-cheers").append(bubble);
    setTimeout(() => bubble.remove(), 1600);
  };

  const begin = (seed: number, chosen: StageMode, at = 0) => {
    show = new StageShow(seed, chosen);
    song = stageSong(seed, chosen, show.notes);
    cued = 0;
    max = chosen === "warmup" ? 1 : stageMaxScore(seed, chosen);
    startAt = at;
    counting = at > 0;
    root.dataset.playing = "true";
    pressed.fill(false);
    judged = 0;
    accumulator = 0;
    last = performance.now();
    resetHud();
    controls();
    call.textContent = "Get ready…";
    lanes.forEach(
      (b, lane) =>
        (b.disabled = chosen === "warmup" && lane !== 0 && lane !== 3),
    );
    ctx.sound("go");
    find(".stage-screen").scrollIntoView({ block: "nearest" });
    find(".stage-lanes").scrollIntoView({ block: "nearest" });
  };
  /** What this dancer tells the party at each poll. */
  const report = (): PartyTick => {
    const tick: PartyTick = { style: styleIndex() };
    if (!room || !show || !startAt || round !== room.round) return tick;
    return {
      ...tick,
      round,
      score: Math.min(STAGE_SCORE_LIMIT, Math.round(show.score)),
      combo: Math.min(999, show.combo),
      hype: Math.max(0, Math.min(1, show.hype)),
      fever: show.feverTicks > 0,
      hits: show.counts.perfect + show.counts.great + show.counts.good,
      lane: lastLane,
      done: show.ended,
      booed: show.booed,
      stars: show.ended ? stars(show) : 0,
    };
  };
  const client = new PartyClient(report, (snapshot, reason) => {
    room = snapshot;
    if (!snapshot) {
      party = null;
      cheered.clear();
      // A party show cannot go on without its party.
      if (active() && startAt) {
        show = null;
        root.dataset.playing = "false";
        resetHud();
        lanes.forEach((b) => (b.disabled = true));
      }
      partyStatus.textContent = reason || "";
      board.hidden = true;
      controls();
      return;
    }
    party = {
      you: snapshot.you,
      running: snapshot.status === "running",
      results: snapshot.status === "results",
      players: snapshot.players,
    };
    // Joining a party walks off a show being played alone; nothing is reported.
    if (active() && !startAt) {
      show = null;
      root.dataset.playing = "false";
      resetHud();
      lanes.forEach((b) => (b.disabled = true));
    }
    const hosting = snapshot.you === snapshot.host;
    if (
      !active() &&
      mode.value !== snapshot.mode &&
      (!hosting || mode.value === "warmup")
    ) {
      mode.value = snapshot.mode;
      show = null;
      resetHud();
      note();
    }
    if (
      snapshot.status === "running" &&
      snapshot.round !== round &&
      snapshot.players.find((p) => p.slot === snapshot.you)?.playing
    ) {
      round = snapshot.round;
      mode.value = snapshot.mode;
      note();
      begin(snapshot.seed, snapshot.mode, snapshot.startAt);
    }
    for (const p of snapshot.players) {
      const before = cheered.get(p.slot);
      cheered.set(p.slot, p.cheer);
      if (before !== undefined && p.cheer > before && p.slot !== snapshot.you)
        float(p.slot, p.cheerKind);
    }
    renderParty();
    controls();
  });
  const partyError = (error: unknown) => {
    partyStatus.textContent =
      error instanceof Error ? error.message : "The party is unavailable.";
  };
  hostButton.addEventListener("click", () => {
    partyStatus.textContent = "Opening the stage…";
    const chosen: PartyMode = mode.value === "encore" ? "encore" : "show";
    client.host(chosen).catch(partyError);
  });
  joinButton.addEventListener("click", () => {
    const code = partyCode(find<HTMLInputElement>("#party-code").value);
    if (!code) {
      partyStatus.textContent = "A party code is four letters.";
      return;
    }
    partyStatus.textContent = "Finding the party…";
    client.join(code).catch(partyError);
  });
  partyStart.addEventListener("click", () => client.start().catch(partyError));
  find("#party-leave").addEventListener("click", () => client.leave());
  find("#party-copy").addEventListener("click", () => {
    if (!room) return;
    void navigator.clipboard?.writeText(room.code).then(
      () => (partyStatus.textContent = "Code copied. Send it to your friends."),
      () => {},
    );
  });
  Array.from(root.querySelectorAll<HTMLButtonElement>("[data-cheer]")).forEach(
    (button, kind) =>
      button.addEventListener("click", () => {
        if (!room) return;
        client.cheer(kind);
        float(room.you, kind);
      }),
  );

  mode.addEventListener("change", () => {
    if (room && mode.value === "warmup") {
      // Warm-up is a rehearsal for one; a party plays Show or Encore.
      mode.value = room.mode;
      partyStatus.textContent = "Warm-up is for practising alone.";
    } else if (room) client.setMode(selected() as PartyMode).catch(partyError);
    show = null;
    resetHud();
    note();
  });
  style.addEventListener("change", () => {
    try {
      localStorage.setItem(STYLE_KEY, STAGE_STYLES[styleIndex()].id);
    } catch {
      // Private browsing: the style lasts for this visit.
    }
    view?.setStyle(STAGE_STYLES[styleIndex()].id, !active());
  });
  resetHud();
  note();
  controls();
  void Promise.all([import("./stage-view"), loadCharacter()])
    .then(([module]) => {
      if (live()) {
        view = new module.StageView(
          root.querySelector(".stage-view")!,
          ctx.save,
          reduced,
        );
        view.setStyle(STAGE_STYLES[styleIndex()].id);
      }
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
  const ignite = () => {
    if (!show?.ignite()) return;
    ctx.sound("sparkle");
    view?.celebrate();
    call.textContent = "FEVER ×2!";
    call.dataset.judgement = "perfect";
  };
  const keyDown = (e: KeyboardEvent) => {
    if (!show || show.ended) return;
    if (e.key === " ") {
      e.preventDefault();
      if (!e.repeat) ignite();
      return;
    }
    const lane = KEYS[e.key.toLowerCase()];
    if (lane === undefined) return;
    e.preventDefault();
    if (!e.repeat) press(lane);
  };
  // Closing the page leaves the party at once instead of timing out.
  const pageHide = () => {
    if (room)
      navigator.sendBeacon?.(
        "/api/stage/leave",
        new Blob(["{}"], { type: "application/json" }),
      );
  };
  window.addEventListener("keydown", keyDown);
  window.addEventListener("pagehide", pageHide);
  lanes.forEach((b, i) =>
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      press(i);
    }),
  );
  feverButton.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    ignite();
  });
  const finish = async (done: StageShow) => {
    root.dataset.playing = "false";
    delete root.dataset.fever;
    feverButton.disabled = true;
    controls();
    if (done.mode === "warmup") {
      lanes.forEach((b) => (b.disabled = true));
      const hits = done.counts.perfect + done.counts.great + done.counts.good;
      status.textContent = `${hits} notes landed · ${hits >= STAGE_WARMUP_GOAL ? "Warm-up goal complete! Ready for the show?" : `Try for ${STAGE_WARMUP_GOAL} next time. You can take your time here.`} No XP or best score changed.`;
      ctx.sound(hits >= STAGE_WARMUP_GOAL ? "win" : "finish");
      note();
      status.scrollIntoView({ block: "nearest" });
      return;
    }
    const score = Math.min(STAGE_SCORE_LIMIT, Math.round(done.score)),
      earned = stars(done);
    lanes.forEach((b) => (b.disabled = true));
    ctx.sound(done.booed ? "error" : earned ? "win" : "finish");
    status.textContent = "Counting the applause…";
    client.flush();
    const before = ctx.save.xp;
    // No new show until this one has been counted.
    settling = true;
    controls();
    await ctx.report("perform", { score, stars: earned });
    settling = false;
    if (!live()) return;
    const gain = ctx.save.xp - before;
    status.textContent =
      `${done.booed ? "The crowd needs a breather. Try Warm-up to find the beat. " : ""}${"★".repeat(earned)}${"☆".repeat(3 - earned)} · ${score} points · best combo ${done.bestCombo}` +
      (done.fevers
        ? ` · ${done.fevers} Fever${done.fevers > 1 ? "s" : ""}`
        : "") +
      (gain > 0
        ? ` · +${gain} XP`
        : earned && ctx.save.stageXp >= STAGE_DAILY_XP
          ? " · today's stage XP is all earned"
          : "");
    controls();
    note();
    status.scrollIntoView({ block: "nearest" });
  };
  start.addEventListener("click", () => {
    const seed = Math.floor(Math.random() * 2 ** 31);
    begin(seed, selected());
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
      window.removeEventListener("pagehide", pageHide);
      if (hushed) ctx.song.hush(false);
      client.leave();
      view?.dispose();
      return;
    }
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    // A party shares one clock, so it cannot wait for a closed window.
    if (room && !live()) client.leave();
    // A party show starts for everyone at the same moment.
    const wait = show && startAt ? startAt - client.now() : 0;
    if (active() && wait > 0) call.textContent = String(Math.ceil(wait / 1000));
    else if (counting && active()) {
      counting = false;
      call.textContent = "Dance!";
    }
    const playing = active() && live() && wait <= 0;
    // The show has a song of its own, so the background theme waits for it.
    if (hushed !== (active() && live())) ctx.song.hush((hushed = !hushed));
    if (playing) {
      accumulator += dt;
      while (accumulator >= 1 / 60 && !show!.ended) {
        show!.advance(pressed);
        pressed = [false, false, false, false];
        accumulator -= 1 / 60;
      }
      const s = show!;
      // Cued from the show's own clock, so the song cannot drift from the arrows.
      const heard = s.tick + accumulator * 60;
      while (!s.ended && cued < song.length && song[cued].tick <= heard + CUE) {
        const sound = song[cued++];
        ctx.song.play(sound, (sound.tick - heard) / 60);
      }
      const hits = s.counts.perfect + s.counts.great + s.counts.good,
        total = hits + s.counts.miss + s.counts.stray;
      if (total !== judged && s.last) {
        judged = total;
        const j = s.last.judgement;
        if (j !== "miss" && j !== "stray") lastLane = s.last.lane;
        ctx.sound(
          j === "perfect"
            ? "coin"
            : j === "great"
              ? "blip"
              : j === "good"
                ? "eat"
                : "paddle",
        );
        call.textContent =
          j === "perfect"
            ? "PERFECT!"
            : j === "great"
              ? "Great!"
              : j === "good"
                ? "Good"
                : j === "miss"
                  ? s.mode === "warmup"
                    ? "Next one!"
                    : "Miss"
                  : "Too soon";
        call.dataset.judgement = j;
        if (j === "miss" && !reduced) navigator.vibrate?.(30);
        if (room) renderBoard();
      }
      find("#stage-score").textContent =
        s.mode === "warmup"
          ? `${hits} / ${STAGE_WARMUP_GOAL}`
          : String(Math.round(s.score));
      find("#stage-combo").textContent =
        s.combo + (s.multiplier > 1 ? ` ×${s.multiplier}` : "");
      const hype = find("#stage-hype");
      hype.style.width = `${s.hype * 100}%`;
      hype.dataset.low = String(s.hype < 0.25);
      const lit = s.feverTicks > 0,
        ready = !lit && s.fever >= 1;
      find("#stage-fever-fill").style.width =
        `${(lit ? s.feverTicks / STAGE_FEVER_TICKS : s.fever) * 100}%`;
      find("#stage-fever-label").textContent = lit
        ? "FEVER ×2"
        : ready
          ? "Fever ready · tap or press Space"
          : "Fever";
      feverButton.dataset.state = lit ? "lit" : ready ? "ready" : "filling";
      feverButton.disabled = !ready;
      root.dataset.fever = String(lit);
      root.dataset.left = String(Math.ceil((STAGE_TICKS - s.tick) / 60));
      if (s.ended) void finish(s);
    }
    draw(show ? show.tick + (playing ? accumulator * 60 : 0) : 0);
    view?.draw(show, now / 1000, dt, party);
  };
  requestAnimationFrame(loop);
}
