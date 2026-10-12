// Local development entry: the actual game UI with entirely synthetic accounts
// and transports. It is not referenced by the production index or build.
import { fresh } from "../src/state";
import { tokenLooks } from "../src/collections";
const query = new URLSearchParams(location.search);
const looks = [
  { outfit: 3, skin: 0, clothing: 1, hair: 0, pet: 1, accessory: 1 },
  { outfit: 1, skin: 6, clothing: 3, hair: 5, pet: 4, accessory: 17 },
  { outfit: 4, skin: 2, clothing: 5, hair: 6, pet: 24, accessory: 26 },
  { outfit: 2, skin: 7, clothing: 7, hair: 3, pet: 1, accessory: 0 },
];
const profile = {
  id: "art-qa-profile",
  name: "Art QA",
  account: null,
  ageBand: "adult",
  privacyVersion: "fixture",
  styleRewards: 0,
  progress: {
    ...fresh(),
    ...looks[Number(query.get("look") || 0) % looks.length],
    rounds: 1,
    welcome: "complete",
    xp: 10000,
    sound: false,
    music: false,
    twoD: query.has("2d"),
    reduced: query.has("reduced"),
    cameraMode: query.has("third") ? "third" : "isometric",
    wardrobePurchased: tokenLooks.map((s) => s.id),
  },
};
localStorage.setItem("darecade-v1", JSON.stringify(profile.progress));
const requests: string[] = [];
const errors: string[] = [];
addEventListener("error", (e) => errors.push(e.message));
addEventListener("unhandledrejection", (e) => errors.push(String(e.reason)));
const packet = () => ({
  t: "sync",
  at: Date.now(),
  world: "art-qa",
  p: query.has("remotes")
    ? looks.map((look, i) => [i, `art-peer-${i}`, `Art peer ${i + 1}`, look])
    : [],
  d: query.has("remotes")
    ? looks.map((_, i) => [i, (i - 1.5) * 180, 900, 0, 0, 0])
    : [],
  gone: [],
});
const nativeFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    location.href,
  );
  if (!url.pathname.startsWith("/api/")) return nativeFetch(input, init);
  if (url.origin !== location.origin)
    throw Error("Art QA cannot call remote APIs");
  const path = url.pathname.slice(5);
  requests.push(path);
  let result: unknown;
  if (path === "auth/config")
    result = {
      now: Date.now(),
      privacyVersion: "fixture",
      mailMode: "outbox",
      origin: location.origin,
      storageNotice: "Synthetic local art QA",
      privacyContact: "",
    };
  else if (path === "auth/me" || path === "profile" || path === "progress") {
    if (path === "profile" && init?.body)
      Object.assign(profile.progress, JSON.parse(String(init.body)));
    result = profile;
  } else if (path === "style-rewards") result = { tokens: 0 };
  else if (path === "world/poll") result = packet();
  else if (path === "world/leave") result = {};
  else if (path === "state")
    result = {
      profile,
      competitionReady: false,
      me: profile.id,
      self: {
        id: profile.id,
        name: profile.name,
        look: profile.progress,
        activity: "lobby",
        status: "online",
        best: profile.progress.best,
        points: 0,
      },
      day: "2026-10-05",
      nextReset: Date.now() + 86400000,
      week: "",
      weekly: [],
      lastWeek: [],
      dares: [],
      recentRuns: [],
      players: [],
      friends: [],
      challenged: [],
      boards: { noodle: [], hop: [], brick: [], swarm: [], coast: [] },
      history: [],
    };
  else throw Error(`Unexpected art QA API: ${path}`);
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json" },
  });
};
const NativeSocket = window.WebSocket;
class ArtSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;
  readyState = 0;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(url: string | URL) {
    if (new URL(url).pathname !== "/api/world/connect")
      throw Error("Unexpected art QA socket");
    setTimeout(() => {
      if (this.readyState === 3) return;
      this.readyState = 1;
      this.onopen?.();
      this.onmessage?.({ data: JSON.stringify(packet()) });
    }, 10);
  }
  send() {}
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}
window.WebSocket = ArtSocket as unknown as typeof WebSocket;
const nativeBeacon = navigator.sendBeacon.bind(navigator);
navigator.sendBeacon = (url, data) =>
  new URL(String(url), location.href).pathname.startsWith("/api/")
    ? (requests.push("beacon:world/leave"), true)
    : nativeBeacon(url, data);
if (query.has("no-webgl")) {
  const context = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (
    type: string,
    ...args: unknown[]
  ) {
    return type.startsWith("webgl")
      ? null
      : context.apply(this, [type, ...args] as never);
  } as typeof context;
}
Object.assign(window, {
  gameArtQA: { requests, errors, profile, NativeSocket },
});
await import("../src/boot");
