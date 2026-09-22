import * as THREE from 'three';
import { UPV } from './math.js';
import { fbm3 } from './noise.js';

/** Geometry helpers: vertex welding, noisy blobs, per-vertex painting, merging, branch limbs. */
export function weld(geo) {
  if (geo.index) geo = geo.toNonIndexed();
  const pos = geo.attributes.position, map = new Map(), verts = [], idx = [];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const k = Math.round(x * 1e4) + ',' + Math.round(y * 1e4) + ',' + Math.round(z * 1e4);
    let j = map.get(k); if (j === undefined) { j = verts.length / 3; verts.push(x, y, z); map.set(k, j); } idx.push(j);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setIndex(idx); return g;
}
export function blobGeo(detail, amp, freq, off) {
  const g = weld(new THREE.IcosahedronGeometry(1, detail)); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const s = 1 + amp * fbm3(x * freq + off, y * freq - off * 0.7, z * freq + off * 1.3); p.setXYZ(i, x * s, y * s, z * s); }
  return g;
}
export function paint(g, fn) {
  const p = g.attributes.position, n = g.attributes.normal, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(col, p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i)); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
export function mergeGeos(list, attrs) {
  const out = {}; attrs.forEach(a => out[a] = []);
  for (let g of list) { if (g.index) g = g.toNonIndexed(); for (const a of attrs) { const arr = g.attributes[a].array; const o = out[a]; for (let i = 0; i < arr.length; i++) o.push(arr[i]); } }
  const m = new THREE.BufferGeometry(); for (const a of attrs) m.setAttribute(a, new THREE.Float32BufferAttribute(out[a], a === 'uv' ? 2 : 3)); return m;
}
export function limb(a, b, r0, r1, radial = 8, hs = 1) {
  const d = b.clone().sub(a); const len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, radial, hs, true); g.translate(0, len / 2, 0);
  g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UPV, d.normalize()))); g.translate(a.x, a.y, a.z); return g;
}
export function joint(p, r) { const g = new THREE.SphereGeometry(r, 8, 6); g.translate(p.x, p.y, p.z); return g; }
