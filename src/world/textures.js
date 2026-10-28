// textures.js — toutes les textures du jeu, dessinées en canvas au démarrage.
// Aucun fichier image : zéro asset externe, tout est reproductible.

import * as THREE from "three";
import { makeRng, clamp, lerp } from "../core/util.js";

const cache = new Map();

function canvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, { srgb = true, repeat = [1, 1], wrap = THREE.RepeatWrapping } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = wrap;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/**
 * Carte de normales tangente dérivée de la luminance d'une texture déjà dessinée.
 * Donne du relief aux matériaux sans aucun asset : la pierre accuse ses joints,
 * le bois ses veines, le gravier ses cailloux. Cache par clé d'appel.
 */
function normalFromCanvas(src, strength = 1.8) {
  const W = src.width, H = src.height;
  const sd = src.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const lum = new Float32Array(W * H);
  for (let i = 0, p = 0; i < sd.length; i += 4, p++) {
    lum[p] = (sd[i] * 0.299 + sd[i + 1] * 0.587 + sd[i + 2] * 0.114) / 255;
  }
  // lissage 3×3 : sans lui, le grain par pixel produit des normales en pointes
  const sm = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let dy = -1; dy <= 1; dy++) {
        const yy = (y + dy + H) % H;
        for (let dx = -1; dx <= 1; dx++) s += lum[yy * W + ((x + dx + W) % W)];
      }
      sm[y * W + x] = s / 9;
    }
  }
  const out = canvas(W, H);
  const octx = out.getContext("2d");
  const img = octx.createImageData(W, H);
  const d = img.data;
  const at = (x, y) => sm[((y + H) % H) * W + ((x + W) % W)];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * W + x) * 4;
      d[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/**
 * Carte de rugosité : l'albédo converti en gris, étiré entre `lo` et `hi`.
 * Une pierre poreuse et une flaque ne réfléchissent pas la lune de la même façon.
 */
function roughFromCanvas(src, lo = 0.62, hi = 1.0) {
  const W = src.width, H = src.height;
  const sd = src.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, W, H).data;
  const out = canvas(W, H);
  const octx = out.getContext("2d");
  const img = octx.createImageData(W, H);
  const d = img.data;
  for (let i = 0; i < sd.length; i += 4) {
    const l = (sd[i] * 0.299 + sd[i + 1] * 0.587 + sd[i + 2] * 0.114) / 255;
    const v = clamp((lo + (1 - l) * (hi - lo)) * 255, 0, 255);
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  octx.putImageData(img, 0, 0);
  return out;
}

/** Grain fin par pixel : casse l'aspect « plastique » des aplats. */
function grain(ctx, w, h, amount, rng, mono = true) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = 1 + (rng() * 2 - 1) * amount;
    d[i] = clamp(d[i] * n, 0, 255);
    d[i + 1] = clamp(d[i + 1] * (mono ? n : 1 + (rng() * 2 - 1) * amount), 0, 255);
    d[i + 2] = clamp(d[i + 2] * n, 0, 255);
  }
  ctx.putImageData(img, 0, 0);
}

