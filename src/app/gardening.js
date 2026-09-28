import { CONFIG } from '../config.js';
import { KINDS } from './itemKinds.js';
import { createActionIcon, lookingAt } from './actionIcon.js';

/**
 * The vegetable garden (#8; beds, crops, the potting table and the grow book: assets/cabin/garden.js). Seeds come
 * from the trays on the potting table at the path's end (each has its sign; CONFIG.garden.seeds of each a day): carrot,
 * pumpkin, lettuce and bean seeds, seed potatoes (a potato you dug up will do), onion sets and strawberry runners. Any
 * of them goes in any bare plot: with seeds selected, looking at a bare plot, the Use button says Sow. A sown plot grows
 * on its own over CONFIG.garden.days in-game days (sleep counts, winter does not: nothing grows or is sown under the
 * snow), then an icon beside it (or T) harvests it (CONFIG.garden.yield).
 *
 * Companion planting: what grows next to what matters (neighbours: the plots before and after in the same bed, and the
 * same row in the beds either side; GARDEN.plots[i].near). COMPANIONS says what each pairing does: some grow faster
 * (CONFIG.garden.faster), some give more. The grow book on the potting table tells it all: looking at it there, the
 * icon opens it. The plots are saved in the browser.
 */
const svg = body => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON_HARVEST = svg('<path d="M4 11h16l-1.6 8.2a2 2 0 0 1-2 1.6H7.6a2 2 0 0 1-2-1.6z"/><path d="M8 11l2-6M16 11l-2-6"/><path d="M9 15v2M12 15v2M15 15v2"/>');
const ICON_BOOK = svg('<path d="M4 5.5c2.7-1 5.4-1 8 .8 2.6-1.8 5.3-1.8 8-.8v13c-2.7-1-5.4-1-8 .8-2.6-1.8-5.3-1.8-8-.8z"/><path d="M12 6.3v13"/>');
/** What each seed grows into. */
export const SOWS = { carrotSeeds: 'carrot', seedPotato: 'potato', potato: 'potato', pumpkinSeeds: 'pumpkin', onionSets: 'onion', lettuceSeeds: 'lettuce', beanSeeds: 'beans', strawberryPlants: 'strawberry' };
/**
 * Companion planting: a crop next to one of `with` gets `faster` growth and/or `more` produce (each rule counts once,
 * however many such neighbours). title and text: its page in the grow book.
 */
export const COMPANIONS = [
  { crop: 'carrot', with: ['onion'], more: 1, title: 'Carrots & onions', text: 'The smell of onions keeps the carrot fly away. Carrots next to onions give one carrot more.' },
  { crop: 'onion', with: ['carrot'], more: 1, title: 'Onions & carrots', text: 'And the carrots do the onions good in turn: one onion more.' },
  { crop: '*', with: ['beans'], faster: true, title: 'Beans feed the soil', text: 'Beans put goodness back into the ground. Whatever grows beside them grows faster.' },
  { crop: 'pumpkin', with: ['beans'], more: 1, title: 'Pumpkins & beans', text: 'A pumpkin vine shades the soil at the beans’ feet and thrives on what they give: one pumpkin more.' },
  { crop: 'potato', with: ['beans'], more: 1, title: 'Potatoes & beans', text: 'Potatoes by the beans: one potato more.' },
  { crop: 'strawberry', with: ['lettuce'], more: 2, title: 'Strawberries & lettuce', text: 'Lettuce keeps the ground cool and damp for the strawberries: two strawberries more.' },
  { crop: 'lettuce', with: ['strawberry'], more: 1, title: 'Lettuce & strawberries', text: 'And the lettuce likes the company: one head more.' },
];

