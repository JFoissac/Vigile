// zombie.js — les morts : marcheur décharné, coureur sec, colosse.
//
// Charpente articulée (zombie_rig.js) + animation par articulation
// (zombie_anim.js) : idle, walk, run, attack télégraphié, hit, death et
// EMERGE. Chaque zombie de vague sort de terre (1,6 à 2,4 s, décalage
// aléatoire) : monticule, mottes, poussière, secousse de caméra et son étouffé
// à proximité. Pendant l'émergence il est invulnérable et n'attaque pas.
//
// API publique conservée pour game.js : createZombie({...}) → objet avec
// update(dt, ctx), hit(dmg, point, dir, part), dispose(), alive, dead, hp,
// maxHp, pos, radius, type, rising, rise, atk, stagger, deathT, counted,
// hitRoot, group, root, torso, head, armL, armR, legs. Champs ajoutés :
// state, anim, emerge, joints, height, width, stuckT, stuckCount, strafeT.

import * as THREE from "three";
import { T, rep } from "../world/textures.js";
import { merge } from "../world/geo.js";
import { clamp, makeRng, randRange } from "../core/util.js";
import { buildZombieModel, zombieMaterials, disposeRig } from "./zombie_rig.js";
import { createAnimator, emergeY, EMERGE } from "./zombie_anim.js";
import { createClipAnimator } from "./zombie_glb.js";

export const ZOMBIE_TYPES = {
  walker: { hp: 105, speed: 1.95, damage: 16, radius: 0.36, scale: 1, score: 1, eye: 0xffb45e },
  runner: { hp: 62, speed: 4.6, damage: 10, radius: 0.34, scale: 0.97, score: 1.4, eye: 0xff8a48 },
  brute: { hp: 240, speed: 1.5, damage: 30, radius: 0.72, scale: 1.45, score: 4, eye: 0xff5a30 },
  // zélateur : garde le large, envoie une flamme noire ; fragile mais dangereux
  // loup-garou : rapide, il bondit sur sa proie (ruée) et frappe fort
  werewolf: {
    hp: 240, speed: 5.2, damage: 26, radius: 0.42, scale: 1.22, score: 3.6,
    eye: 0xff4a3a, leap: true,
  },
  zealot: {
    hp: 84, speed: 2.15, damage: 11, radius: 0.34, scale: 0.99, score: 2.2,
    eye: 0x9b7bff, ranged: true, range: 14, keep: 11,
  },
};

const ATTACK_TIME = { walker: 0.72, runner: 0.56, brute: 0.95, zealot: 1.15, werewolf: 0.5 };
const STRIKE_AT = 0.52; // fraction de l'attaque où la frappe touche

/* projectiles du zélateur : géométrie et matériaux PARTAGÉS (aucune allocation par mort) */
let boltAssets = null;
function getBoltAssets() {
  if (boltAssets) return boltAssets;
  boltAssets = {
    geo: new THREE.SphereGeometry(0.075, 8, 6),
    mat: new THREE.MeshStandardMaterial({
      color: 0x2a1640, emissive: 0x9b6bff, emissiveIntensity: 2.8, roughness: 0.3,
    }),
    halo: new THREE.SpriteMaterial({
      map: T.spark(), color: 0xc0a0ff, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.9,
    }),
  };
  return boltAssets;
}

let moundMaterial = null;
function getMoundMaterial() {
  if (moundMaterial) return moundMaterial;
  moundMaterial = new THREE.MeshStandardMaterial({
    map: rep(T.gravel(), 2.2, 2.2), color: 0x7a6650, roughness: 1, metalness: 0,
    flatShading: true,
  });
  return moundMaterial;
}

/** Monticule de terre soulevé par le mort, posé à la surface du sol. */
function makeMound(x, z, y, radius) {
  const rng = makeRng(Math.floor(Math.abs(x * 73.1 + z * 19.7) * 100) + 7);
  const geos = [];
  const dome = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const pos = dome.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    const n = 0.84 + rng() * 0.30;
    pos.setXYZ(i, px * n * radius, py * radius * (0.46 + rng() * 0.16), pz * n * radius);
  }
  dome.computeVertexNormals();
  geos.push(dome);
  // mottes agglutinées sur le pourtour : casse la silhouette lisse
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + rng() * 0.5;
    const d = radius * (0.55 + rng() * 0.5);
    const lump = new THREE.SphereGeometry(radius * (0.14 + rng() * 0.13), 6, 4);
    lump.scale(1.2, 0.7, 1.2);
    lump.translate(Math.cos(a) * d, radius * (0.02 + rng() * 0.12), Math.sin(a) * d);
    geos.push(lump);
  }
  const g = merge(geos);
  const m = new THREE.Mesh(g, getMoundMaterial());
  m.position.set(x, y + 0.005, z);
  m.receiveShadow = true;
  m.castShadow = false;
  m.scale.setScalar(0.001);
  return m;
}

