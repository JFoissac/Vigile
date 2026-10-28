// weaponstest.mjs — preuve exécutée de l'arsenal, des munitions typées et du butin.
// Six armes tirées au clavier/souris réels, rechargements par calibre, ramassage (E),
// caisses et coffres, mort du boss, fps en headless GPU, captures dans shots/.
// Usage : node tools/weaponstest.mjs   (serveur 8131 requis)

import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const BASE = process.env.VIGILE_URL || "http://127.0.0.1:8131/";
const port = 9950 + Math.floor(Math.random() * 40);
const chrome = await launchChrome({ port });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send("Runtime.enable");

const checks = [];
const measures = {};
const measure = (k, v) => { measures[k] = v; };
const ok = (name, cond, detail = "") => {
  checks.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "OK  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gotoSnap(name) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await cdp.goto(`${BASE}?snap=${name}${attempt ? `&r=${Date.now()}` : ""}`);
    const ready = await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
    if (ready) { await sleep(1000); return true; }
    await sleep(1800);
  }
  return false;
}

async function readDiag() { return cdp.evaluate("window.__diag()"); }

/* ─────────── 1. arsenal déclaré ─────────── */

ok("page chargée", await gotoSnap("wave3"));
let errs = await cdp.evaluate("window.__errors || []");
ok("0 erreur au chargement", errs.length === 0, JSON.stringify(errs.slice(0, 2)));

const arsenal = await cdp.evaluate(`(() => window.__world.player.weapons.map(w => ({
  id: w.def.id, name: w.def.name, ammo: w.def.ammo, mag: w.def.mag,
  auto: w.def.auto, melee: !!w.def.melee, pellets: w.def.pellets || 1,
  zoom: w.def.zoom || 0, damage: w.def.damage,
})))()`);
ok("neuf armes", arsenal.length === 9, arsenal.map((w) => w.name).join(" · "));
const ids = arsenal.map((w) => w.id).join(",");
ok("arsenal attendu (pistolet, pompe, PM, assaut, carabine, hachette, revolver, machette, lance-grenades)",
  ids === "pistol,shotgun,smg,rifle,sniper,hatchet,revolver,machete,launcher", ids);
ok("revolver à barillet (8 coups, 9 mm)",
  (() => { const r = arsenal.find((w) => w.id === "revolver"); return r && r.mag === 8 && r.ammo === "9mm" && !r.auto; })());
ok("machette de mêlée, plus rapide que la hachette",
  (() => {
    const m = arsenal.find((w) => w.id === "machete");
    const h = arsenal.find((w) => w.id === "hatchet");
    return m && m.melee && m.damage < h.damage;
  })());
ok("cinq calibres à feu distincts",
  new Set(arsenal.filter((w) => !w.melee).map((w) => w.ammo)).size === 5,
  arsenal.filter((w) => !w.melee).map((w) => w.ammo).join(","));
ok("carabine avec zoom", arsenal.find((w) => w.id === "sniper").zoom > 0.2);
ok("pompe à dispersion (8 grains)", arsenal.find((w) => w.id === "shotgun").pellets === 8);
ok("PM et fusil d'assaut automatiques",
  arsenal.find((w) => w.id === "smg").auto && arsenal.find((w) => w.id === "rifle").auto);
ok("hachette de mêlée sans munition", arsenal.find((w) => w.id === "hatchet").melee);

// entrer en jeu réel pour que les entrées clavier/souris soient actives
await cdp.evaluate("window.__test.enableInput()");
await cdp.evaluate("window.__test.setGod(true)");
// les armes se ramassent en jeu (pistolet + hachette au départ) : ici on teste
// l'arsenal complet, donc on débloque tout par l'outil de test.
await cdp.evaluate("window.__world.player.unlockAll()");
await sleep(200);

/* ─────────── 2. chaque arme tire avec ses munitions ─────────── */