export function createGardening({ scene, camera, st, garden, inventory, items, hours, seasons, softDot }) {   // (after app/cooking.js: its Use chain)
  const GC = CONFIG.garden, KEY = 'meadow.garden', G = garden.plots;
  const icon = createActionIcon({ scene, camera, softDot, id: 'gardenIcon', offset: 40, glow: 0.3 });
  const bookIcon = createActionIcon({ scene, camera, softDot, id: 'bookIcon', offset: 40, glow: 0.3 });
  let plots = G.map(() => null);   // per plot: null (bare) or { crop, g: growth 0..1+ }
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(d) && d.length === plots.length) plots = d.map(p => p && KINDS[p.crop] && GC.days[p.crop] ? { crop: p.crop, g: +p.g || 0, more: +p.more || 0 } : null); } catch (err) { void err; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(plots)); } catch (err) { void err; } };
  const show = i => { const p = plots[i]; garden.set(i, p && p.crop, p ? Math.min(1, p.g) : 0); };
  plots.forEach((_, i) => show(i));
  let last = hours.hours, redraw = 0, aimed = -1, saveIn = 0;
  const winter = () => seasons && seasons.season === 'winter';
  const note = (text, ms = 2600) => { const n = document.getElementById('fireNote'); if (!n) return; n.textContent = text; n.classList.remove('hide'); clearTimeout(note.t); note.t = setTimeout(() => n.classList.add('hide'), ms); };

  /** The companion rules that apply to plot i now (its crop and its neighbours' crops). */
  function bonuses(i) {
    const p = plots[i]; if (!p) return [];
    const near = G[i].near.map(j => plots[j] && plots[j].crop).filter(Boolean);
    return COMPANIONS.filter(r => (r.crop === '*' || r.crop === p.crop) && r.with.some(c => near.includes(c)));
  }
  const rate = i => bonuses(i).some(r => r.faster) ? GC.faster : 1;
  const extra = i => bonuses(i).reduce((n, r) => n + (r.more || 0), 0);
  // a plot keeps the most its neighbours ever gave it while it grew (harvesting the beans first takes nothing away)
  const earned = i => { const p = plots[i]; if (p) p.more = Math.max(p.more || 0, extra(i)); return p ? p.more : 0; };

  function aim() {   // the plot you look at, if any
    if (!st.playing || !st.walk || st.aboard || st.seat || st.inBed || st.chestOpen || winter() || bookOpen) return -1;
    let best = -1, bestD = Infinity;
    G.forEach((_, i) => { const at = garden.target(i); if (lookingAt(camera, at, GC.reach, GC.cone)) { const d = at.distanceTo(camera.position); if (d < bestD) { bestD = d; best = i; } } });
    return best;
  }
  /* ---- sowing: the Use button, with any seeds selected ---- */
  const canSow = kind => aimed >= 0 && !plots[aimed] && !!SOWS[kind];
  const label = inventory.useLabel; inventory.useLabel = kind => canSow(kind) ? 'Sow' : label(kind);
  const use = inventory.onUse; inventory.onUse = kind => canSow(kind) ? sow(kind) : use(kind);
  function sow(kind) {
    const i = aimed; plots[i] = { crop: SOWS[kind], g: 0, more: 0 }; G[i].near.forEach(earned); earned(i); items.sfx('dig'); show(i); save();
    const b = bonuses(i); if (b.length) note(b.map(r => r.title).join(' · '));   // a good neighbour already
    return true;   // one seed used
  }
  let can = false, hinted = -1;

  /* ---- harvest: the icon beside a ripe plot ---- */
  function act() {
    if (bookNear) { openBook(true); return; }
    const i = aimed; if (i < 0) return;
    const p = plots[i];
    if (!p || p.g < 1) return;
    const more = earned(i), n = GC.yield[p.crop] + more;
    let got = 0; for (let k = 0; k < n; k++) if (inventory.canAdd(p.crop)) { inventory.add(p.crop); got++; }
    if (!got) { note('No room for the ' + KINDS[p.crop].name.toLowerCase()); return; }
    if (more) note(`${got} × ${KINDS[p.crop].name.toLowerCase()} (${more} more, thanks to its neighbours)`);
    plots[i] = null; items.sfx('pop'); show(i); save();
  }
  icon.onPress = act; bookIcon.onPress = () => openBook(true);
  addEventListener('keydown', e => { if (e.code === 'KeyT' && !e.repeat && st.playing && !bookOpen) act(); });

  /* ---- the grow book: its pages, opened over the scene (tap, or any key, turns the page; the last one closes it) ---- */
  const view = document.createElement('div'); view.id = 'bookView'; view.className = 'hide'; document.body.appendChild(view);
  const pages = [
    { title: 'The Grow Book', text: 'Anything grows in any bed. But plants, like people, do better in good company: what grows beside what can make it grow faster, or give more. A plot’s neighbours are the plots before and after it in its bed, and the ones in the same row of the beds either side.' },
    ...COMPANIONS.map(r => ({ title: r.title, text: r.text })),
    { title: 'How long', text: Object.entries(GC.days).map(([c, d]) => `${KINDS[c].name}: ${d} days, ${GC.yield[c]} a plot`).join('\n') + '\n\nNothing grows in winter, under the snow.' },
  ];
  let page = 0, bookOpen = false;
  function render() {
    const P = pages[page];
    view.innerHTML = `<div class="page"><h2>${P.title}</h2><p>${P.text.replace(/\n/g, '<br>')}</p><div class="foot">${page + 1} / ${pages.length} · ${page < pages.length - 1 ? 'tap to turn the page' : 'tap to close the book'}</div></div>`;
  }
  function openBook(on) { bookOpen = on; if (on) { page = 0; render(); items.sfx('pop'); } view.classList.toggle('hide', !on); }
  const turn = () => { if (!bookOpen) return; if (page < pages.length - 1) { page++; render(); } else openBook(false); };
  view.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); turn(); });
  addEventListener('keydown', e => { if (bookOpen && !e.repeat) { e.stopPropagation(); if (e.code === 'Escape') openBook(false); else turn(); } }, true);
  let bookNear = false;

  return {
    update(dt, t) {
      // growing: by the in-game hours since the last frame (a night's sleep in one go), not in winter; faster by beans
      const h = hours.hours, d = h - last; last = h;
      if (d > 0 && !winter()) {
        let changed = false;
        plots.forEach((p, i) => { if (p && p.g < 1) { p.g = Math.min(1, p.g + d * rate(i) / (GC.days[p.crop] * 24)); earned(i); changed = true; } });
        if (changed && ((redraw -= d) <= 0 || d > 1)) { redraw = 0.25; plots.forEach((_, i) => show(i)); }
        if (changed && (saveIn -= dt) <= 0) { saveIn = 5; save(); }
      }
      bookNear = !bookOpen && st.playing && st.walk && !st.seat && !st.aboard && lookingAt(camera, garden.bookAt, GC.reach + 0.3, 0.35);
      bookIcon.show(bookNear ? garden.bookAt : null, 'book', ICON_BOOK, 'Read the grow book', t);
      aimed = bookNear ? -1 : aim();
      const p = aimed >= 0 ? plots[aimed] : null, ripe = !!p && p.g >= 1;
      icon.show(ripe ? garden.target(aimed) : null, 'harvest' + aimed, ICON_HARVEST, 'Harvest', t);
      const sel = inventory.selected, c = !!sel && canSow(sel.kind); if (c !== can) { can = c; inventory.refresh(); }
      if (aimed >= 0 && !p && !c && hinted !== aimed) note('A bare plot: sow any seeds from the potting table here');
      if (aimed >= 0 && p && p.g < 1 && hinted !== aimed) { const b = bonuses(aimed); note(`${KINDS[p.crop].name}, ${Math.round(p.g * 100)}% grown` + (b.length ? ' · ' + b.map(r => r.title).join(' · ') : '')); }
      hinted = aimed;
    },
    get plots() { return plots.map(p => p && { crop: p.crop, g: +p.g.toFixed(3) }); },
    bonuses: i => bonuses(i).map(r => r.title),
    get bookOpen() { return bookOpen; },
    act,
  };
}
