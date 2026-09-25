import * as THREE from 'three';
import { V, lin } from '../../core/math.js';
import { mergeGeos } from '../../core/geometry.js';
import { H, SEA_Y, WORLD_HALF, coastDist, forest, walkwayDist } from '../../world/layout.js';
import { CONFIG } from '../../config.js';

/**
 * Things on the island to pick up that did not exist before (app/items.js makes them collectable): windfall apples
 * lying under the island's apple trees, clusters of berries on some of its bushes, and pebbles on the beaches and the
 * meadow, shells and driftwood on the beaches. One instanced mesh each; hide(i) / show(i) take one away and bring it
 * back. Its own random numbers, after everything else, so the island is unchanged (and each set after the ones before
 * it). Every number is in FORAGE. rareShellModel(): the nautilus shell one shell in CONFIG.items.rareShell turns out
 * to be (app/items.js), a keepsake for the cabin's shelf.
 */
export const FORAGE = {
  windfalls: [1, 4], windfallR: [0.6, 2.2],          // apples under each island apple tree, how far from the trunk
  berryShare: 0.35, clusters: [5, 9],               // share of the bushes that bear berries, clusters per bush
  pebbles: { beach: 170, meadow: 90, size: [0.018, 0.04] },
  shells: { count: 80, size: [0.022, 0.036] },       // on the beaches (#18)
  driftwood: { count: 22, length: [0.45, 0.85] },   // bleached branches along the beaches, burn at a firepit
};

export function createForage(ctx, { scatter, undergrowth }) {
  const { scene } = ctx, F = FORAGE;
  let seed = 8181; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), S = new V(), P = new V(), zero = new THREE.Matrix4().makeScale(0, 0, 0);

  /** An instanced set of pickable things: entries [x, y, z, scale, colour]. */
  function set(geo, mat, entries, shadow) {
    const im = new THREE.InstancedMesh(geo, mat, Math.max(1, entries.length)), mats = [], cols = [];
    entries.forEach(([x, y, z, s, c, q], i) => { M.compose(P.set(x, y, z), q || Q.setFromEuler(E.set(rr(-0.3, 0.3), rr(0, 6.28), rr(-0.3, 0.3))), S.setScalar(s)); im.setMatrixAt(i, M); mats.push(M.clone()); cols.push(c); im.setColorAt(i, c); });   // q: a turn of its own
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

  /* ---- shells on the beaches: a ribbed fan, cup down, half in the sand ---- */
  const shells = [], SH = F.shells, beachOk = (x, z, lo, hi) => { const c = coastDist(x, z); return c > lo && c < hi && H(x, z) > SEA_Y + 0.03 && walkwayDist(x, z) > 0.5; };
  const shellTones = [0xe9dcc4, 0xe6b48f, 0xd8a39a, 0xd3cdc2, 0xc98a5a, 0xf0e6d6];
  for (let tries = 0; shells.length < SH.count && tries < SH.count * 200; tries++) {
    const x = rr(-WORLD_HALF, WORLD_HALF), z = rr(-WORLD_HALF, WORLD_HALF); if (!beachOk(x, z, 0.4, beachW)) continue;
    const s = rr(...SH.size); shells.push([x, H(x, z) + s * 0.08, z, s, lin(shellTones[Math.floor(rnd() * shellTones.length)]).multiplyScalar(rr(0.88, 1.05))]);
  }
  const shellMesh = set(shellGeo(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0, side: THREE.DoubleSide }), shells, false);

  /* ---- driftwood: bleached branches lying along the beaches, level with the sand under both ends ---- */
  const drift = [], DW = F.driftwood;
  for (let tries = 0; drift.length < DW.count && tries < DW.count * 300; tries++) {
    const x = rr(-WORLD_HALF, WORLD_HALF), z = rr(-WORLD_HALF, WORLD_HALF), len = rr(...DW.length), yaw = rr(0, 6.28), dx = Math.cos(yaw) * len / 2, dz = -Math.sin(yaw) * len / 2;
    if (!beachOk(x, z, 0.9, beachW - 0.3) || !beachOk(x + dx, z + dz, 0.5, beachW) || !beachOk(x - dx, z - dz, 0.5, beachW)) continue;
    const h0 = H(x - dx, z - dz), h1 = H(x + dx, z + dz), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, Math.atan2(h1 - h0, len) + rr(-0.03, 0.03), 'YZX'));
    drift.push([x, (h0 + h1) / 2 + 0.01 * len, z, len, lin(0xffffff).multiplyScalar(rr(0.85, 1.05)), q]);
  }
  const driftMesh = set(driftwoodGeo(rnd), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 }), drift, true);

  return { windfalls, berries: berryMesh, pebbles: pebbleMesh, shells: shellMesh, driftwood: driftMesh, stats: { windfalls: apples.length, berryClusters: berries.length, pebbles: pebbles.length, shells: shells.length, driftwood: drift.length } };
}

/** A scallop-like shell, 1 unit across: a low dome over a fan narrowing to the hinge (at -z), ribs radiating from the
 *  hinge, growth bands round it (vertex colours, tinted per shell). */
