import * as T from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// Bake direct siblings into one draw per shared material. Animated child groups
// retain their own transform. Source primitive geometry remains shared.
export function mergeCosmeticParts(group: T.Group) {
  const batches = new Map<T.Material, T.Mesh[]>();
  for (const child of [...group.children]) {
    if (child instanceof T.Group) mergeCosmeticParts(child);
    else if (child instanceof T.Mesh && !Array.isArray(child.material)) {
      const list = batches.get(child.material) ?? [];
      list.push(child);
      batches.set(child.material, list);
    }
  }
  for (const [material, meshes] of batches) {
    if (meshes.length < 2) continue;
    const pieces = meshes.map((mesh) => {
      mesh.updateMatrix();
      return mesh.geometry.clone().applyMatrix4(mesh.matrix);
    });
    const geometry = mergeGeometries(pieces);
    pieces.forEach((piece) => piece.dispose());
    if (!geometry) continue;
    const merged = new T.Mesh(geometry, material);
    merged.castShadow = true;
    group.add(merged);
    meshes.forEach((mesh) => mesh.removeFromParent());
  }
}
