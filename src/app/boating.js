import { V, clamp } from '../core/math.js';
import { CONFIG } from '../config.js';
import { U } from '../core/uniforms.js';
import { H, SEA_Y, JETTY, coastDist, jettyDeckY, jettyDist } from '../world/layout.js';

/**
 * Sailing the boat (assets/water/sailboat.js). One icon button (B on desktop) does what fits where you are:
 *  - board: near the boat. From the jetty you turn to it and step down into the cockpit, turning to the wheel; from the
 *    shore (the boat run aground) you walk up to its side and climb in, the camera shaking as you clamber over. The
 *    on-screen wheel slides up as you step in and arrives exactly as you stand at the helm.
 *  - sailing: the left joystick (W / S) sets the speed, left / right (A / D) turns the wheel, which turns the boat only
 *    while it moves; the wheel springs back to the middle when you let go. The top speed follows the wind (U.uWind) and
 *    the angle the boat makes with it (a crawl with no wind); the boom and mainsail swing out away from the wind and
 *    across in a turn, and the boat heels. Looking around stays free and turns with the
 *    boat. More than CONFIG.boat.maxOffshore from the shore the boat turns itself back towards the island. It cannot
 *    sail through the jetty; in shallow water it drags and runs aground.
 *  - dock: near the berth at the jetty head the boat brings itself in and ties up (steering off); exit then steps you
 *    out onto the jetty. Pushing ahead casts off again.
 *  - exit elsewhere: only where there is land within a jump of the boat; you walk forward and jump ashore.
 * While an animation plays nothing else moves you. update(dt) returns true while the boat has the camera.
 */
