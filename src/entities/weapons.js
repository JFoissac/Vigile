// weapons.js — arsenal du Vigile : définitions, munitions typées et view-models.
// Aucun asset : chaque arme est assemblée en primitives (acier, polymère, noyer,
// laiton) avec ses organes mobiles (crosse, canon, chargeur, organes de visée).
// Le modèle pointe vers -Z ; l'origine est au niveau de la poignée.

import * as THREE from "three";
import { T, rep } from "../world/textures.js";
import { box } from "../world/geo.js";
import { GLB_POSES, HAND_GRIP, HAND_FILE } from "./weapon_poses.js";

/* ─────────────────────────── munitions ─────────────────────────── */

export const AMMO = {
  "9mm": { label: "9 mm", short: "9", color: 0xc9a45c, tint: 0xffc978, box: "Boîte de 9 mm", unit: "cartouches" },
  "12": { label: "calibre 12", short: "12", color: 0xa8563a, tint: 0xff9a6a, box: "Boîtes de calibre 12", unit: "cartouches" },
  "5.56": { label: "5,56 mm", short: "5.56", color: 0x8d9a5c, tint: 0xd6e08a, box: "Boîte de 5,56", unit: "cartouches" },
  ".308": { label: ".308", short: ".308", color: 0x8f7fa8, tint: 0xcbb6f0, box: "Étui de .308", unit: "cartouches" },
  "40mm": { label: "40 mm", short: "40", color: 0x7f8f6a, tint: 0xd8e8b0, box: "Boîte de 40 mm", unit: "grenades" },
  lame: { label: "lame", short: "—", color: 0xaab0b4, tint: 0xe8f0f4, box: "Lame", unit: "" },
};

export const AMMO_ORDER = ["9mm", "12", "5.56", ".308", "40mm"];

/* ─────────────────────────── définitions ─────────────────────────── */

export const WEAPONS = [
  {
    id: "pistol", slot: 1, name: "Pistolet Mle 1935", short: "Pistolet",
    ammo: "9mm", mag: 16, auto: false, tier: 1, power: 1, start: true, headChance: 0.40,
    damage: 30, headMul: 2.6, cooldown: 0.20, reload: 1.15,
    spread: 0.0035, moveSpread: 0.012, pellets: 1,
    recoil: 0.030, kick: 0.9, shake: 0.18,
    falloff: [16, 44], minFactor: 0.62,
    reloadStyle: "slide", zoom: 0,
    desc: "Arme de service. Sobre, précise, jamais enrayée.",
  },
  {
    id: "shotgun", slot: 2, name: "Fusil à pompe Saint-Éloi", short: "Fusil à pompe",
    ammo: "12", mag: 10, auto: false, tier: 1, power: 2, headChance: 0.32,
    damage: 16, headMul: 1.6, cooldown: 0.78, reload: 1.95,
    spread: 0.048, moveSpread: 0.016, pellets: 8,
    recoil: 0.078, kick: 1.6, shake: 0.5,
    falloff: [6, 18], minFactor: 0.38,
    reloadStyle: "pump", zoom: 0,
    desc: "Huit grains de plomb par coup. Dévastateur à bout portant.",
  },
  {
    id: "smg", slot: 3, name: "PM « Vêpres »", short: "PM Vêpres",
    ammo: "9mm", mag: 40, auto: true, tier: 2, power: 2, headChance: 0.26,
    damage: 16, headMul: 2.2, cooldown: 0.075, reload: 1.45,
    spread: 0.014, moveSpread: 0.03, pellets: 1,
    recoil: 0.014, kick: 0.55, shake: 0.16,
    falloff: [10, 34], minFactor: 0.5,
    reloadStyle: "mag", zoom: 0,
    desc: "Trente coups, cadence élevée, gerbe large : arroser, pas viser.",
  },
  {
    id: "rifle", slot: 4, name: "Fusil d'assaut « Matines »", short: "Fusil d'assaut",
    ammo: "5.56", mag: 40, auto: true, tier: 3, power: 3, headChance: 0.50,
    damage: 24, headMul: 2.6, cooldown: 0.105, reload: 1.7,
    spread: 0.005, moveSpread: 0.016, pellets: 1,
    recoil: 0.022, kick: 0.8, shake: 0.22,
    falloff: [24, 62], minFactor: 0.7,
    reloadStyle: "mag", zoom: 0,
    desc: "L'arme de la veille : précise, automatique, trente coups.",
  },
  {
    id: "sniper", slot: 5, name: "Carabine « Laudes »", short: "Carabine",
    ammo: ".308", mag: 10, auto: false, tier: 4, power: 4, headChance: 0.75,
    damage: 105, headMul: 2.7, cooldown: 0.7, reload: 2.0, pierce: 3,
    spread: 0.0008, moveSpread: 0.022, pellets: 1,
    recoil: 0.11, kick: 1.9, shake: 0.62,
    falloff: null, minFactor: 1,
    reloadStyle: "bolt", zoom: 0.40,
    desc: "Cinq balles lourdes, lunette de visée. Un colosse tombe en quatre.",
  },
  {
    id: "hatchet", slot: 6, name: "Hachette de garde", short: "Hachette",
    ammo: "lame", mag: 0, auto: false, melee: true, tier: 1, power: 1, start: true,
    headChance: 0.35, meleeStyle: "chop", meleeDur: 0.46,
    damage: 62, headMul: 2.4, cooldown: 0.55, reload: 0,
    spread: 0, moveSpread: 0, pellets: 1,
    recoil: 0.05, kick: 1.1, shake: 0.24,
    reach: 2.5,
    falloff: null, minFactor: 1,
    reloadStyle: "none", zoom: 0,
    desc: "Le fer de garde. Ne s'épuise jamais, mais il faut s'approcher.",
  },
  {
    id: "revolver", slot: 7, name: "Revolver de sacristie", short: "Revolver",
    ammo: "9mm", mag: 8, auto: false, tier: 1, power: 2, headChance: 0.55,
    damage: 78, headMul: 2.35, cooldown: 0.42, reload: 1.8,
    spread: 0.0032, moveSpread: 0.013, pellets: 1,
    recoil: 0.058, kick: 1.45, shake: 0.34,
    falloff: [18, 46], minFactor: 0.68,
    reloadStyle: "cylinder", zoom: 0,
    desc: "Sept balles lourdes. Le barillet pardonne, lui.",
  },
  {
    id: "machete", slot: 8, name: "Machette de garde", short: "Machette",
    ammo: "lame", mag: 0, auto: false, melee: true, tier: 2, power: 2,
    headChance: 0.30, meleeStyle: "slash", meleeDur: 0.34,
    damage: 58, headMul: 2.2, cooldown: 0.32, reload: 0,
    spread: 0, moveSpread: 0, pellets: 1,
    recoil: 0.04, kick: 0.85, shake: 0.18,
    reach: 2.7,
    falloff: null, minFactor: 1,
    reloadStyle: "none", zoom: 0,
    desc: "Lame longue et rapide : trois coups le temps d'un coup de hache.",
  },  {
    id: "launcher", slot: 9, name: "Lance-grenades de la crypte", short: "Lance-grenades",
    ammo: "40mm", mag: 3, auto: false, tier: 2, power: 3, headChance: 0,
    damage: 120, headMul: 1, cooldown: 1.0, reload: 2.4,
    spread: 0.006, moveSpread: 0.014, pellets: 1,
    recoil: 0.09, kick: 1.7, shake: 0.55,
    falloff: [8, 26], minFactor: 0.9,
    splash: { radius: 5.5, edge: 0.5 },
    reloadStyle: "breech", zoom: 0,
    desc: "Une grenade qui éclate au point visé et laboure la zone. Faite pour les foules.",
  },

];

export const WEAPON_BY_ID = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

export const DEFAULT_RESERVES = { "9mm": 48, "12": 16, "5.56": 60, ".308": 8, "40mm": 4 };
export const MAX_RESERVES = { "9mm": 160, "12": 48, "5.56": 160, ".308": 40, "40mm": 18 };

export function damageAtDistance(def, dist) {
  if (!def.falloff) return def.damage;
  const [a, b] = def.falloff;
  const k = Math.min(1, Math.max(0, (dist - a) / Math.max(0.001, b - a)));
  return def.damage * (1 - k * (1 - def.minFactor));
}

/* ─────────────────────── progression : butin d'armes ─────────────────────── */

/** Armes possédées au début de la veille : le pistolet de service et la hachette. */
export const START_WEAPONS = WEAPONS.filter((w) => w.start).map((w) => w.id);

/**
 * Chance qu'un mort lâche une arme, selon la vague. Nulle à la première,
 * faible au début, meilleure en fin de veille — et doublée sur les colosses.
 */
export function weaponDropChance(wave, elite = false) {
  const w = Math.max(1, wave | 0);
  const base = w <= 1 ? 0 : w <= 3 ? 0.030 : w <= 6 ? 0.045 : w <= 9 ? 0.070 : 0.095;
  return Math.min(0.5, base * (elite ? 2.3 : 1));
}

