// deeptest.mjs — un bot joue une veille entière, en profondeur, et rend un
// rapport JSON : vagues, PV, munitions, butin, coffres ouverts, contrôles du HUD.
//
// Usage :
//   node tools/deeptest.mjs --name=expert --skill=0.92 --turn=8 --head=0.95
//   node tools/deeptest.mjs --name=moyen  --skill=0.62 --turn=4.2 --head=0.6 --night=180
//   node tools/deeptest.mjs --name=novice --skill=0.35 --turn=2.6 --head=0.35
//
// Prérequis : python server.py 8131. Chrome est toujours headless et muet.

import { launchChrome, closeChrome, connect } from "./cdp.mjs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=").slice(1).join("=") : def;
};

const name = opt("name", "expert");
const skill = Number(opt("skill", 0.92));
const turnSpeed = Number(opt("turn", 8));
const aimHead = Number(opt("head", 0.95));
const reaction = Number(opt("reaction", 0.1));
const night = Number(opt("night", 480));
const timeoutMs = Number(opt("max", night + 90)) * 1000;
const base = process.env.VIGILE_URL || "http://127.0.0.1:8131/";

const port = Number(opt("port", 9900 + Math.floor(Math.random() * 90)));
const chrome = await launchChrome({ port });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send("Runtime.enable");

await cdp.goto(`${base}?night=${night}`);
const ready = await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
if (!ready) {
  console.log(JSON.stringify({ name, error: "page non prête" }));
  await closeChrome(chrome);
  process.exit(1);
}

await cdp.evaluate("window.__test.start()");
await new Promise((r) => setTimeout(r, 900));

const botSource = readFileSync(new URL("./bot.js", import.meta.url), "utf8");
const cfg = JSON.stringify({ name, skill, turnSpeed, aimHead, reaction });
const started = await cdp.evaluate(`(() => { window.__botCfg = ${cfg}; ${botSource}
 return typeof window.__bot; })()`);
console.log("bot injecté :", started, "| input :", await cdp.evaluate("typeof window.__input"));

const t0 = Date.now();
let lastReport = "";
let shotTaken = [];
async function progress() {
  const b = await cdp.evaluate("(() => { const B = window.__bot; if (!B) return null; const d = window.__diag(); return { t: +B.t.toFixed(1), wave: d.wave, plan: d.wavePlan, hp: Math.round(d.hp), kills: d.kills, alive: d.alive, done: B.done, reason: B.reason, dbg: B.dbg || null }; })()");
  return b;
}

let done = false, result = null;
while (Date.now() - t0 < timeoutMs) {
  await new Promise((r) => setTimeout(r, 5000));
  const p = await progress();
  if (!p) continue;
  const g = p.dbg || {};
  const line = `t=${String(p.t).padStart(6)}s vague=${String(p.wave).padStart(2)} hp=${String(p.hp).padStart(3)} tues=${String(p.kills).padStart(3)} debout=${String(p.alive).padStart(2)} | aim=${JSON.stringify(g.aim)} | cible=${g.d ?? "-"}m ${g.type || ""} los=${g.los} ris=${g.rising} balle=${g.ammo}/${g.res} tir=${g.fire} miss=${g.miss} mur=${g.blockedAhead} tirs=${g.shots}/${g.hits} tete=${g.heads} recharg=${g.reloading}`;
  if (line !== lastReport) { console.log(`[${name}] ${line}`); lastReport = line; }
  // captures aux vagues 3, 6 et 9 pour la revue visuelle
  if (p.wave >= 3 && !shotTaken.includes(3)) { shotTaken.push(3); await cdp.screenshot(`shots/deep-${name}-w3.png`); }
  if (p.wave >= 6 && !shotTaken.includes(6)) { shotTaken.push(6); await cdp.screenshot(`shots/deep-${name}-w6.png`); }
  if (p.wave >= 9 && !shotTaken.includes(9)) { shotTaken.push(9); await cdp.screenshot(`shots/deep-${name}-w9.png`); }
  const b = await cdp.evaluate("(() => { const B = window.__bot; return B && B.done ? { done: true } : { done: false }; })()");
  if (b.done) { done = true; break; }
}

const bot = await cdp.evaluate("window.__bot");
const diag = await cdp.evaluate("window.__diag()");
const pstate = await cdp.evaluate("(() => { const s = window.__world.player.state; return { shots: s.shots, hits: s.hits, headshots: s.headshots, damageTaken: Math.round(s.damageTaken) }; })()");
const errors = await cdp.evaluate("window.__errors || []");
await cdp.screenshot(`shots/deep-${name}-fin.png`);

const report = {
  name, cfg: { skill, turnSpeed, aimHead, reaction }, night,
  done, wallSeconds: Math.round((Date.now() - t0) / 1000),
  result: bot.result || null,
  diag: {
    wave: diag.wave, plan: diag.wavePlan, kills: diag.kills, byType: diag.byType,
    stats: pstate, accuracy: pstate.shots ? Math.round((pstate.hits / pstate.shots) * 100) : 0,
    hp: Math.round(diag.hp), clock: diag.clock, victory: diag.victory,
    bossesKilled: diag.bossesKilled, graves: diag.graves,
  },
  waves: bot.waves,
  samples: bot.samples,
  caches: bot.caches,
  events: bot.events,
  hud: bot.hud,
  bands: bot.bands,
  outcomes: bot.outcomes,
  dbgLog: bot.dbgLog,
  botErrors: bot.errors,
  errors,
};
mkdirSync("tools/reports", { recursive: true });
const out = path.join("tools/reports", `deep-${name}.json`);
writeFileSync(out, JSON.stringify(report, null, 2));

console.log(`\n[${name}] rapport → ${out}`);
console.log(JSON.stringify({
  done, reason: report.result && report.result.reason, wave: report.diag.wave,
  hp: report.diag.hp, kills: report.diag.kills, victory: report.diag.victory,
  waves: report.waves.length, caches: report.caches.length,
  hudRadar: `${report.hud.radarBad}/${report.hud.radarChecks} écarts`,
  hudAmmo: `${report.hud.ammoBad}/${report.hud.ammoChecks} écarts`,
  errors: errors.length,
}, null, 2));

cdp.close();
await closeChrome(chrome);
process.exit(done ? 0 : 2);
