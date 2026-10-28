// blessings.js — les bénédictions offertes après chaque vague nettoyée.
//
// Trois cartes tirées au sort, une seule à choisir (touches 1/2/3 ou clic).
// Chaque bénédiction modifie un multiplicateur du joueur (voir player.applyMod)
// ou une ressource de la veille. Aucune n'est obligatoire : Échap ferme le
// choix en gardant la vague suivante.

export const BLESSINGS = [
  {
    id: "zele", name: "Zèle", tag: "Dégâts", icon: "✦", weight: 10,
    desc: "+18 % de dégâts, toutes armes.",
    apply: (ctx) => ctx.player.applyMod("damage", 1.18),
  },
  {
    id: "cadence", name: "Cadence", tag: "Tir", icon: "≡", weight: 9,
    desc: "+14 % de vitesse de tir.",
    apply: (ctx) => ctx.player.applyMod("fireRate", 1.14),
  },
  {
    id: "cuirasse", name: "Cuirasse", tag: "Vitalité", icon: "❖", weight: 8,
    desc: "+30 points de vie maximum, et autant soignés.",
    apply: (ctx) => ctx.player.applyMod("maxHp", 1.3),
  },
  {
    id: "doigts", name: "Doigts agiles", tag: "Rechargement", icon: "↻", weight: 8,
    desc: "Rechargement 22 % plus rapide.",
    apply: (ctx) => ctx.player.applyMod("reload", 1.28),
  },
  {
    id: "oeil", name: "Œil de lynx", tag: "Tirs à la tête", icon: "◎", weight: 7,
    desc: "+30 % de dégâts à la tête.",
    apply: (ctx) => ctx.player.applyMod("head", 1.3),
  },
  {
    id: "pas", name: "Pas de loup", tag: "Mobilité", icon: "➤", weight: 7,
    desc: "+7 % de vitesse de déplacement.",
    apply: (ctx) => ctx.player.applyMod("speed", 1.07),
  },
  {
    id: "calme", name: "Sang-froid", tag: "Défense", icon: "◈", weight: 7,
    desc: "−20 % de dégâts encaissés.",
    apply: (ctx) => ctx.player.applyMod("damageTaken", 0.8),
  },
  {
    id: "lame", name: "Bras de fer", tag: "Mêlée", icon: "†", weight: 6,
    desc: "+35 % de dégâts à la lame.",
    apply: (ctx) => ctx.player.applyMod("melee", 1.35),
  },
];

export const BLESSING_BY_ID = Object.fromEntries(BLESSINGS.map((b) => [b.id, b]));

/** Tire `count` bénédictions distinctes, pondérées. */
export function drawBlessings(rng, count = 3) {
  const pool = BLESSINGS.map((b) => ({ b, w: b.weight || 1 }));
  const out = [];
  while (out.length < count && pool.length) {
    let total = 0;
    for (const e of pool) total += e.w;
    let roll = rng() * total;
    let idx = 0;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].w;
      if (roll <= 0) { idx = i; break; }
      idx = i;
    }
    out.push(pool.splice(idx, 1)[0].b);
  }
  return out;
}
