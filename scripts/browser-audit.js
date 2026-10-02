(async () => {
  const report = [];
  const waitFrame = () =>
    new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  for (const id of [
    "map",
    "arcade",
    "dares",
    "wardrobe",
    "emotes",
    "album",
    "quests",
    "shop",
    "settings",
    "neighbours",
    "away",
    "surroundings",
  ]) {
    const close = document.getElementById("close-modal");
    if (document.getElementById("modal").open) close.click();
    const candidates = [...document.querySelectorAll(`[data-open="${id}"]`)];
    const button = candidates.find(
      (el) => el.getBoundingClientRect().width > 0,
    );
    if (!button) {
      document.querySelector('nav [data-open="map"]').click();
      if (!document.querySelector(`[data-walk="${id}"]`))
        throw new Error(`Missing accessible ${id} entry`);
      report.push({ panel: id, reachableViaExplore: true, width: innerWidth });
      document.getElementById("close-modal").click();
      continue;
    }
    button.click();
    await waitFrame();
    const modal = document.getElementById("modal");
    report.push({
      panel: id,
      open: modal.open,
      heading: modal.querySelector("h2")?.textContent,
      overflow: modal.scrollWidth > modal.clientWidth + 1,
      width: innerWidth,
    });
    if (!modal.open || modal.scrollWidth > modal.clientWidth + 1)
      throw new Error(`Panel failed at ${innerWidth}: ${id}`);
  }
  document.getElementById("close-modal").click();
  return report;
})();
