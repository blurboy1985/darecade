import { resizeRenderer } from "./render-budget.ts";
import * as T from "three";
import {
  animateDetails,
  createAvatar,
  disposeAvatar,
  poseSkin,
  type Avatar,
  type Look,
} from "./character";
import { outfits, skins } from "./state";
import type { StageShow } from "../shared/stage";
import { partyRanking, type PartyPlayer } from "../shared/stage-party";
import {
  STAGE_STYLES,
  comboMove,
  laneMove,
  stagePose,
  type StageMoveId,
  type StagePose,
  type StageStyle,
} from "./stage-moves";

export const LANE_COLOURS = ["#ff8fb8", "#7fe3e0", "#ffe27a", "#b9a4ff"];
type Bit = { mesh: T.Mesh; velocity: T.Vector3; life: number };
/** One avatar on the stage: the player, or another dancer in a party. */
type Dancer = {
  avatar: Avatar;
  key: string;
  ring: T.Mesh;
  x: number;
  z: number;
  move: { id: StageMoveId; at: number } | null;
  hits: number;
  tier: number;
};
/** The party as the view needs it: who is on stage and how they are doing. */
export type StageParty = {
  you: number;
  running: boolean;
  results: boolean;
  players: PartyPlayer[];
};
/** Where each dancer stands, left to right, for one to four on stage. */
const SPOTS = [[0], [-1, 1], [-1.6, 0, 1.6], [-1.8, -0.6, 0.6, 1.8]];

