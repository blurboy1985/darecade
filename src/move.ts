// The game moved from the old workers.dev address to its own. A session
// cookie and browser saves cannot cross addresses, so the old address swaps
// them for a single-use code and the new address swaps the code back.
//
// The new address starts each move with a random key it keeps for this tab,
// and a code only works with the key it was made for. A link carrying someone
// else's code therefore cannot sign a visitor in as that person.
//
//   old            -> new #from-old
//   new #from-old  -> old #move-key=KEY   (KEY kept in sessionStorage)
//   old #move-key  -> new #move=CODE      (session and saves stored under CODE)
//   new #move      -> claims CODE with KEY, then the game starts
export const OLD_HOST = "darecade.daniel-tianwen.workers.dev";
export const HOME = "https://playsimi.danielquek.com";
export const MOVE_KEYS = [
  "darecade-v1",
  "darecade-preview-backup",
  "darecade-invite",
];
const KEY = "play-simi-move-key";
const hex = /^[0-9a-f]{64}$/;
const post = (path: string, data: unknown) =>
  fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
const page = () => location.pathname + location.search;
/** Resolves false when the page is leaving for the other address. */
export async function settle(): Promise<boolean> {
  const [, step, value = ""] =
    /^#(from-old|move-key|move)(?:=(.*))?$/.exec(location.hash) || [];
  if (location.hostname === OLD_HOST) {
    if (step !== "move-key" || !hex.test(value)) {
      location.replace(HOME + page() + "#from-old");
      return false;
    }
    let code = "";
    try {
      const saves: Record<string, string> = {};
      for (const key of MOVE_KEYS) {
        const save = localStorage.getItem(key);
        if (save) saves[key] = save;
      }
      let response = await post("/api/move", { key: value, saves });
      // An oversized save must not cost the player their session.
      if (!response.ok)
        response = await post("/api/move", { key: value, saves: {} });
      if (response.ok) code = (await response.json()).code || "";
    } catch {}
    location.replace(HOME + page() + (code ? "#move=" + code : ""));
    return false;
  }
  if (!step || step === "move-key") return true;
  if (step === "from-old") {
    try {
      const key = [...crypto.getRandomValues(new Uint8Array(32))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      sessionStorage.setItem(KEY, key);
      location.replace(`https://${OLD_HOST}${page()}#move-key=${key}`);
      return false;
    } catch {
      // No tab storage: start here as a new visitor.
    }
  }
  history.replaceState(null, "", page());
  if (step !== "move" || !hex.test(value)) return true;
  try {
    const key = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (!key) return true;
    const response = await post("/api/move/claim", { code: value, key });
    const saves = response.ok ? (await response.json()).saves : null;
    for (const name of MOVE_KEYS)
      if (
        typeof saves?.[name] === "string" &&
        localStorage.getItem(name) === null
      )
        localStorage.setItem(name, saves[name]);
  } catch {}
  return true;
}
