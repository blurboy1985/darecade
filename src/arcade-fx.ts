import * as T from "three";
import type { GameId } from "./state";

/**
 * Animated Three.js backdrop for an arcade round: a scrolling neon floor, a
 * striped horizon sun, floating low-poly shapes and drifting stars, plus
 * particle bursts for game events. Purely cosmetic: it never reads or changes
 * the simulation, so replay validation is unaffected.
 */
export type FxEvent =
  | "start"
  | "score"
  | "big"
  | "hurt"
  | "boss"
  | "power"
  | "end";

export interface ArcadeFx {
  fire(event: FxEvent, amount?: number): void;
  /** 0 = calm, 1 = final seconds. Speeds up the floor and shapes. */
  setUrgency(value: number): void;
  setPaused(paused: boolean): void;
  dispose(): void;
}

// Every game must provide a palette when it joins the catalogue.
const themes: Record<
  GameId,
  {
    sky: string;
    fog: string;
    grid: string;
    sunTop: string;
    sunBottom: string;
    shapes: string[];
  }
> = {
  hoops: {
    sky: "#f3dfcd",
    fog: "#dfc1af",
    grid: "#ffa45c",
    sunTop: "#ffe08a",
    sunBottom: "#ff7a4d",
    shapes: ["#ffa45c", "#ffe08a", "#7fd6c2", "#f58fb0"],
  },
  fishing: {
    sky: "#d8eeed",
    fog: "#b5d7d3",
    grid: "#7fe3e0",
    sunTop: "#d8fff1",
    sunBottom: "#59c8d8",
    shapes: ["#7fe3e0", "#d8fff1", "#ffd67a", "#8fd18f"],
  },
  coast: {
    sky: "#e2f1ed",
    fog: "#c5ded8",
    grid: "#69e5db",
    sunTop: "#ffe8a1",
    sunBottom: "#ff927b",
    shapes: ["#69e5db", "#ffe8a1", "#ff927b", "#a9db6e"],
  },
  noodle: {
    sky: "#e5edce",
    fog: "#c9d8af",
    grid: "#b9f36b",
    sunTop: "#ffe27a",
    sunBottom: "#ff8f6b",
    shapes: ["#b9f36b", "#ffd36b", "#ff9f7a", "#7ee0b5"],
  },
  brick: {
    sky: "#e8def2",
    fog: "#cfc0dd",
    grid: "#c9a8ff",
    sunTop: "#ffd0f0",
    sunBottom: "#ff6fa8",
    shapes: ["#c9a8ff", "#ff9baf", "#ffd36b", "#8fe3ff"],
  },
  hop: {
    sky: "#f7e4d0",
    fog: "#e5c8b6",
    grid: "#ffb86b",
    sunTop: "#fff07a",
    sunBottom: "#ff7a59",
    shapes: ["#ffb86b", "#ffe27a", "#9be38b", "#ff8fa3"],
  },
  swarm: {
    sky: "#d9f1ed",
    fog: "#b8d9cb",
    grid: "#9cbbba",
    sunTop: "#fff6b5",
    sunBottom: "#ffce8d",
    shapes: ["#83bbac", "#d8baeb", "#ffe49c", "#eabbaa"],
  },
};

const NOOP: ArcadeFx = {
  fire() {},
  setUrgency() {},
  setPaused() {},
  dispose() {},
};

