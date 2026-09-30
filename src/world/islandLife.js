import { smooth, clamp } from '../core/math.js';
import { fbm2 } from '../core/noise.js';
import { ISLANDS, islandH, MARSH_POOL, SEA_Y, LIGHTHOUSE, lighthouseH, EMBER, addFirepit, PIT_SIZE } from './layout.js';

/**
 * Where the home island's systems grow on the four outer islands and the lighthouse rock: full-detail trees (the
 * scatter's spruce and apple variants, and the island species of assets/trees/islandTrees.js), boulders, bushes and
 * wild roses, ferns, meadow flowers, sticks, boletes, butterflies, and the GPU grass's density and height (world/grass.js).
 * Everything comes from its own small random stream (never the shared one), so the home island is unchanged.
 *
 * The buildings' sites are here too (assets/islands/outerIslands.js builds them): life keeps clear of them, of the
 * jetties, the dry-stone walls, the boardwalk and the paths worn from each jetty to its building.
 */
export const ihash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const stream = seed => { let s = seed | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const segDist = (x, z, a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], t = clamp(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1)); return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t); };

/** An island's building site: its highest point near the middle, the building's footprint, a place finder, its walls and paths. */
function siteOf(I) {
  const hAt = (x, z) => islandH(I, x, z);
  const spot = (k, rMin, rMax, ok = () => true) => {   // a dry place on the island by a hash, or null
    for (let t = 0; t < 40; t++) { const a = ihash(k, t + I.s) * Math.PI * 2, rr = I.r * (rMin + (rMax - rMin) * Math.sqrt(ihash(t, k + I.s * 3))), x = I.x + Math.cos(a) * rr, z = I.z + Math.sin(a) * rr, h = hAt(x, z);
      if (h > SEA_Y + 1.0 && ok(x, z, h) && !I.docks.some(d => d.dist(x, z) < 1.5)) return [x, z, h]; }
    return null;
  };
  const top = (() => { let b = [I.x, I.z, hAt(I.x, I.z)]; for (let k = 0; k < 200; k++) { const a = ihash(k, 91) * 6.28, rr = I.r * 0.35 * Math.sqrt(ihash(k, 92)), x = I.x + Math.cos(a) * rr, z = I.z + Math.sin(a) * rr, h = hAt(x, z); if (h > b[2]) b = [x, z, h]; } return b; })();
  const S = { I, hAt, spot, top, build: null, walls: [], paths: [], avoid: [] };
  if (I.kind === 'meadow') S.build = [top[0], top[1], 3.2];
  if (I.kind === 'palm') { const s0 = spot(3, 0.1, 0.35) || top; S.build = [s0[0], s0[1], 2.8]; }
  if (I.kind === 'volcano') S.build = [top[0], top[1], 3.4];
  if (I.kind === 'marsh') { const [x, z] = I.docks[0].W(-4.5, 5.5); S.build = [x, z, 3.6]; }
  const clearOf = (x, z, m = 0) => Math.hypot(x - S.build[0], z - S.build[1]) > S.build[2] + m;
  S.clearOf = clearOf;
  // Millholm's dry-stone walls: three arcs round the hill (the stones: outerIslands.js)
  if (I.kind === 'meadow') for (let w = 0; w < 3; w++) { const a0 = ihash(w, 7) * 6.28; for (let t = 0; t < 22; t++) { const a = a0 + t * 0.06, rr = I.r * (0.45 + 0.05 * w), sx = I.x + Math.cos(a) * rr, sz = I.z + Math.sin(a) * rr; if (!clearOf(sx, sz, 1) || I.docks.some(d => d.dist(sx, sz) < 2)) continue; S.walls.push([sx, sz, w, t]); } }
  // the paths worn from each jetty's root to the building's door side
  const door = I.kind === 'marsh' ? I.docks[0].W(-1.5, 2.5) : [S.build[0] + (I.docks[0].rx - S.build[0]) / Math.hypot(I.docks[0].rx - S.build[0], I.docks[0].rz - S.build[1]) * (S.build[2] + 0.2), S.build[1] + (I.docks[0].rz - S.build[1]) / Math.hypot(I.docks[0].rx - S.build[0], I.docks[0].rz - S.build[1]) * (S.build[2] + 0.2)];
  if (I.kind === 'volcano') for (let i = 1; i < EMBER.path.length; i++) S.paths.push([EMBER.path[i - 1], EMBER.path[i]]);   // (Ember Rock's switchback path: world/layout.js)
  else I.docks.forEach(d => { const a = d.W(-0.3, 0), mid = [(a[0] + door[0]) / 2 + (ihash(d.index, I.s) - 0.5) * 2.5, (a[1] + door[1]) / 2 + (ihash(I.s, d.index) - 0.5) * 2.5]; S.paths.push([a, mid], [mid, door]); });
  S.pathDist = (x, z) => S.paths.reduce((m, [a, b]) => Math.min(m, segDist(x, z, a, b)), Infinity);
  // the marsh lodge's boardwalk and the nets' drying racks; the hot spring
  if (I.kind === 'marsh') { const d = I.docks[0], a = d.W(0, 0); S.avoid.push({ seg: [a, [a[0] + (S.build[0] - a[0]) * 0.82, a[1] + (S.build[1] - a[1]) * 0.82]], r: 0.9 }); for (let r = 0; r < 2; r++) { const [rx, rz] = d.W(-6 - r * 2.2, -3.5); S.avoid.push({ x: rx, z: rz, r: 1.3 }); } }
  if (I.kind === 'volcano') { S.avoid.push({ x: I.spring.x, z: I.spring.z, r: I.spring.r + 0.9 }); const L = EMBER.lava; for (let i = 4; i < L.length; i += 4) S.avoid.push({ seg: [[L[i - 4].x, L[i - 4].z], [L[i].x, L[i].z]], r: L[i].w + 0.9 }); }   // the spring, the lava creek
  // the way in: from each building's door out to where its steps reach the ground (world/buildingPlans.js)
  { const a = I.kind === 'palm' ? Math.atan2(I.z - S.build[1] - 30, I.x - S.build[0] - 60) : I.kind === 'marsh' ? null : Math.atan2(-S.build[1], -S.build[0]);
    if (a !== null) S.avoid.push({ seg: [[S.build[0], S.build[1]], [S.build[0] + Math.cos(a) * (S.build[2] + 3.6), S.build[1] + Math.sin(a) * (S.build[2] + 3.6)]], r: 1.3 }); }
  S.blocked = (x, z, m) => !clearOf(x, z, m) || I.docks.some(d => d.dist(x, z) < 0.6 + m) || S.walls.some(([wx, wz]) => Math.hypot(x - wx, z - wz) < 0.55 + Math.min(m, 0.45))
    || S.avoid.some(o => (o.seg ? segDist(x, z, o.seg[0], o.seg[1]) : Math.hypot(x - o.x, z - o.z)) < o.r + m);
  return S;
}

