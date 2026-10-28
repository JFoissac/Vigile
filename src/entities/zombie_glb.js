// zombie_glb.js — les morts sculptés : modèles GLB riggés (Blender) + clips.
//
// Les trois modèles viennent de `assets/zombies/` (CC0, voir assets/CREDITS.md) :
//   z_walker  Rodeur  1,82 m  50 os  7 clips
//   z_runner  Coureur 1,76 m  12 os  7 clips
//   z_brute   Colosse 2,34 m  50 os  7 clips
// Chaque GLB porte les clips Emerge / Idle / Walk / Run / Attack / Hit / Death.
//
// Le module fournit deux choses :
//   1. `loadZombieAssets()` : préchargement (await) avant l'entrée dans le menu ;
//   2. une fabrique branchée sur `setZombieModelFactory` (zombie_rig.js) qui clone
//      le modèle (SkeletonUtils.clone : squelettes indépendants) et expose les
//      17 articulations attendues par le jeu (pelvis, torso, head, jaw, shL…).
//
// L'animation n'est pas recalculée à la main : `createClipAnimator` pilote les
// AnimationActions. Les clips d'émergence, d'attaque, de touche et de mort sont
// posés image par image (temps exact fourni par zombie.js) ; idle / walk / run
// bouclent avec un timeScale proportionnel à la vitesse.

import * as THREE from "three";
import { GLTFLoader } from "../../vendor/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "../../vendor/utils/SkeletonUtils.js";
import { clamp } from "../core/util.js";
import { setZombieModelFactory } from "./zombie_rig.js";
import { rimLight } from "../fx/rim.js";

const ASSETS = {
  walker: { file: "assets/zombies/z_walker.glb", height: 1.82, width: 0.92, tint: 0xb9c2b0, rim: 0x8aa4c0 },
  runner: { file: "assets/zombies/z_runner.glb", height: 1.76, width: 0.64, tint: 0xc4a883, rim: 0xb8905c },
  brute: { file: "assets/zombies/z_brute.glb", height: 2.34, width: 1.11, tint: 0xa88a80, rim: 0x9c6450 },
  // loup-garou : asset CC0 (Grab3D), 2,06 m, clips Attack/Idle/Jump/Run/Walk
  werewolf: { file: "assets/zombies/z_werewolf.glb", height: 2.06, width: 0.84, tint: 0xc9c2b8, rim: 0xa8bcc8 },
};

/* Correspondance articulations du jeu → os du squelette.
   Le coureur n'a que 12 os (Body / Head / Arm.L / Leg.L …) : les alias
   retombent sur l'os disponible le plus proche, ce qui garde les tests et les
   effets (secousse de tête, balancement de bras) fonctionnels. */
const JOINT_ALIASES = {
  pelvis: ["Hips", "Body", "Root"],
  torso: ["Torso", "Body", "Abdomen"],
  chest: ["Torso", "Body", "Abdomen"],
  head: ["Head", "Body"],
  jaw: ["BottomMouth", "TopMouth", "Head", "Body"],
  shL: ["Shoulder.L", "UpperArm.L", "Arm.L", "Body"],
  shR: ["Shoulder.R", "UpperArm.R", "Arm.R", "Body"],
  elL: ["LowerArm.L", "Arm.L", "Body"],
  elR: ["LowerArm.R", "Arm.R", "Body"],
  wrL: ["LowerArm.L", "Arm.L", "Body"],
  wrR: ["LowerArm.R", "Arm.R", "Body"],
  hipL: ["UpperLeg.L", "Leg.L", "Body"],
  hipR: ["UpperLeg.R", "Leg.R", "Body"],
  kneeL: ["LowerLeg.L", "Leg.L", "Body"],
  kneeR: ["LowerLeg.R", "Leg.R", "Body"],
  ankL: ["Foot.L", "Leg.L", "Body"],
  ankR: ["Foot.R", "Leg.R", "Body"],
};

const cache = new Map();   // type → { scene, clips, height, width }
let ready = false;
let failure = null;

function findBone(root, names) {
  for (const name of names) {
    let hit = null;
    root.traverse((o) => {
      if (hit) return;
      if (o.isBone && o.name === name) hit = o;
    });
    if (hit) return hit;
    // secours : comparaison insensible à la casse / aux suffixes
    root.traverse((o) => {
      if (hit) return;
      if (o.isBone && o.name.toLowerCase() === name.toLowerCase()) hit = o;
    });
    if (hit) return hit;
  }
  return null;
}

