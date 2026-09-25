import { V, lin } from '../../core/math.js';
import { CONFIG } from '../../config.js';
import { H, LAKE, lakeD, WATER_Y } from '../../world/layout.js';
import { rr, part, merge, herd, pose, voice } from './animalKit.js';

/**
 * Frogs round the pond (#40). They sit on the lily pads and the bank; from dusk into the night they croak (a throat sac
 * puffs out with each call). Come within CONFIG.animals.frogs.jump m and one leaps into the pond with a splash, stays
 * under a while, and climbs out again on a free pad or the bank when you are not close. Asleep in winter (the pond is
 * frozen). Two instanced meshes: the frogs and their throat sacs.
 */
function frogGeo() {
  const skin = (c, x, y, z) => { c.copy(lin(0x4f6f24)).lerp(lin(0xd9c878), Math.max(0, Math.min(1, (-0.008 - y) * 90))); if (Math.sin(x * 160) * Math.sin(z * 140) > 0.72 && y > 0.01) c.multiplyScalar(0.55); };   // y: in the part's own frame; a pale belly
  return merge([
    part([0.034, 0.021, 0.046], [0, 0.024, -0.004], skin, [0.2, 0, 0]),                         // body, sloping down to the head
    part([0.03, 0.017, 0.028], [0, 0.03, 0.032], skin),                                          // head
    ...[-1, 1].map(s => part([0.009, 0.009, 0.009], [s * 0.017, 0.046, 0.034], 0x6c8a34)),       // eye bumps
    ...[-1, 1].map(s => part([0.005, 0.005, 0.004], [s * 0.019, 0.049, 0.039], 0x1a1408)),       // pupils
    ...[-1, 1].map(s => part([0.017, 0.011, 0.04], [s * 0.034, 0.014, -0.022], skin, [0, s * 0.35, 0])),   // folded hind legs
    ...[-1, 1].map(s => part([0.02, 0.005, 0.012], [s * 0.044, 0.004, 0.006], 0x6f8a3a)),        // hind feet forward under
    ...[-1, 1].map(s => part([0.006, 0.014, 0.006], [s * 0.022, 0.01, 0.036], skin)),            // front legs
  ]);
}

