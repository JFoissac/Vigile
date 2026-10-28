// volumetrics.js — faisceaux de lune à travers les vitraux, poussière en suspension.
// Prismes additifs + shader de bruit : l'illusion de volume sans ray marching.

import * as THREE from "three";
import { T } from "../world/textures.js";
import { makeRng, randRange, clamp } from "../core/util.js";

const BEAM_VERT = /* glsl */ `
varying vec2 vUv;
varying float vDepth;
void main() {
  vUv = uv;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const BEAM_FRAG = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uTime;
uniform float uDawn;
uniform float uIntensity;
uniform sampler2D tNoise;
varying vec2 vUv;
varying float vDepth;
void main() {
  float edge = pow(sin(clamp(vUv.x, 0.0, 1.0) * 3.14159), 2.0);
  float along = smoothstep(0.0, 0.16, vUv.y) * (1.0 - smoothstep(0.42, 1.0, vUv.y) * 0.78);
  vec2 nuv = vec2(vUv.x * 1.4, vUv.y * 2.6 - uTime * 0.035);
  float n = texture2D(tNoise, nuv).r;
  float n2 = texture2D(tNoise, nuv * 2.3 + vec2(uTime * 0.02, 0.3)).r;
  float dust = 0.55 + n * 0.55 + n2 * 0.25;
  float a = edge * along * dust * uIntensity * (1.0 - uDawn * 0.9);
  // atténuation très légère avec la distance pour éviter l'aplat
  a *= smoothstep(60.0, 6.0, vDepth) * 0.6 + 0.4;
  gl_FragColor = vec4(uColor, a);
}
`;

