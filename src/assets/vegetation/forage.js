import * as THREE from 'three';
import { V, lin } from '../../core/math.js';
import { mergeGeos } from '../../core/geometry.js';
import { H, SEA_Y, WORLD_HALF, coastDist, forest, walkwayDist } from '../../world/layout.js';
import { CONFIG } from '../../config.js';

/**
 * Things on the island to pick up that did not exist before (app/items.js makes them collectable): windfall apples
 * lying under the island's apple trees, clusters of berries on some of its bushes, and pebbles on the beaches and the
 * meadow. One instanced mesh each; hide(i) / show(i) take one away and bring it back. Its own random numbers, after
 * everything else, so the island is unchanged. Every number is in FORAGE.
 */
export const FORAGE = {
  windfalls: [1, 4], windfallR: [0.6, 2.2],          // apples under each island apple tree, how far from the trunk
  berryShare: 0.35, clusters: [5, 9],               // share of the bushes that bear berries, clusters per bush
  pebbles: { beach: 170, meadow: 90, size: [0.018, 0.04] },
};

export function createForage(ctx, { scatter, undergrowth }) {
  const { scene } = ctx, F = FORAGE;
  let seed = 8181; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new V(), P = new V(), zero = new THREE.Matrix4().makeScale(0, 0, 0);

  /** An instanced set of pickable things: entries [x, y, z, scale, colour]. */
  function set(geo, mat, entries, shadow) {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, entries.length)), mats = [], cols = [];
    entries.forEach(([x, y, z, s, c], i) => { M.compose(P.set(x, y, z), Q.setFromEuler(E.set(rr(-0.3, 0.3), rr(0, 6.28), rr(-0.3, 0.3))), S.setScalar(s)); im.setMatrixAt(i, M); mats.push(M.clone()); cols.push(c); im.setColorAt(i, c); });
    im.count = entries.length; im.castShadow = shadow; im.receiveShadow = true; scene.add(im);
    return {
      mesh: im, points: entries.map(([x, y, z]) => ({ x, y, z })),
      hide(i) { im.setMatrixAt(i, zero); im.instanceMatrix.needsUpdate = true; },
      show(i) { im.setMatrixAt(i, mats[i]); im.instanceMatrix.needsUpdate = true; },
      look: i => ({ geo, mat, m: mats[i], color: cols[i] }),   // for the one that flies to you (app/items.js)
    };
  }

  /* ---- windfall apples under the island's apple trees ---- */
  const appleGeo = new THREE.SphereGeometry(1, 10, 8); appleGeo.scale(1, 0.88, 1);
  const apples = [];
  for (const t of scatter.apple) for (let k = 0, n = F.windfalls[0] + Math.floor(rnd() * (F.windfalls[1] - F.windfalls[0] + 1)); k < n; k++) {
    const a = rr(0, 6.28), d = rr(...F.windfallR) * t.s, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d, r = rr(0.034, 0.042);
    if (walkwayDist(x, z) < 0.3) continue;
    apples.push([x, H(x, z) + r * 0.8, z, r, lin(rnd() < 0.7 ? 0xb3302a : 0xc7962f).multiplyScalar(rr(0.8, 1.05))]);
  }
  const windfalls = set(appleGeo, new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0 }), apples, true); windfalls.mesh.material.userData.season = 'fruit';

  /* ---- berries on some of the bushes: little clusters on the outside of the crown ---- */
  const cluster = mergeGeos([[0, 0, 0], [0.018, -0.006, 0.006], [-0.008, -0.012, 0.014], [0.006, 0.01, -0.012]].map(([x, y, z]) => { const g = new THREE.SphereGeometry(0.011, 6, 4).toNonIndexed(); g.translate(x, y, z); return g; }), ['position', 'normal']);
  const berries = [];
  for (const b of undergrowth.bushes) {
    if (rnd() > F.berryShare) continue;
    const v = undergrowth.bushVariants[b.variant], col = rnd() < 0.6 ? 0x9b1b2a : 0x2e2c55;
    for (let k = 0, n = F.clusters[0] + Math.floor(rnd() * (F.clusters[1] - F.clusters[0] + 1)); k < n; k++) {
      const a = rr(0, 6.28), h = rr(0.35, 0.85) * v.height * b.s, rad = v.radius * b.s * rr(0.75, 0.95) * Math.sin(Math.PI * (0.35 + 0.55 * h / (v.height * b.s)));
      berries.push([b.x + Math.cos(a) * rad, b.y + h, b.z + Math.sin(a) * rad, rr(0.85, 1.2), lin(col).multiplyScalar(rr(0.8, 1.1))]);
    }
  }
  const berryMesh = set(cluster, new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0 }), berries, false); berryMesh.mesh.material.userData.season = 'berries';

  /* ---- pebbles on the beaches and the meadow (not in the plot) ---- */
  const pebGeo = new THREE.IcosahedronGeometry(1, 0); pebGeo.scale(1, 0.55, 0.8);
  const pebbles = [], PB = F.pebbles, beachW = CONFIG.island.beachWidth;
  const tones = [0x8b857a, 0x9d9486, 0x6f6a62, 0xa89c88];
  for (let tries = 0, n = 0, want = PB.beach + PB.meadow; n < want && tries < want * 80; tries++) {
    const x = rr(-WORLD_HALF, WORLD_HALF), z = rr(-WORLD_HALF, WORLD_HALF), c = coastDist(x, z), beach = n < PB.beach;
    if (Math.max(Math.abs(x), Math.abs(z)) < 5.5 || walkwayDist(x, z) < 0.3) continue;
    if (beach ? (c < 0.3 || c > beachW || H(x, z) < SEA_Y + 0.02) : (c < beachW + 2 || forest(x, z) > 0.25)) continue;
    const s = rr(...PB.size); pebbles.push([x, H(x, z) + s * 0.25, z, s, lin(tones[Math.floor(rnd() * tones.length)]).multiplyScalar(rr(0.85, 1.1))]); n++;
  }
  const pebbleMesh = set(pebGeo, new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true }), pebbles, false);

  return { windfalls, berries: berryMesh, pebbles: pebbleMesh, stats: { windfalls: apples.length, berryClusters: berries.length, pebbles: pebbles.length } };
}
