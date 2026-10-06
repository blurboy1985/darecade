import * as T from "three";

/** A bounded token reveal. Text remains usable when WebGL is unavailable. */
export function tokenReveal(host: HTMLElement) {
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  host.append(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(40, 1, 0.1, 20);
  camera.position.z = 5;
  const coin = new T.Group();
  const bodyGeometry = new T.CylinderGeometry(0.8, 0.8, 0.16, 48);
  const gold = new T.MeshStandardMaterial({
    color: "#ffc857",
    metalness: 0.6,
    roughness: 0.25,
  });
  const disc = new T.Mesh(bodyGeometry, gold);
  disc.rotation.x = Math.PI / 2;
  coin.add(disc);
  const ringGeometry = new T.TorusGeometry(0.65, 0.025, 8, 48);
  const shine = new T.MeshBasicMaterial({ color: "#fff1b8" });
  const ring = new T.Mesh(ringGeometry, shine);
  ring.position.z = 0.09;
  coin.add(ring);
  const starShape = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? 0.18 : 0.39;
    if (i === 0)
      starShape.moveTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
    else starShape.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  starShape.closePath();
  const starGeometry = new T.ShapeGeometry(starShape);
  const star = new T.Mesh(starGeometry, shine);
  star.position.z = 0.1;
  coin.add(star);
  scene.add(coin, new T.HemisphereLight("#fff9dd", "#7050a5", 3));
  const light = new T.DirectionalLight("#ffffff", 5);
  light.position.set(-2, 3, 4);
  scene.add(light);
  const resize = () => {
    renderer.setSize(
      Math.max(1, host.clientWidth),
      Math.max(1, host.clientHeight),
    );
    camera.aspect =
      Math.max(1, host.clientWidth) / Math.max(1, host.clientHeight);
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  let frame = 0;
  let disposed = false;
  const start = performance.now();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    bodyGeometry.dispose();
    ringGeometry.dispose();
    starGeometry.dispose();
    gold.dispose();
    shine.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  renderer.domElement.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    dispose();
  });
  const render = (now: number) => {
    const seconds = (now - start) / 1000;
    if (seconds > 3.2 || document.hidden || !host.isConnected) return dispose();
    coin.rotation.y =
      Math.sin(Math.min(1, seconds / 1.4) * Math.PI) * Math.PI * 2;
    coin.rotation.z = Math.sin(seconds * 2) * 0.08;
    coin.position.y = Math.sin(seconds * 2.4) * 0.08;
    coin.scale.setScalar(Math.min(1, 0.5 + seconds * 2));
    try {
      renderer.render(scene, camera);
    } catch {
      dispose();
      return;
    }
    frame = requestAnimationFrame(render);
  };
  frame = requestAnimationFrame(render);
  return dispose;
}

export function showStyleReward(
  tokens: number,
  reduced: boolean,
  viewLooks: () => void,
) {
  const previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  const panel = document.createElement("aside");
  panel.className = "style-reward";
  panel.setAttribute("popover", "manual");
  panel.setAttribute("role", "status");
  panel.setAttribute("aria-live", "polite");
  panel.innerHTML = `<div class="token-reveal" aria-hidden="true"><span>★</span></div><div><small>LEVEL UP</small><h2>Nice! +${tokens} Style token${tokens === 1 ? "" : "s"}</h2><p>Style tokens buy outfits and looks.</p><button class="primary">See looks</button><button class="text-button" aria-label="Dismiss Style token reward">Keep playing</button></div>`;
  // A modal dialog makes its siblings inert, including visible popovers.
  // Keep the reward inside the active dialog so both buttons remain usable.
  const activeDialog = document.activeElement?.closest("dialog[open]");
  const lastDialog = Array.from(document.querySelectorAll("dialog[open]")).at(
    -1,
  );
  const parent = activeDialog || lastDialog || document.body;
  const inGame = parent.classList.contains("game-modal");
  if (inGame) {
    panel.removeAttribute("popover");
    panel.classList.add("result-reward");
    parent.insertBefore(panel, parent.querySelector("#modal-body"));
  } else parent.append(panel);
  if (!inGame && typeof panel.showPopover === "function") {
    panel.showPopover();
  }
  let disposeAnimation: (() => void) | undefined;
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  if (!reduced && !motion.matches) {
    try {
      disposeAnimation = tokenReveal(
        panel.querySelector<HTMLElement>(".token-reveal")!,
      );
    } catch {
      panel.classList.add("static-reward");
    }
  }
  const stopMotion = () => disposeAnimation?.();
  motion.addEventListener("change", stopMotion);
  const dismiss = () => {
    clearTimeout(timer);
    disposeAnimation?.();
    motion.removeEventListener("change", stopMotion);
    document.removeEventListener("visibilitychange", onVisibility);
    parent.removeEventListener("close", dismiss);
    if (panel.contains(document.activeElement))
      previousFocus?.focus({ preventScroll: true });
    panel.remove();
  };
  const onVisibility = () => {
    if (document.hidden) dismiss();
  };
  const timer = window.setTimeout(dismiss, 6500);
  document.addEventListener("visibilitychange", onVisibility);
  parent.addEventListener("close", dismiss);
  panel.querySelector(".primary")!.addEventListener("click", () => {
    dismiss();
    viewLooks();
  });
  panel.querySelector(".text-button")!.addEventListener("click", dismiss);
  return dismiss;
}
