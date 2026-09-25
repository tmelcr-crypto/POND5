import * as THREE from 'three';
import { V } from '../core/math.js';
import { CONFIG } from '../config.js';

/**
 * Lighting and putting out fires. Every fire on the island registers here with add() (today: the cabin's fireplace,
 * from main.js; a campfire would be one more add). Near a fire, looking at it, it glows softly and an icon floats right
 * next to it (as when picking things up); tap the icon (or X) to light it or put it
 * out: lit, the flames catch over CONFIG.fire.catch seconds; put out, they die down over CONFIG.fire.out seconds and
 * the embers keep glowing (and the chimney smoking) for CONFIG.fire.embers seconds more. Each fire is remembered
 * (localStorage), lit by default.
 *
 * A fire: { id, at: Vector3 (world, the middle of the flames), near(p) -> bool (may the player at p reach it: inside
 * the same room, say), set(k, e), fuel?: { kinds, n } }, where set shows it burning k 0..1 with embers e 0..1 (hot) and
 * is called whenever those change; with fuel, lighting it takes n pieces of those kinds from what you carry (the firepits:
 * 3 sticks or cones; without them a note says so). You can light or put out a fire sitting as well (on a log round it).
 * Fires with fuel start out cold. Lamps and candles join too (quick: on or off at once; label: what the button
 * names; save: false, since the Cabin lights and dusk switch them all).
 *
 * Feeding a fire: looking at a burning fire with a stick, a cone or driftwood selected, the Use button says Burn and
 * tosses it in (it flies from your hand into the flames): the fire flares up CONFIG.fire.boost.size times bigger for
 * CONFIG.fire.boost.time seconds (again from the start with each piece) and cooks CONFIG.fire.boost.cook times faster
 * (app/cooking.js reads f.boost). set(k, e, b) then gets b 0..1, how far into the flare it is.
 */
const ICON_LIGHT = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c.6 3.2 4.8 5.2 4.8 10a4.8 4.8 0 0 1-9.6 0c0-2.4 1.2-3.8 2.3-5 .3 1.5 1 2.4 2 2.8C11 8.6 11.2 5.6 12 3z"/><path d="M5 21h14"/></svg>';
const ICON_OUT = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c.6 3.2 4.8 5.2 4.8 10a4.8 4.8 0 0 1-9.6 0c0-2.4 1.2-3.8 2.3-5 .3 1.5 1 2.4 2 2.8C11 8.6 11.2 5.6 12 3z"/><path d="M4 4l16 16"/></svg>';
const KEY = 'meadow.fires';

