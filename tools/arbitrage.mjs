#!/usr/bin/env node
// arbitrage.mjs — formulaire d'arbitrage SIMPLE du contenu de Vigile v2.
//
// Le porteur veut trancher vite : une ligne par élément, UNE phrase qui dit à
// quoi ça sert, trois boutons (garder / améliorer / supprimer) et une note
// facultative. Pas de tableau de statistiques.
//
// Lit les définitions réelles du jeu par analyse de source (aucun import de
// module, aucun réseau), puis écrit :
//   docs/ARBITRAGE.md    — tableau compact (cases à cocher)
//   docs/arbitrage.html  — page autonome, cartes + export/import JSON
//
// Usage : node tools/arbitrage.mjs
// Ne modifie aucun fichier du jeu.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const MD_PATH = join(ROOT, "docs", "ARBITRAGE.md");
const HTML_PATH = join(ROOT, "docs", "arbitrage.html");

const read = (p) => readFile(join(ROOT, p), "utf8");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const num = (n) => String(Number(n)).replace(".", ",");

/* ─────────────────────── lecture des définitions ─────────────────────── */

function blocks(src, marker) {
  const out = [];
  const start = src.indexOf(marker);
  if (start < 0) return out;
  let i = src.indexOf("[", start);
  let depth = 0, from = -1;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === "{") { if (depth === 0) from = i; depth++; }
    else if (c === "}") {
      depth--;
      if (depth === 0 && from >= 0) { out.push(src.slice(from, i + 1)); from = -1; }
    } else if (c === "]" && depth === 0) break;
  }
  return out;
}

const field = (block, key) => {
  const m = block.match(new RegExp(`\\b${key}:\\s*("([^"]*)"|'([^']*)'|[^,\\n]+)`));
  if (!m) return null;
  if (m[2] != null) return m[2];
  if (m[3] != null) return m[3];
  return m[1].trim();
};

function parseWeapons(src) {
  return blocks(src, "export const WEAPONS = [").map((b) => ({
    id: field(b, "id"),
    name: field(b, "name"),
    desc: field(b, "desc") || "",
    mag: Number(field(b, "mag")) || 0,
    damage: Number(field(b, "damage")) || 0,
    cooldown: Number(field(b, "cooldown")) || 0,
    pellets: Number(field(b, "pellets")) || 1,
    auto: /auto:\s*true/.test(b),
    melee: /melee:\s*true/.test(b),
    splash: /splash:/.test(b),
    start: /start:\s*true/.test(b),
  })).filter((w) => w.id && w.name);
}

function parseLoot(src) {
  const start = src.indexOf("export const LOOT = {");
  if (start < 0) return [];
  const end = src.indexOf("\n};", start);
  const body = src.slice(start, end < 0 ? src.length : end);
  const out = [];
  // les entrées sont `clé: { kind: "...", count: N, label: "..." }` (pas d'imbrication)
  const re = /(\w+):\s*\{\s*kind:\s*"([^"]+)"[^}]*?count:\s*(\d+)[^}]*?label:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(body))) {
    out.push({ id: m[1], kind: m[2], count: Number(m[3]), label: m[4] });
  }
  return out.filter((l) => ["ammo", "medkit", "vial", "key", "lantern"].includes(l.kind));
}

function parseThemes(src) {
  const out = [];
  const re = /\{\s*id:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*weight:\s*([\d.]+),\s*weapon:\s*([\d.]+)/g;
  let m;
  while ((m = re.exec(src))) out.push({ id: m[1], label: m[2], weight: Number(m[3]), weapon: Number(m[4]) });
  return out;
}

function parseBlessings(src) {
  const out = [];
  const re = /\{\s*id:\s*"([^"]+)",\s*name:\s*"([^"]+)",\s*tag:\s*"([^"]+)",\s*icon:\s*"[^"]*",\s*weight:\s*([\d.]+),\s*desc:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src))) out.push({ id: m[1], name: m[2], tag: m[3], desc: m[5] });
  return out;
}

