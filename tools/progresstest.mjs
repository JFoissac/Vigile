// progresstest.mjs — la veille qui progresse : armes ramassées (plus offertes),
// butin gradué par vague, fiches d'armes, alignement bouche/réticule, gestes de
// mêlée, retour de bénédiction sans pause, physionomies de vague et musique.
// Usage : node tools/progresstest.mjs   (serveur 8131 requis)

import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const BASE = process.env.VIGILE_URL || "http://127.0.0.1:8131/";
const port = 9690 + Math.floor(Math.random() * 80);
const chrome = await launchChrome({ port, width: 1600, height: 900 });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send("Runtime.enable");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond, detail = null) => {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "OK  " : "FAIL"} ${name}${detail != null ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
};

await cdp.goto(`${BASE}?snap=wave3`);
await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
await sleep(900);
await cdp.evaluate("window.__test.enableInput()");
await cdp.evaluate("window.__test.setGod(true)");   // les essais durent : pas de mort parasite
await cdp.evaluate("window.__world.player.unlockAll()");
await sleep(150);

/* ─── 1. on ne possède pas tout au départ ─── */

await cdp.evaluate("window.__world.player.resetRun()");
await sleep(200);
const start = await cdp.evaluate(`(() => {
  const p = window.__world.player;
  return { owned: p.weaponSlots().filter(w => w.owned).map(w => w.id), slots: document.querySelectorAll('#weapon-slots .slot').length };
})()`);
ok("départ : pistolet + hachette seulement", start.owned.join(",") === "pistol,hatchet", start.owned);
ok("le HUD n'affiche que les armes possédées", start.slots === 2, start.slots);

const locked = await cdp.evaluate(`(() => {
  const p = window.__world.player;
  const before = p.state.weaponIndex;
  const okSel = p.selectWeapon(2);
  return { okSel, before, after: p.state.weaponIndex };
})()`);
ok("une arme non trouvée ne s'équipe pas (touche 3)", locked.okSel === false && locked.before === locked.after, locked);

/* ─── 2. butin gradué : rien en vague I, paliers ensuite ─── */

const drops = await cdp.evaluate(`(() => {
  const w = window.__world, ids = ["pistol","shotgun","smg","rifle","sniper","hatchet","revolver","machete"];
  const mk = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const sample = (wave, n, type) => {
    const rng = mk(wave * 7919 + n);
    const got = new Set(); let weapons = 0, caches = 0;
    for (let i = 0; i < n; i++) {
      const out = w.loot.rollDrops(type || "walker", wave, rng, { owned: [] });
      for (const id of out) if (ids.includes(id)) { got.add(id); weapons++; }
    }
    const rng2 = mk(wave * 3571 + 1);
    for (let i = 0; i < 240; i++) {
      const out = w.loot.rollCache("coffre", wave, rng2, { owned: [] });
      if (out.some(id => ids.includes(id))) caches++;
    }
    return { weapons, got: [...got], caches };
  };
  return { w1: sample(1, 900), w3: sample(3, 1400), w6: sample(6, 1400), w9: sample(9, 2200) };
})()`);
console.log("   butin", JSON.stringify(drops));
const tier1 = new Set(drops.w3.got);
ok("vague I : aucune arme ne tombe", drops.w1.weapons === 0, drops.w1);
ok("vagues II-III : seulement les armes de palier 1 (pompe, revolver)",
  tier1.size > 0 && [...tier1].every((id) => id === "revolver" || id === "shotgun"), drops.w3.got);
const tier2ok = drops.w6.got.every((id) => ["revolver", "shotgun", "smg", "machete"].includes(id));
ok("vague VI : le palier 2 arrive (PM, machette), pas les meilleures", tier2ok && drops.w6.got.some((id) => id === "smg" || id === "machete"), drops.w6.got);
ok("vague IX : les meilleures armes tombent en fin de veille",
  drops.w9.got.includes("sniper") && drops.w9.got.includes("rifle"), drops.w9.got);
