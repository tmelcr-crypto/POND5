import { V, lin } from '../../core/math.js';
import { CONFIG } from '../../config.js';
import { H, forest, walkwayDist } from '../../world/layout.js';
import { rr, part, merge, herd, pose, voice } from './animalKit.js';

/**
 * Red squirrels in the spruce woods (#39). Each keeps to one tree: it forages on the ground round it in quick dashes,
 * now and then runs up the trunk to sit on the bark and chatter, and comes down head first. Come within
 * CONFIG.animals.squirrels.flee m while it is on the ground and it dashes up its tree out of reach until you have gone;
 * up there it sometimes drops a spruce cone (a real one: app/items.js drop(), to pick up). One instanced mesh.
 */
function squirrelGeo() {
  const fur = (c, x, y) => c.copy(lin(0xa4522a)).lerp(lin(0xe9dcc4), Math.max(0, Math.min(1, (-0.02 - y) * 50)));   // y: in the part's own frame; a pale belly
  const tail = c => c.copy(lin(0x9a4a24));
  return merge([
    part([0.036, 0.042, 0.075], [0, 0.058, 0], fur, [-0.35, 0, 0]),                             // body, hunched
    part([0.03, 0.03, 0.035], [0, 0.098, 0.065], fur),                                          // head
    part([0.014, 0.013, 0.016], [0, 0.092, 0.095], 0x8a4422),                                   // snout
    ...[-1, 1].map(s => part([0.007, 0.007, 0.006], [s * 0.021, 0.106, 0.084], 0x120c08)),      // eyes
    ...[-1, 1].map(s => part([0.007, 0.018, 0.006], [s * 0.015, 0.132, 0.058], 0x8a4422, [0, 0, s * 0.2])),   // ears with tufts
    ...[-1, 1].map(s => part([0.012, 0.028, 0.03], [s * 0.028, 0.03, -0.03], fur)),             // hind legs
    ...[-1, 1].map(s => part([0.007, 0.02, 0.008], [s * 0.016, 0.036, 0.055], fur)),            // front paws
    part([0.036, 0.05, 0.034], [0, 0.07, -0.085], tail, [0.5, 0, 0]),                           // tail: up the back in an S
    part([0.04, 0.055, 0.036], [0, 0.135, -0.1], tail, [-0.2, 0, 0]),
    part([0.034, 0.04, 0.03], [0, 0.18, -0.07], tail, [-0.9, 0, 0]),
  ]);
}

