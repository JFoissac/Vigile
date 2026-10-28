// chapel.js — la chapelle romane Saint-Ours, entièrement procédurale.
// Nef, bas-côtés aveugles, arcatures, vitraux, rosace, abside en cul-de-four,
// portail à voussures, clocher-arcade, cierges et stalles.

import * as THREE from "three";
import { T, rep, relief } from "./textures.js";
import { merge, box, cyl, rectShape, archHole, circleHole, wall, plane } from "./geo.js";
import { makeRng, rad, randRange, clamp } from "../core/util.js";

export const NAVE = { w: 11, l: 24, h: 8.6, t: 0.85, floor: 0.35, ridge: 13.0, apseR: 5.5 };
export const DOOR = { x: 0, z: 12, w: 3.4, top: 4.7 };

/** Plan d'un vitrail en plein cintre, UV remappées pour la texture du lancet. */
function lancetPlane(w, hSpring) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0);
  s.lineTo(-w / 2, hSpring);
  s.absarc(0, hSpring, w / 2, Math.PI, 0, true);
  s.lineTo(w / 2, 0);
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 18);
  const p = g.attributes.position;
  const uv = g.attributes.uv;
  const height = hSpring + w / 2;
  for (let i = 0; i < p.count; i++) {
    uv.setXY(i, (p.getX(i) + w / 2) / w, p.getY(i) / height);
  }
  uv.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

function halfDisc(r, segments = 24) {
  const s = new THREE.Shape();
  s.moveTo(-r, 0);
  s.absarc(0, 0, r, Math.PI, 0, true);
  s.lineTo(r, 0);
  return new THREE.ShapeGeometry(s, segments);
}

function glassMaterial(tex, emissive = 0xffffff, intensity = 2.1) {
  return new THREE.MeshStandardMaterial({
    map: tex,
    emissiveMap: tex,
    emissive,
    emissiveIntensity: intensity,
    roughness: 0.42,
    metalness: 0.0,
    side: THREE.DoubleSide,
    transparent: false,
  });
}