/** Palier d'arme autorisé à tomber à cette vague (les meilleures en fin de partie). */
export function maxWeaponTier(wave) {
  const w = Math.max(1, wave | 0);
  if (w <= 3) return 1;
  if (w <= 6) return 2;
  if (w <= 8) return 3;
  return 4;
}

/** Choisit une arme autorisée à cette vague parmi celles qui manquent. */
export function pickWeapon(wave, rng, owned = []) {
  const tierMax = maxWeaponTier(wave);
  const pool = WEAPONS.filter((w) => !w.start && !owned.includes(w.id) && w.tier <= tierMax);
  if (!pool.length) return null;
  // les armes du palier le plus haut restent rares : poids divisé par le palier
  const weights = pool.map((w) => 1 / (w.tier * w.tier));
  let total = 0;
  for (const k of weights) total += k;
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i].id;
  }
  return pool[pool.length - 1].id;
}

/** Tire une arme à lâcher (ou null). `owned` évite les doublons. */
export function rollWeaponDrop(wave, rng, { owned = [], elite = false } = {}) {
  if (rng() > weaponDropChance(wave, elite)) return null;
  return pickWeapon(wave, rng, owned);
}

/** Récompense du boss : la meilleure arme encore manquante. */
export function bossWeaponRewards(owned = []) {
  const out = [];
  for (const id of ["sniper", "rifle"]) {
    if (!owned.includes(id)) out.push(id);
  }
  return out.slice(0, 1);
}

/** Chance d'abattage net sur un tir à la tête, selon l'arme et sa puissance. */
export function headshotChance(def, big = false, headMod = 1) {
  const base = def.headChance ?? 0.3;
  const mod = 1 + (Math.max(0, headMod) - 1) * 0.4;
  const chance = base * mod * (big ? 0.2 : 1);
  return Math.min(0.95, Math.max(0.02, chance));
}

/* ─────────────────────── gestes de mêlée ─────────────────────── */

const MELEE_KEYS = {
  // Hachette : armement au-dessus de l'épaule droite (manche lisible, tête en
  // arrière), puis abattage diagonal qui traverse l'écran de haut-droite vers
  // bas-gauche, et retour. rx court de -0,72 à +1,62 rad (2,34 rad d'amplitude)
  // et rz de -0,40 à +1,00 : la tête décrit un arc de ~3/4 d'écran.
  chop: [
    [0.00, {}],
    // léger repli d'armement : la main descend et recule avant de monter
    [0.14, { dx: -0.01, dy: -0.02, dz: 0.03, rx: -0.12, ry: -0.05, rz: -0.12 }],
    // armé : main haute à droite, coude ouvert, tête de hache en arrière
    [0.32, { dx: -0.02, dy: 0.16, dz: 0.06, rx: -0.72, ry: -0.22, rz: -0.40 }],
    // abattage : le fer passe par le centre et pique vers le bas
    [0.46, { dx: -0.08, dy: -0.02, dz: -0.20, rx: 0.95, ry: 0.10, rz: 0.35 }],
    // suivi : la main traverse le corps, la tête finit en bas à gauche
    [0.60, { dx: -0.22, dy: 0.08, dz: -0.16, rx: 1.62, ry: 0.25, rz: 1.00 }],
    // relevé : on ramène le fer devant soi avant de reprendre la garde
    [0.78, { dx: -0.08, dy: -0.01, dz: -0.06, rx: 0.45, ry: 0.10, rz: 0.26 }],
    [1.00, {}],
  ],
  // Machette : armement à droite lame haute (presque à l'horizontale, pointe
  // au bord de l'écran), puis revers horizontal : la lame balaie de droite à
  // gauche en passant devant la poitrine. rz passe de -1,30 à +1,10 rad, la
  // frappe elle-même tient en 0,16 de k (0,24 → 0,40), d'où le sifflement.
  slash: [
    [0.00, {}],
    // amorce : la lame recule d'un cran vers la gauche avant de partir à droite
    [0.08, { dx: 0.02, dy: -0.01, dz: 0.02, rx: -0.02, ry: 0.06, rz: 0.14 }],
    // armé à droite, lame haute et pointe vers le bord de l'écran
    [0.24, { dx: 0.02, dy: 0.15, dz: 0.02, rx: -0.06, ry: 0.30, rz: -1.30 }],
    // milieu du revers : la lame coupe l'axe du regard
    [0.34, { dx: -0.06, dy: -0.04, dz: -0.06, rx: 0.06, ry: 0.10, rz: -0.55 }],
    // fin de balayage : la lame est passée à gauche, main au centre
    [0.40, { dx: -0.14, dy: -0.06, dz: -0.10, rx: 0.10, ry: -0.18, rz: 1.10 }],
    // suivi : on tient la pose un instant, la lame continue sa course
    [0.52, { dx: -0.12, dy: -0.05, dz: -0.02, rx: 0.08, ry: -0.16, rz: 1.05 }],
    // retour à la garde, lame qui remonte
    [0.74, { dx: -0.04, dy: -0.02, dz: -0.02, rx: 0.03, ry: -0.02, rz: 0.25 }],
    [1.00, {}],
  ],
};

const smooth01 = (t) => t * t * (3 - 2 * t);

/** Écarts de pose d'une frappe de mêlée, k allant de 0 (départ) à 1 (retour). */
export function meleePose(def, k) {
  const keys = MELEE_KEYS[def.meleeStyle] || MELEE_KEYS.chop;
  const x = Math.min(1, Math.max(0, k));
  let i = 0;
  while (i < keys.length - 2 && x > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[i + 1];
  const t = smooth01(Math.min(1, Math.max(0, (x - a[0]) / Math.max(0.0001, b[0] - a[0]))));
  const out = { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 };
  for (const key of Object.keys(out)) {
    out[key] = (a[1][key] || 0) + ((b[1][key] || 0) - (a[1][key] || 0)) * t;
  }
  return out;
}



/* ─────────────────────────── matériaux ─────────────────────────── */

function makeMaterials() {
  const woodTex = rep(T.wood(), 2, 2);
  const leatherTex = rep(T.cloth(), 1, 1);
  return {
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa3a6, roughness: 0.34, metalness: 0.6 }),
    steelDark: new THREE.MeshStandardMaterial({ color: 0x4c5457, roughness: 0.44, metalness: 0.6 }),
    black: new THREE.MeshStandardMaterial({ color: 0x2c3133, roughness: 0.52, metalness: 0.4 }),
    poly: new THREE.MeshStandardMaterial({ color: 0x353b3f, roughness: 0.78, metalness: 0.1 }),
    wood: new THREE.MeshStandardMaterial({ map: woodTex, color: 0xd8b47e, roughness: 0.62, metalness: 0.02 }),
    woodDark: new THREE.MeshStandardMaterial({ map: woodTex, color: 0x9a7048, roughness: 0.7 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xc79a52, roughness: 0.32, metalness: 0.7 }),
    copper: new THREE.MeshStandardMaterial({ color: 0xa8703f, roughness: 0.36, metalness: 0.7 }),
    leather: new THREE.MeshStandardMaterial({ map: leatherTex, color: 0x463629, roughness: 0.9 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xa8927a, roughness: 0.84 }),
    tritium: new THREE.MeshStandardMaterial({ color: 0xc8fff0, emissive: 0x57ffb8, emissiveIntensity: 2.4, roughness: 0.3 }),
    lens: new THREE.MeshStandardMaterial({ color: 0x2a4450, roughness: 0.08, metalness: 0.7, emissive: 0x2c6a66, emissiveIntensity: 0.55 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe6e0, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.32 }),
  };
}

/* ─────────────────────────── petits assistants ─────────────────────────── */

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}
function boxM(w, h, d, mat, x = 0, y = 0, z = 0) {
  return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z);
}
function cylM(r1, r2, h, mat, seg = 12, axis = "z", x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  if (axis === "z") m.rotation.x = Math.PI / 2;
  else if (axis === "x") m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}
function ringM(r, tube, mat, seg = 12) {
  return new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, seg), mat);
}
function group(x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  return g;
}

/** Mains gantées : paume, doigts, manche. `side` +1 = droite. */
function makeHand(side = 1, { open = false } = {}) {
  const mats = makeHand.mats;
  const g = new THREE.Group();
  const s = side;
  g.add(boxM(0.056, 0.075, 0.095, mats.leather, 0, -0.03, 0.05));
  for (let i = 0; i < 4; i++) {
    const len = open ? 0.062 : 0.05;
    const f = boxM(0.014, 0.016, len, mats.skin, s * 0.032, -0.014 + i * 0.016, 0.055 + len * 0.35);
    f.rotation.x = open ? -0.25 : -0.05;
    g.add(f);
  }
  g.add(boxM(0.018, 0.046, 0.018, mats.skin, s * 0.034, -0.038, 0.095)); // pouce
  // manche plus fin et plus court : il occupait le tiers de l'écran et se
  // lisait comme une planche brune collée à l'arme
  const sleeve = cylM(0.038, 0.055, 0.24, mats.leather, 8);
  sleeve.rotation.x = 1.15;
  sleeve.position.set(s * 0.035, -0.128, 0.165);
  g.add(sleeve);
  const cuff = cylM(0.058, 0.058, 0.026, mats.brass, 8);
  cuff.rotation.x = 1.15;
  cuff.position.set(s * 0.035, -0.108, 0.142);
  g.add(cuff);
  g.userData.hand = true;
  return g;
}

