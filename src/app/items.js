import * as THREE from 'three';
import { V, clamp, lin } from '../core/math.js';
import { U } from '../core/uniforms.js';
import { CONFIG } from '../config.js';
import { H, WATER_Y, SEA_Y, ROSE, lakeD, streamAt, jettyDeckY, bridgeDeckY } from '../world/layout.js';
import { KINDS, iconSvg } from './itemKinds.js';

/**
 * Picking things up and using them (what you carry: app/inventory.js; the kinds: app/itemKinds.js).
 *  - sources: the plot's apples (on the reference tree and under it), its spruce's cones and the rose's fallen petals;
 *    the island's cones and sticks (world/undergrowth.js), the stream's pebbles, the windfall apples, berries and
 *    pebbles of assets/vegetation/forage.js; what small moments drops (apples, cones, gust petals) and what you throw;
 *    and petals straight off any rose bush (CONFIG.items.rosePetals a day each).
 *  - aim: whatever is in the middle of the screen (no crosshair) and within reach: CONFIG.items.reach around you, from
 *    the ground to a little above your head (your hand gets within 0.4 m: you crouch for low things, reach up for high
 *    ones). The item glows softly and its icon shows below the middle of the screen.
 *  - tap (a short touch, a click, or E): you crouch or reach, the item flies to you and is in your inventory, with a
 *    small sound of its own. If you cannot carry it, the icon shakes. Not while sitting, in bed or aboard.
 *  - use (the Use button, right click or F): apples and berries are eaten; pebbles, cones and sticks are thrown in an
 *    arc where you look (they splash into water, or lie where they land to be picked up again); a petal is let go
 *    and drifts off on the wind. Sitting, in bed or aboard only eating and throwing.
 *  - what you take comes back after an in-game day. Taken things and the day count are saved in the browser.
 */
