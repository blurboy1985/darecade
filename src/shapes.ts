// Small, cached primitive helpers shared by pets, headgear and magic effects.
import * as T from "three";

const geo = {
  ball: new T.SphereGeometry(1, 14, 10),
  cone: new T.ConeGeometry(1, 1, 16),
  cyl: new T.CylinderGeometry(1, 1, 1, 18),
  box: new T.BoxGeometry(1, 1, 1),
  torus: new T.TorusGeometry(1, 0.18, 10, 32),
  ring: new T.TorusGeometry(1, 0.06, 6, 48),
  oct: new T.OctahedronGeometry(1, 0),
  ico: new T.IcosahedronGeometry(1, 0),
};
export type Shape = keyof typeof geo;
const cache = new Map<string, T.MeshStandardMaterial>();
export function material(color: string, glow = 0, opacity = 1) {
  const key = `${color}|${glow}|${opacity}`;
  let m = cache.get(key);
  if (!m) {
    m = new T.MeshStandardMaterial({
      color,
      roughness: 0.65,
      emissive: glow ? color : "#000000",
      emissiveIntensity: glow,
      transparent: opacity < 1,
      opacity,
      depthWrite: opacity >= 1,
    });
    cache.set(key, m);
  }
  return m;
}
export type PartOptions = {
  glow?: number;
  opacity?: number;
  rot?: number[];
  shadow?: boolean;
};
/** Adds a primitive at p with per-axis scale s (radius / height units). */
export function part(
  parent: T.Object3D,
  shape: Shape,
  p: number[],
  s: number[],
  color: string,
  o: PartOptions = {},
) {
  const m = new T.Mesh(geo[shape], material(color, o.glow, o.opacity));
  m.position.set(p[0], p[1], p[2]);
  m.scale.set(s[0], s[1], s[2]);
  if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2]);
  m.castShadow = o.shadow ?? !o.glow;
  parent.add(m);
  return m;
}
export const ball = (
  parent: T.Object3D,
  p: number[],
  s: number[],
  color: string,
  o: PartOptions = {},
) => part(parent, "ball", p, s, color, o);
export function node(parent: T.Object3D, p: number[] = [0, 0, 0], name = "") {
  const g = new T.Group();
  g.position.set(p[0], p[1], p[2]);
  g.name = name;
  parent.add(g);
  return g;
}
