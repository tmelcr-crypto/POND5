import * as THREE from 'three';
import { V, lin } from '../../core/math.js';
import { CONFIG } from '../../config.js';
import { H, HALF, forest, coastDist, streamDist, lakeD, walkwayDist, builtDist } from '../../world/layout.js';
import { obstacles } from '../../world/bounds.js';
import { rr, part, merge, herd, pose, voice } from './animalKit.js';

/**
 * Rabbits in the island's meadows (#38). Each sits and nibbles, now and then sits up to look round, or hops a few
 * short hops to a new patch. Come within CONFIG.animals.rabbits.flee m and it bolts: long hops away
 * from you, a thump, and it is gone into the grass, to turn up again later somewhere out of sight. Paler coats in
 * winter. All of them are one instanced mesh.
 */
function rabbitGeo() {
  const fur = (c, x, y) => c.copy(lin(0x7d6448)).lerp(lin(0xc8b596), Math.max(0, Math.min(1, (-0.03 - y) * 40))).multiplyScalar(0.9 + 0.12 * Math.sin(x * 90 + y * 60));   // y: in the part's own frame; pale only underneath
  const g = [
    part([0.075, 0.07, 0.11], [0, 0.085, -0.01], fur),                                       // body
    ...[-1, 1].map(s => part([0.042, 0.055, 0.072], [s * 0.048, 0.065, -0.045], fur)),       // haunches
    ...[-1, 1].map(s => part([0.02, 0.012, 0.05], [s * 0.04, 0.012, -0.02], 0x7a6448)),       // hind feet
    ...[-1, 1].map(s => part([0.014, 0.03, 0.016], [s * 0.028, 0.028, 0.065], fur)),         // front legs
    part([0.046, 0.046, 0.056], [0, 0.15, 0.085], fur),                                      // head
    part([0.028, 0.026, 0.03], [0, 0.138, 0.125], 0x9a8466),                                 // muzzle
    part([0.007, 0.006, 0.005], [0, 0.145, 0.153], 0xc98f86),                                // nose
    ...[-1, 1].map(s => part([0.009, 0.01, 0.008], [s * 0.034, 0.162, 0.11], 0x151210)),     // eyes
    ...[-1, 1].map(s => part([0.013, 0.07, 0.022], [s * 0.022, 0.225, 0.06], (c, x, y) => c.copy(lin(y > 0.05 ? 0x5a4a38 : 0x8b7457)), [-0.35, s * 0.2, s * 0.18])),   // ears
    part([0.026, 0.026, 0.024], [0, 0.1, -0.12], 0xf2efe8),                                  // tail
  ];
  return merge(g);
}

