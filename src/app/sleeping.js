import { V, clamp } from '../core/math.js';
import { CONFIG } from '../config.js';
import { BED, HOUSE, CB } from '../world/layout.js';
import { ICON_SIT, ICON_STAND } from './controls.js';

/**
 * The bed (BED in world/layout.js). Inside the cabin, near it and with it in view (in the middle of the screen, no wall
 * between), a button offers what you may do:
 *  - sleep (once CONFIG.sleep.every in-game hours have passed since you last slept): you sit on the edge as on a bench,
 *    turn 90 degrees and lie back until you look up, tilted 45 degrees to one side as if sleeping on it; the screen fades
 *    to black, stays black a moment, the clock moves on 7-9 hours, and it fades back in with you still lying there.
 *    Then: stand (you sit up and get up) or sit (on the edge, with the album).
 *  - otherwise sit: you sit on the edge and the photo album opens (a book: swipe or use the arrows to turn its pages;
 *    placeholder symbols for now). Then: stand, and sleep too as soon as it is allowed.
 * While an animation plays nothing else moves you; sitting or lying, you can only look around.
 * update(dt) returns true while the bed has the camera; it also counts the in-game hours (the running clock, not jumps
 * of the time slider).
 */
const ICON_SLEEP = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/><path d="M14 3h4l-4 4h4"/></svg>';
const SYMBOLS = ['☀', '☾', '⛵', '⚓', '✿', '★', '♣', '☂', '❄', '♥'];

