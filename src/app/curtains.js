import { V } from '../core/math.js';
import { HOUSE, CB } from '../world/layout.js';

/**
 * Opening and closing the cabin's curtains (the panels are cabin.curtains, animated in assets/cabin/cabin.js). Inside
 * the cabin, looking at a window within reach, the curtain button (V) slides that window's curtains shut or open.
 * Saved in the browser.
 */
const svg = p => `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON_CLOSE = svg('<path d="M3 3h18"/><path d="M5 3v18M19 3v18"/><path d="M5 3c2 5 4 8 6.5 9M19 3c-2 5-4 8-6.5 9"/>');
const ICON_OPEN = svg('<path d="M3 3h18"/><path d="M5 3c1 6 1.5 12 1 18M19 3c-1 6-1.5 12-1 18"/><path d="M9 6h6v9H9z"/>');

export function createCurtains({ st, cabin }) {
  cabin.group.updateWorldMatrix(true, true);
  const KEY = 'meadow.curtains', list = cabin.curtains.map(C => ({ C, at: cabin.group.localToWorld(C.center.clone()) }));
  try { const d = JSON.parse(localStorage.getItem(KEY) || '[]'); list.forEach((w, i) => { if (d[i]) w.C.target = 1; }); } catch (err) { void err; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(list.map(w => w.C.target))); } catch (err) { void err; } };
  const btn = document.createElement('button'); btn.className = 'tbtn glass'; btn.id = 'btnCurtain'; btn.style.display = 'none'; document.getElementById('vbtns').prepend(btn);
  let aimed = null, shown = '', check = 0;
  const look = new V(), to = new V();
  function inView() {
    const p = st.pos; if (!st.walk || !st.playing || st.seat || st.inBed || st.chestOpen || Math.abs(p.x - HOUSE.x) > CB.XW || Math.abs(p.z - HOUSE.z) > CB.ZW) return null;
    look.set(-Math.sin(st.yaw) * Math.cos(st.pitch), Math.sin(st.pitch), -Math.cos(st.yaw) * Math.cos(st.pitch));
    let best = null, bd = Math.cos(0.5);
    for (const w of list) { if (p.distanceTo(w.at) > 2.4) continue; const a = to.subVectors(w.at, p).normalize().dot(look); if (a > bd) { best = w; bd = a; } }
    return best;
  }
  function show(w) {
    const s = w ? (w.C.target ? 'open' : 'close') : ''; if (s === shown) return; shown = s;
    btn.style.display = s ? '' : 'none'; if (!s) return;
    btn.innerHTML = s === 'open' ? ICON_OPEN : ICON_CLOSE; btn.setAttribute('aria-label', s === 'open' ? 'Open the curtains' : 'Close the curtains');
  }
  function toggle() { if (!aimed) return; aimed.C.target = aimed.C.target ? 0 : 1; save(); shown = ''; show(aimed); }
  btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); toggle(); });
  btn.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => { if (e.code === 'KeyV' && !e.repeat && st.playing) toggle(); });
  return { list, update(dt) { if ((check -= dt) <= 0) { check = 0.2; aimed = inView(); show(aimed); } } };
}
