// hudtest.mjs — le radar des morts et la lecture des munitions, mesurés sur le DOM.
// Usage : node tools/hudtest.mjs   (python server.py 8131 d'abord)

import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const port = 9300 + Math.floor(Math.random() * 200);
const base = process.env.VIGILE_URL || "http://127.0.0.1:8131/";
const chrome = await launchChrome({ port });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send("Runtime.enable");
await cdp.goto(base);

const checks = [];
const ok = (name, cond, detail = "") => {
  checks.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "OK  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
await new Promise((r) => setTimeout(r, 600));
await cdp.evaluate("window.__test.start()");
await new Promise((r) => setTimeout(r, 900));

// scène stable : pas de vague en cours, pas de morts qui traînent
const setup = await cdp.evaluate(`(() => {
  const W = window.__world, p = W.player;
  W.state.waveState = "intermission";
  W.state.intermission = 9999;
  for (const e of W.enemies) if (!e.removed && e.dispose) e.dispose();
  W.enemies.length = 0;
  p.teleport(0, 30, 0, 0);
  p.state.hp = 100;
  window.__test.enableInput();
  return { yaw: p.state.yaw };
})()`);
await new Promise((r) => setTimeout(r, 400));

/* ── 1. présence et géométrie du radar ── */

const geo = await cdp.evaluate(`(() => {
  const r = document.getElementById('radar');
  if (!r) return null;
  const b = r.getBoundingClientRect();
  const w = document.querySelector('.hud-wave').getBoundingClientRect();
  return { w: Math.round(b.width), h: Math.round(b.height), top: Math.round(b.top), left: Math.round(b.left), waveBottom: Math.round(w.bottom), visible: getComputedStyle(r).display !== 'none' };
})()`);
ok("radar présent dans le HUD", geo && geo.visible, JSON.stringify(geo));
ok("radar sous le bloc de vague (aucun chevauchement)", geo && geo.top >= geo.waveBottom - 2, geo ? `radar ${geo.top} / vague ${geo.waveBottom}` : "");

/* ── 2. position des points : devant, derrière, à droite ── */

async function place(x, z, type = "walker") {
  return await cdp.evaluate(`(() => {
    const W = window.__world;
    for (const e of W.enemies) if (!e.removed && e.dispose) e.dispose();
    W.enemies.length = 0;
    W.player.teleport(0, 30, 0, 0);
    const z = W.debugSpawn("${type}", ${x}, ${z});
    z.rising = false; z.rise = 1.2; z.pos.y = W.player.groundAt(${x}, ${z}); z.group.position.y = z.pos.y;
    return { x: z.pos.x, z: z.pos.z };
  })()`);
}

async function blipTop() {
  // le radar se rafraîchit à 14 Hz : on attend qu'un point apparaisse
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 120));
    const has = await cdp.evaluate("!!document.querySelector('#radar-blips .blip')");
    if (has) break;
  }
  return await cdp.evaluate(`(() => {
    const el = document.querySelector('#radar-blips .blip');
    if (!el) return null;
    const d = el.getBoundingClientRect();
    const dial = document.querySelector('#radar .radar-dial').getBoundingClientRect();
    return { left: +(((d.left + d.width / 2) - dial.left) / dial.width * 100).toFixed(1), top: +(((d.top + d.height / 2) - dial.top) / dial.height * 100).toFixed(1), cls: el.className, count: document.getElementById('radar-count').textContent.trim() };
  })()`);
}

await place(0, 20);                       // 10 m devant (le joueur regarde vers -Z)
let b = await blipTop();
ok("un mort devant : point au-dessus du centre", b && b.top < 45, JSON.stringify(b));
ok("un mort à 10 m : point à ~36 % de la hauteur", b && Math.abs(b.top - 36.5) < 5, b && String(b.top));
ok("compteur « à portée » = 1", b && b.count === "1", b && b.count);

await place(0, 40);                       // 10 m derrière
b = await blipTop();
ok("un mort derrière : point sous le centre", b && b.top > 55, JSON.stringify(b));

await place(10, 30);                      // 10 m à droite (X+)
b = await blipTop();
ok("un mort à droite : point à droite du centre", b && b.left > 55, JSON.stringify(b));

await place(-10, 30);
b = await blipTop();
ok("un mort à gauche : point à gauche du centre", b && b.left < 45, JSON.stringify(b));

const types = await cdp.evaluate(`(() => {
  const W = window.__world;
  for (const e of W.enemies) if (!e.removed && e.dispose) e.dispose();
  W.enemies.length = 0;
  W.player.teleport(0, 30, 0, 0);
  const out = [];
  for (const [t, x] of [["walker", -4], ["runner", -1], ["brute", 2], ["zealot", 5]]) {
    const z = W.debugSpawn(t, x, 22);
    z.rising = false; z.rise = 1.2; z.pos.y = W.player.groundAt(x, 22); z.group.position.y = z.pos.y;
    out.push(t);
  }
  return out;
})()`);
await new Promise((r) => setTimeout(r, 400));
const classes = await cdp.evaluate("Array.from(document.querySelectorAll('#radar-blips .blip')).map(e => e.className).sort().join('|')");
ok("quatre types de morts, quatre classes de point", ["walker", "runner", "brute", "zealot"].every((t) => classes.includes(t)), classes);

