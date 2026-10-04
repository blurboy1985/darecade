// The game moved from the old workers.dev address to its own. A session
// cookie and browser saves cannot cross addresses, so the old address swaps
// them for a single-use code and the new address swaps the code back.
export const OLD_HOST = "darecade.daniel-tianwen.workers.dev";
export const HOME = "https://playsimi.danielquek.com";
export const MOVE_KEYS = [
  "darecade-v1",
  "darecade-preview-backup",
  "darecade-invite",
];
const post = (path: string, data: unknown) =>
  fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
/** Resolves false when the page is leaving for the new address. */
export async function settle(): Promise<boolean> {
  if (location.hostname === OLD_HOST) {
    let code = "";
    try {
      const saves: Record<string, string> = {};
      for (const key of MOVE_KEYS) {
        const value = localStorage.getItem(key);
        if (value) saves[key] = value;
      }
      let response = await post("/api/move", { saves });
      // An oversized save must not cost the player their session.
      if (!response.ok) response = await post("/api/move", { saves: {} });
      if (response.ok) code = (await response.json()).code || "";
    } catch {}
    location.replace(
      HOME +
        location.pathname +
        location.search +
        (code ? "#move=" + code : ""),
    );
    return false;
  }
  const code = /^#move=([0-9a-f]{64})$/.exec(location.hash)?.[1];
  if (!code) return true;
  history.replaceState(null, "", location.pathname + location.search);
  try {
    const response = await post("/api/move/claim", { code });
    const saves = response.ok ? (await response.json()).saves : null;
    for (const key of MOVE_KEYS)
      if (
        typeof saves?.[key] === "string" &&
        localStorage.getItem(key) === null
      )
        localStorage.setItem(key, saves[key]);
  } catch {}
  return true;
}