ok("les coffres peuvent contenir une arme", drops.w9.caches > 0, { coffresSur240: drops.w9.caches });

/* ─── 3. ramassage d'une arme : arsenal + inventaire ─── */

await cdp.evaluate("window.__world.player.resetRun()");
await sleep(200);
const pick = await cdp.evaluate(`(() => {
  const w = window.__world, p = w.player;
  w.state.waveState = "intermission"; w.state.intermission = 999;
  w.enemies.length = 0;
  p.teleport(0.5, 24, 0, 0);
  const it = w.loot.spawnAt("revolver", p.pos.x + 0.5, p.pos.z - 0.6);
  return { spawned: !!it, ownedBefore: p.weaponSlots().filter(x => x.owned).map(x => x.id) };
})()`);
await sleep(900);
const picked = await cdp.evaluate(`(() => {
  const w = window.__world, p = w.player;
  w.openInventory();
  const model = w.inventoryModel();
  const rows = [...document.querySelectorAll("#inv-weapons .inv-weapon")].map(r => r.dataset.id);
  w.closeInventory();
  return { owned: p.weaponSlots().filter(x => x.owned).map(x => x.id), slots: document.querySelectorAll('#weapon-slots .slot').length, rows, locked: model.lockedWeapons };
})()`);
ok("marcher sur le revolver l'ajoute à l'arsenal", pick.spawned && picked.owned.includes("revolver"), { before: pick.ownedBefore, after: picked.owned });
ok("le HUD gagne la case de l'arme trouvée", picked.slots === 3, picked.slots);
ok("l'inventaire liste les armes disponibles (revolver compris)", picked.rows.includes("revolver") && picked.rows.length === 3, picked.rows);
// 9 armes au total, 2 au départ + le revolver ramassé = 6 manquantes
ok("l'inventaire annonce les armes manquantes", picked.locked === 6, picked.locked);

/* ─── 4. dégâts / taux de tête propres à l'arme ─── */

const stats = await cdp.evaluate(`(() => {
  const p = window.__world.player;
  const ids = ["pistol", "revolver", "shotgun", "smg", "rifle", "sniper", "hatchet", "machete"];
  return Object.fromEntries(ids.map(id => { const s = p.weaponInfo(id); return [id, { dmg: s.damage, head: s.headChance, mul: s.headMul, power: s.power }]; }));
})()`);
ok("le taux d'abattage à la tête change avec l'arme (40 / 55 / 75 %)",
  stats.pistol.head === 0.4 && stats.revolver.head === 0.55 && stats.sniper.head === 0.75, stats);
ok("les dégâts et la puissance suivent l'arme", stats.sniper.dmg > stats.rifle.dmg && stats.sniper.head > stats.smg.head && stats.hatchet.mul !== stats.pistol.mul, stats);

/* ─── 5. bouche du canon à hauteur du réticule ─── */

await cdp.evaluate("window.__world.player.unlockAll()");
await sleep(150);
const muzzle = [];
for (const id of ["pistol", "shotgun", "smg", "rifle", "sniper", "revolver"]) {
  await cdp.evaluate(`window.__world.player.selectWeapon(window.__world.player.weapons.findIndex(w => w.def.id === "${id}"))`);
  await sleep(900);
  const m = await cdp.evaluate("window.__world.player.muzzleScreen()");
  muzzle.push({ id, y: m.y, x: m.x });
}
// la ligne de MIRE est sur le réticule : la bouche est ~3 cm dessous, soit un
// écart d'environ 0,05 à 0,10 NDC selon la longueur de l'arme (jamais 0,2).
const aligned = muzzle.every((m) => m.y > -0.13 && m.y < -0.015);
ok("ligne de mire alignée : bouche juste sous le réticule", aligned, muzzle);
ok("le canon reste à droite (arme tenue à droite)", muzzle.every((m) => m.x > 0.05 && m.x < 0.5), muzzle.map((m) => m.x));

/* ─── 6. gestes de mêlée distincts et lisibles ─── */

