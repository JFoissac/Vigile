#!/usr/bin/env node
// niveautest.mjs — les deux niveaux sont-ils finis : vagues propres, boss de la
// bonne scène, colliders réels, habitants au village seulement.
import { launchChrome, closeChrome, connect } from "./cdp.mjs";
const port = 9946;
let fails = 0;
const ok = (c, l, g) => { console.log(`${c ? "  ok  " : "  FAIL"} ${l}${c ? "" : ` — ${JSON.stringify(g)}`}`); if (!c) fails++; };

const ch = await launchChrome({ port });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 880, deviceScaleFactor: 1, mobile: false });

async function level(id) {
  await cdp.goto(`http://127.0.0.1:8131/?level=${id}`);
  await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
  await cdp.evaluate("window.__test.start()");
  await new Promise((r) => setTimeout(r, id === "village" ? 7000 : 2000));
  return cdp.evaluate(`(() => { const W = window.__world;
    return { id: W.state.level.id, colliders: W.colliders.length, errs: window.__errors.length,
             citizens: W.citizens.aliveCount(), visible: W.citizens.group.visible,
             vgroup: !!(W.village && W.village.group), vcols: W.village ? W.village.colliders.length : 0,
             lamps: W.village && W.village.lampes ? W.village.lampes.length : 0,
             spawn: [+W.player.pos.x.toFixed(1), +W.player.pos.z.toFixed(1)], fps: window.__diag().fps }; })()`);
}

const a = await level("chapelle");
ok(a.id === "chapelle" && a.errs === 0, "chapelle : prête, 0 erreur", a);
ok(!a.vgroup, "chapelle : le village n'est pas chargé (paresseux)", a.vgroup);
ok(!a.visible && a.citizens === 6, "chapelle : aucun habitant visible", { v: a.visible, c: a.citizens });
ok(Math.abs(a.spawn[1] - 24) < 1.5, "chapelle : apparition devant la nef", a.spawn);

const b = await level("village");
ok(b.id === "village" && b.errs === 0, "village : prêt, 0 erreur", b);
ok(b.vgroup && b.vcols > 20, "village : modules chargés et colliders posés", { g: b.vgroup, c: b.vcols });
ok(b.colliders > a.colliders + 20, "village : les colliders du village s'ajoutent au monde", { a: a.colliders, b: b.colliders });
ok(b.lamps >= 4, "village : réverbères allumés (vraies lumières)", b.lamps);
ok(b.visible && b.citizens === 6, "village : six habitants visibles", b);
ok(b.fps >= 30, "village : images par seconde suffisantes", b.fps);

// collisions : un point au centre d'une maison est repoussé hors de son emprise
const col = await cdp.evaluate(`(() => {
  const W = window.__world, c = W.village.colliders.find(k => k.hw > 2 && k.hd > 2);
  if (!c) return { err: "aucune maison" };
  const v = W.player.pos.clone(); v.x = c.x; v.z = c.z; v.y = W.player.groundAt(c.x, c.z);
  W.player.teleport(c.x, c.z, 0, 0); W.player.update(0.016, { colliders: W.colliders, enemies: [], paused: true, freeze: true });
  const dx = Math.abs(W.player.pos.x - c.x), dz = Math.abs(W.player.pos.z - c.z);
  return { box: [c.hw, c.hd], sorti: dx > c.hw * 0.6 || dz > c.hd * 0.6, pos: [+W.player.pos.x.toFixed(1), +W.player.pos.z.toFixed(1)] };
})()`);
ok(!col.err && col.sorti, "village : impossible de rester dans un mur (collider actif)", col);

console.log(fails === 0 ? "\nTOUT OK" : `\n${fails} échec(s)`);
cdp.close(); await closeChrome(ch);
process.exit(fails === 0 ? 0 : 1);