/** Cylindre à pans nets (canon octogonal) : une normale par facette. */
function flatCyl(r1, r2, h, mat, seg = 8, axis = "z", x = 0, y = 0, z = 0) {
  const geo = new THREE.CylinderGeometry(r1, r2, h, seg, 1).toNonIndexed();
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat);
  if (axis === "z") m.rotation.x = Math.PI / 2;
  else if (axis === "x") m.rotation.z = Math.PI / 2;
  m.position.set(x, y, z);
  return m;
}

/**
 * Main refermée sur une poignée d'arme de poing, dans le repère de la poignée :
 * la paume est plaquée sur la joue `side`, les doigts se referment sur la face
 * avant (-Z), le pouce remonte le long du côté opposé. Plus petite que makeHand
 * (qui sert aux armes longues) pour ne pas masquer le modèle.
 */
function makeGripHand(side = 1, { scale = 1, gripW = 0.032, gripD = 0.050, thumb = true } = {}) {
  const mats = makeHand.mats;
  const g = new THREE.Group();
  const s = side;
  const halfW = gripW / 2;
  const front = -gripD / 2;
  // dos de la main gantée, contre la joue de la poignée
  g.add(boxM(0.019, 0.074, 0.050, mats.leather, s * (halfW + 0.0085), -0.046, 0.002));
  // quatre doigts enroulés sur la face avant
  for (let i = 0; i < 4; i++) {
    const y = -0.018 - i * 0.0158;
    g.add(cylM(0.0062, 0.0056, 0.030, mats.skin, 8, "x", s * 0.0015, y, front + 0.004));
    g.add(boxM(0.028, 0.0125, 0.011, mats.skin, s * 0.0025, y + 0.0035, front + 0.009));
    g.add(mesh(new THREE.SphereGeometry(0.0066, 8, 6), mats.skin, s * (halfW + 0.0035), y, front + 0.007));
  }
  // pouce le long du côté opposé à la paume
  if (thumb) {
    const t = cylM(0.0078, 0.0062, 0.044, mats.skin, 8, "z", -s * (halfW - 0.002), -0.022, -0.004);
    t.rotation.set(0.14, 0, s * 0.16);
    g.add(t);
    g.add(mesh(new THREE.SphereGeometry(0.0080, 8, 6), mats.skin, -s * (halfW - 0.003), -0.020, 0.015));
  }
  // poignet puis manchette de cuir, vers le tireur
  const wrist = cylM(0.027, 0.031, 0.115, mats.leather, 8, "y", s * (halfW + 0.006), -0.112, 0.028);
  wrist.rotation.x = -0.42;
  g.add(wrist);
  const cuff = cylM(0.036, 0.040, 0.048, mats.leather, 8, "y", s * (halfW + 0.011), -0.170, 0.063);
  cuff.rotation.x = -0.42;
  g.add(cuff);
  g.scale.setScalar(scale);
  g.userData.hand = true;
  return g;
}

/**
 * Pontet : boucle épaisse et détente, lisible même vue de dos (là où un simple
 * tore ne montre que son épaisseur). yTop = hauteur d'accroche à la carcasse.
 */
function addTriggerGuard(parent, M, yTop, yBot, zFront, zBack) {
  const w = 0.0105;
  const h = Math.max(0.012, yTop - yBot);
  const front = boxM(w, h, 0.0058, M.steelDark, 0, yTop - h / 2, zFront);
  parent.add(front);
  const bar = boxM(w, 0.0060, zBack - zFront, M.steelDark, 0, yBot + 0.003, (zFront + zBack) / 2);
  parent.add(bar);
  const rear = boxM(w, h, 0.0058, M.steelDark, 0, yTop - h / 2, zBack);
  parent.add(rear);
  for (const cz of [zFront + 0.0025, zBack - 0.0025]) {
    parent.add(cylM(0.0058, 0.0058, w, M.steelDark, 8, "x", 0, yBot + 0.003, cz));
  }
  // détente : suspendue à la carcasse, au centre de la boucle
  const trig = boxM(0.0070, h * 0.62, 0.0050, M.steel, 0, yTop - h * 0.33, zBack - 0.019);
  trig.rotation.x = 0.26;
  parent.add(trig);
}

/**
 * Poignée d'arme de poing : âme de noyer aux arêtes avant/arrière et au talon
 * arrondies, plaquettes quadrillées en croisillons, plaque de couche, dragonne.
 * Repère de la poignée : -Y vers le bas, -Z vers la bouche.
 */
function addGrip(parent, M, {
  y = 0.014, z = 0.030, rake = -0.30, len = 0.104, w = 0.030, d = 0.036,
  buttPlate = null, medallion = false, screw = false,
} = {}) {
  const g = group(0, y, z);
  g.rotation.x = rake;
  const top = 0.004;                 // la poignée mord sur la carcasse
  const r = d * 0.5;                 // rayon du talon
  const bodyH = len - r;
  const cy = top - bodyH / 2;        // centre de l'âme
  g.add(boxM(w, bodyH, d, M.wood, 0, cy, 0));
  // arêtes avant et arrière arrondies
  g.add(cylM(0.0072, 0.0072, bodyH - 0.002, M.wood, 8, "y", 0, cy, -(d / 2) + 0.001));
  g.add(cylM(0.0082, 0.0082, bodyH, M.wood, 8, "y", 0, cy, (d / 2) - 0.001));
  // talon arrondi
  g.add(cylM(r, r, w, M.wood, 10, "x", 0, top - bodyH, 0));
  // plaquettes quadrillées
  for (const sx of [-1, 1]) {
    g.add(boxM(0.0055, bodyH * 0.74, d * 0.84, M.woodDark, sx * (w / 2 + 0.0012), cy + 0.004, 0));
    for (let i = 0; i < 3; i++) {
      for (const rot of [0.5, -0.5]) {
        const line = boxM(0.0014, 0.029, 0.0014, M.black, sx * (w / 2 + 0.0042), cy + 0.012 - i * 0.013, 0);
        line.rotation.x = rot;
        g.add(line);
      }
    }
    if (screw) g.add(cylM(0.0028, 0.0028, 0.0024, M.brass, 6, "x", sx * (w / 2 + 0.0044), cy + 0.030, 0.003));
    if (medallion) g.add(cylM(0.0062, 0.0062, 0.0024, M.brass, 10, "x", sx * (w / 2 + 0.0042), cy + 0.008, 0.002));
  }
  if (buttPlate) g.add(boxM(w + 0.001, 0.006, d * 0.88, buttPlate, 0, top - len + 0.002, 0));
  // queue de détente : raccorde la poignée à la carcasse
  const tang = boxM(w * 0.92, 0.016, d * 0.46, M.steelDark, 0, top + 0.004, d * 0.20);
  tang.rotation.x = 0.34;
  g.add(tang);
  const loop = ringM(0.0060, 0.0017, M.brass, 8);
  loop.position.set(0, top - len + 0.001, d / 2 - 0.004);
  g.add(loop);
  parent.add(g);
  return g;
}

/**
 * Le réticule est au centre de l'écran ; la bouche du canon doit être à la même
 * hauteur (le décalage horizontal d'une arme tenue à droite reste, lui, normal).
 * On relève donc l'arme à sa position de repos : la bouche tombe sur l'axe du
 * réticule et les tirs (qui partent de la caméra) ne « mentent » plus.
 */
function alignMuzzleToSight(built) {
  const rest = built.rest;
  if (!rest || !built.muzzle) return;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rest.rot[0], rest.rot[1], rest.rot[2]));
  m.compose(new THREE.Vector3(rest.pos[0], rest.pos[1], rest.pos[2]), q, new THREE.Vector3(rest.scale ?? 1, rest.scale ?? 1, rest.scale ?? 1));
  const v = built.muzzle.clone().applyMatrix4(m);
  // on aligne la LIGNE DE MIRE (organes de visée au-dessus du canon) sur l'axe
  // du réticule : la bouche reste un peu dessous, comme il se doit. Chaque arme
  // annonce sa hauteur de mire (`sightH`) ; 3 cm par défaut.
  const sightH = built.sightH ?? 0.030;
  const lift = Math.max(-0.10, Math.min(0.10, -sightH - v.y));
  rest.pos[1] += lift;
  built.aim = { muzzleBefore: [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)], lift: +lift.toFixed(4) };
}

/* ─────────────────────────── modèles ─────────────────────────── */

