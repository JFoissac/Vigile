// zombie_anim.js — animation par articulation, sans dépendance.
//
// Sept états : idle, walk, run, attack (armement puis frappe télégraphiée),
// hit, death (chute puis relâchement des membres) et emerge (sous terre → doigts
// qui percent → agrippement → hissage → redressement).
//
// Chaque pose est une liste d'offsets ajoutés à la pose de repos de la
// charpente (zombie_rig.js) ; on amortit vers la cible pour éviter les cassures
// entre états. Les états "emerge" et "death" sont dirigés par le temps et non
// amortis, pour que la sortie de terre reste exactement calée sur la timeline.

import { clamp, lerp } from "../core/util.js";

/* ─────────────────────── sortie de terre : timeline ─────────────────────── */

export const EMERGE = {
  minDuration: 1.6,
  maxDuration: 2.4,
  maxDelay: 0.45,
  // fractions de la hauteur enterrée : la courbe ne remonte jamais (aucun pop)
  // et se hisse VITE au début — sinon le mort reste une tête dans un trou
  // pendant les deux tiers de l'animation.
  yKeys: [
    [0.00, -1.00], [0.08, -0.96], [0.18, -0.78], [0.30, -0.58],
    [0.42, -0.45], [0.55, -0.32], [0.70, -0.18], [0.84, -0.06],
    [0.94, -0.01], [1.00, 0.00],
  ],
  // instants où la terre craque (mottes + poussière + secousse)
  beats: [0.14, 0.30, 0.56],
};

/** Courbe verticale de l'émergence : renvoie une fraction de -1 à 0. */
export function emergeY(k) {
  const keys = EMERGE.yKeys;
  k = clamp(k, 0, 1);
  for (let i = 1; i < keys.length; i++) {
    if (k <= keys[i][0]) {
      const [k0, v0] = keys[i - 1];
      const [k1, v1] = keys[i];
      const u = k1 === k0 ? 0 : (k - k0) / (k1 - k0);
      return lerp(v0, v1, u * u * (3 - 2 * u));
    }
  }
  return 0;
}

/** Progression de la pose d'émergence (0 = enterré, 1 = debout). */
export function emergeStage(k) {
  k = clamp(k, 0, 1);
  if (k < 0.14) return { name: "sous-sol", arms: 0, haul: 0 };
  if (k < 0.46) return { name: "percée", arms: 1, haul: 0 };
  if (k < 0.68) return { name: "agrippement", arms: 0.72, haul: 0.35 };
  if (k < 0.88) return { name: "hissage", arms: 0.25, haul: 0.8 };
  return { name: "redressement", arms: 0, haul: 1 };
}

/* ─────────────────────────── outils de pose ─────────────────────────── */

const ZERO = [0, 0, 0];
const JOINTS = [
  "pelvis", "torso", "chest", "head", "jaw",
  "shL", "shR", "elL", "elR", "wrL", "wrR",
  "hipL", "hipR", "kneeL", "kneeR", "ankL", "ankR",
];

function pose() {
  const p = { rootX: 0, rootY: 0, pelvisY: 0, sway: 0 };
  for (const j of JOINTS) p[j] = [0, 0, 0];
  return p;
}

function add(p, j, x = 0, y = 0, z = 0) {
  const a = p[j] || (p[j] = [0, 0, 0]);
  a[0] += x; a[1] += y; a[2] += z;
}

function key(k, keys) {
  if (k <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (k <= keys[i][0]) {
      const [k0, v0] = keys[i - 1];
      const [k1, v1] = keys[i];
      const u = k1 === k0 ? 0 : (k - k0) / (k1 - k0);
      return lerp(v0, v1, u * u * (3 - 2 * u));
    }
  }
  return keys[keys.length - 1][1];
}

/* ─────────────────────────── poses ─────────────────────────── */

function poseIdle(p, s, B) {
  const t = s.t;
  const breathe = Math.sin(t * 1.15);
  add(p, "torso", breathe * 0.018, Math.sin(t * 0.37) * 0.05, Math.sin(t * 0.6) * 0.012);
  add(p, "chest", -breathe * 0.012, Math.sin(t * 0.31 + 1) * 0.06);
  add(p, "head", 0.04 + breathe * 0.02, Math.sin(t * 0.23) * 0.22, Math.sin(t * 0.5 + 2) * 0.05);
  add(p, "jaw", 0.05 + Math.max(0, breathe) * 0.06);
  add(p, "shL", -0.06, 0, 0.02 + breathe * 0.01);
  add(p, "shR", -0.04, 0, -0.02 - breathe * 0.01);
  add(p, "elL", -0.18 - breathe * 0.04);
  add(p, "elR", -0.14 - breathe * 0.04);
  add(p, "wrL", 0.18);
  add(p, "wrR", 0.14);
  add(p, "kneeL", 0.10);
  add(p, "kneeR", 0.07);
  p.pelvisY += breathe * 0.006;
}