await cdp.evaluate(`window.__world.player.selectWeapon(window.__world.player.weapons.findIndex(w => w.def.id === "hatchet"))`);
await sleep(300);
const melee = await cdp.evaluate(`(() => {
  const p = window.__world.player, w = window.__world;
  w.state.freeze = true;
  window.__test.holdMelee(0.3);
  return true;
})()`);
await sleep(500);
const chop = await cdp.evaluate(`(() => { const m = window.__world.player.models["hatchet"]; return { rz: +m.group.rotation.z.toFixed(2), rx: +m.group.rotation.x.toFixed(2), y: +m.group.position.y.toFixed(2) }; })()`);
await cdp.evaluate(`(() => {
  const p = window.__world.player;
  p.selectWeapon(p.weapons.findIndex(w => w.def.id === "machete"));
  window.__test.holdMelee(0.24);
})()`);
await sleep(500);
const slash = await cdp.evaluate(`(() => { const m = window.__world.player.models["machete"]; return { rz: +m.group.rotation.z.toFixed(2), ry: +m.group.rotation.y.toFixed(2) }; })()`);
await cdp.evaluate("window.__test.releaseMelee()");
ok("hachette : armement vers le haut (pitch et montée)", melee && chop.rx < -0.2 && chop.y > -0.15, chop);
ok("machette : armement latéral (roulis négatif), geste distinct de la hache", slash.rz < -0.35 && Math.abs(slash.rz - chop.rz) > 0.3, slash);

/* ─── 6 bis. tombes : butin rare ou répit pour la vague ─── */

await cdp.evaluate("window.__world.player.state.meleeHold = false; window.__world.state.freeze = false;");
const grave = await cdp.evaluate(`(() => {
  const w = window.__world, p = w.player;
  w.enemies.length = 0;
  w.state.waveState = "intermission"; w.state.intermission = 999;
  p.unlockAll(); p.selectWeapon(0); p.weapons[0].mag = 12;
  const g = w.landscape.graveRecords.find((r) => r.alive);
  p.teleport(g.x, g.z + 3.0, 0, 0);
  window.__test.aimAt(g.x, 0.9, g.z);
  return { x: g.x, z: g.z, alive: w.landscape.gravesAlive, debt: w.state.graveDebt, items: w.loot.items.length };
})()`);
for (let i = 0; i < 3; i++) { await cdp.click(800, 450); await sleep(320); }
const graveAfter = await cdp.evaluate(`(() => {
  const w = window.__world;
  return {
    alive: w.landscape.gravesAlive, broken: w.state.graveBroken, debt: w.state.graveDebt,
    rare: w.loot.items.some((it) => ["ammo308", "key", "vial", "ammo556"].includes(it.id)),
    errors: (window.__errors || []).length,
  };
})()`);
ok("une tombe se brise sous les tirs", graveAfter.alive === grave.alive - 1 && graveAfter.broken >= 1, { before: grave.alive, after: graveAfter.alive });
ok("tombe brisée : butin rare ou un hôte de moins à la vague suivante",
  graveAfter.rare || graveAfter.debt > 0, { rare: graveAfter.rare, debt: graveAfter.debt });

const variants = await cdp.evaluate("(() => { const w = window.__world; return [1, 5, 10, 15, 20].map((n) => w.bossVariantForWave(n)); })()");
ok("un boss tous les 5 assauts, trois variantes", JSON.stringify(variants) === JSON.stringify([1, 1, 2, 3, 3]), variants);

/* ─── 6 ter. menu pause : objectifs de la veille ─── */

await cdp.evaluate("window.__world.pause()");
await sleep(250);
const pauseRows = await cdp.evaluate(`(() => [...document.querySelectorAll("#pause-objectives .pobj")].map((r) => r.innerText.split(String.fromCharCode(10)).join(" : ")))()`);
ok("la pause affiche objectif, vague, boss, clés et tombes", pauseRows.length >= 5 && pauseRows.some((r) => /Clés/i.test(r)) && pauseRows.some((r) => /Boss/i.test(r)), pauseRows);
await cdp.evaluate("window.__world.resume()");
await sleep(200);

