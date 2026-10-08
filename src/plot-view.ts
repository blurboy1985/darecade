import { resizeRenderer } from "./render-budget.ts";
import * as T from "three";

type WaterUniforms = {
  uTime: { value: number };
  uFill: { value: number };
  uReverse: { value: number };
};
type Pipe = {
  root: T.Group;
  shell: T.Mesh<T.TubeGeometry, T.MeshStandardMaterial>;
  channel: T.Mesh<T.TubeGeometry, T.MeshStandardMaterial>;
  water: T.Mesh<T.TubeGeometry, T.ShaderMaterial>;
  uniforms: WaterUniforms;
  droplets: T.Mesh<T.SphereGeometry, T.MeshBasicMaterial>[];
  mask: number;
  wet: boolean;
  reverse: boolean;
  fillAt: number;
};
type Shape = {
  curve: T.CurvePath<T.Vector3>;
  first: number;
  shell: T.TubeGeometry;
  channel: T.TubeGeometry;
  water: T.TubeGeometry;
};
export type PlotView = {
  update(
    tiles: readonly number[],
    wet: readonly number[],
    complete: boolean,
    crop: string,
  ): void;
  dispose(): void;
};
const ports = [
  { bit: 1, x: 0, y: 0.5 },
  { bit: 2, x: 0.5, y: 0 },
  { bit: 4, x: 0, y: -0.5 },
  { bit: 8, x: -0.5, y: 0 },
];
/** Unit-cell pipe centreline. Invalid connector masks have no visual geometry. */
export function createPlotPipeCurve(mask: number) {
  if (![3, 5, 6, 9, 10, 12].includes(mask)) return null;
  const [a, b] = ports.filter((port) => mask & port.bit);
  if (!a || !b) return null;
  const start = new T.Vector3(a.x, a.y, 0);
  const end = new T.Vector3(b.x, b.y, 0);
  const curve = new T.CurvePath<T.Vector3>();
  if (a.x === -b.x && a.y === -b.y) {
    curve.add(new T.LineCurve3(start, end));
  } else {
    const entry = start.clone().multiplyScalar(0.6);
    const exit = end.clone().multiplyScalar(0.6);
    curve.add(new T.LineCurve3(start, entry));
    curve.add(new T.QuadraticBezierCurve3(entry, new T.Vector3(), exit));
    curve.add(new T.LineCurve3(exit, end));
  }
  return { curve, first: a.bit };
}

