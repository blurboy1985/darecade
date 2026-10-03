import { api } from "./social";

type Directory = {
  worlds: { id: string; code: string; count: number }[];
  neighbours: { id: string; name: string; world: string }[];
};
const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const worldCode = (world: string) =>
  world ? `W${world.slice(6)}` : "Joining…";

export class WorldPicker {
  private busy = false;
  private request = 0;
  constructor(
    private body: HTMLElement,
    private active: () => boolean,
    private current: () => string,
    private switchWorld: (world: string) => Promise<void>,
    private notify: (message: string) => void,
  ) {
    body.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>(
        "[data-world-join],[data-world-friend],[data-world-refresh]",
      );
      if (!button || button.disabled) return;
      if (button.dataset.worldJoin)
        void this.join({ world: button.dataset.worldJoin });
      else if (button.dataset.worldFriend)
        void this.join({ friend: button.dataset.worldFriend });
      else void this.open();
    });
    body.addEventListener("submit", (event) => {
      if (
        !(event.target instanceof HTMLFormElement) ||
        event.target.id !== "room-code"
      )
        return;
      event.preventDefault();
      const code = String(new FormData(event.target).get("code") || "")
        .trim()
        .toUpperCase();
      if (!/^W[1-9][0-9]{0,5}$/.test(code)) {
        this.notify("Enter a room code such as W3.");
        return;
      }
      void this.join({ world: `world-${code.slice(1)}` });
    });
  }
  async open() {
    const request = ++this.request;
    this.body.innerHTML =
      '<h2>Worlds</h2><p role="status">Finding your neighbours…</p>';
    try {
      const data = await api<Directory>("worlds");
      if (!this.active() || request !== this.request) return;
      this.body.innerHTML = `<h2>Worlds</h2><p class="lead">Same games. A different crowd.</p><p>You’re in <strong>${worldCode(this.current())}</strong>. Worlds usually hold about 25 players, with space for friends up to 30.</p><div class="world-list">${data.worlds.map((w) => `<section class="world-row"><div><strong>World ${w.id.slice(6)} <small>${w.code}</small></strong><span>${w.count} / 30 players${w.id === this.current() ? " · You’re here" : ""}</span></div><button class="secondary" data-world-join="${w.id}" ${w.id === this.current() || w.count >= 30 ? "disabled" : ""}>${w.id === this.current() ? "Current" : w.count >= 30 ? "Full" : "Join"}</button></section>`).join("") || "<p>Your world will appear once you connect.</p>"}</div><form id="room-code"><label for="world-code">Have a room code?</label><div class="world-code-row"><input id="world-code" name="code" placeholder="W3" maxlength="7" pattern="[Ww][1-9][0-9]{0,5}" required autocomplete="off"><button class="secondary" type="submit">Join room</button></div></form><h3>Join a neighbour</h3><div class="world-list">${data.neighbours.map((p) => `<section class="world-row"><div><strong>${escape(p.name)}</strong><span>${worldCode(p.world)}</span></div><button class="secondary" data-world-friend="${p.id}" ${p.world === this.current() ? "disabled" : ""}>${p.world === this.current() ? "Here" : "Join friend"}</button></section>`).join("") || "<p>No other neighbours are online yet.</p>"}</div><button class="text-button" data-world-refresh>Refresh player counts</button><p class="fine-print">Counts update about every 10 seconds. A world may fill while you’re joining.</p>`;
    } catch (error) {
      if (this.active() && request === this.request)
        this.body.innerHTML = `<h2>Worlds</h2><p role="alert">${escape(error instanceof Error ? error.message : "Unable to load worlds.")}</p><button class="secondary" data-world-refresh>Try again</button>`;
    }
  }
  async join(destination: { world: string } | { friend: string }) {
    if (this.busy) return;
    this.busy = true;
    this.notify("Joining world…");
    try {
      const { world } = await api<{ world: string }>(
        "worlds/join",
        destination,
      );
      await this.switchWorld(world);
      this.notify(`You’re in ${worldCode(world)}.`);
    } catch (error) {
      this.notify(
        error instanceof Error ? error.message : "Unable to join this world.",
      );
    } finally {
      this.busy = false;
      if (this.active()) void this.open();
    }
  }
}
