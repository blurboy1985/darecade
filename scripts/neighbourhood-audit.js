(async () => {
  const report = [];
  const wait = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));
  const click = (selector) => {
    const el = document.querySelector(selector);
    if (!el) throw new Error(`Missing control: ${selector}`);
    el.click();
  };
  const assert = (ok, message) => {
    if (!ok) throw new Error(message);
  };
  const save = () => JSON.parse(localStorage.getItem("darecade-v1"));
  const canvas = document.querySelector("#world canvas");
  if (!document.querySelector("#away-banner").hidden)
    click('[data-action="return-lobby"]');
  if (canvas.dataset.camera !== "third") click("#camera-toggle");
  assert(canvas.dataset.camera === "third", "Third-person camera");
  const zoom = Number(canvas.dataset.zoom);
  click("#zoom-in");
  assert(Number(canvas.dataset.zoom) < zoom, "Zoom in");
  click("#zoom-out");
  document
    .querySelector("#world")
    .dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -100,
        bubbles: true,
        cancelable: true,
      }),
    );
  assert(Number(canvas.dataset.zoom) < zoom, "Wheel event zoom");
  const before = canvas.dataset.position;
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "w" }));
  await wait(500);
  window.dispatchEvent(new KeyboardEvent("keyup", { key: "w" }));
  assert(canvas.dataset.position !== before, "Camera-relative walking");
  report.push({
    camera: canvas.dataset.camera,
    zoom: canvas.dataset.zoom,
    moved: [before, canvas.dataset.position],
  });
  for (const id of ["sunny", "cosmic", "panda", "mellow", "mint"]) {
    click('[data-open="neighbours"]');
    click(`[data-resident="${id}"]`);
    assert(canvas.dataset.inspect === id, `Inspect ${id}`);
    assert(!document.querySelector("#inspector").hidden, `Inspector ${id}`);
    click('[data-action="close-inspector"]');
  }
  report.push({ inspections: 5 });
  const rewards = (s) =>
    JSON.stringify([s.xp, s.coins, s.visited, s.rounds, s.best]);
  const baseline = rewards(save());
  for (const id of ["jog", "dragon", "dance", "rest", "arcade"]) {
    click('[data-open="away"]');
    click(`[data-away="${id}"]`);
    click('[data-action="start-away"]');
    await wait(250);
    assert(
      save().away && save().awayActivity === id && save().awaySince > 0,
      `Away ${id} saved`,
    );
    assert(!document.querySelector("#away-banner").hidden, `Away ${id} banner`);
    assert(rewards(save()) === baseline, `Away ${id} did not earn rewards`);
    report.push({ away: id, position: canvas.dataset.position });
    click('[data-action="return-lobby"]');
  }
  click('[data-open="away"]');
  click('[data-away="jog"]');
  click('[data-action="save-away"]');
  window.dispatchEvent(new Event("offline"));
  await wait(250);
  assert(
    save().away && save().awayActivity === "jog",
    "Disconnect resumes selected activity",
  );
  assert(rewards(save()) === baseline, "Disconnect does not award XP");
  window.dispatchEvent(new Event("online"));
  assert(save().away, "Reconnect waits for player to return");
  click('[data-action="return-lobby"]');
  report.push({ disconnect: "passed", rewardsUnchanged: true });
  click('nav [data-open="arcade"]');
  assert(
    document.querySelectorAll("[data-game]").length === 4,
    "Exactly four games",
  );
  click("#close-modal");
  return report;
})();
