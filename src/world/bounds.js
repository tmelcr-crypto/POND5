import { CONFIG } from '../config.js';
import { WORLD_HALF } from './layout.js';

/**
 * World edge and static obstacles for the player.
 *  - obstacles: a uniform spatial grid of vertical circles (tree trunks, boulders) registered by the scatter,
 *    so collision cost does not grow with the number of trees.
 *  - applyBounds: soft boundary. Inside the last `boundaryMargin` metres the player is eased back like a spring;
 *    a hard clamp just before the edge guarantees nobody leaves the 100 x 100 m area.
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

export function applyBounds(p, vel, dt) {
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
