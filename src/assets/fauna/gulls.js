import * as THREE from 'three';
import { V, lin } from '../../core/math.js';
import { CONFIG } from '../../config.js';
import { H, SEA_Y, JETTY, coastDist, jettyDist } from '../../world/layout.js';
import { JETTY_LOOK } from '../water/jetty.js';
import { rr, part, rod, merge, herd, pose, voice } from './animalKit.js';

/**
 * Seagulls round the jetty (#44), close up (the far circling ones are world/birds.js). They stand on the bollards, the
 * edge of the jetty's head, the crate and the sand by the jetty, look about and call now and then. Come within
 * CONFIG.animals.gulls.scare m and a gull takes off with an alarm call, circles over the jetty and the beach a while,
 * and glides back down to a free perch when you are away from it. Two instanced meshes: the gulls (wings folded) and
 * the spread wings of the ones in the air.
 */
function gullGeo() {
  const white = 0xf4f3ef, grey = 0xa7aeb5;
  return merge([
    part([0.075, 0.075, 0.17], [0, 0.2, 0], white),                                             // body
    part([0.08, 0.052, 0.17], [0, 0.235, -0.04], grey),                                         // folded wings on the back
    part([0.045, 0.02, 0.085], [0, 0.228, -0.2], 0x1c1c1e, [0.15, 0, 0]),                        // black wingtips
    part([0.05, 0.016, 0.06], [0, 0.215, -0.17], white, [0.2, 0, 0]),                           // tail
    part([0.05, 0.05, 0.058], [0, 0.3, 0.13], white),                                           // head
    rod([0, 0.293, 0.178], [0, 0.284, 0.236], 0.011, 0.006, 0xe8c02c),                          // beak
    part([0.005, 0.005, 0.006], [0, 0.279, 0.222], 0xc8321e),                                   // its red spot
    ...[-1, 1].map(s => part([0.006, 0.007, 0.006], [s * 0.034, 0.31, 0.155], 0x16140f)),       // eyes
    ...[-1, 1].map(s => rod([s * 0.025, 0.14, 0.01], [s * 0.025, 0.004, 0.02], 0.006, 0.005, 0xd9a07a)),   // legs
    ...[-1, 1].map(s => part([0.02, 0.004, 0.03], [s * 0.025, 0.003, 0.038], 0xd9a07a)),        // feet
  ]);
}
function wingGeo() {   // a right wing from the shoulder along +x, flat, swept back; grey with a black tip
  const s = new THREE.Shape(); s.moveTo(0, 0.08); s.lineTo(0.3, 0.06); s.lineTo(0.62, -0.02); s.lineTo(0.56, -0.09); s.lineTo(0.3, -0.1); s.lineTo(0, -0.09); s.lineTo(0, 0.08);
  const g = new THREE.ShapeGeometry(s); g.rotateX(Math.PI / 2);
  const p = g.attributes.position, c = new Float32Array(p.count * 3), grey = lin(0xa7aeb5), black = lin(0x1c1c1e);
  for (let i = 0; i < p.count; i++) { const k = p.getX(i) > 0.46 ? black : grey; c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}

export function createGulls(ctx, { ambience, skyUniforms }) {
  const { scene, camera } = ctx, C = CONFIG.animals.gulls, n = C.count, cam = camera.position, J = JETTY, top = J.deckY;
  const im = herd(scene, gullGeo(), n), wings = herd(scene, wingGeo(), n * 2, { side: THREE.DoubleSide });
  // perches: the two bollards, the head's edge, the crate, and a few places on the sand by the jetty
  const perches = [
    ...J.bollards.map(([x, z]) => ({ x, z, y: top + 0.525 })),
    { x: J.head.x0 + 0.5, z: J.z + J.head.halfW - 0.12, y: top },   // the head's edge (the lamp post's top has its lantern)
    { x: 43.1, z: J.z + J.head.halfW - 0.42, y: top + JETTY_LOOK.crate[1] + 0.005 },
  ];
  for (let k = 0; k < 200 && perches.length < 4 + C.beach; k++) {
    const x = rr(J.x0 - 8, J.x0 + 1), z = J.z + rr(-7, 7);
    if (coastDist(x, z) > 0.6 && coastDist(x, z) < 2.4 && H(x, z) > SEA_Y + 0.12 && jettyDist(x, z) > 1.2 && !perches.some(p => Math.hypot(p.x - x, p.z - z) < 1.5)) perches.push({ x, z, y: H(x, z) });
  }
  const taken = new Set(), centre = new V(J.x0 + 7, 0, J.z);
  const list = [];
  for (let i = 0; i < n; i++) { const k = [0, 2, 4, 1, 5, 3][i % 6] % perches.length; taken.add(k); const p = perches[k]; list.push({ perch: k, state: 'stand', t: rr(3, 12), call: rr(5, 20), p: new V(p.x, p.y, p.z), v: new V(), yaw: rr(0, 6.28), ph: rr(0, 6), flap: 0, ring: rr(0, 6.28), alt: rr(7, 11) }); }
  const call = (g, alarm) => {
    const v = voice(ambience, camera, g.p, 60, 0.9); if (!v) return;
    if (alarm) for (let k = 0; k < 3; k++) v.tone(1350, 1150, 0.09, 0.3, k * 0.13, 'sawtooth', 1700);
    else { v.tone(1500, 950, 0.38, 0.32, 0, 'sawtooth', 1800); v.tone(1250, 1050, 0.16, 0.22, 0.45, 'sawtooth', 1700); v.tone(1250, 1050, 0.16, 0.2, 0.66, 'sawtooth', 1700); }
  };
  const dir = new V(), want = new V();
  return {
    update(dt) {
      const night = skyUniforms ? skyUniforms.uNight.value > 0.5 : false;
      for (let i = 0; i < n; i++) {
        const g = list[i]; g.t -= dt; g.ph += dt;
        const d = g.p.distanceTo(cam);
        if (g.state === 'stand') {
          if (d < C.scare) { g.state = 'fly'; g.t = rr(...C.flyTime); taken.delete(g.perch); g.v.set(g.p.x - cam.x, 0, g.p.z - cam.z).normalize().multiplyScalar(3).setY(3.5); call(g, true); }
          else {
            if (g.t <= 0) { g.yaw += rr(-1.2, 1.2); g.t = rr(2, 8); }
            if (!night && (g.call -= dt) <= 0) { g.call = rr(...C.callEvery); call(g, false); }
            pose(im, i, g.p.x, g.p.y, g.p.z, g.yaw, 0); pose(wings, i * 2, null); pose(wings, i * 2 + 1, null); continue;
          }
        }
        // in the air: round the jetty, then (state 'land') down to a free perch
        let flap = 0.75;
        if (g.state === 'fly') {
          g.ring += dt * C.speed / C.circle;
          want.set(centre.x + Math.cos(g.ring) * C.circle, SEA_Y + g.alt, centre.z + Math.sin(g.ring) * C.circle);
          if (g.t <= 0) {
            const k = perches.findIndex((p, j) => !taken.has(j) && Math.hypot(p.x - cam.x, p.z - cam.z) > C.scare + 4 && Math.random() < 0.6);
            if (k >= 0) { g.state = 'land'; g.perch = k; taken.add(k); } else g.t = rr(4, 10);
          }
        }
        if (g.state === 'land') {
          const p = perches[g.perch]; want.set(p.x, p.y, p.z);
          const left = g.p.distanceTo(want); flap = left < 6 ? 0.25 : 0.5;
          if (left < 0.12 || (Math.hypot(p.x - cam.x, p.z - cam.z) < C.scare && left < 4)) {
            if (left < 0.12) { g.p.copy(want); g.state = 'stand'; g.t = rr(3, 10); g.call = rr(4, 15); continue; }
            taken.delete(g.perch); g.state = 'fly'; g.t = rr(...C.flyTime);   // you came close again: round once more
          }
        }
        // steer towards `want` at flying speed (slowing to land)
        dir.copy(want).sub(g.p); const dist = dir.length(), sp = g.state === 'land' ? Math.min(C.speed, 0.8 + dist * 1.2) : C.speed;
        dir.multiplyScalar(1 / Math.max(dist, 1e-3) * sp);
        g.v.lerp(dir, Math.min(1, dt * 1.6)); g.p.addScaledVector(g.v, dt);
        const floor = H(g.p.x, g.p.z) + 0.2; if (g.state !== 'land' && g.p.y < floor + 1) g.p.y = Math.max(g.p.y, floor + 1);
        g.yaw = Math.atan2(g.v.x, g.v.z);
        const pitch = -Math.atan2(g.v.y, Math.hypot(g.v.x, g.v.z)) * 0.6, beat = Math.sin(g.ph * C.beats * Math.PI * 2) * flap + 0.12;
        pose(im, i, g.p.x, g.p.y - 0.2, g.p.z, g.yaw, pitch);
        const sx = Math.cos(g.yaw) * 0.065, sz = -Math.sin(g.yaw) * 0.065;   // the shoulders, either side of the body
        pose(wings, i * 2, g.p.x + sx, g.p.y + 0.035, g.p.z + sz, g.yaw, pitch, beat);
        pose(wings, i * 2 + 1, g.p.x - sx, g.p.y + 0.035, g.p.z - sz, g.yaw, pitch, -beat, [-1, 1, 1]);
      }
      im.instanceMatrix.needsUpdate = true; wings.instanceMatrix.needsUpdate = true;
    },
    get list() { return list.map(g => ({ state: g.state, perch: g.perch, y: +g.p.y.toFixed(2) })); },
    perches: perches.length, mesh: im,
  };
}
