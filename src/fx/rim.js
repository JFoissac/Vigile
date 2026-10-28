// rim.js — liseré de contre-jour injecté dans un MeshStandardMaterial.
//
// Pourquoi : la nuit, un mort se lit d'abord par sa SILHOUETTE. Sans liseré, un
// maillage sombre sur fond sombre se confond avec la lande (constat de la revue
// visuelle du 23/10). On ajoute donc une frange froide sur les bords du modèle,
// calculée depuis la normale de vue : aucun coût de géométrie, aucun draw call.
//
// Utilisation : rimLight(material, { color, power, strength }) puis partager le
// matériau entre les clones (un seul programme compilé).

import * as THREE from "three";

/**
 * @param {THREE.Material} material  matériau standard (partagé entre clones)
 * @param {{color?:number, power?:number, strength?:number, tint?:THREE.Color}} opts
 */
export function rimLight(material, { color = 0x9fc4e8, power = 2.4, strength = 0.75, dir = [0.315, 0.352, -0.882] } = {}) {
  if (!material || material.userData.rim) return material;
  const c = new THREE.Color(color);
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize();
  material.userData.rim = { color: c.clone(), power, strength, dir: d.clone() };

  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    if (previous) previous(shader, renderer);
    shader.uniforms.uRimColor = { value: material.userData.rim.color };
    shader.uniforms.uRimPower = { value: material.userData.rim.power };
    shader.uniforms.uRimStrength = { value: material.userData.rim.strength };
    shader.uniforms.uRimDir = { value: material.userData.rim.dir };
    shader.fragmentShader = `
uniform vec3 uRimColor;
uniform vec3 uRimDir;
uniform float uRimPower;
uniform float uRimStrength;
` + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <dithering_fragment>",
      `
  vec3 rimViewDir = normalize(vViewPosition);
  vec3 rimWorldN = inverseTransformDirection(normal, viewMatrix);
  // liseré de LUNE : uniquement sur les arêtes qui font face à la lumière,
  // sinon le modèle se retrouve cerné d'un contour de dessin animé.
  float rimLit = clamp(dot(rimWorldN, normalize(uRimDir)), 0.0, 1.0);
  float rimF = pow(1.0 - clamp(dot(rimViewDir, normal), 0.0, 1.0), uRimPower);
  gl_FragColor.rgb += uRimColor * rimF * rimLit * uRimStrength;
  #include <dithering_fragment>`,
    );
  };
  // cache programme : deux matériaux de même type mais de couleur différente
  // gardent le même code, seuls les uniforms changent.
  material.customProgramCacheKey = () => "vigile-rim-v1";
  material.needsUpdate = true;
  return material;
}

/** Change la couleur/force du liseré à chaud (phase de boss, hurlement…). */
export function setRim(material, { color, strength, power } = {}) {
  const r = material && material.userData.rim;
  if (!r) return;
  if (color !== undefined) r.color.set(color);
  if (strength !== undefined) r.strength = strength;
  if (power !== undefined) r.power = power;
}
