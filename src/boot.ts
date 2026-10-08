import { settle } from "./move";
import { introWanted, SEEN_KEY } from "./intro-script";

/** The intro film, for a first visit. Its code is fetched only if it plays. */
async function intro() {
  try {
    const wanted = introWanted({
      search: location.search,
      seen: localStorage.getItem(SEEN_KEY) !== null,
      reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
      automated: navigator.webdriver === true,
    });
    return wanted ? await (await import("./intro")).playIntro() : null;
  } catch {
    // A film that cannot load or run must never keep a player out.
    return null;
  }
}

// Nothing in the game may read a save or call the server before a move ends.
if (await settle()) {
  const film = await intro();
  await import("./main");
  film?.close();
}
