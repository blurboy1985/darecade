import * as T from "three";
/** One shared shader variant, no depth render or full-screen post-process. */
export function cameraOcclusion(root: T.Object3D) {
  const subject = { value: new T.Vector3() };
  const eye = { value: new T.Vector3() };
  const enabled = { value: 0 };
  const copies = new Map<T.Material, T.Material>();
  const visit = (object: T.Object3D) => {
    if (object.userData.avatar || object.userData.companion) return;
    if (object instanceof T.Mesh && !(object instanceof T.SkinnedMesh)) {
      const copy = (original: T.Material) => {
        if (copies.has(original)) return copies.get(original)!;
        const material = original.clone();
        material.onBeforeCompile = (shader) => {
          shader.uniforms.simiSubject = subject;
          shader.uniforms.simiEye = eye;
          shader.uniforms.simiFade = enabled;
          shader.vertexShader =
            "varying vec3 simiWorld;\n" + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace(
            "#include <project_vertex>",
            "#include <project_vertex>\nsimiWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
          );
          shader.fragmentShader =
            "varying vec3 simiWorld;\nuniform vec3 simiSubject;\nuniform vec3 simiEye;\nuniform float simiFade;\n" +
            shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace(
            "#include <clipping_planes_fragment>",
            `
            #include <clipping_planes_fragment>
            vec3 corridor = simiEye - simiSubject;
            float along = dot(simiWorld - simiSubject, corridor) / max(dot(corridor, corridor), 0.001);
            float separation = length(simiWorld - (simiSubject + clamp(along, 0.0, 1.0) * corridor));
            if (simiFade > 0.5 && along > 0.025 && along < 1.02 && simiWorld.y > 0.45 && separation < 0.95) {
              if (mod(gl_FragCoord.x + 2.0 * gl_FragCoord.y, 4.0) > 0.5) discard;
            }
          `,
          );
        };
        material.customProgramCacheKey = () => "simi-camera-dither-v1";
        copies.set(original, material);
        return material;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(copy)
        : copy(object.material);
    }
    object.children.forEach(visit);
  };
  visit(root);
  return {
    include: visit,
    update(player: T.Vector3, camera: T.Vector3, active: boolean) {
      subject.value.copy(player).y += 1.1;
      eye.value.copy(camera);
      enabled.value = Number(active);
    },
    dispose() {
      copies.forEach((m) => m.dispose());
      copies.clear();
    },
  };
}
