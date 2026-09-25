import * as THREE from 'three';
import { V, lin } from '../../core/math.js';
import { mergeGeos, paint, limb } from '../../core/geometry.js';

/**
 * Shared bits for the island's animals (rabbits, squirrels, frogs, gulls): body parts as coloured ellipsoids and rods
 * merged into one geometry per animal, an instanced mesh for all of a kind (one draw call and its shadow), a place for
 * each on the ground, and short sounds from where the animal is (quieter with distance, panned left or right).
 */
export const rr = (a, b) => a + (b - a) * Math.random();
export const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const tint = col => typeof col === 'function' ? col : (c => c.copy(lin(col)));
/** An ellipsoid of radii r at `at`, turned by rot (Euler), coloured col (a hex, or fn(c, x, y, z) in its own frame). */
export function part(r, at, col, rot = [0, 0, 0], seg = [14, 10]) {
  const g = new THREE.SphereGeometry(1, seg[0], seg[1]); g.scale(r[0], r[1], r[2]); paint(g, tint(col));
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...rot))); g.translate(at[0], at[1], at[2]); return g;
}
/** A rod from a to b (arrays), radius r0 to r1, coloured col. */
export function rod(a, b, r0, r1, col, seg = 6) { return paint(limb(new V(...a), new V(...b), r0, r1, seg, 1), tint(col)); }
export const merge = list => mergeGeos(list.map(g => g.index ? g.toNonIndexed() : g), ['position', 'normal', 'color']);
/** One instanced mesh for every animal of a kind (vertex colours, a tint per instance). */
export function herd(scene, geo, n, { roughness = 0.8, shadow = true, side = THREE.FrontSide } = {}) {
  const im = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0, side }), Math.max(1, n));
  im.count = n; im.castShadow = shadow; im.receiveShadow = true; im.frustumCulled = false; im.userData.dynamic = true;
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3).fill(1), 3);
  scene.add(im); return im;
}
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new V(), P = new V(), ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
/** Instance i at (x, y, z), turned yaw about y then pitch about its own x and roll about its own z; scale s (number or
 *  [x, y, z]); null hides it. */
export function pose(im, i, x, y, z, yaw = 0, pitch = 0, roll = 0, s = 1) {
  if (x === null) { im.setMatrixAt(i, ZERO); return; }
  E.set(pitch, yaw, roll, 'YXZ'); Q.setFromEuler(E);
  if (Array.isArray(s)) S.set(s[0], s[1], s[2]); else S.setScalar(s);
  im.setMatrixAt(i, M.compose(P.set(x, y, z), Q, S));
}

/* ---- sounds ---- */
let noiseBuf = null;
/** A voice at `at` for a short sound: { ac, t, out, noise(dur, f, q, g, type, at) , tone(f0, f1, dur, g, at, type) }, or
 *  null out of earshot or before the audio has started. Loudness falls off with distance; panned by direction. */
export function voice(ambience, camera, at, reach = 30, level = 1) {
  const A = ambience && ambience.audio; if (!A) return null;
  const d = camera.position.distanceTo(at); if (d > reach) return null;
  const { ac, out } = A, t = ac.currentTime, g = ac.createGain(); g.gain.value = level * Math.min(1, 3 / (2 + d)) * (1 - d / reach);
  if (ac.createStereoPanner) {
    const p = ac.createStereoPanner(), v = at.clone().sub(camera.position).normalize(), right = new V(1, 0, 0).applyQuaternion(camera.quaternion);
    p.pan.value = Math.max(-1, Math.min(1, v.dot(right))) * 0.8; g.connect(p); p.connect(out);
  } else g.connect(out);
  if (!noiseBuf) { noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const dd = noiseBuf.getChannelData(0); for (let i = 0; i < dd.length; i++) dd[i] = Math.random() * 2 - 1; }
  const env = (node, dur, gain, at0) => { const v = ac.createGain(); v.gain.setValueAtTime(0, t + at0); v.gain.linearRampToValueAtTime(gain, t + at0 + 0.008); v.gain.exponentialRampToValueAtTime(0.0008, t + at0 + dur); node.connect(v); v.connect(g); };
  return {
    ac, t, out: g,
    noise(dur, f, q, gain, type = 'bandpass', at0 = 0) { const s = ac.createBufferSource(); s.buffer = noiseBuf; const fl = ac.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; s.connect(fl); env(fl, dur, gain, at0); s.start(t + at0, Math.random() * 0.5, dur + 0.05); },
    tone(f0, f1, dur, gain, at0 = 0, type = 'sine', filter = 0) {
      const o = ac.createOscillator(); o.type = type; o.frequency.setValueAtTime(f0, t + at0); o.frequency.exponentialRampToValueAtTime(f1, t + at0 + dur);
      let node = o; if (filter) { const fl = ac.createBiquadFilter(); fl.type = 'bandpass'; fl.frequency.value = filter; fl.Q.value = 2.5; o.connect(fl); node = fl; }
      env(node, dur, gain, at0); o.start(t + at0); o.stop(t + at0 + dur + 0.05);
    },
  };
}