/* ─── 6 quater. clic droit : fiole si blessé, sinon visée ─── */

const vial = await cdp.evaluate(`(() => {
  const w = window.__world, p = w.player;
  w.state.activeItem = "none";
  w.state.flasks = 1;
  p.state.hp = 50;
  p.selectWeapon(p.weapons.findIndex((x) => x.def.id === "pistol"));
  window.dispatchEvent(new MouseEvent("mousedown", { button: 2, bubbles: true }));
  window.dispatchEvent(new MouseEvent("mouseup", { button: 2, bubbles: true }));
  return { hp: p.state.hp, flasks: w.state.flasks, aiming: p.state.aiming, weapon: p.state.weaponId };
})()`);
ok("clic droit sans objet : boit une fiole si blessé (arme sans lunette)", vial.hp > 50 && vial.flasks === 0, vial);

const scope = await cdp.evaluate(`(() => {
  const w = window.__world, p = w.player;
  w.state.flasks = 1;
  p.state.hp = 50;
  p.selectWeapon(p.weapons.findIndex((x) => x.def.id === "sniper"));
  window.dispatchEvent(new MouseEvent("mousedown", { button: 2, bubbles: true }));
  const aiming = p.state.aiming;
  window.dispatchEvent(new MouseEvent("mouseup", { button: 2, bubbles: true }));
  return { hp: p.state.hp, flasks: w.state.flasks, aiming };
})()`);
ok("sur la lunette, le clic droit vise au lieu de boire", scope.aiming === true && scope.flasks === 1, scope);
await cdp.evaluate("window.__world.player.selectWeapon(0)");

/* ─── 6 quinquies. arme en récompense de fin de phase ─── */

await cdp.evaluate("window.__world.player.resetRun(); window.__world.state.freeze = false;");
const reward = await cdp.evaluate(`(() => {
  const w = window.__world;
  w.offerBlessing();
  const cards = w.state.blessing.cards.map((c) => ({ id: c.id, kind: c.kind || "blessing", name: c.name }));
  const idx = w.state.blessing.cards.findIndex((c) => c.kind === "weapon");
  const before = w.player.weaponSlots().filter((x) => x.owned).length;
  if (idx >= 0) window.__test.chooseBlessing(idx);
  return { cards, idx, before, after: w.player.weaponSlots().filter((x) => x.owned).length,
    owned: w.player.weaponSlots().filter((x) => x.owned).map((x) => x.id) };
})()`);
ok("une arme manquante est proposée en récompense de fin de phase",
  reward.idx >= 0 && reward.after === reward.before + 1, reward);

/* ─── 7. bénédiction : on reprend la veille, pas le menu de pause ─── */

await cdp.evaluate("window.__world.state.freeze = false; window.__world.player.state.meleeHold = false;");
const bless = await cdp.evaluate(`(() => {
  const w = window.__world;
  w.offerBlessing();
  return { open: !!w.state.blessing, freeze: w.state.freeze };
})()`);
await sleep(250);
await cdp.evaluate("window.__test.chooseBlessing(0)");
await sleep(120);
const afterBless = await cdp.evaluate(`(() => {
  const w = window.__world;
  return { mode: w.state.mode, freeze: w.state.freeze, blessing: !!w.state.blessing, canPause: w.canAutoPause(), pauseHidden: document.getElementById("pause").hidden };
})()`);
ok("la bénédiction s'ouvre et fige la veille", bless.open && bless.freeze, bless);
ok("après le choix : la veille reprend, pas de menu de pause",
  afterBless.mode === "playing" && afterBless.freeze === false && afterBless.blessing === false && afterBless.pauseHidden === true, afterBless);
ok("la perte de souris est ignorée juste après le choix (grâce)", afterBless.canPause === false, afterBless.canPause);
await sleep(1700);
ok("la pause automatique redevient possible ensuite", (await cdp.evaluate("window.__world.canAutoPause()")) === true);

/* ─── 8. vagues variées ─── */

