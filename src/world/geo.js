// geo.js — assistants de géométrie procédurale et fusion de maillages.
// La fusion manuelle évite d'importer un addon three.js (zéro dépendance).

import * as THREE from "three";

/** Fusionne des géométries (position/normal/uv) en un seul BufferGeometry non indexé. */
export function merge(geometries) {
  const list = geometries.map((g) => (g.index ? g.toNonIndexed() : g));
  let count = 0;
  for (const g of list) count += g.attributes.position.count;

  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  let o = 0;
  for (const g of list) {
    const p = g.attributes.position.array;
    const n = g.attributes.normal ? g.attributes.normal.array : null;
    const u = g.attributes.uv ? g.attributes.uv.array : null;
    const c = g.attributes.position.count;
    pos.set(p, o * 3);
    if (n) nor.set(n, o * 3);
    if (u) uv.set(u, o * 2);
    else uv.fill(0, o * 2, (o + c) * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/** Boîte déjà transformée, prête à être fusionnée. */
export function box(w, h, d, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

export function cyl(rt, rb, h, seg, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, false);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(x, y, z);
  return g;
}

/** Contour d'un mur rectangulaire. */
export function rectShape(w, h, cx = 0, y0 = 0) {
  const s = new THREE.Shape();
  s.moveTo(cx - w / 2, y0);
  s.lineTo(cx + w / 2, y0);
  s.lineTo(cx + w / 2, y0 + h);
  s.lineTo(cx - w / 2, y0 + h);
  s.closePath();
  return s;
}

/** Trou en plein cintre : rectangle surmonté d'un demi-cercle. */
export function archHole(cx, y0, w, hSpring, archR = w / 2) {
  const p = new THREE.Path();
  p.moveTo(cx - w / 2, y0);
  p.lineTo(cx - w / 2, y0 + hSpring);
  p.absarc(cx, y0 + hSpring, archR, Math.PI, 0, true);
  p.lineTo(cx + w / 2, y0);
  p.closePath();
  return p;
}

export function circleHole(cx, cy, r) {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  return p;
}

/** Mur extrudé avec ouvertures réelles (les vitraux laissent passer l'ombre). */
export function wall(shape, thickness, mat, { shadow = true } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 14,
  });
  g.translate(0, 0, -thickness);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
}

/** Sol / plan horizontal texturé. */
export function plane(w, d, mat, x = 0, y = 0, z = 0, ry = 0) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(-Math.PI / 2);
  if (ry) g.rotateY(ry);
  g.translate(x, y, z);
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

/** Clone un matériau en changeant quelques propriétés. */
export function matVariant(base, props) {
  const m = base.clone();
  Object.assign(m, props);
  return m;
}
