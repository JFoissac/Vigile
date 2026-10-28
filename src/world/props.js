// props.js — le petit mobilier du parvis et du cimetière.
//
// Constat de la revue visuelle du 23/10 : la lande se lit comme un terrain vide
// semé de quelques tombes. Un décor de nuit tient par ses couches (premier plan
// brisé, silhouettes latérales, sources chaudes) et par les traces d'usage :
// bancs, colonnes tombées, charrette, poteaux de lanterne, cairns, buissons.
// Tout est procédural, fusionné par matériau (1 appel par objet) et sans
// lumière supplémentaire — seules des émissions et des halos sprites.

import * as THREE from "three";
import { T, rep, relief } from "./textures.js";
import { merge, box, cyl } from "./geo.js";
import { makeRng, randRange, rad } from "../core/util.js";
import { windify } from "../fx/wind.js";

function materials() {
  const stone = relief(new THREE.MeshStandardMaterial({
    map: rep(T.stone(), 0.7, 0.7), color: 0x9fa596, roughness: 0.95,
  }), { n: T.nStone(), r: T.rStone(), rx: 0.7, ry: 0.7, scale: 1.2 });
  const stoneDark = relief(new THREE.MeshStandardMaterial({
    map: rep(T.stoneDark(), 0.6, 0.6), color: 0x84897e, roughness: 0.97,
  }), { n: T.nStoneDark(), r: T.rStone(), rx: 0.6, ry: 0.6, scale: 1.25 });
  const wood = relief(new THREE.MeshStandardMaterial({
    map: rep(T.woodDark(), 1.4, 1.4), color: 0x9a8b74, roughness: 0.92,
  }), { n: T.nWoodDark(), r: T.rWood(), rx: 1.4, ry: 1.4, scale: 1.1 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x232520, roughness: 0.62, metalness: 0.55 });
  const moss = new THREE.MeshStandardMaterial({ color: 0x39472f, roughness: 1 });
  const ember = new THREE.MeshStandardMaterial({
    color: 0x2a2118, emissive: 0xffa14a, emissiveIntensity: 1.5, roughness: 0.6,
  });
  const glassDim = new THREE.MeshStandardMaterial({
    color: 0x1b1712, emissive: 0xffbe74, emissiveIntensity: 0.9, roughness: 0.35,
  });
  return { stone, stoneDark, wood, iron, moss, ember, glassDim };
}

/** Banc de pierre : deux dés + dalle, mousse sur l'arête. */
function benchGeo() {
  return merge([
    box(0.34, 0.42, 0.5, -0.72, 0.21, 0),
    box(0.34, 0.42, 0.5, 0.72, 0.21, 0),
    box(1.95, 0.16, 0.56, 0, 0.5, 0),
    box(1.9, 0.05, 0.1, 0, 0.58, -0.2, 0, -0.06),
  ]);
}

/** Colonne brisée : trois tambours + chapiteau couché. */
function columnGeo(h = 1.9, lean = 0.05) {
  const parts = [];
  const drums = 3;
  for (let i = 0; i < drums; i++) {
    const r = 0.3 - i * 0.02;
    parts.push(cyl(r, r + 0.015, h / drums, 10, 0, h / drums * (i + 0.5), 0, 0, 0, rad(lean * (i + 1))));
  }
  parts.push(cyl(0.36, 0.3, 0.16, 10, 0.34, 0.08, 0.1, Math.PI / 2.3, 0.4, 0));
  return merge(parts);
}

/** Arche de ruine : deux piédroits et trois voussoirs survivants. */
function ruinArchGeo() {
  const parts = [
    box(0.5, 2.1, 0.6, -1.05, 1.05, 0),
    box(0.5, 1.15, 0.6, 1.05, 0.58, 0),
    box(0.62, 0.18, 0.66, -1.05, 2.16, 0),
  ];
  // voussoirs : coins de l'arc qui tient encore au piédroit gauche
  for (let i = 0; i < 4; i++) {
    const a = Math.PI * (0.06 + i * 0.12);
    const r = 1.05;
    parts.push(box(0.42, 0.3, 0.55, -Math.cos(a) * r, 2.14 + Math.sin(a) * r, 0, 0, 0, a - Math.PI / 2));
  }
  return merge(parts);
}