/** The lighthouse rock's clear ground: not the tower and plinth, the cleft and its steps, the flagstones, the bench. */
function lighthouseSite() {
  const L = LIGHTHOUSE, T = L.tower, G = L.gully;
  const blocked = (x, z, m) => {
    if (Math.hypot(x - T.x, z - T.z) < T.rOut[0] + 1.0 + m) return true;
    const u = L.x - x, v = Math.abs(z - L.z);
    if (u > G.u0 - 1.2 - m && v < G.half + 0.5 + m) return true;
    if (x > L.x - G.u0 - m && x < T.x && v < 0.8 + m) return true;
    return Math.hypot(x - (L.x - 2.2), z - (L.z - 3.1)) < 1.2 + m;
  };
  return { hAt: lighthouseH, blocked, pathDist: (x, z) => (x > L.x - G.u0 && x < T.x ? Math.abs(z - L.z) : Infinity) };
}

/**
 * A firepit on an island (as the home island's: world/layout.js FIREPITS, assets/cabin/firepits.js): the level, dry
 * place nearest a path with room for the fire, three logs round it and a woodpile; else just the ring of stones. By
 * hashes only. The site then keeps everything else clear of it.
 */
function pitSite(S, key) {
  const I = S.I, cx = I ? I.x : LIGHTHOUSE.x, cz = I ? I.z : LIGHTHOUSE.z, rad = I ? I.r : 8, hAt = S.hAt;
  const floor = !I ? LIGHTHOUSE.top - 0.4 : I.kind === 'marsh' ? MARSH_POOL + 0.2 : SEA_Y + 0.9;
  const level = (x, z, r, span) => { let lo = Infinity, hi = -Infinity; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; for (const f of [0.5, 1]) { const h = hAt(x + Math.cos(a) * r * f, z + Math.sin(a) * r * f); lo = Math.min(lo, h); hi = Math.max(hi, h); } } return lo > floor && hi - lo < span; };
  const reach = PIT_SIZE.logR + 0.6;
  if (I && I.kind === 'volcano') { const Q = EMBER.pit, a0 = Math.atan2(Q.z - I.z, Q.x - I.x) * 180 / Math.PI + 60; return { x: Q.x, z: Q.z, logs: [a0, a0 + 120, a0 + 240].map(d => (d % 360 + 360) % 360), pile: null, bare: false }; }   // its own terrace (world/layout.js)
  for (const full of [true, false]) {
    let best = null;
    for (let t = 0; t < 500; t++) {
      const a = ihash(t, 51 + key) * Math.PI * 2, r = rad * (0.1 + 0.85 * Math.sqrt(ihash(53 + key, t))), x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
      const R = full ? reach : 1.0, pd = S.pathDist(x, z);
      if (pd < R + 0.4 || S.blocked(x, z, R) || !level(x, z, R, full ? 0.8 : 0.3)) continue;
      if (I && I.kind === 'volcano' && Math.abs(Math.atan2(Math.sin(Math.atan2(z - I.z, x - I.x) - EMBER.cove.a), Math.cos(Math.atan2(z - I.z, x - I.x) - EMBER.cove.a))) < EMBER.cove.half + 0.25) continue;   // (not in the cove: only a boat gets there)
      if (!best || pd < best.pd) best = { x, z, pd, full };
    }
    if (!best) continue;
    let pile = null;
    if (best.full) for (let k = 0; k < 12 && !pile; k++) {   // the woodpile: a few metres off, level, clear of paths
      const a = (k * 30 + 360 * ihash(key, 57)) % 360, ar = a * Math.PI / 180, px = best.x + Math.cos(ar) * 3.3, pz = best.z + Math.sin(ar) * 3.3;
      if (!S.blocked(px, pz, 1.1) && S.pathDist(px, pz) > 1.6 && level(px, pz, 1.0, 0.35)) pile = [a, 3.3];
    }
    const a0 = pile ? pile[0] + 60 : 360 * ihash(key, 59);
    return { x: best.x, z: best.z, logs: best.full ? [a0, a0 + 120, a0 + 240].map(d => d % 360) : [], pile, bare: !best.full };
  }
  return null;
}

