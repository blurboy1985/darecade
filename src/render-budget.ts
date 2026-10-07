import type { WebGLRenderer } from "three";

/** One rendering budget for every view, in either phone orientation. */
export function renderPixelRatio(
  width: number,
  height: number,
  density: number,
) {
  return Math.min(density, 1.25, Math.sqrt(1_500_000 / (width * height)));
}

export function resizeRenderer(
  renderer: WebGLRenderer,
  width: number,
  height: number,
  updateStyle = true,
) {
  const ratio = renderPixelRatio(width, height, window.devicePixelRatio || 1);
  if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
  renderer.setSize(width, height, updateStyle);
}