export function buildChapel(scene) {
  const group = new THREE.Group();
  group.name = "chapelle";
  scene.add(group);
  const rng = makeRng(4242);

  const stone = relief(new THREE.MeshStandardMaterial({
    map: rep(T.stone(), 0.32, 0.32),
    color: 0xa9aea0,
    roughness: 0.95,
  }), { n: T.nStone(), r: T.rStone(), rx: 0.32, ry: 0.32, scale: 1.15 });
  const stoneDark = relief(new THREE.MeshStandardMaterial({
    map: rep(T.stoneDark(), 0.3, 0.3),
    color: 0x8d938a,
    roughness: 0.96,
  }), { n: T.nStoneDark(), r: T.rStone(), rx: 0.3, ry: 0.3, scale: 1.2 });
  const trim = relief(new THREE.MeshStandardMaterial({
    map: rep(T.stone(), 0.6, 0.6),
    color: 0xb4b8a8,
    roughness: 0.92,
  }), { n: T.nStone(), r: T.rStone(), rx: 0.6, ry: 0.6, scale: 1.35 });
  const carved = relief(new THREE.MeshStandardMaterial({
    map: T.carved(),
    color: 0xa8aca0,
    roughness: 0.95,
  }), { n: T.nStone(), rx: 1, ry: 1, scale: 1.5 });
  const wood = relief(new THREE.MeshStandardMaterial({ map: rep(T.wood(), 2, 1), color: 0xd8c6ae, roughness: 0.86 }),
    { n: T.nWood(), r: T.rWood(), rx: 2, ry: 1, scale: 0.9 });
  const woodDark = relief(new THREE.MeshStandardMaterial({ map: rep(T.woodDark(), 1.4, 2), color: 0xbfae96, roughness: 0.88 }),
    { n: T.nWoodDark(), r: T.rWood(), rx: 1.4, ry: 2, scale: 0.95 });
  const doorMat = relief(new THREE.MeshStandardMaterial({ map: rep(T.door(), 1, 1), color: 0xc8b49a, roughness: 0.9 }),
    { n: T.nWoodDark(), rx: 1, ry: 1, scale: 1.1 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2a2b28, roughness: 0.55, metalness: 0.72 });
  const gold = new THREE.MeshStandardMaterial({ color: 0xc9a45c, roughness: 0.34, metalness: 0.85, emissive: 0x3a2a10, emissiveIntensity: 0.6 });
  const clothMat = new THREE.MeshStandardMaterial({ color: 0xd9d2bd, roughness: 0.85 });
  const slateMat = new THREE.MeshStandardMaterial({ map: rep(T.slate(), 3.2, 9), color: 0x9aa2a8, roughness: 0.86 });

  const half = NAVE.w / 2;
  const zN = -NAVE.l / 2;   // -12 (abside)
  const zS = NAVE.l / 2;    // +12 (portail)
  const colliders = [];
  const windows = [];
  const glassMaterials = [];
  const flames = [];
  const candleLights = [];
  const glassLancet = glassMaterial(T.lancet(), 0xbfd8ff, 1.45);
  const glassLancet2 = glassMaterial(T.lancet2(), 0xd8e4ff, 1.35);
  const glassRose = glassMaterial(T.rose(), 0xcfe2ff, 1.25);
  glassRose.transparent = true;
  glassRose.alphaTest = 0.35;
  glassMaterials.push(glassLancet, glassLancet2, glassRose);

  /* ───────────────────────── murs de la nef ───────────────────────── */

  const sideShape = rectShape(NAVE.l, NAVE.h);
  const winZ = [-8, -1, 6];
  for (const z of winZ) sideShape.holes.push(archHole(z, 3.55, 1.5, 2.05));

  const east = wall(sideShape, NAVE.t, stone);
  east.rotation.y = -Math.PI / 2;
  east.position.set(half, 0, 0);
  group.add(east);

  const westShape = rectShape(NAVE.l, NAVE.h);
  for (const z of winZ) westShape.holes.push(archHole(-z, 3.55, 1.5, 2.05));
  const west = wall(westShape, NAVE.t, stone);
  west.rotation.y = Math.PI / 2;
  west.position.set(-half, 0, 0);
  group.add(west);

  colliders.push({ x: half, z: 0, hw: NAVE.t / 2 + 0.15, hd: NAVE.l / 2 + 0.2 });
  colliders.push({ x: -half, z: 0, hw: NAVE.t / 2 + 0.15, hd: NAVE.l / 2 + 0.2 });

  // vitraux des murs gouttereaux
  for (const [side, sign] of [["e", 1], ["w", -1]]) {
    for (const z of winZ) {
      const g = lancetPlane(1.44, 2.02);
      const m = new THREE.Mesh(g, sign > 0 ? glassLancet : glassLancet2);
      m.position.set(sign * (half - NAVE.t + 0.02), 3.58, z);
      m.rotation.y = sign > 0 ? -Math.PI / 2 : Math.PI / 2;
      m.receiveShadow = false;
      m.castShadow = false;
      group.add(m);
      windows.push({
        pos: new THREE.Vector3(sign * (half - NAVE.t - 0.05), 4.9, z),
        normal: new THREE.Vector3(-sign, 0, 0),
        w: 1.5,
        h: 3.5,
        color: z > 0 ? 0x9fc4ff : 0xb9c8ff,
        kind: "side",
      });
    }
  }

  /* ───────────────────────── façade sud ───────────────────────── */

  const facadeShape = new THREE.Shape();
  facadeShape.moveTo(-half, 0);
  facadeShape.lineTo(half, 0);
  facadeShape.lineTo(half, NAVE.h);
  facadeShape.lineTo(0, NAVE.ridge);
  facadeShape.lineTo(-half, NAVE.h);
  facadeShape.closePath();
  facadeShape.holes.push(archHole(0, 0, DOOR.w, 3.0));
  facadeShape.holes.push(circleHole(0, 10.15, 1.6));

  const facade = wall(facadeShape, NAVE.t, stone);
  facade.position.set(0, 0, zS);
  group.add(facade);

  // collision de façade, de part et d'autre du portail
  colliders.push({ x: (half + DOOR.w / 2) / 2, z: zS, hw: (half - DOOR.w / 2) / 2 + 0.1, hd: NAVE.t / 2 + 0.1 });
  colliders.push({ x: -(half + DOOR.w / 2) / 2, z: zS, hw: (half - DOOR.w / 2) / 2 + 0.1, hd: NAVE.t / 2 + 0.1 });

  // rosace
  const rose = new THREE.Mesh(new THREE.CircleGeometry(1.58, 40), glassRose);
  rose.position.set(0, 10.15, zS - 0.42);
  group.add(rose);
  const roseRing = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.13, 8, 40), trim);
  roseRing.position.set(0, 10.15, zS - 0.4);
  roseRing.castShadow = true;
  group.add(roseRing);
  const roseOuter = new THREE.Mesh(new THREE.TorusGeometry(1.9, 0.1, 6, 40), trim);
  roseOuter.position.set(0, 10.15, zS - 0.3);
  group.add(roseOuter);
  // meneaux de pierre devant le vitrail : donne du relief à la rosace
  const tracery = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    tracery.push(box(0.075, 1.62, 0.10, Math.sin(a) * 0.85, 10.15 + Math.cos(a) * 0.85, zS - 0.33, 0, 0, -a));
  }
  tracery.push(new THREE.TorusGeometry(0.62, 0.055, 5, 26).translate(0, 10.15, zS - 0.33));
  tracery.push(new THREE.TorusGeometry(1.28, 0.05, 5, 32).translate(0, 10.15, zS - 0.33));
  const traceryMesh = new THREE.Mesh(merge(tracery), trim);
  traceryMesh.castShadow = true;
  group.add(traceryMesh);
  windows.push({
    pos: new THREE.Vector3(0, 10.1, zS - 0.5),
    normal: new THREE.Vector3(0, 0, -1),
    w: 3.2, h: 3.2, color: 0xcfe2ff, kind: "rose",
  });

  // portail : voussures, colonnes, tympan
  const portal = [];
  for (const r of [2.0, 2.32, 2.64]) {
    const t = new THREE.TorusGeometry(r, 0.14, 8, 30, Math.PI);
    t.translate(0, 3.0, 0);
    t.rotateY(0);
    t.translate(0, 0, zS + 0.3);
    portal.push(t);
  }
  for (const x of [-1.86, 1.86, -2.18, 2.18]) {
    portal.push(cyl(0.13, 0.15, 3.0, 10, x, 1.5, zS + 0.34));
    portal.push(box(0.42, 0.2, 0.42, x, 3.03, zS + 0.34));
    portal.push(box(0.44, 0.14, 0.44, x, 0.07, zS + 0.34));
    // base moulurée
    portal.push(box(0.5, 0.09, 0.5, x, 4.16, zS + 0.34));
  }
  // linteau
  portal.push(box(3.9, 0.24, 0.55, 0, 3.05, zS + 0.3));
  const portalMesh = new THREE.Mesh(merge(portal), trim);
  portalMesh.castShadow = true;
  portalMesh.receiveShadow = true;
  group.add(portalMesh);

  const tympan = new THREE.Mesh(new THREE.CircleGeometry(1.68, 30, 0, Math.PI), carved);
  tympan.position.set(0, 3.02, zS + 0.33);
  group.add(tympan);
  const tympanFrame = new THREE.Mesh(new THREE.TorusGeometry(1.74, 0.1, 6, 30, Math.PI), trim);
  tympanFrame.position.set(0, 3.02, zS + 0.36);
  group.add(tympanFrame);

  /* ── façade : contreforts, corbelets, niches à statues ─────────────
     Une façade romane n'est pas un mur plat : sans ces saillies, la
     chapelle se lit comme une boîte et la lumière n'a rien à accrocher. */
  const face = [];
  for (const sx of [-1, 1]) {
    // contrefort : fût, larmier en pente, chaperon
    face.push(box(0.72, 7.6, 0.5, sx * 4.55, 3.8, zS + 0.42));
    face.push(box(0.86, 0.16, 0.62, sx * 4.55, 7.62, zS + 0.46));
    face.push(box(0.72, 0.9, 0.34, sx * 4.55, 8.1, zS + 0.36, 0, -0.28 * sx, 0));
    // glacis de base
    face.push(box(0.9, 0.34, 0.66, sx * 4.55, 0.17, zS + 0.44));
  }
  // corbelets sous la corniche du pignon
  for (let i = -6; i <= 6; i++) {
    const x = i * 0.82;
    if (Math.abs(x) > 4.9) continue;
    face.push(box(0.22, 0.3, 0.34, x, 8.42, zS + 0.32));
  }
  face.push(box(10.4, 0.14, 0.4, 0, 8.62, zS + 0.34));
  // niches à statues de part et d'autre de la rosace
  for (const sx of [-1, 1]) {
    face.push(box(0.9, 0.18, 0.3, sx * 3.25, 5.5, zS + 0.3));          // appui
    face.push(box(0.2, 1.5, 0.3, sx * 3.25 - 0.42, 6.35, zS + 0.3));   // montant
    face.push(box(0.2, 1.5, 0.3, sx * 3.25 + 0.42, 6.35, zS + 0.3));
    face.push(box(0.98, 0.22, 0.34, sx * 3.25, 7.14, zS + 0.32));      // linteau
    face.push(box(0.34, 0.26, 0.4, sx * 3.25, 7.32, zS + 0.34, 0, 0.5)); // dais
  }
  const faceMesh = new THREE.Mesh(merge(face), trim);
  faceMesh.castShadow = true;
  faceMesh.receiveShadow = true;
  group.add(faceMesh);

  // statues : silhouette simple mais lisible (tête, buste, plis de la robe)
  for (const sx of [-1, 1]) {
    const parts = [
      cyl(0.16, 0.2, 1.1, 8, 0, 0.55, 0),
      cyl(0.2, 0.26, 0.18, 8, 0, 1.15, 0),
      new THREE.SphereGeometry(0.13, 10, 8).translate(0, 1.3, 0),
      box(0.1, 0.62, 0.12, 0.16, 0.85, 0.04, 0, 0, -0.12),
    ];
    const st = new THREE.Mesh(merge(parts), carved);
    st.position.set(sx * 3.25, 5.62, zS + 0.34);
    st.scale.setScalar(0.92);
    st.castShadow = true;
    group.add(st);
  }

  // vantaux : un ouvert vers l'intérieur, un entrebâillé
  const leafGeo = new THREE.BoxGeometry(1.64, 4.5, 0.14);
  const leafL = new THREE.Group();
  const lm = new THREE.Mesh(leafGeo, doorMat);
  lm.position.x = 0.82;
  lm.castShadow = true;
  leafL.add(lm);
  const bands = [];
  for (const y of [0.7, 2.0, 3.3, 4.1]) bands.push(box(1.5, 0.1, 0.18, 0.82, y - 2.25, 0.02));
  bands.push(box(0.1, 4.3, 0.18, 1.5, 0, 0.02));
  const bm = new THREE.Mesh(merge(bands), iron);
  leafL.add(bm);
  leafL.position.set(-1.68, 2.25, zS - 0.2);
  leafL.rotation.y = -2.05;
  group.add(leafL);

  const leafR = new THREE.Group();
  const rm = new THREE.Mesh(leafGeo, doorMat);
  rm.position.x = -0.82;
  rm.castShadow = true;
  leafR.add(rm);
  const bands2 = [];
  for (const y of [0.7, 2.0, 3.3, 4.1]) bands2.push(box(1.5, 0.1, 0.18, -0.82, y - 2.25, 0.02));
  bands2.push(box(0.1, 4.3, 0.18, -1.5, 0, 0.02));
  leafR.add(new THREE.Mesh(merge(bands2), iron));
  leafR.position.set(1.68, 2.25, zS - 0.2);
  leafR.rotation.y = -0.55;
  group.add(leafR);

  /* ───────────────────────── abside ───────────────────────── */

  const apseGroup = new THREE.Group();
  apseGroup.position.set(0, 0, zN);
  group.add(apseGroup);
  const segs = 9;
  const apsePieces = [];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI;
    const a1 = ((i + 1) / segs) * Math.PI;
    const ac = (a0 + a1) / 2;
    const chord = 2 * NAVE.apseR * Math.sin((a1 - a0) / 2) + 0.06;
    const px = Math.cos(ac) * NAVE.apseR;
    const pz = -Math.sin(ac) * NAVE.apseR;
    const rot = Math.PI / 2 + ac;
    const isWindow = i === 1 || i === 4 || i === 7;
    if (!isWindow) {
      apsePieces.push(box(chord, NAVE.h, NAVE.t, px, NAVE.h / 2, pz, rot));
    } else {
      apsePieces.push(box(chord, 3.1, NAVE.t, px, 1.55, pz, rot));
      apsePieces.push(box(chord, NAVE.h - 6.1, NAVE.t, px, (NAVE.h + 6.1) / 2, pz, rot));
      // montants de part et d'autre de la baie
      const tx = -Math.sin(ac), tz = -Math.cos(ac);
      apsePieces.push(box(0.36, 3.0, NAVE.t, px + tx * (chord / 2 - 0.2), 4.6, pz + tz * (chord / 2 - 0.2), rot));
      apsePieces.push(box(0.36, 3.0, NAVE.t, px - tx * (chord / 2 - 0.2), 4.6, pz - tz * (chord / 2 - 0.2), rot));

      const gl = new THREE.Mesh(lancetPlane(1.0, 2.5), glassLancet);
      gl.position.set(px * 0.985, 3.1, pz * 0.985);
      gl.rotation.y = rot;
      apseGroup.add(gl);
      windows.push({
        pos: new THREE.Vector3(px * 0.96, 4.7, zN + pz * 0.96),
        normal: new THREE.Vector3(-px, 0, -pz).normalize(),
        w: 1.1, h: 3.0, color: 0xbcd2ff, kind: "apse",
      });
    }
  }
  const apseWallMesh = new THREE.Mesh(merge(apsePieces), stone);
  apseWallMesh.castShadow = true;
  apseWallMesh.receiveShadow = true;
  apseGroup.add(apseWallMesh);

  // Collision de l'abside : un disque PLEIN éjectait le joueur dehors (resolve
  // repousse tout point situé à l'intérieur). On déclare donc une paroi
  // « keepIn » : on reste à l'intérieur du rayon, et le mur du chevet bloque.
  // player.resolve et zombie.js traitent ce drapeau ; les autres systèmes
  // (loot, ligne de vue) l'ignorent comme obstacle.
  colliders.push({ x: 0, z: zN, r: NAVE.apseR - 0.15, half: true, keepIn: true });

  // cul-de-four
  const domeGeo = new THREE.SphereGeometry(NAVE.apseR + 0.4, 28, 12, 0, Math.PI, 0, Math.PI / 2);
  domeGeo.scale(1, 0.44, 1);
  const dome = new THREE.Mesh(domeGeo, slateMat);
  dome.rotation.y = Math.PI;
  dome.position.set(0, NAVE.h, zN);
  dome.castShadow = true;
  dome.receiveShadow = true;
  group.add(dome);

  // corniche d'abside
  const corb = new THREE.Mesh(new THREE.TorusGeometry(NAVE.apseR, 0.12, 6, 30, Math.PI), trim);
  corb.rotation.x = Math.PI / 2;
  corb.rotation.z = Math.PI;
  corb.position.set(0, NAVE.h + 0.05, zN);
  group.add(corb);

  /* ───────────────────────── toiture ───────────────────────── */

  const slope = Math.atan2(4.45, 5.95);
  const slopeLen = Math.hypot(4.45, 5.95) + 0.3;
  for (const s of [1, -1]) {
    const roof = new THREE.Mesh(new THREE.BoxGeometry(slopeLen, 0.24, NAVE.l + 1.0), slateMat);
    roof.rotation.z = -s * slope;
    roof.position.set(s * 2.93, NAVE.ridge - 2.2, 0);
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
    // rive / planche de rive
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, NAVE.l + 1.0), woodDark);
    fascia.position.set(s * 5.92, NAVE.h - 0.05, 0);
    group.add(fascia);
  }
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, NAVE.l + 1.06), trim);
  ridge.position.set(0, NAVE.ridge + 0.05, 0);
  ridge.castShadow = true;
  group.add(ridge);

  // pignon de façade en pierre au-dessus de la rosace (déjà dans le mur) : croix faîtière
  const cross = new THREE.Group();
  const c1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.6, 0.16), trim);
  const c2 = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 0.16), trim);
  c2.position.y = 0.32;
  cross.add(c1, c2);
  cross.position.set(0, NAVE.ridge + 0.85, zS - 0.4);
  group.add(cross);

  // clocher-arcade sur le faîte
  const bellCote = [];
  bellCote.push(box(0.5, 2.8, 0.6, -0.85, NAVE.ridge + 1.3, 11.35));
  bellCote.push(box(0.5, 2.8, 0.6, 0.85, NAVE.ridge + 1.3, 11.35));
  bellCote.push(box(2.3, 0.3, 0.7, 0, NAVE.ridge + 2.75, 11.35));
  bellCote.push(box(2.6, 0.16, 0.9, 0, NAVE.ridge + 2.95, 11.35));
  const bcMesh = new THREE.Mesh(merge(bellCote), trim);
  bcMesh.castShadow = true;
  group.add(bcMesh);
  const barch = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.16, 6, 22, Math.PI), trim);
  barch.position.set(0, NAVE.ridge + 2.6, 11.35);
  barch.castShadow = true;
  group.add(barch);
  const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.46, 0.62, 12, 1, true), gold);
  bell.material = new THREE.MeshStandardMaterial({ color: 0x6e5a34, roughness: 0.5, metalness: 0.8, side: THREE.DoubleSide });
  bell.position.set(0, NAVE.ridge + 1.9, 11.35);
  group.add(bell);
  const bellCross = cross.clone();
  bellCross.position.set(0, NAVE.ridge + 3.35, 11.35);
  bellCross.scale.setScalar(0.8);
  group.add(bellCross);

  /* ───────────────────────── contreforts & corbeaux ───────────────────────── */

  const buttress = [];
  for (const s of [1, -1]) {
    for (const z of [-9.6, -4.8, 0, 4.8, 9.6]) {
      const x = s * (half + 0.35);
      buttress.push(box(0.9, 0.7, 1.35, x, 0.35, z));
      buttress.push(box(0.7, 5.2, 0.95, x, 3.1, z));
      buttress.push(box(0.55, 1.2, 0.7, x, 6.1, z));
      // chaperon en biseau
      buttress.push(box(0.62, 0.5, 0.75, x - s * 0.06, 6.9, z, 0, 0, s * 0.32));
    }
  }
  // contreforts d'angle de façade
  for (const s of [1, -1]) {
    buttress.push(box(0.9, 0.7, 1.2, s * (half + 0.25), 0.35, zS - 0.4));
    buttress.push(box(0.7, 6.4, 0.85, s * (half + 0.25), 3.9, zS - 0.4));
  }
  const bMesh = new THREE.Mesh(merge(buttress), stone);
  bMesh.castShadow = true;
  bMesh.receiveShadow = true;
  group.add(bMesh);

  // corbeaux sous la corniche (instanciés)
  const corbelGeo = new THREE.BoxGeometry(0.3, 0.24, 0.42);
  const corbelCount = 2 * 31 + 2 * 14 + 18;
  const corbels = new THREE.InstancedMesh(corbelGeo, trim, corbelCount);
  let ci = 0;
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3(1, 1, 1);
  for (const s of [1, -1]) {
    for (let i = 0; i < 31; i++) {
      const z = -11.2 + i * 0.75;
      m4.compose(new THREE.Vector3(s * (half + 0.06), NAVE.h - 0.28, z), q.identity(), sc);
      corbels.setMatrixAt(ci++, m4);
    }
  }
  for (const s of [1, -1]) {
    for (let i = 0; i < 14; i++) {
      const x = -4.9 + i * 0.75;
      m4.compose(new THREE.Vector3(x, NAVE.h - 0.28, zS + 0.06 + (s > 0 ? 0 : -NAVE.t)), q.identity(), sc);
      corbels.setMatrixAt(ci++, m4);
    }
  }
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI;
    m4.compose(
      new THREE.Vector3(Math.cos(a) * (NAVE.apseR + 0.03), NAVE.h - 0.28, zN - Math.sin(a) * (NAVE.apseR + 0.03)),
      q.identity(), sc
    );
    corbels.setMatrixAt(ci++, m4);
  }
  corbels.count = ci;
  corbels.castShadow = true;
  group.add(corbels);

  /* ───────────────────────── sol intérieur ───────────────────────── */

  const floorMat = new THREE.MeshStandardMaterial({
    map: rep(T.flagstone(), 3.2, 7.4),
    color: 0xd8dcd0,
    roughness: 0.66,
    metalness: 0.04,
  });
  const naveFloor = plane(NAVE.w - 0.2, NAVE.l - 0.1, floorMat, 0, NAVE.floor, 0);
  naveFloor.receiveShadow = true;
  group.add(naveFloor);

  const apseFloorShape = new THREE.Shape();
  apseFloorShape.moveTo(0, 0);
  apseFloorShape.absarc(0, 0, NAVE.apseR - 0.1, 0, Math.PI, false);
  apseFloorShape.closePath();
  const apseFloorGeo = new THREE.ShapeGeometry(apseFloorShape, 26);
  apseFloorGeo.rotateX(-Math.PI / 2);
  const apseFloor = new THREE.Mesh(apseFloorGeo, floorMat.clone());
  apseFloor.material.map = rep(T.flagstone(), 2.4, 2.4);
  apseFloor.position.set(0, NAVE.floor + 0.001, zN);
  apseFloor.receiveShadow = true;
  group.add(apseFloor);

  // allée centrale plus sombre et usée
  const aisle = plane(2.4, NAVE.l - 1.2, new THREE.MeshStandardMaterial({
    map: rep(T.flagstone(), 1.2, 9), color: 0xb0b6ac, roughness: 0.58, metalness: 0.05,
  }), 0, NAVE.floor + 0.004, 0);
  group.add(aisle);

  /* ───────────────────────── arcatures aveugles ───────────────────────── */

  const pil = [];
  const pilZ = [-10.4, -6.6, -2.8, 1.0, 4.8, 8.6];
  for (const s of [1, -1]) {
    for (const z of pilZ) {
      pil.push(box(0.55, 5.1, 0.42, s * (half - NAVE.t - 0.18), NAVE.floor + 2.55, z));
      pil.push(box(0.7, 0.18, 0.55, s * (half - NAVE.t - 0.22), NAVE.floor + 5.15, z));
      pil.push(box(0.62, 0.12, 0.48, s * (half - NAVE.t - 0.2), NAVE.floor + 0.06, z));
    }
    for (let i = 0; i < pilZ.length - 1; i++) {
      const zc = (pilZ[i] + pilZ[i + 1]) / 2;
      const a = new THREE.TorusGeometry(1.55, 0.11, 6, 20, Math.PI);
      a.rotateY(s > 0 ? -Math.PI / 2 : Math.PI / 2);
      a.translate(s * (half - NAVE.t - 0.16), NAVE.floor + 5.16, zc);
      pil.push(a);
    }
  }
  const pilMesh = new THREE.Mesh(merge(pil), stoneDark);
  pilMesh.castShadow = true;
  pilMesh.receiveShadow = true;
  group.add(pilMesh);

  // corniche intérieure
  for (const s of [1, -1]) {
    const c = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.16, NAVE.l - 0.4), trim);
    c.position.set(s * (half - NAVE.t - 0.1), NAVE.floor + 5.9, 0);
    group.add(c);
  }

  // poutres du plafond
  const beams = [];
  for (let i = 0; i < 8; i++) {
    const z = -10.5 + i * 3.0;
    beams.push(box(NAVE.w - 1.0, 0.3, 0.28, 0, NAVE.h - 0.35, z));
    beams.push(box(NAVE.w - 1.0, 0.2, 0.2, 0, NAVE.h - 1.5, z + 0.2, 0, 0, 0));
  }
  // chevrons
  for (const s of [1, -1]) {
    for (let i = 0; i < 8; i++) {
      const z = -10.5 + i * 3.0;
      beams.push(box(5.9, 0.16, 0.16, s * 2.8, NAVE.h + 1.1, z, 0, 0, s * 0.62));
    }
  }
  const beamsMesh = new THREE.Mesh(merge(beams), woodDark);
  beamsMesh.castShadow = true;
  group.add(beamsMesh);

  /* ───────────────────────── mobilier ───────────────────────── */

  colliders.push({ x: 0, z: -14.3, hw: 1.3, hd: 0.65 });

  const altarMat = new THREE.MeshStandardMaterial({ map: rep(T.stone(), 0.9, 0.9), color: 0xa5a99c, roughness: 0.8 });
  const altar = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.0, 1.2), altarMat);
  altar.position.set(0, NAVE.floor + 0.5, -14.3);
  altar.castShadow = true;
  altar.receiveShadow = true;
  group.add(altar);
  const altarCloth = new THREE.Mesh(new THREE.BoxGeometry(2.7, 0.06, 1.34), clothMat);
  altarCloth.position.set(0, NAVE.floor + 1.02, -14.3);
  group.add(altarCloth);
  const frontal = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.8), new THREE.MeshStandardMaterial({ map: T.tapestry(), color: 0x9c8f74, roughness: 0.9 }));
  frontal.position.set(0, NAVE.floor + 0.52, -13.69);
  group.add(frontal);

  // croix dorée derrière l'autel
  const crossAltar = [];
  crossAltar.push(box(0.14, 2.9, 0.14, 0, 1.45, 0));
  crossAltar.push(box(1.35, 0.14, 0.14, 0, 2.15, 0));
  crossAltar.push(box(0.55, 0.55, 0.1, 0, 2.15, 0.02, 0, 0, Math.PI / 4));
  const crossMesh = new THREE.Mesh(merge(crossAltar), gold);
  crossMesh.position.set(0, NAVE.floor, -16.1);
  crossMesh.castShadow = true;
  group.add(crossMesh);

  // statuette de la Vierge dans une niche (abside)
  const statueMat = new THREE.MeshStandardMaterial({ color: 0xbfc1b1, roughness: 0.86 });
  const statue = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.35, 10), statueMat);
  body.position.y = 0.68;
  const headS = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), statueMat);
  headS.position.y = 1.48;
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 18), gold);
  halo.position.set(0, 1.52, 0.04);
  statue.add(body, headS, halo);
  statue.position.set(-2.4, NAVE.floor + 1.15, -15.4);
  statue.rotation.y = 0.5;
  group.add(statue);
  const niche = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.18, 12), trim);
  niche.position.set(-2.4, NAVE.floor + 1.1, -15.4);
  group.add(niche);

  // stalles de choeur
  const stallParts = [];
  for (const s of [1, -1]) {
    stallParts.push(box(3.2, 0.12, 0.55, s * 3.15, NAVE.floor + 0.46, -10.6));
    stallParts.push(box(3.2, 0.75, 0.14, s * 3.15, NAVE.floor + 0.82, -10.95));
    stallParts.push(box(0.16, 0.46, 0.5, s * 4.7, NAVE.floor + 0.23, -10.6));
    stallParts.push(box(0.16, 0.46, 0.5, s * 1.6, NAVE.floor + 0.23, -10.6));
    stallParts.push(box(0.1, 0.9, 0.1, s * 1.35, NAVE.floor + 0.45, -10.6));
    stallParts.push(box(0.1, 0.9, 0.1, s * 4.95, NAVE.floor + 0.45, -10.6));
  }
  // bancs de nef
  for (const s of [1, -1]) {
    for (const z of [-6.6, -3.4, -0.2, 3.0, 6.2]) {
      const cx = s * 3.45;
      stallParts.push(box(3.1, 0.1, 0.5, cx, NAVE.floor + 0.45, z));
      stallParts.push(box(3.1, 0.82, 0.12, cx, NAVE.floor + 0.86, z + 0.29));
      stallParts.push(box(0.14, 0.45, 0.46, cx - 1.4, NAVE.floor + 0.22, z));
      stallParts.push(box(0.14, 0.45, 0.46, cx + 1.4, NAVE.floor + 0.22, z));
      stallParts.push(box(3.1, 0.08, 0.1, cx, NAVE.floor + 1.28, z + 0.3));
      colliders.push({ x: cx, z, hw: 1.6, hd: 0.38 });
    }
  }
  const furniture = new THREE.Mesh(merge(stallParts), wood);
  furniture.castShadow = true;
  furniture.receiveShadow = true;
  group.add(furniture);

  // bénitier près de la porte
  const font = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.7, 12), trim);
  font.position.set(-2.4, NAVE.floor + 0.35, 10.4);
  font.castShadow = true;
  group.add(font);
  const fontBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.42, 0.16, 14), trim);
  fontBowl.position.set(-2.4, NAVE.floor + 0.72, 10.4);
  group.add(fontBowl);

  // tapisseries
  const tapMat = new THREE.MeshStandardMaterial({ map: T.tapestry(), color: 0xbfb39a, roughness: 0.94 });
  for (const s of [1, -1]) {
    const t = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 3.4), tapMat);
    t.position.set(s * (half - NAVE.t - 0.02), 3.1, 9.0);
    t.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(t);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.9, 8), iron);
    rod.rotation.z = Math.PI / 2;
    rod.position.set(s * (half - NAVE.t - 0.03), 4.82, 9.0);
    rod.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2;
    group.add(rod);
  }

  // taches de sang au sol
  const bloodMat = new THREE.MeshBasicMaterial({
    map: T.blood(), transparent: true, opacity: 0.62, depthWrite: false, color: 0x5a1410,
  });
  for (let i = 0; i < 7; i++) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), bloodMat);
    b.rotation.x = -Math.PI / 2;
    b.rotation.z = rng() * Math.PI * 2;
    b.position.set(randRange(rng, -4.2, 4.2), NAVE.floor + 0.008, randRange(rng, -10, 9));
    b.scale.setScalar(0.8 + rng() * 1.8);
    group.add(b);
  }

  /* ───────────────────────── cierges & lumières ───────────────────────── */

  const waxMat = new THREE.MeshStandardMaterial({ color: 0xcfc3a2, roughness: 0.7, emissive: 0x201604, emissiveIntensity: 0.4 });
  const flameTex = T.halo();
  const flameMat = new THREE.SpriteMaterial({
    map: flameTex, color: 0xffcf8a, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, opacity: 0.95,
  });

  function addCandle(x, y, z, scale = 1, light = false) {
    const h = 0.26 * scale;
    const wax = new THREE.Mesh(new THREE.CylinderGeometry(0.035 * scale, 0.045 * scale, h, 8), waxMat);
    wax.position.set(x, y + h / 2, z);
    group.add(wax);
    const fl = new THREE.Sprite(flameMat.clone());
    fl.position.set(x, y + h + 0.06 * scale, z);
    fl.scale.setScalar(0.24 * scale);
    group.add(fl);
    flames.push({ sprite: fl, base: 0.24 * scale, phase: rng() * 10, x, y: fl.position.y, z });
    if (light) {
      const pl = new THREE.PointLight(0xffb562, 12 * scale, 9 * scale, 2);
      pl.position.set(x, y + h + 0.1, z);
      group.add(pl);
      candleLights.push(pl);
    }
  }

  // cierges d'autel
  const candlestickParts = [];
  for (const s of [1, -1]) {
    candlestickParts.push(cyl(0.06, 0.16, 0.9, 10, s * 0.85, 0.45, -14.3));
    candlestickParts.push(cyl(0.2, 0.2, 0.06, 12, s * 0.85, 0.92, -14.3));
  }
  const candlesticks = new THREE.Mesh(merge(candlestickParts), gold);
  candlesticks.position.y = NAVE.floor;
  group.add(candlesticks);
  addCandle(-0.85, NAVE.floor + 0.95, -14.3, 1.35, true);
  addCandle(0.85, NAVE.floor + 0.95, -14.3, 1.35, true);

  // cierges sur les gradins de l'abside
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      addCandle(s * (1.9 + i * 0.35), NAVE.floor + 0.9 - i * 0.22, -15.2 - i * 0.25, 0.8, false);
    }
  }

  // lustre central
  const chand = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.05, 6, 28), iron);
  ring.rotation.x = Math.PI / 2;
  chand.add(ring);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const cx = Math.cos(a) * 1.2, cz = Math.sin(a) * 1.2;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.2, 6), waxMat);
    c.position.set(cx, 0.12, cz);
    chand.add(c);
    const fl = new THREE.Sprite(flameMat.clone());
    fl.position.set(cx, 0.28, cz);
    fl.scale.setScalar(0.19);
    chand.add(fl);
    flames.push({ sprite: fl, base: 0.19, phase: rng() * 10, x: cx, y: 0.28, z: cz });
  }
  for (const a of [0, Math.PI]) {
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 3.6, 5), iron);
    chain.position.set(Math.cos(a) * 0.4, 1.9, Math.sin(a) * 0.4);
    chand.add(chain);
  }
  chand.position.set(0, 5.6, -0.5);
  group.add(chand);

  const chandLight = new THREE.PointLight(0xffb066, 26, 18, 2);
  chandLight.position.set(0, 5.2, -0.5);
  group.add(chandLight);
  candleLights.push(chandLight);

  const altarLight = new THREE.PointLight(0xff9a4e, 20, 14, 2);
  altarLight.position.set(0, 2.4, -14.0);
  group.add(altarLight);
  candleLights.push(altarLight);

  // lumière chaude juste à l'intérieur du seuil : invite à entrer
  const seuil = new THREE.PointLight(0xff9d52, 17, 13, 2);
  seuil.position.set(0, 2.6, 10.4);
  group.add(seuil);
  candleLights.push(seuil);

  // lanternes du portail
  for (const s of [1, -1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.06), iron);
    arm.position.set(s * 2.9, 3.5, zS + 0.5);
    group.add(arm);
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.42, 6), iron);
    cage.position.set(s * 3.2, 3.25, zS + 0.5);
    group.add(cage);
    const glow = new THREE.Sprite(flameMat.clone());
    glow.position.set(s * 3.2, 3.24, zS + 0.5);
    glow.scale.setScalar(0.75);
    group.add(glow);
    flames.push({ sprite: glow, base: 0.75, phase: rng() * 10, x: s * 3.2, y: 3.24, z: zS + 0.5 });
    const l = new THREE.PointLight(0xffa860, 18, 8, 2);
    l.position.set(s * 3.2, 3.1, zS + 0.9);
    group.add(l);
    candleLights.push(l);
  }

  /* ───────────────────────── porche & moulures ───────────────────────── */

  const porch = [];
  for (const sx of [-1, 1]) {
    porch.push(box(0.62, 0.34, 1.5, sx * 2.62, 0.17, zS + 0.72));
    porch.push(cyl(0.24, 0.3, 3.4, 10, sx * 2.62, 1.9, zS + 0.72));
    porch.push(box(0.72, 0.22, 0.72, sx * 2.62, 3.66, zS + 0.72));
    porch.push(box(0.56, 0.16, 0.56, sx * 2.62, 0.36, zS + 0.72));
  }
  // double rouleau d'archivoltes, plus profond que le mur
  for (const r of [1.95, 2.3, 2.66, 3.0]) {
    const a = new THREE.TorusGeometry(r, 0.16, 7, 34, Math.PI);
    a.translate(0, 3.0, zS + 0.55);
    porch.push(a);
  }
  const porchMesh = new THREE.Mesh(merge(porch), trim);
  porchMesh.castShadow = true;
  porchMesh.receiveShadow = true;
  group.add(porchMesh);
  colliders.push({ x: -2.62, z: zS + 0.72, hw: 0.36, hd: 0.6 });
  colliders.push({ x: 2.62, z: zS + 0.72, hw: 0.36, hd: 0.6 });

  // bandeaux horizontaux (string courses)
  const courses = [];
  for (const y of [5.9, 8.35]) {
    courses.push(box(11.2, 0.16, 0.24, 0, y, zS + 0.1));
    for (const sx of [-1, 1]) {
      courses.push(box(0.24, 0.16, NAVE.l, sx * (half + 0.08), y, 0));
    }
  }
  // socle
  courses.push(box(11.4, 0.42, 0.3, 0, 0.21, zS + 0.14));
  for (const sx of [-1, 1]) {
    courses.push(box(0.3, 0.42, NAVE.l + 0.2, sx * (half + 0.12), 0.21, 0));
  }
  const bandMesh = new THREE.Mesh(merge(courses), trim);
  bandMesh.castShadow = true;
  group.add(bandMesh);

  /* ───────────────────────── marchepied extérieur ───────────────────────── */

  for (let i = 0; i < 3; i++) {
    const st = new THREE.Mesh(new THREE.BoxGeometry(4.6 + i * 0.6, 0.14, 0.55), stone);
    st.position.set(0, 0.07 + i * 0.14, zS + 0.55 + i * 0.5);
    st.receiveShadow = true;
    st.castShadow = true;
    group.add(st);
  }

  /* ───────────────────────── poussière & ambiance ───────────────────────── */

  const state = {
    group,
    colliders,
    windows,
    flames,
    candleLights,
    glassMaterials,
    floorY: NAVE.floor,
    door: { x: 0, z: zS },
    interior: { minX: -half + NAVE.t, maxX: half - NAVE.t, minZ: zN - NAVE.apseR, maxZ: zS - NAVE.t },
    nave: { z0: zN, z1: zS },
    moonPos: new THREE.Vector3(46, 40, 26),
    moonTarget: new THREE.Vector3(0, 4, 0),
    glowK: 1,             // multiplicateur d'éclat des vitraux (mise en scène du menu)
    _t: 0,
    update(dt) {
      this._t += dt;
      const t = this._t;
      for (const f of flames) {
        const n = 0.86 + Math.sin(t * 8.1 + f.phase) * 0.08 + Math.sin(t * 19.7 + f.phase * 2) * 0.05;
        f.sprite.scale.setScalar(f.base * n);
        f.sprite.material.opacity = 0.78 + 0.2 * n;
      }
      for (let i = 0; i < candleLights.length; i++) {
        const l = candleLights[i];
        const base = l.userData.base ?? (l.userData.base = l.intensity);
        l.intensity = base * (0.9 + 0.1 * Math.sin(t * 7.3 + i * 2.1) + 0.04 * Math.sin(t * 17.1 + i));
      }
      this.glassMaterials[0].emissiveIntensity = (1.42 + Math.sin(t * 0.7) * 0.05) * this.glowK;
      this.glassMaterials[1].emissiveIntensity = (1.32 + Math.sin(t * 0.53 + 1) * 0.04) * this.glowK;
      this.glassMaterials[2].emissiveIntensity = (1.25 + Math.sin(t * 0.41 + 2) * 0.05) * this.glowK;
    },
    setDawn(k) {
      // k : 0 = nuit, 1 = plein jour
      glassLancet.emissiveIntensity = 1.45 * (1 - k * 0.75);
      glassLancet2.emissiveIntensity = 1.35 * (1 - k * 0.75);
      glassRose.emissiveIntensity = 1.25 * (1 - k * 0.75);
      for (const l of candleLights) l.intensity = (l.userData.base ?? l.intensity) * (1 - k * 0.55);
    },
  };

  return state;
}