let LIFE = null;
/** Everything the islands grow, placed once. */
export function islandLife() {
  if (LIFE) return LIFE;
  const trees = { apple: [], spruce: [], birch: [], willow: [], palm: [], snag: [] }, rocks = [], bushes = [], roses = [], ferns = [], flowers = [], sticks = [], mush = [], butterflies = [];
  const sites = ISLANDS.map(siteOf), lh = lighthouseSite();
  [...sites, lh].forEach((S, i) => {   // a firepit on each (the fires, the logs to sit on: world/layout.js addFirepit)
    const f = pitSite(S, i * 7 + 3); if (!f) return;
    S.pit = addFirepit({ name: 'isle-' + (S.I ? S.I.kind : 'rock'), ...f });
    const clear = [[f.x, f.z, f.bare ? 1.1 : PIT_SIZE.logR + 0.6]]; if (S.pit.pile) clear.push([S.pit.pile.x, S.pit.pile.z, 1.2]);
    const b0 = S.blocked; S.blocked = (x, z, m) => b0(x, z, m) || clear.some(([cx, cz, r]) => Math.hypot(x - cx, z - cz) < r + m);
  });
  for (const S of [...sites, lh]) {
    const I = S.I, R = stream(I ? 9001 + Math.round(I.s * 1000) : 4242), rr = (a, b) => a + (b - a) * R(), hAt = S.hAt;
    const cx = I ? I.x : LIGHTHOUSE.x, cz = I ? I.z : LIGHTHOUSE.z, rad = I ? I.r : 11.5;
    const taken = [];   // trunks, boulders and bushes placed so far: (x, z, r)
    const free = (x, z, m) => !S.blocked(x, z, m) && taken.every(t => Math.hypot(t[0] - x, t[1] - z) > t[2] + m);
    const slope = (x, z) => Math.hypot(hAt(x + 0.3, z) - hAt(x - 0.3, z), hAt(x, z + 0.3) - hAt(x, z - 0.3)) / 0.6;
    const at = (rMin, rMax) => { const a = R() * Math.PI * 2, r = rad * (rMin + (rMax - rMin) * Math.sqrt(R())); return [cx + Math.cos(a) * r, cz + Math.sin(a) * r]; };
    const tree = (sp, x, z, s, o = {}) => { const t = { x, y: hAt(x, z) - 0.05, z, s, rot: R() * 6.28, v: R(), ...o }; trees[sp].push(t); taken.push([x, z, o.clear || 1.2 * s + 0.6]); return t; };
    const plant = (n, tries, pick, ok, make) => { for (let k = 0, c = 0; c < n && k < tries; k++) { const [x, z] = pick(); if (ok(x, z)) { make(x, z); c++; } } };
    const dryAbove = m => (x, z) => hAt(x, z) > SEA_Y + m;
    const boulder = (x, z, s, dark) => { rocks.push({ x, y: hAt(x, z) - s * 0.12, z, s, rot: R() * 6.28, tilt: rr(-0.15, 0.15), v: R(), dark }); taken.push([x, z, s * 0.9]); };
    const fernClump = (x, z, sc = 1) => ferns.push({ x, z, y: hAt(x, z) - 0.01, sc: rr(0.9, 1.5) * sc, r: R });
    const kind = I ? I.kind : 'rock';

    if (kind === 'meadow') {
      // an orchard of apple trees on the slope away from the jetty, birches in small groves, a few boulders
      // (the orchard's rows where most of a 4 x 3 grid of trees fits: dry ground, clear of the walls, the mill and the path)
      const okA = (x, z) => dryAbove(1.3)(x, z) && free(x, z, 1.5) && S.pathDist(x, z) > 1.8;
      let best = null;
      for (let k = 0; k < 16; k++) { const a = k / 16 * 6.28, r = rad * (k % 2 ? 0.35 : 0.55), c = [cx + Math.cos(a) * r, cz + Math.sin(a) * r], slots = [];
        for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { const u = (i - 1.5) * 4.0, w = (j - 1) * 4.0, x = c[0] + Math.cos(a) * u - Math.sin(a) * w, z = c[1] + Math.sin(a) * u + Math.cos(a) * w; if (okA(x, z)) slots.push([x, z]); }
        if (!best || slots.length > best.length) best = slots; }
      best.forEach(([x, z]) => { const px = x + rr(-0.4, 0.4), pz = z + rr(-0.4, 0.4); if (okA(px, pz)) tree('apple', px, pz, rr(0.8, 1.02), { clear: 1.4 }); });
      for (let g = 0; g < 4; g++) { const c = at(0.3, 0.9); for (let k = 0; k < 20 && trees.birch.length < (g + 1) * 3; k++) { const x = c[0] + rr(-3.5, 3.5), z = c[1] + rr(-3.5, 3.5); if (dryAbove(1.1)(x, z) && free(x, z, 1.1) && S.pathDist(x, z) > 1.4) tree('birch', x, z, rr(0.85, 1.1), { clear: 1.2 }); } }
      plant(6, 200, () => at(0.3, 0.95), (x, z) => dryAbove(1.1)(x, z) && free(x, z, 1) && S.pathDist(x, z) > 1.2, (x, z) => boulder(x, z, rr(0.3, 0.75)));
      // a hedgerow of bushes along the walls, wild roses at the field edges
      S.walls.filter((w, i) => i % 5 === 2).forEach(([wx, wz]) => { const o = rr(1.1, 1.5) * (R() < 0.5 ? -1 : 1), a = Math.atan2(wz - cz, wx - cx), x = wx + Math.cos(a) * o, z = wz + Math.sin(a) * o; if (dryAbove(1.2)(x, z) && free(x, z, 0.8) && S.pathDist(x, z) > 1.2) { bushes.push({ x, y: hAt(x, z) - 0.03, z, s: rr(0.8, 1.25), rot: R() * 6.28, v: R() }); taken.push([x, z, 0.6]); } });
      plant(5, 300, () => at(0.3, 0.85), (x, z) => dryAbove(1.2)(x, z) && free(x, z, 1.0) && S.pathDist(x, z) > 1.3, (x, z) => { roses.push({ x, y: hAt(x, z), z, s: rr(0.85, 1.15), rot: R() * 6.28, v: R() }); taken.push([x, z, 0.6]); });
    }
    if (kind === 'palm') {
      plant(11, 800, () => at(0.12, 0.92), (x, z) => dryAbove(0.9)(x, z) && free(x, z, 1.5) && S.pathDist(x, z) > 1.2, (x, z) => { const out = Math.atan2(z - cz, x - cx); tree('palm', x, z, rr(0.85, 1.12), { clear: 1.6, lean: out }); });
      plant(4, 300, () => at(0.2, 0.75), (x, z) => dryAbove(1.15)(x, z) && free(x, z, 0.9) && S.pathDist(x, z) > 1.2, (x, z) => { bushes.push({ x, y: hAt(x, z) - 0.03, z, s: rr(0.9, 1.3), rot: R() * 6.28, v: R() }); taken.push([x, z, 0.6]); });
      plant(4, 200, () => at(0.85, 1.05), (x, z) => hAt(x, z) > SEA_Y - 0.1 && free(x, z, 0.6), (x, z) => boulder(x, z, rr(0.35, 0.8)));
    }
    if (kind === 'volcano') {
      plant(8, 400, () => at(0.3, 0.85), (x, z) => dryAbove(1.2)(x, z) && free(x, z, 1.8) && S.pathDist(x, z) > 1.4, (x, z) => tree('snag', x, z, rr(0.85, 1.25), { clear: 1.0 }));
      plant(30, 900, () => at(0.25, 1.05), (x, z) => hAt(x, z) > SEA_Y - 0.2 && free(x, z, 0.5) && S.pathDist(x, z) > 1.0, (x, z) => boulder(x, z, R() < 0.25 ? rr(0.9, 1.6) : rr(0.3, 0.8), true));
      // the rocky coast: basalt blocks along the cliff tops and sea stacks off them (clear of the landing and the cove's mouth)
      const ang = (x, z) => Math.atan2(z - cz, x - cx), off = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
      plant(22, 900, () => at(0.86, 0.97), (x, z) => hAt(x, z) > SEA_Y + 0.4 && free(x, z, 0.3) && S.pathDist(x, z) > 1.2 && off(ang(x, z), EMBER.dA) > 0.45 && off(ang(x, z), EMBER.cove.a) > 0.5, (x, z) => boulder(x, z, rr(0.5, 1.3), true));
      plant(9, 900, () => at(1.0, 1.18), (x, z) => hAt(x, z) < SEA_Y - 0.6 && off(ang(x, z), EMBER.dA) > 0.6 && off(ang(x, z), EMBER.cove.a) > 0.65 && free(x, z, 1.2), (x, z) => { const sz = rr(1.4, 2.3); rocks.push({ x, y: SEA_Y - 0.55 - 0.2 * sz, z, s: sz, rot: R() * 6.28, tilt: rr(-0.1, 0.1), v: R(), dark: true }); taken.push([x, z, sz]); });   // (standing out of the sea)
      plant(5, 300, () => at(0.55, 0.85), (x, z) => off(ang(x, z), EMBER.cove.a) < 0.3 && hAt(x, z) > SEA_Y - 0.3 && hAt(x, z) < SEA_Y + 0.9 && free(x, z, 0.8), (x, z) => boulder(x, z, rr(0.3, 0.7), true));   // a few on the cove's sand
    }
    if (kind === 'marsh') {
      const near = (x, z) => { for (let a = 0; a < 6.28; a += 0.8) if (hAt(x + Math.cos(a) * 3, z + Math.sin(a) * 3) < MARSH_POOL - 0.05) return true; return false; };
      plant(10, 900, () => at(0.15, 0.85), (x, z) => hAt(x, z) > MARSH_POOL + 0.12 && free(x, z, 2.6) && S.pathDist(x, z) > 1.5 && (near(x, z) || R() < 0.15), (x, z) => tree('willow', x, z, rr(0.85, 1.1), { clear: 2.2 }));
      plant(5, 400, () => at(0.2, 0.8), (x, z) => hAt(x, z) > MARSH_POOL + 0.4 && free(x, z, 2.2) && S.pathDist(x, z) > 1.6, (x, z) => tree('spruce', x, z, rr(0.8, 1.1), { clear: 1.4 }));
      plant(13, 500, () => at(0.2, 0.9), (x, z) => hAt(x, z) > MARSH_POOL + 0.1 && free(x, z, 0.8) && S.pathDist(x, z) > 1.2, (x, z) => { bushes.push({ x, y: hAt(x, z) - 0.03, z, s: rr(0.8, 1.3), rot: R() * 6.28, v: R() }); taken.push([x, z, 0.6]); });
      plant(4, 200, () => at(0.3, 0.95), (x, z) => hAt(x, z) > MARSH_POOL && free(x, z, 0.8), (x, z) => boulder(x, z, rr(0.3, 0.7)));
    }
    if (kind === 'rock') {
      // wind-bent little spruces round the plateau's rim, boulders on the ledges and at the foot of the cliffs
      plant(6, 600, () => at(0.3, 0.72), (x, z) => hAt(x, z) > LIGHTHOUSE.top - 0.3 && slope(x, z) < 0.45 && free(x, z, 1.6), (x, z) => tree('spruce', x, z, rr(0.4, 0.6), { clear: 1.0, pitch: rr(0.05, 0.16) }));
      plant(16, 900, () => at(0.55, 1.35), (x, z) => hAt(x, z) > SEA_Y - 0.3 && free(x, z, 0.5), (x, z) => boulder(x, z, R() < 0.3 ? rr(0.8, 1.4) : rr(0.3, 0.75)));
    }

    /* ---- the small things (only where trees and bushes left room) ---- */
    const under = (x, z, m) => [].concat(...Object.values(trees)).some(t => Math.hypot(t.x - x, t.z - z) < m * t.s);   // under a crown
    if (kind === 'meadow' || kind === 'marsh' || kind === 'rock' || kind === 'palm') {
      const n = { meadow: 22, marsh: 50, rock: 10, palm: 6 }[kind];
      plant(n, n * 60, () => at(0.1, 0.95), (x, z) => hAt(x, z) > (kind === 'marsh' ? MARSH_POOL + 0.05 : SEA_Y + 1.1) && free(x, z, 0.3) && S.pathDist(x, z) > 0.9 && (kind === 'rock' ? slope(x, z) < 0.7 : under(x, z, 3.2) || R() < 0.12), (x, z) => fernClump(x, z, kind === 'rock' ? 0.8 : 1));
    }
    if (kind === 'meadow' || kind === 'marsh') {
      const n = kind === 'meadow' ? 30 : 45;
      plant(n, n * 40, () => at(0.1, 0.95), (x, z) => hAt(x, z) > MARSH_POOL && free(x, z, 0.2) && S.pathDist(x, z) > 0.6 && under(x, z, 3), (x, z) => sticks.push({ x, z, y: hAt(x, z), s: rr(0.35, 1.3), a: R() * 6.28, r: R }));
      plant(kind === 'meadow' ? 10 : 22, 800, () => at(0.1, 0.9), (x, z) => hAt(x, z) > MARSH_POOL + 0.1 && free(x, z, 0.15) && S.pathDist(x, z) > 0.6 && under(x, z, 2.6), (x, z) => { const k = 1 + Math.floor(R() * 3), agaric = R() > 0.65; for (let i = 0; i < k; i++) { const px = x + rr(-0.25, 0.25), pz = z + rr(-0.25, 0.25); mush.push({ x: px, z: pz, y: hAt(px, pz) - 0.008, agaric, r: R }); } });
    }
    if (kind === 'volcano') plant(12, 400, () => at(0.3, 0.9), (x, z) => dryAbove(1.1)(x, z) && free(x, z, 0.2) && S.pathDist(x, z) > 0.8, (x, z) => sticks.push({ x, z, y: hAt(x, z), s: rr(0.5, 1.3), a: R() * 6.28, r: R, charred: true }));
    // meadow flowers in patches (the plot's flowers), on Millholm's fields and the marsh's drier ground; thrift on the rock is its own
    if (kind === 'meadow' || kind === 'marsh') {
      const rate = kind === 'meadow' ? 0.55 : 0.25;
      for (let gx = cx - rad; gx < cx + rad; gx += 0.5) for (let gz = cz - rad; gz < cz + rad; gz += 0.5) {
        if (R() > rate * 0.25 * 2) continue;
        const x = gx + R() * 0.5, z = gz + R() * 0.5, h = hAt(x, z);
        if (h < (kind === 'marsh' ? MARSH_POOL + 0.1 : SEA_Y + 1.25) || fbm2(x * 0.7 + 20, z * 0.7) < -0.05 || !free(x, z, 0.1) || S.pathDist(x, z) < 0.7 || under(x, z, 1.4)) continue;
        flowers.push({ x, z, y: h - 0.02, t: R(), r: R });
      }
    }
    // butterflies: round the wild roses and over the fields
    if (kind === 'meadow' || kind === 'marsh') {
      roses.filter(r => Math.hypot(r.x - cx, r.z - cz) < rad * 1.3).forEach(r => { for (let i = 0, k = 3 + Math.floor(R() * 3); i < k; i++) butterflies.push({ x: r.x + rr(-0.3, 0.3), y: r.y, z: r.z + rr(-0.3, 0.3), r: rr(0.45, 0.8) * r.s, h: 0.8 * r.s * rr(0.75, 1.05) }); });
      plant(kind === 'meadow' ? 10 : 8, 300, () => at(0.1, 0.85), (x, z) => hAt(x, z) > MARSH_POOL + 0.1 && !S.blocked(x, z, 0), (x, z) => butterflies.push({ x, y: hAt(x, z), z, r: rr(0.9, 1.4), h: rr(0.35, 0.6) }));
    }
  }
  LIFE = { trees, rocks, bushes, roses, ferns, flowers, sticks, mush, butterflies, sites, lighthouse: lh };
  return LIFE;
}

