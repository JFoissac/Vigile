// loot.js — butin de la veille : tables par type de mort et par vague, objets au
// sol (E) avec halo doré, caisses et coffres de la lande et du cimetière.
// Le placement vérifie les murs par raycast (jamais de butin dans la pierre).

import * as THREE from "three";
import { T, rep } from "../world/textures.js";
import { box, cyl, merge } from "../world/geo.js";
import { clamp, randRange, makeRng, lerp } from "../core/util.js";
import { AMMO, AMMO_ORDER, WEAPONS, rollWeaponDrop, pickWeapon, bossWeaponRewards } from "./weapons.js";

/* ─────────────────────────── définitions ─────────────────────────── */

// Butin — quantités resserrées : les boîtes de munitions donnent moins de cartouches
// qu'avant (18/24/8/6 → 14/18/6/5), pour que la réserve se gagne vraiment.
export const LOOT = {
  ammo9: { kind: "ammo", ammo: "9mm", count: 10, label: "Boîte de 9 mm", rarity: "commun" },
  ammo12: { kind: "ammo", ammo: "12", count: 4, label: "Boîtes de calibre 12", rarity: "commun" },
  ammo556: { kind: "ammo", ammo: "5.56", count: 12, label: "Boîte de 5,56", rarity: "rare" },
  ammo308: { kind: "ammo", ammo: ".308", count: 4, label: "Étui de .308", rarity: "tres-rare" },
  ammo40: { kind: "ammo", ammo: "40mm", count: 2, label: "Boîtes de 40 mm", rarity: "rare" },
  medkit: { kind: "medkit", count: 1, label: "Trousse de soin", rarity: "rare" },
  vial: { kind: "vial", count: 1, label: "Fiole de lumière", rarity: "rare" },
  key: {
    kind: "key", count: 1, label: "Clé de la sacristie", rarity: "tres-rare",
    // sert d'indice dans l'invite du coffre verrouillé (voir describe)
    hint: "les morts et les caisses en lâchent",
  },
  lantern: { kind: "lantern", count: 1, label: "Lanterne à huile", rarity: "rare" },
};

// les armes sont du butin comme les autres : une entrée par arme, avec son palier.
for (const w of WEAPONS) {
  LOOT[w.id] = {
    kind: "weapon", weapon: w.id, count: 1, label: w.name,
    rarity: w.tier >= 3 ? "tres-rare" : "rare", tier: w.tier,
  };
}

export const LOOT_IDS = Object.keys(LOOT);

/** Butin d'un mort, selon son type et la vague. Tables pondérées. */
export function rollDrops(type, wave, rng, opts = {}) {
  const out = [];
  const owned = opts.owned || [];
  const w = Math.max(1, wave);
  const bonus = clamp(w * 0.012, 0, 0.14);

  // Munitions : uniquement les calibres que le joueur possède déjà. Une boîte de
  // 5,56 avant le fusil d'assaut ne servait à rien (19 % des objets lâchés en V1).
  const ownedCal = new Set();
  for (const id of owned) {
    const wd = WEAPONS.find((x) => x.id === id);
    if (wd && wd.ammo && wd.ammo !== "lame") ownedCal.add(wd.ammo);
  }
  if (!ownedCal.size) ownedCal.add("9mm");
  const keepCal = (table) => table.filter(([id]) => {
    const def = LOOT[id];
    return !def || def.kind !== "ammo" || ownedCal.has(def.ammo);
  });

  // arme : taux faible au début, meilleur en fin de veille (voir weapons.js)
  const wpn = rollWeaponDrop(w, rng, { owned, elite: type === "brute" });
  if (wpn) out.push(wpn);

  const pick = (table) => {
    let total = 0;
    for (const [, p] of table) total += p;
    let r = rng() * total;
    for (const [id, p] of table) {
      r -= p;
      if (r <= 0) return id;
    }
    return table[table.length - 1][0];
  };

  if (type === "brute") {
    // brute (élite) : la grosse munition reste acquise, le reste est raboté
    const big = ownedCal.has("5.56") ? "ammo556" : "ammo9";
    out.push(w >= 6 && ownedCal.has(".308") && rng() < 0.45 ? "ammo308" : big);
    if (rng() < 0.45) out.push(big);
    if (rng() < 0.22) out.push("medkit");
    if (rng() < 0.18) out.push("lantern");
    if (rng() < 0.16 + bonus) out.push("vial");
    return out;
  }

  const ammoTable = keepCal(type === "runner"
    ? [["ammo9", 50], ["ammo12", 14], ["ammo556", 12], ["ammo308", 3]]
    : [["ammo9", 44], ["ammo12", 12], ["ammo556", 20], ["ammo308", 5]]);

  // Morts ordinaires — butin de vie et de munitions nettement réduit.
  // Une seule série par mort, deux dans 10 % des cas seulement (16 % + bonus avant).
  // Taux par série : munitions 55 % · trousse 11 % · fiole 6 % · clé 4 % ·
  // lanterne 2,5 % · rien 21,5 %. Sur une mort : ≈ 0,69 boîte de munitions
  // (contre 0,83), 0,12 trousse (−40 %) et 0,066 fiole (−42 %) ; la clé garde son
  // taux (4 % × 1,1 série ≈ 3,5 % × 1,256 avant) et les armes passent par weapons.js.
  const rolls = 1 + (rng() < 0.10 ? 1 : 0);
  for (let i = 0; i < rolls; i++) {
    const r = rng();
    if (r < 0.40) out.push(pick(ammoTable));
    else if (r < 0.46) out.push("medkit");
    else if (r < 0.50) out.push("vial");
  }
  // un cadavre sur deux ne lâche RIEN : le porteur trouvait le butin trop dense
  // (arbitrage du 22/10). Pas de compensation automatique.
  return out;
}

