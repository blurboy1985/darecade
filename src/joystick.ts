export const joystickMarkup = (label = "Move") => `<div class="touch-stick" data-joystick role="group" aria-label="${label} joystick"><span></span></div>`;
export function bindJoystick(element: HTMLElement, move: (x: number, y: number) => void) {
  const abort = new AbortController();
  const options = { signal: abort.signal };
  let pointer: number | null = null;
  const knob = element.querySelector<HTMLElement>("span")!;
  const reset = () => { pointer = null; knob.style.transform = ""; move(0, 0); };
  const update = (event: PointerEvent) => {
    const r = element.getBoundingClientRect(), radius = r.width * 0.35;
    const dx = event.clientX - r.left - r.width / 2, dy = event.clientY - r.top - r.height / 2;
    const scale = Math.max(radius, Math.hypot(dx, dy));
    const x = dx / scale, y = dy / scale;
    knob.style.transform = `translate(${x * radius}px,${y * radius}px)`;
    move(Math.abs(x) < 0.12 ? 0 : x, Math.abs(y) < 0.12 ? 0 : y);
  };
  element.addEventListener("pointerdown", e => {
    if (pointer !== null) return;
    e.preventDefault(); pointer = e.pointerId; element.setPointerCapture(pointer); update(e);
  }, options);
  element.addEventListener("pointermove", e => { if (e.pointerId === pointer) update(e); }, options);
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"] as const) element.addEventListener(name, e => { if (e.pointerId === pointer) reset(); }, options);
  window.addEventListener("blur", reset, options);
  return { reset, dispose() { reset(); abort.abort(); } };
}
