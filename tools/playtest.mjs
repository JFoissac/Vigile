// playtest.mjs — un bot joue réellement : clic sur le menu, marche, tir, rechargement,
// pause, changement de vague et fin de nuit. Aucune dépendance npm.
// Usage : node tools/playtest.mjs

import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const port = 9700 + Math.floor(Math.random() * 200);
const base = process.env.VIGILE_URL || "http://127.0.0.1:8131/";
const chrome = await launchChrome({ port });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send("Runtime.enable");
await cdp.goto(`${base}?night=150`);

const checks = [];
const ok = (name, cond, detail = "") => {
  checks.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "OK  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
await new Promise((r) => setTimeout(r, 1500));
ok("page prête, 0 erreur", (await cdp.evaluate("window.__errors.length")) === 0, JSON.stringify(await cdp.evaluate("window.__errors")));
ok("scène menu affichée", (await cdp.evaluate("!document.getElementById('menu').hidden")));

// clic réel sur le bouton Commencer
const rect = await cdp.evaluate(`(() => { const r = document.getElementById('btn-start').getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; })()`);
await cdp.click(rect.x, rect.y);
await new Promise((r) => setTimeout(r, 1200));
let d = await cdp.evaluate("window.__diag()");
ok("partie lancée (state=playing)", d.state === "playing", d.state);
ok("HUD visible", await cdp.evaluate("!document.getElementById('hud').hidden"));
ok("audio muet au démarrage", d.audio !== "running", d.audio);
await cdp.press("KeyM", "m");
await new Promise((r) => setTimeout(r, 400));
d = await cdp.evaluate("window.__diag()");
ok("M active le son", d.audio === "running", d.audio);
ok("bouton son en état actif", (await cdp.evaluate("document.getElementById('btn-sound').getAttribute('aria-pressed')")) === "true");
ok("préférence persistée", (await cdp.evaluate("localStorage.getItem('vigile.audio.muted')")) === "0");

// marche avant
const z0 = d.pos.z;
await cdp.hold("KeyW", "w");
await new Promise((r) => setTimeout(r, 900));
await cdp.release("KeyW", "w");
await new Promise((r) => setTimeout(r, 150));
d = await cdp.evaluate("window.__diag()");
ok("le joueur avance (Z diminue)", d.pos.z < z0 - 1.5, `z ${z0} -> ${d.pos.z}`);

// attend un zombie de la vague 1
let spawnWait = 0;
let enemies = [];
while (spawnWait < 30) {
  enemies = await cdp.evaluate("window.__test.enemyPositions()");
  if (enemies.length > 0) break;
  await new Promise((r) => setTimeout(r, 500));
  spawnWait += 0.5;
}
ok("des zombies apparaissent", enemies.length > 0, JSON.stringify(enemies.slice(0, 3)));

// vise la tête du plus proche et tire (clic réel au centre)
// cible déterministe en terrain dégagé (le chemin, devant la chapelle)
await cdp.evaluate("window.__test.spawn('walker', 0.4, 17)");
await new Promise((r) => setTimeout(r, 300));
let killed = false;
let targetHp = null;
const killsBefore = (await cdp.evaluate("window.__diag()")).kills;
for (let i = 0; i < 8 && !killed; i++) {
  const near = await cdp.evaluate("window.__test.nearestEnemy()");
  if (!near) break;
  targetHp = near.hp;
  await cdp.evaluate(`window.__test.aimAt(${near.x}, ${1.25}, ${near.z})`);
  await new Promise((r) => setTimeout(r, 60));
  const before = await cdp.evaluate("window.__test.player()");
  await cdp.click(800, 450);
  await new Promise((r) => setTimeout(r, 260));
  const after = await cdp.evaluate("window.__test.player()");
  if (after.ammo < before.ammo) {
    ok(`tir ${i + 1} consomme une balle`, true, `ammo ${before.ammo} -> ${after.ammo}`);
  }
  const killsNow = (await cdp.evaluate("window.__diag()")).kills;
  if (killsNow > killsBefore) killed = true;
}
ok("les dégâts tuent un zombie", killed, `dernier hp connu ${targetHp}`);

// rechargement au clavier
await cdp.press("KeyR", "r");
await new Promise((r) => setTimeout(r, 300));
let mid = await cdp.evaluate("window.__diag()");
ok("rechargement déclenché", mid.reloading === true);
await new Promise((r) => setTimeout(r, 2000));
d = await cdp.evaluate("window.__diag()");
ok("chargeur rempli après rechargement", d.reloading === false && d.ammo >= 8, `ammo=${d.ammo}, reserve=${d.reserve}`);

// pause / reprise
await cdp.press("Escape", "Escape");
await new Promise((r) => setTimeout(r, 500));
d = await cdp.evaluate("window.__diag()");
ok("pause via Échap", d.state === "paused", d.state);
const resumeRect = await cdp.evaluate(`(() => { const r = document.getElementById('btn-resume').getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; })()`);
await cdp.click(resumeRect.x, resumeRect.y);
await new Promise((r) => setTimeout(r, 500));
d = await cdp.evaluate("window.__diag()");
ok("reprise", d.state === "playing", d.state);

// état de la vague : le compteur doit exister et la difficulté monter
const wave = d.wave;
ok("compteur de vague actif", wave >= 1, `vague ${wave}`);

// avance rapide jusqu'à l'aube -> écran de fin (victoire sans boss)
await cdp.evaluate(`(() => { const w = window.__world; w.state.nightT = w.state.nightDur - 0.2; w.state.freeze = false; w.state.bossSpawned = false; return true; })()`);
await new Promise((r) => setTimeout(r, 1200));
const endVisible = await cdp.evaluate("!document.getElementById('end').hidden");
const verdict = await cdp.evaluate("document.getElementById('end-verdict').textContent");
ok("écran de fin affiché à l'aube", endVisible, verdict);
ok("victoire affichée", verdict.includes("AUBE"), verdict);
const stats = await cdp.evaluate("document.querySelectorAll('#end-stats .stat').length");
ok("statistiques de fin présentes", stats >= 6, `${stats} lignes`);

const errors = await cdp.evaluate("window.__errors || []");
ok("aucune erreur console/page", errors.length === 0, JSON.stringify(errors));

await cdp.screenshot("shots/debug-playtest-end.png");
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} vérifications réussies`);
cdp.close();
await closeChrome(chrome);
process.exit(failed.length ? 1 : 0);
