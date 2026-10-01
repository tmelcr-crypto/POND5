import { CODES } from '../story/content.js';

/**
 * The fuel can's chest (#plane; the chest: CHESTS 'code' in world/layout.js, by the cabin's east wall). Its lid is held
 * by six rows of three dials, one row for each of the six code letters hidden on Millholm, Palm Cay, Ember Rock, Heron
 * Marsh, the lighthouse rock and the islet (story/content.js CODES, app/letters.js). Opening it shows the dials: tap a
 * digit's arrows to turn it; Try lifts the lid only when all six rows are right (else it rattles and stays shut). Solved,
 * the fuel can lies inside (the chest's own storage from then on) and 'meadow-code-open' fires; the seaplane takes the can
 * (app/flying.js). The dials' positions and the solved state are saved in the browser.
 */
const SYM = {
  mill: '<path d="M12 21V11M8 21l2-10h4l2 10z"/><path d="M12 9L6 3M12 9l6-6M12 9L6 15M12 9l6 6"/>',
  palm: '<path d="M12 21c0-5 .5-9 2-12"/><path d="M14 9c-2-3-6-3-8-1 3 0 5 1 6 2M14 9c1-3 5-4 7-2-3 0-5 1-6 2M14 9c3-1 6 1 6 4-2-2-4-2-6-3"/>',
  volcano: '<path d="M3 20l6-10h6l6 10z"/><path d="M10 10c0-2 1-4 2-5 1 1 2 3 2 5"/><path d="M11 3l-1-1M13 3l1-1"/>',
  heron: '<path d="M8 21l2-7"/><path d="M10 14c-3-1-4-4-2-6 2-2 5-1 6 1l5-3-4 5c0 3-2 4-5 3z"/><path d="M12 21l-1-6"/>',
  lighthouse: '<path d="M9 21l1-13h4l1 13z"/><path d="M9 8h6l-1-3h-4z"/><path d="M4 6l5 1M20 6l-5 1"/>',
  shell: '<path d="M12 20L4.2 10.6a8.4 8.4 0 0 1 15.6 0z"/><path d="M12 20L7.6 7.4M12 20V6.3M12 20l4.4-12.6"/>',
};
const svg = (p, s = 26) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;

export function createFuelQuest({ st, chestUI, items }) {
  const KEY = 'meadow.codeChest';
  let S = { dials: CODES.map(() => [0, 0, 0]), solved: false };
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && Array.isArray(d.dials)) S = { dials: CODES.map((_, r) => [0, 1, 2].map(k => ((d.dials[r] || [])[k] | 0) % 10)), solved: !!d.solved }; } catch (err) { void err; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (err) { void err; } };

  const ui = document.createElement('div'); ui.id = 'codeUI'; ui.className = 'hide'; document.body.appendChild(ui);
  let open = false;
  function render() {
    ui.innerHTML = `<div class="panel"><button class="x" aria-label="Close">&#10005;</button><h2>Six locks</h2><p class="sub">One row for each island's letter</p><div class="rows">${CODES.map((c, r) => `<div class="row"><span class="sym" title="${c.row}">${svg(SYM[c.symbol])}</span><span class="nm">${c.row}</span>${[0, 1, 2].map(k => `<span class="dial"><button data-r="${r}" data-k="${k}" data-d="1" aria-label="${c.row} dial ${k + 1} up">&#9650;</button><b>${S.dials[r][k]}</b><button data-r="${r}" data-k="${k}" data-d="-1" aria-label="${c.row} dial ${k + 1} down">&#9660;</button></span>`).join('')}</div>`).join('')}</div><button class="try">Try the lid</button><p class="msg"></p></div>`;
  }
  function show() { if (document.exitPointerLock && document.pointerLockElement) document.exitPointerLock(); open = true; st.chestOpen = true; st.vel.set(0, 0, 0); render(); ui.classList.remove('hide'); }
  function close() { open = false; st.chestOpen = false; ui.classList.add('hide'); save(); }
  const right = () => CODES.every((c, r) => c.code.every((v, k) => S.dials[r][k] === v));
  ui.addEventListener('pointerdown', e => {
    e.stopPropagation(); const b = e.target.closest && e.target.closest('button'); if (!b) { if (e.target === ui) close(); return; }
    e.preventDefault();
    if (b.classList.contains('x')) { close(); return; }
    if (b.classList.contains('try')) {
      if (right()) { S.solved = true; save(); chestUI.put('code', 'fuelCan'); if (items) items.sfx('crank'); close(); dispatchEvent(new CustomEvent('meadow-code-open'));
        const n = document.getElementById('fireNote'); if (n) { n.textContent = 'Click, click, click... the lid lifts. Inside, wrapped in sacking: a full fuel can.'; n.classList.remove('hide'); setTimeout(() => n.classList.add('hide'), 5000); } }
      else { if (items) items.sfx('thud'); const p = ui.querySelector('.panel'); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake'); ui.querySelector('.msg').textContent = 'The lid rattles but stays shut.'; }
      return;
    }
    const r = +b.dataset.r, k = +b.dataset.k, d = +b.dataset.d; S.dials[r][k] = (S.dials[r][k] + d + 10) % 10; if (items) items.sfx('click');
    b.parentNode.querySelector('b').textContent = S.dials[r][k];
  });
  addEventListener('keydown', e => { if (open && e.code === 'Escape') { e.stopPropagation(); close(); } }, true);
  chestUI.locked = id => id === 'code' && !S.solved;
  chestUI.onLocked = () => show();
  return { get solved() { return S.solved; }, get open() { return open; }, _show: show, _solve() { S.dials = CODES.map(c => c.code.slice()); save(); } };
}