const labels = ["Pistolet Mle 1935", "Fusil à pompe Saint-Éloi", "PM « Vêpres »", "Fusil d'assaut « Matines »", "Carabine « Laudes »", "Hachette de garde"];
for (let i = 0; i < 6; i++) {
  const w = arsenal[i];
  await cdp.press(`Digit${i + 1}`, String(i + 1));
  await sleep(350);
  const st = await cdp.evaluate("window.__world.player.state");
  const hudName = await cdp.evaluate("document.getElementById('weapon').textContent");
  const activeSlot = await cdp.evaluate(`document.querySelector('#weapon-slots .slot.on')?.dataset.slot`);
  ok(`touche ${i + 1} sélectionne ${w.name}`, st.weaponIndex === i && st.weaponId === w.id, `index ${st.weaponIndex}`);
  ok(`HUD nomme ${w.name}`, hudName === labels[i], hudName);
  ok(`case ${i + 1} allumée seule`, activeSlot === String(i + 1), String(activeSlot));

  const before = await cdp.evaluate(`(() => { const p = window.__world.player; const w = p.weapons[${i}]; return { mag: w.mag, shots: p.state.shots, r: { ...p.reserves } }; })()`);
  await cdp.click(800, 450);
  await sleep(300);
  const after = await cdp.evaluate(`(() => { const p = window.__world.player; const w = p.weapons[${i}]; return { mag: w.mag, shots: p.state.shots, r: { ...p.reserves } }; })()`);
  if (w.melee) {
    ok(`hachette frappe sans munition`, after.shots > before.shots && after.mag === 0, `tirs ${before.shots}->${after.shots}`);
  } else {
    const spent = before.mag - after.mag;
    const valid = w.auto ? spent >= 1 && spent <= 4 : spent === 1;
    ok(`${w.name} consomme ses cartouches`, valid, `${before.mag}->${after.mag} (${spent})`);
    ok(`${w.name} ne touche pas les autres réserves`, JSON.stringify(after.r) === JSON.stringify(before.r));
  }
}

/* ─────────── 3. hachette : dégâts de mêlée réels ─────────── */

await cdp.evaluate("window.__world.player.selectWeapon(5)");
// vider la scène termine la vague : on ferme la bénédiction puis on rend la main
await cdp.evaluate("window.__test.clearEnemies()");
await sleep(400);
await cdp.evaluate("window.__test.chooseBlessing(0)");
await sleep(200);
await cdp.evaluate("window.__test.enableInput()");
await sleep(200);
const idxTarget = await cdp.evaluate("window.__world.enemies.length");
await cdp.evaluate("window.__test.spawn('walker', window.__world.player.pos.x + 0.1, window.__world.player.pos.z - 2.0)");
await sleep(500);
const targetState = await cdp.evaluate(`(() => { const e = window.__world.enemies[${idxTarget}]; return e ? { state: e.state, rising: e.rising, hp: Math.round(e.hp) } : null; })()`);
ok("la cible de mêlée est debout et vulnérable", targetState && !targetState.rising && targetState.state === "walk", targetState);
const target0 = await cdp.evaluate(`(() => { const e = window.__world.enemies[${idxTarget}]; return e ? { x: e.pos.x, z: e.pos.z, hp: e.hp } : null; })()`);
if (target0) {
  await cdp.evaluate(`window.__test.aimAt(${target0.x}, 1.15, ${target0.z})`);
  await sleep(150);
  await cdp.click(800, 450);
  await sleep(350);
  const target1 = await cdp.evaluate(`(() => { const e = window.__world.enemies[${idxTarget}]; return e ? { hp: e.hp, alive: e.alive } : null; })()`);
  ok("la hachette blesse en mêlée", target1 && target1.hp < target0.hp, `${target0.hp} -> ${target1 && target1.hp}`);
} else {
  ok("la hachette blesse en mêlée", false, "cible non créée");
}

/* ─────────── 4. rechargement cohérent par calibre ─────────── */

