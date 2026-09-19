// Ground-level camera and input only. Rendering remains on the held drawing clock.
function createPencilWalk(canvas, panel, changed) {
  const obstacles = [];
  buildPencilCityGeometry(true, false, obstacles);
  const radius = .10, speed = .85;
  let eye = [.26, .52, 3.05], yaw = 0, pitch = .10;
  let enabled = false, frame = 0, last = 0, pointer = null;
  const keys = new Set(), touches = new Map();
  const pad = canvas.parentElement.querySelector('[data-walk-pad]');
  const capture = panel.querySelector('[data-walk-capture]');
  const hint = panel.querySelector('[data-walk-hint]');
  const keyCodes = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp',
    'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
  function clearInput() {
    keys.clear(); touches.clear(); pointer = null;
    cancelAnimationFrame(frame); frame = 0;
  }
  function occupied(x, z) {
    return obstacles.some(([x0, z0, x1, z1]) =>
      x > x0 - radius && x < x1 + radius && z > z0 - radius && z < z1 + radius);
  }
  function move(dx, dz) {
    // Small steps prevent tunneling, even after a slow frame. Separate axes let
    // the camera slide along a wall instead of sticking to it.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .04));
    for (let i = 0; i < steps; i++) {
      const x = Math.max(-7.5, Math.min(7.5, eye[0] + dx / steps));
      if (!occupied(x, eye[2])) eye[0] = x;
      const z = Math.max(-7.5, Math.min(7.5, eye[2] + dz / steps));
      if (!occupied(eye[0], z)) eye[2] = z;
    }
  }
  function step(now) {
    frame = 0;
    if (!enabled || document.hidden || (!keys.size && !touches.size)) return;
    const dt = Math.min(.1, Math.max(0, (now - last) / 1000));
    last = now;
    const held = new Set([...keys, ...touches.values()]);
    const previous = [eye[0], eye[2], yaw];
    yaw += ((held.has('ArrowRight') ? 1 : 0) - (held.has('ArrowLeft') ? 1 : 0)) * dt * 1.5;
    const forward = (held.has('KeyW') || held.has('ArrowUp') ? 1 : 0)
      - (held.has('KeyS') || held.has('ArrowDown') ? 1 : 0);
    const side = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0);
    const distance = speed * dt * (held.has('ShiftLeft') || held.has('ShiftRight') ? 1.8 : 1)
      / Math.max(1, Math.hypot(forward, side));
    move((Math.sin(yaw) * forward + Math.cos(yaw) * side) * distance,
      (-Math.cos(yaw) * forward + Math.sin(yaw) * side) * distance);
    if (previous[0] !== eye[0] || previous[1] !== eye[2] || previous[2] !== yaw) changed();
    frame = requestAnimationFrame(step);
  }
  function start() {
    if (!frame) { last = performance.now(); frame = requestAnimationFrame(step); }
  }
  function look(dx, dy) {
    yaw += dx * .0035;
    pitch = Math.max(-1.35, Math.min(1.35, pitch - dy * .0035));
    changed();
  }
  function reset() {
    clearInput(); eye = [.26, .52, 3.05]; yaw = 0; pitch = .10; changed();
  }
  function captureLabel() {
    capture.textContent = document.pointerLockElement === canvas ? 'Release mouse' : 'Capture mouse';
  }
  function captureFailed() {
    hint.textContent = 'Mouse capture is unavailable. Drag the drawing to look; use WASD or the buttons to walk.';
  }
  capture.addEventListener('click', () => {
    if (document.pointerLockElement === canvas) { document.exitPointerLock(); return; }
    canvas.focus({ preventScroll: true });
    try {
      if (!canvas.requestPointerLock) { captureFailed(); return; }
      const result = canvas.requestPointerLock();
      if (result?.catch) result.catch(captureFailed);
    } catch { captureFailed(); }
  });
  document.addEventListener('pointerlockchange', () => {
    clearInput(); captureLabel();
    if (!enabled && document.pointerLockElement === canvas) document.exitPointerLock();
  });
  document.addEventListener('pointerlockerror', captureFailed);
  document.addEventListener('mousemove', e => {
    if (enabled && document.pointerLockElement === canvas) look(e.movementX, e.movementY);
  });
  canvas.addEventListener('pointerdown', e => {
    if (!enabled || (e.pointerType === 'mouse' && e.button !== 0)) return;
    canvas.focus({ preventScroll: true });
    if (document.pointerLockElement === canvas) return;
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!enabled || !pointer || e.pointerId !== pointer.id || document.pointerLockElement === canvas) return;
    look(e.clientX - pointer.x, e.clientY - pointer.y);
    pointer.x = e.clientX; pointer.y = e.clientY;
  });
  const releaseLook = () => { pointer = null; };
  canvas.addEventListener('pointerup', releaseLook);
  canvas.addEventListener('pointercancel', releaseLook);
  canvas.addEventListener('lostpointercapture', releaseLook);
  document.addEventListener('keydown', e => {
    if (!enabled || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.activeElement !== canvas && document.pointerLockElement !== canvas) return;
    if (e.code === 'Escape') {
      clearInput();
      if (document.pointerLockElement === canvas) document.exitPointerLock();
      return;
    }
    if (!keyCodes.has(e.code)) return;
    e.preventDefault(); keys.add(e.code); start();
  });
  document.addEventListener('keyup', e => { keys.delete(e.code); });
  window.addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', clearInput);
  canvas.addEventListener('blur', () => {
    if (document.pointerLockElement !== canvas) clearInput();
  });
  for (const button of pad.querySelectorAll('[data-walk-move]')) {
    button.addEventListener('pointerdown', e => {
      if (!enabled) return;
      e.preventDefault(); button.setPointerCapture(e.pointerId);
      touches.set(e.pointerId, button.dataset.walkMove); start();
    });
    const release = e => touches.delete(e.pointerId);
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
    button.addEventListener('keydown', e => {
      if (!enabled || !['Space', 'Enter'].includes(e.code)) return;
      e.preventDefault(); keys.add(button.dataset.walkMove); start();
    });
    button.addEventListener('keyup', () => keys.delete(button.dataset.walkMove));
    button.addEventListener('blur', () => keys.delete(button.dataset.walkMove));
  }
  panel.querySelector('[data-walk-reset]').addEventListener('click', () => {
    reset(); canvas.focus({ preventScroll: true });
  });
  return {
    pose: () => ({ eye: [...eye], yaw, pitch }),
    setEnabled(value) {
      if (value === enabled) return;
      enabled = value; panel.hidden = !value; pad.hidden = !value; clearInput();
      if (!value && document.pointerLockElement === canvas) document.exitPointerLock();
    },
  };
}
