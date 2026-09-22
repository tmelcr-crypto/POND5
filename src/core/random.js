/**
 * Seeded PRNG (mulberry32). Every procedural asset draws from this single stream,
 * so the scene looks identical on every load. Asset build order therefore matters:
 * see src/main.js. Call setSeed() before building to get a different variation.
 */
let seed = 20260921;
export function setSeed(s) { seed = s | 0; }
export const rng = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
export const rr = (a, b) => a + (b - a) * rng();