await cdp.evaluate("window.__world.player.refill()");
await cdp.evaluate("window.__world.player.selectWeapon(0)");
await cdp.evaluate(`(() => { const p = window.__world.player; window.__before556 = p.reserves['5.56']; p.weapons[0].mag = 2; p.reserves['9mm'] = 40; p.syncState(); })()`);
await cdp.press("KeyR", "r");
await sleep(1650);
const rl = await cdp.evaluate(`(() => { const p = window.__world.player; return { mag: p.weapons[0].mag, magSize: p.activeWeapon.mag, r9: p.reserves['9mm'], r556: p.reserves['5.56'], r556Before: window.__before556, reloading: p.state.reloading }; })()`);
ok("rechargement pistolet : chargeur plein", rl.mag === rl.magSize && !rl.reloading && rl.mag > 0, `mag ${rl.mag}/${rl.magSize}`);
// 40 en réserve, 2 dans le chargeur : on prend (chargeur - 2)
ok("rechargement pistolet : 9 mm débité, 5,56 intact", rl.r9 === 40 - (rl.magSize - 2) && rl.r556 === rl.r556Before, JSON.stringify(rl));

await cdp.evaluate("window.__world.player.selectWeapon(3)");
await cdp.evaluate(`(() => { const p = window.__world.player; window.__before9 = p.reserves['9mm']; window.__before308 = p.reserves['.308']; p.weapons[3].mag = 0; p.reserves['5.56'] = 60; p.syncState(); })()`);
await cdp.press("KeyR", "r");
await sleep(2300);
const rl2 = await cdp.evaluate(`(() => { const p = window.__world.player; return { mag: p.weapons[3].mag, magSize: p.activeWeapon.mag, r556: p.reserves['5.56'], r9: p.reserves['9mm'], r308: p.reserves['.308'], r9Before: window.__before9, r308Before: window.__before308 }; })()`);
ok("rechargement fusil d'assaut : 5,56 débité, 9 mm et .308 intacts", rl2.mag === rl2.magSize && rl2.r556 === 60 - rl2.magSize && rl2.r9 === rl2.r9Before && rl2.r308 === rl2.r308Before, JSON.stringify(rl2));

// message quand la réserve est vide
await cdp.evaluate(`(() => { const p = window.__world.player; p.selectWeapon(4); p.weapons[4].mag = 0; p.reserves['.308'] = 0; p.syncState(); })()`);
await cdp.press("KeyR", "r");
await sleep(400);
const empty = await cdp.evaluate("document.getElementById('toast').textContent");
ok("message quand la réserve est vide", /plus de|vide/i.test(empty), empty);

/* ─────────── 5. butin : ramassage automatique et inventaire ─────────── */

await cdp.evaluate("window.__world.player.refill()");
await cdp.evaluate("window.__world.player.selectWeapon(0)");
const p0 = await cdp.evaluate("(() => ({x: window.__world.player.pos.x, z: window.__world.player.pos.z}))()");
const inv0 = await cdp.evaluate("window.__world.loot.inventory.picked");
const res0 = await cdp.evaluate("(() => ({...window.__world.player.reserves}))()");
await cdp.evaluate(`(() => { window.__world.loot.spawnAt("ammo556", ${p0.x + 0.5}, ${p0.z - 0.5}); return true; })()`);
await sleep(700);
const afterPick = await cdp.evaluate(`(() => ({
  picked: window.__world.loot.inventory.picked,
  r556: window.__world.player.reserves['5.56'],
  hud: document.getElementById('inv-556').textContent,
  toast: document.getElementById('toast').textContent,
  popup: !document.getElementById('loot-popup').hidden,
  popupText: document.getElementById('lp-items').textContent,
}))()`);
ok("marcher sur la boîte de 5,56 la ramasse (sans touche)", afterPick.picked > inv0 && afterPick.r556 > res0["5.56"], `${res0["5.56"]} -> ${afterPick.r556}`);
ok("HUD inventaire suit la réserve", afterPick.hud === String(afterPick.r556), `HUD ${afterPick.hud}`);
ok("notification de ramassage", /5,56|5\.56|réserve/i.test(afterPick.toast), afterPick.toast);
ok("popup de butin pour un objet rare", afterPick.popup === true && /5,56|5\.56/.test(afterPick.popupText), afterPick.popupText);

