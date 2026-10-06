import { api } from "./social";

type Directory = {
  worlds: { id: string; code: string; count: number }[];
  neighbours: { id: string; name: string; world: string }[];
};
const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const worldCode = (world: string) =>
  world ? `W${world.slice(6)}` : "Joining…";

function selectedChoice(form: HTMLFormElement) {
  const option = form.querySelector("select")?.selectedOptions.item(0);
  return option && !option.disabled ? option.value : "";
}

export class WorldPicker {
  private busy = false;
  private request = 0;
  constructor(
    private body: HTMLElement,
    private active: () => boolean,
    private current: () => string,
    private switchWorld: (world: string) => Promise<void>,
    private notify: (message: string) => void,
    private visibleCount?: () => number,
  ) {
    body.addEventListener("click", (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>(
        "[data-world-refresh]",
      );
      if (button && !button.disabled && !this.busy) void this.open();
    });
    body.addEventListener("change", (event) => {
      if (!(event.target instanceof HTMLSelectElement)) return;
      const form = event.target.closest<HTMLFormElement>("[data-world-choice]");
      const button = form?.querySelector<HTMLButtonElement>("[type=submit]");
      if (form && button) button.disabled = this.busy || !selectedChoice(form);
    });
    body.addEventListener("submit", (event) => {
      if (!(event.target instanceof HTMLFormElement)) return;
      const form = event.target;
      if (form.id !== "room-code" && !form.hasAttribute("data-world-choice"))
        return;
      event.preventDefault();
      if (this.busy) return;
      if (form.id === "room-code") {
        const code = String(new FormData(form).get("code") || "")
          .trim()
          .toUpperCase();
        if (!/^W[1-9][0-9]{0,5}$/.test(code)) {
          this.notify("Use a room code like W3.");
          return;
        }
        void this.join({ world: `world-${code.slice(1)}` });
        return;
      }
      const destination = selectedChoice(form);
      if (!destination) return;
      if (form.dataset.worldChoice === "world")
        void this.join({ world: destination });
      else if (form.dataset.worldChoice === "friend")
        void this.join({ friend: destination });
    });
  }
  async open() {
    const request = ++this.request;
    this.body.innerHTML = `<h2>Worlds</h2><p role="status">${this.busy ? "Joining world…" : "Finding players…"}</p>`;
    if (this.busy) return;
    try {
      const data = await api<Directory>("worlds");
      if (!this.active() || request !== this.request) return;
      const current = this.current();
      const full = new Set(
        data.worlds
          .filter((world) => world.count >= 30)
          .map((world) => world.id),
      );
      const worldOptions = data.worlds
        .map((world) => {
          const here = world.id === current;
          return `<option value="${escape(world.id)}" ${here || full.has(world.id) ? "disabled" : ""}>${escape(world.code)} · ${here && this.visibleCount ? this.visibleCount() : world.count}/30${here ? " · Here" : full.has(world.id) ? " · Full" : ""}</option>`;
        })
        .join("");
      const friendOptions = data.neighbours
        .map((friend) => {
          const here = friend.world === current;
          return `<option value="${escape(friend.id)}" ${here || full.has(friend.world) ? "disabled" : ""}>${escape(friend.name)} · ${escape(worldCode(friend.world))}${here ? " · Here" : full.has(friend.world) ? " · Full" : ""}</option>`;
        })
        .join("");
      this.body.innerHTML = `<h2>Worlds</h2><p class="lead">You’re in ${escape(worldCode(current))}.</p>
<form data-world-choice="world"><label class="field-label" for="world-choice">Choose a world</label><select class="destination-select" id="world-choice" name="world" required data-world-control ${data.worlds.length ? "" : "disabled"}><option value="" disabled selected>${data.worlds.length ? "Choose a world" : "No worlds available"}</option>${worldOptions}</select><button class="secondary" type="submit" data-main-action data-world-control disabled>Join world</button></form>
<form data-world-choice="friend"><label class="field-label" for="world-friend">Find a friend</label><select class="destination-select" id="world-friend" name="friend" required data-world-control ${data.neighbours.length ? "" : "disabled"}><option value="" disabled selected>${data.neighbours.length ? "Choose a friend" : "No friends online"}</option>${friendOptions}</select><button class="secondary" type="submit" data-main-action data-world-control disabled>Join friend</button></form>
<form id="room-code"><label class="field-label" for="world-code">Have a room code?</label><div class="world-code-row"><input id="world-code" name="code" placeholder="W3" maxlength="7" pattern="[Ww][1-9][0-9]{0,5}" required autocomplete="off" data-world-control><button class="secondary" type="submit" data-main-action data-world-control>Join room</button></div></form>
<p class="fine-print">Up to 30 players per world. Counts may change.</p>`;
    } catch (error) {
      if (this.active() && request === this.request)
        this.body.innerHTML = `<h2>Worlds</h2><p role="alert">${escape(error instanceof Error ? error.message : "Unable to load worlds.")}</p><button class="secondary" data-world-refresh data-main-action>Try again</button>`;
    }
  }
  async join(destination: { world: string } | { friend: string }) {
    if (this.busy) return;
    this.busy = true;
    ++this.request;
    if (this.active())
      this.body
        .querySelectorAll<
          HTMLButtonElement | HTMLInputElement | HTMLSelectElement
        >("[data-world-control]")
        .forEach((control) => {
          control.disabled = true;
        });
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
