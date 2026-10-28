// particles.js — impacts, sang, poussière, douilles de plomb, éclats de verre.
// Deux nuages de points (étincelles additives / gore) + un pool de sprites de fumée.

import * as THREE from "three";
import { T } from "../world/textures.js";
import { makeRng, randRange } from "../core/util.js";

const POINT_VERT = /* glsl */ `
attribute float aSize;
attribute float aAlpha;
attribute vec3 aColor;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vAlpha = aAlpha;
  vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (260.0 / max(-mv.z, 0.2));
  gl_Position = projectionMatrix * mv;
}
`;

const POINT_FRAG = /* glsl */ `
uniform sampler2D tMap;
varying float vAlpha;
varying vec3 vColor;
void main() {
  vec4 t = texture2D(tMap, gl_PointCoord);
  if (t.a < 0.02) discard;
  gl_FragColor = vec4(vColor, t.a * vAlpha);
}
`;

class PointPool {
  constructor(scene, { count = 240, map, blending, size = 0.06, gravity = -9 }) {
    this.count = count;
    this.gravity = gravity;
    this.pos = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3);
    this.life = new Float32Array(count);
    this.max = new Float32Array(count);
    this.sizes = new Float32Array(count);
    this.alphas = new Float32Array(count);
    this.colors = new Float32Array(count * 3);
    this.drag = 0.03;
    this.next = 0;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute("aSize", new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(this.alphas, 1));
    geo.setAttribute("aColor", new THREE.BufferAttribute(this.colors, 3));
    geo.setDrawRange(0, count);
    this.geo = geo;

