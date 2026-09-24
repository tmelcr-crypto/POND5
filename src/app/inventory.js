/**
 * What you carry: four quick slots, each one kind of item up to CONFIG.items.stack pieces (a kind whose slot is full
 * starts another slot if one is free). The quick bar at the top of the screen shows the slots while you carry anything
 * (symbol, count, the selected one highlighted); tap a slot, press 1-4 or turn the mouse wheel to select. The Use button
 * (above Jump; right click or F on desktop) uses the selected item through onUse(kind) (app/items.js decides what that
 * means) and is hidden while the selected slot is empty. Saved in the browser (per device), so it survives a reload.
 * Items never show in front of you; only the icons do.
 */
import { CONFIG } from '../config.js';
import { KINDS, iconSvg } from './itemKinds.js';

export function createInventory({ st }) {
  const N = 4, MAX = CONFIG.items.stack, KEY = 'meadow.inventory';
  let slots = Array.from({ length: N }, () => null), sel = 0;
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && Array.isArray(d.slots)) { slots = d.slots.slice(0, N).map(x => x && KINDS[x.kind] ? { kind: x.kind, n: Math.min(MAX, x.n | 0) } : null); while (slots.length < N) slots.push(null); sel = d.sel | 0; } } catch (err) { void err; /* private mode */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ slots, sel })); } catch (err) { void err; } };

  /* ---- the quick bar ---- */
  const bar = document.createElement('div'); bar.id = 'quickbar'; bar.className = 'hide'; document.body.appendChild(bar);
  const cells = slots.map((_, i) => {
    const b = document.createElement('button'); b.className = 'qslot glass'; b.setAttribute('aria-label', 'Slot ' + (i + 1));
    b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); select(i); });
    bar.appendChild(b); return b;
  });
  const useBtn = document.createElement('button'); useBtn.className = 'tbtn glass'; useBtn.id = 'btnUse'; useBtn.textContent = 'Use'; useBtn.style.display = 'none';
  const up = document.getElementById('btnUp'); up.parentNode.insertBefore(useBtn, up);
  useBtn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); use(); });
  useBtn.addEventListener('contextmenu', e => e.preventDefault());

  let near = false;   // by a chest the bar always shows (app/chestUI.js)
  function render() {
    const any = slots.some(Boolean);
    bar.classList.toggle('hide', !any && !near);
    cells.forEach((b, i) => {
      const s = slots[i]; b.classList.toggle('sel', i === sel); b.classList.toggle('empty', !s);
      b.innerHTML = s ? `${iconSvg(s.kind, 30)}<span class="n">${s.n}</span>` : '';
      b.setAttribute('aria-label', s ? `${KINDS[s.kind].name}, ${s.n}` + (i === sel ? ', selected' : '') : `Empty slot ${i + 1}`);
    });
    useBtn.style.display = slots[sel] ? '' : 'none';
    useBtn.setAttribute('aria-label', slots[sel] ? 'Use ' + KINDS[slots[sel].kind].name.toLowerCase() : 'Use');
    st.wheelSelect = any;   // the mouse wheel picks a slot while you carry something (app/controls.js)
  }
  function select(i) { sel = ((i % N) + N) % N; render(); save(); }
  /** Can one more of this kind be carried? */
  const canAdd = kind => slots.some(s => s && s.kind === kind && s.n < MAX) || slots.some(s => !s);
  function add(kind) {
    let s = slots.find(x => x && x.kind === kind && x.n < MAX);
    if (!s) { const i = slots.findIndex(x => !x); if (i < 0) return false; s = slots[i] = { kind, n: 0 }; if (!slots[sel]) sel = i; }
    s.n++; render(); save(); flash(slots.indexOf(s)); return true;
  }
  function flash(i) { const b = cells[i]; if (!b) return; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
  let onUse = () => false;
  function use() {
    const s = slots[sel]; if (!s || st.chestOpen) return;
    if (!onUse(s.kind)) return;
    if (--s.n <= 0) slots[sel] = null;   // the slot empties, the selection stays on it
    render(); save();
  }
  addEventListener('keydown', e => { if (!st.playing || e.repeat) return; const k = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code); if (k >= 0) select(k); });
  addEventListener('meadow-wheel', e => select(sel + (e.detail > 0 ? 1 : -1)));
  addEventListener('meadow-use', use);
  render();
  /** After the chest has moved things in or out of the slots. */
  function refresh() { if (!slots[sel] && slots.some(Boolean)) sel = slots.findIndex(Boolean); render(); save(); }
  return { canAdd, add, use, select, refresh, get slots() { return slots; }, get selected() { return slots[sel]; }, set onUse(f) { onUse = f; }, set nearChest(v) { if (v !== near) { near = v; render(); } } };
}
