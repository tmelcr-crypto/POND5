import { CONFIG } from '../config.js';

/**
 * Time-lapse (#79): sitting on a bench or a log, or on the bed, a fast-forward button shows; hold it (or Z) and the day
 * clock runs CONFIG.time.lapse times faster (the sun, sky, clouds' light and everything that follows the clock), back
 * to normal as soon as you let go. It runs even with the Day cycle paused.
 */
const ICON = '<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6l8 6-8 6z"/><path d="M12 6l8 6-8 6z"/></svg>';

export function createTimelapse({ st, clock }) {
  const btn = document.createElement('button'); btn.className = 'tbtn glass'; btn.id = 'btnLapse'; btn.innerHTML = ICON; btn.setAttribute('aria-label', 'Hold to let time run'); btn.style.display = 'none';
  document.getElementById('vbtns').prepend(btn);
  let held = false, key = false, wasRunning = null;
  const can = () => st.playing && ((st.seat && st.seat.seated) || st.inBed);
  function set(on) {
    on = on && can(); if (on === (clock.rate > 1)) return;
    if (on) { wasRunning = clock.running; clock.running = true; clock.rate = CONFIG.time.lapse; }
    else { clock.rate = 1; if (wasRunning !== null) clock.running = wasRunning; wasRunning = null; }
    btn.classList.toggle('on', on);
  }
  btn.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); held = true; btn.setPointerCapture && btn.setPointerCapture(e.pointerId); });
  const up = () => { held = false; };
  btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
  btn.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('keydown', e => { if (e.code === 'KeyZ') key = true; });
  addEventListener('keyup', e => { if (e.code === 'KeyZ') key = false; });
  addEventListener('blur', () => { held = key = false; });
  return {
    update() { const c = can(); btn.style.display = c ? '' : 'none'; set((held || key) && c); },
    get on() { return clock.rate > 1; },
  };
}
