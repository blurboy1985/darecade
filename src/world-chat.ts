import {
  WORLD_CHAT_GAP_MS,
  WORLD_CHAT_MAX,
  worldChatText,
} from "../shared/world-chat";

/** How many messages the window remembers. */
const HISTORY = 100;
/** How many messages float on screen while the window is closed. */
const KEEP = 6;
/** A floating message fades this long after it was said. */
const SHOW_MS = 12000;
/** A message the world has not passed on by now is marked as not sent. */
const UNSENT_MS = 10000;

/**
 * Chat for the shared world: a window with what has been said since this
 * page joined and a box to type a message. While the window is closed, new
 * messages float above the Chat button for a moment.
 */
export class WorldChat {
  readonly element = document.createElement("div");
  private readonly recent: HTMLOListElement;
  private readonly panel: HTMLElement;
  private readonly log: HTMLOListElement;
  private readonly empty: HTMLElement;
  private readonly input: HTMLInputElement;
  private readonly sendButton: HTMLButtonElement;
  private readonly toggle: HTMLButtonElement;
  private readonly badge: HTMLElement;
  private wait = 0;
  private unread = 0;
  private place = "";
  private lastPlace = "";
  /** Your messages the world has not passed on yet, oldest first. */
  private sending: { text: string; row: HTMLLIElement; timer: number }[] = [];
  private readonly say: (text: string) => boolean;
  constructor(say: (text: string) => boolean) {
    this.say = say;
    this.element.className = "world-chat";
    this.element.innerHTML = `<ol class="world-chat-recent" role="log" aria-live="polite" aria-label="World chat"></ol>
      <section class="world-chat-window" aria-label="World chat" hidden>
        <header class="world-chat-head"><span>World chat</span><button type="button" class="world-chat-close" aria-label="Close chat">×</button></header>
        <ol class="world-chat-log" role="log" aria-live="polite" aria-label="Messages" tabindex="0"></ol>
        <p class="world-chat-empty">Nobody has said anything yet.</p>
        <form class="world-chat-form"><input type="text" maxlength="${WORLD_CHAT_MAX}" placeholder="Say something…" aria-label="Message to this world" autocomplete="off" enterkeyhint="send"><button type="submit">Send</button></form>
      </section>
      <button type="button" class="world-chat-toggle" aria-expanded="false" aria-keyshortcuts="Enter">Chat<span class="world-chat-unread" hidden></span></button>`;
    this.recent = this.element.querySelector(".world-chat-recent")!;
    this.panel = this.element.querySelector(".world-chat-window")!;
    this.log = this.element.querySelector(".world-chat-log")!;
    this.empty = this.element.querySelector(".world-chat-empty")!;
    const form = this.element.querySelector("form")!;
    this.input = form.querySelector("input")!;
    this.sendButton = form.querySelector("button")!;
    this.toggle = this.element.querySelector(".world-chat-toggle")!;
    this.badge = this.element.querySelector(".world-chat-unread")!;
    this.toggle.addEventListener("click", () => this.show(true));
    this.element
      .querySelector(".world-chat-close")!
      .addEventListener("click", () => this.show(false));
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      this.send();
    });
    // Typing and scrolling must not walk the avatar or set off the world's
    // shortcuts.
    this.panel.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") this.show(false);
    });
    this.panel.addEventListener("keyup", (e) => e.stopPropagation());
    // The on-screen keyboard covers the bottom of the page, so the window
    // moves up by as much as the keyboard takes.
    const view = window.visualViewport;
    const lift = () =>
      this.element.style.setProperty(
        "--keyboard",
        `${Math.max(0, Math.round(window.innerHeight - view!.height - view!.offsetTop))}px`,
      );
    view?.addEventListener("resize", lift);
    view?.addEventListener("scroll", lift);
  }
  /** Opens the window and puts the cursor in the box, or puts it away. */
  show(open: boolean) {
    this.panel.hidden = !open;
    this.recent.hidden = open;
    this.toggle.hidden = open;
    this.toggle.setAttribute("aria-expanded", String(open));
    if (open) {
      this.unread = 0;
      this.badge.hidden = true;
      this.recent.replaceChildren();
      this.log.scrollTop = this.log.scrollHeight;
      this.input.focus();
    } else this.input.blur();
  }
  /** The world this page is in, which the history marks when it changes. */
  world(name: string) {
    this.place = name;
  }
  /** Says what is in the box, unless the last message was a moment ago. */
  private send() {
    const text = worldChatText(this.input.value);
    if (!text || this.wait || !this.say(text)) return;
    this.input.value = "";
    // It shows at once, and is marked until the world passes it on.
    const row = this.add("You", text, true);
    row.classList.add("is-sending");
    const mine = {
      text,
      row,
      timer: window.setTimeout(() => {
        row.classList.replace("is-sending", "is-unsent");
        row.append(this.status("Not sent"));
      }, UNSENT_MS),
    };
    this.sending.push(mine);
    // The world drops messages sent sooner than this, so the button rests too.
    this.sendButton.disabled = true;
    this.wait = window.setTimeout(() => {
      this.wait = 0;
      this.sendButton.disabled = false;
    }, WORLD_CHAT_GAP_MS);
  }
  /** The world passed on a message. */
  heard(name: string, text: string, you: boolean) {
    // One still marked as sending is the likelier match than one given up on.
    const waiting = (unsent: boolean) =>
      this.sending.findIndex(
        (m) =>
          m.text === text && m.row.classList.contains("is-unsent") === unsent,
      );
    const mine = !you
      ? -1
      : waiting(false) >= 0
        ? waiting(false)
        : waiting(true);
    if (mine >= 0) {
      // Yours is already in the window; now it is known to have arrived.
      const [{ row, timer }] = this.sending.splice(mine, 1);
      clearTimeout(timer);
      row.classList.remove("is-sending", "is-unsent");
      row.querySelector(".world-chat-status")?.remove();
      return;
    }
    this.add(you ? "You" : name, text, you);
    // What you said yourself, from another tab, is not news to you.
    if (!this.panel.hidden || you) return;
    this.unread++;
    this.badge.textContent = this.unread > 99 ? "99+" : String(this.unread);
    this.badge.hidden = false;
    const row = this.row(name, text, false);
    this.recent.append(row);
    while (this.recent.children.length > KEEP)
      this.recent.firstElementChild!.remove();
    window.setTimeout(() => row.remove(), SHOW_MS);
  }
  /** Adds a message to the history and keeps the newest in view. */
  private add(who: string, text: string, you: boolean) {
    // Following the talk, unless the player has scrolled up to read.
    const follow =
      you ||
      this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40;
    if (this.place !== this.lastPlace) {
      if (this.log.children.length) {
        const moved = document.createElement("li");
        moved.className = "world-chat-place";
        moved.textContent = this.place;
        this.log.append(moved);
      }
      this.lastPlace = this.place;
    }
    const row = this.row(who, text, you);
    const at = new Date();
    const time = document.createElement("time");
    time.dateTime = at.toISOString();
    time.textContent = at.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    row.append(time);
    this.log.append(row);
    while (this.log.children.length > HISTORY)
      this.log.firstElementChild!.remove();
    this.empty.hidden = true;
    if (follow) this.log.scrollTop = this.log.scrollHeight;
    return row;
  }
  private row(who: string, text: string, you: boolean) {
    const row = document.createElement("li");
    const name = document.createElement("b");
    // Names and messages go in as text, never as markup.
    name.textContent = who;
    row.append(name, ` ${text}`);
    if (you) row.className = "is-you";
    return row;
  }
  private status(text: string) {
    const status = document.createElement("span");
    status.className = "world-chat-status";
    status.textContent = text;
    return status;
  }
}