/** Main qui perce la terre avant le reste du corps. */
function makeClaw() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x9a9a80, roughness: 0.95, metalness: 0, flatShading: true });
  const g = new THREE.Group();
  const palm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.055, 0.12), mat);
  palm.position.y = 0.03;
  g.add(palm);
  for (let i = 0; i < 4; i++) {
    const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.013, 0.17, 5), mat);
    finger.position.set((i - 1.5) * 0.042, 0.15, 0.03 - Math.abs(i - 1.5) * 0.012);
    finger.rotation.x = 0.28 + i * 0.05;
    finger.rotation.z = (i - 1.5) * 0.12;
    g.add(finger);
  }
  const thumb = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.014, 0.12, 5), mat);
  thumb.position.set(0.09, 0.09, 0.02);
  thumb.rotation.z = -0.9;
  g.add(thumb);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = true; } });
  g.visible = false;
  return g;
}

/** Vrai si le point tombe dans un collider (mur, pilier, caisse de pierre). */
function pointBlocked(x, z, colliders) {
  for (const c of colliders) {
    // paroi d'abside « keepIn » : c'est un bord, pas un obstacle plein ; le
    // traiter comme solide ferait traverser le chevet aux flammes et couperait
    // toutes les lignes de vue depuis l'autel.
    if (c.keepIn) continue;
    if (c.r != null) {
      if (c.half && z >= c.z) continue;
      if (Math.hypot(x - c.x, z - c.z) < c.r) return true;
    } else if (Math.abs(x - c.x) < c.hw && Math.abs(z - c.z) < c.hd) {
      return true;
    }
  }
  return false;
}

/* ─────────────────── collisions au sol ───────────────────
   Un mort est un disque (this.radius) ; les murs sont des boîtes ou des
   disques. On le repousse par le POINT LE PLUS PROCHE du volume, pas par
   l'axe de moindre pénétration : dans un angle, l'ancienne méthode le
   faisait sauter d'un mur à l'autre et il restait collé à la pierre. */

const COL_EPS = 0.004;      // marge de sortie : jamais à l'intérieur d'une face
const COL_PASSES = 2;       // passes normales (une par contact)
const COL_SAFETY = 4;       // passes de secours quand un angle le coince
const KEEPIN_SHELL = 0.5;   // demi-épaisseur du chevet : au-delà, le mort est dehors
const STUCK_WINDOW = 0.8;   // s sans avancer avant un pas de côté
const STUCK_MIN_STEP = 0.15; // m d'avancement minimal sur la fenêtre
const STUCK_SAFE_DIST = 1.6; // m : plus près du joueur, on attaque, on ne strafe pas
const STRAFE_TIME = 0.5;    // s de marche latérale

/** Repousse un disque hors d'une boîte par le plus proche chemin (coins inclus). */
function pushOutBox(pos, radius, c) {
  const dx = pos.x - c.x, dz = pos.z - c.z;
  const qx = clamp(dx, -c.hw, c.hw);
  const qz = clamp(dz, -c.hd, c.hd);
  const nx = dx - qx, nz = dz - qz;
  const d = Math.hypot(nx, nz);
  if (d < 1e-6) {
    // centre DANS le volume : sortir par la face la plus proche, rayon compris
    const ox = c.hw - Math.abs(dx);
    const oz = c.hd - Math.abs(dz);
    if (ox <= oz) pos.x = c.x + Math.sign(dx || 1) * (c.hw + radius + COL_EPS);
    else pos.z = c.z + Math.sign(dz || 1) * (c.hd + radius + COL_EPS);
    return true;
  }
  if (d >= radius + COL_EPS) return false;
  const k = (radius + COL_EPS - d) / d;
  pos.x += nx * k;
  pos.z += nz * k;
  return true;
}

/** Repousse un disque hors d'un disque plein, par le centre. */
function pushOutCircle(pos, radius, c) {
  const dx = pos.x - c.x, dz = pos.z - c.z;
  const d = Math.hypot(dx, dz);
  const min = c.r + radius + COL_EPS;
  if (d >= min) return false;
  if (d > 1e-5) {
    const k = min / d;
    pos.x = c.x + dx * k;
    pos.z = c.z + dz * k;
  } else {
    pos.x = c.x + min; // dégénéré (centre confondu) : direction stable
  }
  return true;
}

/** Paroi « keepIn » (abside) : on garde le mort DEDANS, jamais éjecté dehors. */
function keepInsideDisc(pos, radius, c) {
  const dx = pos.x - c.x, dz = pos.z - c.z;
  const d = Math.hypot(dx, dz);
  // au-delà de l'épaisseur du mur, le mort est simplement dehors : ne pas
  // l'aspirer à travers le chevet depuis l'autre côté du bâtiment
  if (d >= c.r + KEEPIN_SHELL) return false;
  const max = c.r - radius - COL_EPS;
  if (d <= max || d < 1e-5) return false;
  const k = max / d;
  pos.x = c.x + dx * k;
  pos.z = c.z + dz * k;
  return true;
}

/** Le mort mord-il encore ce volume ? (test exact, sans marge) */
function overlapsCollider(x, z, r, c) {
  if (c.r != null) {
    if (c.half && z >= c.z) return false;
    const d = Math.hypot(x - c.x, z - c.z);
    if (c.keepIn) return d > c.r - r && d < c.r + KEEPIN_SHELL;
    return d < c.r + r - 0.002;
  }
  const dx = Math.abs(x - c.x), dz = Math.abs(z - c.z);
  if (dx <= c.hw && dz <= c.hd) return true;
  const qx = Math.max(dx - c.hw, 0), qz = Math.max(dz - c.hd, 0);
  return Math.hypot(qx, qz) < r - 0.002;
}

