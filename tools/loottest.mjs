// loottest.mjs — économie du butin après l'arbitrage du 22/10 : le porteur trouve
// qu'on a trop d'objets, trop de soins et trop de munitions. On vérifie donc des
// plafonds, pas des planchers.
// Usage : node tools/loottest.mjs   (python server.py 8131 d'abord)

import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const port = 9400 + Math.floor(Math.random() * 200);
const base = process.env.VIGILE_URL || "http://127.0.0.1:8131/";
const chrome = await launchChrome({ port });
const cdp = await connect(port);
await cdp.send("Runtime.enable");
await cdp.goto(base);
await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);

const checks = [];
const ok = (name, cond, detail = "") => {
  checks.push({ name, pass: !!cond, detail });
  console.log(`${cond ? "OK  " : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

const data = await cdp.evaluate(`(() => {
  const loot = window.__world.loot;
  const mk = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const ids = new Set(["pistol","shotgun","smg","rifle","sniper","hatchet","revolver","machete","launcher"]);
  function sample(type, wave, n, seed) {
    const rng = mk(seed);
    const counts = {}, sizes = [], sets = new Set();
    let weapons = 0, keys = 0, lanterns = 0, medkits = 0, vials = 0;
    for (let i = 0; i < n; i++) {
      const out = loot.rollCache(type, wave, rng, { owned: [] });
      sizes.push(out.length);
      sets.add(out.slice().sort().join(","));
      for (const id of out) {
        counts[id] = (counts[id] || 0) + 1;
        if (ids.has(id)) weapons++;
        if (id === "key") keys++;
        if (id === "lantern") lanterns++;
        if (id === "medkit") medkits++;
        if (id === "vial") vials++;
      }
    }
    sizes.sort((a, b) => a - b);
    return {
      n, weapons: +(weapons / n).toFixed(3), keys: +(keys / n).toFixed(3), lanterns,
      medkits: +(medkits / n).toFixed(2), vials: +(vials / n).toFixed(2),
      min: sizes[0], max: sizes[sizes.length - 1],
      avg: +(sizes.reduce((a, b) => a + b, 0) / n).toFixed(2), distinct: sets.size,
    };
  }
  // butin des morts : aucune clé, aucune lanterne, peu de soins
  const rng = mk(4242);
  let dropsCount = 0, dropKeys = 0, dropLanterns = 0, dropMedkits = 0, dropVials = 0, empty = 0;
  for (let i = 0; i < 3000; i++) {
    const out = loot.rollDrops("walker", 6, rng, { owned: ["pistol", "hatchet"] });
    dropsCount += out.length;
    if (!out.length) empty++;
    for (const id of out) {
      if (id === "key") dropKeys++;
      if (id === "lantern") dropLanterns++;
      if (id === "medkit") dropMedkits++;
      if (id === "vial") dropVials++;
    }
  }
  return {
    coffre: sample("coffre", 6, 800, 1234),
    caisse: sample("caisse", 6, 800, 555),
    corpse: {
      perKill: +(dropsCount / 3000).toFixed(2), keysPerKill: +(dropKeys / 3000).toFixed(4),
      lanterns: dropLanterns, medkitsPerKill: +(dropMedkits / 3000).toFixed(3),
      vialsPerKill: +(dropVials / 3000).toFixed(3), emptyRate: +(empty / 3000).toFixed(2),
    },
  };
})()`);

const c = data.coffre, ca = data.caisse, co = data.corpse;
console.log("coffre :", JSON.stringify(c));
console.log("caisse :", JSON.stringify(ca));
console.log("morts  :", JSON.stringify(co));

ok("coffre : 2 à 4 pièces (arme comprise)", c.min >= 2 && c.max <= 4, `${c.min}–${c.max}`);
ok("coffre : une seule physionomie (pas de cachets)", c.distinct >= 5, `${c.distinct} contenus distincts`);
ok("coffre : arme ~1 sur 5 (10–35 %)", c.weapons >= 0.10 && c.weapons <= 0.35, `${c.weapons * 100} %`);
ok("coffre : plus de lanterne", c.lanterns === 0, `${c.lanterns}`);
ok("coffre : clé rare (≤ 15 %)", c.keys <= 0.15, `${c.keys * 100} %`);
ok("coffre : soins ≤ 1,2 par coffre", c.medkits + c.vials <= 1.2, `${(c.medkits + c.vials).toFixed(2)}`);
ok("caisse : 1 ou 2 pièces", ca.min >= 1 && ca.max <= 2, `${ca.min}–${ca.max}`);
ok("caisse : jamais d'arme", ca.weapons === 0, `${ca.weapons}`);
ok("caisse : soins rares (≤ 0,6)", ca.medkits + ca.vials <= 0.6, `${(ca.medkits + ca.vials).toFixed(2)}`);
ok("morts : aucune clé au hasard", co.keysPerKill === 0, `${co.keysPerKill}`);
ok("morts : aucune lanterne", co.lanterns === 0, `${co.lanterns}`);
ok("morts : moins d'un objet par mort", co.perKill <= 1.0, `${co.perKill} objet/mort`);
ok("morts : cadavre vide fréquent (≥ 45 %)", co.emptyRate >= 0.45, `${co.emptyRate * 100} %`);
ok("morts : soins rares (≤ 0,12 trousse/mort)", co.medkitsPerKill <= 0.12, `${co.medkitsPerKill}`);

const errors = await cdp.evaluate("window.__errors || []");
ok("aucune erreur console", errors.length === 0, errors.slice(0, 2).join(" | "));

const failed = checks.filter((x) => !x.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} contrôles OK`);
cdp.close();
await closeChrome(chrome);
process.exit(failed.length ? 1 : 0);
