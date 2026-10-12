// Plays the intro film over the page before the game loads: a start card
// (browsers refuse sound until the player taps), then a one-minute video,
// the story of why the game exists. "Skip intro" and Esc end it at any
// point. The video is fetched only when the player asks to watch it; its
// narration is in intro-script.ts.
import "./intro.css";
import { SEEN_KEY, captionAt, filmFor } from "./intro-script";

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
  root.innerHTML = `<video class="intro-film" playsinline preload="none" aria-hidden="true"></video>
    <div class="intro-start">
      <img src="/favicon.svg" alt="" width="84" height="84" />
      <h1>Play Simi</h1>
      <p>Quick games. Your own look. A neighbourhood to explore.</p>
      <button class="intro-enter" type="button">Play now</button>
      <button class="intro-play" type="button">Watch the story · 1 minute</button>
      <small>Play as a guest after a short age and privacy check. No email needed.</small>
    </div>
    <button class="intro-skip" type="button">Skip intro</button>
    <p class="intro-loading" hidden>Opening the neighbourhood…</p>
    <p class="intro-lines" aria-live="polite"></p>`;
  document.body.append(root);
  const video = root.querySelector("video")!;
  const lines = root.querySelector(".intro-lines")!;
  const play = root.querySelector<HTMLButtonElement>(".intro-play")!;
  const enter = root.querySelector<HTMLButtonElement>(".intro-enter")!;

  let started = false;
  let finished = false;
  let spoken = "";
  // The start card sits on a frame of the film, in the cut that fits the screen.
  const film = () => filmFor(root.clientWidth, root.clientHeight);
  function pose() {
    if (!started) video.poster = `/intro/story-${film()}.jpg`;
  }

  return new Promise((resolve) => {
    function finish() {
      if (finished) return;
      finished = true;
      video.pause();
      video.removeAttribute("src");
      video.load();
      window.removeEventListener("resize", pose);
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
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") finish();
    }
    video.addEventListener("timeupdate", () => {
      const line = captionAt(video.currentTime);
      const text = line
        ? `${line.who === "kid" ? "A kid" : "Narrator"}: ${line.text}`
        : "";
      if (text && text !== spoken) lines.textContent = spoken = text;
    });
    video.addEventListener("ended", finish);
    // A film that cannot load or play must never keep anyone out of the game.
    video.addEventListener("error", finish);
    play.addEventListener("click", () => {
      if (finished || started) return;
      started = true;
      root.classList.add("intro-playing");
      video.muted = !soundWanted();
      video.src = `/intro/story-${film()}.mp4`;
      video.play().catch(finish);
      root.querySelector<HTMLButtonElement>(".intro-skip")!.focus();
    });
    enter.addEventListener("click", finish);
    root.querySelector(".intro-skip")!.addEventListener("click", finish);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", pose);
    pose();
    enter.focus();
  });
}