function softBlob(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace("ALPHA", alpha));
  g.addColorStop(0.55, color.replace("ALPHA", alpha * 0.55));
  g.addColorStop(1, color.replace("ALPHA", 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

/* ─────────────────────────── pierre de taille ─────────────────────────── */

function drawStone(seed, { dark = false } = {}) {
  const W = 512, H = 512;
  const c = canvas(W, H), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  const base = dark ? 38 : 54;
  ctx.fillStyle = dark ? "#1a1d1a" : "#262a25";
  ctx.fillRect(0, 0, W, H);

  const rows = 8, rh = H / rows;
  for (let row = 0; row < rows; row++) {
    let x = -rng() * 80;
    const y = row * rh;
    while (x < W) {
      const bw = 70 + rng() * 78;
      const l = base + (rng() * 2 - 1) * 9;
      const hue = 78 + rng() * 26;
      const sat = 4 + rng() * 7;
      ctx.fillStyle = `hsl(${hue} ${sat}% ${l}%)`;
      ctx.fillRect(x + 1.5, y + 1.5, bw - 3, rh - 3);

      // lumière frisante (haut-gauche) et ombre portée (bas-droite)
      ctx.fillStyle = `rgba(255,255,240,${0.05 + rng() * 0.05})`;
      ctx.fillRect(x + 1.5, y + 1.5, bw - 3, 2);
      ctx.fillRect(x + 1.5, y + 1.5, 2, rh - 3);
      ctx.fillStyle = `rgba(0,0,0,${0.16 + rng() * 0.1})`;
      ctx.fillRect(x + 1.5, y + rh - 4.5, bw - 3, 3);
      ctx.fillRect(x + bw - 4.5, y + 1.5, 3, rh - 3);

      // érosion : taches, trous, éclats
      const n = 3 + Math.floor(rng() * 7);
      for (let k = 0; k < n; k++) {
        const px = x + rng() * bw, py = y + rng() * rh;
        ctx.fillStyle = `rgba(${rng() > .5 ? "20,22,18" : "120,120,104"},${0.05 + rng() * 0.12})`;
        ctx.beginPath();
        ctx.ellipse(px, py, 1 + rng() * 8, 1 + rng() * 5, rng() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
      // mousse et lichen, plutôt vers le bas des murs
      if (rng() < 0.3 + (row / rows) * 0.35) {
        ctx.fillStyle = `rgba(${40 + rng() * 20},${56 + rng() * 26},${34 + rng() * 14},${0.1 + rng() * 0.18})`;
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.ellipse(x + rng() * bw, y + rh * (0.5 + rng() * 0.5), 3 + rng() * 13, 2 + rng() * 8, rng() * 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      x += bw;
    }
    // joint horizontal
    ctx.fillStyle = "rgba(9,11,9,.55)";
    ctx.fillRect(0, y, W, 2);
  }

  // fissures
  for (let k = 0; k < (dark ? 7 : 4); k++) {
    ctx.strokeStyle = `rgba(12,14,12,${0.25 + rng() * 0.3})`;
    ctx.lineWidth = 0.7 + rng() * 1.4;
    ctx.beginPath();
    let x = rng() * W, y = rng() * H;
    ctx.moveTo(x, y);
    for (let s = 0; s < 14; s++) {
      x += (rng() - 0.5) * 26;
      y += rng() * 16;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // coulures d'eau
  for (let k = 0; k < 9; k++) {
    const x = rng() * W, w = 2 + rng() * 9;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, "rgba(0,0,0,0)");
    g.addColorStop(0.5, `rgba(6,9,8,${0.05 + rng() * 0.09})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x, rng() * H * 0.3, w, H * (0.3 + rng() * 0.7));
  }

  grain(ctx, W, H, 0.075, rng);
  return c;
}

/* ─────────────────────────── sols ─────────────────────────── */

function drawFlagstone(seed) {
  const W = 512, H = 512;
  const c = canvas(W, H), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  ctx.fillStyle = "#141713";
  ctx.fillRect(0, 0, W, H);
  const rows = 5, rh = H / rows;
  for (let r = 0; r < rows; r++) {
    let x = -rng() * 60;
    while (x < W) {
      const bw = 80 + rng() * 70;
      const y = r * rh;
      const l = 30 + rng() * 12;
      ctx.fillStyle = `hsl(${72 + rng() * 30} ${3 + rng() * 5}% ${l}%)`;
      ctx.beginPath();
      const pad = 2.5 + rng() * 2;
      ctx.moveTo(x + pad + rng() * 3, y + pad);
      ctx.lineTo(x + bw - pad, y + pad + rng() * 3);
      ctx.lineTo(x + bw - pad - rng() * 3, y + rh - pad);
      ctx.lineTo(x + pad, y + rh - pad - rng() * 3);
      ctx.closePath();
      ctx.fill();
      // usure : le centre est poli, plus clair
      const g = ctx.createRadialGradient(x + bw / 2, y + rh / 2, 2, x + bw / 2, y + rh / 2, bw * 0.6);
      g.addColorStop(0, `rgba(180,182,164,${0.05 + rng() * 0.06})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(x, y, bw, rh);
      // salissure des joints
      ctx.strokeStyle = `rgba(8,10,8,${0.3 + rng() * 0.3})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      x += bw;
    }
  }
  // dalles manquantes / terre
  for (let k = 0; k < 7; k++) {
    const x = rng() * W, y = rng() * H, r = 8 + rng() * 26;
    softBlob(ctx, x, y, r, "rgba(12,12,9,ALPHA)", 0.5);
    for (let j = 0; j < 26; j++) {
      ctx.fillStyle = `rgba(${40 + rng() * 40},${36 + rng() * 30},${26 + rng() * 20},${0.3 + rng() * 0.5})`;
      ctx.fillRect(x + (rng() - .5) * r * 1.6, y + (rng() - .5) * r * 1.4, 1 + rng() * 3, 1 + rng() * 2);
    }
  }
  // fissures
  for (let k = 0; k < 6; k++) {
    ctx.strokeStyle = "rgba(9,10,8,.5)";
    ctx.lineWidth = 0.8 + rng();
    ctx.beginPath();
    let x = rng() * W, y = rng() * H;
    ctx.moveTo(x, y);
    for (let s = 0; s < 10; s++) { x += (rng() - .5) * 34; y += (rng() - .3) * 24; ctx.lineTo(x, y); }
    ctx.stroke();
  }
  grain(ctx, W, H, 0.08, rng);
  return c;
}

function drawGravel(seed) {
  const W = 512, H = 512;
  const c = canvas(W, H), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  ctx.fillStyle = "#5c574b";
  ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 90; k++) {
    softBlob(ctx, rng() * W, rng() * H, 20 + rng() * 70, "rgba(18,16,12,ALPHA)", 0.3);
  }
  for (let k = 0; k < 3600; k++) {
    const x = rng() * W, y = rng() * H;
    const r = 0.7 + rng() * 3.4;
    const l = 30 + rng() * 30;
    ctx.fillStyle = `hsl(${34 + rng() * 22} ${4 + rng() * 12}% ${l}%)`;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * (0.6 + rng() * 0.6), rng() * 3, 0, Math.PI * 2);
    ctx.fill();
    if (r > 1.7) {
      ctx.fillStyle = `rgba(210,210,190,${0.04 + rng() * 0.08})`;
      ctx.beginPath();
      ctx.ellipse(x - r * .25, y - r * .3, r * .55, r * .35, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // herbes rares entre les cailloux
  for (let k = 0; k < 120; k++) {
    ctx.strokeStyle = `rgba(${40 + rng() * 20},${58 + rng() * 26},${38 + rng() * 16},${0.3 + rng() * 0.4})`;
    ctx.lineWidth = 0.8;
    const x = rng() * W, y = rng() * H;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + (rng() - .5) * 8, y - 5, x + (rng() - .5) * 14, y - 10 - rng() * 8);
    ctx.stroke();
  }
  grain(ctx, W, H, 0.075, rng);
  return c;
}

function drawMossGround(seed) {
  const W = 512, H = 512;
  const c = canvas(W, H), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  ctx.fillStyle = "#39452f";
  ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 150; k++) {
    const x = rng() * W, y = rng() * H, r = 12 + rng() * 70;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const hue = 76 + rng() * 34;
    g.addColorStop(0, `hsla(${hue} ${16 + rng() * 20}% ${18 + rng() * 12}% / ${0.45 + rng() * 0.4})`);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // touffes d'herbe vues du dessus
  for (let k = 0; k < 900; k++) {
    const x = rng() * W, y = rng() * H;
    ctx.strokeStyle = `rgba(${56 + rng() * 34},${78 + rng() * 40},${52 + rng() * 26},${0.3 + rng() * 0.5})`;
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - .5) * 7, y - 2 - rng() * 6);
    ctx.stroke();
  }
  // terre nue
  for (let k = 0; k < 26; k++) {
    softBlob(ctx, rng() * W, rng() * H, 10 + rng() * 34, "rgba(74,62,46,ALPHA)", 0.35);
  }
  grain(ctx, W, H, 0.1, rng);
  return c;
}

/* ─────────────────────────── bois, ardoise, métal ─────────────────────────── */

function drawWood(seed, { vertical = false, dark = false } = {}) {
  const W = 512, H = 512;
  const c = canvas(W, H), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  const base = dark ? 30 : 40;
  ctx.fillStyle = `hsl(28 26% ${base - 6}%)`;
  ctx.fillRect(0, 0, W, H);
  const planks = 5, pw = (vertical ? W : H) / planks;
  for (let p = 0; p < planks; p++) {
    const l = base + rng() * 8;
    ctx.fillStyle = `hsl(${24 + rng() * 10} ${20 + rng() * 12}% ${l}%)`;
    if (vertical) ctx.fillRect(p * pw, 0, pw - 2, H);
    else ctx.fillRect(0, p * pw, W, pw - 2);
    // veinage
    for (let k = 0; k < 26; k++) {
      ctx.strokeStyle = `rgba(${rng() > .5 ? "18,12,8" : "92,66,42"},${0.1 + rng() * 0.22})`;
      ctx.lineWidth = 0.6 + rng() * 1.4;
      ctx.beginPath();
      if (vertical) {
        const x = p * pw + rng() * pw;
        ctx.moveTo(x, rng() * H);
        for (let s = 0; s < 8; s++) ctx.lineTo(x + (rng() - .5) * 6, rng() * H);
      } else {
        const y = p * pw + rng() * pw;
        ctx.moveTo(rng() * W, y);
        for (let s = 0; s < 8; s++) ctx.lineTo(rng() * W, y + (rng() - .5) * 5);
      }
      ctx.stroke();
    }
    // nœud
    if (rng() < 0.5) {
      const x = vertical ? p * pw + pw / 2 : rng() * W;
      const y = vertical ? rng() * H : p * pw + pw / 2;
      for (let k = 4; k > 0; k--) {
        ctx.strokeStyle = `rgba(16,10,6,${0.18 + k * 0.05})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.ellipse(x, y, k * 2.2, k * 3.4, 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // ombre du joint
    ctx.fillStyle = "rgba(0,0,0,.45)";
    if (vertical) ctx.fillRect(p * pw + pw - 2, 0, 2, H);
    else ctx.fillRect(0, p * pw + pw - 2, W, 2);
  }
  grain(ctx, W, H, 0.09, rng);
  return c;
}

function drawSlate(seed) {
  const W = 512, H = 512;
  const c = canvas(W, H), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  ctx.fillStyle = "#0e1214";
  ctx.fillRect(0, 0, W, H);
  const rows = 10, rh = H / rows;
  for (let r = rows - 1; r >= 0; r--) {
    let x = (r % 2) * -30 + rng() * 6;
    while (x < W) {
      const tw = 48 + rng() * 26;
      const y = r * rh;
      const l = 18 + rng() * 14;
      ctx.fillStyle = `hsl(${196 + rng() * 26} ${6 + rng() * 10}% ${l}%)`;
      ctx.beginPath();
      ctx.moveTo(x + 1, y);
      ctx.lineTo(x + tw - 1, y + rng() * 2);
      ctx.lineTo(x + tw - 2, y + rh * 0.86);
      ctx.quadraticCurveTo(x + tw / 2, y + rh * 1.06, x + 2, y + rh * 0.86);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = `rgba(120,140,150,${0.05 + rng() * 0.07})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      // mousse sur quelques tuiles
      if (rng() < 0.14) {
        ctx.fillStyle = `rgba(52,68,44,${0.15 + rng() * 0.25})`;
        ctx.beginPath();
        ctx.ellipse(x + tw / 2, y + rh * .5, tw * .3, rh * .3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      x += tw;
    }
  }
  // faîtage / reflets froids
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(150,175,190,.07)");
  g.addColorStop(0.5, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,.25)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  grain(ctx, W, H, 0.07, rng);
  return c;
}

/* ─────────────────────────── vitraux ─────────────────────────── */

const JEWEL = [
  [28, 58, 150],   // bleu profond
  [52, 92, 190],   // bleu clair
  [126, 26, 42],   // rouge verre
  [168, 44, 52],
  [198, 148, 52],  // or
  [86, 132, 88],   // vert
  [92, 60, 132],   // violet
  [200, 186, 150], // verre blanc
];

function glassPane(ctx, x, y, w, h, rng, palette = JEWEL) {
  const col = palette[Math.floor(rng() * palette.length) % palette.length];
  const j = (rng() - 0.5) * 26;
  ctx.fillStyle = `rgb(${clamp(col[0] + j, 0, 255)},${clamp(col[1] + j, 0, 255)},${clamp(col[2] + j, 0, 255)})`;
  ctx.fillRect(x, y, w, h);
  // bulles / irrégularité du verre ancien
  for (let k = 0; k < 4; k++) {
    ctx.fillStyle = `rgba(255,255,255,${0.03 + rng() * 0.1})`;
    ctx.beginPath();
    ctx.ellipse(x + rng() * w, y + rng() * h, 1 + rng() * 3, 1 + rng() * 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.strokeStyle = "rgba(8,10,8,.85)";
  ctx.lineWidth = 1.6;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function drawLancet(seed) {
  const W = 256, H = 512;
  const c = canvas(W, H), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  ctx.fillStyle = "#0a0d10";
  ctx.fillRect(0, 0, W, H);

  // champ de losanges bleus
  const cell = 32;
  for (let y = 0; y < H; y += cell) {
    for (let x = 0; x < W; x += cell) {
      const off = (Math.floor(y / cell) % 2) * cell * 0.5;
      ctx.save();
      ctx.translate(x + off, y);
      ctx.beginPath();
      ctx.moveTo(cell / 2, 0); ctx.lineTo(cell, cell / 2);
      ctx.lineTo(cell / 2, cell); ctx.lineTo(0, cell / 2);
      ctx.closePath();
      ctx.clip();
      const pal = rng() < 0.82 ? [JEWEL[0], JEWEL[1], JEWEL[6], JEWEL[0]] : JEWEL;
      glassPane(ctx, 0, 0, cell, cell, rng, pal);
      ctx.restore();
    }
  }

  // bordure or et rouge
  const border = 20;
  for (let y = 0; y < H; y += 18) {
    const isRed = Math.floor(y / 18) % 2 === 0;
    ctx.fillStyle = isRed ? "rgb(132,32,38)" : "rgb(186,148,58)";
    ctx.fillRect(0, y, border, 17);
    ctx.fillRect(W - border, y, border, 17);
  }
  ctx.strokeStyle = "rgba(10,10,8,.8)";
  ctx.lineWidth = 2.5;
  ctx.strokeRect(border, -2, W - border * 2, H + 4);

  // médaillon central : un saint auréolé, très stylisé
  const cx = W / 2, cy = H * 0.36, r = 62;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "rgb(16,26,48)";
  ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = "rgb(196,156,62)";
  ctx.beginPath(); ctx.arc(cx, cy - 6, r * 0.52, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgb(204,190,158)";
  ctx.beginPath(); ctx.ellipse(cx, cy - 8, r * 0.24, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgb(122,30,34)";
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.55, cy + r * 0.82);
  ctx.quadraticCurveTo(cx - r * 0.4, cy + r * 0.06, cx, cy + r * 0.02);
  ctx.quadraticCurveTo(cx + r * 0.4, cy + r * 0.06, cx + r * 0.55, cy + r * 0.82);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = "rgba(12,12,10,.9)";
  ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.restore();

  // deux petits médaillons dorés en bas
  for (const yy of [H * 0.66, H * 0.84]) {
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, yy, 34, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = "rgb(22,34,58)"; ctx.fillRect(cx - 34, yy - 34, 68, 68);
    for (let k = 0; k < 12; k++) {
      ctx.fillStyle = k % 2 ? "rgb(190,150,58)" : "rgb(128,34,38)";
      ctx.beginPath();
      ctx.moveTo(cx, yy);
      ctx.arc(cx, yy, 32, (k / 12) * Math.PI * 2, ((k + 1) / 12) * Math.PI * 2);
      ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = "rgba(12,12,10,.9)"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, yy, 33, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }

  // lumière : le verre est plus lumineux vers le haut
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "rgba(220,235,255,.20)");
  g.addColorStop(0.45, "rgba(255,255,255,0)");
  g.addColorStop(1, "rgba(0,0,0,.28)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  return c;
}

function drawRose(seed) {
  const W = 512, H = 512;
  const c = canvas(W, H), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  ctx.clearRect(0, 0, W, H);
  const cx = W / 2, cy = H / 2, R = W * 0.47;

  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = "rgb(10,14,20)"; ctx.fillRect(0, 0, W, H);

  // 12 pétales
  const N = 12;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2, a1 = ((i + 1) / N) * Math.PI * 2;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, R, a0, a1);
    ctx.closePath();
    ctx.clip();
    // champ de losanges
    const cell = 30;
    for (let y = 0; y < H; y += cell) {
      for (let x = 0; x < W; x += cell) {
        const pal = i % 3 === 0 ? [JEWEL[2], JEWEL[3], JEWEL[4]] : i % 3 === 1 ? [JEWEL[0], JEWEL[1], JEWEL[6]] : [JEWEL[4], JEWEL[7], JEWEL[5]];
        glassPane(ctx, x, y, cell * 0.7, cell * 0.7, rng, pal);
      }
    }
    ctx.restore();
    // rai de pierre
    ctx.strokeStyle = "rgba(22,24,20,.95)";
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R); ctx.stroke();
  }
  // anneau extérieur
  ctx.strokeStyle = "rgb(28,30,26)"; ctx.lineWidth = 26;
  ctx.beginPath(); ctx.arc(cx, cy, R - 12, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = "rgba(190,160,90,.28)"; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, R - 26, 0, Math.PI * 2); ctx.stroke();

  // médaillon central
  ctx.fillStyle = "rgb(184,146,56)";
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgb(122,32,34)";
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.13, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(20,20,16,.9)"; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.18, 0, Math.PI * 2); ctx.stroke();
  // croix
  ctx.fillStyle = "rgb(214,190,132)";
  ctx.fillRect(cx - 4, cy - R * 0.12, 8, R * 0.24);
  ctx.fillRect(cx - R * 0.09, cy - 4, R * 0.18, 8);
  ctx.restore();

  // liseré de pierre
  ctx.strokeStyle = "rgb(24,26,22)";
  ctx.lineWidth = 14;
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
  return c;
}

/* ─────────────────────────── matières organiques ─────────────────────────── */

function drawFlesh(seed) {
  const W = 256, H = 256;
  const c = canvas(W, H), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  ctx.fillStyle = "#8d9182";
  ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 70; k++) {
    const x = rng() * W, y = rng() * H, r = 8 + rng() * 34;
    const pal = ["rgba(96,104,100,ALPHA)", "rgba(120,104,104,ALPHA)", "rgba(74,84,66,ALPHA)", "rgba(140,136,120,ALPHA)"];
    softBlob(ctx, x, y, r, pal[Math.floor(rng() * pal.length)], 0.2 + rng() * 0.3);
  }
  // veines
  for (let k = 0; k < 18; k++) {
    ctx.strokeStyle = `rgba(${52 + rng() * 30},${46 + rng() * 22},${52 + rng() * 20},${0.18 + rng() * 0.25})`;
    ctx.lineWidth = 0.6 + rng() * 1.1;
    ctx.beginPath();
    let x = rng() * W, y = rng() * H;
    ctx.moveTo(x, y);
    for (let s = 0; s < 7; s++) {
      x += (rng() - .5) * 40; y += (rng() - .5) * 40;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // plaies
  for (let k = 0; k < 9; k++) {
    const x = rng() * W, y = rng() * H, r = 3 + rng() * 9;
    softBlob(ctx, x, y, r * 2.4, "rgba(70,24,20,ALPHA)", 0.5);
    softBlob(ctx, x, y, r, "rgba(38,10,8,ALPHA)", 0.75);
  }
  grain(ctx, W, H, 0.09, rng);
  return c;
}

function drawCloth(seed, tint = [104, 100, 88]) {
  const W = 256, H = 256;
  const c = canvas(W, H), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  ctx.fillStyle = `rgb(${tint[0]},${tint[1]},${tint[2]})`;
  ctx.fillRect(0, 0, W, H);
  // trame
  for (let y = 0; y < H; y += 3) {
    ctx.fillStyle = `rgba(${rng() > .5 ? "0,0,0" : "255,255,255"},${0.03 + rng() * 0.05})`;
    ctx.fillRect(0, y, W, 1);
  }
  for (let x = 0; x < W; x += 3) {
    ctx.fillStyle = `rgba(${rng() > .5 ? "0,0,0" : "255,255,255"},${0.02 + rng() * 0.04})`;
    ctx.fillRect(x, 0, 1, H);
  }
  // salissures, sang séché, usure
  for (let k = 0; k < 26; k++) {
    const x = rng() * W, y = rng() * H, r = 6 + rng() * 40;
    const blood = rng() < 0.28;
    softBlob(ctx, x, y, r, blood ? "rgba(52,16,12,ALPHA)" : "rgba(20,18,14,ALPHA)", 0.2 + rng() * 0.35);
  }
  for (let k = 0; k < 12; k++) {
    ctx.strokeStyle = `rgba(10,9,7,${0.3 + rng() * 0.4})`;
    ctx.lineWidth = 0.8;
    const x = rng() * W, y = rng() * H;
    ctx.beginPath(); ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - .5) * 40, y + rng() * 30); ctx.stroke();
  }
  grain(ctx, W, H, 0.08, rng);
  return c;
}

function drawBark(seed) {
  const W = 256, H = 512;
  const c = canvas(W, H), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  ctx.fillStyle = "#2a2822";
  ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 170; k++) {
    const x = rng() * W;
    const w = 1 + rng() * 7;
    ctx.strokeStyle = `rgba(${rng() > .5 ? "12,10,8" : "72,66,52"},${0.18 + rng() * 0.35})`;
    ctx.lineWidth = w;
    ctx.beginPath();
    let y = -10;
    ctx.moveTo(x, y);
    while (y < H + 10) {
      y += 16 + rng() * 26;
      ctx.lineTo(x + (rng() - .5) * 12, y);
    }
    ctx.stroke();
  }
  // lichen
  for (let k = 0; k < 40; k++) {
    const x = rng() * W, y = rng() * H;
    ctx.fillStyle = `rgba(${70 + rng() * 30},${84 + rng() * 30},${60 + rng() * 20},${0.1 + rng() * 0.18})`;
    ctx.beginPath(); ctx.ellipse(x, y, 2 + rng() * 8, 1 + rng() * 4, rng() * 3, 0, Math.PI * 2); ctx.fill();
  }
  grain(ctx, W, H, 0.1, rng);
  return c;
}

/* ─────────────────────────── pierre sculptée ─────────────────────────── */

function drawCarved(seed) {
  const W = 512, H = 512;
  const c = canvas(W, H), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  const stone = drawStone(seed ^ 0x1234, {});
  ctx.drawImage(stone, 0, 0);
  const cx = W / 2, cy = H / 2;

  // rosace gravée : cercles concentriques, pétales, dents de scie
  const ring = (r, lw, light, dark) => {
    ctx.lineWidth = lw;
    ctx.strokeStyle = dark;
    ctx.beginPath(); ctx.arc(cx + 1.5, cy + 1.5, r, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = light;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  };
  ring(180, 10, "rgba(170,170,148,.35)", "rgba(12,14,12,.65)");
  ring(150, 4, "rgba(160,160,140,.3)", "rgba(10,12,10,.6)");
  ring(74, 7, "rgba(175,175,150,.34)", "rgba(10,12,10,.7)");

  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(78, -16);
    ctx.quadraticCurveTo(118, -28, 148, 0);
    ctx.quadraticCurveTo(118, 28, 78, 16);
    ctx.closePath();
    ctx.fillStyle = "rgba(120,124,106,.18)";
    ctx.fill();
    ctx.strokeStyle = "rgba(12,14,12,.6)"; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = "rgba(190,190,165,.25)"; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
  }
  // petit visage central abstrait
  ctx.fillStyle = "rgba(150,150,130,.28)";
  ctx.beginPath(); ctx.ellipse(cx, cy - 4, 18, 24, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "rgba(10,12,10,.55)";
  ctx.beginPath(); ctx.ellipse(cx - 7, cy - 10, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(cx + 7, cy - 10, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(10,12,10,.5)"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy + 4, 9, 0.25, Math.PI - 0.25); ctx.stroke();

  // bordure en dents de scie
  ctx.strokeStyle = "rgba(14,16,13,.55)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 8; x < W; x += 24) {
    ctx.moveTo(x, 8); ctx.lineTo(x + 12, 26); ctx.lineTo(x + 24, 8);
  }
  ctx.stroke();
  grain(ctx, W, H, 0.05, rng);
  return c;
}

function drawTapestry(seed) {
  const W = 256, H = 512;
  const c = canvas(W, H), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  ctx.fillStyle = "#3a1518";
  ctx.fillRect(0, 0, W, H);
  for (let k = 0; k < 40; k++) {
    softBlob(ctx, rng() * W, rng() * H, 8 + rng() * 40, "rgba(22,10,10,ALPHA)", 0.2);
  }
  // bordure or
  ctx.strokeStyle = "rgba(176,142,66,.65)";
  ctx.lineWidth = 7;
  ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.lineWidth = 2;
  ctx.strokeRect(26, 26, W - 52, H - 52);
  // motif : agneau / croix rayonnante
  const cx = W / 2, cy = H * 0.34;
  ctx.strokeStyle = "rgba(196,164,88,.7)";
  ctx.lineWidth = 4;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 26, cy + Math.sin(a) * 26);
    ctx.lineTo(cx + Math.cos(a) * 62, cy + Math.sin(a) * 62);
    ctx.stroke();
  }
  ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(cx, cy - 46); ctx.lineTo(cx, cy + 46); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - 32, cy - 8); ctx.lineTo(cx + 32, cy - 8); ctx.stroke();
  ctx.fillStyle = "rgba(210,180,110,.55)";
  ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.fill();

  // motif inférieur : chevrons
  ctx.strokeStyle = "rgba(180,150,80,.35)";
  ctx.lineWidth = 3;
  for (let y = H * 0.58; y < H - 40; y += 34) {
    ctx.beginPath();
    for (let x = 32; x < W - 32; x += 28) {
      ctx.moveTo(x, y); ctx.lineTo(x + 14, y + 18); ctx.lineTo(x + 28, y);
    }
    ctx.stroke();
  }
  // usure : le bas est déchiré
  ctx.fillStyle = "rgba(8,6,5,.55)";
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let x = 0; x <= W; x += 16) ctx.lineTo(x, H - 10 - rng() * 46);
  ctx.lineTo(W, H);
  ctx.closePath(); ctx.fill();
  grain(ctx, W, H, 0.07, rng);
  return c;
}

/* ─────────────────────────── sprites & FX ─────────────────────────── */

function drawHalo(seed = 1) {
  const S = 128;
  const c = canvas(S, S), ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,246,214,1)");
  g.addColorStop(0.12, "rgba(255,228,160,.85)");
  g.addColorStop(0.34, "rgba(255,190,96,.30)");
  g.addColorStop(0.7, "rgba(220,150,60,.06)");
  g.addColorStop(1, "rgba(200,130,40,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return c;
}

function drawSoftDot() {
  const S = 64;
  const c = canvas(S, S), ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,.35)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return c;
}

function drawSpark() {
  const S = 64;
  const c = canvas(S, S), ctx = c.getContext("2d");
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 14);
  g.addColorStop(0, "rgba(255,255,240,1)");
  g.addColorStop(1, "rgba(255,180,80,0)");
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(32, 32, 14, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = "rgba(255,210,150,.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(2, 32); ctx.lineTo(62, 32);
  ctx.moveTo(32, 8); ctx.lineTo(32, 56);
  ctx.stroke();
  return c;
}

function drawSmoke(seed) {
  const S = 256;
  const c = canvas(S, S), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  ctx.clearRect(0, 0, S, S);
  for (let k = 0; k < 46; k++) {
    const a = rng() * Math.PI * 2, rr = rng() * 58;
    const x = 128 + Math.cos(a) * rr, y = 128 + Math.sin(a) * rr * 0.7;
    softBlob(ctx, x, y, 26 + rng() * 48, "rgba(190,200,200,ALPHA)", 0.05 + rng() * 0.07);
  }
  // fondu du bord
  ctx.globalCompositeOperation = "destination-in";
  const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 126);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return c;
}

function drawBlood(seed) {
  const S = 256;
  const c = canvas(S, S), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  ctx.clearRect(0, 0, S, S);
  const cx = 128, cy = 128;
  ctx.fillStyle = "rgba(58,10,8,.92)";
  ctx.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = 34 + Math.sin(a * 5 + seed) * 12 + rng() * 16;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * 0.8;
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath(); ctx.fill();
  for (let k = 0; k < 46; k++) {
    const a = rng() * Math.PI * 2, d = 36 + rng() * 86;
    const r = 1 + rng() * 6;
    ctx.fillStyle = `rgba(${40 + rng() * 30},${6 + rng() * 8},${5 + rng() * 6},${0.55 + rng() * 0.35})`;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8, r, r * (0.5 + rng()), rng() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // brillance humide
  softBlob(ctx, cx - 10, cy - 12, 26, "rgba(210,120,100,ALPHA)", 0.1);
  return c;
}

function drawGrassTuft(seed) {
  const S = 128;
  const c = canvas(S, S), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  ctx.clearRect(0, 0, S, S);
  for (let k = 0; k < 46; k++) {
    const x0 = 64 + (rng() - .5) * 26;
    const h = 44 + rng() * 74;
    const bend = (rng() - .5) * 46;
    const w = 1.4 + rng() * 2.4;
    const hue = 76 + rng() * 40;
    ctx.strokeStyle = `hsl(${hue} ${18 + rng() * 22}% ${16 + rng() * 16}%)`;
    ctx.lineWidth = w;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x0, S);
    ctx.quadraticCurveTo(x0 + bend * 0.4, S - h * 0.6, x0 + bend, S - h);
    ctx.stroke();
    if (rng() < 0.35) {
      ctx.strokeStyle = `hsla(${hue} 16% ${30 + rng() * 14}% / .5)`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(x0, S); ctx.lineTo(x0 + bend * 0.5, S - h * 0.8);
      ctx.stroke();
    }
  }
  return c;
}

function drawMoon(seed) {
  const S = 512;
  const c = canvas(S, S), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  ctx.clearRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2, R = S * 0.36;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();
  const g = ctx.createRadialGradient(cx - R * .2, cy - R * .25, R * .1, cx, cy, R);
  g.addColorStop(0, "rgb(246,244,232)");
  g.addColorStop(0.55, "rgb(228,226,212)");
  g.addColorStop(0.86, "rgb(196,196,186)");
  g.addColorStop(1, "rgb(150,154,152)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  // grandes mers : taches sombres lisibles même sur un petit disque
  for (let k = 0; k < 5; k++) {
    const a = rng() * Math.PI * 2, d = rng() * R * 0.55;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    const rr = R * (0.22 + rng() * 0.26);
    ctx.fillStyle = `rgba(118,122,120,${0.14 + rng() * 0.10})`;
    ctx.beginPath(); ctx.ellipse(x, y, rr, rr * (0.62 + rng() * 0.5), rng() * 3, 0, Math.PI * 2); ctx.fill();
  }
  // mers et cratères
  for (let k = 0; k < 34; k++) {
    const a = rng() * Math.PI * 2, d = rng() * R * 0.86;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
    const rr = 4 + rng() * 34;
    ctx.fillStyle = `rgba(${112 + rng() * 36},${116 + rng() * 36},${114 + rng() * 34},${0.20 + rng() * 0.22})`;
    ctx.beginPath(); ctx.ellipse(x, y, rr, rr * (0.6 + rng() * .6), rng() * 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = `rgba(206,210,202,${0.18 + rng() * .22})`;
    ctx.lineWidth = 1 + rng() * 2;
    ctx.beginPath(); ctx.arc(x - 1, y - 1, rr, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.restore();
  // halo extérieur
  const hg = ctx.createRadialGradient(cx, cy, R * .92, cx, cy, R * 1.42);
  hg.addColorStop(0, "rgba(210,225,230,.20)");
  hg.addColorStop(0.4, "rgba(180,205,215,.10)");
  hg.addColorStop(1, "rgba(160,190,205,0)");
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(cx, cy, R * 1.42, 0, Math.PI * 2); ctx.fill();
  return c;
}

function drawNoiseTile(seed) {
  const S = 256;
  const c = canvas(S, S), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  const img = ctx.createImageData(S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rng() * 255;
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function drawParchment(seed) {
  const S = 256;
  const c = canvas(S, S), ctx = c.getContext("2d");
  const rng = makeRng(seed);
  ctx.fillStyle = "#c8b78f";
  ctx.fillRect(0, 0, S, S);
  for (let k = 0; k < 40; k++) {
    softBlob(ctx, rng() * S, rng() * S, 6 + rng() * 40, "rgba(120,96,58,ALPHA)", 0.08 + rng() * 0.14);
  }
  grain(ctx, S, S, 0.09, rng);
  return c;
}

/* ─────────────────────────── API ─────────────────────────── */

/** Projection de vitrail au sol : motif flouté, bords éteints par un masque radial. */
function drawGlassPool(src, blurPx = 6) {
  const W = src.width, H = src.height;
  const c = canvas(W, H), ctx = c.getContext("2d");
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(src, 0, 0);
  ctx.filter = "none";
  ctx.globalCompositeOperation = "multiply";
  const g = ctx.createRadialGradient(W / 2, H / 2, W * 0.04, W / 2, H / 2, Math.max(W, H) * 0.56);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.62, "#8a8a8a");
  g.addColorStop(1, "#000000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
  return c;
}

function cached(key, build) {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
}

export const T = {
  stone: () => cached("stone", () => toTexture(drawStone(11), { repeat: [1, 1] })),
  stoneDark: () => cached("stoneDark", () => toTexture(drawStone(29, { dark: true }), { repeat: [1, 1] })),
  flagstone: () => cached("flagstone", () => toTexture(drawFlagstone(31))),
  gravel: () => cached("gravel", () => toTexture(drawGravel(37))),
  mossGround: () => cached("mossGround", () => toTexture(drawMossGround(41))),
  wood: () => cached("wood", () => toTexture(drawWood(43))),
  woodDark: () => cached("woodDark", () => toTexture(drawWood(47, { dark: true }))),
  door: () => cached("door", () => toTexture(drawWood(53, { vertical: true, dark: true }))),
  slate: () => cached("slate", () => toTexture(drawSlate(59))),
  lancet: () => cached("lancet", () => toTexture(drawLancet(61), { wrap: THREE.ClampToEdgeWrapping })),
  lancet2: () => cached("lancet2", () => toTexture(drawLancet(67), { wrap: THREE.ClampToEdgeWrapping })),
  rose: () => cached("rose", () => toTexture(drawRose(71), { wrap: THREE.ClampToEdgeWrapping })),
  flesh: () => cached("flesh", () => toTexture(drawFlesh(73))),
  cloth: () => cached("cloth", () => toTexture(drawCloth(79))),
  clothGrey: () => cached("clothGrey", () => toTexture(drawCloth(83, [108, 108, 98]))),
  clothRust: () => cached("clothRust", () => toTexture(drawCloth(89, [116, 82, 66]))),
  bark: () => cached("bark", () => toTexture(drawBark(97))),
  carved: () => cached("carved", () => toTexture(drawCarved(101), { wrap: THREE.ClampToEdgeWrapping })),
  tapestry: () => cached("tapestry", () => toTexture(drawTapestry(103), { wrap: THREE.ClampToEdgeWrapping })),
  halo: () => cached("halo", () => toTexture(drawHalo(), { wrap: THREE.ClampToEdgeWrapping })),
  dot: () => cached("dot", () => toTexture(drawSoftDot(), { wrap: THREE.ClampToEdgeWrapping })),
  spark: () => cached("spark", () => toTexture(drawSpark(), { wrap: THREE.ClampToEdgeWrapping })),
  smoke: () => cached("smoke", () => toTexture(drawSmoke(107), { wrap: THREE.ClampToEdgeWrapping })),
  blood: () => cached("blood", () => toTexture(drawBlood(109), { wrap: THREE.ClampToEdgeWrapping })),
  grass: () => cached("grass", () => toTexture(drawGrassTuft(113), { wrap: THREE.ClampToEdgeWrapping })),
  grass2: () => cached("grass2", () => toTexture(drawGrassTuft(127), { wrap: THREE.ClampToEdgeWrapping })),
  moon: () => cached("moon", () => toTexture(drawMoon(131), { wrap: THREE.ClampToEdgeWrapping })),
  noise: () => cached("noise", () => toTexture(drawNoiseTile(137), { srgb: false })),
  parchment: () => cached("parchment", () => toTexture(drawParchment(139))),
  glassPool: () => cached("glassPool", () => toTexture(drawGlassPool(T.lancet2().image), { wrap: THREE.ClampToEdgeWrapping })),

  /* ── reliefs : normales dérivées des albédos, gratuites en mémoire ── */
  nStone: () => cached("nStone", () => toTexture(normalFromCanvas(T.stone().image, 9.0), { srgb: false })),
  nStoneDark: () => cached("nStoneDark", () => toTexture(normalFromCanvas(T.stoneDark().image, 10.0), { srgb: false })),
  nFlagstone: () => cached("nFlagstone", () => toTexture(normalFromCanvas(T.flagstone().image, 11.0), { srgb: false })),
  nGravel: () => cached("nGravel", () => toTexture(normalFromCanvas(T.gravel().image, 12.0), { srgb: false })),
  nMoss: () => cached("nMoss", () => toTexture(normalFromCanvas(T.mossGround().image, 6.0), { srgb: false })),
  nWood: () => cached("nWood", () => toTexture(normalFromCanvas(T.wood().image, 5.0), { srgb: false })),
  nWoodDark: () => cached("nWoodDark", () => toTexture(normalFromCanvas(T.woodDark().image, 5.5), { srgb: false })),
  nSlate: () => cached("nSlate", () => toTexture(normalFromCanvas(T.slate().image, 8.0), { srgb: false })),
  nBark: () => cached("nBark", () => toTexture(normalFromCanvas(T.bark().image, 9.0), { srgb: false })),

  /* ── rugosités : pierre poreuse, bois mat, sol boueux ── */
  rStone: () => cached("rStone", () => toTexture(roughFromCanvas(T.stone().image, 0.72, 1.0), { srgb: false })),
  rFlagstone: () => cached("rFlagstone", () => toTexture(roughFromCanvas(T.flagstone().image, 0.48, 0.96), { srgb: false })),
  rGravel: () => cached("rGravel", () => toTexture(roughFromCanvas(T.gravel().image, 0.58, 1.0), { srgb: false })),
  rWood: () => cached("rWood", () => toTexture(roughFromCanvas(T.wood().image, 0.55, 0.92), { srgb: false })),
};

/** Clone d'une texture avec un motif de répétition propre à la surface. */
export function rep(tex, x, y, rotation = 0) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(x, y);
  t.rotation = rotation;
  t.center.set(0.5, 0.5);
  return t;
}

/** Matériau de pierre prêt à l'emploi. */
export function stoneMaterial(repeat = 2, dark = false) {
  const t = rep(dark ? T.stoneDark() : T.stone(), repeat, repeat);
  const mat = new THREE.MeshStandardMaterial({
    map: t,
    color: dark ? 0x9aa096 : 0xb7bcae,
    roughness: 0.94,
    metalness: 0.0,
  });
  return relief(mat, {
    n: dark ? T.nStoneDark() : T.nStone(),
    r: T.rStone(),
    rx: repeat, ry: repeat, scale: 1.0,
  });
}

/**
 * Ajoute du relief à un MeshStandardMaterial : normales + rugosité, avec la même
 * répétition que l'albédo. `scale` au-delà de 1 accuse les joints et les veines.
 */
export function relief(mat, { n = null, r = null, rx = 1, ry = 1, scale = 1 } = {}) {
  if (n) mat.normalMap = rep(n, rx, ry);
  if (n) mat.normalScale.set(scale, scale);
  if (r) mat.roughnessMap = rep(r, rx, ry);
  mat.needsUpdate = true;
  return mat;
}

