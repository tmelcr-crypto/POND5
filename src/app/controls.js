import { isTouch } from '../core/env.js';
import { V, UPV, clamp } from '../core/math.js';
import { U } from '../core/uniforms.js';
import { CONFIG } from '../config.js';
import { WATER_Y, HOUSE, PAD_H, CB, roofY, rockColliders, CON, APP, H, bridgeDeckY, bridgeRails, jettyDeckY, SEATS, lakeD } from '../world/layout.js';
import { obstacles, rockBodies, applyBounds } from '../world/bounds.js';

/** Icons of the sit and stand buttons (also used by the bed, app/sleeping.js). */
export const ICON_SIT = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8.5" cy="4.5" r="2"/><path d="M8.5 7.5v6h6v6"/><path d="M3 14.5h18M5 14.5v5M19 14.5v5"/></svg>';
export const ICON_STAND = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="10" cy="4" r="2"/><path d="M10 7v7M10 14l-3 6M10 14l3 6M6.5 10.5h7"/><path d="M19 13V5M16.5 7.5L19 5l2.5 2.5"/></svg>';

/**
 * First-person controls and the settings panel. Two modes (G key or the panel button):
 *  - walk: eye height above the terrain / cabin floor / low rocks, gravity, Space or Up to jump
 *  - fly:  the original free-flight camera, kept above the terrain and below CONFIG.player.flyCeiling
 * Input:
 *  - desktop: pointer lock / drag look, WASD move, Space/Q up/down, Shift boost, wheel speed, F door, L lights
 *  - touch: left-half virtual joystick, right-half look, Up/Down buttons
 *  - collisions with terrain, tree trunks and boulders (world/bounds.js grid), the rock outcrop, the cabin
 *    (walls, roof, door, floor) and a soft world boundary
 *  - sitting: near a bench (SEATS in world/layout.js), in front of it, the sit button (or R) turns you to the bench,
 *    walks you up to it, turns you round and sits you down; seated, you can only look around; the stand button (or R)
 *    raises you and gives the controls back. Nothing else moves you while it plays.
 */
