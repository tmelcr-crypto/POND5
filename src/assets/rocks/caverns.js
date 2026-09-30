import * as THREE from 'three';
import { lin, smooth, clamp } from '../../core/math.js';
import { fbm3, vnoise3 } from '../../core/noise.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { CAVERNS, LAVA_TUBE, caveSDF, caveFloor, caveOpen, underground, H } from '../../world/layout.js';
import { U } from '../../core/uniforms.js';
import { fernTexture, fernGeometry } from './rockOutcrop.js';
import { voice } from '../fauna/animalKit.js';
import { starTexture } from '../story/friendship.js';
import { isTouch } from '../../core/env.js';

/**
 * The caverns (#63; their plan, floors and walls: CAVERNS in world/layout.js), after Luray Caverns: limestone halls under
 * the south slope. The rock is one mesh: the caves' air (caveSDF, roughened by noise on the walls and roof but not the
 * floors) polygonised on a 0.3 m grid (marching tetrahedra), cut off where it rises out of the ground at the ramps.
 * Cream walls with rusty flowstone streaks, a mud floor. Lit like a show cave: there is no light of its own; each vertex
 * carries baked glow (warm lamps in the great hall, the crystals' cool light in the tunnel and the crystal chamber) and
 * its openness to the sky (`ao`: 1 at the ramps' mouths, a few percent deep inside), which scales the sun and the sky.
 *  - formations: stalactites (soda straws among them), stalagmites under them, columns where they meet, draperies
 *    banded orange and white, flowstone mounds; the pool in the great hall mirrors the stalactites over it (Dream Lake);
 *  - glowing crystals along the tunnel and in the crystal chamber, with soft halos;
 *  - the old ochre paintings on the crystal chamber's wall; the story's star carved over the first ramp's arch;
 *  - bats, circling the halls and flitting through the tunnel; water dripping now and then.
 * Drawn only near the mouths or below ground. No random numbers (hashes and noise only).
 */
export const CAVE_LOOK = {
  step: 0.3,                                        // m: the grid the rock is built on
  noise: [0.42, 0.11],                              // m: the walls' large and small roughness
  lamps: [                                          // [x, y over the floor, z, colour, strength, reach m]: the show lighting
    [-5.6, 0.6, 21.0, 0xffb070, 1.3, 4.5], [-9.6, 0.5, 19.2, 0xffd9a8, 1.6, 5.5], [-14.8, 0.6, 21.0, 0xff9c5a, 1.2, 5],
    [-11.6, 0.5, 26.2, 0xfff0d8, 1.3, 5], [-7.2, 3.2, 24.8, 0xb8d8ff, 0.6, 5], [-16.2, 0.4, 24.8, 0x9ff0c8, 0.7, 4],
  ],
  crystals: [0x7fe7ff, 0xb68cff, 0xff8fd8, 0x9fffd6],
  bats: isTouch ? 8 : 12,
  near: 14,                                         // m from a mouth within which the caves are drawn (and anywhere below)
};
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
const V = (x, y, z) => new THREE.Vector3(x, y, z);

/** The rock's field: the caves' air (< 0) with noise on the walls and roof (not on the walkable floors). */
function field(x, y, z, h = H(x, z)) {
  const d = caveSDF(x, y, z); if (d > 1.4) return d;
  const f = caveFloor(x, z), w = (f === null ? 1 : smooth(0.15, 1.0, y - f)) * (1 - smooth(h - 1.4, h - 0.5, y));   // smooth, sheer walls where they meet the ground
  const [a, b] = CAVE_LOOK.noise;
  let n = a * (fbm3(x * 0.42, y * 0.7, z * 0.42) - 0.5) * 2 + b * (vnoise3(x * 2.1, y * 2.6, z * 2.1) - 0.5) * 2 + 0.08 * Math.sin(x * 3.1 + Math.sin(z * 2.3) * 2);
  if (n < 0) n *= clamp((h - y - 0.25) / 1.2);   // never hollowing the roof out through the ground
  return d + w * n;
}
/** The caves' lighting on a material: the sun and sky scaled by attribute `ao`, the baked `glow` added (the hand lantern stays). */
function caveLit(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    if (prev) prev.call(mat, s, r);
    s.vertexShader = 'attribute float ao; attribute vec3 glow; varying float vAO; varying vec3 vGlow;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vAO = ao; vGlow = glow;');
    s.fragmentShader = 'varying float vAO; varying vec3 vGlow;\n' + s.fragmentShader
      .replace('#include <lights_pars_begin>', `#include <lights_pars_begin>
        #if NUM_DIR_LIGHTS > 0
          void caveSun(const in DirectionalLight light, const in GeometricContext geo, out IncidentLight direct) { getDirectionalDirectLightIrradiance(light, geo, direct); direct.color *= vAO; }
          #ifdef getDirectionalDirectLightIrradiance
            #undef getDirectionalDirectLightIrradiance
          #endif
          #define getDirectionalDirectLightIrradiance caveSun
        #endif`)
      .replace('#include <aomap_fragment>', '#include <aomap_fragment>\n reflectedLight.indirectDiffuse *= vAO; reflectedLight.indirectSpecular *= vAO; reflectedLight.indirectDiffuse += vGlow * diffuseColor.rgb;');
  };
  return mat;
}

/** The rock of a cave system inside its box B: the field sampled on a grid of step S and polygonised by marching
 *  tetrahedra, triangles above the ground left out (the terrain is there). Positions and normals, and the ground's
 *  height from the grid (Hat). */
