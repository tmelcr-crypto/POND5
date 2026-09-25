import { CONFIG } from '../config.js';

/**
 * Dynamic resolution (#87): watches the frame rate and, when it stays below CONFIG.render.dynamic.low fps, renders a
 * little softer (a lower pixel ratio, one step at a time, down to min x the top); when it stays above .high fps for
 * longer, sharper again, up to CONFIG.render.maxPixelRatio (and the device's own). Slow on purpose: a step at most every
 * .wait seconds, and it must hold for .hold seconds first, so it settles instead of flickering.
 */
export function createDynamicRes(renderer) {
  const D = CONFIG.render.dynamic, top = Math.min(window.devicePixelRatio || 1, CONFIG.render.maxPixelRatio), bottom = top * D.min;
  let pr = renderer.getPixelRatio(), avg = 1 / 60, slow = 0, fast = 0, wait = D.wait;
  return {
    get ratio() { return pr; },
    update(dt) {
      if (!D.enabled || dt <= 0 || dt > 0.5) return;   // a hitch (a tab switch, a shader compile) says nothing about the steady rate
      avg += (dt - avg) * Math.min(1, dt * 2);
      const fps = 1 / avg; wait -= dt;
      slow = fps < D.low ? slow + dt : 0; fast = fps > D.high ? fast + dt : 0;
      if (wait > 0) return;
      let next = pr;
      if (slow > D.hold && pr > bottom + 1e-3) next = Math.max(bottom, pr - D.step);
      else if (fast > D.hold * 2.5 && pr < top - 1e-3) next = Math.min(top, pr + D.step);
      if (next !== pr) { pr = next; renderer.setPixelRatio(pr); renderer.setSize(innerWidth, innerHeight, false); wait = D.wait; slow = fast = 0; }
    },
  };
}
