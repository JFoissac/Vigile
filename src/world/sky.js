// sky.js — ciel nocturne : dégradé vivant, champ d'étoiles, lune et halo, brume de sol.
// Le ciel est un dôme shader : aucun asset, tout est procédural.
// MOON_DIR est la direction de la lune : elle sert aussi à la lumière directionnelle
// et aux faisceaux volumétriques (game.js), pour que l'éclairage reste cohérent.

import * as THREE from "three";
import { T } from "./textures.js";
import { makeRng, lerp } from "../core/util.js";

/** Direction de la lune (normalisée) — visible dans le cadre du menu. */
export const MOON_DIR = new THREE.Vector3(0.315, 0.352, -0.882).normalize();
/** Distance du disque lunaire sur le dôme (le dôme fait 400). */
export const MOON_DIST = 320;
/** Position de la lumière de lune, alignée sur MOON_DIR. */
export const MOON_LIGHT = MOON_DIR.clone().multiplyScalar(86);

const VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
}
`;

const FRAG = /* glsl */ `
precision highp float;
uniform vec3 uTop;
uniform vec3 uHorizon;
uniform vec3 uBottom;
uniform vec3 uMoonDir;
uniform vec3 uMoonColor;
uniform float uMoonGlow;
uniform float uStars;
uniform float uTime;
uniform vec3 uCloudColor;
varying vec3 vDir;

float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hash3(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), u.x),
             mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), u.x), u.y);
}
// Un point lumineux par cellule de la sphère : densité (gate) et taille réglables.
// Le décalage interne est dérivé du même hash : un seul sinus par cellule.
float starLayer(vec3 d, float scale, float gate, float size, out float seed) {
  vec3 p = d * scale;
  vec3 cell = floor(p);
  vec3 f = fract(p) - 0.5;
  float h = hash3(cell);
  seed = h;
  if (h < gate) return 0.0;
  vec3 off = vec3(fract(h * 17.13), fract(h * 31.71), fract(h * 53.17)) - 0.5;
  float dist = length(f - off * 0.62);
  return smoothstep(size, 0.0, dist);
}