function buildPistol(M) {
  const root = new THREE.Group();

  /* ── culasse (pièce mobile) : profil bas, dessus usiné ─────── */
  const slide = group(0, 0.050, 0);
  slide.add(boxM(0.032, 0.023, 0.190, M.steelDark, 0, -0.003, -0.050));
  // dessus arrondi à huit pans : la culasse n'est plus une brique
  slide.add(cylM(0.0162, 0.0162, 0.190, M.steel, 8, "z", 0, 0.010, -0.050));
  // filet poli le long des joues
  for (const sx of [-1, 1]) slide.add(boxM(0.0014, 0.0024, 0.160, M.steel, sx * 0.0163, 0.0035, -0.056));
  // fenêtre d'éjection (côté droit) + extracteur
  slide.add(boxM(0.0035, 0.013, 0.038, M.black, 0.0158, 0.004, -0.028));
  slide.add(boxM(0.0045, 0.0045, 0.020, M.steel, 0.0145, 0.0125, 0.006));
  // stries de préhension arrière, des deux côtés
  for (let i = 0; i < 7; i++) slide.add(boxM(0.0328, 0.020, 0.0020, M.black, 0, -0.003, 0.004 + i * 0.0056));
  // guidon + pastille tritium tournée vers le tireur
  slide.add(boxM(0.0050, 0.009, 0.011, M.steelDark, 0, 0.0255, -0.1365));
  slide.add(boxM(0.0030, 0.0030, 0.0016, M.tritium, 0, 0.0275, -0.1302));
  // hausse : deux cornes, cran central, deux pastilles
  for (const sx of [-1, 1]) {
    slide.add(boxM(0.0080, 0.0065, 0.010, M.steelDark, sx * 0.0100, 0.0268, 0.0375));
    slide.add(boxM(0.0028, 0.0028, 0.0016, M.tritium, sx * 0.0100, 0.0285, 0.0428));
  }
  slide.add(boxM(0.0110, 0.0045, 0.010, M.steelDark, 0, 0.0238, 0.0375));
  root.add(slide);

  /* ── carcasse : devant, rail, boîtier de détente ───────────── */
  root.add(boxM(0.026, 0.016, 0.146, M.black, 0, 0.030, -0.048));
  root.add(boxM(0.022, 0.006, 0.140, M.steelDark, 0, 0.019, -0.048));
  for (let i = 0; i < 3; i++) root.add(boxM(0.021, 0.003, 0.009, M.black, 0, 0.0166, -0.100 + i * 0.016));
  root.add(boxM(0.028, 0.026, 0.064, M.black, 0, 0.030, 0.019));
  // talon de crosse
  const tail = boxM(0.027, 0.0065, 0.028, M.steelDark, 0, 0.0455, 0.050);
  tail.rotation.x = 0.20;
  root.add(tail);
  // arrêtoir de culasse et axe de démontage (côté visible)
  root.add(boxM(0.0040, 0.0070, 0.028, M.steel, -0.0158, 0.030, -0.004));
  root.add(cylM(0.0036, 0.0036, 0.0032, M.steel, 8, "x", -0.0152, 0.026, -0.034));

  /* ── pontet, détente ───────────────────────────────────────── */
  addTriggerGuard(root, M, 0.020, -0.018, -0.026, 0.030);

  /* ── canon, couronne, âme ──────────────────────────────────── */
  root.add(cylM(0.0090, 0.0090, 0.014, M.steel, 12, "z", 0, 0.050, -0.146));
  const crown = ringM(0.0090, 0.0016, M.steelDark, 12);
  crown.position.set(0, 0.050, -0.1520);
  root.add(crown);
  const boreHole = mesh(new THREE.CircleGeometry(0.0052, 12), M.black, 0, 0.050, -0.1535);
  boreHole.rotation.y = Math.PI;
  root.add(boreHole);

  /* ── poignée de noyer : arêtes arrondies, plaquettes quadrillées */
  const grip = addGrip(root, M, {
    y: 0.014, z: 0.030, rake: -0.30, len: 0.104, w: 0.030, d: 0.036,
    buttPlate: M.black, screw: true,
  });

  /* ── chargeur (pièce mobile : descend au rechargement) ─────── */
  const mag = group(0, 0.014, 0.030);
  mag.rotation.x = -0.30;
  mag.add(boxM(0.020, 0.092, 0.030, M.steelDark, 0, -0.048, 0.000));
  mag.add(boxM(0.028, 0.0065, 0.040, M.black, 0, -0.098, 0.000));
  root.add(mag);

  /* ── chien (pièce mobile) ──────────────────────────────────── */
  const hammer = group(0, 0.0445, 0.0455);
  hammer.rotation.x = 0.30;
  hammer.add(boxM(0.0075, 0.020, 0.008, M.steelDark, 0, 0.004, -0.002));
  const spur = boxM(0.0095, 0.005, 0.020, M.steelDark, 0, 0.0155, -0.009);
  spur.rotation.x = 0.55;
  hammer.add(spur);
  for (let i = 0; i < 3; i++) hammer.add(boxM(0.0100, 0.0014, 0.0020, M.black, 0, 0.0185, -0.005 - i * 0.0034));
  root.add(hammer);

  /* ── main : une seule main, crispée sur la poignée ─────────── */
  const right = makeGripHand(1, { scale: 0.92, gripW: 0.036, gripD: 0.052 });
  right.position.set(0, 0.014, 0.030);
  right.rotation.x = -0.30;
  root.add(right);

  return {
    group: root,
    slide, mag, hammer,
    sightH: 0.030,
    muzzle: new THREE.Vector3(0, 0.050, -0.152),
    eject: new THREE.Vector3(0.030, 0.062, -0.010),
    rest: { pos: [0.155, -0.100, -0.550], rot: [0.02, 0.26, 0.015], scale: 1.05 },
  };
}

function buildShotgun(M) {
  const root = new THREE.Group();
  // canon long + bande de ventilations
  root.add(cylM(0.017, 0.019, 0.85, M.steelDark, 12, "z", 0, 0, -0.47));
  const rib = group(0, 0.022, -0.45);
  for (let i = 0; i < 9; i++) rib.add(boxM(0.02, 0.004, 0.055, M.steel, 0, 0, -i * 0.055));
  root.add(rib);
  // guidon sphérique
  const bead = mesh(new THREE.SphereGeometry(0.007, 8, 6), M.brass, 0, 0.032, -0.845);
  root.add(bead);
  // boîtier
  root.add(boxM(0.062, 0.075, 0.24, M.black, 0, 0.0, -0.02));
  root.add(boxM(0.066, 0.014, 0.2, M.steelDark, 0, 0.036, -0.03));
  // tube magasin
  root.add(cylM(0.016, 0.016, 0.6, M.steelDark, 10, "z", 0, -0.038, -0.38));
  root.add(boxM(0.03, 0.03, 0.05, M.steel, 0, -0.036, -0.66)); // embout
  // pompe cannelée
  const pump = group(0, -0.042, -0.3);
  pump.add(boxM(0.062, 0.05, 0.19, M.woodDark, 0, 0, 0));
  for (let i = 0; i < 7; i++) pump.add(boxM(0.064, 0.006, 0.012, M.wood, 0, 0.024, -0.07 + i * 0.022));
  root.add(pump);
  // crosse noyer + busc + plaque
  const stock = group(0, -0.008, 0.24);
  stock.rotation.x = 0.09;
  stock.add(boxM(0.05, 0.085, 0.26, M.wood, 0, -0.02, 0.12));
  stock.add(boxM(0.052, 0.062, 0.16, M.wood, 0, 0.02, 0.02));
  stock.add(boxM(0.056, 0.095, 0.016, M.black, 0, -0.022, 0.25));
  stock.add(boxM(0.052, 0.012, 0.1, M.leather, 0, 0.05, 0.05)); // busc
  root.add(stock);
  // poignée
  const grip = group(0, -0.075, 0.085);
  grip.rotation.x = -0.25;
  grip.add(boxM(0.042, 0.11, 0.06, M.woodDark, 0, -0.03, 0));
  root.add(grip);
  // pontet
  const guard = ringM(0.032, 0.006, M.steelDark, 10);
  guard.rotation.set(0, Math.PI / 2, 0.15);
  guard.position.set(0, -0.05, 0.05);
  root.add(guard);
  root.add(boxM(0.007, 0.03, 0.009, M.black, 0, -0.035, 0.046));
  // porte-cartouches sur la crosse (3 douilles)
  for (let i = 0; i < 3; i++) {
    const sh = cylM(0.0095, 0.0095, 0.055, M.brass, 8);
    sh.rotation.x = 0.2;
    sh.position.set(0.034, -0.02 + i * 0.024, 0.18);
    root.add(sh);
  }
  // dragonne
  root.add(boxM(0.012, 0.005, 0.2, M.leather, 0.03, -0.03, 0.14));

  const right = makeHand(1);
  right.position.set(0.008, -0.08, 0.09);
  right.rotation.set(-0.2, 0, 0);
  root.add(right);
  const left = makeHand(-1, { open: true });
  left.position.set(-0.01, -0.055, -0.3);
  left.rotation.set(-0.1, 0.15, 0);
  root.add(left);

  return {
    group: root,
    pump, mag: pump,
    muzzle: new THREE.Vector3(0, 0, -0.905),
    eject: new THREE.Vector3(0.04, 0.03, -0.08),
    rest: { pos: [0.19, -0.125, -0.670], rot: [0.03, 0.17, 0.02], scale: 0.62 },
  };
}


