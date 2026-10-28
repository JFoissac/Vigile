// zombietest.mjs — preuves d'exécution des morts de Vigile v2.
//
// Vérifie, en headless GPU (aucune fenêtre), sur le banc tools/zombieharness.html :
//   1. à t = 0 le zombie est entièrement sous le sol (racine et boîte englobante) ;
//   2. à mi-animation il est partiellement sorti ;
//   3. à la fin il est debout et marche (state emerge → walk) ;
//   4. les dégâts sont ignorés pendant l'émergence, puis comptés après ;
//   5. les trois variantes existent, avec des silhouettes mesurablement distinctes ;
//   6. idle / walk / run / attack / hit / death animent réellement les articulations ;
//   7. le point d'extension GLB retombe proprement sur le procédural ;
//   8. 0 erreur console et fps ≥ 60 à 1600x900.
//
// Puis, dans le vrai jeu : une vague lance bien des morts qui sortent de terre.
//
// Usage : node tools/zombietest.mjs [--keep]
// Sortie : JSON sur stdout + captures dans shots/.

import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const BASE = process.env.VIGILE_URL || "http://127.0.0.1:8131/";
const W = 1600, H = 900;
const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  const tag = ok ? "OK  " : "FAIL";
  console.log(`${tag} ${name}${detail !== undefined ? " — " + JSON.stringify(detail) : ""}`);
}

let chrome = await launchChrome({ port: 9450 + Math.floor(Math.random() * 120), width: W, height: H });
let cdp = await connect(chrome.port);
await cdp.send("Runtime.enable");
await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

/* ───────────────────────── banc d'essai ───────────────────────── */

await cdp.goto(`${BASE}tools/zombieharness.html`);
const ready = await cdp.waitFor("!!(window.__z && window.__z.ready)", 30000);
check("banc d'essai chargé", ready);
if (!ready) {
  console.log(JSON.stringify({ checks, fatal: "harness indisponible" }, null, 2));
  cdp.close(); await closeChrome(chrome); process.exit(1);
}

// pas-à-pas déterministe : k visé, en 1/120 s
const stepTo = (target) => cdp.evaluate(`(() => {
  const z = __z.zombies[window.__id]; let n = 0;
  while (z.emerge.k < ${target} && n < 6000) { __z.update(1/120); n++; }
  return { k: z.emerge.k, n };
})()`);

async function capture(file) {
  await cdp.evaluate("__z.render()");
  await cdp.screenshot(file);
  return `${file.split("/").pop()}`;
}

/* ── 1. émergence : t = 0 sous le sol ── */
await cdp.evaluate(`(() => {
  __z.reset();
  __z.setCam(3.4, 1.30, 0.50);
  window.__id = __z.spawn("walker", 0, 0, 7);
  return true;
})()`);

const t0 = await cdp.evaluate("__z.state(window.__id)");
const b0 = await cdp.evaluate("__z.bbox(window.__id)");
check("t=0 : racine sous le sol (y < 0)", t0.y < 0, { y: t0.y });
check("t=0 : corps entièrement enterré (boîte max < 0)", b0.max[1] < 0, { maxY: +b0.max[1].toFixed(3) });
check("t=0 : état emerge", t0.state === "emerge" && t0.anim === "emerge", { state: t0.state, anim: t0.anim });
check("durée d'émergence dans 1,6–2,4 s", t0.dur >= 1.6 && t0.dur <= 2.4, { dur: t0.dur, delay: t0.delay });
check("17 articulations exposées", t0.joints >= 17, { joints: t0.joints });

const shots = [];
shots.push(await capture("shots/zombie-emerge-1-sous-terre.png"));

/* ── 2. les doigts percent ── */
await stepTo(0.33);
const b2 = await cdp.evaluate("__z.bbox(window.__id)");
const t2 = await cdp.evaluate("__z.state(window.__id)");
check("mi-animation : sorti en partie (boîte max > 0,15 m)", b2.max[1] > 0.15, { maxY: +b2.max[1].toFixed(3) });
check("mi-animation : racine encore sous terre", t2.y < 0, { y: t2.y, k: t2.k, stage: t2.stage });
shots.push(await capture("shots/zombie-emerge-2-bras.png"));

