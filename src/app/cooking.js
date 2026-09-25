import * as THREE from 'three';
import { V, lin } from '../core/math.js';
import { CONFIG } from '../config.js';
import { FIREPITS } from '../world/layout.js';
import { KINDS } from './itemKinds.js';

/**
 * Cooking at a firepit. Sitting on a log round a burning firepit with a food that cooks selected (KINDS[kind].cook:
 * the apple; berries do not), the Use button says Cook. Cook takes one piece: a roasting stick reaches out from your
 * hand towards the fire with it on the end (CONFIG.cook.push seconds), a ring round it fills while it cooks
 * (CONFIG.cook.time seconds, browning as it goes), then the stick comes back the same way and the cooked piece is in
 * your inventory. Standing up or the fire going out stops it: the stick comes back and you keep the raw piece. The
 * stick is only shown; you need not carry one. One piece at a time.
 */
export function createCooking({ scene, camera, st, inventory, items, fires }) {
  const C = CONFIG.cook, up = new V(0, 1, 0);
  const stickMat = new THREE.MeshStandardMaterial({ color: lin(0x7a5a3a), roughness: 0.85, metalness: 0 });
  const note = document.getElementById('fireNote');
  const ring = document.createElement('div'); ring.id = 'cookRing'; ring.className = 'hide';
  ring.innerHTML = '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle class="track" cx="32" cy="32" r="26"/><circle class="fill" cx="32" cy="32" r="26"/></svg>';
  document.body.appendChild(ring);
  const fill = ring.querySelector('.fill'), CIRC = 2 * Math.PI * 26; fill.style.strokeDasharray = CIRC;

  /** The burning firepit you sit at, if any. */
  function pitFire() {
    const S = st.seat; if (!S || !S.seated || S.s.pit === undefined) return null;
    const f = fires.fires.find(q => q.id === 'pit-' + FIREPITS[S.s.pit].name);
    return f && f.lit && f.k > 0.9 ? f : null;
  }
  let job = null, can = false;
  const canCook = kind => !job && !!KINDS[kind] && !!KINDS[kind].cook && !!pitFire();
  inventory.useLabel = kind => canCook(kind) ? 'Cook' : null;
  const eat = inventory.onUse;
  inventory.onUse = kind => canCook(kind) ? start(kind) : eat(kind);

  function say(text) { if (!note) return; note.textContent = text; note.classList.remove('hide'); clearTimeout(say.t); say.t = setTimeout(() => note.classList.add('hide'), 2200); }

  function start(kind) {
    const cooked = KINDS[kind].cook, sel = inventory.selected;
    if (!inventory.canAdd(cooked) && !(sel && sel.kind === kind && sel.n === 1)) { say('No room for the ' + KINDS[cooked].name.toLowerCase()); return false; }
    const f = pitFire(), S = st.seat, s = S.s, E = new V(S.eye.x, S.eye.y, S.eye.z), fw = new V(s.fx, 0, s.fz), rt = new V(-s.fz, 0, s.fx);
    const hand = E.clone().addScaledVector(fw, C.hand[0]).addScaledVector(rt, C.hand[1]).addScaledVector(up, -C.hand[2]);
    const tip = f.at.clone().addScaledVector(fw, -0.05); tip.y += C.over;
    const dir = tip.clone().sub(hand), len = dir.length() + 0.15; dir.normalize();
    const g = new THREE.CylinderGeometry(0.007, 0.011, len, 6); g.translate(0, -len / 2, 0);   // the tip at its origin, the rest back along it
    const stick = new THREE.Mesh(g, stickMat); stick.quaternion.setFromUnitVectors(up, dir); stick.castShadow = true; scene.add(stick);
    const food = items.model(kind); food.castShadow = true;
    const raw = food.isInstancedMesh && food.instanceColor ? new THREE.Color().fromArray(food.instanceColor.array, 0) : null;
    job = { kind, cooked, phase: 'in', t: 0, tip, dir, stick, food, raw, done: false };
    place(0); inventory.refresh(); return true;   // true: the piece leaves the slot
  }
  /** Stick and food with the stick pushed out k 0..1 (eased). */
  function place(k) {
    const e = k * k * (3 - 2 * k), back = C.reach * (1 - e), p = job.tip.clone().addScaledVector(job.dir, -back);
    job.stick.position.copy(p); job.food.position.copy(p).addScaledVector(job.dir, -0.03);
  }
  function brown(k) {
    const im = job.food; if (!job.raw || !im.isInstancedMesh) return;
    im.setColorAt(0, job.raw.clone().lerp(lin(0x5e2a12), k)); im.instanceColor.needsUpdate = true;
  }
  function finish() {
    scene.remove(job.stick); scene.remove(job.food); job.stick.geometry.dispose();
    const got = job.done ? job.cooked : job.kind;
    inventory.add(got); if (job.done && items.sfx) items.sfx('apple');
    job = null; ring.classList.add('hide'); inventory.refresh();
  }
  const sp = new V();
  function update(dt) {
    const c = !!pitFire(); if (c !== can) { can = c; inventory.refresh(); }
    if (!job) return;
    if (!st.seat || !st.seat.seated) { finish(); return; }                                // stood up: straight back to your hand
    if (job.phase !== 'out' && !pitFire()) { job.phase = 'out'; job.t = 0; ring.classList.add('hide'); }   // the fire went out
    job.t += dt; job.food.rotateOnWorldAxis(job.dir, dt * 0.6);
    if (job.phase === 'in') { place(Math.min(1, job.t / C.push)); if (job.t >= C.push) { job.phase = 'cook'; job.t = 0; ring.classList.remove('hide'); } }
    else if (job.phase === 'cook') {
      const k = Math.min(1, job.t / C.time); brown(k); fill.style.strokeDashoffset = CIRC * (1 - k);
      if (k >= 1) { job.done = true; job.phase = 'out'; job.t = 0; ring.classList.add('hide'); }
    } else { place(Math.max(0, 1 - job.t / C.push)); if (job.t >= C.push) { finish(); return; } }
    if (job.phase === 'cook') {   // the ring stays round the food on screen
      sp.copy(job.food.position).project(camera);
      const on = sp.z < 1 && Math.abs(sp.x) < 1.2 && Math.abs(sp.y) < 1.2; ring.style.visibility = on ? '' : 'hidden';
      ring.style.left = ((sp.x + 1) / 2 * innerWidth) + 'px'; ring.style.top = ((1 - sp.y) / 2 * innerHeight) + 'px';
    }
  }
  return { update, get job() { return job && { kind: job.kind, phase: job.phase, t: job.t, done: job.done }; }, get canCook() { return can; } };
}
