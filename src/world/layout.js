import { smooth } from '../core/math.js';
import { fbm2 } from '../core/noise.js';

/**
 * Site plan of the 10 x 10 m plot (world units = metres, y up, plot spans -5..5 on x and z).
 * Positions of every asset live here, plus H(x, z): the terrain height function that
 * everything else samples (lake basin, gentle hills, flattened pad under the cabin).
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
export function H(x, z) {
  const d = lakeD(x, z);
  let h = 0.035 + 0.08 * fbm2(x * 0.28 + 3.1, z * 0.28 - 1.7) * smooth(0.9, 1.6, d) + 0.02 * fbm2(x * 1.6 + 9, z * 1.6 - 4, 3) + 0.28 * smooth(0.95, 2.2, d) + 0.08 * smooth(2.2, 4.5, d) * (0.5 + fbm2(x * 0.5, z * 0.5));
  h += 0.08 * Math.exp(-((x - CON.x) ** 2 + (z - CON.z) ** 2) / 3.0) + 0.05 * Math.exp(-((x - APP.x) ** 2 + (z - APP.z) ** 2) / 2.5);
  const s = smooth(1.12, 0.45, d);
  const hh = h * (1 - s) - 0.52 * s + 0.03 * s * fbm2(x * 2.0, z * 2.0, 2);
  const kf = 1 - smooth(0.05, 0.9, houseRectDist(x, z));
  return hh * (1 - kf) + PAD_H * kf;
}