function buildLauncher(M) {
  const root = new THREE.Group();
  // tube épais, bouche évasée
  root.add(cylM(0.032, 0.036, 0.52, M.steelDark, 14, "z", 0, 0.01, -0.3));
  root.add(cylM(0.044, 0.038, 0.06, M.black, 14, "z", 0, 0.01, -0.56));
  // barillet basculant (2 coups)
  const drum = group(0, -0.005, 0.02);
  drum.add(cylM(0.052, 0.052, 0.16, M.steel, 14, "z", 0, 0, 0));
  drum.add(cylM(0.02, 0.02, 0.17, M.black, 10, "z", 0.024, 0.0, 0));
  drum.add(cylM(0.02, 0.02, 0.17, M.black, 10, "z", -0.024, 0.0, 0));
  root.add(drum);
  // carcasse + rail
  root.add(boxM(0.07, 0.06, 0.22, M.black, 0, 0.03, 0.05));
  root.add(boxM(0.05, 0.012, 0.2, M.steelDark, 0, 0.064, 0.04));
  // hausse + guidon
  root.add(boxM(0.03, 0.022, 0.014, M.steel, 0, 0.082, 0.14));
  root.add(boxM(0.012, 0.02, 0.012, M.brass, 0, 0.05, -0.5));
  // poignée pistolet + pontet
  const grip = group(0, -0.065, 0.1);
  grip.rotation.x = -0.18;
  grip.add(boxM(0.04, 0.11, 0.055, M.woodDark, 0, -0.03, 0));
  root.add(grip);
  const guard = ringM(0.03, 0.006, M.steelDark, 10);
  guard.rotation.set(0, Math.PI / 2, 0.12);
  guard.position.set(0, -0.045, 0.03);
  root.add(guard);
  // crosse squelettique
  const stock = group(0, -0.01, 0.22);
  stock.add(boxM(0.018, 0.03, 0.24, M.steelDark, 0.035, 0.01, 0));
  stock.add(boxM(0.018, 0.03, 0.24, M.steelDark, -0.035, 0.01, 0));
  stock.add(boxM(0.09, 0.075, 0.02, M.black, 0, -0.01, 0.12));
  root.add(stock);
  // deux grenades visibles sur le côté
  for (let i = 0; i < 2; i++) {
    const g = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), M.olive || M.brass);
    g.position.set(0.055, -0.02 + i * 0.035, 0.06);
    root.add(g);
  }
  const right = makeHand(1);
  right.position.set(0.01, -0.075, 0.1);
  right.rotation.set(-0.22, 0, 0);
  root.add(right);
  const left = makeHand(-1, { open: true });
  left.position.set(-0.005, -0.05, -0.16);
  left.rotation.set(-0.08, 0.2, 0);
  root.add(left);

  return {
    group: root,
    drum,
    muzzle: new THREE.Vector3(0, 0.01, -0.6),
    eject: new THREE.Vector3(0.05, 0.02, 0.04),
    rest: { pos: [0.2, -0.14, -0.650], rot: [0.02, 0.14, 0.02], scale: 0.66 },
  };
}

function buildSmg(M) {
  const root = new THREE.Group();
  // boîtier estampé
  root.add(boxM(0.055, 0.075, 0.30, M.steelDark, 0, 0.015, -0.02));
  root.add(boxM(0.058, 0.016, 0.28, M.black, 0, 0.052, -0.02));
  // garde-main perforé
  const shroud = group(0, 0.02, -0.24);
  shroud.add(cylM(0.026, 0.026, 0.18, M.steelDark, 12));
  for (let i = 0; i < 4; i++) {
    const r = ringM(0.027, 0.005, M.steel, 12);
    r.position.z = 0.07 - i * 0.045;
    shroud.add(r);
  }
  root.add(shroud);
  // canon
  root.add(cylM(0.011, 0.011, 0.2, M.steel, 10, "z", 0, 0.02, -0.35));
  // frein de bouche
  const brake = group(0, 0.02, -0.44);
  for (let i = 0; i < 3; i++) brake.add(boxM(0.03, 0.008, 0.01, M.steel, 0, 0.014, -i * 0.014));
  root.add(brake);
  // chargeur droit long
  const mag = group(0, -0.03, 0.04);
  mag.rotation.x = 0.1;
  mag.add(boxM(0.03, 0.19, 0.045, M.black, 0, -0.095, 0));
  mag.add(boxM(0.034, 0.008, 0.05, M.steelDark, 0, -0.19, 0));
  for (let i = 0; i < 4; i++) mag.add(boxM(0.032, 0.004, 0.046, M.steelDark, 0, -0.04 - i * 0.037, 0));
  root.add(mag);
  // poignée pistolet
  const grip = group(0, -0.05, 0.1);
  grip.rotation.x = -0.26;
  grip.add(boxM(0.04, 0.1, 0.055, M.poly, 0, -0.03, 0));
  for (let i = 0; i < 4; i++) grip.add(boxM(0.042, 0.005, 0.05, M.black, 0, -0.06 + i * 0.018, 0));
  root.add(grip);
  // crosse squelette repliée
  const stock = group(0, 0.01, 0.16);
  stock.add(cylM(0.007, 0.007, 0.22, M.steel, 8, "z", 0, 0, 0.1));
  stock.add(boxM(0.04, 0.07, 0.012, M.steelDark, 0, -0.03, 0.21));
  stock.add(cylM(0.006, 0.006, 0.05, M.steel, 8, "y", 0, -0.03, 0));
  root.add(stock);
  // organes de visée
  root.add(boxM(0.006, 0.02, 0.008, M.steel, 0, 0.062, -0.34));
  const rear = group(0, 0.062, 0.06);
  rear.add(boxM(0.028, 0.012, 0.012, M.steelDark));
  rear.add(boxM(0.006, 0.006, 0.006, M.tritium, 0.01, 0.006, 0));
  rear.add(boxM(0.006, 0.006, 0.006, M.tritium, -0.01, 0.006, 0));
  root.add(rear);
  // levier d'armement latéral
  root.add(boxM(0.012, 0.012, 0.04, M.steel, 0.033, 0.03, -0.10));
  root.add(boxM(0.018, 0.008, 0.014, M.black, 0.04, 0.03, -0.08));

  const right = makeHand(1);
  right.position.set(0.008, -0.055, 0.1);
  right.rotation.set(-0.18, 0, 0);
  root.add(right);
  const left = makeHand(-1, { open: true });
  left.position.set(-0.045, -0.045, -0.25);
  left.rotation.set(-0.15, 0.35, 0);
  root.add(left);

  return {
    group: root,
    mag, bolt: root.children[0],
    muzzle: new THREE.Vector3(0, 0.02, -0.46),
    eject: new THREE.Vector3(0.035, 0.04, -0.02),
    rest: { pos: [0.175, -0.115, -0.550], rot: [0.02, 0.18, 0.02], scale: 0.82 },
  };
}

