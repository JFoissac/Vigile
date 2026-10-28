// game.js — la veille : horloge de nuit, vagues, boss, soins, caméra, diagnostic.
// Ce module ne touche pas au DOM (sauf via l'interface ui) et ne crée pas le renderer.

import * as THREE from "three";
import { buildChapel } from "../world/chapel.js";
import { buildLandscape } from "../world/graveyard.js";
import { buildSky, MOON_LIGHT } from "../world/sky.js";
import { buildProps } from "../world/props.js";
import { buildVillage } from "../world/village.js";
import { buildVolumetrics } from "../fx/volumetrics.js";
import { buildMenuStage } from "../world/menu_stage.js";
import { createTelemetry } from "./telemetry.js";
import { createCitizens } from "../entities/citizen.js";
import { LEVELS, loadLevel, currentLevel } from "./levels.js";
import { createFx } from "../fx/particles.js";
import { createPlayer } from "../entities/player.js";
import { createZombie, ZOMBIE_TYPES } from "../entities/zombie.js";
import { createBoss, BOSS } from "../entities/boss.js";
import { createLoot } from "../entities/loot.js";
import { maxWeaponTier } from "../entities/weapons.js";
import { createAchievements } from "./achievements.js";
import { drawBlessings } from "./blessings.js";
import { T } from "../world/textures.js";
import { box } from "../world/geo.js";
import { clamp, lerp, damp, makeRng, roman, clockLabel, officeName, randRange } from "../core/util.js";

const NIGHT_HOURS = 8;