const waves = await cdp.evaluate(`(() => {
  const w = window.__world;
  const out = [];
  for (let n = 1; n <= 12; n++) {
    const p = w.planInfo(n);
    out.push({ n, ...p, size: w.waveSize(n), diff: +w.difficulty(n).toFixed(2), sum: +Object.values(p.mix).reduce((a, b) => a + b, 0).toFixed(3) });
  }
  return out;
})()`);
const names = new Set(waves.map((w) => w.name));
ok("douze vagues, douze physionomies nommées", names.size === 12, waves.map((w) => w.name));
ok("les compositions sont des probabilités (somme 1)", waves.every((w) => Math.abs(w.sum - 1) < 0.001), waves.map((w) => w.sum));
ok("le zélateur arrive vague IV, le colosse vague III", waves[3].mix.zealot > 0 && waves[2].mix.brute > 0, { v3: waves[2].mix, v4: waves[3].mix });
ok("les vagues grossissent et durcissent", waves[11].size > waves[0].size && waves[11].diff > waves[0].diff, { v1: waves[0], v12: waves[11] });
ok("la vague V est celle de l'Officiant (le boss tombe tous les 5 assauts)", waves[4].boss === true, waves[4]);

/* ─── 9. zélateur : il tire et il fait mal ─── */

const zeal = await cdp.evaluate(`(() => {
  const w = window.__world, p = w.player;
  w.state.waveState = "intermission"; w.state.intermission = 999;
  w.state.freeze = false;
  w.enemies.length = 0;
  p.state.god = false; p.state.hp = 100;
  p.teleport(0, 24, 0, 0);
  const z = w.debugSpawn("zealot", 0, 15);
  z.rising = false; z.pos.y = 0; z.group.position.y = 0; z.atkCd = 0.2;
  window.__z = z;
  return { hp: p.state.hp, dist: +Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z).toFixed(1) };
})()`);
await sleep(4200);
const zealAfter = await cdp.evaluate(`(() => {
  const w = window.__world, z = window.__z;
  return { hp: Math.round(w.player.state.hp), fired: (z && z.boltsFired) || 0, alive: z ? z.alive : null,
    dmg: +z.damage.toFixed(1), anim: z ? z.anim : null };
})()`);
ok("le zélateur tire une flamme noire", zealAfter.fired > 0, zealAfter);
ok("ses flammes font mal (PV en baisse)", zealAfter.hp < zeal.hp, { before: zeal.hp, after: zealAfter.hp });
ok("le zélateur reste dangereux mais lisible (≥ 10 dégâts de base)", zealAfter.dmg >= 10, zealAfter.dmg);

/* ─── 10. musique : une piste par moment ─── */

const music = await cdp.evaluate(`(() => {
  const w = window.__world;
  w.state.waveState = "inprogress";
  return { combat: w.desiredMusic(), track: window.__audio.music };
})()`);
await sleep(300);
const musicCombat = await cdp.evaluate("({ track: window.__audio.music, playing: window.__audio.musicState.track })");
await cdp.evaluate("window.__world.state.waveState = 'intermission'");
await sleep(300);
const musicNight = await cdp.evaluate("window.__audio.music");
ok("assaut → piste de combat", music.combat === "combat" && musicCombat.track === "combat", { music, musicCombat });
ok("accalmie → piste de nuit", musicNight === "night", musicNight);

await cdp.goto(`${BASE}?snap=menu`);
await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
await sleep(600);
const menuMusic = await cdp.evaluate("({ want: window.__world.desiredMusic(), track: window.__audio.music })");
ok("menu → piste d'ouverture", menuMusic.want === "menu" && menuMusic.track === "menu", menuMusic);
const errs = await cdp.evaluate("window.__errors || []");
ok("0 erreur pendant toute la passe", errs.length === 0, errs.slice(0, 2));

const failures = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failures}/${results.length} contrôles · failures: ${failures}`);
cdp.close();
await closeChrome(chrome);
process.exit(failures ? 1 : 0);
