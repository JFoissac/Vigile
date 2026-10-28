// vmbench.mjs — banc de réglage des view-models d'armes (GLB Blender v4).
//
// Charge le jeu en headless, sélectionne UNE arme en vue subjective, applique
// éventuellement une pose de réglage (position / rotation / échelle / mains),
// mesure la boîte à l'écran et capture l'image.
//
//   node tools/vmbench.mjs --id=rifle                 # GLB, pose du fichier de poses
//   node tools/vmbench.mjs --id=rifle --glb=0         # modèle procédural (référence)
//   node tools/vmbench.mjs --id=rifle --pose=0,0,0,0,0,0,0.85 --out=shots/essai.png
//   node tools/vmbench.mjs --all                      # une capture par arme
//
// --pose  px,py,pz,rx,ry,rz,scale   (repère de la vue, mètres et radians)
// --hands right|pair|left|none      (attache des mains)
// --handpose x,y,z,rx,ry,rz,s       (réglage fin de l'attache)
// --snap=nave|wave3|...             (scène de fond, défaut nave)
// --hud=1                           (garde le HUD ; par défaut masqué)
// --json                            (sortie machine uniquement)

import { launchChrome, closeChrome, connect } from "./cdp.mjs";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : def;
};
const flag = (name) => args.includes(`--${name}`);

const IDS = ["pistol", "revolver", "smg", "rifle", "shotgun", "sniper", "launcher"];
const all = flag("all");
const glb = opt("glb", "1") !== "0";
const snap = opt("snap", "nave");
const hud = opt("hud", "0") === "1";
const wait = Number(opt("wait", "1.4"));
const width = Number(opt("w", "1600"));
const height = Number(opt("h", "900"));
const outFor = (id) => opt("out", `shots/vm-${id}.png`).replace("{}", id);
const parsePose = (s) => {
  if (!s) return null;
  const v = s.split(",").map(Number);
  if (v.length < 7 || v.some((n) => !isFinite(n))) throw new Error(`pose invalide : ${s}`);
  return { pos: v.slice(0, 3), rot: v.slice(3, 6), scale: v[6] };
};
const poseArg = parsePose(opt("pose", ""));
const handMode = opt("hands", "");
const handPose = parsePose(opt("handpose", ""));
const ids = all ? IDS : [opt("id", "pistol")];

const port = 9700 + Math.floor(Math.random() * 200);
const base = process.env.VIGILE_URL || "http://127.0.0.1:8131/";
const chrome = await launchChrome({ port, width, height });
const cdp = await connect(port);
await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
await cdp.send("Runtime.enable");
await cdp.goto(`${base}?snap=${snap}${glb ? "" : "&glb=0"}`);
const ready = await cdp.waitFor("!!(window.__diag && window.__diag().ready)", 30000);
if (!ready) throw new Error("la scène n'est pas prête");
// le remplacement GLB est asynchrone : sans cette attente, la première arme
// mesurée est encore le modèle procédural (mesures faussées)
if (glb) {
  const loaded = await cdp.waitFor("!!window.__vm && Object.keys(window.__vm.models).length >= 7", 30000);
  if (!loaded) throw new Error("les GLB ne sont pas chargés");
}
await new Promise((r) => setTimeout(r, 900));

