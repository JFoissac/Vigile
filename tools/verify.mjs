// verify.mjs — vérification complète : 6 scènes capturées, fps, erreurs, jeu réel.
// Usage : node tools/verify.mjs
// Prérequis : python server.py 8131 (ou VIGILE_URL).

import { launchChrome, closeChrome, connect } from "./cdp.mjs";
import { spawnSync } from "node:child_process";

const base = process.env.VIGILE_URL || "http://127.0.0.1:8131/";
const port = 9900 + Math.floor(Math.random() * 90);
const chrome = await launchChrome({ port });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send("Runtime.enable");

const scenes = [
  { snap: "menu", clean: false, out: "shots/01-menu.png" },
  { snap: "menu", clean: true, out: "shots/02-menu-decor.png" },
  { snap: "wave3", clean: false, out: "shots/03-vague3.png" },
  { snap: "wave3", clean: true, out: "shots/04-vague3-sans-hud.png" },
  { snap: "boss", clean: false, out: "shots/05-boss.png" },
  { snap: "nave", clean: true, out: "shots/06-nef.png" },
  { snap: "dawn", clean: false, out: "shots/07-aube.png" },
  { snap: "perf", clean: false, out: "shots/08-perf.png" },
];

const results = [];
let failures = 0;

for (const s of scenes) {
  await cdp.goto(`${base}?snap=${s.snap}`);
  const ready = await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
  await new Promise((r) => setTimeout(r, 800));
  if (s.clean) {
    await cdp.evaluate(`(() => {
      const m = document.getElementById('menu'); if (m) m.style.display='none';
      const h = document.getElementById('hud'); if (h) h.hidden = true;
      const a = document.getElementById('announce'); if (a) a.style.opacity = 0;
      return true;
    })()`);
  }
  const wait = s.snap === "perf" ? 7 : 3;
  await new Promise((r) => setTimeout(r, wait * 1000));
  const diag = ready ? await cdp.evaluate("window.__diag()") : null;
  const errs = await cdp.evaluate("window.__errors || []");
  await cdp.screenshot(s.out);
  const row = {
    scene: s.snap + (s.clean ? " (sans hud)" : ""),
    out: s.out,
    fps: diag ? diag.fps : null,
    fpsMin: diag ? diag.fpsMin : null,
    calls: diag ? diag.drawCalls : null,
    tris: diag ? diag.triangles : null,
    errors: errs.length,
    state: diag ? diag.state : null,
    zombies: diag ? diag.alive : null,
    note: errs.slice(0, 2),
  };
  if (!ready || errs.length) failures++;
  results.push(row);
  console.log(`${row.scene.padEnd(22)} ${String(row.fps).padStart(4)} i/s  ${String(row.calls).padStart(4)} draws  ${String(row.tris).padStart(6)} tris  err=${row.errors}`);
}

// jeu réel
const play = spawnSync(process.execPath, ["tools/playtest.mjs"], { encoding: "utf8" });
console.log(play.stdout.split("\n").slice(-4).join("\n"));
if (play.status !== 0) failures++;

const boss = spawnSync(process.execPath, ["tools/bosstest.mjs"], { encoding: "utf8" });
console.log(boss.stdout.split("\n").slice(-4).join("\n"));
if (boss.status !== 0) failures++;

console.log(JSON.stringify({ results, failures }, null, 2));
cdp.close();
await closeChrome(chrome);
process.exit(failures ? 1 : 0);