/* Un seul type de coffre depuis l'arbitrage du 22/10 : les cinq cachets se
   ressemblaient et étaient trop généreux. */

function weighted(rng, table) {
  let total = 0;
  for (const [, p] of table) total += p;
  let r = rng() * total;
  for (const [id, p] of table) {
    r -= p;
    if (r <= 0) return id;
  }
  return table[table.length - 1][0];
}

/** Contenu d'une caisse / d'un coffre : une seule table, volontairement maigre. */
export function rollCache(type, wave, rng, opts = {}) {
  const out = [];
  const owned = opts.owned || [];
  const w = clamp(wave, 1, 14);
  if (type === "caisse") {
    // caisse : une pièce, deux si la chance est là
    out.push(weighted(rng, [["ammo9", 46], ["ammo12", 22], ["medkit", 18], ["vial", 14]]));
    if (rng() < 0.3) out.push(weighted(rng, [["ammo9", 50], ["ammo12", 30], ["medkit", 20]]));
    return out;
  }
  // coffre : 2 ou 3 pièces, une arme une fois sur cinq
  if (rng() < 0.22) {
    const wid = pickWeapon(w, rng, owned);
    if (wid) out.push(wid);
  }
  const n = 2 + (rng() < 0.35 ? 1 : 0);
  const table = [
    ["ammo9", 30], ["ammo12", 16], ["ammo556", w >= 4 ? 16 : 6],
    ["ammo308", w >= 5 ? 6 : 1], ["ammo40", w >= 3 ? 6 : 2],
    ["medkit", 14], ["vial", 10], ["key", 4],
  ];
  const unique = new Set(["key"]);
  for (let i = 0; i < n; i++) {
    let id = weighted(rng, table);
    if (unique.has(id) && out.includes(id)) id = weighted(rng, table);
    out.push(id);
  }
  return out;
}

/* ─────────────────────────── usine ─────────────────────────── */

