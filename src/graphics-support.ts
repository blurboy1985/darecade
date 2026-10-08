/** Probe before onboarding or joining a world. Failure does not change a save. */
export function supports3D() {
  try {
    const context = document.createElement("canvas").getContext("webgl2");
    if (!context) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

export function mountGraphicsMessage(host: HTMLElement, contextLost: boolean) {
  host.hidden = false;
  host.innerHTML = `<section class="graphics-message" role="alert" aria-labelledby="graphics-title" tabindex="-1"><span class="eyebrow">PLAY SIMI</span><h1 id="graphics-title">Play Simi requires 3D graphics</h1><p>${contextLost ? "The graphics connection was interrupted." : "The 3D neighbourhood could not start in this browser."} Your saved progress is kept.</p><p>Try an up-to-date browser with WebGL 2 support. Check that hardware acceleration is enabled, then retry. Closing other graphics-heavy tabs may help.</p><button class="primary" id="retry-graphics">Retry</button></section>`;
  host
    .querySelector("button")!
    .addEventListener("click", () => location.reload(), { once: true });
  host.querySelector<HTMLElement>("section")!.focus();
}
