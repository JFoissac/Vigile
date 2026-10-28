// player.js — le Vigile : déplacement FPS, arsenal (6 armes), munitions typées,
// lanterne, vue subjective et animations d'arme distinctes.
// Collisions analytiques (caisses + cylindres) : aucune physique externe.

import * as THREE from "three";
import { T, rep } from "../world/textures.js";
import { merge, box, cyl } from "../world/geo.js";
import { clamp, damp, lerp, rad, makeRng } from "../core/util.js";
import {
  WEAPONS, AMMO, AMMO_ORDER, DEFAULT_RESERVES, MAX_RESERVES, START_WEAPONS,
  damageAtDistance, headshotChance, meleePose, buildWeaponModels, loadGlbWeaponModels,
} from "./weapons.js";

const EYE = 1.63;

export function createPlayer({ scene, camera, chapel, input, audio, fx, settings, levelId = null }) {
  const rng = makeRng(6161);

  const state = {
    pos: new THREE.Vector3(0, 0, 24),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: 0,
    hp: 100,
    maxHp: 100,
    stamina: 100,
    // miroirs de l'arme active (HUD, tests, diagnostic)
    ammo: 12,
    magSize: 12,
    reserve: DEFAULT_RESERVES["9mm"],
    reloading: false,
    reloadT: 0,
    reloadDur: 1.35,
    weaponIndex: 0,
    weaponId: WEAPONS[0].id,
    weaponName: WEAPONS[0].name,
    weaponShort: WEAPONS[0].short,
    ammoType: WEAPONS[0].ammo,
    ammoLabel: AMMO[WEAPONS[0].ammo].label,
    cooldown: 0,
    sprinting: false,
    onGround: true,
    bob: 0,
    bobAmt: 0,
    hurtFlash: 0,
    shake: 0,
    recoil: 0,
    recoilYaw: 0,
    kick: 0,
    lanternOn: true,
    alive: true,
    deadT: 0,
    lastStep: 0,
    breathT: 0,
    shots: 0,
    hits: 0,
    headshots: 0,
    damageTaken: 0,
    distance: 0,
    healing: 0,
    flasks: 0,
    aiming: false,
    zoomK: 0,
    switchK: 0,
    meleeT: 0,
    meleeK: 0,
    lanternBoost: 0,
    spreadPx: 5,
    dryT: 0,
    invuln: 0,   // fenêtre après un coup encaissé : la meute ne peut plus empiler
  };

  const mods = {
    damage: 1, fireRate: 1, reload: 1, maxHp: 1, speed: 1, head: 1, melee: 1, damageTaken: 1,
  };
  const reloadTime = (d) => d.reload / Math.max(0.2, mods.reload);

  /* ─────────────────────────── arsenal ─────────────────────────── */

  const { models, materials } = buildWeaponModels();

  const viewScene = new THREE.Scene();
  const viewCamera = new THREE.PerspectiveCamera(52, 16 / 9, 0.01, 8);
  viewScene.add(viewCamera);
  // éclairage du view-model : une clé chaude venant de la gauche, un contre-jour
  // froid et un remplissage bas. Sans relief, les mains et les armes faisaient
  // des aplats (retour du porteur : « rendu catastrophique »).
  viewScene.add(new THREE.AmbientLight(0x9aa4aa, 0.62));
  viewScene.add(new THREE.HemisphereLight(0xd8e4ff, 0x6a5a44, 0.85));
  const viewKey = new THREE.DirectionalLight(0xffe9c8, 1.45);
  viewKey.position.set(-1.4, 1.9, 1.5);
  viewScene.add(viewKey);
  const viewRim = new THREE.DirectionalLight(0x9fc4e8, 0.9);
  viewRim.position.set(1.1, 0.7, -1.8);
  viewScene.add(viewRim);
  const viewFill = new THREE.PointLight(0xffd9b0, 6, 3.2, 2);
  viewFill.position.set(-0.5, -0.4, 0.6);
  viewScene.add(viewFill);
  const view = new THREE.Group();
  viewScene.add(view);
  scene.add(camera);
  for (const def of WEAPONS) view.add(models[def.id].group);

  // Pack Blender (GLB) : OPT-IN, réservé aux essais (`?glb=1`). La prise à deux
  // mains et l'échelle ne sont pas encore justes (revue du 22/10 : une seule main
  // visible, canon en travers) : le rendu procédural reste le défaut, sinon le
  // joueur voit une régression. Bascule par défaut le jour où les 7 captures
  // sont validées par le porteur.
  // Repli silencieux : si un fichier manque, l'arme concernée reste procédurale.
  const glbParam = new URLSearchParams(location.search).get("glb");
  if (glbParam === "1") {
    loadGlbWeaponModels(models).then((upgraded) => {
      for (const [id, m] of Object.entries(upgraded)) {
        const old = models[id];
        if (!old) continue;
        view.remove(old.group);
        view.add(m.group);
        // l'éclair de bouche était posé sur les modèles procéduraux : le GLB
        // n'en a pas, on le recrée sur sa bouche (sinon tir muet visuellement)
        const spr = new THREE.Sprite(new THREE.SpriteMaterial({
          map: flashTex, color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending,
          depthWrite: false, opacity: 0,
        }));
        spr.position.copy(m.muzzle).add(new THREE.Vector3(0, 0, -0.03));
        spr.scale.setScalar(0.42);
        spr.visible = false;
        m.group.add(spr);
        m.flash = spr;
        models[id] = m;
        const w = loadout.find((x) => x.def.id === id);
        if (w) w.nodes = {};
      }
      // les pièces mobiles (culasse, chargeur) n'existent plus dans les GLB :
      // on les recopie pour les armes restées procédurales uniquement.
      for (const w of loadout) {
        const m = models[w.def.id];
        w.nodes = {};
        for (const key of ["slide", "pump", "mag", "bolt", "hammer"]) {
          const node = m[key];
          if (node) w.nodes[key] = { node, p: node.position.clone(), r: node.rotation.clone() };
        }
      }
    }).catch((err) => { window.__errors.push("glb: " + ((err && err.message) || err)); });
  }

  // traînée de lame : un arc additif qui suit la frappe de mêlée (le geste se lit
  // comme une arme blanche, pas comme un coup de poing)
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0xfff1cf, transparent: true, opacity: 0, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  });
  const trail = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.7, 28, 1, 0, Math.PI * 0.8), trailMat);
  trail.position.set(0.02, -0.08, -0.62);
  trail.visible = false;
  view.add(trail);

  // chargeur logique : chaque arme garde son compte, les réserves sont par calibre.
  // On ne possède au départ que les armes de service ; les autres se ramassent.
  const loadout = WEAPONS.map((def) => ({
    def, mag: def.mag, reloading: false, reloadT: 0,
    unlocked: START_WEAPONS.includes(def.id),
    nodes: {}, switchT: 0,
  }));
  const ownedIds = () => loadout.filter((w) => w.unlocked).map((w) => w.def.id);
  const reserves = { ...DEFAULT_RESERVES };

  // positions de repos des pièces mobiles (pour les animations)
  for (const w of loadout) {
    const m = models[w.def.id];
    for (const key of ["slide", "pump", "mag", "bolt", "hammer"]) {
      const node = m[key];
      if (node) w.nodes[key] = { node, p: node.position.clone(), r: node.rotation.clone() };
    }
  }

  let weaponIndex = 0;
  const current = () => loadout[weaponIndex];
  const def = () => loadout[weaponIndex].def;

  /* ─────────────────────────── lumière & flash ─────────────────────────── */

  const lamp = new THREE.PointLight(0xffab5e, 60, 22, 2);
  lamp.position.set(-0.3, -0.12, -0.3);
  // la lanterne projette une ombre : sans elle, sa lumière traversait les murs
  lamp.castShadow = true;
  lamp.shadow.mapSize.set(256, 256);
  lamp.shadow.camera.near = 0.15;
  lamp.shadow.camera.far = 16;
  lamp.shadow.bias = -0.004;
  lamp.shadow.normalBias = 0.02;
  camera.add(lamp);
  const lampFill = new THREE.PointLight(0xbfd0d8, 7, 3.4, 2);
  lampFill.position.set(0.16, 0.18, 0.12);
  camera.add(lampFill);
  const boostLight = new THREE.PointLight(0xffd9a8, 0, 24, 2);
  boostLight.position.set(0, 0.1, -0.6);
  boostLight.visible = false;
  camera.add(boostLight);

  // éclairage dédié au view-model : directionnel, homogène sur toute l'arme
  const vmKey = new THREE.DirectionalLight(0xffd6ad, 5.0);
  vmKey.position.set(-1.2, 2.0, 1.6);
  vmKey.target.position.set(0, -0.15, -0.8);
  viewScene.add(vmKey, vmKey.target);
  const vmRim = new THREE.DirectionalLight(0x9fc2d4, 2.2);
  vmRim.position.set(1.8, 0.5, 0.4);
  vmRim.target.position.set(0, 0, -0.8);
  viewScene.add(vmRim, vmRim.target);

  // un éclair par arme, placé sur sa bouche
  const flashTex = T.spark();
  for (const w of loadout) {
    const m = models[w.def.id];
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTex, color: 0xffd9a0, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0,
    }));
    spr.position.copy(m.muzzle).add(new THREE.Vector3(0, 0, -0.03));
    spr.scale.setScalar(0.5);
    spr.visible = false;
    m.group.add(spr);
    m.flash = spr;
  }
  const flashLight = new THREE.PointLight(0xffc27a, 0, 14, 2);
  flashLight.position.set(0.2, -0.05, -0.9);
  camera.add(flashLight);

  /* ─────────────────────────── état & outils ─────────────────────────── */

  const raycaster = new THREE.Raycaster();
  raycaster.far = 90;
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const muzzleWorld = new THREE.Vector3();
  const originV = new THREE.Vector3();
  const dirV = new THREE.Vector3();

  let shakeT = 0;
  let flashT = 0;

  function groundAt(x, z) {
    // au village la place est plate : le sol analytique de la chapelle (dalle
    // à 0,35 m, marches du portail) faisait flotter le joueur sur les pavés.
    if (levelId && levelId() === "village") return 0;
    if (Math.abs(x) < 5.45 && z > -12 && z < 12) return 0.35;
    if (z <= -12) {
      const d = Math.hypot(x, z + 12);
      if (d < 5.45) return 0.35;
    }
    if (z >= 12 && z < 14.6 && Math.abs(x) < 2.9) {
      return lerp(0.35, 0, clamp((z - 12) / 2.6, 0, 1));
    }
    return 0;
  }

  function resolve(pos, radius, colliders) {
    for (let pass = 0; pass < 2; pass++) {
      for (const c of colliders) {
        if (c.r != null) {
          if (c.half && pos.z >= c.z) continue;
          const dx = pos.x - c.x, dz = pos.z - c.z;
          const d = Math.hypot(dx, dz);
          if (c.keepIn) {
            // paroi de l'abside : on repousse vers le CENTRE, jamais dehors,
            // mais seulement si l'on est déjà dans ou contre le cul-de-four
            // (sinon un point du cimetière derrière z = -12 serait aspiré).
            const max = c.r - radius;
            if (d > max && d <= c.r + 1.2 && d > 0.0001) {
              pos.x -= (dx / d) * (d - max);
              pos.z -= (dz / d) * (d - max);
            }
            continue;
          }
          const min = c.r + radius;
          if (d < min && d > 0.0001) {
            pos.x += (dx / d) * (min - d);
            pos.z += (dz / d) * (min - d);
          }
        } else {
          const dx = pos.x - c.x;
          const dz = pos.z - c.z;
          const ox = c.hw + radius - Math.abs(dx);
          const oz = c.hd + radius - Math.abs(dz);
          if (ox > 0 && oz > 0) {
            if (ox < oz) pos.x += Math.sign(dx || 1) * ox;
            else pos.z += Math.sign(dz || 1) * oz;
          }
        }
      }
    }
    pos.x = clamp(pos.x, -54, 54);
    pos.z = clamp(pos.z, -50, 52);
  }

  /** Intersection rayon / décor analytique (murs, sol) pour les impacts. */
  function rayWorld(origin, dir, maxDist) {
    let best = maxDist;
    let normal = new THREE.Vector3(0, 1, 0);
    if (dir.y < -0.001) {
      const t = (0.02 - origin.y) / dir.y;
      if (t > 0 && t < best) { best = t; normal.set(0, 1, 0); }
    }
    for (const c of chapel.colliders) {
      if (c.r != null) continue;
      const minX = c.x - c.hw, maxX = c.x + c.hw;
      const minZ = c.z - c.hd, maxZ = c.z + c.hd;
      let tmin = 0, tmax = best;
      let axis = 0, sign = 1;
      if (Math.abs(dir.x) < 1e-6) {
        if (origin.x < minX || origin.x > maxX) continue;
      } else {
        let t1 = (minX - origin.x) / dir.x, t2 = (maxX - origin.x) / dir.x;
        let s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = 0; sign = s; }
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      if (Math.abs(dir.z) < 1e-6) {
        if (origin.z < minZ || origin.z > maxZ) continue;
      } else {
        let t1 = (minZ - origin.z) / dir.z, t2 = (maxZ - origin.z) / dir.z;
        let s = -1;
        if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = 2; sign = s; }
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) continue;
      }
      const y = origin.y + dir.y * tmin;
      if (tmin > 0.05 && tmin < best && y < 8.6 + 5) {
        best = tmin;
        normal.set(axis === 0 ? sign : 0, 0, axis === 2 ? sign : 0);
      }
    }
    return { dist: best, point: origin.clone().addScaledVector(dir, best), normal };
  }

  /* ─────────────────────────── arme : état & gestes ─────────────────────────── */

  function syncState() {
    const w = current();
    const d = w.def;
    state.ammo = d.melee ? 0 : w.mag;
    state.magSize = d.mag;
    state.reserve = d.melee ? 0 : (reserves[d.ammo] || 0);
    state.reloading = w.reloading;
    state.reloadT = w.reloadT;
    state.reloadDur = reloadTime(d);
    state.weaponIndex = weaponIndex;
    state.weaponId = d.id;
    state.weaponName = d.name;
    state.weaponShort = d.short;
    state.ammoType = d.ammo;
    state.ammoLabel = AMMO[d.ammo].label;
  }

  function setWeaponVisible() {
    for (let i = 0; i < loadout.length; i++) {
      models[loadout[i].def.id].group.visible = i === weaponIndex && state.zoomK < 0.55;
    }
  }

  function selectWeapon(i) {
    if (i < 0 || i >= loadout.length || i === weaponIndex) return false;
    if (!loadout[i].unlocked) {
      if (api.onLocked) api.onLocked(loadout[i].def);
      return false;
    }
    const prev = current();
    prev.reloading = false;
    prev.reloadT = 0;
    weaponIndex = i;
    state.switchK = 1;
    state.cooldown = 0;
    state.aiming = false;
    syncState();
    setWeaponVisible();
    audio.ui();
    if (api.onWeapon) api.onWeapon(current().def);
    return true;
  }

  /** Ramassage d'une arme : elle rejoint l'arsenal, avec deux chargeurs de dotation. */
  function unlockWeapon(id) {
    const idx = loadout.findIndex((w) => w.def.id === id);
    if (idx < 0) return false;
    const w = loadout[idx];
    if (w.unlocked) return false;
    w.unlocked = true;
    const d = w.def;
    if (!d.melee && d.ammo in reserves) {
      reserves[d.ammo] = Math.min(MAX_RESERVES[d.ammo] ?? 999, (reserves[d.ammo] || 0) + d.mag * 2);
    }
    w.mag = d.mag;
    if (api.onUnlock) api.onUnlock(d, idx);
    syncState();
    return true;
  }

  function addAmmo(type, n) {
    if (!(type in reserves)) return 0;
    const before = reserves[type];
    reserves[type] = Math.min(MAX_RESERVES[type] ?? 999, before + n);
    syncState();
    return reserves[type] - before;
  }

  function startReload() {
    const w = current();
    if (w.def.melee || w.reloading || w.mag >= w.def.mag) return false;
    if ((reserves[w.def.ammo] || 0) <= 0) {
      if (api.onEmpty) api.onEmpty(w.def);
      audio.dryFire();
      return false;
    }
    w.reloading = true;
    w.reloadT = 0;
    syncState();
    audio.reload();
    return true;
  }

  function dry() {
    audio.dryFire();
    if (state.dryT <= 0) {
      state.dryT = 0.9;
      if (api.onEmpty) api.onEmpty(current().def);
    }
    if (current().mag <= 0) startReload();
  }

  function makeDir(spread, out) {
    camera.getWorldDirection(forward);
    right.set(forward.z, 0, -forward.x).normalize();
    const a = (rng() - 0.5) * spread * 2;
    const b = (rng() - 0.5) * spread * 2;
    out.copy(forward).addScaledVector(right, a).add(new THREE.Vector3(0, b, 0)).normalize();
    return out;
  }

  /** Un rayon : renvoie les dégâts appliqués et si un hôte a été touché. */
  function fireRay(dir, dmgMul = 1) {
    const d = def();
    camera.getWorldPosition(originV);
    raycaster.set(originV, dir);
    raycaster.far = 90;
    raycaster.camera = camera;

    const targets = [];
    for (const e of (api.lastEnemies || [])) if (e.alive && e.hitRoot) targets.push(e.hitRoot);
    const hits = targets.length ? raycaster.intersectObjects(targets, true) : [];
    let usedHit = null;
    for (const h of hits) {
      if (!h.object.isMesh || h.object.userData.noHit) continue;
      let o = h.object;
      while (o && !o.userData.enemy) o = o.parent;
      if (o && o.userData.enemy) { usedHit = h; break; }
    }

    const world = rayWorld(originV, dir, 90);
    // tombes : cibles destructibles (InstancedMesh) — on encaisse avant le décor
    const graveTargets = api.graveMeshes || [];
    const graveHits = graveTargets.length ? raycaster.intersectObjects(graveTargets, false) : [];
    const graveHit = graveHits.find((h) => h.distance < Math.min(world.dist, usedHit ? usedHit.distance : Infinity));
    if (graveHit && api.onGrave) {
      const dmg = damageAtDistance(d, graveHit.distance) * dmgMul * mods.damage;
      state.lastShot = { kind: "grave", dist: +graveHit.distance.toFixed(2) };
      if (api.onGrave(graveHit, dmg, graveHit.point, dir)) {
        const n = graveHit.face ? graveHit.face.normal : new THREE.Vector3(0, 1, 0);
        fx.impact(graveHit.point, n, "stone");
        return { hit: true, grave: true };
      }
    }
    if (usedHit && usedHit.distance < world.dist) {
      let o = usedHit.object;
      while (o && !o.userData.enemy) o = o.parent;
      const enemy = o.userData.enemy;
      let part = usedHit.object.userData.part || "body";
      // un maillage unique (modèle GLB) n'a pas de sous-partie « tête » :
      // on la déduit de la hauteur du point d'impact par rapport au mort.
      if (part !== "head" && enemy && enemy.height) {
        const local = usedHit.point.y - enemy.pos.y;
        if (local > enemy.height * 0.79) part = "head";
      }
      const base = damageAtDistance(d, usedHit.distance) * dmgMul * mods.damage;
      // tête : le taux d'abattage net dépend de l'arme et de sa puissance
      const big = enemy.type === "brute" || enemy.isBoss === true || (enemy.maxHp || 0) >= 300;
      const instant = part === "head" && rng() < headshotChance(d, big, mods.head || 1);
      const dmg = instant ? (enemy.hp || 0) + 1000 : base * (part === "head" ? d.headMul * (mods.head || 1) : 1);
      const res = enemy.hit(dmg, usedHit.point, dir, part);
      state.hits++;
      state.lastShot = { kind: "enemy", dist: +usedHit.distance.toFixed(2), part };
      if (part === "head") state.headshots++;
      fx.blood(usedHit.point, dir, part === "head");
      audio.hit(part === "head");
      if (api.onHit) api.onHit(part === "head", instant);
      if (res && res.killed) {
        fx.death(enemy.pos.clone().setY(0.6));
        audio.death(0);
      }
      return { hit: true, enemy, killed: !!(res && res.killed), head: part === "head", instant };
    }
    const kind = world.point.y < 0.4 ? "ground" : "stone";
    state.lastShot = { kind, dist: +world.dist.toFixed(2) };
    fx.impact(world.point, world.normal, kind);
    return { hit: false };
  }

  function meleeAttack() {
    const d = def();
    camera.getWorldPosition(originV);
    camera.getWorldDirection(forward);
    let best = null, bestScore = -1e9;
    for (const e of (api.lastEnemies || [])) {
      if (!e.alive) continue;
      const dx = e.pos.x - originV.x, dz = e.pos.z - originV.z;
      const dist = Math.hypot(dx, dz);
      const dot = (dx * forward.x + dz * forward.z) / Math.max(0.001, dist);
      if (dist > d.reach + (e.radius || 0.3)) continue;
      if (dot < 0.45) continue;
      const score = dot * 2 - dist;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    state.shots++;
    // une tombe à portée de lame se brise aussi (avant la cible vivante si plus proche)
    if (api.graveRecords && api.onGrave) {
      let tomb = null, tombD = 1e9;
      for (const g of api.graveRecords) {
        if (!g.alive) continue;
        const dx = g.x - originV.x, dz = g.z - originV.z;
        const dist = Math.hypot(dx, dz);
        const dot = (dx * forward.x + dz * forward.z) / Math.max(0.001, dist);
        if (dist > d.reach + 0.6 || dot < 0.5) continue;
        if (dist < tombD) { tombD = dist; tomb = g; }
      }
      const enemyD = best ? Math.hypot(best.pos.x - originV.x, best.pos.z - originV.z) : 1e9;
      if (tomb && tombD < enemyD) {
        const point = new THREE.Vector3(tomb.x, 1.0, tomb.z);
        const fake = { object: tomb.mesh, instanceId: tomb.instanceId, point, distance: tombD };
        if (api.onGrave(fake, d.damage * mods.damage * (mods.melee || 1), point, forward.clone())) {
          fx.impact(point, new THREE.Vector3(0, 1, 0), "stone");
          audio.step(false, 0.2);
          return { hit: true, grave: true };
        }
      }
    }
    if (best) {
      const point = new THREE.Vector3(best.pos.x, best.pos.y + 1.35, best.pos.z);
      const dir = forward.clone();
      const res = best.hit(d.damage * mods.damage * (mods.melee || 1), point, dir, "body");
      state.hits++;
      fx.blood(point, dir, true);
      audio.hit(false);
      if (api.onHit) api.onHit(false);
      if (res && res.killed) {
        fx.death(best.pos.clone().setY(0.6));
        audio.death(0);
      }
    }
    audio.step(false, 0.2);
    return { hit: !!best };
  }

  const pierceSeen = new Set();
  /** Tir perforant : touche les premiers morts alignés, s'arrête au décor. */
  function firePierce(dir, d) {
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const world = rayWorld(origin, dir, 100);
    const rc = new THREE.Raycaster(origin, dir, 0, world.dist);
    rc.camera = camera;
    const targets = [];
    for (const e of (api.lastEnemies || [])) if (e.alive && e.hitRoot) targets.push(e.hitRoot);
    const hits = targets.length ? rc.intersectObjects(targets, true) : [];
    pierceSeen.clear();
    let n = 0;
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.enemy) o = o.parent;
      const enemy = o && o.userData.enemy;
      if (!enemy || !enemy.alive || pierceSeen.has(enemy)) continue;
      pierceSeen.add(enemy);
      let part = h.object.userData.part || "body";
      if (part !== "head" && enemy.height) {
        const local = h.point.y - enemy.pos.y;
        if (local > enemy.height * 0.79) part = "head";
      }
      const base = damageAtDistance(d, h.distance) * mods.damage;
      const big = enemy.type === "brute" || enemy.isBoss === true || (enemy.maxHp || 0) >= 300;
      const instant = part === "head" && rng() < headshotChance(d, big, mods.head || 1);
      const dmg = instant ? (enemy.hp || 0) + 1000 : base * (part === "head" ? d.headMul * (mods.head || 1) : 1);
      const res = enemy.hit(dmg, h.point, dir, part);
      state.hits++;
      if (part === "head") state.headshots++;
      fx.blood(h.point, dir, part === "head");
      audio.hit(part === "head");
      if (res && res.killed) { fx.death(enemy.pos.clone().setY(0.6)); audio.death(0); }
      n++;
      if (n >= (d.pierce || 1)) break;
    }
    if (api.onHit && n) api.onHit(false, false);
    if (!n) {
      const kind = world.point.y < 0.4 ? "ground" : "stone";
      fx.impact(world.point, world.normal, kind);
    }
  }

  const splashPoint = new THREE.Vector3();
  const splashDir = new THREE.Vector3();
  /** Explosion de zone : le point d'impact vient du décor, pas d'une cible. */
  function splashFire(dir, d) {
    const R = d.splash.radius;
    const origin = camera.getWorldPosition(new THREE.Vector3());
    const hit = rayWorld(origin, dir, 70);
    const point = splashPoint.copy(hit.point);
    // la grenade éclate sur le PREMIER obstacle : un mort touché, un mur, le sol.
    // (Viser une poitrine faisait partir l'explosion 30 m plus loin, derrière la cible.)
    {
      const rc = new THREE.Raycaster(origin, dir, 0, hit.dist);
      rc.camera = camera;
      const targets = [];
      for (const e of (api.lastEnemies || [])) if (e.alive && e.hitRoot) targets.push(e.hitRoot);
      const hs = targets.length ? rc.intersectObjects(targets, true) : [];
      if (hs.length && hs[0].distance < hit.dist) point.copy(hs[0].point);
    }
    let touched = 0;
    for (const e of (api.lastEnemies || [])) {
      if (!e.alive) continue;
      const dd = Math.hypot(e.pos.x - point.x, e.pos.z - point.z);
      if (dd > R + (e.radius || 0.3)) continue;
      const k = clamp(1 - dd / (R + 0.3), 0, 1);
      const dmg = d.damage * (d.splash.edge + (1 - d.splash.edge) * k);
      splashDir.set(e.pos.x - point.x, 0.4, e.pos.z - point.z).normalize();
      const res = e.hit(dmg, point, splashDir, "body");
      touched++;
      state.hits++;
      if (res && res.killed) {
        fx.death(e.pos.clone().setY(0.6));
        audio.death(0);
      }
    }
    // gerbe de pierre + éclat : l'explosion se voit et s'entend
    fx.impact(point, new THREE.Vector3(0, 1, 0), "stone");
    fx.glass(point.clone().setY(point.y + 0.25), 22);
    fx.puff(point.x, point.y + 0.3, point.z, { scale: 2.4, life: 1.1, color: 0xffb277, opacity: 0.5, vy: 1.2 });
    audio.quake();
    if (api.onHit && touched) api.onHit(false, false);
  }

  function fire(enemies) {
    if (!state.alive) return false;
    const w = current();
    const d = w.def;
    if (w.reloading || state.cooldown > 0 || state.switchK > 0.55) return false;
    if (d.melee) {
      state.cooldown = d.cooldown / Math.max(0.2, mods.fireRate);
      state.kick = 1;
      state.meleeT = d.meleeDur || 0.4;
      state.meleeK = 0;
      state.shake = Math.min(1, state.shake + 0.22);
      meleeAttack();
      return true;
    }
    if (w.mag <= 0) { dry(); return false; }

    w.mag--;
    state.shots++;
    state.cooldown = d.cooldown / Math.max(0.2, mods.fireRate);
    state.kick = 1;

    const spread = Math.max(0.0002,
      d.spread + (state.sprinting ? d.moveSpread : 0) +
      state.bobAmt * d.moveSpread * 0.5 + (state.onGround ? 0 : d.moveSpread * 0.8) +
      (state.aiming ? -d.spread * 0.4 : 0));
    state.spreadPx = 3 + spread * 900;

    const pellets = d.pellets || 1;
    if (d.pierce) {
      // carabine perforante : le tir traverse jusqu'à N morts alignés
      makeDir(spread, dirV);
      firePierce(dirV, d);
    } else if (d.splash) {
      // lance-grenades : pas de hitscan, une explosion au point visé qui blesse
      // tous les morts dans un rayon (dégâts dégressifs vers le bord)
      makeDir(spread, dirV);
      splashFire(dirV, d);
    } else {
      for (let i = 0; i < pellets; i++) {
        makeDir(spread, dirV);
        fireRay(dirV);
      }
    }

    audio.shot();
    setTimeout(() => audio.shell(), pellets > 1 ? 90 : 160);

    flashT = 0.055;
    const m = models[d.id];
    if (m.flash) {
      m.flash.visible = true;
      m.flash.material.opacity = 1;
      m.flash.material.rotation = rng() * Math.PI;
      m.flash.scale.setScalar((pellets > 1 ? 0.9 : 0.5) + rng() * 0.25);
    }
    flashLight.intensity = pellets > 1 ? 130 : 90;

    const mz = new THREE.Vector3().copy(m.muzzle).applyMatrix4(m.group.matrixWorld);
    fx.puff(mz.x, mz.y, mz.z, { scale: 0.5, life: 0.7, color: 0x9a958a, opacity: 0.16, vy: 0.3 });

    state.recoil += d.recoil;
    state.recoilYaw += (rng() - 0.5) * d.recoil * 0.7;
    state.shake = Math.min(1, state.shake + d.shake);
    syncState();
    return true;
  }

  function hurt(amount, fromDir = null) {
    if (!state.alive || state.god) return;
    // 0,45 s d'invulnérabilité : sans elle, cinq marcheurs tuaient en 1,7 s et
    // la courbe de PV n'était qu'une série de marches de 40 à 77 PV (mesuré).
    if (state.invuln > 0) return;
    state.invuln = 0.45;
    amount = amount * (mods.damageTaken || 1);
    state.hp = clamp(state.hp - amount, 0, state.maxHp);
    state.damageTaken += amount;
    state.hurtFlash = 1;
    state.shake = Math.min(1.4, state.shake + 0.55);
    audio.hurt();
    if (state.hp <= 0) {
      state.alive = false;
      state.deadT = 0;
    }
  }

  function heal(amount) {
    state.hp = clamp(state.hp + amount, 0, state.maxHp);
    state.healing = 1;
  }

  /** Bénédiction : modifie un multiplicateur (cumulatif) et met à jour les PV max. */
  function applyMod(kind, mul) {
    if (!(kind in mods)) return null;
    mods[kind] = Math.max(0.2, mods[kind] * mul);
    if (kind === "maxHp") {
      const next = Math.round(100 * mods.maxHp);
      const gain = next - state.maxHp;
      state.maxHp = next;
      if (gain > 0) heal(gain);
      else state.hp = Math.min(state.hp, state.maxHp);
    }
    return mods[kind];
  }

  function setAiming(on) {
    state.aiming = !!on && !!def().zoom && state.alive;
  }

  /* ─────────────────────────── butin & mesures ─────────────────────────── */

  /** Copie d'une arme pour le sol : sans mains, sans éclair, posée à la verticale. */
  function makeLootModel(id) {
    const src = models[id];
    if (!src) return null;
    const g = src.group.clone(true);
    g.visible = true;
    g.traverse((o) => {
      if (o.userData && o.userData.hand) o.visible = false;
      if (o.isSprite) o.visible = false;
      if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; }
    });
    g.position.set(0, 0, 0);
    g.rotation.set(0, 0, 0);
    g.scale.setScalar(1);
    return g;
  }

  /** Position écran (NDC) de la bouche du canon : y = 0 ⇒ hauteur du réticule. */
  function muzzleScreen() {
    const m = models[def().id];
    m.group.updateMatrixWorld(true);
    const v = m.group.localToWorld(muzzleWorld.copy(m.muzzle)).clone();
    v.project(viewCamera);
    return { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3), weapon: def().id };
  }

  /* ─────────────────────────── entrées armes ─────────────────────────── */

  window.addEventListener("keydown", (e) => {
    if (!input.state.enabled) return;
    if (e.code.startsWith("Digit")) {
      const n = Number(e.code.slice(5));
      if (n >= 1 && n <= loadout.length) {
        e.preventDefault();
        selectWeapon(n - 1);
      }
    }
  });
  window.addEventListener("wheel", (e) => {
    if (!input.state.enabled) return;
    if (Math.abs(e.deltaY) < 1) return;
    // la molette ne parcourt que les armes possédées
    const owned = [];
    for (let i = 0; i < loadout.length; i++) if (loadout[i].unlocked) owned.push(i);
    if (owned.length < 2) return;
    const at = Math.max(0, owned.indexOf(weaponIndex));
    const next = owned[(at + (e.deltaY > 0 ? 1 : -1) + owned.length) % owned.length];
    selectWeapon(next);
  }, { passive: true });
  window.addEventListener("mousedown", (e) => {
    if (e.button === 2 && input.state.enabled) {
      // clic droit : l'objet sélectionné d'abord, sinon la visée (lunette)
      if (api.onSecondary && api.onSecondary() === true) return;
      setAiming(true);
    }
  });
  window.addEventListener("mouseup", (e) => {
    if (e.button === 2) setAiming(false);
  });
  window.addEventListener("contextmenu", (e) => e.preventDefault());
  window.addEventListener("blur", () => { state.aiming = false; });

  /* ─────────────────────────── API ─────────────────────────── */

  const api = {
    state, view, viewScene, viewCamera, camera, onHit: null, onEmpty: null,
    onWeapon: null, onSecondary: null, onUnlock: null, onLocked: null,
    graveMeshes: null, graveRecords: null, onGrave: null,
    get rifle() { return models[def().id].group; },
    get model() { return models[def().id]; },
    get weapons() { return loadout; },
    get owned() { return loadout.filter((w) => w.unlocked).map((w) => w.def); },
    get reserves() { return reserves; },
    /** Arsenal pour le HUD : une case par arme, allumée si possédée. */
    weaponSlots() {
      return loadout.map((w, i) => ({
        index: i, slot: w.def.slot, id: w.def.id, short: w.def.short,
        owned: !!w.unlocked, active: i === weaponIndex,
      }));
    },
    /** Fiche chiffrée d'une arme (inventaire) : dégâts, tête, puissance. */
    weaponInfo(def) {
      const d = typeof def === "string" ? WEAPONS.find((w) => w.id === def) : def;
      if (!d) return null;
      return {
        id: d.id, name: d.name, short: d.short, slot: d.slot, tier: d.tier, power: d.power,
        melee: !!d.melee, ammo: d.ammo, mag: d.mag, damage: d.damage,
        headMul: d.headMul, headChance: +headshotChance(d, false).toFixed(2),
        rpm: Math.round(60 / d.cooldown), zoom: d.zoom || 0, desc: d.desc,
      };
    },
    get activeWeapon() { return loadout[weaponIndex].def; },
    models,
    lamp, lampFill, boostLight,
    mods,
    applyMod,
    rayWorld,
    debugRay() {
      const origin = camera.getWorldPosition(new THREE.Vector3());
      const dir = camera.getWorldDirection(new THREE.Vector3());
      const w = rayWorld(origin, dir, 90);
      const rc = new THREE.Raycaster(origin, dir, 0, 90);
      rc.camera = camera;   // sans ça, un Sprite enfant d'un mort fait planter Sprite.raycast
      const targets = [];
      for (const e of (api.lastEnemies || [])) if (e.alive && e.hitRoot) targets.push(e.hitRoot);
      const hs = rc.intersectObjects(targets, true);
      return { origin: origin.toArray().map(v=>+v.toFixed(2)), dir: dir.toArray().map(v=>+v.toFixed(3)),
        worldDist: +w.dist.toFixed(2), worldPoint: w.point.toArray().map(v=>+v.toFixed(2)),
        enemyDist: hs.length ? +hs[0].distance.toFixed(2) : null };
    },
    groundAt,
    hurt, heal, startReload, syncState, selectWeapon, addAmmo, unlockWeapon,
    makeLootModel,
    muzzleScreen,
    fireOnce: (enemies) => fire(enemies || api.lastEnemies || []),
    get alive() { return state.alive; },
    get pos() { return state.pos; },
    get aiming() { return state.aiming; },

    /** Outil de test/capture : toutes les armes d'un coup. */
    unlockAll() {
      for (const w of loadout) w.unlocked = true;
      syncState();
      return loadout.length;
    },

    /** Nouvelle veille : on repart des armes de service. */
    resetRun() {
      for (const w of loadout) w.unlocked = START_WEAPONS.includes(w.def.id);
      api.refill();
    },

    refill() {
      for (const w of loadout) {
        w.mag = w.def.mag;
        w.reloading = false;
        w.reloadT = 0;
      }
      Object.assign(reserves, DEFAULT_RESERVES);
      weaponIndex = 0;
      state.hp = state.maxHp;
      state.stamina = 100;
      state.alive = true;
      state.reloading = false;
      state.deadT = 0;
      state.recoil = 0;
      state.recoilYaw = 0;
      state.kick = 0;
      state.aiming = false;
      state.zoomK = 0;
      state.switchK = 0;
      state.meleeT = 0;
      state.meleeK = 0;
      state.lanternBoost = 0;
      state.dryT = 0;
      state.shots = 0;
      state.hits = 0;
      state.headshots = 0;
      state.damageTaken = 0;
      syncState();
      setWeaponVisible();
    },

    setLantern(on) {
      state.lanternOn = on;
      lamp.intensity = on ? 60 : 0;
    },

    boostLantern(seconds = 20) {
      state.lanternBoost = Math.max(state.lanternBoost, seconds);
    },

    teleport(x, z, yaw = 0, pitch = 0) {
      state.pos.set(x, groundAt(x, z), z);
      state.vel.set(0, 0, 0);
      state.yaw = yaw;
      state.pitch = pitch;
    },

    update(dt, world) {
      const { colliders = [], enemies = [], paused = false, freeze = false } = world;
      const s = state;
      api.lastEnemies = enemies;
      const w = current();
      const d = w.def;

      // éclair de bouche
      if (flashT > 0) {
        flashT -= dt;
        const m = models[d.id];
        if (m.flash) {
          m.flash.visible = true;
          m.flash.material.opacity = Math.max(0, flashT / 0.055);
        }
        flashLight.intensity = Math.max(0, flashT / 0.055) * (d.pellets > 1 ? 130 : 90);
      } else {
        const m = models[d.id];
        if (m.flash) { m.flash.visible = false; m.flash.material.opacity = 0; }
        flashLight.intensity = 0;
      }

      if (!s.alive) {
        s.deadT += dt;
        s.pitch = damp(s.pitch, -0.5, 3, dt);
        s.pos.y = damp(s.pos.y, groundAt(s.pos.x, s.pos.z) - 1.1, 2.2, dt);
        camera.position.set(s.pos.x, s.pos.y + EYE * 0.55, s.pos.z);
        camera.rotation.set(s.pitch, s.yaw, damp(0, 0.7, 2, dt));
        return;
      }

      // regard
      const look = input.consumeLook();
      const sens = 0.0022 * (settings.sensitivity ?? 1);
      s.yaw -= look.x * sens;
      s.pitch -= look.y * sens * (settings.invertY ? -1 : 1);
      s.pitch = clamp(s.pitch, -1.48, 1.48);

      // déplacement
      const k = input.state.keys;
      let fx2 = 0, fz2 = 0;
      // ZASE : Z (KeyW) avant, A (KeyQ) gauche, S arrière, E (KeyE) droite.
      // KeyA/KeyD restent acceptés (claviers QWERTY) et les flèches aussi.
      if (k.has("KeyW") || k.has("KeyZ") || k.has("ArrowUp")) fz2 += 1;
      if (k.has("KeyS") || k.has("ArrowDown")) fz2 -= 1;
      if (k.has("KeyQ") || k.has("KeyA") || k.has("ArrowLeft")) fx2 -= 1;
      if (k.has("KeyE") || k.has("KeyD") || k.has("ArrowRight")) fx2 += 1;
      const moving = fx2 !== 0 || fz2 !== 0;
      const len = Math.hypot(fx2, fz2) || 1;
      fx2 /= len; fz2 /= len;

      const wantSprint = (k.has("ShiftLeft") || k.has("ShiftRight")) && fz2 > 0.2 && s.stamina > 2 && moving;
      s.sprinting = wantSprint;
      const speed = (wantSprint ? 6.6 : 4.15) * (mods.speed || 1);

      const cos = Math.cos(s.yaw), sin = Math.sin(s.yaw);
      const wishX = (-sin * fz2 + cos * fx2) * speed;
      const wishZ = (-cos * fz2 - sin * fx2) * speed;

      const accel = s.onGround ? 12 : 3.4;
      s.vel.x = damp(s.vel.x, wishX, accel, dt);
      s.vel.z = damp(s.vel.z, wishZ, accel, dt);

      if (s.onGround && input.state.keys.has("Space")) {
        s.vel.y = 5.4;
        s.onGround = false;
        audio.step(false, 0);
      }
      s.vel.y -= 19.5 * dt;

      const before = tmp.copy(s.pos);
      s.pos.x += s.vel.x * dt;
      s.pos.z += s.vel.z * dt;
      s.pos.y += s.vel.y * dt;

      resolve(s.pos, 0.34, colliders);
      const g = groundAt(s.pos.x, s.pos.z);
      if (s.pos.y <= g) {
        if (!s.onGround && s.vel.y < -3) {
          s.shake = Math.min(1, s.shake + 0.25);
          audio.step(true, 0);
        }
        s.pos.y = g;
        s.vel.y = 0;
        s.onGround = true;
      } else {
        s.onGround = false;
      }

      s.distance += Math.hypot(s.pos.x - before.x, s.pos.z - before.z);

      if (wantSprint && moving) s.stamina = clamp(s.stamina - 24 * dt, 0, 100);
      else s.stamina = clamp(s.stamina + 17 * dt, 0, 100);

      const horizSpeed = Math.hypot(s.vel.x, s.vel.z);
      if (s.onGround && horizSpeed > 0.6) {
        s.lastStep -= dt * (horizSpeed / 4.2);
        if (s.lastStep <= 0) {
          s.lastStep = s.sprinting ? 0.34 : 0.5;
          audio.step(s.sprinting, Math.sin(s.bob) * 0.2);
          s.bobAmt = Math.min(1, s.bobAmt + 0.2);
        }
      }

      if (s.sprinting) {
        s.breathT -= dt;
        if (s.breathT <= 0) { s.breathT = 1.5; audio.breathe(); }
      }

      // cadence
      s.cooldown = Math.max(0, s.cooldown - dt);
      s.dryT = Math.max(0, s.dryT - dt);

      // rechargement de l'arme active
      if (w.reloading) {
        w.reloadT += dt;
        if (w.reloadT >= reloadTime(d)) {
          const need = d.mag - w.mag;
          const take = Math.min(need, reserves[d.ammo] || 0);
          w.mag += take;
          reserves[d.ammo] = (reserves[d.ammo] || 0) - take;
          w.reloading = false;
          w.reloadT = 0;
        }
      }
      syncState();

      // tir
      const firedNow = input.consumeFire();
      if (d.auto) {
        if (input.state.fire) fire(enemies);
      } else if (firedNow) {
        fire(enemies);
      }

      // secousse / recul
      s.shake = damp(s.shake, 0, 4.5, dt);
      shakeT += dt * 30;
      s.recoil = damp(s.recoil, 0, 9, dt);
      s.recoilYaw = damp(s.recoilYaw, 0, 9, dt);
      s.hurtFlash = damp(s.hurtFlash, 0, 2.4, dt);
      s.invuln = Math.max(0, s.invuln - dt);
      s.healing = damp(s.healing, 0, 3, dt);
      if (!s.meleeHold) s.meleeT = Math.max(0, s.meleeT - dt);
      s.lanternBoost = Math.max(0, s.lanternBoost - dt);

      // zoom (carabine) : interpolation douce, le modèle disparaît sous la lunette
      const zoomTarget = s.aiming && d.zoom ? 1 : 0;
      s.zoomK = damp(s.zoomK, zoomTarget, 9, dt);
      if (s.zoomK < 0.004) s.zoomK = 0;
      setWeaponVisible();

      // oscillation de marche
      s.bob += dt * horizSpeed * 2.1;
      s.bobAmt = damp(s.bobAmt, s.onGround ? Math.min(1, horizSpeed / 4.2) : 0, 6, dt);
      const bobY = Math.sin(s.bob * 2) * 0.030 * s.bobAmt;
      const bobX = Math.sin(s.bob) * 0.022 * s.bobAmt;

      const shakeAmt = s.shake * 0.012;
      const sx = (Math.sin(shakeT * 3.1) + Math.sin(shakeT * 7.7)) * shakeAmt;
      const sy = (Math.sin(shakeT * 4.3) + Math.sin(shakeT * 9.1)) * shakeAmt;

      camera.position.set(s.pos.x + bobX * 0.4, s.pos.y + EYE + bobY, s.pos.z);
      camera.rotation.set(
        clamp(s.pitch + s.recoil + sy, -1.55, 1.55),
        s.yaw + s.recoilYaw + sx,
        Math.sin(s.bob) * 0.006 * s.bobAmt - sx * 0.5
      );
      camera.rotation.order = "YXZ";

      // FOV : base + sprint, réduit par la lunette
      const baseFov = settings.fov ?? 78;
      const wantFov = (baseFov + (s.sprinting ? 5 : 0)) * (1 - (1 - (d.zoom || 1)) * s.zoomK);
      if (Math.abs(camera.fov - wantFov) > 0.05) {
        camera.fov = damp(camera.fov, wantFov, 6, dt);
        camera.updateProjectionMatrix();
      }

      // view-model : repos, inertie souris, marche, recul, rechargement, changement
      const m = models[d.id];
      const rest = m.rest;
      const swayX = clamp(-look.x * 0.00035, -0.02, 0.02) * (1 - s.zoomK);
      const swayY = clamp(look.y * 0.0003, -0.02, 0.02) * (1 - s.zoomK);
      const rk = w.reloading ? clamp(w.reloadT / Math.max(0.001, reloadTime(d)), 0, 1) : 0;
      const rl = Math.sin(rk * Math.PI);
      const sw = s.switchK;

      let px = rest.pos[0] + swayX + bobX * 0.3;
      let py = rest.pos[1] + swayY + bobY * 0.6;
      let pz = rest.pos[2] + s.kick * 0.045;
      let rx = rest.rot[0] + s.kick * (d.kick || 1) * 0.12;
      let ry = rest.rot[1] + swayX * 1.4;
      let rz = rest.rot[2] + Math.sin(s.bob) * 0.01 * s.bobAmt;

      // gestes de rechargement, distincts par arme
      if (rl > 0) {
        py -= rl * 0.085;
        pz += rl * 0.035;
        rx -= rl * (d.reloadStyle === "bolt" ? 0.85 : 0.5);
        rz += rl * (d.reloadStyle === "pump" ? 0.5 : 0.33);
        ry += rl * (d.reloadStyle === "mag" ? 0.34 : 0.2);
      }
      // changement d'arme : l'arme remonte du bas
      if (sw > 0) {
        py -= Math.sin(clamp(sw, 0, 1) * Math.PI * 0.5) * 0.42;
        rx -= sw * 0.55;
        rz += sw * 0.25;
      }
      // frappe de mêlée : armement, coup, retour (profils hachette / machette)
      if (s.meleeT > 0 && d.melee) {
        const md = d.meleeDur || 0.4;
        s.meleeK = clamp(1 - s.meleeT / md, 0, 1);
        const pose = meleePose(d, s.meleeK);
        px += pose.dx; py += pose.dy; pz += pose.dz;
        rx += pose.rx; ry += pose.ry; rz += pose.rz;
      } else {
        s.meleeK = 0;
      }

      // traînée de lame pendant la frappe (arc large, éphémère)
      if (s.meleeT > 0 && d.melee && s.meleeK > 0.26 && s.meleeK < 0.62) {
        const u = (s.meleeK - 0.26) / 0.36;
        trail.visible = true;
        trailMat.opacity = Math.sin(u * Math.PI) * 0.38;
        if (d.meleeStyle === "slash") {
          trail.rotation.set(0.05, 0.1, -1.25 + u * 1.05);
          trail.position.set(0.03, -0.14, -0.6);
          trail.scale.set(0.92, 0.92, 1);
        } else {
          trail.rotation.set(0.08, 0, 0.6 - u * 1.35);
          trail.position.set(0.05, -0.04, -0.6);
          trail.scale.set(0.8, 0.8, 1);
        }
      } else {
        trail.visible = false;
      }

      // une frappe est plus sèche qu'un simple repos : on suit la pose de près
      const swing = s.meleeT > 0;
      m.group.position.x = damp(m.group.position.x, px, swing ? 30 : 12, dt);
      m.group.position.y = damp(m.group.position.y, py, swing ? 30 : 12, dt);
      m.group.position.z = damp(m.group.position.z, pz, swing ? 34 : 16, dt);
      m.group.rotation.x = damp(m.group.rotation.x, rx, swing ? 32 : 14, dt);
      m.group.rotation.y = damp(m.group.rotation.y, ry, swing ? 30 : 12, dt);
      m.group.rotation.z = damp(m.group.rotation.z, rz, swing ? 32 : 12, dt);
      m.group.scale.setScalar(damp(m.group.scale.x, rest.scale ?? 1, 10, dt));

      // pièces mobiles
      const nodes = w.nodes;
      if (nodes.slide) nodes.slide.node.position.z = nodes.slide.p.z - (s.kick * 0.035) - rl * 0.02;
      if (nodes.pump) nodes.pump.node.position.z = nodes.pump.p.z + s.kick * 0.11 + rl * 0.09;
      if (nodes.mag) {
        nodes.mag.node.position.y = nodes.mag.p.y - (rl > 0 ? Math.sin(rk * Math.PI) * 0.24 : 0);
        nodes.mag.node.rotation.x = nodes.mag.r.x + (rl > 0 ? Math.sin(rk * Math.PI) * 0.5 : 0);
        nodes.mag.node.visible = !(rk > 0.25 && rk < 0.62);
      }
      if (nodes.bolt) {
        const bk = d.reloadStyle === "bolt" ? rl : 0;
        nodes.bolt.node.position.x = nodes.bolt.p.x + bk * 0.055;
        nodes.bolt.node.rotation.z = nodes.bolt.r.z + bk * 0.95;
      }
      if (nodes.hammer) nodes.hammer.node.rotation.x = nodes.hammer.r.x + s.kick * 0.3;

      s.kick = damp(s.kick, 0, 12, dt);
      s.switchK = damp(s.switchK, 0, 9, dt);
      if (s.switchK < 0.004) s.switchK = 0;

      // lanterne : intensité + huile
      const boost = s.lanternBoost > 0;
      boostLight.visible = boost && s.lanternOn;
      lamp.intensity = s.lanternOn ? (boost ? 92 : 58) + Math.sin(performance.now() * 0.011) * 5 : 0;
      lamp.distance = boost ? 30 : 22;
      boostLight.intensity = boost && s.lanternOn ? 46 + Math.sin(performance.now() * 0.02) * 6 : 0;
      lampFill.intensity = boost ? 12 : 7;

      if (paused || freeze) {
        s.vel.set(0, 0, 0);
      }
    },

    muzzleWorld() {
      const m = models[def().id];
      return m.group.localToWorld(muzzleWorld.copy(m.muzzle)).clone();
    },
  };

  syncState();
  setWeaponVisible();
  return api;
}