void main() {
  vec3 d = normalize(vDir);
  float h = clamp(d.y, -0.25, 1.0);

  // dégradé : zénith profond, horizon plus dense, sol sous l'horizon
  vec3 col = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.58));
  col = mix(col, uBottom, smoothstep(0.02, -0.22, h));

  // respiration très large du ciel (évite l'aplat) : un seul sinus, pas de fbm
  float az = atan(d.z, d.x);
  float breath = 0.5 + 0.5 * sin(az * 1.7 + d.y * 2.9 + uTime * 0.02);
  col *= 0.9 + breath * 0.2 + (0.5 - d.y) * 0.04;

  // lueur d'horizon, plus dense du côté de la lune
  float moonSide = pow(max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(uMoonDir.x, 0.0, uMoonDir.z))), 0.0), 1.6);
  col += uHorizon * (0.10 + 0.18 * moonSide) * smoothstep(0.2, -0.02, h);

  // nuées basses, discrètes
  vec2 uv = vec2(az * 1.6, d.y * 4.0 + uTime * 0.006);
  float clouds = noise(uv * 2.2 + vec2(uTime * 0.004, 0.0)) * 0.66
               + noise(uv * 4.9 + vec2(uTime * 0.006, 0.0)) * 0.34;
  clouds = smoothstep(0.54, 0.92, clouds) * smoothstep(0.34, 0.02, abs(h - 0.07));
  col = mix(col, uCloudColor, clouds * 0.5);

  // lune : halo à trois échelles, calculé en angle (précis, sans puissance énorme)
  vec3 md = normalize(uMoonDir);
  float ang = acos(clamp(dot(d, md), -1.0, 1.0));
  float glow = exp(-pow(ang / 0.062, 2.0)) * 0.10
             + exp(-pow(ang / 0.13, 2.0)) * 0.075
             + exp(-pow(ang / 0.38, 2.0)) * 0.022;
  col += uMoonColor * glow * uMoonGlow;

  // étoiles : deux couches, fondu près de l'horizon et autour de la lune
  float seedA, seedB;
  float s1 = starLayer(d, 72.0, 0.955, 0.2, seedA);
  float s2 = starLayer(d, 34.0, 0.94, 0.26, seedB);
  float twinkle1 = 0.65 + 0.35 * sin(uTime * (0.8 + seedA * 2.2) + seedA * 40.0);
  float twinkle2 = 0.7 + 0.3 * sin(uTime * (0.5 + seedB * 1.4) + seedB * 23.0);
  float horizonMask = smoothstep(0.03, 0.24, d.y);
  float moonMask = 1.0 - smoothstep(0.16, 0.5, ang);
  float starMask = uStars * horizonMask * moonMask;
  vec3 starCol = mix(vec3(0.74, 0.82, 0.95), vec3(1.0, 0.97, 0.9), seedA);
  col += starCol * s1 * twinkle1 * 1.25 * starMask;
  col += vec3(0.8, 0.86, 0.95) * s2 * twinkle2 * 0.45 * starMask;

  // dithering : le dégradé est très sombre, sans ça on voit les marches
  col += (hash2(gl_FragCoord.xy * 1.7) - 0.5) * 0.0025;

  gl_FragColor = vec4(col, 1.0);
}
`;

export function buildSky(scene) {
  const rng = makeRng(777);

  const uniforms = {
    uTop: { value: new THREE.Color(0x050b13) },
    uHorizon: { value: new THREE.Color(0x123034) },
    uBottom: { value: new THREE.Color(0x050a0b) },
    uMoonDir: { value: MOON_DIR.clone() },
    uMoonColor: { value: new THREE.Color(0xb3d0dd) },
    uMoonGlow: { value: 1.0 },
    uStars: { value: 1.0 },
    uTime: { value: 0 },
    uCloudColor: { value: new THREE.Color(0x16262c) },
  };

  const domeMat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(400, 40, 24), domeMat);
  dome.renderOrder = -10;
  scene.add(dome);

  // lune : sprite texturé (cratères procéduraux) + halo additif + traînée horizontale
  const moonPos = MOON_DIR.clone().multiplyScalar(MOON_DIST);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.moon(), color: 0xa8babe, transparent: true, depthWrite: false, fog: false, opacity: 1,
  }));
  moon.position.copy(moonPos);
  moon.scale.setScalar(38);
  moon.renderOrder = -8;
  scene.add(moon);

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.halo(), color: 0x9fc4d4, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, opacity: 0.10,
  }));
  halo.position.copy(moonPos);
  halo.scale.setScalar(84);
  halo.renderOrder = -9;
  scene.add(halo);

  const streak = new THREE.Sprite(new THREE.SpriteMaterial({
    map: T.halo(), color: 0x8fb8c8, transparent: true, blending: THREE.AdditiveBlending,
    depthWrite: false, fog: false, opacity: 0.07,
  }));
  streak.position.copy(moonPos);
  streak.scale.set(104, 11, 1);
  streak.renderOrder = -9;
  scene.add(streak);

  // étoiles en points, pour un léger relief en plus du shader
  const starCount = 320;
  const pos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const a = rng() * Math.PI * 2;
    const el = 0.1 + rng() * 0.85;
    const r = 340;
    pos[i * 3] = Math.cos(a) * Math.cos(el) * r;
    pos[i * 3 + 1] = Math.sin(el) * r;
    pos[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
    map: T.dot(), color: 0xc3d6e2, size: 1.05, sizeAttenuation: false,
    transparent: true, opacity: 0.42, depthWrite: false, fog: false,
    blending: THREE.AdditiveBlending,
  }));
  stars.renderOrder = -7;
  scene.add(stars);

  // brume rampante : quelques nappes très basses
  const fogLayers = [];
  const fogMatBase = new THREE.MeshBasicMaterial({
    map: T.smoke(), transparent: true, opacity: 0.09, depthWrite: false,
    color: 0x9fb2ae, side: THREE.DoubleSide, fog: true,
  });
  for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(56, 56), fogMatBase.clone());
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rng() * Math.PI * 2;
    m.position.set((rng() - 0.5) * 40, 0.35 + rng() * 0.6, (rng() - 0.5) * 46 - 2);
    m.material.opacity = 0.05 + rng() * 0.07;
    m.renderOrder = 2;
    scene.add(m);
    fogLayers.push({ mesh: m, speed: 0.008 + rng() * 0.014, phase: rng() * 10, base: m.material.opacity });
  }

  const state = {
    dome, moon, halo, streak, stars, uniforms, fogLayers,
    moonDirection: MOON_DIR.clone(),
    setDawn(k) {
      const top = new THREE.Color(0x050b13).lerp(new THREE.Color(0x2c4457), k);
      const hor = new THREE.Color(0x123034).lerp(new THREE.Color(0xd08a63), k);
      const bot = new THREE.Color(0x050a0b).lerp(new THREE.Color(0x5c5a50), k);
      uniforms.uTop.value.copy(top);
      uniforms.uHorizon.value.copy(hor);
      uniforms.uBottom.value.copy(bot);
      uniforms.uCloudColor.value.setHex(0x16262c).lerp(new THREE.Color(0xc99a7e), k);
      uniforms.uStars.value = 1.0 - k;
      uniforms.uMoonGlow.value = lerp(1, 0.3, k);
      moon.material.opacity = 1 - k * 0.55;
      halo.material.opacity = 0.10 * (1 - k * 0.7);
      streak.material.opacity = 0.07 * (1 - k * 0.8);
    },
    update(dt, t) {
      uniforms.uTime.value = t;
      for (const f of fogLayers) {
        f.mesh.position.x += Math.sin(t * 0.05 + f.phase) * f.speed * dt * 6;
        f.mesh.material.opacity = f.base * (0.7 + 0.3 * Math.sin(t * 0.13 + f.phase));
      }
      stars.material.opacity = 0.42 * uniforms.uStars.value;
    },
  };
  return state;
}
