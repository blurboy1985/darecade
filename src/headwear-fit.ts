import * as T from "three";

// Fit once per cosmetic combination. Never modify the shared uncapped geometry.
const fitted = new WeakMap<T.BufferGeometry, Map<string, T.BufferGeometry>>();
const collisionMaterial = new T.MeshBasicMaterial({ side: T.DoubleSide });

/** Tuck hair along scalp rays behind the first headwear surface it crosses. */
export function fitHairUnderHeadwear(
  hair: T.Group,
  headwear: T.Object3D[],
  key: string,
) {
  hair.updateWorldMatrix(true, true);
  const inverse = hair.matrixWorld.clone().invert();
  const blockers: T.Mesh[] = [];
  for (const root of headwear) {
    root.updateWorldMatrix(true, true);
    root.traverse((object) => {
      if (
        !(object instanceof T.Mesh) ||
        !object.visible ||
        object.userData.outline
      )
        return;
      const mesh = new T.Mesh(object.geometry, collisionMaterial);
      mesh.matrixAutoUpdate = false;
      mesh.matrixWorld.multiplyMatrices(inverse, object.matrixWorld);
      blockers.push(mesh);
    });
  }
  if (!blockers.length) return;
  const ray = new T.Raycaster();
  const point = new T.Vector3(),
    direction = new T.Vector3();
  hair.traverse((mesh) => {
    if (!(mesh instanceof T.Mesh)) return;
    const source: T.BufferGeometry = mesh.geometry;
    const variants = fitted.get(source) ?? new Map<string, T.BufferGeometry>();
    let geometry = variants.get(key);
    if (!geometry) {
      geometry = source.clone();
      const positions = geometry.getAttribute("position");
      mesh.updateMatrix();
      const localInverse = mesh.matrix.clone().invert();
      for (let i = 0; i < positions.count; i++) {
        point.fromBufferAttribute(positions, i).applyMatrix4(mesh.matrix);
        const radius = point.length();
        if (radius < 0.001) continue;
        direction.copy(point).divideScalar(radius);
        ray.set(new T.Vector3(), direction);
        ray.far = radius + 0.025;
        const hit = ray.intersectObjects(blockers, false)[0];
        if (!hit) continue;
        point.copy(direction).multiplyScalar(Math.max(0, hit.distance - 0.025));
        point.applyMatrix4(localInverse);
        positions.setXYZ(i, point.x, point.y, point.z);
      }
      geometry.computeVertexNormals();
      variants.set(key, geometry);
      fitted.set(source, variants);
    }
    mesh.geometry = geometry;
  });
  // A fitted scalp cannot sway independently through the hat after fitting.
  hair.userData.fittedHeadwear = true;
}
