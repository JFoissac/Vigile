// achievements.js — les Succès du Vigile.
//
// Deux compteurs par succès : `n` cumulé sur toutes les veilles (localStorage)
// et, quand c'est pertinent, la meilleure valeur d'une seule veille. Les succès
// se débloquent en cours de partie (toast doré) ou à l'écran de fin.
//
// Rien n'est envoyé nulle part : la liste vit dans localStorage, sous
// « vigile.succes.v1 ».

const KEY = "vigile.succes.v1";

export const ACHIEVEMENTS = [
  { id: "premier-sang", name: "Premier sang", desc: "Abattre un mort.", tier: "bronze", metric: "kills", goal: 1 },
  { id: "fossoyeur", name: "Fossoyeur", desc: "Abattre 150 morts.", tier: "argent", metric: "kills", goal: 150 },
  { id: "charnier", name: "Charnier", desc: "Abattre 600 morts.", tier: "or", metric: "kills", goal: 600 },
  { id: "decapiteur", name: "Décapiteur", desc: "Réussir 10 tirs à la tête.", tier: "bronze", metric: "headshots", goal: 10 },
  { id: "crane-fendu", name: "Crâne fendu", desc: "Réussir 50 tirs à la tête.", tier: "argent", metric: "headshots", goal: 50 },
  { id: "veilleur", name: "Veilleur", desc: "Tenir jusqu'à l'aube.", tier: "or", metric: "victories", goal: 1 },
  { id: "intouchable", name: "Intouchable", desc: "Voir l'aube sans encaisser un seul coup.", tier: "or", metric: "flawless", goal: 1 },
  { id: "officiant", name: "L'Officiant", desc: "Abattre le prêtre mort dans la nef.", tier: "argent", metric: "bossKills", goal: 1 },
  { id: "maitre-des-lieues", name: "Maître des lieues", desc: "L'abattre après sa troisième descente.", tier: "or", metric: "bossPhase3", goal: 1 },
  { id: "ardeur", name: "Ardeur", desc: "Nettoyer cinq vagues dans une veille.", tier: "bronze", metric: "bestWave", goal: 5 },
  { id: "nuit-blanche", name: "Nuit blanche", desc: "Nettoyer les douze vagues.", tier: "or", metric: "bestWave", goal: 12 },
  { id: "ferrailleur", name: "Ferrailleur", desc: "Tuer 25 morts à la lame.", tier: "argent", metric: "meleeKills", goal: 25 },
  { id: "connaisseur", name: "Connaisseur", desc: "Tirer avec les huit armes dans une même veille.", tier: "argent", metric: "bestWeapons", goal: 8 },
  { id: "colosse", name: "Colosse", desc: "Abattre 10 colosses.", tier: "argent", metric: "bruteKills", goal: 10 },
  { id: "coursier", name: "Coursier", desc: "Abattre 25 coureurs.", tier: "bronze", metric: "runnerKills", goal: 25 },
  { id: "soif", name: "Soif de lumière", desc: "Boire 10 fioles.", tier: "bronze", metric: "flasks", goal: 10 },
  { id: "benediction", name: "Béni", desc: "Recevoir 5 bénédictions.", tier: "bronze", metric: "blessings", goal: 5 },
  { id: "survivant", name: "Survivant", desc: "Voir l'aube avec moins de 15 points de vie.", tier: "argent", metric: "lowHpVictory", goal: 1 },
];

const BY_ID = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Compteurs cumulés (toutes veilles) + meilleure veille. */
function emptyStore() {
  return { n: {}, best: {}, unlocked: {} };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    return {
      n: parsed.n && typeof parsed.n === "object" ? parsed.n : {},
      best: parsed.best && typeof parsed.best === "object" ? parsed.best : {},
      unlocked: parsed.unlocked && typeof parsed.unlocked === "object" ? parsed.unlocked : {},
    };
  } catch (e) {
    return emptyStore();
  }
}

function save(store) {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* stockage plein ou privé */ }
}

