// main.js — amorçage : renderer, caméra, post-traitement, boucle, diagnostic.
// Aucun module externe, aucun asset : three.js vendorisé et tout le reste procédural.

import * as THREE from "three";
import { createPost } from "./fx/post.js";
import { createWorld } from "./game/game.js";
import { createUI } from "./ui/ui.js";
import { createInput } from "./core/input.js";
import { createAudio } from "./core/audio.js";
import { clamp } from "./core/util.js";
import { loadZombieAssets, zombieAssetsReady, zombieAssetsError } from "./entities/zombie_glb.js";
import { loadLevel, saveLevel } from "./game/levels.js";

/* ─────────── capture des erreurs, avant tout le reste ─────────── */
window.__errors = [];
window.addEventListener("error", (e) => {
  window.__errors.push(`${e.message} @ ${e.filename}:${e.lineno}`);
});
window.addEventListener("unhandledrejection", (e) => {
  window.__errors.push(`promise: ${e.reason && (e.reason.stack || e.reason.message) || e.reason}`);
});
const origError = console.error.bind(console);
console.error = (...args) => {
  window.__errors.push(args.map((a) => (a && a.stack) || String(a)).join(" "));
  origError(...args);
};

const params = new URLSearchParams(location.search);
const SNAP = params.get("snap") || null;
const NIGHT = Number(params.get("night") || 0);

const canvas = document.getElementById("view");
const settings = {
  sensitivity: 1.0,
  volume: 0.72,
  fov: 68,
  quality: params.get("q") || "high",
  invertY: false,
};

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
  stencil: false,
  alpha: false,
});
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.setClearColor(0x05090b, 1);
renderer.info.autoReset = true;
// un contexte WebGL perdu (pilote, GPU) figeait l'image sans explication :
// on le dit au joueur et on trace l'événement dans __errors
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  window.__errors.push("webgl: contexte perdu");
  try { document.getElementById("toast").textContent = "Contexte graphique perdu — rechargez (F5)"; } catch (err) { /* rien */ }
}, false);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(settings.fov, 16 / 9, 0.05, 500);
camera.rotation.order = "YXZ";

const post = createPost(renderer);

const audio = createAudio();
const MUTE_KEY = "vigile.audio.muted";
let muted = true;
try {
  const stored = localStorage.getItem(MUTE_KEY);
  if (stored !== null) muted = stored === "1";
} catch (e) { /* stockage indisponible */ }
audio.setMuted(muted);
const input = createInput(canvas, {
  onTogglePause: () => {
    if (world.state.inventoryOpen) { world.closeInventory(); return; }
    // Échap ne doit pas empiler la pause sur un écran déjà ouvert (bénédiction,
    // révélation du boss) : le choix de carte se ferme tout seul.
    if (world.state.blessing || world.state.intro) return;
    if (world.state.mode === "playing") world.pause();
    else if (world.state.mode === "paused") world.resume();
  },
  onReload: () => { if (world.state.mode === "playing") world.player.startReload(); },
  onToggleLamp: () => {
    if (world.state.mode !== "playing") return;
    world.player.setLantern(!world.player.state.lanternOn);
    audio.ui();
  },
});

let ui = null;
let world = null;

function applyQuality(q) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let pr = 1;
  if (q === "high") pr = Math.min(dpr, 1.5);
  else if (q === "medium") pr = 1;
  else pr = 0.78;
  renderer.setPixelRatio(pr);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  post.setQuality(q);
  post.setSize(window.innerWidth, window.innerHeight, pr);
  if (world) {
    const size = q === "high" ? 2048 : 1024;
    if (world.moon.shadow.mapSize.x !== size) {
      world.moon.shadow.mapSize.set(size, size);
      if (world.moon.shadow.map) {
        world.moon.shadow.map.dispose();
        world.moon.shadow.map = null;
      }
    }
  }
}