const waterVertex = `
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const waterFragment = `
  uniform float uTime;
  uniform float uFill;
  uniform float uReverse;
  varying vec2 vUv;
  varying vec3 vNormal;
  void main() {
    float along = mix(vUv.x, 1.0 - vUv.x, uReverse);
    if (along > uFill) discard;
    float wave = pow(max(0.0, sin(along * 28.0 - uTime * 5.5)), 8.0);
    float light = 0.66 + 0.34 * max(0.0, vNormal.z);
    vec3 colour = mix(vec3(0.035, 0.49, 0.71), vec3(0.50, 0.94, 1.0), wave * 0.6);
    gl_FragColor = vec4(colour * light, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** A decorative layer. The HTML grid owns every control and accessible label. */
export function createPlotView(
  host: HTMLElement,
  options: { reduced: boolean },
): PlotView | null {
  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>();
  const scene = new T.Scene();
  // Each HTML cell occupies exactly one unit. No perspective or outer margin.
  const camera = new T.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.1, 20);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);
  let renderer: T.WebGLRenderer | null = null;
  let observer: ResizeObserver | null = null;
  let raf = 0;
  let disposed = false;
  let complete = false;
  let growth = 0;
  let previousTime = 0;
  const pipes: Pipe[] = [];
  const shapes = new Map<number, Shape>();
  const plants = new Map<string, T.Group>();
  const cropRoot = new T.Group();
  const sparkles: T.Mesh<T.SphereGeometry, T.MeshBasicMaterial>[] = [];
  const geo = <G extends T.BufferGeometry>(geometry: G): G => {
    geometries.add(geometry);
    return geometry;
  };
  const mat = <M extends T.Material>(material: M): M => {
    materials.add(material);
    return material;
  };
  const clay = mat(
    new T.MeshStandardMaterial({ color: "#bd8451", roughness: 0.68 }),
  );
  const inside = mat(
    new T.MeshStandardMaterial({ color: "#664630", roughness: 0.95 }),
  );
  const soil = mat(
    new T.MeshStandardMaterial({ color: "#a87d52", roughness: 1 }),
  );
  const damp = mat(
    new T.MeshStandardMaterial({ color: "#80623f", roughness: 1 }),
  );
  const soilBeds: T.Mesh<T.BoxGeometry, T.MeshStandardMaterial>[] = [];

  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(raf);
    observer?.disconnect();
    document.removeEventListener("visibilitychange", visibility);
    host.classList.remove("plot-3d-ready");
    if (renderer) {
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      renderer.domElement.remove();
      renderer.dispose();
      renderer.forceContextLoss();
    }
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    scene.clear();
  }
  function lost(event: Event) {
    event.preventDefault();
    // Reveal the SVG grid immediately. A new screen can retry WebGL later.
    dispose();
  }
  function render() {
    if (disposed || !renderer) return;
    try {
      renderer.render(scene, camera);
      if (!renderer.getContext().isContextLost())
        host.classList.add("plot-3d-ready");
      else dispose();
    } catch {
      dispose();
    }
  }
  function schedule() {
    if (options.reduced || disposed || raf || document.hidden) return;
    previousTime = performance.now() / 1000;
    raf = requestAnimationFrame(frame);
  }
  function visibility() {
    if (document.hidden) {
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      render();
      schedule();
    }
  }
  function frame(milliseconds: number) {
    raf = 0;
    if (disposed || document.hidden) return;
    const now = milliseconds / 1000;
    const dt = Math.min(0.05, now - previousTime);
    previousTime = now;
    growth = T.MathUtils.damp(growth, complete ? 1 : 0, 4, dt);
    cropRoot.scale.setScalar(0.4 + growth * 0.6);
    cropRoot.rotation.z = complete ? Math.sin(now * 1.8) * 0.035 : 0;
    let moving = complete;
    pipes.forEach((pipe) => {
      pipe.root.rotation.z = T.MathUtils.damp(pipe.root.rotation.z, 0, 22, dt);
      if (Math.abs(pipe.root.rotation.z) < 0.001) pipe.root.rotation.z = 0;
      moving ||= pipe.wet || pipe.root.rotation.z !== 0;
      const fill = Math.min(1, Math.max(0, (now - pipe.fillAt) * 3));
      pipe.uniforms.uFill.value = fill;
      pipe.uniforms.uTime.value = now;
      const shape = shapes.get(pipe.mask);
      pipe.droplets.forEach((drop, index) => {
        const along = (now * 0.58 + index / pipe.droplets.length) % 1;
        drop.visible = pipe.wet && along < fill && !!shape;
        if (drop.visible && shape) {
          drop.position.copy(
            shape.curve.getPoint(pipe.reverse ? 1 - along : along),
          );
          drop.position.z = 0.2;
        }
      });
    });
    sparkles.forEach((sparkle, index) => {
      const phase = (now * 0.43 + index / sparkles.length) % 1;
      sparkle.visible = complete;
      sparkle.position.set(
        1.16 + Math.sin(index * 2.4) * 0.17,
        -1.3 + phase * 0.62,
        0.3,
      );
      sparkle.scale.setScalar(Math.sin(phase * Math.PI) * 0.7);
    });
    render();
    if (!disposed && moving) raf = requestAnimationFrame(frame);
  }

  try {
    renderer = new T.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "low-power",
    });
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.setClearColor("#715337");
    const canvas = renderer.domElement;
    canvas.setAttribute("aria-hidden", "true");
    canvas.tabIndex = -1;
    canvas.style.cssText =
      "display:block;width:100%;height:100%;pointer-events:none";
    canvas.addEventListener("webglcontextlost", lost);
    host.append(canvas);
    scene.add(new T.HemisphereLight("#fff8df", "#715137", 2.6));
    const sun = new T.DirectionalLight("#fff1c9", 2.5);
    sun.position.set(-3, 5, 7);
    scene.add(sun);

    const bed = geo(new T.BoxGeometry(0.965, 0.965, 0.06));
    const pebbleGeometry = geo(new T.SphereGeometry(1, 6, 4));
    const pebbleMaterial = mat(
      new T.MeshStandardMaterial({ color: "#cfad78", roughness: 1 }),
    );
    const dropGeometry = geo(new T.SphereGeometry(0.022, 6, 4));
    const dropMaterial = mat(new T.MeshBasicMaterial({ color: "#c5ffff" }));
    for (const mask of [3, 5, 6, 9, 10, 12]) {
      const shape = createPlotPipeCurve(mask);
      if (!shape) continue;
      const { curve, first } = shape;
      shapes.set(mask, {
        curve,
        first,
        shell: geo(new T.TubeGeometry(curve, 24, 0.157, 8, false)),
        channel: geo(new T.TubeGeometry(curve, 24, 0.109, 8, false)),
        water: geo(new T.TubeGeometry(curve, 24, 0.08, 8, false)),
      });
    }
    const initial = shapes.get(3);
    if (!initial) throw new Error("Missing pipe geometry");
    for (let cell = 0; cell < 9; cell++) {
      const x = (cell % 3) - 1;
      const y = 1 - Math.floor(cell / 3);
      const ground = new T.Mesh(bed, soil);
      ground.position.set(x, y, -0.07);
      soilBeds.push(ground);
      scene.add(ground);
      // Deterministic stones keep every rerender still, including reduced motion.
      for (let stone = 0; stone < 5; stone++) {
        const mesh = new T.Mesh(pebbleGeometry, pebbleMaterial);
        const angle = stone * 2.4 + cell;
        mesh.position.set(
          x + Math.cos(angle) * 0.37,
          y + Math.sin(angle) * 0.37,
          -0.012,
        );
        mesh.scale.set(0.028, 0.018, 0.009);
        mesh.rotation.z = angle;
        scene.add(mesh);
      }
      const root = new T.Group();
      root.position.set(x, y, 0);
      scene.add(root);
      const shell = new T.Mesh(initial.shell, clay);
      const channel = new T.Mesh(initial.channel, inside);
      channel.position.z = 0.068;
      const uniforms: WaterUniforms = {
        uTime: { value: 0 },
        uFill: { value: 1 },
        uReverse: { value: 0 },
      };
      const water = new T.Mesh(
        initial.water,
        mat(
          new T.ShaderMaterial({
            uniforms,
            vertexShader: waterVertex,
            fragmentShader: waterFragment,
          }),
        ),
      );
      water.position.z = 0.113;
      water.visible = false;
      root.add(shell, channel, water);
      const droplets = Array.from({ length: 3 }, () => {
        const drop = new T.Mesh(dropGeometry, dropMaterial);
        drop.visible = false;
        root.add(drop);
        return drop;
      });
      pipes.push({
        root,
        shell,
        channel,
        water,
        uniforms,
        droplets,
        mask: 3,
        wet: false,
        reverse: false,
        fillAt: 0,
      });
    }

    const green = mat(
      new T.MeshStandardMaterial({ color: "#548f3a", roughness: 0.8 }),
    );
    const brightGreen = mat(
      new T.MeshStandardMaterial({ color: "#95c956", roughness: 0.7 }),
    );
    const red = mat(
      new T.MeshStandardMaterial({ color: "#ec5333", roughness: 0.5 }),
    );
    const gold = mat(
      new T.MeshStandardMaterial({ color: "#ffcc37", roughness: 0.7 }),
    );
    const seed = mat(
      new T.MeshStandardMaterial({ color: "#65432c", roughness: 0.9 }),
    );
    const leafGeometry = geo(new T.SphereGeometry(1, 10, 6));
    const stemGeometry = geo(new T.CylinderGeometry(0.013, 0.018, 0.25, 6));
    const leaf = (
      parent: T.Group,
      material: T.MeshStandardMaterial,
      x: number,
      y: number,
      width: number,
      height: number,
      angle: number,
    ) => {
      const mesh = new T.Mesh(leafGeometry, material);
      mesh.position.set(x, y, 0.04);
      mesh.scale.set(width, height, 0.022);
      mesh.rotation.z = angle;
      parent.add(mesh);
    };
    for (const crop of ["chilli", "pandan", "sunflower"]) {
      const plant = new T.Group();
      const stem = new T.Mesh(stemGeometry, green);
      stem.position.y = 0.12;
      plant.add(stem);
      if (crop === "pandan") {
        for (let i = -2; i <= 2; i++)
          leaf(
            plant,
            i % 2 ? green : brightGreen,
            i * 0.025,
            0.14,
            0.025,
            0.2 - Math.abs(i) * 0.025,
            -i * 0.28,
          );
      } else {
        leaf(plant, green, -0.075, 0.11, 0.09, 0.033, 0.4);
        leaf(plant, brightGreen, 0.07, 0.17, 0.08, 0.03, -0.4);
        if (crop === "chilli") {
          leaf(plant, red, -0.062, 0.21, 0.026, 0.065, -0.4);
          leaf(plant, red, 0.071, 0.2, 0.024, 0.06, 0.6);
        } else {
          for (let i = 0; i < 9; i++) {
            const angle = (i * Math.PI * 2) / 9;
            leaf(
              plant,
              gold,
              Math.cos(angle) * 0.065,
              0.29 + Math.sin(angle) * 0.065,
              0.048,
              0.025,
              angle,
            );
          }
          leaf(plant, seed, 0, 0.29, 0.048, 0.048, 0);
        }
      }
      plant.visible = crop === "sunflower";
      plants.set(crop, plant);
      cropRoot.add(plant);
    }
    cropRoot.position.set(1.25, -1.39, 0.24);
    cropRoot.scale.setScalar(0.4);
    scene.add(cropRoot);
    for (let i = 0; i < 7; i++) {
      const sparkle = new T.Mesh(
        dropGeometry,
        mat(new T.MeshBasicMaterial({ color: i % 2 ? "#fff2ad" : "#b4f5e5" })),
      );
      sparkle.visible = false;
      scene.add(sparkle);
      sparkles.push(sparkle);
    }
    const resize = () => {
      if (disposed || !renderer) return;
      const width = host.clientWidth;
      const height = host.clientHeight;
      if (!width || !height) return;
      resizeRenderer(renderer, width, height, false);
      render();
    };
    observer = new ResizeObserver(resize);
    observer.observe(host);
    document.addEventListener("visibilitychange", visibility);
    resize();
    if (disposed) return null;
    return {
      update(tiles, wet, done, crop) {
        if (disposed) return;
        if (tiles.length !== 9 || tiles.some((mask) => !shapes.has(mask))) {
          dispose();
          return;
        }
        const now = performance.now() / 1000;
        const wasComplete = complete;
        complete = done;
        plants.forEach((plant, id) => {
          plant.visible = id === (plants.has(crop) ? crop : "sunflower");
        });
        pipes.forEach((pipe, cell) => {
          const mask = tiles[cell];
          const shape = shapes.get(mask);
          if (!shape) return;
          if (pipe.mask !== mask) {
            if (
              !options.reduced &&
              mask === (((pipe.mask << 1) & 15) | (pipe.mask >> 3))
            )
              pipe.root.rotation.z += Math.PI / 2;
            else pipe.root.rotation.z = 0;
            pipe.shell.geometry = shape.shell;
            pipe.channel.geometry = shape.channel;
            pipe.water.geometry = shape.water;
            pipe.mask = mask;
          }
          const order = wet.indexOf(cell);
          const isWet = order >= 0;
          if (isWet && !pipe.wet) pipe.fillAt = now + order * 0.075;
          pipe.wet = isWet;
          pipe.water.visible = isWet;
          const previous = wet[order - 1];
          const entrance =
            order === 0
              ? 8
              : previous === cell - 3
                ? 1
                : previous === cell + 1
                  ? 2
                  : previous === cell + 3
                    ? 4
                    : 8;
          pipe.reverse = shape.first !== entrance;
          pipe.uniforms.uReverse.value = Number(pipe.reverse);
          pipe.uniforms.uFill.value = options.reduced
            ? 1
            : Math.min(1, Math.max(0, (now - pipe.fillAt) * 3));
          const ground = soilBeds[cell];
          ground.material = isWet ? damp : soil;
          if (options.reduced)
            pipe.droplets.forEach((drop) => {
              drop.visible = false;
            });
        });
        if (options.reduced) {
          growth = complete ? 1 : 0;
          cropRoot.scale.setScalar(0.4 + growth * 0.6);
        } else if (!complete && wasComplete) {
          growth = 0;
          cropRoot.scale.setScalar(0.4);
          sparkles.forEach((sparkle) => {
            sparkle.visible = false;
          });
        }
        render();
        schedule();
      },
      dispose,
    };
  } catch {
    dispose();
    return null;
  }
}
