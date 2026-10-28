// zombie_rig.js — charpente articulée des morts.
//
// Trois silhouettes franchement distinctes :
//   walker  décharné, voûté, manteau en lambeaux, côtes apparentes ;
//   runner  sec et long, buste jeté en avant, côtes à nu, mâchoire pendante ;
//   brute   massif, épaules énormes, petite tête enfoncée, chaînes et fer.
//
// Chaque membre est un groupe THREE indépendant (bassin → torse → poitrine →
// tête/mâchoire, épaules → coudes → poignets, hanches → genoux → chevilles) :
// rien n'est solidaire, tout se plie. Les pièces d'un même pivot sont fusionnées
// par matériau, ce qui garde le nombre d'appels de dessin sous contrôle.
//
// Point d'extension GLB : `setZombieModelFactory(fn)`. La fabrique reçoit
// { type, cfg, rng, mats } et peut renvoyer un modèle riggé
//   { root, joints, rest, height, width }
// Si elle renvoie null (ou lève), on retombe sur le modèle procédural : rien ne
// bloque, aucun chargement n'est déclenché ici.

import * as THREE from "three";
import { T, rep } from "../world/textures.js";
import { merge, box } from "../world/geo.js";
import { randRange } from "../core/util.js";
import { rimLight } from "../fx/rim.js";

/* ─────────────────────────── proportions ─────────────────────────── */

export const BODY = {
  walker: {
    hipY: 0.92, torsoH: 0.60, torsoR: 0.185, shoulderW: 0.23, headR: 0.125,
    armLen: 0.66, legLen: 0.88, hipW: 0.115, lean: 0.30, footLen: 0.27, neck: 0.07,
  },
  runner: {
    hipY: 1.02, torsoH: 0.56, torsoR: 0.145, shoulderW: 0.195, headR: 0.105,
    armLen: 0.76, legLen: 0.98, hipW: 0.10, lean: 0.44, footLen: 0.29, neck: 0.11,
  },
  brute: {
    hipY: 0.98, torsoH: 0.64, torsoR: 0.42, shoulderW: 0.50, headR: 0.165,
    armLen: 0.94, legLen: 1.00, hipW: 0.27, lean: 0.20, footLen: 0.40, neck: 0.02,
  },
};

const SKIN_TONES = [0xcbcdb6, 0xc0c4a9, 0xd4d4bc, 0xb2b89e];
const CLOTH_TONES = [0x4d4c43, 0x584e42, 0x424a44, 0x63544a];
const RUST_TONES = [0x6b4c3e, 0x5e463c];

/* ─────────────────────────── matériaux ─────────────────────────── */

let sharedMats = null;

export function zombieMaterials() {
  if (sharedMats) return sharedMats;
  const flesh = rep(T.flesh(), 1, 1);
  const clothTex = rep(T.cloth(), 1.4, 1.4);
  const rustTex = rep(T.clothRust(), 1.2, 1.2);
  sharedMats = {
    skin: SKIN_TONES.map((c) => new THREE.MeshStandardMaterial({
      map: flesh, color: c, roughness: 0.88, metalness: 0, flatShading: true,
    })),
    bone: new THREE.MeshStandardMaterial({
      color: 0xe2dcc0, roughness: 0.6, metalness: 0, flatShading: true,
    }),
    cloth: CLOTH_TONES.map((c) => new THREE.MeshStandardMaterial({
      map: clothTex, color: c, roughness: 0.95, metalness: 0, flatShading: true,
      side: THREE.DoubleSide,
    })),
    rust: RUST_TONES.map((c) => new THREE.MeshStandardMaterial({
      map: rustTex, color: c, roughness: 0.96, metalness: 0, flatShading: true,
      side: THREE.DoubleSide,
    })),
    leather: new THREE.MeshStandardMaterial({ color: 0x2d251d, roughness: 0.9, flatShading: true }),
    iron: new THREE.MeshStandardMaterial({ color: 0x4b4d46, roughness: 0.55, metalness: 0.7, flatShading: true }),
    rope: new THREE.MeshStandardMaterial({ color: 0x7d6a4c, roughness: 1 }),
    tooth: new THREE.MeshStandardMaterial({ color: 0xd9d1ae, roughness: 0.45 }),
    dark: new THREE.MeshBasicMaterial({ color: 0x08060a }),
    eyeWarm: new THREE.MeshBasicMaterial({ color: 0xffb45e }),
    eyeHot: new THREE.MeshBasicMaterial({ color: 0xff8a48 }),
    eyeEmber: new THREE.MeshBasicMaterial({ color: 0xff5a30 }),
  };
  // liseré froid sur les mannequins procéduraux (repli) : même lecture de
  // silhouette que les GLB quand les assets manquent
  for (const arr of [sharedMats.skin, sharedMats.cloth, sharedMats.rust]) {
    for (const m of arr) rimLight(m, { color: 0x8aa4c0, power: 2.6, strength: 0.42 });
  }
  rimLight(sharedMats.leather, { color: 0x8aa4c0, power: 3.2, strength: 0.24 });
  return sharedMats;
}

