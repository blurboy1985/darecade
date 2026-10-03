import * as T from "three";

/** One short, lightweight burst. Owns and releases all of its GPU resources. */
export function celebrate(host: HTMLElement) {
  const renderer = new T.WebGLRenderer({ alpha: true, antialias: false });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  host.append(renderer.domElement);
  const scene = new T.Scene();
  const camera = new T.PerspectiveCamera(45, 1, 0.1, 30);
  camera.position.z = 8;
  const shape = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 + Math.PI / 2,
      r = i % 2 ? 0.045 : 0.11;
    if (!i) shape.moveTo(Math.cos(angle) * r, Math.sin(angle) * r);
    else shape.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
  }
  shape.closePath();
  const geometry = new T.ExtrudeGeometry(shape, {
    depth: 0.025,
    bevelEnabled: false,
  });
  const material = new T.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
  });
  const particles = new T.InstancedMesh(geometry, material, 88);
  const palette = ["#f8c653", "#bba0ff", "#a9db6e", "#ff9baf", "#6ad4dc"];
  const velocities = Array.from({ length: 88 }, (_, i) => {
    particles.setColorAt(i, new T.Color(palette[i % palette.length]));
    const angle = i * 2.39996;
    return new T.Vector3(
      Math.cos(angle) * (1 + Math.random() * 2.3),
      1.7 + Math.random() * 2.5,
      Math.sin(angle) * 0.8,
    );
  });
  scene.add(particles);
  const dummy = new T.Object3D();
  const resize = () => {
    const w = Math.max(1, host.clientWidth),
      h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  let frame = 0,
    disposed = false;
  const start = performance.now();
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    observer.disconnect();
    particles.dispose();
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
  const loop = (now: number) => {
    const t = (now - start) / 1000;
    if (t > 3.8) {
      dispose();
      return;
    }
    material.opacity = Math.min(1, (3.8 - t) / 1.2);
    velocities.forEach((v, i) => {
      dummy.position.set(v.x * t, -0.6 + v.y * t - 1.7 * t * t, v.z * t);
      dummy.rotation.set(t * (i % 3), t * 2 + i, t * 3);
      dummy.scale.setScalar(0.7 + (i % 4) * 0.18);
      dummy.updateMatrix();
      particles.setMatrixAt(i, dummy.matrix);
    });
    particles.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);
  return dispose;
}
