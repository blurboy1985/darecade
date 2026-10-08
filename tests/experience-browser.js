// Runs only in the isolated built-app fixture, before the real application.
const requests = [],
  checks = [];
const beforeStorage = localStorage.getItem("darecade-v1");
localStorage.setItem("qa-unrelated-preference", "keep");
if (scenario === "unavailable") {
  const context = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...args) {
    return String(type).startsWith("webgl")
      ? null
      : context.call(this, type, ...args);
  };
}
let time = performance.now(),
  frameId = 0;
const frames = new Map();
Object.defineProperty(performance, "now", { value: () => time });
requestAnimationFrame = (callback) => {
  frames.set(++frameId, callback);
  return frameId;
};
cancelAnimationFrame = (id) => frames.delete(id);
function advance(count = 1) {
  for (let i = 0; i < count; i++) {
    time += 1000 / 60 + 0.000001;
    const batch = [...frames.values()];
    frames.clear();
    batch.forEach((callback) => callback(time));
  }
}
// Keep the synthetic server profile independent of the browser's local save.
const stored = sessionStorage.getItem("qa-profile");
if (stored) Object.assign(profile, JSON.parse(stored));
const fixtureFetch = fetch;
fetch = async (input, init) => {
  const path = new URL(String(input), location.href).pathname;
  if (path.startsWith("/api/")) requests.push(path);
  if (path === "/api/run") {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const response = await fixtureFetch(input, init);
  if (path === "/api/profile")
    sessionStorage.setItem("qa-profile", JSON.stringify(profile));
  return response;
};
const find = (selector) => document.querySelector(selector);
function check(value, label) {
  if (!value) throw Error(label);
  checks.push(label);
}
async function until(predicate, label) {
  for (let i = 0; i < 300; i++) {
    advance();
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
  throw Error("Timed out: " + label);
}
function click(selector) {
  check(!!find(selector), "control exists " + selector);
  find(selector).click();
}
function key(key, code, type = "keydown") {
  window.dispatchEvent(
    new KeyboardEvent(type, { key, code, bubbles: true, cancelable: true }),
  );
}
function close() {
  click("#close-modal");
}
async function openGame(id) {
  click('.lobby-dock [data-open="arcade"]');
  for (let page = 0; page < 4 && !find('[data-game="' + id + '"]'); page++) {
    const next = [...document.querySelectorAll('[data-page="games"]')].find(
      (b) => !b.disabled && b.textContent.includes("Next"),
    );
    check(next, "game remains reachable " + id);
    next.click();
  }
  click('[data-game="' + id + '"]');
  check(
    find("#modal-body progress")?.getAttribute("aria-label") ===
      "Loading " +
        {
          hoops: "Hoops Court",
          fishing: "Fishing Jetty",
          noodle: "Noodle Run",
          coast: "Coast Rush",
        }[id],
    id + " loading label",
  );
  check(
    !find("#modal-body").textContent.includes("Getting the grid"),
    id + " accurate loading text",
  );
  await until(
    () => find("#start-game") && !find("#start-game").disabled,
    id + " ready",
  );
}
function finish(result, report) {
  parent.postMessage(
    { result, report: { scenario, checks, ...report } },
    location.origin,
  );
}
addEventListener("load", async () => {
  try {
    if (scenario === "unavailable") {
      await until(() => find("#retry-graphics"), "graphics message");
      check(
        find("#graphics-message").textContent.includes("requires 3D graphics"),
        "clear 3D requirement",
      );
      check(
        find("#graphics-message").textContent.includes("hardware acceleration"),
        "troubleshooting",
      );
      check(
        find('#graphics-message [role="alert"]') === document.activeElement,
        "accessible focus",
      );
      check(
        requests.length === 0,
        "unsupported startup makes no account or world requests",
      );
      check(
        localStorage.getItem("darecade-v1") === beforeStorage,
        "unsupported startup preserves raw save",
      );
      check(
        localStorage.getItem("qa-unrelated-preference") === "keep",
        "unrelated data preserved",
      );
      advance(1800);
      check(
        requests.length === 0 && !find("#world canvas"),
        "no fallback or retry loop",
      );
      if (!sessionStorage.getItem("qa-retried")) {
        sessionStorage.setItem("qa-retried", "1");
        click("#retry-graphics");
        return;
      }
      check(true, "manual Retry remains safe on repeated failure");
    } else {
      await until(
        () => find("#world canvas") && !find("#loading"),
        "3D startup with saved legacy preference",
      );
      check(
        !find("#fallback") && !document.body.classList.contains("mode-2d"),
        "no 2D world",
      );
      check(
        !("twoD" in JSON.parse(localStorage.getItem("darecade-v1"))),
        "retired preference migrated",
      );
      check(
        profile.progress.xp === 235 &&
          localStorage.getItem("qa-unrelated-preference") === "keep",
        "progress/preferences retained",
      );
      if (scenario.endsWith("context-lost")) {
        if (scenario !== "context-lost") {
          await openGame(scenario.split("-")[0]);
          click("#start-game");
          advance(60);
        }
        const canvas = find(
          scenario === "context-lost"
            ? "#world canvas"
            : ".outdoor-view canvas",
        );
        const extension = canvas
          .getContext("webgl2")
          .getExtension("WEBGL_lose_context");
        check(extension, "real context loss extension available");
        extension.loseContext();
        await until(() => find("#retry-graphics"), "context loss message");
        check(
          find("#graphics-message").textContent.includes("interrupted"),
          "detected loss is explained",
        );
        check(
          !find("#world canvas") && !find("#modal").open,
          "broken scene and activities stopped",
        );
        const snapshot = JSON.parse(localStorage.getItem("darecade-v1"));
        advance(1800);
        check(
          !requests.includes("/api/finish"),
          "context loss never finishes or rewards an abandoned round",
        );
        check(
          !find(".simple-outdoor"),
          "no meter-only fallback after context loss",
        );
        check(
          snapshot.xp === 235 && snapshot.wardrobePurchased.length === 0,
          "context loss preserves progress and ownership",
        );
      }
      if (scenario === "ready") {
        for (const id of ["hoops", "fishing", "noodle"]) {
          await openGame(id);
          const start = find("#start-game"),
            initial = find("#run-time").textContent,
            state = find("#run-state").textContent;
          advance(1800);
          check(
            find("#run-time").textContent === initial &&
              find("#run-state").textContent === state,
            id + " 30 seconds ready consumes no time or attempts",
          );
          check(!find("#game-cover").hidden, id + " ready cover remains");
          start.click();
          start.click(); // detached/hidden repeated activation must be safe
          if (id === "noodle") key("ArrowRight", "ArrowRight");
          advance(160);
          check(
            find("#run-time").textContent !== initial,
            id + " explicit start advances clock",
          );
          click("#pause-game");
          const paused = find("#run-time").textContent;
          advance(1800);
          check(
            find("#run-time").textContent === paused,
            id + " pause stops time",
          );
          click("#pause-game");
          advance(60);
          window.dispatchEvent(new Event("blur"));
          const blurred = find("#run-time").textContent;
          advance(1800);
          check(
            find("#run-time").textContent === blurred,
            id + " focus loss pauses",
          );
          window.dispatchEvent(new Event("focus"));
          advance(60);
          check(
            find("#run-time").textContent === blurred,
            id + " focus return requires Resume",
          );
          close();
          await openGame(id);
          advance(1800);
          check(
            find("#run-time").textContent === initial,
            id + " reopening resets to ready",
          );
          close();
        }
      }
      if (scenario === "appearance") {
        click('.lobby-dock [data-open="wardrobe"]');
        if (sessionStorage.getItem("qa-appearance-reload")) {
          check(
            find('[data-try-slot="outfits"][data-try-index="80"]').getAttribute(
              "aria-pressed",
            ) === "true",
            "owned outfit survives reload",
          );
          click(".look-identity summary");
          check(
            find('[data-eye="3"]').getAttribute("aria-pressed") === "true",
            "eye colour survives reload",
          );
          check(
            !find(".avatar-preview").textContent.includes("Trying on"),
            "cancelled preview does not return after reload",
          );
        } else {
          click('[data-try-slot="outfits"][data-try-index="80"]');
          await until(
            () => profile.progress.clothing === 64,
            "owned outfit saved",
          );
          click('[data-try-slot="outfits"][data-try-index="82"]');
          click("[data-undo-look]");
          await until(() => profile.progress.clothing === 64, "Undo saved");
          click(".look-identity summary");
          click('[data-eye="3"]');
          await until(() => profile.progress.eye === 3, "eyes saved");
          const saved = JSON.stringify(profile.progress);
          click('[data-wardrobe-filter="Legendary"]');
          click('[data-try-slot="outfits"][data-try-index="0"]');
          check(
            find("[data-equip-look]").disabled,
            "locked preview cannot equip",
          );
          check(
            find("#look-save-status").textContent.includes("Preview only"),
            "preview state explained",
          );
          check(
            JSON.stringify(profile.progress) === saved,
            "preview grants no ownership and writes no outfit",
          );
          close();
          click('.lobby-dock [data-open="wardrobe"]');
          check(
            !find(".avatar-preview").textContent.includes("Trying on"),
            "Close cancels locked preview",
          );
          sessionStorage.setItem("qa-appearance-reload", "1");
          location.reload();
          return;
        }
      }
      if (scenario === "race") {
        await openGame("coast");
        click("#start-game");
        advance(185);
        const race = find(".coast-game");
        // A touch on a hybrid device changes guidance without disabling keyboard.
        find('[data-race-control="gas"]').dispatchEvent(
          new PointerEvent("pointerdown", {
            pointerType: "touch",
            pointerId: 11,
            bubbles: true,
            cancelable: true,
          }),
        );
        find('[data-race-control="gas"]').dispatchEvent(
          new PointerEvent("pointerup", {
            pointerType: "touch",
            pointerId: 11,
            bubbles: true,
          }),
        );
        advance(60);
        check(race.dataset.input === "touch", "touch becomes active input");
        check(
          find("#drift-label").textContent.includes("DRIFT"),
          "touch drift guidance",
        );
        check(
          find(".race-footer-guidance").textContent.includes("Tap GO"),
          "touch acceleration guidance",
        );
        check(find(".race-use").textContent === "Tap ITEM", "touch item guide");
        key("w", "KeyW");
        advance(5);
        check(
          race.dataset.input === "keyboard" &&
            Number(race.dataset.distance) > 0,
          "keyboard works after touch",
        );
        check(
          find("#drift-label").textContent.includes("Space") &&
            find(".race-use").textContent === "Press E",
          "keyboard guidance updates",
        );
        key("w", "KeyW", "keyup");
        find('[data-race-control="drift"]').dispatchEvent(
          new PointerEvent("pointerdown", {
            pointerType: "touch",
            pointerId: 12,
            bubbles: true,
            cancelable: true,
          }),
        );
        advance(5);
        check(race.dataset.input === "touch", "switches back to touch");
        const item = find(".race-item").getBoundingClientRect();
        check(
          item.width >= 44 && item.height >= 44,
          "item target at least 44px",
        );
        for (const button of document.querySelectorAll(".race-touch button")) {
          const box = button.getBoundingClientRect();
          check(
            box.width >= 44 && box.height >= 44,
            "driving target at least 44px",
          );
        }
        const labels = [...document.querySelectorAll(".race-nameplate")].filter(
          (e) => !e.hidden,
        );
        if (innerWidth <= 600 || innerHeight <= 500) {
          check(labels.length <= 4, "compact racer labels capped");
          check(item.width <= 100, "compact item card");
          check(
            find(".race-nameplate-player").textContent === "You",
            "compact player name",
          );
        }
        for (let i = 0; i < labels.length; i++)
          for (let j = i + 1; j < labels.length; j++) {
            const a = labels[i].getBoundingClientRect(),
              b = labels[j].getBoundingClientRect();
            check(
              a.right <= b.left ||
                b.right <= a.left ||
                a.bottom <= b.top ||
                b.bottom <= a.top,
              "racer labels never overlap",
            );
          }
        check(
          document.documentElement.scrollWidth <= innerWidth + 1,
          "no horizontal overflow",
        );
        const extension = find(".race-view canvas")
          .getContext("webgl2")
          .getExtension("WEBGL_lose_context");
        extension.loseContext();
        await until(
          () => find("#retry-graphics"),
          "race context loss stops session",
        );
        check(!find(".simple-race"), "no playable 2D racing fallback");
      }
    }
    finish("pass", {});
  } catch (error) {
    finish("fail", { error: error.stack });
  }
});