export function createLoot({
  scene, groundAt, colliders, player, fx, notify, onVial, onLanternUse, onLoot,
  makeWeaponModel = null, getWave = null,
}) {
  const rng = makeRng(88213);
  const group = new THREE.Group();
  group.name = "loot";
  scene.add(group);

  const inventory = { medkits: 0, keys: 0, lanterns: 0, vialsTaken: 0, picked: 0, byAmmo: {} };
  for (const a of AMMO_ORDER) inventory.byAmmo[a] = 0;

  const items = [];
  const caches = [];

  /* ── matériaux partagés ── */
  const M = {
    wood: new THREE.MeshStandardMaterial({ map: rep(T.wood(), 1, 1), color: 0xb08a5a, roughness: 0.78 }),
    woodDark: new THREE.MeshStandardMaterial({ map: rep(T.wood(), 1, 1), color: 0x6e5636, roughness: 0.82 }),
    iron: new THREE.MeshStandardMaterial({ color: 0x4a4e4c, roughness: 0.6, metalness: 0.6 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xb08a4a, roughness: 0.38, metalness: 0.72 }),
    steel: new THREE.MeshStandardMaterial({ color: 0x9aa2a0, roughness: 0.32, metalness: 0.7 }),
    cloth: new THREE.MeshStandardMaterial({ map: rep(T.cloth(), 1, 1), color: 0xb8b0a0, roughness: 0.9 }),
    paper: new THREE.MeshStandardMaterial({ color: 0xd8c9a8, roughness: 0.9 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe6e0, roughness: 0.1, metalness: 0.05, transparent: true, opacity: 0.34 }),
    glow: new THREE.MeshStandardMaterial({ color: 0xffd08a, emissive: 0xff9c3c, emissiveIntensity: 1.8, roughness: 0.3 }),
    blood: new THREE.MeshStandardMaterial({ color: 0x7a2a20, roughness: 0.9 }),
  };
  const haloMat = new THREE.SpriteMaterial({
    map: T.halo(), color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, opacity: 0.55,
  });

  /* ── murs : volumes des colliders, uniquement pour le raycast ── */
  const blockers = new THREE.Group();
  const blockerMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
  for (const c of colliders) {
    if (c.keepIn) continue;   // paroi d'abside : ce n'est pas un volume plein
    const w = c.r != null ? c.r * 2 : c.hw * 2;
    const d = c.r != null ? c.r * 2 : c.hd * 2;
    const m = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.05, w), 5, Math.max(0.05, d)), blockerMat);
    m.position.set(c.x, 2.5, c.z);
    blockers.add(m);
  }
  blockers.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  ray.far = 0.75;
  const rayDirs = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
  ];

  /** Raycast horizontal : vrai si un mur est à moins de 0,75 m. */
  function rayBlocked(x, z, y = 0.9) {
    for (const dir of rayDirs) {
      ray.set(new THREE.Vector3(x, y, z), dir);
      const hit = ray.intersectObject(blockers, true);
      if (hit.length) return true;
    }
    return false;
  }

  /** Vrai si un mur s'interpose entre deux points (ligne de vue du joueur). */
  const losRay = new THREE.Raycaster();
  function blockedBetween(ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const d = Math.hypot(dx, dz);
    if (d < 0.2) return false;
    losRay.set(new THREE.Vector3(ax, 0.9, az), new THREE.Vector3(dx / d, 0, dz / d));
    // on s'arrête avant le volume de la caisse elle-même
    losRay.far = Math.max(0.3, d - 0.9);
    return losRay.intersectObject(blockers, true).length > 0;
  }

  /** Point libre : hors volumes des colliders + raycast de murs. */
  function isFree(x, z, margin = 0.42) {
    for (const c of colliders) {
      if (c.keepIn) continue;
      if (c.r != null) {
        if (Math.hypot(x - c.x, z - c.z) < c.r + margin) return false;
      } else if (Math.abs(x - c.x) < c.hw + margin && Math.abs(z - c.z) < c.hd + margin) {
        return false;
      }
    }
    return !rayBlocked(x, z, 0.9);
  }

  /** Trouve une position libre autour d'un point, par spirale. */
  function findFree(x, z, margin = 0.42) {
    if (isFree(x, z, margin)) return { x, z };
    for (let ring = 1; ring <= 6; ring++) {
      const r = ring * 0.55;
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + ring * 0.7;
        const nx = x + Math.cos(a) * r, nz = z + Math.sin(a) * r;
        if (nx < -50 || nx > 50 || nz < -46 || nz > 48) continue;
        if (isFree(nx, nz, margin)) return { x: nx, z: nz };
      }
    }
    return null;
  }

  /* ─────────────────────────── modèles d'objets ─────────────────────────── */

  const labelCache = new Map();

  function stencil(text, w, h) {
    const key = text + w + h;
    if (labelCache.has(key)) return labelCache.get(key);
    const cv = document.createElement("canvas");
    cv.width = 128; cv.height = 64;
    const c = cv.getContext("2d");
    c.fillStyle = "rgba(0,0,0,0)";
    c.fillRect(0, 0, 128, 64);
    c.fillStyle = "#e6dcc0";
    c.font = "bold 26px Consolas, monospace";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(text, 64, 33);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    labelCache.set(key, tex);
    return tex;
  }

  function buildAmmoBox(type) {
    const g = new THREE.Group();
    const a = AMMO[type];
    const w = type === "12" ? 0.3 : 0.26;
    g.add(new THREE.Mesh(box(w, 0.15, 0.19, 0, 0.075, 0), M.woodDark));
    const lid = new THREE.Mesh(box(w + 0.02, 0.025, 0.21, 0, 0.162, 0), M.wood);
    lid.rotation.z = 0.02;
    g.add(lid);
    const band = new THREE.Mesh(box(w + 0.015, 0.03, 0.195, 0, 0.09, 0),
      new THREE.MeshStandardMaterial({ color: a.color, roughness: 0.6, metalness: 0.2 }));
    g.add(band);
    // étiquette lisible
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.05),
      new THREE.MeshBasicMaterial({ map: stencil(a.short, 0.13, 0.05), transparent: true, color: a.tint }));
    plate.position.set(0, 0.085, 0.0985);
    g.add(plate);
    const plate2 = plate.clone();
    plate2.rotation.y = Math.PI;
    plate2.position.z = -0.0985;
    g.add(plate2);
    // deux cartouches qui dépassent
    for (let i = 0; i < 2; i++) {
      const sh = new THREE.Mesh(cyl(0.012, 0.012, 0.09, 8, 0, 0.21, -0.02 + i * 0.045, Math.PI / 2), M.brass);
      g.add(sh);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), M.steel);
      tip.position.set(0, 0.21, 0.026 + i * 0.045);
      g.add(tip);
    }
    return g;
  }

  function buildMedkit() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(box(0.26, 0.16, 0.18, 0, 0.08, 0), M.cloth));
    g.add(new THREE.Mesh(box(0.27, 0.03, 0.19, 0, 0.17, 0), M.paper));
    const red = new THREE.MeshStandardMaterial({ color: 0x8e2f28, roughness: 0.7 });
    g.add(new THREE.Mesh(box(0.1, 0.02, 0.03, 0, 0.187, 0), red));
    g.add(new THREE.Mesh(box(0.03, 0.02, 0.1, 0, 0.187, 0), red));
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.04, 0.008, 4, 10), M.leather || M.iron);
    handle.rotation.x = Math.PI / 2;
    handle.position.set(0, 0.2, 0);
    g.add(handle);
    g.add(new THREE.Mesh(box(0.03, 0.12, 0.012, 0, 0.06, 0.091), M.iron));
    return g;
  }

  function buildVial() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.2, 10), M.glass);
    body.position.y = 0.1;
    g.add(body);
    const liq = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.052, 0.15, 9), M.glow);
    liq.position.y = 0.08;
    g.add(liq);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.035, 0.05, 8), M.glass);
    neck.position.y = 0.225;
    g.add(neck);
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.022, 0.04, 8), M.woodDark);
    cork.position.y = 0.26;
    g.add(cork);
    return g;
  }

  function buildKey() {
    const g = new THREE.Group();
    const head = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 5, 12), M.brass);
    head.position.y = 0.06;
    g.add(head);
    const shaft = new THREE.Mesh(cyl(0.011, 0.011, 0.22, 8, 0.05, 0.06, 0, 0, 0, Math.PI / 2), M.brass);
    g.add(shaft);
    g.add(new THREE.Mesh(box(0.02, 0.05, 0.012, 0.14, 0.035, 0), M.brass));
    g.add(new THREE.Mesh(box(0.03, 0.02, 0.012, 0.155, 0.02, 0), M.brass));
    return g;
  }

  function buildLantern() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.035, 10), M.iron);
    base.position.y = 0.02;
    g.add(base);
    const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.085, 0.2, 8), M.glass);
    glass.position.y = 0.14;
    g.add(glass);
    const flame = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), M.glow);
    flame.scale.y = 1.5;
    flame.position.y = 0.13;
    g.add(flame);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const bar = new THREE.Mesh(box(0.012, 0.22, 0.012, Math.cos(a) * 0.085, 0.14, Math.sin(a) * 0.085), M.iron);
      g.add(bar);
    }
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.095, 0.04, 8), M.iron);
    top.position.y = 0.26;
    g.add(top);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.009, 4, 10, Math.PI), M.iron);
    hook.position.y = 0.31;
    g.add(hook);
    return g;
  }

  function buildItemModel(id) {
    const def = LOOT[id];
    let g;
    if (def.kind === "ammo") g = buildAmmoBox(def.ammo);
    else if (def.kind === "medkit") g = buildMedkit();
    else if (def.kind === "vial") g = buildVial();
    else if (def.kind === "key") g = buildKey();
    else if (def.kind === "weapon" && makeWeaponModel) g = makeWeaponModel(def.weapon || id);
    else g = buildLantern();
    if (!g) g = buildLantern();
    return g;
  }

  /* ─────────────────────────── objets au sol ─────────────────────────── */

  function spawnAt(id, x, z, opts = {}) {
    const def = LOOT[id];
    if (!def) return null;
    const spot = findFree(x, z, 0.36);
    if (!spot) return null;
    const g = new THREE.Group();
    const isWeapon = def.kind === "weapon";
    const model = buildItemModel(id);
    model.scale.setScalar(isWeapon ? 0.92 : 1.15);
    if (isWeapon) model.position.y = 0.46; // l'arme flotte à hauteur de main
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    g.add(model);
    const halo = new THREE.Sprite(haloMat.clone());
    halo.position.y = isWeapon ? 0.66 : def.kind === "ammo" ? 0.34 : 0.3;
    halo.scale.setScalar(isWeapon ? 1.05 : def.kind === "key" ? 0.55 : 0.8);
    halo.material.color.setHex(
      isWeapon ? ((def.tier || 1) >= 3 ? 0xffd27a : 0xbcd6ff)
        : def.kind === "ammo" ? AMMO[def.ammo].tint : 0xffd27a,
    );
    halo.material.opacity = isWeapon ? 0.5 : 0.42;
    g.add(halo);
    const gy = groundAt(spot.x, spot.z);
    g.position.set(spot.x, gy + 0.06, spot.z);
    g.userData.lootId = id;
    group.add(g);
    const item = {
      id, def, group: g, halo, baseY: gy + 0.06, t: rng() * 6,
      taken: false, label: def.label, count: def.count, ammo: def.ammo,
    };
    items.push(item);
    // plafond d'objets au sol : on retire les plus anciens
    if (items.length > 46) {
      const old = items.shift();
      group.remove(old.group);
    }
    return item;
  }

  /** Lâche le butin d'un mort (réparti autour du corps). */
  function dropFromZombie(type, wave, x, z, owned = []) {
    const ids = rollDrops(type, wave, rng, { owned });
    ids.forEach((id, i) => {
      const a = rng() * Math.PI * 2;
      const r = 0.25 + i * 0.45 + rng() * 0.25;
      spawnAt(id, x + Math.cos(a) * r, z + Math.sin(a) * r);
    });
    return ids;
  }

  /** Récompense du boss, posée devant l'autel : la meilleure arme manquante. */
  function dropBoss(x, z, owned = []) {
    // une clé de la sacristie est GARANTIE sur le boss (elle ne tombe plus au hasard)
    const ids = ["key", "vial", "ammo308", "ammo556", ...bossWeaponRewards(owned)];
    ids.forEach((id, i) => {
      const a = (i / ids.length) * Math.PI * 2;
      spawnAt(id, x + Math.cos(a) * 1.6, z + Math.sin(a) * 1.6);
    });
    return ids;
  }

  /* ─────────────────────────── caisses & coffres ─────────────────────────── */

  function buildCrate() {
    const g = new THREE.Group();
    // corps fusionné : bois puis fer (2 appels de rendu au lieu de 14)
    const wood = [box(0.78, 0.52, 0.56, 0, 0.26, 0)];
    for (let i = 0; i < 4; i++) {
      wood.push(box(0.79, 0.07, 0.02, 0, 0.12 + i * 0.11, 0.285));
      wood.push(box(0.79, 0.07, 0.02, 0, 0.12 + i * 0.11, -0.285));
    }
    g.add(new THREE.Mesh(merge(wood), M.wood));
    const iron = [];
    for (const s of [-1, 1]) iron.push(box(0.03, 0.54, 0.58, s * 0.36, 0.26, 0));
    iron.push(box(0.08, 0.1, 0.02, 0, 0.46, 0.29));
    g.add(new THREE.Mesh(merge(iron), M.iron));

    const lid = new THREE.Group();
    lid.position.set(0, 0.52, -0.28);
    lid.add(new THREE.Mesh(merge([
      box(0.8, 0.06, 0.58, 0, 0, 0.28),
      box(0.82, 0.02, 0.06, 0, 0.04, 0.54),
    ]), M.woodDark));
    g.add(lid);

    const mark = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.09),
      new THREE.MeshBasicMaterial({ map: stencil("VIGILE", 0.3, 0.09), transparent: true, color: 0xc8b48a }));
    mark.position.set(0, 0.28, 0.282);
    g.add(mark);
    return { group: g, lid };
  }

  function buildChest() {
    const g = new THREE.Group();
    const wood = [box(0.9, 0.4, 0.54, 0, 0.2, 0)];
    for (let i = 0; i < 3; i++) wood.push(box(0.02, 0.4, 0.56, -0.3 + i * 0.3, 0.2, 0));
    g.add(new THREE.Mesh(merge(wood), M.woodDark));
    const iron = [];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      iron.push(box(0.08, 0.1, 0.08, sx * 0.38, 0.05, sz * 0.2));
    }
    iron.push(new THREE.TorusGeometry(0.035, 0.008, 4, 10).translate(0, 0.3, 0));
    g.add(new THREE.Mesh(merge(iron), M.iron));

    const lid = new THREE.Group();
    lid.position.set(0, 0.4, -0.27);
    lid.add(new THREE.Mesh(merge([
      box(0.92, 0.1, 0.56, 0, 0.05, 0.27),
      box(0.7, 0.08, 0.5, 0, 0.13, 0.27),
    ]), M.wood));
    lid.add(new THREE.Mesh(box(0.9, 0.03, 0.04, 0, 0.06, 0.54), M.iron));
    g.add(lid);
    g.add(new THREE.Mesh(box(0.12, 0.14, 0.05, 0, 0.34, 0.28), M.brass));
    return { group: g, lid };
  }

  function spawnCache(type, x, z, opts = {}) {
    const spot = findFree(x, z, 0.85);
    if (!spot) return null;
    const built = type === "coffre" ? buildChest() : buildCrate();
    const g = new THREE.Group();
    g.add(built.group);
    const halo = new THREE.Sprite(haloMat.clone());
    halo.position.y = 0.75;
    halo.scale.setScalar(type === "coffre" ? 1.25 : 1.0);
    halo.material.color.setHex(type === "coffre" ? 0xffb45e : 0xd8c08a);
    halo.material.opacity = 0.3;
    g.add(halo);
    const gy = groundAt(spot.x, spot.z);
    g.position.set(spot.x, gy, spot.z);
    g.rotation.y = (rng() - 0.5) * 0.9;
    group.add(g);
    const cache = {
      type, group: g, lid: built.lid, halo, x: spot.x, z: spot.z,
      locked: type === "coffre", opened: false, openK: 0, t: rng() * 9,
      // baseY / fadeK / gone : sortie du monde une fois le coffre vidé
      baseY: gy, fadeK: 0, gone: false,
      loot: opts.loot || rollCache(type, opts.wave || 1, rng),
      explicitLoot: !!opts.loot,
      wave: opts.wave || 1,
    };
    caches.push(cache);
    return cache;
  }

  /** Retire définitivement une caisse ouverte : hors scène et hors du tableau. */
  function removeCache(c) {
    if (!c || c.gone) return false;
    c.gone = true;
    c.group.removeFromParent();
    c.halo.visible = false;
    const i = caches.indexOf(c);
    if (i >= 0) caches.splice(i, 1);
    if (nearest && nearest.cache === c) { nearest = null; prompt = null; }
    return true;
  }

  /** Caisses et coffres de la lande et du cimetière (placement vérifié). */
  function placeCaches(wave = 1) {
    // Six caches au lieu de douze : le porteur trouvait la carte encombrée et les
    // coffres trop nombreux (arbitrage du 22/10).
    const anchors = [
      ["caisse", -7.5, 30.0], ["coffre", 12.0, 17.0], ["caisse", 18.5, 30.5],
      ["coffre", -16.5, -8.5], ["caisse", 5.5, -26.0], ["coffre", 22.0, -22.0],
    ];
    for (const [type, x, z] of anchors) {
      spawnCache(type, x, z, { wave });
    }
    return caches.length;
  }

  /* ─────────────────────────── interaction ─────────────────────────── */

  let prompt = null;
  let nearest = null;
  const AUTO_PICKUP = 1.15;   // rayon de ramassage automatique au passage
  let lootQuietUntil = 0;     // après un coffre, on n'écrase pas son popup par chaque objet
  const AUTO_CACHE = 1.85;    // rayon d'ouverture automatique des caisses et coffres

  function itemLabel(item) {
    if (item.def.kind === "ammo") {
      return `${item.def.label} · ${item.def.count} ${AMMO[item.def.ammo].unit}`;
    }
    return item.def.label;
  }

  function describe(c) {
    if (c.opened) return null;
    if (c.locked) {
      // l'invite dit à quoi sert la clé et d'où elle vient (champ hint de LOOT.key)
      return c.type === "coffre"
        ? `Coffre verrouillé · clé de la sacristie (${LOOT.key.hint})`
        : "Caisse";
    }
    return c.type === "coffre" ? "Ouvrir le coffre" : "Ouvrir la caisse";
  }

  /** Texte d'invite quand la clé manque (même indice que describe). */
  const KEY_NEEDED = `Coffre verrouillé · il faut la clé de la sacristie (${LOOT.key.hint})`;

  function findNearest(px, pz) {
    let best = null, bestD = 2.6;
    for (const it of items) {
      if (it.taken) continue;
      const d = Math.hypot(it.group.position.x - px, it.group.position.z - pz);
      if (d < bestD) { bestD = d; best = { type: "item", item: it, dist: d }; }
    }
    if (!best) {
      for (const c of caches) {
        if (c.opened) continue;
        const d = Math.hypot(c.x - px, c.z - pz);
        if (d < 2.9) { bestD = d; best = { type: "cache", cache: c, dist: d }; }
      }
    }
    return best;
  }

  function lootEntry(id, countOverride) {
    const def = LOOT[id];
    if (!def) return null;
    const count = countOverride != null ? countOverride : def.count;
    const name = def.kind === "ammo" ? AMMO[def.ammo].label : def.label;
    return { id, name, count, rarity: def.rarity || "commun", kind: def.kind };
  }

  function emitLoot(kind, title, entries) {
    const items = entries.filter(Boolean);
    if (!items.length || typeof onLoot !== "function") return;
    onLoot({ kind, title, items });
  }

  function giveAmmo(id, def) {
    const type = def.ammo;
    const wanted = def.count;
    const added = player.addAmmo(type, wanted);
    inventory.byAmmo[type] = (inventory.byAmmo[type] || 0) + added;
    inventory.picked++;
    if (added <= 0) return { text: `Réserve de ${AMMO[type].label} pleine`, added: 0 };
    return { text: `+${added} ${AMMO[type].label} · réserve ${player.reserves[type]}`, added };
  }

  function collect(item) {
    if (item.taken) return null;
    item.taken = true;
    group.remove(item.group);
    const def = item.def;
    let text = "";
    let count = def.count;
    if (def.kind === "ammo") {
      const r = giveAmmo(item.id, def);
      text = r.text;
      count = r.added;
    } else if (def.kind === "medkit") {
      inventory.medkits = Math.min(6, inventory.medkits + 1);
      inventory.picked++;
      text = `Trousse de soin ramassée · ${inventory.medkits} en réserve`;
    } else if (def.kind === "vial") {
      inventory.vialsTaken++;
      inventory.picked++;
      text = onVial ? onVial() : "Fiole de lumière ramassée";
    } else if (def.kind === "key") {
      inventory.keys = Math.min(9, inventory.keys + 1);
      inventory.picked++;
      text = `Clé de la sacristie · ${inventory.keys} en poche`;
    } else if (def.kind === "lantern") {
      inventory.lanterns = Math.min(6, inventory.lanterns + 1);
      inventory.picked++;
      text = `Lanterne à huile · ${inventory.lanterns}`;
    } else if (def.kind === "weapon") {
      const wid = def.weapon || item.id;
      const w = player.weapons.find((x) => x.def.id === wid);
      const isNew = player.unlockWeapon(wid);
      inventory.picked++;
      if (isNew) {
        text = `Arme trouvée · ${def.label} (touche ${w ? w.def.slot : "?"})`;
      } else {
        const type2 = w.def.ammo;
        text = type2 && type2 !== "lame"
          ? `${def.label} déjà à vous · +${AMMO[type2].label}`
          : `${def.label} déjà à vous`;
        if (type2 && type2 !== "lame") player.addAmmo(type2, 12);
      }
      count = 1;
    }
    if (fx) fx.heal(new THREE.Vector3(item.group.position.x, item.group.position.y + 0.4, item.group.position.z));
    if (notify) notify(text);
    // popup pour ce qui sort de l'ordinaire (sauf juste après un coffre, dont le
    // popup liste déjà tout le contenu)
    if (def.rarity && def.rarity !== "commun" && count > 0 && performance.now() > lootQuietUntil) {
      emitLoot("item", "Objet trouvé", [lootEntry(item.id, count)]);
    }
    return text;
  }

  function openCache(c) {
    if (!c || c.opened || c.gone) return null;
    if (c.locked && inventory.keys <= 0) {
      if (notify) notify(KEY_NEEDED);
      return null;
    }
    if (c.locked) inventory.keys--;
    c.opened = true;
    c.locked = false;
    // le contenu est tiré à l'ouverture, à la vague courante : une caisse gardée
    // pour la fin de la veille peut contenir une meilleure arme
    const wave = typeof getWave === "function" ? getWave() : (c.wave || 1);
    const owned = player.owned ? player.owned.map((d) => d.id) : [];
    const ids = c.explicitLoot ? c.loot.slice() : rollCache(c.type, wave, rng, { owned });
    ids.forEach((id, i) => {
      const a = (i / Math.max(1, ids.length)) * Math.PI * 2 + rng() * 0.6;
      const r = 0.75 + rng() * 0.7;
      spawnAt(id, c.x + Math.cos(a) * r, c.z + Math.sin(a) * r);
    });
    if (fx) fx.heal(new THREE.Vector3(c.x, groundAt(c.x, c.z) + 0.7, c.z));
    if (notify) notify(`${c.type === "coffre" ? "Coffre" : "Caisse"} ouvert · ${ids.length} objets`);
    lootQuietUntil = performance.now() + 1600;
    emitLoot("cache", c.type === "coffre" ? "Coffre ouvert" : "Caisse ouverte", ids.map((id) => lootEntry(id)));
    return ids;
  }

  function tryPickup() {
    if (!nearest) return null;
    if (nearest.type === "cache") return openCache(nearest.cache);
    return null;
  }

  function useMedkit() {
    if (inventory.medkits <= 0) return false;
    if (player.state.hp >= player.state.maxHp) {
      if (notify) notify("Santé déjà pleine · trousse conservée");
      return false;
    }
    inventory.medkits--;
    player.heal(55);
    if (fx) fx.heal(new THREE.Vector3(player.pos.x, player.pos.y + 1.1, player.pos.z));
    if (notify) notify("Trousse utilisée · +55 PV");
    return true;
  }

  function useLantern() {
    if (inventory.lanterns <= 0) return false;
    inventory.lanterns--;
    player.boostLantern(30);
    if (notify) notify("Lanterne à huile allumée · 30 s de lumière large");
    if (onLanternUse) onLanternUse();
    return true;
  }

  /* ─────────────────────────── boucle ─────────────────────────── */

  function update(dt, px, pz) {
    for (const it of items) {
      if (it.taken) continue;
      it.t += dt;
      it.group.rotation.y += dt * 1.5;
      const gy = groundAt(it.group.position.x, it.group.position.z);
      it.group.position.y = gy + 0.06 + Math.sin(it.t * 2.1) * 0.045;
      it.halo.material.opacity = 0.34 + Math.sin(it.t * 3.1) * 0.12;
    }
    // caches : ouverture, puis disparition. Parcours à l'envers : retirer une
    // entrée du tableau pendant le for…of sauterait la suivante.
    for (let i = caches.length - 1; i >= 0; i--) {
      const c = caches[i];
      c.t += dt;
      if (!c.opened) {
        c.halo.material.opacity = 0.22 + Math.sin(c.t * 1.7) * 0.1;
        c.halo.scale.setScalar((c.type === "coffre" ? 1.25 : 1.0) * (1 + Math.sin(c.t * 2.3) * 0.06));
      } else if (c.openK < 1) {
        // 1) le couvercle s'ouvre (~0,6 s)
        c.openK = Math.min(1, c.openK + dt * 1.6);
        c.lid.rotation.x = -1.55 * c.openK;
        c.halo.material.opacity = Math.max(0, 0.25 * (1 - c.openK));
      } else {
        // 2) le coffre vidé s'enfonce et fond sur place (~1,2 s), puis quitte le monde
        c.fadeK = Math.min(1, c.fadeK + dt / 1.2);
        const k = c.fadeK, e = k * k;   // la chute s'accélère en fin de fondu
        c.group.position.y = c.baseY - 0.85 * e;
        c.group.scale.setScalar(1 - 0.55 * e);
        c.group.rotation.y += dt * 0.35;
        c.halo.material.opacity = 0.2 * (1 - k);
        if (k >= 1) removeCache(c);
      }
    }

    nearest = findNearest(px, pz);
    if (!nearest) {
      prompt = null;
      return null;
    }
    if (nearest.type === "item") {
      const it = nearest.item;
      const visible = !blockedBetween(px, pz, it.group.position.x, it.group.position.z);
      // ramassage automatique : marcher sur un objet suffit (et il faut le voir)
      if (visible && nearest.dist <= AUTO_PICKUP) {
        const text = collect(it);
        nearest = null;
        prompt = null;
        return text;
      }
      // pas d'invite : le ramassage est automatique, seul le halo signale l'objet
      prompt = null;
      it.halo.material.opacity = 0.7;
      it.group.scale.setScalar(1 + Math.sin(it.t * 6) * 0.04);
    } else {
      const c = nearest.cache;
      const visible = !blockedBetween(px, pz, c.x, c.z);
      if (visible && nearest.dist <= AUTO_CACHE) {
        if (c.locked && inventory.keys <= 0) {
          prompt = { key: null, text: KEY_NEEDED };
        } else {
          openCache(c);
          nearest = null;
          prompt = null;
          return "cache";
        }
      } else {
        const d = visible ? describe(c) : null;
        prompt = d ? { key: null, text: d } : null;
      }
    }
    return prompt;
  }

  function reset() {
    for (const it of items) group.remove(it.group);
    for (const c of caches) group.remove(c.group);
    items.length = 0;
    caches.length = 0;
    inventory.medkits = 0;
    inventory.keys = 0;
    inventory.lanterns = 0;
    inventory.vialsTaken = 0;
    inventory.picked = 0;
    for (const a of AMMO_ORDER) inventory.byAmmo[a] = 0;
    prompt = null;
    nearest = null;
  }

  return {
    group, inventory, items, caches,
    spawnAt, dropFromZombie, dropBoss, placeCaches, spawnCache,
    update, tryPickup, collect, openCache, useMedkit, useLantern,
    reset, isFree, rayBlocked, losBlocked: blockedBetween, rollDrops, rollCache, findFree,
    get prompt() { return prompt; },
    get nearest() { return nearest; },
    get itemCount() { return items.length; },
    get cacheCount() { return caches.length; },
    get openedCount() { return caches.filter((c) => c.opened).length; },
  };
}
