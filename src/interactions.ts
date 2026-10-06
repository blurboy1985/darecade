import { gameIds, games } from "./catalog.ts";
import * as T from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

export type InteractionKind =
  | "dragon"
  | "swing"
  | "bench"
  | "pet"
  | "bell"
  | "arcade";
export type InteractionSpec = {
  id: string;
  kind: InteractionKind;
  title: string;
  anchor: [number, number, number];
  yaw: number;
  approach: [number, number];
  exit: [number, number];
  view: number;
  distance: number;
  game?: string;
};
const bench = (
  index: number,
  x: number,
  z: number,
  yaw = 0,
): InteractionSpec => {
  const approach: [number, number] = [
    x + Math.sin(yaw) * 1.8,
    z + Math.cos(yaw) * 1.8,
  ];
  return {
    id: `bench${index}`,
    kind: "bench",
    title: "Sit & read a little",
    anchor: [x, 0, z],
    yaw,
    approach,
    exit: approach,
    view: index === 3 ? -0.6 : yaw + 0.8,
    distance: index === 3 ? 4.7 : 5.5,
  };
};
export const interactionSpecs: InteractionSpec[] = [
  {
    id: "dragon",
    kind: "dragon",
    title: "Dragon Rooftop · ride, flip, pose",
    anchor: [11, 0, 10],
    yaw: 0,
    approach: [14.5, 7.35],
    exit: [14.5, 11.7],
    view: 1.05,
    distance: 8,
  },
  {
    id: "swing",
    kind: "swing",
    title: "Take a turn on the swing",
    anchor: [-2, 0, 10],
    yaw: 0,
    approach: [-2, 11.9],
    exit: [-2, 11.9],
    view: 0.95,
    distance: 7,
  },
  {
    id: "pet",
    kind: "pet",
    title: "Give Kopi a head scratch",
    anchor: [-9, 0, 6],
    yaw: 0,
    approach: [-7.6, 6.8],
    exit: [-7.6, 6.8],
    view: -1,
    distance: 5,
  },
  {
    id: "bell",
    kind: "bell",
    title: "Ring the bicycle bell",
    anchor: [-16.9, 0, -7],
    yaw: 0,
    approach: [-16.1, -5.5],
    exit: [-16.1, -5.5],
    view: -1.25,
    distance: 5,
  },
  bench(0, -13, 6),
  bench(1, -13, 10, Math.PI),
  bench(2, 8, -1, 0.1),
  bench(3, -6, 9, -0.6),
  ...gameIds.map(
    (game, index): InteractionSpec => ({
      id: `cabinet-${game}`,
      kind: "arcade",
      title: `Try ${games[game].name}`,
      anchor: [-12.2 + index * 3.6, 0, -8.8],
      yaw: 0,
      approach: [-12.2 + index * 3.6, -6.3],
      exit: [-12.2 + index * 3.6, -6.3],
      view: 1.1,
      distance: 5.5,
      game,
    }),
  ),
];
export type AnimatedPlayer = {
  root: T.Group;
  left: T.Group;
  right: T.Group;
  legs: T.Group[];
};
type Stage = {
  scene: T.Group;
  mixer: T.AnimationMixer;
  clip: T.AnimationClip;
  rig: T.Object3D;
  parts: T.Object3D[];
  spec: InteractionSpec;
};

/** Original Blender clips drive both scenery and the existing player's transform rig. */
export class InteractionScenes {
  readonly stages = new Map<string, Stage>();
  readonly failures = new Set<string>();
  readonly ready: Promise<void>;
  active: Stage | null = null;
  elapsed = 0;
  private disposed = false;
  constructor(parent: T.Group, register: (scene: T.Group, id: string) => void) {
    const loader = new GLTFLoader();
    const assets = new Map<InteractionKind, Promise<GLTF>>();
    for (const spec of interactionSpecs)
      if (!assets.has(spec.kind))
        assets.set(
          spec.kind,
          loader.loadAsync(`/models/interactions/${spec.kind}.glb`),
        );
    this.ready = Promise.all(
      interactionSpecs.map(async (spec) => {
        try {
          const gltf = await assets.get(spec.kind)!;
          if (this.disposed) return;
          const scene = gltf.scene.clone(true);
          scene.position.set(...spec.anchor);
          scene.rotation.y = spec.yaw;
          scene.userData.id = `action:${spec.id}`;
          scene.traverse((o) => {
            if (o.userData.preview_avatar) o.visible = false;
            if (o instanceof T.Mesh) {
              o.castShadow = true;
              o.receiveShadow = true;
            }
          });
          const rig = scene.getObjectByName("PlayerRig");
          const parts = ["LeftArm", "RightArm", "LeftLeg", "RightLeg"].map(
            (n) => scene.getObjectByName(n),
          );
          if (!rig || parts.some((p) => !p) || !gltf.animations.length)
            throw new Error("Incomplete interaction rig");
          // Blender exports per-object clips; merge their original tracks onto one shared clock.
          const clip = new T.AnimationClip(
            "Interact",
            Math.max(...gltf.animations.map((a) => a.duration)),
            gltf.animations.flatMap((a) => a.tracks.map((t) => t.clone())),
          );
          const mixer = new T.AnimationMixer(scene);
          const stage = {
            scene,
            mixer,
            clip,
            rig,
            parts: parts as T.Object3D[],
            spec,
          };
          parent.add(scene);
          this.stages.set(spec.id, stage);
          register(scene, spec.id);
          this.reset(stage);
        } catch {
          this.failures.add(spec.id);
        }
      }),
    ).then(() => {});
  }
  private reset(stage: Stage) {
    stage.mixer.stopAllAction();
    const a = stage.mixer.clipAction(stage.clip);
    a.reset().setLoop(T.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.play();
    stage.mixer.setTime(0);
    a.paused = true;
  }
  start(id: string) {
    const stage = this.stages.get(id);
    if (!stage) return false;
    this.stop();
    this.active = stage;
    this.elapsed = 0;
    const a = stage.mixer.clipAction(stage.clip);
    a.reset().setLoop(T.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.play();
    return true;
  }
  sample(dt: number, player: AnimatedPlayer) {
    const stage = this.active;
    if (!stage) return false;
    this.elapsed = Math.min(stage.clip.duration, this.elapsed + dt);
    stage.mixer.update(dt);
    stage.scene.updateMatrixWorld(true);
    stage.rig.getWorldPosition(player.root.position);
    stage.rig.getWorldQuaternion(player.root.quaternion);
    for (const [index, limb] of [
      player.left,
      player.right,
      ...player.legs,
    ].entries())
      limb.quaternion.copy(stage.parts[index].quaternion);
    return this.elapsed >= stage.clip.duration;
  }
  stop() {
    if (this.active) this.reset(this.active);
    this.active = null;
    this.elapsed = 0;
  }
  dispose() {
    this.disposed = true;
    this.stop();
    for (const s of this.stages.values()) {
      s.mixer.stopAllAction();
      s.mixer.uncacheRoot(s.scene);
      s.scene.removeFromParent();
    }
  }
}