/* ─────────────────────────── outillage ─────────────────────────── */

/** Accumule les pièces d'un pivot puis les fusionne par matériau (1 appel/matériau). */
function parts() {
  const list = [];
  return {
    add(g, m) { list.push([g, m]); return g; },
    flush(parent, { shadow = true, part = "body" } = {}) {
      const byMat = new Map();
      for (const [g, m] of list) {
        if (!byMat.has(m)) byMat.set(m, []);
        byMat.get(m).push(g);
      }
      for (const [mat, geos] of byMat) {
        const geo = geos.length === 1 ? geos[0] : merge(geos);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = shadow;
        mesh.receiveShadow = false;
        mesh.userData.part = part;
        parent.add(mesh);
      }
      list.length = 0;
    },
  };
}

/** Active l'ombre portée sur le maillage d'un matériau donné (1 par pivot). */
function castOn(parent, material) {
  parent.traverse((o) => { if (o.isMesh && o.material === material) o.castShadow = true; });
}

function joint(parent, name, x, y, z, joints, rest) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  parent.add(g);
  joints[name] = g;
  rest[name] = [0, 0, 0];
  return g;
}

/** Arc osseux horizontal (côtes, ceinture) centré sur l'avant (+Z). */
function torusArc(r, tube, arc, seg = 10) {
  const g = new THREE.TorusGeometry(r, tube, 3, seg, arc);
  g.rotateX(Math.PI / 2);
  g.rotateY(Math.PI);
  return g;
}

function cylAt(rt, rb, h, seg, x, y, z, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  g.translate(x, y, z);
  return g;
}

/* ─────────────────────────── corps ─────────────────────────── */