export function createItems({ scene, camera, st, clock, inventory, ambience, waterLife, moments, undergrowth, stream, forage, softDot }) {
  const IC = CONFIG.items, PC = CONFIG.player, KEY = 'meadow.items';
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), m4 = new THREE.Matrix4();

  /* ---- in-game time (the running clock) and what has been taken ---- */
  let total = 0, prevH = clock.hours, taken = {}, dirty = false, saveIn = 0;
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d) { total = +d.total || 0; taken = d.taken || {}; } } catch (err) { void err; /* private mode */ }

  /* ---- sources: fixed places (hide / show by index), on a 1 m grid ---- */
  const sources = [], grid = new Map(), gk = (i, j) => i * 73856093 ^ j * 19349663;
  const protos = {};   // per kind, the look of one real item (for what you throw or let go)
  /** look(i): the item's own geometry, material, matrix and colour, so what flies to you is exactly what lay there. */
  function addSource(id, kind, points, hide, show, look) {
    const s = { id, kind, points, hide, show, look }, si = sources.push(s) - 1;
    if (look && points.length && !protos[kind]) protos[kind] = look(0);
    points.forEach((p, i) => { const k = gk(Math.floor(p.x), Math.floor(p.z)); (grid.get(k) || grid.set(k, []).get(k)).push([si, i]); });
    for (const key in taken) { const [sid, i] = key.split(':'); if (sid === id && points[+i]) hide(+i); }   // still gone from before
  }
  function imSource(id, kind, im, from = 0) {   // an InstancedMesh's instances from `from` on
    if (!im) return;
    const pts = [], saved = new Map();
    for (let i = from; i < im.count; i++) { im.getMatrixAt(i, m4); pts.push(new V().setFromMatrixPosition(m4)); }
    addSource(id, kind, pts,
      i => { im.getMatrixAt(i + from, m4); if (!saved.has(i)) saved.set(i, m4.clone()); im.setMatrixAt(i + from, zero); im.instanceMatrix.needsUpdate = true; },
      i => { const m = saved.get(i); if (m) { im.setMatrixAt(i + from, m); im.instanceMatrix.needsUpdate = true; } },
      i => { const m = saved.get(i) || (im.getMatrixAt(i + from, m4), m4.clone()), c = im.instanceColor ? new THREE.Color().fromArray(im.instanceColor.array, (i + from) * 3) : null; return { geo: im.geometry, mat: im.material, m, color: c }; });
  }
  const P = moments && moments.parts;
  if (P) { imSource('plotApple', 'apple', P.appleIM); imSource('plotCone', 'cone', P.coneIM); imSource('plotPetal', 'petal', P.groundPetals); }
  if (undergrowth) for (const [id, kind, t] of [['cone', 'cone', undergrowth.cones], ['stick', 'stick', undergrowth.sticks]]) if (t) addSource(id, kind, t.positions(), i => t.hide(i), i => t.show(i), i => t.look(i));
  if (stream) imSource('streamPebble', 'pebble', stream.stones, stream.pebbleFrom);
  if (forage) for (const [id, kind, f] of [['windfall', 'apple', forage.windfalls], ['berry', 'berry', forage.berries], ['pebble', 'pebble', forage.pebbles]]) addSource(id, kind, f.points, f.hide, f.show, f.look);
  // rose bushes: petals picked straight off them (a few a day each)
  const roses = [{ x: ROSE.x, z: ROSE.z, y: H(ROSE.x, ROSE.z), h: 0.9, r: 0.45 }];
  if (undergrowth) undergrowth.roses.forEach(r => { const v = undergrowth.roseVariants[r.variant]; roses.push({ x: r.x, z: r.z, y: r.y, h: (v.height || 0.9) * r.s, r: 0.45 * r.s }); });

  /* ---- models: what flies to you, is thrown, or drifts away: a one-instance copy of the real item (its own geometry,
     material, size, turn and colour; one instance keeps every instanced attribute and shader patch working) ---- */
  const models = {}, mq = new THREE.Quaternion(), ms = new V(), mp = new V();
  function model(kind, look) {
    const L = look || protos[kind];
    if (L) {
      const im = new THREE.InstancedMesh(L.geo, L.mat, 1); L.m.decompose(mp, mq, ms);
      im.setMatrixAt(0, m4.compose(mp.set(0, 0, 0), mq, ms)); if (L.color) im.setColorAt(0, L.color);
      im.frustumCulled = false; im.castShadow = kind !== 'petal'; im.receiveShadow = true; im.userData.dynamic = true; scene.add(im); return im;
    }
    if (!models[kind]) {
      const K = KINDS[kind], mat = new THREE.MeshStandardMaterial({ color: lin(K.color), roughness: 0.6, metalness: 0, side: kind === 'petal' ? THREE.DoubleSide : THREE.FrontSide, flatShading: kind === 'pebble' });
      const geo = kind === 'cone' ? new THREE.ConeGeometry(0.028, 0.08, 8).rotateX(Math.PI / 2) : kind === 'stick' ? new THREE.CylinderGeometry(0.009, 0.012, 0.3, 5).rotateZ(Math.PI / 2)
        : kind === 'pebble' ? new THREE.IcosahedronGeometry(0.025, 0).scale(1, 0.6, 0.8) : kind === 'petal' ? new THREE.PlaneGeometry(0.036, 0.03) : new THREE.SphereGeometry(K.r, 10, 8);
      models[kind] = { geo, mat };
    }
    const m = new THREE.Mesh(models[kind].geo, models[kind].mat); m.castShadow = kind !== 'petal'; scene.add(m); return m;
  }

  /* ---- sounds: tiny synthesised effects through the ambience's master volume ---- */
  let noiseBuf = null;
  function sfx(type) {
    const A = ambience && ambience.audio; if (!A) return;
    const { ac, out } = A, t = ac.currentTime;
    if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const env = (node, dur, g, at = 0) => { const v = ac.createGain(); v.gain.setValueAtTime(0, t + at); v.gain.linearRampToValueAtTime(g, t + at + 0.005); v.gain.exponentialRampToValueAtTime(0.0008, t + at + dur); node.connect(v); v.connect(out); };
    const noise = (dur, f, q, g, type = 'bandpass', at = 0) => { const s = ac.createBufferSource(); s.buffer = noiseBuf; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; s.connect(fl); env(fl, dur, g, at); s.start(t + at, Math.random() * 0.5, dur + 0.05); };
    const tone = (f0, f1, dur, g, at = 0) => { const o = ac.createOscillator(); o.frequency.setValueAtTime(f0, t + at); o.frequency.exponentialRampToValueAtTime(f1, t + at + dur); env(o, dur, g, at); o.start(t + at); o.stop(t + at + dur + 0.05); };
    ({
      apple: () => { tone(240, 170, 0.1, 0.22); noise(0.05, 1400, 1, 0.08); },
      berry: () => { tone(900, 620, 0.05, 0.1); tone(1100, 800, 0.04, 0.06, 0.05); },
      cone: () => noise(0.12, 2600, 2, 0.16),
      stick: () => { noise(0.05, 3600, 3, 0.22); tone(520, 300, 0.04, 0.06); },
      pebble: () => { tone(1900, 1600, 0.05, 0.16); tone(2700, 2400, 0.04, 0.08, 0.03); },
      petal: () => noise(0.22, 6200, 0.7, 0.05, 'highpass'),
      crunch: () => { for (let i = 0; i < 3; i++) noise(0.07, 1800, 0.6, 0.2, 'lowpass', i * 0.12); },
      throw: () => noise(0.16, 1400, 0.6, 0.07),
      splash: () => { noise(0.45, 900, 0.7, 0.28, 'lowpass'); noise(0.2, 2400, 1, 0.08, 'bandpass', 0.05); },
      thud: () => { tone(160, 90, 0.08, 0.18); noise(0.05, 700, 1, 0.08); },
      full: () => tone(260, 200, 0.12, 0.08),
      creak: () => { const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(95, t + 0.35); const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6; o.connect(f); env(f, 0.4, 0.05); o.start(t); o.stop(t + 0.45); noise(0.3, 1200, 4, 0.04); },
      clunk: () => { tone(120, 70, 0.12, 0.2); noise(0.06, 500, 1, 0.1); },
    }[type] || (() => {}))();
  }

  /* ---- aim: the thing in the middle of the view, within reach ---- */
  const hint = document.createElement('div'); hint.id = 'aimHint'; hint.className = 'glass hide'; document.body.appendChild(hint);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0xfff2c8, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.visible = false; glow.renderOrder = 6; scene.add(glow);
  const thrown = [], flying = [], drifting = [];
  const dir = new V(), v = new V();
  let aimed = null, hintKind = '';
  const canAim = () => st.playing && st.walk && st.grounded && !st.aboard && !st.seat && !st.inBed && !st.chestOpen && !pick;
  function test(p, r, eye, feet, best) {
    const dx = p.x - eye.x, dz = p.z - eye.z;
    if (dx * dx + dz * dz > IC.reach * IC.reach || p.y < feet - 0.3 || p.y > eye.y + IC.above) return best;
    v.set(p.x - eye.x, p.y - eye.y, p.z - eye.z); const t = v.dot(dir); if (t < 0.1) return best;
    const perp = v.addScaledVector(dir, -t).length(), tol = r + 0.05 + 0.05 * t, sc = perp / tol;
    return sc < 1 && (!best || sc < best.sc) ? { sc } : best;
  }
  function findAim() {
    const eye = camera.position, feet = eye.y - PC.eyeHeight; camera.getWorldDirection(dir);
    let best = null;
    const ci = Math.floor(eye.x), cj = Math.floor(eye.z);
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const l = grid.get(gk(i, j)); if (!l) continue;
      for (const [si, k] of l) {
        const s = sources[si]; if (taken[s.id + ':' + k] !== undefined) continue;
        const b = test(s.points[k], KINDS[s.kind].r, eye, feet, best); if (b !== best) { best = b; best.what = { type: 'static', si, k, kind: s.kind, p: s.points[k] }; }
      }
    }
    const loose = (moments ? moments.loose() : []).concat(thrown.filter(o => o.rest).map(o => ({ kind: o.kind, p: o.mesh.position, obj: o, mine: true })));
    for (const it of loose) { const b = test(it.p, KINDS[it.kind].r, eye, feet, best); if (b !== best) { best = b; best.what = { type: 'loose', it, kind: it.kind, p: it.p }; } }
    roses.forEach((r, i) => {
      const c = new V(r.x, r.y + r.h * 0.55, r.z), b = test(c, r.r, eye, feet, best);
      if (b !== best && roseLeft(i) > 0) { best = b; best.what = { type: 'rose', i, kind: 'petal', p: c }; }
    });
    return best ? best.what : null;
  }
  const roseLeft = i => IC.rosePetals - Object.keys(taken).filter(k => k.startsWith('rose:' + i + ':')).length;

  /* ---- pick up: crouch or reach, the item flies to you ---- */
  let pick = null;
  function tryPick() {
    if (!aimed || !canAim()) return;
    const kind = aimed.kind;
    if (!inventory.canAdd(kind)) { hint.classList.remove('shake'); void hint.offsetWidth; hint.classList.add('shake'); sfx('full'); return; }
    const a = aimed, from = a.p.clone ? a.p.clone() : new V(a.p.x, a.p.y, a.p.z), eye = camera.position.clone(), feet = eye.y - PC.eyeHeight;
    if (a.type === 'static') { const s = sources[a.si]; s.hide(a.k); taken[s.id + ':' + a.k] = total; dirty = true; }
    else if (a.type === 'loose') { if (a.it.mine) { scene.remove(a.it.obj.mesh); thrown.splice(thrown.indexOf(a.it.obj), 1); } else moments.take(a.it); }
    else if (a.type === 'rose') { taken['rose:' + a.i + ':' + Math.random().toString(36).slice(2, 7)] = total; dirty = true; }
    const dip = from.y < feet + 0.7 ? clamp(eye.y - (from.y + 0.95), 0, 0.75) : 0, reachUp = from.y > eye.y - 0.25 ? 0.07 : 0;
    const look = a.type === 'static' && sources[a.si].look ? sources[a.si].look(a.k) : a.type === 'loose' && !a.it.mine && protos[kind] && a.it.obj.q ? { ...protos[kind], m: new THREE.Matrix4().compose(new V(), a.it.obj.q, a.it.obj.s || new V(1, 1, 1)) } : null;
    const m = a.type === 'loose' && a.it.mine ? a.it.obj.mesh : model(kind, look); m.position.copy(from); scene.add(m);
    pick = { t: 0, dur: IC.pickTime, base: st.pos.clone(), dip, reachUp, from, m, kind, done: false };
    aimed = null; glow.visible = false; hint.classList.add('hide');
  }
  addEventListener('meadow-tap', tryPick);
  /** The pick-up animation has the camera while it plays (app/controls.js takeover). */
  function pickUpdate(dt) {
    if (!pick) return false;
    const P2 = pick; P2.t += dt; const k = Math.min(1, P2.t / P2.dur), bow = Math.sin(k * Math.PI);
    camera.position.set(P2.base.x, P2.base.y - P2.dip * bow + P2.reachUp * bow, P2.base.z);
    camera.rotation.set(st.pitch + P2.reachUp * 2 * bow, st.yaw, 0);
    const f = clamp((k - 0.25) / 0.5); camera.getWorldDirection(dir);
    const hand = camera.position.clone().addScaledVector(dir, 0.25); hand.y -= 0.18;
    P2.m.position.lerpVectors(P2.from, hand, f * f); P2.m.scale.setScalar(1 - 0.8 * f); P2.m.rotation.y += dt * 6;
    if (k >= 0.75 && !P2.done) { P2.done = true; scene.remove(P2.m); inventory.add(P2.kind); sfx(P2.kind); }
    if (k >= 1) { pick = null; camera.position.copy(st.pos); }
    return true;
  }

  /* ---- use ---- */
  function use(kind) {
    const K = KINDS[kind], busy = st.aboard || st.seat || st.inBed;
    camera.getWorldDirection(dir);
    if (K.use === 'eat') { sfx('crunch'); return true; }
    if (K.use === 'throw') {
      const m = model(kind), p = camera.position.clone().addScaledVector(dir, 0.35); p.y -= 0.12; m.position.copy(p);
      thrown.push({ kind, mesh: m, v: dir.clone().multiplyScalar(IC.throwSpeed).add(new V(0, 2.2, 0)), spin: new V(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6), rest: false, bounced: false });
      sfx('throw'); return true;
    }
    if (K.use === 'release' && !busy) {
      const m = model(kind), p = camera.position.clone().addScaledVector(dir, 0.3); p.y -= 0.1; m.position.copy(p);
      drifting.push({ mesh: m, t: 0, ph: Math.random() * 6, landed: -1 }); sfx('petal'); return true;
    }
    return false;
  }
  inventory.onUse = use;

  const waterAt = (x, z) => {   // the water's level at (x, z), or -Infinity where it is dry
    let w = -Infinity; const g = H(x, z);
    if (g < SEA_Y) w = SEA_Y;
    if (lakeD(x, z) < 1.1 && g < WATER_Y) w = Math.max(w, WATER_Y);
    const q = streamAt(x, z); if (q && q.d < q.w) w = Math.max(w, q.W);
    return w;
  };
  const floorAt = (x, z, y) => { let g = H(x, z); for (const d of [jettyDeckY(x, z), bridgeDeckY(x, z)]) if (d > g && d <= y + 0.05) g = d; return g; };

  function update(dt) {
    const h = clock.hours, d = ((h - prevH) % 24 + 24) % 24; prevH = h; if (d < 3) total += d;
    // aim
    if (canAim()) {
      aimed = findAim();
      if (aimed) { glow.visible = true; glow.position.copy(aimed.p).lerp(camera.position, 0.04); const s = 0.12 + KINDS[aimed.kind].r * 3 + 0.02 * Math.sin(performance.now() * 0.006); glow.scale.set(s, s, 1); }
      else glow.visible = false;
    } else { aimed = null; glow.visible = false; }
    const hk = aimed ? aimed.kind : ''; if (hk !== hintKind) { hintKind = hk; hint.classList.toggle('hide', !hk); if (hk) hint.innerHTML = iconSvg(hk, 26); }
    // thrown things: fly, splash, or come to rest (then they can be picked up again)
    for (let i = thrown.length - 1; i >= 0; i--) {
      const o = thrown[i]; if (o.rest) continue;
      o.v.y -= 9.8 * dt; o.mesh.position.addScaledVector(o.v, dt); o.mesh.rotation.x += o.spin.x * dt; o.mesh.rotation.y += o.spin.y * dt; o.mesh.rotation.z += o.spin.z * dt;
      const p = o.mesh.position, w = waterAt(p.x, p.z), g = floorAt(p.x, p.z, p.y), r = o.kind === 'stick' ? 0.012 : KINDS[o.kind].r;
      if (w > g && p.y <= w) { if (waterLife && waterLife.splash) waterLife.splash(p.x, w + 0.002, p.z, 0.35); sfx('splash'); scene.remove(o.mesh); thrown.splice(i, 1); continue; }
      if (p.y - r <= g) {
        p.y = g + r;
        if (!o.bounced && o.v.y < -3) { o.bounced = true; o.v.set(o.v.x * 0.3, -o.v.y * 0.25, o.v.z * 0.3); sfx('thud'); }
        else { o.rest = true; o.mesh.rotation.x = o.kind === 'stick' ? 0 : o.mesh.rotation.x; if (!o.bounced) sfx('thud'); }
      }
      if (p.y < -20) { scene.remove(o.mesh); thrown.splice(i, 1); }
    }
    while (thrown.filter(o => o.rest).length > IC.maxThrown) { const o = thrown.find(q => q.rest); scene.remove(o.mesh); thrown.splice(thrown.indexOf(o), 1); }
    // petals let go: drift with the wind, sink slowly, lie a moment and are gone
    const wd = U.uWindDir.value, ws = U.uWind.value;
    for (let i = drifting.length - 1; i >= 0; i--) {
      const q = drifting[i]; q.t += dt; const p = q.mesh.position;
      if (q.landed < 0) {
        p.x += (wd.x * ws * 0.9 + Math.sin(q.t * 2.3 + q.ph) * 0.25) * dt; p.z += (wd.y * ws * 0.9 + Math.cos(q.t * 1.9 + q.ph) * 0.25) * dt; p.y -= 0.22 * dt;
        q.mesh.rotation.set(Math.sin(q.t * 3 + q.ph) * 1.2, q.t * 2, Math.cos(q.t * 2.2) * 0.8);
        const g = Math.max(floorAt(p.x, p.z, p.y), waterAt(p.x, p.z)); if (p.y <= g + 0.004) { p.y = g + 0.004; q.landed = q.t; q.mesh.rotation.set(-Math.PI / 2, 0, q.ph); }
      } else if (q.t - q.landed > 4) { scene.remove(q.mesh); drifting.splice(i, 1); }
    }
    // taken things come back after an in-game day
    if ((saveIn -= dt) <= 0) {
      saveIn = 1;
      for (const key in taken) {
        if (total - taken[key] < IC.respawn) continue;
        const [sid, i] = key.split(':'); const s = sources.find(x => x.id === sid); if (s) s.show(+i);
        delete taken[key]; dirty = true;
      }
      if (dirty) { dirty = false; try { localStorage.setItem(KEY, JSON.stringify({ total, taken })); } catch (err) { void err; } }
    }
  }
  return { update, pickUpdate, use, sfx, get aimed() { return aimed; }, get counts() { return { sources: sources.map(s => [s.id, s.points.length]), thrown: thrown.length, taken: Object.keys(taken).length }; } };
}
