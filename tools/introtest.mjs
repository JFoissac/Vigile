// introtest.mjs — la révélation du boss : fondu, caméra, titre, reprise.
// Usage : node tools/introtest.mjs
import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const port = 9810 + Math.floor(Math.random() * 60);
const base = process.env.VIGILE_URL || "http://127.0.0.1:8131/";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const ok = (name, cond, detail = null) => {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "OK  " : "FAIL"} ${name}${detail != null ? ` — ${JSON.stringify(detail)}` : ""}`);
};

const chrome = await launchChrome({ port, width: 1600, height: 900 });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send("Runtime.enable");
await cdp.goto(base);
await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
await cdp.waitFor("!!document.getElementById('loading').classList.contains('gone')", 20000);
await cdp.evaluate("window.__test.start()");
await sleep(400);
await cdp.evaluate("window.__test.teleport(0.4, 6.0, 0)");
await sleep(200);

const started = await cdp.evaluate("window.__test.triggerBossIntro()");
ok("la révélation démarre", started.intro === true, started);
const frozen = await cdp.evaluate("window.__test.introState()");
ok("la partie est figée pendant la révélation", frozen.freeze === true, frozen);
await sleep(1400);
await cdp.screenshot("shots/53-boss-intro.png");
const mid = await cdp.evaluate("window.__test.introState()");
const cam = await cdp.evaluate("(() => { const c = window.__world.player.camera; return { x: +c.position.x.toFixed(2), y: +c.position.y.toFixed(2), z: +c.position.z.toFixed(2), fov: +c.fov.toFixed(1) }; })()");
ok("la caméra entre dans la nef", cam.z > 7.5 && cam.z < 10.5 && cam.fov < 62, cam);
await sleep(2200);
const after = await cdp.evaluate("window.__test.introState()");
ok("la révélation se termine", after.intro === false, after);
ok("le joueur reprend la main", after.freeze === false);
const boss = await cdp.evaluate("window.__test.boss()");
ok("le boss est debout dans la nef", boss && boss.alive, boss);
const errs = await cdp.evaluate("window.__errors || []");
ok("0 erreur pendant la révélation", errs.length === 0, errs);

const failures = results.filter((r) => !r.ok).length;
console.log(JSON.stringify({ checks: results.length, failures }, null, 2));
cdp.close();
await closeChrome(chrome);
process.exit(failures ? 1 : 0);
