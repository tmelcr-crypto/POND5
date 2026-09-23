import * as THREE from 'three';
import { clamp, lin } from '../../core/math.js';
import { hash2, vnoise2 } from '../../core/noise.js';
import { paint, mergeGeos } from '../../core/geometry.js';

/**
 * Small forest-floor things, as single vertex-coloured geometries (base at the origin, ~unit scale in metres) for
 * instancing: two mushrooms (a brown bolete, a fly agaric with white warts), a fallen stick with a side twig, and a
 * pale bracket-fungus shelf for logs and stumps. No randomness (noise and hashes only), so they can be built in any
 * order without touching the seeded stream.
 */
function cap(r, h, segs) {
  const g = new THREE.SphereGeometry(1, segs, Math.max(4, segs >> 1), 0, Math.PI * 2, 0, Math.PI * 0.55);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), rim = 1 + 0.04 * vnoise2(Math.atan2(z, x) * 3, 1.3); p.setXYZ(i, x * r * rim, (y - Math.cos(Math.PI * 0.55)) * h, z * r * rim); }
  g.computeVertexNormals(); return g;
}
function stem(r0, r1, h, segs) { const g = new THREE.CylinderGeometry(r1, r0, h, segs, 2); g.translate(0, h / 2, 0); return g; }

/** Brown bolete: fat pale stem, domed chestnut cap. ~9 cm tall. */
export function boleteGeo(detail = 1) {
  const s = detail ? 12 : 7;
  const st = stem(0.017, 0.012, 0.06, s), cp = cap(0.042, 0.03, s); cp.translate(0, 0.052, 0);
  const pale = lin(0xd8c9a8), brown = lin(0x6b3e1c), dark = lin(0x4a2a12);
  paint(st, (c, x, y) => c.copy(pale).multiplyScalar(0.8 + 0.25 * y / 0.06));
  paint(cp, (c, x, y, z, nx, ny) => { c.copy(brown).lerp(dark, clamp(0.5 + vnoise2(x * 90, z * 90) * 0.6)); if (ny < 0) c.copy(lin(0xc9b276)); });
  return mergeGeos([st, cp], ['position', 'normal', 'color']);
}
/** Fly agaric: slim white stem with a ring, red cap with white warts. ~12 cm tall. */
export function agaricGeo(detail = 1) {
  const s = detail ? 14 : 7;
  const st = stem(0.011, 0.008, 0.09, s), ring = new THREE.CylinderGeometry(0.014, 0.009, 0.01, s, 1, true); ring.translate(0, 0.07, 0);
  const cp = cap(0.045, 0.022, s); cp.translate(0, 0.084, 0);
  const white = lin(0xf2eee4), red = lin(0xc4201a), orange = lin(0xe0561c);
  paint(st, c => c.copy(white).multiplyScalar(0.92)); paint(ring, c => c.copy(white));
  paint(cp, (c, x, y, z, nx, ny) => {
    if (ny < 0) { c.copy(white).multiplyScalar(0.85); return; }
    c.copy(red).lerp(orange, clamp(1 - ny) * 0.5);
    const wart = hash2(Math.round(x * 160), Math.round(z * 160));   // vertex-sized white warts
    if (wart > 0.72 && ny > 0.25) c.copy(white);
  });
  return mergeGeos([st, ring, cp], ['position', 'normal', 'color']);
}
/** Fallen stick with a side twig, lying along x, ~1 m long, grey-brown with lichen specks. */
export function stickGeo() {
  const a = new THREE.CylinderGeometry(0.014, 0.02, 1, 5, 4); a.rotateZ(Math.PI / 2); a.translate(0, 0.016, 0);
  const b = new THREE.CylinderGeometry(0.006, 0.01, 0.32, 4, 1); b.translate(0, 0.16, 0); b.rotateZ(-1.1); b.rotateY(0.5); b.translate(0.12, 0.016, 0);
  const g = mergeGeos([a, b], ['position', 'normal']), bark = lin(0x3e3024), grey = lin(0x5e5448), lich = lin(0x8a8c62);
  return paint(g, (c, x, y, z) => { c.copy(bark).lerp(grey, clamp(0.5 + vnoise2(x * 9, z * 30))); if (hash2(Math.round(x * 60), Math.round(y * 200)) > 0.93) c.copy(lich); });
}
/** Bracket fungus shelf: a flattened half disc sticking out along +x from a surface. ~8 cm wide. */
export function bracketGeo() {
  const g = new THREE.SphereGeometry(1, 10, 5, -Math.PI / 2, Math.PI, 0, Math.PI / 2); g.scale(0.04, 0.012, 0.05);
  const cream = lin(0xd9c79a), tan = lin(0x9a7040);
  return paint(g, (c, x, y, z) => c.copy(tan).lerp(cream, clamp(Math.hypot(x, z) / 0.045)));
}
/** Pine cone lying on the ground (the spruce's cone, turned on its side). */
export function groundCone(pineconeGeo) {
  const g = pineconeGeo(14, 4, 2); g.rotateX(Math.PI / 2); g.translate(0, 0.02, 0.07); return g;
}