function poseWalk(p, s, B, run) {
  const amp = (run ? 0.95 : 0.58) * (0.42 + s.speed01 * 0.58);
  const ph = s.phase;
  const sin = Math.sin(ph), cos = Math.cos(ph);

  // jambes : la hanche balance, le genou se plie au retour
  add(p, "hipL", sin * 0.52 * amp, 0, 0.02);
  add(p, "hipR", -sin * 0.52 * amp, 0, -0.02);
  const flexL = Math.max(0, Math.sin(ph + 2.3)) * (run ? 1.15 : 0.62) * amp;
  const flexR = Math.max(0, Math.sin(ph + 2.3 + Math.PI)) * (run ? 1.15 : 0.62) * amp;
  add(p, "kneeL", flexL);
  add(p, "kneeR", flexR);
  add(p, "ankL", -sin * 0.16 * amp - flexL * 0.35);
  add(p, "ankR", sin * 0.16 * amp - flexR * 0.35);

  // bassin : gîte et tangage
  add(p, "pelvis", 0, -sin * 0.10 * amp, cos * 0.045 * amp);
  p.pelvisY += Math.abs(cos) * (run ? 0.05 : 0.025) * amp;

  // torse : contre-rotation, plus penché en course
  add(p, "torso", Math.abs(cos) * 0.05 * amp, sin * 0.14 * amp, sin * 0.05 * amp);
  add(p, "chest", Math.abs(cos) * 0.02 * amp, sin * 0.06 * amp);

  // bras : opposés aux jambes
  if (run) {
    add(p, "shL", -0.45 + sin * 0.55 * amp, 0, 0.10);
    add(p, "shR", -0.45 - sin * 0.55 * amp, 0, -0.10);
    add(p, "elL", -1.00 - Math.max(0, -sin) * 0.45 * amp);
    add(p, "elR", -1.00 - Math.max(0, sin) * 0.45 * amp);
    add(p, "wrL", 0.15);
    add(p, "wrR", 0.15);
  } else {
    add(p, "shL", -0.55 + sin * 0.26 * amp, 0, 0.10);
    add(p, "shR", -0.52 - sin * 0.26 * amp, 0, -0.10);
    add(p, "elL", -0.34 - Math.max(0, -sin) * 0.22 * amp);
    add(p, "elR", -0.32 - Math.max(0, sin) * 0.22 * amp);
    add(p, "wrL", 0.28 + sin * 0.12 * amp);
    add(p, "wrR", 0.26 - sin * 0.12 * amp);
  }

  // tête : ballante, contre-sway
  add(p, "head", 0.05 + Math.abs(sin) * 0.05 * amp, -sin * 0.10 * amp, -sin * 0.06 * amp);
  add(p, "jaw", 0.08 + Math.abs(cos) * 0.06 * amp);

  if (run) add(p, "torso", 0.16, 0, 0);
}

function poseAttack(p, s, B) {
  const u = s.attackU;
  // 0 → 0.45 : armement (bras levés, buste qui se charge, mâchoire ouverte)
  // 0.45 → 0.62 : frappe télégraphiée (abattage des deux bras, buste jeté)
  // 0.62 → 1 : récupération
  const wind = key(u, [[0, 0], [0.18, 0.55], [0.45, 1], [0.62, 0], [1, 0]]);
  const strike = key(u, [[0, 0], [0.45, 0], [0.55, 1], [0.68, 0.55], [1, 0]]);

  add(p, "shL", -2.05 * wind - 0.30 * strike, 0, 0.24 * wind);
  add(p, "shR", -2.15 * wind - 0.25 * strike, 0, -0.24 * wind);
  add(p, "elL", -0.55 * wind + 0.55 * strike);
  add(p, "elR", -0.60 * wind + 0.50 * strike);
  add(p, "wrL", -0.35 * wind + 0.50 * strike);
  add(p, "wrR", -0.30 * wind + 0.45 * strike);
  add(p, "torso", -0.22 * wind + 0.34 * strike, 0.10 * wind);
  add(p, "chest", -0.10 * wind + 0.16 * strike);
  add(p, "head", -0.10 * wind + 0.28 * strike, 0.05 * wind);
  add(p, "jaw", 0.55 * wind + 0.22 * strike);
  add(p, "kneeL", 0.18 * wind + 0.1 * strike);
  add(p, "kneeR", 0.18 * wind + 0.1 * strike);
  p.pelvisY -= 0.05 * wind;
}