function buildRifle(M) {
  const root = new THREE.Group();
  // boîtier supérieur / inférieur
  root.add(boxM(0.058, 0.07, 0.34, M.steelDark, 0, 0.02, -0.02));
  root.add(boxM(0.055, 0.055, 0.2, M.black, 0, -0.025, 0.02));
  // rail picatinny
  const rail = group(0, 0.06, -0.02);
  for (let i = 0; i < 9; i++) rail.add(boxM(0.03, 0.008, 0.012, M.steel, 0, 0, -i * 0.024));
  root.add(rail);
  // garde-main ventilé
  const hand = group(0, 0.015, -0.31);
  hand.add(boxM(0.06, 0.062, 0.28, M.poly, 0, 0, 0));
  for (let i = 0; i < 6; i++) {
    hand.add(boxM(0.062, 0.012, 0.028, M.black, 0, 0.02, -0.1 + i * 0.038));
    hand.add(boxM(0.066, 0.008, 0.024, M.black, 0, -0.024, -0.1 + i * 0.038));
  }
  root.add(hand);
  // canon + guidon
  root.add(cylM(0.013, 0.013, 0.42, M.steelDark, 10, "z", 0, 0.02, -0.57));
  root.add(cylM(0.018, 0.018, 0.05, M.steel, 10, "z", 0, 0.02, -0.80));
  const brake = group(0, 0.02, -0.84);
  brake.add(cylM(0.024, 0.024, 0.06, M.steel, 10));
  brake.add(boxM(0.03, 0.006, 0.004, M.black, 0, 0.023, 0));
  root.add(brake);
  root.add(boxM(0.008, 0.05, 0.018, M.steelDark, 0, 0.075, -0.55)); // guidon
  // bloc de gaz
  root.add(boxM(0.035, 0.03, 0.04, M.steel, 0, 0.045, -0.44));
  // chargeur courbe (3 segments)
  const mag = group(0, -0.05, 0.03);
  for (let i = 0; i < 3; i++) {
    const seg = boxM(0.036, 0.062, 0.052, M.black, 0, -0.03 - i * 0.052, -0.006 + i * 0.011);
    seg.rotation.x = -0.06 - i * 0.1;
    mag.add(seg);
  }
  mag.add(boxM(0.04, 0.008, 0.06, M.steelDark, 0, -0.2, 0.035));
  root.add(mag);
  // poignée pistolet
  const grip = group(0, -0.06, 0.12);
  grip.rotation.x = -0.28;
  grip.add(boxM(0.04, 0.105, 0.052, M.poly, 0, -0.03, 0));
  for (let i = 0; i < 5; i++) grip.add(boxM(0.042, 0.005, 0.046, M.black, 0, -0.06 + i * 0.017, 0));
  root.add(grip);
  // crosse télescopique
  const stock = group(0, 0.015, 0.2);
  stock.add(cylM(0.018, 0.018, 0.18, M.steelDark, 10, "z", 0, 0, 0.06));
  stock.add(boxM(0.038, 0.075, 0.11, M.poly, 0, -0.01, 0.17));
  stock.add(boxM(0.04, 0.06, 0.014, M.black, 0, -0.012, 0.23));
  root.add(stock);
  // pontet + détente
  const guard = ringM(0.03, 0.005, M.steelDark, 10);
  guard.rotation.set(0, Math.PI / 2, 0.16);
  guard.position.set(0, -0.055, 0.075);
  root.add(guard);
  root.add(boxM(0.006, 0.026, 0.008, M.black, 0, -0.038, 0.07));
  // lunette point rouge
  const optic = group(0, 0.082, -0.02);
  optic.add(cylM(0.022, 0.022, 0.1, M.black, 12));
  optic.add(cylM(0.026, 0.022, 0.02, M.steelDark, 12, "z", 0, 0, -0.055));
  optic.add(mesh(new THREE.CircleGeometry(0.019, 16), M.lens, 0, 0, -0.062));
  optic.add(boxM(0.012, 0.02, 0.02, M.steelDark, 0, -0.022, 0));
  optic.add(boxM(0.008, 0.008, 0.004, M.tritium, 0, 0, -0.064));
  root.add(optic);
  // levier d'armement + fenêtre
  root.add(boxM(0.012, 0.014, 0.03, M.steel, 0.033, 0.045, 0.05));
  root.add(boxM(0.02, 0.024, 0.07, M.black, 0.03, 0.025, -0.02));

  const right = makeHand(1);
  right.position.set(0.008, -0.07, 0.12);
  right.rotation.set(-0.2, 0, 0);
  root.add(right);
  const left = makeHand(-1, { open: true });
  left.position.set(-0.01, -0.045, -0.32);
  left.rotation.set(-0.12, 0.18, 0);
  root.add(left);

  return {
    group: root,
    mag, bolt: root.children[0],
    muzzle: new THREE.Vector3(0, 0.02, -0.875),
    eject: new THREE.Vector3(0.04, 0.05, 0.0),
    rest: { pos: [0.185, -0.12, -0.610], rot: [0.02, 0.17, 0.015], scale: 0.74 },
  };
}

function buildSniper(M) {
  const root = new THREE.Group();
  // boîtier
  root.add(boxM(0.052, 0.06, 0.36, M.steelDark, 0, 0.01, 0.0));
  root.add(boxM(0.05, 0.03, 0.3, M.black, 0, -0.035, 0.02));
  // canon lourd + frein
  root.add(cylM(0.016, 0.02, 0.72, M.steel, 14, "z", 0, 0.015, -0.5));
  const brake = group(0, 0.015, -0.88);
  brake.add(cylM(0.026, 0.026, 0.08, M.steelDark, 12));
  for (let i = 0; i < 3; i++) brake.add(boxM(0.034, 0.007, 0.012, M.steel, 0, 0.024, -0.03 + i * 0.024));
  root.add(brake);
  // fût en noyer
  const fore = group(0, -0.005, -0.31);
  fore.add(boxM(0.06, 0.055, 0.38, M.wood, 0, 0, 0));
  fore.add(boxM(0.058, 0.012, 0.3, M.woodDark, 0, -0.022, -0.02));
  for (let i = 0; i < 3; i++) fore.add(boxM(0.062, 0.006, 0.02, M.leather, 0, -0.028, -0.08 + i * 0.09));
  root.add(fore);
  // crosse + busc + plaque
  const stock = group(0, -0.005, 0.24);
  stock.rotation.x = 0.06;
  stock.add(boxM(0.052, 0.08, 0.3, M.wood, 0, -0.02, 0.12));
  stock.add(boxM(0.05, 0.05, 0.14, M.wood, 0, 0.03, 0.03));
  stock.add(boxM(0.056, 0.09, 0.014, M.black, 0, -0.02, 0.27));
  stock.add(boxM(0.054, 0.05, 0.16, M.leather, 0, 0.05, 0.12)); // appui-joue
  stock.add(boxM(0.056, 0.03, 0.06, M.woodDark, 0, -0.06, 0.2));
  root.add(stock);
  // poignée
  const grip = group(0, -0.07, 0.12);
  grip.rotation.x = -0.26;
  grip.add(boxM(0.042, 0.11, 0.056, M.woodDark, 0, -0.03, 0));
  for (let i = 0; i < 4; i++) grip.add(boxM(0.044, 0.005, 0.05, M.black, 0, -0.06 + i * 0.018, 0));
  root.add(grip);
  // pontet
  const guard = ringM(0.03, 0.005, M.steelDark, 10);
  guard.rotation.set(0, Math.PI / 2, 0.14);
  guard.position.set(0, -0.06, 0.08);
  root.add(guard);
  root.add(boxM(0.006, 0.028, 0.008, M.black, 0, -0.04, 0.075));
  // lunette : tube, cloches, lentilles, tourelles, colliers
  const scope = group(0, 0.092, -0.06);
  scope.add(cylM(0.028, 0.028, 0.3, M.black, 14));
  scope.add(cylM(0.044, 0.032, 0.07, M.steelDark, 14, "z", 0, 0, -0.18));
  scope.add(cylM(0.034, 0.026, 0.06, M.steelDark, 14, "z", 0, 0, 0.17));
  const lens = mesh(new THREE.CircleGeometry(0.04, 18), M.lens, 0, 0, -0.216);
  scope.add(lens);
  scope.add(cylM(0.014, 0.014, 0.036, M.steelDark, 10, "y", 0, 0.03, 0));
  scope.add(cylM(0.012, 0.012, 0.03, M.steel, 10, "x", 0.028, 0, 0));
  for (const zz of [-0.11, 0.09]) {
    const ring = ringM(0.032, 0.007, M.steelDark, 12);
    ring.position.z = zz;
    scope.add(ring);
    scope.add(boxM(0.018, 0.035, 0.02, M.steelDark, 0, -0.035, zz));
  }
  root.add(scope);
  // verrou / levier de culasse
  const bolt = group(0.028, 0.03, 0.1);
  bolt.add(cylM(0.008, 0.008, 0.05, M.steel, 8, "x"));
  bolt.add(mesh(new THREE.SphereGeometry(0.014, 8, 6), M.steelDark, 0.03, 0, 0));
  root.add(bolt);
  // chargeur + bipied replié
  const mag = group(0, -0.055, 0.03);
  mag.add(boxM(0.036, 0.09, 0.055, M.steelDark, 0, -0.05, 0));
  mag.add(boxM(0.04, 0.01, 0.06, M.black, 0, -0.098, 0));
  root.add(mag);
  const bipod = group(0, -0.015, -0.6);
  for (const s of [-1, 1]) {
    const leg = cylM(0.006, 0.006, 0.22, M.steelDark, 6, "y");
    leg.position.set(s * 0.03, -0.1, 0.03);
    leg.rotation.z = s * 0.32;
    bipod.add(leg);
  }
  root.add(bipod);

  const right = makeHand(1);
  right.position.set(0.008, -0.075, 0.12);
  right.rotation.set(-0.2, 0, 0);
  root.add(right);
  const left = makeHand(-1, { open: true });
  left.position.set(-0.01, -0.03, -0.33);
  left.rotation.set(-0.08, 0.2, 0);
  root.add(left);

  return {
    group: root,
    bolt, mag,
    muzzle: new THREE.Vector3(0, 0.015, -0.93),
    eject: new THREE.Vector3(0.045, 0.05, 0.02),
    rest: { pos: [0.19, -0.13, -0.670], rot: [0.02, 0.16, 0.02], scale: 0.64 },
  };
}

