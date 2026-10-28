// graveyard.js — la lande, le cimetière, la clôture, les arbres morts.
// Tout est procédural ; les collisions sont des cylindres ou des caisses.

import * as THREE from "three";
import { T, rep, relief } from "./textures.js";
import { merge, box, cyl, plane } from "./geo.js";
import { makeRng, randRange, rad } from "../core/util.js";
import { windify, windUniform } from "../fx/wind.js";

/* ─────────────────────────── arbres morts ─────────────────────────── */

function deadTree(seed, height = 10) {
  const rng = makeRng(seed);
  const parts = [];
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();

  function branch(origin, dir, len, radius, depth) {
    const g = new THREE.CylinderGeometry(radius * 0.62, radius, len, 5, 1, true);
    q.setFromUnitVectors(up, dir.clone().normalize());
    g.applyQuaternion(q);
    g.translate(origin.x + dir.x * len / 2, origin.y + dir.y * len / 2, origin.z + dir.z * len / 2);
    parts.push(g);
    if (depth <= 0) return;
    const end = new THREE.Vector3(
      origin.x + dir.x * len,
      origin.y + dir.y * len,
      origin.z + dir.z * len
    );
    const n = depth >= 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2;
      const tilt = 0.4 + rng() * 0.55;
      const nd = new THREE.Vector3(
        dir.x + Math.cos(a) * tilt,
        dir.y + 0.25 + rng() * 0.4,
        dir.z + Math.sin(a) * tilt
      ).normalize();
      branch(end, nd, len * (0.62 + rng() * 0.16), radius * 0.62, depth - 1);
    }
  }

  branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3((rng() - .5) * .12, 1, (rng() - .5) * .12), height * 0.52, 0.22, 3);
  return merge(parts);
}

/* ─────────────────────────── pierres tombales ─────────────────────────── */

function steleGeometry() {
  const s = new THREE.Shape();
  const w = 0.72, h = 1.15, r = w / 2;
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, h - r);
  s.absarc(0, h - r, r, 0, Math.PI, false);
  s.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: false, curveSegments: 10 });
  g.translate(0, 0, -0.08);
  // UV en mètres → texture à l'échelle de la pierre
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.7, uv.getY(i) * 0.7);
  return g;
}

function crossGeometry() {
  const parts = [];
  parts.push(box(0.62, 0.22, 0.4, 0, 0.11, 0));
  parts.push(box(0.2, 1.15, 0.17, 0, 0.68, 0));
  parts.push(box(0.7, 0.18, 0.15, 0, 0.95, 0));
  return merge(parts);
}

function slabGeometry() {
  const g = new THREE.BoxGeometry(0.62, 0.22, 1.3);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.6, uv.getY(i) * 0.6);
  return g;
}

/* ─────────────────────────── paysage ─────────────────────────── */

