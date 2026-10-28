// audittest.mjs — chasse aux bugs : collisions, chute, butin à travers les murs,
// éclairage (noirs bouchés / blancs brûlés). Usage : node tools/audittest.mjs
import { execFileSync } from "node:child_process";
import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const port = 9610 + Math.floor(Math.random() * 80);
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
await sleep(300);
// scène stable : plus de spawns, plus de morts
await cdp.evaluate("(() => { const w = window.__world; w.state.pending = 0; w.state.waveState = 'intermission'; w.state.intermission = 999; window.__test.clearEnemies(); return true; })()");
await sleep(400);
await cdp.evaluate("window.__test.chooseBlessing(0)");
await sleep(150);
await cdp.evaluate("window.__test.enableInput()");
await sleep(150);

const insideAnyCollider = `(() => {
  const w = window.__world;
  const p = w.player.pos;
  const r = w.player.state.radius || 0.34;
  for (const c of w.colliders) {
    if (c.r != null) {
      if (c.half && p.z >= c.z) continue;
      if (Math.hypot(p.x - c.x, p.z - c.z) < c.r - 0.02) return { kind: "rond", x: c.x, z: c.z, r: c.r };
    } else if (Math.abs(p.x - c.x) < c.hw - 0.02 && Math.abs(p.z - c.z) < c.hd - 0.02) {
      return { kind: "boite", x: c.x, z: c.z, hw: c.hw, hd: c.hd };
    }
  }
  return null;
})()`;

/* ─── 1. le joueur ne traverse pas les murs de la chapelle ─── */

const wallRuns = [
  { from: [-7.6, 4], yaw: -Math.PI / 2, label: "mur ouest", blocked: true },
  { from: [7.6, 4], yaw: Math.PI / 2, label: "mur est", blocked: true },
  { from: [3.8, 16.5], yaw: 0, label: "façade sud (hors portail)", blocked: true },
  { from: [0, 16.5], yaw: 0, label: "portail ouvert", blocked: false },
];
for (const run of wallRuns) {
  await cdp.evaluate(`window.__test.teleport(${run.from[0]}, ${run.from[1]}, ${run.yaw})`);
  await sleep(200);
  await cdp.press("KeyW", "w", 1200);
  await sleep(150);
  const p = await cdp.evaluate("({x: +window.__world.player.pos.x.toFixed(2), z: +window.__world.player.pos.z.toFixed(2)})");
  const stuck = await cdp.evaluate(insideAnyCollider);
  const inside = Math.abs(p.x) < 5.15 && p.z > -16.8 && p.z < 11.8;
  const pass = run.blocked ? !inside && !stuck : inside && !stuck;
  ok(`pas de traversée de mur — ${run.label}`, pass, { pos: p, dansUnCollider: stuck, attendu: run.blocked ? "bloqué" : "passage" });
}

/* ─── 2. filet anti-chute ─── */

await cdp.evaluate("(() => { window.__world.player.pos.y = -50; return true; })()");
await sleep(350);
const afterFall = await cdp.evaluate("({y: +window.__world.player.pos.y.toFixed(2), alive: window.__world.player.alive})");
ok("le filet anti-chute replace le joueur au sol", afterFall.y > -6 && afterFall.alive, afterFall);

/* ─── 3. les morts ne rentrent pas dans la pierre ─── */

await cdp.evaluate(`(() => {
  // points de spawn choisis hors de tout collider (comme le fait la vague)
  const w = window.__world;
  const free = (x, z) => !w.colliders.some((c) => (c.r != null
    ? Math.hypot(x - c.x, z - c.z) < c.r + 0.9
    : Math.abs(x - c.x) < c.hw + 0.9 && Math.abs(z - c.z) < c.hd + 0.9));
  const spots = [];
  for (let i = 0; i < 40 && spots.length < 8; i++) {
    const a = (i / 40) * Math.PI * 2;
    const x = Math.cos(a) * (8 + (i % 3) * 2);
    const z = Math.sin(a) * (8 + (i % 3) * 2) + 4;
    if (free(x, z)) spots.push([x, z]);
  }
  for (const [x, z] of spots) window.__test.spawn("walker", x, z);
  return spots.length;
})()`);
await sleep(2600);
const zombies = await cdp.evaluate(`(() => {
  const w = window.__world;
  const bad = [];
  for (const e of w.enemies) {
    if (!e.alive) continue;
    for (const c of w.colliders) {
      let hit = false;
      if (c.r != null) hit = Math.hypot(e.pos.x - c.x, e.pos.z - c.z) < c.r - 0.25;
      else hit = Math.abs(e.pos.x - c.x) < c.hw - 0.25 && Math.abs(e.pos.z - c.z) < c.hd - 0.25;
      if (hit) { bad.push({ x: +e.pos.x.toFixed(1), z: +e.pos.z.toFixed(1), collider: [c.x, c.z] }); break; }
    }
  }
  return { total: w.enemies.filter(e => e.alive).length, bad: bad.slice(0, 4) };
})()`);
ok("aucun mort encastré dans un collider", zombies.bad.length === 0, zombies);