/** The GPU grass on an island (world/grass.js): regions, and the density (0..1) and blade height factor at (x, z). */
export function grassRegions() {
  const life = islandLife(), tints = {
    meadow: [0x3c6a1e, 0x7ea03a, 0xa59f52], marsh: [0x3d5a1c, 0x7d8e36, 0x9a9048], palm: [0x55702a, 0x9aa24c, 0xc2b86a], volcano: [0x5a5a2c, 0x8f8a4a, 0xb0a060], rock: [0x3e5a22, 0x7c8e3e, 0xa59f52],
  };
  const out = life.sites.map(S => ({ x: S.I.x, z: S.I.z, ext: S.I.r * 1.45, kind: S.I.kind, tint: tints[S.I.kind], at: (x, z) => grassOn(S, x, z) }));
  out.push({ x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, ext: 16, kind: 'rock', tint: tints.rock, at: (x, z) => grassOn(life.lighthouse, x, z, 'rock') });
  return out;
}
function grassOn(S, x, z, kind = S.I.kind) {
  const h = S.hAt(x, z), sl = Math.hypot(S.hAt(x + 0.25, z) - S.hAt(x - 0.25, z), S.hAt(x, z + 0.25) - S.hAt(x, z - 0.25)) / 0.5;
  const patch = fbm2(x * 0.35 + 3, z * 0.35 - 8, 3);
  let d = 0, tall = 1;
  if (kind === 'meadow') { d = smooth(SEA_Y + 1.15, SEA_Y + 1.6, h); tall = 1.05 + 0.25 * smooth(-0.1, 0.4, patch); }
  if (kind === 'palm') { d = smooth(SEA_Y + 1.2, SEA_Y + 1.5, h) * (0.3 + 0.4 * smooth(-0.2, 0.3, patch)); tall = 0.8; }
  if (kind === 'volcano') { const s = Math.hypot(x - S.I.x, z - S.I.z) / S.I.r; d = smooth(SEA_Y + 1.1, SEA_Y + 1.5, h) * smooth(0.3, 0.55, s) * 0.35 * smooth(-0.25, 0.3, patch) * (1 - smooth(0.7, 1.1, sl)); tall = 0.7; }
  if (kind === 'marsh') { d = smooth(MARSH_POOL - 0.02, MARSH_POOL + 0.12, h) * smooth(SEA_Y + 0.85, SEA_Y + 1.2, h); tall = 1.2 + 0.4 * smooth(-0.2, 0.4, patch); }
  if (kind === 'rock') { d = smooth(LIGHTHOUSE.top - 0.6, LIGHTHOUSE.top - 0.1, h) * (1 - smooth(0.35, 0.6, sl)) * (0.55 + 0.45 * smooth(-0.3, 0.3, patch)); tall = 0.85; }
  if (kind !== 'rock' && S.blocked(x, z, -0.25)) d = 0;
  if (kind === 'rock' && S.blocked(x, z, -0.6)) d = 0;
  d *= smooth(0.25, 0.8, S.pathDist(x, z));
  return [clamp(d), tall];
}

/** The ground's soil (dirt) mask for the islands' terrain shader: the worn paths, mud round the marsh's pools, ash. */
export function soilAt(S, x, z) {
  const h = S.hAt(x, z), p = 1 - smooth(0.35, 0.95 + 0.3 * fbm2(x * 0.8, z * 0.8, 2), S.pathDist(x, z));
  if (!S.I) return p;
  if (S.I.kind === 'marsh') return Math.max(p, 1 - smooth(MARSH_POOL + 0.02, MARSH_POOL + 0.3, h));
  if (S.I.kind === 'volcano') return Math.max(p, 0.25 + 0.3 * smooth(-0.2, 0.4, fbm2(x * 0.3, z * 0.3, 2)));
  return p;
}
