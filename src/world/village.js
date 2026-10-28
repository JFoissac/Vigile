// village.js — la place du village (22 modules Blender) posée sur le terrain.
// Les positions viennent de assets/village/layout.json (repère glTF : Y en haut),
// avec les emprises pour les collisions. Chargement paresseux : rien n'est
// téléchargé tant que le niveau « village » n'est pas choisi.

import * as THREE from "three";
import { GLTFLoader } from "../../vendor/loaders/GLTFLoader.js";

const VILLAGE_Z = 20;      // la place est centrée devant la chapelle
const SOLIDE = 0.8;        // hauteur minimale pour qu'un module bloque le joueur

export async function buildVillage({ scene, base = "./", onProgress } = {}) {
  const layout = await fetch(base + "assets/village/layout.json").then((r) => {
    if (!r.ok) throw new Error(`layout.json : ${r.status}`);
    return r.json();
  });

  const loader = new GLTFLoader();
  const fichiers = [...new Set(layout.modules.map((m) => m.fichier).filter(Boolean))];
  const cache = new Map();
  let done = 0;
  await Promise.all(fichiers.map(async (f) => {
    const chemin = base + "assets/village/" + f.replace(/^export\//, "");
    const gltf = await loader.loadAsync(chemin);
    cache.set(f, gltf.scene);
    done++;
    if (onProgress) onProgress(done / fichiers.length);
  }));

  const group = new THREE.Group();
  group.name = "village";
  group.position.set(0, 0, VILLAGE_Z);
  const colliders = [];

  for (const m of layout.modules) {
    const src = cache.get(m.fichier);
    if (!src) continue;
    const obj = src.clone(true);
    const [x, y, z] = m.position_gltf || m.position || [0, 0, 0];
    obj.position.set(x, y, z);
    obj.rotation.y = THREE.MathUtils.degToRad(m.rotation_y_gltf_deg || 0);
    obj.scale.setScalar(m.echelle || 1);
    obj.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = true;
      o.frustumCulled = true;
    });
    group.add(obj);

    const e = m.emprise_m;
    if (!e || !(e.hauteur_z >= SOLIDE)) continue;   // sols, pavés, terre : on marche dessus
    const quart = Math.abs(((m.rotation_y_gltf_deg || 0) % 180 + 180) % 180 - 90) < 1;
    colliders.push({
      x: x, z: z + VILLAGE_Z,
      hw: (quart ? e.profondeur_y : e.largeur_x) / 2 * (m.echelle || 1),
      hd: (quart ? e.largeur_x : e.profondeur_y) / 2 * (m.echelle || 1),
    });
  }

  // les réverbères du layout deviennent de vraies lumières (6 max : au-delà le
  // coût par fragment explose pour un gain nul)
  const lampes = (layout.lampes || []).slice(0, 6);
  for (const l of lampes) {
    const c = l.couleur || [1, 0.63, 0.28];
    const light = new THREE.PointLight(new THREE.Color(c[0], c[1], c[2]), 1.35, l.portee_m || 9, 2);
    light.position.set(l.position[0], l.position[1] + 2.55, l.position[2] + VILLAGE_Z);
    light.castShadow = false;
    group.add(light);
  }

  scene.add(group);

  // les habitants se tiennent sur la place, pas dans les murs
  const zones = layout.zones || {};
  const centre = zones.place || zones.centre || null;

  return {
    group, colliders, layout, centre, lampes,
    setVisible(v) { group.visible = !!v; },
    dispose() { group.removeFromParent(); },
  };
}