/* ── 3. à mi-corps ── */
await stepTo(0.64);
const b3 = await cdp.evaluate("__z.bbox(window.__id)");
const t3 = await cdp.evaluate("__z.state(window.__id)");
check("à mi-corps : buste hors du sol (boîte max > 0,4 m)", b3.max[1] > 0.4, { maxY: +b3.max[1].toFixed(3) });
check("à mi-corps : toujours en émergence", t3.state === "emerge" && t3.y < 0, { y: t3.y, k: t3.k });
shots.push(await capture("shots/zombie-emerge-3-mi-corps.png"));

/* ── 4. debout, en marche ── */
const done = await cdp.evaluate(`(() => {
  const z = __z.zombies[window.__id]; let n = 0;
  while (z.rising && n < 8000) { __z.update(1/120); n++; }
  for (let i = 0; i < 45; i++) __z.update(1/60);
  return __z.state(window.__id);
})()`);
check("fin : état walk", done.state === "walk", { state: done.state, anim: done.anim });
check("fin : debout au sol (y ≈ 0)", Math.abs(done.y) < 0.02, { y: done.y });
check("fin : anim walk ou idle", ["walk", "idle"].includes(done.anim), { anim: done.anim });
await cdp.evaluate("__z.setCam(3.6, 1.55, 0.95)");
shots.push(await capture("shots/zombie-emerge-4-debout.png"));

// preuve du passage emerge → walk sur une horloge continue
const trace = await cdp.evaluate(`(() => {
  __z.reset(); __z.setCam(3.4, 1.30, 0.50);
  const id = __z.spawn("walker", 0, 0, 7);
  const z = __z.zombies[id]; const states = [];
  for (let i = 0; i < 260; i++) { __z.update(1/60); if (states[states.length-1] !== z.state) states.push(z.state); }
  return states;
})()`);
check("transition emerge → walk observée", trace.join(">").includes("emerge>walk"), { trace });

/* ── 5. invulnérabilité pendant l'émergence ── */
const invul = await cdp.evaluate(`(() => {
  __z.reset(); const id = __z.spawn("walker", 0, 0, 21); const z = __z.zombies[id];
  let n = 0; while (z.emerge.k < 0.30 && n < 4000) { __z.update(1/120); n++; }
  const hp0 = z.hp;
  const r1 = z.hit(9999, z.pos.clone(), new __z.THREE.Vector3(0,0,1), "body");
  const hp1 = z.hp, alive1 = z.alive, st1 = z.state;
  let m = 0; while (z.rising && m < 8000) { __z.update(1/120); m++; }
  const r2 = z.hit(50, z.pos.clone(), new __z.THREE.Vector3(0,0,1), "body");
  return { hp0, hp1, alive1, st1, r1, r2, hp2: z.hp, st2: z.state };
})()`);
check("dégâts ignorés pendant l'émergence", invul.hp1 === invul.hp0 && invul.alive1 === true && invul.r1.ignored === true,
  { hp0: invul.hp0, hp1: invul.hp1, ignored: invul.r1.ignored });
check("aucune attaque pendant l'émergence (état conservé)", invul.st1 === "emerge", { state: invul.st1 });
check("dégâts comptés après l'émergence", invul.hp2 < invul.hp1 && invul.r2.killed === false,
  { hp2: invul.hp2, killed: invul.r2.killed });

