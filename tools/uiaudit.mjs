// uiaudit.mjs — contrôle mesuré de l'interface (débordements, chevauchements, tailles).
import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const port = 9950 + Math.floor(Math.random() * 40);
const chrome = await launchChrome({ port });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send("Runtime.enable");
await cdp.goto("http://127.0.0.1:8131/?snap=wave3");
await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 25000);
await new Promise((r) => setTimeout(r, 900));

const audit = await cdp.evaluate(`(() => {
  const vw = innerWidth, vh = innerHeight;
  const rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom, hidden: e.hidden || getComputedStyle(e).display === 'none'}; };
  const overlap = (a,b) => a && b && !a.hidden && !b.hidden && Math.min(a.right,b.right) - Math.max(a.x,b.x) > 2 && Math.min(a.bottom,b.bottom) - Math.max(a.y,b.y) > 2;
  const hud = {
    top: rect('.hud-top'), wave: rect('.hud-wave'), clock: rect('.hud-clock'), obj: rect('.hud-objective'),
    boss: rect('#bossbar'), ann: rect('#announce'), vitals: rect('.hud-vitals'), ammo: rect('.hud-ammo'),
    sound: rect('#btn-sound'), cross: rect('#crosshair'),
  };
  const out = [];
  for (const [k,v] of Object.entries(hud)) {
    if (!v) { out.push(k + ': absent'); continue; }
    if (v.right > vw + 0.5 || v.bottom > vh + 0.5 || v.x < -0.5 || v.y < -0.5) out.push(k + ': DÉBORDE ' + JSON.stringify(v));
  }
  const pairs = [['wave','clock'],['clock','obj'],['obj','sound'],['vitals','ammo'],['top','boss'],['top','ann']];
  for (const [a,b] of pairs) if (overlap(hud[a],hud[b])) out.push('chevauchement ' + a + '/' + b);
  return { vw, vh, hud, out, scrollW: document.documentElement.scrollWidth, bodyOverflow: getComputedStyle(document.body).overflow };
})()`);
console.log(JSON.stringify(audit, null, 2));

// menu + panneaux
await cdp.goto("http://127.0.0.1:8131/");
await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 25000);
await new Promise((r) => setTimeout(r, 700));
const menu = await cdp.evaluate(`(() => {
  const g = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),right:Math.round(r.right),bottom:Math.round(r.bottom)}; };
  document.getElementById('btn-settings').click();
  const panel = g('#settings-panel');
  const rows = document.querySelectorAll('#settings-rows .row');
  const fits = [...rows].every(r => r.getBoundingClientRect().right <= innerWidth && r.getBoundingClientRect().left >= 0);
  document.getElementById('settings-panel').hidden = true;
  return { title: g('.title'), left: g('.menu-left'), meta: g('.menu-meta'), sound: g('#btn-sound'), panel, rows: rows.length, fits, vw: innerWidth, vh: innerHeight, scrollW: document.documentElement.scrollWidth };
})()`);
console.log(JSON.stringify(menu, null, 2));

// fin de partie
await cdp.evaluate(`(() => { const w = window.__world; w.startGame({nightSeconds:30}); w.state.nightT = 29.8; w.state.freeze=false; w.state.bossSpawned=false; return true; })()`);
await new Promise((r) => setTimeout(r, 1200));
const end = await cdp.evaluate(`(() => {
  const wrap = document.querySelector('.end-wrap').getBoundingClientRect();
  const stats = [...document.querySelectorAll('#end-stats .stat')].map(e => e.getBoundingClientRect());
  return { wrap: {x:wrap.x,y:wrap.y,w:wrap.width,h:wrap.height,bottom:wrap.bottom}, vh: innerHeight,
    statsCount: stats.length, statsInView: stats.every(r => r.bottom <= innerHeight && r.x >= 0),
    overflowX: document.documentElement.scrollWidth > innerWidth,
    verdict: document.getElementById('end-verdict').textContent };
})()`);
console.log(JSON.stringify(end, null, 2));
cdp.close();
await closeChrome(chrome);