ui = createUI({
  settings,
  onChange: (key, value) => {
    if (key === "volume") audio.setVolume(value);
    if (key === "fov") {
      camera.fov = value;
      camera.updateProjectionMatrix();
    }
    if (key === "quality") applyQuality(value);
  },
  onToggleSound: () => {
    const m = !audio.isMuted();
    audio.setMuted(m);
    muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch (e) { /* rien */ }
    ui.renderMuted(m);
    ui.toast(m ? "Son coupé" : "Son activé");
  },
  isMuted: () => muted,
  onStart: () => {
    audio.init();
    if (SNAP && SNAP !== "menu") return;
    world.startGame({ nightSeconds: NIGHT || 480 });
    input.requestLock();
  },
  onLevel: (id) => { saveLevel(id); },
  onResume: () => world.resume(),
  onQuit: () => world.quit(),
  onRestart: () => {
    world.startGame({ nightSeconds: NIGHT || 480 });
    input.requestLock();
  },
  onContinue: () => {
    world.continueNight();
    input.requestLock();
  },
  onMenu: () => world.quit(),
  onAchievements: () => world.achievements.list(),
});
ui.setLevel(loadLevel());

world = createWorld({
  scene, camera, renderer, audio, input, ui, settings,
});
world.glInfo = (() => {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "inconnu";
  } catch (e) { return "inconnu"; }
})();

// le joueur signale ses coups au HUD
world.player.onHit = (head) => ui.hitmarker(head);
ui.refreshBadge(world.achievements.summary());

camera.fov = settings.fov;
camera.updateProjectionMatrix();
applyQuality(settings.quality);
audio.setVolume(settings.volume);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  if (world && world.player) {
    world.player.viewCamera.aspect = w / h;
    world.player.viewCamera.updateProjectionMatrix();
  }
  renderer.setSize(w, h, false);
  const pr = renderer.getPixelRatio();
  post.setSize(w, h, pr);
}
window.addEventListener("resize", resize);
resize();

/* ─────────── boucle ─────────── */

let last = performance.now();
let fpsAcc = 0;
let fpsFrames = 0;
let lockedOnce = false;
let lockCheck = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (!isFinite(dt) || dt <= 0) dt = 1 / 60;
  dt = Math.min(dt, 0.05);

  // deux try séparés : une erreur de logique ne doit pas empêcher le rendu
  // (sinon l'image reste figée et le jeu paraît « gelé »)
  try {
    world.update(dt);
    ui.tick(dt);
  } catch (err) {
    window.__errors.push("update: " + ((err && (err.stack || err.message)) || err));
    if (window.__errors.length < 3) ui.toast("Erreur interne — voir la console");
  }

  try {
    const hurt = world.player.state.hurtFlash || 0;
    const dawn = world.state.dawnK || 0;
    post.render(scene, camera, {
      time: now / 1000,
      exposure: 1.24 - dawn * 0.05,
      bloom: world.state.mode === "menu" ? 0.78 : 0.6,
      dawn,
      damage: hurt * 0.55 + (1 - world.player.state.hp / 100) * 0.06,
      vignette: 0.42,
      bloomOn: settings.quality !== "low",
      overlay: { scene: world.player.viewScene, camera: world.player.viewCamera },
    });

    // mesure de fps par fenêtre d'une demi-seconde
  } catch (err) {
    window.__errors.push("render: " + ((err && (err.stack || err.message)) || err));
  }
  {
    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      world.trackFps(fpsFrames / fpsAcc);
      fpsAcc = 0;
      fpsFrames = 0;
    }

    // astuce de capture de pointeur
    if (world.state.mode === "playing") {
      lockCheck += dt;
      if (lockCheck > 1.2) {
        lockCheck = 0;
        ui.setLockHint(!input.state.locked && !SNAP);
      }
      if (input.state.locked) { lockedOnce = true; ui.setLockHint(false); }
    } else {
      ui.setLockHint(false);
    }
  }
}

requestAnimationFrame(frame);

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyI" && !e.repeat && world.state.mode === "playing" && !ui.blessingOpen) {
    e.preventDefault();
    world.toggleInventory();
    return;
  }
  if (e.code === "KeyM" && !e.repeat) {
    e.preventDefault();
    const m = !audio.isMuted();
    audio.setMuted(m);
    muted = m;
    try { localStorage.setItem(MUTE_KEY, m ? "1" : "0"); } catch (err) { /* rien */ }
    ui.renderMuted(m);
    ui.toast(m ? "Son coupé" : "Son activé");
  }
});

