// shot.mjs — capture une scène précise en headless, avec options.
// Usage : node tools/shot.mjs <snap> [--out=shots/x.png] [--wait=3] [--clean] [--w=1600] [--h=900]

import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const args = process.argv.slice(2);
const snap = args.find((a) => !a.startsWith("--")) || "menu";
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : def;
};
const clean = args.includes("--clean");
const wait = Number(opt("wait", 3));
const width = Number(opt("w", 1600));
const height = Number(opt("h", 900));
// --select=N : descend N fois dans le menu au clavier (montre l'état de sélection)
const select = Number(opt("select", "0"));
const out = opt("out", `shots/${snap}${clean ? "-clean" : ""}.png`);
const port = 9500 + Math.floor(Math.random() * 400);
const base = process.env.VIGILE_URL || "http://127.0.0.1:8131/";

const chrome = await launchChrome({ port, width, height });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", {
  width, height, deviceScaleFactor: 1, mobile: false,
});
await cdp.send("Runtime.enable");
await cdp.goto(`${base}?snap=${snap}`);

const ok = await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
await new Promise((r) => setTimeout(r, 700));
if (select > 0) {
  for (let i = 0; i < select; i++) await cdp.press("ArrowDown", "ArrowDown");
  await new Promise((r) => setTimeout(r, 450));
}
if (clean) {
  await cdp.evaluate(`(() => {
    const m = document.getElementById('menu'); if (m) m.style.display='none';
    const h = document.getElementById('hud'); if (h) h.hidden = true;
    const a = document.getElementById('announce'); if (a) a.style.opacity = 0;
    const t = document.getElementById('toast'); if (t) t.style.opacity = 0;
    const s = document.getElementById('btn-sound'); if (s) s.style.display = 'none';
    return true;
  })()`);
}
await new Promise((r) => setTimeout(r, wait * 1000));

const diag = await cdp.evaluate("window.__diag()");
const errs = await cdp.evaluate("window.__errors || []");
await cdp.screenshot(out);
console.log(JSON.stringify({ out, ok, fps: diag && diag.fps, calls: diag && diag.drawCalls, tris: diag && diag.triangles, errors: errs, diag }, null, 2));

cdp.close();
await closeChrome(chrome);
process.exit(ok && errs.length === 0 ? 0 : 1);
