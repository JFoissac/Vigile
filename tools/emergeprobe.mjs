// emergeprobe.mjs — capture la planche des poses du clip Emerge.
// Usage : node tools/emergeprobe.mjs [--file=/assets/zombies/z_walker.glb] [--out=shots/31-emerge-clip.png]
import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split("=")[1] : def;
};
const file = opt("file", "/assets/zombies/z_walker.glb");
const out = opt("out", "shots/31-emerge-clip.png");
const width = Number(opt("w", 1600));
const height = Number(opt("h", 620));
const port = 9900 + Math.floor(Math.random() * 90);
const base = process.env.VIGILE_URL || "http://127.0.0.1:8131/";

const chrome = await launchChrome({ port, width, height });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
await cdp.send("Runtime.enable");
await cdp.goto(`${base}tools/emergeprobe.html?file=${encodeURIComponent(file)}`);
const ok = await cdp.waitFor("!!window.__ready", 30000);
await new Promise((r) => setTimeout(r, 900));
const probe = await cdp.evaluate("window.__probe");
const measures = await cdp.evaluate(`[${[0, 1, 2, 3, 4, 5, 6].map((i) => `window.__measure(${i})`).join(",")}]`);
const errs = await cdp.evaluate("window.__errors || []");
await cdp.screenshot(out);
console.log(JSON.stringify({ ok, probe, measures, errors: errs, out }, null, 2));
cdp.close();
await closeChrome(chrome);
process.exit(ok && errs.length === 0 ? 0 : 1);
