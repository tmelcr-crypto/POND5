import * as THREE from 'three';
import { clamp, smooth } from '../core/math.js';
import { fbm2 } from '../core/noise.js';
import { CONFIG } from '../config.js';

/**
 * Site plan (world units = metres, y up). The authored 10 x 10 m plot spans -5..5 on x and z and sits in the
 * middle of the 100 x 100 m world. Positions of every diorama asset live here, plus H(x, z): the terrain height
 * function that everything samples. Inside the plot H is the original diorama terrain (lake basin, gentle
 * hills, flattened pad under the cabin); outside it blends into seeded rolling hills that run down to the
 * beaches of an island, surrounded by sea.
 * The world biome (forest density) and the scatter exclusion zones live here too.
 */
export const HALF = 5, WATER_Y = 0.0, BOTTOM = -1.5;
export const LAKE = { x: 1.45, z: 0.85 };
export const HOUSE = { x: 3.05, z: -3.4, w: 3.6, d: 2.9 }, PAD_H = 0.3;
export const CB = { FL: 0.34, R: 0.11, S: 0.19, XW: 1.69, ZW: 1.34, EAVE: 2.44, PITCH: 0.78 };
export const roofY = z => CB.EAVE + (CB.ZW + 0.11 - Math.abs(z)) * CB.PITCH;
export function houseRectDist(x, z) { const dx = Math.max(Math.abs(x - HOUSE.x) - HOUSE.w / 2, 0), dz = Math.max(Math.abs(z - HOUSE.z) - HOUSE.d / 2, 0); return Math.hypot(dx, dz); }
export const ROCK = { x: -3.75, z: 0.0 }, ROSE = { x: 1.72, z: -1.62 };
export const rockColliders = [];
export function inRocks(x, z, m = 0) { const dx = (x - ROCK.x) / (1.12 + m), dz = (z - ROCK.z) / (0.9 + m); return dx * dx + dz * dz < 1; }
export function inRose(x, z, r = 0.3) { return Math.hypot(x - ROSE.x, z - ROSE.z) < r; }
export function inSteps(x, z) { const lx = x - HOUSE.x, lz = z - HOUSE.z; return lx > 0.4 && lx < 1.5 && lz > CB.ZW && lz < CB.ZW + 0.7; }
/**
 * The cabin's bed (built in assets/cabin/cabin.js at these house-local coordinates): its footprint in world space,
 * the mattress top, where you sit on its open (west) side facing the room, and where your head lies on the pillow.
 * Sleeping in it: app/sleeping.js.
 */
export const BED = (() => {
  const fl = PAD_H + CB.FL, x0 = HOUSE.x + 0.6, x1 = HOUSE.x + 1.56, z0 = HOUSE.z - 1.2, z1 = HOUSE.z + 0.52, top = fl + 0.53;
  return { x0, x1, z0, z1, top, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, floor: fl,
    edge: { x: x0 + 0.14, z: HOUSE.z - 0.2, fx: -1, fz: 0, top },          // sitting on the side, facing the room
    pillow: { x: (x0 + x1) / 2, z: z0 + 0.36, y: top + 0.14 } };          // the lying eye, head on the pillow
})();
/**
 * Storage chests (meshes: assets/cabin/chest.js; using them: app/chestUI.js). Each keeps its own contents. (x, z): the
 * middle of its base; rot: the turn about y that points its front (the lid's open side, local +z) where it faces;
 * length along its front, depth, height.
 */
