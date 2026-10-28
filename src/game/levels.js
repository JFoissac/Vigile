// levels.js — les deux terrains de jeu.
// « Chapelle » : la veille classique, sans habitants ni loups-garous.
// « Village »  : la place à défendre — six villageois et des loups-garous.
// Le choix est mémorisé et peut venir de l'URL (?level=village) pour les tests.

export const LEVELS = {
  chapelle: {
    id: "chapelle",
    name: "La chapelle Saint-Ours",
    short: "Chapelle",
    overline: "Chapelle Saint-Ours",
    desc: "La nef, le cimetière et la lande. Les morts montent par les tombes.",
    citizens: 0,
    citizenCenter: { x: 0, z: 20, radius: 9 },
    spawn: { x: 0, z: 24, yaw: 0 },
    werewolf: false,
  },
  village: {
    id: "village",
    name: "La place du village",
    short: "Village",
    overline: "Place du village",
    desc: "Six habitants à couvrir, des ruelles et des loups-garous.",
    citizens: 6,
    // place de combat du layout du village (zones.place_combat, ramenée au
    // repère du monde : la place est posée à z = 20)
    citizenCenter: { x: 1.9, z: 19.6, radius: 4.9 },
    // entrée sud de la place (point libre vérifié sur les colliders du village)
    spawn: { x: 5, z: 13, yaw: Math.PI },
    werewolf: true,
  },
};

export const LEVEL_ORDER = ["chapelle", "village"];
const KEY = "vigile.level";

export function normalizeLevel(id) {
  return LEVELS[id] ? id : "chapelle";
}

export function readLevelFromURL() {
  try {
    const p = new URLSearchParams(location.search).get("level");
    return p ? normalizeLevel(p) : null;
  } catch (e) {
    return null;
  }
}

export function loadLevel() {
  const fromUrl = readLevelFromURL();
  if (fromUrl) {
    // un niveau imposé par l'URL devient le choix par défaut
    try { localStorage.setItem(KEY, fromUrl); } catch (e) { /* stockage refusé */ }
    return fromUrl;
  }
  try {
    return normalizeLevel(localStorage.getItem(KEY) || "chapelle");
  } catch (e) {
    return "chapelle";
  }
}

export function saveLevel(id) {
  const safe = normalizeLevel(id);
  try { localStorage.setItem(KEY, safe); } catch (e) { /* stockage refusé */ }
  return safe;
}

export function currentLevel() {
  return LEVELS[loadLevel()];
}