export function createBoating({ camera, st, boat, resetInput = () => {} }) {
  const BC = CONFIG.boat, PC = CONFIG.player, J = JETTY;
  const btn = document.getElementById('btnBoat');
  const svg = p => `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  const ICONS = {
    board: svg('<path d="M3 16h18l-3 4H6z"/><path d="M12 4v12"/><path d="M12 5l6 9h-6"/><path d="M6 3v6M3.5 6.5L6 9l2.5-2.5"/>'),
    dock: svg('<circle cx="12" cy="4.5" r="2"/><path d="M12 6.5V21"/><path d="M8 10h8"/><path d="M4 14a8 7 0 0 0 16 0"/><path d="M4 14l-1 2M20 14l1 2"/>'),
    exit: svg('<path d="M3 17h13l-2.5 3.5H5.5z"/><path d="M9 6v11"/><path d="M9 7l4.5 7H9"/><path d="M17 13V4M14.5 6.5L17 4l2.5 2.5"/>'),
  };
  const b = { x: J.berth.x, z: J.berth.z, h: J.berth.heading, speed: 0, docked: true, aground: false };
  let mode = null, anim = null, wheelA = 0, boomA = 0, boomOverride = null, auto = false, T = 0, check = 0, action = '';
  const boom = () => boat.boom;
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a)), yawTo = (dx, dz) => Math.atan2(-dx, -dz), ease = t => t * t * (3 - 2 * t);
  const bowYaw = h => -Math.PI / 2 - h;   // the camera yaw that looks along the bow
  const toWorld = (lx, ly, lz) => { boat.group.updateMatrixWorld(); return new V(lx, ly, lz).applyMatrix4(boat.group.matrixWorld); };
  const eyeAt = (x, z) => Math.max(H(x, z), jettyDeckY(x, z)) + PC.eyeHeight;

  /**
   * The wind as the boat feels it (U.uWind strength, U.uWindDir the way it blows): k 0 (still) .. 1 (CONFIG.boat.windFull
   * or more), off: the angle off the bow it comes from (0 dead ahead .. PI from astern), side: +1 when it comes from the
   * right (starboard). drive: how well the sails pull at that angle (weak head to wind, best on a beam reach).
   */
  function wind() {
    const k = clamp(U.uWind.value / BC.windFull), wd = U.uWindDir.value, fx = -wd.x, fz = -wd.y, l = Math.hypot(fx, fz) || 1;
    const c = Math.cos(b.h), s = Math.sin(b.h), off = Math.acos(clamp((fx * c + fz * s) / l, -1, 1)), side = -fx * s + fz * c >= 0 ? 1 : -1;
    const drive = off < Math.PI / 2 ? BC.polar[0] + (1 - BC.polar[0]) * Math.sin(off) : 1 - (1 - BC.polar[1]) * (off - Math.PI / 2) / (Math.PI / 2);
    return { k, off, side, drive };
  }
  /** Where the boom wants to be: out on the side away from the wind, further the more the wind comes from astern; swung
   *  the other way by a turn (turn left, the sail goes right); with no wind only the turn moves it. */
  function boomTarget() {
    if (boomOverride !== null) return boomOverride;
    if (b.docked || mode === 'docking') return 0;                                 // sheeted in at the berth
    const w = wind(), lee = -w.side * (0.12 + 1.2 * w.off / Math.PI);           // positive: the boom's end out to the right
    const turn = mode === 'sailing' ? -wheelA * (0.25 + 0.4 * (1 - w.k)) * clamp(Math.abs(b.speed) / 1.2) : 0;
    return clamp(lee * Math.min(1, w.k * 4) + turn, -1.35, 1.35);   // any breeze fills the sail to its angle; slack in a calm
  }
  function pose() {   // bob, roll and pitch on the swell (less while tied up or aground); heel away from the wind and out of a turn
    const w = wind(), sailing = mode === 'sailing' ? clamp(Math.abs(b.speed) / 1.5) : 0;
    const calm = b.docked || b.aground ? 0.35 : 1, heel = -wheelA * clamp(b.speed / BC.maxSpeed, -1, 1) * 0.1 - w.side * w.k * Math.sin(w.off) * 0.09 * sailing;
    boat.setPose(b.x, b.z, b.h, (0.025 * Math.sin(T * 0.9) + 0.012 * Math.sin(T * 1.7)) * calm + heel, (0.014 * Math.sin(T * 1.1 + 1)) * calm, (0.03 * Math.sin(T * 1.3) + 0.012 * Math.sin(T * 2.3)) * calm);
    boat.wheel.rotation.x = -wheelA * 2.2;
    boom().rotation.y = boomA;
  }
  pose();

  /* ---- hull contact: sample points around the hull at their own draft; land, shallows and the jetty ---- */
  const HULL = []; { const L = 2.3; for (const [x, f] of [[L - 0.1, 0.25], [1.4, 0.7], [0.3, 1], [-0.9, 1], [-L + 0.1, 0.9]]) for (const s of (x > 2 ? [0] : [-1, 1])) HULL.push([x, s * boat.halfBeam(x) * 0.95, f * BC.draft]); }
  function contact(x, z, h) {   // worst clearance under the hull (m of water below each point's draft; < 0 aground) and whether it hits the jetty
    const c = Math.cos(h), s = Math.sin(h); let worst = 9, jetty = false;
    for (const [lx, lz, d] of HULL) { const wx = x + c * lx - s * lz, wz = z + s * lx + c * lz; worst = Math.min(worst, SEA_Y - H(wx, wz) - d); if (jettyDist(wx, wz) < 0.12) jetty = true; }
    return { worst, jetty };
  }
  /** Land within a jump of the boat, or null: a dry spot near the bow or either side, not too high above the water. */
  function landing() {
    const c = Math.cos(b.h), s = Math.sin(b.h); let best = null, bd = 1e9;
    for (let lx = -1.8; lx <= 3.6; lx += 0.45) for (const side of [-1, 0, 1]) {
      if (side === 0 && lx < 2.4) continue;
      const lz = side * (boat.halfBeam(Math.min(lx, 2.2)) + 0.7 + (lx > 2.3 ? 0 : 0.6)), x = b.x + c * lx - s * lz, z = b.z + s * lx + c * lz, g = H(x, z);
      if (g < SEA_Y + 0.03 || g > SEA_Y + 1.3 || jettyDeckY(x, z) > -1e9) continue;
      const d = Math.hypot(lx - 0.3, lz); if (d < bd) { bd = d; best = { x, z, lx, side }; }
    }
    return best;
  }
  const nearBerth = () => Math.hypot(b.x - J.berth.x, b.z - J.berth.z) < BC.dockReach && b.z < J.z - J.head.halfW - 0.3 && Math.abs(b.speed) < BC.dockSpeed;
  /** Distance from the player to the hull's outline (in the boat's frame, an ellipse-ish box). */
  function hullDist(px, pz) { const c = Math.cos(b.h), s = Math.sin(b.h), dx = px - b.x, dz = pz - b.z, lx = c * dx + s * dz, lz = -s * dx + c * dz; return Math.hypot(Math.max(Math.abs(lx) - 2.2, 0), Math.max(Math.abs(lz) - boat.halfBeam(clamp(lx, -2.2, 2.2)), 0)); }

  function setButton(a) {
    if (!btn || a === action) return; action = a;
    btn.style.display = a && a !== 'busy' ? '' : 'none';
    if (a && a !== 'busy') { btn.innerHTML = ICONS[a]; btn.setAttribute('aria-label', { board: 'Board the boat', dock: 'Dock at the jetty', exit: 'Leave the boat' }[a]); }
  }
  const step = (dur, f) => ({ dur: Math.max(dur, 0.05), f });
  function play(steps, then) { anim = { steps, i: 0, t: 0, then }; setButton('busy'); }

  /* ---- board ---- */
  function board() {
    const p0 = st.pos.clone(), y0 = st.yaw, pi0 = st.pitch, fromJetty = jettyDeckY(p0.x, p0.z) > -1e9;
    const helm = () => toWorld(boat.helm.x, boat.helm.y, boat.helm.z);
    const yawB = yawTo(b.x - p0.x, b.z - p0.z), d1 = wrapA(yawB - y0);
    const turn = step(Math.abs(d1) / 2.6 + 0.25, k => { st.yaw = y0 + d1 * k; st.pitch = pi0 + (-0.25 - pi0) * k; });
    mode = 'boarding'; st.vel.set(0, 0, 0); resetInput();
    if (fromJetty) {   // step down into the cockpit, turning to the wheel; the wheel slides up with the step
      let e = null, yS = 0, dS = 0;
      const dur = Math.max(1.8, p0.distanceTo(helm()) / 1.1);
      play([turn, step(0.01, () => { e = helm(); yS = st.yaw; dS = wrapA(bowYaw(b.h) - yS); }),
        step(dur, k => { e = helm(); st.pos.set(p0.x + (e.x - p0.x) * k, p0.y + (e.y - p0.y) * k + Math.sin(k * Math.PI) * 0.12, p0.z + (e.z - p0.z) * k); st.yaw = yS + dS * ease(Math.min(1, k * 1.3)); st.pitch = -0.25 + 0.2 * k; })],
      () => { mode = b.docked ? 'moored' : 'sailing'; });
    } else {           // from the shore: walk to its side, then clamber over the gunwale (shaky)
      const c = Math.cos(b.h), s = Math.sin(b.h), dx = p0.x - b.x, dz = p0.z - b.z, lx = clamp(c * dx + s * dz, -1.6, 1.8), side = -s * dx + c * dz > 0 ? 1 : -1;
      const lz = side * (boat.halfBeam(lx) + 0.45), sx = b.x + c * lx - s * lz, sz = b.z + s * lx + c * lz, sy = eyeAt(sx, sz), walk = Math.hypot(sx - p0.x, sz - p0.z);
      let e = null, yS = 0, dS = 0; const g = toWorld(lx, boat.sheer(lx) + 0.15, side * boat.halfBeam(lx) * 0.9);
      const shake = k => Math.sin(k * 41) * 0.035 + Math.sin(k * 67 + 1.3) * 0.02;
      play([turn,
        step(walk / 1.1, k => { st.pos.set(p0.x + (sx - p0.x) * k, 0, p0.z + (sz - p0.z) * k); st.pos.y = eyeAt(st.pos.x, st.pos.z) + (p0.y - eyeAt(p0.x, p0.z)) * (1 - k); }),
        step(0.9, k => { st.pos.set(sx + (g.x - sx) * k * 0.6, sy + (g.y + 0.9 - sy) * k + shake(k * 3), sz + (g.z - sz) * k * 0.6); st.pitch = -0.25 - 0.3 * Math.sin(k * Math.PI) + shake(k * 2.1) * 2; st.yaw += shake(k * 1.7) * 0.05; }),   // haul up
        step(0.01, () => { e = helm(); yS = st.yaw; dS = wrapA(bowYaw(b.h) - yS); }),
        step(1.3, k => { e = helm(); const a = new V(sx + (g.x - sx) * 0.6, g.y + 0.9, sz + (g.z - sz) * 0.6); st.pos.set(a.x + (e.x - a.x) * k, a.y + (e.y - a.y) * k + shake(k * 2.5 + 3) * (1 - k), a.z + (e.z - a.z) * k); st.yaw = yS + dS * ease(k); st.pitch = -0.4 + 0.35 * k + shake(k * 3 + 1) * (1 - k); })],   // over the gunwale, to the wheel
      () => { mode = 'sailing'; });
    }
  }
  /* ---- dock ---- */
  function dock() {
    const x0 = b.x, z0 = b.z, h0 = b.h, dh = wrapA(J.berth.heading - h0), dur = clamp(Math.hypot(J.berth.x - x0, J.berth.z - z0) / 1.2, 2.5, 7);
    mode = 'docking'; auto = true;
    play([step(dur, k => { const prev = b.h; b.x = x0 + (J.berth.x - x0) * k; b.z = z0 + (J.berth.z - z0) * k; b.h = h0 + dh * k; b.speed = 0; st.yaw -= b.h - prev; wheelA += (-Math.sign(dh) * 0.6 * Math.sin(k * Math.PI) - wheelA) * 0.1; })],
      () => { b.docked = true; b.aground = false; auto = false; boat.mooringLines(true); mode = 'moored'; });
  }
  /* ---- exit ---- */
  function exit() {
    const p0 = st.pos.clone(), y0 = st.yaw, pi0 = st.pitch;
    let land, arc;
    if (b.docked) { land = new V(b.x - 0.3, 0, J.z - J.head.halfW + 0.45); arc = 0.35; }   // up onto the jetty head
    else { const L = landing(); if (!L) return; land = new V(L.x, 0, L.z); arc = 0.55; }
    land.y = eyeAt(land.x, land.z);
    const yawL = yawTo(land.x - p0.x, land.z - p0.z), d1 = wrapA(yawL - y0);
    mode = 'leaving';
    const steps = [step(Math.abs(d1) / 2.6 + 0.3, k => { st.yaw = y0 + d1 * k; st.pitch = pi0 + (-0.2 - pi0) * k; })];
    let from = p0;
    if (!b.docked) {   // along the side deck on the landing's side (the boom swings out the other way), then jump
      const c = Math.cos(b.h), s = Math.sin(b.h), dx = land.x - b.x, dz = land.z - b.z, lx = clamp(c * dx + s * dz, -0.6, 1.9), side = -s * dx + c * dz >= 0 ? 1 : -1;
      const lz = side * (boat.halfBeam(lx) - 0.28), mid = new V(b.x + c * lx - s * lz, SEA_Y + boat.sheer(lx) + PC.eyeHeight, b.z + s * lx + c * lz); from = mid;
      boomOverride = -side * 0.9;
      steps.push(step(p0.distanceTo(mid) / 1.0, k => { st.pos.lerpVectors(p0, mid, k); st.pos.y += Math.sin(k * Math.PI) * 0.15; st.yaw = yawTo(land.x - st.pos.x, land.z - st.pos.z); }));
    }
    const f0 = () => from;
    steps.push(step(Math.max(0.9, land.distanceTo(f0()) / 2.2), k => { const a = f0(); st.pos.lerpVectors(a, land, k); st.pos.y += Math.sin(k * Math.PI) * arc + (k > 0.85 ? -Math.sin((k - 0.85) / 0.15 * Math.PI) * 0.08 : 0); st.pitch = -0.2 + 0.1 * k; }));
    play(steps, () => { mode = null; st.vel.set(0, 0, 0); st.grounded = true; boomOverride = null; resetInput(); });   // a fresh touch is needed to walk
  }

  function act() {
    if (anim) return;
    if (action === 'board') board(); else if (action === 'dock') dock(); else if (action === 'exit') exit();
  }
  if (btn) { btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); act(); }); btn.addEventListener('contextmenu', e => e.preventDefault()); }
  addEventListener('keydown', e => { if (e.code === 'KeyB' && !e.repeat && st.playing) act(); });

  /* ---- sailing ---- */
  function sail(dt) {
    const K = st.keys;
    const throttle = clamp(-st.joy.y + (K.KeyW || K.ArrowUp ? 1 : 0) - (K.KeyS || K.ArrowDown ? 1 : 0), -1, 1);
    const steerIn = clamp(st.joy.x + (K.KeyD || K.ArrowRight ? 1 : 0) - (K.KeyA || K.ArrowLeft ? 1 : 0), -1, 1);
    if (mode === 'moored') { if (throttle > 0.3) { b.docked = false; boat.mooringLines(false); mode = 'sailing'; } else { wheelA += (steerIn - wheelA) * Math.min(1, dt * 6); return; } }
    // beyond the limit, the boat turns itself back towards the island
    const off = -coastDist(b.x, b.z), home = wrapA(Math.atan2(-b.z, -b.x) - b.h);
    if (off > BC.maxOffshore) auto = true; else if (auto && Math.abs(home) < 0.25) auto = false;
    const want = auto ? clamp(home * 2, -1, 1) : steerIn;
    wheelA += (want - wheelA) * Math.min(1, dt * 6);                               // springs back to the middle
    const w = wind(), top = BC.calmSpeed + (BC.maxSpeed - BC.calmSpeed) * w.k * w.drive;   // what the wind allows now; a crawl with none
    const target = auto ? Math.max(throttle, 0.5) * top : throttle > 0 ? throttle * top : throttle * BC.reverse * (0.25 + 0.75 * w.k);
    b.speed += clamp(target - b.speed, -BC.decel * dt, BC.accel * dt);
    const dh = wheelA * BC.turnRate * clamp(b.speed / BC.turnSpeed, -1, 1) * dt;   // turns only while it moves
    const nx = b.x + Math.cos(b.h + dh) * b.speed * dt, nz = b.z + Math.sin(b.h + dh) * b.speed * dt, nh = b.h + dh;
    const now = contact(b.x, b.z, b.h), next = contact(nx, nz, nh);
    if (next.jetty || (next.worst < -BC.draft * 0.55 && next.worst < now.worst)) { b.speed *= -0.15; }          // hit the jetty, or would drive further aground: stop
    else { b.x = nx; b.z = nz; st.yaw -= dh; b.h = nh; }
    if (next.worst < 0) b.speed *= Math.exp(-dt * 2.5);                          // dragging over the bottom
    b.aground = now.worst < -BC.draft * 0.3 && Math.abs(b.speed) < 0.3;
  }

  function update(dt) {
    T += dt; boomA += (boomTarget() - boomA) * Math.min(1, dt * (boomOverride !== null ? 2.5 : 1.2));   // the boom swings across, not snaps
    if (!mode) {
      st.aboard = false;
      if ((check -= dt) <= 0) { check = 0.15; const near = st.walk && st.playing && hullDist(st.pos.x, st.pos.z) < BC.reach && (jettyDeckY(st.pos.x, st.pos.z) > -1e9 || b.aground || H(st.pos.x, st.pos.z) > SEA_Y - CONFIG.island.wadeDepth); setButton(near ? 'board' : ''); }
      pose();
      return false;
    }
    if (anim) {
      const A = anim; A.t += dt;
      while (A.i < A.steps.length && A.t >= A.steps[A.i].dur) { A.steps[A.i].f(1); A.t -= A.steps[A.i].dur; A.i++; }
      if (A.i < A.steps.length) A.steps[A.i].f(ease(A.t / A.steps[A.i].dur));
      else { anim = null; action = ''; A.then(); }
    } else if (mode === 'sailing' || mode === 'moored') sail(dt);
    pose();
    if (mode === 'sailing' || mode === 'moored' || mode === 'docking') st.pos.copy(toWorld(boat.helm.x, boat.helm.y, boat.helm.z));   // standing at the wheel
    if (mode === 'sailing' || mode === 'moored') {
      if ((check -= dt) <= 0) { check = 0.15; setButton(mode === 'moored' ? 'exit' : nearBerth() ? 'dock' : Math.abs(b.speed) < 0.4 && landing() ? 'exit' : ''); }   // ashore only once it has (nearly) stopped
    }
    camera.position.copy(st.pos); camera.rotation.set(st.pitch, st.yaw, 0);
    st.aboard = mode !== null;
    return mode !== null;
  }
  return { update, state: b, get mode() { return mode; } };
}