export function createFires({ st, inventory, scene, camera, softDot, items }) {
  const FC = CONFIG.fire, BC = FC.boost, fires = [];
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (err) { void err; /* private mode */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(fires.filter(f => f.save !== false).map(f => [f.id, f.lit])))); } catch (err) { void err; } };

  /* ---- the icon beside what you look at, and its glow ---- */
  const btn = document.createElement('button'); btn.className = 'glass'; btn.id = 'fireIcon'; btn.style.display = 'none'; document.body.appendChild(btn);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot, color: 0xfff2c8, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }));
  glow.visible = false; glow.renderOrder = 6; if (scene) scene.add(glow);
  const sp = new V();
  function place(f, t) {   // the glow on it, the icon on screen right beside it
    glow.visible = !!f; if (!f) return;
    const s = (f.small ? 0.22 : f.quick ? 0.4 : 1.0) * (1 + 0.08 * Math.sin(t * 4)); glow.position.copy(f.at); glow.scale.set(s, s, 1);
    if (!camera) return;
    sp.copy(f.at).project(camera); const off = f.small ? 38 : f.quick ? 46 : 70;
    btn.style.left = ((sp.x + 1) / 2 * innerWidth + off) + 'px'; btn.style.top = ((1 - sp.y) / 2 * innerHeight) + 'px';
    btn.style.visibility = sp.z < 1 ? '' : 'hidden';
  }
  let shown = null, shownF = null, aimed = null, check = 0, tAcc = 0;
  function showBtn(f) {
    const state = f ? (f.lit ? 'out' : 'light') : null; if (state === shown && f === shownF) return; shown = state; shownF = f;
    btn.style.display = state ? '' : 'none'; if (!state) return;
    btn.innerHTML = (state === 'out' ? ICON_OUT : ICON_LIGHT) + (state === 'light' && f.fuel ? `<span class="cost">${f.fuel.n}</span>` : ''); btn.setAttribute('aria-label', (state === 'out' ? 'Put out the ' : 'Light the ') + (f.label || 'fire'));
  }
  const note = document.createElement('div'); note.id = 'fireNote'; note.className = 'glass hide'; document.body.appendChild(note);
  let noteT = 0;
  function toggle(f = aimed) {
    if (!f) return;
    if (!f.lit && f.fuel) {
      if (!inventory || !inventory.take(f.fuel.kinds, f.fuel.n)) { note.textContent = f.fuel.text; note.classList.remove('hide'); noteT = 2.2; return; }
    }
    f.lit = !f.lit; save(); shown = null; showBtn(f);
  }
  btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); toggle(); });
  btn.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => { if (e.code === 'KeyX' && !e.repeat && st.playing) toggle(); });

  /** The fire the player can reach and is looking at, if any. */
  const look = new V(), to = new V();
  function inView() {
    if (!st.walk || !st.playing || st.aboard || st.inBed || st.chestOpen || (st.seat && !st.seat.seated)) return null;   // sitting is fine
    look.set(-Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(st.yaw) * Math.cos(st.pitch));
    let best = null, bd = Math.cos(FC.cone);   // the one looked at most directly (a candle on the mantel does not hide the fireplace)
    for (const f of fires) {
      const d = to.subVectors(f.at, st.pos).length(); if (d > (f.reach || FC.reach) || !f.near(st.pos)) continue;
      const a = to.normalize().dot(look) + (f.small ? -0.02 : 0); if (a > bd) { best = f; bd = a; }
    }
    return best;
  }

  /* ---- feeding a burning fire: the piece flies in, the fire flares up ---- */
  const FUEL = { stick: 1, cone: 1, driftwood: 1 }, flying = [], fdir = new V();
  const canFeed = kind => !!FUEL[kind] && !!aimed && !aimed.quick && aimed.lit && aimed.k > 0.5;
  if (inventory) {
    const label = inventory.useLabel; inventory.useLabel = kind => canFeed(kind) ? 'Burn' : label(kind);
    const use = inventory.onUse; inventory.onUse = kind => canFeed(kind) ? feed(kind) : use(kind);
  }
  function feed(kind) {
    const f = aimed;
    if (!items || !camera) { f.boost = BC.time; return true; }
    const m = items.model(kind); camera.getWorldDirection(fdir);
    const from = camera.position.clone().addScaledVector(fdir, 0.35); from.y -= 0.15; m.position.copy(from);
    flying.push({ m, f, from, t: 0, spin: new V(Math.random() * 10 - 5, Math.random() * 10 - 5, Math.random() * 10 - 5) }); items.sfx('throw');
    return true;   // it leaves the slot
  }
  let canF = false;

  return {
    fires,
    add(f) {
      const lit = f.lit0 !== undefined ? f.lit0 : saved[f.id] !== undefined ? !!saved[f.id] : !f.fuel;
      Object.assign(f, { lit, k: lit ? 1 : 0, e: lit ? 1 : 0, b: 0, boost: 0 }); fires.push(f); f.set(f.k, f.e, 0);
      return f;
    },
    toggle,
    /** Put out every burning fire whose id starts with prefix (rain on the firepits, world/skyWeather.js). */
    douse(prefix) { let n = 0; fires.forEach(f => { if (f.id.startsWith(prefix) && f.lit) { f.lit = false; n++; } }); if (n) { save(); shown = null; } return n; },
    /** Lamps switched all together (the Cabin lights, dusk): their own switches follow. */
    setAll(prefix, on) { fires.forEach(f => { if (f.id.startsWith(prefix)) f.lit = on; }); shown = null; },
    update(dt) {
      for (const f of fires) {
        const k0 = f.k, e0 = f.e, b0 = f.b;
        if (f.quick) { f.k = f.e = f.lit ? 1 : 0; if (f.k !== k0) f.set(f.k, f.e, 0); continue; }   // a lamp or candle: on or off at once
        if (f.lit) { f.k = Math.min(1, f.k + dt / FC.catch); f.e = Math.min(1, f.e + dt / FC.catch * 2); }
        else { f.k = Math.max(0, f.k - dt / FC.out); f.e = Math.max(0, f.e - dt / FC.embers); f.boost = 0; }
        // a flare after feeding: up in a moment, down again over BC.ramp seconds at the end
        if (f.boost > 0) f.boost = Math.max(0, f.boost - dt);
        const want = f.boost > 0 ? 1 : 0; f.b += Math.sign(want - f.b) * Math.min(Math.abs(want - f.b), dt / (want ? 0.4 : BC.ramp));
        // catching: a small flame first, then it takes (eased); dying down: straight
        if (f.k !== k0 || f.e !== e0 || f.b !== b0) f.set(f.lit ? f.k * f.k * (3 - 2 * f.k) : f.k, f.e, f.b);
      }
      for (let i = flying.length - 1; i >= 0; i--) {   // a piece on its way into the flames
        const q = flying[i]; q.t += dt; const k = Math.min(1, q.t / BC.fly);
        q.m.position.lerpVectors(q.from, q.f.at, k); q.m.position.y += Math.sin(Math.PI * k) * 0.35;
        q.m.rotation.x += q.spin.x * dt; q.m.rotation.y += q.spin.y * dt; q.m.rotation.z += q.spin.z * dt;
        if (k >= 1) { scene.remove(q.m); flying.splice(i, 1); if (q.f.lit) { q.f.boost = BC.time; if (items) items.sfx('flare'); } }
      }
      if ((check -= dt) <= 0) {
        check = 0.2; aimed = inView(); showBtn(aimed);
        const sel = inventory && inventory.selected, c = !!sel && canFeed(sel.kind); if (c !== canF) { canF = c; inventory.refresh(); }
      }
      place(aimed, (tAcc += dt));
      if (noteT > 0 && (noteT -= dt) <= 0) note.classList.add('hide');
    },
  };
}