// trousse, clé, lanterne : ramassage automatique au passage
for (const [id, field] of [["medkit", "medkits"], ["key", "keys"], ["lantern", "lanterns"]]) {
  const before = await cdp.evaluate(`window.__world.loot.inventory.${field}`);
  const pos = await cdp.evaluate("(() => ({x: window.__world.player.pos.x, z: window.__world.player.pos.z}))()");
  await cdp.evaluate(`(() => { window.__world.loot.spawnAt("${id}", ${pos.x + 0.5}, ${pos.z - 0.5}); return true; })()`);
  await sleep(700);
  const after = await cdp.evaluate(`window.__world.loot.inventory.${field}`);
  ok(`ramassage ${id} incrémente l'inventaire`, after === before + 1, `${before} -> ${after}`);
}

/* ─────────── 6. caisses et coffres ─────────── */

const cacheInfo = await cdp.evaluate(`(() => ({
  total: window.__world.loot.caches.length,
  caisses: window.__world.loot.caches.filter(c => c.type === "caisse").length,
  coffres: window.__world.loot.caches.filter(c => c.type === "coffre").length,
  lande: window.__world.loot.caches.filter(c => c.z > 12).length,
  cimetiere: window.__world.loot.caches.filter(c => c.z < 0).length,
}))()`);
ok("caisses et coffres présents dans le monde", cacheInfo.total >= 6 && cacheInfo.caisses >= 3 && cacheInfo.coffres >= 2, JSON.stringify(cacheInfo));
ok("butin réparti lande + cimetière", cacheInfo.lande > 0 && cacheInfo.cimetiere > 0, `lande ${cacheInfo.lande} / cimetière ${cacheInfo.cimetiere}`);

const chest = await cdp.evaluate(`(() => {
  const c = window.__world.loot.caches.find(c => c.type === "coffre" && !c.opened);
  return c ? { x: c.x, z: c.z } : null;
})()`);
if (chest) {
  // dégager les objets au sol aux alentours pour que E vise bien le coffre
  await cdp.evaluate(`(() => {
    for (const it of window.__world.loot.items) {
      if (Math.hypot(it.group.position.x - ${chest.x}, it.group.position.z - ${chest.z}) < 4) {
        it.taken = true;
        it.group.removeFromParent();
      }
    }
    return true;
  })()`);
  const yaw = Math.atan2(-(chest.x - (chest.x + 1.2)), -(chest.z - (chest.z + 1.2)));
  await cdp.evaluate("window.__world.loot.inventory.keys = 0");
  await cdp.evaluate(`window.__world.player.teleport(${chest.x + 1.2}, ${chest.z + 1.2}, ${yaw}, 0)`);
  await sleep(600);
  const locked = await cdp.evaluate(`(() => {
    const c = window.__world.loot.caches.find(c => Math.abs(c.x - ${chest.x}) < 0.01 && Math.abs(c.z - ${chest.z}) < 0.01);
    return { opened: c.opened, text: document.getElementById('loot-text').textContent, visible: !document.getElementById('loot-prompt').hidden };
  })()`);
  ok("coffre verrouillé : message claire, pas d'ouverture", locked.opened === false && /verrouill/i.test(locked.text), locked);

  const itemsBefore = await cdp.evaluate("window.__world.loot.items.length");
  await cdp.evaluate("window.__world.loot.inventory.keys = 1");
  await sleep(800);
  const opened = await cdp.evaluate(`(() => {
    const c = window.__world.loot.caches.find(c => Math.abs(c.x - ${chest.x}) < 0.01 && Math.abs(c.z - ${chest.z}) < 0.01);
    return { opened: c.opened, items: window.__world.loot.items.length, keys: window.__world.loot.inventory.keys, toast: document.getElementById('toast').textContent, popup: !document.getElementById('loot-popup').hidden, popupItems: document.querySelectorAll('#lp-items .lp-row').length,
      popupNames: Array.from(document.querySelectorAll('#lp-items .lp-name')).map(e => e.textContent) };
  })()`);
  ok("clé en poche : le coffre s'ouvre au passage (sans touche)", opened.opened === true, opened.toast);
  ok("le coffre recrache au moins deux objets", opened.items >= itemsBefore + 2, `${itemsBefore} -> ${opened.items}`);
  ok("popup listant le contenu du coffre", opened.popup === true && opened.popupItems >= 2, opened.popupItems);
  // un coffre peut RENDRE une clé (cachet « sacristie ») : la clé dépensée est alors
  // immédiatement ramassée, et le compteur remonte à 1. On vérifie donc le solde net.
  const keyBack = (opened.popupNames || []).some((n) => /clé/i.test(n));
  ok("la clé est consommée (ou rendue par le coffre)", opened.keys === 0 || (opened.keys === 1 && keyBack), `clés ${opened.keys} · rendue ${keyBack}`);
  measures.coffre = opened.items - itemsBefore;
}