/** Charrette : plateau, ridelles, deux roues à rayons. */
function cartGeo() {
  const parts = [
    box(2.2, 0.16, 1.15, 0, 0.62, 0),
    box(2.1, 0.42, 0.08, 0, 0.9, 0.55),
    box(2.1, 0.42, 0.08, 0, 0.9, -0.55),
    box(0.08, 0.42, 1.1, -1.02, 0.9, 0),
    box(0.1, 0.12, 1.9, 0.2, 0.44, 0),
    cyl(0.05, 0.05, 2.2, 6, -1.9, 0.34, 0.4, 0, 0, 0.16),
    cyl(0.05, 0.05, 2.2, 6, -1.9, 0.34, -0.4, 0, 0, 0.16),
  ];
  for (const z of [0.62, -0.62]) {
    parts.push(cyl(0.62, 0.62, 0.1, 12, -0.25, 0.62, z, Math.PI / 2, 0, 0));
    parts.push(cyl(0.16, 0.16, 0.14, 8, -0.25, 0.62, z, Math.PI / 2, 0, 0));
    for (let i = 0; i < 6; i++) {
      parts.push(box(1.08, 0.06, 0.06, -0.25, 0.62, z, 0, 0, (i / 6) * Math.PI));
    }
  }
  return merge(parts);
}

/** Cairn : pierres empilées, irrégulières. */
function cairnGeo(rng) {
  const parts = [];
  let y = 0;
  const n = 4 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const w = 0.5 - i * 0.07;
    parts.push(box(w * (0.8 + rng() * 0.5), 0.14 + rng() * 0.08, w, randRange(rng, -0.06, 0.06), y, randRange(rng, -0.06, 0.06), rng() * 1.5, rng() * 0.2, rng() * 0.2));
    y += 0.16 + rng() * 0.05;
  }
  return merge(parts);
}

/** Croix de bois du cimetière, penchée. */
function woodenCrossGeo(rng) {
  const h = 1.0 + rng() * 0.5;
  const arm = 0.24 + rng() * 0.1;
  return merge([
    box(0.11, h, 0.11, 0, h / 2, 0, 0, randRange(rng, -0.12, 0.12), randRange(rng, -0.1, 0.1)),
    box(arm * 2, 0.09, 0.07, 0, h * 0.74, 0, 0, 0, randRange(rng, -0.12, 0.12)),
  ]);
}

/**
 * Construit le mobilier du parvis.
 * @returns {{ group: THREE.Group, colliders: Array<{x:number,z:number,r:number}> }}
 */