function overlapsAny(x, z, r, colliders) {
  for (const c of colliders) if (overlapsCollider(x, z, r, c)) return true;
  return false;
}

/** Dernier recours : le point libre le plus proche (angle de deux murs). */
function escapeToFree(pos, radius, colliders) {
  const x0 = pos.x, z0 = pos.z;
  for (let ring = 1; ring <= 8; ring++) {
    const d = 0.12 * ring;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + (ring % 2) * 0.39;
      const nx = x0 + Math.cos(a) * d, nz = z0 + Math.sin(a) * d;
      if (!overlapsAny(nx, nz, radius, colliders)) {
        pos.x = nx;
        pos.z = nz;
        return true;
      }
    }
  }
  return false;
}

/** Applique une passe de contacts sur tous les volumes. */
function applyContacts(pos, radius, colliders) {
  for (const c of colliders) {
    if (c.r != null) {
      if (c.half && pos.z >= c.z) continue;
      if (c.keepIn) keepInsideDisc(pos, radius, c);
      else pushOutCircle(pos, radius, c);
    } else {
      pushOutBox(pos, radius, c);
    }
  }
}

/** Résout tous les contacts ; garantit un point hors volume en fin d'appel. */
function resolveColliders(pos, radius, colliders) {
  for (let pass = 0; pass < COL_PASSES; pass++) applyContacts(pos, radius, colliders);
  for (let pass = 0; pass < COL_SAFETY && overlapsAny(pos.x, pos.z, radius, colliders); pass++) {
    applyContacts(pos, radius, colliders);
  }
  // aucune frame ne doit finir avec un mort dans la pierre
  if (overlapsAny(pos.x, pos.z, radius, colliders)) escapeToFree(pos, radius, colliders);
}

/** Côté libre pour un pas de côté (±1), en évitant de replonger dans le mur. */
function pickStrafeDir(pos, radius, colliders, ux, uz, prev) {
  const ax = -uz, az = ux;          // perpendiculaire gauche
  const near = radius + 0.6, far = radius + 1.5;
  const score = (sx, sz) => {
    let s = 0;
    if (!overlapsAny(pos.x + sx * near, pos.z + sz * near, radius * 0.9, colliders)) s += 1;
    if (!overlapsAny(pos.x + sx * far, pos.z + sz * far, radius * 0.9, colliders)) s += 2;
    return s;
  };
  const left = score(ax, az), right = score(-ax, -az);
  if (left > right) return 1;
  if (right > left) return -1;
  // même dégagement des deux côtés : on GARDE le cap précédent (alterner
  // ferait un va-et-vient sur place, exactement le blocage qu'on corrige)
  return prev || 1;
}


/** Ligne de vue échantillonnée : un zélateur ne tire pas à travers la chapelle. */
function hasLineOfSight(ax, az, bx, bz, colliders) {
  const d = Math.hypot(bx - ax, bz - az);
  if (d < 0.2) return true;
  const steps = Math.min(30, Math.ceil(d / 0.6));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (pointBlocked(ax + (bx - ax) * t, az + (bz - az) * t, colliders)) return false;
  }
  return true;
}

