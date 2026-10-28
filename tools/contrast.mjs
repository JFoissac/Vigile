// contrast.mjs — mesure le contraste réel des textes (WCAG 2.1, luminance relative)
// sur une capture de la page, sans dépendance npm : le PNG est décodé à la main.
// Usage : node tools/contrast.mjs [url] [--out=shots/contraste.png]
//
// Méthode : pour chaque sélecteur, on récupère sa boîte et sa couleur calculée, on
// capture la page, puis on mesure dans la boîte :
//   - le fond   = luminance médiane (p50) des pixels,
//   - le texte  = luminance du pixel le plus clair (p99,5) — le cœur du glyphe,
//   - le ratio  = (Ltexte + 0,05) / (Lfond + 0,05).
// Seuils WCAG : 4,5:1 (texte normal), 3:1 (≥ 24 px ou ≥ 18,66 px gras).

import { inflateSync } from "node:zlib";
import { launchChrome, closeChrome, connect } from "./cdp.mjs";

/* ─────────── décodage PNG (8 bits, RGB/RGBA, non entrelacé) ─────────── */

function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("pas un PNG");
  let pos = 8, w = 0, h = 0, depth = 0, colorType = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("ascii", pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      depth = data[8]; colorType = data[9];
      if (depth !== 8 || (colorType !== 6 && colorType !== 2)) {
        throw new Error(`PNG non géré (profondeur ${depth}, type ${colorType})`);
      }
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * bpp;
  const out = Buffer.alloc(w * h * bpp);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const row = raw.subarray(p, p + stride); p += stride;
    const cur = out.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }
  return { w, h, bpp, data: out };
}

const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = (r, g, b) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
const ratio = (l1, l2) => (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);

function parseColor(css) {
  const m = css.match(/rgba?\(([^)]+)\)/);
  if (!m) return [255, 255, 255, 1];
  const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
}

/* ─────────── mesure ─────────── */

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith("--")) || "http://127.0.0.1:8131/";
const outArg = args.find((a) => a.startsWith("--out="));
const outPng = outArg ? outArg.split("=")[1] : "shots/contraste-menu.png";

const CIBLE = [
  [".overline", 0, "Chapelle Saint-Ours"],
  [".title-rule span", 0, "Tenir jusqu'à l'aube"],
  [".lede", 0, "paragraphe d'ambiance"],
  ["#btn-start", 0, "bouton Commencer"],
  ["#btn-settings", 0, "bouton Réglages"],
  ["#btn-controls", 0, "bouton Commandes"],
  [".btn-key", 0, "badge Entrée"],
  [".menu-foot", 0, "footer menu"],
  [".meta-clock .meta-k", 0, "Veille"],
  [".meta-clock strong", 0, "22:00"],
  [".meta-note", 0, "note Huit heures"],
  [".meta-small", 0, "version / moteur"],
  [".sound-toggle", 0, "bouton son"],
];

const port = 9400 + Math.floor(Math.random() * 90);
const chrome = await launchChrome({ port });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send("Runtime.enable");
await cdp.goto(url);
await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
await new Promise((r) => setTimeout(r, 1400));

const boxes = await cdp.evaluate(`(() => {
  const out = [];
  for (const [sel, idx] of ${JSON.stringify(CIBLE.map(([s, i]) => [s, i]))}) {
    const el = document.querySelectorAll(sel)[idx];
    if (!el) { out.push({ sel, missing: true }); continue; }
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    out.push({ sel, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      color: cs.color, fs: parseFloat(cs.fontSize), fw: cs.fontWeight, bg: cs.backgroundColor });
  }
  return out;
})()`);

const shot = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
const png = decodePng(Buffer.from(shot.data, "base64"));

const lignes = [];
let echecs = 0;
for (let i = 0; i < boxes.length; i++) {
  const b = boxes[i];
  const [sel, , label] = CIBLE[i];
  if (b.missing) { lignes.push({ sel, label, erreur: "absent" }); echecs++; continue; }
  const x0 = Math.max(0, b.x), y0 = Math.max(0, b.y);
  const x1 = Math.min(png.w, b.x + b.w), y1 = Math.min(png.h, b.y + b.h);
  const Ls = [];
  const cols = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const o = (y * png.w + x) * png.bpp;
      const r = png.data[o], g = png.data[o + 1], bl = png.data[o + 2];
      Ls.push(lum(r, g, bl));
      cols.push([r, g, bl]);
    }
  }
  if (!Ls.length) { lignes.push({ sel, label, erreur: "boîte vide" }); echecs++; continue; }
  const idx = Ls.map((v, k) => [v, k]).sort((a, b2) => a[0] - b2[0]);
  const pick = (q) => idx[Math.min(idx.length - 1, Math.floor(q * idx.length))];
  const [Lbg, kbg] = pick(0.5);
  const [Ltx] = pick(0.995);
  const seuil = b.fs >= 24 || (b.fs >= 18.66 && Number(b.fw) >= 700) ? 3 : 4.5;
  const rMesure = ratio(Ltx, Lbg);
  // contrôle théorique : couleur CSS composée sur le fond médian mesuré
  const [cr, cg, cb, ca] = parseColor(b.color);
  const bgc = cols[kbg];
  const comp = [cr, cg, cb].map((v, k) => v * ca + bgc[k] * (1 - ca));
  const rTheo = ratio(lum(comp[0], comp[1], comp[2]), Lbg);
  const ok = rMesure >= seuil && rTheo >= seuil;
  if (!ok) echecs++;
  lignes.push({
    sel, label, px: b.fs, seuil, ratio_mesure: +rMesure.toFixed(2), ratio_theorique: +rTheo.toFixed(2),
    fond: `rgb(${bgc.join(",")})`, couleur: b.color, ok,
  });
}

await cdp.screenshot(outPng);
console.log(JSON.stringify({ url, capture: outPng, echecs, lignes }, null, 2));
cdp.close();
await closeChrome(chrome);
process.exit(echecs ? 1 : 0);
