// boss.js — L'Officiant et ses deux acolytes : le prêtre mort qui garde la nef.
// Trois variantes (Officiant, Diacre, Abbé noir) et six attaques télégraphiées :
// frappe au sol, onde de choc, charge, colonne de lumière, volée de flammes, revers.

import * as THREE from "three";
import { T, rep } from "../world/textures.js";
import { merge, box, cyl } from "../world/geo.js";
import { makeRng, clamp, damp, lerp, randRange } from "../core/util.js";

export const BOSS = {
  hp: 1200,
  walk: 2.0,
  walk2: 2.75,
  radius: 0.9,
};

/**
 * Variantes jouées toutes les 5 vagues.
 * Les PV suivent : 1200 × difficulty × (1 + 0.6 × (variant - 1)).
 * `scale` agrandit le modèle (et sa portée au corps à corps), `dmgMul` suit
 * l'agrandissement pour que le contact d'un Abbé noir ne soit pas anecdotique.
 */
export const VARIANTS = [
  {
    name: "L'Officiant", hpMul: 1, scale: 1, dmgMul: 1,
    robe: 0x4a5a4c, robeDark: 0x2f3a34, bone: 0xb9b6a2, gold: 0xc9a45c,
    flesh: 0x8d8a76, fleshDark: 0x5b5747, wound: 0x3c1114,
    eye: 0xffa040, aura: 0xff4a20, sigil: 0xff5a30, censer: 0xff8a3a,
  },
  {
    name: "Le Diacre", hpMul: 1.6, scale: 1.12, dmgMul: 1.12,
    robe: 0x53231f, robeDark: 0x2a1414, bone: 0xa8977f, gold: 0xb08a48,
    flesh: 0x877a63, fleshDark: 0x514233, wound: 0x460f10,
    eye: 0xff7a30, aura: 0xff2c10, sigil: 0xff2a14, censer: 0xff6a20,
  },
  {
    name: "L'Abbé noir", hpMul: 2.2, scale: 1.25, dmgMul: 1.24,
    robe: 0x241a1e, robeDark: 0x120c10, bone: 0x93866f, gold: 0x8e7636,
    flesh: 0x6e6959, fleshDark: 0x3c352b, wound: 0x3a0a0c,
    eye: 0xff2a08, aura: 0xff1404, sigil: 0xff1004, censer: 0xff4a10,
  },
];

/** Liste publique des attaques, dans l'ordre du cycle. */
export const BOSS_ATTACKS = ["slam", "wave", "charge", "column", "volley", "sweep"];

const SILENT_AUDIO = {
  bossRoar() {}, growl() {}, quake() {}, bell() {}, hit() {},
};
const SILENT_FX = {
  impact() {}, puff() {}, blood() {}, glass() {}, death() {}, earth() {}, heal() {},
};