export function createZombie({
  scene, x, z, type = "walker", difficulty = 1, seed = 1, groundAt,
  speedMul = 1, damageMul = 1,
}) {
  const cfg = ZOMBIE_TYPES[type] || ZOMBIE_TYPES.walker;
  const rng = makeRng(seed * 7919 + 13);
  const mats = zombieMaterials();
  const ground = typeof groundAt === "function" ? groundAt : () => 0;

  const group = new THREE.Group();
  group.position.set(x, ground(x, z), z);
  scene.add(group);

  /* ── charpente articulée ── */
  const rig = buildZombieModel({ type, cfg, rng, mats });
  const root = rig.root;
  group.add(root);

  const joints = rig.joints;
  const scale = cfg.scale * (0.95 + rng() * 0.1);
  group.scale.setScalar(scale);

  // Un modèle GLB est déjà remis à l'échelle dans la fabrique (root.scale = 1/cfg.scale) :
  // sa hauteur est native, sinon un colosse mesurerait 3,4 m et sa tête deviendrait intouchable.
  const height = rig.glb ? (rig.height || 1.8) : (rig.height || 1.8) * scale;
  const buried = Math.max(1.4, height) * 1.04 + 0.30; // à t = 0, tout le corps est sous le sol
  // le mort est enterré dès sa création : aucune image debout avant l'émergence
  group.position.y = ground(x, z) - buried;

  const animator = rig.glb ? createClipAnimator(rig) : createAnimator(rig, { seed });

  /* ── ombre de contact (posée à la surface, suit l'émergence) ── */
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.25, 1.25),
    new THREE.MeshBasicMaterial({
      map: T.dot(), color: 0x000000, transparent: true, opacity: 0.42,
      depthWrite: false, blending: THREE.NormalBlending,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.014;
  shadow.renderOrder = 1;
  shadow.raycast = () => {};
  shadow.userData.noHit = true;
  group.add(shadow);

  /* ── cibles de tir ── */
  group.traverse((o) => { if (o.isMesh && !o.userData.part) o.userData.part = "body"; });

  const z0 = {
    type, cfg, group, root,
    torso: joints.torso, head: joints.head,
    armL: joints.shL, armR: joints.shR,
    legs: [joints.hipL, joints.hipR],
    joints,
    pos: group.position,
    alive: true,
    hp: cfg.hp * Math.pow(difficulty, 1.12),
    maxHp: cfg.hp * Math.pow(difficulty, 1.12),
    speed: cfg.speed * Math.min(1.45, Math.pow(difficulty, 0.35)) * (0.92 + rng() * 0.16) * speedMul,
    damage: cfg.damage * Math.pow(difficulty, 0.75) * damageMul,
    radius: cfg.radius * scale,
    hitRoot: group,
    height,
    width: rig.glb ? (rig.width || 0.5) : (rig.width || 0.5) * scale,
    phase: rng() * Math.PI * 2,
    rise: 0,
    rising: true,
    state: "emerge",
    anim: "emerge",
    atk: 0,
    atkCd: randRange(rng, 0.3, 1.2),
    leapT: 0,
    leapDir: { x: 0, z: 0 },
    stagger: 0,
    deathT: 0,
    dead: false,
    counted: false,
    seed: rng() * 100,
    lastGrowl: randRange(rng, 2, 8),
    flash: 0,

    /* ── anti-enlisement (mur, angle, abside) ── */
    stuckT: 0,
    stuckRefX: x,
    stuckRefZ: z,
    strafeT: 0,
    strafeDir: 1,
    stuckCount: 0,

    /* ── émergence ── */
    emerge: {
      active: true,
      t: 0,
      delay: randRange(rng, 0, EMERGE.maxDelay),
      dur: randRange(rng, EMERGE.minDuration, EMERGE.maxDuration),
      k: 0,
      bias: randRange(rng, -1, 1),
      stage: "sous-sol",
      beats: 0,
      mound: null,
      fired: [false, false, false],
    },

    hit(dmg, point, dir, part) {
      if (!this.alive) return { killed: false };
      // invulnérable pendant la sortie de terre : la balle ne fait que lever
      // un peu de poussière, aucun dégât, aucun stagger
      if (this.rising || this.state === "emerge") {
        return { killed: false, ignored: true, emerging: true };
      }
      this.hp -= dmg;
      this.stagger = Math.max(this.stagger, part === "head" ? 0.3 : 0.14);
      this.flash = 0.12;
      if (this.hp <= 0) {
        this.alive = false;
        this.dead = true;
        this.state = "dead";
        this.deathT = 0;
        return { killed: true, headshot: part === "head" };
      }
      return { killed: false };
    },

    dispose() {
      for (const b of bolts) scene.remove(b.mesh);
      bolts.length = 0;
      if (this.emerge.mound) {
        scene.remove(this.emerge.mound);
        this.emerge.mound.geometry.dispose();
        this.emerge.mound = null;
      }
      scene.remove(group);
      if (animator.dispose) animator.dispose();
      disposeRig(root);
      if (this.emerge.claw) { this.emerge.claw.geometry?.dispose?.(); }
      shadow.geometry.dispose();
      shadow.material.dispose();
    },
  };

  /* ── zélateur : brûle-parfum et flammes noires ── */
  const bolts = [];
  let censer = null;
  if (type === "zealot") {
    // attaché au GROUPE (pas à un os GLB, dont les matrices ne sont pas dans le
    // même espace) : la flamme suit le corps sans jamais partir sous le sol
    censer = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 10, 8),
      new THREE.MeshStandardMaterial({
        color: 0x241536, emissive: 0x9b6bff, emissiveIntensity: 1.5, roughness: 0.32,
      }),
    );
    censer.position.set(0.38, 1.04, 0.2);
    censer.userData.noHit = true;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.spark(), color: 0xc4a4ff, transparent: true, blending: THREE.AdditiveBlending,
      depthWrite: false, opacity: 0.6,
    }));
    halo.scale.setScalar(0.6);
    censer.add(halo);
    group.add(censer);
  }

  /** Flamme noire : projectile lent, traçant, qui se brise sur les murs. */
  function fireBolt(ctx) {
    z0.boltsFired = (z0.boltsFired || 0) + 1;
    const from = new THREE.Vector3();
    if (censer) censer.getWorldPosition(from);
    else from.set(z0.pos.x, z0.pos.y + 1.4, z0.pos.z);
    const p = ctx.player;
    const target = new THREE.Vector3(p.pos.x, p.pos.y + 1.15, p.pos.z);
    // flamme lente et lisible : on doit pouvoir l'esquiver d'un pas de côté
    const vel = target.sub(from).normalize().multiplyScalar(11.5);
    const A = getBoltAssets();
    const mesh = new THREE.Mesh(A.geo, A.mat);
    mesh.position.copy(from);
    const halo = new THREE.Sprite(A.halo);
    halo.scale.setScalar(0.62);
    mesh.add(halo);
    scene.add(mesh);
    bolts.push({ mesh, vel, life: 3.2, steps: 0, from: from.toArray().map((v) => +v.toFixed(2)) });
    if (censer) censer.material.emissiveIntensity = 3.6;
    if (ctx.audio && ctx.audio.bolt) ctx.audio.bolt(from.distanceTo(p.pos));
  }

  function updateBolts(dt, ctx) {
    const p = ctx.player;
    const cols = ctx.colliders || [];
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.life -= dt;
      b.steps++;
      b.mesh.position.addScaledVector(b.vel, dt);
      const dx = b.mesh.position.x - p.pos.x;
      const dz = b.mesh.position.z - p.pos.z;
      const dy = b.mesh.position.y - (p.pos.y + 1.1);
      const hit = p.alive !== false && Math.hypot(dx, dz) < 0.45 && Math.abs(dy) < 0.75;
      const wall = pointBlocked(b.mesh.position.x, b.mesh.position.z, cols);
      if (hit) {
        p.hurt(z0.damage * 0.55, b.vel.clone().normalize());
        if (ctx.fx) ctx.fx.blood(b.mesh.position.clone(), b.vel.clone().normalize(), false);
      }
      const low = b.mesh.position.y < ground(b.mesh.position.x, b.mesh.position.z) - 0.6;
      if (hit || wall || b.life <= 0 || low) {
        z0.lastBolt = { reason: hit ? "hit" : wall ? "wall" : low ? "low" : "life", steps: b.steps, from: b.from, vel: b.vel.toArray().map((v) => +v.toFixed(2)), pos: [+b.mesh.position.x.toFixed(2), +b.mesh.position.y.toFixed(2), +b.mesh.position.z.toFixed(2)], player: [+p.pos.x.toFixed(2), +p.pos.z.toFixed(2)] };
        if (ctx.fx && !hit) ctx.fx.puff(b.mesh.position.x, b.mesh.position.y, b.mesh.position.z, {
          scale: 0.6, life: 0.4, color: 0x9b7bff, opacity: 0.4, vy: 0.2,
        });
        scene.remove(b.mesh);
        bolts.splice(i, 1);
      }
    }
  }

  group.traverse((o) => { if (o.isMesh) o.userData.enemy = z0; });

  /* ── fin de l'émergence ── */
  function finishEmerge(ctx, snap = false) {
    const E = z0.emerge;
    E.active = false;
    E.k = 1;
    z0.rising = false;
    z0.rise = 1;
    z0.state = "walk";
    z0.anim = "walk";
    E.stage = "debout";
    if (E.mound) {
      scene.remove(E.mound);
      E.mound.geometry.dispose();
      E.mound = null;
    }
    if (!snap) z0.pos.y = ground(z0.pos.x, z0.pos.z);
    // le premier pas se fait hors de la pierre : un mort posé dans un meuble
    // (scénario, spawn de vague) est dégagé dès qu'il se met debout
    if (ctx && ctx.colliders) resolveColliders(z0.pos, z0.radius, ctx.colliders);
    if (rig.glb) rig.root.rotation.x = 0;
    shadow.position.y = 0.014;
    shadow.material.opacity = 0.42;
    if (ctx && ctx.fx) {
      ctx.fx.puff(z0.pos.x, z0.pos.y + 0.18, z0.pos.z, {
        scale: 1.4, life: 0.8, color: 0x6b6353, opacity: 0.22, vy: 0.25,
      });
    }
  }

  /* ── la sortie de terre ── */
  function updateEmerge(dt, ctx) {
    const E = z0.emerge;
    const { player, fx, audio } = ctx;
    E.t += dt;

    const px = player ? player.pos.x : z0.pos.x;
    const pz = player ? player.pos.z : z0.pos.z;
    const dist = Math.hypot(px - z0.pos.x, pz - z0.pos.z);
    const prox = clamp(1 - dist / 14, 0, 1);

    // le mort se tourne vers le joueur pendant qu'il se hisse
    if (player && dist < 34) {
      const targetYaw = Math.atan2(px - z0.pos.x, pz - z0.pos.z);
      let d = targetYaw - group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      group.rotation.y += d * Math.min(1, dt * 1.8);
    }

    const k = clamp((E.t - E.delay) / E.dur, 0, 1);
    E.k = k;
    z0.rise = k;

    // position verticale : la courbe ne remonte jamais, aucun pop en surface
    const gy = ground(z0.pos.x, z0.pos.z);
    group.position.y = gy + buried * emergeY(k);
    // le corps se penche en avant pendant le hissage puis se redresse
    if (rig.glb) rig.root.rotation.x = Math.sin(k * Math.PI) * 0.22;
    shadow.position.y = (-group.position.y + gy + 0.014) / scale;
    shadow.material.opacity = 0.42 * clamp((k - 0.25) * 2.2, 0, 1);

    // monticule
    if (E.t >= E.delay && !E.mound) {
      E.mound = makeMound(z0.pos.x, z0.pos.z, gy, 0.40 + scale * 0.18);
      scene.add(E.mound);
    }
    // la main perce la terre avant le corps
    if (!E.claw) {
      E.claw = makeClaw();
      group.add(E.claw);
    }
    if (E.claw) {
      const up = clamp((k - 0.05) / 0.18, 0, 1);       // sortie de la main
      const away = clamp((k - 0.40) / 0.12, 0, 1);      // elle s'efface ensuite
      E.claw.visible = up > 0.02 && away < 1;
      const groundLocal = (gy + 0.01 - group.position.y) / scale;
      E.claw.position.set(0.34, groundLocal + up * 0.16 - away * 0.5, 0.30);
      E.claw.rotation.z = (1 - up) * 0.5 + k * 0.25;
      E.claw.rotation.x = -0.35 + up * 0.3;
      E.claw.scale.setScalar(1 - away);
    }
    if (E.mound) {
      const grow = clamp(k / 0.22, 0, 1);
      const fade = 1 - clamp((k - 0.86) / 0.13, 0, 1);
      E.mound.scale.setScalar(Math.max(0.001, grow * fade));
      E.mound.position.set(z0.pos.x, gy + 0.01, z0.pos.z);
    }

    // craquements : mottes, poussière, secousse, son étouffé
    for (let i = 0; i < EMERGE.beats.length; i++) {
      if (!E.fired[i] && k >= EMERGE.beats[i]) {
        E.fired[i] = true;
        E.beats = i + 1;
        if (fx && fx.earth) {
          fx.earth(z0.pos.x, z0.pos.z, {
            power: i === 0 ? 1.25 : i === 1 ? 0.9 : 0.65,
            groundY: gy,
          });
        }
        if (prox > 0.02) {
          if (ctx.shake) ctx.shake((i === 0 ? 0.45 : i === 1 ? 0.3 : 0.22) * prox);
          if (audio && audio.growl && dist < 34) {
            const rel = Math.atan2(z0.pos.x - px, z0.pos.z - pz);
            const ang = rel - (ctx.camYaw || 0);
            audio.growl(Math.sin(ang) * -1, dist, type === "brute");
          }
          if (type === "brute" && i === 0 && audio && audio.quake && prox > 0.35) audio.quake();
        }
      }
    }

    E.stage = k < 0.14 ? "sous-sol" : k < 0.46 ? "percée" : k < 0.68 ? "agrippement" : k < 0.88 ? "hissage" : "redressement";
    animator.update(dt, { anim: "emerge", emergeK: k, emergeBias: E.bias, t: E.t });
    z0.anim = "emerge";

    if (k >= 1) finishEmerge(ctx);
  }

  /* ── mise à jour ── */
  Object.defineProperty(z0, "boltCount", { get: () => bolts.length });
  z0.fireBolt = (ctx) => fireBolt(ctx);
  z0.bolts = bolts;

  z0.pose = function (dt = 0.016, animName = "walk", opts = {}) {
    animator.update(dt, {
      anim: animName,
      speed01: opts.speed01 ?? 0.55,
      phase: this.phase,
      hitK: 0,
      t: opts.t ?? 0,
    });
  };

  z0.update = function (dt, ctx) {
    const { player, colliders, enemies, audio } = ctx;
    updateBolts(dt, ctx);
    if (censer) censer.material.emissiveIntensity = Math.max(1.5, censer.material.emissiveIntensity - dt * 4);

    if (this.dead) {
      this.deathT += dt;
      animator.update(dt, { anim: "death", deathT: this.deathT });
      const g = ground(this.pos.x, this.pos.z);
      this.pos.y = this.deathT < 2.6 ? g : g - (this.deathT - 2.6) * 0.55;
      shadow.material.opacity = 0.42 * clamp(1 - (this.deathT - 1.6) / 2.2, 0, 1);
      this.anim = "death";
      if (this.deathT > 5.4) {
        this.dispose();
        this.removed = true;
      }
      return;
    }
    if (!this.alive) return;

    // scènes instantanées : game.js force rising = false juste après la création
    if (this.rising) { updateEmerge(dt, ctx); return; }
    if (this.emerge.active) finishEmerge(ctx, true);

    const px = player.pos.x, pz = player.pos.z;
    const playerInside = Math.abs(px) < 5.3 && pz > -17.2 && pz < 12;
    const zInside = Math.abs(this.pos.x) < 5.3 && this.pos.z > -17.2 && this.pos.z < 12;
    let tx = px, tz = pz;
    if (playerInside && !zInside) {
      if (this.pos.z < 13.5 && Math.abs(this.pos.x) < 8.5) {
        tx = Math.sign(this.pos.x || 1) * 9.6;
        tz = 14.6;
      } else if (Math.abs(this.pos.x) < 2.4 && this.pos.z < 15.4) {
        tx = 0; tz = 10.6;
      } else {
        tx = 0; tz = 14.2;
      }
    } else if (!playerInside && zInside) {
      tx = 0; tz = 13.8;
    }

    const dx = tx - this.pos.x;
    const dz = tz - this.pos.z;
    const dist = Math.hypot(dx, dz) || 0.0001;
    const toPlayer = Math.hypot(px - this.pos.x, pz - this.pos.z);

    this.atkCd = Math.max(0, this.atkCd - dt);
    this.stagger = Math.max(0, this.stagger - dt);
    this.flash = Math.max(0, this.flash - dt);

    /* ── attaque télégraphiée ── */
    if (this.atk > 0) {
      const total = ATTACK_TIME[this.type] || 0.72;
      this.atk = Math.max(0, this.atk - dt);
      const u = clamp(1 - this.atk / total, 0, 1);
      animator.update(dt, {
        anim: "attack", attackU: u, hitK: 0, speed01: 0, phase: this.phase, t: ctx.time || 0,
      });
      this.anim = "attack";
      this.state = "walk";
      // le brûle-parfum s'embrase pendant l'armement : le tell est visible
      if (this.cfg.ranged && censer) {
        censer.material.emissiveIntensity = 1.8 + Math.min(1, u / STRIKE_AT) * 3.0;
      }
      if (!this.didHit && u >= STRIKE_AT) {
        this.didHit = true;
        if (this.cfg.ranged) {
          fireBolt(ctx);
        } else if (this.victim && this.victim.alive) {
          const d = Math.hypot(this.victim.pos.x - this.pos.x, this.victim.pos.z - this.pos.z);
          if (d < 2.6) {
            this.victim.hurt(this.damage * 0.55);
            if (ctx.fx) ctx.fx.blood(this.victim.pos.clone().setY(1.2), new THREE.Vector3(0, 1, 0), false);
          }
          this.victim = null;
        } else if (toPlayer < this.cfg.radius * scale + 1.35 && Math.abs(player.pos.y - this.pos.y) < 2.2) {
          player.hurt(this.damage);
        }
      }
      return;
    }

    /* ── déplacement ── */
    if (this.leapT > 0) {
      this.leapT = Math.max(0, this.leapT - dt);
      const dash = this.speed * 2.6;
      this.pos.x += this.leapDir.x * dash * dt;
      this.pos.z += this.leapDir.z * dash * dt;
      group.rotation.x = -0.25;
      this.anim = "run";
      this.state = "walk";
      return;
    }
    group.rotation.x = 0;
    let mvx = 0, mvz = 0;
    if (this.cfg.ranged) {
      // le zélateur garde ses distances et tourne autour du joueur — mais s'il
      // n'a plus de ligne de vue (mur, pilier, angle de la nef), il AVANCE pour
      // la retrouver. Sans ça, deux zélateurs pouvaient tourner 80 s derrière
      // la chapelle et la vague ne finissait jamais (mesuré sur 3 nuits de bot).
      const keep = this.cfg.keep || 10;
      const sees = hasLineOfSight(this.pos.x, this.pos.z, px, pz, colliders || []);
      if (!sees) {
        mvx = (dx / dist) * this.speed;
        mvz = (dz / dist) * this.speed;
      } else if (toPlayer > keep + 2.5) {
        mvx = (dx / dist) * this.speed;
        mvz = (dz / dist) * this.speed;
      } else if (toPlayer < keep - 3) {
        mvx = -(dx / dist) * this.speed * 0.9;
        mvz = -(dz / dist) * this.speed * 0.9;
      } else {
        if (!this.strafe) this.strafe = rng() < 0.5 ? -1 : 1;
        mvx = (-dz / dist) * this.speed * 0.5 * this.strafe;
        mvz = (dx / dist) * this.speed * 0.5 * this.strafe;
      }
    } else if (toPlayer > (this.type === "brute" ? 1.6 : 1.15)) {
      mvx = (dx / dist) * this.speed;
      mvz = (dz / dist) * this.speed;
    }
    /* ── anti-enlisement ──
       S'il veut avancer mais parcourt moins de 15 cm en 0,8 s (mur, angle,
       abside), il tente un pas de côté d'une demi-seconde avant de reprendre :
       c'est ce qui le sort des coins où la poussée frontale l'écrasait. */
    const wantsMove = mvx !== 0 || mvz !== 0;
    if (this.strafeT > 0) this.strafeT = Math.max(0, this.strafeT - dt);
    // arrivé au contact, c'est l'attaque qui parle : on abandonne le pas de côté
    if (toPlayer <= STUCK_SAFE_DIST) this.strafeT = 0;
    if (wantsMove && this.strafeT <= 0) {
      const adv = Math.hypot(this.pos.x - this.stuckRefX, this.pos.z - this.stuckRefZ);
      if (adv >= STUCK_MIN_STEP) {
        // il avance vraiment : on réarme la mesure
        this.stuckRefX = this.pos.x;
        this.stuckRefZ = this.pos.z;
        this.stuckT = 0;
      } else {
        this.stuckT += dt;
        if (this.stuckT >= STUCK_WINDOW) {
          this.stuckT = 0;
          this.stuckRefX = this.pos.x;
          this.stuckRefZ = this.pos.z;
          // contre le joueur, c'est l'attaque qui prend le relais : pas de strafe
          if (toPlayer > STUCK_SAFE_DIST) {
            this.strafeDir = pickStrafeDir(this.pos, this.radius, colliders || [], dx / dist, dz / dist, this.strafeDir);
            this.strafeT = STRAFE_TIME;
            this.stuckCount++;
          }
        }
      }
    }
    // le pas de côté remplace la poussée frontale : il longe la pierre
    if (this.strafeT > 0 && wantsMove) {
      const s = this.speed * 0.9;
      mvx = (-dz / dist) * s * this.strafeDir;
      mvz = (dx / dist) * s * this.strafeDir;
    }

    for (const o of enemies) {
      if (o === this || !o.alive || o.rising || o.state === "emerge") continue;
      const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
      const od = Math.hypot(ox, oz);
      const min = this.radius + o.radius;
      if (od < min && od > 0.001) {
        const push = (min - od) / min;
        mvx += (ox / od) * this.speed * push * 1.6;
        mvz += (oz / od) * this.speed * push * 1.6;
      }
    }
    const slow = this.stagger > 0 ? 0.25 : 1;
    this.pos.x += mvx * dt * slow;
    this.pos.z += mvz * dt * slow;

    // 2 passes + secours : aucun mort ne termine la frame dans la pierre
    this.pos.x = clamp(this.pos.x, -52, 52);
    this.pos.z = clamp(this.pos.z, -48, 50);
    resolveColliders(this.pos, this.radius, colliders || []);
    this.pos.y = ground(this.pos.x, this.pos.z);

    if (toPlayer < 32) {
      const targetYaw = Math.atan2(px - this.pos.x, pz - this.pos.z);
      let d = targetYaw - group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      group.rotation.y += d * Math.min(1, dt * (this.type === "runner" ? 9 : 5));
    }

    /* ── démarche ── */
    const sp = Math.hypot(mvx, mvz) / Math.max(0.001, this.speed);
    const gait = this.type === "runner" ? 12.0 : this.type === "brute" ? 4.6 : 7.2;
    this.phase += dt * gait * (0.45 + sp * 0.75);
    const speed01 = clamp(sp, 0, 1);

    let anim = "walk";
    if (speed01 < 0.05) anim = "idle";
    else if (this.type === "runner") anim = "run";
    if (this.stagger > 0.12) anim = "hit";

    animator.update(dt, {
      anim,
      speed01,
      phase: this.phase,
      hitK: clamp(this.stagger / 0.3, 0, 1),
      t: ctx.time || 0,
    });
    this.anim = anim;
    this.state = "walk";

    /* ── grognements ── */
    this.lastGrowl -= dt;
    if (this.lastGrowl <= 0 && toPlayer < 34) {
      this.lastGrowl = randRange(rng, 3.5, 9.5);
      const rel = Math.atan2(this.pos.x - px, this.pos.z - pz);
      let ang = rel - (ctx.camYaw || 0);
      while (ang > Math.PI) ang -= Math.PI * 2;
      while (ang < -Math.PI) ang += Math.PI * 2;
      if (audio && audio.growl) audio.growl(Math.sin(ang) * -1, toPlayer, this.type === "brute");
    }

    /* ── déclenchement de l'attaque ── */
    if (this.cfg.ranged && this.atkCd <= 0) {
      const inRange = toPlayer < (this.cfg.range || 17);
      const los = inRange && hasLineOfSight(this.pos.x, this.pos.z, px, pz, colliders || []);
      if (los && toPlayer > 2.8) {
        this.atk = ATTACK_TIME.zealot;
        this.atkCd = randRange(rng, 2.0, 3.2);
        this.didHit = false;
        if (censer) censer.material.emissiveIntensity = 3.0;
        if (audio && audio.growl) audio.growl(0, toPlayer, false);
      } else if (toPlayer <= 2.8) {
        this.atk = ATTACK_TIME.zealot;
        this.atkCd = 2.2;
        this.didHit = false;
      }
    } else if (this.cfg.leap && this.atkCd <= 0 && this.leapT <= 0 && toPlayer > 3.2 && toPlayer < 9.5) {
      // le loup-garou bondit : ruée courte et rapide, lisible (il se ramasse)
      this.leapT = 0.38;
      this.leapDir = { x: dx / dist, z: dz / dist };
      this.atkCd = 2.3;
      this.didHit = false;
      if (audio && audio.growl) audio.growl(0.4, toPlayer, true);
    } else if (!this.cfg.ranged && this.atkCd <= 0 && ctx.citizens && ctx.citizens.length) {
      let vic = null, vd = 2.3;
      for (const c of ctx.citizens) {
        if (!c.alive) continue;
        const d = Math.hypot(c.pos.x - this.pos.x, c.pos.z - this.pos.z);
        if (d < vd) { vd = d; vic = c; }
      }
      if (vic) {
        this.victim = vic;
        this.atk = ATTACK_TIME[this.type] || 0.72;
        this.atkCd = this.type === "brute" ? 2.4 : 1.7;
        this.didHit = false;
        if (audio && audio.growl) audio.growl(0, vd, this.type === "brute");
      } else if (toPlayer < (this.type === "brute" ? 2.7 : this.cfg.leap ? 2.4 : 1.9)) {
        this.atk = ATTACK_TIME[this.type] || 0.72;
        this.atkCd = this.type === "brute" ? 2.4 : this.type === "runner" ? 1.9 : this.type === "werewolf" ? 1.6 : 1.5;
        this.didHit = false;
      }
    } else if (!this.cfg.ranged && toPlayer < (this.type === "brute" ? 2.7 : this.cfg.leap ? 2.4 : 1.9) && this.atkCd <= 0) {
      this.atk = ATTACK_TIME[this.type] || 0.72;
      this.atkCd = this.type === "brute" ? 2.4 : this.type === "runner" ? 1.9 : this.type === "werewolf" ? 1.6 : 1.5;
      this.didHit = false;
      if (audio && audio.growl) audio.growl(0, toPlayer, this.type === "brute");
    }
  };

  return z0;
}