export function createSleeping({ camera, st, cabin, clock, setHours, scheduleEnv, afterTimeJump = () => {}, resetInput = () => {} }) {
  const SL = CONFIG.sleep, PC = CONFIG.player, E = BED.edge, standY = BED.floor + PC.eyeHeight;
  const A = new V(E.x + E.fx * 0.7, standY, E.z + E.fz * 0.7);                               // standing in front of the edge
  const S = new V(E.x + E.fx * 0.02, E.top + PC.sit.eye, E.z + E.fz * 0.02);                  // the seated eye
  const S2 = new V(E.x + 0.25, E.top + PC.sit.eye - 0.05, E.z);                             // seated, legs swung up onto the bed
  const P = new V(BED.pillow.x, BED.pillow.y, BED.pillow.z);                                 // lying, head on the pillow
  const yawTo = (dx, dz) => Math.atan2(-dx, -dz), wrapA = a => Math.atan2(Math.sin(a), Math.cos(a)), ease = t => t * t * (3 - 2 * t);
  const yawRoom = yawTo(E.fx, E.fz), yawFeet = yawTo(0, 1);
  let mode = null, anim = null, roll = 0, total = 0, prevH = clock.hours, lastSleep = -Infinity, check = 0, fade = null;
  const allowed = () => total - lastSleep >= SL.every;

  /* ---- DOM: two buttons, the black fade, the album ---- */
  const vb = document.getElementById('vbtns');
  const mkBtn = id => { const b = document.createElement('button'); b.className = 'tbtn glass'; b.id = id; b.style.display = 'none'; vb.prepend(b); return b; };
  const btn2 = mkBtn('btnBed2'), btn1 = mkBtn('btnBed1');
  const black = document.createElement('div'); black.id = 'sleepFade'; document.body.appendChild(black);
  const album = document.createElement('div'); album.id = 'album'; album.className = 'hide';
  album.innerHTML = '<div class="book"><div class="page left"></div><div class="page right"></div><div class="leaf"><div class="face front"></div><div class="face back"></div></div></div>'
    + '<button class="turn prev glass" aria-label="Previous page">&#8249;</button><button class="turn next glass" aria-label="Next page">&#8250;</button>';
  document.body.appendChild(album);
  const pageHtml = i => i < 0 || i >= SYMBOLS.length ? '' : `<span class="sym">${SYMBOLS[i]}</span><span class="num">${i + 1}</span>`;
  const $ = q => album.querySelector(q), left = $('.left'), right = $('.right'), leaf = $('.leaf'), front = $('.front'), back = $('.back');
  let spread = 0, turning = false;   // spread k shows pages 2k and 2k + 1
  function showSpread() { left.innerHTML = pageHtml(2 * spread); right.innerHTML = pageHtml(2 * spread + 1); $('.prev').disabled = spread === 0; $('.next').disabled = 2 * spread + 2 >= SYMBOLS.length; }
  function turn(dir) {
    if (turning || (dir > 0 && 2 * spread + 2 >= SYMBOLS.length) || (dir < 0 && spread === 0)) return;
    turning = true; const to = spread + dir;
    leaf.className = 'leaf ' + (dir > 0 ? 'fwd' : 'rev'); leaf.style.transition = 'none';
    if (dir > 0) { front.innerHTML = pageHtml(2 * spread + 1); back.innerHTML = pageHtml(2 * to); right.innerHTML = pageHtml(2 * to + 1); leaf.style.transform = 'rotateY(0deg)'; }
    else { front.innerHTML = pageHtml(2 * spread); back.innerHTML = pageHtml(2 * to + 1); left.innerHTML = pageHtml(2 * to); leaf.style.transform = 'rotateY(0deg)'; }
    leaf.style.display = 'block'; void leaf.offsetWidth;
    leaf.style.transition = ''; leaf.style.transform = dir > 0 ? 'rotateY(-180deg)' : 'rotateY(180deg)';
    setTimeout(() => { spread = to; showSpread(); leaf.style.display = 'none'; turning = false; }, 620);
  }
  $('.prev').addEventListener('click', () => turn(-1)); $('.next').addEventListener('click', () => turn(1));
  let sx = null;
  album.addEventListener('pointerdown', e => { e.stopPropagation(); sx = e.clientX; });
  album.addEventListener('pointerup', e => { if (sx !== null && Math.abs(e.clientX - sx) > 40) turn(e.clientX < sx ? 1 : -1); sx = null; });
  addEventListener('keydown', e => { if (album.classList.contains('hide')) return; if (e.code === 'ArrowRight') turn(1); if (e.code === 'ArrowLeft') turn(-1); });
  const openAlbum = on => { album.classList.toggle('hide', !on); if (on) { spread = 0; showSpread(); } };

  let acts = [];
  function setButtons(list) {   // list: up to two of 'sleep', 'sit', 'stand'
    const key = list.join(); if (key === acts.join()) return; acts = list;
    [btn1, btn2].forEach((b, i) => {
      const a = list[i]; b.style.display = a ? '' : 'none'; if (!a) return;
      b.innerHTML = a === 'sleep' ? ICON_SLEEP : a === 'sit' ? ICON_SIT : ICON_STAND;
      b.setAttribute('aria-label', { sleep: 'Sleep', sit: 'Sit on the bed', stand: 'Get up' }[a]);
    });
  }
  const press = i => { const a = acts[i]; if (a && !anim && !fade) act(a); };
  [btn1, btn2].forEach((b, i) => { b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); press(i); }); b.addEventListener('contextmenu', e => e.preventDefault()); });
  addEventListener('keydown', e => { if (e.repeat || !st.playing) return; if (e.code === 'KeyR' && (mode || acts.length)) press(0); if (e.code === 'KeyT') press(1); });

  /* ---- in reach and in view ---- */
  const target = new V(BED.cx, BED.top, BED.cz);
  function blocked(a, b) {   // does the segment a-b pass through one of the cabin's solid boxes (walls, chimney)?
    for (const bx of cabin.boxes) {
      if (bx.on && !bx.on()) continue;
      let t0 = 0, t1 = 1, ok = true;
      for (const [p, q, lo, hi] of [[a.x, b.x, bx.x0, bx.x1], [a.y, b.y, bx.y0, bx.y1], [a.z, b.z, bx.z0, bx.z1]]) {
        const d = q - p; if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { ok = false; break; } continue; }
        let u = (lo - p) / d, v = (hi - p) / d; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) { ok = false; break; }
      }
      if (ok) return true;
    }
    return false;
  }
  function bedInView() {
    if (!st.walk || !st.grounded || !st.playing || st.aboard || st.seat) return false;
    const p = st.pos, inside = Math.abs(p.x - HOUSE.x) < CB.XW && Math.abs(p.z - HOUSE.z) < CB.ZW;
    if (!inside || Math.hypot(p.x - BED.cx, p.z - BED.cz) > SL.reach) return false;
    const d = target.clone().sub(p).normalize(), f = new V(-Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(st.yaw) * Math.cos(st.pitch));
    return d.dot(f) > Math.cos(SL.cone) && !blocked(p, target);
  }

  /* ---- animations ---- */
  const step = (dur, f) => ({ dur: Math.max(dur, 0.05), f });
  function play(steps, then) { anim = { steps, i: 0, t: 0, then }; setButtons([]); }
  function sitSteps() {   // as on a bench: turn to the bed, walk up, turn round, sit down
    const p0 = st.pos.clone(), y0 = st.yaw, pi0 = st.pitch, yC = yawTo(BED.cx - p0.x, BED.cz - p0.z), d1 = wrapA(yC - y0), walk = Math.hypot(A.x - p0.x, A.z - p0.z);
    let yW = 0, dT = 0;
    return [
      step(Math.abs(d1) / PC.sit.turn + 0.25, k => { st.yaw = y0 + d1 * k; st.pitch = pi0 + (-0.35 - pi0) * k; }),
      step(walk / PC.sit.walk, k => { st.pos.set(p0.x + (A.x - p0.x) * k, standY + (p0.y - standY) * (1 - k) + Math.sin(k * walk * 7) * 0.012, p0.z + (A.z - p0.z) * k); st.yaw = yW = yC + wrapA(yawTo(BED.cx - st.pos.x, BED.cz - st.pos.z) - yC) * Math.min(1, k * 3); }),
      step(0.01, () => { dT = wrapA(yawRoom - yW); }),
      step(Math.abs(Math.PI) / PC.sit.turn + 0.2, k => { st.yaw = yW + dT * k; st.pitch = -0.35 + 0.31 * k; }),
      step(PC.sit.lower, k => { st.pos.lerpVectors(A, S, k); st.pos.y -= Math.sin(k * Math.PI) * 0.04; }),
    ];
  }
  function lieSteps() {   // from sitting: turn 90 degrees (legs up onto the bed), then lie back, looking up, tilted to one side
    let y0 = 0, p0 = 0, dY = 0; const side = Math.random() < 0.5 ? -1 : 1;
    return [
      step(0.01, () => { y0 = st.yaw; p0 = st.pitch; dY = wrapA(yawFeet - y0); }),
      step(1.0, k => { st.yaw = y0 + dY * k; st.pos.lerpVectors(S, S2, k); st.pitch = p0 + (-0.1 - p0) * k; }),
      step(SL.lie, k => { st.pos.lerpVectors(S2, P, k); st.pos.y += Math.sin(k * Math.PI) * 0.05; st.pitch = -0.1 + (SL.lookUp + 0.1) * k; roll = side * SL.tilt * k; }),
    ];
  }
  function upSteps() {    // from lying back to sitting on the edge, facing the room
    let r0 = 0, p0 = 0, y0 = 0;
    return [
      step(0.01, () => { r0 = roll; p0 = st.pitch; y0 = st.yaw; }),
      step(SL.lie * 0.8, k => { st.pos.lerpVectors(P, S2, k); st.pitch = p0 + (-0.1 - p0) * k; roll = r0 * (1 - k); st.yaw = y0 + wrapA(yawFeet - y0) * k; }),
      step(0.9, k => { st.yaw = yawFeet + wrapA(yawRoom - yawFeet) * k; st.pos.lerpVectors(S2, S, k); st.pitch = -0.1 + 0.06 * k; }),
    ];
  }
  const riseSteps = () => [step(PC.sit.rise, k => { st.pos.lerpVectors(S, A, k); })];
  const toSitting = () => { mode = 'sitting'; openAlbum(true); };
  const free = () => { mode = null; roll = 0; st.vel.set(0, 0, 0); st.grounded = true; resetInput(); };
  function sleep() { mode = 'sleeping'; lastSleep = total; fade = { t: 0, jumped: false }; }
  function act(a) {
    if (!mode) {
      mode = 'anim'; st.vel.set(0, 0, 0); resetInput();
      if (a === 'sleep') play([...sitSteps(), ...lieSteps()], sleep); else play(sitSteps(), toSitting);
    } else if (mode === 'sitting') {
      openAlbum(false);
      if (a === 'stand') play(riseSteps(), free); else if (a === 'sleep') play(lieSteps(), sleep);
    } else if (mode === 'lying') {
      if (a === 'stand') play([...upSteps(), ...riseSteps()], free); else if (a === 'sit') play(upSteps(), toSitting);
    }
  }

  function update(dt) {
    const h = clock.hours, d = ((h - prevH) % 24 + 24) % 24; if (d < 3) total += d; prevH = h;   // the running clock only
    st.inBed = mode !== null;
    if (!mode) {
      if ((check -= dt) <= 0) { check = 0.2; setButtons(bedInView() ? [allowed() ? 'sleep' : 'sit'] : []); }
      return false;
    }
    if (anim) {
      const Q = anim; Q.t += dt;
      while (Q.i < Q.steps.length && Q.t >= Q.steps[Q.i].dur) { Q.steps[Q.i].f(1); Q.t -= Q.steps[Q.i].dur; Q.i++; }
      if (Q.i < Q.steps.length) Q.steps[Q.i].f(ease(Q.t / Q.steps[Q.i].dur));
      else { anim = null; Q.then(); }
    } else if (fade) {   // fade out, black, the clock moves on, fade in; you wake up still lying
      fade.t += dt; const F = SL.fade, t = fade.t;
      black.style.opacity = String(t < F ? t / F : t < F + SL.black ? 1 : Math.max(0, 1 - (t - F - SL.black) / F));
      if (!fade.jumped && t >= F + SL.black * 0.5) {
        fade.jumped = true; const hrs = SL.hours[0] + Math.random() * (SL.hours[1] - SL.hours[0]);
        setHours(clock.hours + hrs); prevH = clock.hours; total += hrs; scheduleEnv(true); afterTimeJump();
      }
      if (t >= 2 * F + SL.black) { fade = null; black.style.opacity = '0'; mode = 'lying'; }
    } else if (mode === 'sitting') setButtons(allowed() ? ['stand', 'sleep'] : ['stand']);
    else if (mode === 'lying') setButtons(['stand', 'sit']);
    if (mode === 'sitting' && !anim) st.pos.copy(S); else if (mode === 'lying' && !anim) st.pos.copy(P);
    camera.position.copy(st.pos); camera.rotation.set(st.pitch, st.yaw, roll);
    return true;
  }
  return { update, get mode() { return mode; }, get hoursAwake() { return total - lastSleep; } };
}
