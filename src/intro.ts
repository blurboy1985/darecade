// Plays the intro film over the page before the game loads: a start card
// (browsers refuse sound until the player taps), then forty seconds of
// canvas animation with its own score. "Skip intro" and Esc end it at any
// point. The picture is in intro-film.ts, the sound in intro-score.ts and
// the timings both follow in intro-script.ts.
import "./intro.css";
import { DURATION, SEEN_KEY, captionAt } from "./intro-script";
import { drawFilm } from "./intro-film";
import { startScore, type Score } from "./intro-score";

/** A player who turned sound off in the game does not get it back here. */
function soundWanted() {
  try {
    return (
      JSON.parse(localStorage.getItem("darecade-v1") || "{}").sound !== false
    );
  } catch {
    return true;
  }
}

/**
 * Resolves when the film ends or is skipped. The overlay stays up, plain,
 * until the caller has the game ready and calls close().
 */
export function playIntro(): Promise<{ close(): void }> {
  const root = document.createElement("div");
  root.className = "intro";
  root.setAttribute("role", "dialog");
  root.setAttribute("aria-label", "Play Simi introduction");
  root.innerHTML = `<canvas class="intro-film" aria-hidden="true"></canvas>
    <div class="intro-start">
      <img src="/favicon.svg" alt="" width="84" height="84" />
      <h1>Play Simi</h1>
      <p>Meet you downstairs.</p>
      <button class="intro-play" type="button">Tap to start</button>
      <small>40-second intro with sound</small>
    </div>
    <button class="intro-skip" type="button">Skip intro</button>
    <p class="intro-loading" hidden>Opening the neighbourhood…</p>
    <p class="intro-lines" aria-live="polite"></p>`;
  document.body.append(root);
  const canvas = root.querySelector("canvas")!;
  const ctx = canvas.getContext("2d")!;
  const lines = root.querySelector(".intro-lines")!;
  const play = root.querySelector<HTMLButtonElement>(".intro-play")!;

  let startedAt = 0;
  let frame = 0;
  let score: Score | null = null;
  let spoken = "";
  const now = () => (startedAt ? (performance.now() - startedAt) / 1000 : 0);
  function draw() {
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(root.clientWidth * scale);
    const h = Math.round(root.clientHeight * scale);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    if (w && h) drawFilm(ctx, Math.max(0, now()), w, h);
  }

  return new Promise((resolve) => {
    function finish() {
      cancelAnimationFrame(frame);
      score?.stop();
      window.removeEventListener("resize", draw);
      window.removeEventListener("keydown", onKey);
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {}
      root.classList.add("intro-done");
      root.querySelector<HTMLElement>(".intro-loading")!.hidden = false;
      resolve({
        close() {
          root.classList.add("intro-out");
          setTimeout(() => root.remove(), 450);
        },
      });
    }
    function tick() {
      const t = now();
      if (t >= DURATION) return finish();
      draw();
      const line = t >= 0 ? captionAt(t) : null;
      const text = line
        ? `${line.who === "you" ? "You" : "Tea Alchemist"}: ${line.text}`
        : "";
      if (text && text !== spoken) lines.textContent = spoken = text;
      frame = requestAnimationFrame(tick);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") finish();
    }
    play.addEventListener("click", () => {
      root.classList.add("intro-playing");
      if (soundWanted()) score = startScore();
      // The score is scheduled a moment ahead; the picture waits for it.
      startedAt = performance.now() + 60;
      root.querySelector<HTMLButtonElement>(".intro-skip")!.focus();
      tick();
    });
    root.querySelector(".intro-skip")!.addEventListener("click", finish);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", draw);
    draw();
    play.focus();
    // The start card sits on the film's first frame; redraw once the
    // display type has arrived so no frame is painted in a fallback face.
    void document.fonts?.load("700 40px Fredoka").then(() => {
      if (!startedAt) draw();
    });
  });
}
