import { CONFIG } from '../config.js';
import { WORLD_HALF, H, SEA_Y } from './layout.js';

/**
 * World edge and static obstacles for the player.
 *  - obstacles: a uniform spatial grid of vertical circles (tree trunks) registered by the scatter, so collision
 *    cost does not grow with the number of trees.
 *  - rockBodies: the same kind of grid for the island's boulders, as rotated ellipsoids
 *    { x, y, z, rx, ry, rz, rot, body } in the outcrop's collider format (radii padded by 0.2); see controls.js.
 *  - applyBounds: soft boundary. Walking into the sea deeper than CONFIG.island.wadeDepth eases you back towards
 *    the island like a spring; when flying, the last `boundaryMargin` metres of the 100 x 100 m area do the same,
 *    and a hard clamp just before the edge guarantees nobody leaves it.
 */
const CELL = 4, cells = new Map();
const key = (i, j) => i * 73856093 ^ j * 19349663;
export const obstacles = {
  count: 0,
  add(x, z, r, top) {
    const c = { x, z, r, top }; this.count++;
    for (let i = Math.floor((x - r) / CELL); i <= Math.floor((x + r) / CELL); i++)
      for (let j = Math.floor((z - r) / CELL); j <= Math.floor((z + r) / CELL); j++) {
        const k = key(i, j); let l = cells.get(k); if (!l) cells.set(k, l = []); l.push(c);
      }
  },
  /** Push point p (a Vector3) out of every circle it is inside of, if it is below that obstacle's top. */
  resolve(p, radius = 0) {
    const l = cells.get(key(Math.floor(p.x / CELL), Math.floor(p.z / CELL))); if (!l) return;
    for (const c of l) {
      if (p.y > c.top) continue;
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), r = c.r + radius;
      if (d < r && d > 1e-4) { p.x = c.x + dx / d * r; p.z = c.z + dz / d * r; }
    }
  },
};

const rockCells = new Map();
export const rockBodies = {
  count: 0,
  add(c) {
    this.count++; const r = Math.max(c.rx, c.rz);
    for (let i = Math.floor((c.x - r) / CELL); i <= Math.floor((c.x + r) / CELL); i++)
      for (let j = Math.floor((c.z - r) / CELL); j <= Math.floor((c.z + r) / CELL); j++) {
        const k = key(i, j); let l = rockCells.get(k); if (!l) rockCells.set(k, l = []); l.push(c);
      }
  },
  /** Ellipsoids that may touch the vertical line through (x, z). */
  near(x, z) { return rockCells.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || NONE; },
};
const NONE = [];

export function applyBounds(p, vel, dt, walking) {
  if (walking) {
    const over = (SEA_Y - H(p.x, p.z)) - CONFIG.island.wadeDepth;   // metres deeper than wading depth
    if (over > 0) {
      const r = Math.hypot(p.x, p.z) || 1, nx = p.x / r, nz = p.z / r, out = vel.x * nx + vel.z * nz;
      if (out > 0) { const k = 1 - Math.exp(-dt * 30 * over); vel.x -= nx * out * k; vel.z -= nz * out * k; } // damp seaward motion
      const push = Math.min(over * 6, 5) * dt; p.x -= nx * push; p.z -= nz * push;                          // ease back to shore
    }
  }
  const hard = WORLD_HALF - 1.2, soft = hard - CONFIG.player.boundaryMargin;
  for (const a of ['x', 'z']) {
    const over = Math.abs(p[a]) - soft;
    if (over > 0) {
      const s = Math.sign(p[a]);
      if (vel[a] * s > 0) vel[a] *= Math.exp(-dt * 10 * over);   // damp outward motion the deeper you go
      p[a] -= s * over * Math.min(1, dt * 3);                     // spring back
      if (Math.abs(p[a]) > hard) p[a] = s * hard;
    }
  }
}