/* ── 6. les trois variantes ── */
const variants = await cdp.evaluate(`(() => {
  __z.reset();
  const ids = [
    __z.spawn("walker", -2.4, 0, 11),
    __z.spawn("runner", 0, 0, 22),
    __z.spawn("brute", 2.6, 0, 33),
  ];
  for (const id of ids) __z.zombies[id].rising = false;
  __z.ctx.player.pos.set(0, 0, 30);
  for (let i = 0; i < 150; i++) __z.update(1/60);
  const zs = ids.map(id => __z.zombies[id]);
  const out = ids.map((id, i) => {
    const bb = __z.bbox(id);
    return { type: __z.state(id).type, h: +(bb.max[1] - bb.min[1]).toFixed(3),
      w: +(bb.max[0] - bb.min[0]).toFixed(3), joints: Object.keys(zs[i].joints).length,
      state: zs[i].state, anim: zs[i].anim };
  });
  zs[0].pos.set(-2.4, 0, 0); zs[1].pos.set(0, 0, 0); zs[2].pos.set(2.6, 0, 0);
  __z.setCam(6.6, 1.60, 1.05);
  __z.render();
  return out;
})()`);
const byType = Object.fromEntries(variants.map((v) => [v.type, v]));
check("trois variantes présentes", !!(byType.walker && byType.runner && byType.brute), variants.map(v => v.type));
check("colosse nettement plus haut (×1,25)", byType.brute.h > byType.walker.h * 1.25,
  { brute: byType.brute.h, walker: byType.walker.h, runner: byType.runner.h });
check("coureur plus étroit que le marcheur", byType.runner.w < byType.walker.w * 1.01,
  { runner: byType.runner.w, walker: byType.walker.w });
check("silhouettes distinctes (largeur/hauteur)", Math.abs(byType.walker.w / byType.walker.h - byType.runner.w / byType.runner.h) > 0.02,
  { ratioWalker: +(byType.walker.w / byType.walker.h).toFixed(3), ratioRunner: +(byType.runner.w / byType.runner.h).toFixed(3) });
shots.push(await capture("shots/zombie-variantes.png"));

// lisibilité à 20 m
await cdp.evaluate("__z.setCam(20, 1.70, 1.05)");
shots.push(await capture("shots/zombie-variantes-20m.png"));

/* ── 7. chaque animation bouge vraiment les articulations ── */
const animProof = await cdp.evaluate(`(() => {
  __z.reset();
  const id = __z.spawn("walker", 0, 0, 5); const z = __z.zombies[id];
  z.rising = false; z.speed = 0;
  __z.ctx.player.pos.set(0, 0, 40);
  const sample = (joint) => z.joints[joint].rotation.toArray().slice(0, 3);
  const delta = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  // amplitude totale (max - min) sur une fenêtre, pour un jeu d'articulations
  const swing = (joints, frames) => {
    const lo = {}, hi = {};
    for (const j of joints) { lo[j] = Infinity; hi[j] = -Infinity; }
    for (let i = 0; i < frames; i++) {
      __z.update(1/60);
      for (const j of joints) { const x = z.joints[j].rotation.x; lo[j] = Math.min(lo[j], x); hi[j] = Math.max(hi[j], x); }
    }
    return Math.max(...joints.map((j) => hi[j] - lo[j]));
  };
  const out = {};

  // idle / walk / run
  z.pos.set(0, 0, 0);
  out.idle = { amp: +swing(["head", "jaw", "torso"], 60).toFixed(4), anim: z.anim };
  z.speed = 1.8; z.pos.set(0, 0, 0);
  out.walk = { amp: +swing(["hipL", "kneeL", "shL"], 50).toFixed(4), anim: z.anim };
  z.speed = 4.3; z.pos.set(0, 0, 0);
  out.run = { amp: +swing(["hipL", "kneeL", "shL"], 50).toFixed(4), anim: z.anim };
  z.speed = 1.8;

  // attack : le bras se lève, puis frappe ; le joueur est touché
  z.pos.set(0, 0, 0.4);
  __z.ctx.player.pos.set(0, 0, 1.45); z.atkCd = 0; z.atk = 0;
  let wind = 0, strike = 0; let sawAttack = false;
  for (let i = 0; i < 200; i++) {
    __z.update(1/60);
    if (z.anim === "attack") {
      sawAttack = true;
      const x = z.joints.shL.rotation.x;
      wind = Math.min(wind, x); strike = Math.max(strike, x);
    }
  }
  out.attack = { sawAttack, wind: +wind.toFixed(3), strike: +strike.toFixed(3), range: +(strike - wind).toFixed(3), hurts: __z.ctx.hurtCount, dist: +Math.hypot(z.pos.x, z.pos.z - 1.45).toFixed(2) };

  // hit : le buste part en arrière (on coupe l'attaque en cours pour isoler)
  z.atk = 0; z.atkCd = 9;
  __z.update(1/60);
  const torso0 = sample("torso");
  z.hit(10, z.pos.clone(), new __z.THREE.Vector3(0,0,1), "body");
  let torsoD = 0;
  for (let i = 0; i < 12; i++) { __z.update(1/60); torsoD = Math.max(torsoD, delta(torso0, sample("torso"))); }
  out.hit = { amp: +torsoD.toFixed(3), anim: z.anim };

  // death : chute puis relâchement des membres
  z.hit(9999, z.pos.clone(), new __z.THREE.Vector3(0,0,1), "body");
  let rootMax = 0;
  const shLo = { v: Infinity }, shHi = { v: -Infinity };
  for (let i = 0; i < 150; i++) {
    __z.update(1/60);
    rootMax = Math.max(rootMax, z.root.rotation.x);
    const a = z.joints.shL.rotation.x;
    shLo.v = Math.min(shLo.v, a); shHi.v = Math.max(shHi.v, a);
  }
  out.death = { rootX: +rootMax.toFixed(3), armAmp: +(shHi.v - shLo.v).toFixed(3), anim: z.anim, y: +z.pos.y.toFixed(2) };
  return out;
})()`);

