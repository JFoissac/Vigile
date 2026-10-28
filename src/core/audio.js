// audio.js — bande-son : effets synthétisés (WebAudio) + musique sur bande.
// Nappe drone, vent, cloche, tir, rechargement, pas, grognements, choeur d'aube.
// Musique : cinq bandes locales (assets/music, non versionnées) — une par office.

import { clamp, lerp, randRange } from "./util.js";

const rand = (a, b) => a + Math.random() * (b - a);

/* ─────────────────────────── musique ─────────────────────────── */
// Chaque piste est un fichier local (aucun réseau). Si un fichier manque, le jeu
// continue en silence : la bande-son synthétisée reste seule.
export const MUSIC_TRACKS = {
  menu: { file: "./assets/music/menu.ogg", label: "Deus Culpa", bus: 0.62, loop: true },
  night: { file: "./assets/music/night.ogg", label: "Morthond", bus: 0.4, loop: true },
  combat: { file: "./assets/music/combat.ogg", label: "The Death Song", bus: 0.46, loop: true },
  boss: { file: "./assets/music/boss.ogg", label: "War Eternal", bus: 0.55, loop: true },
  dawn: { file: "./assets/music/dawn.ogg", label: "Excelsis", bus: 0.5, loop: true },
};

export function createAudio() {
  let ctx = null;
  let master = null;
  let comp = null;
  let wet = null;
  let convolver = null;
  let noiseBuf = null;
  let started = false;
  let muted = true; // aucun son tant que l'utilisateur ne l'a pas demandé
  let volume = 0.72;
  let droneGain = null;
  let droneFilter = null;
  let windGain = null;
  let dawnGain = null;
  let dawnStarted = false;
  let heartClock = 0;
  let lastStep = 0;

  /* ── musique : deux lecteurs pour les fondus enchaînés ── */
  const musicEls = new Map();   // id → HTMLAudioElement (créé à la demande)
  const musicGain = new Map();  // id → gain courant (0..1)
  let musicCurrent = null;
  let musicTimer = 0;
  let musicWanted = null;       // piste demandée, même si le son est coupé

  function musicElement(id) {
    const cfg = MUSIC_TRACKS[id];
    if (!cfg || typeof Audio === "undefined") return null;
    let el = musicEls.get(id);
    if (!el) {
      el = new Audio();
      el.src = cfg.file;
      el.loop = !!cfg.loop;
      el.preload = "auto";
      el.volume = 0;
      el.addEventListener("error", () => { musicEls.delete(id); musicGain.delete(id); }, { once: true });
      musicEls.set(id, el);
      musicGain.set(id, 0);
    }
    return el;
  }

  function musicTarget(id) {
    const cfg = MUSIC_TRACKS[id];
    return cfg ? cfg.bus * clamp(volume, 0, 1) : 0;
  }

  /** Fait avancer les fondus (appelé par la boucle de jeu, ou par un timer). */
  function musicTick(dt = 0.05) {
    const rate = dt / 2.2; // fondu d'environ 2,2 s
    for (const [id, el] of musicEls) {
      const want = id === musicCurrent && !muted ? musicTarget(id) : 0;
      const now = musicGain.get(id) || 0;
      const next = now + clamp(want - now, -rate * 1.6, rate);
      musicGain.set(id, Math.abs(next) < 0.002 ? (want > 0 ? want : 0) : next);
      if (el) {
        el.volume = clamp(musicGain.get(id), 0, 1);
        if (id === musicCurrent && !muted && musicGain.get(id) > 0.002) {
          if (el.paused) { el.play().catch(() => {}); }
        } else if (!el.paused && musicGain.get(id) <= 0.002) {
          el.pause();
        }
      }
    }
    // coupe les pistes devenues muettes pour ne pas garder un décodeur actif
    for (const [id, el] of musicEls) {
      if (id !== musicCurrent && musicGain.get(id) === 0 && !el.paused) el.pause();
    }
  }

  function playMusic(id, opts = {}) {
    if (!MUSIC_TRACKS[id]) return null;
    musicWanted = id;
    if (musicCurrent === id) return id;
    musicCurrent = id;
    const el = musicElement(id);
    if (el && !muted) {
      if (el.paused) el.play().catch(() => {});
    }
    if (opts.instant) musicGain.set(id, musicTarget(id));
    return id;
  }

  function stopMusic() {
    musicWanted = null;
    musicCurrent = null;
    for (const [, el] of musicEls) { if (!el.paused) el.pause(); }
    return true;
  }

  function makeNoise(seconds = 2) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  function makeImpulse(seconds = 2.6, decay = 2.4) {
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, decay) * (0.6 + 0.4 * Math.sin(i * 0.001));
      }
    }
    return buf;
  }

  function init() {
    if (muted) return null;
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC({ latencyHint: "interactive" });
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;
    comp.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = Math.pow(volume, 1.4) * 0.9;
    master.connect(comp);

    convolver = ctx.createConvolver();
    convolver.buffer = makeImpulse();
    wet = ctx.createGain();
    wet.gain.value = 0.34;
    convolver.connect(wet);
    wet.connect(comp);
    noiseBuf = makeNoise(2.4);
    started = true;
    buildAmbience();
    return ctx;
  }

  function buildAmbience() {
    // nappe : trois voix basses, filtre lent
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.linearRampToValueAtTime(0.085, ctx.currentTime + 6);
    droneFilter = ctx.createBiquadFilter();
    droneFilter.type = "lowpass";
    droneFilter.frequency.value = 260;
    droneFilter.Q.value = 2.2;
    droneFilter.connect(g);
    g.connect(master);
    droneGain = g;

    const freqs = [36.7, 55.0, 73.4, 110.0];
    const types = ["sine", "triangle", "sine", "triangle"];
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = types[i];
      o.frequency.value = f;
      o.detune.value = (i % 2 ? 1 : -1) * rand(2, 7);
      const og = ctx.createGain();
      og.gain.value = i === 3 ? 0.08 : 0.18;
      o.connect(og);
      og.connect(droneFilter);
      o.start();
      // dérive lente de hauteur
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.013 + i * 0.006;
      const lg = ctx.createGain();
      lg.gain.value = 0.7 + i * 0.3;
      lfo.connect(lg);
      lg.connect(o.detune);
      lfo.start();
    });
    // LFO de filtre
    const flfo = ctx.createOscillator();
    flfo.frequency.value = 0.027;
    const fg = ctx.createGain();
    fg.gain.value = 120;
    flfo.connect(fg);
    fg.connect(droneFilter.frequency);
    flfo.start();

    // vent : bruit filtré
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "lowpass";
    bp.frequency.value = 420;
    const wg = ctx.createGain();
    wg.gain.value = 0.055;
    src.connect(bp);
    bp.connect(wg);
    wg.connect(master);
    src.start();
    windGain = wg;

    const wlfo = ctx.createOscillator();
    wlfo.frequency.value = 0.061;
    const wlg = ctx.createGain();
    wlg.gain.value = 0.035;
    wlfo.connect(wlg);
    wlg.connect(wg.gain);
    wlfo.start();

    // chœur d'aube (démarré plus tard)
    dawnGain = ctx.createGain();
    dawnGain.gain.value = 0;
    const dlp = ctx.createBiquadFilter();
    dlp.type = "lowpass";
    dlp.frequency.value = 1400;
    dawnGain.connect(dlp);
    dlp.connect(master);
    dlp.connect(convolver);
  }

  function ensure() {
    if (muted) return false;
    if (!ctx) init();
    if (!ctx) return false;
    if (ctx.state === "suspended") ctx.resume();
    return true;
  }

  function now() { return ctx.currentTime; }

  function chain(pan = 0, gain = 1, reverb = 0.25) {
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) {
      p.pan.value = clamp(pan, -1, 1);
      g.connect(p);
      p.connect(master);
      if (reverb > 0) {
        const s = ctx.createGain();
        s.gain.value = reverb;
        p.connect(s);
        s.connect(convolver);
      }
    } else {
      g.connect(master);
    }
    return g;
  }

  function noiseBurst(t0, dur, freq, q, gain, type = "bandpass", pan = 0, reverb = 0.2) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.playbackRate.value = rand(0.85, 1.15);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = chain(pan, 0, reverb);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    src.start(t0, Math.random() * 1.5, dur + 0.05);
    src.stop(t0 + dur + 0.1);
  }

  function tone(t0, freq, dur, gain, type = "sine", pan = 0, slideTo = null, reverb = 0.2) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    const g = chain(pan, 0, reverb);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.02, dur * 0.2));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  const api = {
    init,
    get state() { return ctx ? ctx.state : "absent"; },
    get started() { return started; },

    setVolume(v) {
      volume = clamp(v, 0, 1);
      if (master) master.gain.linearRampToValueAtTime(muted ? 0 : Math.pow(volume, 1.4) * 0.9, now() + 0.1);
      for (const [id, el] of musicEls) { if (el) el.volume = clamp(id === musicCurrent ? musicTarget(id) : 0, 0, 1); }
    },
    getVolume() { return volume; },
    setMuted(m) {
      if (!m) {
        muted = false;
        init();
        if (ctx && ctx.state === "suspended") ctx.resume();
        if (master) master.gain.linearRampToValueAtTime(Math.pow(volume, 1.4) * 0.9, now() + 0.15);
        if (musicWanted) playMusic(musicWanted);
      } else {
        muted = true;
        if (master) master.gain.linearRampToValueAtTime(0, now() + 0.12);
        for (const [, el] of musicEls) { if (!el.paused) el.pause(); }
        if (ctx) setTimeout(() => { if (muted && ctx.state === "running") ctx.suspend(); }, 220);
      }
    },
    isMuted() { return muted; },
    toggleMuted() { api.setMuted(!muted); return muted; },

    /* ────────── musique ────────── */
    playMusic,
    stopMusic,
    musicTick(dt) { musicTick(dt); },
    get music() { return musicCurrent; },
    get musicState() {
      const el = musicCurrent ? musicEls.get(musicCurrent) : null;
      return {
        track: musicCurrent,
        wanted: musicWanted,
        volume: el ? +el.volume.toFixed(3) : 0,
        playing: !!(el && !el.paused),
        muted,
      };
    },

    /* ────────── arme ────────── */
    shot() {
      if (!ensure()) return;
      const t = now();
      noiseBurst(t, 0.19, rand(1800, 2600), 0.9, 0.55, "lowpass", 0, 0.42);
      noiseBurst(t, 0.055, 4200, 1.2, 0.28, "highpass", 0, 0.3);
      tone(t, rand(96, 112), 0.16, 0.5, "sine", 0, 44, 0.3);
      // résonance métallique du canon
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = rand(720, 880);
      const g = chain(0, 0, 0.3);
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g);
      o.start(t); o.stop(t + 0.36);
    },
    dryFire() {
      if (!ensure()) return;
      const t = now();
      noiseBurst(t, 0.05, 2400, 2, 0.2, "bandpass", 0, 0.1);
      tone(t + 0.02, 220, 0.05, 0.08, "square", 0, 180, 0.1);
    },
    /** Flamme noire du zélateur : souffle grave qui descend. */
    bolt(dist = 10) {
      if (!ensure()) return;
      const t = now();
      const g = clamp(1 - dist / 44, 0.12, 1);
      tone(t, 520, 0.75, 0.11 * g, "sawtooth", 0, 150, 0.55);
      noiseBurst(t, 0.34, 760, 1.1, 0.1 * g, "bandpass", 0, 0.5);
    },
    reload() {
      if (!ensure()) return;
      const t = now();
      const click = (dt, f, g) => noiseBurst(t + dt, 0.045, f, 3.2, g, "bandpass", 0, 0.15);
      click(0.02, 2600, 0.22);       // verrou
      click(0.05, 1500, 0.14);
      noiseBurst(t + 0.42, 0.09, 900, 1.2, 0.16, "bandpass", 0, 0.2);
      click(0.95, 1800, 0.2);        // chargeur engagé
      tone(t + 1.0, 120, 0.09, 0.22, "sine", 0, 70, 0.2);
      click(1.32, 3200, 0.24);       // culasse
      click(1.45, 2100, 0.18);
      noiseBurst(t + 1.5, 0.07, 700, 2, 0.1, "bandpass", 0, 0.25);
    },
    shell() {
      if (!ensure()) return;
      const t = now();
      tone(t, 1800 + Math.random() * 600, 0.12, 0.035, "triangle", rand(-0.4, 0.4), 900, 0.3);
      noiseBurst(t, 0.03, 3200, 4, 0.05, "bandpass", rand(-0.5, 0.5), 0.3);
    },
    hit(head = false) {
      if (!ensure()) return;
      const t = now();
      if (head) {
        noiseBurst(t, 0.16, 420, 1.1, 0.32, "lowpass", 0, 0.3);
        noiseBurst(t, 0.05, 3000, 1, 0.16, "highpass", 0, 0.2);
        tone(t, 160, 0.12, 0.2, "square", 0, 70, 0.25);
      } else {
        noiseBurst(t, 0.14, 300, 0.8, 0.26, "lowpass", 0, 0.25);
        tone(t, 110, 0.08, 0.12, "sine", 0, 60, 0.2);
      }
    },
    growl(pan = 0, dist = 1, big = false) {
      if (!ensure()) return;
      const t = now();
      const vol = clamp(1 - dist / 42, 0.05, 1) * (big ? 0.4 : 0.22);
      const dur = rand(0.55, 1.15) * (big ? 1.6 : 1);
      const base = big ? rand(42, 55) : rand(58, 86);
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 128) - 1;
        curve[i] = Math.tanh(x * 2.6);
      }
      shaper.curve = curve;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(rand(380, 620), t);
      lp.frequency.exponentialRampToValueAtTime(rand(180, 300), t + dur);
      lp.Q.value = 3.5;
      const g = chain(pan, 0, 0.35);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.12);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      shaper.connect(lp);
      lp.connect(g);
      for (let i = 0; i < 2; i++) {
        const o = ctx.createOscillator();
        o.type = i ? "sawtooth" : "square";
        o.frequency.setValueAtTime(base * (i ? 1.5 : 1), t);
        o.frequency.linearRampToValueAtTime(base * (i ? 1.2 : 0.8), t + dur);
        const og = ctx.createGain();
        og.gain.value = i ? 0.4 : 0.7;
        o.connect(og);
        og.connect(shaper);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = rand(5, 11);
        const lg = ctx.createGain();
        lg.gain.value = rand(3, 9);
        lfo.connect(lg);
        lg.connect(o.frequency);
        o.start(t); o.stop(t + dur + 0.05);
        lfo.start(t); lfo.stop(t + dur + 0.05);
      }
      // souffle
      noiseBurst(t + 0.1, dur * 0.7, 700, 0.7, vol * 0.3, "bandpass", pan, 0.3);
    },
    death(pan = 0) {
      if (!ensure()) return;
      const t = now();
      tone(t, rand(90, 120), 0.9, 0.16, "sawtooth", pan, 38, 0.4);
      noiseBurst(t + 0.1, 0.5, 260, 0.7, 0.18, "lowpass", pan, 0.35);
      tone(t + 0.28, 48, 1.1, 0.12, "sine", pan, 28, 0.4);
    },
    hurt() {
      if (!ensure()) return;
      const t = now();
      tone(t, 70, 0.32, 0.3, "sine", 0, 40, 0.25);
      noiseBurst(t, 0.22, 900, 0.8, 0.14, "lowpass", 0, 0.2);
      tone(t + 0.04, 1200, 0.5, 0.03, "sine", 0, 900, 0.3);
    },
    heartbeat(intensity = 1) {
      if (!ensure()) return;
      const t = now();
      tone(t, 52, 0.16, 0.16 * intensity, "sine", 0, 34, 0.1);
      tone(t + 0.17, 46, 0.2, 0.1 * intensity, "sine", 0, 30, 0.1);
    },
    step(sprint = false, pan = 0.1) {
      if (!ensure()) return;
      const t = now();
      const f = rand(700, 1300) * (sprint ? 1.15 : 1);
      noiseBurst(t, sprint ? 0.09 : 0.075, f, 0.9, sprint ? 0.14 : 0.09, "bandpass", pan, 0.18);
      tone(t, rand(58, 76), 0.055, sprint ? 0.09 : 0.055, "sine", pan, 42, 0.1);
    },
    breathe() {
      if (!ensure()) return;
      const t = now();
      noiseBurst(t, 0.55, 800, 0.6, 0.035, "bandpass", 0.1, 0.1);
    },
    pickup() {
      if (!ensure()) return;
      const t = now();
      tone(t, 880, 0.5, 0.1, "sine", 0, 880, 0.4);
      tone(t + 0.08, 1320, 0.7, 0.07, "sine", 0, 1320, 0.5);
      tone(t + 0.16, 1760, 0.8, 0.04, "sine", 0, 1760, 0.5);
    },
    bell(times = 1) {
      if (!ensure()) return;
      const t = now();
      const f0 = 146.83;
      const partials = [[1, 0.42, 6], [2.0, 0.2, 4.5], [2.4, 0.16, 3.8], [3.0, 0.1, 3], [4.2, 0.06, 2.4], [5.4, 0.04, 2]];
      for (let k = 0; k < times; k++) {
        const tt = t + k * 1.5;
        for (const [m, g, d] of partials) {
          const o = ctx.createOscillator();
          o.type = "sine";
          o.frequency.value = f0 * m * rand(0.999, 1.001);
          const gn = chain(0, 0, 0.55);
          gn.gain.setValueAtTime(0.0001, tt);
          gn.gain.exponentialRampToValueAtTime(g * 0.55, tt + 0.008);
          gn.gain.exponentialRampToValueAtTime(0.0001, tt + d);
          o.connect(gn);
          o.start(tt); o.stop(tt + d + 0.1);
        }
        noiseBurst(tt, 0.12, 2200, 0.8, 0.05, "bandpass", 0, 0.5);
      }
    },
    horn() {
      if (!ensure()) return;
      const t = now();
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(200, t);
      lp.frequency.linearRampToValueAtTime(700, t + 1.4);
      lp.frequency.linearRampToValueAtTime(240, t + 3.2);
      const g = chain(0, 0, 0.5);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
      lp.connect(g);
      for (const f of [73.4, 110, 146.8]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        o.detune.value = rand(-6, 6);
        o.connect(lp);
        o.start(t); o.stop(t + 3.5);
      }
    },
    bossRoar() {
      if (!ensure()) return;
      const t = now();
      const shaper = ctx.createWaveShaper();
      const curve = new Float32Array(512);
      for (let i = 0; i < 512; i++) {
        const x = (i / 256) - 1;
        curve[i] = Math.tanh(x * 4.2);
      }
      shaper.curve = curve;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 520;
      const g = chain(0, 0, 0.65);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.34, t + 0.35);
      g.gain.exponentialRampToValueAtTime(0.12, t + 1.6);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
      shaper.connect(lp);
      lp.connect(g);
      for (const [f, type] of [[38, "sawtooth"], [57, "sawtooth"], [76.5, "square"], [114, "triangle"]]) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f, t);
        o.frequency.linearRampToValueAtTime(f * 0.82, t + 3);
        o.connect(shaper);
        o.start(t); o.stop(t + 3.2);
      }
      noiseBurst(t + 0.1, 2.4, 380, 0.6, 0.16, "lowpass", 0, 0.6);
    },
    quake() {
      if (!ensure()) return;
      const t = now();
      tone(t, 44, 0.9, 0.3, "sine", 0, 26, 0.4);
      noiseBurst(t, 0.7, 180, 0.7, 0.2, "lowpass", 0, 0.4);
    },
    ui() {
      if (!ensure()) return;
      const t = now();
      tone(t, 620, 0.05, 0.035, "sine", 0, 720, 0.05);
    },
    dawn() {
      if (!ensure()) return;
      const t = now();
      const chord = [130.81, 164.81, 196.0, 261.63, 329.63];
      chord.forEach((f, i) => {
        const o = ctx.createOscillator();
        o.type = "sine";
        o.frequency.value = f;
        o.detune.value = rand(-4, 4);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.045, t + 2.4 + i * 0.3);
        g.gain.linearRampToValueAtTime(0.0001, t + 8.5);
        o.connect(g);
        g.connect(master);
        g.connect(convolver);
        o.start(t); o.stop(t + 9);
      });
      api.bell(2);
    },
    defeat() {
      if (!ensure()) return;
      const t = now();
      for (const [f, d] of [[55, 3.2], [58.3, 3.6], [110, 2.6]]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.setValueAtTime(f, t);
        o.frequency.linearRampToValueAtTime(f * 0.5, t + d);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.07, t + 0.3);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 320;
        o.connect(lp); lp.connect(g); g.connect(master); g.connect(convolver);
        o.start(t); o.stop(t + d + 0.1);
      }
    },

    /** k : 0 = pleine nuit, 1 = aube. */
    setDawn(k) {
      if (!ctx) return;
      const t = now();
      if (droneGain) droneGain.gain.linearRampToValueAtTime(0.085 * (1 - k * 0.65) + 0.01, t + 1);
      if (droneFilter) droneFilter.frequency.linearRampToValueAtTime(260 + k * 900, t + 2);
      if (windGain) windGain.gain.linearRampToValueAtTime(0.055 * (1 - k * 0.5), t + 2);
      if (dawnGain && k > 0.45 && !dawnStarted) {
        dawnStarted = true;
        const chord = [130.81, 196.0, 246.94, 329.63];
        chord.forEach((f, i) => {
          const o = ctx.createOscillator();
          o.type = "triangle";
          o.frequency.value = f;
          o.detune.value = rand(-5, 5);
          const g = ctx.createGain();
          g.gain.value = 0.045;
          const lfo = ctx.createOscillator();
          lfo.frequency.value = 0.06 + i * 0.01;
          const lg = ctx.createGain();
          lg.gain.value = 3;
          lfo.connect(lg); lg.connect(o.detune);
          o.connect(g); g.connect(dawnGain);
          o.start(); lfo.start();
        });
        dawnGain.gain.linearRampToValueAtTime(0.5, t + 6);
      }
      if (dawnGain) dawnGain.gain.linearRampToValueAtTime(0.5 * k, t + 2);
    },

    update(dt, { hp = 1, moving = false, sprint = false, alive = true } = {}) {
      if (!ctx) return;
      // battements de cœur quand la vie baisse
      if (alive && hp < 0.38) {
        heartClock -= dt;
        if (heartClock <= 0) {
          heartClock = lerp(1.1, 0.5, 1 - hp / 0.38);
          api.heartbeat(1 - hp / 0.38);
        }
      } else {
        heartClock = 0.3;
      }
    },
    stopAll() {
      if (!ctx) return;
      api.setMuted(true);
    },
  };

  return api;
}