export const CHESTS = [
  { id: 'cabin', x: HOUSE.x - 2.58, z: HOUSE.z - 1.38, rot: -Math.PI / 2, length: 0.86, depth: 0.5, height: 0.52 },   // behind the woodpile's back end, clear of the wall's log ends, facing west
];
/** Distance to the nearest chest's footprint (< 0 under it): the grass and flowers keep out of it. */
export function chestDist(x, z) {
  let d = Infinity;
  for (const C of CHESTS) {
    const dx = x - C.x, dz = z - C.z, c = Math.cos(C.rot), s = Math.sin(C.rot), a = Math.abs(dx * c - dz * s) - C.length / 2, f = Math.abs(dx * s + dz * c) - C.depth / 2;
    d = Math.min(d, Math.max(a, f) < 0 ? Math.max(a, f) : Math.hypot(Math.max(a, 0), Math.max(f, 0)));
  }
  return d;
}
export const CON = { x: -3.0, z: -2.55 };
export const APP = { x: -2.35, z: 2.45 };
export function lakeR(a) { return 1.85 + 0.3 * Math.sin(3 * a + 1.0) + 0.17 * Math.sin(5 * a + 2.3) + 0.09 * Math.sin(7 * a + 0.4); }
export function lakeD(x, z) { const dx = x - LAKE.x, dz = z - LAKE.z; return Math.hypot(dx, dz) / lakeR(Math.atan2(dz, dx)); }
export function dioramaH(x, z) {
  const d = lakeD(x, z);
  let h = 0.035 + 0.08 * fbm2(x * 0.28 + 3.1, z * 0.28 - 1.7) * smooth(0.9, 1.6, d) + 0.02 * fbm2(x * 1.6 + 9, z * 1.6 - 4, 3) + 0.28 * smooth(0.95, 2.2, d) + 0.08 * smooth(2.2, 4.5, d) * (0.5 + fbm2(x * 0.5, z * 0.5));
  h += 0.08 * Math.exp(-((x - CON.x) ** 2 + (z - CON.z) ** 2) / 3.0) + 0.05 * Math.exp(-((x - APP.x) ** 2 + (z - APP.z) ** 2) / 2.5);
  const s = smooth(1.12, 0.45, d);
  const hh = h * (1 - s) - 0.52 * s + 0.03 * s * fbm2(x * 2.0, z * 2.0, 2);
  const kf = 1 - smooth(0.05, 0.9, houseRectDist(x, z));
  return hh * (1 - kf) + PAD_H * kf;
}

/* ---- the 100 x 100 m world around the plot ---- */
const WC = CONFIG.world, TC = CONFIG.terrain, SC = CONFIG.scatter, IC = CONFIG.island;
export const WORLD_HALF = WC.size / 2, SEA_Y = IC.seaLevel;
// seed -> noise-space offsets (the value noise itself is unseeded, so the seed moves the sample window)
const SX = (WC.seed * 12.9898) % 911 + 37.1, SZ = (WC.seed * 78.233) % 877 - 51.7;
/** Distance outside the square that keeps the exact diorama terrain (0 inside it). */
export function coreDist(x, z) { return Math.hypot(Math.max(Math.abs(x) - WC.coreHalf, 0), Math.max(Math.abs(z) - WC.coreHalf, 0)); }
/** Distance from (x, z) to the shoreline: > 0 on land, < 0 at sea. The coast wanders with seeded noise. */
export function coastDist(x, z) {
  const a = Math.atan2(z, x), R = IC.radius + IC.coastNoise * 2 * fbm2(Math.cos(a) * 1.6 + SX, Math.sin(a) * 1.6 + SZ, 3);
  return R - Math.hypot(x, z);
}
/** Rolling hills, flat near the plot, running down to a beach and the sea floor at the coast. */
export function hillsH(x, z) {
  const f = 1 / TC.hillScale, grow = smooth(0, 24, coreDist(x, z));
  const land = 0.36 + grow * (TC.hillHeight * (0.5 + fbm2(x * f + SX, z * f + SZ, 3)) + TC.detailHeight * fbm2(x * 0.21 - SZ, z * 0.21 + SX, 3));
  const c = coastDist(x, z);
  // beach: a gentle slope up from the waterline; offshore: steeper down to the sea floor
  const shore = c > 0 ? SEA_Y + 0.12 * c : Math.max(SEA_Y - IC.seaDepth, SEA_Y + 0.25 * c);
  return land + (shore - land) * (1 - smooth(IC.beachWidth * 0.4, IC.beachWidth * 1.6, c));
}
/**
 * Terrain height before the stream is carved: exactly dioramaH() inside the plot. The plot's builders use it for their
 * placement decisions, so their random draws (and so the reference trees) are the same as before the stream.
 */
export function H0(x, z) {
  const q = coreDist(x, z);
  if (q <= 0) return dioramaH(x, z);
  const w = smooth(0, WC.coreBlend, q);
  return dioramaH(x, z) * (1 - w) + hillsH(x, z) * w;
}
/** Terrain height everywhere: H0 with the stream's channel and banks carved in. */
export function H(x, z) {
  const h0 = H0(x, z), q = streamAt(x, z);
  if (!q) return h0;
  const bed = q.W - q.depth, g = q.d < q.w ? bed + q.depth * 1.08 * (q.d / q.w) ** 2 : q.W + 0.03 + (q.d - q.w) * q.bank;
  const k = 0.06, t = clamp(0.5 + 0.5 * (g - h0) / k);                 // smooth minimum: no crease where the bank meets the land
  return g * (1 - t) + h0 * t - k * t * (1 - t);
}