function beamGeometry(win, dir, floorY, spread = 1.55) {
  const up = new THREE.Vector3(0, 1, 0);
  const right = new THREE.Vector3().crossVectors(up, win.normal).normalize();
  const hw = win.w * 0.5, hh = win.h * 0.5;
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

  const start = corners.map(([a, b]) =>
    win.pos.clone().addScaledVector(right, a * hw).addScaledVector(up, b * hh)
  );
  const end = start.map((p) => {
    const t = clamp((p.y - floorY) / -dir.y, 0.4, 90);
    const e = p.clone().addScaledVector(dir, t);
    // léger évasement du faisceau
    const c = e.clone().sub(new THREE.Vector3(win.pos.x, floorY, win.pos.z));
    return e.addScaledVector(c, (spread - 1) * 0.08);
  });

  const pos = [];
  const uv = [];
  const push = (p, u, v) => { pos.push(p.x, p.y, p.z); uv.push(u, v); };
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    // deux triangles par face
    push(start[i], 0, 0); push(start[j], 1, 0); push(end[j], 1, 1);
    push(start[i], 0, 0); push(end[j], 1, 1); push(end[i], 0, 1);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

export function buildVolumetrics(scene, chapel, moonPosition) {
  const group = new THREE.Group();
  group.name = "faisceaux";
  scene.add(group);
  const rng = makeRng(31415);

  const moonDir = moonPosition.clone().normalize();
  const lightDir = moonDir.clone().negate(); // direction de propagation
  const floorY = chapel.floorY + 0.02;

  const mats = [];
  const poolMats = [];
  const beams = [];
  for (const win of chapel.windows) {
    // Seules les baies réellement éclairées par la lune produisent un faisceau.
    if (win.kind === "rose") continue;
    if (win.normal.dot(lightDir) < 0.12) continue;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(win.color) },
        uTime: { value: 0 },
        uDawn: { value: 0 },
        uIntensity: { value: win.kind === "apse" ? 0.045 : 0.065 },
        tNoise: { value: T.noise() },
      },
      vertexShader: BEAM_VERT,
      fragmentShader: BEAM_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    const mesh = new THREE.Mesh(beamGeometry(win, lightDir, floorY), mat);
    mesh.renderOrder = 4;
    mesh.frustumCulled = true;
    group.add(mesh);

    /* flaque de lumière colorée là où le faisceau touche le dallage : sans elle
       le rayon s'éteint dans le vide et le vitrail ne semble éclairer personne */
    const toFloor = clamp((win.pos.y - floorY) / -lightDir.y, 0.4, 90);
    const land = win.pos.clone().addScaledVector(lightDir, toFloor);
    // la lune est basse : le point d'impact tombe loin derrière les murs.
    // On garde la flaque DANS la nef, sous sa baie, là où le regard l'attend.
    land.x = clamp(land.x, -4.1, 4.1);
    land.z = clamp(land.z, -11.0, 11.0);
    const pool = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({
        map: T.glassPool(), color: new THREE.Color(win.color),
        transparent: true, opacity: win.kind === "apse" ? 0.34 : 0.5,
        depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      }),
    );
    pool.position.set(land.x, floorY + 0.008, land.z);
    pool.rotation.x = -Math.PI / 2;
    pool.rotation.z = Math.atan2(lightDir.x, lightDir.z);
    pool.scale.set(win.w * 4.2, win.h * 3.0, 1);
    pool.renderOrder = 3;
    pool.userData.pool = true;
    pool.material.userData.base = pool.material.opacity;
    group.add(pool);
    poolMats.push(pool.material);

    mats.push(mat);
    beams.push({ mesh, win });
  }

  // poussière : un nuage dans la nef + quelques grains dans les faisceaux
  const dustCount = 640;
  const dustPos = new Float32Array(dustCount * 3);
  const dustSeed = new Float32Array(dustCount);
  const dustSpeed = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    const x = randRange(rng, -4.6, 4.6);
    const z = randRange(rng, -15.6, 11.2);
    const y = randRange(rng, 0.6, 7.6);
    dustPos[i * 3] = x;
    dustPos[i * 3 + 1] = y;
    dustPos[i * 3 + 2] = z;
    dustSeed[i] = rng() * 10;
    dustSpeed[i] = 0.02 + rng() * 0.07;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    map: T.dot(),
    color: 0xcfe0e4,
    size: 0.045,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  group.add(dust);

  // poussière extérieure, plus rare
  const outCount = 260;
  const outPos = new Float32Array(outCount * 3);
  for (let i = 0; i < outCount; i++) {
    outPos[i * 3] = randRange(rng, -34, 34);
    outPos[i * 3 + 1] = randRange(rng, 0.2, 5);
    outPos[i * 3 + 2] = randRange(rng, -30, 42);
  }
  const outGeo = new THREE.BufferGeometry();
  outGeo.setAttribute("position", new THREE.BufferAttribute(outPos, 3));
  const outDust = new THREE.Points(outGeo, new THREE.PointsMaterial({
    map: T.dot(), color: 0xa8bcc0, size: 0.07, transparent: true, opacity: 0.28,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
  }));
  outDust.frustumCulled = false;
  group.add(outDust);

  const state = {
    group, beams, mats, dust,
    _t: 0,
    update(dt, t) {
      this._t = t;
      for (const m of mats) m.uniforms.uTime.value = t;

      const arr = dust.geometry.attributes.position.array;
      for (let i = 0; i < dustCount; i++) {
        const s = dustSeed[i];
        arr[i * 3] += Math.sin(t * 0.21 + s) * dt * 0.035;
        arr[i * 3 + 1] += (Math.sin(t * 0.13 + s * 2.1) * 0.5 + 0.18) * dt * dustSpeed[i] * 3.0;
        arr[i * 3 + 2] += Math.cos(t * 0.17 + s * 1.3) * dt * 0.03;
        if (arr[i * 3 + 1] > 8.2) arr[i * 3 + 1] = 0.4;
        if (arr[i * 3 + 1] < 0.3) arr[i * 3 + 1] = 8.0;
      }
      dust.geometry.attributes.position.needsUpdate = true;
      dust.material.opacity = 0.42 + Math.sin(t * 0.5) * 0.05;

      outDust.rotation.y = t * 0.003;
    },
    setDawn(k) {
      for (const m of mats) m.uniforms.uDawn.value = k;
      for (const m of poolMats) m.opacity = (m.userData.base || 0.13) * (1 - k * 0.85);
      dust.material.opacity = 0.5 * (1 - k * 0.6);
      outDust.material.opacity = 0.28 * (1 - k * 0.7);
    },
  };
  return state;
}
