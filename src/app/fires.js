import { V } from '../core/math.js';
import { CONFIG } from '../config.js';

/**
 * Lighting and putting out fires. Every fire on the island registers here with add() (today: the cabin's fireplace,
 * from main.js; a campfire would be one more add). Near a fire, with it in view, a button (or X) lights it or puts it
 * out: lit, the flames catch over CONFIG.fire.catch seconds; put out, they die down over CONFIG.fire.out seconds and
 * the embers keep glowing (and the chimney smoking) for CONFIG.fire.embers seconds more. Each fire is remembered
 * (localStorage), lit by default.
 *
 * A fire: { id, at: Vector3 (world, the middle of the flames), near(p) -> bool (may the player at p reach it: inside
 * the same room, say), set(k, e), fuel?: { kinds, n } }, where set shows it burning k 0..1 with embers e 0..1 (hot) and
 * is called whenever those change; with fuel, lighting it takes n pieces of those kinds from what you carry (the firepits:
 * 3 sticks or cones; without them a note says so). You can light or put out a fire sitting as well (on a log round it).
 * Fires with fuel start out cold.
 */
const ICON_LIGHT = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c.6 3.2 4.8 5.2 4.8 10a4.8 4.8 0 0 1-9.6 0c0-2.4 1.2-3.8 2.3-5 .3 1.5 1 2.4 2 2.8C11 8.6 11.2 5.6 12 3z"/><path d="M5 21h14"/></svg>';
const ICON_OUT = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c.6 3.2 4.8 5.2 4.8 10a4.8 4.8 0 0 1-9.6 0c0-2.4 1.2-3.8 2.3-5 .3 1.5 1 2.4 2 2.8C11 8.6 11.2 5.6 12 3z"/><path d="M4 4l16 16"/></svg>';
const KEY = 'meadow.fires';

export function createFires({ st, inventory }) {
  const FC = CONFIG.fire, fires = [];
  let saved = {}; try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (err) { void err; /* private mode */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(fires.map(f => [f.id, f.lit])))); } catch (err) { void err; } };

  /* ---- the button ---- */
  const btn = document.createElement('button'); btn.className = 'tbtn glass'; btn.id = 'btnFire'; btn.style.display = 'none';
  document.getElementById('vbtns').prepend(btn);
  let shown = null, shownF = null, aimed = null, check = 0;
  function showBtn(f) {
    const state = f ? (f.lit ? 'out' : 'light') : null; if (state === shown && f === shownF) return; shown = state; shownF = f;
    btn.style.display = state ? '' : 'none'; if (!state) return;
    btn.innerHTML = (state === 'out' ? ICON_OUT : ICON_LIGHT) + (state === 'light' && f.fuel ? `<span class="cost">${f.fuel.n}</span>` : ''); btn.setAttribute('aria-label', state === 'out' ? 'Put the fire out' : 'Light the fire');
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
    let best = null, bd = FC.reach;
    for (const f of fires) {
      const d = to.subVectors(f.at, st.pos).length(); if (d > bd || !f.near(st.pos)) continue;
      if (to.normalize().dot(look) > Math.cos(FC.cone)) { best = f; bd = d; }
    }
    return best;
  }

  return {
    fires,
    add(f) {
      const lit = saved[f.id] !== undefined ? !!saved[f.id] : !f.fuel;
      Object.assign(f, { lit, k: lit ? 1 : 0, e: lit ? 1 : 0 }); fires.push(f); f.set(f.k, f.e);
      return f;
    },
    toggle,
    update(dt) {
      for (const f of fires) {
        const k0 = f.k, e0 = f.e;
        if (f.lit) { f.k = Math.min(1, f.k + dt / FC.catch); f.e = Math.min(1, f.e + dt / FC.catch * 2); }
        else { f.k = Math.max(0, f.k - dt / FC.out); f.e = Math.max(0, f.e - dt / FC.embers); }
        // catching: a small flame first, then it takes (eased); dying down: straight
        if (f.k !== k0 || f.e !== e0) f.set(f.lit ? f.k * f.k * (3 - 2 * f.k) : f.k, f.e);
      }
      if ((check -= dt) <= 0) { check = 0.2; aimed = inView(); showBtn(aimed); }
      if (noteT > 0 && (noteT -= dt) <= 0) note.classList.add('hide');
    },
  };
}
