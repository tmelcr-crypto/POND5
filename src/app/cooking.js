import * as THREE from 'three';
import { V, lin } from '../core/math.js';
import { CONFIG } from '../config.js';
import { FIREPITS } from '../world/layout.js';
import { KINDS } from './itemKinds.js';
import { mergeGeos } from '../core/geometry.js';

/**
 * Cooking at a fire. Sitting on a log round a burning firepit, or standing at one or at the cabin's fireplace looking at it,
 * with a food that cooks selected (KINDS[kind].cook: apple to baked apple, fish to grilled fish, bolete to roasted bolete; berries do not), the
 * Use button says Cook. Cook takes one piece: a roasting stick reaches out from your
 * hand towards the fire with it on the end (CONFIG.cook.push seconds), a ring round it fills while it cooks
 * (CONFIG.cook.time seconds, browning as it goes), then the stick comes back the same way and the cooked piece is in
 * your inventory. Standing up (or walking off from the fireplace) or the fire going out stops it: the stick comes back and you keep the raw piece. The
 * stick is only shown; you need not carry one. One piece at a time.
 */
export function createCooking({ scene, camera, st, inventory, items, fires, tex = {} }) {
  const C = CONFIG.cook, up = new V(0, 1, 0), BROWN = { fish: 0.6, mushroom: 0.5, potato: 0.55, pumpkin: 0.45 };   // how far each browns
  const stickMat = new THREE.MeshStandardMaterial({ map: tex.barkTex || null, vertexColors: true, roughness: 0.9, metalness: 0 });
  /**
   * A roasting stick cut from a branch, len long, its tip (where the food goes) at the origin and the rest back along -y:
   * a little crooked, thicker at the hand, the bark peeled to a pale whittled point that is charred at the very end, a
   * few knots and the stubs of cut side twigs. Bark texture and vertex colours; a new one (its own wobble) each time.
   */
  function stickGeo(len) {
    const rr = (a, b) => a + (b - a) * Math.random(), ph = rr(0, 6.28), ph2 = rr(0, 6.28), parts = [];
    const bark = new THREE.Color(0.78, 0.66, 0.54), wood = new THREE.Color(0.95, 0.82, 0.6), char = new THREE.Color(0.16, 0.11, 0.08);
    const at = t => new THREE.Vector3(0.011 * Math.sin(t * 5.2 + ph) * t + 0.006 * Math.sin(t * 13 + ph2) * t, -t * len, 0.01 * Math.sin(t * 4.1 + ph2) * t + 0.005 * Math.sin(t * 11 + ph) * t);
    const rad = t => (0.0055 + 0.0055 * t) * (t < 0.06 ? 0.25 + 0.75 * t / 0.06 : 1);   // whittled to a point
    const N = 40, R = 8, pos = [], uv = [], col = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N, c = at(t), r = rad(t), tint = t < 0.02 ? char : t < 0.075 ? wood.clone().lerp(char, Math.max(0, 0.035 - t) * 20) : t < 0.085 ? wood.clone().lerp(bark, (t - 0.075) * 100) : bark.clone().multiplyScalar(0.9 + 0.2 * Math.sin(t * 37 + ph));
      for (let j = 0; j <= R; j++) { const a = j / R * Math.PI * 2; pos.push(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r); uv.push(j / R, t * len * 3); col.push(tint.r, tint.g, tint.b); }
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < R; j++) { const a = i * (R + 1) + j, b = a + R + 1; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
    parts.push(g);
    const paint = (geo, c) => { const n = geo.attributes.position.count, a = new Float32Array(n * 3); for (let k = 0; k < n; k++) c.toArray(a, k * 3); geo.setAttribute('color', new THREE.BufferAttribute(a, 3)); return geo; };
    for (const t of [0.34, 0.58, 0.8]) {   // cut side twigs, pointing back towards the hand, and a knot beside each
      const c = at(t), r = rad(t), a = rr(0, 6.28), l = rr(0.035, 0.07), tw = new THREE.CylinderGeometry(r * 0.35, r * 0.5, l, 6); tw.translate(0, l / 2, 0);
      const dirT = new THREE.Vector3(Math.cos(a), -0.9, Math.sin(a)).normalize();
      tw.applyMatrix4(new THREE.Matrix4().compose(c.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.6, 0, Math.sin(a) * r * 0.6)), new THREE.Quaternion().setFromUnitVectors(up, dirT), new THREE.Vector3(1, 1, 1)));
      parts.push(paint(tw, bark.clone().multiplyScalar(0.85)));
      const kn = new THREE.SphereGeometry(r * 0.55, 8, 6); kn.scale(1, 1.4, 1); const b = a + Math.PI * rr(0.6, 1.4); kn.translate(c.x + Math.cos(b) * r * 0.85, c.y - 0.03, c.z + Math.sin(b) * r * 0.85);
      parts.push(paint(kn, bark.clone().multiplyScalar(0.7)));
      const cut = new THREE.CircleGeometry(r * 0.35, 8); cut.rotateX(-Math.PI / 2); cut.translate(0, l, 0);   // the pale cut end of the twig
      cut.applyMatrix4(new THREE.Matrix4().compose(c.clone().add(new THREE.Vector3(Math.cos(a) * r * 0.6, 0, Math.sin(a) * r * 0.6)), new THREE.Quaternion().setFromUnitVectors(up, dirT), new THREE.Vector3(1, 1, 1)));
      parts.push(paint(cut, wood));
    }
    return mergeGeos(parts, ['position', 'normal', 'uv', 'color']);
  }
  const note = document.getElementById('fireNote');
  const ring = document.createElement('div'); ring.id = 'cookRing'; ring.className = 'hide';
  ring.innerHTML = '<svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle class="track" cx="32" cy="32" r="26"/><circle class="fill" cx="32" cy="32" r="26"/></svg>';
  document.body.appendChild(ring);
  const fill = ring.querySelector('.fill'), CIRC = 2 * Math.PI * 26; fill.style.strokeDasharray = CIRC;

  /** The burning fire you can cook at, if any: the firepit you sit at; or, standing, the cabin's fireplace (looking in,
   *  CONFIG.cook.hearth m from it) or a firepit (looking at it, CONFIG.cook.stand m from it, across the ground). */
  const look = new V(), to = new V();
  function pitFire() {
    const S = st.seat, lit = f => f && f.lit && f.k > 0.9 ? f : null;
    if (S) return S.seated && S.s.pit !== undefined ? lit(fires.fires.find(q => q.id === 'pit-' + FIREPITS[S.s.pit].name)) : null;
    if (!st.walk || !st.grounded || st.aboard || st.inBed || st.chestOpen) return null;
    look.set(-Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(st.yaw) * Math.cos(st.pitch));
    let best = null, bd = Math.cos(0.6);
    for (const f of fires.fires) {
      const pit = f.id.startsWith('pit-'); if (!pit && f.id !== 'fireplace') continue;
      if (!f.near(st.pos) || (pit ? Math.hypot(f.at.x - st.pos.x, f.at.z - st.pos.z) > C.stand : st.pos.distanceTo(f.at) > C.hearth)) continue;
      const a = to.copy(f.at).sub(st.pos).normalize().dot(look); if (a > bd) { bd = a; best = f; }
    }
    return lit(best);
  }
  let job = null, can = false;
  const canCook = kind => !job && !!KINDS[kind] && !!KINDS[kind].cook && !!pitFire();
  const label = inventory.useLabel; inventory.useLabel = kind => canCook(kind) ? 'Cook' : label(kind);   // (after app/fires.js: Burn)
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
    const g = stickGeo(len);   // the tip at its origin, the rest back along it
    const stick = new THREE.Mesh(g, stickMat); stick.quaternion.setFromUnitVectors(up, dir); stick.castShadow = true; scene.add(stick);
    const food = items.model(kind); food.castShadow = true;
    if (food.isInstancedMesh && !food.instanceColor) food.setColorAt(0, new THREE.Color(1, 1, 1));   // vertex-coloured (a bolete): a tint to brown it with
    let raw = food.isInstancedMesh && food.instanceColor ? new THREE.Color().fromArray(food.instanceColor.array, 0) : null;
    if (!food.isInstancedMesh) { food.material = food.material.clone(); raw = food.material.color.clone(); }   // browns on its own
    job = { kind, cooked, fire: f, phase: 'in', t: 0, p: 0, tip, dir, stick, food, raw, done: false, seated: !!S, from: st.pos.clone() };
    place(0); inventory.refresh(); return true;   // true: the piece leaves the slot
  }
  /** Stick and food with the stick pushed out k 0..1 (eased). */
  function place(k) {
    const e = k * k * (3 - 2 * k), back = C.reach * (1 - e), p = job.tip.clone().addScaledVector(job.dir, -back);
    job.stick.position.copy(p); job.food.position.copy(p).addScaledVector(job.dir, -0.03);
  }
  function brown(k) {
    const im = job.food; if (!job.raw) return;
    const c = job.raw.clone().lerp(lin(0x5e2a12), k * (BROWN[job.kind] || 1));
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
    if (job.phase !== 'out' && !(job.fire.lit && job.fire.k > 0.9)) { job.phase = 'out'; job.t = 0; ring.classList.add('hide'); }   // the fire went out (looking away is fine)
    job.t += dt; job.food.rotateOnWorldAxis(job.dir, dt * 0.6);
    if (job.phase === 'in') { place(Math.min(1, job.t / C.push)); if (job.t >= C.push) { job.phase = 'cook'; job.t = 0; ring.classList.remove('hide'); } }
    else if (job.phase === 'cook') {   // a flared-up fire (fed a stick, app/fires.js) cooks faster
      job.p = Math.min(1, job.p + dt * (job.fire.boost > 0 ? CONFIG.fire.boost.cook : 1) / C.time);
      const k = job.p; brown(k); fill.style.strokeDashoffset = CIRC * (1 - k);
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
