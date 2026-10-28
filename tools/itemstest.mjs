// itemstest.mjs — ramassage auto, inventaire (I), objet au clic droit, molette,
// et probabilités de headshot (propres à chaque arme). Usage : node tools/itemstest.mjs
import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const port = 9700 + Math.floor(Math.random() * 90);
const base = process.env.VIGILE_URL || "http://127.0.0.1:8131/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond, detail = null) => {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "OK  " : "FAIL"} ${name}${detail != null ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
};

const chrome = await launchChrome({ port, width: 1600, height: 900 });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send("Runtime.enable");
await cdp.goto(`${base}?snap=wave3`);
await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
await cdp.waitFor("window.__diag().snap === 'wave3'", 20000);
await cdp.evaluate("window.__test.enableInput()");
await cdp.evaluate("window.__world.player.unlockAll()");   // la carabine se ramasse en jeu
await sleep(300);
await cdp.evaluate("window.__test.clearEnemies()");
await sleep(400);
await cdp.evaluate("window.__test.chooseBlessing(0)");
await sleep(200);
await cdp.evaluate("window.__test.enableInput()");
await sleep(200);

/* ─── 1. ramassage automatique au passage ─── */

const before = await cdp.evaluate("(() => { const w = window.__world; return { items: w.loot.items.filter(i => !i.taken).length, medkits: w.loot.inventory.medkits }; })()");
await cdp.evaluate("window.__test.teleport(0.5, 24, 0)");
await cdp.evaluate("(() => { const w = window.__world; w.loot.spawnAt('medkit', w.player.pos.x, w.player.pos.z - 0.9); return true; })()");
await sleep(500);
const after = await cdp.evaluate("(() => { const w = window.__world; return { items: w.loot.items.filter(i => !i.taken).length, medkits: w.loot.inventory.medkits, prompt: w.loot.prompt ? w.loot.prompt.text : null }; })()");
ok("l'objet au sol est ramassé en marchant dessus", after.medkits === before.medkits + 1 && after.items === before.items, { before, after });

/* ─── 2. inventaire : I ouvre, la partie se fige ─── */

await cdp.press("KeyI", "KeyI");
await sleep(450);
const invOpen = await cdp.evaluate("window.__test.inventory()");
const panelVisible = await cdp.evaluate("!document.getElementById('inventory').hidden");
ok("I ouvre l'inventaire", panelVisible === true, panelVisible);
ok("l'inventaire met la partie en pause (freeze)", invOpen.open === true && (await cdp.evaluate("window.__world.state.freeze")) === true);
ok("l'inventaire liste cinq emplacements", invOpen.model.items.length === 5, invOpen.model.items.map((i) => `${i.id}:${i.count}`));
const rows = await cdp.evaluate("document.querySelectorAll('#inv-list .inv-row').length");
ok("cinq lignes affichées", rows === 5, rows);

/* ─── 3. choisir l'objet actif ─── */

await cdp.evaluate("window.__test.pickItem('medkit')");
await sleep(250);
const picked = await cdp.evaluate("window.__test.inventory()");
ok("la trousse devient l'objet actif", picked.active === "medkit", picked.active);
const hudItem = await cdp.evaluate("(() => { const e = document.getElementById('active-item'); return { hidden: e.hidden, name: document.getElementById('active-name').textContent }; })()");
ok("le HUD affiche l'objet actif", hudItem.hidden === false && /trousse/i.test(hudItem.name), hudItem);

/* ─── 4. refermer avec I ─── */

await cdp.press("KeyI", "KeyI");
await sleep(400);
const closed = await cdp.evaluate("({ open: window.__world.state.inventoryOpen, freeze: window.__world.state.freeze, hidden: document.getElementById('inventory').hidden })");
ok("I referme l'inventaire et rend la main", closed.open === false && closed.freeze === false && closed.hidden === true, closed);

/* ─── 5. clic droit = utiliser l'objet actif ─── */

await cdp.evaluate("window.__test.setHp(40)");
const hpBefore = await cdp.evaluate("window.__world.player.state.hp");
const kitsBefore = await cdp.evaluate("window.__world.loot.inventory.medkits");
await cdp.evaluate(`(() => { const ev = new MouseEvent('mousedown', { button: 2, bubbles: true }); window.dispatchEvent(ev); return true; })()`);
await sleep(300);
const used = await cdp.evaluate("({ hp: window.__world.player.state.hp, kits: window.__world.loot.inventory.medkits, aiming: window.__world.player.state.aiming })");
ok("clic droit consomme une trousse et soigne", used.kits === kitsBefore - 1 && used.hp > hpBefore, { hpBefore, used });
ok("le clic droit d'objet n'arme pas la visée", used.aiming === false, used.aiming);
await cdp.evaluate(`(() => { window.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true })); return true; })()`);

