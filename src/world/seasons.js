import { U } from '../core/uniforms.js';
import { CONFIG } from '../config.js';

/**
 * The four seasons. A season lasts CONFIG.seasons.days in-game days (counted on the running day clock, plus the hours
 * you sleep), but it only turns while you sleep: the first sleep after its days are up wakes you in the next season,
 * its name fading in over the screen. The season sets the shared uniforms U.uSpring, U.uAutumn, U.uWinter (each 0 or 1,
 * all 0 in summer, so summer looks as the scene always has) and U.uSnow, which the ground, grass, leaves and roofs read
 * (core/shaderPatches.js addSeason); on(fn) calls fn(season) now and at every change, for what is not a shader (grass
 * and leaves hidden in winter, fruit out of season, the frozen pond, day length). The panel's Season picker jumps
 * straight to a season (for checking). Saved in the browser, like the inventory.
 */
export const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const NAMES = { spring: 'Spring', summer: 'Summer', autumn: 'Autumn', winter: 'Winter' };

export function createSeasons({ clock }) {
  const SC = CONFIG.seasons, KEY = 'meadow.season';
  let season = SC.start, days = 0, prevH = clock.hours;
  try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); if (d && SEASONS.includes(d.season)) { season = d.season; days = +d.days || 0; } } catch (err) { void err; /* private mode */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ season, days })); } catch (err) { void err; } };
  const listeners = [];

  function apply() {
    U.uSpring.value = season === 'spring' ? 1 : 0; U.uAutumn.value = season === 'autumn' ? 1 : 0;
    U.uWinter.value = U.uSnow.value = season === 'winter' ? 1 : 0;
    listeners.forEach(f => f(season, days));
    if (sel) sel.value = season;
  }
  function set(s, d = 0) { season = s; days = d; save(); apply(); }

  /* ---- the name on waking ---- */
  const banner = document.createElement('div'); banner.id = 'seasonName'; document.body.appendChild(banner);
  function announce() { banner.textContent = NAMES[season]; banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show'); }

  /* ---- the panel's picker ---- */
  const sel = document.getElementById('seasonSel');
  if (sel) sel.addEventListener('change', () => set(sel.value));

  return {
    get season() { return season; },
    /** Days into this season (0 .. CONFIG.seasons.days, and on until you sleep). */
    get days() { return days; },
    /** fn(season, days) now and at every change. */
    on(fn) { listeners.push(fn); fn(season, days); },
    set, apply,
    /** Counts the running clock (not jumps of the time slider). */
    update() {
      const h = clock.hours, d = ((h - prevH) % 24 + 24) % 24; prevH = h;
      if (d < 3) { days += d / 24; if ((save.t = (save.t || 0) + d) > 1) { save.t = 0; save(); } }
    },
    /** After a night's sleep (app/sleeping.js): the hours slept count, and the season turns if its days are up. */
    slept(hours) {
      prevH = clock.hours; days += hours / 24;
      if (days >= SC.days) { set(SEASONS[(SEASONS.indexOf(season) + 1) % 4], days - SC.days); announce(); }
      else save();
    },
  };
}