/** Accorde l'atlas du modèle à la palette de la nuit : moins saturé, plus sombre. */
function grimTexture(texture) {
  if (!texture || !texture.image) return texture;
  try {
    const img = texture.image;
    const w = img.width || img.naturalWidth;
    const h = img.height || img.naturalHeight;
    if (!w || !h) return texture;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return texture;
    ctx.filter = "saturate(0.52) brightness(0.86) contrast(1.05)";
    ctx.drawImage(img, 0, 0, w, h);
    ctx.filter = "none";
    // voile froid : la peau verte devient cadavérique, le rouge crie moins
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(150,170,160,0.55)";
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    const out = new THREE.CanvasTexture(canvas);
    out.flipY = texture.flipY;
    out.colorSpace = texture.colorSpace;
    out.wrapS = texture.wrapS;
    out.wrapT = texture.wrapT;
    out.minFilter = texture.minFilter;
    out.magFilter = texture.magFilter;
    out.generateMipmaps = texture.generateMipmaps;
    out.anisotropy = texture.anisotropy;
    out.needsUpdate = true;
    return out;
  } catch (e) {
    return texture;
  }
}

function mapJoints(root) {
  const joints = {};
  for (const [key, aliases] of Object.entries(JOINT_ALIASES)) {
    const bone = findBone(root, aliases);
    if (bone) joints[key] = bone;
  }
  return joints;
}

/** Prépare un modèle : clone du squelette, matériaux du type partagés. */
function instantiate(type, cfg, rng) {
  // le zélateur emprunte la charpente du rodeur (aucun GLB dédié)
  const entry = cache.get(type === "zealot" ? "walker" : type);
  if (!entry) return null;

  const root = cloneSkinned(entry.scene);
  root.name = `glb_${type}`;
  // le jeu applique déjà cfg.scale au groupe : le modèle natif garde sa taille
  root.scale.setScalar(1 / Math.max(0.001, cfg.scale));

  root.traverse((o) => {
    if (!o.isMesh) return;
    // seuls les maillages lourds portent une ombre : l'ombre du visage est inutile
    const heavy = (o.geometry.attributes.position?.count || 0) > 800;
    o.castShadow = heavy;
    o.receiveShadow = false;
    o.frustumCulled = true;
    o.userData.sharedGeo = true;   // géométrie et matériaux partagés entre clones
    o.userData.part = "body";
  });

  const joints = mapJoints(root);
  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const clip of entry.clips) {
    const action = mixer.clipAction(clip);
    action.enabled = true;
    action.setEffectiveWeight(clip.name === "Idle" ? 1 : 0);
    action.play();
    if (clip.name === "Idle" || clip.name === "Walk" || clip.name === "Run") {
      action.setLoop(THREE.LoopRepeat, Infinity);
    } else {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.paused = true;
    }
    actions[clip.name] = action;
  }

  return {
    root,
    joints,
    rest: {},
    height: entry.height,
    width: entry.width,
    mixer,
    actions,
    clips: entry.clips,
    glb: true,
  };
}

/**
 * Précharge les trois GLB. Résout `true` si au moins un modèle est disponible ;
 * en cas d'échec (fichier absent, WebGL sans skinning) le jeu retombe sur les
 * mannequins procéduraux : aucune exception ne remonte.
 */