function buildHatchet(M) {
  const root = new THREE.Group();
  // manche en noyer, grip cuir, dragonne
  const handle = group(0, 0, 0);
  handle.rotation.x = 0.06;
  handle.add(cylM(0.016, 0.019, 0.46, M.wood, 10, "y", 0, 0.02, 0));
  for (let i = 0; i < 6; i++) handle.add(cylM(0.021, 0.021, 0.012, M.leather, 10, "y", 0, -0.13 + i * 0.034, 0));
  handle.add(cylM(0.024, 0.024, 0.01, M.brass, 10, "y", 0, 0.24, 0));
  root.add(handle);
  // tête : œil, joue, tranchant, talon
  const head = group(0, 0.245, 0);
  head.add(boxM(0.055, 0.055, 0.06, M.steelDark, 0, 0, 0));
  head.add(boxM(0.05, 0.07, 0.05, M.steel, 0.035, 0, 0));
  const blade = boxM(0.055, 0.1, 0.012, M.steel, 0.075, -0.005, 0);
  blade.rotation.z = -0.22;
  head.add(blade);
  head.add(boxM(0.02, 0.075, 0.03, M.steelDark, -0.04, 0, 0)); // talon
  head.add(boxM(0.008, 0.056, 0.014, M.tritium, 0.006, 0.03, 0)); // repère
  root.add(head);
  // lanière
  const strap = ringM(0.02, 0.004, M.leather, 10);
  strap.position.set(0, -0.23, 0);
  strap.rotation.y = Math.PI / 2;
  root.add(strap);

  const right = makeHand(1);
  right.position.set(0.006, -0.12, 0.0);
  right.rotation.set(0, 0.2, 0.1);
  root.add(right);

  return {
    group: root,
    head, handle,
    muzzle: new THREE.Vector3(0.06, 0.24, 0),
    eject: new THREE.Vector3(0, 0, 0),
    rest: { pos: [0.21, -0.15, -0.510], rot: [0.06, 0.46, -0.18], scale: 0.9 },
  };
}

function buildRevolver(M) {
  const root = new THREE.Group();
  const boreY = 0.044;

  /* ── canon octogonal, nervure, guidon ─────────────────────── */
  const barrel = group(0, boreY, 0);
  barrel.add(flatCyl(0.0112, 0.0112, 0.170, M.steelDark, 8, "z", 0, 0, -0.090));
  barrel.add(boxM(0.0105, 0.0055, 0.168, M.steelDark, 0, 0.0122, -0.090));
  barrel.add(boxM(0.0075, 0.0012, 0.166, M.black, 0, 0.0152, -0.090));
  // guidon à rampe + pastille tritium
  barrel.add(boxM(0.0045, 0.011, 0.0135, M.steelDark, 0, 0.0195, -0.1625));
  barrel.add(boxM(0.0032, 0.0032, 0.0022, M.tritium, 0, 0.0220, -0.1570));
  // logement de la tige d'extracteur sous le canon
  barrel.add(boxM(0.0185, 0.0155, 0.100, M.steelDark, 0, -0.0148, -0.100));
  barrel.add(boxM(0.0195, 0.0028, 0.098, M.steel, 0, -0.0078, -0.100));
  // tige d'extracteur + tête moletée
  barrel.add(cylM(0.0034, 0.0034, 0.072, M.steel, 8, "z", 0, -0.0148, -0.136));
  barrel.add(cylM(0.0052, 0.0052, 0.011, M.steel, 10, "z", 0, -0.0148, -0.1655));
  // bouche : couronne + âme
  const crown = ringM(0.0070, 0.0013, M.steel, 12);
  crown.position.set(0, 0, -0.1755);
  barrel.add(crown);
  const boreHole = mesh(new THREE.CircleGeometry(0.0056, 12), M.black, 0, 0, -0.1760);
  boreHole.rotation.y = Math.PI;
  barrel.add(boreHole);
  root.add(barrel);

  /* ── barillet : six chambres, rainures, culasses ───────────── */
  const drum = group(0, 0.0255, 0.0215);
  drum.add(cylM(0.0215, 0.0215, 0.044, M.steel, 20, "z", 0, 0, 0));
  for (const z of [-0.0205, 0.0205]) {
    const rim = ringM(0.0198, 0.0014, M.steelDark, 20);
    rim.position.z = z;
    drum.add(rim);
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 2;
    const cx = Math.cos(a) * 0.0146;
    const cy = Math.sin(a) * 0.0146;
    // âme de chambre visible sur les deux faces
    drum.add(cylM(0.0042, 0.0042, 0.0448, M.black, 10, "z", cx, cy, 0));
    // culasse de laiton côté tireur
    drum.add(cylM(0.0054, 0.0054, 0.0024, M.brass, 10, "z", cx, cy, 0.0216));
    drum.add(cylM(0.0018, 0.0018, 0.0012, M.steelDark, 6, "z", cx, cy, 0.0231));
  }
  // rainures entre les chambres
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 2 + Math.PI / 6;
    const fx = Math.cos(a) * 0.0208;
    const fy = Math.sin(a) * 0.0208;
    const flute = boxM(0.0035, 0.0075, 0.034, M.steelDark, fx, fy, 0);
    flute.rotation.z = a;
    drum.add(flute);
  }
  // rochet d'entraînement
  drum.add(cylM(0.0075, 0.0075, 0.004, M.steelDark, 10, "z", 0, 0, 0.0228));
  root.add(drum);

  /* ── carcasse : bas de fenêtre, bandeau, plaque de tir ─────── */
  root.add(boxM(0.023, 0.018, 0.090, M.steelDark, 0, -0.004, 0.014));
  root.add(boxM(0.025, 0.0030, 0.090, M.steel, 0, -0.0135, 0.014));
  root.add(boxM(0.021, 0.034, 0.014, M.steelDark, 0, 0.009, -0.028));
  root.add(boxM(0.025, 0.009, 0.075, M.steelDark, 0, 0.052, 0.021));
  root.add(boxM(0.025, 0.050, 0.013, M.steelDark, 0, 0.032, 0.0545));
  // hausse : embase, deux cornes, cran, deux pastilles
  root.add(boxM(0.023, 0.006, 0.012, M.steelDark, 0, 0.0550, 0.0475));
  for (const sx of [-1, 1]) {
    root.add(boxM(0.0075, 0.0060, 0.009, M.steelDark, sx * 0.0095, 0.0610, 0.0475));
    root.add(boxM(0.0028, 0.0028, 0.0016, M.tritium, sx * 0.0095, 0.0605, 0.0522));
  }
  root.add(boxM(0.0105, 0.0035, 0.009, M.steelDark, 0, 0.0605, 0.0475));
  // verrou de barillet (côté visible)
  root.add(boxM(0.0050, 0.0085, 0.022, M.steel, -0.0135, 0.028, 0.030));

  /* ── pontet, détente ───────────────────────────────────────── */
  addTriggerGuard(root, M, 0.002, -0.040, 0.008, 0.060);

  /* ── chien (pièce mobile) ──────────────────────────────────── */
  const hammer = group(0, 0.048, 0.064);
  hammer.rotation.x = 0.42;
  hammer.add(boxM(0.0075, 0.022, 0.009, M.steelDark, 0, 0.004, -0.003));
  const spur = boxM(0.0105, 0.005, 0.022, M.steelDark, 0, 0.0165, -0.011);
  spur.rotation.x = 0.62;
  hammer.add(spur);
  for (let i = 0; i < 4; i++) hammer.add(boxM(0.0110, 0.0014, 0.0018, M.black, 0, 0.0190 - i * 0.0012, -0.007 - i * 0.0032));
  root.add(hammer);

  /* ── poignée de noyer, plaquettes quadrillées, médaille ────── */
  addGrip(root, M, {
    y: -0.004, z: 0.052, rake: -0.36, len: 0.100, w: 0.028, d: 0.038,
    buttPlate: M.brass, medallion: true,
  });

  /* ── deux mains : la gauche vient épauler la droite ────────── */
  const right = makeGripHand(1, { scale: 0.92, gripW: 0.034, gripD: 0.053 });
  right.position.set(0, -0.004, 0.052);
  right.rotation.x = -0.36;
  root.add(right);
  const left = makeGripHand(-1, { scale: 0.88, gripW: 0.034, gripD: 0.053, thumb: false });
  left.position.set(-0.004, -0.020, 0.056);
  left.rotation.set(-0.30, -0.10, 0.05);
  root.add(left);

  return {
    group: root,
    drum, hammer,
    sightH: 0.020,
    muzzle: new THREE.Vector3(0, boreY, -0.176),
    eject: new THREE.Vector3(0.030, 0.058, 0.030),
    rest: { pos: [0.155, -0.100, -0.550], rot: [0.02, 0.28, 0.02], scale: 0.95 },
  };
}

