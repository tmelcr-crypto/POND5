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
/** Terrain height everywhere. Exactly dioramaH() inside the plot, so every authored asset sits where it did. */
export function H(x, z) {
  const q = coreDist(x, z);
  if (q <= 0) return dioramaH(x, z);
  const w = smooth(0, WC.coreBlend, q);
  return dioramaH(x, z) * (1 - w) + hillsH(x, z) * w;
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
];
export function excluded(x, z, margin = 0) { for (const f of EXCLUSIONS) if (f(x, z) < margin) return true; return false; }