check("idle anime (oscillation)", animProof.idle.amp > 0.01, animProof.idle);
check("walk balance les hanches", animProof.walk.amp > 0.05, animProof.walk);
check("run balance les hanches plus fort", animProof.run.amp > animProof.walk.amp, { run: animProof.run.amp, walk: animProof.walk.amp });
check("attack : armement puis frappe télégraphiée", animProof.attack.sawAttack && animProof.attack.range > 0.8,
  animProof.attack);
check("attack : le joueur est touché à la frappe", animProof.attack.hurts >= 1, { hurts: animProof.attack.hurts });
check("hit : le buste encaisse", animProof.hit.amp > 0.05, animProof.hit);
check("death : chute au sol (root ≈ 1,52 rad)", animProof.death.rootX > 1.2, animProof.death);
check("death : membres qui se relâchent", animProof.death.armAmp > 0.15, { armAmp: animProof.death.armAmp });

/* ── 8. point d'extension GLB : repli procédural ── */
const ext = await cdp.evaluate(`(() => {
  __z.reset();
  __z.setFactory(() => null); // simule un GLB indisponible
  const id = __z.spawn("walker", 0, 0, 3);
  const ok = __z.zombies[id].joints && Object.keys(__z.zombies[id].joints).length >= 17;
  const active = __z.factoryActive();
  __z.setFactory(null);
  return { ok, active };
})()`);
check("extension GLB : repli procédural sans blocage", ext.ok && ext.active === true, ext);

/* ── 9. fps et erreurs, 12 morts à l'écran ── */
const perf = await cdp.evaluate(`(() => {
  __z.reset();
  __z.ctx.player.pos.set(0, 0, 26);
  const ids = [];
  for (let i = 0; i < 12; i++) {
    const t = i % 3 === 0 ? "brute" : i % 3 === 1 ? "runner" : "walker";
    ids.push(__z.spawn(t, Math.cos(i) * 4.5, Math.sin(i) * 3.2, 100 + i * 17));
  }
  __z.setCam(7.5, 1.8, 1.0);
  return ids.length;
})()`);
const fps = await cdp.evaluate("__z.measureFps(3)", true);
check("fps moyen ≥ 60 (12 morts, 1600×900, GPU headless)", fps.fps >= 60, fps);
check("12 morts instanciés", perf === 12, { perf });

const errs = await cdp.evaluate("window.__errors || []");
check("0 erreur console (banc)", errs.length === 0, errs);

/* ── 10. intégration dans le vrai jeu : une vague sort de terre ── */

