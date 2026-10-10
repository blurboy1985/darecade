import {
  WORLD_CHAT_GAP_MS,
  WORLD_CHAT_MAX,
  worldChatText,
} from "../shared/world-chat";

/** How many messages stay on screen. */
const KEEP = 6;
/** A message fades this long after it was said. */
const SHOW_MS = 12000;

/**
 * Chat for the shared world: the last few messages said there, and a box to
 * type one.
 */
export class WorldChat {
  readonly element = document.createElement("div");
  private readonly log: HTMLOListElement;
  private readonly form: HTMLFormElement;
  private readonly input: HTMLInputElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly toggle: HTMLButtonElement;
  private wait = 0;
  private readonly say: (text: string) => void;
  constructor(say: (text: string) => void) {
    this.say = say;
    this.element.className = "world-chat";
    this.element.innerHTML = `<ol class="world-chat-log" role="log" aria-live="polite" aria-label="World chat"></ol>
      <form class="world-chat-form" hidden><input type="text" maxlength="${WORLD_CHAT_MAX}" placeholder="Say something…" aria-label="Message to this world" autocomplete="off" enterkeyhint="send"><button type="submit">Send</button></form>
      <button type="button" class="world-chat-toggle" aria-expanded="false" aria-keyshortcuts="Enter">Chat</button>`;
    this.log = this.element.querySelector(".world-chat-log")!;
    this.form = this.element.querySelector(".world-chat-form")!;
    this.input = this.form.querySelector("input")!;
    this.sendButton = this.form.querySelector("button")!;
    this.toggle = this.element.querySelector(".world-chat-toggle")!;
    this.toggle.addEventListener("click", () => this.show(true));
    this.form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.send();
    });
    // Typing must not walk the avatar or set off the world's shortcuts.
    this.input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.show(false);
    });
    this.input.addEventListener("keyup", (e) => e.stopPropagation());
    this.input.addEventListener("blur", () => {
      if (!this.input.value) this.show(false);
    });
  }
  /** Opens the box and puts the cursor in it, or puts it away. */
  show(open: boolean) {
    this.form.hidden = !open;
    this.toggle.hidden = open;
    this.toggle.setAttribute("aria-expanded", String(open));
    if (open) this.input.focus();
    else this.input.blur();
  }
  /** Says what is in the box, unless the last message was a moment ago. */
  private send() {
    const text = worldChatText(this.input.value);
    if (!text || this.wait) return;
    this.say(text);
    this.input.value = "";
    // The world drops messages sent sooner than this, so the button rests too.
    this.sendButton.disabled = true;
    this.wait = window.setTimeout(() => {
      this.wait = 0;
      this.sendButton.disabled = false;
    }, WORLD_CHAT_GAP_MS);
  }
  /** The world passed on a message. */
  heard(name: string, text: string, you: boolean) {
    const row = document.createElement("li");
    const who = document.createElement("b");
    // Names and messages go in as text, never as markup.
    who.textContent = you ? "You" : name;
    row.append(who, ` ${text}`);
    if (you) row.className = "is-you";
    this.log.append(row);
    while (this.log.children.length > KEEP)
      this.log.firstElementChild!.remove();
    window.setTimeout(() => row.remove(), SHOW_MS);
  }
}