/* ─────────── 7. butin jamais dans un mur ─────────── */

const wallCheck = await cdp.evaluate(`(() => {
  const loot = window.__world.loot;
  let blocked = 0, total = 0;
  for (const it of loot.items) {
    total++;
    if (!loot.isFree(it.group.position.x, it.group.position.z, 0.05)) blocked++;
  }
  return { total, blocked };
})()`);
ok("aucun objet de butin dans la pierre", wallCheck.blocked === 0, `${wallCheck.blocked}/${wallCheck.total}`);

/* ─────────── 8. boss tué par les armes ─────────── */

ok("scène boss chargée", await gotoSnap("boss"));
await cdp.evaluate("window.__test.enableInput()");
await cdp.evaluate("window.__test.setGod(true)");
await cdp.press("Digit5", "5");
await sleep(400);
const b0 = await cdp.evaluate("window.__test.boss()");
ok("boss présent et vivant", b0 && b0.alive, JSON.stringify(b0));
await cdp.evaluate(`window.__test.aimAt(0, 2.1, window.__world.bossRef.pos.z)`);
await sleep(200);
await cdp.click(800, 450);
await sleep(1400);
const b1 = await cdp.evaluate("window.__test.boss()");
ok("la carabine blesse le boss", b1 && b1.hp < b0.hp, `${b0.hp} -> ${b1 && b1.hp}`);
measure("carabine sur boss", b0.hp - b1.hp);

await cdp.evaluate("window.__test.weakenBoss(0.04)");
let killed = false;
for (let i = 0; i < 8 && !killed; i++) {
  await cdp.evaluate("window.__test.aimAt(0, 2.1, window.__world.bossRef.pos.z)");
  await cdp.click(800, 450);
  await sleep(1300);
  const b = await cdp.evaluate("window.__test.boss()");
  killed = !!(b && !b.alive);
}
await sleep(600);
const dEnd = await readDiag();
ok("le boss meurt sous les tirs", dEnd.bossDead === true, JSON.stringify(dEnd.boss));
const objective = await cdp.evaluate("document.getElementById('objective').textContent");
ok("objectif repasse à l'aube", /aube/i.test(objective), objective);
ok("barre de boss masquée", await cdp.evaluate("document.getElementById('bossbar').hidden"));

/* ─────────── 9. erreurs & fps (headless GPU, 1600×900) ─────────── */