/* ─────────────────────── construction des lignes ─────────────────────── */

function weaponLine(w) {
  const bits = [];
  if (w.melee) bits.push("lame", `${w.damage} dégâts par coup`);
  else {
    bits.push(`${w.mag} coups`, `${w.damage} dégâts${w.pellets > 1 ? ` ×${w.pellets}` : ""}`);
    bits.push(w.auto ? "automatique" : `semi-auto (${num(w.cooldown)} s)`);
    if (w.splash) bits.push("explosion de zone");
  }
  if (w.start) bits.push("au départ");
  return bits.join(" · ");
}

function lootLine(l) {
  if (l.kind === "ammo") return `+${l.count} cartouches`;
  if (l.id === "medkit") return "+55 PV, touche H";
  if (l.id === "vial") return "+1 fiole de lumière (soin)";
  if (l.id === "key") return "ouvre un coffre verrouillé";
  if (l.id === "lantern") return "30 s de lumière large";
  return "";
}

async function build() {
  const [weaponsSrc, lootSrc, blessingsSrc] = await Promise.all([
    read("src/entities/weapons.js"), read("src/entities/loot.js"), read("src/game/blessings.js"),
  ]);
  const weapons = parseWeapons(weaponsSrc);
  const loot = parseLoot(lootSrc);
  const themes = parseThemes(lootSrc);
  const blessings = parseBlessings(blessingsSrc);

  const sections = [
    {
      id: "armes",
      title: "Armes",
      hint: "Une phrase par arme : à quoi elle sert. Garder, améliorer ou supprimer.",
      rows: weapons.map((w) => ({ id: w.id, name: w.name, sub: weaponLine(w), note: w.desc })),
    },
    {
      id: "butin",
      title: "Butin",
      hint: "Ce que les morts lâchent.",
      rows: loot.map((l) => ({ id: l.id, name: l.label, sub: lootLine(l), note: "" })),
    },
    {
      id: "coffres",
      title: "Coffres et caisses",
      hint: "Un seul type de coffre depuis l'arbitrage : 6 caches sur la carte.",
      rows: [
        { id: "coffre", name: "Coffre verrouillé", sub: "2 à 4 pièces · une arme 1 fois sur 5 · demande une clé", note: "" },
        { id: "caisse", name: "Caisse en bois", sub: "1 à 2 pièces, jamais d'arme, pas de clé à dépenser", note: "" },
      ],
    },
    {
      id: "benedictions",
      title: "Bénédictions",
      hint: "La carte choisie à la fin de chaque vague.",
      rows: blessings.map((b) => ({ id: `bless-${b.id}`, name: b.name, sub: b.desc, note: b.tag })),
    },
    {
      id: "boss",
      title: "Récompenses du boss",
      hint: "Ce que rapporte un boss abattu.",
      rows: [
        { id: "boss-weapon", name: "Arme du boss", sub: "la meilleure arme qui te manque", note: "" },
        { id: "boss-depot", name: "Dépôt dans la nef", sub: "2 boîtes de munitions + une trousse", note: "" },
        { id: "boss-vials", name: "Fioles du boss", sub: "1 à 2 fioles de lumière", note: "" },
      ],
    },
  ];
  const total = sections.reduce((n, s) => n + s.rows.length, 0);
  return { sections, meta: { total } };
}

/* ─────────────────────── markdown ─────────────────────── */

function renderMarkdown({ sections, meta }) {
  const out = [
    "# Vigile v2 — arbitrage du contenu",
    "",
    `> Généré le **${new Date().toISOString().slice(0, 10)}** par \`tools/arbitrage.mjs\`.`,
    `> **${meta.total} lignes**, une phrase chacune. Réponds dans **Avis** : \`☑ garder\` · \`☑ améliorer\` · \`☑ supprimer\`.`,
    "> La version interactive fait la même chose avec des boutons et exporte un JSON : `docs/arbitrage.html`.",
    "",
  ];
  for (const s of sections) {
    out.push(`## ${s.title} (${s.rows.length})`, "", `_${s.hint}_`, "");
    out.push("| Élément | À quoi ça sert | Avis | Note |", "|---|---|---|---|");
    for (const r of s.rows) out.push(`| **${r.name}** | ${r.sub} | ☐ garder ☐ améliorer ☐ supprimer |  |`);
    out.push("");
  }
  out.push("---", "", "_Le code fait foi : relance `node tools/arbitrage.mjs`._");
  return out.join("\n") + "\n";
}

