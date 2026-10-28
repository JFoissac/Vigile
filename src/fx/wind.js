// wind.js — souffle de vent sur la végétation instanciée.
//
// Les herbes et les buissons sont des InstancedMesh immobiles : sans mouvement,
// la lande se lit comme une photo découpée. On décale les sommets en espace
// objet (donc avant la matrice d'instance), avec une phase propre à chaque
// instance pour que rien ne bouge à l'unisson. Aucun draw call de plus.

/** Horloge partagée : mise à jour par `landscape.update`. */
export const windUniform = { value: 0 };

export function windify(material, { amount = 0.1, freq = 1.7 } = {}) {
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previous) previous(shader, renderer);
    shader.uniforms.uWindTime = windUniform;
    shader.uniforms.uWindAmount = { value: amount };
    shader.uniforms.uWindFreq = { value: freq };
    shader.vertexShader = `
uniform float uWindTime;
uniform float uWindAmount;
uniform float uWindFreq;
` + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float windPhase = instanceMatrix[3].x * 0.73 + instanceMatrix[3].z * 0.41;
      #else
        float windPhase = 0.0;
      #endif
      float windSway = sin(uWindTime * uWindFreq + windPhase) * uWindAmount * max(0.0, position.y);
      windSway += sin(uWindTime * (uWindFreq * 2.3) + windPhase * 1.7) * uWindAmount * 0.35 * max(0.0, position.y);
      transformed.x += windSway;
      transformed.z += windSway * 0.55;`,
    );
  };
  material.customProgramCacheKey = () => "vigile-wind-v1";
  material.needsUpdate = true;
  return material;
}
