// citizen.js — les habitants du village : ils vaquent sur la place, fuient les
// morts, et le joueur ne peut PAS les toucher (ils ne sont pas dans les cibles de
// tir). Objectif : en garder le plus possible en vie.

import * as THREE from "three";
import { makeRng, clamp } from "../core/util.js";

// vêtements clairs : de nuit, les villageois doivent se lire au premier coup d'œil
// (revue du 22/10 : jugés trop sombres en jeu)
const CLOTH = [0xa08a6c, 0x8a99a4, 0xb09a72, 0x8f9a7c, 0x9a8894];

function buildBody(rng, color) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color, roughness: 0.95, emissive: color, emissiveIntensity: 0.06 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd8b394, roughness: 0.9, emissive: 0x2a1e16, emissiveIntensity: 0.15 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x2a2320, roughness: 1 });

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.26, 0.62, 8), cloth);
  torso.position.y = 1.02;
  g.add(torso);
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.34, 0.42, 8), cloth);
  skirt.position.y = 0.52;
  g.add(skirt);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 8), skin);
  head.position.y = 1.5;
  g.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.152, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  cap.position.y = 1.53;
  g.add(cap);
  for (const s of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.52, 6), cloth);
    arm.position.set(s * 0.29, 1.05, 0);
    arm.rotation.z = s * 0.16;
    g.add(arm);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.06, 0.5, 6), cloth);
    leg.position.set(s * 0.11, 0.28, 0);
    g.add(leg);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  g.scale.setScalar(0.94 + rng() * 0.12);
  return g;
}

export function createCitizens({ scene, count = 6, groundAt, center = { x: 0, z: 20 }, radius = 9 }) {
  const rng = makeRng(77123);
  const list = [];
  const group = new THREE.Group();
  group.name = "citoyens";
  scene.add(group);

  // un cercle de villageois autour de la place, sans se marcher dessus
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rng() * 0.5;
    const r = radius * (0.35 + rng() * 0.5);
    const x = center.x + Math.cos(a) * r;
    const z = center.z + Math.sin(a) * r;
    const body = buildBody(rng, CLOTH[i % CLOTH.length]);
    body.position.set(x, groundAt(x, z), z);
    body.rotation.y = rng() * Math.PI * 2;
    group.add(body);
    list.push({
      pos: body.position, group: body, alive: true,
      hp: 70, maxHp: 70, radius: 0.32,
      speed: 1.7, t: rng() * 6, wanderT: 0,
      target: { x, z }, home: { x, z },
      hurtT: 0, deathT: 0,
      hurt(dmg) {
        if (!this.alive) return;
        this.hp -= dmg;
        this.hurtT = 0.25;
        if (this.hp <= 0) {
          this.alive = false;
          this.deathT = 0;
        }
      },
    });
  }

  /** Fuite : un mort proche, et le villageois court vers son point d'attache. */
  function fleeFrom(px, pz) {
    let best = null, bd = 1e9;
    for (const c of list) {
      if (!c.alive) continue;
      const d = Math.hypot(c.pos.x - px, c.pos.z - pz);
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  }

  function update(dt, { enemies = [], colliders = [] } = {}) {
    for (const c of list) {
      if (!c.alive) {
        // s'affaisse sur place, puis reste au sol
        c.deathT += dt;
        c.group.rotation.z = Math.min(1.45, c.deathT * 3.2);
        c.group.position.y = Math.max(groundAt(c.pos.x, c.pos.z) - 0.15, c.group.position.y - dt * 0.4);
        continue;
      }
      // une menace à moins de 7 m ? on fuit vers un point à l'opposé
      let threat = null, td = 1e9;
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.pos.x - c.pos.x, e.pos.z - c.pos.z);
        if (d < 7 && d < td) { td = d; threat = e; }
      }
      let tx, tz, speed = c.speed;
      if (threat) {
        tx = c.pos.x + (c.pos.x - threat.pos.x) * 2.4;
        tz = c.pos.z + (c.pos.z - threat.pos.z) * 2.4;
        speed *= 1.15;
      } else {
        c.wanderT -= dt;
        if (c.wanderT <= 0) {
          c.wanderT = 2.5 + rng() * 4;
          const a = rng() * Math.PI * 2;
          const r = rng() * radius * 0.8;
          c.target = { x: c.home.x + Math.cos(a) * r, z: c.home.z + Math.sin(a) * r };
        }
        tx = c.target.x;
        tz = c.target.z;
      }
      const dx = tx - c.pos.x, dz = tz - c.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.35) {
        const vx = (dx / d) * speed * dt;
        const vz = (dz / d) * speed * dt;
        const nx = c.pos.x + vx, nz = c.pos.z + vz;
        // murs : on longe, on ne traverse pas
        let blocked = false;
        for (const col of colliders) {
          if (col.keepIn) continue;
          if (col.r != null) {
            if (Math.hypot(nx - col.x, nz - col.z) < col.r + c.radius) { blocked = true; break; }
          } else if (Math.abs(nx - col.x) < col.hw + c.radius && Math.abs(nz - col.z) < col.hd + c.radius) {
            blocked = true; break;
          }
        }
        if (!blocked) {
          c.pos.x = clamp(nx, center.x - radius * 1.6, center.x + radius * 1.6);
          c.pos.z = clamp(nz, center.z - radius * 1.6, center.z + radius * 1.6);
        } else {
          c.wanderT = 0;
        }
        c.group.rotation.y = Math.atan2(dx, dz);
        c.t += dt * speed;
        c.group.position.y = groundAt(c.pos.x, c.pos.z) + Math.abs(Math.sin(c.t * 5)) * 0.045;
      }
      if (c.hurtT > 0) {
        c.hurtT = Math.max(0, c.hurtT - dt);
        c.group.rotation.z = Math.sin(c.hurtT * 40) * 0.06;
      }
    }
  }

  const aliveCount = () => list.filter((c) => c.alive).length;

  function reset() {
    group.visible = active;
    for (const c of list) {
      c.alive = true;
      c.hp = c.maxHp;
      c.deathT = 0;
      c.group.rotation.z = 0;
      c.pos.set(c.home.x, groundAt(c.home.x, c.home.z), c.home.z);
    }
  }

  let active = true;

  return {
    group, list, update, reset, aliveCount,
    get total() { return list.length; },
    get active() { return active; },
    setActive(v) {
      active = !!v;
      group.visible = active;
      if (!active) reset();
    },
  };
}
