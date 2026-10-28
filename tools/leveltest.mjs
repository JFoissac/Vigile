#!/usr/bin/env node
// leveltest.mjs — sélecteur de terrain : la chapelle n'a ni habitants ni loups-garous,
// le village a six habitants et des loups-garous. Vérifie aussi le sélecteur du menu.
import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const port = 9932;
let fails = 0;
const ok = (cond, label, got) => {
  console.log(`${cond ? "  ok  " : "  FAIL"} ${label}${cond ? "" : ` — ${JSON.stringify(got)}`}`);
  if (!cond) fails++;
};

const ch = await launchChrome({ port });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1400, height: 860, deviceScaleFactor: 1, mobile: false });

async function run(level) {
  await cdp.goto(`http://127.0.0.1:8131/?level=${level}`);
  await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
  const sel = await cdp.evaluate(`(() => [...document.querySelectorAll('.lvl')].map(b => ({ id: b.dataset.level, on: b.classList.contains('is-on'), pressed: b.getAttribute('aria-pressed') })))()`);
  const desc = await cdp.evaluate(`document.getElementById('lvl-desc')?.textContent || ''`);
  ok(sel.length === 2, `${level} : deux terrains proposés`, sel);
  ok(sel.some((s) => s.id === level && s.on && s.pressed === "true"), `${level} : l'option est sélectionnée au chargement`, sel);
  await cdp.evaluate("window.__test.start()");
  await new Promise((r) => setTimeout(r, 1500));
  const st = await cdp.evaluate(`(() => { const W = window.__world; const cs = getComputedStyle(document.getElementById('cit-count'));
    return { id: W.state.level.id, citizens: W.citizens.total, alive: W.citizens.aliveCount(), visible: W.citizens.group.visible,
             hud: document.getElementById('cit-count').textContent, hudShown: cs.display !== 'none',
             werewolf: W.state.level.werewolf, errs: window.__errors.length }; })()`);
  ok(st.id === level, `${level} : terrain actif`, st.id);
  ok(st.errs === 0, `${level} : aucune erreur console`, st.errs);
  return { st, desc };
}

// ── chapelle : pas d'habitants, pas de loups-garous ──
const a = await run("chapelle");
ok(a.st.citizens === 6 && !a.st.visible, "chapelle : habitants présents en mémoire mais invisibles", a.st);
ok(!a.st.hudShown, "chapelle : compteur d'habitants masqué", a.st.hud);
ok(a.st.werewolf === false, "chapelle : loups-garous désactivés", a.st.werewolf);
const typesA = await cdp.evaluate(`(() => { const W = window.__world; W.state.wave = 8; window.__test.clearEnemies(); return W.rollTypes(30); })()`);
ok(!typesA.includes("werewolf"), "chapelle : 30 apparitions, aucun loup-garou", typesA.filter((t) => t === "werewolf").length);

// ── village : habitants visibles et loups-garous possibles ──
const b = await run("village");
ok(b.st.visible && b.st.citizens === 6, "village : six habitants visibles", b.st);
ok(b.st.hudShown && /6 \/ 6/.test(b.st.hud), "village : compteur affiché", b.st.hud);
ok(b.st.werewolf === true, "village : loups-garous activés", b.st.werewolf);
const typesB = await cdp.evaluate(`(() => { const W = window.__world; W.state.wave = 8; window.__test.clearEnemies(); return W.rollTypes(40); })()`);
ok(typesB.filter((t) => t === "werewolf").length > 0, "village : loups-garous dans les apparitions", typesB.filter((t) => t === "werewolf").length);

// ── le choix est mémorisé ──
await cdp.goto("http://127.0.0.1:8131/");
await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
const keep = await cdp.evaluate(`(() => [...document.querySelectorAll('.lvl')].filter(b => b.classList.contains('is-on')).map(b => b.dataset.level))()`);
ok(keep.length === 1 && keep[0] === "village", "le terrain choisi est mémorisé au rechargement", keep);

console.log(fails === 0 ? "\nTOUT OK" : `\n${fails} échec(s)`);
cdp.close(); await closeChrome(ch);
process.exit(fails === 0 ? 0 : 1);
