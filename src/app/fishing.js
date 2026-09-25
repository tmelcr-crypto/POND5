import * as THREE from 'three';
import { V, clamp } from '../core/math.js';
import { CONFIG } from '../config.js';
import { H, SEA_Y, JETTY, jettyDeckY, jettyDist } from '../world/layout.js';

/**
 * Fishing, from the head of the jetty or from the boat at anchor (app/boating.js). There, looking out over deep water,
 * the fish button casts: a rod appears in your hand, the float flies out and settles on the water. After a while (the
 * wait is shorter around sunrise and sunset) it bobs and dips with a splash: tap Strike (the button, a tap anywhere, or
 * H) within CONFIG.fishing.window seconds and the fish is hooked and reeled in to your hand; miss it and it swims off
 * and the float waits again. Even hooked, CONFIG.fishing.fail of the fish slip off while you reel in. Pressing the button
 * while you wait reels in empty; walking away does too. A catch is a
 * fish, or once in a while (CONFIG.fishing.golden) a golden fish. The rod is only shown; you need not carry one.
 */
const svg = p => `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON_CAST = svg('<path d="M4 20L17 4"/><path d="M17 4c2 3 2.5 7 2.5 10"/><circle cx="19.5" cy="16" r="1.6"/><path d="M4 20h5"/>');
const ICON_STRIKE = svg('<path d="M12 3v9a4 4 0 1 1-4-4"/><path d="M18 4v7M18 15v.5"/>');
const ICON_REEL = svg('<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="1.5"/><path d="M12 6V2M16 12h5"/>');

export function createFishing({ scene, camera, st, inventory, items, boating, waterLife, clock, seasons }) {
  const FC = CONFIG.fishing, rr = (a, b) => a + (b - a) * Math.random(), up = new V(0, 1, 0);
  const btn = document.createElement('button'); btn.className = 'tbtn glass'; btn.id = 'btnFish'; btn.style.display = 'none'; document.getElementById('vbtns').prepend(btn);
  const note = document.getElementById('fireNote');
  function say(t) { if (!note) return; note.textContent = t; note.classList.remove('hide'); clearTimeout(say.t); say.t = setTimeout(() => note.classList.add('hide'), 2200); }

  /* ---- rod, line, float ---- */
  const rodG = new THREE.CylinderGeometry(0.006, 0.014, FC.rod, 6); rodG.translate(0, FC.rod / 2, 0);
  const rod = new THREE.Mesh(rodG, new THREE.MeshStandardMaterial({ color: 0x5a4330, roughness: 0.6 })); rod.visible = false; scene.add(rod);
  const N = 16, linePos = new Float32Array(N * 3), lineG = new THREE.BufferGeometry(); lineG.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
  const line = new THREE.Line(lineG, new THREE.LineBasicMaterial({ color: 0xdedede, transparent: true, opacity: 0.7 })); line.frustumCulled = false; line.visible = false; scene.add(line);
  const flo = new THREE.Group(), fm = (c, y, s) => { const m = new THREE.Mesh(new THREE.SphereGeometry(s, 10, 6), new THREE.MeshStandardMaterial({ color: c, roughness: 0.4 })); m.position.y = y; flo.add(m); };
  fm(0xd22a22, 0.012, 0.018); fm(0xf2f2ee, -0.004, 0.017); flo.visible = false; scene.add(flo);

  let job = null, shown = '', check = 0;
  const fwdH = () => new V(-Math.sin(st.yaw), 0, -Math.cos(st.yaw));
  /** Where a cast would land from here, or null: the jetty's head or the anchored boat, deep water ahead. */
  function spot() {
    if (!st.playing || st.inBed || st.seat || st.chestOpen) return null;
    const onBoat = boating && boating.anchored, onJetty = !st.aboard && st.walk && jettyDeckY(st.pos.x, st.pos.z) > -1e9 && st.pos.x > JETTY.head.x0 - 2;
    if (!onBoat && !onJetty) return null;
    const p = st.pos.clone().addScaledVector(fwdH(), FC.cast); p.y = SEA_Y;
    return SEA_Y - H(p.x, p.z) > FC.depth && jettyDist(p.x, p.z) > 0.6 ? p : null;
  }
  const hand = () => { const f = fwdH(); return st.pos.clone().addScaledVector(f, 0.32).addScaledVector(new V(-f.z, 0, f.x), 0.24).addScaledVector(up, -0.38); };
  /** The wait for a bite: shorter within FC.dawnDusk hours of sunrise or sunset. */
  function waitTime() {
    const [rise, set] = CONFIG.seasons.sun[seasons ? seasons.season : 'summer'], h = clock.hours;
    const near = Math.min(Math.abs(h - rise), Math.abs(h - set)) < FC.dawnDusk;
    return rr(...FC.wait) * (near ? FC.dawnDuskFactor : 1);
  }

  function setBtn(s) {
    if (s === shown) return; shown = s;
    btn.style.display = s ? '' : 'none'; if (!s) return;
    btn.innerHTML = s === 'strike' ? ICON_STRIKE : s === 'reel' ? ICON_REEL : ICON_CAST;
    btn.classList.toggle('pulse', s === 'strike');
    btn.setAttribute('aria-label', { cast: 'Cast the line', reel: 'Reel in', strike: 'Strike!' }[s]);
  }
  function cast(target) {
    job = { phase: 'cast', t: 0, from: st.pos.clone(), yaw: st.yaw, target, wait: waitTime(), fish: null };
    rod.visible = line.visible = flo.visible = true; if (items.sfx) items.sfx('throw');
  }
  function end() { rod.visible = line.visible = flo.visible = false; if (job && job.fish) scene.remove(job.fish); job = null; }
  function strike() {
    if (!job) return;
    if (job.phase === 'bite') {
      const kind = Math.random() < FC.golden ? 'goldenFish' : 'fish';
      if (!inventory.canAdd(kind)) { say('No room to carry it; you let it go'); job.phase = 'wait'; job.t = 0; job.wait = waitTime(); return; }
      if (Math.random() < FC.fail) { job.phase = 'reel'; job.t = 0; job.kind = null; job.lost = true; job.start = flo.position.clone(); if (waterLife && waterLife.splash) waterLife.splash(job.target.x, SEA_Y + 0.002, job.target.z, 0.4); return; }   // hooked, but it slips off
      job.phase = 'reel'; job.t = 0; job.kind = kind; job.fish = items.model(kind); job.fish.castShadow = true; job.start = flo.position.clone();
      if (items.sfx) items.sfx('stick');
    } else if (job.phase === 'wait' || job.phase === 'cast') { job.phase = 'reel'; job.t = 0; job.kind = null; job.start = flo.position.clone(); }   // reel in empty
  }
  function press() { if (job) strike(); else { const p = spot(); if (p) cast(p); } }
  btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); press(); });
  btn.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => { if (e.code === 'KeyH' && !e.repeat && st.playing) press(); });
  addEventListener('meadow-tap', () => { if (job && job.phase === 'bite') strike(); });   // a tap anywhere strikes

  const tipP = new V(), mid = new V();
  function drawLine(tip, end, sag) {
    for (let i = 0; i < N; i++) { const k = i / (N - 1); mid.lerpVectors(tip, end, k); mid.y -= Math.sin(k * Math.PI) * sag; linePos.set([mid.x, mid.y, mid.z], i * 3); }
    lineG.attributes.position.needsUpdate = true;
  }
  function update(dt) {
    if (!job) { if ((check -= dt) <= 0) { check = 0.2; setBtn(spot() ? 'cast' : ''); } return; }
    // walked off (or left the boat): reel in and stop
    if ((!boating || !boating.anchored) && (st.pos.distanceTo(job.from) > 0.5 || st.aboard)) { end(); setBtn(''); return; }
    job.t += dt;
    const h = hand(), f = new V(-Math.sin(job.yaw), 0, -Math.cos(job.yaw)), lift = job.phase === 'reel' ? 0.9 : job.phase === 'bite' ? 0.75 : 0.62;
    const rd = f.clone().multiplyScalar(Math.cos(lift)).setY(Math.sin(lift)).normalize();
    rod.position.copy(h); rod.quaternion.setFromUnitVectors(up, rd); tipP.copy(h).addScaledVector(rd, FC.rod);
    const bob = Math.sin(job.t * 2.1) * 0.006;
    if (job.phase === 'cast') {   // the float flies out in an arc
      const k = Math.min(1, job.t / FC.castTime); flo.position.lerpVectors(tipP, job.target, k); flo.position.y += Math.sin(k * Math.PI) * 1.2 * (1 - k * 0.3);
      drawLine(tipP, flo.position, 0.02);
      if (k >= 1) { job.phase = 'wait'; job.t = 0; if (waterLife && waterLife.splash) waterLife.splash(job.target.x, SEA_Y + 0.002, job.target.z, 0.25); }
    } else if (job.phase === 'wait') {
      flo.position.set(job.target.x, SEA_Y + 0.005 + bob, job.target.z); drawLine(tipP, flo.position, 0.35);
      if (job.t >= job.wait) { job.phase = 'bite'; job.t = 0; if (waterLife && waterLife.splash) waterLife.splash(job.target.x, SEA_Y + 0.002, job.target.z, 0.35); if (items.sfx) items.sfx('pebble'); }
    } else if (job.phase === 'bite') {   // it bobs and dips: strike now
      flo.position.set(job.target.x, SEA_Y - 0.03 * Math.abs(Math.sin(job.t * 14)) - 0.01, job.target.z); drawLine(tipP, flo.position, 0.12);
      if (job.t > FC.window) { say('It got away'); job.phase = 'wait'; job.t = 0; job.wait = waitTime(); }
    } else if (job.phase === 'reel') {   // float (and fish) come in to the rod tip, then to your hand
      const k = clamp(job.t / FC.reelTime); flo.position.lerpVectors(job.start, tipP, k * k); flo.position.y += Math.sin(k * Math.PI) * 0.4;
      drawLine(tipP, flo.position, 0.05 * (1 - k));
      if (job.fish) { job.fish.position.copy(flo.position).add(new V(0, -0.1, 0)); job.fish.rotation.set(0, job.yaw + Math.PI / 2, Math.sin(job.t * 18) * 0.5 - 1.2); }
      if (k >= 1) {
        const kind = job.kind, lost = job.lost; end();
        if (kind) { inventory.add(kind); say(kind === 'goldenFish' ? 'A golden fish!' : 'You caught a fish'); if (items.sfx) items.sfx('apple'); }
        else if (lost) say('It slipped off the hook');
      }
    }
    setBtn(!job ? (spot() ? 'cast' : '') : job.phase === 'bite' ? 'strike' : job.phase === 'reel' ? '' : 'reel');
  }
  return { update, get job() { return job && { phase: job.phase, t: job.t, wait: job.wait, kind: job.kind }; }, press };
}