/* ─────────────────────── HTML ─────────────────────── */

function renderHtml({ sections, meta }) {
  const data = JSON.stringify(sections);
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>VIGILE — arbitrage du contenu</title>
<style>
  :root{--ink:#070b0d;--panel:#0d1315;--line:#2a3437;--ivory:#ece6d6;--dim:#98a29b;
    --gold:#c8a86a;--green:#79d69a;--red:#d97564;--amber:#e0b060}
  *{box-sizing:border-box}
  body{margin:0;background:var(--ink);color:var(--ivory);font-family:Georgia,"Times New Roman",serif}
  header{position:sticky;top:0;z-index:10;display:flex;gap:14px;align-items:center;flex-wrap:wrap;
    padding:12px 22px;background:rgba(7,11,13,.95);border-bottom:1px solid var(--line)}
  h1{margin:0;font-size:16px;letter-spacing:.16em;text-transform:uppercase;font-weight:400}
  .sub{color:var(--dim);font-size:12px}
  .bar{flex:1;min-width:160px;height:6px;background:#131b1d;border:1px solid var(--line);border-radius:4px;overflow:hidden}
  .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#4d7a5c,var(--green));transition:width .2s}
  .count{font-family:Consolas,monospace;font-size:12px;color:var(--gold)}
  .actions{display:flex;gap:6px;flex-wrap:wrap}
  .btn{padding:7px 12px;background:#111a1c;color:var(--ivory);border:1px solid var(--line);border-radius:6px;
    font:12px Georgia,serif;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}
  .btn:hover{border-color:var(--gold);color:#fff8e6}
  .btn.primary{border-color:rgba(200,168,106,.6);color:var(--gold)}
  main{max-width:1180px;margin:0 auto;padding:24px 22px 90px}
  section{margin:0 0 30px}
  .sec-head{display:flex;align-items:baseline;gap:10px;border-bottom:1px solid var(--line);padding-bottom:7px}
  .sec-head h2{margin:0;font-size:15px;letter-spacing:.14em;text-transform:uppercase;font-weight:400}
  .sec-head span{font-family:Consolas,monospace;font-size:11px;color:var(--dim)}
  .hint{margin:6px 0 12px;color:var(--dim);font-size:12.5px}
  .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr));gap:10px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:11px 13px}
  .card.keep{border-color:rgba(121,214,154,.55)}
  .card.improve{border-color:rgba(224,176,96,.6)}
  .card.drop{border-color:rgba(217,117,100,.6)}
  .name b{font-weight:400;font-size:15px}
  .badge{font-family:Consolas,monospace;font-size:10px;letter-spacing:.08em;text-transform:uppercase;
    color:var(--gold);opacity:.9}
  .card.keep .badge{color:var(--green)} .card.improve .badge{color:var(--amber)} .card.drop .badge{color:var(--red)}
  .serves{margin:5px 0 9px;color:#cfd6cd;font-size:12.8px;line-height:1.4}
  .seg{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
  .seg label{position:relative;display:flex;align-items:center;justify-content:center;
    padding:7px 4px;border:1px solid var(--line);border-radius:6px;font-size:11px;letter-spacing:.05em;
    text-transform:uppercase;color:var(--dim);cursor:pointer;user-select:none}
  .seg input{position:absolute;opacity:0;pointer-events:none}
  .seg label:hover{border-color:var(--gold);color:var(--ivory)}
  .seg label:has(input[value=keep]:checked){border-color:var(--green);background:rgba(121,214,154,.12);color:var(--green)}
  .seg label:has(input[value=improve]:checked){border-color:var(--amber);background:rgba(224,176,96,.12);color:var(--amber)}
  .seg label:has(input[value=drop]:checked){border-color:var(--red);background:rgba(217,117,100,.12);color:var(--red)}
  .note-btn{margin-top:7px;background:none;border:0;color:var(--dim);font:11.5px Georgia,serif;
    letter-spacing:.06em;cursor:pointer;padding:2px 0}
  .note-btn:hover{color:var(--gold)}
  .comment{margin-top:7px;width:100%;background:#0a1012;border:1px solid var(--line);border-radius:6px;
    color:var(--ivory);font:12.5px/1.4 Georgia,serif;padding:6px 8px;resize:vertical;min-height:28px}
  .comment::placeholder{color:#5f6a66}
  .toast{position:fixed;left:50%;bottom:20px;transform:translateX(-50%);background:#10181a;border:1px solid var(--gold);
    color:var(--ivory);padding:9px 15px;border-radius:6px;font-size:13px;opacity:0;transition:opacity .2s;pointer-events:none}
  .toast.on{opacity:1}
  @media (max-width:520px){.cards{grid-template-columns:1fr}}
</style>
</head>
<body>
<header>
  <div><h1>Vigile — arbitrage</h1><div class="sub">${meta.total} lignes · garder / améliorer / supprimer</div></div>
  <div class="bar"><i id="fill"></i></div>
  <div class="count" id="counter">Répondu 0 / ${meta.total}</div>
  <div class="actions">
    <button class="btn" id="btn-copy">Copier JSON</button>
    <button class="btn primary" id="btn-download">Télécharger</button>
    <button class="btn" id="btn-import">Importer</button>
    <button class="btn" id="btn-reset">Effacer</button>
  </div>
  <input type="file" id="file" accept="application/json" hidden>
</header>
<main id="main"></main>
<div class="toast" id="toast"></div>
<script>
const DATA = ${data};
const KEY = "vigile.arbitrage.v2";
const state = load();
function load(){try{return JSON.parse(localStorage.getItem(KEY)||"{}")||{};}catch(e){return {};}}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state));}catch(e){}}

