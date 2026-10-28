// menu_stage.js — la mise en scène de l'écran d'accueil : la chapelle allumée.
//
// Rien n'est créé pour la veille : ce groupe ne vit que dans le menu. Il ajoute
// les halos des vitraux vus de l'extérieur, la lumière du seuil, une flaque au
// sol, deux faisceaux de lanterne qui grattent la façade, la brume basse et les
// braises qui montent. Tout est additif, sans ombre, et coupé au démarrage.

import * as THREE from "three";
import { T } from "./textures.js";
import { makeRng, randRange } from "../core/util.js";

const WARM = 0xffb069;
const EMBER = 0xffa257;
const COLD = 0x9fc2ff;

function glowSprite(tex, color, opacity) {
  return new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: true,
  }));
}

export function buildMenuStage(scene, chapel) {
  const group = new THREE.Group();
  group.name = "veillee";
  scene.add(group);
  const rng = makeRng(20261102);

  const dot = T.dot();
  const halo = T.halo();
  const puff = T.smoke();

  /* ─────────────── vitraux vus du dehors ─────────────── */

  const windowGlows = [];
  for (const win of chapel.windows) {
    const rose = win.kind === "rose";
    const spr = glowSprite(rose ? halo : dot, rose ? WARM : COLD, rose ? 0.72 : 0.85);
    spr.position.copy(win.pos).addScaledVector(win.normal, rose ? -0.55 : -1.45);
    if (rose) spr.scale.set(8.6, 8.6, 1);
    else spr.scale.set(win.w * 1.55, win.h * 0.9, 1);
    group.add(spr);
    windowGlows.push({
      spr, rose, phase: rng() * Math.PI * 2,
      base: spr.material.opacity, size: spr.scale.clone(),
    });
    if (rose) {
      // aura plus large derrière la rosace : le bloom du menu n'a pas à tout faire
      const aura = glowSprite(halo, WARM, 0.2);
      aura.position.copy(spr.position).addScaledVector(win.normal, -0.2);
      aura.scale.set(15, 15, 1);
      group.add(aura);
      windowGlows.push({
        spr: aura, rose: true, phase: rng() * Math.PI * 2,
        base: 0.2, size: aura.scale.clone(),
      });
    }
  }

  /* ─────────────── le seuil : la lumière qui appelle ─────────────── */

  const doorGlow = glowSprite(halo, 0xffa95c, 0.5);
  doorGlow.position.set(chapel.door.x, 2.5, chapel.door.z + 0.5);
  doorGlow.scale.set(7.6, 8.4, 1);
  group.add(doorGlow);

  // flaque chaude sur l'allée, devant les marches
  const spill = new THREE.Mesh(
    new THREE.CircleGeometry(5.2, 44),
    new THREE.MeshBasicMaterial({
      map: dot,
      color: WARM,
      transparent: true,
      opacity: 0.34,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: true,
    }),
  );
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0, 0.035, chapel.door.z + 5.2);
  spill.scale.set(1.35, 0.9, 1);
  group.add(spill);

  // nappe chaude juste devant le seuil (la lumière se pose dans la brume)
  const doorMist = glowSprite(puff, 0xd8a476, 0.1);
  doorMist.position.set(0, 0.9, chapel.door.z + 4.0);
  doorMist.scale.set(12, 6, 1);
  group.add(doorMist);

  /* ─────────────── le faisceau du seuil sur l'allée ─────────────── */

  // Un prisme de lumière : la bouche du portail (haute) qui s'ouvre et descend
  // jusqu'au sol de l'allée. Quatre faces additives, un bruit qui dérive : la
  // lumière chaude se voit DANS la brume, sans ray marching.
  const hazeGeo = new THREE.BufferGeometry();
  {
    const zIn = chapel.door.z + 0.3;   // bouche du portail
    const zOut = chapel.door.z + 7.6;  // loin sur l'allée
    const xi = 1.7, xo = 3.6;
    const yi = 0.35, yt = 4.05, yo = 0.06;
    // A,B,C,D : bouche intérieure (bas-g, bas-d, haut-d, haut-g)
    const A = [-xi, yi, zIn], B = [xi, yi, zIn], C = [xi, yt, zIn], D = [-xi, yt, zIn];
    // E,F,G,H : bouche extérieure, au sol
    const E = [-xo, yo, zOut], F = [xo, yo, zOut], G = [xo, yo, zOut], H = [-xo, yo, zOut];
    const quads = [
      [A, D, H, E],   // flanc gauche
      [B, C, G, F],   // flanc droit
      [C, D, H, G],   // dessus
    ];
    const pos = [], uv = [];
    for (const [a, b, c, d] of quads) {
      pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      uv.push(0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0);
    }
    hazeGeo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    hazeGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    hazeGeo.computeVertexNormals();
  }

  const beamMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0xffb277) },
      uTime: { value: 0 },
      uAlpha: { value: 0.09 },
      tNoise: { value: T.noise() },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uColor;
      uniform float uTime;
      uniform float uAlpha;
      uniform sampler2D tNoise;
      varying vec2 vUv;
      void main() {
        float edge = smoothstep(0.0, 0.3, vUv.x) * (1.0 - smoothstep(0.6, 1.0, vUv.x));
        float fade = smoothstep(1.0, 0.06, vUv.y);
        float n = texture2D(tNoise, vec2(vUv.x * 1.2, vUv.y * 1.8 - uTime * 0.025)).r;
        float a = edge * fade * (0.35 + 0.8 * n) * uAlpha;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false,
  });
  const beam = new THREE.Mesh(hazeGeo, beamMat);
  beam.renderOrder = 3;
  group.add(beam);

  // deux faisceaux de lanterne qui grattent la façade (pas d'ombre : menu only)
  const lanternSpots = [];
  for (const s of [1, -1]) {
    const l = new THREE.SpotLight(0xffa25c, 26, 24, 0.5, 0.72, 1.5);
    l.position.set(s * 3.2, 3.15, chapel.door.z + 1.1);
    l.target.position.set(s * 1.05, 6.4, chapel.door.z - 1.6);
    group.add(l, l.target);
    lanternSpots.push({ light: l, base: l.intensity, phase: rng() * 10 });
  }

  // (pas de rim artificiel : la lune directionnelle suffit, un point froid de
  // plus produisait un halo bleu plaqué sur le flanc de la chapelle)

  /* ─────────────── braises au seuil ─────────────── */

  const EMBERS = 80;
  const emberPos = new Float32Array(EMBERS * 3);
  const emberSeed = new Float32Array(EMBERS);
  const emberSpeed = new Float32Array(EMBERS);
  const emberBase = new THREE.Vector3();
  for (let i = 0; i < EMBERS; i++) {
    emberBase.set(randRange(rng, -3.8, 3.8), randRange(rng, 0.2, 3.4), chapel.door.z + randRange(rng, -0.4, 3.8));
    emberPos[i * 3] = emberBase.x;
    emberPos[i * 3 + 1] = emberBase.y;
    emberPos[i * 3 + 2] = emberBase.z;
    emberSeed[i] = rng() * 10;
    emberSpeed[i] = 0.18 + rng() * 0.36;
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
  const emberMat = new THREE.PointsMaterial({
    map: dot,
    color: EMBER,
    size: 0.22,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true,
    fog: true,
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  embers.frustumCulled = false;
  group.add(embers);

  /* ─────────────── brume basse ─────────────── */

  const mist = [];
  for (let i = 0; i < 16; i++) {
    const spr = glowSprite(puff, i % 3 === 0 ? 0xb49a86 : COLD, 0.07 + rng() * 0.045);
    spr.material.blending = THREE.AdditiveBlending;
    // une moitié devant la façade, l'autre le long des flancs
    const front = i % 2 === 0;
    spr.position.set(
      front ? randRange(rng, -18, 18) : (rng() < 0.5 ? -1 : 1) * randRange(rng, 8, 18),
      randRange(rng, 0.2, 1.5),
      front ? randRange(rng, 12, 32) : randRange(rng, -12, 12),
    );
    const s = randRange(rng, 10, 20);
    spr.scale.set(s, s * 0.5, 1);
    group.add(spr);
    mist.push({ spr, base: spr.material.opacity, phase: rng() * 10, drift: randRange(rng, -0.2, 0.2) });
  }

  /* ─────────── le rai de la rosace : la lumière tombe dans le cimetière ───────────
     La rosace est le point le plus haut et le plus coloré de la façade ; on lui
     donne un volume de lumière qui descend jusqu'à l'allée, visible de biais.
     Même shader que le faisceau du seuil (bruit qui dérive, aucune texture
     animée), donc aucun coût GPU nouveau. */

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  function frustumGeo(inner, outer) {
    const quads = [
      [inner[0], inner[1], outer[1], outer[0]],
      [inner[3], inner[2], outer[2], outer[3]],
      [inner[0], inner[3], outer[3], outer[0]],
      [inner[1], inner[2], outer[2], outer[1]],
    ];
    const pos = [], uv = [];
    for (const [a, b, c, d] of quads) {
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
      uv.push(0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

  const roseBeamMat = beamMat.clone();
  roseBeamMat.uniforms.uColor.value = new THREE.Color(0xffc386);
  roseBeamMat.uniforms.uAlpha.value = 0.05;
  const roseBeam = new THREE.Mesh(
    frustumGeo(
      [V(-1.05, 9.1, 12.35), V(1.05, 9.1, 12.35), V(1.05, 11.2, 12.35), V(-1.05, 11.2, 12.35)],
      [V(-3.2, 0.06, 23.4), V(3.2, 0.06, 23.4), V(3.2, 0.06, 26.2), V(-3.2, 0.06, 26.2)],
    ),
    roseBeamMat,
  );
  roseBeam.renderOrder = 3;
  group.add(roseBeam);

  // poussière en suspension dans le rai : elle rend le volume lisible sans brume
  const DUST = 90;
  const dustArr = new Float32Array(DUST * 3);
  const dustSpeed = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) {
    const k = rng();
    dustArr[i * 3] = randRange(rng, -3.6, 3.6) * (0.35 + k * 0.65);
    dustArr[i * 3 + 1] = randRange(rng, 0.2, 11.2);
    dustArr[i * 3 + 2] = randRange(rng, 12.6, 23.6);
    dustSpeed[i] = randRange(rng, 0.05, 0.22);
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustArr, 3));
  const dustMat = new THREE.PointsMaterial({
    map: dot, color: 0xffd7a0, size: 0.13, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  group.add(dust);

  /* ─────────── la lune derrière le clocher ───────────
     Deux halos froids posés DERRIÈRE la tour : la pierre se découpe en
     silhouette et le clocher cesse de se perdre dans le ciel. */

  const moonVeil = glowSprite(halo, 0xa9cfe2, 0.26);
  moonVeil.position.set(0.6, 15.4, 9.0);
  moonVeil.scale.set(17, 21, 1);
  group.add(moonVeil);
  const moonVeil2 = glowSprite(halo, 0xeaf3fa, 0.19);
  moonVeil2.position.set(0.3, 14.4, 8.4);
  moonVeil2.scale.set(8.5, 12.5, 1);
  group.add(moonVeil2);

  /* ─────────────── cycle ─────────────── */

  let active = true;
  let t = 0;

  function setActive(on) {
    active = !!on;
    group.visible = active;
    chapel.glowK = active ? 2.05 : 1;
    for (const s of lanternSpots) s.light.intensity = active ? s.base : 0;
  }

  function update(dt, elapsed) {
    if (!active) return;
    t = elapsed != null ? elapsed : t + dt;

    for (const w of windowGlows) {
      const k = 0.82 + 0.18 * Math.sin(t * (w.rose ? 0.55 : 0.8) + w.phase);
      w.spr.material.opacity = w.base * k;
      const sc = 1 + 0.035 * Math.sin(t * 0.9 + w.phase);
      w.spr.scale.set(w.size.x * sc, w.size.y * sc, 1);
    }

    // seuil : respiration des lanternes
    beamMat.uniforms.uTime.value = t;
    doorGlow.material.opacity = 0.4 + 0.06 * Math.sin(t * 1.7) + 0.025 * Math.sin(t * 5.3);
    spill.material.opacity = 0.3 + 0.05 * Math.sin(t * 1.9 + 1.1);
    doorMist.material.opacity = 0.09 + 0.025 * Math.sin(t * 1.25 + 0.7);
    // le rai de la rosace respire lentement, la poussière tombe
    roseBeamMat.uniforms.uTime.value = t;
    roseBeamMat.uniforms.uAlpha.value = 0.04 + 0.014 * Math.sin(t * 0.42) + 0.007 * Math.sin(t * 1.63);
    moonVeil.material.opacity = 0.23 + 0.05 * Math.sin(t * 0.31);
    moonVeil2.material.opacity = 0.16 + 0.035 * Math.sin(t * 0.47 + 1.2);
    const da = dustGeo.attributes.position.array;
    for (let i = 0; i < DUST; i++) {
      da[i * 3 + 1] -= dustSpeed[i] * dt;
      da[i * 3] += Math.sin(t * 0.6 + i) * dt * 0.05;
      if (da[i * 3 + 1] < 0.15) {
        da[i * 3] = randRange(rng, -3.4, 3.4);
        da[i * 3 + 1] = randRange(rng, 8.5, 11.4);
        da[i * 3 + 2] = randRange(rng, 12.6, 22.6);
      }
    }
    dustGeo.attributes.position.needsUpdate = true;
    for (const s of lanternSpots) {
      s.light.intensity = s.base * (0.86 + 0.1 * Math.sin(t * 7.1 + s.phase) + 0.06 * Math.sin(t * 17.3 + s.phase));
    }

    // braises
    const arr = emberGeo.attributes.position.array;
    for (let i = 0; i < EMBERS; i++) {
      arr[i * 3 + 1] += emberSpeed[i] * dt;
      arr[i * 3] += Math.sin(t * 1.3 + emberSeed[i]) * dt * 0.18;
      if (arr[i * 3 + 1] > 5.2) {
        arr[i * 3] = randRange(rng, -3.4, 3.4);
        arr[i * 3 + 1] = 0.25;
        arr[i * 3 + 2] = chapel.door.z + randRange(rng, -0.4, 3.2);
      }
    }
    emberGeo.attributes.position.needsUpdate = true;

    // brume : dérive lente, aucune texture à faire glisser
    for (const m of mist) {
      m.spr.position.x += m.drift * dt;
      if (m.spr.position.x > 18) m.spr.position.x = -18;
      if (m.spr.position.x < -18) m.spr.position.x = 18;
      m.spr.material.opacity = m.base * (0.75 + 0.25 * Math.sin(t * 0.22 + m.phase));
    }
  }

  setActive(false);

  return { group, setActive, update, get active() { return active; } };
}
