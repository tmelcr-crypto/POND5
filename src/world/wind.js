import { U } from '../core/uniforms.js';
import { CONFIG } from '../config.js';

/**
 * The wind changes by itself: it holds a strength (U.uWind) and direction (U.uWindDir) for a while (CONFIG.wind.hold,
 * in in-game minutes), then shifts smoothly over CONFIG.wind.shift minutes to a new random strength and direction (the
 * direction turning the shorter way round), and holds that. The strength leans strong (CONFIG.wind.strength). Time runs
 * with the day clock (a jump of the clock, from the slider or sleeping, finishes any shift at once). Moving the panel's
 * Wind slider overrides the strength: the wind holds what you set, and carries on changing from there. Everything that
 * sways, drifts or sails reads the two uniforms, so it all follows. show(w) keeps the panel's slider in step.
 */
export function createWind({ clock, show = () => {} }) {
  const WC = CONFIG.wind, TAU = Math.PI * 2;
  const rr = (a, b) => a + (b - a) * Math.random();
  const d0 = U.uWindDir.value;
  let from = { s: U.uWind.value, a: Math.atan2(d0.y, d0.x) }, to = from, phase = 'hold', left = rr(...WC.hold), prevH = clock.hours;
  const target = () => ({ s: WC.strength[0] + (WC.strength[1] - WC.strength[0]) * Math.pow(Math.random(), WC.strength[2]), a: Math.random() * TAU });
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  function apply(k) {
    const e = k * k * (3 - 2 * k), s = from.s + (to.s - from.s) * e, a = from.a + wrapA(to.a - from.a) * e;
    U.uWind.value = s; U.uWindDir.value.set(Math.cos(a), Math.sin(a)); show(s);
  }
  const slider = document.getElementById('wind');
  if (slider) slider.addEventListener('input', () => { const a = Math.atan2(U.uWindDir.value.y, U.uWindDir.value.x); from = to = { s: +slider.value, a }; phase = 'hold'; left = rr(...WC.hold); });
  function update() {
    const h = clock.hours, d = ((h - prevH) % 24 + 24) % 24; prevH = h;
    let m = d * 60; if (d > 3) { if (phase === 'shift') { from = to; apply(1); } phase = 'hold'; left = rr(...WC.hold); return; }   // a jump of the clock
    while (m > 0) {
      const use = Math.min(m, left); left -= use; m -= use;
      if (phase === 'shift') apply(1 - left / WC.shift);
      if (left <= 1e-6) {
        if (phase === 'hold') { phase = 'shift'; from = { s: U.uWind.value, a: Math.atan2(U.uWindDir.value.y, U.uWindDir.value.x) }; to = target(); left = WC.shift; }
        else { phase = 'hold'; from = to; left = rr(...WC.hold); }
      }
    }
  }
  return { update, get state() { return { phase, left, from, to }; } };
}
