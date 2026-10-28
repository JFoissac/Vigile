// ui.js — menus, HUD, réglages, pause, écran de fin.
// Le HUD est en DOM (texte net) ; les mises à jour sont différées et limitées.

import { fmtDuration, roman, clamp, lerp } from "../core/util.js";

const DEFAULTS = { sensitivity: 1.0, volume: 0.72, fov: 68, quality: "high", invertY: false };
const STORE_KEY = "vigile.settings.v2";

export function createUI({ settings, onChange, onStart, onResume, onQuit, onRestart, onContinue, onMenu, onToggleSound, isMuted, onAchievements, onLevel }) {
  const $ = (id) => document.getElementById(id);
  const els = {
    menu: $("menu"), hud: $("hud"), pause: $("pause"), end: $("end"), loading: $("loading"),
    loadFill: $("load-fill"), loadLabel: $("load-label"), fade: $("fade"),
    settingsPanel: $("settings-panel"), controlsPanel: $("controls-panel"),
    settingsRows: $("settings-rows"), pauseSettings: $("pause-settings"),
    hpFill: $("hp-fill"), hpNum: $("hp-num"), hpMax: $("hp-max"), stamFill: $("stam-fill"),
    ammo: $("ammo"), ammoRes: $("ammo-res"), reload: $("reload"),
    ammoPanel: $("hud-ammo"), ammoPips: $("ammo-pips"), ammoMags: $("ammo-mags"), ammoMagsLabel: $("ammo-mags-label"),
    ammoAlert: $("ammo-alert"), ammoAlertN: $("ammo-alert-n"), ammoAlertT: $("ammo-alert-t"),
    radar: $("radar"), radarBlips: $("radar-blips"), radarCount: $("radar-count"),
    radarTotal: $("radar-total"), radarNorth: $("radar-north"),
    weapon: $("weapon"), ammoType: $("ammo-type"), weaponSlots: $("weapon-slots"),
    inv9: $("inv-9mm"), inv12: $("inv-12"), inv556: $("inv-556"), inv308: $("inv-308"), inv40: $("inv-40mm"),
    invMedkits: $("inv-medkits"), invKeys: $("inv-keys"), invLanterns: $("inv-lanterns"),
    lootPrompt: $("loot-prompt"), lootText: $("loot-text"), lootKey: $("loot-key"),
    scope: $("scope"),
    waveNum: $("wave-num"), waveLeft: $("wave-left"), citCount: $("cit-count"), clock: $("clock"), clockFill: $("clock-fill"),
    phase: $("phase"), objective: $("objective"), bossbar: $("bossbar"),
    bossFill: $("boss-fill"), bossPhase: $("boss-phase"), bossName: $("boss-name"), bossHp: $("boss-hp"),
    crosshair: $("crosshair"), hitmarker: $("hitmarker"), dmg: $("dmg-dir"),
    threatArrow: $("threat-arrow"),
    announce: $("announce"), annKicker: $("ann-kicker"), annTitle: $("ann-title"),
    toast: $("toast"), bleed: $("bleed"), lockHint: $("lock-hint"),
    flask: $("flask"), flaskNum: $("flask-num"),
    endOverline: $("end-overline"), endVerdict: $("end-verdict"), endLine: $("end-line"),
    endStats: $("end-stats"), endQuote: $("end-quote"), pauseClock: $("pause-clock"),
    pauseObjectives: $("pause-objectives"),
    hpBar: document.querySelector(".bar.hp"),
    sound: $("btn-sound"), soundLabel: $("sound-label"),
    succPanel: $("succes-panel"), succList: $("succes-list"), succCount: $("succes-count"), succBadge: $("succes-badge"),
    blessings: $("blessings"), blessingCards: $("blessing-cards"),
    succesToast: $("succes-toast"), stName: $("st-name"), stDesc: $("st-desc"),
    inventory: $("inventory"), invList: $("inv-list"), invWeapons: $("inv-weapons"), invClock: $("inv-clock"),
    invWeaponsNote: $("inv-weapons-note"),
    activeItem: $("active-item"), activeName: $("active-name"),
    lootPopup: $("loot-popup"), lpTitle: $("lp-title"), lpItems: $("lp-items"),
  };

  let last = {};
  let annTimer = 0;
  let toastTimer = 0;
  let hitTimer = 0;
  let dmgTimer = 0;
  let menuVisible = true;
  let endContinue = false;   // l'aube : « prolonger la nuit » plutôt que recommencer

  /* ───────────── réglages ───────────── */

  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) Object.assign(settings, DEFAULTS, JSON.parse(raw));
    } catch (e) { /* stockage indisponible */ }
  }
  loadSettings();

  function saveSettings() {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(settings));
    } catch (e) { /* rien */ }
  }

  const rowRefs = [];

  const fmt = {
    sensitivity: (v) => `× ${Number(v).toFixed(2)}`,
    volume: (v) => `${Math.round(v * 100)} %`,
    fov: (v) => `${Math.round(v)}°`,
    quality: (v) => ({ low: "Basse", medium: "Moyenne", high: "Haute" }[v] || v),
    invertY: (v) => (v ? "Oui" : "Non"),
  };

  function buildRow(container, def) {
    const row = document.createElement("div");
    row.className = "row";
    const label = document.createElement("span");
    label.className = "row-label";
    label.textContent = def.label;
    row.appendChild(label);

    if (def.type === "seg") {
      const seg = document.createElement("div");
      seg.className = "row-seg";
      const buttons = [];
      for (const opt of def.options) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = opt.label;
        b.addEventListener("click", () => {
          settings[def.key] = opt.value;
          syncRows();
          saveSettings();
          onChange(def.key, opt.value);
        });
        seg.appendChild(b);
        buttons.push({ btn: b, value: opt.value });
      }
      row.appendChild(seg);
      rowRefs.push({ def, seg: buttons });
    } else {
      const input = document.createElement("input");
      input.type = "range";
      input.min = def.min;
      input.max = def.max;
      input.step = def.step;
      input.setAttribute("aria-label", def.label);
      const val = document.createElement("span");
      val.className = "row-value";
      input.addEventListener("input", () => {
        settings[def.key] = Number(input.value);
        val.textContent = fmt[def.key](settings[def.key]);
        onChange(def.key, settings[def.key]);
      });
      input.addEventListener("change", saveSettings);
      row.appendChild(input);
      row.appendChild(val);
      rowRefs.push({ def, input, val });
    }
    container.appendChild(row);
  }

  const DEFS = [
    { key: "sensitivity", label: "Sensibilité", type: "range", min: 0.25, max: 2.2, step: 0.05 },
    { key: "volume", label: "Volume", type: "range", min: 0, max: 1, step: 0.01 },
    { key: "fov", label: "Champ de vision", type: "range", min: 60, max: 95, step: 1 },
    {
      key: "quality", label: "Qualité", type: "seg",
      options: [{ label: "Basse", value: "low" }, { label: "Moyenne", value: "medium" }, { label: "Haute", value: "high" }],
    },
    {
      key: "invertY", label: "Inverser l'axe vertical", type: "seg",
      options: [{ label: "Non", value: false }, { label: "Oui", value: true }],
    },
  ];

  for (const def of DEFS) buildRow(els.settingsRows, def);
  for (const def of DEFS) buildRow(els.pauseSettings, def);

  function syncRows() {
    for (const ref of rowRefs) {
      const key = ref.def.key;
      if (ref.seg) {
        for (const b of ref.seg) b.btn.setAttribute("aria-pressed", String(b.value === settings[key]));
      } else {
        ref.input.value = settings[key];
        ref.val.textContent = fmt[key](settings[key]);
      }
    }
  }
  syncRows();

  function resetSettings() {
    Object.assign(settings, DEFAULTS);
    syncRows();
    saveSettings();
    for (const def of DEFS) onChange(def.key, settings[def.key]);
  }

  /* ───────────── navigation ───────────── */

  function closePanels() {
    els.settingsPanel.hidden = true;
    els.controlsPanel.hidden = true;
    els.succPanel.hidden = true;
  }

  /* Sélection des boutons : une seule option marquée (souris, focus ou clavier). */
  function createNav(selector) {
    const items = () => [...document.querySelectorAll(selector)];
    let idx = 0;
    const api = {
      select(i, focus = false) {
        const list = items();
        if (!list.length) return;
        idx = ((i % list.length) + list.length) % list.length;
        list.forEach((b, k) => b.classList.toggle("is-sel", k === idx));
        if (focus) list[idx].focus({ preventScroll: true });
      },
      move(d) { api.select(idx + d, true); },
      activate() { const list = items(); if (list[idx]) list[idx].click(); },
      get index() { return idx; },
    };
    items().forEach((b, k) => {
      b.addEventListener("mouseenter", () => api.select(k));
      b.addEventListener("focus", () => api.select(k));
    });
    return api;
  }

  const navMenu = createNav(".menu-nav .btn");
  const navPause = createNav(".pause-nav .btn");
  const navEnd = createNav(".end-actions .btn");
  const navBlessing = createNav(".blessing-cards .blessing-card");

  $("btn-settings").addEventListener("click", () => {
    els.controlsPanel.hidden = true;
    els.succPanel.hidden = true;
    els.settingsPanel.hidden = !els.settingsPanel.hidden;
  });
  $("btn-controls").addEventListener("click", () => {
    els.settingsPanel.hidden = true;
    els.succPanel.hidden = true;
    els.controlsPanel.hidden = !els.controlsPanel.hidden;
  });
  $("btn-achievements").addEventListener("click", () => {
    els.settingsPanel.hidden = true;
    els.controlsPanel.hidden = true;
    const open = els.succPanel.hidden;
    els.succPanel.hidden = !open;
    if (open) {
      navMenu.select(3, true);
      if (onAchievements) renderAchievements(onAchievements());
    }
  });
  document.querySelectorAll("[data-close]").forEach((b) => {
    b.addEventListener("click", () => { $(b.dataset.close).hidden = true; });
  });
  $("btn-settings-defaults").addEventListener("click", resetSettings);
  $("btn-pause-defaults").addEventListener("click", resetSettings);

  els.sound.addEventListener("click", () => {
    if (onToggleSound) onToggleSound();
  });

  // ── choix du terrain ─────────────────────────────────────────────────────
  const LEVEL_TEXT = {
    chapelle: { overline: "Chapelle Saint-Ours", desc: "Les morts montent par les tombes, un à un." },
    village: { overline: "Place du village", desc: "Des ruelles, six habitants, et des loups-garous." },
  };
  function setLevel(id) {
    const t = LEVEL_TEXT[id] || LEVEL_TEXT.chapelle;
    for (const b of document.querySelectorAll(".lvl")) {
      b.classList.toggle("is-on", b.dataset.level === id);
      b.setAttribute("aria-pressed", b.dataset.level === id ? "true" : "false");
    }
    const ov = $("menu-overline");
    if (ov) ov.innerHTML = `${t.overline} <span class="dot">·</span> Nuit du 2 novembre`;
    const d = $("lvl-desc");
    if (d) d.textContent = t.desc;
  }
  for (const b of document.querySelectorAll(".lvl")) {
    b.addEventListener("click", () => {
      setLevel(b.dataset.level);
      if (onLevel) onLevel(b.dataset.level);
    });
  }

  $("btn-start").addEventListener("click", () => { onStart(); });
  $("btn-resume").addEventListener("click", () => { onResume(); });
  $("btn-quit").addEventListener("click", () => { onQuit(); });
  $("btn-again").addEventListener("click", () => { (endContinue && onContinue ? onContinue : onRestart)(); });
  $("btn-menu").addEventListener("click", () => { onMenu(); });

  window.addEventListener("keydown", (e) => {
    // inventaire ouvert : flèches / Entrée / chiffres / I / Échap
    if (els.inventory && !els.inventory.hidden && inventoryKey(e)) return;
    // bénédiction : 1/2/3, flèches + Entrée, Échap pour refuser
    if (blessingPick && !els.blessings.hidden) {
      if (e.code === "Digit1" || e.code === "Numpad1") { e.preventDefault(); pickBlessing(0); return; }
      if (e.code === "Digit2" || e.code === "Numpad2") { e.preventDefault(); pickBlessing(1); return; }
      if (e.code === "Digit3" || e.code === "Numpad3") { e.preventDefault(); pickBlessing(2); return; }
      if (e.code === "ArrowRight" || e.code === "ArrowDown") { e.preventDefault(); navBlessing.move(1); return; }
      if (e.code === "ArrowLeft" || e.code === "ArrowUp") { e.preventDefault(); navBlessing.move(-1); return; }
      if (e.code === "Enter" || e.code === "NumpadEnter") { e.preventDefault(); pickBlessing(navBlessing.index); return; }
      if (e.code === "Escape") { e.preventDefault(); pickBlessing(-1); return; }
    }
    const menuActive = menuVisible && !els.menu.hidden && els.settingsPanel.hidden && els.controlsPanel.hidden && els.succPanel.hidden;
    if (menuActive) {
      if (e.code === "ArrowDown") { e.preventDefault(); navMenu.move(1); return; }
      if (e.code === "ArrowUp") { e.preventDefault(); navMenu.move(-1); return; }
      if (e.code === "Enter" || e.code === "NumpadEnter") { e.preventDefault(); navMenu.activate(); return; }
    }
    if (e.code === "Escape" && (!els.settingsPanel.hidden || !els.controlsPanel.hidden || !els.succPanel.hidden)) {
      closePanels();
      navMenu.select(navMenu.index);
    }
  });

  /* ───────────── succès & bénédictions ───────────── */

  function renderAchievements(list) {
    if (!els.succList || !Array.isArray(list)) return;
    const done = list.filter((a) => a.unlocked).length;
    els.succCount.textContent = `${done} / ${list.length}`;
    if (els.succBadge) els.succBadge.textContent = `${done}/${list.length}`;
    const rank = { bronze: "I", argent: "II", or: "III" };
    els.succList.innerHTML = list.map((a) => {
      const pct = Math.round((a.progress.n / Math.max(1, a.progress.goal)) * 100);
      return `<li class="succes ${a.unlocked ? "on" : ""} tier-${a.tier}">
        <span class="su-ico" aria-hidden="true">${a.unlocked ? "✦" : rank[a.tier] || "·"}</span>
        <div class="su-body">
          <b>${a.name}</b>
          <span class="su-desc">${a.desc}</span>
          <span class="su-prog"><i style="width:${pct}%"></i></span>
        </div>
        <span class="su-n">${a.unlocked ? "acquis" : `${a.progress.n}/${a.progress.goal}`}</span>
      </li>`;
    }).join("");
  }

  let blessingPick = null;
  let succesTimer = 0;
  let invModel = null;
  let invPick = null;
  let invClose = null;
  let invPickWeapon = null;
  let invIndex = 0;
  let weaponSlotsSig = "";

  /* ─── inventaire (I) : l'objet actif s'utilise au clic droit ─── */

  function renderInventory(model) {
    if (!els.invList) return;
    invModel = model;
    els.invClock.textContent = model.clock || "22:00";
    els.invList.innerHTML = model.items.map((it, i) => `
      <li class="inv-row ${it.id === model.active ? "on" : ""} ${it.count > 0 || it.infinite ? "" : "empty"}" data-index="${i}">
        <span class="ir-ico" aria-hidden="true">${it.icon || "·"}</span>
        <span class="ir-name">${it.name}<span class="ir-desc">${it.desc}</span></span>
        <span class="ir-count">${it.infinite ? "∞" : it.count}${it.unit ? `<small>${it.unit}</small>` : ""}</span>
      </li>`).join("");
    for (const row of els.invList.querySelectorAll(".inv-row")) {
      const i = Number(row.dataset.index);
      row.addEventListener("click", () => pickInventory(i));
      row.addEventListener("mouseenter", () => selectInventory(i, false));
    }
    els.invWeapons.innerHTML = (model.weapons || []).map((w) => {
      const st = w.stats || {};
      const pips = "●".repeat(Math.max(0, st.power || 1)) + "○".repeat(Math.max(0, 4 - (st.power || 1)));
      return `<li class="inv-weapon ${w.active ? "on" : ""}" data-index="${w.index}" data-id="${w.id}">
        <span class="iw-key">${w.slot}</span>
        <span class="iw-body">
          <b>${w.name}</b>
          <span class="iw-stats">${st.melee ? "lame" : `${st.ammo} · ${st.damage} dégâts`} · tête ×${st.headMul}</span>
          <span class="iw-meta">puissance <em>${pips}</em> · abattage tête <b>${Math.round((st.headChance || 0) * 100)} %</b></span>
        </span>
        <span class="iw-ammo">${w.ammo}</span>
      </li>`;
    }).join("");
    for (const row of els.invWeapons.querySelectorAll(".inv-weapon")) {
      row.addEventListener("click", () => {
        if (!invPickWeapon) return;
        invPickWeapon(row.dataset.id);
      });
    }
    if (els.invWeaponsNote) {
      els.invWeaponsNote.textContent = model.lockedWeapons > 0
        ? `${model.lockedWeapons} arme${model.lockedWeapons > 1 ? "s" : ""} encore à trouver dans la lande, les caisses et les coffres.`
        : "Toutes les armes de la veille sont à vous.";
    }
    const activeIdx = model.items.findIndex((it) => it.id === model.active);
    if (activeIdx >= 0) invIndex = activeIdx;
  }

  /** Cases d'armes du HUD : seulement les armes possédées. */
  function renderWeaponSlots(list) {
    if (!els.weaponSlots || !Array.isArray(list)) return;
    const owned = list.filter((w) => w.owned);
    const sig = owned.map((w) => `${w.slot}${w.id}${w.active ? "a" : ""}`).join("|");
    if (sig === weaponSlotsSig) return;
    weaponSlotsSig = sig;
    els.weaponSlots.innerHTML = owned.map((w) => `
      <span class="slot ${w.active ? "on" : ""}" data-slot="${w.slot}"><b>${w.slot}</b><i>${w.short}</i></span>`).join("");
  }

  function selectInventory(i, redraw = true) {
    if (!invModel || !invModel.items.length) return;
    invIndex = ((i % invModel.items.length) + invModel.items.length) % invModel.items.length;
    if (redraw) {
      const rows = [...els.invList.querySelectorAll(".inv-row")];
      rows.forEach((r, k) => r.classList.toggle("on", k === invIndex));
    }
  }

  function pickInventory(i) {
    if (!invModel || !invPick) return;
    const item = invModel.items[i];
    if (!item) return;
    invIndex = i;
    const next = invPick(item.id);
    if (next !== undefined) {
      invModel.active = next;
      renderInventory(invModel);
    }
  }

  function showInventory(model, onPick, onClose, onPickWeapon) {
    if (!els.inventory) return;
    invPick = onPick;
    invClose = onClose;
    invPickWeapon = onPickWeapon || null;
    renderInventory(model);
    els.inventory.hidden = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  function hideInventory() {
    if (els.inventory) els.inventory.hidden = true;
    invPick = null;
    invClose = null;
    invPickWeapon = null;
  }

  function refreshInventory(model) {
    if (!els.inventory || els.inventory.hidden) return;
    renderInventory(model);
  }

  function inventoryKey(e) {
    if (!invModel) return false;
    if (e.code === "ArrowDown") { e.preventDefault(); selectInventory(invIndex + 1); return true; }
    if (e.code === "ArrowUp") { e.preventDefault(); selectInventory(invIndex - 1); return true; }
    if (e.code === "Enter" || e.code === "NumpadEnter") { e.preventDefault(); pickInventory(invIndex); return true; }
    if (/^Digit[1-9]$/.test(e.code)) {
      const n = Number(e.code.slice(5)) - 1;
      if (n < invModel.items.length) { e.preventDefault(); pickInventory(n); return true; }
    }
    if (e.code === "Escape") {
      e.preventDefault();
      if (invClose) invClose();
      return true;
    }
    return false;
  }

  function showBlessings(cards, onPick) {
    if (!els.blessings) return;
    els.blessingCards.innerHTML = cards.map((c, i) => `
      <button type="button" class="blessing-card" data-index="${i}">
        <span class="bc-key">${i + 1}</span>
        <span class="bc-ico" aria-hidden="true">${c.icon || "✦"}</span>
        <b>${c.name}</b>
        <em>${c.tag || ""}</em>
        <p>${c.desc}</p>
      </button>`).join("");
    [...els.blessingCards.querySelectorAll(".blessing-card")].forEach((btn, i) => {
      btn.addEventListener("click", () => pickBlessing(i));
      btn.addEventListener("mouseenter", () => navBlessing.select(i));
    });
    blessingPick = onPick;
    els.blessings.hidden = false;
    navBlessing.select(0);
    if (document.pointerLockElement) document.exitPointerLock();
    fade(false);
  }

  function pickBlessing(index) {
    if (!blessingPick) return;
    const fn = blessingPick;
    blessingPick = null;
    els.blessings.hidden = true;
    fn(index);
  }

  function hideBlessings() {
    blessingPick = null;
    if (els.blessings) els.blessings.hidden = true;
  }

  function achievement(a) {
    if (!els.succesToast || !a) return;
    els.stName.textContent = a.name;
    els.stDesc.textContent = a.desc;
    els.succesToast.classList.add("on");
    succesTimer = 2.6;
  }

  function refreshBadge(count) {
    if (els.succBadge && count) els.succBadge.textContent = `${count.done}/${count.total}`;
  }

  /* ───────────── HUD ───────────── */

  function setText(el, v) {
    if (!el) return;
    if (last[el.id] === v) return;
    last[el.id] = v;
    el.textContent = v;
  }

  /* ───────────── radar des morts & lecture des munitions ───────────── */

  const RADAR_RANGE = 34;   // m : au-delà, le point reste collé au bord du cercle
  const radarPool = [];
  let radarAt = 0;

  /** Points des morts autour du joueur, orientés selon son regard. */
  function renderRadar(r, yaw) {
    if (!els.radar || !els.radarBlips) return;
    const now = performance.now();
    if (now - radarAt < 70) return;   // 14 Hz : assez pour suivre, pas pour coûter
    radarAt = now;
    const blips = (r && r.blips) || [];
    const cy = Math.cos(yaw || 0), sy = Math.sin(yaw || 0);

    while (radarPool.length < blips.length) {
      const s = document.createElement("span");
      s.className = "blip";
      els.radarBlips.appendChild(s);
      radarPool.push(s);
    }

    let near = 0, closest = 1e9;
    for (let i = 0; i < radarPool.length; i++) {
      const el = radarPool[i];
      const b = blips[i];
      if (!b) {
        if (el.style.display !== "none") el.style.display = "none";
        continue;
      }
      // repère tourné : +y local = devant, +x local = droite
      const dx = b.x - (r.x || 0), dz = b.z - (r.z || 0);
      const fx = dx * cy - dz * sy;
      const fy = -dx * sy - dz * cy;
      let nx = fx / RADAR_RANGE, ny = fy / RADAR_RANGE;
      const d = Math.hypot(nx, ny);
      const far = d > 0.92;
      if (far) { nx = (nx / d) * 0.92; ny = (ny / d) * 0.92; }
      if (b.d <= RADAR_RANGE) near++;
      if (b.d < closest) closest = b.d;

      el.style.display = "";
      el.className = `blip ${b.type || "walker"}${b.rising ? " rising" : ""}${far ? " far" : ""}${b.boss ? " boss" : ""}`;
      el.style.left = `${50 + nx * 46}%`;
      el.style.top = `${50 - ny * 46}%`;
    }

    if (els.radarCount) setText(els.radarCount, String(near));
    if (els.radarTotal) {
      // « debout » n'est écrit qu'une fois, dans le bloc de vague : ici on ne
      // garde que les hôtes pas encore sortis de terre.
      const pending = (r && r.pending) || 0;
      if (last.radarPending !== pending) {
        last.radarPending = pending;
        els.radarTotal.hidden = pending <= 0;
        setText(els.radarTotal, pending > 0 ? `+${pending} à venir` : "");
      }
    }
    if (els.radarNorth) {
      // nord = -Z ; dans un radar orienté « regard en haut », il tourne avec le joueur
      const nR = 0.92;
      els.radarNorth.style.left = `${50 + sy * nR * 46}%`;
      els.radarNorth.style.top = `${50 - cy * nR * 46}%`;
    }
    els.radar.classList.toggle("hot", closest < 9);
  }

  /** Flèche de direction vers le mort le plus proche (hors champ ou loin). */
  function renderThreat(t, yaw) {
    const el = els.threatArrow;
    if (!el) return;
    if (!t || t.dist < 6) {
      if (!el.hidden) el.hidden = true;
      return;
    }
    const cy = Math.cos(yaw || 0), sy = Math.sin(yaw || 0);
    // repère caméra : +fwd devant, +right à droite
    const fwd = t.dx * -sy + t.dz * -cy;
    const right = t.dx * cy + t.dz * -sy;
    const ang = Math.atan2(right, fwd) * 180 / Math.PI;
    el.hidden = false;
    el.className = `${t.type || "walker"}${t.dist > 30 ? " far" : ""}`;
    el.style.setProperty("--a", `${ang.toFixed(1)}deg`);
  }

  /** Pips du chargeur, nombre de chargeurs, alerte au ras du réticule. */
  function renderAmmo(p) {
    const melee = !!p.melee;
    const mag = Math.max(0, p.magSize || 0);
    const ammo = melee ? 0 : Math.max(0, p.ammo || 0);
    const pct = mag ? ammo / mag : 0;

    if (els.ammoPips && last.magSize !== mag) {
      last.magSize = mag;
      last.ammoVal = -1;
      els.ammoPips.innerHTML = "";
      for (let i = 0; i < mag; i++) els.ammoPips.appendChild(document.createElement("i"));
    }
    if (els.ammoPips && last.ammoVal !== ammo) {
      last.ammoVal = ammo;
      const kids = els.ammoPips.children;
      const lowPip = mag > 0 && ammo <= Math.max(1, Math.ceil(mag * 0.25));
      for (let i = 0; i < kids.length; i++) {
        kids[i].className = melee ? "" : i < ammo ? (lowPip ? "on low" : "on") : "";
      }
    }

    if (els.ammoPanel) {
      els.ammoPanel.classList.toggle("low", !melee && ammo > 0 && pct <= 0.3);
      els.ammoPanel.classList.toggle("empty", !melee && ammo === 0);
    }
    if (els.ammoMags) {
      // ceil : avec 11 balles en réserve et un chargeur de 12, on a bien UN
      // chargeur à venir (floor affichait « 0 chargeurs » alors qu'on pouvait recharger)
      const res0 = p.reserve || 0;
      const count = melee ? 0 : (res0 > 0 ? Math.max(1, Math.ceil(res0 / Math.max(1, mag))) : 0);
      const mags = melee ? "∞" : String(count);
      if (last.mags !== mags) { last.mags = mags; setText(els.ammoMags, mags); }
      // le nombre reste seul dans #ammo-mags (les tests le lisent tel quel) : l'accord
      // « 1 chargeur / 6 chargeurs » vit dans le libellé voisin
      if (els.ammoMagsLabel && last.magsLabel !== mags) {
        last.magsLabel = mags;
        els.ammoMagsLabel.textContent = melee ? "" : (count === 1 ? "chargeur" : "chargeurs");
      }
    }

    if (els.ammoAlert) {
      const urgent = !melee && ammo === 0 && !p.reloading;
      const low = !melee && ammo > 0 && ammo <= Math.min(3, mag) && !p.reloading;
      const show = urgent || low;
      if (last.ammoAlert !== show) {
        last.ammoAlert = show;
        els.ammoAlert.hidden = !show;
        els.ammoAlert.classList.toggle("show", show);
        els.ammoAlert.classList.toggle("empty", urgent);
      }
      if (show && last.ammoAlertTxt !== `${ammo}|${urgent}`) {
        last.ammoAlertTxt = `${ammo}|${urgent}`;
        if (urgent) {
          setText(els.ammoAlertN, (p.reserve || 0) > 0 ? "0" : "—");
          setText(els.ammoAlertT, (p.reserve || 0) > 0 ? "chargeur vide · R" : "plus de munitions");
        } else {
          setText(els.ammoAlertN, String(ammo));
          setText(els.ammoAlertT, ammo > 1 ? "balles restantes" : "balle restante");
        }
      }
    }
  }

  /* ───────────── inventaire du bas : le zéro ne s'affiche pas à demeure ───────────── */

  const invFresh = {};   // id → secondes restantes d'affichage d'une ligne tombée à zéro

  /** Écrit une valeur d'inventaire ; une ligne à zéro s'efface (sauf 2 s après un changement). */
  function setInvValue(el, value) {
    if (!el) return;
    const n = Math.max(0, Number(value) || 0);
    const row = el.parentElement;
    if (row && last["inv:" + el.id] !== n) {
      const first = last["inv:" + el.id] === undefined;
      last["inv:" + el.id] = n;
      if (n === 0) {
        // on laisse la ligne visible un instant : le joueur voit qu'il vient de tout dépenser
        row.classList.remove("is-zero");
        row.classList.add("is-fresh");
        if (!first) invFresh[el.id] = { t: 2.2, row };
        else { row.classList.remove("is-fresh"); row.classList.add("is-zero"); }
      } else {
        row.classList.remove("is-zero", "is-fresh");
        delete invFresh[el.id];
      }
    }
    setText(el, String(n));
  }

  function updateHud(p) {
    const hp = Math.max(0, Math.round(p.hp));
    setText(els.hpNum, String(hp));
    if (els.hpMax && last.hpMax !== p.maxHp) {
      last.hpMax = p.maxHp;
      setText(els.hpMax, String(Math.round(p.maxHp || 100)));
    }
    const hpScale = clamp(hp / (p.maxHp || 100), 0, 1);
    if (last.hpScale !== hpScale) {
      els.hpFill.style.transform = `scaleX(${hpScale})`;
      last.hpScale = hpScale;
    }
    els.hpBar.classList.toggle("low", hp < 34);

    const st = clamp(p.stamina / 100, 0, 1);
    if (last.stam !== st) {
      els.stamFill.style.transform = `scaleX(${st})`;
      els.stamFill.style.opacity = st < 0.15 ? "0.35" : "1";
      last.stam = st;
    }

    setText(els.ammo, p.melee ? "∞" : String(p.ammo).padStart(2, "0"));
    setText(els.ammoRes, p.melee ? "lame" : String(p.reserve));
    if (p.weaponName) setText(els.weapon, p.weaponName);
    if (p.ammoLabel) setText(els.ammoType, p.ammoLabel);
    renderAmmo(p);
    renderRadar(p.radar, p.yaw);
    renderThreat(p.threat, p.yaw);

    // objet actif (utilisé au clic droit) : « Aucun objet » ne s'affiche jamais
    if (els.activeItem) {
      const raw = p.activeItemName || "";
      const name = /^(aucun objet|aucun|none|—)$/i.test(raw.trim()) ? "" : raw;
      if (last.activeItem !== name) {
        last.activeItem = name;
        els.activeItem.hidden = !name;
        if (name) els.activeName.textContent = name;
      }
    }

    // arsenal : une seule case active, et seulement les armes possédées
    if (p.weapons) renderWeaponSlots(p.weapons);

    // inventaire : réserves par calibre + objets
    if (p.reserves) {
      setInvValue(els.inv9, p.reserves["9mm"]);
      setInvValue(els.inv12, p.reserves["12"]);
      setInvValue(els.inv556, p.reserves["5.56"]);
      setInvValue(els.inv308, p.reserves[".308"]);
      if (els.inv40) setInvValue(els.inv40, p.reserves["40mm"]);
    }
    if (p.inventory) {
      setInvValue(els.invMedkits, p.inventory.medkits);
      setInvValue(els.invKeys, p.inventory.keys);
      setInvValue(els.invLanterns, p.inventory.lanterns);
    }

    // butin à portée
    const promptText = p.prompt ? p.prompt.text : null;
    if (last.prompt !== promptText) {
      last.prompt = promptText;
      els.lootPrompt.hidden = !promptText;
      if (promptText) {
        const key = p.prompt.key;
        els.lootKey.hidden = !key;
        if (key) els.lootKey.textContent = key;
        els.lootText.textContent = promptText;
      }
    }

    // lunette de la carabine
    const scoped = (p.scope || 0) > 0.55;
    if (last.scoped !== scoped) {
      last.scoped = scoped;
      els.scope.hidden = !scoped;
      els.crosshair.style.opacity = scoped ? "0" : "";
    }

    setText(els.waveNum, roman(p.wave || 1));
    if (p.bossWaiting) {
      // le compteur d'hôtes tombe à 0 alors que la vague continue : on l'écrit
      setText(els.waveLeft, "Le boss tient la nef");
      els.waveLeft.classList.add("alert");
    } else {
      // une seule source pour le nombre d'ennemis : « debout » ici, et nulle part ailleurs.
      // p.waveLeft compte aussi les hôtes pas encore sortis (d'où l'ancien « 14 » vs « 10 »).
      const standing = p.radar && typeof p.radar.total === "number" ? p.radar.total : p.waveLeft;
      const txt = standing > 0
        ? `${standing} debout`
        : (p.waveLeft > 0 ? `${p.waveLeft} à venir` : "la nef est vide");
      setText(els.waveLeft, txt);
      els.waveLeft.classList.remove("alert");
    }
    if (els.citCount) {
      // hors village (pas d'habitants), le compteur disparaît
      const c = p.citizens;
      els.citCount.style.display = c ? "" : "none";
      if (c) {
        setText(els.citCount, `${c.alive} / ${c.total} citoyens`);
        els.citCount.classList.toggle("low", c.alive <= 2);
        els.citCount.classList.toggle("dead", c.alive === 0);
      }
    }
    setText(els.clock, p.clock);
    // tant que le bandeau est affiché, son heure suit celle du HUD
    if (annTimer > 0 && annRawKicker && els.annKicker) {
      const k = announceKicker(annRawKicker);
      if (els.annKicker.textContent !== k) els.annKicker.textContent = k;
    }
    if (p.clockLeft != null) {
      const left = Math.max(0, Math.round(p.clockLeft));
      const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60);
      const txt = left > 0 ? `${p.office} · aube dans ${h > 0 ? `${h} h ` : ""}${String(m).padStart(2, "0")}` : `${p.office} · l'aube`;
      if (last.phaseTxt !== txt) { last.phaseTxt = txt; setText(els.phase, txt); }
    } else {
      setText(els.phase, p.office);
    }
    setText(els.objective, p.objective);
    if (last.clockRatio !== p.clockRatio) {
      els.clockFill.style.width = `${clamp(p.clockRatio * 100, 0, 100)}%`;
      last.clockRatio = p.clockRatio;
    }

    const reloading = !!p.reloading;
    if (last.reloading !== reloading) {
      els.reload.classList.toggle("on", reloading);
      last.reloading = reloading;
    }
    if (reloading) {
      const pr = clamp(p.reloadT / (p.reloadDur || 1), 0, 1);
      els.reload.textContent = `Rechargement ${Math.round(pr * 100)} %`;
    } else if (els.reload.textContent !== "Rechargement") {
      els.reload.textContent = "Rechargement";
    }

    if (p.boss) {
      if (els.bossbar.hidden) els.bossbar.hidden = false;
      const r = clamp(p.boss.hp / p.boss.maxHp, 0, 1);
      if (last.bossR !== r) {
        els.bossFill.style.transform = `scaleX(${r})`;
        last.bossR = r;
      }
      setText(els.bossPhase, p.boss.phase === 3 ? "Phase III" : p.boss.phase === 2 ? "Phase II" : "Phase I");
      if (els.bossHp) setText(els.bossHp, `${Math.max(0, Math.round(p.boss.hp))} / ${Math.round(p.boss.maxHp)}`);
      if (p.boss.name) setText(els.bossName, p.boss.name);
    } else if (!els.bossbar.hidden) {
      els.bossbar.hidden = true;
      last.bossR = null;
    }

    // fioles
    const fl = p.flasks || 0;
    if (last.flasks !== fl) {
      els.flask.hidden = fl <= 0;
      els.flaskNum.textContent = String(fl);
      last.flasks = fl;
    }

    // réticule : s'ouvre en marchant / en l'air, ou selon l'arme
    const speed = p.speed || 0;
    const spread = p.spread != null ? p.spread : 5 + clamp(speed / 6, 0, 1) * 5 + (p.reloading ? 5 : 0);
    if (last.spread !== Math.round(spread)) {
      els.crosshair.style.setProperty("--spread", `${Math.round(spread)}px`);
      last.spread = Math.round(spread);
    }

    // sang aux bords
    const danger = clamp(p.danger || 0, 0, 1);
    const bleed = danger > 0.55 ? (danger - 0.55) * 1.35 : 0;
    if (Math.abs((last.bleed || 0) - bleed) > 0.02) {
      els.bleed.style.opacity = String(bleed * 0.75);
      last.bleed = bleed;
    }

    if (p.hurt > 0.02 && dmgTimer <= 0) {
      els.dmg.classList.add("on");
      dmgTimer = 0.12;
    }
  }

  function hitmarker(headshot = false) {
    els.hitmarker.classList.add("on");
    els.hitmarker.classList.toggle("head", !!headshot);
    els.crosshair.classList.add("hit");
    hitTimer = 0.11;
  }

  /** Le bandeau de lieu porte une heure : elle doit suivre l'horloge du HUD. */
  function announceKicker(raw) {
    const clock = els.clock ? els.clock.textContent.trim() : "";
    if (!clock || !/\d{1,2}:\d{2}/.test(raw || "")) return raw;
    return String(raw).replace(/\d{1,2}:\d{2}/, clock);
  }
  let annRawKicker = "";

  function announce(kicker, title, ms = 3200, opts = null) {
    annRawKicker = kicker || "";
    els.annKicker.textContent = announceKicker(annRawKicker);
    els.annTitle.textContent = title;
    els.announce.classList.toggle("low", !!(opts && opts.low));
    // le fondu est aussi porté par le CSS : une scène figée ne laisse pas le
    // bandeau en surimpression au milieu de l'écran
    els.announce.style.setProperty("--ann-ms", `${Math.max(900, ms)}ms`);
    els.announce.classList.remove("show");
    void els.announce.offsetWidth;   // relance l'animation même si elle était déjà là
    els.announce.classList.add("show");
    annTimer = ms / 1000;
  }

  function toast(text) {
    els.toast.textContent = text;
    els.toast.classList.add("on");
    toastTimer = 2.8;
  }

  /* ─── popup de butin : ce qui vient d'être trouvé, rareté comprise ─── */

  let lootTimer = 0;
  const RARITY_LABEL = { commun: "commun", rare: "rare", "tres-rare": "très rare" };

  function lootPopup(payload) {
    if (!els.lootPopup || !payload || !payload.items || !payload.items.length) return;
    els.lpTitle.textContent = payload.title || "Trouvé";
    els.lpItems.innerHTML = payload.items.map((it) => {
      const rare = it.rarity && it.rarity !== "commun";
      return `<li class="lp-row ${rare ? "is-rare" : ""} r-${it.rarity || "commun"}">
        <span class="lp-ico" aria-hidden="true">${it.kind === "ammo" ? "▮" : it.kind === "weapon" ? "⚔" : it.kind === "medkit" ? "✚" : it.kind === "vial" ? "◍" : it.kind === "key" ? "⚿" : it.kind === "lantern" ? "✦" : "•"}</span>
        <span class="lp-name">${it.name}</span>
        <span class="lp-count">×${it.count}</span>
        <em class="lp-rarity">${RARITY_LABEL[it.rarity] || ""}</em>
      </li>`;
    }).join("");
    els.lootPopup.hidden = false;
    els.lootPopup.classList.add("on");
    lootTimer = 5.2;
  }

  function hideLootPopup() {
    if (!els.lootPopup) return;
    els.lootPopup.classList.remove("on");
    lootTimer = 0.35;
  }

  function tick(dt) {
    for (const id in invFresh) {
      const f = invFresh[id];
      f.t -= dt;
      if (f.t <= 0) {
        f.row.classList.remove("is-fresh");
        f.row.classList.add("is-zero");
        delete invFresh[id];
      }
    }
    if (annTimer > 0) {
      annTimer -= dt;
      if (annTimer <= 0) els.announce.classList.remove("show");
    }
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) els.toast.classList.remove("on");
    }
    if (hitTimer > 0) {
      hitTimer -= dt;
      if (hitTimer <= 0) {
        els.hitmarker.classList.remove("on");
        els.crosshair.classList.remove("hit");
      }
    }
    if (dmgTimer > 0) {
      dmgTimer -= dt;
      if (dmgTimer <= 0) els.dmg.classList.remove("on");
    }
    if (succesTimer > 0) {
      succesTimer -= dt;
      if (succesTimer <= 0) els.succesToast.classList.remove("on");
    }
    if (lootTimer > 0) {
      lootTimer -= dt;
      if (lootTimer <= 0 && els.lootPopup) {
        els.lootPopup.classList.remove("on");
        setTimeout(() => { if (els.lootPopup && !els.lootPopup.classList.contains("on")) els.lootPopup.hidden = true; }, 350);
      }
    }
  }

  /* ───────────── écrans ───────────── */

  function showMenu() {
    menuVisible = true;
    els.menu.hidden = false;
    els.hud.hidden = true;
    els.pause.hidden = true;
    els.end.hidden = true;
    closePanels();
    navMenu.select(0);
  }

  function hideMenu() {
    menuVisible = false;
    els.menu.hidden = true;
    closePanels();
  }

  function showHud() {
    els.hud.hidden = false;
    els.scope.hidden = true;
    els.lootPrompt.hidden = true;
    if (els.lootPopup) { els.lootPopup.hidden = true; els.lootPopup.classList.remove("on"); }
    last = {};
  }

  function hideHud() {
    els.hud.hidden = true;
  }

  function showPause(clock, objectives = null) {
    els.pause.hidden = false;
    els.pauseClock.textContent = clock;
    if (els.pauseObjectives) {
      const rows = Array.isArray(objectives) ? objectives : [];
      els.pauseObjectives.innerHTML = rows.length
        ? `<span class="inv-k">Objectifs de la veille</span>` + rows.map((o) => `
          <div class="pobj"><span class="pobj-k">${o.k}</span><span class="pobj-v">${o.v}</span></div>`).join("")
        : "";
    }
    syncRows();
    navPause.select(0);
  }

  function hidePause() {
    els.pause.hidden = true;
  }

  function hideEnd() {
    els.end.hidden = true;
  }

  function showEnd(stats) {
    els.end.hidden = false;
    // après l'aube, le bouton principal PROLONGE la veille (vagues suivantes,
    // boss suivants) au lieu de relancer une partie neuve
    endContinue = !!stats.victory;
    els.again = document.getElementById("btn-again");
    if (els.again) {
      els.again.firstChild; // no-op, on remplace le texte complet
      els.again.innerHTML = endContinue
        ? '<span class="btn-ico play" aria-hidden="true">▶</span>Prolonger la nuit'
        : '<span class="btn-ico play" aria-hidden="true">▶</span>Veiller encore';
    }
    els.hud.hidden = true;
    els.bleed.style.opacity = "0";
    navEnd.select(0);
    els.endVerdict.textContent = stats.victory ? "L'AUBE" : "LA NUIT";
    els.endVerdict.classList.toggle("defeat", !stats.victory);
    els.endOverline.textContent = stats.victory
      ? `${stats.clock} · le jour se lève`
      : `${stats.clock} · la veille s'achève`;
    els.endLine.textContent = stats.reason;
    els.endQuote.textContent = stats.victory
      ? "« La lumière croît, et rien n'est vaincu pour toujours. »"
      : "« Veillez donc, puisque vous ne savez ni le jour ni l'heure. »";

    const rows = [
      ["Temps tenu", fmtDuration(stats.survived)],
      ["Vague atteinte", roman(stats.wave)],
      ["Morts abattus", String(stats.kills)],
      ["Précision", `${stats.accuracy} %`],
      ["Tirs à la tête", String(stats.headshots)],
      ["Dégâts encaissés", String(stats.damageTaken)],
      ["Boss", stats.bossesKilled ? `${stats.bossesKilled} vaincu${stats.bossesKilled > 1 ? "s" : ""}` : (stats.bossKilled ? "Vaincu" : "Debout")],
      ["Tombes brisées", String(stats.graves || 0)],
      ["Fioles bues", String(stats.flasks)],
      ["Bénédictions", String(stats.blessings || 0)],
      ["Tirs tirés", String(stats.shots)],
    ];
    if (stats.achievements) rows.push(["Succès", `${stats.achievements.done} / ${stats.achievements.total}`]);
    els.endStats.innerHTML = rows
      .map(([k, v]) => `<div class="stat"><span class="sk">${k}</span><span class="sv">${v}</span></div>`)
      .join("");
  }

  function setProgress(k, label) {
    els.loadFill.style.width = `${clamp(k, 0, 1) * 100}%`;
    if (label) els.loadLabel.textContent = label;
  }

  function hideLoading() {
    els.loading.classList.add("gone");
    setTimeout(() => { els.loading.style.display = "none"; }, 1100);
  }

  function setLockHint(show) {
    els.lockHint.hidden = !show;
  }

  function fade(on) {
    els.fade.classList.toggle("on", !!on);
  }

  function renderMuted(muted) {
    // icône unique : le haut-parleur reste, la barre oblique apparaît quand le son est coupé
    els.sound.classList.toggle("is-muted", !!muted);
    els.sound.setAttribute("aria-pressed", String(!muted));
    els.sound.setAttribute("aria-label", muted ? "Activer le son" : "Couper le son");
    els.sound.title = muted ? "Son coupé — M pour activer" : "Son actif — M pour couper";
    if (els.soundLabel) els.soundLabel.textContent = muted ? "Son coupé" : "Son";
  }
  renderMuted(isMuted ? isMuted() : true);

  return {
    els, settings, syncRows, resetSettings, renderMuted,
    updateHud, hitmarker, announce, toast, tick, lootPopup, hideLootPopup,
    showMenu, hideMenu, showHud, hideHud, showPause, hidePause, showEnd, hideEnd,
    setProgress, hideLoading, setLockHint, fade,
    renderAchievements, showBlessings, hideBlessings, achievement, refreshBadge,
    showInventory, hideInventory, refreshInventory, setLevel,
    get inventoryOpen() { return !!(els.inventory && !els.inventory.hidden); },
    get blessingOpen() { return !!blessingPick; },
    get menuVisible() { return menuVisible; },
  };
}
