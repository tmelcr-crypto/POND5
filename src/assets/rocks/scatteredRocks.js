import * as THREE from 'three';
import { rng, rr } from '../../core/random.js';
import { clamp, lin } from '../../core/math.js';
import { fbm3 } from '../../core/noise.js';
import { blobGeo, paint, mergeGeos } from '../../core/geometry.js';
import { LAKE, lakeR, H } from '../../world/layout.js';

/**
 * Loose mossy stones around the pond edge and in the meadow.
 */
export function createScatteredRocks(ctx) {
  const { scene } = ctx;
  {
    const parts = [], grey = lin(0x7a766d), greyB = lin(0x57544f), moss = lin(0x4b5c26);
    const spots = [];
    for (let i = 0; i < 9; i++) { const a = 0.3 + i * 0.62 + rr(-0.15, 0.15), r = lakeR(a) * rr(0.98, 1.12); spots.push([LAKE.x + Math.cos(a) * r, LAKE.z + Math.sin(a) * r, rr(0.12, 0.3)]); }
    spots.push([4.35, 0.3, 0.32], [-0.6, -4.1, 0.26], [4.2, 3.5, 0.2], [0.2, 4.3, 0.24]);
    spots.forEach(([x, z, s], i) => {
      if (Math.abs(x) > 4.6 || Math.abs(z) > 4.6) return;
      const g = blobGeo(3, 0.42, 1.4, i * 5.1 + 2);
      const sy = s * rr(0.45, 0.7);
      g.scale(s * rr(0.9, 1.3), sy, s * rr(0.8, 1.1)); g.rotateY(rng() * 6.28); g.translate(x, H(x, z) + sy * 0.25, z);
      g.computeVertexNormals();
      paint(g, (c, px, py, pz, nx, ny) => { const n = fbm3(px * 9, py * 9, pz * 9); c.copy(grey).lerp(greyB, clamp(n + 0.5)); c.lerp(moss, clamp((ny - 0.55) * 2.5 + n) * 0.85); });
      parts.push(g);
    });
    const mesh = new THREE.Mesh(mergeGeos(parts, ['position', 'normal', 'color']), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88 }));
    mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  }
}

/**
 * Scatter prototypes: a few unit-sized mossy boulders (vertex painted, ~320 triangles each) for the wider world.
 * Local space, resting on y = 0 with ~30% below ground. Replaceable by GLB meshes.
 */
export function createRockPrototypes(count = 3) {
  const grey = lin(0x7a766d), greyB = lin(0x57544f), moss = lin(0x4b5c26), lichen = lin(0x9c9a78);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, envMapIntensity: 0.55 });
  const out = [];
  for (let i = 0; i < count; i++) {
    const g = blobGeo(2, 0.4 + i * 0.06, 1.2 + i * 0.25, 30 + i * 7.7);
    g.scale(1, 0.55 + i * 0.12, 0.85); g.translate(0, 0.25, 0);
    g.computeVertexNormals();
    paint(g, (c, px, py, pz, nx, ny) => { const n = fbm3(px * 5 + i, py * 5, pz * 5); c.copy(grey).lerp(greyB, clamp(n + 0.5)); c.lerp(moss, clamp((ny - 0.5) * 2.2 + n) * 0.8); if (fbm3(px * 11, py * 11, pz * 11) > 0.3) c.lerp(lichen, 0.35); });
    out.push({ name: 'rock' + i, height: 1, width: 1.6, lods: [{ parts: [{ geometry: g, material: mat, castShadow: true }] }] });
  }
  return out;
}