function polygonise(B, S) {
  const Hmax = (() => { let m = -Infinity; for (let x = B.x0; x <= B.x1; x += 1) for (let z = B.z0; z <= B.z1; z += 1) m = Math.max(m, H(x, z)); return m; })();
  const X0 = B.x0, Y0 = B.y0 - 2.4, Z0 = B.z0, NX = Math.ceil((B.x1 - B.x0) / S) + 1, NY = Math.ceil((Hmax + 0.8 - Y0) / S) + 1, NZ = Math.ceil((B.z1 - B.z0) / S) + 1;
  const F = new Float32Array(NX * NY * NZ), id = (i, j, k) => (k * NY + j) * NX + i, HG = new Float32Array(NX * NZ);
  for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) HG[k * NX + i] = H(X0 + i * S, Z0 + k * S);
  for (let k = 0; k < NZ; k++) for (let j = 0; j < NY; j++) { const y = Y0 + j * S; for (let i = 0; i < NX; i++) { const h = HG[k * NX + i]; F[id(i, j, k)] = y > h + 2 ? 5 : field(X0 + i * S, y, Z0 + k * S, h); } }
  const Hat = (x, z) => { const fi = clamp((x - X0) / S, 0, NX - 1.001), fk = clamp((z - Z0) / S, 0, NZ - 1.001), i = Math.floor(fi), k = Math.floor(fk), u = fi - i, v = fk - k;
    return (HG[k * NX + i] * (1 - u) + HG[k * NX + i + 1] * u) * (1 - v) + (HG[(k + 1) * NX + i] * (1 - u) + HG[(k + 1) * NX + i + 1] * u) * v; };
  const grad = (i, j, k) => [F[id(Math.min(NX - 1, i + 1), j, k)] - F[id(Math.max(0, i - 1), j, k)], F[id(i, Math.min(NY - 1, j + 1), k)] - F[id(i, Math.max(0, j - 1), k)], F[id(i, j, Math.min(NZ - 1, k + 1))] - F[id(i, j, Math.max(0, k - 1))]];
  const pos = [], nor = [];
  const CORNER = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
  const TETS = [[0, 5, 1, 6], [0, 1, 2, 6], [0, 2, 3, 6], [0, 3, 7, 6], [0, 7, 4, 6], [0, 4, 5, 6]];
  const cv = new Float64Array(8), cp = [], cg = [];
  for (let c = 0; c < 8; c++) { cp.push([0, 0, 0]); cg.push([0, 0, 0]); }
  const edge = (a, b) => { const t = cv[a] / (cv[a] - cv[b]), pa = cp[a], pb = cp[b], ga = cg[a], gb = cg[b];
    return [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t, ga[0] + (gb[0] - ga[0]) * t, ga[1] + (gb[1] - ga[1]) * t, ga[2] + (gb[2] - ga[2]) * t]; };
  const tri = (a, b, c) => {
    if (a[1] > Hat(a[0], a[2]) + 0.04 && b[1] > Hat(b[0], b[2]) + 0.04 && c[1] > Hat(c[0], c[2]) + 0.04) return;   // above the ground: the terrain is there
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, gx = a[3] + b[3] + c[3], gy = a[4] + b[4] + c[4], gz = a[5] + b[5] + c[5];
    const list = nx * gx + ny * gy + nz * gz > 0 ? [a, c, b] : [a, b, c];   // facing the air (against the field's rise)
    for (const p of list) { pos.push(p[0], p[1], p[2]); const l = Math.hypot(p[3], p[4], p[5]) || 1; nor.push(-p[3] / l, -p[4] / l, -p[5] / l); }
  };
  for (let k = 0; k < NZ - 1; k++) for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
    let neg = 0; for (let c = 0; c < 8; c++) { const [a, b, d] = CORNER[c]; cv[c] = F[id(i + a, j + b, k + d)]; if (cv[c] < 0) neg++; }
    if (neg === 0 || neg === 8) continue;
    for (let c = 0; c < 8; c++) { const [a, b, d] = CORNER[c], p = cp[c], g = cg[c], gg = grad(i + a, j + b, k + d); p[0] = X0 + (i + a) * S; p[1] = Y0 + (j + b) * S; p[2] = Z0 + (k + d) * S; g[0] = gg[0]; g[1] = gg[1]; g[2] = gg[2]; }
    for (const T of TETS) {
      const ins = T.filter(c => cv[c] < 0), out = T.filter(c => cv[c] >= 0);
      if (ins.length === 0 || ins.length === 4) continue;
      if (ins.length === 1 || ins.length === 3) { const [a] = ins.length === 1 ? ins : out, o = T.filter(c => c !== a); tri(edge(a, o[0]), edge(a, o[1]), edge(a, o[2])); }
      else { const [a, b] = ins, [c, d] = out, p1 = edge(a, c), p2 = edge(a, d), p3 = edge(b, d), p4 = edge(b, c); tri(p1, p2, p3); tri(p1, p3, p4); }
    }
  }
  return { pos, nor, Hat };
}

