import * as THREE from 'three';
import { V, lin } from '../core/math.js';
import { CONFIG } from '../config.js';
import { FIREPITS } from '../world/layout.js';
import { KINDS } from './itemKinds.js';

/**
 * Cooking at a fire. Sitting on a log round a burning firepit, or standing at the cabin's burning fireplace looking in,
 * with a food that cooks selected (KINDS[kind].cook: apple to baked apple, fish to grilled fish; berries do not), the
 * Use button says Cook. Cook takes one piece: a roasting stick reaches out from your
 * hand towards the fire with it on the end (CONFIG.cook.push seconds), a ring round it fills while it cooks
 * (CONFIG.cook.time seconds, browning as it goes), then the stick comes back the same way and the cooked piece is in
 * your inventory. Standing up (or walking off from the fireplace) or the fire going out stops it: the stick comes back and you keep the raw piece. The
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

  /** The burning fire you can cook at, if any: the firepit you sit at, or the cabin's fireplace when you stand at it
   *  looking in (CONFIG.cook.hearth m from it). */
  const look = new V();
  function pitFire() {
    const S = st.seat, lit = f => f && f.lit && f.k > 0.9 ? f : null;
    if (S) return S.seated && S.s.pit !== undefined ? lit(fires.fires.find(q => q.id === 'pit-' + FIREPITS[S.s.pit].name)) : null;
    const fp = fires.fires.find(q => q.id === 'fireplace');
    if (!fp || !st.walk || !st.grounded || st.aboard || st.inBed || st.chestOpen || !fp.near(st.pos) || st.pos.distanceTo(fp.at) > C.hearth) return null;
    look.set(-Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(st.yaw) * Math.cos(st.pitch));
    return fp.at.clone().sub(st.pos).normalize().dot(look) > Math.cos(0.6) ? lit(fp) : null;
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
    const f = pitFire(), S = st.seat, E = S ? new V(S.eye.x, S.eye.y, S.eye.z) : st.pos.clone();
    const fw = S ? new V(S.s.fx, 0, S.s.fz) : f.at.clone().sub(E).setY(0).normalize(), rt = new V(-fw.z, 0, fw.x);
    const hand = E.clone().addScaledVector(fw, C.hand[0]).addScaledVector(rt, C.hand[1]).addScaledVector(up, -C.hand[2]);
    const tip = f.at.clone().addScaledVector(fw, S ? -0.05 : -0.12); tip.y += S ? C.over : 0.05;
    const dir = tip.clone().sub(hand), len = dir.length() + 0.15; dir.normalize();
    const g = new THREE.CylinderGeometry(0.007, 0.011, len, 6); g.translate(0, -len / 2, 0);   // the tip at its origin, the rest back along it
    const stick = new THREE.Mesh(g, stickMat); stick.quaternion.setFromUnitVectors(up, dir); stick.castShadow = true; scene.add(stick);
    const food = items.model(kind); food.castShadow = true;
    let raw = food.isInstancedMesh && food.instanceColor ? new THREE.Color().fromArray(food.instanceColor.array, 0) : null;
    if (!food.isInstancedMesh) { food.material = food.material.clone(); raw = food.material.color.clone(); }   // browns on its own
    job = { kind, cooked, phase: 'in', t: 0, tip, dir, stick, food, raw, done: false, seated: !!S, from: st.pos.clone() };
    place(0); inventory.refresh(); return true;   // true: the piece leaves the slot
  }
  /** Stick and food with the stick pushed out k 0..1 (eased). */
  function place(k) {
    const e = k * k * (3 - 2 * k), back = C.reach * (1 - e), p = job.tip.clone().addScaledVector(job.dir, -back);
    job.stick.position.copy(p); job.food.position.copy(p).addScaledVector(job.dir, -0.03);
  }
  function brown(k) {
    const im = job.food; if (!job.raw) return;
    const c = job.raw.clone().lerp(lin(0x5e2a12), k * (job.kind === 'fish' ? 0.6 : 1));
    if (im.isInstancedMesh) { im.setColorAt(0, c); im.instanceColor.needsUpdate = true; } else im.material.color.copy(c);
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
    if (job.seated ? !st.seat || !st.seat.seated : st.pos.distanceTo(job.from) > 0.45 || st.seat || st.aboard) { finish(); return; }   // stood up or walked off: straight back to your hand
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