/*
 * The stream: from the pond's south-east rim, past the cabin, north through a low valley and down three rapids to the
 * beach. A centripetal Catmull-Rom course through STREAM_COURSE; along it (s = metres from the pond) the water level W
 * steps down through pools and rapids from the pond's level to the sea, the channel's half-width w and depth vary, and
 * the terrain is carved to a bed and banks (H above). Keys are [s, value]; values between keys ease smoothly.
 */
const STREAM_COURSE = [[2.37, 1.62], [2.9, 1.95], [3.9, 2.35], [4.9, 1.7], [5.9, 0.4], [7.3, -1.3], [7.6, -4.4], [9.4, -7.6], [8.9, -12], [10.9, -16.2], [10.1, -20.8], [11.9, -25], [12.9, -27.6], [11.3, -30.4], [12.2, -33.8]];
const STREAM_LEVEL = [[0, 0], [4, 0], [6.5, -0.07], [13, -0.1], [15, -0.22], [22, -0.26], [24.5, -0.44], [28, -0.5], [29.6, -0.68], [33, -0.75], [36, -0.8], [99, -0.8]];
const STREAM_WIDTH = [[0, 0.5], [3, 0.42], [6, 0.55], [14, 0.5], [18, 0.62], [24, 0.5], [30, 0.6], [33, 1.0], [36, 1.8], [99, 2.2]];
const STREAM_BANK = [[0, 0.62], [31, 0.62], [35, 0.2], [99, 0.15]];   // bank slope: gentle where it fans out over the beach
const STREAM_DEPTH = [[0, 0.3], [4, 0.18], [6.5, 0.1], [9, 0.2], [15, 0.08], [18, 0.22], [24.5, 0.07], [27, 0.2], [29.6, 0.07], [32, 0.16], [99, 0.2]];
function keyed(keys, s) {
  let i = 0; while (i < keys.length - 2 && keys[i + 1][0] < s) i++;
  const [s0, v0] = keys[i], [s1, v1] = keys[i + 1], t = clamp((s - s0) / (s1 - s0));
  return v0 + (v1 - v0) * t * t * (3 - 2 * t);
}
export const STREAM = (() => {
  const curve = new THREE.CatmullRomCurve3(STREAM_COURSE.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const len = curve.getLength(), step = 0.2, n = Math.ceil(len / step), pts = [];
  let wMin = 0;
  for (let i = 0; i <= n; i++) {
    const u = i / n, p = curve.getPointAt(u), t = curve.getTangentAt(u), s = u * len;
    // falls only, stays below the natural ground (outside the pond) and ends at the sea
    wMin = Math.min(wMin, keyed(STREAM_LEVEL, s), lakeD(p.x, p.z) > 1.02 ? H0(p.x, p.z) - 0.08 : Infinity);
    pts.push({ x: p.x, z: p.z, tx: t.x, tz: t.z, s, W: Math.max(wMin, SEA_Y), w: keyed(STREAM_WIDTH, s), depth: keyed(STREAM_DEPTH, s), bank: keyed(STREAM_BANK, s) });
  }
  for (let i = 0; i < pts.length; i++) {   // slope of the water (for flow speed and foam): drop over the next metre
    const j = Math.min(pts.length - 1, i + 5); pts[i].slope = (pts[i].W - pts[j].W) / Math.max(1e-3, pts[j].s - pts[i].s);
  }
  // a 1 m grid of the samples within reach of each cell, for fast lookups
  const R = 5.5, x0 = Math.min(...pts.map(p => p.x)) - R, z0 = Math.min(...pts.map(p => p.z)) - R;
  const nx = Math.ceil(Math.max(...pts.map(p => p.x)) + R - x0) + 1, nz = Math.ceil(Math.max(...pts.map(p => p.z)) + R - z0) + 1, cells = Array.from({ length: nx * nz }, () => []);
  pts.forEach((p, k) => { for (let j = Math.floor(p.z - R - z0); j <= Math.floor(p.z + R - z0); j++) for (let i = Math.floor(p.x - R - x0); i <= Math.floor(p.x + R - x0); i++) if (i >= 0 && j >= 0 && i < nx && j < nz) cells[j * nx + i].push(k); });
  return { pts, len, reach: R, grid: { x0, z0, nx, nz, cells } };
})();
/**
 * The nearest point of the stream to (x, z) within its reach (null otherwise): d (m to the centre line), s (m along),
 * W (water level), w (half-width), depth, slope, and the sample index k.
 */
export function streamAt(x, z) {
  const G = STREAM.grid, i = Math.floor(x - G.x0), j = Math.floor(z - G.z0);
  if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return null;
  const list = G.cells[j * G.nx + i]; if (!list.length) return null;
  let best = -1, bd = Infinity;
  for (const k of list) { const p = STREAM.pts[k], d = (x - p.x) ** 2 + (z - p.z) ** 2; if (d < bd) { bd = d; best = k; } }
  const p = STREAM.pts[best], d = Math.sqrt(bd);
  return d > STREAM.reach ? null : { d, s: p.s, W: p.W, w: p.w, depth: p.depth, slope: p.slope, bank: p.bank, k: best };
}
/** Signed distance to the stream's water edge (< 0 in the water); Infinity far from it. */
export function streamDist(x, z) { const q = streamAt(x, z); return q ? q.d - q.w : Infinity; }

/*
 * The footbridge over the stream just below its first rapid, and the stepping-stone path from the cabin steps to it (the
 * meshes: assets/cabin/footbridge.js). The bridge crosses square to the stream at BRIDGE.s; its deck arches from the
 * banks (deckY is walkable, see app/controls.js). The path's flat stones follow curves (FOOTPATH_ROUTES below); the
 * grass and flowers keep off them (footpathDist). Both use their own random numbers.
 */
export const BRIDGE = (() => {
  const s = 16.3, p = STREAM.pts.reduce((b, q) => Math.abs(q.s - s) < Math.abs(b.s - s) ? q : b, STREAM.pts[0]);
  const ax = -p.tz, az = p.tx, half = 1.55, width = 1.0, arch = 0.1;   // across the stream (u), along it (v)
  const endY = Math.max(H(p.x - ax * half, p.z - az * half), H(p.x + ax * half, p.z + az * half)) + 0.16;   // the stringers rest on the banks
  return { x: p.x, z: p.z, ax, az, half, width, arch, endY, W: p.W, deckY: u => endY + arch * (1 - (u / half) ** 2) };
})();
/** Top of the bridge deck at (x, z), or -Infinity off the deck. */
export function bridgeDeckY(x, z) {
  const B = BRIDGE, dx = x - B.x, dz = z - B.z, u = dx * B.ax + dz * B.az, v = dx * B.az - dz * B.ax;
  return Math.abs(u) <= B.half + 0.05 && Math.abs(v) <= B.width / 2 ? B.deckY(Math.max(-B.half, Math.min(B.half, u))) : -Infinity;
}
const streamPt = s => STREAM.pts.reduce((b, q) => Math.abs(q.s - s) < Math.abs(b.s - s) ? q : b, STREAM.pts[0]);
const westBank = (s, off) => { const p = streamPt(s), t = -(p.w + off); return [p.x - p.tz * t, p.z + p.tx * t]; };   // a point on the stream's west bank
// from the cabin steps round the cabin, then down the west bank (inside the stream's scatter exclusion) to the bridge
const FOOTPATH_COURSE = [[4.02, -1.02], [4.75, -1.12], [5.4, -1.62], [5.62, -2.45], westBank(10, 1.15), westBank(12, 1.1), westBank(13.8, 1.1),
  [BRIDGE.x - BRIDGE.ax * (BRIDGE.half + 0.35), BRIDGE.z - BRIDGE.az * (BRIDGE.half + 0.35)]];
/*
 * Two benches for the sunrise and the sunset (meshes: assets/cabin/benches.js), on the crests above the east and west
 * beaches. (x, z): the middle of the seat; face: the way a seated person looks; length / depth: the footprint the player
 * cannot walk through; seatH: the seat's height above the ground there. The paths to them start at the bridge and
 * curve round one end of the bench to stop in front of it.
 */
const faceOf = deg => [Math.cos(deg * Math.PI / 180), Math.sin(deg * Math.PI / 180)];
export const BENCHES = [
  { name: 'sunrise', x: 24.3, z: -16.6, face: faceOf(-11), length: 1.5, depth: 0.62, seatH: 0.46 },   // east, the sun rising over the sea
  { name: 'sunset', x: -25.4, z: -17.6, face: faceOf(190), length: 1.6, depth: 0.66, seatH: 0.44 },  // west-south-west, the sun setting over the sea
].map(b => {
  const [fx, fz] = b.face, g = [];   // y: the mean ground under the footprint (the legs reach down to it wherever it is lower)
  for (const a of [-0.8, 0, 0.8]) for (const f of [-0.35, 0.35]) g.push(H(b.x - fz * a * b.length / 1.6 + fx * f, b.z + fx * a * b.length / 1.6 + fz * f));
  return { ...b, fx, fz, y: g.reduce((s, v) => s + v, 0) / g.length, lantern: -1 };   // lantern: the end it stands at (the path comes round the other)
});
/** A point in a bench's frame: a along the seat (to the bench's right as you sit), f towards where it faces. */
export function benchPoint(b, a, f) { return [b.x - b.fz * a + b.fx * f, b.z + b.fx * a + b.fz * f]; }
/** Everywhere you can sit (the sit button in app/controls.js): the two benches and the cabin's bench under the front window. */
export const SEATS = [
  ...BENCHES.map(b => ({ x: b.x, z: b.z, fx: b.fx, fz: b.fz, top: b.y + b.seatH, half: b.length / 2, back: -0.1 })),
  { x: HOUSE.x - 0.2, z: HOUSE.z + CB.ZW + 0.51, fx: 0, fz: 1, top: PAD_H + 0.45, half: 0.52, back: -0.05 },
];

const BRIDGE_W = [BRIDGE.x - BRIDGE.ax * (BRIDGE.half + 0.35), BRIDGE.z - BRIDGE.az * (BRIDGE.half + 0.35)], BRIDGE_E = [BRIDGE.x + BRIDGE.ax * (BRIDGE.half + 0.35), BRIDGE.z + BRIDGE.az * (BRIDGE.half + 0.35)];
const [SUNRISE, SUNSET] = BENCHES;
/*
 * The jetty on the east beach below the sunrise bench (meshes: assets/water/jetty.js; the boat: assets/water/sailboat.js,
 * sailing: app/boating.js). It runs along +x at z from where the sand meets its deck (x0) out to x1 over ~2 m of water,
 * with a wider head at the end; where the deck stands high over the sand, side stairs lead down to the beach. The boat's
 * berth is along the south side of the head, bow to the sea.
 */
export const JETTY = (() => {
  const z = -18, deckY = 0.35, halfW = 0.7, x1 = 44;
  let x0 = 25; while (x0 < 32 && H(x0, z) > deckY - 0.02) x0 += 0.05;   // the root: where the beach has dropped to the deck
  const head = { x0: 41.2, halfW: 1.3 };
  const stair = { x0: 31.0, x1: 31.9, side: -1, rise: 0.17, run: 0.27 };   // down to the sand on the south side
  stair.steps = Math.max(1, Math.round((deckY - H((stair.x0 + stair.x1) / 2, z - halfW - 1)) / stair.rise));
  const berth = { x: 42.6, z: z - head.halfW - 1.15, heading: 0 };      // boat centre and heading (0: bow along +x)
  const bollards = [[41.55, z - head.halfW + 0.13], [43.75, z - head.halfW + 0.13]];   // on the berth side of the head
  const pole = [43.72, z + head.halfW - 0.14];                             // the lamp post, on the far corner of the head
  return { z, deckY, halfW, x0, x1, head, stair, berth, bollards, pole };
})();
/** Half-width of the jetty's deck at x (0 off its length). */
const jettyHalfW = x => x < JETTY.x0 - 0.05 || x > JETTY.x1 ? 0 : x >= JETTY.head.x0 ? JETTY.head.halfW : JETTY.halfW;
/** The walkable top of the jetty (deck and side stairs) at (x, z), or -Infinity off it. */
export function jettyDeckY(x, z) {
  const J = JETTY, dz = z - J.z, hw = jettyHalfW(x);
  if (hw && Math.abs(dz) <= hw) return J.deckY;
  const S = J.stair, out = -dz * -S.side - J.halfW;   // metres out from the deck edge on the stair's side
  if (x >= S.x0 && x <= S.x1 && out > 0 && out <= S.steps * S.run) return J.deckY - Math.ceil(out / S.run) * S.rise;
  return -Infinity;
}
/** Distance to the jetty's footprint, stairs included (< 0 on it). */
export function jettyDist(x, z) {
  const J = JETTY, hw = Math.max(jettyHalfW(Math.min(Math.max(x, J.x0), J.x1)), 0.01), dx = Math.max(J.x0 - x, x - J.x1, 0), dz = Math.abs(z - J.z) - hw;
  let d = dx > 0 || dz > 0 ? Math.hypot(dx, Math.max(dz, 0)) : Math.max(-dz, 0) * -1;
  const S = J.stair, sz = J.z + S.side * (J.halfW + S.steps * S.run / 2), sx = Math.max(S.x0 - x, x - S.x1, 0), szd = Math.max(Math.abs(z - sz) - S.steps * S.run / 2, 0);
  return Math.min(d, Math.hypot(sx, szd) - (sx === 0 && szd === 0 ? 0.01 : 0));
}
/** The stepping-stone routes: from the cabin to the bridge, and from the bridge to each bench (ending in front of it). */
const FOOTPATH_ROUTES = [
  { course: FOOTPATH_COURSE, from: 0.05 },
  { course: [BRIDGE_E, [12.2, -12.4], [12.8, -14.6], [13.9, -17.3], [16.5, -18.9], [19.6, -19.1], [22.2, -18.7], benchPoint(SUNRISE, 1.75, 0.2), benchPoint(SUNRISE, 1.1, 0.95), benchPoint(SUNRISE, 0, 1.0)], from: 0.55, bench: SUNRISE },
  { course: [BRIDGE_W, [6.2, -11.4], [3.8, -13.2], [0, -14.4], [-5, -15.3], [-10, -16.0], [-15, -16.4], [-19.5, -16.4], benchPoint(SUNSET, 1.85, 0.25), benchPoint(SUNSET, 1.15, 1.0), benchPoint(SUNSET, 0, 1.05)], from: 0.6, bench: SUNSET },
  { course: [[21.0, -19.05], [23.4, -19.9], [25.8, -19.5], [27.4, -18.4], [JETTY.x0 - 0.25, JETTY.z]], from: 0.62 },   // branches off the sunrise path down to the jetty
];
export const FOOTPATH = (() => {
  let seed = 4242; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();
  const stones = [], place = (x, z, tx, tz, sink, route, big = 1) => {
    const r = rr(0.2, 0.27) * big, side = rr(-0.07, 0.07);
    stones.push({ x: x - tz * side, z: z + tx * side, r, sx: rr(1.0, 1.25), rot: Math.atan2(tz, tx) + rr(-0.5, 0.5), sink, seed: Math.floor(rnd() * 1e6), route });
  };
  let len = 0;
  FOOTPATH_ROUTES.forEach((R, route) => {
    const curve = new THREE.CatmullRomCurve3(R.course.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal'), L = curve.getLength();
    const end = R.bench ? L - 0.62 : L;   // a bench route leaves room for the wide stone in front of the seat
    for (let d = R.from; d <= end; d += rr(0.58, 0.66)) { const u = d / L, p = curve.getPointAt(u), t = curve.getTangentAt(u); place(p.x, p.z, t.x, t.z, 0, route); }
    if (R.bench) { const b = R.bench, [x, z] = benchPoint(b, 0, 0.78); place(x, z, -b.fz, b.fx, 0, route, 1.45); }
    len += L;
  });
  // a 1 m grid of the stones within reach of each cell, for fast lookups (footpathDist)
  const reach = 2.2, x0 = Math.min(...stones.map(s => s.x)) - reach, z0 = Math.min(...stones.map(s => s.z)) - reach;
  const nx = Math.ceil(Math.max(...stones.map(s => s.x)) + reach - x0) + 1, nz = Math.ceil(Math.max(...stones.map(s => s.z)) + reach - z0) + 1, cells = Array.from({ length: nx * nz }, () => []);
  stones.forEach(st => { for (let j = Math.floor(st.z - reach - z0); j <= Math.floor(st.z + reach - z0); j++) for (let i = Math.floor(st.x - reach - x0); i <= Math.floor(st.x + reach - x0); i++) if (i >= 0 && j >= 0 && i < nx && j < nz) cells[j * nx + i].push(st); });
  return { stones, len, routes: FOOTPATH_ROUTES.length, grid: { x0, z0, nx, nz, cells, reach } };
})();
/** Distance to the nearest path stone's rim (< 0 on a stone); FOOTPATH.grid.reach (2.2 m) when none is that close. */
export function footpathDist(x, z) {
  const G = FOOTPATH.grid, i = Math.floor(x - G.x0), j = Math.floor(z - G.z0);
  if (i < 0 || j < 0 || i >= G.nx || j >= G.nz) return G.reach;
  let d = G.reach;
  for (const s of G.cells[j * G.nx + i]) d = Math.min(d, Math.hypot(x - s.x, z - s.z) - s.r * (1 + 0.5 * (s.sx - 1)));
  return d;
}
/** Distance to a bench's footprint, its lantern's end included (< 0 inside). */
export function benchDist(x, z) {
  let d = Infinity;
  for (const b of BENCHES) {
    const dx = x - b.x, dz = z - b.z, ab = (-dx * b.fz + dz * b.fx) * -b.lantern, a = Math.max(-ab - (b.length / 2 + 0.45), ab - (b.length / 2 + 0.05)), f = Math.abs(dx * b.fx + dz * b.fz) - b.depth / 2;
    d = Math.min(d, Math.max(a, f) < 0 ? Math.max(a, f) : Math.hypot(Math.max(a, 0), Math.max(f, 0)));
  }
  return d;
}
/** Distance to anything built to walk on or sit at (path stones, bridge, benches, jetty): the island's scatter is cleared off these. */
export function walkwayDist(x, z) { return Math.min(footpathDist(x, z), bridgeDist(x, z), benchDist(x, z), jettyDist(x, z)); }
/** Distance to the bridge's footprint (< 0 under the deck). */
export function bridgeDist(x, z) {
  const B = BRIDGE, dx = x - B.x, dz = z - B.z, u = Math.abs(dx * B.ax + dz * B.az) - B.half, v = Math.abs(dx * B.az - dz * B.ax) - B.width / 2;
  return Math.max(u, v) < 0 ? Math.max(u, v) : Math.hypot(Math.max(u, 0), Math.max(v, 0));
}
/** Spruce forest density 0..1: noise-driven groves between the meadow around the plot and the beach. */
export function forest(x, z) {
  const groves = smooth(0.1, 0.32, fbm2(x * 0.045 + SZ, z * 0.045 + SX, 3));
  const r = Math.hypot(x, z), inland = smooth(IC.beachWidth, IC.beachWidth + 5, coastDist(x, z));
  return clamp(groves * smooth(SC.clearingRadius, SC.clearingRadius + 10, r) * inland);
}
/** Walkable path from the cabin steps to the pond shore (a capsule; scatter and world grass keep it clear). */
export const PATH = (() => {
  const a = { x: HOUSE.x + 0.95, z: HOUSE.z + CB.ZW + 0.85 }, ang = Math.atan2(a.z - LAKE.z, a.x - LAKE.x), r = lakeR(ang) * 1.05;
  return { a, b: { x: LAKE.x + Math.cos(ang) * r, z: LAKE.z + Math.sin(ang) * r } };
})();
function segDist(x, z, a, b) { const vx = b.x - a.x, vz = b.z - a.z, t = clamp(((x - a.x) * vx + (z - a.z) * vz) / (vx * vx + vz * vz)); return Math.hypot(x - a.x - vx * t, z - a.z - vz * t); }
/**
 * Exclusion zones for scattered trees and rocks. Each entry returns a signed distance (< 0 inside).
 * Register more with EXCLUSIONS.push(fn) before the scatter runs (for example for a new building).
 */
export const EXCLUSIONS = [
  (x, z) => Math.max(Math.abs(x), Math.abs(z)) - (WC.coreHalf + 0.5),                        // the authored plot itself
  (x, z) => houseRectDist(x, z) - 3,                                                          // cabin + yard
  (x, z) => (lakeD(x, z) - 1) * lakeR(Math.atan2(z - LAKE.z, x - LAKE.x)) - 2.5,              // pond + shore
  (x, z) => segDist(x, z, PATH.a, PATH.b) - SC.pathWidth / 2,                                 // cabin -> pond path
  (x, z) => streamDist(x, z) - 1.4,                                                          // the stream and its banks
];
export function excluded(x, z, margin = 0) { for (const f of EXCLUSIONS) if (f(x, z) < margin) return true; return false; }