function shellGeo() {
  const g = new THREE.SphereGeometry(1, 30, 8, 0, Math.PI * 2, 0, Math.PI / 2), p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ah = Math.atan2(x, z + 1.05), dh = Math.hypot(x, z + 1.05) / 2.05;
    const rib = Math.pow(Math.abs(Math.sin(ah * 13)), 0.6), fan = 0.55 + 0.45 * (z + 1) / 2;
    p.setXYZ(i, x * fan, y * 0.3 + 0.035 * rib * dh, z * 0.9);
    const k = (0.82 + 0.1 * rib + 0.08 * Math.sin(dh * 38)) * (0.9 + 0.1 * dh);
    c[i * 3] = k; c[i * 3 + 1] = k * 0.97; c[i * 3 + 2] = k * 0.93;
  }
  g.computeVertexNormals(); g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
/** A piece of driftwood, 1 unit long along x: a bent, tapered, grooved branch with a snapped side stub, silver-grey
 *  (vertex colours; darker in the grooves and at the broken ends). */
function driftwoodGeo(rnd) {
  const main = new THREE.CylinderGeometry(0.036, 0.058, 1, 11, 14, false), stub = new THREE.CylinderGeometry(0.014, 0.026, 0.2, 7, 2, false);
  stub.translate(0, 0.08, 0); stub.rotateZ(-0.8); stub.rotateY(0.6); stub.rotateZ(Math.PI / 2); stub.translate(0.18, 0, 0);
  main.rotateZ(Math.PI / 2);   // along x (the narrow end at -x, where the stub points)
  const ph = rnd() * 6.28, bend = (x, p, i) => { p.setY(i, p.getY(i) + 0.025 * Math.sin(x * 3.4 + ph)); p.setZ(i, p.getZ(i) + 0.07 * Math.sin(x * 2.6 + ph * 0.7)); };
  const mp = main.attributes.position;
  for (let i = 0; i < mp.count; i++) {
    const x = mp.getX(i), y = mp.getY(i), z = mp.getZ(i), a = Math.atan2(z, y), k = (1 + 0.16 * Math.sin(a * 4 + x * 9) + 0.07 * Math.sin(a * 7 - x * 5)) * (1 + 0.18 * Math.exp(-((x - 0.25) ** 2) * 60));   // grooves, a knot swelling
    mp.setY(i, y * k); mp.setZ(i, z * k); bend(x, mp, i);
  }
  const sp = stub.attributes.position; for (let i = 0; i < sp.count; i++) bend(0.18, sp, i);
  main.computeVertexNormals(); stub.computeVertexNormals();   // smooth, before merging
  const g = mergeGeos([main, stub], ['position', 'normal']);
  const p = g.attributes.position, c = new Float32Array(p.count * 3), pale = lin(0x9d958a), dark = lin(0x564e45), warm = lin(0x7d6c58), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), a = Math.atan2(p.getZ(i), p.getY(i)), groove = Math.max(0, -Math.sin(a * 4 + x * 9));
    col.copy(pale).lerp(dark, 0.6 * groove * groove).lerp(warm, Math.min(1, Math.max(0, Math.abs(x) - 0.42) * 8 + 0.2 * Math.sin(x * 23 + a)));
    c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.translate(0, 0.03, 0); return g;
}
/** The rare shell: a nautilus, ~8 cm across, standing on its rim (its centre at the origin): a tube growing along a
 *  logarithmic spiral, each turn wrapping the last, cream with rust-brown bands that fade towards the mouth, pearly
 *  inside. One mesh, { geo, mat } like fishModel. */
export function rareShellModel() {
  const turns = 2.1, steps = 110, ring = 16, b = 0.175, R0 = 0.0028, pos = [], col = [], idx = [];
  const cream = lin(0xf1e6d2), rust = lin(0x8c4a2a), pearl = lin(0xf6eee8), cc = new THREE.Color(), T = turns * Math.PI * 2;
  for (let i = 0; i <= steps; i++) {
    const th = i / steps * T, R = R0 * Math.exp(b * th), t = R * 0.64, cx = R * Math.cos(th), cy = R * Math.sin(th), ox = Math.cos(th), oy = Math.sin(th);
    for (let j = 0; j <= ring; j++) {
      const a = j / ring * Math.PI * 2, u = Math.cos(a), w = Math.sin(a);   // u: outwards from the spiral's centre, w: across (z)
      pos.push(cx + ox * t * u, cy + oy * t * u, t * w * 0.78);
      const band = Math.sin(th * 3.2 + u * 0.8) > 0.15 && u > -0.2 ? 1 : 0, fade = Math.min(1, (T - th) / 2.2), inner = th > T - 0.35 ? 1 : 0;
      cc.copy(cream).lerp(rust, band * fade * 0.85).lerp(pearl, inner); col.push(cc.r, cc.g, cc.b);
    }
  }
  for (let i = 0; i < steps; i++) for (let j = 0; j < ring; j++) { const a = i * (ring + 1) + j, b2 = a + ring + 1; idx.push(a, b2, a + 1, b2, b2 + 1, a + 1); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx);
  geo.computeVertexNormals(); geo.computeBoundingBox(); const bb = geo.boundingBox, s = 0.08 / Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y);
  geo.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, 0); geo.scale(s, s, s);
  return { geo, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.12, side: THREE.DoubleSide }) };
}