export function createCaverns(ctx, { ambience } = {}) {
  const { scene, camera } = ctx, CL = CAVE_LOOK, B = CAVERNS.box, S = CL.step, group = new THREE.Group(); scene.add(group);

  /* ---- the rock: the field on a grid, polygonised by marching tetrahedra ---- */
  const t0 = performance.now();
  const { pos, nor, Hat } = polygonise(B, S);
  const built = performance.now() - t0;

  /* ---- lighting, baked per vertex: the lamps, the crystals; openness to the sky ---- */
  const crystalsAt = [];   // [x, y, z, colour index, size]: clusters along the tunnel and in the crystal chamber
  {
    const T = CAVERNS.tubes.find(t => t.name === 'tunnel');
    for (let s = 1.2, n = 0; s < T.len - 0.5; s += 2.6, n++) {
      let a = null, b = null, acc = 0; for (let i = 1; i < T.pts.length; i++) { const L = T.pts[i][3] - T.pts[i - 1][3]; if (s <= acc + L) { a = T.pts[i - 1]; b = T.pts[i]; break; } acc += L; }
      if (!a) continue; const u = (s - acc) / (b[3] - a[3]), x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u, fl = a[2] + (b[2] - a[2]) * u;
      const dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), side = n % 2 ? 1 : -1, ox = -dz / l * side, oz = dx / l * side;
      const w = wallOut(x, fl + 0.4, z, ox, oz); crystalsAt.push([w[0], fl + 0.15, w[2], n % 4, 1]);
      if (n % 3 === 1) { const r = wallOut(x, fl + 2.3, z, -ox * 0.3, -oz * 0.3, 0.9); crystalsAt.push([r[0], r[1], r[2], (n + 1) % 4, 0.7]); }
    }
    const C = CAVERNS.halls.find(h => h.name === 'crystal');
    crystalsAt.push([C.x + 0.3, C.floor + 0.05, C.z - 0.2, 1, 2.2]);   // the great cluster in the middle of the chamber
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2 + 0.3, w = wallOut(C.x, C.floor + 0.5 + (i % 3) * 0.9, C.z, Math.cos(a), Math.sin(a)); crystalsAt.push([w[0], Math.max(C.floor + 0.1, w[1] - 0.2), w[2], i % 4, 0.8 + 0.4 * hash(i, 5)]); }
  }
  function wallOut(x, y, z, dx, dz, up = 0) {   // from (x, y, z) out along (dx, up, dz) to the rock's face, a hand's breadth short of it
    const l = Math.hypot(dx, up, dz) || 1; dx /= l; dz /= l; up /= l;
    for (let t = 0; t < 7; t += 0.05) if (field(x + dx * t, y + up * t, z + dz * t) > 0) return [x + dx * (t - 0.08), y + up * (t - 0.08), z + dz * (t - 0.08)];
    return [x + dx * 7, y + up * 7, z + dz * 7];
  }
  const sources = [];
  for (const [x, dy, z, c, I, R] of CL.lamps) { const f = caveFloor(x, z); sources.push([x, (f === null ? -4 : f) + dy, z, lin(c), I, R]); }
  for (const [x, y, z, ci, sz] of crystalsAt) sources.push([x, y + 0.3, z, lin(CL.crystals[ci]), 0.9 * sz, 2.6 + 1.4 * sz]);
  const mouths = CAVERNS.mouths.map(m => V(m.x, H(m.x, m.z), m.z));
  const bake = (x, y, z, nx, ny, nz, glowOut) => {
    let r = 0, g = 0, b = 0;
    for (const [sx, sy, sz, c, I, R] of sources) {
      const dx = sx - x, dy = sy - y, dz = sz - z, d = Math.hypot(dx, dy, dz); if (d > R * 3) continue;
      const k = I / (1 + (d / R) * (d / R) * 4) * (0.35 + 0.65 * Math.max(0, (dx * nx + dy * ny + dz * nz) / (d || 1)));
      r += c.r * k; g += c.g * k; b += c.b * k;
    }
    glowOut.push(Math.min(r, 1.6), Math.min(g, 1.6), Math.min(b, 1.6));
    let ao = 0.03; for (const m of mouths) { const d = Math.hypot(m.x - x, m.y - y, m.z - z); ao = Math.max(ao, Math.pow(clamp(1.15 - d / 7), 2)); }
    if (y > Hat(x, z) - 1.6 && caveOpen(x, z)) ao = Math.max(ao, 0.8);
    return ao;
  };
  const rockGeo = new THREE.BufferGeometry(); {
    const n = pos.length / 3, col = new Float32Array(n * 3), glow = [], ao = new Float32Array(n), c = new THREE.Color();
    const cream = lin(0xcdbb98), rust = lin(0xa8643a), mud = lin(0x5c4b3b), roof = lin(0xd9ccb1), wet = lin(0x6e5a46), grey = lin(0x8f8a80);
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], nx = nor[i * 3], ny = nor[i * 3 + 1], nz = nor[i * 3 + 2];
      const streak = smooth(0.45, 0.8, fbm3(x * 0.9 + z * 0.7, y * 0.18, z * 0.9 - x * 0.3)), band = 0.5 + 0.5 * Math.sin(y * 3.1 + fbm3(x * 0.5, 0, z * 0.5) * 6);
      c.copy(cream).lerp(grey, 0.35 * smooth(0.4, 0.7, fbm3(x * 0.3, y * 0.3, z * 0.3))).lerp(rust, streak * (0.55 + 0.35 * band));
      if (ny < -0.45) c.lerp(roof, 0.5);
      if (ny > 0.55) c.lerp(mud, smooth(0.55, 0.85, ny)); else { const f = caveFloor(x, z); if (f !== null && y < f + 0.5) c.lerp(wet, 0.5); }
      c.toArray(col, i * 3); ao[i] = bake(x, y, z, nx, ny, nz, glow);
    }
    rockGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); rockGeo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    rockGeo.setAttribute('color', new THREE.BufferAttribute(col, 3)); rockGeo.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 3)); rockGeo.setAttribute('ao', new THREE.BufferAttribute(ao, 1));
    rockGeo.computeBoundingSphere();
  }
  const rockMat = caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0, envMapIntensity: 0.5, side: THREE.DoubleSide }));
  const rock = new THREE.Mesh(rockGeo, rockMat); rock.receiveShadow = true; group.add(rock);

  /* ---- formations: one mesh, the pool's mirror image another ---- */
  const fp = [], fn = [], fc = [], mp = [], mn = [], mc = [];
  const put = (g, colourFn, mirrorY) => {
    const p = g.index ? g.toNonIndexed() : g; p.computeVertexNormals(); const a = p.attributes.position, nn = p.attributes.normal, c = new THREE.Color();
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i), y = a.getY(i), z = a.getZ(i); colourFn(c, x, y, z);
      fp.push(x, y, z); fn.push(nn.getX(i), nn.getY(i), nn.getZ(i)); fc.push(c.r, c.g, c.b);
      if (mirrorY !== undefined) { mp.push(x, 2 * mirrorY - y, z); mn.push(nn.getX(i), -nn.getY(i), nn.getZ(i)); mc.push(c.r * 0.8, c.g * 0.8, c.b * 0.85); }
    }
    if (mirrorY !== undefined) for (let i = mp.length - a.count * 3; i < mp.length; i += 9) { for (let k = 0; k < 3; k++) { const t = mp[i + 3 + k]; mp[i + 3 + k] = mp[i + 6 + k]; mp[i + 6 + k] = t; const u = mn[i + 3 + k]; mn[i + 3 + k] = mn[i + 6 + k]; mn[i + 6 + k] = u; const w = mc[i + 3 + k]; mc[i + 3 + k] = mc[i + 6 + k]; mc[i + 6 + k] = w; } }   // (mirrored: the winding back)
  };
  const dripstone = (len, r, seed, down) => {   // a lathe: thick at the root, ringed, a fine tip; y from 0 (root) to len
    const pts = []; for (let i = 0; i <= 9; i++) { const t = i / 9, rr = r * (1 - t) ** 0.8 * (1 + 0.12 * Math.sin(t * 20 + seed)) + 0.006; pts.push(new THREE.Vector2(rr, t * len)); }
    const g = new THREE.LatheGeometry(pts, 7); if (down) g.rotateX(Math.PI); return g;
  };
  const tone = (c, t, base, tip) => c.copy(lin(base)).lerp(lin(tip), t);
  const ceilingAt = (x, z, f, top) => { for (let y = f + 0.6; y < f + top + 1.5; y += 0.06) if (field(x, y, z) > 0) return y; return null; };
  const pool = CAVERNS.halls[0].pool;
  {
    let n = 0;
    const place = (x, z, f, top, dense) => {
      const cy = ceilingAt(x, z, f, top); if (cy === null) return;
      const room = cy - f, k = n++, len = (0.25 + 1.4 * hash(k, 1) ** 1.6) * Math.min(1, room / 4), r = 0.05 + 0.13 * hash(k, 2) * (len / 1.6);
      const inPool = pool && Math.hypot((x - pool.x) / pool.rx, (z - pool.z) / pool.rz) < 1.0;
      if (room < 2.4 && hash(k, 3) < 0.5 && !inPool) {   // a column, floor to roof
        const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, w = 0.18 + 0.1 * Math.abs(Math.sin(t * 7 + k)) + 0.22 * (Math.abs(t - 0.5) * 2) ** 3; pts.push(new THREE.Vector2(w * (0.8 + 0.5 * hash(k, 4)), f - 0.1 + t * (room + 0.3))); }
        const g = new THREE.LatheGeometry(pts, 9); g.translate(x, 0, z); put(g, (c, px, py) => tone(c, smooth(-0.2, 0.9, Math.sin(py * 4 + k)), 0xd8c6a2, 0xb07040)); return;
      }
      const g = dripstone(len, r, k, true); g.translate(x, cy + 0.12, z);
      put(g, (c, px, py) => tone(c, clamp((cy - py) / len), 0xcfb58c, hash(k, 6) < 0.3 ? 0xf1e8d6 : 0xb66c3c), inPool ? pool.y : undefined);
      if (dense) for (let q = 0; q < 3; q++) { const sx = x + (hash(k, 10 + q) - 0.5) * 0.5, sz = z + (hash(k, 20 + q) - 0.5) * 0.5, s = dripstone(0.12 + 0.35 * hash(k, 30 + q), 0.012, k + q, true); s.translate(sx, cy + 0.05, sz); put(s, c => c.copy(lin(0xeee4d0)), inPool ? pool.y : undefined); }   // soda straws
      if (!inPool && hash(k, 7) < 0.55 && room > 1.8) { const hgt = (0.2 + 0.9 * hash(k, 8)) * Math.min(1, room / 4.5), m = dripstone(hgt, r * 1.6 + 0.05, k + 3, false); m.translate(x + 0.03, f - 0.05, z); put(m, (c, px, py) => tone(c, clamp((py - f) / hgt), 0x9a7a58, 0xd8c4a0)); }
    };
    for (const h of CAVERNS.halls) {
      const N = h.name === 'hall' ? 300 : 110;
      for (let i = 0; i < N; i++) { const a = hash(i, h.x) * Math.PI * 2, rr = Math.sqrt(hash(i, h.z)) * 0.93, x = h.x + Math.cos(a) * rr * h.rx, z = h.z + Math.sin(a) * rr * h.rz, f = caveFloor(x, z); place(x, z, f === null ? h.floor : f, h.h, hash(i, 9) < 0.25); }
    }
    const tun = CAVERNS.tubes.find(t => t.name === 'tunnel');
    for (let i = 0; i < 70; i++) { const s = hash(i, 41) * tun.len; let acc = 0; for (let j = 1; j < tun.pts.length; j++) { const a = tun.pts[j - 1], b = tun.pts[j], L = b[3] - a[3]; if (s <= acc + L) { const u = (s - acc) / L, dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), off = (hash(i, 42) - 0.5) * 1.6; place(a[0] + dx * u - dz / l * off, a[1] + dz * u + dx / l * off, a[2] + (b[2] - a[2]) * u, tun.h, false); break; } acc += L; } }
    // draperies: banded curtains hanging along the great hall's walls (orange and cream, like bacon)
    const hall = CAVERNS.halls[0];
    for (let d = 0; d < 9; d++) {
      const a0 = d / 9 * Math.PI * 2 + 0.4, qx = Math.cos(a0), qz = Math.sin(a0), bx = hall.x + qx * hall.rx * 0.66, bz = hall.z + qz * hall.rz * 0.66, f = caveFloor(bx, bz) ?? hall.floor, cy = ceilingAt(bx, bz, f, hall.h); if (cy === null) continue;
      const tx = -qz, tz = qx, W = 1.2 + hash(d, 50), hang = Math.min(2.2, (cy - f) * 0.55), M = 18, pa = [], idx = [];
      for (let i = 0; i <= M; i++) { const t = i / M, ww = (t - 0.5) * W, wav = 0.09 * Math.sin(t * 22 + d), low = hang * (0.55 + 0.45 * Math.sin(t * Math.PI) * (0.7 + 0.3 * Math.sin(t * 9 + d)));
        pa.push(bx + tx * ww + qx * wav, cy + 0.1, bz + tz * ww + qz * wav, bx + tx * ww + qx * wav, cy - low, bz + tz * ww + qz * wav); }
      for (let i = 0; i < M; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pa, 3)); g.setIndex(idx);
      put(g, (c, px, py, pz) => tone(c, 0.5 + 0.5 * Math.sin(((px - bx) * tx + (pz - bz) * tz) * 26), 0xe6d7b8, 0xa4552c));
    }
    // flowstone: rounded mounds at the foot of the walls
    for (let i = 0; i < 26; i++) {
      const h = CAVERNS.halls[i % 2], a = hash(i, 60) * Math.PI * 2, w = wallOut(h.x, h.floor + 0.3, h.z, Math.cos(a), Math.sin(a)), f = caveFloor(w[0] - Math.cos(a) * 0.5, w[2] - Math.sin(a) * 0.5) ?? h.floor;
      const g = new THREE.IcosahedronGeometry(0.5 + 0.5 * hash(i, 61), 2); g.scale(1.3, 0.55, 1); const p = g.attributes.position; for (let k = 0; k < p.count; k++) { const e = 1 + 0.18 * Math.sin(p.getX(k) * 9 + i) * Math.sin(p.getZ(k) * 8); p.setXYZ(k, p.getX(k) * e, p.getY(k) * e, p.getZ(k) * e); }
      g.translate(w[0], f + 0.05, w[2]); put(g, (c, px, py) => tone(c, smooth(f, f + 0.6, py), 0x8f6a48, 0xd9c09a));
    }
  }
  const bakeGeo = (P, N, C) => { const g = new THREE.BufferGeometry(), glow = [], ao = new Float32Array(P.length / 3);
    for (let i = 0; i < P.length; i += 3) ao[i / 3] = bake(P[i], P[i + 1], P[i + 2], N[i], N[i + 1], N[i + 2], glow);
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 3)); g.setAttribute('ao', new THREE.BufferAttribute(ao, 1)); g.computeBoundingSphere(); return g; };
  const formMat = caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0, envMapIntensity: 0.4, side: THREE.DoubleSide }));
  const forms = new THREE.Mesh(bakeGeo(fp, fn, fc), formMat); group.add(forms);
  const mirror = mp.length ? new THREE.Mesh(bakeGeo(mp, mn, mc), formMat) : null; if (mirror) group.add(mirror);
  // the pool: still dark water over its deep basin; the mirrored formations show through it
  { const g = new THREE.CircleGeometry(1, 40); g.rotateX(-Math.PI / 2); g.scale(pool.rx * 1.12, 1, pool.rz * 1.12); g.translate(pool.x, pool.y, pool.z);
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x0c1a1c, roughness: 0.02, metalness: 0.6, transparent: true, opacity: 0.55, envMapIntensity: 0.3, depthWrite: false })); m.renderOrder = 2; group.add(m); }

  /* ---- the crystals: glowing prisms in clusters, with soft halos ---- */
  const cp2 = [], cc2 = [], halo = [], haloC = [];
  crystalsAt.forEach(([x, y, z, ci, sz], k) => {
    const col = lin(CL.crystals[ci]), n = Math.round(5 + 6 * sz);
    for (let i = 0; i < n; i++) {
      const hgt = (0.12 + 0.35 * hash(k, i)) * sz, r = (0.025 + 0.03 * hash(i, k)) * sz, g = new THREE.CylinderGeometry(r, r, hgt, 6, 1); const tip = new THREE.ConeGeometry(r, r * 2.6, 6); tip.translate(0, hgt / 2 + r * 1.3, 0);
      for (const part of [g, tip]) { part.translate(0, hgt / 2, 0); part.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler((hash(i, k + 1) - 0.5) * 1.3, hash(i, k + 2) * 6.28, (hash(i, k + 3) - 0.5) * 1.3))); part.translate(x + (hash(i, k + 4) - 0.5) * 0.3 * sz, y, z + (hash(i, k + 5) - 0.5) * 0.3 * sz);
        const p = part.toNonIndexed().attributes.position; for (let v = 0; v < p.count; v++) { cp2.push(p.getX(v), p.getY(v), p.getZ(v)); const t = clamp((p.getY(v) - y) / (hgt + 0.1)); cc2.push(col.r * (0.6 + 0.8 * t), col.g * (0.6 + 0.8 * t), col.b * (0.6 + 0.8 * t)); } }
    }
    halo.push(x, y + 0.25 * sz, z); haloC.push(col.r, col.g, col.b);
  });
  const cg2 = new THREE.BufferGeometry(); cg2.setAttribute('position', new THREE.Float32BufferAttribute(cp2, 3)); cg2.setAttribute('color', new THREE.Float32BufferAttribute(cc2, 3));
  const crystals = new THREE.Mesh(cg2, new THREE.MeshBasicMaterial({ vertexColors: true })); group.add(crystals);
  const hg = new THREE.BufferGeometry(); hg.setAttribute('position', new THREE.Float32BufferAttribute(halo, 3)); hg.setAttribute('color', new THREE.Float32BufferAttribute(haloC, 3));
  const halos = new THREE.Points(hg, new THREE.PointsMaterial({ map: ctx.tex.softDot, vertexColors: true, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  halos.frustumCulled = false; group.add(halos);

  /* ---- the old paintings on the crystal chamber's west wall ---- */
  const art = paintingsTexture();
  { const C = CAVERNS.halls[1], AU = 26, AV = 10, ap = [], auv = [], aidx = [], agl = [], aao = [];
    for (let j = 0; j <= AV; j++) for (let i = 0; i <= AU; i++) {
      const a = Math.PI - 0.5 + i / AU * 1.0, y = C.floor + 0.9 + j / AV * 1.4, w = wallOut(C.x, y, C.z, Math.cos(a), Math.sin(a));
      ap.push(w[0], w[1], w[2]); auv.push(1 - i / AU, j / AV); aao.push(bake(w[0], w[1], w[2], -Math.cos(a), 0, -Math.sin(a), agl));
    }
    for (let j = 0; j < AV; j++) for (let i = 0; i < AU; i++) { const k = (a, b) => b * (AU + 1) + a; aidx.push(k(i, j), k(i + 1, j + 1), k(i + 1, j), k(i, j), k(i, j + 1), k(i + 1, j + 1)); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(ap, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(auv, 2)); g.setAttribute('glow', new THREE.Float32BufferAttribute(agl, 3)); g.setAttribute('ao', new THREE.Float32BufferAttribute(aao, 1)); g.setIndex(aidx); g.computeVertexNormals();
    const m = new THREE.Mesh(g, caveLit(new THREE.MeshStandardMaterial({ map: art, transparent: true, roughness: 0.95, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }))); m.renderOrder = 1; group.add(m); }

  /* ---- the star carved over the first ramp's arch (Captain Elias's clue, app/bottles.js) ---- */
  { const T = CAVERNS.tubes.find(t => t.name === 'rampA'); let at = null;
    for (let s = 0.5; s < T.len; s += 0.1) { let acc = 0; for (let j = 1; j < T.pts.length; j++) { const a = T.pts[j - 1], b = T.pts[j], L = b[3] - a[3]; if (s <= acc + L) { const u = (s - acc) / L, x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u, fl = a[2] + (b[2] - a[2]) * u; if (fl + T.h < H(x, z) - 0.25) at = { x, z, fl, dx: (b[0] - a[0]) / L, dz: (b[1] - a[1]) / L }; break; } acc += L; } if (at) break; }
    if (at) { const y = Math.min(at.fl + T.h + 0.35, H(at.x, at.z) - 0.25), m = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), new THREE.MeshStandardMaterial({ map: starTexture(), transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4 }));
      m.position.set(at.x - at.dx * 0.45, y, at.z - at.dz * 0.45); m.lookAt(m.position.x - at.dx, y, m.position.z - at.dz); group.add(m); }
  }

  /* ---- bats: a body and two wings that beat (in the vertex shader), each on its own loop ---- */
  const batGeo = (() => { const p = [], w = [];
    const push = (x, y, z, s) => { p.push(x, y, z); w.push(s); };
    for (const s of [-1, 1]) { push(0.05, 0, 0, 0); push(-0.07, 0, 0, 0); push(-0.02, 0.01, s * 0.2, s); push(0.05, 0, 0, 0); push(-0.02, 0.01, s * 0.2, s); push(0.03, 0, s * 0.16, s); push(-0.07, 0, 0, 0); push(-0.06, 0, s * 0.13, s); push(-0.02, 0.01, s * 0.2, s); }
    const body = new THREE.SphereGeometry(0.035, 6, 4); body.scale(1.6, 0.8, 0.8); const bp = body.toNonIndexed().attributes.position; for (let i = 0; i < bp.count; i++) { p.push(bp.getX(i), bp.getY(i), bp.getZ(i)); w.push(0); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3)); g.setAttribute('wing', new THREE.Float32BufferAttribute(w, 1)); g.computeVertexNormals(); return g; })();
  const batU = { uTime: { value: 0 } };
  const batMat = new THREE.MeshBasicMaterial({ color: 0x1a1411, side: THREE.DoubleSide });
  batMat.onBeforeCompile = s => { s.uniforms.uTime = batU.uTime; s.vertexShader = 'uniform float uTime; attribute float wing; attribute float aPhase;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
    float fl = sin(uTime * 17.0 + aPhase) * 0.9, zz = transformed.z;   // both wings up and down about the body
    transformed.z = zz * cos(fl); transformed.y += abs(zz) * sin(fl);`); };
  batMat.customProgramCacheKey = () => 'bats';
  const NB = CL.bats, bats = new THREE.InstancedMesh(batGeo, batMat, NB); bats.frustumCulled = false; group.add(bats);
  bats.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(NB).map((_, i) => hash(i, 70) * 6.28), 1));
  const tunnel = CAVERNS.tubes.find(t => t.name === 'tunnel'), batPlan = Array.from({ length: NB }, (_, i) => ({ kind: i % 4 === 3 ? 'tunnel' : i % 3 === 2 ? 1 : 0, ph: hash(i, 71) * 6.28, sp: 0.35 + 0.3 * hash(i, 72), r: 0.4 + 0.35 * hash(i, 73) }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), bp = V(0, 0, 0), bq = V(0, 0, 0), one = V(1, 1, 1);
  const batPos = (b, t, out) => {
    if (b.kind === 'tunnel') {   // back and forth along the tunnel under its roof
      const u = (Math.sin(t * b.sp * 0.5 + b.ph) * 0.5 + 0.5) * tunnel.len; let acc = 0;
      for (let j = 1; j < tunnel.pts.length; j++) { const a = tunnel.pts[j - 1], c = tunnel.pts[j], L = c[3] - a[3]; if (u <= acc + L || j === tunnel.pts.length - 1) { const k = clamp((u - acc) / L); out.set(a[0] + (c[0] - a[0]) * k + Math.sin(t * 2.3 + b.ph) * 0.3, a[2] + (c[2] - a[2]) * k + 2.0 + 0.25 * Math.sin(t * 3.1 + b.ph), a[1] + (c[1] - a[1]) * k + Math.cos(t * 1.9 + b.ph) * 0.3); return; } acc += L; }
    }
    const h = CAVERNS.halls[b.kind], w = t * b.sp + b.ph;
    out.set(h.x + Math.cos(w) * h.rx * b.r + Math.sin(w * 2.7) * 0.4, h.floor + h.h * 0.55 + 0.6 * Math.sin(w * 1.7), h.z + Math.sin(w) * h.rz * b.r + Math.cos(w * 2.3) * 0.4);
  };

  /* ---- showing it, drips and squeaks ---- */
  const cam = camera.position, mouthXZ = CAVERNS.mouths.map(m => V(m.x, 0, m.z));
  const inside = () => underground(cam.x, cam.z, cam.y - 1.55);
  const lava = createLavaTube(ctx);   // Ember Rock's lava tube (world/layout.js LAVA_TUBE)
  const dressing = [dressMouths(ctx, CAVERNS, false), dressMouths(ctx, LAVA_TUBE, true)];   // rocks and ferns hiding the trenches' edges
  let next = 2, squeak = 5; const drip = V(0, 0, 0);
  return {
    group, rock, forms, crystals, halos, bats, inside, lava, dressing, stats: { fieldMs: Math.round(built), totalMs: Math.round(performance.now() - t0), rockTris: pos.length / 9 },
    update(dt, t) {
      lava.update(t);
      const ins = inside();
      group.visible = ins || mouthXZ.some(m => Math.hypot(m.x - cam.x, m.z - cam.z) < CL.near) || (cam.x > B.x0 && cam.x < B.x1 && cam.z > B.z0 && cam.z < B.z1 && cam.y < H(cam.x, cam.z) + 0.5);
      if (!group.visible) return;
      batU.uTime.value = t;
      for (let i = 0; i < NB; i++) {
        const b = batPlan[i]; batPos(b, t, bp); batPos(b, t + 0.05, bq);
        e.set(0, Math.atan2(-(bq.z - bp.z), bq.x - bp.x), 0.3 * Math.sin(t * 3 + b.ph)); q.setFromEuler(e); m4.compose(bp, q, one); bats.setMatrixAt(i, m4);
      }
      bats.instanceMatrix.needsUpdate = true;
      if (!ins) return;
      if ((next -= dt) <= 0) {   // a drip, somewhere near
        next = 1.2 + Math.random() * 3.5; drip.set(cam.x + (Math.random() - 0.5) * 6, cam.y - 1.3, cam.z + (Math.random() - 0.5) * 6);
        const v = voice(ambience, camera, drip, 9, 0.6); if (v) { const f = 1400 + Math.random() * 900; v.tone(f, f * 0.55, 0.12, 0.35, 0, 'sine'); v.tone(f * 1.5, f * 0.8, 0.08, 0.08, 0.02, 'sine'); }
      }
      if ((squeak -= dt) <= 0) {   // a bat's squeak
        squeak = 4 + Math.random() * 7; batPos(batPlan[Math.floor(Math.random() * NB)], t, drip);
        const v = voice(ambience, camera, drip, 14, 0.35); if (v) { for (let k = 0; k < 3; k++) v.tone(6200 + Math.random() * 1500, 4800, 0.03, 0.12, k * 0.07, 'sine'); }
      }
    },
  };
}

/**
 * Where a cave's ramp is cut into the ground, its edges hidden the way a real cave mouth is: boulders half sunk along the
 * rims of the open trench, bigger ones framing the portal where the ramp goes under the ground (and one over it), and
 * ferns leaning over the edges between them (limestone and ferns at home, black basalt on Ember Rock). The entrance's
 * corridor stays clear; none is solid (the one over the portal is over the tunnel). One mesh for the rocks, one for the ferns. No random numbers (hashes).
 */
function dressMouths(ctx, C, basalt) {
  const { scene } = ctx, rocks = [], ferns = [], sd = C.box.x0 * 7.1 + C.box.z0 * 3.3;
  const addRock = (x, z, sz, k, lift = 0, sink = true) => {
    const g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position, ph = hash(k, sd) * 40;
    for (let i = 0; i < p.count; i++) { const a = p.getX(i), b = p.getY(i), c = p.getZ(i), f = 1 + 0.13 * Math.sin(a * 3.1 + b * 3.7 + c * 2.9 + ph) + 0.05 * Math.sin(a * 7 - c * 6 + ph) - 0.12 * Math.max(0, b - 0.4); p.setXYZ(i, a * f, b * f, c * f); }   // (a little flattened on top)
    g.scale(sz * (1.05 + 0.4 * hash(k, sd + 1)), sz * (0.62 + 0.25 * hash(k, sd + 2)), sz); g.rotateY(hash(k, sd + 3) * 6.28); let gy = H(x, z); if (sink) for (let q = 0; q < 8; q++) gy = Math.min(gy, H(x + Math.cos(q * 0.785) * sz, z + Math.sin(q * 0.785) * sz)); g.translate(x, gy - sz * 0.22 + lift, z); g.computeVertexNormals();   // (sunk to the lowest ground under it: none hangs over a slope)
    const n = g.attributes.normal, q = g.attributes.position, col = new Float32Array(p.count * 3), cc = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const px = q.getX(i), py = q.getY(i), pz = q.getZ(i), up = n.getY(i);
      if (basalt) cc.copy(lin(0x1c1a19)).lerp(lin(0x3a2c26), smooth(0.4, 0.8, fbm3(px * 1.4, py * 1.4, pz * 1.4)) * 0.6);
      else { cc.copy(lin(0x6e685c)).lerp(lin(0x4f4b44), smooth(0.35, 0.75, fbm3(px * 1.2, py * 1.2, pz * 1.2))).lerp(lin(0x7a6a52), 0.3 * smooth(0.5, 0.8, fbm3(px * 3, py * 3, pz * 3))); cc.lerp(lin(0x3f5724), smooth(0.2, 0.7, up) * smooth(0.25, 0.6, fbm3(px * 2.1, py * 2.1, pz * 2.1)) * 0.95); cc.multiplyScalar(0.8 + 0.2 * smooth(-0.6, 0.6, up)); }
      cc.multiplyScalar(0.85 + 0.25 * vnoise3(px * 6, py * 6, pz * 6)).toArray(col, i * 3); }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); rocks.push(g.index ? g.toNonIndexed() : g);
  };
  const addFern = (x, z, sz, k, lean) => {   // a clump of fronds, fanned out, leaning over the edge
    const y = H(x, z) - 0.02, n = 5 + Math.floor(hash(k, sd + 7) * 3);
    for (let i = 0; i < n; i++) { const a = i / n * 6.28 + hash(k, i) * 0.6, tilt = 0.55 + 0.35 * hash(i, k), s = sz * (0.7 + 0.4 * hash(k, i + 9));
      const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt + (Math.cos(a - lean) > 0.3 ? 0.35 : 0), a, 0, 'YXZ')), new THREE.Vector3(s * 0.55, s, s)); ferns.push(m); } };
  let k = 0;
  for (const t of C.tubes) if (t.stairs) {
    const top = t.pts[0][2] > t.pts[t.pts.length - 1][2] ? 0 : t.len;   // the mouth's end
    let portal = null;
    for (let s = 0; s <= t.len; s += 0.55) {
      let acc = 0, a = null, b = null; for (let j = 1; j < t.pts.length; j++) { const L = t.pts[j][3] - t.pts[j - 1][3]; if (s <= acc + L || j === t.pts.length - 1) { a = t.pts[j - 1]; b = t.pts[j]; break; } acc += L; }
      const u = clamp((s - acc) / (b[3] - a[3])), x = a[0] + (b[0] - a[0]) * u, z = a[1] + (b[1] - a[1]) * u, fl = a[2] + (b[2] - a[2]) * u, dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz), nx = -dz / l, nz = dx / l;
      const open = fl + t.h > H(x, z) - 0.3, fromTop = Math.abs(s - top);
      if (!open) { if (!portal && fromTop > 1) portal = { x, z, fl, nx, nz, dx: dx / l * (top === 0 ? 1 : -1), dz: dz / l * (top === 0 ? 1 : -1) }; continue; }   // (d: on into the hill)
      if (fromTop < 0.4) { if (fromTop < 0.28) for (const side of [-1, 1]) { k++; const off = t.w + 0.45; addRock(x + nx * side * off - (top === 0 ? dx : -dx) / l * 0.35, z + nz * side * off - (top === 0 ? dz : -dz) / l * 0.35, 0.5 + 0.2 * hash(k, sd + 12), k); if (!basalt) addFern(x + nx * side * (off + 0.8), z + nz * side * (off + 0.8), 0.7, k + 80, 0); } continue; }   // (the way in stays clear; stones at its corners)
      for (const side of [-1, 1]) { k++; const off = t.w + 0.25 + 0.3 * hash(k, sd + 4), px = x + nx * side * off, pz = z + nz * side * off;
        addRock(px, pz, 0.32 + 0.4 * hash(k, sd + 5), k);
        if (!basalt && hash(k, sd + 6) < 0.7) { const fo = off + 0.55 + 0.3 * hash(k, sd + 8); addFern(x + nx * side * fo, z + nz * side * fo, 0.55 + 0.35 * hash(k, sd + 10), k, Math.atan2(-nz * side, -nx * side)); } }
    }
    if (portal) {   // big stones either side of where it goes under, one over it, ferns round them
      const P = portal;
      const big = basalt ? 1.35 : 1;   // (on a steep slope the cut is bigger: bigger stones)
      for (const side of [-1, 1]) { k++; addRock(P.x + P.nx * side * (t.w + 0.55) - P.dx * 0.3, P.z + P.nz * side * (t.w + 0.55) - P.dz * 0.3, (0.9 + 0.3 * hash(k, sd + 11)) * big, k); if (!basalt) addFern(P.x + P.nx * side * (t.w + 1.5), P.z + P.nz * side * (t.w + 1.5), 0.8, k + 50, 0); }
      k++; addRock(P.x + P.dx * (basalt ? 0.3 : 0.6), P.z + P.dz * (basalt ? 0.3 : 0.6), basalt ? 1.15 : 1.25, k, basalt ? -0.45 : 0.15, false);   // (over the roofed part: the opening shows under it)   // (the lintel: on the ground at its middle, over the opening)
      if (!basalt) for (let i = 0; i < 3; i++) addFern(P.x + P.dx * (1.4 + 0.3 * i) + P.nx * (i - 1) * 0.9, P.z + P.dz * (1.4 + 0.3 * i) + P.nz * (i - 1) * 0.9, 0.7, k + 60 + i, Math.atan2(-P.dz, -P.dx));
    }
  }
  const out = { rocks: rocks.length, ferns: ferns.length };
  if (rocks.length) { const g = mergeRocks(rocks), m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: basalt ? 0.7 : 0.88, metalness: 0 })); m.castShadow = true; m.receiveShadow = true; scene.add(m); out.rockMesh = m; }
  if (ferns.length) {
    let fs = 7 + Math.round(Math.abs(sd)); const rng = () => { fs = (fs * 16807) % 2147483647; return (fs - 1) / 2147483646; };
    const tex = fernTexture(rng), mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, envMapIntensity: 0.6 });
    const im = new THREE.InstancedMesh(fernGeometry(), mat, ferns.length); ferns.forEach((m, i) => im.setMatrixAt(i, m)); im.castShadow = true; im.receiveShadow = true;
    im.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.45 }); scene.add(im); out.fernMesh = im;
  }
  return out;
}
function mergeRocks(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3), Cc = new Float32Array(n * 3); let o = 0;
  for (const g of list) { P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); Cc.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(N, 3)); g.setAttribute('color', new THREE.BufferAttribute(Cc, 3)); g.computeBoundingSphere(); return g;
}

/**
 * Ember Rock's lava tube (LAVA_TUBE in world/layout.js): the same kind of rock mesh as the caverns, in basalt: black and
 * dark grey, rusty red where it oxidised, glassy on the floor; lit by the lava pond in the chamber (baked, orange), the
 * daylight reaching in at the mouth. The pond's surface: a crust that drifts and cracks over glowing melt (its own
 * shader), a soft halo over it, a few lava drips hanging from the roof. Drawn near its mouth or inside.
 */
function createLavaTube(ctx) {
  const { scene, camera } = ctx, T = LAVA_TUBE, B = T.box, group = new THREE.Group(); scene.add(group);
  const t0 = performance.now(), { pos, nor, Hat } = polygonise(B, CAVE_LOOK.step), hall = T.halls[0], pool = hall.pool;
  const mouths = T.mouths.map(m => V(m.x, H(m.x, m.z), m.z));
  const sources = [[pool.x, pool.y + 0.5, pool.z, lin(0xff6a1e), 9.0, 4.2], [pool.x, pool.y + 2.4, pool.z, lin(0xff8a3a), 3.0, 6.0]];
  const bake = (x, y, z, nx, ny, nz, glowOut) => {
    let r = 0, g = 0, b = 0;
    for (const [sx, sy, sz, c, I, R] of sources) { const dx = sx - x, dy = sy - y, dz = sz - z, d = Math.hypot(dx, dy, dz); if (d > R * 3) continue;
      const k = I / (1 + (d / R) * (d / R) * 4) * (0.3 + 0.7 * Math.max(0, (dx * nx + dy * ny + dz * nz) / (d || 1))); r += c.r * k; g += c.g * k; b += c.b * k; }
    glowOut.push(Math.min(r, 6), Math.min(g, 3), Math.min(b, 1.5));
    let ao = 0.03; for (const m of mouths) { const d = Math.hypot(m.x - x, m.y - y, m.z - z); ao = Math.max(ao, Math.pow(clamp(1.15 - d / 6), 2)); }
    if (y > Hat(x, z) - 1.6 && caveOpen(x, z)) ao = Math.max(ao, 0.8);
    return ao;
  };
  const geo = new THREE.BufferGeometry(); {
    const n = pos.length / 3, col = new Float32Array(n * 3), glow = [], ao = new Float32Array(n), c = new THREE.Color();
    const black = lin(0x2c2826), grey = lin(0x55504a), rust = lin(0x7a3a26), glass = lin(0x1c1a1a);
    for (let i = 0; i < n; i++) {
      const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2], ny = nor[i * 3 + 1];
      c.copy(black).lerp(grey, smooth(0.35, 0.75, fbm3(x * 0.5, y * 0.5, z * 0.5))).lerp(rust, 0.7 * smooth(0.55, 0.85, fbm3(x * 1.3 + 4, y * 0.4, z * 1.3)));
      if (ny > 0.55) c.lerp(glass, 0.6);                                                                          // the floor: glassy, ropey
      if (Math.abs(ny) < 0.4) c.lerp(grey, 0.25 * (0.5 + 0.5 * Math.sin(y * 9 + fbm3(x, 0, z) * 4)));           // bands on the walls (the old flow lines)
      c.toArray(col, i * 3); ao[i] = bake(x, y, z, nor[i * 3], ny, nor[i * 3 + 2], glow);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3)); geo.setAttribute('glow', new THREE.Float32BufferAttribute(glow, 3)); geo.setAttribute('ao', new THREE.BufferAttribute(ao, 1)); geo.computeBoundingSphere();
  }
  const rock = new THREE.Mesh(geo, caveLit(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05, envMapIntensity: 0.4, side: THREE.DoubleSide }))); rock.receiveShadow = true; group.add(rock);
  // the pond: crust and melt
  const pondU = { uTime: U.uTime };
  const pondMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  pondMat.onBeforeCompile = sh => { sh.uniforms.uTime = pondU.uTime;
    sh.vertexShader = 'varying vec2 vP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vP = position.xz;');
    sh.fragmentShader = 'uniform float uTime; varying vec2 vP;\n float lh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }\n float ln(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }\n' + sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
      vec2 q = vP * 2.2 + vec2(uTime * 0.05, uTime * 0.03);
      float n = ln(q) * 0.55 + ln(q * 2.3 - uTime * 0.08) * 0.3 + ln(q * 5.1 + uTime * 0.1) * 0.15;
      float crack = smoothstep(0.42, 0.5, n) * (1.0 - smoothstep(0.5, 0.6, n)) + smoothstep(0.62, 0.8, n);   // bright seams between drifting plates
      float pulse = 0.85 + 0.15 * sin(uTime * 1.3 + n * 6.0);
      vec3 crust = vec3(0.09, 0.05, 0.04), melt = vec3(1.0, 0.42, 0.08), hot = vec3(1.0, 0.85, 0.45);
      vec3 cc = mix(crust, melt * pulse, clamp(crack, 0.0, 1.0)); cc = mix(cc, hot, smoothstep(0.8, 0.95, n));
      vec4 diffuseColor = vec4(cc, 1.0);`); };
  pondMat.customProgramCacheKey = () => 'lavaPond';
  { const g = new THREE.CircleGeometry(1, 48); g.rotateX(-Math.PI / 2); g.scale(pool.rx * 1.1, 1, pool.rz * 1.1); g.translate(pool.x, pool.y, pool.z); group.add(new THREE.Mesh(g, pondMat)); }
  // a soft glow over it; lava drips from the roof above it
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctx.tex.softDot, color: 0xff7a2a, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.position.set(pool.x, pool.y + 0.6, pool.z); halo.scale.set(4.2, 2.6, 1); group.add(halo);
  { const dp = [], dc = [];
    for (let i = 0; i < 26; i++) { const a = hash(i, 91) * Math.PI * 2, rr = Math.sqrt(hash(i, 92)) * 0.9, x = hall.x + Math.cos(a) * rr * hall.rx, z = hall.z + Math.sin(a) * rr * hall.rz;
      let cy = null; for (let y = hall.floor + 0.8; y < hall.floor + hall.h + 1.2; y += 0.06) if (field(x, y, z) > 0) { cy = y; break; } if (cy === null) continue;
      const len = 0.08 + 0.35 * hash(i, 93), g = new THREE.ConeGeometry(0.03 + 0.04 * hash(i, 94), len, 6); g.rotateX(Math.PI); g.translate(x, cy - len / 2 + 0.05, z);
      const p = g.toNonIndexed().attributes.position, near = Math.hypot(x - pool.x, z - pool.z) < 2.5;
      for (let v = 0; v < p.count; v++) { dp.push(p.getX(v), p.getY(v), p.getZ(v)); const t = clamp((cy - p.getY(v)) / len); const c = near ? lin(0x2a1a14).lerp(lin(0xff5a1a), t * t) : lin(0x221e1c).lerp(lin(0x4a3a34), t); dc.push(c.r, c.g, c.b); } }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(dc, 3)); group.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true }))); }
  const cam = camera.position, mouthXZ = T.mouths.map(m => V(m.x, 0, m.z));
  return {
    group, rock, stats: { ms: Math.round(performance.now() - t0), rockTris: pos.length / 9 },
    update(t) {
      group.visible = mouthXZ.some(m => Math.hypot(m.x - cam.x, m.z - cam.z) < CAVE_LOOK.near) || (cam.x > B.x0 && cam.x < B.x1 && cam.z > B.z0 && cam.z < B.z1 && cam.y < H(cam.x, cam.z) + 0.5);
      if (group.visible) halo.material.opacity = 0.38 + 0.08 * Math.sin(t * 1.7);
    },
  };
}

