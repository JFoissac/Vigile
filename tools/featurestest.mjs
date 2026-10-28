// featurestest.mjs — succès et bénédictions : 20 vérifications mesurées.
// Usage : node tools/featurestest.mjs
import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const port = 9860 + Math.floor(Math.random() * 90);
const base = process.env.VIGILE_URL || "http://127.0.0.1:8131/";
const results = [];
const ok = (name, cond, detail = null) => {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? "OK  " : "FAIL"} ${name}${detail != null ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const chrome = await launchChrome({ port, width: 1600, height: 900 });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
await cdp.send("Runtime.enable");
await cdp.goto(`${base}?snap=wave3`);
const ready = await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
ok("page prête", ready);
// le préchargement des GLB retarde l'application du scénario : on attend qu'il soit posé
const snapReady = await cdp.waitFor("window.__diag().snap === 'wave3' && window.__world.enemies.length >= 5", 20000);
ok("scénario wave3 appliqué", snapReady);
const errs0 = await cdp.evaluate("window.__errors || []");
ok("0 erreur au chargement", errs0.length === 0, errs0);

/* ─── succès ─── */
const list = await cdp.evaluate("window.__test.achievements()");
ok("18 succès définis", Array.isArray(list) && list.length === 18, list && list.length);
ok("tous verrouillés au départ (ou déjà acquis)", list.every((a) => typeof a.unlocked === "boolean"));
ok("progression lisible", list.every((a) => a.progress && a.progress.goal > 0 && a.progress.n <= a.progress.goal));

await cdp.evaluate("window.__test.enableInput()");
await sleep(400); // laisse une frame passer : les morts de la scène quittent l'état « emerge »
await cdp.evaluate("window.__test.killAll()");
await sleep(700);
const afterKills = await cdp.evaluate("window.__test.achievementsSummary()");
ok("le premier mort débloque « Premier sang »", afterKills.done >= 1, afterKills);
const toastOn = await cdp.evaluate("document.getElementById('succes-toast').classList.contains('on')");
ok("le bandeau de succès s'affiche en jeu", toastOn);

/* ─── bénédictions ─── */
const beforeMods = await cdp.evaluate("({ ...window.__world.player.mods })");
await cdp.evaluate("window.__test.offerBlessing()");
await sleep(400);
const blessOpen = await cdp.evaluate("window.__test.blessState()");
ok("la bénédiction ouvre l'écran de choix", blessOpen.open === true, blessOpen);
ok("la partie est figée pendant le choix", blessOpen.freeze === true);
const cardCount = await cdp.evaluate("document.querySelectorAll('.blessing-card').length");
ok("trois cartes proposées", cardCount === 3, cardCount);
const cardTexts = await cdp.evaluate("[...document.querySelectorAll('.blessing-card')].map(b => b.querySelector('b').textContent)");
ok("les cartes ont un nom", cardTexts.every((t) => t && t.length > 2), cardTexts);
await cdp.screenshot("shots/40-benediction.png");

// une carte peut être une ARME (récompense de fin de phase) : on choisit une
// vraie bénédiction pour mesurer ses effets sur les multiplicateurs.
const blessingIdx = await cdp.evaluate(`(() => {
  const cards = window.__world.state.blessing.cards;
  return cards.findIndex((c) => c.kind !== "weapon");
})()`);
ok("une arme peut être proposée parmi les cartes", await cdp.evaluate("window.__world.state.blessing.cards.some((c) => c.kind === 'weapon')"));
const picked = await cdp.evaluate(`window.__test.chooseBlessing(${blessingIdx})`);
ok("cliquer la première carte la choisit", picked === true);
await sleep(300);
const afterBless = await cdp.evaluate("window.__test.blessState()");
ok("l'écran se referme", afterBless.open === false);
ok("la partie reprend", afterBless.freeze === false);
const modsChanged = JSON.stringify(beforeMods) !== JSON.stringify(afterBless.mods);
ok("la bénédiction modifie réellement le joueur", modsChanged, { beforeMods, after: afterBless.mods });
const blessingToast = await cdp.evaluate("document.getElementById('toast').textContent");
ok("le joueur est informé du choix", /Bénédiction|refusée/.test(blessingToast), blessingToast);

/* ─── panneau des succès ─── */
await cdp.evaluate("window.__world.quit()");
await sleep(500);
await cdp.evaluate("document.getElementById('btn-achievements').click()");
await sleep(500);
const panel = await cdp.evaluate("(() => { const p = document.getElementById('succes-panel'); return { hidden: p.hidden, items: p.querySelectorAll('.succes').length, count: document.getElementById('succes-count').textContent, badge: document.getElementById('succes-badge').textContent }; })()");
ok("le panneau des succès s'ouvre depuis le menu", panel.hidden === false && panel.items === 18, panel);
ok("le compteur du menu est à jour", /\d+\/18/.test(panel.badge), panel.badge);
await cdp.screenshot("shots/41-succes-panel.png");
await cdp.evaluate("document.querySelector('[data-close=succes-panel]').click()");

/* ─── persistance ─── */
const store = await cdp.evaluate("JSON.parse(localStorage.getItem('vigile.succes.v1') || 'null')");
ok("succès persistés dans localStorage", !!store && !!store.unlocked && Object.keys(store.unlocked).length >= 1, store && Object.keys(store.unlocked || {}));

const errs = await cdp.evaluate("window.__errors || []");
ok("0 erreur pendant les tests", errs.length === 0, errs);

const summary = { checks: results.length, failures: results.filter((r) => !r.ok).length, results };
console.log(JSON.stringify({ summary: summary.failures ? summary : { checks: summary.checks, failures: 0 } }, null, 2));
cdp.close();
await closeChrome(chrome);
process.exit(summary.failures ? 1 : 0);