/* ─── 6. sans objet actif, clic droit = visée ─── */

await cdp.evaluate("window.__test.openInventory()");
await sleep(250);
await cdp.evaluate("window.__test.pickItem('none')");
await sleep(150);
await cdp.evaluate("window.__test.closeInventory()");
await sleep(250);
const curWeapon = await cdp.evaluate("window.__world.player.state.weaponIndex");
await cdp.evaluate("window.__world.player.selectWeapon(4)");
await sleep(300);
await cdp.evaluate(`(() => { window.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true })); return true; })()`);
await sleep(250);
const aiming = await cdp.evaluate("window.__world.player.state.aiming");
ok("sans objet actif, le clic droit vise (carabine)", aiming === true, aiming);
await cdp.evaluate(`(() => { window.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true })); return true; })()`);
await cdp.evaluate(`window.__world.player.selectWeapon(${curWeapon})`);

/* ─── 7. molette : changer d'arme ─── */

const idx0 = await cdp.evaluate("window.__world.player.state.weaponIndex");
await cdp.evaluate(`(() => { window.dispatchEvent(new WheelEvent('wheel', { deltaY: 120, bubbles: true })); return true; })()`);
await sleep(300);
const idx1 = await cdp.evaluate("window.__world.player.state.weaponIndex");
ok("la molette change d'arme", idx1 !== idx0, { idx0, idx1 });
await cdp.evaluate(`window.__world.player.selectWeapon(${idx0})`);

/* ─── 8. headshot : taux propre au pistolet (40 % par défaut) ─── */

await cdp.evaluate("window.__world.player.selectWeapon(0)");   // pistolet
const pistolChance = await cdp.evaluate("window.__world.player.activeWeapon.headChance");
await cdp.evaluate("window.__world.player.addAmmo('9mm', 200)");
await cdp.evaluate("window.__world.player.weapons[0].mag = 12");
// stoppe la vague : plus aucun mort ne vient polluer la cible de mesure
await cdp.evaluate("(() => { const w = window.__world; w.state.pending = 0; w.state.waveState = 'intermission'; w.state.intermission = 999; return true; })()");
await cdp.evaluate("window.__test.clearEnemies()");
await sleep(250);

async function headshotTrial(type, trials) {
  let kills = 0;
  for (let i = 0; i < trials; i++) {
    await cdp.evaluate(`(() => { const p = window.__world.player; window.__test.spawn('${type}', p.pos.x + 0.2, p.pos.z - 3.0); const e = window.__world.enemies[window.__world.enemies.length - 1]; e.speed = 0; return true; })()`);
    await sleep(160);
    const target = await cdp.evaluate("(() => { const e = window.__world.enemies[window.__world.enemies.length-1]; return { x: e.pos.x, y: e.pos.y, z: e.pos.z, h: e.height }; })()");
    await cdp.evaluate(`window.__test.aimAt(${target.x}, ${(target.y + target.h * 0.88).toFixed(3)}, ${target.z})`);
    await sleep(50);
    if ((await cdp.evaluate("window.__world.player.weapons[0].mag")) <= 0) {
      await cdp.evaluate("window.__world.player.weapons[0].mag = 12");
    }
    await cdp.click(800, 450);
    await sleep(110);
    const state = await cdp.evaluate("(() => { const e = window.__world.enemies[window.__world.enemies.length - 1]; return e ? { alive: e.alive, hp: Math.round(e.hp) } : null; })()");
    if (state && state.alive === false) kills++;
    await cdp.evaluate("window.__test.clearEnemies()");
    await sleep(50);
  }
  return kills;
}

const walkerTrials = 60;
const walkerKills = await headshotTrial("walker", walkerTrials);
const walkerRate = walkerKills / walkerTrials;
ok(`tirs à la tête : abattage net ~${Math.round(pistolChance * 100)} % sur un rodeur (${walkerKills}/${walkerTrials})`,
  walkerRate >= pistolChance - 0.18 && walkerRate <= pistolChance + 0.18, { walkerRate, pistolChance });

const bruteTrials = 40;
const bruteKills = await headshotTrial("brute", bruteTrials);
const bruteRate = bruteKills / bruteTrials;
ok(`tirs à la tête : ~${Math.round(pistolChance * 20)} % sur un colosse (${bruteKills}/${bruteTrials})`,
  bruteRate <= pistolChance * 0.2 + 0.14, { bruteRate, pistolChance });

const errs = await cdp.evaluate("window.__errors || []");
ok("0 erreur pendant les essais", errs.length === 0, errs);

const failures = results.filter((r) => !r.ok).length;
console.log(JSON.stringify({ checks: results.length, failures }, null, 2));
cdp.close();
await closeChrome(chrome);
process.exit(failures ? 1 : 0);
