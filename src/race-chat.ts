import { CHAT_GAP_MS, CHAT_LINES } from "../shared/race-chat";

/** How many lines stay on screen. */
const KEEP = 4;
/** A line fades this long after it was said. */
const SHOW_MS = 8000;

/**
 * Quick chat for a multiplayer race: the last few lines said in the room, and
 * a picker for the fixed lines. There is nowhere to type.
 */
export class RaceChat {
  readonly element = document.createElement("div");
  muted = false;
  private players: { name: string }[] = [];
  private you = -1;
  private readonly log: HTMLOListElement;
  private readonly lines: HTMLElement;
  private readonly toggle: HTMLButtonElement;
  private readonly mute: HTMLButtonElement;
  private wait = 0;
  private readonly say: (line: number) => void;
  constructor(say: (line: number) => void) {
    this.say = say;
    this.element.className = "race-chat";
    this.element.innerHTML = `<ol class="race-chat-log" role="log" aria-live="polite" aria-label="Race chat"></ol>
      <div class="race-chat-lines" role="group" aria-label="Say something" hidden>${CHAT_LINES.map(
        (line, i) =>
          `<button type="button" data-chat-line="${i}"><kbd>${i + 1}</kbd> ${line}</button>`,
      ).join("")}</div>
      <div class="race-chat-bar"><button type="button" class="text-button" data-chat-open aria-expanded="false">Chat</button><button type="button" class="text-button" data-chat-mute aria-pressed="false">Mute chat</button></div>`;
    this.log = this.element.querySelector(".race-chat-log")!;
    this.lines = this.element.querySelector(".race-chat-lines")!;
    this.toggle = this.element.querySelector("[data-chat-open]")!;
    this.mute = this.element.querySelector("[data-chat-mute]")!;
    this.toggle.addEventListener("click", () => this.show(this.lines.hidden));
    this.mute.addEventListener("click", () => {
      this.muted = !this.muted;
      this.mute.setAttribute("aria-pressed", String(this.muted));
      this.mute.textContent = this.muted ? "Chat muted" : "Mute chat";
      this.toggle.disabled = this.muted;
      if (this.muted) {
        this.show(false);
        this.log.replaceChildren();
      }
    });
    this.lines.addEventListener("click", (e) => {
      const button = (e.target as Element).closest<HTMLButtonElement>(
        "[data-chat-line]",
      );
      if (button) this.send(Number(button.dataset.chatLine));
    });
  }
  /** The room's player list, which a line's `from` counts into. */
  setPlayers(players: { name: string }[], you: number) {
    this.players = players;
    this.you = you;
  }
  private show(open: boolean) {
    this.lines.hidden = !open;
    this.toggle.setAttribute("aria-expanded", String(open));
  }
  /** Says a line, unless chat is muted or the last one was a moment ago. */
  send(line: number) {
    if (this.muted || this.wait || !CHAT_LINES[line]) return false;
    this.say(line);
    this.show(false);
    // The room drops lines sent sooner than this, so the picker rests too.
    const buttons = this.lines.querySelectorAll("button");
    buttons.forEach((b) => (b.disabled = true));
    this.wait = window.setTimeout(() => {
      this.wait = 0;
      buttons.forEach((b) => (b.disabled = false));
    }, CHAT_GAP_MS);
    return true;
  }
  /** A number key says that line, so a driver need not let go of the wheel. */
  key(key: string) {
    const line = /^[1-9]$/.test(key) ? Number(key) - 1 : -1;
    return line >= 0 && line < CHAT_LINES.length && this.send(line);
  }
  /** The room passed on a line. */
  heard(from: number, line: number) {
    const player = this.players[from];
    const text = CHAT_LINES[line];
    if (this.muted || !player || !text) return;
    const row = document.createElement("li");
    const name = document.createElement("b");
    // Names and lines go in as text, never as markup.
    name.textContent = from === this.you ? "You" : player.name;
    row.append(name, ` ${text}`);
    if (from === this.you) row.className = "is-you";
    this.log.append(row);
    while (this.log.children.length > KEEP)
      this.log.firstElementChild!.remove();
    window.setTimeout(() => row.remove(), SHOW_MS);
  }
  /** Empties the log, for a new room. */
  clear() {
    this.log.replaceChildren();
    this.show(false);
  }
}
