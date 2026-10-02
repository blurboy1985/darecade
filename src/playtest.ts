export const playtestEnabled =
  new URLSearchParams(location.search).get("playtest") === "1";
const started = performance.now();
const events: { name: string; seconds: number }[] = [];
const frames: number[] = [];
export function playtestEvent(name: string) {
  if (playtestEnabled && events.length < 100)
    events.push({
      name,
      seconds: Math.round((performance.now() - started) / 100) / 10,
    });
}
if (playtestEnabled)
  window.setInterval(() => {
    if (document.hidden || document.querySelector("dialog[open]")) return;
    const fps = Number(
      (document.querySelector("#world canvas") as HTMLElement | null)?.dataset
        .fps,
    );
    if (Number.isFinite(fps) && fps > 0 && frames.length < 600)
      frames.push(fps);
  }, 1000);
export function playtestSummary() {
  const sorted = [...frames].sort((a, b) => a - b);
  return {
    build: "accounts-replay-cute-v1",
    userAgent: navigator.userAgent,
    viewport: {
      width: innerWidth,
      height: innerHeight,
      pixelRatio: devicePixelRatio,
    },
    seconds: Math.round((performance.now() - started) / 1000),
    events,
    worldPerformance: {
      samples: frames.length,
      medianFps: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
      lowFps: sorted.length ? sorted[Math.floor(sorted.length * 0.1)] : null,
    },
    renderer:
      (document.querySelector("#world canvas") as HTMLElement | null)
        ?.dataset || {},
    touchPoints: navigator.maxTouchPoints,
  };
}
