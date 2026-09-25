import { CONFIG } from '../config.js';
import { createActionIcon, lookingAt } from './actionIcon.js';

/**
 * Drawing water at the well (#12; the well: assets/cabin/well.js). Near it and looking at it, an icon beside it (or T)
 * lowers the bucket: the windlass turns and creaks, the bucket splashes into the water far down, fills, and is wound
 * back up full; a cup of fresh water goes into your quick slots (Drink, app/itemKinds.js). The bucket stays full for a
 * little while. Every number is in CONFIG.well.
 */
const ICON = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 10h12l-1.5 9.5a1.5 1.5 0 0 1-1.5 1.3H9a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M6 10c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M12 4V2"/><path d="M8.5 14c1.2-.8 2.3.8 3.5 0s2.3-.8 3.5 0"/></svg>';

export function createDrawWater({ scene, camera, st, well, inventory, items, softDot }) {
  const WC = CONFIG.well, icon = createActionIcon({ scene, camera, softDot, id: 'wellIcon' });
  let job = null, fullFor = 0, creakIn = 0;
  const note = text => { const n = document.getElementById('fireNote'); if (!n) return; n.textContent = text; n.classList.remove('hide'); clearTimeout(note.t); note.t = setTimeout(() => n.classList.add('hide'), 2200); };
  const can = () => st.playing && st.walk && !st.aboard && !st.seat && !st.inBed && !st.chestOpen && !job && lookingAt(camera, well.rimTop, WC.reach, WC.cone);
  function start() {
    if (!can()) return;
    if (!inventory.canAdd('water')) { note('No room for the water'); return; }
    job = { phase: 'down', t: 0 }; well.setFull(false); fullFor = 0;
  }
  icon.onPress = start;
  addEventListener('keydown', e => { if (e.code === 'KeyT' && !e.repeat && st.playing) start(); });
  const ease = x => x * x * (3 - 2 * x);
  return {
    update(dt, t) {
      icon.show(can() ? well.rimTop : null, 'draw', ICON, 'Draw water', t);
      if (fullFor > 0 && (fullFor -= dt) <= 0) well.setFull(false);
      if (!job) return;
      job.t += dt;
      const low = well.water - 0.08;
      if (job.phase === 'down') {
        const k = Math.min(1, job.t / WC.down); well.setBucket(well.idle + (low - well.idle) * ease(k));
        if ((creakIn -= dt) <= 0) { creakIn = 0.45; items.sfx('crank'); }
        if (k >= 1) { job = { phase: 'fill', t: 0 }; items.sfx('splash'); }
      } else if (job.phase === 'fill') {
        well.setBucket(low - 0.05 * Math.sin(Math.min(1, job.t / WC.fill) * Math.PI));
        if (job.t >= WC.fill) job = { phase: 'up', t: 0 };
      } else {
        const k = Math.min(1, job.t / WC.up); well.setBucket(low + (well.idle - low) * ease(k)); if (k > 0.05) well.setFull(true);
        if ((creakIn -= dt) <= 0) { creakIn = 0.4; items.sfx('crank'); }
        if (k >= 1) { job = null; fullFor = WC.fullFor; inventory.add('water'); items.sfx('pop'); note('Fresh water from the well'); }
      }
    },
    get busy() { return !!job; },
  };
}