function render(){
  const main=document.getElementById("main"); main.innerHTML="";
  for(const sec of DATA){
    const s=document.createElement("section");
    s.innerHTML='<div class="sec-head"><h2>'+sec.title+'</h2><span>'+sec.rows.length+'</span></div>'
      +'<p class="hint">'+sec.hint+'</p><div class="cards"></div>';
    const cards=s.querySelector(".cards");
    for(const row of sec.rows){
      const st=state[row.id]||{};
      const card=document.createElement("div");
      card.className="card"+(st.avis?" "+st.avis:"");
      card.innerHTML='<div class="name"><b>'+row.name+'</b><span class="badge"></span></div>'
        +'<div class="serves">'+row.sub+'</div>'
        +'<div class="seg">'
        +'<label><input type="radio" name="'+row.id+'" value="keep"><span>Garder</span></label>'
        +'<label><input type="radio" name="'+row.id+'" value="improve"><span>Améliorer</span></label>'
        +'<label><input type="radio" name="'+row.id+'" value="drop"><span>Supprimer</span></label></div>'
        +'<button class="note-btn" type="button">+ note</button>'
        +'<textarea class="comment" placeholder="ta note…" hidden></textarea>';
      cards.appendChild(card);
      const badge = card.querySelector(".badge");
      badge.textContent = st.avis === "keep" ? "gardé" : st.avis === "improve" ? "à améliorer" : st.avis === "drop" ? "à supprimer" : "";
      const ta0=card.querySelector("textarea");
      const nb=card.querySelector(".note-btn");
      ta0.value=st.comment||"";
      if (st.comment) { ta0.hidden=false; nb.hidden=true; }
      nb.addEventListener("click",()=>{ ta0.hidden=false; nb.hidden=true; ta0.focus(); });
      for(const inp of card.querySelectorAll("input[type=radio]")){
        if(st.avis===inp.value) inp.checked=true;
        inp.addEventListener("change",()=>{
          state[row.id]={...(state[row.id]||{}),avis:inp.value,name:row.name};
          card.className="card "+inp.value;
          card.querySelector(".badge").textContent = inp.value === "keep" ? "gardé" : inp.value === "improve" ? "à améliorer" : "à supprimer";
          save(); progress(); focusNext(card);
        });
      }
      const ta=card.querySelector("textarea");
      ta.addEventListener("input",()=>{state[row.id]={...(state[row.id]||{}),comment:ta.value,name:row.name};save();});
    }
    main.appendChild(s);
  }
  progress();
}
function progress(){
  const n=Object.values(state).filter(v=>v&&v.avis).length;
  document.getElementById("counter").textContent="Répondu "+n+" / ${meta.total} · reste "+( ${meta.total}-n);
  document.getElementById("fill").style.width=(100*n/${meta.total})+"%";
}
function payload(){
  const rows=[];
  for(const sec of DATA) for(const r of sec.rows){
    const st=state[r.id]||{};
    rows.push({section:sec.title,id:r.id,name:r.name,avis:st.avis||"",comment:st.comment||""});
  }
  return {projet:"Vigile v2",genere:new Date().toISOString(),rows};
}
function toast(msg){const t=document.getElementById("toast");t.textContent=msg;t.classList.add("on");
  clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove("on"),2200);}
