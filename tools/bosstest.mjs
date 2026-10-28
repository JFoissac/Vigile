// bosstest.mjs — vérifie le boss : spawn, barre de vie, dégâts, phase 2, mort.
import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const port = 9800 + Math.floor(Math.random() * 150);
const chrome = await launchChrome({ port });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send("Runtime.enable");
await cdp.goto("http://127.0.0.1:8131/?night=200");
await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
await new Promise((r) => setTimeout(r, 900));
const rect = await cdp.evaluate(`(() => { const r = document.getElementById('btn-start').getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}; })()`);
await cdp.click(rect.x, rect.y);
await new Promise((r) => setTimeout(r, 900));

let checks = [];
const ok = (n, c, d = "") => { checks.push(!!c); console.log(`${c ? "OK  " : "FAIL"} ${n}${d ? " — " + d : ""}`); };

await cdp.evaluate("window.__test.triggerBoss()");
await new Promise((r) => setTimeout(r, 700));
let d = await cdp.evaluate("window.__diag()");
ok("boss apparu", d.bossSpawned && d.boss && d.boss.alive, JSON.stringify(d.boss));
// la barre apparaît au premier tick de HUD : on l'attend (700 ms suffisent
// d'habitude, mais la charge machine peut retarder la première frame)
const barUp = await cdp.waitFor("!document.getElementById('bossbar').hidden", 3000);
ok("barre de boss visible", barUp);

// le joueur entre dans la nef et affronte le boss
await cdp.evaluate("window.__test.enableInput()");
await cdp.evaluate("window.__test.teleport(0, 6, 0)");
await new Promise((r) => setTimeout(r, 300));

const hp0 = (await cdp.evaluate("window.__test.boss()")).hp;
for (let i = 0; i < 6; i++) {
  const b = await cdp.evaluate("window.__test.boss()");
  if (!b || !b.alive) break;
  await cdp.evaluate(`window.__test.aimAt(0, 1.7, -6)`);
  await new Promise((r) => setTimeout(r, 60));
  await cdp.click(800, 450);
  await new Promise((r) => setTimeout(r, 240));
}
const hp1 = (await cdp.evaluate("window.__test.boss()")).hp;
ok("les tirs blessent le boss", hp1 < hp0, `${hp0} -> ${hp1}`);
await cdp.evaluate("window.__test.weakenBoss(0.49)");
await cdp.evaluate("window.__test.aimAt(0, 1.7, -6)");
await cdp.click(800, 450);
await new Promise((r) => setTimeout(r, 400));
const b2 = await cdp.evaluate("window.__test.boss()");
ok("phase 2 déclenchée sous 50 %", b2.phase === 2, `hp ${b2.hp}/${b2.maxHp} phase ${b2.phase}`);

await cdp.evaluate("window.__test.shutdownBoss()");
await new Promise((r) => setTimeout(r, 600));
d = await cdp.evaluate("window.__diag()");
ok("boss mort enregistré", d.bossDead === true, JSON.stringify(d.boss));
ok("objectif mis à jour", (await cdp.evaluate("document.getElementById('objective').textContent")).toLowerCase().includes("aube"));
ok("barre de boss masquée", await cdp.evaluate("document.getElementById('bossbar').hidden"));

const errs = await cdp.evaluate("window.__errors");
ok("aucune erreur", errs.length === 0, JSON.stringify(errs));
await cdp.screenshot("shots/debug-bosstest.png");
console.log(`\n${checks.filter(Boolean).length}/${checks.length} vérifications boss réussies`);
cdp.close();
await closeChrome(chrome);
process.exit(checks.every(Boolean) ? 0 : 1);