// navigateur neuf : le banc d'essai a tourné en découplage, on repart propre
cdp.close();
await closeChrome(chrome);
await new Promise((r) => setTimeout(r, 800));
chrome = await launchChrome({ port: 9750 + Math.floor(Math.random() * 150), width: W, height: H });
cdp = await connect(chrome.port);
await cdp.send("Runtime.enable");
await cdp.send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });

await cdp.goto(`${BASE}?snap=perf`);
await new Promise((r) => setTimeout(r, 1500));
await cdp.waitFor("location.search.includes('perf') && document.readyState === 'complete' && !!window.__diag", 30000);
await new Promise((r) => setTimeout(r, 2000));

// la navigation CDP peut basculer de contexte juste après le wait : on réessaie
async function evalReady(expr, tries = 30) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try { return await cdp.evaluate(expr); } catch (e) { lastErr = e; }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw lastErr || new Error(`évaluation impossible : ${expr}`);
}

const gameErrs = await evalReady("window.__errors || []");
const gameDiag = await evalReady("window.__diag()");
const gameFps = await cdp.evaluate(`new Promise((res) => {
  const t0 = performance.now(); let n = 0; const dts = [];
  let last = t0;
  function tick() {
    const now = performance.now();
    dts.push(now - last); last = now; n++;
    const dt = now - t0;
    if (dt >= 2500) {
      const sorted = dts.slice(1).sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)] || 16.7;
      res({ fps: +(n / (dt / 1000)).toFixed(1), frames: n, ms: Math.round(dt), medianFps: +(1000 / med).toFixed(1) });
    } else requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})`, true);
check("jeu : 0 erreur console", gameErrs.length === 0, gameErrs);
check("jeu : fps ≥ 60 (scène perf, 26 morts)", gameFps.fps >= 60, { ...gameFps, calls: gameDiag.drawCalls, tris: gameDiag.triangles });
check("jeu : les 26 morts utilisent la nouvelle charpente", await evalReady("window.__world && window.__world.enemies.every(e => e.joints && Object.keys(e.joints).length >= 17)"), null);

// vague réelle : démarrage à froid, les morts doivent émerger
await cdp.goto(`${BASE}?night=900`);
await new Promise((r) => setTimeout(r, 1500));
await cdp.waitFor("location.search.includes('night') && document.readyState === 'complete' && !!window.__test", 30000);
await new Promise((r) => setTimeout(r, 600));
await evalReady("!!window.__test");
await evalReady("window.__test.start()");
let emerged = null, walked = null;
for (let i = 0; i < 40; i++) {
  await new Promise((r) => setTimeout(r, 500));
  const snap = await evalReady(`(() => {
    const es = window.__world.enemies.filter(e => e.alive);
    return {
      n: es.length,
      emerging: es.filter(e => e.state === "emerge").length,
      under: es.filter(e => e.state === "emerge" && e.pos.y < 0).length,
      walking: es.filter(e => e.state === "walk").length,
      frames: window.__world.state.elapsed,
    };
  })()`);
  if (!emerged && snap.under > 0) emerged = snap;
  if (emerged && snap.walking > 0) { walked = snap; break; }
}
check("jeu : des morts de vague commencent sous le sol", !!emerged, emerged);
check("jeu : ils passent ensuite en marche", !!walked, walked);
const gameErrs2 = await cdp.evaluate("window.__errors || []");
check("jeu : 0 erreur console pendant la vague", gameErrs2.length === 0, gameErrs2);

/* ── bilan ── */
const failed = checks.filter((c) => !c.ok);
const summary = {
  ok: failed.length === 0,
  checks: checks.length,
  failed: failed.map((f) => f.name),
  fps: { banc: fps.fps, p5: fps.p5fps, jeu: gameDiag.fps },
  drawCalls: gameDiag.drawCalls,
  triangles: gameDiag.triangles,
  captures: shots,
  results: checks,
};
console.log("\n" + JSON.stringify(summary, null, 2));
cdp.close();
await closeChrome(chrome);
process.exit(summary.ok ? 0 : 1);
