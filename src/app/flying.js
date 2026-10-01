import { V, clamp } from '../core/math.js';
import { CONFIG } from '../config.js';
import { U } from '../core/uniforms.js';
import { H, seaY, JETTY, LIGHTHOUSE, ISLAND_DOCKS, jettyDeckY, jettyDist, swellAt, dockBerths } from '../world/layout.js';

/**
 * Flying the floatplane (assets/water/seaplane.js). Like the boat (app/boating.js), one icon button (B on desktop, as for the boat) does
 * what fits:
 *  - board: from a jetty (or wading) near it you climb into the pilot's seat.
 *  - on the water (taxi): the left joystick (W / S) is the throttle, left / right (A / D) the water rudder. Full throttle
 *    held runs it up to take-off speed and it lifts off; it cannot run onto land, a jetty or the boat.
 *  - in the air: W / S (joystick up / down) climb and descend, A / D bank and turn; the speed looks after itself. It can
 *    never hit anything: over land and near it the plane keeps CONFIG.plane.clear m above the ground (less the further
 *    the land is, a cone), looks ahead along its course and pulls up, or turns away from a slope too steep to climb. It
 *    only touches down on open water, gently. Beyond CONFIG.plane.bound from home it turns itself back.
 *  - dock: slow on the water near a berth of any jetty (either side of its head; one the boat is not at) it taxis in and
 *    ties up; exit then steps you onto the jetty. Refuel: tied up at any jetty, fills the tank.
 *  - fuel: the tank lasts CONFIG.plane.endurance s of flying (taxiing costs nothing); with too little you cannot take off,
 *    and run dry in the air the engine stops and the plane glides down onto the water. The meter shows while aboard.
 *  - locked: the tank starts dry. The fuel can (the story of the six codes: app/fuelQuest.js) poured in unlocks it for good.
 * update(dt) returns true while the plane has the camera.
 */