/** The old ochre paintings: a herd of deer, hand stencils, a sun, people with bows (canvas, transparent). */
function paintingsTexture() {
  return canvasTex(512, 256, (g) => {
    g.clearRect(0, 0, 512, 256); let s = 71; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
    const ochre = a => `rgba(${150 + rnd() * 40 | 0},${60 + rnd() * 25 | 0},${30 + rnd() * 15 | 0},${a})`;
    const deer = (x, y, k, flip) => {
      g.save(); g.translate(x, y); g.scale(flip ? -k : k, k); g.fillStyle = ochre(0.8); g.strokeStyle = ochre(0.8); g.lineCap = 'round';
      g.beginPath(); g.ellipse(0, 0, 26, 11, 0, 0, 6.28); g.fill();
      g.lineWidth = 5; g.beginPath(); g.moveTo(20, -5); g.lineTo(32, -20); g.stroke(); g.beginPath(); g.ellipse(36, -22, 7, 4, -0.3, 0, 6.28); g.fill();
      g.lineWidth = 3.5; for (const lx of [-18, -12, 12, 18]) { g.beginPath(); g.moveTo(lx, 6); g.lineTo(lx + (lx > 0 ? 3 : -2), 28); g.stroke(); }
      g.lineWidth = 2; g.beginPath(); g.moveTo(33, -25); g.lineTo(28, -42); g.moveTo(30, -34); g.lineTo(22, -38); g.moveTo(37, -25); g.lineTo(42, -40); g.moveTo(40, -33); g.lineTo(48, -36); g.stroke();
      g.restore();
    };
    deer(150, 120, 1.3, false); deer(250, 100, 1.0, false); deer(330, 135, 1.15, true); deer(95, 175, 0.8, false);
    g.fillStyle = ochre(0.75); g.beginPath(); g.arc(440, 60, 22, 0, 6.28); g.fill(); g.strokeStyle = ochre(0.7); g.lineWidth = 3;
    for (let i = 0; i < 12; i++) { const a = i / 12 * 6.28; g.beginPath(); g.moveTo(440 + Math.cos(a) * 28, 60 + Math.sin(a) * 28); g.lineTo(440 + Math.cos(a) * 40, 60 + Math.sin(a) * 40); g.stroke(); }
    const hand = (x, y, k, a) => {
      g.save(); g.translate(x, y); g.rotate(a); g.scale(k, k);
      const grd = g.createRadialGradient(0, 0, 8, 0, 0, 38); grd.addColorStop(0, 'rgba(160,58,34,0.55)'); grd.addColorStop(1, 'rgba(160,58,34,0)'); g.fillStyle = grd; g.fillRect(-40, -40, 80, 80);
      g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; g.beginPath(); g.ellipse(0, 6, 11, 13, 0, 0, 6.28); g.fill();
      for (const [fx, len, fa] of [[-9, 16, -0.35], [-4, 21, -0.1], [2, 22, 0.05], [8, 19, 0.2], [13, 12, 0.8]]) { g.save(); g.translate(fx, 0); g.rotate(fa); g.beginPath(); g.ellipse(0, -len / 2, 3, len / 2, 0, 0, 6.28); g.fill(); g.restore(); }
      g.restore(); g.globalCompositeOperation = 'source-over';
    };
    hand(40, 70, 1, -0.2); hand(470, 175, 0.9, 0.3); hand(60, 215, 0.8, 0.1);
    g.strokeStyle = 'rgba(40,28,22,0.75)'; g.lineWidth = 3; g.lineCap = 'round';
    for (const [x, y] of [[380, 200], [405, 205], [425, 198]]) { g.beginPath(); g.arc(x, y - 22, 4, 0, 6.28); g.moveTo(x, y - 18); g.lineTo(x, y); g.lineTo(x - 6, y + 14); g.moveTo(x, y); g.lineTo(x + 6, y + 14); g.moveTo(x - 8, y - 12); g.lineTo(x + 9, y - 10); g.stroke(); }
  });
}