// mesure : boîte englobante du modèle actif dans la vue, projetée à l'écran
const MEASURE = `(() => {
  const p = window.__world.player;
  const m = p.model;
  if (!m || !m.group) return { error: "modèle absent" };
  m.group.updateMatrixWorld(true);
  const cam = p.viewCamera;
  let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  let tris = 0, meshes = 0, hands = 0;
  const v = [];
  m.group.traverse((o) => {
    if (o.userData && o.userData.hand) hands++;
    if (!o.isMesh || !o.geometry) return;
    meshes++;
    const g = o.geometry;
    if (!g.boundingBox) g.computeBoundingBox();
    const b = g.boundingBox;
    if (g.index) tris += g.index.count / 3; else if (g.attributes.position) tris += g.attributes.position.count / 3;
    for (let i = 0; i < 8; i++) {
      const c = new (b.min.constructor)(
        i & 1 ? b.max.x : b.min.x,
        i & 2 ? b.max.y : b.min.y,
        i & 4 ? b.max.z : b.min.z
      );
      c.applyMatrix4(o.matrixWorld);
      min = [Math.min(min[0], c.x), Math.min(min[1], c.y), Math.min(min[2], c.z)];
      max = [Math.max(max[0], c.x), Math.max(max[1], c.y), Math.max(max[2], c.z)];
      v.push(c.clone());
    }
  });
  // projection des coins (perspective) : NDC -> pixels
  let sx0 = 1e9, sy0 = 1e9, sx1 = -1e9, sy1 = -1e9, behind = 0;
  for (const p3 of v) {
    const q = p3.clone().applyMatrix4(cam.matrixWorldInverse);
    if (q.z > -0.001) { behind++; continue; }
    const n = p3.clone().project(cam);
    const px = (n.x * 0.5 + 0.5) * innerWidth;
    const py = (0.5 - n.y * 0.5) * innerHeight;
    sx0 = Math.min(sx0, px); sx1 = Math.max(sx1, px);
    sy0 = Math.min(sy0, py); sy1 = Math.max(sy1, py);
  }
  const cw = Math.max(0, Math.min(innerWidth, sx1) - Math.max(0, sx0));
  const ch = Math.max(0, Math.min(innerHeight, sy1) - Math.max(0, sy0));
  // boîte de l'ARME seule (sans les mains) : c'est elle qu'on règle
  let wmin = [1e9, 1e9, 1e9], wmax = [-1e9, -1e9, -1e9];
  if (m.root) {
    m.root.updateMatrixWorld(true);
    m.root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const g = o.geometry;
      if (!g.boundingBox) g.computeBoundingBox();
      const b = g.boundingBox;
      for (let i = 0; i < 8; i++) {
        const c = new (b.min.constructor)(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z);
        c.applyMatrix4(o.matrixWorld);
        wmin = [Math.min(wmin[0], c.x), Math.min(wmin[1], c.y), Math.min(wmin[2], c.z)];
        wmax = [Math.max(wmax[0], c.x), Math.max(wmax[1], c.y), Math.max(wmax[2], c.z)];
      }
    });
  }
  const mz = m.group.localToWorld(m.muzzle.clone()).project(cam);
  const chain = [];
  let n = m.group;
  for (let i = 0; i < 4 && n; i++) { chain.push({ name: n.name || n.type, s: +n.scale.x.toFixed(3), p: n.position.toArray().map((x) => +x.toFixed(3)) }); n = n.children[0]; }
  return {
    id: p.state.weaponId,
    glb: !!(m.root),
    world: { min: min.map((x) => +x.toFixed(3)), max: max.map((x) => +x.toFixed(3)),
             len: [max[0] - min[0], max[1] - min[1], max[2] - min[2]].map((x) => +x.toFixed(3)) },
    weapon: m.root ? { len: [wmax[0] - wmin[0], wmax[1] - wmin[1], wmax[2] - wmin[2]].map((x) => +x.toFixed(3)),
                       min: wmin.map((x) => +x.toFixed(3)), max: wmax.map((x) => +x.toFixed(3)) } : null,
    screen: { x0: Math.round(sx0), y0: Math.round(sy0), x1: Math.round(sx1), y1: Math.round(sy1),
              w: Math.round(sx1 - sx0), h: Math.round(sy1 - sy0),
              cover: +((cw * ch) / (innerWidth * innerHeight) * 100).toFixed(2),
              clipped: sx0 < 0 || sy0 < 0 || sx1 > innerWidth || sy1 > innerHeight, behind },
    muzzle: { x: +mz.x.toFixed(3), y: +mz.y.toFixed(3), z: +mz.z.toFixed(3) },
    meshes, tris: Math.round(tris), hands,
    chain,
    errors: (window.__errors || []).slice(0, 6),
  };
})()`;

async function selectWeapon(id) {
  const ok = await cdp.evaluate(`(() => {
    const p = window.__world.player;
    p.unlockAll();
    const i = p.weapons.findIndex((w) => w.def.id === ${JSON.stringify(id)});
    if (i < 0) return false;
    p.selectWeapon(i);
    document.getElementById("hud").hidden = ${hud ? "false" : "true"};
    const menu = document.getElementById("menu"); if (menu) menu.style.display = "none";
    return true;
  })()`);
  if (!ok) throw new Error(`arme inconnue : ${id}`);
  await new Promise((r) => setTimeout(r, 650));
}

async function applyPose(id) {
  if (!poseArg && !handMode && !handPose) return true;
  return cdp.evaluate(`(() => {
    const vm = window.__vm;
    if (!vm) return false;
    const patch = {};
    ${poseArg ? `patch.pos = ${JSON.stringify(poseArg.pos)}; patch.rot = ${JSON.stringify(poseArg.rot)}; patch.scale = ${poseArg.scale};` : ""}
    ${handMode ? `patch.handMode = ${JSON.stringify(handMode)};` : ""}
    ${handPose ? `patch.handPos = ${JSON.stringify(handPose.pos)}; patch.handRot = ${JSON.stringify(handPose.rot)}; patch.handScale = ${handPose.scale};` : ""}
    const done = vm.setPose(${JSON.stringify(id)}, patch);
    return !!done;
  })()`);
}

const results = [];
for (const id of ids) {
  await selectWeapon(id);
  const applied = await applyPose(id);
  await new Promise((r) => setTimeout(r, 380));
  const measure = await cdp.evaluate(MEASURE);
  let out = null;
  if (!opt("json-only", "")) {
    out = outFor(id);
    await cdp.screenshot(out);
  }
  const errors = await cdp.evaluate("window.__errors || []");
  const row = { id, applied, out, measure, errors: errors.slice(0, 8) };
  results.push(row);
  if (!flag("json")) {
    console.log(`\n=== ${id} ===`);
    console.log(JSON.stringify({ screen: measure.screen, world: measure.world, muzzle: measure.muzzle,
      chain: measure.chain, hands: measure.hands, tris: measure.tris, applied }, null, 1));
    if (errors.length) console.log("ERREURS:", errors);
  }
}

if (flag("json")) console.log(JSON.stringify(results, null, 2));

cdp.close();
await closeChrome(chrome);
process.exit(results.some((r) => r.errors.length > 0) ? 1 : 0);