export function createFlying({ camera, st, plane, boating, inventory, resetInput = () => {} }) {
  const FC = CONFIG.plane, PC = CONFIG.player, PL = plane.look, KEY = 'meadow.plane';
  const DOCKS = [JETTY, LIGHTHOUSE.jetty, ...ISLAND_DOCKS];
  // the plane's berths: alongside either side of every jetty's head, further out than the boat's (the floats are wide) and
  // further along, in deep water off the head's end (the wing clears the lamp posts on the heads' corners)
  const BERTHS = DOCKS.flatMap(d => dockBerths(d).filter(q => !q.end).map(q => {
    const c = Math.cos(q.heading), s = Math.sin(q.heading), sv = Math.sign((q.x - q.land[0]) * -s + (q.z - q.land[1]) * c) || 1;
    return { q, dock: d, x: q.x - s * sv * FC.berthOut + c * FC.berthBack, z: q.z + c * sv * FC.berthOut + s * FC.berthBack, heading: q.heading, side: -sv, bollards: q.bollards, deckY: d.deckY, land: q.land };
  }));
  const boatAt = q => { const b = boating.state; return Math.hypot(b.x - q.x, b.z - q.z) < 5.5; };   // the boat lies there (or so near the wing would hit its rig)
  let BT = BERTHS[1];   // the home jetty's north side
  boating.blocked = q => (p.docked || mode === 'docking') && Math.hypot(q.x - BT.x, q.z - BT.z) < 6;   // the boat keeps off the plane's berth (and the jetty's end, under its wing)

  const btn = document.getElementById('btnPlane');
  const svg = p => `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICONS = {
    board: svg('<path d="M3 11h13l4-3h1.5l-1.5 4.5H3z"/><path d="M8 11l1.5-5h2L12 11"/><path d="M6 15v2M14 15v2M3.5 17.5h14"/><path d="M19 3v4M17 5l2 2 2-2"/>'),
    exit: svg('<path d="M3 11h13l4-3h1.5l-1.5 4.5H3z"/><path d="M8 11l1.5-5h2L12 11"/><path d="M6 15v2M14 15v2M3.5 17.5h14"/><path d="M19 8V3M17 5l2-2 2 2"/>'),
    dock: svg('<circle cx="12" cy="4.5" r="2"/><path d="M12 6.5V21"/><path d="M8 10h8"/><path d="M4 14a8 7 0 0 0 16 0"/><path d="M4 14l-1 2M20 14l1 2"/>'),
    refuel: svg('<path d="M4 20V5a1.5 1.5 0 0 1 1.5-1.5h6A1.5 1.5 0 0 1 13 5v15"/><path d="M3 20h11"/><path d="M5.5 8h6"/><path d="M13 10h2a1.5 1.5 0 0 1 1.5 1.5V16a1.5 1.5 0 0 0 3 0V8l-2.5-2.5"/>'),
    fuel: svg('<path d="M6 7h9l3 3v10H6z"/><path d="M8 7V4.5h5V7"/><path d="M9 13.5c0 2 3 2 3 0s-1.5-3-1.5-3S9 11.5 9 13.5z"/>'),
  };
  const LABEL = { board: 'Climb into the seaplane', exit: 'Leave the seaplane', dock: 'Tie up at the jetty', refuel: 'Fill the tank', fuel: 'Pour the fuel can into the tank' };
  const note = (t, ms = 3600) => { const n = document.getElementById('fireNote'); if (!n) return; n.textContent = t; n.classList.remove('hide'); clearTimeout(note.t); note.t = setTimeout(() => n.classList.add('hide'), ms); };

  /* ---- the fuel meter (with the height and speed) while aboard ---- */
  const meter = document.createElement('div'); meter.id = 'fuelMeter'; meter.className = 'glass hide';
  meter.innerHTML = '<div class="row"><span class="lab">Fuel</span><span class="bar"><span class="fill"></span></span><span class="pct"></span></div><div class="row info"></div>';
  document.body.appendChild(meter);
  const mFill = meter.querySelector('.fill'), mPct = meter.querySelector('.pct'), mInfo = meter.querySelector('.info');

  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (err) { void err; }
  const p = { x: BT.x, y: seaY(), z: BT.z, h: BT.heading, speed: 0, vy: 0, bank: 0, pitch: 0, docked: true, fuel: clamp(+saved.fuel || 0), unlocked: !!saved.unlocked, engine: 0 };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ fuel: +p.fuel.toFixed(4), unlocked: p.unlocked })); } catch (err) { void err; } };
  let mode = null, anim = null, action = '', check = 0, T = 0, saveIn = 0, warned = '', safe = { here: 0, ahead: 0, turn: 0 }, safeIn = 0;
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a)), yawTo = (dx, dz) => Math.atan2(-dx, -dz), ease = t => t * t * (3 - 2 * t);
  const noseYaw = h => -Math.PI / 2 - h;
  const toWorld = (v) => { plane.group.updateMatrixWorld(); return v.clone().applyMatrix4(plane.group.matrixWorld); };
  const eyeAt = (x, z) => Math.max(H(x, z), jettyDeckY(x, z)) + PC.eyeHeight;
  const flying = () => mode === 'flying';

  /* ---- the ground under and ahead: the lowest safe height at (x, z) (seaY() over open water) ---- */
  const RING = [[0, 0, 0]]; for (const r of [7, 14, 22]) for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + r; RING.push([Math.cos(a) * r, Math.sin(a) * r, r]); }
  function floorAt(x, z) {
    const sea = seaY(); let f = sea;
    for (const [dx, dz, d] of RING) { const g = H(x + dx, z + dz); if (g > sea - FC.shallow) f = Math.max(f, Math.max(g, sea) + FC.clear - d * FC.cone); }
    return f;
  }
  function survey() {   // the floor here, the highest along the next few seconds of the course, and which way is lower
    const c = Math.cos(p.h), s = Math.sin(p.h), v = Math.max(p.speed, 8);
    safe.here = floorAt(p.x, p.z); safe.ahead = safe.here; let steep = false;
    for (const t of [0.8, 1.6, 2.6, 3.8]) { const f = floorAt(p.x + c * v * t, p.z + s * v * t); safe.ahead = Math.max(safe.ahead, f); if (f - p.y > FC.climbMax * 0.7 * t + 1) steep = true; }
    const side = a => floorAt(p.x + Math.cos(p.h + a) * v * 2, p.z + Math.sin(p.h + a) * v * 2);
    if (steep) safe.turn = safe.turn || (side(0.8) < side(-0.8) ? 1 : -1); else safe.turn = 0;   // too steep ahead to climb over: turn away towards the lower side (and keep turning that way)
  }

  function pose(dt) {
    const onWater = !flying();
    if (onWater) {   // afloat: bob, roll and pitch a little on the swell
      const sw = swellAt(p.x, p.z, U.uTime.value, U.uWind.value), c = Math.cos(p.h), s = Math.sin(p.h), calm = p.docked ? 0.4 : 1;
      const along = sw.dx * c + sw.dz * s, across = -sw.dx * s + sw.dz * c;
      p.y = seaY() + (0.02 * Math.sin(T * 1.2) + 0.01 * Math.sin(T * 2.1)) * calm + sw.h * 0.8;
      plane.setPose(p.x, p.y, p.z, p.h, (0.012 * Math.sin(T * 0.8)) * calm + Math.atan(across) * 0.6 + p.bank, (0.008 * Math.sin(T * 1.1 + 1)) * calm + Math.atan(along) * 0.6 + p.pitch);
    } else plane.setPose(p.x, p.y, p.z, p.h, p.bank, p.pitch);
    plane.engine(p.engine, dt);
  }
  pose(0);

  /* ---- taxi contact: the floats' ends and middles against the ground and the jetties; the boat ---- */
  const FLOAT = []; for (const s of [-1, 1]) for (const x of [PL.float.x1 - 0.2, 0, PL.float.x0 + 0.2]) FLOAT.push([x, s * (PL.float.z + PL.float.hw)]);
  function blockedAt(x, z, h) {
    const c = Math.cos(h), s = Math.sin(h), sea = seaY();
    for (const [lx, lz] of FLOAT) { const wx = x + c * lx - s * lz, wz = z + s * lx + c * lz; if (H(wx, wz) > sea + PL.float.bottom - 0.05 || jettyDist(wx, wz) < 0.15) return true; }
    const b = boating.state; return Math.hypot(b.x - x, b.z - z) < 4.2;
  }
  const nearBerth = () => {
    let best = null, bd = FC.dockReach;
    for (const q of BERTHS) { if (boatAt(q)) continue; const d = Math.hypot(p.x - q.x, p.z - q.z); if (d < bd) { bd = d; best = q; } }
    return Math.abs(p.speed) < FC.dockSpeed ? best : null;
  };
  /** Distance from the player to the plane: its fuselage and floats (a box in the plane's frame). */
  function planeDist(px, pz) { const c = Math.cos(p.h), s = Math.sin(p.h), dx = px - p.x, dz = pz - p.z, lx = c * dx + s * dz, lz = -s * dx + c * dz; return Math.hypot(Math.max(Math.abs(lx - 0.05) - 3.1, 0), Math.max(Math.abs(lz) - 1.6, 0)); }

  function setButton(a) {
    if (!btn || a === action) return; action = a;
    btn.style.display = a && a !== 'busy' ? '' : 'none';
    if (a && a !== 'busy') { btn.innerHTML = ICONS[a]; btn.setAttribute('aria-label', LABEL[a]); }
  }
  const step = (dur, f) => ({ dur: Math.max(dur, 0.05), f });
  function play(steps, then) { anim = { steps, i: 0, t: 0, then }; setButton('busy'); }
  const seat = () => toWorld(PL.pilot);

  /* ---- board, exit ---- */
  function board() {
    const p0 = st.pos.clone(), c = Math.cos(p.h), s = Math.sin(p.h), side = p.docked ? BT.side : Math.sign(-s * (p0.x - p.x) + c * (p0.z - p.z)) || -1;
    const door = toWorld(PL.door.clone().setZ(side * Math.abs(PL.door.z))), y0 = st.yaw, pi0 = st.pitch;
    door.y = Math.max(door.y, seaY() + PL.float.top) + PC.eyeHeight;
    const d1 = wrapA(yawTo(door.x - p0.x, door.z - p0.z) - y0);
    mode = 'boarding'; st.vel.set(0, 0, 0); resetInput();
    let a = null, yS = 0, dS = 0;
    play([step(Math.abs(d1) / 2.6 + 0.25, k => { st.yaw = y0 + d1 * k; st.pitch = pi0 + (-0.3 - pi0) * k; }),
      step(Math.max(0.9, p0.distanceTo(door) / 1.2), k => { st.pos.lerpVectors(p0, door, k); st.pos.y += Math.sin(k * Math.PI) * 0.15; }),   // down onto the float
      step(0.01, () => { a = st.pos.clone(); yS = st.yaw; dS = wrapA(noseYaw(p.h) - yS); }),
      step(1.4, k => { const e = seat(); st.pos.lerpVectors(a, e, k); st.pos.y += Math.sin(k * Math.PI) * 0.25; st.yaw = yS + dS * ease(k); st.pitch = -0.3 + 0.25 * k; })],   // up through the door into the seat
    () => { mode = p.docked ? 'moored' : 'taxi'; if (!p.unlocked) note('The fuel gauge reads empty. The tank is bone dry.'); });
  }
  function exit() {
    const p0 = st.pos.clone(), y0 = st.yaw, pi0 = st.pitch, land = new V(BT.land[0], 0, BT.land[1]); land.y = eyeAt(land.x, land.z);
    const door = toWorld(PL.door.clone().setZ(BT.side * Math.abs(PL.door.z))); door.y = Math.max(door.y, seaY() + PL.float.top) + PC.eyeHeight;
    const d1 = wrapA(yawTo(land.x - p0.x, land.z - p0.z) - y0);
    mode = 'leaving';
    play([step(Math.abs(d1) / 2.6 + 0.3, k => { st.yaw = y0 + d1 * k; st.pitch = pi0 + (-0.2 - pi0) * k; }),
      step(1.2, k => { st.pos.lerpVectors(p0, door, k); st.pos.y += Math.sin(k * Math.PI) * 0.2; }),
      step(Math.max(0.9, land.distanceTo(door) / 1.6), k => { st.pos.lerpVectors(door, land, k); st.pos.y += Math.sin(k * Math.PI) * 0.4; st.pitch = -0.2 + 0.2 * k; })],
    () => { mode = null; st.vel.set(0, 0, 0); st.grounded = true; resetInput(); });
  }
  /* ---- dock: taxi in alongside, tie up ---- */
  function dock(q) {
    const h0 = p.h, rev = Math.abs(wrapA(q.heading - h0)) > Math.PI / 2 ? Math.PI : 0, dh = wrapA(q.heading + rev - h0), x0 = p.x, z0 = p.z, dur = clamp(Math.hypot(q.x - x0, q.z - z0) / 1.6, 2.5, 7);
    BT = q; mode = 'docking';
    play([step(dur, k => { const prev = p.h; p.x = x0 + (q.x - x0) * k; p.z = z0 + (q.z - z0) * k; p.h = h0 + dh * k; p.speed = 0; p.engine = 0.2 * (1 - k); st.yaw -= p.h - prev; })],
      () => { p.docked = true; p.engine = 0; BT = rev ? { ...q, side: -q.side, bollards: q.bollards.slice().reverse() } : q; plane.mooringLines(true, BT); mode = 'moored'; });
  }
  function refuel() {
    const f0 = p.fuel, dur = 1 + 3 * (1 - f0);
    play([step(dur, k => { p.fuel = f0 + (1 - f0) * k; })], () => { p.fuel = 1; save(); note('The tank is full.'); mode = 'moored'; dispatchEvent(new CustomEvent('meadow-plane-refuel')); });
    mode = 'refuelling';
  }
  function pour() {
    if (!inventory.take(['fuelCan'], 1)) return;
    p.unlocked = true; p.fuel = 1; save(); note('You pour the can into the wing tank. The gauge swings to full: she will fly.', 5000);
    dispatchEvent(new CustomEvent('meadow-plane-fueled'));
  }
  function act() {
    if (anim) return;
    if (action === 'board') board(); else if (action === 'exit') exit(); else if (action === 'refuel') refuel(); else if (action === 'fuel') pour();
    else if (action === 'dock') { const q = nearBerth(); if (q) dock(q); }
  }
  if (btn) { btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); act(); }); btn.addEventListener('contextmenu', e => e.preventDefault()); }
  addEventListener('keydown', e => { if (e.code === 'KeyB' && !e.repeat && st.playing) act(); });

  /* ---- on the water ---- */
  const input = () => { const K = st.keys; return { y: clamp(-st.joy.y + (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0), -1, 1), x: clamp(st.joy.x + (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0), -1, 1) }; };
  function taxi(dt) {
    const I = input();
    if (mode === 'moored') {
      if (I.y > 0.3) {
        if (!p.unlocked) { if (warned !== 'dry') { warned = 'dry'; note('The engine coughs and dies: the tank is dry. There must be fuel somewhere on these islands.', 5000); } return; }
        p.docked = false; plane.mooringLines(false); mode = 'taxi';
      } else { warned = ''; p.engine += (0 - p.engine) * Math.min(1, dt * 2); return; }
    }
    const canFly = p.unlocked && p.fuel >= FC.minTakeoff;
    // (lift-off only with full throttle held: after touching down it just runs out)
    let target = I.y >= 0 ? I.y * FC.taxiSpeed : I.y * FC.reverse;
    if (I.y > 0.85) {
      if (canFly) target = FC.liftSpeed + 3;
      else if (warned !== 'low') { warned = 'low'; note(p.unlocked ? 'Not enough fuel to take off. Fill the tank at any jetty.' : 'The tank is dry.'); }
    } else if (warned === 'low') warned = '';
    const acc = target > p.speed ? (p.speed > FC.taxiSpeed ? FC.runAccel : FC.taxiAccel) : FC.waterDrag;
    p.speed += clamp(target - p.speed, -acc * dt, acc * dt);
    let rate = I.x * FC.taxiTurn * (0.35 + 0.65 * clamp(Math.abs(p.speed) / 3)) * Math.min(1, 7 / Math.max(Math.abs(p.speed), 1)) * Math.sign(p.speed || 1);
    const home = keepIn(); if (home !== null) rate = home * FC.taxiTurn;
    const dh = rate * dt, nx = p.x + Math.cos(p.h + dh) * p.speed * dt, nz = p.z + Math.sin(p.h + dh) * p.speed * dt;
    if (blockedAt(nx, nz, p.h + dh)) { p.speed *= -0.15; }
    else { p.x = nx; p.z = nz; p.h += dh; st.yaw -= dh; }
    p.engine += (clamp(0.25 + 0.75 * Math.max(I.y, 0)) - p.engine) * Math.min(1, dt * 2);
    p.pitch += ((p.speed > FC.taxiSpeed ? 0.05 : 0) - p.pitch) * Math.min(1, dt * 2); p.bank *= Math.exp(-dt * 3);
    if (p.speed >= FC.liftSpeed && canFly && I.y > 0.85) { mode = 'flying'; p.vy = 1.5; warned = ''; safeIn = 0; }
  }
  /** Beyond the bound, it turns back towards home by itself (on the water too). */
  let homing = false;
  function keepIn() {
    const r = Math.hypot(p.x, p.z);
    if (r > FC.bound) homing = true; else if (homing && r < FC.bound - 25) homing = false;
    return homing ? clamp(wrapA(Math.atan2(-p.z, -p.x) - p.h) * 2, -1, 1) : null;
  }

  /* ---- in the air ---- */
  function fly(dt) {
    const I = input(), dry = p.fuel <= 0;
    if ((safeIn -= dt) <= 0) { safeIn = 0.1; survey(); }
    // the course: the bank turns it (a coordinated turn); the terrain or the bound may take over
    const home = keepIn(), steer = safe.turn ? safe.turn : home !== null ? home : I.x;
    p.bank += (steer * FC.bank - p.bank) * Math.min(1, dt * 1.6);
    const dh = 9.81 * Math.tan(p.bank) / Math.max(p.speed, 8) * dt; p.h += dh; st.yaw -= dh;
    // up and down: the stick, the floor ahead, a gentle flare onto the water
    let vyT = dry ? -FC.glide : I.y > 0 ? I.y * FC.climb : I.y * FC.sink;
    const over = p.y - safe.ahead;   // (a margin over land; over open water the floor is the sea itself)
    if (safe.ahead > seaY() + 0.01 && over < 3) vyT = Math.max(vyT, clamp((3 - over) * 1.2, 0, FC.climbMax));
    const aboveSea = p.y - seaY(), open = safe.here <= seaY() + 0.01;
    if (open && aboveSea < 5) vyT = Math.max(vyT, -0.4 - aboveSea * 0.35);   // the flare
    if (p.y > seaY() + FC.ceiling) vyT = Math.min(vyT, 0);
    p.vy += clamp(vyT - p.vy, -FC.vAccel * dt, FC.vAccel * dt);
    const vT = dry ? FC.glideSpeed : p.vy < -1 ? FC.approach : FC.cruise;
    p.speed += clamp(vT - p.speed, -2 * dt, 2.5 * dt);
    p.x += Math.cos(p.h) * p.speed * dt; p.z += Math.sin(p.h) * p.speed * dt; p.y += p.vy * dt;
    const floorNow = floorAt(p.x, p.z); if (p.y < floorNow) { p.y = floorNow; p.vy = Math.max(p.vy, 0); }   // (never below the floor right here)
    p.pitch += (Math.atan2(p.vy, p.speed) + 0.03 - p.pitch) * Math.min(1, dt * 3);
    p.fuel = Math.max(0, p.fuel - dt / FC.endurance * (0.6 + 0.4 * clamp(p.vy / FC.climb)));
    p.engine += ((dry ? 0 : 0.8 + 0.2 * clamp(p.vy / FC.climb)) - p.engine) * Math.min(1, dt * 1.5);
    if (dry && warned !== 'dry') { warned = 'dry'; note('The engine stops: out of fuel. Glide down onto open water.', 5000); }
    else if (!dry && p.fuel < FC.low && warned !== 'lowAir') { warned = 'lowAir'; note('Fuel is low: land on the water and taxi to a jetty to refuel.', 4500); }
    // touch down: only on open water, once low and level
    if (open && p.y - seaY() < 0.25 && p.vy <= 0.2) { p.y = seaY(); p.vy = 0; mode = 'taxi'; p.bank = 0; warned = ''; }
  }

  function showMeter() {
    meter.classList.toggle('hide', !(mode && mode !== 'boarding' && mode !== 'leaving'));
    mFill.style.width = (p.fuel * 100).toFixed(1) + '%'; mPct.textContent = Math.round(p.fuel * 100) + '%';
    meter.classList.toggle('low', p.fuel < FC.low);
    mInfo.textContent = !p.unlocked ? 'Tank dry' : flying() ? `${Math.round(p.y - seaY())} m  ·  ${Math.round(p.speed * 3.6)} km/h` : `on the water  ·  ${Math.round(Math.abs(p.speed) * 3.6)} km/h`;
  }

  function update(dt) {
    T += dt;
    if ((saveIn -= dt) <= 0) { saveIn = 5; if (mode) save(); }
    if (!mode) {
      st.inPlane = false;
      if ((check -= dt) <= 0) {
        check = 0.15;
        const near = st.walk && st.playing && !boating.mode && !st.seat && planeDist(st.pos.x, st.pos.z) < FC.reach && (jettyDeckY(st.pos.x, st.pos.z) > -1e9 || H(st.pos.x, st.pos.z) > seaY() - CONFIG.island.wadeDepth);
        setButton(near ? (!p.unlocked && inventory.count(['fuelCan']) ? 'fuel' : 'board') : '');
        showMeter();
      }
      pose(dt);
      return false;
    }
    if (anim) {
      const A = anim; A.t += dt;
      while (A.i < A.steps.length && A.t >= A.steps[A.i].dur) { A.steps[A.i].f(1); A.t -= A.steps[A.i].dur; A.i++; }
      if (A.i < A.steps.length) A.steps[A.i].f(ease(A.t / A.steps[A.i].dur));
      else { anim = null; action = ''; A.then(); }
    } else if (mode === 'moored' || mode === 'taxi') taxi(dt);
    else if (flying()) fly(dt);
    pose(dt);
    if (!mode) { st.inPlane = false; return false; }   // (just stepped off)
    const inSeat = mode !== 'boarding' && mode !== 'leaving';
    if (inSeat) st.pos.copy(seat());
    if ((check -= dt) <= 0) {
      check = 0.15; showMeter();
      if (!anim) {
        if (mode === 'moored') setButton(!p.unlocked && inventory.count(['fuelCan']) ? 'fuel' : p.unlocked && p.fuel < 0.995 ? 'refuel' : 'exit');
        else if (mode === 'taxi') setButton(nearBerth() ? 'dock' : '');
        else setButton('');
      }
    }
    camera.position.copy(st.pos);
    // the view banks and pitches with the plane while you look ahead
    const look = Math.cos(wrapA(st.yaw - noseYaw(p.h)));
    camera.rotation.set(st.pitch + (inSeat ? p.pitch * look : 0), st.yaw, inSeat ? -p.bank * look : 0);
    st.aboard = true; st.inPlane = true;
    return true;
  }
  /** Back at the home jetty, tied up (you fell asleep away and woke in the cabin: app/sleeping.js). */
  function home() { if (mode) return; BT = BERTHS[1]; Object.assign(p, { x: BT.x, z: BT.z, h: BT.heading, speed: 0, vy: 0, bank: 0, pitch: 0, docked: true }); plane.mooringLines(true, BT); pose(0); }
  plane.mooringLines(true, BT);
  return { _reset() { mode = null; anim = null; action = ''; setButton(''); home(); }, update, home, state: p, berths: BERTHS, get mode() { return mode; }, get berth() { return p.docked ? BT : null; }, unlock() { p.unlocked = true; p.fuel = 1; save(); }, _floorAt: floorAt, _act: act };
}