/* ─────────── pause automatique si la souris s'échappe ─────────── */
document.addEventListener("pointerlockchange", () => {
  // La perte de la souris ne met en pause que si aucun écran (bénédiction,
  // inventaire, révélation du boss) ne vient de s'ouvrir ou de se fermer :
  // l'événement arrive APRÈS le clic qui a refermé la carte, d'où le délai.
  if (!document.pointerLockElement && lockedOnce && world.canAutoPause()) world.pause();
});

/* ─────────── scénarios d'URL + préchargement des modèles ─────────── */
async function boot() {
  ui.showMenu();
  ui.setProgress(0.12, "La nuit se lève…");
  const zombies = await loadZombieAssets({
    base: "./",
    onProgress: (k, label) => ui.setProgress(0.12 + k * 0.84, label),
  });
  window.__assets = {
    zombies,
    error: zombieAssetsError() ? String(zombieAssetsError().message || zombieAssetsError()) : null,
  };
  ui.setProgress(1, zombies ? "La nuit est prête" : "La nuit est prête · mannequins de secours");

  if (SNAP && SNAP !== "menu") {
    world.applySnap(SNAP);
    ui.hideLoading();
  } else {
    setTimeout(() => ui.hideLoading(), 260);
  }
}
boot();

/* ─────────── diagnostic public ─────────── */
window.__world = world;
window.__scene = scene;   // outillage de mesure (répartition des triangles)
window.__audio = audio;
window.__input = input;   // le bot de test pilote les mêmes entrées que le joueur
window.__zombieAssets = () => ({ ready: zombieAssetsReady(), error: window.__assets ? window.__assets.error : null });
window.__diag = () => {
  const d = world.diag();
  d.drawCalls = post.stats.calls;
  d.triangles = post.stats.triangles;
  d.gpu = world.glInfo;
  d.viewport = { w: innerWidth, h: innerHeight, dpr: devicePixelRatio };
  return d;
};
window.__test = {
  start() { world.startGame({ nightSeconds: NIGHT || 480 }); },
  snap(n) { world.applySnap(n); },
  aimAt(x, y, z) {
    const p = world.player;
    const dx = x - p.pos.x, dz = z - p.pos.z;
    const eye = p.pos.y + 1.63;
    p.state.yaw = Math.atan2(-dx, -dz);
    p.state.pitch = Math.atan2(y - eye, Math.hypot(dx, dz));
  },
  enemyPositions() {
    return world.enemies.filter((e) => e.alive).map((e) => ({
      x: +e.pos.x.toFixed(2), z: +e.pos.z.toFixed(2), type: e.type, hp: Math.round(e.hp),
    }));
  },
  nearestEnemy() {
    let best = null, bd = 1e9;
    for (const e of world.enemies) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - world.player.pos.x, e.pos.z - world.player.pos.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best ? { x: +best.pos.x.toFixed(2), z: +best.pos.z.toFixed(2), type: best.type, dist: +bd.toFixed(2), hp: Math.round(best.hp) } : null;
  },
  player() {
    const p = world.player;
    return {
      hp: p.state.hp, ammo: p.state.ammo, reserve: p.state.reserve, yaw: p.state.yaw, pitch: p.state.pitch,
      pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z },
    };
  },
  setGod(on) { world.player.state.god = !!on; },
  killAll() {
    for (const e of world.enemies) if (e.alive) e.hit(9999, e.pos, new THREE.Vector3(0, 0, 1), "body");
  },
  /** Vide la scène des morts (outil de test : isole une cible de mêlée). */
  clearEnemies() {
    for (const e of world.enemies) if (!e.removed && e.dispose) e.dispose();
    world.enemies.length = 0;
    return world.enemies.length;
  },
  setHp(v) { world.player.state.hp = v; },
  teleport(x, z, yaw = 0) { world.player.teleport(x, z, yaw, 0); },
  spawn(type = "walker", x = 0, z = 0) {
    const zz = world.debugSpawn(type, x, z);
    return { x: zz.pos.x, z: zz.pos.z, type };
  },
  setTime(t) { world.state.nightT = t; },
  enableInput() { world.state.freeze = false; world.state.mode = "playing"; input.setEnabled(true); },
  boss() { const b = world.bossRef; return b ? { hp: Math.round(b.hp), maxHp: Math.round(b.maxHp), phase: b.phase, alive: b.alive, mode: b.mode } : null; },
  triggerBoss() { world.state.snap = world.state.snap || "test"; world.triggerBoss(); world.state.intro = null; world.state.freeze = false; input.setEnabled(true); },
  triggerBossIntro() {
    world.state.snap = null;
    world.state.mode = "playing";
    world.state.freeze = false;
    world.triggerBoss();
    return { intro: !!world.state.intro };
  },
  introState: () => ({ intro: !!world.state.intro, freeze: world.state.freeze, cam: { x: +world.player.camera.position.x.toFixed(2), y: +world.player.camera.position.y.toFixed(2), z: +world.player.camera.position.z.toFixed(2) } }),
  weakenBoss(ratio) { const b = world.bossRef; if (b) { b.hp = b.maxHp * ratio; } },
  shutdownBoss() { const b = world.bossRef; if (b) { b.hp = 1; b.hit(999, b.pos, new THREE.Vector3(0,0,1), "body"); } },
  rayEnemies() {
    const cam = world.player.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    const origin = cam.getWorldPosition(new THREE.Vector3());
    const rc = new THREE.Raycaster(origin, dir, 0, 200);
    rc.camera = cam;   // Sprite.raycast lit raycaster.camera.matrixWorld
    const hits = rc.intersectObjects(world.enemies.filter((e) => e.alive).map((e) => e.hitRoot), true);
    return { origin: origin.toArray().map(v => +v.toFixed(2)), dir: dir.toArray().map(v => +v.toFixed(3)),
      hits: hits.slice(0, 3).map((h) => ({ d: +h.distance.toFixed(2), part: h.object.userData.part })) };
  },
  drink() { world.state.flasks = Math.max(1, world.state.flasks); },
  achievements: () => world.achievements.list(),
  achievementsSummary: () => world.achievements.summary(),
  offerBlessing: () => world.offerBlessing(),
  chooseBlessing: (i) => {
    const scroll = document.getElementById("blessing-cards");
    const btn = scroll ? scroll.querySelectorAll(".blessing-card")[i] : null;
    if (btn) btn.click();
    return !!btn;
  },
  blessState: () => ({ open: ui.blessingOpen, freeze: world.state.freeze, mods: { ...world.player.mods } }),
  openInventory: () => world.openInventory(),
  closeInventory: () => world.closeInventory(),
  inventory: () => ({ open: world.state.inventoryOpen, active: world.state.activeItem, model: world.inventoryModel() }),
  pickItem: (id) => {
    const rows = document.querySelectorAll("#inv-list .inv-row");
    const idx = world.inventoryModel().items.findIndex((it) => it.id === id);
    if (idx >= 0 && rows[idx]) { rows[idx].click(); return true; }
    return false;
  },
  useItem: () => world.useActiveItem(),
  aimSecondary: () => { const p = world.player; return p.state.aiming; },
  weaponList: () => world.player.weapons.map((w) => ({ id: w.def.id, name: w.def.name, mag: w.mag })),
  /** Fige une frappe de mêlée à la fraction k (0 = départ, 1 = retour) pour la capture. */
  holdMelee(k = 0.5) {
    const p = world.player;
    const d = p.activeWeapon;
    if (!d.melee) return false;
    p.state.meleeT = (d.meleeDur || 0.4) * (1 - Math.min(0.999, Math.max(0, k)));
    p.state.meleeHold = true;
    p.state.meleeK = k;
    return true;
  },
  releaseMelee() { world.player.state.meleeHold = false; },
  /** Point exact de la tête du i-ème mort (os « head » du modèle). */
  headOf(i = 0) {
    const list = world.enemies;
    const e = list[i < 0 ? list.length + i : i];
    if (!e) return null;
    const bone = e.joints && e.joints.head;
    if (bone) {
      const v = new THREE.Vector3();
      bone.getWorldPosition(v);
      return { x: +v.x.toFixed(3), y: +v.y.toFixed(3), z: +v.z.toFixed(3), source: "bone" };
    }
    return { x: +e.pos.x.toFixed(3), y: +(e.pos.y + e.height * 0.92).toFixed(3), z: +e.pos.z.toFixed(3), source: "fallback" };
  },
  state: () => world.state,
};