/* ── 2 bis. flèche de direction vers le mort le plus proche ── */

async function arrowAt(x, z) {
  await cdp.evaluate(`(() => {
    const W = window.__world;
    W.state.waveState = "intermission"; W.state.intermission = 9999;
    window.__test.clearEnemies();
    W.player.teleport(0, 26, 0, 0);
    const e = W.debugSpawn("walker", ${x}, ${z});
    e.rising = false; e.rise = 1.2; e.pos.y = 0; e.group.position.y = 0;
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, 350));
  return await cdp.evaluate(`(() => { const el = document.getElementById("threat-arrow"); return el ? { hidden: el.hidden, a: el.style.getPropertyValue("--a") } : null; })()`);
}
const front = await arrowAt(0, 16);
ok("flèche : mort devant → 0°", front && !front.hidden && front.a === "0.0deg", JSON.stringify(front));
const right = await arrowAt(10, 26);
ok("flèche : mort à droite → 90°", right && right.a === "90.0deg", JSON.stringify(right));
const back = await arrowAt(0, 36);
ok("flèche : mort derrière → 180°", back && back.a === "180.0deg", JSON.stringify(back));
const near = await arrowAt(0, 23);
ok("flèche : masquée à moins de 6 m", near && near.hidden === true, JSON.stringify(near));

/* ── 3. munitions : pips, chargeurs, alerte ── */

const ammo = await cdp.evaluate(`(() => {
  const W = window.__world, p = W.player;
  p.teleport(0, 30, 0, 0);
  p.state.hp = 100;
  p.selectWeapon(0);
  p.weapons[0].mag = 7; p.reserves['9mm'] = 84; p.syncState();
  return { mag: p.activeWeapon.mag, ammo: 7, reserve: 84, mags: Math.ceil(84 / p.activeWeapon.mag) };
})()`);
await new Promise((r) => setTimeout(r, 400));
const pips = await cdp.evaluate(`(() => {
  const all = document.querySelectorAll('#ammo-pips i');
  return { n: all.length, on: document.querySelectorAll('#ammo-pips i.on').length, low: document.querySelectorAll('#ammo-pips i.low').length,
    mags: document.getElementById('ammo-mags').textContent.trim(), alert: !document.getElementById('ammo-alert').hidden,
    mag: document.getElementById('ammo').textContent.trim(), res: document.getElementById('ammo-res').textContent.trim(),
    panelLow: document.getElementById('hud-ammo').classList.contains('low') };
})()`);
ok("pips : un trait par balle du chargeur", pips.n === ammo.mag, `${pips.n} pips / chargeur ${ammo.mag}`);
ok("pips : 7 allumés pour 7 balles", pips.on === 7, `${pips.on}`);
ok("chargeurs = réserve / chargeur (arrondi supérieur)", pips.mags === String(ammo.mags), `${pips.mags} (attendu ${ammo.mags})`);
ok("compteur principal 07 / 84", pips.mag === "07" && pips.res === "84", `${pips.mag}/${pips.res}`);
ok("pas d'alerte tant qu'il reste des balles", pips.alert === false);

await cdp.evaluate(`(() => { const p = window.__world.player; p.weapons[p.state.weaponIndex].mag = 0; p.syncState(); })()`);
await new Promise((r) => setTimeout(r, 400));
const empty = await cdp.evaluate(`(() => ({
  alert: !document.getElementById('ammo-alert').hidden,
  txt: document.getElementById('ammo-alert-t').textContent.trim(),
  empty: document.getElementById('ammo-alert').classList.contains('empty'),
  panelEmpty: document.getElementById('hud-ammo').classList.contains('empty'),
  low: document.getElementById('hud-ammo').classList.contains('low'),
}))()`);
ok("chargeur vide : alerte sous le réticule", empty.alert && empty.empty, JSON.stringify(empty));
ok("chargeur vide : message clair", /vide|munitions/i.test(empty.txt), empty.txt);

await cdp.evaluate("window.__world.player.startReload()");
await new Promise((r) => setTimeout(r, 1600));
const reloaded = await cdp.evaluate(`(() => ({
  ammo: window.__world.player.state.ammo,
  alert: !document.getElementById('ammo-alert').hidden,
}))()`);
ok("après rechargement : alerte éteinte", reloaded.alert === false && reloaded.ammo === ammo.mag, JSON.stringify(reloaded));

/* ── 4. le radar ne coûte rien au rendu ── */
const fps = await cdp.evaluate("window.__diag().fps");
ok("fps ≥ 60 avec le radar", fps >= 60, `${fps} i/s`);

const errors = await cdp.evaluate("window.__errors || []");
ok("aucune erreur console", errors.length === 0, errors.slice(0, 2).join(" | "));

const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} contrôles OK`);
cdp.close();
await closeChrome(chrome);
process.exit(failed.length ? 1 : 0);