    this.mat = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: map } },
      vertexShader: POINT_VERT,
      fragmentShader: POINT_FRAG,
      transparent: true,
      depthWrite: false,
      blending,
    });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
    this.baseSize = size;
  }

  spawn(x, y, z, vx, vy, vz, life, size, color) {
    const i = this.next;
    this.next = (this.next + 1) % this.count;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life;
    this.max[i] = life;
    this.sizes[i] = size;
    this.alphas[i] = 1;
    this.colors[i * 3] = color.r;
    this.colors[i * 3 + 1] = color.g;
    this.colors[i * 3 + 2] = color.b;
  }

  update(dt) {
    const p = this.pos, v = this.vel, a = this.alphas, s = this.sizes;
    for (let i = 0; i < this.count; i++) {
      if (this.life[i] <= 0) { a[i] = 0; continue; }
      this.life[i] -= dt;
      const k = Math.max(0, this.life[i] / this.max[i]);
      v[i * 3 + 1] += this.gravity * dt;
      const damp = 1 - this.drag * dt * 8;
      v[i * 3] *= damp; v[i * 3 + 2] *= damp;
      p[i * 3] += v[i * 3] * dt;
      p[i * 3 + 1] += v[i * 3 + 1] * dt;
      p[i * 3 + 2] += v[i * 3 + 2] * dt;
      if (p[i * 3 + 1] < 0.02) { p[i * 3 + 1] = 0.02; v[i * 3 + 1] *= -0.22; v[i * 3] *= 0.5; v[i * 3 + 2] *= 0.5; }
      a[i] = k * k;
      s[i] = this.baseSize * (0.55 + k * 0.8);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
  }

  clear() {
    this.life.fill(0);
    this.alphas.fill(0);
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}

export function createFx(scene) {
  const rng = makeRng(5150);
  const red = new THREE.Color(0x7d1812);
  const darkRed = new THREE.Color(0x4a0d09);
  const sparks = new PointPool(scene, {
    count: 300, map: T.spark(), blending: THREE.AdditiveBlending, size: 0.09, gravity: -11,
  });
  const gore = new PointPool(scene, {
    count: 260, map: T.blood(), blending: THREE.NormalBlending, size: 0.11, gravity: -13,
  });
  const glow = new PointPool(scene, {
    count: 120, map: T.dot(), blending: THREE.AdditiveBlending, size: 0.05, gravity: -2,
  });

  // fumée : pool de sprites réutilisés
  const smokeTex = T.smoke();
  const smokePool = [];
  for (let i = 0; i < 34; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: smokeTex, color: 0x9aa89e, transparent: true, opacity: 0, depthWrite: false,
    }));
    sp.scale.setScalar(1);
    sp.visible = false;
    sp.renderOrder = 5;
    scene.add(sp);
    smokePool.push({ sprite: sp, life: 0, max: 1, vy: 0, growing: 1, base: 1 });
  }
  let smokeNext = 0;

  function puff(x, y, z, { scale = 1.2, life = 0.9, color = 0x8e9a90, vy = 0.35, opacity = 0.4 } = {}) {
    const s = smokePool[smokeNext];
    smokeNext = (smokeNext + 1) % smokePool.length;
    s.sprite.position.set(x, y, z);
    s.sprite.material.color.setHex(color);
    s.sprite.material.opacity = opacity;
    s.sprite.visible = true;
    s.base = scale;
    s.sprite.scale.setScalar(scale);
    s.life = life;
    s.max = life;
    s.vy = vy;
  }

  // impacts au sol (sang séché) réutilisés
  const decals = [];
  const decalMat = new THREE.MeshBasicMaterial({
    map: T.blood(), transparent: true, opacity: 0.72, depthWrite: false, color: 0x5d1410,
  });
  for (let i = 0; i < 26; i++) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), decalMat);
    d.rotation.x = -Math.PI / 2;
    d.visible = false;
    d.renderOrder = 1;
    scene.add(d);
    decals.push(d);
  }
  let decalNext = 0;

  const api = {
    sparks, gore, glow,

    /** Impact de balle : étincelles + poussière de pierre. */
    impact(point, normal, kind = "stone") {
      const n = kind === "stone" ? 14 : 9;
      for (let i = 0; i < n; i++) {
        const vx = normal.x * randRange(rng, 1, 4) + randRange(rng, -2, 2);
        const vy = normal.y * randRange(rng, 1, 4) + randRange(rng, 0.5, 3);
        const vz = normal.z * randRange(rng, 1, 4) + randRange(rng, -2, 2);
        sparks.spawn(point.x, point.y, point.z, vx, vy, vz, 0.35 + rng() * 0.4, 0.06 + rng() * 0.05,
          kind === "flesh" ? red : new THREE.Color(0xffc98a));
      }
      puff(point.x, point.y, point.z, {
        scale: 0.5 + rng() * 0.5, life: 0.5 + rng() * 0.4,
        color: kind === "flesh" ? 0x532018 : 0x7c7a6a, opacity: 0.28, vy: 0.18,
      });
    },

    /** Gerbe de sang à l'impact (direction de la balle). */
    blood(point, dir, big = false) {
      const n = big ? 34 : 16;
      for (let i = 0; i < n; i++) {
        const vx = dir.x * randRange(rng, 0.5, 4) + randRange(rng, -1.4, 1.4);
        const vy = randRange(rng, 0.4, 3.4);
        const vz = dir.z * randRange(rng, 0.5, 4) + randRange(rng, -1.4, 1.4);
        gore.spawn(point.x, point.y, point.z, vx, vy, vz, 0.5 + rng() * 0.8,
          0.05 + rng() * 0.09, rng() < 0.5 ? red : darkRed);
      }
      puff(point.x, point.y, point.z, {
        scale: 0.45 + rng() * 0.4, life: 0.55, color: 0x4a1410, opacity: 0.4, vy: 0.1,
      });
    },

    /** Mort : flaque + nuage sombre. */
    death(point, yaw = 0) {
      api.blood(point, new THREE.Vector3(0, 0.4, 0), true);
      for (let i = 0; i < 4; i++) {
        puff(point.x + randRange(rng, -0.3, 0.3), 0.25 + rng() * 0.5, point.z + randRange(rng, -0.3, 0.3), {
          scale: 1.1 + rng() * 0.9, life: 1.4 + rng(), color: 0x3c3a34, opacity: 0.26, vy: 0.25,
        });
      }
      const d = decals[decalNext];
      decalNext = (decalNext + 1) % decals.length;
      d.visible = true;
      d.position.set(point.x + randRange(rng, -0.4, 0.4), 0.015, point.z + randRange(rng, -0.4, 0.4));
      d.rotation.z = rng() * Math.PI * 2;
      d.scale.setScalar(1.1 + rng() * 1.1);
    },

    /** Terre soulevée quand un mort sort du sol (compatibilité). */
    dirt(x, z) {
      api.earth(x, z, { power: 0.8 });
    },

    /**
     * Gerbe de terre : mottes projetées en couronne + poussière qui monte.
     * `power` règle le nombre de mottes et la force ; `groundY` la hauteur du sol.
     */
    earth(x, z, { power = 1, groundY = 0 } = {}) {
      const clods = Math.round(10 + 16 * power);
      const earthA = new THREE.Color(0x4a3f2c);
      const earthB = new THREE.Color(0x6b5c42);
      for (let i = 0; i < clods; i++) {
        const a = rng() * Math.PI * 2;
        const d = 0.06 + rng() * 0.42 * power;
        const up = randRange(rng, 1.1, 2.9) * (0.6 + power * 0.5);
        const out = randRange(rng, 0.7, 2.4) * power;
        gore.spawn(
          x + Math.cos(a) * d, groundY + 0.05, z + Math.sin(a) * d,
          Math.cos(a) * out, up, Math.sin(a) * out,
          0.55 + rng() * 0.7, 0.045 + rng() * 0.075,
          rng() < 0.5 ? earthA : earthB,
        );
      }
      // poussière : deux nappes, une basse qui roule, une qui monte
      puff(x, groundY + 0.12, z, {
        scale: 1.3 + power * 0.7, life: 1.2 + power * 0.35,
        color: 0x6f6552, opacity: 0.30, vy: 0.26,
      });
      puff(x + randRange(rng, -0.3, 0.3), groundY + 0.06, z + randRange(rng, -0.3, 0.3), {
        scale: 0.9 + power * 0.4, life: 0.9, color: 0x574d3c, opacity: 0.24, vy: 0.14,
      });
    },

    /** Éclats de vitrail (tombée du boss, etc.). */
    glass(point, count = 20) {
      for (let i = 0; i < count; i++) {
        glow.spawn(point.x, point.y, point.z,
          randRange(rng, -2, 2), randRange(rng, -1, 2.5), randRange(rng, -2, 2),
          0.8 + rng() * 0.8, 0.05 + rng() * 0.07,
          new THREE.Color().setHSL(0.58 + rng() * 0.08, 0.4, 0.55));
      }
    },

    /** Halo de soin. */
    heal(point) {
      for (let i = 0; i < 26; i++) {
        const a = rng() * Math.PI * 2;
        glow.spawn(point.x + Math.cos(a) * 0.4, point.y + rng() * 0.8, point.z + Math.sin(a) * 0.4,
          Math.cos(a) * 0.2, randRange(rng, 0.4, 1.4), Math.sin(a) * 0.2,
          0.7 + rng() * 0.6, 0.07 + rng() * 0.06, new THREE.Color(0xffd89a));
      }
    },

    puff,
    update(dt) {
      sparks.update(dt);
      gore.update(dt);
      glow.update(dt);
      for (const s of smokePool) {
        if (s.life <= 0) { s.sprite.visible = false; continue; }
        s.life -= dt;
        const k = Math.max(0, s.life / s.max);
        s.sprite.position.y += s.vy * dt;
        s.sprite.scale.setScalar(s.base * (1 + (1 - k) * 1.3));
        s.sprite.material.opacity = k * 0.4;
        if (s.life <= 0) s.sprite.visible = false;
      }
    },
    clear() {
      sparks.clear(); gore.clear(); glow.clear();
      for (const s of smokePool) { s.life = 0; s.sprite.visible = false; }
      for (const d of decals) d.visible = false;
    },
  };
  return api;
}