/** The Open Stage in three.js: the avatar dancing, lamps, beams and a crowd. */
export class StageView {
  readonly renderer: T.WebGLRenderer;
  private readonly scene = new T.Scene();
  private readonly camera = new T.PerspectiveCamera(46, 1, 0.1, 80);
  private readonly geometries: T.BufferGeometry[] = [];
  private readonly materials: T.Material[] = [];
  private readonly me: Dancer;
  private readonly others = new Map<number, Dancer>();
  private readonly ringGeometry: T.BufferGeometry;
  private readonly spot: T.Mesh;
  private readonly beams: T.Mesh[] = [];
  private readonly crowd: T.Group[] = [];
  private readonly confetti: Bit[] = [];
  private readonly observer: ResizeObserver;
  private readonly background = new T.Color("#1b1d38");
  private style: StageStyle = "pop";
  /** Moves waiting to be shown off when a style is chosen. */
  private demo: { id: StageMoveId; at: number }[] = [];
  private clock = 0;
  private flash = [0, 0, 0, 0];
  private judged = 0;
  private celebrated = 0;
  private disposed = false;
  private seen: StageShow | null = null;
  private synced: PartyPlayer[] | undefined;
  constructor(
    host: HTMLElement,
    look: Look,
    private readonly reduced: boolean,
  ) {
    this.renderer = new T.WebGLRenderer({ antialias: true });
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.domElement.setAttribute("aria-hidden", "true");
    host.append(this.renderer.domElement);
    this.scene.background = this.background;
    this.scene.fog = new T.Fog("#1b1d38", 9, 24);
    this.scene.add(new T.HemisphereLight("#cfd6ff", "#3a2f55", 1.5));
    const key = new T.DirectionalLight("#fff0d6", 2.4);
    key.position.set(2, 6, 6);
    this.scene.add(key);
    this.camera.position.set(0, 2.1, 6.4);
    this.camera.lookAt(0, 1.25, 0);
    const mesh = (
      geometry: T.BufferGeometry,
      material: T.Material,
      x: number,
      y: number,
      z: number,
      parent: T.Object3D = this.scene,
    ) => {
      const m = new T.Mesh(geometry, material);
      m.position.set(x, y, z);
      parent.add(m);
      return m;
    };
    const geo = <G extends T.BufferGeometry>(g: G) => {
      this.geometries.push(g);
      return g;
    };
    const mat = (color: string, glow = 0, opacity = 1) => {
      const m = new T.MeshStandardMaterial({
        color,
        roughness: 0.7,
        emissive: color,
        emissiveIntensity: glow,
        transparent: opacity < 1,
        opacity,
        depthWrite: opacity >= 1,
      });
      this.materials.push(m);
      return m;
    };
    mesh(
      geo(new T.CylinderGeometry(3.4, 3.6, 0.3, 40)),
      mat("#2f3558"),
      0,
      -0.05,
      0,
    );
    mesh(
      geo(new T.CylinderGeometry(3.1, 3.1, 0.04, 40)),
      mat("#444b7a"),
      0,
      0.12,
      0,
    );
    const ground = mesh(
      geo(new T.PlaneGeometry(60, 60)),
      mat("#15172b"),
      0,
      -0.2,
      0,
    );
    ground.rotation.x = -Math.PI / 2;
    const cube = geo(new T.BoxGeometry(1, 1, 1));
    for (const x of [-3.2, 3.2]) {
      mesh(cube, mat("#3a4250"), x, 2.2, -2.4).scale.set(0.14, 4.4, 0.14);
      mesh(cube, mat("#232833"), x * 0.82, 0.75, -1.9).scale.set(0.8, 1.2, 0.6);
    }
    mesh(cube, mat("#3a4250"), 0, 4.4, -2.4).scale.set(6.6, 0.16, 0.16);
    // One lamp and one beam per lane; a beam lights up when its lane is hit.
    const cone = geo(new T.ConeGeometry(0.9, 4.2, 18, 1, true));
    LANE_COLOURS.forEach((colour, i) => {
      const x = -2.4 + i * 1.6;
      mesh(
        geo(new T.SphereGeometry(0.2, 10, 8)),
        mat(colour, 1.4),
        x,
        4.2,
        -2.4,
      );
      const beam = mesh(cone, mat(colour, 1, 0.12), x * 0.55, 2.1, -1.1);
      (beam.material as T.MeshStandardMaterial).side = T.DoubleSide;
      beam.rotation.z = -x * 0.1;
      this.beams.push(beam);
    });
    // The crowd stands between the camera and the stage and bounces with the hype.
    const head = geo(new T.SphereGeometry(0.24, 8, 6));
    const body = geo(new T.CylinderGeometry(0.2, 0.28, 0.7, 8));
    const dark = mat("#0f1122");
    for (let i = 0; i < 16; i++) {
      const fan = new T.Group();
      fan.position.set(
        -4.2 + (i % 8) * 1.2 + (i > 7 ? 0.6 : 0),
        -0.2,
        i > 7 ? 4.4 : 3.6,
      );
      mesh(body, dark, 0, 0.35, 0, fan);
      mesh(head, dark, 0, 0.9, 0, fan);
      this.scene.add(fan);
      this.crowd.push(fan);
    }
    const scrap = geo(new T.PlaneGeometry(0.12, 0.2));
    for (let i = 0; i < 60; i++) {
      const material = new T.MeshBasicMaterial({
        color: LANE_COLOURS[i % 4],
        side: T.DoubleSide,
        transparent: true,
      });
      this.materials.push(material);
      const m = mesh(scrap, material, 0, 0, 0);
      m.visible = false;
      this.confetti.push({ mesh: m, velocity: new T.Vector3(), life: 0 });
    }
    // A ring under each dancer in a party, and a spotlight for the winner.
    this.ringGeometry = geo(new T.RingGeometry(0.42, 0.52, 28));
    this.spot = mesh(cone, mat("#fff7d7", 1, 0.16), 0, 2.2, 0);
    (this.spot.material as T.MeshStandardMaterial).side = T.DoubleSide;
    this.spot.visible = false;
    this.me = this.dancer(look);
    this.observer = new ResizeObserver(() => {
      const width = host.clientWidth,
        height = host.clientHeight;
      if (!width || !height || this.disposed) return;
      resizeRenderer(this.renderer, width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    });
    this.observer.observe(host);
  }
  private burst() {
    if (this.reduced) return;
    for (const bit of this.confetti) {
      bit.life = 1.2 + Math.random() * 0.8;
      bit.mesh.position.set(
        (Math.random() - 0.5) * 5,
        3.6 + Math.random(),
        -0.5,
      );
      bit.velocity.set(
        (Math.random() - 0.5) * 2,
        Math.random() * 1.5,
        Math.random() * 2,
      );
      bit.mesh.visible = true;
    }
  }
  /** A new avatar, standing centre stage until draw places it. */
  private dancer(look: Look): Dancer {
    const avatar = createAvatar(
      this.scene,
      0,
      0,
      outfits[look.outfit] ?? outfits[0],
      skins[look.skin] ?? skins[0],
      look,
    );
    const material = new T.MeshBasicMaterial({ side: T.DoubleSide });
    const ring = new T.Mesh(this.ringGeometry, material);
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    this.scene.add(ring);
    return {
      avatar,
      key: JSON.stringify(look),
      ring,
      x: 0,
      z: 0,
      move: null,
      hits: 0,
      tier: 0,
    };
  }
  private retire(d: Dancer) {
    disposeAvatar(d.avatar);
    d.ring.removeFromParent();
    (d.ring.material as T.Material).dispose();
  }
  /** Chooses the dance style; with show, runs through its four lane moves. */
  setStyle(style: StageStyle, show = false) {
    this.style = style;
    this.demo = show
      ? [0, 1, 2, 3].map((lane, i) => ({
          id: laneMove(style, lane),
          at: this.clock + 0.15 + i * 0.62,
        }))
      : [];
  }
  /** Other dancers come and go with the party; a changed look is a new avatar. */
  private sync(party: StageParty | null) {
    const guests = party
      ? party.players.filter((p) => p.slot !== party.you)
      : [];
    for (const [slot, d] of this.others)
      if (
        !guests.some((p) => p.slot === slot && JSON.stringify(p.look) === d.key)
      ) {
        this.retire(d);
        this.others.delete(slot);
      }
    for (const p of guests)
      if (!this.others.has(p.slot))
        try {
          this.others.set(p.slot, this.dancer(p.look));
        } catch {
          // A look this build cannot draw leaves that dancer off the stage.
        }
  }
  private pose(
    d: Dancer,
    pose: StagePose,
    scale: number,
    time: number,
    mode: string,
  ) {
    const a = d.avatar;
    a.root.position.set(d.x + pose.x * scale, 0.14 + pose.y * scale, d.z);
    a.root.rotation.set(pose.pitch, pose.yaw, pose.roll);
    a.root.scale.set(scale, scale * (1 + pose.squash), scale);
    // The face, costume and pet first; then every joint, then the skin again.
    animateDetails(a, time, mode, this.reduced);
    a.left.rotation.set(pose.armL, 0, -pose.outL);
    a.right.rotation.set(pose.armR, 0, pose.outR);
    a.elbows[0].rotation.x = -0.12 - pose.elbowL;
    a.elbows[1].rotation.x = -0.12 - pose.elbowR;
    a.legs[0].rotation.set(pose.legL, 0, -pose.splay);
    a.legs[1].rotation.set(pose.legR, 0, pose.splay);
    a.knees[0].rotation.x = 0.04 + pose.kneeL;
    a.knees[1].rotation.x = 0.04 + pose.kneeR;
    a.spine.rotation.set(pose.spine, 0, pose.lean);
    a.head.rotation.set(pose.nod, pose.turn, pose.tilt);
    poseSkin(a, mode, time, this.reduced);
  }
  /** show is null before the first show and between shows. */
  draw(
    show: StageShow | null,
    time: number,
    dt: number,
    party: StageParty | null = null,
  ) {
    if (this.disposed) return;
    this.clock = time;
    const me = this.me;
    if (show !== this.seen) {
      this.seen = show;
      this.judged = this.celebrated = 0;
      me.move = null;
    }
    const playing = !!show && !show.ended;
    const total = show
      ? show.counts.perfect +
        show.counts.great +
        show.counts.good +
        show.counts.miss +
        show.counts.stray
      : 0;
    // Every combo of eight brings confetti down and a move of its own.
    const tier = show ? Math.floor(show.combo / 8) : 0;
    if (show?.last && total !== this.judged) {
      this.judged = total;
      const { judgement, lane } = show.last;
      if (judgement !== "miss" && judgement !== "stray") {
        me.move = {
          id:
            tier > this.celebrated
              ? comboMove(tier)
              : laneMove(this.style, lane),
          at: time,
        };
        this.flash[lane] =
          judgement === "perfect" ? 1 : judgement === "great" ? 0.8 : 0.6;
      } else if (judgement === "miss") me.move = { id: "stumble", at: time };
    }
    if (tier > this.celebrated) this.burst();
    this.celebrated = tier;
    if (playing) this.demo = [];
    else if (this.demo.length && time >= this.demo[0].at)
      me.move = { id: this.demo.shift()!.id, at: time };
    const fever = !!show && show.feverTicks > 0;

    if (party?.players !== this.synced) {
      this.synced = party?.players;
      this.sync(party);
    }
    const cast = party
      ? [...party.players].sort((a, b) => a.slot - b.slot)
      : [];
    const onStage = cast.filter(
      (p) => p.slot === party!.you || this.others.has(p.slot),
    );
    const spots = SPOTS[Math.max(0, Math.min(3, onStage.length - 1))];
    const scale = onStage.length > 2 ? 1 : onStage.length === 2 ? 1.2 : 1.35;
    const winner = party?.results ? partyRanking(cast)[0]?.slot : undefined;
    const glide = Math.min(1, dt * 6);
    const place = (d: Dancer, slot: number) => {
      const i = Math.max(
        0,
        onStage.findIndex((p) => p.slot === slot),
      );
      const x = party ? spots[i] : 0;
      d.x += (x - d.x) * glide;
      d.z += (-Math.abs(x) * 0.18 + (slot === winner ? 0.8 : 0) - d.z) * glide;
      d.ring.visible = !!party;
      d.ring.position.set(d.x, 0.15, d.z);
      d.ring.scale.setScalar(scale);
      (d.ring.material as T.MeshBasicMaterial).color.set(
        LANE_COLOURS[Math.max(0, slot) % 4],
      );
    };
    place(me, party ? party.you : -1);
    const hold =
      show?.ended && show.mode !== "warmup"
        ? show.booed
          ? "slump"
          : "finish"
        : null;
    this.pose(
      me,
      stagePose(
        {
          style: this.style,
          playing: playing || this.demo.length > 0,
          fever,
          move: me.move && { id: me.move.id, age: time - me.move.at },
          hold,
          reduced: this.reduced,
        },
        time,
      ),
      scale,
      time,
      hold === "slump" ? "think" : hold || fever ? "cheer" : "idle",
    );
    for (const p of cast) {
      const d = this.others.get(p.slot);
      if (!d) continue;
      place(d, p.slot);
      const style = STAGE_STYLES[p.style]?.id ?? "pop",
        combo = Math.floor(p.combo / 8);
      if (p.hits > d.hits)
        d.move = {
          id: combo > d.tier ? comboMove(combo) : laneMove(style, p.lane),
          at: time,
        };
      d.hits = p.hits;
      d.tier = combo;
      const finished = p.playing && (p.done || !!party?.results);
      const theirs = finished ? (p.booed ? "slump" : "finish") : null;
      this.pose(
        d,
        stagePose(
          {
            style,
            playing: !!party?.running && p.playing && !p.done,
            fever: p.fever,
            move: d.move && { id: d.move.id, age: time - d.move.at },
            hold: theirs,
            reduced: this.reduced,
          },
          // Offset the beat a little so a line of dancers is not a mirror.
          time + p.slot * 0.11,
        ),
        scale,
        time,
        theirs === "slump" ? "think" : theirs || p.fever ? "cheer" : "idle",
      );
    }
    this.spot.visible = winner !== undefined;
    if (winner !== undefined) {
      const d = winner === party!.you ? me : this.others.get(winner);
      if (d) this.spot.position.set(d.x, 2.2, d.z);
    }

    // Fever turns every lamp on and warms the hall.
    const pulse = fever && !this.reduced ? 0.5 + Math.sin(time * 12) * 0.5 : 0;
    this.background.set("#1b1d38");
    if (fever) this.background.lerp(FEVER, 0.6 + pulse * 0.3);
    this.beams.forEach((beam, i) => {
      this.flash[i] = Math.max(0, this.flash[i] - dt * 2.6);
      const material = beam.material as T.MeshStandardMaterial;
      material.opacity =
        0.08 + Math.max(this.flash[i], fever ? 0.45 + pulse * 0.25 : 0) * 0.5;
      beam.rotation.x = this.reduced
        ? 0
        : Math.sin(time * (fever ? 4 : 1.3) + i) * (fever ? 0.3 : 0.12);
    });
    const hype = fever ? 1 : show ? show.hype : 0.5;
    this.crowd.forEach((fan, i) => {
      fan.position.y =
        -0.2 +
        (this.reduced
          ? 0
          : Math.abs(Math.sin(time * (3 + hype * 5) + i * 1.7)) * hype * 0.35);
      // A booed-off show turns the crowd away.
      fan.rotation.y = show?.booed ? Math.PI : 0;
    });
    for (const bit of this.confetti) {
      if (bit.life <= 0) continue;
      bit.life -= dt;
      bit.velocity.y -= 2.2 * dt;
      bit.mesh.position.addScaledVector(bit.velocity, dt);
      bit.mesh.rotation.x += dt * 6;
      bit.mesh.rotation.z += dt * 4;
      (bit.mesh.material as T.MeshBasicMaterial).opacity = Math.min(
        1,
        bit.life,
      );
      bit.mesh.visible = bit.life > 0;
    }
    this.renderer.render(this.scene, this.camera);
  }
  /** Confetti on demand: a Fever lit, or a party won. */
  celebrate() {
    this.burst();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.observer.disconnect();
    this.retire(this.me);
    for (const d of this.others.values()) this.retire(d);
    this.others.clear();
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }
}
const FEVER = new T.Color("#5a1f6e");