export function createBoss({ scene, x = 0, z = -6, difficulty = 1, variant = 1, name = null }) {
  const v = clamp(Math.round(variant), 1, 3);
  const V = VARIANTS[v - 1];
  const rng = makeRng(66601);
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  scene.add(group);

  const robeMat = new THREE.MeshStandardMaterial({
    map: rep(T.clothGrey(), 2.4, 3.2), color: V.robe, roughness: 0.94,
  });
  const robeDark = new THREE.MeshStandardMaterial({
    map: rep(T.clothGrey(), 2, 2), color: V.robeDark, roughness: 0.96, side: THREE.DoubleSide,
  });
  const boneMat = new THREE.MeshStandardMaterial({ map: T.flesh(), color: V.bone, roughness: 0.8 });
  const goldMat = new THREE.MeshStandardMaterial({
    color: V.gold, roughness: 0.32, metalness: 0.9, emissive: 0x4a3410, emissiveIntensity: 0.9,
  });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x23241f, roughness: 0.55, metalness: 0.7 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: V.eye });
  const socketMat = new THREE.MeshBasicMaterial({ color: 0x05040a });

  /* ══════════════ corps : un mort debout, pas un paquet de tissu ══════════════
     Silhouette de cadavre : jambes et bassin visibles, cage thoracique à l'air,
     épaules voûtées, bras trop longs, mains griffues, crâne aux orbites creuses.
     La chasuble n'est plus un cône : des lambeaux pendent et laissent voir la chair. */
  const fleshMat = new THREE.MeshStandardMaterial({ map: T.flesh(), color: V.flesh, roughness: 0.97 });
  const fleshDarkMat = new THREE.MeshStandardMaterial({ map: T.flesh(), color: V.fleshDark, roughness: 1 });
  const woundMat = new THREE.MeshStandardMaterial({
    color: V.wound, roughness: 0.88, emissive: 0x140204, emissiveIntensity: 0.45,
  });
  const clawMat = new THREE.MeshStandardMaterial({ color: 0x241f19, roughness: 0.45, metalness: 0.1 });
  const bonePaleMat = new THREE.MeshStandardMaterial({ map: T.flesh(), color: 0xd2cbb4, roughness: 0.7 });
  const corrupt = v - 1;

  /* ── jambes : fémur, tibia, chair en plaques, pieds osseux ── */
  function buildLeg(side) {
    const g = new THREE.Group();
    g.position.set(side * 0.21, 1.32, 0);
    const femur = new THREE.Mesh(cyl(0.072, 0.06, 0.54, 7, 0, -0.27, 0), boneMat);
    femur.castShadow = true;
    g.add(femur);
    // plaques de chair putréfiée accrochées à l'os
    const thighParts = [];
    for (let i = 0; i < 3; i++) {
      thighParts.push(cyl(0.115 - i * 0.014, 0.085, 0.15, 7,
        side * (i % 2 ? 0.028 : -0.018), -0.09 - i * 0.16, i % 2 ? -0.03 : 0.02,
        0.07 * i, 0, 0.08 * (i - 1)));
    }
    const thighFlesh = new THREE.Mesh(merge(thighParts), fleshDarkMat);
    thighFlesh.castShadow = true;
    g.add(thighFlesh);
    const knee = new THREE.Mesh(new THREE.SphereGeometry(0.095, 8, 6), boneMat);
    knee.position.set(0, -0.56, 0.012);
    g.add(knee);
    const tibia = new THREE.Mesh(cyl(0.045, 0.036, 0.6, 6, 0, -0.87, 0), boneMat);
    const fibula = new THREE.Mesh(cyl(0.026, 0.021, 0.56, 5, side * 0.052, -0.85, -0.012), boneMat);
    g.add(tibia, fibula);
    const calf = new THREE.Mesh(cyl(0.072, 0.04, 0.3, 6, 0, -0.78, -0.035), fleshMat);
    g.add(calf);
    // pied squelettique, orteils écartés
    const footParts = [box(0.16, 0.07, 0.26, 0, -1.255, 0.075)];
    for (let i = 0; i < 3; i++) {
      footParts.push(box(0.038, 0.04, 0.115, (i - 1) * 0.052, -1.262, 0.228, 0, 0, 0));
    }
    const foot = new THREE.Mesh(merge(footParts), boneMat);
    foot.castShadow = true;
    g.add(foot);
    // lame de chair sur le tibia (le cadavre se délite)
    const shinRag = new THREE.Mesh(box(0.09, 0.22, 0.03, side * 0.03, -0.76, 0.055, 0, 0.18, 0.1), fleshDarkMat);
    g.add(shinRag);
    return g;
  }
  const legL = buildLeg(1);
  const legR = buildLeg(-1);
  group.add(legL, legR);

  /* ── bassin : os des hanches, sacrum, pagne en lambeaux ── */
  const pelvis = new THREE.Group();
  pelvis.position.y = 1.35;
  const pelvicRing = new THREE.Mesh(new THREE.TorusGeometry(0.255, 0.052, 6, 16), boneMat);
  pelvicRing.rotation.x = Math.PI / 2;
  pelvicRing.scale.set(1.12, 0.76, 1);
  pelvis.add(pelvicRing);
  const hipParts = [
    box(0.18, 0.2, 0.06, 0.28, 0.02, 0.01, 0, 0, -0.22),
    box(0.18, 0.2, 0.06, -0.28, 0.02, 0.01, 0, 0, 0.22),
    box(0.13, 0.17, 0.09, 0, 0.02, -0.21, 0, 0, 0),
  ];
  const hips = new THREE.Mesh(merge(hipParts), boneMat);
  pelvis.add(hips);
  group.add(pelvis);

  /* ── chasuble en lambeaux : des bandes, pas une jupe pleine ── */
  const clothParts = [];
  const clothDarkParts = [];
  function rag(parts, a, topY, len, w, rTop, tiltX, tiltZ) {
    const gg = box(w, len, 0.028, 0, -len / 2, 0, 0, tiltX, tiltZ);
    const mtx = new THREE.Matrix4().makeRotationY(a);
    mtx.setPosition(Math.sin(a) * rTop, topY, Math.cos(a) * rTop);
    gg.applyMatrix4(mtx);
    parts.push(gg);
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.07;
    const len = 0.5 + (i % 5) * 0.17 + (i % 3) * 0.09;
    const w = 0.115 + (i % 4) * 0.022;
    const parts = (i % 3 === 0) ? clothDarkParts : clothParts;
    rag(parts, a, 1.54, len, w, 0.36 + (i % 2) * 0.03,
      0.05 * ((i % 3) - 1), 0.09 * ((i % 2) ? 1 : -1));
  }
  // pan avant de la chasuble, déchiré au milieu : le ventre reste visible
  rag(clothParts, -0.9, 2.9, 1.5, 0.19, 0.42, -0.03, -0.1);
  rag(clothParts, 0.9, 2.9, 1.58, 0.19, 0.42, -0.03, 0.1);
  // dos de la chape, plus long
  for (let i = 0; i < 7; i++) {
    const a = Math.PI - 0.75 + (i / 6) * 1.5;
    const len = 1.0 + (i % 3) * 0.22;
    rag(i % 2 ? clothDarkParts : clothParts, a, 2.92, len, 0.17, 0.47,
      0.04 * ((i % 3) - 1), 0.04);
  }
  const skirtCloth = new THREE.Mesh(merge(clothParts), robeMat);
  skirtCloth.castShadow = true;
  group.add(skirtCloth);
  const skirtDark = new THREE.Mesh(merge(clothDarkParts), robeDark);
  skirtDark.castShadow = true;
  group.add(skirtDark);

  // pan de chape déchiré dans le dos (animé par le vent)
  const capeGeo = new THREE.PlaneGeometry(1.15, 2.25, 7, 9);
  const capePos = capeGeo.attributes.position;
  for (let i = 0; i < capePos.count; i++) {
    const px = capePos.getX(i);
    const py = capePos.getY(i);
    capePos.setZ(i, Math.sin(px * 4 + py * 3) * 0.09 + Math.abs(px) * 0.1);
    if (py < -0.9) capePos.setY(i, py + Math.sin(px * 9 + py * 5) * 0.17);
  }
  capeGeo.computeVertexNormals();
  const cape = new THREE.Mesh(capeGeo, robeDark);
  cape.position.set(0, 1.82, -0.44);
  cape.rotation.y = Math.PI;
  cape.castShadow = true;
  group.add(cape);

  // étole liturgique qui pend devant, tachée
  const stoleMat = new THREE.MeshStandardMaterial({
    color: 0x6a1f1c, roughness: 0.92, emissive: 0x180504, emissiveIntensity: 0.4,
  });
  const stoleParts = [
    box(0.12, 1.55, 0.025, 0.3, 1.95, 0.3, 0, 0.02, 0.03),
    box(0.12, 1.72, 0.025, -0.3, 1.88, 0.3, 0, -0.02, -0.03),
  ];
  const stole = new THREE.Mesh(merge(stoleParts), stoleMat);
  group.add(stole);

  /* ── ceinture de chaînes (fusionnée) ── */
  const chainMat = new THREE.MeshStandardMaterial({ color: 0x3a3d38, roughness: 0.5, metalness: 0.8 });
  const chainParts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const link = new THREE.TorusGeometry(0.052, 0.015, 4, 8);
    link.rotateX(Math.PI / 2);
    link.rotateY(a);
    link.translate(Math.cos(a) * 0.37, 1.56 + (i % 2 ? -0.05 : 0.02), Math.sin(a) * 0.37);
    chainParts.push(link);
  }
  const belt = new THREE.Mesh(merge(chainParts), chainMat);
  group.add(belt);

  /* ── torse : ventre putréfié, plaie ouverte, intestins ── */
  const torso = new THREE.Group();
  torso.position.y = 2.28;
  group.add(torso);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9), fleshMat);
  belly.scale.set(1.02, 1.35, 0.8);
  belly.position.set(0, -0.38, 0.01);
  belly.castShadow = true;
  torso.add(belly);
  const wound = new THREE.Mesh(new THREE.SphereGeometry(0.15, 9, 7), woundMat);
  wound.scale.set(1.0, 1.3, 0.34);
  wound.position.set(0, -0.32, 0.215);
  torso.add(wound);
  const gutParts = [];
  const gutCount = 1 + corrupt;
  for (let i = 0; i < gutCount; i++) {
    const gut = new THREE.TorusGeometry(0.10 + i * 0.015, 0.026, 5, 10, Math.PI * 1.25);
    gut.rotateY(Math.PI / 2);
    gut.rotateZ(-0.6 + i * 0.35);
    gut.translate((i - (gutCount - 1) / 2) * 0.1, -0.4 - i * 0.03, 0.23);
    gutParts.push(gut);
  }
  const guts = new THREE.Mesh(merge(gutParts), woundMat);
  torso.add(guts);

  /* ── cage thoracique apparente ── */
  const chest = new THREE.Group();
  chest.position.y = 0.30;
  torso.add(chest);
  const ribParts = [];
  for (let i = 0; i < 7; i++) {
    const k = i / 6;
    const rib = new THREE.TorusGeometry(lerp(0.4, 0.285, k), 0.031, 5, 18);
    rib.rotateX(Math.PI / 2);
    rib.scale(1, 1, 0.74);
    rib.rotateZ(0.03 * (i % 2 ? 1 : -1));
    rib.translate(0, 0.245 - i * 0.074, -0.01);
    ribParts.push(rib);
  }
  // sternum, clavicules, colonne vertébrale
  ribParts.push(box(0.07, 0.42, 0.04, 0, 0.27, 0.305, 0, 0.02, 0));
  for (const sx of [-1, 1]) {
    ribParts.push(box(0.32, 0.035, 0.035, sx * 0.2, 0.5, 0.14, sx * -0.22, 0, sx * 0.1));
  }
  for (let i = 0; i < 9; i++) {
    const t = i / 8;
    ribParts.push(box(0.075, 0.052, 0.075, 0, 0.44 - t * 0.56, -0.29 + t * 0.02, 0, 0, 0));
  }
  for (let i = 0; i < 4; i++) {
    ribParts.push(box(0.062, 0.045, 0.062, 0, 0.62 + i * 0.075, -0.11 + i * 0.055, 0, 0, 0));
  }
  const ribcage = new THREE.Mesh(merge(ribParts), boneMat);
  ribcage.castShadow = true;
  chest.add(ribcage);
  // cavité noire : les côtes se détachent dessus
  const cavity = new THREE.Mesh(new THREE.SphereGeometry(0.29, 10, 8),
    new THREE.MeshBasicMaterial({ color: 0x060505 }));
  cavity.scale.set(0.98, 1.15, 0.56);
  cavity.position.set(0, 0.27, -0.01);
  chest.add(cavity);
  const heart = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), woundMat);
  heart.scale.set(1, 1.25, 0.9);
  heart.position.set(0.03, 0.35, 0.02);
  chest.add(heart);

  // chape de tissu sur le dos uniquement : le devant est ouvert sur les côtes
  const chestCloth = new THREE.Mesh(
    new THREE.CylinderGeometry(0.43, 0.395, 0.56, 14, 1, true, 0.72, Math.PI * 2 - 1.44),
    robeMat,
  );
  chestCloth.position.y = 0.25;
  chestCloth.castShadow = true;
  chest.add(chestCloth);

  // épaules voûtées, remontées contre les oreilles + bosse dorsale
  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.33, 10, 8), fleshDarkMat);
  hump.scale.set(1.55, 0.52, 0.95);
  hump.position.set(0, 0.6, -0.13);
  torso.add(hump);
  for (const sx of [-1, 1]) {
    const trap = new THREE.Mesh(new THREE.SphereGeometry(0.27, 9, 7), fleshDarkMat);
    trap.scale.set(1.1, 0.55, 0.85);
    trap.position.set(sx * 0.3, 0.63, -0.02);
    trap.rotation.z = sx * -0.35;
    torso.add(trap);
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.125, 9, 7), boneMat);
    joint.position.set(sx * 0.5, 0.56, 0.02);
    torso.add(joint);
  }

  /* ── bras démesurés et mains griffues ── */
  function buildHand(side) {
    const hand = new THREE.Group();
    const handBones = [box(0.195, 0.15, 0.085, 0, -0.03, 0.01)];
    const claws = [];
    for (let i = 0; i < 4; i++) {
      const fx = (i - 1.5) * 0.05;
      handBones.push(box(0.032, 0.115, 0.032, fx, -0.115, 0.035, 0, 0.3, 0));
      handBones.push(box(0.026, 0.1, 0.026, fx, -0.185, 0.085, 0, 0.85, 0));
      const claw = new THREE.ConeGeometry(0.019, 0.115, 5);
      claw.rotateX(2.55);
      claw.translate(fx, -0.24, 0.118);
      claws.push(claw);
    }
    // pouce
    handBones.push(box(0.03, 0.09, 0.03, side * 0.11, -0.065, 0.055, 0, 0.45, side * 0.5));
    const boneMesh = new THREE.Mesh(merge(handBones), boneMat);
    boneMesh.castShadow = true;
    hand.add(boneMesh);
    const clawMesh = new THREE.Mesh(merge(claws), clawMat);
    hand.add(clawMesh);
    return hand;
  }

  function arm(side) {
    const g = new THREE.Group();
    g.position.set(side * 0.54, 0.58, 0.015);
    const humerus = new THREE.Mesh(cyl(0.05, 0.042, 0.74, 6, side * 0.012, -0.37, 0), boneMat);
    humerus.castShadow = true;
    g.add(humerus);
    const sleeve = new THREE.Mesh(cyl(0.115, 0.072, 0.4, 7, 0, -0.23, 0.012), fleshDarkMat);
    sleeve.castShadow = true;
    g.add(sleeve);
    // lambeaux de manche
    const ragParts = [];
    for (let i = 0; i < 3; i++) {
      const len = 0.2 + i * 0.1;
      ragParts.push(box(0.085, len, 0.02, side * (0.055 + i * 0.022), -0.36 - len / 2, 0.02,
        0, 0.12, side * 0.14));
    }
    g.add(new THREE.Mesh(merge(ragParts), robeDark));
    const fore = new THREE.Group();
    fore.position.y = -0.76;
    const radiusBone = new THREE.Mesh(cyl(0.037, 0.03, 0.64, 5, -0.03, -0.32, 0), boneMat);
    const ulna = new THREE.Mesh(cyl(0.029, 0.023, 0.62, 5, 0.034, -0.31, -0.005), boneMat);
    fore.add(radiusBone, ulna);
    const forearmFlesh = new THREE.Mesh(cyl(0.074, 0.048, 0.28, 6, 0, -0.18, 0.012), fleshMat);
    fore.add(forearmFlesh);
    const hand = buildHand(side);
    hand.position.y = -0.66;
    fore.add(hand);
    g.add(fore);
    g.userData.fore = fore;
    return g;
  }
  const armL = arm(1);
  const armR = arm(-1);
  torso.add(armL, armR);
  armL.rotation.set(-0.35, 0, 0.05);
  armR.rotation.set(-0.3, 0, -0.05);

  /* ── crâne décharné : orbites creuses, mâchoire pendante ── */
  const head = new THREE.Group();
  head.position.set(0, 0.86, 0.13);
  torso.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), bonePaleMat);
  skull.scale.set(1.02, 1.08, 0.96);
  skull.castShadow = true;
  head.add(skull);
  const skullParts = [];
  // arcade sourcilière et pommettes
  skullParts.push(box(0.42, 0.055, 0.09, 0, 0.105, 0.235, 0, -0.16, 0));
  for (const sx of [-1, 1]) {
    skullParts.push(box(0.1, 0.08, 0.11, sx * 0.205, -0.055, 0.16, sx * -0.35, 0, 0));
    // rebord orbital
    const rim = new THREE.TorusGeometry(0.088, 0.017, 4, 12);
    rim.translate(sx * 0.105, 0.03, 0.298);
    skullParts.push(rim);
  }
  const faceBone = new THREE.Mesh(merge(skullParts), bonePaleMat);
  faceBone.castShadow = true;
  head.add(faceBone);

  // orbites réellement creuses : tunnel noir + fond noir
  socketMat.side = THREE.DoubleSide;
  const socketParts = [];
  for (const sx of [-1, 1]) {
    const tube = new THREE.CylinderGeometry(0.083, 0.07, 0.14, 10, 1, true);
    tube.rotateX(Math.PI / 2);
    tube.translate(sx * 0.105, 0.03, 0.232);
    socketParts.push(tube);
    const back = new THREE.CircleGeometry(0.072, 10);
    back.translate(sx * 0.105, 0.03, 0.168);
    socketParts.push(back);
  }
  // cavité nasale
  socketParts.push(box(0.075, 0.115, 0.05, 0, -0.045, 0.272, 0, 0.12, 0));
  if (corrupt >= 2) socketParts.push(box(0.05, 0.17, 0.03, -0.15, 0.17, 0.235, 0, 0.18, 0.5));
  head.add(new THREE.Mesh(merge(socketParts), socketMat));
  // braises au fond des orbites
  for (const sx of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 5), eyeMat);
    eye.position.set(sx * 0.105, 0.03, 0.2);
    head.add(eye);
  }

  // dents du haut
  const upperTeeth = [];
  for (let i = 0; i < 7; i++) {
    const x = (i - 3) * 0.033;
    upperTeeth.push(box(0.026, 0.06, 0.022, x, -0.158, 0.255 - Math.abs(x) * 0.16, 0, 0.1, 0));
  }
  head.add(new THREE.Mesh(merge(upperTeeth), bonePaleMat));

  // mâchoire pendante, hinge à l'arrière du crâne
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.1, 0.03);
  jaw.rotation.x = 0.42 + corrupt * 0.1;
  const jawParts = [
    box(0.045, 0.2, 0.055, 0.145, -0.08, 0.02, 0, 0, 0.06),
    box(0.045, 0.2, 0.055, -0.145, -0.08, 0.02, 0, 0, -0.06),
    box(0.22, 0.06, 0.08, 0, -0.185, 0.105, 0, 0, 0),
  ];
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 0.032;
    jawParts.push(box(0.024, 0.05, 0.02, x, -0.145, 0.14 - Math.abs(x) * 0.2, 0, 0, 0));
  }
  const jawMesh = new THREE.Mesh(merge(jawParts), bonePaleMat);
  jawMesh.castShadow = true;
  jaw.add(jawMesh);
  const tongue = new THREE.Mesh(box(0.1, 0.028, 0.12, 0, -0.15, 0.055), fleshDarkMat);
  jaw.add(tongue);
  head.add(jaw);

  // lumière froide de vitrail sur le crâne : la face reste lisible dans la nef orange
  const faceLight = new THREE.PointLight(0xa8c0e0, 4.5, 4.2, 2);
  faceLight.position.set(0, 0.12, 0.8);
  head.add(faceLight);

  // couronne de cierges
  const candles = [];
  const flameMat = new THREE.SpriteMaterial({
    map: T.halo(), color: 0xffc27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const cx = Math.cos(a) * 0.27, cz = Math.sin(a) * 0.27;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.2, 5), new THREE.MeshStandardMaterial({
      color: 0xcfc3a2, roughness: 0.7, emissive: 0x2a1c08, emissiveIntensity: 0.5,
    }));
    c.position.set(cx, 0.3, cz);
    c.userData.noHead = true;
    head.add(c);
    const fl = new THREE.Sprite(flameMat.clone());
    fl.position.set(cx, 0.43, cz);
    fl.scale.setScalar(0.12);
    head.add(fl);
    candles.push({ sprite: fl, phase: rng() * 10 });
  }
  // auréole et mitre (l'office survit au cadavre)
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.022, 6, 28), goldMat);
  halo.position.set(0, 0.4, -0.2);
  halo.rotation.x = -0.25;
  halo.userData.noHead = true;
  head.add(halo);
  const mitre = new THREE.Mesh(new THREE.ConeGeometry(0.19, 0.46, 5), goldMat);
  mitre.position.set(0, 0.44, -0.02);
  mitre.rotation.x = -0.1;
  mitre.userData.noHead = true;
  head.add(mitre);
  // col doré, brisé
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.022, 4, 16, Math.PI * 1.55), goldMat);
  collar.rotation.x = Math.PI / 2;
  collar.position.set(0, -0.34, 0.06);
  head.add(collar);

  // éclats d'os sur les épaules et le dos des variantes corrompues
  if (corrupt > 0) {
    const spurParts = [];
    for (let i = 0; i < corrupt * 3; i++) {
      const sx = i % 2 ? 1 : -1;
      const spur = new THREE.ConeGeometry(0.045, 0.32 + corrupt * 0.06, 4);
      spur.rotateZ(sx * (1.0 + i * 0.08));
      spur.rotateX(-0.25);
      spur.translate(sx * (0.28 + (i % 3) * 0.07), 2.78 + (i % 3) * 0.1, -0.14 - (i % 2) * 0.08);
      spurParts.push(spur);
    }
    // côtes brisées qui percent le flanc
    for (let i = 0; i < corrupt; i++) {
      const rib = new THREE.CylinderGeometry(0.018, 0.006, 0.24, 4);
      rib.rotateZ(-1.15);
      rib.translate(-0.36, 2.45 - i * 0.13, 0.1);
      spurParts.push(rib);
    }
    const spurs = new THREE.Mesh(merge(spurParts), boneMat);
    group.add(spurs);
  }

  // encensoir suspendu à la main gauche
  const censer = new THREE.Group();
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.55, 4), ironMat);
  chain.position.y = -0.28;
  censer.add(chain);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), goldMat);
  bowl.position.y = -0.58;
  bowl.scale.y = 1.2;
  censer.add(bowl);
  const ember = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.halo(), color: V.censer, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  ember.position.y = -0.6;
  ember.scale.setScalar(0.85);
  censer.add(ember);
  censer.position.set(0, -0.72, 0.02);
  armL.userData.fore.add(censer);

  const censerLight = new THREE.PointLight(V.censer, 14, 9, 2);
  censerLight.position.set(0, -0.7, 0);
  armL.userData.fore.add(censerLight);

  /* ── crosse épiscopale dans la main droite ── */
  const staff = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.042, 2.35, 6), ironMat);
  shaft.position.y = 0.9;
  shaft.castShadow = true;
  staff.add(shaft);
  for (let i = 0; i < 4; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 4, 10), goldMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3 + i * 0.45;
    staff.add(ring);
  }
  const spiral = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.032, 6, 22, Math.PI * 1.75), goldMat);
  spiral.position.set(0, 2.12, 0);
  spiral.rotation.set(Math.PI / 2, 0, 0.4);
  staff.add(spiral);
  const staffFlame = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.halo(), color: 0xffd08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  staffFlame.position.set(0, 2.02, 0);
  staffFlame.scale.setScalar(0.5);
  staff.add(staffFlame);
  staff.position.set(0.02, -0.72, 0.1);
  staff.rotation.z = -0.12;
  armR.userData.fore.add(staff);

  /* ── orbes de la volée de flammes (dans les paumes) ── */
  const handGlowMat = new THREE.SpriteMaterial({
    map: T.halo(), color: 0xffa050, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const handGlowL = new THREE.Sprite(handGlowMat);
  const handGlowR = new THREE.Sprite(handGlowMat);
  for (const [g, s] of [[armL, handGlowL], [armR, handGlowR]]) {
    s.position.set(0, -0.74, 0.04);
    s.scale.setScalar(0.5);
    s.visible = false;
    g.userData.fore.add(s);
  }

  /* ── rune de la poitrine : le point faible se VOIT ── */
  const weakMat = new THREE.SpriteMaterial({
    map: T.halo(), color: 0xffd27a, transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  });
  const weakSpot = new THREE.Sprite(weakMat);
  weakSpot.scale.setScalar(0.55);
  weakSpot.position.set(0, 0.35, 0.42);
  chest.add(weakSpot);

  /* ── sceau au sol (pentacle de la nef) ── */
  const sigilGroup = new THREE.Group();
  const sigilMat = new THREE.MeshBasicMaterial({
    color: V.sigil, transparent: true, opacity: 0, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  // toutes les pièces du sceau sont fusionnées : un seul appel de dessin
  const sigilParts = [];
  const addSigil = (geo, mtx) => { geo.applyMatrix4(mtx); sigilParts.push(geo); };
  const m4 = new THREE.Matrix4();
  const outerGeo = new THREE.RingGeometry(2.02, 2.16, 72);
  outerGeo.rotateX(-Math.PI / 2);
  sigilParts.push(outerGeo);
  const innerGeo = new THREE.RingGeometry(1.28, 1.33, 64);
  innerGeo.rotateX(-Math.PI / 2);
  sigilParts.push(innerGeo);
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * Math.PI * 2 - Math.PI / 2;
    const a1 = (((i + 2) % 5) / 5) * Math.PI * 2 - Math.PI / 2;
    const x0 = Math.cos(a0) * 1.95, z0 = Math.sin(a0) * 1.95;
    const x1 = Math.cos(a1) * 1.95, z1 = Math.sin(a1) * 1.95;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const bar = new THREE.BoxGeometry(0.028, 0.008, len);
    m4.makeRotationY(Math.atan2(x1 - x0, z1 - z0));
    m4.setPosition((x0 + x1) / 2, 0.012, (z0 + z1) / 2);
    addSigil(bar, m4.clone());
  }
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const rune = new THREE.BoxGeometry(0.02, 0.006, 0.11);
    m4.makeRotationY(a);
    m4.setPosition(Math.cos(a) * 1.72, 0.012, Math.sin(a) * 1.72);
    addSigil(rune, m4.clone());
  }
  const sigilMesh = new THREE.Mesh(merge(sigilParts), sigilMat);
  sigilGroup.add(sigilMesh);
  sigilGroup.position.set(x, 0.37, z);
  sigilGroup.scale.setScalar(V.scale);
  sigilGroup.visible = true;
  sigilMat.opacity = 0.42;
  scene.add(sigilGroup);

  const auraLight = new THREE.PointLight(V.aura, 5, 9, 2);
  auraLight.position.set(0, 1.2, 0);
  group.add(auraLight);

  // contre-jour froid : détache la silhouette sombre de la nef
  const rimLight = new THREE.PointLight(0x6f8cd8, 18, 8, 2);
  rimLight.position.set(0, 3.1, -1.9);
  group.add(rimLight);

  /* ── colonne de lumière du vitrail (attaque de phase II) ── */
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xff7a52, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 1.15, 15, 16, 1, true), beamMat);
  beam.position.y = 7.5;
  beam.visible = false;
  scene.add(beam);
  const beamCore = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.42, 15, 12, 1, true), new THREE.MeshBasicMaterial({
    color: 0xfff0d0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  beamCore.position.y = 7.5;
  beamCore.visible = false;
  scene.add(beamCore);
  const beamRing = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.05, 40), new THREE.MeshBasicMaterial({
    color: 0xff5a30, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  beamRing.rotation.x = -Math.PI / 2;
  beamRing.position.y = 0.4;
  beamRing.visible = false;
  scene.add(beamRing);

  /* ── télégraphes au sol ── */
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff4a24, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
  });
  const slamRing = new THREE.Mesh(new THREE.RingGeometry(3.2, 3.55, 48), ringMat);
  slamRing.rotation.x = -Math.PI / 2;
  slamRing.position.y = 0.02;
  slamRing.visible = false;
  scene.add(slamRing);

  const waveMat = new THREE.MeshBasicMaterial({
    color: 0xffb070, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const waveRing = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 64), waveMat);
  waveRing.rotation.x = -Math.PI / 2;
  waveRing.visible = false;
  scene.add(waveRing);

  const chargeLine = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 9), new THREE.MeshBasicMaterial({
    color: 0xff3a20, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  }));
  chargeLine.rotation.x = -Math.PI / 2;
  chargeLine.visible = false;
  scene.add(chargeLine);

  /* ── éventail de la volée de flammes (télégraphe) ── */
  const volleyRig = new THREE.Group();
  const fanMat = new THREE.MeshBasicMaterial({
    color: 0xff5a22, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const fanGeo = new THREE.CircleGeometry(7.2, 36, -Math.PI / 2 - 0.55, 1.1);
  const fan = new THREE.Mesh(fanGeo, fanMat);
  fan.rotation.x = -Math.PI / 2;
  volleyRig.add(fan);
  volleyRig.visible = false;
  scene.add(volleyRig);

  /* ── arc du revers (télégraphe) ── */
  const sweepRig = new THREE.Group();
  const sweepMat = new THREE.MeshBasicMaterial({
    color: 0xff3a1c, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const sweepGeo = new THREE.RingGeometry(1.0, 3.9, 48, 1, -Math.PI / 2 - 1.32, 2.64);
  const sweepArc = new THREE.Mesh(sweepGeo, sweepMat);
  sweepArc.rotation.x = -Math.PI / 2;
  sweepRig.add(sweepArc);
  sweepRig.visible = false;
  scene.add(sweepRig);

  /* ── projectiles de la volée : géométrie et matériaux partagés ── */
  const flameGeo = new THREE.IcosahedronGeometry(0.18, 0);
  const flameBodyMat = new THREE.MeshBasicMaterial({
    color: 0xffc070, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flameGlowMat = new THREE.SpriteMaterial({
    map: T.halo(), color: 0xff5a18, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false,
  });
  const flames = [];
  for (let i = 0; i < 5; i++) {
    const mesh = new THREE.Mesh(flameGeo, flameBodyMat);
    const glow = new THREE.Sprite(flameGlowMat);
    glow.scale.setScalar(1.5);
    mesh.add(glow);
    mesh.visible = false;
    mesh.position.y = 1.9;
    scene.add(mesh);
    flames.push({ mesh, vel: new THREE.Vector3(), life: 0, alive: false });
  }

  /* ── état ── */
  // Les PV suivent la formule des variantes : 1200 × difficulty × (1 + 0.6 × (v - 1)).
  const maxHp = BOSS.hp * difficulty * V.hpMul;
  const state = {
    group, hitRoot: group, pos: group.position,
    alive: true, hp: maxHp, maxHp,
    phase: 1,
    radius: BOSS.radius * V.scale,
    variant: v,
    variantName: V.name,
    name: name || V.name,
    hpMul: V.hpMul,
    dmgMul: V.dmgMul,
    attacks: BOSS_ATTACKS.slice(),
    lastAttack: null,
    mode: "idle",
    timer: 0,
    atkCd: 3.0,
    slamT: 0,
    waveT: -1,
    waveRadius: 0,
    waveHit: false,
    chargeT: 0,
    chargeDir: new THREE.Vector3(),
    chargeHit: false,
    volleyT: 0,
    volleyFired: false,
    volleySound: false,
    sweepT: 0,
    sweepHit: false,
    sweepSound: false,
    stunT: 0,
    deathT: 0,
    flash: 0,
    struck: false,
    invuln: 0,
    roarT: 0,
    beamT: -1,
    beamTarget: new THREE.Vector3(),
    beamHit: false,
    sigilOn: 1,
    _ctx: null,
    hit(dmg, point, dir, part) {
      if (!this.alive) return { killed: false };
      // on ne peut plus l'abattre depuis le parvis : le duel se fait dans la nef
      const pl = this._ctx && this._ctx.player;
      if (pl && (Math.abs(pl.pos.x) > 5.4 || pl.pos.z > 12.6)) {
        if (!this._outsideMsg) {
          this._outsideMsg = true;
          this._ctx.notify && this._ctx.notify("L'Officiant se dérobe — affrontez-le dans la nef");
        }
        return { killed: false, ignored: true };
      }
      this._outsideMsg = false;
      if (this.invuln > 0) {
        // phase III : le boss se protège pendant son rugissement. On le DIT
        // (un seul toast) et on marque le coup d'une étincelle dorée, sinon le
        // joueur voit du sang mais aucun dégât et croit à un bug.
        if (!this._shieldMsg) {
          this._shieldMsg = true;
          if (this._ctx && this._ctx.notify) this._ctx.notify("L'Officiant se protège — attendez la fin du rugissement");
        }
        if (this._ctx && this._ctx.fx && point) this._ctx.fx.impact(point, new THREE.Vector3(0, 1, 0), "stone");
        return { killed: false, ignored: true };
      }
      this._shieldMsg = false;
      const mult = part === "head" ? 1.55 : 1;
      this.hp -= dmg * mult;
      this.flash = 0.12;
      if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
        this.phase = 2;
        this.onPhase2 && this.onPhase2();
      }
      if (this.phase === 2 && this.hp < this.maxHp * 0.25) {
        this.phase = 3;
        this.mode = "roar";
        this.roarT = 0;
        this.invuln = 1.2;
        this.onPhase3 && this.onPhase3();
      }
      if (this.hp <= 0) {
        this.alive = false;
        this.deathT = 0;
        return { killed: true, headshot: part === "head" };
      }
      return { killed: false };
    },
    dispose() {
      scene.remove(group);
      scene.remove(slamRing);
      scene.remove(waveRing);
      scene.remove(chargeLine);
      scene.remove(sigilGroup);
      scene.remove(beam);
      scene.remove(beamCore);
      scene.remove(beamRing);
      scene.remove(volleyRig);
      scene.remove(sweepRig);
      for (const f of flames) {
        scene.remove(f.mesh);
        f.alive = false;
      }
      sigilGroup.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
      beam.geometry.dispose();
      beamCore.geometry.dispose();
      beamRing.geometry.dispose();
      fanGeo.dispose();
      sweepGeo.dispose();
      flameGeo.dispose();
      fanMat.dispose();
      sweepMat.dispose();
      flameBodyMat.dispose();
      flameGlowMat.dispose();
      this._ctx = null;
    },
  };
  // tout le crâne compte comme tête (les cierges et la mitre, non)
  const headMeshes = new Set();
  head.traverse((o) => { if (o.isMesh && !o.userData.noHead) headMeshes.add(o); });
  group.traverse((o) => {
    if (o.isSprite) o.raycast = () => {};
    if (o.isMesh) {
      o.userData.enemy = state;
      o.userData.part = headMeshes.has(o) ? "head" : "body";
    }
  });
  group.scale.setScalar(V.scale);

  /* ── helpers de combat ── */

  // Un point est-il dans un mur / un meuble ? (colliders de la nef)
  function blockedAt(px, pz, colliders) {
    if (Math.abs(px) > 4.55 || pz < -12.15 || pz > 12.55) return true;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      if (c.r) {
        if (Math.hypot(px - c.x, pz - c.z) < c.r) return true;
      } else if (c.hw && Math.abs(px - c.x) < c.hw && Math.abs(pz - c.z) < c.hd) {
        return true;
      }
    }
    return false;
  }

  function clearFlames() {
    for (const f of flames) {
      f.alive = false;
      f.life = 0;
      f.mesh.visible = false;
    }
  }

  function fireVolley() {
    const yaw = group.rotation.y;
    const oy = (state.pos.y || 0) + 1.92 * V.scale;
    const ox = state.pos.x + Math.sin(yaw) * 0.55 * V.scale;
    const oz = state.pos.z + Math.cos(yaw) * 0.55 * V.scale;
    for (let i = 0; i < flames.length; i++) {
      const f = flames[i];
      const a = yaw + (i - 2) * 0.26;
      const sp = 13.5;
      f.vel.set(Math.sin(a) * sp, 0, Math.cos(a) * sp);
      f.mesh.position.set(ox, oy + (i % 2 ? 0.14 : -0.05), oz);
      f.mesh.rotation.set(0, a, 0);
      f.mesh.scale.setScalar(0.85 + (i % 3) * 0.12);
      f.mesh.visible = true;
      f.life = 2.4;
      f.alive = true;
    }
  }

  /** Ligne de vue grossière : un mur de la nef coupe les attaques de zone. */
  function clearLine(ax, az, bx, bz, colliders) {
    if (!colliders || !colliders.length) return true;
    const n = 8;
    for (let i = 1; i < n; i++) {
      const k = i / n;
      if (blockedAt(ax + (bx - ax) * k, az + (bz - az) * k, colliders)) return false;
    }
    return true;
  }

  function updateFlames(dt, time, player, fx, colliders) {
    for (const f of flames) {
      if (!f.alive) continue;
      f.life -= dt;
      const p = f.mesh.position;
      p.addScaledVector(f.vel, dt);
      f.mesh.rotation.x += dt * 7;
      f.mesh.rotation.z += dt * 5;
      f.mesh.scale.setScalar(0.85 + Math.sin(time * 22 + p.x) * 0.07);
      let dead = f.life <= 0;
      const dx = player.pos.x - p.x;
      const dz = player.pos.z - p.z;
      if (Math.hypot(dx, dz) < 0.82 && p.y > 0.1 && p.y - player.pos.y < 2.4) {
        player.hurt(8 * state.dmgMul);
        fx.blood(new THREE.Vector3(p.x, p.y, p.z), f.vel.clone().normalize(), false);
        dead = true;
      } else if (blockedAt(p.x, p.z, colliders)) {
        fx.impact(new THREE.Vector3(p.x, p.y, p.z),
          new THREE.Vector3(-f.vel.x, 0.7, -f.vel.z).normalize(), "stone");
        fx.puff(p.x, p.y, p.z, { scale: 0.9, life: 0.5, color: 0x8a6a52, opacity: 0.3, vy: 0.25 });
        dead = true;
      }
      if (dead) {
        f.alive = false;
        f.mesh.visible = false;
      }
    }
    flameBodyMat.opacity = 0.82 + Math.sin(time * 18) * 0.12;
  }

  // Remet la silhouette au repos et coupe les télégraphes en cours.
  function resetPose() {
    torso.rotation.set(0, 0, 0);
    head.rotation.set(0, 0, 0);
    armL.rotation.set(-0.35, 0, 0);
    armR.rotation.set(-0.3, 0, 0);
    group.rotation.z = 0;
    slamRing.visible = false;
    waveRing.visible = false;
    chargeLine.visible = false;
    beam.visible = false;
    beamCore.visible = false;
    beamRing.visible = false;
    volleyRig.visible = false;
    sweepRig.visible = false;
    fanMat.opacity = 0;
    sweepMat.opacity = 0;
    handGlowL.visible = false;
    handGlowR.visible = false;
    handGlowMat.opacity = 0;
    clearFlames();
    state.waveRadius = 0;
    state.struck = false;
    state.chargeHit = false;
    state.volleyFired = false;
    state.volleySound = false;
    state.sweepHit = false;
    state.sweepSound = false;
    state.beamHit = false;
    state.beamT = -1;
    state.roarT = 0;
  }

  state.update = function (dt, ctx) {
    const { player, time, audio, fx, colliders = [] } = ctx;
    const t = time;
    this._ctx = ctx;
    const dmgMul = this.dmgMul;

    // INVARIANT : ce module ne touche JAMAIS player.pos et n'appelle jamais teleport().
    // Une attaque se limite à des dégâts + une secousse de caméra ; le boss ne peut
    // donc pas pousser ni éjecter le joueur hors de l'église.

    // cierges et encensoir toujours animés
    for (const c of candles) {
      const n = 0.85 + Math.sin(t * 9 + c.phase) * 0.12;
      c.sprite.scale.setScalar(0.12 * n);
    }
    ember.material.opacity = 0.7 + Math.sin(t * 6) * 0.2;
    censerLight.intensity = 12 + Math.sin(t * 7.3) * 3;
    censer.rotation.z = Math.sin(t * 1.4) * 0.12;
    censer.rotation.x = Math.cos(t * 1.1) * 0.08;

    if (!this.alive) {
      this.deathT += dt;
      const k = clamp(this.deathT / 2.4, 0, 1);
      group.rotation.x = k * 1.35;
      group.position.y = Math.max(-1.6, -k * 0.25);
      halo.material.emissiveIntensity = 0.9 * (1 - k);
      // les cierges s'éteignent un à un
      for (let i = 0; i < candles.length; i++) {
        const out = clamp((k - i / (candles.length + 2)) * 4, 0, 1);
        candles[i].sprite.material.opacity = 1 - out;
      }
      staffFlame.material.opacity = Math.max(0, 1 - k * 2);
      sigilMat.opacity = Math.max(0, 0.55 * (1 - k * 1.6));
      auraLight.intensity = Math.max(0, 9 * (1 - k * 1.8));
      censerLight.intensity = Math.max(0, 12 * (1 - k * 1.5));
      slamRing.visible = false;
      waveRing.visible = false;
      chargeLine.visible = false;
      beam.visible = false;
      beamCore.visible = false;
      beamRing.visible = false;
      volleyRig.visible = false;
      sweepRig.visible = false;
      fanMat.opacity = 0;
      sweepMat.opacity = 0;
      handGlowL.visible = false;
      handGlowR.visible = false;
      handGlowMat.opacity = 0;
      clearFlames();
      if (this.deathT > 3.5 && !this.removed) {
        this.removed = true;
        fx.glass(group.position.clone().setY(2.6), 40);
        fx.puff(group.position.clone().setY(1.2), { scale: 4.5, life: 2.2, color: 0xd8b47e, opacity: 0.35, vy: 0.8 });
      }
      return;
    }

    // phase 2 : plus rapide, plus agressif, lueur rouge
    const p2 = this.phase >= 2;
    const p3 = this.phase === 3;
    const spd = p3 ? BOSS.walk2 * 1.28 : p2 ? BOSS.walk2 : BOSS.walk;
    const toPlayer = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);

    this.invuln = Math.max(0, this.invuln - dt);

    /* ── sceau au sol et aura : la nef se souvient ── */
    this.sigilOn = damp(this.sigilOn || 0, 1, 1.6, dt);
    const pulse = 0.5 + Math.sin(t * (p3 ? 6.5 : p2 ? 2.8 : 1.6)) * 0.5;
    sigilGroup.visible = this.sigilOn > 0.02;
    sigilGroup.position.set(this.pos.x, (this.pos.y || 0) + 0.02, this.pos.z);
    sigilGroup.rotation.y += dt * (p3 ? 0.95 : p2 ? 0.45 : 0.18);
    sigilMat.opacity = (0.26 + (p2 ? 0.16 : 0) + (p3 ? 0.2 : 0)) * (0.55 + pulse * 0.45) * this.sigilOn;
    auraLight.intensity = (p3 ? 24 : p2 ? 13 : 5) * (0.7 + pulse * 0.3) * this.sigilOn;

    this.atkCd = Math.max(0, this.atkCd - dt);
    this.timer += dt;
    this.flash = Math.max(0, this.flash - dt);
    group.position.y = damp(group.position.y, 0, 6, dt);

    // orientation vers le joueur (la charge, le revers et la volée verrouillent leur axe)
    if (this.mode !== "charge" && this.mode !== "sweep" && this.mode !== "volley") {
      const yaw = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      let d = yaw - group.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      group.rotation.y += d * Math.min(1, dt * 2.6);
    }

    // respiration du cadavre, mâchoire qui claque, jambes qui suivent le pas
    chest.position.y = 0.30 + Math.sin(t * 1.3) * 0.012;
    cape.rotation.x = Math.sin(t * 0.9) * 0.03;
    jaw.rotation.x = 0.42 + corrupt * 0.1 + Math.sin(t * 2.3) * 0.035;
    const stride = this.mode === "charge" ? 0.34 : this.mode === "walk" ? 0.24 : 0.05;
    const gait = t * (this.mode === "charge" ? 10 : 3.4);
    legL.rotation.x = Math.sin(gait) * stride;
    legR.rotation.x = -Math.sin(gait) * stride;

    const lookAtPlayer = () => {
      const yaw = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
      group.rotation.y = yaw;
    };

    // le boss ne frappe plus À TRAVERS les murs : ses attaques exigent une ligne
    // de vue (le porteur se faisait bloquer dans la nef par des coups portés de l'extérieur)
    const hurt = (dmg) => {
      const c = (this._ctx && this._ctx.colliders) || colliders;
      if (!clearLine(this.pos.x, this.pos.z, player.pos.x, player.pos.z, c)) return;
      player.hurt(dmg * dmgMul);
    };

    // les flammes continuent leur course même quand le boss est revenu au repos
    updateFlames(dt, t, player, fx, colliders);
    weakSpot.material.opacity = 0.4 + 0.25 * Math.sin(t * 4.2);
    weakSpot.scale.setScalar(0.5 + 0.08 * Math.sin(t * 2.6));

    switch (this.mode) {
      case "idle": {
        if (this.invuln > 0) break;
        if (this.atkCd <= 0) this.forceAttack(this.pickAttack(toPlayer));
        else this.mode = "walk";
        break;
      }
      case "roar": {
        this.roarT += dt;
        const k = clamp(this.roarT / 1.2, 0, 1);
        armL.rotation.x = lerp(-0.35, -2.9, k);
        armR.rotation.x = lerp(-0.3, -2.9, k);
        torso.rotation.x = lerp(0, -0.22, k);
        head.rotation.x = lerp(0, -0.3, k);
        group.rotation.y += dt * 1.4;
        sigilMat.opacity = 0.75 * (0.6 + pulse * 0.4);
        beamRing.visible = true;
        beamRing.position.set(this.pos.x, (this.pos.y || 0) + 0.03, this.pos.z);
        beamRing.scale.setScalar(1 + this.roarT * 7);
        beamRing.material.opacity = clamp(0.7 - this.roarT * 0.5, 0, 0.7);
        if (!this.roarFx && this.roarT > 0.35) {
          this.roarFx = true;
          audio.quake();
          audio.bell(1);
          ctx.shake && ctx.shake(1.3);
          for (let i = 0; i < 30; i++) {
            fx.impact(new THREE.Vector3(this.pos.x + randRange(rng, -3, 3), 0.2, this.pos.z + randRange(rng, -3, 3)),
              new THREE.Vector3(0, 1, 0), "stone");
          }
        }
        if (this.roarT > 2.1) {
          beamRing.visible = false;
          torso.rotation.x = 0;
          head.rotation.x = 0;
          this.mode = "idle";
          this.atkCd = 0.6;
          this.roarFx = false;
        }
        break;
      }
      case "beam": {
        this.beamT += dt;
        const tgt = this.beamTarget;
        const wind = 1.0;
        if (this.beamT < wind) {
          armL.rotation.x = lerp(-0.35, -3.0, this.beamT / wind);
          armR.rotation.x = lerp(-0.3, -3.0, this.beamT / wind);
          beamRing.visible = true;
          beamRing.position.set(tgt.x, 0.42, tgt.z);
          beamRing.scale.setScalar(1 + Math.sin(this.beamT * 16) * 0.06 + this.beamT * 0.5);
          beamRing.material.opacity = 0.25 + (this.beamT / wind) * 0.5;
        } else if (this.beamT < 1.55) {
          beamRing.visible = false;
          beam.visible = true;
          beamCore.visible = true;
          beam.position.set(tgt.x, 7.5, tgt.z);
          beamCore.position.set(tgt.x, 7.5, tgt.z);
          const k = clamp((this.beamT - wind) / 0.18, 0, 1);
          beamMat.opacity = 0.62 * k;
          beamCore.material.opacity = 0.85 * k;
          if (!this.beamHit && this.beamT > wind + 0.06) {
            this.beamHit = true;
            audio.quake();
            ctx.shake && ctx.shake(0.8);
            if (Math.hypot(player.pos.x - tgt.x, player.pos.z - tgt.z) < 1.7) hurt(20 * (p3 ? 1.1 : 1));
            fx.impact(new THREE.Vector3(tgt.x, 0.5, tgt.z), new THREE.Vector3(0, 1, 0), "stone");
          }
        } else {
          beam.visible = false;
          beamCore.visible = false;
          beamMat.opacity = 0;
          beamCore.material.opacity = 0;
          this.mode = "idle";
          this.atkCd = p3 ? 1.6 : p2 ? 1.9 : 2.4;
          torso.rotation.x = 0;
        }
        break;
      }
      case "walk": {
        const dx = player.pos.x - this.pos.x;
        const dz = player.pos.z - this.pos.z;
        const d = Math.hypot(dx, dz) || 1;
        // distance de garde : le boss ne vient jamais se coller au joueur, donc la
        // caméra ne peut pas entrer dans le modèle (aucun effet d'éjection).
        const guard = 2.45 * V.scale;
        if (toPlayer > guard) {
          const vx = (dx / d) * spd;
          const vz = (dz / d) * spd;
          const step = Math.min(spd * dt, Math.max(0, toPlayer - guard));
          this.pos.x += (vx / spd) * step;
          this.pos.z += (vz / spd) * step;
          armL.rotation.x = -0.35 + Math.sin(t * 3.2) * 0.2;
          armR.rotation.x = -0.3 - Math.sin(t * 3.2) * 0.2;
          head.rotation.z = Math.sin(t * 2.1) * 0.06;
        } else {
          armL.rotation.x = -0.5;
          armR.rotation.x = -0.45;
        }
        // collision simple avec les murs
        if (Math.abs(this.pos.x) > 5.0 || this.pos.z < -12.2) {
          // dans la nef, on reste dans l'axe
          this.pos.x = clamp(this.pos.x, -4.4, 4.4);
          this.pos.z = clamp(this.pos.z, -12.0, 12.2);
        }
        if (Math.abs(this.pos.z) < 12 && Math.abs(this.pos.x) < 4.4) {
          this.pos.y = 0.35;
        } else {
          this.pos.y = 0;
        }
        if (this.invuln > 0) break;
        if (this.atkCd <= 0) this.forceAttack(this.pickAttack(toPlayer));
        break;
      }
      case "slam": {
        this.slamT += dt;
        const wind = 0.62;
        if (this.slamT < wind) {
          slamRing.visible = true;
          const k = this.slamT / wind;
          slamRing.scale.setScalar(0.7 + k * 0.3);
          slamRing.material.opacity = 0.25 + k * 0.45;
          slamRing.position.set(this.pos.x, (this.pos.y || 0) + 0.02, this.pos.z);
          armL.rotation.x = lerp(-0.35, -2.5, k);
          armR.rotation.x = lerp(-0.3, -2.5, k);
          torso.rotation.x = lerp(0, 0.15, k);
        } else if (!this.struck) {
          this.struck = true;
          audio.quake();
          fx.puff(this.pos.x, 0.3, this.pos.z, { scale: 3.2, life: 1.2, color: 0x8a8272, opacity: 0.4, vy: 0.4 });
          for (let i = 0; i < 26; i++) {
            fx.impact(new THREE.Vector3(this.pos.x + randRange(rng, -2.4, 2.4), 0.1, this.pos.z + randRange(rng, -2.4, 2.4)),
              new THREE.Vector3(0, 1, 0), "stone");
          }
          if (toPlayer < 4.6 * V.scale) hurt(16 * (p2 ? 1.1 : 1));
          ctx.shake && ctx.shake(0.9);
        }
        if (this.slamT > 1.05) {
          slamRing.visible = false;
          this.mode = "idle";
          this.atkCd = p3 ? 1.35 : p2 ? 1.5 : 1.9;
          this.struck = false;
          torso.rotation.x = 0;
        }
        break;
      }
      case "wave": {
        this.waveT += dt;
        if (this.waveT < 0.55) {
          armL.rotation.x = lerp(-0.35, -2.9, this.waveT / 0.55);
          armR.rotation.x = lerp(-0.3, -2.9, this.waveT / 0.55);
        } else {
          if (this.waveRadius === 0) {
            this.waveRadius = 1.0;
            this.waveHit = false;
            audio.quake();
            fx.impact(new THREE.Vector3(this.pos.x, 0.2, this.pos.z), new THREE.Vector3(0, 1, 0), "stone");
          }
          this.waveRadius += dt * 13;
          waveRing.visible = true;
          waveRing.position.set(this.pos.x, (this.pos.y || 0) + 0.05, this.pos.z);
          waveRing.scale.setScalar(this.waveRadius);
          waveMat.opacity = clamp(1 - (this.waveRadius - 1) / 12, 0, 0.6);
          if (!this.waveHit && Math.abs(toPlayer - this.waveRadius) < 0.9) {
            this.waveHit = true;
            hurt(13 * (p2 ? 1.1 : 1));
          }
          if (this.waveRadius > 13) {
            waveRing.visible = false;
            this.waveRadius = 0;
            this.mode = "idle";
            this.atkCd = p3 ? 1.5 : p2 ? 1.6 : 2.2;
          }
        }
        break;
      }
      case "charge": {
        this.chargeT += dt;
        if (this.chargeT < 0.55) {
          chargeLine.visible = true;
          chargeLine.material.opacity = 0.10 + (this.chargeT / 0.55) * 0.22;
          chargeLine.position.set(this.pos.x, (this.pos.y || 0) + 0.03, this.pos.z);
          chargeLine.rotation.z = -group.rotation.y;
          chargeLine.position.x += Math.sin(group.rotation.y) * 4.5;
          chargeLine.position.z += Math.cos(group.rotation.y) * 4.5;
          lookAtPlayer();
          armL.rotation.x = -2.2;
          armR.rotation.x = -2.2;
        } else {
          chargeLine.visible = false;
          this.pos.x += this.chargeDir.x * 15 * dt;
          this.pos.z += this.chargeDir.z * 15 * dt;
          if (Math.random() < dt * 40) {
            fx.puff(this.pos.x, 0.6, this.pos.z, { scale: 1.2, life: 0.5, color: 0x55524a, opacity: 0.3 });
          }
          if (!this.chargeHit && toPlayer < 2.2 * V.scale) {
            this.chargeHit = true;
            hurt(16 * (p2 ? 1.1 : 1));
            ctx.shake && ctx.shake(0.7);
            // La charge s'arrête net sur l'impact : elle ne traverse jamais le joueur
            // et ne peut donc pas l'entraîner hors de la nef.
            this.mode = "stun";
            this.stunT = 0.85;
            audio.quake();
            fx.puff(this.pos.x, 0.8, this.pos.z, { scale: 2.2, life: 1.0, color: 0x8a8272, opacity: 0.35 });
          }
          // mur
          if (this.mode === "charge" &&
              (Math.abs(this.pos.x) > 4.9 || this.pos.z < -11.8 || this.pos.z > 12.6 || this.chargeT > 1.35)) {
            this.mode = "stun";
            this.stunT = 1.3;
            audio.quake();
            fx.puff(this.pos.x, 0.8, this.pos.z, { scale: 2.4, life: 1.1, color: 0x8a8272, opacity: 0.35 });
          }
        }
        break;
      }
      case "volley": {
        this.volleyT += dt;
        const wind = 0.85;
        const k = clamp(this.volleyT / wind, 0, 1);
        if (this.volleyT < wind) {
          armL.rotation.x = lerp(-0.35, -2.95, k);
          armR.rotation.x = lerp(-0.3, -2.95, k);
          torso.rotation.x = lerp(0, -0.18, k);
          head.rotation.x = lerp(0, -0.14, k);
          volleyRig.visible = true;
          volleyRig.position.set(this.pos.x, (this.pos.y || 0) + 0.04, this.pos.z);
          volleyRig.rotation.y = group.rotation.y;
          volleyRig.scale.setScalar(V.scale * (1 + Math.sin(t * 16) * 0.02));
          fanMat.opacity = 0.07 + k * 0.3;
          handGlowL.visible = true;
          handGlowR.visible = true;
          handGlowMat.opacity = 0.25 + k * 0.65;
          const gs = 0.35 + k * 0.75;
          handGlowL.scale.setScalar(gs);
          handGlowR.scale.setScalar(gs);
          if (!this.volleySound && this.volleyT > 0.1) {
            this.volleySound = true;
            audio.bell(1);
          }
        } else if (!this.volleyFired) {
          this.volleyFired = true;
          volleyRig.visible = false;
          fanMat.opacity = 0;
          audio.growl(0, 2, true);
          ctx.shake && ctx.shake(0.35);
          fireVolley();
          fx.puff(this.pos.x, 1.8 * V.scale, this.pos.z,
            { scale: 1.8, life: 0.7, color: 0xff8a40, opacity: 0.35, vy: 0.5 });
          armL.rotation.x = -1.35;
          armR.rotation.x = -1.35;
          handGlowMat.opacity = 0.15;
        } else {
          armL.rotation.x = damp(armL.rotation.x, -0.35, 4, dt);
          armR.rotation.x = damp(armR.rotation.x, -0.3, 4, dt);
          torso.rotation.x = damp(torso.rotation.x, 0, 4, dt);
          handGlowMat.opacity = damp(handGlowMat.opacity, 0, 5, dt);
        }
        if (this.volleyT > 1.5) {
          volleyRig.visible = false;
          fanMat.opacity = 0;
          handGlowL.visible = false;
          handGlowR.visible = false;
          handGlowMat.opacity = 0;
          this.mode = "idle";
          this.atkCd = p3 ? 1.4 : p2 ? 1.6 : 2.1;
          this.volleyFired = false;
          this.volleySound = false;
        }
        break;
      }
      case "sweep": {
        this.sweepT += dt;
        const wind = 0.7;
        const k = clamp(this.sweepT / wind, 0, 1);
        if (this.sweepT < wind) {
          sweepRig.visible = true;
          sweepRig.position.set(this.pos.x, (this.pos.y || 0) + 0.04, this.pos.z);
          sweepRig.rotation.y = group.rotation.y;
          sweepRig.scale.setScalar(V.scale * (1 + Math.sin(t * 14) * 0.02));
          sweepMat.opacity = 0.08 + k * 0.34;
          torso.rotation.y = lerp(0, 0.55, k);
          armR.rotation.x = lerp(-0.3, -1.8, k);
          armR.rotation.z = lerp(0, 1.35, k);
          armL.rotation.x = lerp(-0.35, -0.75, k);
          if (!this.sweepSound && this.sweepT > 0.08) {
            this.sweepSound = true;
            audio.growl(0, 2, true);
          }
        } else if (!this.sweepHit) {
          this.sweepHit = true;
          audio.quake();
          audio.hit(true);
          ctx.shake && ctx.shake(0.85);
          const yaw = group.rotation.y;
          let ang = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z) - yaw;
          while (ang > Math.PI) ang -= Math.PI * 2;
          while (ang < -Math.PI) ang += Math.PI * 2;
          const reach = 3.9 * V.scale;
          if (toPlayer < reach + 0.5 && Math.abs(ang) < 1.32) hurt(14 * (p2 ? 1.08 : 1));
          for (let i = 0; i < 16; i++) {
            const a = yaw - 1.2 + (i / 15) * 2.4;
            const r = randRange(rng, 2.2, 3.5) * V.scale;
            fx.impact(new THREE.Vector3(this.pos.x + Math.sin(a) * r, 0.15, this.pos.z + Math.cos(a) * r),
              new THREE.Vector3(0, 1, 0), "stone");
          }
          sweepMat.opacity = 0.8;
          torso.rotation.y = -0.6;
          armR.rotation.z = -1.45;
          armR.rotation.x = -1.1;
        } else {
          torso.rotation.y = damp(torso.rotation.y, 0, 6, dt);
          armR.rotation.z = damp(armR.rotation.z, 0, 6, dt);
          armR.rotation.x = damp(armR.rotation.x, -0.3, 5, dt);
          sweepMat.opacity = damp(sweepMat.opacity, 0, 4, dt);
        }
        if (this.sweepT > 1.25) {
          sweepRig.visible = false;
          sweepMat.opacity = 0;
          torso.rotation.y = 0;
          armR.rotation.z = 0;
          this.mode = "idle";
          this.atkCd = p3 ? 1.25 : p2 ? 1.4 : 1.7;
          this.sweepHit = false;
          this.sweepSound = false;
        }
        break;
      }
      case "stun": {
        this.stunT -= dt;
        group.rotation.z = Math.sin(this.stunT * 22) * 0.05;
        armL.rotation.x = -0.1;
        armR.rotation.x = -0.1;
        if (this.stunT <= 0) {
          group.rotation.z = 0;
          this.mode = "idle";
          this.atkCd = 0.8;
        }
        break;
      }
    }

    // collisions avec le décor (nef)
    if (this.mode !== "charge") {
      this.pos.x = clamp(this.pos.x, -4.6, 4.6);
      this.pos.z = clamp(this.pos.z, -12.0, 12.4);
    }
    // le boss ne sort pas de la chapelle : il attend le joueur près de la porte
    if (this.pos.z > 11.6) this.pos.z = 11.6;
    this.pos.y = (Math.abs(this.pos.z) < 12 && Math.abs(this.pos.x) < 4.6) ? 0.35 : 0;
    group.position.y = this.pos.y;

    // lueur des yeux en phase 2 et 3
    if (p2) {
      eyeMat.color.setHex(p3 ? (v === 3 ? 0xff1404 : 0xff2408) : V.eye);
      halo.rotation.z = Math.sin(t * (p3 ? 2.4 : 0.7)) * 0.3;
      staffFlame.scale.setScalar(p3 ? 0.7 : 0.5);
    }
  };

  /** Choisit une attaque en fonction de la distance et de la phase. */
  state.pickAttack = function (dist) {
    const r = Math.random();
    if (this.phase >= 2 && dist > 7.2 && r < 0.3) return "column";
    if (dist < 4.4) return r < 0.55 ? "slam" : "sweep";
    if (dist < 9) return r < 0.46 ? "wave" : "volley";
    if (dist < 15) return r < 0.45 ? "volley" : "wave";
    return r < 0.5 ? "charge" : "volley";
  };

  state.cancelAttack = function () {
    this.mode = "idle";
    resetPose();
  };

  /**
   * Outil de test : déclenche immédiatement une attaque nommée sans casser le cycle.
   * Noms acceptés : slam, wave, charge, column (alias beam), volley, sweep.
   */
  state.forceAttack = function (name) {
    const alias = { beam: "column", colonne: "column", lumiere: "column", light: "column" };
    const key = alias[name] || name;
    if (!this.alive || !BOSS_ATTACKS.includes(key)) return false;
    const ctx = this._ctx;
    const audio = (ctx && ctx.audio) || SILENT_AUDIO;
    const fx = (ctx && ctx.fx) || SILENT_FX;
    const player = (ctx && ctx.player) || {
      pos: this.pos, hurt() {}, state: { hp: 100 },
    };
    resetPose();
    this.mode = "idle";
    if (key === "slam") this.startSlam(audio, fx);
    else if (key === "wave") this.startWave(audio, fx);
    else if (key === "charge") this.startCharge(audio, fx, player);
    else if (key === "column") this.startBeam(audio, fx, player);
    else if (key === "volley") this.startVolley(audio, fx, player);
    else if (key === "sweep") this.startSweep(audio, fx, player);
    this.lastAttack = key;
    return true;
  };

  state.startSlam = function (audio, fx) {
    this.mode = "slam";
    this.slamT = 0;
    this.struck = false;
    this.lastAttack = "slam";
    audio.growl(0, 3, true);
  };
  state.startWave = function (audio, fx) {
    this.mode = "wave";
    this.waveT = 0;
    this.waveRadius = 0;
    this.waveHit = false;
    this.lastAttack = "wave";
    audio.growl(0, 4, true);
  };
  state.startCharge = function (audio, fx, player) {
    this.mode = "charge";
    this.chargeT = 0;
    this.chargeHit = false;
    const dx = player.pos.x - this.pos.x;
    const dz = player.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz) || 1;
    this.chargeDir.set(dx / d, 0, dz / d);
    this.lastAttack = "charge";
    audio.bossRoar();
  };

  state.startBeam = function (audio, fx, player) {
    this.mode = "beam";
    this.beamT = 0;
    this.beamHit = false;
    this.beamTarget.set(player.pos.x, 0, player.pos.z);
    this.lastAttack = "column";
    audio.bossRoar();
  };
  // alias liturgique de la colonne de lumière
  state.startColumn = state.startBeam;

  state.startVolley = function (audio, fx, player) {
    this.mode = "volley";
    this.volleyT = 0;
    this.volleyFired = false;
    this.volleySound = false;
    this.lastAttack = "volley";
    const yaw = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    group.rotation.y = yaw;
    audio.bell(1);
  };

  state.startSweep = function (audio, fx, player) {
    this.mode = "sweep";
    this.sweepT = 0;
    this.sweepHit = false;
    this.sweepSound = false;
    this.lastAttack = "sweep";
    const yaw = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    group.rotation.y = yaw;
    audio.growl(0, 2, true);
  };

  return state;
}
