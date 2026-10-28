// util.js — petites mathématiques, aléatoire déterministe, formats.
// Aucune dépendance : ce fichier doit rester importable partout.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : (v - a) / (b - a));
export const smoothstep = (a, b, v) => {
  const t = clamp(invLerp(a, b, v), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Amortissement indépendant du framerate. */
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const randRange = (rng, a, b) => a + (b - a) * rng();
export const pick = (rng, arr) => arr[Math.floor(rng() * arr.length) % arr.length];
export const deg = (r) => (r * 180) / Math.PI;
export const rad = (d) => (d * Math.PI) / 180;

/** Mulberry32 : rapide, déterministe, suffisant pour du décor. */
export function makeRng(seed = 0x9e3779b9) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Bruit de valeur 1D lissé, pratique pour les tremblements organiques. */
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    let t = Math.sin((n + seed * 57.13) * 127.1) * 43758.5453;
    return t - Math.floor(t);
  };
  const u = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), u);
}

/** Approximation du bruit 2D (utilisé pour les textures et le brouillard). */
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const h = (a, b) => {
    let t = Math.sin(a * 127.1 + b * 311.7 + seed * 74.7) * 43758.5453;
    return t - Math.floor(t);
  };
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  return lerp(lerp(h(ix, iy), h(ix + 1, iy), ux), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), ux), uy);
}

const ROMAN = [
  ["M", 1000], ["CM", 900], ["D", 500], ["CD", 400], ["C", 100], ["XC", 90],
  ["L", 50], ["XL", 40], ["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1],
];
export function roman(n) {
  n = Math.max(0, Math.round(n));
  if (n === 0) return "—";
  let out = "";
  for (const [s, v] of ROMAN) {
    while (n >= v) { out += s; n -= v; }
  }
  return out;
}

/** 22.0 → "22:00" ; 25.5 → "01:30". */
export function clockLabel(hourFloat) {
  const h = ((hourFloat % 24) + 24) % 24;
  const hh = Math.floor(h);
  const mm = Math.floor((h - hh) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Nom de l'office monastique pour une heure de nuit. */
export function officeName(hourFloat) {
  const h = ((hourFloat % 24) + 24) % 24;
  if (h >= 21.5 || h < 0.5) return "Vêpres";
  if (h < 3) return "Matines";
  if (h < 5) return "Laudes";
  return "Aube";
}

export function fmtDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/** Distance d'un point à un segment en 2D. */
export function distToSegment2(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = clamp(t, 0, 1);
  const x = ax + dx * t, z = az + dz * t;
  return Math.hypot(px - x, pz - z);
}

export function angleDelta(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

/** Petit réservoir de valeurs pour les statistiques du HUD. */
export class Ring {
  constructor(size = 120) { this.size = size; this.values = new Float32Array(size); this.i = 0; this.count = 0; }
  push(v) { this.values[this.i] = v; this.i = (this.i + 1) % this.size; this.count = Math.min(this.count + 1, this.size); }
  avg() {
    let s = 0;
    for (let k = 0; k < this.count; k++) s += this.values[k];
    return this.count ? s / this.count : 0;
  }
  max() {
    let m = 0;
    for (let k = 0; k < this.count; k++) m = Math.max(m, this.values[k]);
    return m;
  }
}