export function buildProps(scene) {
  const group = new THREE.Group();
  group.name = "parvis";
  scene.add(group);
  const rng = makeRng(77123);
  const M = materials();
  const colliders = [];
  const glows = [];

  const add = (geo, mat, x, z, rotY = 0, scale = 1, { collide = 0 } = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, 0, z);
    m.rotation.y = rotY;
    if (scale !== 1) m.scale.setScalar(scale);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    if (collide) colliders.push({ x, z, r: collide });
    return m;
  };

  /* ── parvis : deux bancs de pierre encadrant l'allée ── */
  const bench = benchGeo();
  add(bench, M.stone, -4.4, 20.6, rad(6));
  add(bench, M.stone, 4.5, 20.2, rad(-8));
  colliders.push({ x: -4.4, z: 20.6, r: 1.1 }, { x: 4.5, z: 20.2, r: 1.1 });

  /* ── ruine au nord-ouest : arche + colonnes tombées ── */
  add(ruinArchGeo(), M.stoneDark, -9.6, 4.2, rad(28));
  colliders.push({ x: -9.6, z: 4.2, r: 1.5 });
  add(columnGeo(2.3, 0.06), M.stone, -8.2, 8.6, 0);
  add(columnGeo(1.4, 0.1), M.stoneDark, -11.4, 6.6, rad(40), 1);
  add(columnGeo(2.6, 0.03), M.stone, 9.4, 7.4, 0, 1);
  colliders.push({ x: -8.2, z: 8.6, r: 0.45 }, { x: 9.4, z: 7.4, r: 0.5 });

  /* ── charrette et tonneaux à l'est de l'allée ── */
  add(cartGeo(), M.wood, 7.2, 25.6, rad(-24));
  colliders.push({ x: 7.2, z: 25.6, r: 1.6 });
  const barrel = merge([
    cyl(0.42, 0.36, 0.95, 12, 0, 0.48, 0),
    cyl(0.45, 0.45, 0.07, 12, 0, 0.28, 0),
    cyl(0.45, 0.45, 0.07, 12, 0, 0.7, 0),
  ]);
  for (const [bx, bz, br] of [[9.3, 27.4, 0.6], [8.6, 28.5, 1.9], [10.1, 25.2, 3.1]]) {
    add(barrel, M.wood, bx, bz, br, 0.95 + rng() * 0.15);
    colliders.push({ x: bx, z: bz, r: 0.5 });
  }

  /* ── poteaux de lanterne le long de l'allée (halo, pas de lumière) ── */
  const postGeo = merge([
    box(0.12, 2.35, 0.12, 0, 1.18, 0),
    box(0.5, 0.06, 0.06, 0.22, 2.28, 0),
    box(0.34, 0.42, 0.34, 0.36, 2.0, 0),
    cyl(0.05, 0.09, 0.16, 6, 0, 2.36, 0),
  ]);
  for (const [x, z] of [[-2.9, 16.4], [2.9, 16.4], [-2.9, 27.8], [2.9, 27.8]]) {
    add(postGeo, M.iron, x, z, x > 0 ? -Math.PI / 2 : Math.PI / 2);
    colliders.push({ x, z, r: 0.22 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.26, 0.2), M.glassDim);
    lamp.position.set(x + (x > 0 ? -0.36 : 0.36), 2.0, z);
    group.add(lamp);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({
      map: T.halo(), color: 0xffb066, transparent: true, opacity: 0.38,
      depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    }));
    halo.position.copy(lamp.position);
    halo.scale.setScalar(2.6);
    group.add(halo);
    glows.push(halo);
  }

  /* ── cairns et croix de bois dans le cimetière ── */
  const cairnSpots = [[-14.2, 18.5], [15.6, 16.8], [-16.8, -3.2], [18.2, 6.4], [-12.4, -14.6], [12.8, -17.2]];
  for (const [x, z] of cairnSpots) {
    add(cairnGeo(rng), M.stoneDark, x, z, rng() * 6, 0.9 + rng() * 0.5, { collide: 0.45 });
  }
  const crossGeoA = woodenCrossGeo(rng);
  for (let i = 0; i < 14; i++) {
    const s = i % 2 ? 1 : -1;
    const x = s * randRange(rng, 13.5, 25);
    const z = randRange(rng, -20, 30);
    if (Math.abs(z - 15.5) < 4 && Math.abs(x) < 10) continue;
    add(crossGeoA, M.wood, x, z, rng() * 6, 0.85 + rng() * 0.45);
  }

  /* ── buissons morts, instanciés ── */
  const bushParts = [];
  for (let i = 0; i < 5; i++) {
    const r = 0.3 + rng() * 0.35;
    bushParts.push(new THREE.IcosahedronGeometry(r, 0).translate(randRange(rng, -0.3, 0.3), r * 0.75, randRange(rng, -0.3, 0.3)));
  }
  const bushGeo = merge(bushParts);
  const bushMat = windify(new THREE.MeshStandardMaterial({ color: 0x2a3325, roughness: 1, flatShading: true }), { amount: 0.05, freq: 1.1 });
  const bush = new THREE.InstancedMesh(bushGeo, bushMat, 70);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sv = new THREE.Vector3();
  const col = new THREE.Color();
  let bi = 0, guard = 0;
  while (bi < 70 && guard++ < 900) {
    const x = randRange(rng, -46, 46);
    const z = randRange(rng, -34, 46);
    if (Math.abs(x) < 7 && z > 8 && z < 36) continue;         // allée et parvis dégagés
    if (Math.abs(x) < 7 && z > -14 && z < 12) continue;       // chapelle
    v.set(x, 0, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * 6.28);
    const s = 0.6 + rng() * 0.9;
    sv.set(s, s * (0.7 + rng() * 0.5), s);
    m4.compose(v, q, sv);
    bush.setMatrixAt(bi, m4);
    col.setHSL(0.28, 0.08 + rng() * 0.06, 0.16 + rng() * 0.1);
    bush.setColorAt(bi, col);
    bi++;
  }
  bush.count = bi;
  bush.castShadow = false;
  bush.receiveShadow = true;
  group.add(bush);

  /* ── flaques : eau noire qui renvoie la lune (rugosité basse) ── */
  const puddleMat = new THREE.MeshStandardMaterial({
    color: 0x0b1418, roughness: 0.12, metalness: 0.05,
    normalMap: rep(T.nMoss(), 2, 2), normalScale: new THREE.Vector2(0.35, 0.35),
    transparent: true, opacity: 0.92,
  });
  for (const [x, z, r] of [[-3.4, 18.2, 1.5], [4.8, 22.8, 1.1], [-6.2, 27.4, 1.9], [1.6, 12.4, 1.2]]) {
    const p = new THREE.Mesh(new THREE.CircleGeometry(r, 18), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.02, z);
    p.receiveShadow = true;
    group.add(p);
  }

  return { group, colliders, glows };
}
