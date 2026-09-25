import { CONFIG } from '../config.js';
import { KINDS } from './itemKinds.js';
import { createActionIcon, lookingAt } from './actionIcon.js';

/**
 * The vegetable garden (#8; beds, crops and the seed box: assets/cabin/garden.js). Seeds come from the seed box at the
 * path's end (carrot seeds, seed potatoes, pumpkin seeds: picked up like anything else, CONFIG.garden.seeds of each a
 * day). With a bed's seeds selected (a potato you dug up will do for the potato bed), looking at one of its bare plots,
 * the Use button says Sow and puts one in; looking at a bare plot without them, a note says what it needs. A sown plot
 * grows on its own over CONFIG.garden.days in-game days (the hours you sleep count, winter does not: it is under the
 * snow then, and nothing is sown), no care needed. Looking at a ripe plot, an icon beside it (or T) harvests it:
 * carrots and potatoes by three, one pumpkin. The plots are saved in the browser.
 */
const svg = body => `<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const ICON_HARVEST = svg('<path d="M4 11h16l-1.6 8.2a2 2 0 0 1-2 1.6H7.6a2 2 0 0 1-2-1.6z"/><path d="M8 11l2-6M16 11l-2-6"/><path d="M9 15v2M12 15v2M15 15v2"/>');
const YIELD = { carrot: 3, potato: 3, pumpkin: 1 }, SEEDS = { carrot: ['carrotSeeds'], potato: ['seedPotato', 'potato'], pumpkin: ['pumpkinSeeds'] };
const NEED = { carrot: 'The carrot bed: carrot seeds, from the seed box', potato: 'The potato bed: a seed potato, from the seed box', pumpkin: 'The pumpkin bed: pumpkin seeds, from the seed box' };

export function createGardening({ scene, camera, st, garden, inventory, items, hours, seasons, softDot }) {   // (after app/cooking.js: its Use chain)
  const GC = CONFIG.garden, KEY = 'meadow.garden', icon = createActionIcon({ scene, camera, softDot, id: 'gardenIcon', offset: 40, glow: 0.3 });
  let plots = garden.plots.map(() => null);   // per plot: null (bare) or { crop, g: growth 0..1+ }
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (Array.isArray(d) && d.length === plots.length) plots = d.map(p => p && KINDS[p.crop] ? { crop: p.crop, g: +p.g || 0 } : null); } catch (err) { void err; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(plots)); } catch (err) { void err; } };
  const show = i => { const p = plots[i]; garden.set(i, p && p.crop, p ? Math.min(1, p.g) : 0); };
  plots.forEach((_, i) => show(i));
  let last = hours.hours, redraw = 0, aimed = -1, saveIn = 0;
  const winter = () => seasons && seasons.season === 'winter';
  const note = text => { const n = document.getElementById('fireNote'); if (!n) return; n.textContent = text; n.classList.remove('hide'); clearTimeout(note.t); note.t = setTimeout(() => n.classList.add('hide'), 2200); };

  function aim() {   // the plot you look at, if any
    if (!st.playing || !st.walk || st.aboard || st.seat || st.inBed || st.chestOpen || winter()) return -1;
    let best = -1, bestD = Infinity;
    garden.plots.forEach((_, i) => { const at = garden.target(i); if (lookingAt(camera, at, GC.reach, GC.cone)) { const d = at.distanceTo(camera.position); if (d < bestD) { bestD = d; best = i; } } });
    return best;
  }
  /* ---- sowing: the Use button, with the bed's seeds selected ---- */
  const canSow = kind => aimed >= 0 && !plots[aimed] && SEEDS[garden.plots[aimed].crop].includes(kind);
  const label = inventory.useLabel; inventory.useLabel = kind => canSow(kind) ? 'Sow' : label(kind);
  const use = inventory.onUse; inventory.onUse = kind => canSow(kind) ? sow() : use(kind);
  function sow() { const i = aimed; plots[i] = { crop: garden.plots[i].crop, g: 0 }; items.sfx('dig'); show(i); save(); return true; }   // one seed used
  let can = false, hinted = -1;

  /* ---- harvest: the icon beside a ripe plot ---- */
  function act() {
    const i = aimed; if (i < 0) return;
    const p = plots[i];
    if (!p || p.g < 1) return;
    let got = 0; for (let n = 0; n < YIELD[p.crop]; n++) if (inventory.canAdd(p.crop)) { inventory.add(p.crop); got++; }
    if (!got) { note('No room for the ' + KINDS[p.crop].name.toLowerCase()); return; }
    plots[i] = null; items.sfx('pop'); show(i); save();
  }
  icon.onPress = act;
  addEventListener('keydown', e => { if (e.code === 'KeyT' && !e.repeat && st.playing) act(); });

  return {
    update(dt, t) {
      // growing: by the in-game hours since the last frame (a night's sleep in one go), not in winter
      const h = hours.hours, d = h - last; last = h;
      if (d > 0 && !winter()) {
        let changed = false;
        plots.forEach(p => { if (p && p.g < 1) { p.g = Math.min(1, p.g + d / (GC.days[p.crop] * 24)); changed = true; } });
        if (changed && ((redraw -= d) <= 0 || d > 1)) { redraw = 0.25; plots.forEach((_, i) => show(i)); }
        if (changed && (saveIn -= dt) <= 0) { saveIn = 5; save(); }
      }
      aimed = aim();
      const p = aimed >= 0 ? plots[aimed] : null, ripe = !!p && p.g >= 1;
      icon.show(ripe ? garden.target(aimed) : null, 'harvest' + aimed, ICON_HARVEST, 'Harvest', t);
      const sel = inventory.selected, c = !!sel && canSow(sel.kind); if (c !== can) { can = c; inventory.refresh(); }
      if (aimed >= 0 && !p && !c && hinted !== aimed) note(NEED[garden.plots[aimed].crop]);   // a bare plot, and nothing to sow it with
      hinted = aimed;
    },
    get plots() { return plots.map(p => p && { crop: p.crop, g: +p.g.toFixed(3) }); },
    act,
  };
}