/* ─── 4. butin derrière un mur : pas de ramassage à travers ─── */

await cdp.evaluate("window.__test.teleport(-4.4, 4, -1.5708)");
await sleep(250);
const kitsBefore = await cdp.evaluate("window.__world.loot.inventory.medkits");
await cdp.evaluate("(() => { window.__world.loot.spawnAt('medkit', -6.9, 4); return true; })()");
await sleep(900);
const throughWall = await cdp.evaluate("(() => { const w = window.__world; const it = w.loot.items.find(i => !i.taken && Math.abs(i.group.position.x + 6.9) < 0.5); return { medkits: w.loot.inventory.medkits, stillThere: !!it }; })()");
ok("butin derrière un mur non ramassé à travers", throughWall.medkits === kitsBefore && throughWall.stillThere, throughWall);

await cdp.evaluate("window.__test.teleport(-5.9, 4, -1.5708)");
await sleep(700);
const closePick = await cdp.evaluate("window.__world.loot.inventory.medkits");
ok("le même butin se ramasse quand on est du bon côté", closePick === kitsBefore + 1, `${kitsBefore} -> ${closePick}`);

/* ─── 5. éclairage : captures + mesures ─── */

const shots = [];
async function capture(snap, file, wait = 1200) {
  await cdp.evaluate(`window.__test.snap(${JSON.stringify(snap)})`);
  await sleep(wait);
  await cdp.screenshot(file);
  shots.push(file);
}
await capture("wave3", "shots/80-audit-nuit.png");
await capture("nave", "shots/81-audit-nef.png");
await capture("dawn", "shots/82-audit-aube.png");

let stats = [];
try {
  stats = JSON.parse(execFileSync("python", ["tools/imgstats.py", ...shots], { encoding: "utf8" }));
} catch (e) {
  console.log("imgstats a échoué", e.message);
}
const byName = Object.fromEntries(stats.map((s) => [s.file, s]));
const night = byName["shots/80-audit-nuit.png"];
const nave = byName["shots/81-audit-nef.png"];
const dawn = byName["shots/82-audit-aube.png"];
ok("captures d'audit produites", !!night && !!nave && !!dawn, stats.map((s) => s.file));

if (night && nave && dawn) {
  ok("nuit lisible (ni noire ni blanche)", night.mean >= 8 && night.mean <= 95 && night.bright_pct < 2, night);
  ok("nuit : matière visible (pas de noir bouché massif)", night.dark_pct < 58, `${night.dark_pct} % de pixels < 6`);
  ok("nef : pas de scène blanche (ancien bug Unreal)", nave.mean <= 110 && nave.bright_pct < 4, { mean: nave.mean, bright: nave.bright_pct });
  ok("nef : détail réel (écart-type suffisant)", nave.std >= 12, nave.std);
  ok("aube plus claire que la nuit", dawn.mean > night.mean + 5, `${night.mean} -> ${dawn.mean}`);
  ok("aube non brûlée", dawn.bright_pct < 8, dawn.bright_pct);
  ok("ciel de nuit non écrasé en haut de l'image", night.bands.haut >= 3, night.bands);
}

const errs = await cdp.evaluate("window.__errors || []");
ok("0 erreur console pendant l'audit", errs.length === 0, errs);

const failures = results.filter((r) => !r.ok).length;
console.log(JSON.stringify({ checks: results.length, failures, stats }, null, 2));
cdp.close();
await closeChrome(chrome);
process.exit(failures ? 1 : 0);
