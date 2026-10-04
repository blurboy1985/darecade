// Run in agent-browser eval --stdin on the local Vite page. The PNGs come
// from the same meshes and camera used by the fitting room, not mock art.
(async () => {
  const { loadCharacter, createCharacterPreview } = await import(
    "/src/character.ts"
  );
  const { thumbnailLook } = await import("/src/wardrobe.ts");
  const { appearanceLimits } = await import("/src/appearance.ts");
  const { legendarySets } = await import("/src/collections.ts");
  await loadCharacter();
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-1000px;width:240px;height:220px";
  document.body.append(host);
  const preview = createCharacterPreview(host, thumbnailLook("clothing", 0));
  const images = {};
  try {
    for (const [slot, count] of Object.entries({
      ...appearanceLimits,
      sets: legendarySets.length,
    })) {
      for (let i = 0; i < count; i++) {
        images[`${slot}-${i}`] = preview.thumbnail(
          thumbnailLook(slot, i),
          slot === "sets" ? "set" : slot,
        );
        await new Promise(requestAnimationFrame);
      }
    }
    return images;
  } finally {
    preview.dispose();
    host.remove();
  }
})();