export function createSquirrels(ctx, { ambience, scatter, items, seasons }) {
  const { scene, camera } = ctx, C = CONFIG.animals.squirrels, cam = camera.position;
  // their trees: island spruces in the woods, not beside a path
  const pool = (scatter ? scatter.trees : []).filter(t => t.species === 'spruce' && forest(t.t.x, t.t.z) > 0.35 && walkwayDist(t.t.x, t.t.z) > 2.1);   // (walkwayDist reaches at most 2.2 m)
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const trees = pool.slice(0, C.count).map(t => ({ x: t.t.x, z: t.t.z, y: H(t.t.x, t.t.z), r: t.v.trunkRadius * t.t.s * 0.55, h: t.v.height * t.t.s }));
  const n = trees.length, im = herd(scene, squirrelGeo(), n);
  const list = trees.map(tr => ({ tr, state: 'forage', t: rr(1, 5), x: tr.x + rr(1, 2.5), z: tr.z + rr(-1, 1), yaw: rr(0, 6.28), a: rr(0, 6.28), up: 0, target: 0, from: new V(), to: new V(), h: 0, dash: 0, chatter: 0 }));
  const trunkR = (s, y) => s.tr.r * (1 - y / s.tr.h) + 0.035;   // the trunk tapers
  const chatter = s => {
    const p = new V(s.tr.x + Math.cos(s.a) * trunkR(s, s.up), s.tr.y + s.up, s.tr.z + Math.sin(s.a) * trunkR(s, s.up)), v = voice(ambience, camera, p, 30, 0.8); if (!v) return;
    for (let k = 0; k < 7; k++) v.noise(0.03, rr(3500, 5200), 6, 0.2, 'bandpass', k * 0.06 + rr(0, 0.02));
  };
  return {
    update(dt) {
      for (let i = 0; i < n; i++) {
        const s = list[i], tr = s.tr; s.t -= dt;
        const onGround = s.state === 'forage' || s.state === 'dash', d = onGround ? Math.hypot(s.x - cam.x, s.z - cam.z) : Math.hypot(tr.x - cam.x, tr.z - cam.z);
        if (onGround && d < C.flee) { s.state = 'toTree'; s.h = 0; s.from.set(s.x, 0, s.z); s.a = Math.atan2(s.z - tr.z, s.x - tr.x); s.target = rr(...C.escape); }
        if (s.state === 'forage') {
          if (s.t <= 0) {
            if (Math.random() < 0.25) { s.state = 'toTree'; s.h = 0; s.from.set(s.x, 0, s.z); s.a = Math.atan2(s.z - tr.z, s.x - tr.x); s.target = rr(1.5, 3.5); }
            else { const a = rr(0, 6.28), rad = rr(0.8, C.roam), x = tr.x + Math.cos(a) * rad, z = tr.z + Math.sin(a) * rad; s.from.set(s.x, 0, s.z); s.to.set(x, 0, z); s.h = 0; s.state = 'dash'; s.yaw = Math.atan2(x - s.x, z - s.z); }
          }
          pose(im, i, s.x, H(s.x, s.z), s.z, s.yaw, 0.15 * Math.max(0, Math.sin(s.t * 9)));
        } else if (s.state === 'dash') {
          s.h = Math.min(1, s.h + dt * C.speed / Math.max(0.2, s.from.distanceTo(s.to)));
          s.x = s.from.x + (s.to.x - s.from.x) * s.h; s.z = s.from.z + (s.to.z - s.from.z) * s.h;
          pose(im, i, s.x, H(s.x, s.z) + Math.abs(Math.sin(s.h * 18)) * 0.03, s.z, s.yaw, 0);
          if (s.h >= 1) { s.state = 'forage'; s.t = rr(1.5, 5); }
        } else if (s.state === 'toTree') {   // to the foot of the trunk
          const bx = tr.x + Math.cos(s.a) * trunkR(s, 0), bz = tr.z + Math.sin(s.a) * trunkR(s, 0), dd = Math.hypot(bx - s.x, bz - s.z);
          if (dd < 0.05) { s.state = 'climb'; s.up = 0.02; }
          else { const step = Math.min(dd, C.speed * 1.4 * dt); s.x += (bx - s.x) / dd * step; s.z += (bz - s.z) / dd * step; s.yaw = Math.atan2(bx - s.x, bz - s.z); }
          pose(im, i, s.x, H(s.x, s.z), s.z, s.yaw, 0);
        }
        if (s.state === 'climb' || s.state === 'perch' || s.state === 'down') {
          if (s.state === 'climb') { s.up = Math.min(s.target, s.up + C.climb * dt); s.a += dt * 0.9; if (s.up >= s.target) { s.state = 'perch'; s.t = rr(...C.perch); } }
          else if (s.state === 'perch') {
            if (s.t <= 0 && d > C.flee + 3) s.state = 'down'; else if (s.t <= 0) s.t = 2;
            if ((s.chatter -= dt) <= 0) { s.chatter = rr(4, 12); if (Math.random() < 0.6) chatter(s); }
            if (items && Math.random() < dt / C.coneEvery && !(seasons && seasons.season === 'winter')) { const r = trunkR(s, s.up) + 0.25; items.drop('cone', new V(tr.x + Math.cos(s.a) * r, tr.y + s.up + 0.1, tr.z + Math.sin(s.a) * r)); }
          } else { s.up = Math.max(0, s.up - C.climb * 0.8 * dt); s.a -= dt * 0.7; if (s.up <= 0) { s.state = 'forage'; s.t = rr(1, 3); s.x = tr.x + Math.cos(s.a) * (trunkR(s, 0) + 0.1); s.z = tr.z + Math.sin(s.a) * (trunkR(s, 0) + 0.1); } }
          // on the bark: belly to the trunk, head up (or down on the way down)
          const r = trunkR(s, s.up), x = tr.x + Math.cos(s.a) * r, z = tr.z + Math.sin(s.a) * r, faceIn = Math.atan2(tr.x - x, tr.z - z);
          const down = s.state === 'down'; pose(im, i, x, tr.y + s.up, z, down ? faceIn + Math.PI : faceIn, down ? Math.PI / 2 : -Math.PI / 2);
        }
      }
      im.instanceMatrix.needsUpdate = true;
    },
    get list() { return list.map(s => ({ state: s.state, up: +s.up.toFixed(2), tree: [+s.tr.x.toFixed(1), +s.tr.z.toFixed(1)] })); },
    mesh: im,
  };
}
