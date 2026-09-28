import { CONFIG } from '../config.js';
import { H, TREEHOUSE } from '../world/layout.js';
import { createActionIcon, lookingAt } from './actionIcon.js';

/**
 * Climbing the treehouse's rope ladder (#58; the treehouse: assets/cabin/treehouse.js, its deck: TREEHOUSE in
 * world/layout.js). At the ladder's foot, looking at it, an icon beside it (or T) climbs up: you step to the ladder, face
 * it and climb hand over hand to the deck, stepping in through the gap in the railing. On the deck by the gap, looking
 * at it, the same icon climbs down. It has the camera while it plays (a takeover, app/controls.js). CONFIG.climb.
 */
const ICON_UP = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3v18M15 3v18M7 7h8M7 12h8M7 17h8"/><path d="M19 9V3M17 5l2-2 2 2"/></svg>';
const ICON_DOWN = '<svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3v18M15 3v18M7 7h8M7 12h8M7 17h8"/><path d="M19 15v6M17 19l2 2 2-2"/></svg>';

export function createClimbing({ scene, camera, st, treehouse, softDot }) {
  const C = CONFIG.climb, T = TREEHOUSE, eye = CONFIG.player.eyeHeight, icon = createActionIcon({ scene, camera, softDot, id: 'climbIcon' });
  const [fx, fz] = T.toWorld(0, 1), yawToDeck = Math.atan2(fx - T.x, fz - T.z);   // the camera's yaw facing the treehouse from its front (it looks along -z)
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a)), ease = t => t * t * (3 - 2 * t);
  const at = (lz, y) => { const [x, z] = T.toWorld(0, lz); return { x, y, z }; };
  const bottom = () => { const p = at(T.half + 0.55 + C.off, 0); p.y = H(p.x, p.z) + eye; return p; };
  const onDeck = () => Math.abs(st.pos.y - eye - T.deck) < 0.3;
  let job = null;
  function can() {
    if (!st.playing || !st.walk || st.aboard || st.seat || st.inBed || st.chestOpen || job) return null;
    if (onDeck()) { const d = Math.hypot(st.pos.x - treehouse.ladderTop.x, st.pos.z - treehouse.ladderTop.z); return d < C.reachTop && lookingAt(camera, treehouse.ladderTop, C.reachTop + 1, 1.0) ? 'down' : null; }
    if (!st.grounded) return null;
    const f = bottom(); return Math.hypot(st.pos.x - f.x, st.pos.z - f.z) < C.reach && lookingAt(camera, treehouse.ladderMid, C.reach + 3, 0.7) ? 'up' : null;
  }
  function start() {
    const k = can(); if (!k) return;
    const p0 = { x: st.pos.x, y: st.pos.y, z: st.pos.z }, y0 = st.yaw, pi0 = st.pitch, f = bottom(), topIn = at(T.half - 0.45, T.deck + eye), topOut = at(T.half + C.off, T.deck + eye - 0.35);
    const dy = wrapA(yawToDeck - y0), steps = [];
    const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
    const climb = (from, to, t) => {   // along the ladder, a pull with each rung
      const q = lerp(from, to, t), rung = Math.sin(t * Math.PI * C.pulls); q.y += 0.04 * rung; st.pos.set(q.x, q.y, q.z); st.pitch = 0.25 + 0.08 * rung;
    };
    if (k === 'up') {
      steps.push([Math.abs(dy) / 2.6 + 0.2, t => { st.yaw = y0 + dy * t; st.pitch = pi0 + (0.2 - pi0) * t; }]);
      steps.push([Math.hypot(f.x - p0.x, f.z - p0.z) / 1.1 + 0.1, t => { const q = lerp(p0, f, t); st.pos.set(q.x, q.y, q.z); }]);
      steps.push([C.up, t => climb(f, topOut, t)]);
      steps.push([0.8, t => { const q = lerp(topOut, topIn, t); q.y += Math.sin(t * Math.PI) * 0.08; st.pos.set(q.x, q.y, q.z); st.pitch = 0.25 * (1 - t); }]);   // over the edge onto the deck
    } else {
      const here = { x: p0.x, y: p0.y, z: p0.z };
      steps.push([Math.abs(dy) / 2.6 + 0.2, t => { st.yaw = y0 + dy * t; st.pitch = pi0 + (-0.35 - pi0) * t; }]);   // turn round to face the ladder
      steps.push([0.5, t => { const q = lerp(here, topIn, t); st.pos.set(q.x, q.y, q.z); }]);
      steps.push([0.8, t => { const q = lerp(topIn, topOut, t); q.y -= Math.sin(t * Math.PI) * 0.1; st.pos.set(q.x, q.y, q.z); st.pitch = -0.35 + 0.6 * t; }]);   // back out over the edge
      steps.push([C.down, t => climb(topOut, f, t)]);
      steps.push([0.3, t => { st.pitch = 0.25 * (1 - t); }]);
    }
    job = { steps, i: 0, t: 0 }; st.vel.set(0, 0, 0); icon.show(null);
  }
  icon.onPress = start;
  addEventListener('keydown', e => { if (e.code === 'KeyT' && !e.repeat && st.playing) start(); });
  return {
    /** The takeover: plays the climb; true while it has the camera. */
    takeover(dt) {
      if (!job) return false;
      job.t += dt;
      while (job.i < job.steps.length && job.t >= job.steps[job.i][0]) { job.steps[job.i][1](1); job.t -= job.steps[job.i][0]; job.i++; }
      if (job.i < job.steps.length) job.steps[job.i][1](ease(job.t / job.steps[job.i][0]));
      else { job = null; st.vel.set(0, 0, 0); st.grounded = true; }
      camera.position.copy(st.pos); camera.rotation.set(st.pitch, st.yaw, 0);
      return true;
    },
    update(dt, t) { const k = can(); icon.show(k ? (k === 'up' ? treehouse.ladderMid : treehouse.ladderTop) : null, k, k === 'up' ? ICON_UP : ICON_DOWN, k === 'up' ? 'Climb up' : 'Climb down', t); },
    get busy() { return !!job; },
  };
}