async function copy(){
  const text=JSON.stringify(payload(),null,2);
  try{await navigator.clipboard.writeText(text);toast("JSON copié");}
  catch(e){const ta=document.createElement("textarea");ta.value=text;document.body.appendChild(ta);ta.select();
    document.execCommand("copy");ta.remove();toast("JSON copié");}
}
function download(){
  const blob=new Blob([JSON.stringify(payload(),null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);
  a.download="vigile-arbitrage-"+new Date().toISOString().slice(0,10)+".json";a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);toast("JSON téléchargé");
}
function importFile(file){
  const fr=new FileReader();
  fr.onload=()=>{try{const d=JSON.parse(fr.result);
    for(const r of (d.rows||[])) if(r.id) state[r.id]={avis:r.avis,comment:r.comment,name:r.name};
    save();render();toast("Réponses importées");}catch(e){toast("Fichier illisible");}};
  fr.readAsText(file);
}
document.getElementById("btn-copy").addEventListener("click",copy);
document.getElementById("btn-download").addEventListener("click",download);
document.getElementById("btn-import").addEventListener("click",()=>document.getElementById("file").click());
document.getElementById("file").addEventListener("change",e=>e.target.files[0]&&importFile(e.target.files[0]));
document.getElementById("btn-reset").addEventListener("click",()=>{
  if(!confirm("Effacer toutes tes réponses ?"))return;
  for(const k of Object.keys(state)) delete state[k];
  save();render();toast("Réponses effacées");});
function firstUnanswered() {
  for (const card of document.querySelectorAll(".card")) {
    if (!card.querySelector("input[type=radio]:checked")) return card;
  }
  return null;
}
function focusNext(from) {
  const next = firstUnanswered();
  if (next) next.scrollIntoView({ block: "center", behavior: "smooth" });
}
document.addEventListener("keydown", function (e) {
  if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
  const map = { "1": "keep", "2": "improve", "3": "drop" };
  const v = map[e.key];
  if (!v) return;
  const card = document.activeElement && document.activeElement.closest
    ? document.activeElement.closest(".card") : null;
  const target = card || firstUnanswered();
  if (!target) return;
  const inp = target.querySelector('input[value="' + v + '"]');
  if (inp) { inp.click(); e.preventDefault(); }
});
render();
window.__arbPayload = payload;
</script>
</body>
</html>
`;
}

const built = await build();
await writeFile(MD_PATH, renderMarkdown(built), "utf8");
await writeFile(HTML_PATH, renderHtml(built), "utf8");
console.log(`arbitrage simple : ${built.meta.total} lignes`);
console.log("  docs/ARBITRAGE.md");
console.log("  docs/arbitrage.html");
