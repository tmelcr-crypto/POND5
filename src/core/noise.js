/** Integer hash + value noise + fBm in 2D and 3D. Pure functions, no dependencies. */
export function hash2(x, y) { let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
export function vnoise2(x, y) { const xi = Math.floor(x), yi = Math.floor(y); const xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf); const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1); return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1; }
export function fbm2(x, y, o = 4) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise2(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
export function hash3(x, y, z) { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1440662683); h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
export function vnoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z); const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf); const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), L(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
           L(L(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), L(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v), w) * 2 - 1;
}
export function fbm3(x, y, z) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < 3; i++) { s += a * vnoise3(x * f, y * f, z * f); f *= 2.1; a *= 0.5; } return s; }
/**
 * Tileable cloud-shadow field (size x size, 0 = sun .. 1 = full shadow) over a tile of `tile` metres: separate clouds
 * `sizes` metres across, each a cluster of soft puffs, spaced so they don't merge, added until `coverage` of the tile is
 * shaded; `soft` metres of blur at the edges, which tileable noise makes ragged. Deterministic for a given seed.
 */
export function cloudField({ tile = 320, size = 256, sizes = [22, 64], coverage = 0.3, soft = 7, seed = 17 } = {}) {
  let st = seed >>> 0;
  const rnd = () => { st = st + 0x6D2B79F5 | 0; let t = Math.imul(st ^ st >>> 15, 1 | st); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const sm = t => t * t * (3 - 2 * t), px = size / tile, d = new Float32Array(size * size);
  const wrap = v => ((v % tile) + tile) % tile, gap = (a, b) => { const x = Math.abs(wrap(a) - wrap(b)); return Math.min(x, tile - x); };
  // cloud footprints: random sizes and places, rejected if they would touch another one
  const clouds = []; let area = 0;
  for (let i = 0; i < 4000 && area < coverage * tile * tile; i++) {
    const r = (sizes[0] + (sizes[1] - sizes[0]) * rnd()) / 2, x = rnd() * tile, z = rnd() * tile;
    if (clouds.some(c => Math.hypot(gap(c.x, x), gap(c.z, z)) < (c.r + r) * 0.92)) continue;
    clouds.push({ x, z, r }); area += Math.PI * r * r * 0.6;
  }
  // each cloud: a core puff and a few smaller ones around it, as a soft union (wrapping at the tile edges)
  for (const c of clouds) {
    const puffs = [[c.x, c.z, c.r * 0.72]];
    for (let k = 3 + Math.floor(rnd() * 4); k > 0; k--) { const a = rnd() * 6.2832, o = c.r * (0.25 + 0.35 * rnd()); puffs.push([c.x + Math.cos(a) * o, c.z + Math.sin(a) * o, c.r * (0.35 + 0.15 * rnd())]); }
    for (const [x, z, r] of puffs) {
      const R = r + soft, i0 = Math.floor((x - R) * px), i1 = Math.ceil((x + R) * px), j0 = Math.floor((z - R) * px), j1 = Math.ceil((z + R) * px);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const dist = Math.hypot((i + 0.5) / px - x, (j + 0.5) / px - z), v = 1 - sm(Math.min(1, Math.max(0, (dist - r + soft) / (2 * soft))));
        const k = ((j % size) + size) % size * size + ((i % size) + size) % size; d[k] = Math.min(1, d[k] + v);   // a sum, so puffs blend without a crease
      }
    }
  }
  // ragged edges: tileable value noise (its lattice wraps at the tile) shifts the soft rim in and out
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let nz = 0, amp = 0.5;
    for (let P = Math.round(tile / 18), o = 0; o < 3; o++, P *= 2, amp *= 0.5) {
      const fx = x / size * P, fy = y / size * P, xi = Math.floor(fx), yi = Math.floor(fy), u = sm(fx - xi), w = sm(fy - yi);
      const h = (a, b) => hash2((xi + a) % P + seed * 977 + o * 131, (yi + b) % P + seed * 613 + o * 71);
      const top = h(0, 0) + (h(1, 0) - h(0, 0)) * u, bot = h(0, 1) + (h(1, 1) - h(0, 1)) * u; nz += amp * (top + (bot - top) * w - 0.5);
    }
    const k = y * size + x, e = d[k] + nz * 6.4 * d[k] * (1 - d[k]);   // noise only on the rim: solid cores, no stray wisps
    out[k] = sm(Math.min(1, Math.max(0, (e - 0.3) / 0.7)));
  }
  // a wrapping blur (two box passes each way): an even penumbra all round, like a real cloud's
  const R = Math.max(1, Math.round(soft * 0.4 * px)), tmp = new Float32Array(size * size);
  for (let pass = 0; pass < 4; pass++) {
    const [src, dst] = pass % 2 ? [tmp, out] : [out, tmp], hor = pass < 2;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let sum = 0; for (let t = -R; t <= R; t++) sum += hor ? src[y * size + (x + t + size) % size] : src[((y + t + size) % size) * size + x];
      dst[y * size + x] = sum / (2 * R + 1);
    }
  }
  return out;
}