export function createAchievements({ ui, audio } = {}) {
  const store = load();
  let run = null;
  let queue = [];
  let visible = null;

  function newRun() {
    run = {
      kills: 0, headshots: 0, meleeKills: 0, bruteKills: 0, runnerKills: 0,
      waves: 0, blessings: 0, flasks: 0, weapons: new Set(), bossKills: 0,
      startAt: performance.now(),
    };
  }
  newRun();

  function valueOf(metric) {
    if (!run) return 0;
    switch (metric) {
      case "kills": return run.kills;
      case "headshots": return run.headshots;
      case "meleeKills": return run.meleeKills;
      case "bruteKills": return run.bruteKills;
      case "runnerKills": return run.runnerKills;
      case "bestWave": return run.waves;
      case "bestWeapons": return run.weapons.size;
      case "blessings": return run.blessings;
      case "flasks": return run.flasks;
      case "bossKills": return run.bossKills;
      default: return 0;
    }
  }

  function unlocked(id) { return !!store.unlocked[id]; }

  /** Progression lisible : n cumulé (ou meilleure veille) sur l'objectif. */
  function progressOf(a) {
    const cumulative = ["kills", "headshots", "meleeKills", "bruteKills", "runnerKills", "bossKills", "flasks", "blessings", "victories", "flawless", "bossPhase3", "lowHpVictory"].includes(a.metric);
    if (cumulative) {
      const n = store.n[a.metric] || 0;
      return { n: Math.min(a.goal, n), goal: a.goal };
    }
    const best = store.best[a.metric] || 0;
    return { n: Math.min(a.goal, best), goal: a.goal };
  }

  function bump(metric, amount = 1) {
    store.n[metric] = (store.n[metric] || 0) + amount;
    if (metric === "bossPhase3" || metric === "flawless" || metric === "lowHpVictory" || metric === "victories") {
      store.best[metric] = Math.max(store.best[metric] || 0, store.n[metric]);
    }
  }

  function best(metric, value) {
    store.best[metric] = Math.max(store.best[metric] || 0, value);
  }

  function checkAll() {
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (store.unlocked[a.id]) continue;
      const p = progressOf(a);
      if (p.n >= a.goal) {
        store.unlocked[a.id] = { at: new Date().toISOString() };
        queue.push(a);
        changed = true;
      }
    }
    if (changed) {
      save(store);
      flush();
    }
    return changed;
  }

  function flush() {
    if (!queue.length || visible) return;
    visible = queue.shift();
    if (ui && ui.achievement) ui.achievement(visible);
    if (audio && audio.ui) audio.ui();
    setTimeout(() => {
      visible = null;
      if (queue.length) flush();
    }, 2600);
  }

  /** Événement de jeu. `kind` : kill, headshot, wave, boss, flask, blessing, weapon, victory… */
  function event(kind, data = {}) {
    if (!run) newRun();
    switch (kind) {
      case "kill":
        run.kills++;
        bump("kills");
        if (data.melee) { run.meleeKills++; bump("meleeKills"); }
        if (data.type === "brute") { run.bruteKills++; bump("bruteKills"); }
        if (data.type === "runner") { run.runnerKills++; bump("runnerKills"); }
        break;
      case "headshot":
        run.headshots++;
        bump("headshots", data.n || 1);
        break;
      case "wave":
        run.waves = Math.max(run.waves, data.n || run.waves + 1);
        best("bestWave", run.waves);
        break;
      case "boss":
        run.bossKills++;
        bump("bossKills");
        if (data.phase >= 3) bump("bossPhase3");
        break;
      case "flask":
        run.flasks++;
        bump("flasks");
        break;
      case "blessing":
        run.blessings++;
        bump("blessings");
        break;
      case "weapon":
        if (data.id) run.weapons.add(data.id);
        best("bestWeapons", run.weapons.size);
        break;
      case "victory":
        bump("victories");
        if (data.damageTaken === 0) bump("flawless");
        if (data.hp < 15) bump("lowHpVictory");
        break;
      default:
        break;
    }
    checkAll();
  }

  /** Bilan de fin de veille (appelé par game.js avant l'écran de fin). */
  function endRun(stats = {}) {
    best("bestWave", stats.wave || 0);
    best("bestWeapons", run ? run.weapons.size : 0);
    if (stats.victory) {
      bump("victories");
      if (!stats.damageTaken) bump("flawless");
      if (stats.hp != null && stats.hp < 15) bump("lowHpVictory");
    }
    checkAll();
    save(store);
    return summary();
  }

  function summary() {
    const total = ACHIEVEMENTS.length;
    const done = ACHIEVEMENTS.filter((a) => store.unlocked[a.id]).length;
    return { total, done, unlocked: ACHIEVEMENTS.filter((a) => store.unlocked[a.id]).map((a) => a.id) };
  }

  /** Liste prête pour l'affichage (panneau du menu). */
  function list() {
    return ACHIEVEMENTS.map((a) => ({
      ...a,
      unlocked: !!store.unlocked[a.id],
      unlockedAt: store.unlocked[a.id] ? store.unlocked[a.id].at : null,
      progress: progressOf(a),
    }));
  }

  function resetRun() { newRun(); }

  return { event, endRun, list, summary, resetRun, unlocked, get run() { return run; } };
}