export function buildProceduralRig({ type, cfg, rng, mats }) {
  const B = BODY[type] || BODY.walker;
  const isBrute = type === "brute";
  const isRunner = type === "runner";

  const skin = isRunner ? mats.skin[3] : mats.skin[Math.floor(rng() * mats.skin.length)];
  const cloth = rng() < 0.22 ? mats.rust[Math.floor(rng() * mats.rust.length)]
    : mats.cloth[Math.floor(rng() * mats.cloth.length)];
  const cloth2 = mats.cloth[Math.floor(rng() * mats.cloth.length)];

  const hipY = B.hipY * (0.97 + rng() * 0.06);
  const torsoH = B.torsoH * (0.97 + rng() * 0.06);
  const torsoR = B.torsoR * (0.96 + rng() * 0.08);
  const shoulderW = B.shoulderW;
  const headR = B.headR;
  const lean = B.lean + (isBrute ? randRange(rng, -0.03, 0.03) : randRange(rng, 0, 0.10));
  const legLen = B.legLen * (0.98 + rng() * 0.05);
  const armLen = B.armLen * (0.97 + rng() * 0.06);
  // asymétrie de squelette : une épaule plus haute, une jambe plus courte
  const shoulderDrop = randRange(rng, -0.02, 0.05);
  const legBias = randRange(rng, -0.03, 0.03);

  const joints = {};
  const rest = {};
  const root = new THREE.Group();
  root.name = "root";

  /* ── bassin ── */
  const pelvis = joint(root, "pelvis", 0, hipY, 0, joints, rest);
  const pelvisW = B.hipW * 2 + (isBrute ? 0.30 : 0.12);
  const P = parts();
  P.add(box(pelvisW, 0.19, isBrute ? 0.34 : 0.19, 0, -0.02, 0), isBrute ? mats.leather : cloth);
  const belt = new THREE.TorusGeometry(pelvisW * 0.55, 0.024, 4, 10);
  belt.rotateX(Math.PI / 2);
  belt.translate(0, 0.045, 0);
  P.add(belt, mats.rope);
  for (let i = 0; i < (isBrute ? 7 : 6); i++) {
    const a = randRange(rng, -1.2, 1.2);
    const len = randRange(rng, 0.16, isBrute ? 0.34 : 0.44);
    P.add(box(randRange(rng, 0.035, 0.07), len, 0.014,
      Math.sin(a) * pelvisW * 0.5, -0.11 - len * 0.5, Math.cos(a) * 0.10,
      a * 0.35, randRange(rng, -0.16, 0.16)), rng() < 0.5 ? cloth2 : cloth);
  }
  P.flush(pelvis, { shadow: false });

  /* ── torse ── */
  const torso = joint(pelvis, "torso", 0, 0, 0, joints, rest);
  torso.rotation.x = lean;
  rest.torso[0] = lean;
  torso.rotation.z = randRange(rng, -0.05, 0.05);
  rest.torso[2] = torso.rotation.z;

  const T_ = parts();
  T_.add(cylAt(torsoR * 0.93, torsoR * 0.86, torsoH * 0.52, 8, 0, torsoH * 0.25, 0),
    isRunner ? skin : cloth);
  T_.add(box(torsoR * 1.1, 0.035, torsoR * 0.9, 0, torsoH * 0.04, torsoR * 0.5),
    isBrute ? mats.leather : cloth2);
  // jupe / manteau déchiré
  const coatH = isBrute ? 0.40 : isRunner ? 0.22 : 0.46;
  T_.add(cylAt(torsoR * 1.0, torsoR * 1.75, coatH, 9, 0, -coatH * 0.42, 0, true), cloth);
  for (let i = 0; i < (isRunner ? 4 : 8); i++) {
    const a = (i / (isRunner ? 4 : 8)) * Math.PI * 2 + randRange(rng, -0.2, 0.2);
    const len = randRange(rng, 0.08, isBrute ? 0.24 : 0.34);
    T_.add(box(0.05, len, 0.012,
      Math.sin(a) * torsoR * 1.5, -coatH * 0.62 - len * 0.45, Math.cos(a) * torsoR * 1.5,
      a, 0), cloth2);
  }
  // chaînes du colosse
  if (isBrute) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const link = new THREE.TorusGeometry(0.055, 0.016, 3, 6);
      link.rotateY(a);
      link.translate(Math.cos(a) * torsoR * 0.95, torsoH * 0.62 + Math.sin(i * 1.7) * 0.05, Math.sin(a) * torsoR * 0.8);
      T_.add(link, mats.iron);
    }
  }
  T_.flush(torso, { shadow: false });
  castOn(torso, cloth);

  /* ── poitrine ── */
  const chest = joint(torso, "chest", 0, torsoH * 0.48, 0, joints, rest);
  const chestH = torsoH * 0.52;
  const C = parts();
  C.add(cylAt(torsoR * 1.18, torsoR * 0.96, chestH, 8, 0, chestH * 0.18, 0), isRunner ? skin : cloth);
  const yoke = new THREE.SphereGeometry(torsoR * 1.02, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
  yoke.scale(isBrute ? 1.55 : 1.25, 0.42, 0.92);
  yoke.translate(0, chestH * 0.55, 0);
  C.add(yoke, cloth);

  // côtes apparentes : arcs osseux posés SUR le drap, donc à un rayon
  // légèrement supérieur à celui du cylindre de poitrine (sinon invisibles)
  const ribCount = isRunner ? 5 : isBrute ? 4 : 3;
  for (let i = 0; i < ribCount; i++) {
    const yf = 0.10 + i * 0.145;
    const ry = chestH * yf;
    const rSurf = torsoR * (0.96 + 0.22 * (yf + 0.32) / 1.0);
    const rr = rSurf * 1.045 + (isBrute ? 0.012 : 0.006);
    const rib = torusArc(rr, isBrute ? 0.017 : 0.013, Math.PI * 0.94, 8);
    rib.translate(0, ry, 0);
    C.add(rib, mats.bone);
    const v = new THREE.SphereGeometry(isBrute ? 0.045 : 0.026, 4, 3);
    v.translate(0, ry, -torsoR * 0.95);
    C.add(v, mats.bone);
  }
  // clavicules
  for (const sx of [-1, 1]) {
    C.add(box(shoulderW * 0.9, 0.035, 0.05, sx * shoulderW * 0.45, chestH * 0.66, torsoR * 0.52,
      0, 0, sx * 0.22), mats.bone);
  }
  // cou
  C.add(cylAt(0.052, 0.075, B.neck + 0.10, 6, 0, chestH * 0.86, 0), skin);
  C.flush(chest, { shadow: false });

  if (isBrute) {
    const wound = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.26), new THREE.MeshBasicMaterial({
      map: T.blood(), transparent: true, opacity: 0.55, depthWrite: false, color: 0x6a1712,
    }));
    wound.position.set(torsoR * 0.15, chestH * 0.30, torsoR * 1.02);
    wound.rotation.x = -0.12;
    wound.castShadow = false;
    chest.add(wound);
  }

  /* ── tête ── */
  const neckY = chestH * 0.86;
  const head = joint(chest, "head", 0, neckY + 0.09, isBrute ? 0.03 : 0.05, joints, rest);
  head.rotation.z = randRange(rng, -0.13, 0.13);
  rest.head[2] = head.rotation.z;
  head.rotation.x = randRange(rng, -0.04, 0.14);
  rest.head[0] = head.rotation.x;

  const H = parts();
  const skullG = new THREE.SphereGeometry(headR, 8, 6);
  skullG.scale(0.92, 1.12, 1.0);
  H.add(skullG, skin);
  H.add(box(headR * 1.5, 0.045, 0.07, 0, headR * 0.35, headR * 0.78), skin); // arcade
  H.add(box(headR * 0.24, headR * 0.34, headR * 0.22, 0, -headR * 0.10, headR * 0.90), skin); // nez
  H.add(box(headR * 1.05, headR * 0.14, 0.02, 0, -headR * 0.47, headR * 0.86), mats.dark); // lèvre
  for (const sx of [-1, 1]) {
    const socket = new THREE.SphereGeometry(headR * 0.30, 6, 4);
    socket.scale(1, 1, 0.5);
    socket.translate(sx * headR * 0.38, headR * 0.12, headR * 0.80);
    H.add(socket, mats.dark);
    H.add(box(headR * 0.42, 0.032, 0.05, sx * headR * 0.36, headR * 0.46, headR * 0.78), skin); // pommette
    const eye = new THREE.SphereGeometry(headR * (isBrute ? 0.17 : 0.15), 6, 5);
    eye.translate(sx * headR * 0.38, headR * 0.10, headR * 0.92);
    H.add(eye, isBrute ? mats.eyeEmber : isRunner ? mats.eyeHot : mats.eyeWarm);
  }
  for (let i = 0; i < 4; i++) {
    H.add(box(headR * 0.10, headR * 0.16, headR * 0.08,
      (i - 1.5) * headR * 0.28, -headR * 0.52, headR * 0.84), mats.tooth);
  }
  if (!isBrute && !isRunner && rng() < 0.38) {
    const hood = new THREE.SphereGeometry(headR * 1.16, 9, 6, 0, Math.PI * 2, 0, Math.PI * 0.62);
    hood.scale(1.04, 1.10, 1.02);
    hood.translate(0, headR * 0.10, -headR * 0.08);
    H.add(hood, cloth2);
  }
  if (isBrute) {
    for (let i = 0; i < 3; i++) {
      const spike = new THREE.ConeGeometry(0.018, 0.09, 5);
      spike.rotateX(-0.20);
      spike.translate((i - 1) * 0.07, headR * 0.95, -headR * 0.1 + i * 0.05);
      H.add(spike, mats.iron);
    }
  }
  H.flush(head, { part: "head", shadow: false });
  castOn(head, skin);

  /* ── mâchoire ── */
  const jaw = joint(head, "jaw", 0, -headR * 0.44, headR * 0.10, joints, rest);
  const J = parts();
  J.add(box(headR * 1.10, headR * 0.34, headR * 0.72, 0, -headR * 0.12, headR * 0.42), skin);
  J.add(box(headR * 0.90, headR * 0.10, headR * 0.30, 0, -headR * 0.02, headR * 0.52), mats.dark);
  for (let i = 0; i < 4; i++) {
    J.add(box(headR * 0.11, headR * 0.20, headR * 0.09,
      (i - 1.5) * headR * 0.28, -headR * 0.02, headR * 0.62, 0, 0, randRange(rng, -0.12, 0.12)), mats.tooth);
  }
  J.flush(jaw, { part: "head", shadow: false });
  if (isRunner) { jaw.rotation.x = 0.42; rest.jaw[0] = 0.42; }
  else if (isBrute) { jaw.rotation.x = 0.16; rest.jaw[0] = 0.16; }

  /* ── bras ── */
  const arms = {};
  for (const side of [1, -1]) {
    const key = side > 0 ? "L" : "R";
    const sh = joint(chest, `sh${key}`, side * shoulderW, chestH * 0.62 - (side > 0 ? shoulderDrop : 0), 0, joints, rest);
    sh.rotation.z = side * (isBrute ? 0.16 : 0.10);
    rest[`sh${key}`][2] = sh.rotation.z;

    const upperH = armLen * 0.50;
    const upperR = isBrute ? 0.135 : isRunner ? 0.055 : 0.070;
    const upperMat = isBrute || side < 0 ? skin : (rng() < 0.5 ? skin : cloth);
    const A = parts();
    // épaule
    const cap = new THREE.SphereGeometry(isBrute ? 0.175 : 0.085, 7, 6);
    cap.scale(1.15, 0.9, 1.0);
    A.add(cap, isBrute ? mats.iron : cloth2);
    // bras
    A.add(cylAt(upperR * 1.05, upperR * 0.86, upperH, 6, 0, -upperH / 2, 0), upperMat);
    // manche en lambeaux
    if (!isBrute && rng() < 0.7) {
      A.add(cylAt(upperR * 1.35, upperR * 1.5, upperH * 0.42, 7, 0, -upperH * 0.22, 0, true), cloth);
    }
    A.flush(sh, { shadow: false });
    castOn(sh, upperMat);

    const el = joint(sh, `el${key}`, 0, -upperH, 0, joints, rest);
    const foreH = armLen * 0.44;
    const foreR = isBrute ? 0.105 : isRunner ? 0.043 : 0.055;
    const E = parts();
    E.add(new THREE.SphereGeometry(isBrute ? 0.10 : 0.058, 6, 5), skin);
    E.add(cylAt(foreR * 0.95, foreR * 0.8, foreH, 6, 0, -foreH / 2, 0), skin);
    if (isBrute) {
      E.add(cylAt(0.13, 0.115, 0.14, 7, 0, -foreH * 0.15, 0), mats.iron);
    }
    E.flush(el, { shadow: false });

    const wr = joint(el, `wr${key}`, 0, -foreH, 0, joints, rest);
    const W = parts();
    const palmY = isBrute ? -0.09 : -0.06;
    W.add(box(isBrute ? 0.20 : 0.10, isBrute ? 0.17 : 0.115, isBrute ? 0.11 : 0.07, 0, palmY, 0.005), skin);
    const fingerN = isBrute ? 4 : 3;
    const fingerLen = isBrute ? 0.15 : 0.10;
    for (let i = 0; i < fingerN; i++) {
      const fx = (i - (fingerN - 1) / 2) * (isBrute ? 0.052 : 0.031);
      W.add(box(isBrute ? 0.036 : 0.020, fingerLen, 0.022, fx, palmY - fingerLen * 0.62, 0.03), skin);
      W.add(box(isBrute ? 0.030 : 0.016, 0.028, 0.016, fx, palmY - fingerLen * 1.10, 0.041), skin);
    }
    W.add(box(isBrute ? 0.04 : 0.024, isBrute ? 0.11 : 0.07, 0.024,
      side * (isBrute ? 0.10 : 0.06), palmY - 0.02, 0.015), skin);
    W.flush(wr, { shadow: false });

    arms[key] = sh;
  }

  // bras manquant (marcheur) : silhouette asymétrique
  const missingArm = !isBrute && !isRunner && rng() < 0.10;
  if (missingArm) {
    arms.R.visible = false;
    const stump = new THREE.Mesh(new THREE.SphereGeometry(0.055, 6, 5), mats.dark);
    stump.position.set(-shoulderW, chestH * 0.62, 0);
    stump.scale.y = 0.6;
    stump.castShadow = false;
    chest.add(stump);
  }

  /* ── jambes ── */
  for (const side of [1, -1]) {
    const key = side > 0 ? "L" : "R";
    const thisLeg = legLen * (1 + (side > 0 ? legBias : -legBias));
    const hip = joint(pelvis, `hip${key}`, side * B.hipW, -0.02, 0, joints, rest);
    const thighH = thisLeg * 0.52;
    const thighR = isBrute ? 0.175 : isRunner ? 0.072 : 0.095;
    const L = parts();
    const thighMat = isBrute ? mats.leather : cloth;
    L.add(cylAt(thighR * 1.06, thighR * 0.86, thighH, 7, 0, -thighH / 2, 0), thighMat);
    L.flush(hip, { shadow: false });
    castOn(hip, thighMat);

    const knee = joint(hip, `knee${key}`, 0, -thighH, 0, joints, rest);
    const shinH = thisLeg * 0.44;
    const shinR = isBrute ? 0.125 : isRunner ? 0.052 : 0.068;
    const K = parts();
    K.add(new THREE.SphereGeometry(isBrute ? 0.13 : 0.075, 6, 5), isBrute ? mats.leather : cloth);
    K.add(cylAt(shinR * 0.95, shinR * 0.72, shinH, 6, 0, -shinH / 2, 0), isBrute ? mats.leather : cloth);
    K.flush(knee, { shadow: false });

    const ankle = joint(knee, `ank${key}`, 0, -shinH, 0, joints, rest);
    const footL = B.footLen * (isBrute ? 1 : 0.96 + rng() * 0.1);
    const F = parts();
    F.add(box(isBrute ? 0.28 : 0.145, isBrute ? 0.13 : 0.085, footL,
      0, -0.035, footL * 0.24), mats.leather);
    F.add(box(isBrute ? 0.26 : 0.13, 0.06, 0.09, 0, -0.065, footL * 0.58), mats.leather);
    if (isRunner) {
      for (let i = 0; i < 3; i++) {
        F.add(box(0.026, 0.024, 0.05, (i - 1) * 0.035, -0.075, footL * 0.66), mats.bone);
      }
    }
    F.flush(ankle, { shadow: false });
  }

  const height = hipY + torsoH + headR * 1.25 + 0.10;
  const width = shoulderW * 2 + (isBrute ? 0.40 : 0.22);

  root.updateMatrixWorld(true);

  return {
    root, joints, rest, height, width,
    arms: missingArm ? 1 : 2,
    type,
    materialsUsed: [skin, cloth, cloth2],
  };
}

/* ─────────────────────────── point d'extension GLB ─────────────────────────── */

let modelFactory = null;

/**
 * Branche une fabrique de modèles riggés (GLB chargé par un autre module).
 * `fn({ type, cfg, rng, mats })` → modèle ou null. Une erreur est rattrapée :
 * le jeu continue avec le modèle procédural.
 */
export function setZombieModelFactory(fn) {
  modelFactory = typeof fn === "function" ? fn : null;
  return modelFactory;
}

export function getZombieModelFactory() { return modelFactory; }

export function buildZombieModel(opts) {
  if (modelFactory) {
    try {
      const m = modelFactory(opts);
      if (m && m.root && m.joints) return m;
    } catch (e) {
      // jamais bloquant : on signale et on retombe sur le procédural
      if (typeof console !== "undefined") console.warn("zombie_rig: fabrique GLB en échec, repli procédural", e);
    }
  }
  return buildProceduralRig(opts);
}

/** Libère les géométries propres à une instance (les matériaux sont partagés). */
export function disposeRig(root) {
  root.traverse((o) => {
    if (o.isMesh && o.geometry && !o.userData.sharedGeo) o.geometry.dispose();
  });
}
