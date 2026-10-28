// cdp.mjs — client Chrome DevTools Protocol minimal (WebSocket natif de Node 22+).
// Aucune dépendance npm : sert à piloter Chrome headless et à lire la page.

import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";

export async function launchChrome({ port = 9333, width = 1600, height = 900 } = {}) {
  const profile = mkdtempSync(path.join(tmpdir(), "vigile-chrome-"));
  const args = [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "--remote-allow-origins=*",
    "--use-angle=d3d11",
    "--enable-gpu",
    "--ignore-gpu-blocklist",
    "--enable-webgl",
    "--disable-gpu-vsync",
    "--disable-frame-rate-limit",
    "--mute-audio",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-features=CalculateNativeWinOcclusion",
    `--window-size=${width},${height}`,
    "about:blank",
  ];
  const proc = spawn(CHROME, args, { stdio: "ignore", windowsHide: true });
  const deadline = Date.now() + 20000;
  let info = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) { info = await r.json(); break; }
    } catch { /* pas prêt */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!info) {
    killPid(proc.pid);
    throw new Error("Chrome headless n'a pas ouvert le port de debug");
  }
  return { proc, port, profile, info };
}

export function killPid(pid) {
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } catch { /* déjà mort */ }
}

export async function closeChrome(chrome) {
  if (!chrome) return;
  killPid(chrome.proc.pid);
  await new Promise((r) => setTimeout(r, 300));
}

export async function connect(port) {
  const list = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
  const page = list.find((t) => t.type === "page") || list[0];
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error("WebSocket CDP refusé"));
  });

  let id = 0;
  const pending = new Map();
  const handlers = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      const hs = handlers.get(msg.method) || [];
      for (const h of hs) h(msg.params);
      const all = handlers.get("*") || [];
      for (const h of all) h(msg);
    }
  };

  function send(method, params = {}) {
    const mid = ++id;
    return new Promise((resolve, reject) => {
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  }

  function on(method, fn) {
    if (!handlers.has(method)) handlers.set(method, []);
    handlers.get(method).push(fn);
  }

  async function evaluate(expression, awaitPromise = false) {
    const r = await send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise,
      userGesture: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    }
    return r.result.value;
  }

  async function goto(url) {
    await send("Page.enable");
    await send("Page.navigate", { url });
    await new Promise((r) => setTimeout(r, 600));
  }

  async function waitFor(expr, timeout = 30000, interval = 200) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        if (await evaluate(expr)) return true;
      } catch { /* page en cours de chargement */ }
      await new Promise((r) => setTimeout(r, interval));
    }
    return false;
  }

  async function screenshot(file) {
    const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, Buffer.from(r.data, "base64"));
    return file;
  }

  async function click(x, y) {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await new Promise((r) => setTimeout(r, 60));
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }

  async function sendKey(code, k, type = "keyDown") {
    await send("Input.dispatchKeyEvent", {
      type,
      code,
      key: k,
      windowsVirtualKeyCode: k.length === 1 ? k.toUpperCase().charCodeAt(0) : code === "Space" ? 32 : 0,
    });
  }

  async function press(code, k, ms = 120) {
    await sendKey(code, k, "keyDown");
    await new Promise((r) => setTimeout(r, ms));
    await sendKey(code, k, "keyUp");
  }

  async function hold(code, k) {
    await sendKey(code, k, "keyDown");
  }
  async function release(code, k) {
    await sendKey(code, k, "keyUp");
  }

  async function move(x, y) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, button: "none" });
  }

  return { send, on, evaluate, goto, waitFor, screenshot, click, press, hold, release, move, key: sendKey, close: () => ws.close() };
}

export function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  ].filter(Boolean);
  return candidates[0];
}