export function createControls(app) {
  const { canvas, camera, cabin, toggleDoor, setLights, setHours, clock, scheduleEnv } = app;
  const PC = CONFIG.player;
  const st = { yaw: 0, pitch: -0.14, pos: new V(4.3, 1.45, 4.5), vel: new V(), keys: {}, speed: 2.2, locked: false, drag: false, joy: { x: 0, y: 0 }, up: 0, down: 0, playing: false, walk: PC.startMode === 'walk', grounded: false };
  st.pos.set(4.3, 1.55, 4.2); { const t = new V(1.6, 1.0, -2.2).sub(st.pos); st.yaw = Math.atan2(-t.x, -t.z); st.pitch = Math.atan2(t.y, Math.hypot(t.x, t.z)); }
  const hint = document.getElementById('hint'), cross = document.getElementById('cross'), intro = document.getElementById('intro');
  function setHint(txt) { if (!txt) { hint.classList.add('hide'); return; } hint.textContent = txt; hint.classList.remove('hide'); }
  function updateHint() {
    if (!st.playing || isTouch) { setHint(''); return; }
    setHint(st.locked ? 'Esc frees the cursor' : 'Click the scene to steer with the mouse (dragging also works)');
    if (st.locked) setTimeout(() => { if (st.locked) setHint(''); }, 2600);
  }
  function start() {
    st.playing = true; intro.classList.add('hide'); document.body.classList.add('playing');
    if (!isTouch) { try { canvas.requestPointerLock && canvas.requestPointerLock(); } catch (e) {} canvas.focus(); }
    updateHint();
  }
  document.getElementById('start').addEventListener('click', start);
  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT' && e.target.type === 'range' && e.code.startsWith('Arrow')) return;
    st.keys[e.code] = true;
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (!st.playing && (e.code === 'Enter')) start();
    if (e.code === 'KeyF' && !e.repeat) { if (st.nearDoor) toggleDoor(); else dispatchEvent(new Event('meadow-use')); }   // the door when at it, otherwise use the selected item
    if (e.code === 'KeyE' && !e.repeat && st.walk) dispatchEvent(new CustomEvent('meadow-tap', { detail: 'key' }));   // pick up what you look at
    if (e.code === 'KeyL' && !e.repeat) setLights(!cabin.lightsOn);
    if (e.code === 'KeyG' && !e.repeat) setWalk(!st.walk);
    if (e.code === 'KeyR' && !e.repeat) toggleSeat();
  });
  addEventListener('keyup', e => { st.keys[e.code] = false; });
  addEventListener('blur', () => { st.keys = {}; });
  canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') {
      if (e.button === 2) { if (st.playing) dispatchEvent(new Event('meadow-use')); return; }   // right click: use the selected item
      if (e.button !== 0) return;
      if (st.playing && st.locked) dispatchEvent(new CustomEvent('meadow-tap', { detail: 'mouse' }));   // click: pick up what you look at
      if (!st.playing) start();
      st.drag = true; canvas.style.cursor = 'grabbing';
      if (!st.locked && !st.chestOpen && canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch (err) {} }   // not while a chest is open (its tiles need the pointer)
      return;
    }
    e.preventDefault();
    if (!st.playing) start();
    touchDown(e);
  });
  addEventListener('mouseup', () => { st.drag = false; canvas.style.cursor = ''; });
  addEventListener('mousemove', e => {
    if (!(st.locked || st.drag)) return;
    const k = st.locked ? 0.0021 : 0.0035;
    st.yaw -= e.movementX * k; st.pitch = clamp(st.pitch - e.movementY * k, -1.5, 1.5);
  });
  document.addEventListener('pointerlockchange', () => {
    st.locked = document.pointerLockElement === canvas;
    canvas.classList.toggle('locked', st.locked); cross.classList.toggle('on', st.locked);
    updateHint();
  });
  document.addEventListener('pointerlockerror', () => { st.locked = false; updateHint(); });
  canvas.addEventListener('wheel', e => { e.preventDefault(); if (st.wheelSelect) dispatchEvent(new CustomEvent('meadow-wheel', { detail: Math.sign(e.deltaY) })); else setSpeed(st.speed * Math.exp(-e.deltaY * 0.0012)); }, { passive: false });   // with something carried it picks a slot (app/inventory.js)
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  /* touch */
  const joyEl = document.getElementById('joy'), knob = document.getElementById('knob');
  const touches = new Map(); let joyId = null;
  function touchDown(e) {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    if (e.clientX < innerWidth * 0.45 && joyId === null) {
      joyId = e.pointerId; touches.set(e.pointerId, { kind: 'joy', x0: e.clientX, y0: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now() });
      joyEl.style.left = e.clientX + 'px'; joyEl.style.top = e.clientY + 'px'; joyEl.style.display = 'block'; knob.style.transform = '';
    } else touches.set(e.pointerId, { kind: 'look', x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now() });
  }
  canvas.addEventListener('pointermove', e => {
    const t = touches.get(e.pointerId); if (!t) return;
    if (t.kind === 'joy') {
      let dx = e.clientX - t.x0, dy = e.clientY - t.y0; const R = 55, l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
      st.joy.x = dx / R; st.joy.y = dy / R; knob.style.transform = `translate(${dx}px,${dy}px)`;
    } else {
      st.yaw -= (e.clientX - t.x) * 0.0048; st.pitch = clamp(st.pitch - (e.clientY - t.y) * 0.0048, -1.5, 1.5); t.x = e.clientX; t.y = e.clientY;
    }
  });
  function touchUp(e) {
    const t = touches.get(e.pointerId); if (!t) return;
    if (e.type === 'pointerup' && Math.hypot(e.clientX - t.sx, e.clientY - t.sy) < 10 && performance.now() - t.t0 < 300) dispatchEvent(new CustomEvent('meadow-tap', { detail: 'touch' }));   // a tap: pick up what you look at
    if (t.kind === 'joy') { joyId = null; st.joy.x = st.joy.y = 0; joyEl.style.display = 'none'; } touches.delete(e.pointerId); }
  canvas.addEventListener('pointerup', touchUp); canvas.addEventListener('pointercancel', touchUp);
  /** Forget every held key and touch (the joystick included), so nothing keeps you moving after an animation took over;
   *  a finger still down must be lifted and put down again. */
  function resetInput() { st.keys = {}; st.joy.x = st.joy.y = 0; st.up = st.down = 0; touches.clear(); joyId = null; joyEl.style.display = 'none'; st.vel.set(0, 0, 0); }
  function holdBtn(id, key) {
    const b = document.getElementById(id);
    const on = e => { e.preventDefault(); st[key] = 1; b.classList.add('on'); }, off = () => { st[key] = 0; b.classList.remove('on'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
    b.addEventListener('contextmenu', e => e.preventDefault());
  }
  holdBtn('btnUp', 'up'); holdBtn('btnDown', 'down');

  /* panel */
  const timeIn = document.getElementById('time'), windIn = document.getElementById('wind'), speedIn = document.getElementById('speed');
  const timeV = document.getElementById('timeV'), windV = document.getElementById('windV'), speedV = document.getElementById('speedV');
  function fmtTime(h) { const hh = Math.floor(h), mm = Math.round((h - hh) * 60); return String(hh + (mm === 60 ? 1 : 0)).padStart(2, '0') + ':' + String(mm % 60).padStart(2, '0'); }
  let dragging = false;
  timeIn.addEventListener('input', () => { const h = +timeIn.value; timeV.textContent = fmtTime(h); setHours(h); scheduleEnv(false); });
  timeIn.addEventListener('pointerdown', () => { dragging = true; }); addEventListener('pointerup', () => { dragging = false; });
  /** The slider and its label follow the running clock (not while it is being dragged). */
  function showTime(h) { if (dragging) return; timeIn.value = h.toFixed(2); timeV.textContent = fmtTime(h); }
  const cycleBtn = document.getElementById('cycleBtn');
  if (cycleBtn) cycleBtn.addEventListener('click', () => { clock.running = !clock.running; cycleBtn.textContent = clock.running ? 'On' : 'Off'; cycleBtn.setAttribute('aria-pressed', String(clock.running)); });
  const windName = w => w < 0.08 ? 'Still' : w < 0.45 ? 'Light air' : w < 0.9 ? 'Breeze' : w < 1.3 ? 'Windy' : 'Gusty';
  windIn.addEventListener('input', () => { const w = +windIn.value; U.uWind.value = w; windV.textContent = windName(w); });
  /** The slider and its label follow the wind as it changes by itself (world/wind.js), except while being dragged. */
  let windHeld = false; windIn.addEventListener('pointerdown', () => { windHeld = true; }); addEventListener('pointerup', () => { windHeld = false; });
  function showWind(w) { if (windHeld) return; windIn.value = w.toFixed(2); windV.textContent = windName(w); }
  function setSpeed(v) { st.speed = clamp(v, 0.3, 10); speedIn.value = st.speed; speedV.textContent = st.speed.toFixed(1) + ' m/s'; }
  speedIn.addEventListener('input', () => setSpeed(+speedIn.value));
  const panel = document.getElementById('panel'), toggle = document.getElementById('toggle');
  toggle.addEventListener('click', () => { const min = panel.classList.toggle('min'); toggle.textContent = min ? 'Show' : 'Hide'; toggle.setAttribute('aria-expanded', String(!min)); });
  ['pointerdown', 'wheel'].forEach(ev => panel.addEventListener(ev, e => e.stopPropagation()));
  if (isTouch && innerWidth < 640) { panel.classList.add('min'); toggle.textContent = 'Show'; toggle.setAttribute('aria-expanded', 'false'); }

  /* walk / fly */
  const modeBtn = document.getElementById('modeBtn');
  function setWalk(on) {
    if (st.seat || st.aboard || st.inBed || st.chestOpen) return;   // stand up / leave the boat / get out of bed / close the chest first
    st.walk = on; st.vel.y = 0;
    if (modeBtn) { modeBtn.textContent = on ? 'Walk' : 'Fly'; modeBtn.setAttribute('aria-pressed', String(on)); }
    document.getElementById('btnUp').textContent = on ? 'Jump' : 'Up';
    document.getElementById('btnDown').style.visibility = on ? 'hidden' : '';
  }
  if (modeBtn) modeBtn.addEventListener('click', () => setWalk(!st.walk));
  setWalk(st.walk);

  /* movement + collision */
  const fwd = new V(), right = new V(), wish = new V(), np = new V();
  const trunks = [{ x: CON.x, z: CON.z, r: 0.3, top: H(CON.x, CON.z) + 5.2 }, { x: APP.x, z: APP.z, r: 0.28, top: H(APP.x, APP.z) + 1.25 }];
  function houseCollide(np, prev) {
    const lx = np.x - HOUSE.x, lz = np.z - HOUSE.z;
    if (Math.abs(lx) <= 2.17 && Math.abs(lz) <= 1.92) {
      const ry = PAD_H + roofY(lz), top = ry + 0.1 + 0.22, bot = ry - 0.16 - 0.22;
      if (np.y < top && np.y > bot) { if (prev.y >= (top + bot) / 2) np.y = top; else np.y = bot; st.vel.y = 0; }
    }
    const RR = 0.2;
    for (const b of cabin.boxes) {
      if (b.on && !b.on()) continue;
      if (np.x > b.x0 - RR && np.x < b.x1 + RR && np.y > b.y0 - RR && np.y < b.y1 + RR && np.z > b.z0 - RR && np.z < b.z1 + RR) {
        const pen = [np.x - (b.x0 - RR), (b.x1 + RR) - np.x, np.z - (b.z0 - RR), (b.z1 + RR) - np.z, np.y - (b.y0 - RR), (b.y1 + RR) - np.y];
        let m = 0; for (let i = 1; i < (st.walk ? 4 : 6); i++) if (pen[i] < pen[m]) m = i;
        if (m === 0) np.x = b.x0 - RR; else if (m === 1) np.x = b.x1 + RR; else if (m === 2) np.z = b.z0 - RR; else if (m === 3) np.z = b.z1 + RR; else if (m === 4) np.y = b.y0 - RR; else np.y = b.y1 + RR;
      }
    }
    const ix = np.x - HOUSE.x, iz = np.z - HOUSE.z;
    if (!st.walk && Math.abs(ix) < 1.58 && Math.abs(iz) < 1.23) { const fy = PAD_H + CB.FL + 0.28; if (np.y < fy && np.y > PAD_H - 0.4) { np.y = fy; st.vel.y = Math.max(0, st.vel.y); } }
  }
  /** Walkable surface under (x, z) for feet at height `feet`: terrain, cabin floor, the footbridge's or jetty's deck, or the top of a
   *  low rock (outcrop or island boulder). Also pushes out of rocks too tall to step onto, judged by the feet, not the eye. */
  function groundAt(p, feet) {
    let g = H(p.x, p.z);
    const ix = p.x - HOUSE.x, iz = p.z - HOUSE.z;
    if (Math.abs(ix) < 1.58 && Math.abs(iz) < 1.23) g = Math.max(g, PAD_H + CB.FL);
    const deck = Math.max(bridgeDeckY(p.x, p.z), jettyDeckY(p.x, p.z)); if (deck - feet <= PC.stepHeight) g = Math.max(g, deck);   // the footbridge and the jetty (not from under them)
    if (U.uWinter.value > 0.5 && lakeD(p.x, p.z) < 1.0) g = Math.max(g, WATER_Y + 0.02);   // the frozen pond (world/seasons.js)
    const standOn = c => {
      // in the collider's own (rotated) frame; radii are padded by 0.2, body is the player's radius
      const cr = Math.cos(c.rot || 0), sr = Math.sin(c.rot || 0), wx = p.x - c.x, wz = p.z - c.z;
      const lx = cr * wx - sr * wz, lz = sr * wx + cr * wz, b = c.body || 0;
      const rx = c.rx - 0.2 + b, rz = c.rz - 0.2 + b, dx = lx / rx, dz = lz / rz, q = dx * dx + dz * dz;
      if (q >= 1) return;
      const sx = lx / (c.rx - 0.2), sz = lz / (c.rz - 0.2), qs = sx * sx + sz * sz;
      // step onto a rock only if its peak is within a step of the feet; judging by the surface under the player would
      // let every rock be climbed like a ramp, since an ellipsoid rises smoothly from its rim
      const top = c.y + (c.ry - 0.2) * Math.sqrt(Math.max(0, 1 - qs));
      if (c.y + c.ry - 0.2 - feet <= PC.stepHeight) g = Math.max(g, top);
      else { const k = 1 / Math.sqrt(q), ox = dx * k * rx, oz = dz * k * rz; p.x = c.x + cr * ox + sr * oz; p.z = c.z - sr * ox + cr * oz; }
    };
    for (const c of rockColliders) standOn(c);
    for (const c of rockBodies.near(p.x, p.z)) standOn(c);
    return g;
  }
  const takeovers = [];   // things that take the camera for a while: the boat (app/boating.js), the bed (app/sleeping.js)
  function move(dt) {
    const busy = st.aboard || st.inBed || !!st.seat || st.chestOpen;   // no jumping in the boat, in bed or on a bench
    if (busy !== st.busyUI) { st.busyUI = busy; document.getElementById('btnUp').style.visibility = busy ? 'hidden' : ''; }
    for (const f of takeovers) if (f(dt)) { seatButton(''); return; }
    if (seatUpdate(dt)) return;
    const K = st.keys;
    fwd.set(-Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(st.yaw) * Math.cos(st.pitch));
    if (st.walk) fwd.set(-Math.sin(st.yaw), 0, -Math.cos(st.yaw));
    right.set(Math.cos(st.yaw), 0, -Math.sin(st.yaw));
    const mf = (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0) - st.joy.y;
    const mr = (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0) + st.joy.x;
    const mu = (K.Space || (!st.walk && K.KeyE) ? 1 : 0) - (K.KeyQ || K.KeyC || K.ControlLeft ? 1 : 0) + st.up - st.down;
    wish.set(0, 0, 0).addScaledVector(fwd, mf).addScaledVector(right, mr);
    if (!st.walk) wish.addScaledVector(UPV, mu);
    if (wish.lengthSq() > 1) wish.normalize();
    const sp = st.speed * (K.ShiftLeft || K.ShiftRight ? 2.6 : 1);
    if (st.walk) {
      const k = 1 - Math.exp(-dt * (st.grounded ? 10 : 2));
      st.vel.x += (wish.x * sp - st.vel.x) * k; st.vel.z += (wish.z * sp - st.vel.z) * k;
      st.vel.y -= PC.gravity * dt;
      if (st.grounded && mu > 0) { st.vel.y = PC.jump; st.grounded = false; }
    } else st.vel.lerp(wish.multiplyScalar(sp), 1 - Math.exp(-dt * 7));
    np.copy(st.pos).addScaledVector(st.vel, dt);
    for (const t of trunks) {
      if (np.y > t.top) continue;
      const dx = np.x - t.x, dz = np.z - t.z, d = Math.hypot(dx, dz);
      if (d < t.r && d > 1e-4) { np.x = t.x + dx / d * t.r; np.z = t.z + dz / d * t.r; }
    }
    obstacles.resolve(np, 0.15);
    bridgeRails(np, st.pos, 0.15, np.y - (st.walk ? PC.eyeHeight : 0.3), np.y + 0.1);   // the footbridge's railings
    applyBounds(np, st.vel, dt, st.walk && jettyDeckY(np.x, np.z) === -Infinity);   // on the jetty, deep water below is fine
    if (st.walk) {
      // eye height above the walkable surface; step up smoothly, stick to the ground going down hill
      const feet = st.pos.y - PC.eyeHeight, gy = groundAt(np, feet) + PC.eyeHeight;
      if (np.y <= gy || (st.grounded && st.vel.y <= 0 && np.y - gy < PC.stepHeight)) {
        np.y = gy > st.pos.y + 0.02 ? st.pos.y + (gy - st.pos.y) * (1 - Math.exp(-dt * 14)) : gy;
        if (gy - np.y > PC.stepHeight) np.y = gy - PC.stepHeight;
        st.vel.y = Math.max(st.vel.y, 0); st.grounded = true;
      } else st.grounded = false;
      houseCollide(np, st.pos);
    } else {
      const pushOut = c => {
        const cr = Math.cos(c.rot || 0), sr = Math.sin(c.rot || 0), wx = np.x - c.x, wz = np.z - c.z;
        const lx = cr * wx - sr * wz, lz = sr * wx + cr * wz;
        const dx = lx / c.rx, dy = (np.y - c.y) / c.ry, dz = lz / c.rz, d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < 1 && d2 > 1e-6) { const k = 1 / Math.sqrt(d2), ox = dx * k * c.rx, oz = dz * k * c.rz; np.x = c.x + cr * ox + sr * oz; np.y = c.y + dy * k * c.ry; np.z = c.z - sr * ox + cr * oz; }
      };
      for (const c of rockColliders) pushOut(c);
      for (const c of rockBodies.near(np.x, np.z)) pushOut(c);
      houseCollide(np, st.pos);
      const g = Math.max(H(np.x, np.z), WATER_Y);
      if (np.y < g + 0.26) { np.y = g + 0.26; st.vel.y = Math.max(st.vel.y, 0); }
      np.y = Math.min(np.y, g + PC.flyCeiling);
    }
    st.pos.copy(np);
    camera.position.copy(st.pos);
    camera.rotation.set(st.pitch, st.yaw, 0);
  }

  /* ---- sitting on a bench ---- */
  const SIT = PC.sit, seatBtn = document.getElementById('btnSeat');
  st.seat = null;
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a)), yawTo = (dx, dz) => Math.atan2(-dx, -dz);
  const ease = t => t * t * (3 - 2 * t);
  /** The seat the player may sit on: in walk mode, on the ground, within reach and in front of it. */
  function nearSeat() {
    if (!st.walk || !st.grounded || !st.playing || st.aboard || st.inBed) return null;
    let best = null, bd = SIT.reach;
    for (const s of SEATS) {
      const dx = st.pos.x - s.x, dz = st.pos.z - s.z, d = Math.hypot(dx, dz);
      if (d < bd && dx * s.fx + dz * s.fz > SIT.front && Math.abs(st.pos.y - PC.eyeHeight - s.top) < 1.2) { best = s; bd = d; }
    }
    return best;
  }
  /** A step of the animation: over `dur` seconds, f(k) sets the pose for k = 0..1 (eased). */
  const step = (dur, f) => ({ dur: Math.max(dur, 0.05), f });
  function sitDown(s) {
    const p0 = st.pos.clone(), y0 = st.yaw, pi0 = st.pitch;
    const ax = s.x + s.fx * SIT.approach, az = s.z + s.fz * SIT.approach, ay = H(ax, az) + PC.eyeHeight, dy0 = p0.y - (H(p0.x, p0.z) + PC.eyeHeight);   // where you stand before sitting
    const ex = s.x + s.fx * SIT.seatF, ez = s.z + s.fz * SIT.seatF, ey = s.top + SIT.eye;                                           // the seated eye
    const yawC = yawTo(s.x - p0.x, s.z - p0.z), d1 = wrapA(yawC - y0), pitchC = -0.3, walk = Math.hypot(ax - p0.x, az - p0.z);
    const yawSeat = yawTo(s.fx, s.fz);
    let yawW = yawC, yawT = 0;
    const steps = [
      step(Math.abs(d1) / SIT.turn + 0.25, k => { st.yaw = y0 + d1 * k; st.pitch = pi0 + (pitchC - pi0) * k; }),                       // turn to the bench
      step(walk / SIT.walk, k => {                                                                                                       // walk up to it
        st.pos.set(p0.x + (ax - p0.x) * k, 0, p0.z + (az - p0.z) * k); st.pos.y = H(st.pos.x, st.pos.z) + PC.eyeHeight + dy0 * (1 - k) + Math.sin(k * walk * 7) * 0.012;   // over the ground, a slight step bob
        st.yaw = yawW = yawC + wrapA(yawTo(s.x - st.pos.x, s.z - st.pos.z) - yawC) * Math.min(1, k * 3); st.pitch = pitchC;
      }),
      step(0.01, () => { yawT = wrapA(yawSeat - yawW); }),
      step(Math.PI / SIT.turn + 0.2, k => { st.yaw = yawW + yawT * k; st.pitch = pitchC + (-0.04 - pitchC) * k; }),                 // turn round
      step(SIT.lower, k => { st.pos.set(ax + (ex - ax) * k, ay + (ey - ay) * k - Math.sin(k * Math.PI) * 0.04, az + (ez - az) * k); }),   // sit down
    ];
    st.seat = { s, steps, i: 0, t: 0, seated: false, stand: { x: ax, y: ay, z: az }, eye: { x: ex, y: ey, z: ez } };
    st.vel.set(0, 0, 0);
  }
  function standUp() {
    const S = st.seat, a = S.stand, e = S.eye;
    S.steps = [step(SIT.rise, k => { st.pos.set(e.x + (a.x - e.x) * k, e.y + (a.y - e.y) * k, e.z + (a.z - e.z) * k); })];   // rise
    S.i = 0; S.t = 0; S.seated = false; S.leaving = true;
  }
  function toggleSeat() {
    if (st.seat) { if (st.seat.seated) standUp(); return; }
    const s = nearSeat(); if (s) sitDown(s);
  }
  if (seatBtn) {
    seatBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); toggleSeat(); });
    seatBtn.addEventListener('contextmenu', e => e.preventDefault());
  }
  let seatCheck = 0, btnState = '';
  function seatButton(state) {
    if (!seatBtn || state === btnState) return; btnState = state;
    seatBtn.style.display = state ? '' : 'none';
    if (state) { seatBtn.innerHTML = state === 'sit' ? ICON_SIT : ICON_STAND; seatBtn.setAttribute('aria-label', state === 'sit' ? 'Sit down' : 'Stand up'); }
    seatBtn.classList.toggle('busy', state === 'busy');
  }
  /** Plays the sit / stand animation or holds the seated pose (look only). Returns true while it has the camera. */
  function seatUpdate(dt) {
    const S = st.seat;
    if (!S) {
      if ((seatCheck -= dt) <= 0) { seatCheck = 0.2; seatButton(nearSeat() ? 'sit' : ''); }
      return false;
    }
    if (!S.seated) {
      S.t += dt;
      while (S.i < S.steps.length && S.t >= S.steps[S.i].dur) { S.steps[S.i].f(1); S.t -= S.steps[S.i].dur; S.i++; }
      if (S.i < S.steps.length) S.steps[S.i].f(ease(S.t / S.steps[S.i].dur));
      else if (S.leaving) { st.seat = null; st.vel.set(0, 0, 0); st.grounded = true; seatButton(''); seatCheck = 0; }
      else { S.seated = true; st.pos.set(S.eye.x, S.eye.y, S.eye.z); }
      if (st.seat) seatButton(S.seated ? 'stand' : 'busy');
    }
    camera.position.copy(st.pos);
    camera.rotation.set(st.pitch, st.yaw, 0);
    return true;
  }
  return { st, move, fmtTime, setSpeed, setWalk, timeIn, timeV, showTime, toggleSeat, resetInput, showWind, addTakeover: f => { takeovers.push(f); } };
}
