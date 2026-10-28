// telemetry.js — télémétrie de partie : ce que le joueur fait vraiment, pour
// pouvoir équilibrer sur des données et pas sur des impressions.
//
// Rien n'est envoyé pendant le jeu : on accumule en mémoire (quelques dizaines
// de Ko), et on POSTe UNE fois à la fin de la veille sur /api/telemetry, où
// server.py écrit telemetry/session-<id>.json. Si le POST échoue, le rapport
// reste en localStorage (clé vigile.telemetry.last) et peut être récupéré par
// `window.__telemetry()`.
//
// Aucune donnée personnelle : identifiant de session aléatoire, réglages, et
// événements de jeu.

const STORE_KEY = "vigile.telemetry.last";
const MAX_EVENTS = 4000;

export function createTelemetry({ version = "v2" } = {}) {
  let run = null;
  let postUrl = "/api/telemetry";

  const now = () => performance.now() / 1000;

  function newId() {
    return `s${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function startRun({ settings, weapons, nightSeconds, startWeapon }) {
    run = {
      kind: "vigile-run",
      version,
      id: newId(),
      startedAt: new Date().toISOString(),
      nightSeconds,
      settings: { ...settings },
      startWeapon,
      weapons: weapons.slice(),
      events: [],
      samples: [],
      waves: [],
      counters: {
        shots: 0, hits: 0, headshots: 0, kills: 0, damageTaken: 0,
        medkits: 0, vials: 0, lanterns: 0, keys: 0, caches: 0,
        byWeapon: {}, byKillType: {}, byLoot: {}, byDamage: {},
      },
      wave: {
        n: 0, plan: null, startedAt: 0, shots: 0, hits: 0, headshots: 0,
        kills: 0, damageTaken: 0, loot: 0, hpStart: 0,
      },
      last: { t: 0, x: 0, z: 0, dist: 0 },
    };
    return run.id;
  }

  function push(name, data) {
    if (!run) return;
    if (run.events.length >= MAX_EVENTS) return;
    run.events.push({ t: +now().toFixed(2), name, ...data });
  }

  function event(name, data = {}) {
    push(name, data);
  }

  /** Compteurs par arme : un tir, une touche, une tête. */
  function shot(weapon) {
    if (!run) return;
    run.counters.shots++;
    run.wave.shots++;
    const b = (run.counters.byWeapon[weapon] ||= { shots: 0, hits: 0, headshots: 0, kills: 0 });
    b.shots++;
  }
  function hit(weapon, head) {
    if (!run) return;
    run.counters.hits++;
    run.wave.hits++;
    if (head) { run.counters.headshots++; run.wave.headshots++; }
    const b = (run.counters.byWeapon[weapon] ||= { shots: 0, hits: 0, headshots: 0, kills: 0 });
    b.hits++;
    if (head) b.headshots++;
  }
  function kill(type, weapon, head) {
    if (!run) return;
    run.counters.kills++;
    run.wave.kills++;
    run.counters.byKillType[type] = (run.counters.byKillType[type] || 0) + 1;
    const b = (run.counters.byWeapon[weapon] ||= { shots: 0, hits: 0, headshots: 0, kills: 0 });
    b.kills++;
    if (head) b.headshots = b.headshots; // déjà compté par hit()
  }
  function damage(amount, source = "contact") {
    if (!run) return;
    run.counters.damageTaken += amount;
    run.wave.damageTaken += amount;
    run.counters.byDamage[source] = (run.counters.byDamage[source] || 0) + amount;
  }
  function loot(id, kind) {
    if (!run) return;
    run.wave.loot++;
    run.counters.byLoot[id] = (run.counters.byLoot[id] || 0) + 1;
    if (kind === "medkit") run.counters.medkits++;
    else if (kind === "vial") run.counters.vials++;
    else if (kind === "lantern") run.counters.lanterns++;
    else if (kind === "key") run.counters.keys++;
  }
  function cache(type, theme, ids) {
    if (!run) return;
    run.counters.caches++;
    push("cache", { type, theme, ids });
  }

  function startWave(n, plan, size) {
    if (!run) return;
    run.wave = {
      n, plan, size, startedAt: +now().toFixed(1), shots: 0, hits: 0, headshots: 0,
      kills: 0, damageTaken: 0, loot: 0, hpStart: 0,
    };
    push("wave_start", { n, plan, size });
  }
  function bossSpawn(name, variant, hp) { push("boss_spawn", { name, variant, hp }); }
  function bossPhase(phase) { push("boss_phase", { phase }); }
  function bossKill(name, variant) { push("boss_kill", { name, variant }); }

  /** Échantillon périodique (2 s) : PV, munitions, pression, position. */
  function sample(s) {
    if (!run) return;
    run.samples.push({
      t: +now().toFixed(1), wave: s.wave, hp: Math.round(s.hp), ammo: s.ammo,
      reserve: s.reserve, enemies: s.enemies, boss: !!s.boss,
      x: +s.x.toFixed(1), z: +s.z.toFixed(1), fps: Math.round(s.fps || 0),
    });
  }

  function endWave(state, inventory) {
    if (!run) return;
    const w = run.wave;
    run.waves.push({
      n: w.n, plan: w.plan, size: w.size,
      dur: +(now() - w.startedAt).toFixed(1),
      shots: w.shots, hits: w.hits, headshots: w.headshots,
      kills: w.kills, damageTaken: Math.round(w.damageTaken), loot: w.loot,
      hpEnd: Math.round(state.hp), hpMax: Math.round(state.maxHp),
      // inventaire de fin de vague : permet de mesurer l'économie réelle
      inv: inventory ? {
        medkits: inventory.medkits, keys: inventory.keys, lanterns: inventory.lanterns,
        vials: inventory.vialsTaken, picked: inventory.picked, ammo: { ...inventory.byAmmo },
      } : null,
    });
    push("wave_end", { n: w.n, kills: w.kills });
  }

  function endRun(summary) {
    if (!run) return null;
    run.endedAt = new Date().toISOString();
    run.duration = +now().toFixed(1);
    run.summary = summary;
    const payload = run;
    run = null;
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(payload));
    } catch (e) { /* stockage plein ou indisponible */ }
    flush(payload);
    return payload;
  }

  async function flush(payload) {
    try {
      const res = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        keepalive: true,
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  /** Dernier rapport (localStorage) : outil de diagnostic et de test. */
  function last() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  return {
    startRun, event, shot, hit, kill, damage, loot, cache,
    startWave, endWave, bossSpawn, bossPhase, bossKill, sample, endRun,
    last, get id() { return run ? run.id : null; }, get active() { return !!run; },
  };
}