export function buildLandscape(scene) {
  const group = new THREE.Group();
  group.name = "lande";
  scene.add(group);
  const rng = makeRng(90210);
  const colliders = [];

  const groundMat = relief(new THREE.MeshStandardMaterial({
    map: rep(T.mossGround(), 26, 26),
    color: 0xe8eee2,
    roughness: 0.98,
  }), { n: T.nMoss(), rx: 26, ry: 26, scale: 0.85 });
  const ground = plane(170, 170, groundMat, 0, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  const gravelMat = relief(new THREE.MeshStandardMaterial({
    map: rep(T.gravel(), 3.2, 22),
    color: 0xffffff,
    roughness: 0.97,
  }), { n: T.nGravel(), r: T.rGravel(), rx: 3.2, ry: 22, scale: 1.1 });
  const path = plane(4.4, 34, gravelMat, 0, 0.015, 29.5);
  group.add(path);

  const apron = new THREE.Mesh(new THREE.CircleGeometry(8.4, 34), relief(new THREE.MeshStandardMaterial({
    map: rep(T.gravel(), 7, 7), color: 0xffffff, roughness: 0.97,
  }), { n: T.nGravel(), r: T.rGravel(), rx: 7, ry: 7, scale: 1.1 }));
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, 0.012, 15.5);
  apron.receiveShadow = true;
  group.add(apron);

  // allée latérale vers le cimetière ouest
  const sidePath = plane(3.0, 18, new THREE.MeshStandardMaterial({
    map: rep(T.gravel(), 2, 12), color: 0xf0ece0, roughness: 0.97,
  }), -13, 0.013, 17, rad(24));
  group.add(sidePath);

  // socle de pierre de la chapelle
  const plinthMat = new THREE.MeshStandardMaterial({
    map: rep(T.stone(), 0.5, 0.5), color: 0xd8dcd0, roughness: 0.95,
  });
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(12.5, 0.3, 25.2), plinthMat);
  plinth.position.set(0, 0.15, -0.4);
  plinth.receiveShadow = true;
  plinth.castShadow = true;
  group.add(plinth);

  // marches du portail (le sol extérieur monte doucement)
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(5.6 + i * 0.5, 0.1, 0.6), plinthMat);
    s.position.set(0, 0.05 + i * 0.1, 12.7 + i * 0.55);
    s.receiveShadow = true;
    group.add(s);
  }

  /* ── herbes hautes instanciées ── */
  const bladeGeo = merge([
    new THREE.PlaneGeometry(0.75, 0.75).translate(0, 0.375, 0),
    new THREE.PlaneGeometry(0.75, 0.75).rotateY(Math.PI / 2).translate(0, 0.375, 0),
  ]);
  const grassMat = new THREE.MeshStandardMaterial({
    map: T.grass(),
    alphaTest: 0.42,
    side: THREE.DoubleSide,
    color: 0xd2e2c0,
    roughness: 0.95,
  });
  windify(grassMat, { amount: 0.09, freq: 1.5 });
  const grassCount = 1900;
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, grassCount);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const v = new THREE.Vector3();
  const sv = new THREE.Vector3();
  const col = new THREE.Color();
  let gi = 0;
  let guard = 0;
  while (gi < grassCount && guard++ < 20000) {
    const x = randRange(rng, -52, 52);
    const z = randRange(rng, -46, 54);
    // pas d'herbe sur l'allée, l'apron, ni dans la chapelle
    if (Math.abs(x) < 2.6 && z > 11) continue;
    if (Math.hypot(x, z - 15.5) < 8.2) continue;
    if (Math.abs(x) < 6.6 && z > -18 && z < 13) continue;
    const s = 0.55 + rng() * 0.95;
    v.set(x, 0, z);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI * 2);
    sv.set(s, s * (0.8 + rng() * 0.7), s);
    m4.compose(v, q, sv);
    grass.setMatrixAt(gi, m4);
    col.setHSL(0.22 + rng() * 0.06, 0.14 + rng() * 0.12, 0.3 + rng() * 0.2);
    grass.setColorAt(gi, col);
    gi++;
  }
  grass.count = gi;
  grass.receiveShadow = true;
  group.add(grass);

  /* ── pierres tombales ── */
  const headMat = new THREE.MeshStandardMaterial({
    map: rep(T.stone(), 0.8, 0.8), color: 0xe0e4d6, roughness: 0.97,
  });
  const steleGeo = steleGeometry();
  const crossGeo = crossGeometry();
  const slabGeo = slabGeometry();

  const graveSpots = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 6; col++) {
      for (const s of [1, -1]) {
        if (rng() < 0.18) continue;
        const x = s * (11.5 + col * 2.5 + randRange(rng, -0.5, 0.5));
        const z = -19 + row * 6.2 + randRange(rng, -1.1, 1.1);
        graveSpots.push({ x, z, kind: rng() < 0.62 ? 0 : rng() < 0.55 ? 1 : 2, rot: randRange(rng, -0.4, 0.4) });
      }
    }
  }

  const counts = [0, 0, 0];
  for (const g of graveSpots) counts[g.kind]++;
  const stele = new THREE.InstancedMesh(steleGeo, headMat, counts[0]);
  const cross = new THREE.InstancedMesh(crossGeo, headMat, counts[1]);
  const slab = new THREE.InstancedMesh(slabGeo, headMat, counts[2]);
  const idx = [0, 0, 0];
  const graveRecords = [];
  const graveLookup = new Map();   // InstancedMesh → Map(instanceId → tombe)
  for (const g of graveSpots) {
    const target = g.kind === 0 ? stele : g.kind === 1 ? cross : slab;
    const i = idx[g.kind]++;
    const tiltX = randRange(rng, -0.13, 0.13);
    const tiltZ = randRange(rng, -0.16, 0.16);
    q.setFromEuler(new THREE.Euler(tiltX, g.rot, tiltZ));
    const s = 0.85 + rng() * 0.5;
    sv.set(s, s, s);
    v.set(g.x, 0.02, g.z);
    m4.compose(v, q, sv);
    target.setMatrixAt(i, m4);
    col.setHSL(0.2, 0.03 + rng() * 0.05, 0.42 + rng() * 0.22);
    target.setColorAt(i, col);
    const rec = {
      mesh: target, instanceId: i, x: g.x, z: g.z, kind: g.kind,
      alive: true, hp: 60, maxHp: 60,
    };
    graveRecords.push(rec);
    if (!graveLookup.has(target)) graveLookup.set(target, new Map());
    graveLookup.get(target).set(i, rec);
  }
  for (const m of [stele, cross, slab]) {
    m.castShadow = true;
    m.receiveShadow = true;
    m.userData.grave = true;
    group.add(m);
  }
  const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

  /** Tombe correspondant à un impact d'InstancedMesh (ou null). */
  function graveAt(mesh, instanceId) {
    const m = graveLookup.get(mesh);
    return m ? (m.get(instanceId) || null) : null;
  }

  /** Encaisse un tir / un coup ; renvoie { broken, hp } et masque la tombe. */
  function hitGrave(rec, dmg) {
    if (!rec || !rec.alive) return { broken: false, hp: 0 };
    rec.hp -= Math.max(1, dmg || 1);
    if (rec.hp > 0) return { broken: false, hp: rec.hp };
    rec.alive = false;
    rec.mesh.setMatrixAt(rec.instanceId, hiddenMatrix);
    rec.mesh.instanceMatrix.needsUpdate = true;
    return { broken: true, hp: 0, x: rec.x, z: rec.z, kind: rec.kind };
  }

  // buttes de terre
  const moundMat = new THREE.MeshStandardMaterial({ color: 0x30382a, roughness: 1 });
  for (let i = 0; i < 26; i++) {
    const s = 0.35 + rng() * 0.7;
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 5), moundMat);
    m.scale.set(s * 1.4, s * 0.22, s * 2.2);
    const g = graveSpots[Math.floor(rng() * graveSpots.length)];
    m.position.set(g.x + randRange(rng, -0.4, 0.4), 0.02, g.z + randRange(rng, 0.9, 1.6));
    m.receiveShadow = true;
    group.add(m);
  }

  /* ── arbres ── */
  const barkMat = new THREE.MeshStandardMaterial({
    map: rep(T.bark(), 1.4, 2.2), color: 0xe0d8c8, roughness: 0.96,
  });
  const trees = [
    { x: -13.5, z: 6.5, s: 1.0, seed: 5 },
    { x: 17.5, z: -6.0, s: 1.25, seed: 9 },
    { x: -24.0, z: -14.0, s: 0.9, seed: 13 },
    { x: 26.0, z: 12.0, s: 1.1, seed: 17 },
    { x: 8.0, z: 30.0, s: 0.8, seed: 23 },
  ];
  for (const t of trees) {
    const m = new THREE.Mesh(deadTree(t.seed, 9.5), barkMat);
    m.position.set(t.x, 0, t.z);
    m.scale.setScalar(t.s);
    m.rotation.y = rng() * Math.PI * 2;
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    colliders.push({ x: t.x, z: t.z, r: 0.55 });
  }

  // cyprès funéraires (silhouettes verticales)
  const cyParts = [cyl(0.12, 0.22, 1.2, 6, 0, 0.6, 0)];
  for (let i = 0; i < 7; i++) {
    const t = i / 7;
    const r = 1.35 * (1 - t * 0.72) * (0.9 + rng() * 0.2);
    const h = 2.6 * (1 - t * 0.45);
    cyParts.push(new THREE.ConeGeometry(r, h, 7, 1).translate((rng() - 0.5) * 0.22, 1.1 + t * 7.2, (rng() - 0.5) * 0.22));
  }
  const cyGeo = merge(cyParts);
  const cyMat = new THREE.MeshStandardMaterial({ color: 0x44594a, roughness: 0.95 });
  for (const [x, z, s] of [[-19, -24, 1.1], [-21.5, -22.5, 0.85], [20, -24, 1.0], [23, 2, 0.8], [-27, 22, 1.15]]) {
    const m = new THREE.Mesh(cyGeo, cyMat);
    m.position.set(x, 0, z);
    m.scale.setScalar(s);
    m.rotation.y = rng() * 3;
    m.castShadow = true;
    group.add(m);
    colliders.push({ x, z, r: 0.8 });
  }

  /* ── clôture de l'allée + portail ── */
  const fenceParts = [];
  const barParts = [];
  for (const s of [1, -1]) {
    for (let i = 0; i < 8; i++) {
      const z = 20.5 + i * 2.2;
      fenceParts.push(box(0.3, 1.25, 0.3, s * 7.4, 0.62, z));
      fenceParts.push(box(0.2, 0.1, 0.4, s * 7.4, 1.27, z));
      if (i < 7) {
        for (let k = 0; k < 6; k++) {
          barParts.push(cyl(0.018, 0.018, 0.82, 4, s * 7.4, 0.55, z + 0.25 + k * 0.32));
        }
        barParts.push(box(0.04, 0.04, 2.2, s * 7.4, 0.94, z + 1.1));
        barParts.push(box(0.04, 0.04, 2.2, s * 7.4, 0.3, z + 1.1));
      }
    }
  }
  const fenceStone = new THREE.Mesh(merge(fenceParts), headMat);
  fenceStone.castShadow = true;
  group.add(fenceStone);
  const fenceIron = new THREE.Mesh(merge(barParts), new THREE.MeshStandardMaterial({ color: 0x24261f, roughness: 0.6, metalness: 0.6 }));
  group.add(fenceIron);
  for (const s of [1, -1]) colliders.push({ x: s * 7.4, z: 28.2, hw: 0.22, hd: 8.4 });

  // piliers du portail, avec lanternes
  const gate = [];
  for (const s of [1, -1]) {
    gate.push(box(0.9, 2.4, 0.9, s * 5.4, 1.2, 38.5));
    gate.push(box(1.1, 0.18, 1.1, s * 5.4, 2.46, 38.5));
    gate.push(box(0.75, 0.15, 0.75, s * 5.4, 2.62, 38.5));
  }
  const gateMesh = new THREE.Mesh(merge(gate), headMat);
  gateMesh.castShadow = true;
  group.add(gateMesh);
  for (const s of [1, -1]) colliders.push({ x: s * 5.4, z: 38.5, r: 0.6 });

  /* ── ruine d'arc ── */
  const ruin = [];
  ruin.push(box(0.8, 3.6, 0.8, -16, 1.8, 25));
  ruin.push(box(0.8, 2.2, 0.8, -12.6, 1.1, 25));
  ruin.push(box(3.4, 0.7, 0.8, -14.3, 3.5, 25));
  const arc = new THREE.TorusGeometry(1.75, 0.4, 6, 18, Math.PI);
  arc.rotateY(Math.PI / 2);
  arc.translate(-14.3, 3.3, 25);
  ruin.push(arc);
  const ruinMesh = new THREE.Mesh(merge(ruin), headMat);
  ruinMesh.castShadow = true;
  ruinMesh.receiveShadow = true;
  group.add(ruinMesh);
  colliders.push({ x: -16, z: 25, r: 0.6 });
  colliders.push({ x: -12.6, z: 25, r: 0.6 });

  /* ── braseros ── */
  const braziers = [];
  const fireMat = new THREE.SpriteMaterial({
    map: T.halo(), color: 0xffb066, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  });
  for (const [x, z] of [[-3.9, 40], [3.9, 40], [-9.5, 14], [9.5, 14]]) {
    const legs = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      legs.push(cyl(0.035, 0.05, 1.0, 5, x + Math.cos(a) * 0.28, 0.5, z + Math.sin(a) * 0.28, Math.cos(a) * 0.18, 0, Math.sin(a) * -0.18));
    }
    legs.push(new THREE.CylinderGeometry(0.46, 0.24, 0.34, 10, 1, true).translate(x, 1.02, z));
    legs.push(new THREE.TorusGeometry(0.44, 0.035, 5, 14).rotateX(Math.PI / 2).translate(x, 1.18, z));
    const m = new THREE.Mesh(merge(legs), new THREE.MeshStandardMaterial({ color: 0x1e1f1b, roughness: 0.55, metalness: 0.7, side: THREE.DoubleSide }));
    m.castShadow = true;
    group.add(m);
    const flames = [];
    for (let k = 0; k < 4; k++) {
      const f = new THREE.Sprite(fireMat.clone());
      f.position.set(x + randRange(rng, -0.16, 0.16), 1.28 + rng() * 0.2, z + randRange(rng, -0.16, 0.16));
      f.scale.setScalar(0.8 + rng() * 0.6);
      group.add(f);
      flames.push({ sprite: f, base: f.scale.x, phase: rng() * 10 });
    }
    braziers.push({ x, z, flames });
    colliders.push({ x, z, r: 0.5 });
  }

  /* ── collines lointaines ── */
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x121b18, roughness: 1, fog: true });
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + rng() * 0.1;
    const r = 74 + rng() * 22;
    const h = 3 + rng() * 7;
    const hill = new THREE.Mesh(new THREE.ConeGeometry(24 + rng() * 26, h, 6, 1), hillMat);
    hill.position.set(Math.cos(a) * r, h * 0.5 - 2.2, Math.sin(a) * r);
    hill.rotation.y = rng() * 3;
    group.add(hill);
  }

  /* ── points d'apparition en périphérie ── */
  const spawnPoints = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    const r = 34 + (i % 3) * 4;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r - 2;
    if (z > 12 && Math.abs(x) < 8) continue; // pas sur l'allée d'arrivée
    spawnPoints.push({ x, z, angle: a });
  }

  // tertres de terre aux points d'apparition (indice visuel)
  const dirtMat = new THREE.MeshStandardMaterial({ map: rep(T.gravel(), 1, 1), color: 0x6b6252, roughness: 1 });
  for (const p of spawnPoints) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(1, 9, 5), dirtMat);
    m.scale.set(0.75, 0.14, 1.05);
    m.position.set(p.x, 0.02, p.z + 0.5);
    m.rotation.y = rng() * 3;
    m.receiveShadow = true;
    group.add(m);
  }

  const state = {
    group,
    colliders,
    spawnPoints,
    braziers,
    graveMeshes: [stele, cross, slab],
    graveRecords,
    graveAt,
    hitGrave,
    get gravesAlive() { return graveRecords.reduce((n, r) => n + (r.alive ? 1 : 0), 0); },
    _t: 0,
    update(dt) {
      this._t += dt;
      windUniform.value = this._t;
      for (const b of braziers) {
        for (const f of b.flames) {
          const n = 0.85 + Math.sin(this._t * 9.3 + f.phase) * 0.12 + Math.sin(this._t * 21 + f.phase) * 0.06;
          f.sprite.scale.setScalar(f.base * n);
          f.sprite.material.opacity = 0.55 + n * 0.4;
        }
      }
    },
  };
  return state;
}
