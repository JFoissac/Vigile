// input.js — clavier, souris, capture de pointeur.
// Le jeu reste jouable même si la capture échoue (glisser pour viser).

export function createInput(canvas, { onTogglePause, onToggleLamp, onReload } = {}) {
  const state = {
    keys: new Set(),
    fire: false,
    firePressed: false,
    locked: false,
    enabled: false,
    dx: 0,
    dy: 0,
    dragging: false,
    sensitivity: 1,
    invertY: false,
    usingMouse: true,
    lastLookTime: 0,
  };

  const look = (e) => {
    if (!state.enabled) return;
    if (!state.locked && !state.dragging) return;
    const mx = e.movementX || 0;
    const my = e.movementY || 0;
    state.dx += mx;
    state.dy += my;
    state.lastLookTime = performance.now();
  };

  const onKeyDown = (e) => {
    const k = e.code;
    if (["Space", "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(k)) e.preventDefault();
    if (e.repeat) return;
    state.keys.add(k);
    if (k === "Escape" && onTogglePause) onTogglePause();
    if (k === "KeyR" && onReload) onReload();
    if (k === "KeyF" && onToggleLamp) onToggleLamp();
  };
  const onKeyUp = (e) => state.keys.delete(e.code);

  const onMouseDown = (e) => {
    if (!state.enabled) return;
    if (e.button === 0) {
      state.fire = true;
      state.firePressed = true;
      state.dragging = true;
      if (!state.locked && canvas.requestPointerLock) {
        try {
          const p = canvas.requestPointerLock({ unadjustedMovement: true });
          if (p && p.catch) p.catch(() => {
            try {
              const q = canvas.requestPointerLock();
              if (q && q.catch) q.catch(() => {});
            } catch (e) { /* capture indisponible : on vise à la souris glissée */ }
          });
        } catch (e) { /* idem */ }
      }
    }
  };
  const onMouseUp = (e) => {
    if (e.button === 0) {
      state.fire = false;
      state.dragging = false;
    }
  };

  const onLockChange = () => {
    state.locked = document.pointerLockElement === canvas;
    document.body.classList.toggle("locked", state.locked);
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("mousedown", onMouseDown);
  window.addEventListener("mouseup", onMouseUp);
  window.addEventListener("mousemove", look);
  document.addEventListener("pointerlockchange", onLockChange);
  window.addEventListener("blur", () => {
    state.keys.clear();
    state.fire = false;
    state.dragging = false;
  });
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  return {
    state,
    /** Active/désactive les entrées de jeu (menu, pause, fin). */
    setEnabled(v) {
      state.enabled = v;
      if (!v) {
        state.keys.clear();
        state.fire = false;
        state.dragging = false;
        if (document.pointerLockElement) document.exitPointerLock();
      }
    },
    requestLock() {
      if (!canvas.requestPointerLock) return;
      try {
        const p = canvas.requestPointerLock({ unadjustedMovement: true });
        if (p && p.catch) p.catch(() => {});
      } catch (e) { /* le navigateur refuse (headless) : sans effet */ }
    },
    consumeLook() {
      const r = { x: state.dx, y: state.dy };
      state.dx = 0;
      state.dy = 0;
      return r;
    },
    consumeFire() {
      const f = state.firePressed;
      state.firePressed = false;
      return f;
    },
    key(code) { return state.keys.has(code); },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", look);
      document.removeEventListener("pointerlockchange", onLockChange);
    },
  };
}