export function createWorld({ scene, camera, renderer, audio, input, ui, settings }) {
  const rng = makeRng(20261102);

  const state = {
    mode: "menu",          // menu | playing | paused | end
    level: currentLevel(),   // terrain en cours (chapelle | village)
    nightT: 0,
    nightDur: 480,
    dawnK: 0,
    wave: 0,
    waveState: "idle",     // idle | intermission | inprogress | finished
    intermission: 0,
    pending: 0,
    spawnTimer: 0,
    maxAlive: 24,
    waveTotal: 12,
    bossSpawned: false,
    bossDead: false,
    victory: false,
    endReason: "",
    freeze: false,
    shake: 0,
    shakeT: 0,
    elapsed: 0,
    kills: 0,
    killsByType: { walker: 0, runner: 0, brute: 0, zealot: 0 },
    planName: null,
    graveDebt: 0,
    graveBroken: 0,
    bossVariant: 0,
    bossesKilled: 0,
    bossKilled: false,
    flasks: 0,
    maxFlasks: 3,
    healPulse: 0,
    lastBellHour: 0,
    lastHourLabel: "",
    snap: null,
    intro: null,
    blessing: null,
    blessingsTaken: 0,
    inventoryOpen: false,
    activeItem: "none",
    menuT: 0,
    menuShot: null,         // cadre de capture imposé pour le menu (outil de test)
    lockGrace: 0,          // fenêtre où la perte de souris ne doit PAS mettre en pause
    musicTrack: null,
  };

  /* ─────────────── monde ─────────────── */

  scene.fog = new THREE.FogExp2(0x0a171b, 0.029);
  scene.background = new THREE.Color(0x05090b);

  const hemi = new THREE.HemisphereLight(0x4a6a72, 0x11150f, 1.0);
  scene.add(hemi);
  const ambient = new THREE.AmbientLight(0x22363a, 0.7);
  scene.add(ambient);

  // lumière de remplissage froide, côté joueur : détache les silhouettes du fond
  const fill = new THREE.DirectionalLight(0x8aa6b4, 3.4);
  fill.position.set(-22, 16, 42);
  scene.add(fill);

  const moon = new THREE.DirectionalLight(0xa9c6d6, 2.2);
  moon.position.copy(MOON_LIGHT);
  moon.target.position.set(0, 3, 2);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  const sc = moon.shadow.camera;
  sc.left = -34; sc.right = 34; sc.top = 36; sc.bottom = -36;
  sc.near = 1; sc.far = 160;
  moon.shadow.bias = -0.0007;
  moon.shadow.normalBias = 0.035;
  scene.add(moon, moon.target);

  const chapel = buildChapel(scene);
  const landscape = buildLandscape(scene);
  const props = buildProps(scene);
  const sky = buildSky(scene);
  const fx = createFx(scene);
  const volumetrics = buildVolumetrics(scene, chapel, MOON_LIGHT.clone());
  const menuStage = buildMenuStage(scene, chapel);
  const player = createPlayer({ scene, camera, chapel, input, audio, fx, settings });

  const enemies = [];
  let boss = null;

  // télémétrie : accumulée en mémoire, POSTée une fois en fin de veille
  const telemetry = createTelemetry({ version: "v2" });
  let teleLast = { shots: 0, hits: 0, heads: 0, dmg: 0, sample: 0 };

  const achievements = createAchievements({
    ui,
    audio,
    onSummary: (s) => ui.refreshBadge(s),
  });
  achievements.list(); // amorce le badge du menu (via ui.refreshBadge au premier rendu)

  const colliders = [...chapel.colliders, ...landscape.colliders, ...props.colliders];

  // la place du village : chargée seulement si le terrain la demande
  const village = { group: null, loading: null, colliders: [] };
  function ensureVillage() {
    if (village.group || village.loading) return;
    village.loading = buildVillage({
      scene,
      onProgress: (k) => ui.setProgress(0.55 + k * 0.4, "Le village s'installe…"),
    }).then((v) => {
      village.group = v.group;
      village.colliders = v.colliders;
      village.lampes = v.lampes;
      colliders.push(...v.colliders);
      return v;
    }).catch((e) => {
      window.__errors.push("village: " + ((e && e.message) || e));
      return null;
    });
  }

  // les habitants de la place : à protéger, jamais tuables par le joueur
  const cc = currentLevel().citizenCenter;
  const citizens = createCitizens({
    scene, count: Math.max(1, LEVELS.village.citizens), groundAt: player.groundAt,
    center: { x: cc.x, z: cc.z }, radius: cc.radius,
  });
  citizens.setActive(currentLevel().citizens > 0);

  /* ─────────────── butin : objets au sol, caisses, coffres ─────────────── */

  const loot = createLoot({
    scene,
    groundAt: player.groundAt,
    colliders,
    player,
    fx,
    notify: (text) => ui.toast(text),
    onLoot: (payload) => {
      ui.lootPopup(payload);
      if (payload.kind === "cache") telemetry.cache(payload.cacheType, payload.theme, payload.items.map((i) => i.id));
    },
    makeWeaponModel: (id) => player.makeLootModel(id),
    getWave: () => state.wave || 1,
    onVial: () => {
      if (state.flasks < state.maxFlasks) {
        state.flasks++;
        return "Fiole de lumière ramassée · Q pour boire";
      }
      player.heal(18);
      return "Fiole bue · +18 PV";
    },
  });

  function spawnVial(x, z) { loot.spawnAt("vial", x, z); }
  function spawnAmmo(x, z, type = "9mm") {
    const id = type === "12" ? "ammo12" : type === ".308" ? "ammo308" : type === "5.56" ? "ammo556" : "ammo9";
    loot.spawnAt(id, x, z);
  }

  // arme ramassée : on annonce la touche, sans changer d'arme en pleine fusillade
  player.onUnlock = (d, index) => {
    ui.toast(`Arme trouvée · ${d.name} — touche ${index + 1}`);
  };
  player.onLocked = (d) => {
    ui.toast(`${d.name} · arme non trouvée — fouillez la lande et les coffres`);
  };

  /* ─────────────── tombes : butin rare ou répit pour la vague suivante ─────────────── */

  const RARE_GRAVE_LOOT = ["ammo308", "key", "vial", "ammo556"];

  player.graveMeshes = landscape.graveMeshes;
  player.graveRecords = landscape.graveRecords;
  player.onGrave = (hit, dmg, point) => {
    const rec = landscape.graveAt(hit.object, hit.instanceId);
    if (!rec || !rec.alive) return false;
    const res = landscape.hitGrave(rec, dmg);
    if (!res.broken) return true;
    state.graveBroken++;
    state.shake = Math.min(1, state.shake + 0.18);
    fx.puff(point.x, point.y + 0.2, point.z, {
      scale: 1.3, life: 0.9, color: 0x9a958a, opacity: 0.3, vy: 0.5,
    });
    audio.hit(false);
    // une tombe sur trois environ rend un butin rare ; les autres allègent la vague
    if (rng() < 0.42) {
      const id = RARE_GRAVE_LOOT[Math.floor(rng() * RARE_GRAVE_LOOT.length)];
      loot.spawnAt(id, rec.x + randRange(rng, -0.45, 0.45), rec.z + randRange(rng, -0.45, 0.45));
      ui.toast("Tombe brisée · butin rare");
    } else {
      state.graveDebt++;
      ui.toast(`Tombe brisée · ${state.graveDebt} hôte${state.graveDebt > 1 ? "s" : ""} de moins à la prochaine vague`);
    }
    return true;
  };

  // message explicite quand le chargeur ou la réserve sont vides
  player.onEmpty = (def) => {
    const label = def.ammo === "9mm" ? "9 mm" : def.ammo === "12" ? "calibre 12" : def.ammo === "5.56" ? "5,56" : ".308";
    ui.toast(`Chargeur vide · plus de ${label} en réserve`);
  };

  /* ─────────────── inventaire : objet actif au clic droit ─────────────── */

  const ITEM_DEFS = [
    { id: "none", name: "Aucun objet", icon: "◎", desc: "Clic droit : fiole si blessé, sinon visée (lunette)", infinite: true },
    { id: "medkit", name: "Trousse de soin", icon: "✚", desc: "Rend 45 PV", unit: "en réserve" },
    { id: "vial", name: "Fiole de lumière", icon: "◍", desc: "Rend 35 PV", unit: (n) => (n > 1 ? "fioles" : "fiole") },
    { id: "lantern", name: "Lanterne à huile", icon: "✦", desc: "22 s de lumière large", unit: "en réserve" },
    { id: "key", name: "Clé de la sacristie", icon: "⚿", desc: "Ouvre un coffre verrouillé · les morts et les caisses en lâchent", unit: (n) => (n > 1 ? "clés" : "clé") },
  ];

  function itemCount(id) {
    if (id === "medkit") return loot.inventory.medkits;
    if (id === "vial") return state.flasks;
    if (id === "lantern") return loot.inventory.lanterns;
    if (id === "key") return loot.inventory.keys;
    return 0;
  }

  function inventoryModel() {
    return {
      clock: state.clockLabel || "22:00",
      active: state.activeItem || "none",
      items: ITEM_DEFS.map((d) => {
        const count = d.id === "none" ? 0 : itemCount(d.id);
        return { ...d, count, unit: typeof d.unit === "function" ? d.unit(count) : d.unit };
      }),
      weapons: player.weapons.filter((w) => w.unlocked).map((w) => ({
        id: w.def.id,
        index: player.weapons.indexOf(w),
        name: w.def.short,
        full: w.def.name,
        slot: w.def.slot,
        power: w.def.power,
        tier: w.def.tier,
        ammo: w.def.melee ? "lame" : `${w.mag}/${player.reserves[w.def.ammo] ?? 0}`,
        mag: w.def.melee ? 0 : w.mag,
        reserve: w.def.melee ? 0 : (player.reserves[w.def.ammo] ?? 0),
        active: w.def.id === player.state.weaponId,
        stats: player.weaponInfo(w.def),
      })),
      lockedWeapons: player.weapons.filter((w) => !w.unlocked).length,
    };
  }

  function openInventory() {
    if (state.mode !== "playing" || state.inventoryOpen || state.blessing || state.intro) return false;
    state.inventoryOpen = true;
    state.freeze = true;
    state.lockGrace = performance.now() + 1200;
    input.setEnabled(false);
    ui.showInventory(
      inventoryModel(),
      (id) => {
        state.activeItem = id;
        const def = ITEM_DEFS.find((d) => d.id === id);
        ui.toast(id === "none" ? "Objet actif : aucun · clic droit = visée" : `Objet actif · ${def ? def.name : id}`);
        return state.activeItem;
      },
      () => closeInventory(),
      // clic sur une arme possédée : on l'équipe et on rafraîchit la fiche
      (weaponId) => {
        const idx = player.weapons.findIndex((w) => w.def.id === weaponId);
        if (idx < 0) return false;
        const ok = player.selectWeapon(idx);
        ui.refreshInventory(inventoryModel());
        return ok;
      },
    );
    return true;
  }

  function closeInventory() {
    if (!state.inventoryOpen) return false;
    state.inventoryOpen = false;
    state.lockGrace = performance.now() + 1200;
    ui.hideInventory();
    if (state.mode === "playing") {
      state.freeze = false;
      input.setEnabled(true);
      input.requestLock();
    }
    return true;
  }

  function toggleInventory() {
    return state.inventoryOpen ? closeInventory() : openInventory();
  }

  /** Clic droit : utilise l'objet actif. `false` = laisser la visée au joueur. */
  function useActiveItem() {
    const it = state.activeItem;
    if (!it || it === "none") {
      // clic droit sans objet : une fiole si l'on est blessé (jamais sur la lunette)
      const w = player.activeWeapon;
      if (!w.zoom && state.flasks > 0 && player.state.hp < player.state.maxHp) {
        drink();
        return true;
      }
      return false;
    }
    if (it === "medkit") {
      if (loot.inventory.medkits <= 0) ui.toast("Plus de trousse de soin");
      else loot.useMedkit();
    } else if (it === "vial") {
      if (state.flasks <= 0) ui.toast("Plus de fiole de lumière");
      else drink();
    } else if (it === "lantern") {
      if (loot.inventory.lanterns <= 0) ui.toast("Plus de lanterne à huile");
      else loot.useLantern();
    } else if (it === "key") {
      ui.toast("Les clés s'utilisent sur un coffre · approchez-vous et appuyez sur E");
    }
    ui.refreshInventory(inventoryModel());
    return true;
  }

  player.onSecondary = () => useActiveItem();

  /* ─────────────── vagues ─────────────── */

  /* ─────────────── vagues : chaque assaut a sa physionomie ─────────────── */

  // Douze physionomies. Courbe retravaillée après les nuits du bot : la V3
  // sautait de ×2,8 (deux colosses à 340 PV), la taille BAISSAIT de X à XI, et
  // la nuit entière demandait 369 PV d'hôtes à abattre par seconde.
  const WAVE_PLANS = [
    { name: "Les errants", mix: { walker: 1 }, size: 1.15 },
    { name: "La meute", mix: { runner: 0.45, walker: 0.55 }, size: 1.05, speed: 1.05 },
    { name: "L'ossuaire", mix: { walker: 0.88, brute: 0.12 }, size: 1.05 },
    { name: "La procession", mix: { zealot: 0.3, walker: 0.7 }, size: 1.05 },
    { name: "L'Officiant", mix: { walker: 0.5, runner: 0.25, zealot: 0.25 }, size: 0.12, boss: true },
    { name: "La horde", mix: { walker: 0.85, runner: 0.15 }, size: 1.1, spawn: 0.5 },
    { name: "La traque", mix: { runner: 0.6, zealot: 0.16, walker: 0.19, werewolf: 0.05 }, size: 1.1, speed: 1.12, spawn: 0.42 },
    { name: "Le siège", mix: { brute: 0.16, zealot: 0.2, walker: 0.56, werewolf: 0.08 }, size: 1.05, damage: 1.1 },
    { name: "L'office noir", mix: { walker: 0.42, runner: 0.25, brute: 0.15, zealot: 0.12, werewolf: 0.06 }, size: 1.2 },
    { name: "La marée", mix: { walker: 0.5, runner: 0.5 }, size: 1.3, speed: 1.18, spawn: 0.38 },
    { name: "Le chevalet", mix: { brute: 0.2, zealot: 0.24, runner: 0.56 }, size: 1.05, damage: 1.15 },
    { name: "La dernière veille", mix: { walker: 0.3, runner: 0.3, brute: 0.2, zealot: 0.2 }, size: 1.25, speed: 1.1, damage: 1.2, spawn: 0.34 },
  ];
  const PLAN_AFTER = { name: "La nuit s'acharne", mix: { walker: 0.36, runner: 0.25, brute: 0.15, zealot: 0.14, werewolf: 0.1 }, size: 1.4, speed: 1.15, damage: 1.2, spawn: 0.36 };

  // les vagues du village : ruelles étroites, plus de coureurs et de loups-garous
  const VILLAGE_PLANS = [
    { name: "Les rôdeurs du marché", mix: { walker: 1 }, size: 1.15 },
    { name: "La rue basse", mix: { runner: 0.5, walker: 0.5 }, size: 1.05 },
    { name: "Les toits", mix: { werewolf: 0.14, runner: 0.36, walker: 0.5 }, size: 1.05 },
    { name: "Le puits", mix: { brute: 0.14, walker: 0.86 }, size: 1.05 },
    { name: "Le Boucher", mix: { walker: 0.5, runner: 0.25, werewolf: 0.25 }, size: 0.12, boss: true },
    { name: "La place cernée", mix: { walker: 0.7, runner: 0.3 }, size: 1.1, spawn: 0.5 },
    { name: "La meute des ruelles", mix: { werewolf: 0.18, runner: 0.5, walker: 0.32 }, size: 1.1, speed: 1.12 },
    { name: "Les halles", mix: { brute: 0.18, werewolf: 0.12, walker: 0.7 }, size: 1.1 },
    { name: "L'encerclement", mix: { walker: 0.4, runner: 0.3, werewolf: 0.2, brute: 0.1 }, size: 1.2 },
    { name: "La marée des ruelles", mix: { walker: 0.5, runner: 0.35, werewolf: 0.15 }, size: 1.3, speed: 1.15 },
    { name: "Le siège du village", mix: { brute: 0.2, werewolf: 0.2, runner: 0.3, walker: 0.3 }, size: 1.15, damage: 1.15 },
    { name: "La dernière veille au village", mix: { walker: 0.3, runner: 0.3, werewolf: 0.25, brute: 0.15 }, size: 1.25, speed: 1.1, damage: 1.2, spawn: 0.36 },
  ];
  const VILLAGE_AFTER = { name: "Le village s'acharne", mix: { walker: 0.32, runner: 0.28, werewolf: 0.25, brute: 0.15 }, size: 1.4, speed: 1.15, damage: 1.2, spawn: 0.36 };

  function planFor(n) {
    const village = state.level && state.level.id === "village";
    const plans = village ? VILLAGE_PLANS : WAVE_PLANS;
    return plans[n - 1] || (village ? VILLAGE_AFTER : PLAN_AFTER);
  }

  function waveSize(n) {
    const base = clamp(Math.round(5 + (n - 1) * 1.6), 1, 32);
    return clamp(Math.round(base * planFor(n).size), 1, 40);
  }

  function difficulty(n) {
    return clamp(1 + (n - 1) * 0.072, 1, 2.8);
  }

  function startWave(n) {
    state.wave = n;
    state.waveState = "inprogress";
    // les tombes brisées épargnent des hôtes à l'assaut suivant
    // les tombes épargnent des hôtes, mais pas de quoi vider une vague entière
    const spared = n > 1 ? Math.min(2, state.graveDebt) : 0;
    telemetry.startWave(n, planFor(n).name, waveSize(n));
    state.pending = Math.max(1, waveSize(n) - spared);
    state.graveDebt = 0;
    state.spawnTimer = 0.2;
    const plan = planFor(n);
    state.planName = plan.name;
    state.maxAlive = state.bossSpawned && !state.bossDead ? 10 : (plan.size >= 1.4 ? 28 : 24);
    // événements aléatoires : de la variété sans nouvelle vague écrite
    state.eliteLeft = 0;
    state.miniBoss = false;
    if (n > 1 && n % 5 !== 0) {
      const roll = rng();
      if (roll < 0.22) {
        state.eliteLeft = 2 + (rng() < 0.4 ? 1 : 0);
        ui.announce("Charrette de colosses", "Ils arrivent par la lande", 2600, { low: true });
      } else if (roll < 0.32) {
        state.miniBoss = true;
        ui.announce("Le Sonneur", "Un colosse marche devant les autres", 3000, { low: true });
      }
    }

    if (n <= state.waveTotal) {
      const sparedTxt = spared > 0 ? ` · ${spared} épargné${spared > 1 ? "s" : ""}` : "";
      ui.announce(`Vague ${roman(n)} · ${plan.name}`, `${state.pending} hôtes quittent la terre${sparedTxt} · ${Math.round(difficulty(n) * 100)} %`, 3400);
    } else {
      ui.announce("La nuit s'acharne", "Les morts ne comptent plus", 2600);
    }
    audio.horn();

    // un boss tous les cinq assauts : L'Officiant, puis ses deux paroisses
    if (n % 5 === 0) triggerBoss(bossVariantForWave(n));
  }

  function finishWave() {
    state.waveState = "intermission";
    state.intermission = state.wave >= 12 ? 7 : 5.5;
    player.heal(12);
    ui.toast("Vague nettoyée · +12 PV");
    achievements.event("wave", { n: state.wave });
    telemetry.endWave({ hp: player.state.hp, maxHp: player.state.maxHp }, loot.inventory);
    offerBlessing();
  }

  /** Mise en scène d'ouverture du boss : fondu, caméra dans la nef, titre. */
  function startBossIntro() {
    if (state.snap) return; // les scénarios de capture posent leur propre caméra
    const forward = new THREE.Vector3();
    camera.getWorldDirection(forward);
    state.intro = {
      t: 0,
      stage: 0,
      from: camera.position.clone(),
      lookFrom: camera.position.clone().addScaledVector(forward, 12),
      to: new THREE.Vector3(0.6, 3.2, 9.4),
      lookTo: new THREE.Vector3(0, 3.1, -7.6),
      fov: camera.fov,
    };
    state.freeze = true;
    state.lockGrace = performance.now() + 1200;
    input.setEnabled(false);
    ui.fade(true);
  }

  function updateIntro(dt) {
    const I = state.intro;
    I.t += dt;
    if (I.stage === 0 && I.t > 0.45) {
      I.stage = 1;
      ui.fade(false);
      ui.announce("La cloche sonne", "L'Officiant descend de l'autel", 4200, { low: true });
      audio.bossRoar();
      state.shake = 1.3;
    }
    // 0,45 → 2,55 : poussée dans la nef ; 2,55 → 3,55 : RETOUR à la position du
    // joueur. Avant, la caméra sautait de la nef à la position du joueur d'une
    // frame : le porteur l'a décrit comme « tp dans l'église puis éjecté ».
    const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
    const inK = clamp((I.t - 0.45) / 2.1, 0, 1);
    const backK = clamp((I.t - 2.55) / 1.0, 0, 1);
    const a = ease(inK) * (1 - ease(backK));
    camera.position.lerpVectors(I.from, I.to, a);
    const look = I.lookFrom.clone().lerp(I.lookTo, ease(inK)).lerp(I.lookFrom, ease(backK));
    camera.lookAt(look);
    camera.fov = lerp(lerp(I.fov, 54, ease(inK)), I.fov, ease(backK));
    camera.updateProjectionMatrix();
    state.shake = damp(state.shake, 0, 3.2, dt);
    if (I.t > 3.6) {
      state.intro = null;
      state.freeze = false;
      state.lockGrace = performance.now() + 1200;
      camera.fov = I.fov;
      camera.updateProjectionMatrix();
      if (state.mode === "playing") {
        input.setEnabled(true);
        input.requestLock();
      }
    }
  }

  /* ─────────────── bénédictions de fin de vague ─────────────── */

  function offerBlessing() {
    if (state.blessing) return;
    const cards = drawBlessings(rng, 3);
    // la progression en armes passe par le CHOIX de fin de phase : une arme
    // encore manquante remplace une carte (les drops restent rares)
    const tierMax = maxWeaponTier(state.wave || 1);
    const missing = player.weapons.filter((w) => !w.unlocked && w.def.tier <= tierMax);
    if (missing.length) {
      const w = missing[Math.floor(rng() * missing.length)];
      const info = player.weaponInfo(w.def);
      cards[0] = {
        id: `weapon:${w.def.id}`, kind: "weapon", weaponId: w.def.id,
        name: w.def.name, tag: "Arme", icon: "⚔",
        desc: `${w.def.short} · ${info.damage} dégâts · tête ${Math.round(info.headChance * 100)} % · puissance ${info.power}`,
        apply: (ctx) => ctx.unlockWeapon(w.def.id),
      };
    }
    state.blessing = { cards };
    state.freeze = true;
    state.lockGrace = performance.now() + 1200;
    input.setEnabled(false);
    ui.showBlessings(
      cards.map((c) => ({ id: c.id, name: c.name, tag: c.tag, desc: c.desc, icon: c.icon })),
      (index) => chooseBlessing(index),
    );
  }

  function chooseBlessing(index) {
    const B = state.blessing;
    if (!B) return;
    const card = index >= 0 ? B.cards[index] : null;
    state.blessing = null;
    state.lockGrace = performance.now() + 1500;
    if (card) {
      card.apply({
        player,
        state,
        unlockWeapon: (id) => player.unlockWeapon(id),
        refillAmmo: () => {
          player.addAmmo("9mm", 48);
          player.addAmmo("12", 16);
          player.addAmmo("5.56", 60);
          player.addAmmo(".308", 10);
        },
        addFlask: () => { state.maxFlasks += 1; state.flasks = Math.min(state.maxFlasks, state.flasks + 1); },
      });
      if (card.kind === "weapon") {
        audio.pickup();
        ui.toast(`Arme · ${card.name} — ${card.desc}`);
      } else {
        state.blessingsTaken = (state.blessingsTaken || 0) + 1;
        achievements.event("blessing");
        audio.pickup();
        ui.toast(`Bénédiction · ${card.name} — ${card.desc}`);
      }
    } else {
      ui.toast("Bénédiction refusée · la nuit reprend");
    }
    state.freeze = false;
    if (state.mode === "playing") {
      input.setEnabled(true);
      input.requestLock();
    }
  }

  function spawnOne() {
    const alive = enemies.filter((e) => e.alive).length;
    if (alive >= state.maxAlive) {
      state.spawnTimer = 0.6;
      return false;
    }
    // les morts sortent de la périphérie, mais pas à l'autre bout de la lande :
    // viser ~26 m évite les vagues où l'on attend 40 s qu'un traînard arrive
    const pts = landscape.spawnPoints;
    let best = null, bestScore = -1e9;
    for (let i = 0; i < 8; i++) {
      const p = pts[Math.floor(rng() * pts.length)];
      const d = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
      if (d < 14) continue;                       // jamais dans la figure du joueur
      // 18 m : les morts arrivent plus vite et on ne perd plus leur trace
      const score = -Math.abs(d - 18) + rng() * 6;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    if (!best) return false;
    const plan = planFor(state.wave);
    // tirage pondéré dans la composition de la vague
    let roll = rng(), type = "walker", acc = 0;
    for (const [t, w] of Object.entries(plan.mix)) {
      if (t === "werewolf" && !state.level.werewolf) continue;
      acc += w;
      if (roll <= acc) { type = t; break; }
    }
    // pas plus de deux colosses vivants (quatre en fin de veille) : cinq d'un
    // coup, c'était une corvée de plusieurs minutes
    const bruteCap = state.wave >= 9 ? 4 : 2;
    if (type === "brute" && enemies.filter((e) => e.alive && !e.rising && e.type === "brute").length >= bruteCap) {
      type = rng() < 0.5 ? "walker" : "runner";
    }
    if (state.eliteLeft > 0) { type = "brute"; state.eliteLeft--; }
    const diff = difficulty(state.wave);
    const z = createZombie({
      scene, x: best.x + randRange(rng, -1.2, 1.2), z: best.z + randRange(rng, -1.2, 1.2),
      type, difficulty: diff, seed: Math.floor(rng() * 99999), groundAt: player.groundAt,
      speedMul: plan.speed || 1, damageMul: plan.damage || 1,
    });
    if (state.miniBoss) {
      state.miniBoss = false;
      z.hp *= 3;
      z.maxHp *= 3;
      z.group.scale.setScalar(1.35);
      z.elite = true;
      ui.toast("Le Sonneur est là · un colosse trois fois plus dur");
    }
    enemies.push(z);
    fx.dirt(z.pos.x, z.pos.z);
    return true;
  }

  const BOSS_NAMES = { 1: "L'Officiant", 2: "Le Diacre", 3: "L'Abbé noir" };
  const BOSS_SUBTITLES = {
    1: "L'Officiant s'éveille dans la nef",
    2: "Le Diacre descend du chœur",
    3: "L'Abbé noir sort de la sacristie",
  };

  /** Un boss tous les cinq assauts : variante 1, 2 puis 3 (plafonnée). */
  function bossVariantForWave(n) {
    return Math.max(1, Math.min(3, Math.ceil(n / 5)));
  }

  function triggerBoss(variant = 1) {
    if (boss && boss.alive) return;
    if (boss && boss.removed) boss = null;
    state.bossSpawned = true;
    state.bossDead = false;
    state.bossVariant = variant;
    state.maxAlive = 10;
    const bname = BOSS_NAMES[variant] || BOSS_NAMES[1];
    audio.bell(3);
    audio.bossRoar();
    ui.announce("La cloche sonne", BOSS_SUBTITLES[variant] || BOSS_SUBTITLES[1], 5200);
    ui.toast(state.level && state.level.id === "village" ? `${bname} surgit sur la place` : `Rejoignez la nef — ${bname} vous attend`);
    state.shake = 1.2;
    const auVillage = state.level && state.level.id === "village";
    boss = createBoss({
      scene,
      x: auVillage ? 1.9 : 0,
      z: auVillage ? 19.6 : -7.5,
      difficulty: difficulty(state.wave), variant, name: bname,
    });
    // dépôt de la sacristie : sans munitions, un boss qui verrouille la vague
    // serait une impasse. Trois objets à portée dans la nef.
    if (state.level && state.level.id === "village") {
      loot.spawnAt("ammo9", 4.4, 21.5);
      loot.spawnAt("ammo12", -1.2, 22.0);
      loot.spawnAt("medkit", 6.0, 18.0);
    } else {
      loot.spawnAt("ammo9", 3.2, 6.4);
      loot.spawnAt("ammo12", -3.0, 6.6);
    }
    loot.spawnAt("medkit", 0.3, 9.4);
    telemetry.bossSpawn(bname, variant, Math.round(boss.maxHp));
    startBossIntro();
    boss.onPhase2 = () => {
      telemetry.bossPhase(2);
      ui.announce("Phase II", `${bname} tombe le masque`, 3600);
      audio.bossRoar();
      state.shake = 1.4;
      for (let i = 0; i < 2; i++) {
        const z = createZombie({
          scene, x: randRange(rng, -3, 3), z: 11.2,
          type: "runner", difficulty: difficulty(state.wave), seed: Math.floor(rng() * 99999),
          groundAt: player.groundAt,
        });
        enemies.push(z);
      }
    };
    boss.onPhase3 = () => {
      telemetry.bossPhase(3);
      ui.announce("Phase III", `${bname} se donne tout entier`, 4200);
      audio.bossRoar();
      audio.bell(4);
      state.shake = 1.8;
      fx.glass(new THREE.Vector3(0, 4.2, -7), 30);
      for (let i = 0; i < 2; i++) {
        const zz = createZombie({
          scene, x: randRange(rng, -3.4, 3.4), z: 10.8 + i * 0.3,
          type: i % 2 ? "runner" : "walker", difficulty: difficulty(state.wave),
          seed: Math.floor(rng() * 99999), groundAt: player.groundAt,
        });
        enemies.push(zz);
      }
    };
    boss.hitRoot.userData.enemy = boss;
    // réserve de la sacristie : de quoi tenir le siège de la nef
    loot.spawnCache("coffre", -4.7, 10.4, {
      wave: state.wave, loot: ["ammo308", "ammo556", "medkit", "vial", "key"],
    });
    loot.spawnCache("caisse", 4.7, 9.4, {
      wave: state.wave, loot: ["ammo556", "ammo12", "ammo9", "medkit"],
    });
  }

  /* ─────────────── boucle de jeu ─────────────── */

  function updateNight(dt) {
    state.nightT = Math.min(state.nightDur, state.nightT + dt);
    const ratio = state.nightT / state.nightDur;
    const hour = 22 + ratio * NIGHT_HOURS;
    state.clockHour = hour;
    state.clockLabel = clockLabel(hour);
    state.office = officeName(hour);

    if (hour >= 23 && state.lastBellHour < 23) { state.lastBellHour = 23; audio.bell(1); }
    else if (hour >= 25 && state.lastBellHour < 25) { state.lastBellHour = 25; audio.bell(2); }
    else if (hour >= 28 && state.lastBellHour < 28) { state.lastBellHour = 28; audio.bell(1); }

    // l'aube se lève dans les dix dernières minutes de jeu
    const dawnStart = 0.88;
    if (ratio > dawnStart) {
      state.dawnK = clamp((ratio - dawnStart) / (1 - dawnStart), 0, 1);
      applyDawn(state.dawnK);
    }

    if (state.nightT >= state.nightDur) {
      if (state.bossDead || !state.bossSpawned) endGame(true, "L'aube s'est levée sur un Vigile encore debout.");
      else endGame(false, "Le jour se lève. L'Officiant est toujours dans la nef.");
    }
  }

  function updateWaves(dt) {
    if (state.waveState === "idle") {
      state.waveState = "intermission";
      state.intermission = 6;
      return;
    }
    if (state.waveState === "intermission") {
      state.intermission -= dt;
      if (state.intermission <= 0) startWave(state.wave + 1);
      return;
    }
    if (state.waveState === "inprogress") {
      const alive = enemies.filter((e) => e.alive).length;
      if (state.pending > 0) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          if (spawnOne()) state.pending--;
          const plan = planFor(state.wave);
          state.spawnTimer = plan.spawn || (state.wave >= 10 ? 0.36 : 0.45);
        }
      } else if (alive === 0) {
        // LE BOSS TIENT LA NEF : la vague ne se ferme pas tant qu'il respire.
        // Avant, on pouvait nettoyer les hôtes et passer à l'assaut suivant en
        // laissant L'Officiant vivant (signalé par le porteur).
        if (boss && boss.alive && !state.bossDead) {
          if (!state.bossWaitShown) {
            state.bossWaitShown = true;
            ui.announce("La nef attend", "Le boss est toujours debout", 2600, { low: true });
            ui.toast("Rejoignez la nef — la vague ne se terminera pas sans lui");
          }
          state.spawnTimer = 1.0;
        } else {
          state.bossWaitShown = false;
          finishWave();
        }
      }
    }
  }

  function applyDawn(k) {
    const fogNight = new THREE.Color(0x0a171b);
    const fogDawn = new THREE.Color(0x8d7f72);
    scene.fog.color.copy(fogNight).lerp(fogDawn, k);
    scene.fog.density = lerp(0.029, 0.014, k);
    moon.color.setHex(0xa9c6d6).lerp(new THREE.Color(0xffb98a), k);
    moon.intensity = lerp(2.2, 3.4, k);
    moon.position.set(lerp(MOON_LIGHT.x, 52, k), lerp(MOON_LIGHT.y, 16, k), lerp(MOON_LIGHT.z, 40, k));
    hemi.color.setHex(0x34545c).lerp(new THREE.Color(0xd8a888), k);
    hemi.intensity = lerp(1.0, 1.2, k);
    ambient.intensity = lerp(0.7, 0.8, k);
    sky.setDawn(k);
    volumetrics.setDawn(k);
    chapel.setDawn(k);
    audio.setDawn(k);
    state.dawnK = k;
  }

  function endGame(victory, reason) {
    if (state.mode === "end") return;
    state.mode = "end";
    state.victory = victory;
    state.endReason = reason;
    state.freeze = true;
    state.endAt = state.elapsed;
    input.setEnabled(false);
    const stats = buildStats(victory);
    telemetry.endRun({
      victory, wave: state.wave, kills: state.kills, clock: state.clockLabel,
      damageTaken: stats.damageTaken, accuracy: stats.accuracy, headshots: stats.headshots,
      bossesKilled: state.bossesKilled || 0, graveyards: stats.graves || 0,
      survived: stats.survived,
    });
    if (victory) achievements.event("victory", { damageTaken: stats.damageTaken, hp: stats.hp });
    const achSummary = achievements.endRun({ ...stats, victory });
    stats.achievements = achSummary;
    if (victory) {
      audio.dawn();
    } else {
      audio.defeat();
    }
    ui.showEnd(stats);
  }

  function buildStats(victory) {
    // un coup de fusil à pompe compte 8 grains pour 1 tir : la précision ne
    // peut pas dépasser 100 %, on plafonne
    const accuracy = player.state.shots ? Math.min(100, Math.round((player.state.hits / player.state.shots) * 100)) : 0;
    return {
      victory,
      reason: state.endReason,
      survived: state.elapsed,
      clock: state.clockLabel || "22:00",
      wave: state.wave,
      kills: state.kills,
      headshots: player.state.headshots,
      accuracy,
      damageTaken: Math.round(player.state.damageTaken),
      bossKilled: state.bossDead,
      bossesKilled: state.bossesKilled || 0,
      graves: state.graveBroken || 0,
      flasks: state.fiolesUsed || 0,
      shots: player.state.shots,
      hp: Math.round(player.state.hp),
      blessings: state.blessingsTaken || 0,
    };
  }

  /* ─────────────── interactions ─────────────── */

  function interactUpdate(dt) {
    // le butin au sol et les caisses s'ouvrent au passage (voir loot.update) :
    // E est une touche de déplacement (droite), plus une touche d'interaction
    loot.update(dt, player.pos.x, player.pos.z);

    const hDown = input.state.keys.has("KeyH");
    if (hDown && !hWasDown) loot.useMedkit();
    hWasDown = hDown;

    const lDown = input.state.keys.has("KeyL");
    if (lDown && !lWasDown) loot.useLantern();
    lWasDown = lDown;
  }

  function drink() {
    if (state.flasks <= 0 || !player.alive) return;
    state.flasks--;
    state.fiolesUsed = (state.fiolesUsed || 0) + 1;
    player.heal(35);
    fx.heal(player.pos.clone().setY(1.1));
    audio.pickup();
    ui.toast("Fiole bue · +35 PV");
    achievements.event("flask");
  }

  let qWasDown = false;
  let eWasDown = false;
  let hWasDown = false;
  let lWasDown = false;
  let lastHeadshots = 0;
  let lastShots = 0;

  /* ─────────────── musique ─────────────── */

  /** Piste attendue selon l'instant : office, assaut, boss, aube. */
  function desiredMusic() {
    if (state.mode === "menu") return "menu";
    if (state.mode === "end") return state.victory ? "dawn" : null;
    if (boss && boss.alive && state.bossSpawned) return "boss";
    // l'aube approche : la musique s'éclaircit avant même la fin
    if (state.dawnK > 0.45) return "dawn";
    if (state.waveState === "inprogress") return "combat";
    return "night";
  }

  /** La perte de la souris ne doit pas mettre en pause un écran déjà ouvert. */
  function canAutoPause() {
    if (state.mode !== "playing") return false;
    if (state.inventoryOpen || state.blessing || state.intro) return false;
    return performance.now() > (state.lockGrace || 0);
  }

  /* ─────────────── caméra du menu : la chapelle en contre-jour ─────────────── */

  // L'écran d'accueil est plus clair que la veille : on relève la lune, le
  // remplissage et l'ambiance pour que la pierre se lise, et la mise en scène
  // (halos, seuil, brume) ne vit que là.
  const MOOD = {
    moon: moon.intensity,
    hemi: hemi.intensity,
    ambient: ambient.intensity,
    fill: fill.intensity,
  };
  function setMenuMood(on) {
    moon.intensity = on ? 3.1 : MOOD.moon;
    hemi.intensity = on ? 1.32 : MOOD.hemi;
    ambient.intensity = on ? 0.92 : MOOD.ambient;
    fill.intensity = on ? 3.9 : MOOD.fill;
    menuStage.setActive(on);
  }

  // Cadre d'accueil : on se place devant la façade sud (portail + rosace), assez
  // bas pour que le clocher se découpe sur la lune, chapelle au centre et lune
  // dans le haut-droit ; le panneau de menu occupe le ciel sombre à gauche.
  const MENU_HERO = {
    // façade sud cadrée à droite du panneau : portail au sol, rosace au tiers
    // haut, clocher entier sur le ciel, lune au bord droit. Le panneau occupe
    // la nuit vide à gauche, plus aucun élément du décor ne passe dessous.
    pos: new THREE.Vector3(3.2, 2.30, 27.2),
    target: new THREE.Vector3(-8.4, 8.20, 6.6),
    sway: 0.34,
    rise: 0.16,
    period: 64,
  };

  function menuCamera(dt) {
    const shot = state.menuShot;   // outil de capture : cadre imposé (x,y,z / tx,ty,tz)
    if (shot) {
      camera.position.fromArray(shot.pos);
      camera.lookAt(shot.target[0], shot.target[1], shot.target[2]);
      camera.rotation.order = "YXZ";
      return;
    }
    const t = state.menuT;
    const s = Math.sin((t / MENU_HERO.period) * Math.PI * 2);
    const c = Math.cos((t / (MENU_HERO.period * 1.7)) * Math.PI * 2);
    camera.position.set(
      MENU_HERO.pos.x + s * MENU_HERO.sway,
      MENU_HERO.pos.y + c * MENU_HERO.rise,
      MENU_HERO.pos.z - Math.abs(s) * 0.45,
    );
    camera.lookAt(MENU_HERO.target);
    camera.rotation.order = "YXZ";
  }

  /* ─────────────── mise à jour principale ─────────────── */

  function update(dt) {
    dt = Math.min(dt, 0.05);
    state.elapsed += dt;

    // ambiance toujours vivante
    chapel.update(dt);
    landscape.update(dt);
    sky.update(dt, state.elapsed);
    volumetrics.update(dt, state.elapsed);
    fx.update(dt);

    const track = desiredMusic();
    if (track !== state.musicTrack) {
      state.musicTrack = track;
      if (track) audio.playMusic(track); else audio.stopMusic();
    }
    audio.musicTick(dt);

    if (state.mode === "menu") {
      state.menuT += dt;
      // La vue subjective (bras + arme) n'a rien à faire au menu : sans mise à
      // jour du joueur, le view-model reste à l'origine de sa caméra et son
      // arme remplit l'écran (aplat beige au centre du décor).
      player.view.visible = false;
      if (!menuStage.active) setMenuMood(true);
      menuStage.update(dt, state.elapsed);
      menuCamera(dt);
      return;
    }

    if (state.mode === "end") {
      // léger recul de caméra pendant l'écran de fin
      const t = Math.min(1, (state.elapsed - state.endAt) / 4);
      camera.position.z += dt * 0.25;
      camera.rotation.x = damp(camera.rotation.x, 0.06, 1, dt);
      return;
    }

    if (state.mode === "paused") {
      player.update(dt, { colliders, enemies: [], paused: true, freeze: true });
      return;
    }

    // mode playing
    if (state.intro) updateIntro(dt);
    if (!state.freeze) {
      updateNight(dt);
      updateWaves(dt);
      player.update(dt, { colliders, enemies: collectTargets(), paused: false });
      interactUpdate(dt);

      // boire une fiole (G : Q est pris par le déplacement ZASE)
      const qDown = input.state.keys.has("KeyG");
      if (qDown && !qWasDown) drink();
      qWasDown = qDown;

      // ennemis
      const ctx = {
        player, colliders, enemies, time: state.elapsed, audio, fx,
        camYaw: player.state.yaw, shake: (v) => { state.shake = Math.max(state.shake, v); },
        notify: (text) => ui.toast(text),
      };
      ctx.citizens = citizens.list;
    for (const e of enemies) e.update(dt, ctx);
    citizens.update(dt, { enemies, colliders });

      if (boss && !boss.removed) {
        boss.update(dt, ctx);
        if (!boss.alive && !state.bossDead) {
          const bname = boss.name || "L'Officiant";
          state.bossDead = true;
          state.bossKilled = true;
          state.bossesKilled = (state.bossesKilled || 0) + 1;
          state.kills++;
          achievements.event("boss", { phase: boss.phase });
          telemetry.bossKill(bname, state.bossVariant);
          audio.bell(4);
          ui.announce(`${bname} est tombé`, "La nef est vide. Tenez jusqu'à l'aube.", 5200);
          ui.toast(`${bname} est mort — tenez jusqu'à 06:00`);
          fx.glass(boss.pos.clone().setY(2.0), 50);
          state.shake = 1.5;
          loot.dropBoss(boss.pos.x, boss.pos.z, player.owned.map((d) => d.id));
        }
      }

      /* ─────────────── suivi des succès ─────────────── */
      if (player.state.headshots > lastHeadshots) {
        achievements.event("headshot", { n: player.state.headshots - lastHeadshots });
        lastHeadshots = player.state.headshots;
      }
      if (player.state.shots > lastShots) {
        achievements.event("weapon", { id: player.state.weaponId });
        lastShots = player.state.shots;
      }

      // morts et nettoyage
      for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e.removed) { enemies.splice(i, 1); continue; }
        if (!e.alive && e.dead && !e.counted) {
          e.counted = true;
          state.kills++;
          state.killsByType[e.type] = (state.killsByType[e.type] || 0) + 1;
          telemetry.kill(e.type, player.state.weaponId, false);
          achievements.event("kill", { type: e.type, melee: !!player.activeWeapon.melee });
          loot.dropFromZombie(e.type, state.wave, e.pos.x, e.pos.z, player.owned.map((d) => d.id));
        }
      }

      /* ─────────────── télémétrie : tirs, touches, dégâts, pression ─────────────── */
      const pst = player.state;
      if (pst.shots > teleLast.shots) {
        for (let i = 0; i < pst.shots - teleLast.shots; i++) telemetry.shot(pst.weaponId);
        teleLast.shots = pst.shots;
      }
      if (pst.hits > teleLast.hits) {
        const heads = pst.headshots - teleLast.heads;
        for (let i = 0; i < pst.hits - teleLast.hits; i++) telemetry.hit(pst.weaponId, i < heads);
        teleLast.hits = pst.hits;
        teleLast.heads = pst.headshots;
      }
      if (pst.damageTaken > teleLast.dmg) {
        telemetry.damage(pst.damageTaken - teleLast.dmg, "combat");
        teleLast.dmg = pst.damageTaken;
      }
      if (state.elapsed - teleLast.sample >= 2) {
        teleLast.sample = state.elapsed;
        telemetry.sample({
          wave: state.wave, hp: pst.hp, ammo: pst.ammo, reserve: pst.reserve,
          enemies: enemies.filter((e) => e.alive).length + state.pending,
          boss: !!(boss && boss.alive && !state.bossDead),
          x: player.pos.x, z: player.pos.z, fps: state.fpsAvg,
        });
      }

      if (!player.alive) {
        endGame(false, "Les morts vous ont pris avant l'aube.");
      } else if (state.level.citizens > 0 && citizens.aliveCount() === 0) {
        endGame(false, "Le village est vide : plus un habitant à défendre.");
      }

      // tremblement global (boss)
      state.shake = damp(state.shake, 0, 3.2, dt);
      state.shakeT += dt * 26;
      if (state.shake > 0.01) {
        camera.rotation.x += Math.sin(state.shakeT * 1.7) * 0.006 * state.shake;
        camera.rotation.z += Math.cos(state.shakeT * 2.3) * 0.004 * state.shake;
      }
    } else if (!state.intro) {
      // scène figée : la caméra reste pilotée par l'état du joueur, le butin flotte
      player.update(dt, { colliders, enemies: [], paused: true, freeze: true });
      loot.update(dt, player.pos.x, player.pos.z);
      // les morts continuent de respirer sur place (captures et pause vivantes)
      for (const e of enemies) {
        if (!e.removed && e.alive && !e.rising && e.pose) e.pose(dt, "walk", { speed01: 0.4, t: state.elapsed });
      }
      state.shake = damp(state.shake, 0, 3.2, dt);
    }

    // HUD
    pushHud({
      hp: player.state.hp,
      maxHp: player.state.maxHp,
      stamina: player.state.stamina,
      ammo: player.state.ammo,
      reserve: player.state.reserve,
      reloading: player.state.reloading,
      reloadT: player.state.reloadT,
      reloadDur: player.state.reloadDur,
      wave: state.wave,
      waveLeft: enemies.filter((e) => e.alive).length + state.pending,
      bossWaiting: !!(boss && boss.alive && !state.bossDead),
      citizens: state.level.citizens > 0
        ? { alive: citizens.aliveCount(), total: citizens.total }
        : null,
      threat: (() => {
        let best = null, bd = 1e9;
        for (const e of enemies) {
          if (!e.alive || e.removed || e.rising) continue;
          const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z;
          const d = Math.hypot(dx, dz);
          if (d < bd) { bd = d; best = { dx, dz, type: e.type, dist: d }; }
        }
        if (boss && boss.alive && !state.bossDead) {
          const dx = boss.pos.x - player.pos.x, dz = boss.pos.z - player.pos.z;
          const d = Math.hypot(dx, dz);
          if (d < bd) { bd = d; best = { dx, dz, type: "boss", dist: d }; }
        }
        return best;
      })(),
      clock: state.clockLabel || "22:00",
      clockRatio: state.nightT / state.nightDur,
      // en heures de jeu (la nuit fait 8 h) : « 6 h 39 avant l'aube »
      clockLeft: Math.max(0, (state.nightDur - state.nightT) / state.nightDur * NIGHT_HOURS * 3600),
      office: state.office || "Vêpres",
      boss: boss && !state.bossDead ? { hp: Math.max(0, boss.hp), maxHp: boss.maxHp, phase: boss.phase, name: boss.name } : null,
      objective: state.bossSpawned && !state.bossDead ? `Abattre ${(boss && boss.name) || "L'Officiant"} dans la nef` : "Tenir jusqu'à l'aube",
      flasks: state.flasks,
      speed: Math.hypot(player.state.vel.x, player.state.vel.z),
      danger: 1 - player.state.hp / player.state.maxHp,
      hurt: player.state.hurtFlash,
      weaponName: player.state.weaponName,
      weaponShort: player.state.weaponShort,
      weaponIndex: player.state.weaponIndex,
      ammoLabel: player.state.ammoLabel,
      reserves: player.reserves,
      inventory: loot.inventory,
      prompt: loot.prompt,
      scope: player.state.zoomK,
      spread: player.state.spreadPx,
      melee: !!player.activeWeapon.melee,
      activeItem: state.activeItem,
      activeItemName: (ITEM_DEFS.find((d) => d.id === state.activeItem) || {}).name || "",
      weapons: player.weaponSlots(),
      lockedWeapons: player.weapons.filter((w) => !w.unlocked).length,
    });
  }

  function collectTargets() {
    const list = [];
    for (const e of enemies) if (e.alive && e.hitRoot) list.push(e);
    if (boss && boss.alive) list.push(boss);
    return list;
  }

  /* ─────────────── l'aube : prolonger la nuit ─────────────── */

  /** Après l'aube, « Prolonger la nuit » : nouvelle nuit, vagues ET boss suivants.
   *  L'horloge repart à 22:00, la difficulté continue de monter (elle suit le
   *  numéro de vague), et les boss tombent tous les 5 assauts : 10, 15, 20… */
  function continueNight() {
    state.cycle = (state.cycle || 0) + 1;
    state.mode = "playing";
    state.endAt = 0;
    state.victory = false;
    state.endReason = null;
    state.dawnK = 0;
    state.nightT = 0;
    state.clockHour = 22;
    state.clockLabel = clockLabel(22);
    state.office = officeName(22);
    applyDawn(0);
    state.waveState = "intermission";
    state.intermission = 6;
    state.freeze = false;
    state.lockGrace = performance.now() + 1200;
    player.heal(Math.round(player.state.maxHp * 0.4));
    if (player.refill) player.refill();
    ui.hideEnd();
    ui.showHud();
    ui.announce(`Nuit ${state.cycle + 1}`, "Le jour ne s'est pas levé — les morts reviennent plus nombreux", 4400);
    audio.bell(1);
    if (state.mode === "playing") input.setEnabled(true);
  }

  /* ─────────────── démarrage, pause, fin ─────────────── */

  function resetWorld() {
    teleLast = { shots: 0, hits: 0, heads: 0, dmg: 0, sample: 0 };
    if (typeof citizens !== "undefined" && citizens.reset) citizens.reset();
    for (const e of enemies) e.dispose();
    enemies.length = 0;
    if (boss) { boss.dispose(); boss = null; }
    loot.reset();
    loot.placeCaches(1);
    // la clé de la sacristie ne tombe plus au hasard : elle attend sur l'autel
    // (et le boss en lâche une). La lanterne n'est plus un butin de mort.
    loot.spawnAt("key", 0, -13.0);
    loot.spawnAt("lantern", 0.9, -13.2);
    fx.clear();
    state.nightT = 0;
    state.dawnK = 0;
    state.wave = 0;
    state.waveState = "idle";
    state.pending = 0;
    state.intermission = 5;
    state.bossSpawned = false;
    state.bossDead = false;
    state.bossKilled = false;
    state.kills = 0;
    state.killsByType = { walker: 0, runner: 0, brute: 0, zealot: 0 };
    state.planName = null;
    state.graveDebt = 0;
    state.graveBroken = 0;
    state.bossVariant = 0;
    state.bossesKilled = 0;
    state.freeze = false;
    state.shake = 0;
    state.elapsed = 0;
    state.flasks = 0;
    state.fiolesUsed = 0;
    state.lastBellHour = 21.5;
    state.lastHourLabel = "";
    state.blessing = null;
    state.intro = null;
    state.inventoryOpen = false;
    state.activeItem = "none";
    state.maxFlasks = 3;
    state.blessingsTaken = 0;
    lastHeadshots = 0;
    lastShots = 0;
    achievements.resetRun();
    ui.hideBlessings();
    player.resetRun();
    const sp = (LEVELS[loadLevel()] || LEVELS.chapelle).spawn;
    player.teleport(sp.x, sp.z, sp.yaw, 0);
    applyDawn(0);
    sky.setDawn(0);
    audio.setDawn(0);
  }

  function startGame(opts = {}) {
    // le niveau peut avoir changé depuis le menu (ou depuis resetWorld)
    state.level = LEVELS[loadLevel()] || LEVELS.chapelle;
    citizens.setActive(state.level.citizens > 0);
    if (state.level.id === "village") ensureVillage();
    resetWorld();
    state.mode = "playing";
    state.endAt = 0;
    player.view.visible = true;
    setMenuMood(false);
    if (opts.nightSeconds) state.nightDur = opts.nightSeconds;
    input.setEnabled(true);
    ui.showHud();
    ui.hideMenu();
    telemetry.startRun({
      settings, nightSeconds: state.nightDur,
      weapons: player.weapons.map((w) => w.def.id),
      startWeapon: player.state.weaponId,
    });
    ui.announce("Vêpres · 22:00", "Tenez jusqu'à l'aube", 3600);
    audio.init();
    if (!opts.keepLock) input.requestLock();
  }

  /** Objectifs et état de la veille, affichés dans le menu pause. */
  function pauseObjectives() {
    const alive = enemies.filter((e) => e.alive).length;
    const bossAlive = boss && boss.alive && !state.bossDead;
    const nextBoss = Math.max(5, Math.ceil((Math.max(1, state.wave) + 1) / 5) * 5);
    return [
      { k: "Objectif", v: bossAlive ? `Abattre ${boss.name || "L'Officiant"} dans la nef` : "Tenir jusqu'à l'aube" },
      { k: "Vague", v: `${roman(state.wave || 1)} · ${state.planName || "—"}` },
      { k: "Hôtes", v: `${alive + state.pending} · ${alive} debout` },
      {
        k: "Boss",
        v: bossAlive
          ? `${boss.name || "L'Officiant"} · ${Math.max(0, Math.round(boss.hp))} / ${Math.round(boss.maxHp)} PV`
          : state.bossesKilled
            ? `${state.bossesKilled} vaincu${state.bossesKilled > 1 ? "s" : ""} · prochain à la vague ${nextBoss}`
            : `À venir · vague ${nextBoss}`,
      },
      { k: "Clés", v: `${loot.inventory.keys} · ouvrent les coffres verrouillés (morts, caisses, coffres)` },
      { k: "Radar", v: "● marcheur (clair) · ● coureur (ambre) · ● colosse (rouge) · ● zélateur (violet) · ◆ boss (or)" },
      {
        k: "Tombes brisées",
        v: state.graveDebt > 0
          ? `${state.graveDebt} hôte${state.graveDebt > 1 ? "s" : ""} épargné${state.graveDebt > 1 ? "s" : ""} à la prochaine vague`
          : `${state.graveBroken} brisée${state.graveBroken > 1 ? "s" : ""} · butin rare ou répit`,
      },
    ];
  }

  /* ─────────────── radar : instantané des morts autour du joueur ─────────────── */

  const RADAR_FAR = 60;   // au-delà, plus de point (le radar s'arrête à 34 m)

  function radarSnapshot() {
    const px = player.pos.x, pz = player.pos.z;
    const blips = [];
    let total = 0;
    for (const e of enemies) {
      if (!e.alive || e.removed) continue;
      total++;
      const d = Math.hypot(e.pos.x - px, e.pos.z - pz);
      if (d > RADAR_FAR) continue;
      blips.push({ x: e.pos.x, z: e.pos.z, type: e.type, rising: !!e.rising, d });
    }
    const b = boss;
    if (b && b.alive && !state.bossDead) {
      total++;
      const d = Math.hypot(b.pos.x - px, b.pos.z - pz);
      if (d <= RADAR_FAR) blips.push({ x: b.pos.x, z: b.pos.z, type: "boss", boss: true, d });
    }
    return { x: px, z: pz, total, pending: state.pending || 0, blips };
  }

  /** Toutes les mises à jour du HUD passent ici : cap, chargeur et radar sont
   *  ainsi présents aussi dans les scènes figées (captures). */
  function pushHud(extra) {
    ui.updateHud({
      yaw: player.state.yaw,
      magSize: player.activeWeapon.mag,
      radar: radarSnapshot(),
      ...extra,
    });
  }

  function pause() {
    if (state.mode !== "playing") return;
    state.mode = "paused";
    input.setEnabled(false);
    ui.showPause(state.clockLabel || "22:00", pauseObjectives());
  }

  function resume() {
    if (state.mode !== "paused") return;
    state.mode = "playing";
    input.setEnabled(true);
    ui.hidePause();
    input.requestLock();
  }

  function quit() {
    // abandon explicite : on ferme la session de télémétrie (sinon la veille
    // quittée par le menu ne serait jamais comptée)
    if (telemetry.active) telemetry.endRun({ victory: false, quit: true, wave: state.wave, kills: state.kills });
    state.mode = "menu";
    input.setEnabled(false);
    ui.hidePause();
    ui.hideHud();
    ui.showMenu();
    resetWorld();
    if (boss) { boss.dispose(); boss = null; }
  }

  /* ─────────────── scénarios de capture ─────────────── */

  function applySnap(name) {
    state.snap = name;
    if (!name || name === "menu") return;
    state.nightDur = 480;
    startGame({ keepLock: true });
    input.setEnabled(false);
    ui.setLockHint(false);

    function snapWeapon(index, mag, reserve) {
      player.unlockWeapon(player.weapons[index].def.id);
      player.selectWeapon(index);
      const w = player.weapons[index];
      w.mag = mag;
      player.reserves[w.def.ammo] = reserve;
      player.syncState();
    }

    if (name === "wave3") {
      state.nightT = (1.35 / NIGHT_HOURS) * state.nightDur;
      state.clockHour = 23.35;
      state.clockLabel = clockLabel(23.35);
      state.office = officeName(23.35);
      state.wave = 3;
      state.waveState = "inprogress";
      state.pending = 4;
      player.teleport(0.9, 31.5, 0.035, 0.015);
      const spots = [
        [-1.8, 21.0], [2.6, 19.4], [-4.4, 18.2], [5.2, 16.8], [-6.6, 15.2],
        [7.0, 14.0], [-2.8, 12.8], [3.6, 11.0],
      ];
      for (const [x, z] of spots) {
        const zz = createZombie({
          scene, x, z, type: "walker",
          difficulty: 1.24, seed: Math.floor(rng() * 9999), groundAt: player.groundAt,
        });
        zz.rising = false;
        zz.rise = 1.2;
        zz.pos.y = player.groundAt(x, z);
        zz.group.position.y = zz.pos.y;
        enemies.push(zz);
      }
      // un coureur et un zélateur pour les silhouettes
      const r1 = createZombie({ scene, x: -2.6, z: 8.5, type: "runner", difficulty: 1.24, seed: 4242, groundAt: player.groundAt });
      r1.rising = false; r1.pos.y = 0.35; r1.group.position.y = 0.35;
      enemies.push(r1);
      const zl = createZombie({ scene, x: 2.3, z: 10.2, type: "zealot", difficulty: 1.24, seed: 777, groundAt: player.groundAt });
      zl.rising = false; zl.pos.y = 0.35; zl.group.position.y = 0.35; zl.atkCd = 99;
      enemies.push(zl);
      for (const e of enemies) {
        e.phase = Math.random() * 6;
        e.mode = "walk";
      }
      snapWeapon(0, 7, 84);
      state.freeze = true;
      pushHud({
        hp: 78, maxHp: 100, stamina: 62, ammo: 7, reserve: 84, reloading: false,
        wave: 3, waveLeft: 9, clock: state.clockLabel, clockRatio: state.nightT / state.nightDur,
        office: state.office, boss: null, objective: "Tenir jusqu'à l'aube", flasks: 1, danger: 0.22, hurt: 0,
        weaponName: player.state.weaponName, weaponIndex: 0, ammoLabel: player.state.ammoLabel,
        reserves: player.reserves, inventory: loot.inventory, prompt: null, scope: 0,
      });
    }

    if (name === "emerge") {
      // trois morts figés à trois instants de la sortie de terre
      state.nightT = (0.5 / NIGHT_HOURS) * state.nightDur;
      state.clockLabel = clockLabel(22.5);
      state.office = officeName(22.5);
      state.wave = 2;
      state.waveState = "inprogress";
      state.pending = 0;
      player.teleport(0.4, 28.6, 0.02, -0.10);
      player.state.hp = 92;
      const specs = [
        { x: -1.9, z: 25.4, k: 0.26, type: "walker", seed: 91 },
        { x: 1.1, z: 24.2, k: 0.56, type: "walker", seed: 47 },
        { x: 3.4, z: 26.6, k: 0.86, type: "runner", seed: 12 },
      ];
      const ctx = { player, colliders, enemies, time: 1, audio, fx, camYaw: player.state.yaw, shake: () => {} };
      for (const s of specs) {
        const zz = createZombie({
          scene, x: s.x, z: s.z, type: s.type, difficulty: 1, seed: s.seed, groundAt: player.groundAt,
        });
        zz.emerge.delay = 0;
        zz.emerge.dur = 2.0;
        const steps = Math.round(s.k * 2.0 * 60);
        for (let i = 0; i < steps; i++) zz.update(1 / 60, ctx);
        enemies.push(zz);
      }
      snapWeapon(0, 12, 84);
      state.freeze = true;
      pushHud({
        hp: 92, maxHp: 100, stamina: 70, ammo: 12, reserve: 84, reloading: false,
        wave: 2, waveLeft: 3, clock: state.clockLabel, clockRatio: state.nightT / state.nightDur,
        office: state.office, boss: null, objective: "Tenir jusqu'à l'aube", flasks: 0, danger: 0.08, hurt: 0,
        weaponName: player.state.weaponName, weaponIndex: 0, ammoLabel: player.state.ammoLabel,
        reserves: player.reserves, inventory: loot.inventory, prompt: null, scope: 0,
      });
    }

    if (name === "bossclose") {
      // portrait du boss : à quatre mètres, sans HUD (capture --clean)
      state.nightT = (4.1 / NIGHT_HOURS) * state.nightDur;
      state.clockLabel = clockLabel(26.1);
      state.office = officeName(26.1);
      state.wave = 9;
      triggerBoss();
      // scène figée : aucune vague suivante ne doit remplacer le boss capturé
      state.waveState = "intermission";
      state.intermission = 999;
      boss.hp = boss.maxHp * 0.42;
      boss.phase = 2;
      boss.pos.set(0, 0.35, -6.0);
      boss.group.position.copy(boss.pos);
      boss.group.rotation.y = 0;
      boss.mode = "idle";
      boss.atkCd = 999;
      boss.sigilOn = 1;
      boss.slamT = 0;
      player.teleport(0.7, -1.9, 0.02, 0.06);
      player.state.hp = 88;
      snapWeapon(4, 5, 30);
      state.freeze = true;
      pushHud({
        hp: 88, maxHp: 100, stamina: 90, ammo: 5, reserve: 30, reloading: false,
        wave: 9, waveLeft: 2, clock: state.clockLabel, clockRatio: state.nightT / state.nightDur,
        office: state.office, boss: { hp: boss.hp, maxHp: boss.maxHp, phase: 2 },
        objective: "Abattre l'Officiant dans la nef", flasks: 2, danger: 0.12, hurt: 0,
        weaponName: player.state.weaponName, weaponIndex: 4, ammoLabel: player.state.ammoLabel,
        reserves: player.reserves, inventory: loot.inventory, prompt: null, scope: 0,
      });
    }

    if (name === "boss") {
      state.nightT = (4.1 / NIGHT_HOURS) * state.nightDur;
      state.clockHour = 2.1;
      state.clockLabel = clockLabel(26.1);
      state.office = officeName(26.1);
      state.wave = 9;
      triggerBoss();
      state.waveState = "intermission";
      state.intermission = 999;
      boss.hp = boss.maxHp * 0.58;
      boss.phase = 2;
      boss.pos.set(0, 0.35, -6.0);
      boss.group.position.copy(boss.pos);
      boss.group.rotation.y = 0;
      boss.mode = "idle";
      boss.atkCd = 999;
      player.teleport(0.4, 5.2, 0, 0.05);
      player.state.hp = 64;
      snapWeapon(4, 5, 30);
      state.flasks = 1;
      state.freeze = true;
      // deux fidèles dans la nef
      for (const [x, z, t] of [[-3.2, 2.0, "walker"], [3.0, -1.8, "runner"]]) {
        const zz = createZombie({ scene, x, z, type: t, difficulty: 1.8, seed: Math.floor(rng() * 9999), groundAt: player.groundAt });
        zz.rising = false; zz.pos.y = 0.35; zz.group.position.y = 0.35;
        enemies.push(zz);
      }
      pushHud({
        hp: 64, maxHp: 100, stamina: 88, ammo: 5, reserve: 30, reloading: false,
        wave: 9, waveLeft: 3, clock: state.clockLabel, clockRatio: state.nightT / state.nightDur,
        office: state.office, boss: { hp: boss.hp, maxHp: boss.maxHp, phase: 2 },
        objective: "Abattre l'Officiant dans la nef", flasks: 1, danger: 0.36, hurt: 0,
        weaponName: player.state.weaponName, weaponIndex: 4, ammoLabel: player.state.ammoLabel,
        reserves: player.reserves, inventory: loot.inventory, prompt: null, scope: 0,
      });
    }

    if (name === "dawn") {
      state.nightT = state.nightDur * 0.985;
      state.clockHour = 29.9;
      state.clockLabel = clockLabel(29.9);
      state.office = "Aube";
      state.wave = 12;
      state.bossSpawned = true;
      state.bossDead = true;
      state.bossKilled = true;
      state.kills = 147;
      applyDawn(1);
      player.teleport(7.5, 25, 0.24, -0.01);
      player.state.hp = 41;
      snapWeapon(3, 3, 12);
      state.freeze = true;
      pushHud({
        hp: 41, maxHp: 100, stamina: 40, ammo: 3, reserve: 12, reloading: false,
        wave: 12, waveLeft: 0, clock: state.clockLabel, clockRatio: 0.985,
        office: "Aube", boss: null, objective: "L'aube se lève", flasks: 0, danger: 0.59, hurt: 0,
        weaponName: player.state.weaponName, weaponIndex: 3, ammoLabel: player.state.ammoLabel,
        reserves: player.reserves, inventory: loot.inventory, prompt: null, scope: 0,
      });
      ui.announce("06:00 · L'aube", "Le Vigile a tenu", 9000);
    }

    if (name === "arsenal" || name === "loot") {
      state.nightT = (2.4 / NIGHT_HOURS) * state.nightDur;
      state.clockHour = 24.4;
      state.clockLabel = clockLabel(24.4);
      state.office = officeName(24.4);
      state.wave = 7;
      state.waveState = "inprogress";
      state.pending = 0;
      state.flasks = 2;
      loot.inventory.medkits = 2;
      loot.inventory.keys = 3;
      loot.inventory.lanterns = 2;
      player.addAmmo("9mm", 40);
      player.addAmmo("5.56", 60);
      player.addAmmo(".308", 9);
      player.addAmmo("12", 12);

      if (name === "arsenal") {
        player.teleport(0.8, 30.5, 0.02, -0.2);
        player.unlockAll();
        const ids = ["ammo9", "ammo556", "ammo308", "ammo12", "medkit", "vial", "key", "lantern", "revolver", "sniper"];
        ids.forEach((id, i) => {
          const a = -1.1 + (i / (ids.length - 1)) * 2.2;
          const r = 1.9 + (i % 3) * 0.55;
          loot.spawnAt(id, player.pos.x + Math.sin(a) * r, player.pos.z - Math.cos(a) * r);
        });
        const chest = loot.spawnCache("coffre", player.pos.x + 2.6, player.pos.z - 5.2, {
          wave: 7, loot: ["ammo308", "ammo556", "medkit", "key", "vial"],
        });
        if (chest) loot.openCache(chest);
        loot.inventory.keys = 2;
      } else {
        let best = loot.caches[0];
        for (const c of loot.caches) {
          if (Math.hypot(c.x + 16.5, c.z + 8.5) < Math.hypot(best.x + 16.5, best.z + 8.5)) best = c;
        }
        const px = best.x + 2.4, pz = best.z + 2.4;
        const yaw = Math.atan2(-(best.x - px), -(best.z - pz));
        player.teleport(px, pz, yaw, -0.24);
        loot.spawnAt("ammo9", px - 1.0, pz - 0.5);
        loot.spawnAt("medkit", px + 0.4, pz - 1.3);
        loot.spawnAt("lantern", px - 0.2, pz + 0.9);
      }
      state.freeze = true;
      loot.update(0.016, player.pos.x, player.pos.z);
      pushHud({
        hp: 74, maxHp: 100, stamina: 68, ammo: player.state.ammo, reserve: player.state.reserve,
        reloading: false, wave: 7, waveLeft: 6, clock: state.clockLabel,
        clockRatio: state.nightT / state.nightDur, office: state.office, boss: null,
        objective: "Tenir jusqu'à l'aube", flasks: 2, danger: 0.26, hurt: 0,
        weaponName: player.state.weaponName, weaponIndex: player.state.weaponIndex,
        ammoLabel: player.state.ammoLabel, reserves: player.reserves,
        inventory: loot.inventory, prompt: loot.prompt, scope: 0,
      });
    }

    if (name === "perf") {
      state.nightT = (2.2 / NIGHT_HOURS) * state.nightDur;
      state.clockLabel = clockLabel(24.2);
      state.office = officeName(24.2);
      state.wave = 8;
      state.waveState = "inprogress";
      state.pending = 0;
      player.state.god = true;
      player.teleport(0.5, 22, 0.02, 0);
      state.freeze = false;
      input.setEnabled(false);
      for (let i = 0; i < 26; i++) {
        const a = (i / 26) * Math.PI * 2 + 0.3;
        const r = 13 + (i % 5) * 2.6;
        const type = i % 9 === 0 ? "brute" : i % 4 === 0 ? "runner" : "walker";
        const zz = createZombie({
          scene, x: Math.cos(a) * r, z: Math.sin(a) * r - 2,
          type, difficulty: 1.8, seed: 1000 + i * 37, groundAt: player.groundAt,
        });
        zz.rising = false;
        zz.rise = 1.2;
        zz.pos.y = player.groundAt(zz.pos.x, zz.pos.z);
        zz.group.position.y = zz.pos.y;
        enemies.push(zz);
      }
    }

    if (name === "nave") {
      state.nightT = (3.2 / NIGHT_HOURS) * state.nightDur;
      state.clockLabel = clockLabel(27.2);
      state.office = officeName(27.2);
      state.wave = 7;
      state.bossSpawned = true;
      state.bossDead = true;
      player.teleport(-1.2, 9.5, 0.16, 0.02);
      player.state.hp = 92;
      state.freeze = true;
      state.kills = 61;
      pushHud({
        hp: 92, maxHp: 100, stamina: 74, ammo: 12, reserve: 60, reloading: false,
        wave: 7, waveLeft: 0, clock: state.clockLabel, clockRatio: state.nightT / state.nightDur,
        office: state.office, boss: null, objective: "Tenir jusqu'à l'aube", flasks: 2, danger: 0.08, hurt: 0,
        weaponName: player.state.weaponName, weaponIndex: 0, ammoLabel: player.state.ammoLabel,
        reserves: player.reserves, inventory: loot.inventory, prompt: null, scope: 0,
      });
    }
  }

  /* ─────────────── diagnostic ─────────────── */

  const fpsSamples = [];
  let frameCount = 0;

  function diag() {
    const al = enemies.filter((e) => e.alive).length;
    return {
      ready: true,
      state: state.mode,
      snap: state.snap,
      fps: Math.round(state.fpsAvg || 0),
      fpsAvg: Math.round(state.fpsAvg || 0),
      fpsMin: Math.round(state.fpsMin || 0),
      errors: (window.__errors || []).length,
      pos: { x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(2) },
      camera: { x: +camera.position.x.toFixed(2), y: +camera.position.y.toFixed(2), z: +camera.position.z.toFixed(2) },
      yaw: +player.state.yaw.toFixed(3),
      pitch: +player.state.pitch.toFixed(3),
      hp: Math.round(player.state.hp),
      ammo: player.state.ammo,
      reserve: player.state.reserve,
      reloading: player.state.reloading,
      weapon: {
        id: player.state.weaponId,
        name: player.state.weaponName,
        ammo: player.state.ammoType,
        index: player.state.weaponIndex,
        mag: player.state.ammo,
        magSize: player.state.magSize,
        reserves: { ...player.reserves },
        owned: player.weaponSlots().filter((w) => w.owned).map((w) => w.id),
        locked: player.weaponSlots().filter((w) => !w.owned).map((w) => w.id),
        muzzle: player.muzzleScreen(),
      },
      music: audio.musicState,
      loot: {
        items: loot.itemCount,
        caches: loot.cacheCount,
        opened: loot.openedCount,
        picked: loot.inventory.picked,
        keys: loot.inventory.keys,
        medkits: loot.inventory.medkits,
        lanterns: loot.inventory.lanterns,
        prompt: loot.prompt ? loot.prompt.text : null,
      },
      wave: state.wave,
      waveState: state.waveState,
      wavePlan: state.planName,
      graves: { alive: landscape.gravesAlive, broken: state.graveBroken },
      graveDebt: state.graveDebt,
      bossesKilled: state.bossesKilled,
      bossVariant: state.bossVariant,
      alive: al,
      byType: { ...state.killsByType },
      zealots: enemies.filter((e) => e.alive && e.type === "zealot").length,
      bolts: enemies.reduce((n, e) => n + (e.boltCount || 0), 0),
      pending: state.pending,
      boss: boss ? { alive: boss.alive, hp: Math.round(boss.hp), maxHp: Math.round(boss.maxHp), phase: boss.phase, mode: boss.mode } : null,
      bossSpawned: state.bossSpawned,
      bossDead: state.bossDead,
      victory: state.victory,
      kills: state.kills,
      clock: state.clockLabel,
      nightT: +state.nightT.toFixed(1),
      dawn: +state.dawnK.toFixed(2),
      quality: settings.quality,
      blessing: state.blessing ? state.blessing.cards.map((c) => c.id) : null,
      intro: !!state.intro,
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      audio: audio.state,
      freeze: state.freeze,
    };
  }

  function trackFps(fps) {
    fpsSamples.push(fps);
    if (fpsSamples.length > 180) fpsSamples.shift();
    let sum = 0, min = 1e9;
    for (const f of fpsSamples) { sum += f; min = Math.min(min, f); }
    state.fpsAvg = sum / fpsSamples.length;
    state.fpsMin = min;
  }

  return {
    state, player, chapel, landscape, village, sky, volumetrics, fx, loot, citizens, boss: () => boss,
    // essai : force N apparitions et renvoie les types tirés (test du niveau)
    rollTypes(n = 20) {
      const out = [];
      const keep = enemies.slice();
      try {
        for (let i = 0; i < n; i++) {
          const before = enemies.length;
          spawnOne();
          if (enemies.length > before) out.push(enemies[enemies.length - 1].type);
        }
      } finally { /* rien */ }
      return out;
    },
    enemies, colliders, moon, hemi, ambient,
    update, startGame, pause, resume, quit, continueNight, applySnap, diag, trackFps,
    canAutoPause, desiredMusic,
    planInfo: (n) => {
      const p = planFor(n);
      return { name: p.name, mix: { ...p.mix }, size: p.size, boss: !!p.boss };
    },
    waveSize, difficulty, bossVariantForWave, pauseObjectives,
    spawnVial, spawnAmmo,
    achievements,
    offerBlessing,
    openInventory, closeInventory, toggleInventory, useActiveItem, inventoryModel,
    get bossRef() { return boss; },
    setMode(m) { state.mode = m; },
    setBoss(b) { boss = b; },
    endGame,
    triggerBoss,
    debugSpawn(type, x, z) {
      const zz = createZombie({ scene, x, z, type, difficulty: difficulty(state.wave || 1), seed: Math.floor(rng() * 99999), groundAt: player.groundAt });
      zz.rising = false; zz.pos.y = player.groundAt(x, z); zz.group.position.y = zz.pos.y;
      enemies.push(zz);
      return zz;
    },
  };
}