function poseHit(p, s) {
  const k = s.hitK;
  add(p, "torso", -0.30 * k, 0.10 * k, 0.08 * k);
  add(p, "chest", -0.16 * k);
  add(p, "head", -0.42 * k, 0.18 * k, 0.20 * k);
  add(p, "jaw", 0.30 * k);
  add(p, "shL", 0.30 * k, 0, 0.30 * k);
  add(p, "shR", 0.34 * k, 0, -0.26 * k);
  add(p, "elL", 0.25 * k);
  add(p, "elR", 0.20 * k);
  add(p, "kneeL", 0.25 * k);
  add(p, "kneeR", 0.22 * k);
  p.pelvisY -= 0.06 * k;
}

function poseDeath(p, s) {
  const t = s.deathT;
  // 1) genoux qui cèdent, 2) chute, 3) membres relâchés au sol
  const buckle = key(t, [[0, 0], [0.22, 1], [0.55, 0.85], [1.4, 0.4], [3, 0.25]]);
  const fall = key(t, [[0, 0], [0.18, 0.05], [0.55, 0.9], [0.95, 1], [1.4, 1.02], [4, 1.02]]);
  const limp = key(t, [[0, 0], [0.5, 0.3], [1.0, 1], [2.2, 1]]);

  p.rootX = fall * 1.52;
  p.rootY = fall * 0.10;
  p.pelvisY = -buckle * 0.34;
  add(p, "hipL", -0.55 * buckle, 0, -0.10 * buckle);
  add(p, "hipR", -0.40 * buckle, 0, 0.14 * buckle);
  add(p, "kneeL", 1.15 * buckle, 0, 0.10 * buckle);
  add(p, "kneeR", 0.95 * buckle);
  add(p, "ankL", -0.35 * buckle);
  add(p, "ankR", -0.30 * buckle);
  add(p, "torso", 0.35 * buckle + 0.18 * limp, 0, 0.12 * limp);
  add(p, "chest", 0.12 * buckle);
  add(p, "head", 0.45 * buckle + 0.20 * limp, 0.30 * limp, 0.35 * limp);
  add(p, "jaw", 0.55 * limp);
  add(p, "shL", 0.55 * limp - 0.15 * buckle, 0, 0.95 * limp);
  add(p, "shR", 0.62 * limp - 0.12 * buckle, 0, -0.88 * limp);
  add(p, "elL", 0.35 * limp);
  add(p, "elR", 0.30 * limp);
  add(p, "wrL", 0.45 * limp);
  add(p, "wrR", 0.42 * limp);
}