function buildMachete(M) {
  const root = new THREE.Group();
  // manche de garde, plaquettes de bois, rivets
  const handle = group(0, -0.04, 0);
  handle.add(cylM(0.017, 0.02, 0.19, M.wood, 10, "y", 0, 0, 0));
  for (const sx of [-1, 1]) handle.add(boxM(0.008, 0.16, 0.036, M.woodDark, sx * 0.016, 0, 0));
  for (let i = 0; i < 3; i++) handle.add(cylM(0.005, 0.005, 0.042, M.brass, 6, "x", 0, -0.06 + i * 0.06, 0));
  handle.add(cylM(0.026, 0.026, 0.012, M.brass, 10, "y", 0, 0.1, 0));
  root.add(handle);

  // lame longue, dos épais, tranchant clair
  const blade = group(0, 0.12, 0);
  blade.add(boxM(0.014, 0.44, 0.062, M.steel, 0, 0.22, 0));
  blade.add(boxM(0.008, 0.44, 0.012, M.steelDark, 0, 0.22, -0.036));
  blade.add(boxM(0.004, 0.42, 0.008, M.tritium, 0, 0.23, 0.033));
  blade.add(boxM(0.016, 0.05, 0.07, M.steelDark, 0, -0.005, 0));
  blade.rotation.z = -0.06;
  root.add(blade);

  const right = makeHand(1);
  right.position.set(0.004, -0.11, 0.0);
  right.rotation.set(0, 0.22, 0.12);
  root.add(right);

  return {
    group: root,
    blade,
    handle,
    muzzle: new THREE.Vector3(0.02, 0.55, 0),
    eject: new THREE.Vector3(0, 0, 0),
    rest: { pos: [0.23, -0.19, -0.490], rot: [0.10, 0.5, -0.22], scale: 0.94 },
  };
}

const BUILDERS = {
  pistol: buildPistol,
  shotgun: buildShotgun,
  launcher: buildLauncher,
  smg: buildSmg,
  rifle: buildRifle,
  sniper: buildSniper,
  hatchet: buildHatchet,
  revolver: buildRevolver,
  machete: buildMachete,
};

/**
 * Remplace les view-models procéduraux par les GLB du pack Blender (v4).
 *
 * Le pack est modélisé à l'échelle réelle, origine à la poignée, canon vers -Z :
 * c'est déjà le repère des view-models procéduraux. Chaque arme reçoit donc une
 * pose explicite (src/entities/weapon_poses.js) — position, orientation,
 * échelle — et une attache de mains (paire SM_Bras_FPS ou main droite seule).
 *
 * Le groupe rendu garde la structure attendue par le joueur : `group` est
 * animé (repos, recul, rechargement), `align` porte l'échelle du GLB et les
 * mains. Retourne les modèles remplacés, à swapper dans la scène de vue.
 */
export async function loadGlbWeaponModels(models, opts = {}) {
  const poses = opts.poses || GLB_POSES;
  const { GLTFLoader } = await import("../../vendor/loaders/GLTFLoader.js");
  const loader = new GLTFLoader();

  const load = (file) => new Promise((res, rej) => loader.load(
    new URL(`../../assets/weapons/${file}.glb`, import.meta.url).href, res, undefined, rej,
  ));
  const glbCache = new Map();
  const loadOnce = (file) => {
    if (!glbCache.has(file)) glbCache.set(file, load(file));
    return glbCache.get(file);
  };

  // matériaux : le pack est en PBR métallique, la scène de vue n'a pas d'envMap.
  // Sans ce garde-fou l'acier sortait noir (ou jaune à cause de la lumière chaude).
  const styleMaterials = (root) => {
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = false;
      o.receiveShadow = false;
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) {
        if (!m) continue;
        m.side = THREE.FrontSide;
        if (m.metalness != null) m.metalness = Math.min(0.68, m.metalness);
        if (m.roughness != null) m.roughness = Math.max(0.34, m.roughness);
        if (m.color && m.metalness > 0.4) {
          // le métal sans environnement réfléchissant s'éteint : on relève la
          // base pour que l'acier se lise sous la lumière de la vue
          m.color.setRGB(
            Math.min(1, m.color.r * 1.7 + 0.015),
            Math.min(1, m.color.g * 1.7 + 0.015),
            Math.min(1, m.color.b * 1.7 + 0.017),
          );
        }
        m.needsUpdate = true;
      }
    });
  };

  const boundsOf = (obj) => {
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3();
    const v = new THREE.Vector3();
    obj.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox;
      for (let i = 0; i < 8; i++) {
        v.set(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
        v.applyMatrix4(o.matrixWorld);
        box.expandByPoint(v);
      }
    });
    return box;
  };

  /** Attache une main (ou la paire) sur la poignée du modèle. */
  const attachHands = (align, pose, handRoot) => {
    if (!handRoot) return;
    const grip = new THREE.Vector3().fromArray(HAND_GRIP[pose.hand] || HAND_GRIP.right);
    const rot = new THREE.Euler(...(pose.handRot || [0, 0, 0]));
    const s = pose.handScale ?? 1;
    handRoot.position.set(0, 0, 0);
    handRoot.rotation.copy(rot);
    handRoot.scale.setScalar(s);
    // le point de prise de la main doit tomber sur la poignée (origine du GLB)
    const at = grip.clone().applyEuler(rot).multiplyScalar(s).negate();
    at.add(new THREE.Vector3().fromArray(pose.handPos || [0, 0, 0]));
    handRoot.position.copy(at);
    align.add(handRoot);
  };

  const out = {};

  for (const [wid, pose] of Object.entries(poses)) {
    const old = models[wid];
    if (!old || !pose) continue;
    const gltf = await loadOnce(pose.file);
    // clone : le même GLB peut servir deux armes, on ne partage pas la scène
    const root = gltf.scene.clone(true);
    styleMaterials(root);
    const modelBox = boundsOf(root);

    const align = new THREE.Group();
    align.name = `align_${wid}`;
    align.scale.setScalar(pose.scale);
    align.add(root);

    let handRoot = null;
    if (pose.hand && pose.hand !== "none" && HAND_FILE[pose.hand]) {
      const handGltf = await loadOnce(HAND_FILE[pose.hand]);
      handRoot = handGltf.scene.clone(true);
      styleMaterials(handRoot);
      handRoot.traverse((o) => { o.userData.hand = true; });
      handRoot.name = `hands_${wid}`;
      attachHands(align, pose, handRoot);
    }

    const group = new THREE.Group();
    group.name = `glb_${wid}`;
    group.add(align);
    group.visible = false;

    // bouche : point du manifeste (repère GLB), mis à l'échelle de la pose
    const muzzle = new THREE.Vector3().fromArray(pose.muzzle || [0, 0.035, modelBox.min.z])
      .multiplyScalar(pose.scale);
    const eject = new THREE.Vector3(
      (modelBox.max.x + 0.01) * pose.scale,
      (modelBox.max.y * 0.55) * pose.scale,
      modelBox.min.z * 0.25 * pose.scale,
    );

    const model = {
      group, align, root, hands: handRoot,
      muzzle,
      eject,
      rest: { pos: pose.pos.slice(), rot: pose.rot.slice(), scale: 1 },
      pose,
      glbSize: { x: modelBox.max.x - modelBox.min.x, y: modelBox.max.y - modelBox.min.y, z: modelBox.max.z - modelBox.min.z },
      length: (modelBox.max.z - modelBox.min.z) * pose.scale,
    };
    // la pose peut être retouchée à chaud par tools/vmbench.mjs
    model.applyPose = (patch) => {
      Object.assign(pose, patch);
      align.scale.setScalar(pose.scale);
      if (handRoot) attachHands(align, pose, handRoot);
      model.rest.pos = pose.pos.slice();
      model.rest.rot = pose.rot.slice();
      model.muzzle.copy(new THREE.Vector3().fromArray(pose.muzzle || [0, 0.035, modelBox.min.z]).multiplyScalar(pose.scale));
      return model;
    };
    out[wid] = model;
  }

  // banc de réglage : permet de pousser une pose sans recharger la page
  if (typeof window !== "undefined") {
    window.__vm = {
      poses,
      models: out,
      setPose(id, patch) {
        const m = out[id];
        if (!m) return null;
        m.applyPose(patch);
        return { id, pose: { ...m.pose } };
      },
      dump() {
        const rows = {};
        for (const [id, m] of Object.entries(out)) {
          rows[id] = {
            scale: +m.pose.scale.toFixed(3),
            pos: m.pose.pos.map((v) => +v.toFixed(3)),
            rot: m.pose.rot.map((v) => +v.toFixed(3)),
            hand: m.pose.hand,
            lengthM: +m.length.toFixed(3),
          };
        }
        return rows;
      },
    };
  }
  return out;
}

/** Construit les six view-models. `hands` partage ses matériaux. */
export function buildWeaponModels() {
  const M = makeMaterials();
  makeHand.mats = { leather: M.leather, skin: M.skin };
  const models = {};
  for (const def of WEAPONS) {
    const built = BUILDERS[def.id](M);
    built.group.visible = false;
    built.group.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = false;
        o.receiveShadow = false;
        o.frustumCulled = false;
      }
    });
    if (!def.melee) alignMuzzleToSight(built);
    models[def.id] = built;
  }
  return { models, materials: M };
}