export function createFrogs(ctx, { ambience, seasons, waterLife, skyUniforms, pads = [] }) {
  const { scene, camera } = ctx, C = CONFIG.animals.frogs, n = C.count, cam = camera.position;
  const im = herd(scene, frogGeo(), n, { roughness: 0.45, shadow: false });   // too small for a shadow to show
  const sac = herd(scene, merge([part([0.016, 0.013, 0.014], [0, 0, 0], 0xe8dc9a)]), n, { roughness: 0.3, shadow: false });
  // places on the bank: round the pond, just above the water, facing it
  const bank = [];
  for (let k = 0; k < 72; k++) {
    const a = k / 72 * Math.PI * 2;
    for (let r = 0.9; r < 2.2; r += 0.03) {
      const x = LAKE.x + Math.cos(a) * r * 1.9, z = LAKE.z + Math.sin(a) * r * 1.9;
      if (lakeD(x, z) > 1 && H(x, z) > WATER_Y + 0.015) { if (H(x, z) < WATER_Y + 0.12) bank.push({ x, z, yaw: Math.atan2(LAKE.x - x, LAKE.z - z) }); break; }
    }
  }
  // the bigger lily pads first (frogs on them show against the water; in the bank's long grass they hardly would)
  const onPads = pads.filter(p => p.geometry.parameters && p.geometry.parameters.radius > 0.12).map(p => ({ x: p.position.x, z: p.position.z, yaw: Math.random() * 6.28, pad: p }));
  const places = onPads.concat(bank.filter((_, k) => k % 9 === 0));
  const list = [];
  const pick = (farFrom) => { for (let k = 0; k < 30; k++) { const b = Math.random() < 0.75 && onPads.length ? onPads[Math.floor(Math.random() * onPads.length)] : places[Math.floor(Math.random() * places.length)]; if (!farFrom || Math.hypot(b.x - farFrom.x, b.z - farFrom.z) > C.reappear) if (!list.some(f => f.state !== 'under' && Math.hypot(f.x - b.x, f.z - b.z) < 0.5)) return b; } return null; };
  for (let i = 0; i < n; i++) { const b = pick() || places[i % Math.max(1, places.length)] || { x: LAKE.x + 2, z: LAKE.z, yaw: 0 }; list.push({ pad: b.pad || null, x: b.x, z: b.z, yaw: b.yaw + rr(-0.4, 0.4), state: 'sit', t: rr(2, 12), croak: 0, calls: 0, from: new V(), to: new V(), h: 0 }); }
  let asleep = false;
  if (seasons) seasons.on(s => { asleep = s === 'winter'; });
  const ribbit = f => {
    const v = voice(ambience, camera, new V(f.x, H(f.x, f.z) + 0.03, f.z), 40, 1.1); if (!v) return;
    for (let p = 0; p < 2; p++) { v.tone(420, 260, 0.09, 0.35, p * 0.13, 'sawtooth', 700); v.noise(0.08, 900, 3, 0.12, 'bandpass', p * 0.13); }
  };
  return {
    update(dt) {
      const night = skyUniforms ? skyUniforms.uNight.value : 0, chorus = night > C.dusk;
      for (let i = 0; i < n; i++) {
        const f = list[i];
        if (asleep) { pose(im, i, null); pose(sac, i, null); continue; }
        f.t -= dt;
        const d = Math.hypot(f.x - cam.x, f.z - cam.z);
        if (f.state === 'under') {
          pose(im, i, null); pose(sac, i, null);
          if (f.t <= 0 && d > C.reappear) { const b = pick(cam); if (b) { f.pad = b.pad || null; f.x = b.x; f.z = b.z; f.yaw = b.yaw + rr(-0.4, 0.4); f.state = 'sit'; f.t = rr(3, 10); } }
          continue;
        }
        if (f.state === 'sit' && d < C.jump) {   // into the water
          f.state = 'leap'; f.h = 0; f.from.set(f.x, f.pad ? f.pad.position.y + 0.003 : H(f.x, f.z), f.z);
          const a = f.pad ? Math.atan2(f.x - cam.x, f.z - cam.z) + rr(-0.5, 0.5) : Math.atan2(LAKE.x - f.x, LAKE.z - f.z) + rr(-0.3, 0.3); f.yaw = a; f.to.set(f.x + Math.sin(a) * C.leap, WATER_Y, f.z + Math.cos(a) * C.leap);
        }
        let y = f.pad ? f.pad.position.y + 0.003 : H(f.x, f.z), pitch = 0, puff = 0;
        if (f.state === 'leap') {
          f.h = Math.min(1, f.h + dt / C.leapTime);
          f.x = f.from.x + (f.to.x - f.from.x) * f.h; f.z = f.from.z + (f.to.z - f.from.z) * f.h;
          y = f.from.y + (f.to.y - f.from.y) * f.h + Math.sin(Math.PI * f.h) * 0.22; pitch = -0.6 * Math.cos(Math.PI * f.h);
          if (f.h >= 1) {
            f.state = 'under'; f.t = rr(...C.under); f.pad = null;
            if (waterLife && waterLife.splash) waterLife.splash(f.x, WATER_Y + 0.002, f.z, 0.22);
            const v = voice(ambience, camera, new V(f.x, WATER_Y, f.z), 25, 1); if (v) { v.noise(0.25, 900, 0.8, 0.35, 'lowpass'); v.tone(700, 300, 0.06, 0.08); }
            continue;
          }
        } else if (chorus) {   // croaking: a few calls, a pause
          if (f.croak > 0) { f.croak -= dt; puff = Math.max(0, Math.sin((0.5 - f.croak % 0.5) / 0.5 * Math.PI)); if (f.croak % 0.5 > 0.47 && !f.called) { f.called = true; ribbit(f); } if (f.croak % 0.5 < 0.3) f.called = false; }
          else if (f.t <= 0) { f.croak = 0.5 * Math.floor(rr(2, 5)); f.t = rr(...C.croakEvery); }
        }
        pose(im, i, f.x, y, f.z, f.yaw, pitch, 0, C.size);
        if (puff > 0.02) pose(sac, i, f.x + Math.sin(f.yaw) * 0.034 * C.size, y + 0.012 * C.size, f.z + Math.cos(f.yaw) * 0.034 * C.size, f.yaw, 0, 0, (0.4 + puff) * C.size); else pose(sac, i, null);
      }
      im.instanceMatrix.needsUpdate = true; sac.instanceMatrix.needsUpdate = true;
    },
    get list() { return list.map(f => ({ x: +f.x.toFixed(2), z: +f.z.toFixed(2), state: f.state })); },
    bank: bank.length, pads: onPads.length, mesh: im,
  };
}
