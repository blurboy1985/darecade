// Isolated test fixture, never included in production. Exercise the real DOM,
// keyboard handlers and replay submission, including a background auth failure.
(async () => {
  const wait = async (test) => {
    while (!test()) await new Promise((r) => setTimeout(r, 50));
  };
  await wait(
    () =>
      !document.querySelector("#loading") &&
      document.querySelector('[data-action="welcome-start"]'),
  );
  document.querySelector('[data-action="welcome-start"]').click();
  await wait(() => document.querySelector("#start-game")?.disabled === false);
  const report = {
    initialLimit: document.querySelector("#run-time").textContent,
    samples: 0,
    backwards: 0,
    wMoved: false,
    survived401: false,
    completed: false,
    graphicsLossInjected: false,
  };
  document.body.dataset.raceAudit = JSON.stringify(report);
  document.querySelector("#start-game").click();
  window.dispatchEvent(
    new KeyboardEvent("keydown", { key: "w", code: "KeyW", bubbles: true }),
  );
  let lastTicks = 0,
    lastLeft = 180,
    auth = false;
  const timer = setInterval(() => {
    const race = document.querySelector(".coast-game");
    if (!race) return;
    const ticks = Number(race.dataset.ticks),
      left = parseInt(document.querySelector("#run-time").textContent);
    report.samples++;
    if (
      new URLSearchParams(location.search).get("audit") === "context" &&
      ticks > 180 &&
      !report.graphicsLossInjected
    ) {
      report.graphicsLossInjected = true;
      race
        .querySelector("canvas")
        ?.getContext("webgl2")
        ?.getExtension("WEBGL_lose_context")
        ?.loseContext();
    }
    if (ticks < lastTicks || left > lastLeft) report.backwards++;
    lastTicks = ticks;
    lastLeft = left;
    report.wMoved ||= Number(race.dataset.distance) > 10;
    if (!auth && document.querySelector("#race-lap")?.textContent === "3 / 3") {
      auth = true;
      window.dispatchEvent(new Event("session-expired"));
    }
    report.survived401 = auth && ticks > lastTicks - 1;
    report.completed ||=
      race.dataset.status === "finished" && Number(race.dataset.distance) > 100;
    document.body.dataset.raceAudit = JSON.stringify(report);
    if (report.completed) {
      clearInterval(timer);
      window.dispatchEvent(
        new KeyboardEvent("keyup", { key: "w", code: "KeyW", bubbles: true }),
      );
    }
  }, 50);
})();
