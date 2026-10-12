/** Styled controls preserve native form values and the app's existing change events. */
export function installControls() {
  const refresh = () => {
    document.querySelectorAll<HTMLSelectElement>("select").forEach((select) => {
      if (select.multiple) return;
      let wrapper = select.parentElement?.classList.contains("kit-select")
        ? select.parentElement
        : null;
      if (!wrapper) {
        wrapper = document.createElement("span");
        wrapper.className = "kit-select";
        select.before(wrapper);
        wrapper.append(select);
        select.classList.add("kit-native");
        select.tabIndex = -1;
        const button = document.createElement("button");
        button.type = "button";
        button.className = "kit-select-trigger";
        button.setAttribute("aria-haspopup", "listbox");
        button.setAttribute("aria-expanded", "false");
        wrapper.append(button);
        const list = document.createElement("span");
        list.className = "kit-options";
        list.setAttribute("role", "listbox");
        list.hidden = true;
        wrapper.append(list);
        button.onclick = (e) => {
          e.preventDefault();
          list.hidden = !list.hidden;
          button.setAttribute("aria-expanded", String(!list.hidden));
          (
            (!list.hidden &&
              list.querySelector<HTMLButtonElement>("[aria-selected=true]")) ||
            button
          ).focus();
        };
        // A press must not move focus: the list would close under the pointer
        // before the click arrives, and Safari never focuses a pressed button.
        wrapper.addEventListener("pointerdown", (e) => e.preventDefault());
        wrapper.addEventListener("keydown", (e) => {
          if (e.key === "Escape") {
            list.hidden = true;
            button.setAttribute("aria-expanded", "false");
            button.focus();
          }
          if (["ArrowDown", "ArrowUp"].includes(e.key)) {
            e.preventDefault();
            const opts = Array.from(
              list.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"),
            );
            const i = opts.indexOf(document.activeElement as HTMLButtonElement);
            list.hidden = false;
            opts[
              (i +
                (e.key === "ArrowDown" ? 1 : opts.length - 1) +
                opts.length) %
                opts.length
            ]?.focus();
          }
        });
        wrapper.addEventListener("focusout", (e) => {
          if (!wrapper!.contains(e.relatedTarget as Node | null)) {
            list.hidden = true;
            button.setAttribute("aria-expanded", "false");
          }
        });
      }
      const signature = JSON.stringify([
        select.value,
        select.disabled,
        Array.from(select.options).map((o) => [o.value, o.text, o.disabled]),
      ]);
      if (wrapper.dataset.signature === signature) return;
      wrapper.dataset.signature = signature;
      const button = wrapper.querySelector<HTMLButtonElement>(
        ".kit-select-trigger",
      )!;
      button.textContent = (select.selectedOptions[0]?.text || "Choose") + " ▾";
      button.disabled = select.disabled;
      button.setAttribute(
        "aria-label",
        `${select.labels?.[0]?.textContent?.trim() || select.getAttribute("aria-label") || "Choose"}: ${select.selectedOptions[0]?.text || ""}`,
      );
      const list = wrapper.querySelector<HTMLElement>(".kit-options")!;
      list.replaceChildren(
        ...Array.from(select.options).map((o) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = o.text;
          b.setAttribute("role", "option");
          b.setAttribute("aria-selected", String(o.selected));
          b.disabled = o.disabled;
          b.onclick = (e) => {
            e.preventDefault();
            select.value = o.value;
            list.hidden = true;
            button.setAttribute("aria-expanded", "false");
            select.dispatchEvent(new Event("change", { bubbles: true }));
            refresh();
            // The change may have redrawn the panel, with a new select.
            (button.isConnected
              ? button
              : document
                  .getElementById(select.id)
                  ?.parentElement?.querySelector<HTMLElement>(
                    ".kit-select-trigger",
                  )
            )?.focus();
          };
          return b;
        }),
      );
    });
    document
      .querySelectorAll<HTMLInputElement>("input[type=checkbox]")
      .forEach((input) => {
        // Consent is a required form choice, so retain the native checkbox,
        // keyboard focus and browser validation instead of a settings switch.
        if (input.closest("#consent-form")) return;
        let b = input.nextElementSibling as HTMLButtonElement | null;
        if (!b?.classList.contains("kit-switch")) {
          b = document.createElement("button");
          b.type = "button";
          b.className = "kit-switch";
          b.setAttribute("role", "switch");
          input.classList.add("kit-native");
          input.tabIndex = -1;
          input.after(b);
          b.onclick = (e) => {
            e.preventDefault();
            input.checked = !input.checked;
            input.dispatchEvent(new Event("change", { bubbles: true }));
            refresh();
          };
        }
        const checked = String(input.checked);
        if (b.getAttribute("aria-checked") !== checked)
          b.setAttribute("aria-checked", checked);
        b.disabled = input.disabled;
        b.setAttribute(
          "aria-label",
          input.labels?.[0]?.textContent?.trim() || "Toggle",
        );
      });
  };
  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      refresh();
    });
  }).observe(document.body, { childList: true, subtree: true });
  document.addEventListener("change", refresh, true);
  refresh();
}