export function createRabbits(ctx, { ambience, seasons }) {
  const { scene, camera } = ctx, C = CONFIG.animals.rabbits, n = C.count;
  const im = herd(scene, rabbitGeo(), n);
  const ok = (x, z) => Math.max(Math.abs(x), Math.abs(z)) > HALF + 0.8 && forest(x, z) < 0.35 && coastDist(x, z) > CONFIG.island.beachWidth + 1 && streamDist(x, z) > 0.6 && lakeD(x, z) > 1.3 && walkwayDist(x, z) > 0.3 && builtDist(x, z) > 0.4 && free(x, z);
  const q = new V(); const free = (x, z) => { q.set(x, -100, z); obstacles.resolve(q, 0.15); return q.x === x && q.z === z; };
  const cam = camera.position;
  /** A spot between near and far m from you, out of your view if it can be. */
  function spot(near, far) {
    const fwd = new V(); camera.getWorldDirection(fwd);
    let best = null;
    for (let i = 0; i < 60; i++) {
      const a = rr(0, Math.PI * 2), d = rr(near, far), x = cam.x + Math.cos(a) * d, z = cam.z + Math.sin(a) * d;
      if (!ok(x, z)) continue;
      best = { x, z }; if ((Math.cos(a) * fwd.x + Math.sin(a) * fwd.z) < 0.2) return best;
    }
    return best;
  }
  const list = [];
  for (let i = 0; i < n; i++) { const s = spot(12, C.range) || { x: 20, z: 5 }; list.push({ x: s.x, z: s.z, yaw: rr(0, 6.28), state: 'sit', t: rr(1, 6), ph: rr(0, 6), hops: 0, from: new V(), to: new V(), h: 0, pause: 0 }); }
  let winter = false;
  const coat = new THREE.Color(), setTint = () => { coat.setRGB(winter ? 1.35 : 1, winter ? 1.35 : 1, winter ? 1.4 : 1); for (let i = 0; i < n; i++) im.setColorAt(i, coat); im.instanceColor.needsUpdate = true; };
  if (seasons) seasons.on(s => { winter = s === 'winter'; setTint(); });

  function hopTo(r, dist, spread, away) {   // the next hop's target: a short way on (or away from you), where a rabbit can be
    for (let k = 0; k < 8; k++) {
      const base = away !== undefined ? away : r.yaw, a = base + rr(-spread, spread), x = r.x + Math.sin(a) * dist, z = r.z + Math.cos(a) * dist;
      if (ok(x, z)) { r.from.set(r.x, 0, r.z); r.to.set(x, 0, z); r.yaw = a; r.h = 0; return true; }
    }
    return false;
  }
  return {
    update(dt) {
      for (let i = 0; i < n; i++) {
        const r = list[i], dx = r.x - cam.x, dz = r.z - cam.z, d = Math.hypot(dx, dz);
        r.t -= dt; r.ph += dt;
        if (r.state === 'gone') { pose(im, i, null); if (r.t <= 0) { const s = spot(C.spawn[0], C.spawn[1]); if (s) { r.x = s.x; r.z = s.z; r.state = 'sit'; r.t = rr(2, 6); } else r.t = 3; } continue; }
        if (d > C.range + 20) { r.state = 'gone'; r.t = rr(1, 4); continue; }   // left far behind: back near you, out of sight
        if (r.state !== 'flee' && d < C.flee) {
          r.state = 'flee'; r.t = C.fleeTime; r.hops = 99;
          const v = voice(ambience, camera, new V(r.x, H(r.x, r.z), r.z), 25, 0.9); if (v) { v.tone(90, 60, 0.12, 0.5); v.noise(0.08, 300, 1, 0.4, 'lowpass'); }   // a thump
          if (!hopTo(r, C.fleeHop, 0.6, Math.atan2(dx, dz))) { r.state = 'gone'; r.t = rr(...C.away); continue; }
        }
        let y = 0, pitch = 0, sy = 1;
        if (r.state === 'sit') {
          pitch = 0.12 + 0.05 * Math.max(0, Math.sin(r.ph * 7));   // nibbling
          if (r.t <= 0) { const k = Math.random(); if (k < 0.55) { r.hops = 1 + Math.floor(rr(0, 4)); r.state = hopTo(r, rr(0.3, 0.55), 1.2) ? 'hop' : 'sit'; r.pause = 0; } else if (k < 0.8) { r.state = 'look'; r.t = rr(1.5, 3.5); } r.t = r.state === 'sit' ? rr(2, 7) : r.t; }
        } else if (r.state === 'look') { pitch = -0.32; sy = 1.08; if (r.t <= 0) { r.state = 'sit'; r.t = rr(2, 6); } }
        if (r.state === 'hop' || r.state === 'flee') {
          const flee = r.state === 'flee', dur = flee ? C.fleeHopTime : C.hopTime, hh = flee ? 0.2 : 0.1;
          if (r.pause > 0) { r.pause -= dt; }
          else {
            r.h = Math.min(1, r.h + dt / dur);
            r.x = r.from.x + (r.to.x - r.from.x) * r.h; r.z = r.from.z + (r.to.z - r.from.z) * r.h;
            y = Math.sin(Math.PI * r.h) * hh; pitch = -0.35 * Math.cos(Math.PI * r.h); sy = 1 + 0.12 * Math.sin(Math.PI * r.h);
            if (r.h >= 1) {
              if (flee) { if (r.t <= 0 || d > C.gone) { r.state = 'gone'; r.t = rr(...C.away); pose(im, i, null); continue; } if (!hopTo(r, C.fleeHop, 0.5, Math.atan2(r.x - cam.x, r.z - cam.z))) { r.state = 'gone'; r.t = rr(...C.away); continue; } }
              else if (--r.hops > 0 && hopTo(r, rr(0.3, 0.55), 0.8)) r.pause = rr(0.15, 0.45);
              else { r.state = 'sit'; r.t = rr(3, 8); }
            }
          }
        }
        pose(im, i, r.x, H(r.x, r.z) + y - 0.005, r.z, r.yaw, pitch, 0, [1, sy, 1]);
      }
      im.instanceMatrix.needsUpdate = true;
    },
    get list() { return list.map(r => ({ x: +r.x.toFixed(2), z: +r.z.toFixed(2), state: r.state })); },
    mesh: im,
  };
}
