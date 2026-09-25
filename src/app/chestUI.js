import { V } from '../core/math.js';
import { CONFIG } from '../config.js';
import { HOUSE, CB } from '../world/layout.js';
import { KINDS, iconSvg } from './itemKinds.js';

/**
 * Using the storage chests (assets/cabin/chest.js). Near one (CONFIG.chest.reach) and looking at it, its lid swings
 * open with a creak and a small open-chest icon floats over it; tap the icon (click or E on desktop) to open its
 * storage. Walking away closes the lid again. The storage screen: a wooden panel with the chest's 10 tiles (2 rows of 5)
 * and your 4 quick slots below. Tap a stack to lift it, tap where it goes: onto an empty tile it lands, onto the same
 * kind it fills that stack up to CONFIG.items.stack (the rest stays in hand), onto another kind the two swap. A long
 * press on a stack shows its name and lets you choose how many to lift. The name also shows on hover. Close with the
 * cross, by tapping outside the panel or by walking away; whatever is still in hand goes back. While it is open you
 * can look around but not move. Each chest keeps its own contents, saved in the browser.
 */
export function createChestUI({ camera, st, inventory, items, chests }) {
  const CC = CONFIG.chest, MAX = CONFIG.items.stack, NS = 10;
  const load = id => { try { const d = JSON.parse(localStorage.getItem('meadow.chest.' + id) || 'null'); if (Array.isArray(d)) return Array.from({ length: NS }, (_, i) => d[i] && KINDS[d[i].kind] ? { kind: d[i].kind, n: Math.min(MAX, d[i].n | 0) } : null); } catch (err) { void err; } return Array(NS).fill(null); };
  const state = chests.map(c => ({ c, store: load(c.id), lid: 0, want: 0 }));
  const save = s => { try { localStorage.setItem('meadow.chest.' + s.c.id, JSON.stringify(s.store)); } catch (err) { void err; } };

  /* ---- DOM: the floating icon, the panel ---- */
  const icon = document.createElement('button'); icon.id = 'chestIcon'; icon.className = 'glass hide'; icon.setAttribute('aria-label', 'Open the chest');
  icon.innerHTML = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11h16v8H4z"/><path d="M4 11l2-6h12l2 6"/><path d="M11 13h2v2h-2z"/><path d="M6 5l-1-2M18 5l1-2"/></svg>';
  document.body.appendChild(icon);
  const ui = document.createElement('div'); ui.id = 'chestUI'; ui.className = 'hide';
  ui.innerHTML = '<div class="panel"><button class="x" aria-label="Close">&#10005;</button><div class="hand" aria-live="polite"></div><div class="tiles store"></div><div class="rule"></div><div class="tiles quick"></div>'
    + '<div class="count hide"><span class="name"></span><div class="row"><button class="less" aria-label="Fewer">&minus;</button><b class="num">1</b><button class="more" aria-label="More">+</button></div><button class="take">Take</button></div></div>';
  document.body.appendChild(ui);
  const $ = q => ui.querySelector(q), panel = $('.panel'), handEl = $('.hand'), countEl = $('.count');
  const mk = (parent, where, i) => { const b = document.createElement('button'); b.className = 'tile'; b.dataset.where = where; b.dataset.i = i; parent.appendChild(b); return b; };
  const storeEls = Array.from({ length: NS }, (_, i) => mk($('.store'), 'store', i)), quickEls = Array.from({ length: 4 }, (_, i) => mk($('.quick'), 'quick', i));

  let open = null, hand = null, pick = null;   // the open chest's state; what is lifted { kind, n, from: [where, i] }; the count picker's target
  const list = where => where === 'store' ? open.store : inventory.slots;
  function render() {
    if (!open) return;
    const draw = (els, arr) => els.forEach((b, i) => { const s = arr[i]; b.innerHTML = s ? `${iconSvg(s.kind, 44)}<span class="n">${s.n}</span>` : ''; b.classList.toggle('empty', !s); b.title = s ? KINDS[s.kind].name : ''; b.setAttribute('aria-label', s ? `${KINDS[s.kind].name}, ${s.n}` : 'Empty'); });
    draw(storeEls, open.store); draw(quickEls, inventory.slots);
    handEl.innerHTML = hand ? `${iconSvg(hand.kind, 30)}<span>${hand.n}</span>` : ''; handEl.classList.toggle('on', !!hand);
  }
  const commit = () => { save(open); inventory.refresh(); render(); };
  function drop(where, i) {   // put what is in hand onto a tile
    const arr = list(where), s = arr[i];
    if (!s) { arr[i] = hand; hand = null; }
    else if (s.kind === hand.kind) { const k = Math.min(MAX - s.n, hand.n); s.n += k; hand.n -= k; if (!hand.n) hand = null; }
    else { arr[i] = hand; hand = { ...s, from: [where, i] }; }
  }
  function tap(where, i) {
    const arr = list(where);
    if (!hand) { if (arr[i]) { hand = { ...arr[i], from: [where, i] }; arr[i] = null; } }
    else drop(where, i);
    commit();
  }
  function putBack() {   // on closing: whatever is in hand goes back (its own tile, else any that takes it)
    if (!hand) return;
    const tries = [hand.from, ...Array.from({ length: NS }, (_, i) => ['store', i]), ...[0, 1, 2, 3].map(i => ['quick', i])];
    for (const [w, i] of tries) { const s = list(w)[i]; if (!s || (s.kind === hand.kind && s.n < MAX)) { drop(w, i); if (!hand) break; } }
    commit();
  }
  // pressing a tile: a tap lifts / drops, a long press opens the count picker
  let press = null;
  [...storeEls, ...quickEls].forEach(b => {
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); const w = b.dataset.where, i = +b.dataset.i; press = { w, i, t: setTimeout(() => { press = null; showCount(w, i); }, CC.longPress) }; });
    b.addEventListener('pointerup', e => { e.stopPropagation(); if (press) { clearTimeout(press.t); tap(press.w, press.i); press = null; } });
    b.addEventListener('pointerleave', () => { if (press) { clearTimeout(press.t); press = null; } });
    b.addEventListener('contextmenu', e => e.preventDefault());
  });
  function showCount(w, i) {
    const s = list(w)[i]; if (!s || hand) return;
    pick = { w, i, n: Math.max(1, Math.floor(s.n / 2)) };
    $('.name').textContent = KINDS[s.kind].name; $('.num').textContent = pick.n; countEl.classList.remove('hide');
  }
  const stepCount = d => { const s = list(pick.w)[pick.i]; pick.n = Math.max(1, Math.min(s.n, pick.n + d)); $('.num').textContent = pick.n; };
  $('.less').addEventListener('click', () => stepCount(-1)); $('.more').addEventListener('click', () => stepCount(1));
  $('.take').addEventListener('click', () => { const arr = list(pick.w), s = arr[pick.i]; hand = { kind: s.kind, n: pick.n, from: [pick.w, pick.i] }; s.n -= pick.n; if (!s.n) arr[pick.i] = null; pick = null; countEl.classList.add('hide'); commit(); });
  panel.addEventListener('pointerdown', e => e.stopPropagation());
  $('.x').addEventListener('click', close);

  function openUI(s) { if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); open = s; hand = null; st.chestOpen = true; st.vel.set(0, 0, 0); ui.classList.remove('hide'); icon.classList.add('hide'); countEl.classList.add('hide'); render(); }
  function close() { if (!open) return; putBack(); countEl.classList.add('hide'); ui.classList.add('hide'); open = null; st.chestOpen = false; }
  let near = null;
  icon.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); if (near) openUI(near); });
  addEventListener('meadow-tap', e => {
    if (open) { close(); return; }                                                     // a tap on the scene, a click or E: close
    if (e.detail !== 'touch' && near && !(items && items.aimed)) openUI(near);         // desktop: click / E opens (touch: the icon)
  });
  let down = null;   // desktop, unlocked: a click on the scene (not a drag) closes; a drag looks around
  addEventListener('pointerdown', e => { if (open && e.pointerType === 'mouse' && e.target.tagName === 'CANVAS') down = [e.clientX, e.clientY]; });
  addEventListener('pointerup', e => { if (open && down && Math.hypot(e.clientX - down[0], e.clientY - down[1]) < 5) close(); down = null; });

  /* ---- each frame: lids, the floating icon, the look-only camera while open ---- */
  const f = new V(), d = new V(), p = new V();
  const inCabin = q => Math.abs(q.x - HOUSE.x) < CB.XW + CB.R && Math.abs(q.z - HOUSE.z) < CB.ZW + CB.R;   // within the log walls
  function update(dt) {
    near = null;
    const canUse = st.playing && st.walk && !st.aboard && !st.seat && !st.inBed;
    camera.getWorldDirection(f);
    for (const s of state) {
      const top = s.c.top, dist = Math.hypot(camera.position.x - top.x, camera.position.z - top.z);
      const inView = d.copy(top).sub(camera.position).normalize().dot(f) > Math.cos(CC.cone);
      const here = canUse && dist < CC.reach && inView && inCabin(camera.position) === inCabin(top);   // not through the cabin's wall
      if (here && !near) near = s;
      const want = open === s || (here && !open) ? 1 : 0;
      if (want !== s.want) { s.want = want; if (items) items.sfx(want ? 'creak' : 'clunk'); }
      s.lid += (s.want - s.lid) * Math.min(1, dt * 4); s.c.lid.rotation.x = -CC.lidOpen * s.lid;
      if (open === s && dist > CC.reach + 0.6) close();
    }
    inventory.nearChest = !!near || !!open;
    if (near && !open) { p.copy(near.c.top).project(camera); icon.classList.remove('hide'); icon.style.left = ((p.x + 1) / 2 * innerWidth) + 'px'; icon.style.top = ((1 - p.y) / 2 * innerHeight) + 'px'; }
    else icon.classList.add('hide');
  }
  /** While the storage is open it has the camera: look around only (app/controls.js takeover). */
  function hold() { if (!open) return false; camera.position.copy(st.pos); camera.rotation.set(st.pitch, st.yaw, 0); return true; }
  return { update, hold, get open() { return !!open; }, get state() { return state.map(s => ({ id: s.c.id, store: s.store })); } };
}