export async function loadZombieAssets({ base = "./", onProgress } = {}) {
  const loader = new GLTFLoader();
  const types = Object.keys(ASSETS);
  let done = 0;
  const results = await Promise.all(types.map(async (type) => {
    const spec = ASSETS[type];
    try {
      const gltf = await loader.loadAsync(base + spec.file);
      // assombrit l'atlas une seule fois, avant les clones
      const tint = new THREE.Color(spec.tint);
      gltf.scene.traverse((o) => {
        if (!o.isMesh) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if (!m) continue;
          if (m.map) m.map = grimTexture(m.map);
          m.roughness = 0.86;
          m.metalness = 0.02;
          m.shadowSide = THREE.FrontSide;
          if (m.color) m.color.copy(m.color).multiply(tint);
          if (m.emissive) {
            m.emissive.setHex(0x0a0f0c);
            m.emissiveIntensity = 0.35;
          }
          // liseré de contre-jour : la silhouette tient sur le fond de lande
          rimLight(m, { color: spec.rim, power: 2.6, strength: 0.55 });
        }
      });
      const clips = (gltf.animations || []).slice();
      // les clips sont nommés à la source (Emerge, Idle, …) : on ne garde que ceux-là
      const keep = clips.filter((c) => ["Emerge", "Idle", "Walk", "Run", "Jump", "Attack", "Hit", "Death"].includes(c.name));
      cache.set(type, {
        scene: gltf.scene,
        clips: keep.length ? keep : clips,
        height: spec.height,
        width: spec.width,
      });
      done++;
      if (onProgress) onProgress(done / types.length, `Morts sculptés · ${type}`);
      return true;
    } catch (e) {
      failure = e;
      if (typeof console !== "undefined") console.warn(`zombie_glb: ${spec.file} indisponible`, e);
      return false;
    }
  }));

  ready = results.some(Boolean);
  if (ready) {
    setZombieModelFactory(({ type, cfg, rng }) => instantiate(type, cfg, rng));
  }
  return ready;
}

export function zombieAssetsReady() { return ready; }
export function zombieAssetsError() { return failure; }

/* ─────────────────────── animation par clips ─────────────────────── */

/**
 * Pilote de clips compatible avec l'interface de `createAnimator` :
 * `update(dt, { anim, emergeK, attackU, hitK, deathT, speed01, phase })`.
 */
export function createClipAnimator(rig) {
  const { actions, mixer } = rig;
  const weights = {};
  const target = {};
  for (const name of Object.keys(actions)) { weights[name] = name === "Idle" ? 1 : 0; target[name] = 0; }

  const dur = (name) => (actions[name] ? actions[name].getClip().duration : 1);

  /** Pose un clip à un temps normalisé (0..1) : lecture image par image. */
  function exact(name, u) {
    const a = actions[name];
    if (!a) return;
    a.paused = true;
    a.time = clamp(u, 0, 0.999) * dur(name);
  }

  /** Boucle un clip à un timeScale donné. */
  function loop(name, speed = 1) {
    const a = actions[name];
    if (!a) return;
    a.paused = false;
    a.timeScale = speed;
  }

  return {
    rig,
    update(dt, p = {}) {
      const anim = p.anim || "idle";
      for (const name of Object.keys(target)) target[name] = 0;

      if (anim === "emerge") {
        // pas de clip « couché » : le mort se hisse debout, bras tendus vers
        // l'avant (pose d'attaque figée), puis se relève en marchant.
        exact("Attack", 0.30);
        target.Attack = 1;
        loop("Walk", 0.6);
        target.Walk = clamp((p.emergeK ?? 0) > 0.8 ? ((p.emergeK - 0.8) / 0.2) : 0, 0, 1) * 0.85;
      }
      else if (anim === "attack") { exact("Attack", p.attackU ?? 0); target.Attack = 1; }
      else if (anim === "hit") { exact("Hit", 1 - clamp(p.hitK ?? 0, 0, 1)); target.Hit = 1; }
      else if (anim === "death") {
        exact("Death", clamp((p.deathT || 0) / Math.max(0.2, dur("Death")), 0, 0.999));
        target.Death = 1;
      } else if (anim === "run") { loop("Run", 0.9 + (p.speed01 ?? 1) * 0.45); target.Run = 1; }
      else if (anim === "walk") { loop("Walk", 0.75 + (p.speed01 ?? 1) * 0.55); target.Walk = 1; }
      else { loop("Idle", 0.75 + Math.sin((p.t || 0) * 0.9) * 0.08); target.Idle = 1; }

      // fondu : 0,16 s environ entre deux états, sans à-coup
      const k = 1 - Math.exp(-12 * dt);
      for (const [name, action] of Object.entries(actions)) {
        weights[name] += (target[name] - weights[name]) * k;
        if (weights[name] < 0.001) weights[name] = 0;
        action.setEffectiveWeight(clamp(weights[name], 0, 1));
      }
      mixer.update(dt);
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(rig.root);
    },
  };
}
