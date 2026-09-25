import * as THREE from 'three';
import { V } from '../core/math.js';
import { U } from '../core/uniforms.js';
import { CONFIG } from '../config.js';
import { HOUSE, CB, PAD_H } from '../world/layout.js';
import { handLantern } from '../assets/cabin/handLantern.js';

/**
 * Carrying the lantern (#22). It stands at the far end of the cabin's porch bench. Near it and looking at it, it glows
 * softly and an icon floats beside it (like the fires' icons): tap it, or press T, to take it; it lights as you lift
 * it. Carried, it hangs in your right hand at the bottom of the view, swinging a little as you walk, and at night it
 * lights the ground, grass, trees and rocks round you (U.uHandLight, the one extra light every outdoor material has,
 * engine/finalizeScene.js; off by day). Back at the bench, the same icon puts it down (and out). While you sleep it
 * waits by the bed, out of view. Whether you carry it is saved. Every number is in CONFIG.lantern.
 */
const ICON_TAKE = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 6.5a4 4 0 0 1 8 0"/><path d="M9 7.5h6l1 2.5v6.5l-1.2 1.5H9.2L8 16.5V10z"/><path d="M12 11.5c.9 1 .9 2.3 0 3-.9-.7-.9-2 0-3z"/><path d="M7 21h10"/></svg>';
const ICON_PUT = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 4.5a4 4 0 0 1 8 0"/><path d="M9 5.5h6l1 2.5v5.5l-1.2 1.5H9.2L8 13.5V8z"/><path d="M12 17v4M9.5 19l2.5 2 2.5-2"/></svg>';

export function createLantern({ scene, camera, st, softDot, skyUniforms }) {
  const LC = CONFIG.lantern, KEY = 'meadow.lantern';
  const L = handLantern({ softDot }); scene.add(L.group);
  const home = new V(HOUSE.x + LC.home[0], PAD_H + LC.home[1], HOUSE.z + CB.ZW + LC.home[2]);   // on the porch bench, its far end from the door
  let carried = false; try { carried = localStorage.getItem(KEY) === '1'; } catch (err) { void err; }
  const save = () => { try { localStorage.setItem(KEY, carried ? '1' : '0'); } catch (err) { void err; } };
  function putHome() { L.group.position.copy(home); L.group.rotation.set(0, LC.homeTurn, 0); L.group.visible = true; }
  if (!carried) putHome();
  L.setLit(carried);

  /* ---- the icon beside it and its glow (the fires' look, styles/main.css #fireIcon) ---- */
  const btn = document.createElement('button'); btn.className = 'glass'; btn.id = 'lanternIcon'; btn.style.display = 'none'; document.body.appendChild(btn);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0xfff2c8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  glow.visible = false; glow.renderOrder = 6; scene.add(glow);
  const mid = home.clone(); mid.y += 0.14;
  const look = new V(), to = new V(), sp = new V();
  /** 'take' when you stand by the bench looking at the lantern, 'put' when you carry it there looking at its place. */
  function offer() {
    if (!st.playing || !st.walk || st.aboard || st.seat || st.inBed || st.chestOpen) return null;
    to.copy(mid).sub(camera.position); const d = to.length(); if (d > LC.reach) return null;
    camera.getWorldDirection(look);
    return to.normalize().dot(look) > Math.cos(LC.cone) ? (carried ? 'put' : 'take') : null;
  }
  let shown = null;
  function show(state, t) {
    if (state !== shown) {
      shown = state; btn.style.display = state ? '' : 'none';
      if (state) { btn.innerHTML = state === 'take' ? ICON_TAKE : ICON_PUT; btn.setAttribute('aria-label', state === 'take' ? 'Take the lantern' : 'Put the lantern back'); }
    }
    glow.visible = !!state; if (!state) return;
    const s = 0.4 * (1 + 0.08 * Math.sin(t * 4)); glow.position.copy(mid); glow.scale.set(s, s, 1);
    sp.copy(mid).project(camera); btn.style.left = ((sp.x + 1) / 2 * innerWidth + 46) + 'px'; btn.style.top = ((1 - sp.y) / 2 * innerHeight) + 'px'; btn.style.visibility = sp.z < 1 ? '' : 'hidden';
  }
  function act() {
    const o = offer(); if (!o) return;
    carried = o === 'take'; L.setLit(carried); if (!carried) putHome(); save(); shown = null;
  }
  btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); act(); });
  btn.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => { if (e.code === 'KeyT' && !e.repeat && st.playing) act(); });

  /* ---- carried: in the right hand, swinging; its light ---- */
  const hand = new V(), q = new THREE.Quaternion(), e = new THREE.Euler(), wp = new V(), vp = new V(), last = new V();
  let swing = 0, swingV = 0, t0 = 0, lastYaw = 0;
  function update(dt, t) {
    show(offer(), t);
    if (!carried) { U.uHandLight.value.w = 0; return; }
    const away = st.inBed;   // sleeping: it waits by the bed, out of view
    L.group.visible = !away;
    // how you move and turn swings it (a damped pendulum)
    const moved = last.distanceTo(camera.position); last.copy(camera.position);
    const turn = ((st.yaw - lastYaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; lastYaw = st.yaw;
    t0 += dt; swingV += (-swing * 30 - swingV * 2.2) * dt + Math.min(moved, 0.2) * Math.sin(t0 * 7.5) * 0.9 + turn * 0.6; swing = Math.max(-0.35, Math.min(0.35, swing + swingV * dt));
    hand.set(LC.hand[0], LC.hand[1], LC.hand[2]).applyQuaternion(camera.quaternion).add(camera.position);
    e.set(0, st.yaw + 0.35, 0); q.setFromEuler(e); L.group.quaternion.copy(q); L.group.rotateZ(swing * 0.5); L.group.rotateX(swing * 0.25);
    L.group.position.copy(hand); L.group.updateMatrixWorld(true);
    // the light: where its flame is, in view space; only at dusk and night
    const night = skyUniforms ? Math.min(1, skyUniforms.uNight.value * 1.4) : 1;
    wp.copy(L.top).applyMatrix4(L.group.matrixWorld);
    if (away) wp.copy(camera.position);
    camera.updateMatrixWorld(); vp.copy(wp).applyMatrix4(camera.matrixWorldInverse.copy(camera.matrixWorld).invert());
    U.uHandLight.value.set(vp.x, vp.y, vp.z, night > 0.02 ? LC.strength * night : 0);
  }
  return { update, get carried() { return carried; }, lantern: L, home };
}
