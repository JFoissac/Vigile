// debugboot.mjs — ouvre une URL et rapporte exceptions console + erreurs réseau.
import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const url = process.argv[2] || "http://127.0.0.1:8131/?snap=emerge";
const port = 9781;
const chrome = await launchChrome({ port, width: 900, height: 600 });
const cdp = await connect(port);
await cdp.send("Runtime.enable");
await cdp.send("Log.enable");
await cdp.send("Network.enable");
const logs = [];
cdp.on("Runtime.exceptionThrown", (p) => logs.push({ kind: "exception", text: p.exceptionDetails.exception?.description || p.exceptionDetails.text }));
cdp.on("Runtime.consoleAPICalled", (p) => logs.push({ kind: "console", type: p.type, text: (p.args || []).map((a) => a.value ?? a.description).join(" ") }));
cdp.on("Log.entryAdded", (p) => logs.push({ kind: "log", level: p.entry.level, text: `${p.entry.text} ${p.entry.url || ""}` }));
cdp.on("Network.loadingFailed", (p) => logs.push({ kind: "netfail", text: `${p.type} ${p.errorText} ${p.blockedReason || ""}` }));
await cdp.goto(url);
await new Promise((r) => setTimeout(r, 4000));
const state = await cdp.evaluate("({ diag: typeof window.__diag, world: typeof window.__world, assets: window.__assets || null, errs: window.__errors || null, url: location.href, ready: document.readyState })");
await cdp.screenshot("shots/debug-boot.png");
console.log(JSON.stringify({ url, state, logs }, null, 2));
cdp.close();
await closeChrome(chrome);
process.exit(0);
