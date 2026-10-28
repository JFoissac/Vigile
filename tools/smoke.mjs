// smoke.mjs — vérifie une scène : 0 erreur, fps réels, capture.
// Usage : node tools/smoke.mjs [snap] [--seconds=4]

import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const args = process.argv.slice(2);
const snap = args.find((a) => !a.startsWith("--")) || "menu";
const secArg = args.find((a) => a.startsWith("--seconds="));
const seconds = secArg ? Number(secArg.split("=")[1]) : 4;
const port = 9333 + Math.floor(Math.random() * 200);
const base = process.env.VIGILE_URL || "http://127.0.0.1:8131/";
const url = `${base}?snap=${snap}`;

const chrome = await launchChrome({ port });
const cdp = await connect(port);
const errors = [];
cdp.on("Runtime.exceptionThrown", (p) => {
  errors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || "exception");
});
cdp.on("Log.entryAdded", (p) => {
  if (p.entry.level === "error") errors.push(`log: ${p.entry.text}`);
});
await cdp.send("Emulation.setDeviceMetricsOverride", {
  width: 1600, height: 900, deviceScaleFactor: 1, mobile: false,
});
await cdp.send("Runtime.enable");
await cdp.send("Log.enable");
await cdp.goto(url);

const ready = await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
await new Promise((r) => setTimeout(r, seconds * 1000));

const diag = ready ? await cdp.evaluate("window.__diag()") : null;
const pageErrors = await cdp.evaluate("window.__errors || []");
const shot = `shots/smoke-${snap}.png`;
await cdp.screenshot(shot);

console.log(JSON.stringify({ snap, ready, diag, pageErrors: [...pageErrors, ...errors], shot }, null, 2));

cdp.close();
await closeChrome(chrome);
const bad = !ready || (diag && diag.errors > 0) || pageErrors.length > 0 || errors.length > 0;
process.exit(bad ? 1 : 0);