function poseEmerge(p, s) {
  const k = s.emergeK;

  // bras : montent à travers la terre, agrippent, puis hissent le corps
  // (le buste est penché : l'angle local compense le tangage du torse)
  const shUp = key(k, [
    [0.00, -0.95], [0.10, -1.10], [0.20, -2.60], [0.30, -3.50], [0.44, -3.45],
    [0.54, -2.75], [0.66, -1.60], [0.80, -1.00], [1.00, -0.95],
  ]);
  const el = key(k, [
    [0.00, -0.25], [0.20, 0.05], [0.30, 0.10], [0.44, -0.18],
    [0.56, 0.55], [0.66, 1.10], [0.80, 0.30], [1.00, -0.25],
  ]);
  const wr = key(k, [
    [0.00, 0.20], [0.20, -0.30], [0.32, -0.55], [0.50, -0.30],
    [0.62, 0.55], [0.78, 0.30], [1.00, 0.20],
  ]);
  add(p, "shL", shUp, 0, 0.22 + key(k, [[0.2, 0.1], [0.4, 0.02], [1, 0]]));
  add(p, "shR", shUp + 0.04 + (s.emergeBias || 0) * 0.16, 0, -0.22 - key(k, [[0.2, 0.1], [0.4, 0.02], [1, 0]]));
  add(p, "elL", el);
  add(p, "elR", el + 0.05);
  add(p, "wrL", wr);
  add(p, "wrR", wr + 0.05);

  // buste : plaqué au sol, puis se redresse
  add(p, "torso", key(k, [
    [0.00, 0.10], [0.12, 0.02], [0.30, 0.45], [0.50, 0.50], [0.66, 0.35], [0.84, 0.11], [1.00, 0],
  ]), key(k, [[0.0, 0], [0.3, -0.10], [0.6, 0.12], [1.0, 0]]));
  add(p, "chest", key(k, [[0.0, 0], [0.3, 0.16], [0.6, 0.12], [1.0, 0]]));
  add(p, "head", key(k, [
    [0.00, 0.10], [0.26, 0.62], [0.44, 0.52], [0.62, 0.12], [0.80, -0.12], [1.00, 0.02],
  ]), key(k, [[0.0, 0], [0.4, 0.12], [0.7, -0.10], [1.0, 0]]) + (s.emergeBias || 0) * 0.12);
  add(p, "jaw", key(k, [[0.00, 0.10], [0.24, 0.62], [0.46, 0.45], [0.70, 0.20], [1.00, 0.06]]));

  // jambes : écartées sous terre, un genou se plante pour le hissage
  add(p, "hipL", key(k, [[0.0, 0.15], [0.4, 0.05], [0.62, -0.55], [0.82, -0.12], [1.0, 0]]), 0,
    key(k, [[0.0, 0.20], [0.5, 0.10], [1.0, 0]]));
  add(p, "hipR", key(k, [[0.0, -0.10], [0.4, -0.05], [0.66, 0.20], [0.84, 0.05], [1.0, 0]]), 0,
    key(k, [[0.0, -0.20], [0.5, -0.10], [1.0, 0]]));
  add(p, "kneeL", key(k, [[0.0, 0.45], [0.4, 0.30], [0.62, 1.05], [0.84, 0.25], [1.0, 0.05]]));
  add(p, "kneeR", key(k, [[0.0, 0.30], [0.4, 0.25], [0.7, 0.55], [0.84, 0.15], [1.0, 0.03]]));
  add(p, "ankL", key(k, [[0.0, -0.15], [0.7, -0.25], [1.0, 0]]));
  add(p, "ankR", key(k, [[0.0, -0.15], [0.7, -0.10], [1.0, 0]]));

  p.sway = Math.sin(k * 13.5) * 0.055 * (1 - k);
  p.rootY = 0;
}

/* ─────────────────────────── animator ─────────────────────────── */

export function createAnimator(rig, { seed = 1 } = {}) {
  const joints = rig.joints;
  const rest = rig.rest;
  const current = {};
  for (const j of JOINTS) current[j] = [0, 0, 0];
  let pelvisBaseY = joints.pelvis ? joints.pelvis.position.y : 0;
  let anim = "idle";
  let t = 0;
  let lastClip = null;

  function apply(p, dt, snappy) {
    const lambda = snappy ? 26 : 15;
    const k = 1 - Math.exp(-lambda * dt);
    for (const name of JOINTS) {
      const g = joints[name];
      if (!g) continue;
      const tgt = p[name] || ZERO;
      const cur = current[name];
      if (snappy) {
        cur[0] = tgt[0]; cur[1] = tgt[1]; cur[2] = tgt[2];
      } else {
        cur[0] += (tgt[0] - cur[0]) * k;
        cur[1] += (tgt[1] - cur[1]) * k;
        cur[2] += (tgt[2] - cur[2]) * k;
      }
      const r = rest[name] || ZERO;
      g.rotation.set(r[0] + cur[0], r[1] + cur[1], r[2] + cur[2]);
    }
    if (joints.pelvis) joints.pelvis.position.y = pelvisBaseY + p.pelvisY;
    if (rig.root) {
      rig.root.rotation.x = (rig.rootRestX || 0) + p.rootX;
      rig.root.rotation.z = p.sway || 0;
      rig.root.position.y = p.rootY || 0;
    }
  }

  function update(dt, s) {
    t += dt;
    const B = rig.body || {};
    const p = pose();
    anim = s.anim || "idle";

    if (anim === "emerge") {
      poseEmerge(p, s);
      apply(p, dt, true);
    } else if (anim === "death") {
      poseDeath(p, s);
      apply(p, dt, false);
    } else {
      if (anim === "idle") poseIdle(p, { ...s, t }, B);
      else if (anim === "run") poseWalk(p, s, B, true);
      else poseWalk(p, s, B, false);
      if (anim === "attack") poseAttack(p, s, B);
      if (s.hitK > 0.001) poseHit(p, s);
      apply(p, dt, anim === "attack");
    }
  }

  return {
    update,
    get anim() { return anim; },
    get time() { return t; },
    reset() {
      for (const j of JOINTS) current[j][0] = current[j][1] = current[j][2] = 0;
      if (joints.pelvis) joints.pelvis.position.y = pelvisBaseY;
      if (rig.root) { rig.root.rotation.x = rig.rootRestX || 0; rig.root.rotation.z = 0; }
    },
  };
}