export function createArcadeFx(host: HTMLElement, id: GameId): ArcadeFx {
  let renderer: T.WebGLRenderer;
  try {
    renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
  } catch {
    return NOOP; // CSS gradient backdrop stays visible.
  }
  const theme = themes[id];
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(theme.sky);
  renderer.domElement.className = "arcade-fx-canvas";
  host.append(renderer.domElement);

  const scene = new T.Scene();
  scene.fog = new T.Fog(theme.fog, 12, 46);
  const camera = new T.PerspectiveCamera(60, 1, 0.1, 120);
  camera.position.set(0, 2.4, 9);
  camera.lookAt(0, 1.6, 0);

  const disposables: { dispose(): void }[] = [];
  const track = <D extends { dispose(): void }>(d: D) => (
    disposables.push(d),
    d
  );

  // Neon floor: a shader grid that scrolls toward the camera.
  const floorMat = track(
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new T.Color(theme.grid) },
        uFlash: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; varying float vDepth;
        void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uFlash; varying vec2 vUv; varying float vDepth;
        void main(){
          vec2 g = vec2(vUv.x * 40.0, vUv.y * 60.0 + uTime);
          vec2 d = abs(fract(g - 0.5) - 0.5) / fwidth(g);
          float line = 1.0 - min(min(d.x, d.y), 1.0);
          float fade = smoothstep(48.0, 6.0, vDepth);
          vec3 col = mix(uColor, vec3(1.0), uFlash * 0.6);
          gl_FragColor = vec4(col, (line * 0.9 + 0.06) * fade);
        }`,
    }),
  );
  const floor = new T.Mesh(track(new T.PlaneGeometry(80, 120)), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -40;
  scene.add(floor);

  // Striped synthwave sun on the horizon.
  const sunMat = track(
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTop: { value: new T.Color(theme.sunTop) },
        uBottom: { value: new T.Color(theme.sunBottom) },
        uTime: { value: 0 },
        uPulse: { value: 0 },
      },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uTop; uniform vec3 uBottom; uniform float uTime; uniform float uPulse; varying vec2 vUv;
        void main(){
          vec2 p = vUv - 0.5; float r = length(p);
          float disc = smoothstep(0.5, 0.48, r);
          float glow = smoothstep(0.75, 0.45, r) * 0.25;
          float y = vUv.y;
          float stripes = step(0.5, fract(y * 14.0 - uTime * 0.4)) + step(0.52, y);
          float cut = y < 0.5 ? clamp(stripes, 0.0, 1.0) : 1.0;
          vec3 col = mix(uBottom, uTop, y) + uPulse * 0.35;
          gl_FragColor = vec4(col, disc * cut + glow * (1.0 - disc));
        }`,
    }),
  );
  const sun = new T.Mesh(track(new T.PlaneGeometry(16, 16)), sunMat);
  sun.position.set(0, 4.5, -44);
  scene.add(sun);

  // Floating low-poly shapes either side of the screen.
  scene.add(new T.HemisphereLight("#ffffff", theme.fog, 1.6));
  const key = new T.DirectionalLight("#ffffff", 1.4);
  key.position.set(3, 6, 5);
  scene.add(key);
  const geos = [
    track(new T.IcosahedronGeometry(0.7, 0)),
    track(new T.OctahedronGeometry(0.75, 0)),
    track(new T.TorusGeometry(0.55, 0.22, 8, 16)),
    track(new T.BoxGeometry(0.9, 0.9, 0.9)),
    track(new T.TetrahedronGeometry(0.8, 0)),
  ];
  const shapeMats = theme.shapes.map((c) =>
    track(
      new T.MeshStandardMaterial({
        color: c,
        emissive: c,
        emissiveIntensity: 0.25,
        flatShading: true,
        roughness: 0.45,
      }),
    ),
  );
  const shapes = Array.from({ length: 14 }, (_, i) => {
    const mesh = new T.Mesh(
      geos[i % geos.length],
      shapeMats[i % shapeMats.length],
    );
    const side = i % 2 ? 1 : -1;
    mesh.position.set(
      side * (4.5 + (i % 4) * 1.6),
      0.8 + ((i * 7) % 5) * 0.9,
      -2 - ((i * 13) % 26),
    );
    mesh.scale.setScalar(0.7 + ((i * 5) % 4) * 0.25);
    mesh.userData = {
      spin: 0.3 + (i % 5) * 0.15,
      bob: i * 1.7,
      base: mesh.position.y,
    };
    scene.add(mesh);
    return mesh;
  });

  // Drifting star field.
  const starCount = 420;
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    starPos[i * 3] = (Math.random() - 0.5) * 70;
    starPos[i * 3 + 1] = Math.random() * 26 + 1;
    starPos[i * 3 + 2] = -Math.random() * 60;
  }
  const starGeo = track(new T.BufferGeometry());
  starGeo.setAttribute("position", new T.BufferAttribute(starPos, 3));
  const starMat = track(
    new T.PointsMaterial({
      color: "#ffffff",
      size: 0.12,
      transparent: true,
      opacity: 0.8,
      fog: false,
    }),
  );
  scene.add(new T.Points(starGeo, starMat));

  // Burst particles: a fixed pool of tiny stars reused for every event.
  const POOL = 240;
  const star = new T.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 + Math.PI / 2,
      r = i % 2 ? 0.07 : 0.17;
    if (!i) star.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else star.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const burstGeo = track(
    new T.ExtrudeGeometry(star, { depth: 0.04, bevelEnabled: false }),
  );
  const burstMat = track(new T.MeshBasicMaterial({ fog: false }));
  const bursts = new T.InstancedMesh(burstGeo, burstMat, POOL);
  bursts.frustumCulled = false;
  track(bursts);
  scene.add(bursts);
  const life = new Float32Array(POOL);
  const vel = Array.from({ length: POOL }, () => new T.Vector3());
  const pos = Array.from({ length: POOL }, () => new T.Vector3());
  const dummy = new T.Object3D();
  const palette = [...theme.shapes, "#ffffff", "#f8c653"].map(
    (c) => new T.Color(c),
  );
  for (let i = 0; i < POOL; i++) {
    bursts.setColorAt(i, palette[i % palette.length]);
    dummy.scale.setScalar(0);
    dummy.updateMatrix();
    bursts.setMatrixAt(i, dummy.matrix);
  }
  let cursor = 0,
    spread = 4;
  const emit = (count: number, power: number, origin?: T.Vector3) => {
    for (let n = 0; n < count; n++) {
      const i = cursor++ % POOL;
      // Default bursts erupt from either side of the cabinet so they stay visible.
      const from =
        origin ??
        new T.Vector3(
          (n % 2 ? 1 : -1) * spread * (0.8 + Math.random() * 0.4),
          1.2,
          3,
        );
      const a = Math.random() * Math.PI * 2,
        up = Math.random() * 0.8 + 0.4;
      pos[i]
        .copy(from)
        .add(
          new T.Vector3(
            (Math.random() - 0.5) * 3,
            (Math.random() - 0.5) * 1.5,
            0,
          ),
        );
      vel[i].set(
        Math.cos(a) * power * (0.5 + Math.random()),
        up * power * 1.6,
        Math.sin(a) * power * 0.4,
      );
      life[i] = 1.2 + Math.random() * 0.8;
    }
  };

  // State.
  let speed = 1,
    urgency = 0,
    flash = 0,
    pulse = 0,
    shake = 0,
    paused = false,
    disposed = false,
    frame = 0,
    last = performance.now(),
    time = 0;

  const resize = () => {
    const w = Math.max(1, host.clientWidth),
      h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w / h < 0.8 ? 72 : 60;
    // Keep side bursts inside the view on narrow phones.
    spread = Math.max(1.3, Math.min(4, (w / h) * 2.4));
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(host);

  const loop = (now: number) => {
    frame = requestAnimationFrame(loop);
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    if (document.hidden) return;
    const pace = paused ? 0.15 : 1;
    time += dt * pace;
    speed += (1 + urgency * 2.2 - speed) * Math.min(1, dt * 2);
    floorMat.uniforms.uTime.value += dt * speed * pace * 1.6;
    sunMat.uniforms.uTime.value = time;
    flash = Math.max(0, flash - dt * 2.5);
    pulse = Math.max(0, pulse - dt * 1.5);
    shake = Math.max(0, shake - dt * 2.8);
    floorMat.uniforms.uFlash.value = flash;
    sunMat.uniforms.uPulse.value =
      pulse + urgency * (0.5 + 0.5 * Math.sin(time * 8)) * 0.4;
    shapes.forEach((m, i) => {
      const u = m.userData as { spin: number; bob: number; base: number };
      m.rotation.x += dt * u.spin * speed * pace;
      m.rotation.y += dt * u.spin * 0.7 * speed * pace;
      m.position.y = u.base + Math.sin(time * 1.3 + u.bob) * 0.35;
      m.position.z += dt * speed * pace * 1.2;
      if (m.position.z > 6) m.position.z = -30 - (i % 3) * 2;
    });
    for (let i = 0; i < POOL; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      vel[i].y -= 6 * dt;
      pos[i].addScaledVector(vel[i], dt);
      dummy.position.copy(pos[i]);
      dummy.rotation.set(time * 2 + i, time * 3, i);
      dummy.scale.setScalar(Math.max(0, Math.min(1, life[i])) * 1.2);
      dummy.updateMatrix();
      bursts.setMatrixAt(i, dummy.matrix);
    }
    bursts.instanceMatrix.needsUpdate = true;
    camera.position.x =
      Math.sin(time * 0.35) * 0.6 + (Math.random() - 0.5) * shake * 0.5;
    camera.position.y = 2.4 + (Math.random() - 0.5) * shake * 0.4;
    camera.lookAt(0, 1.6, 0);
    renderer.render(scene, camera);
  };
  frame = requestAnimationFrame(loop);

  const onLost = (e: Event) => {
    e.preventDefault();
    api.dispose();
  };
  renderer.domElement.addEventListener("webglcontextlost", onLost);

  const api: ArcadeFx = {
    fire(event, amount = 0) {
      if (disposed) return;
      if (event === "score")
        emit(Math.min(26, 8 + Math.round(amount / 10)), 2.2);
      else if (event === "big") {
        emit(48, 3.4);
        pulse = 1;
        flash = 0.6;
      } else if (event === "power") {
        emit(24, 2.6);
        flash = 0.5;
      } else if (event === "hurt") shake = 1;
      else if (event === "boss") {
        pulse = 1.4;
        shake = 0.6;
        flash = 1;
      } else if (event === "start") {
        emit(36, 3);
        flash = 0.8;
      } else if (event === "end") {
        emit(90, 4.2);
        emit(60, 3.2, new T.Vector3(-4, 1.5, 1));
        emit(60, 3.2, new T.Vector3(4, 1.5, 1));
        pulse = 1.2;
        urgency = 0;
      }
    },
    setUrgency(v) {
      urgency = Math.max(0, Math.min(1, v));
    },
    setPaused(p) {
      paused = p;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", onLost);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
  return api;
}