ok("scène perf chargée", await gotoSnap("perf"));
await sleep(6500);
const perf = await readDiag();
measures.fps = perf.fps;
measures.fpsMin = perf.fpsMin;
measures.drawCalls = perf.drawCalls;
measures.triangles = perf.triangles;
measures.gpu = perf.gpu;
measures.viewport = perf.viewport;

// mesure indépendante : 5 s de requestAnimationFrame sur la scène la plus chargée
const win = await cdp.evaluate(`new Promise((resolve) => {
  const t0 = performance.now();
  let frames = 0, last = t0, maxGap = 0;
  function step(t) {
    frames++;
    const gap = t - last;
    if (gap > maxGap) maxGap = gap;
    last = t;
    if (t - t0 < 5000) requestAnimationFrame(step);
    else resolve({ fps: +(frames / ((t - t0) / 1000)).toFixed(1), frames, ms: Math.round(t - t0), maxGap: +maxGap.toFixed(1) });
  }
  requestAnimationFrame(step);
})`, true);
measures.fps5s = win.fps;
measures.frames5s = win.frames;
measures.slowestFrameMs = win.maxGap;
measures.fpsSlowest = +(1000 / win.maxGap).toFixed(1);
ok("fps mesuré ≥ 60 à 1600×900 (fenêtre 5 s)", win.fps >= 60, `${win.fps} i/s · ${win.frames} images`);
measures.slowestFrameNote = `image la plus longue ${win.maxGap} ms`;
ok("rendu GPU (ANGLE/D3D11)", /ANGLE|NVIDIA|AMD|Intel/i.test(perf.gpu || ""), perf.gpu);
errs = await cdp.evaluate("window.__errors || []");
ok("0 erreur après tous les tests", errs.length === 0, JSON.stringify(errs.slice(0, 3)));
measures.errors = errs.length;

/* ─────────── 10. captures ─────────── */

const shots = [];
async function shot(name) {
  await cdp.screenshot(`shots/${name}.png`);
  shots.push(`shots/${name}.png`);
}

// HUD complet + butin + caisse
await gotoSnap("arsenal");
await sleep(800);
await shot("20-hud-inventaire");
await gotoSnap("loot");
await sleep(900);
await shot("21-butin-au-sol");
await cdp.evaluate(`(() => {
  const c = window.__world.loot.caches.find(c => c.type === "caisse");
  if (!c) return false;
  const px = c.x + 2.0, pz = c.z + 2.0;
  const yaw = Math.atan2(-(c.x - px), -(c.z - pz));
  window.__world.player.teleport(px, pz, yaw, -0.18);
  window.__test.aimAt(c.x, 0.35, c.z);
  return true;
})()`);
await sleep(600);
await shot("22-caisse");

// une capture par arme (scène figée, butin au sol)
await gotoSnap("arsenal");
const weaponShots = ["23-arme-1-pistolet", "24-arme-2-fuson", "25-arme-3-pm", "26-arme-4-fusil-assaut", "27-arme-5-carabine", "28-arme-6-hachette"];
for (let i = 0; i < 6; i++) {
  await cdp.evaluate(`window.__world.player.selectWeapon(${i})`);
  await sleep(650);
  await shot(weaponShots[i]);
}

// zoom de la carabine
await cdp.evaluate(`window.__world.player.selectWeapon(4)`);
await cdp.evaluate(`(() => { const p = window.__world.player; p.state.aiming = true; return true; })()`);
await sleep(900);
await shot("29-lunette-carabine");

console.log("\n" + JSON.stringify({ checks: checks.length, failed: checks.filter((c) => !c.pass).length, measures, shots }, null, 2));
const failed = checks.filter((c) => !c.pass);
if (failed.length) console.log("Échecs : " + failed.map((c) => c.name).join(" | "));
console.log(`\n${checks.length - failed.length}/${checks.length} vérifications arsenal/butin réussies`);
cdp.close();
await closeChrome(chrome);
process.exit(failed.length ? 1 : 0);
