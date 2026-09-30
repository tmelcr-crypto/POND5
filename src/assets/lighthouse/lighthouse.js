import * as THREE from 'three';
import { lin, smooth } from '../../core/math.js';
import { fbm2 } from '../../core/noise.js';
import { LIGHTHOUSE, lighthouseH, SEA_Y } from '../../world/layout.js';
import { obstacles } from '../../world/bounds.js';
import { islandLife, soilAt } from '../../world/islandLife.js';
import { terrainMaterial } from '../../world/terrain.js';

/**
 * The lighthouse rock (#27; its ground, walls and stair: LIGHTHOUSE in world/layout.js): the rock with its grassy
 * plateau, the cleft of stone steps down to the landing and the jetty; the tower (white and red, a stone plinth, a
 * door on the west), inside a whitewashed shaft with a wooden spiral stair round an open well, an iron railing along
 * it, up to the lantern room: an iron-framed glass lantern round the lamp and its lens, a red roof, a door out to the
 * gallery and its railing. At night the lens glows and two soft beams turn over the sea.
 *
 * Seen from the home island it is a far thing: its materials fog at LH_LOOK.fogK of the scene's density, so it reads
 * across the water, and the interior (stair, railings, floors, lamp) is drawn only within LH_LOOK.near m. Outdoor
 * parts are few meshes (rock and jetty, tower, glass, lens); no light of its own. No random numbers (hashes only).
 */
export const LH_LOOK = {
  fogK: 0.5, near: 45,
  bands: 4, white: 0xe6e2d8, red: 0x9a2a22, stone: 0x68635a, iron: 0x2e3032, wood: 0x7a5534, roof: 0x7e1e18,
  beam: { length: 140, spread: 0.08, period: 12, opacity: 0.22, night: [0.35, 0.6] },
};
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

/** Collects triangles with normals and colours; geometry() makes one non-indexed BufferGeometry. */
export function builder() {
  const pos = [], nor = [], col = [], c = new THREE.Color();
  const B = {
    add(g, colour) {   // a three.js geometry, coloured by `colour` (hex, Color, or fn(color, x, y, z))
      const n = g.index ? g.toNonIndexed() : g; if (!n.attributes.normal) n.computeVertexNormals();
      const p = n.attributes.position, nn = n.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(nn.getX(i), nn.getY(i), nn.getZ(i));
        if (typeof colour === 'function') colour(c, p.getX(i), p.getY(i), p.getZ(i)); else c.copy(colour.isColor ? colour : lin(colour));
        col.push(c.r, c.g, c.b);
      }
      return B;
    },
    quad(a, b, cc, d, colour, ns) {   // a, b, cc, d counter-clockwise seen from the front; ns: a normal per corner (else flat)
      const n = new THREE.Vector3().crossVectors(new THREE.Vector3().subVectors(cc, a), new THREE.Vector3().subVectors(d, b)).normalize();
      const k = colour.isColor ? colour : lin(colour), vs = [a, b, cc, d], nn = ns || [n, n, n, n];
      for (const i of [0, 1, 2, 0, 2, 3]) { const v = vs[i], m = nn[i]; pos.push(v.x, v.y, v.z); nor.push(m.x, m.y, m.z); col.push(k.r, k.g, k.b); }
      return B;
    },
    geometry() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.computeBoundingSphere(); return g;
    },
  };
  return B;
}
/** The scene's fog at a fraction of its density, so the rock reads from the home island (FogExp2 only). */
export function farFog(mat, k) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (s, r) => {
    prev.call(mat, s, r);
    s.uniforms.uFogK = { value: k };
    s.fragmentShader = 'uniform float uFogK;\n' + s.fragmentShader.replace('#include <fog_fragment>', `
      #ifdef USE_FOG
        #ifdef FOG_EXP2
          float fd = fogDepth * uFogK;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, 1.0 - exp(-fogDensity * fogDensity * fd * fd));
        #endif
      #endif`);
  };
  mat.customProgramCacheKey = () => 'lhFog' + k;
  return mat;
}

export function createLighthouse(ctx) {
  const { scene, camera, skyUniforms, tex } = ctx;
  const softDot = tex.softDot;
  const L = LIGHTHOUSE, T = L.tower, S = L.stair, G = L.gully, J = L.jetty, LK = LH_LOOK;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const P = (r, a, y) => V(T.x + r * Math.cos(a), y, T.z + r * Math.sin(a));   // a point round the tower (world angle a)
  const std = (o = {}) => farFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...o }), LK.fogK);

  /* ---- the rock: a height grid over it (cells well under water left out), coloured by height and slope ---- */
  const rock = {};
  {
    const R = 24, st = 0.4, n = Math.round(2 * R / st), hs = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) hs.push(lighthouseH(L.x - R + i * st, L.z - R + j * st));
    const hAt = (i, j) => hs[j * (n + 1) + i];
    const col = new THREE.Color(), grass = lin(0x46582a), grass2 = lin(0x5e6b34), stone = lin(0x55524b), pale = lin(0x6f6a61), dark = lin(0x3b3934), wet = lin(0x2a2826), sand = lin(0x6e6350), step = lin(LK.stone);
    const colour = (x, z, h, slope) => {
      const u = L.x - x, v = Math.abs(z - L.z), cleft = u > G.u0 && u < G.u1 + 0.4 && v < G.half + 0.05, nz = fbm2(x * 0.7, z * 0.7, 2);
      if (h < SEA_Y - 0.5) return col.copy(sand).lerp(wet, smooth(SEA_Y - 2.5, SEA_Y - 0.5, h));
      if (cleft) return col.copy(step).multiplyScalar(0.85 + 0.2 * hash(Math.floor(u / 0.5), 3));
      col.copy(stone).lerp(pale, smooth(0.1, 0.5, nz + 0.25 * Math.sin(h * 5.3 + x * 0.4))).lerp(dark, 0.6 * smooth(0.3, 0.8, Math.abs(Math.sin(h * 2.7 + nz * 3))) * smooth(0.5, 1.2, slope));   // strata on the cliffs
      if (h < SEA_Y + 0.6) col.lerp(wet, 1 - smooth(SEA_Y - 0.1, SEA_Y + 0.6, h));
      const flat = 1 - smooth(0.35, 0.8, slope);
      if (h > L.top - 0.4) col.lerp(grass.clone().lerp(grass2, smooth(-0.3, 0.4, nz)), flat * smooth(-0.35, 0.05, fbm2(x * 0.35 + 7, z * 0.35, 2) + 0.25));
      return col;
    };
    const verts = [], nrm = [], cols = [], uvs = [], soil = [], site = islandLife().lighthouse;
    const vtx = (i, j) => {
      const x = L.x - R + i * st, z = L.z - R + j * st, h = hAt(i, j);
      const dx = hAt(Math.min(n, i + 1), j) - hAt(Math.max(0, i - 1), j), dz = hAt(i, Math.min(n, j + 1)) - hAt(i, Math.max(0, j - 1)), nn = V(-dx, 2 * st, -dz).normalize();
      const c = colour(x, z, h, Math.hypot(dx, dz) / (2 * st)); verts.push(x, h, z); nrm.push(nn.x, nn.y, nn.z); cols.push(c.r, c.g, c.b); uvs.push(x / 10, -z / 10); soil.push(soilAt(site, x, z) * 0.6);
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (Math.max(hAt(i, j), hAt(i + 1, j), hAt(i, j + 1), hAt(i + 1, j + 1)) < SEA_Y - 3.2) continue;   // deep under the opaque sea
      for (const [a, b] of [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]]) vtx(i + a, j + b);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('aSoil', new THREE.Float32BufferAttribute(soil, 1)); g.setAttribute('aStream', new THREE.Float32BufferAttribute(new Float32Array(soil.length), 1));
    rock.rockGeo = g;
  }
  // the cleft's steps: a slab each, crisp edges over the height grid's staircase
  const steps = builder();
  {
    const n = Math.ceil((L.top - J.deckY) / G.rise), run = (G.bottom - G.top) / n, dh = (L.top - J.deckY) / n;
    for (let k = 1; k <= n; k++) {
      const u0 = G.top + (k - 1) * run, u1 = G.top + k * run, y = L.top - k * dh, g = new THREE.BoxGeometry(u1 - u0 + 0.02, 0.3, G.half * 2 + 0.2);
      g.translate(L.x - (u0 + u1) / 2, y - 0.15 + 0.01, L.z); steps.add(g, lin(LK.stone).multiplyScalar(0.9 + 0.2 * hash(k, 1)));
    }
    const land = new THREE.BoxGeometry(G.u1 + 0.02 - G.bottom, 0.3, G.half * 2 + 0.6); land.translate(L.x - (G.bottom + G.u1) / 2, J.deckY - 0.14, L.z); steps.add(land, lin(LK.stone));
  }
  /* ---- the jetty: planks across, posts down to the sea floor, two bollards on the head ---- */
  {
    const wood = lin(LK.wood);
    for (let x = J.x0; x > J.x1 + 0.1; x -= 0.2) {
      const hw = x - 0.1 <= J.head.x0 ? J.head.halfW : J.halfW, g = new THREE.BoxGeometry(0.185, 0.05, hw * 2);
      g.translate(x - 0.1, J.deckY - 0.025, J.z); steps.add(g, wood.clone().multiplyScalar(0.8 + 0.35 * hash(Math.round(x * 5), 7)));
    }
    for (let x = J.x0 - 0.3; x > J.x1; x -= 2.2) for (const sgn of [-1, 1]) {
      const hw = x <= J.head.x0 ? J.head.halfW : J.halfW, px = x, pz = J.z + sgn * (hw - 0.08), bot = lighthouseH(px, pz) - 0.3, g = new THREE.CylinderGeometry(0.1, 0.11, J.deckY - bot, 8);
      g.translate(px, (J.deckY + bot) / 2 - 0.05, pz); steps.add(g, wood.clone().multiplyScalar(0.7));
    }
    for (const sgn of [-1, 1]) { const g = new THREE.BoxGeometry(J.x0 - J.x1, 0.12, 0.1); g.translate((J.x0 + J.x1) / 2, J.deckY - 0.1, J.z + sgn * (J.halfW - 0.05)); steps.add(g, wood.clone().multiplyScalar(0.65)); }
    for (const [bx, bz] of J.bollards) { const g = new THREE.CylinderGeometry(0.09, 0.11, 0.42, 12); g.translate(bx, J.deckY + 0.21, bz); steps.add(g, lin(LK.iron)); const t = new THREE.CylinderGeometry(0.13, 0.13, 0.05, 12); t.translate(bx, J.deckY + 0.42, bz); steps.add(t, lin(LK.iron)); }
  }

  /* ---- the tower: plinth, a banded shaft (doors cut through), the gallery, lantern frame, roof ---- */
  const tower = builder(), inner = builder(), glass = builder();
  const y0 = T.floor - 0.35, yT = T.topY, rO = y => T.rOut[0] + (T.rOut[1] - T.rOut[0]) * (y - y0) / (yT - y0);
  const band = y => (Math.floor((y - y0) / (yT - y0) * LK.bands * 2 - 1e-4) % 2 ? LK.red : LK.white);
  const doorAt = (a, y, low) => { const d = Math.abs(Math.atan2(Math.sin(a - (low ? T.door : T.topDoor)), Math.cos(a - (low ? T.door : T.topDoor)))); return d < T.doorHalf; };
  const NA = 48, dA = Math.PI * 2 / NA;
  {
    const plinth = new THREE.CylinderGeometry(T.rOut[0] + 0.25, T.rOut[0] + 0.4, T.floor - L.top + 0.9, 24); plinth.translate(T.x, (T.floor + L.top - 0.9) / 2, T.z);
    tower.add(plinth, (c, x, y, z) => c.copy(lin(LK.stone)).multiplyScalar(0.85 + 0.2 * hash(Math.floor(y * 3), Math.floor(Math.atan2(z - T.z, x - T.x) * 4))));
    // the shaft's rings: band edges and the door's lintel as ring heights
    const ys = [y0, T.floor, T.floor + 2.1]; for (let k = 1; k < LK.bands * 2; k++) ys.push(y0 + (yT - y0) * k / (LK.bands * 2)); ys.push(yT); ys.sort((a, b) => a - b);
    for (let k = 0; k < ys.length - 1; k++) for (let i = 0; i < NA; i++) {
      const a0 = i * dA - Math.PI, a1 = a0 + dA, am = a0 + dA / 2, ya = ys[k], yb = ys[k + 1], low = yb <= T.floor + 2.1 + 1e-6 && ya >= T.floor - 1e-6;
      if (low && doorAt(am, ya, true)) continue;
      const colour = lin(band((ya + yb) / 2));
      const n0 = V(Math.cos(a0), 0, Math.sin(a0)), n1 = V(Math.cos(a1), 0, Math.sin(a1));
      tower.quad(P(rO(ya), a1, ya), P(rO(ya), a0, ya), P(rO(yb), a0, yb), P(rO(yb), a1, yb), colour, [n1, n0, n0, n1]);   // outside (faces out)
      inner.quad(P(T.rIn, a0, ya), P(T.rIn, a1, ya), P(T.rIn, a1, yb), P(T.rIn, a0, yb), lin(0xe8e4da).multiplyScalar(0.9 + 0.1 * hash(i, k)), [n0.clone().negate(), n1.clone().negate(), n1.clone().negate(), n0.clone().negate()]);   // inside, whitewashed
    }
    // the ground door's reveal (sides and lintel between the inner and outer skin) and its open leaf
    for (const sgn of [-1, 1]) { const a = T.door + sgn * T.doorHalf, q = [P(T.rIn, a, T.floor), P(rO(T.floor), a, T.floor), P(rO(T.floor + 2.1), a, T.floor + 2.1), P(T.rIn, a, T.floor + 2.1)]; if (sgn > 0) q.reverse(); tower.quad(...q, lin(LK.white).multiplyScalar(0.8)); }
    { const a0 = T.door - T.doorHalf, a1 = T.door + T.doorHalf, y = T.floor + 2.1; tower.quad(P(rO(y), a0, y), P(rO(y), a1, y), P(T.rIn, a1, y), P(T.rIn, a0, y), lin(LK.white).multiplyScalar(0.75)); }
    { // the door, open inward against the wall: planks, two iron straps and a ring handle
      const ha = T.door + T.doorHalf, hinge = P(T.rIn - 0.1, ha, 0), tx = -Math.sin(ha), tz = Math.cos(ha), rot = -Math.atan2(tz, tx);
      const part = (w, h, d, x, y, z, c) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); g.rotateY(rot); g.translate(hinge.x, T.floor, hinge.z); inner.add(g, c); };
      for (let i = 0; i < 5; i++) part(0.19, 2.02, 0.05, 0.1 + i * 0.2, 1.01, 0, lin(LK.red).multiplyScalar(0.72 + 0.12 * hash(i, 9)));
      for (const y of [0.35, 1.7]) part(0.98, 0.07, 0.07, 0.5, y, 0.03, lin(LK.iron));
      const ring = new THREE.TorusGeometry(0.05, 0.01, 6, 14); ring.translate(0.85, 1.0, 0.06); ring.rotateY(rot); ring.translate(hinge.x, T.floor, hinge.z); inner.add(ring, lin(0xb08a3a));
    }
    { // outside: a stone surround and a little slate canopy over the door, a brass plate beside it
      const out = (g, a, r, y) => { g.rotateY(Math.PI / 2 - a); const p = P(r, a, y); g.translate(p.x, p.y, p.z); return g; };
      const sr = lin(LK.stone).multiplyScalar(1.15);
      for (const sgn of [-1, 1]) tower.add(out(new THREE.BoxGeometry(0.16, 2.2, 0.12), T.door + sgn * (T.doorHalf + 0.03), rO(T.floor + 1) + 0.03, T.floor + 1.1), sr);
      tower.add(out(new THREE.BoxGeometry(1.55, 0.18, 0.14), T.door, rO(T.floor + 2.2) + 0.04, T.floor + 2.2), sr);
      tower.add(out(new THREE.BoxGeometry(1.8, 0.08, 0.14), T.door, rO(T.floor) + 0.05, T.floor + 0.02), sr);   // the threshold
      for (const sgn of [-1, 1]) { const g = new THREE.BoxGeometry(0.95, 0.05, 0.62); g.rotateZ(-sgn * 0.42); g.translate(sgn * 0.42, 0, 0.26); tower.add(out(g, T.door, rO(T.floor + 2.6) + 0.02, T.floor + 2.62), lin(0x3d4146)); }   // the canopy's two slopes
      tower.add(out(new THREE.BoxGeometry(0.26, 0.18, 0.02), T.door + T.doorHalf + 0.16, rO(T.floor + 1.5) + 0.01, T.floor + 1.5), lin(0xb08a3a));
    }
    // slit windows: dark outside, bright inside
    for (let k = 0; k < 4; k++) {
      const a = T.door + Math.PI * 0.6 + k * 1.9, y = T.floor + 2.6 + k * 2.6, w = 0.14, h = 0.55;
      tower.quad(P(rO(y) + 0.01, a + w / 2, y - h / 2), P(rO(y) + 0.01, a - w / 2, y - h / 2), P(rO(y) + 0.01, a - w / 2, y + h / 2), P(rO(y) + 0.01, a + w / 2, y + h / 2), lin(0x1e2328));
      for (const [fw, fh, dy] of [[0.4, 0.06, h / 2 + 0.03], [0.4, 0.07, -h / 2 - 0.035]]) { const g = new THREE.BoxGeometry(fw, fh, 0.08); g.rotateY(Math.PI / 2 - a); const q = P(rO(y) + 0.02, a, y + dy); g.translate(q.x, q.y, q.z); tower.add(g, lin(LK.white)); }   // sill and head
    }
    // the gallery: a ring deck with its railing; the lantern room's parapet, its door, the iron frame and the roof
    for (let i = 0; i < NA; i++) {
      const a0 = i * dA - Math.PI, a1 = a0 + dA;
      tower.quad(P(T.rIn - 0.02, a0, yT + 0.01), P(T.rIn - 0.02, a1, yT + 0.01), P(T.gallery, a1, yT + 0.01), P(T.gallery, a0, yT + 0.01), lin(0x55585a));           // deck
      tower.quad(P(T.gallery, a1, yT - 0.12), P(T.gallery, a0, yT - 0.12), P(T.gallery, a0, yT + 0.01), P(T.gallery, a1, yT + 0.01), lin(LK.iron));                 // its edge
      tower.quad(P(T.rOut[1], a1, yT - 0.12), P(T.rOut[1], a0, yT - 0.12), P(T.gallery, a0, yT - 0.12), P(T.gallery, a1, yT - 0.12), lin(0x3a3c3e));               // under it
      if (!doorAt(a0 + dA / 2, 0, false)) {
        tower.quad(P(T.rIn, a1, yT), P(T.rIn, a0, yT), P(T.rIn, a0, yT + 0.9), P(T.rIn, a1, yT + 0.9), lin(LK.white));          // the parapet, outside
        inner.quad(P(T.rIn - 0.08, a0, yT), P(T.rIn - 0.08, a1, yT), P(T.rIn - 0.08, a1, yT + 0.9), P(T.rIn - 0.08, a0, yT + 0.9), lin(0xe8e4da));
        glass.quad(P(T.rIn - 0.04, a1, yT + 0.9), P(T.rIn - 0.04, a0, yT + 0.9), P(T.rIn - 0.04, a0, yT + 2.5), P(T.rIn - 0.04, a1, yT + 2.5), lin(0xcfe0e6));
      }
      tower.quad(P(T.rIn + 0.02, a1, yT + 0.9), P(T.rIn + 0.02, a0, yT + 0.9), P(T.rIn - 0.1, a0, yT + 0.92), P(T.rIn - 0.1, a1, yT + 0.92), lin(LK.iron));           // sill
    }
    for (let i = 0; i < 12; i++) {   // the lantern's mullions
      const a = i * Math.PI / 6 + 0.13; if (doorAt(a, 0, false) && Math.abs(Math.atan2(Math.sin(a - T.topDoor), Math.cos(a - T.topDoor))) < T.doorHalf - 0.05) continue;
      const g = new THREE.BoxGeometry(0.06, 1.6, 0.06); g.translate(0, yT + 1.7, 0); g.rotateY(-a); const p = P(T.rIn - 0.03, a, 0); g.translate(p.x, 0, p.z); tower.add(g, lin(LK.iron));
    }
    for (const [yy, r] of [[yT + 2.5, T.rIn + 0.05], [yT + 1.7, T.rIn - 0.02]]) { const g = new THREE.TorusGeometry(r, 0.04, 6, 40); g.rotateX(Math.PI / 2); g.translate(T.x, yy, T.z); tower.add(g, lin(LK.iron)); }
    { const g = new THREE.ConeGeometry(T.rIn + 0.3, 1.35, 40, 1); g.translate(T.x, yT + 2.5 + 0.675, T.z); tower.add(g, lin(LK.roof)); const b = new THREE.SphereGeometry(0.2, 12, 8); b.translate(T.x, yT + 3.95, T.z); tower.add(b, lin(LK.iron)); const rod = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6); rod.translate(T.x, yT + 4.5, T.z); tower.add(rod, lin(LK.iron)); }
    // the gallery railing: posts and two rails
    for (let i = 0; i < 36; i++) { const a = i * Math.PI / 18, p = P(T.gallery - 0.06, a, 0), g = new THREE.CylinderGeometry(0.022, 0.022, 1.0, 5); g.translate(p.x, yT + 0.5, p.z); tower.add(g, lin(LK.iron)); }
    for (const yy of [yT + 0.5, yT + 1.0]) { const g = new THREE.TorusGeometry(T.gallery - 0.06, 0.025, 5, 60); g.rotateX(Math.PI / 2); g.translate(T.x, yy, T.z); tower.add(g, lin(LK.iron)); }
  }
  /* ---- inside: the ground floor, the spiral stair, its railing along the well, the lantern room's floor, the lamp ---- */
  {
    const flag = (c, x, y, z) => c.copy(lin(0x9a948a)).multiplyScalar(0.8 + 0.25 * hash(Math.floor(x * 2.2), Math.floor(z * 2.2)));
    const fl = new THREE.CircleGeometry(T.rIn, 32); fl.rotateX(-Math.PI / 2); fl.translate(T.x, T.floor, T.z); inner.add(fl, flag);
    const N = S.perTurn, dS = Math.PI * 2 / N, wood = lin(LK.wood);
    for (let k = 0; k < S.turns; k++) for (let i = 0; i < N; i++) {
      const a0 = S.a0 + i * dS, a1 = a0 + dS, y = T.floor + S.rise * (k + (i + 1) / N), shade = wood.clone().multiplyScalar(0.8 + 0.3 * hash(i, k));
      const q = (r0, r1, aa, ab, ya, yb, up) => { const A = P(r0, aa, ya), B = P(r1, aa, ya), C = P(r1, ab, yb), D = P(r0, ab, yb); if (up) inner.quad(A, D, C, B, shade); else inner.quad(A, B, C, D, shade); };
      q(S.r0, S.r1 + 0.05, a0, a1, y, y, true);                                                    // the tread
      q(S.r0, S.r1 + 0.05, a0, a1, y - 0.07, y - 0.07, false);                                     // its underside
      inner.quad(P(S.r0, a0, y), P(S.r1 + 0.05, a0, y), P(S.r1 + 0.05, a0, y - S.rise / N), P(S.r0, a0, y - S.rise / N), shade.clone().multiplyScalar(0.8));   // the riser
      inner.quad(P(S.r0, a1, y), P(S.r0, a0, y), P(S.r0, a0, y - 0.07), P(S.r0, a1, y - 0.07), shade.clone().multiplyScalar(0.7));                             // the inner edge
      const bp = P(S.r0 + 0.04, a0 + dS / 2, 0), bal = new THREE.CylinderGeometry(0.015, 0.015, 0.9, 5); bal.translate(bp.x, y + 0.45, bp.z); inner.add(bal, lin(LK.iron));   // a baluster
    }
    // the handrail: a helix over the balusters, from the first step to the top
    const pts = []; for (let t = 0; t <= S.turns * N; t += 0.25) { const a = S.a0 + t * dS, p = P(S.r0 + 0.04, a, T.floor + S.rise * (t + 0.5) / N + 0.9); pts.push(p); }
    inner.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), S.turns * N * 3, 0.025, 5, false), lin(LK.iron));
    // the lantern room's floor, open over the last of the stair (as towerSurfaces in world/layout.js)
    for (let i = 0; i < 64; i++) {
      const a0 = i * Math.PI / 32, a1 = a0 + Math.PI / 32, am = (a0 + a1) / 2, s = (((am - S.a0) / (Math.PI * 2)) % 1 + 1) % 1, rr = s > 0.3 ? S.r0 - 0.1 : T.rIn;
      inner.quad(P(0, a0, T.topY), P(0, a1, T.topY), P(rr, a1, T.topY), P(rr, a0, T.topY), lin(0x6e5a44));
      inner.quad(P(rr, a0, T.topY - 0.1), P(rr, a1, T.topY - 0.1), P(0, a1, T.topY - 0.1), P(0, a0, T.topY - 0.1), lin(0xd8d4ca));
      if (s > 0.3 && s < 0.9) {   // the opening's railing
        const bp = P(S.r0 - 0.12, am, 0), g = new THREE.CylinderGeometry(0.018, 0.018, 1.0, 5); g.translate(bp.x, T.topY + 0.5, bp.z); inner.add(g, lin(LK.iron));
      }
    }
    { const pts2 = []; for (let t = 0.3; t <= 0.9; t += 0.01) pts2.push(P(S.r0 - 0.12, S.a0 + t * Math.PI * 2, T.topY + 1.0)); inner.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts2), 40, 0.025, 5, false), lin(LK.iron)); }
    // the lamp: an iron pedestal (the lens on it is its own mesh)
    const ped = new THREE.CylinderGeometry(0.3, 0.42, 0.85, 16); ped.translate(T.x, T.topY + 0.425, T.z); inner.add(ped, lin(LK.iron));
  }
  // the lens: stacked glass prisms round a lamp, glowing at night
  const lensGeo = (() => { const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12, y = t * 1.1; pts.push(new THREE.Vector2(0.42 + 0.06 * Math.sin(t * Math.PI) + 0.025 * (i % 2), y)); } const g = new THREE.LatheGeometry(pts, 24); g.translate(T.x, T.topY + 0.85, T.z); return g; })();
  const lensMat = farFog(new THREE.MeshStandardMaterial({ color: 0xd8ecef, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.75, emissive: new THREE.Color(1, 0.85, 0.55), emissiveIntensity: 0 }), LK.fogK);

  /* ---- near things (drawn within LK.near): the flagstone path, a bench facing home, a life ring and an anchor by the
     door, barrels, a crate and a coil of rope on the jetty, a table with the keeper's log inside; the lamps ---- */
  const deco = builder(), lamps = builder(), glowAt = [];
  const block = (w, h, d, x, y, z, c, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.rotateY(ry); g.translate(x, y, z); deco.add(g, c); };
  const cyl = (r0, r1, h, x, y, z, c, seg = 12) => { const g = new THREE.CylinderGeometry(r0, r1, h, seg); g.translate(x, y, z); deco.add(g, c); };
  const solid = [];   // (x, z, r) you walk round (world/bounds.js obstacles)
  {
    // flagstones from the head of the steps to the door
    const x0 = L.x - G.u0 + 0.2, x1 = T.x - T.rOut[0] - 0.45;
    for (let x = x0, k = 0; x < x1; x += 0.62, k++) for (const dz of [-0.33, 0.33]) {
      const sx = x + (k % 2) * 0.15 + (dz > 0 ? 0.08 : 0), sz = L.z + dz + 0.05 * Math.sin(k * 2.1), y = lighthouseH(sx, sz);
      block(0.56, 0.06, 0.6, sx, y + 0.02, sz, lin(LK.stone).multiplyScalar(0.9 + 0.3 * hash(k, dz * 10)), 0.1 * (hash(k, 3) - 0.5));
    }
    // a bench west of the tower, facing home across the water
    { const bx = L.x - 2.2, bz = L.z - 3.1, y = lighthouseH(bx, bz), wood = lin(LK.wood).multiplyScalar(1.1);
      block(0.45, 0.05, 1.5, bx, y + 0.45, bz, wood); block(0.06, 0.45, 1.5, bx + 0.22, y + 0.72, bz, wood);
      for (const dz of [-0.62, 0.62]) { block(0.4, 0.45, 0.06, bx, y + 0.22, bz + dz, wood.clone().multiplyScalar(0.7)); block(0.06, 0.95, 0.06, bx + 0.22, y + 0.48, bz + dz, wood.clone().multiplyScalar(0.7)); }
      solid.push([bx, bz - 0.4, 0.4], [bx, bz + 0.4, 0.4]); }
    // the life ring on the tower wall (red and white quarters) and an anchor leaning on the plinth
    { const a = T.door - 0.75, y = T.floor + 1.45, g = new THREE.TorusGeometry(0.24, 0.06, 8, 24);
      g.translate(0, 0, 0.06); g.rotateY(Math.PI / 2 - a); const q = P(rO(y) + 0.02, a, y); g.translate(q.x, q.y, q.z);
      deco.add(g, (c, x, yy, z) => { const u = Math.atan2(yy - y, (x - q.x) * Math.sin(a) - (z - q.z) * Math.cos(a)); c.copy(lin(Math.floor((u + Math.PI) / (Math.PI / 2)) % 2 ? LK.red : LK.white)); }); }
    { const a = T.door + 0.8, q = P(T.rOut[0] + 0.62, a, 0), y = lighthouseH(q.x, q.z), iron = lin(0x3a3634);
      const sh = new THREE.CylinderGeometry(0.035, 0.035, 1.1, 8); sh.translate(0, 0.55, 0); sh.rotateZ(0.32); sh.rotateY(Math.PI / 2 - a); sh.translate(q.x, y, q.z); deco.add(sh, iron);
      const arm = new THREE.TorusGeometry(0.32, 0.035, 6, 16, Math.PI); arm.rotateZ(Math.PI); arm.translate(0, 0.3, 0); arm.rotateZ(0.32); arm.rotateY(Math.PI / 2 - a); arm.translate(q.x, y, q.z); deco.add(arm, iron);
      const stock = new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6); stock.rotateX(Math.PI / 2); stock.translate(0, 1.0, 0); stock.rotateZ(0.32); stock.rotateY(Math.PI / 2 - a); stock.translate(q.x, y, q.z); deco.add(stock, lin(LK.wood));
      solid.push([q.x, q.z, 0.35]); }
    // on the jetty: two barrels and a crate at the head (north side, clear of the berth), a coil of rope by the bollards
    { const y = J.deckY, zN = J.z + J.head.halfW - 0.4;
      for (const [x, k] of [[J.x1 + 0.6, 0], [J.x1 + 1.25, 1]]) { cyl(0.26, 0.24, 0.72, x, y + 0.36, zN, lin(0x6a4a2e).multiplyScalar(0.9 + 0.2 * k), 14); for (const dy of [0.12, 0.6]) cyl(0.265, 0.265, 0.04, x, y + dy, zN, lin(LK.iron)); solid.push([x, zN, 0.3]); }
      block(0.55, 0.45, 0.55, J.x1 + 1.95, y + 0.225, zN + 0.05, lin(0x8a6a44), 0.3); solid.push([J.x1 + 1.95, zN + 0.05, 0.35]);
      for (let i = 0; i < 4; i++) { const g = new THREE.TorusGeometry(0.2 - i * 0.015, 0.025, 6, 20); g.rotateX(Math.PI / 2); g.translate(J.bollards[0][0] + 0.6, y + 0.03 + i * 0.045, J.bollards[0][1] + 0.35); deco.add(g, lin(0xc9b98f)); } }
    // inside, by the wall opposite the door: a small table with the keeper's log and an oil can, a stool
    { const a = T.door + Math.PI, q = P(0.55, a + 0.2, 0), y = T.floor, wood = lin(LK.wood);
      block(0.7, 0.04, 0.5, q.x, y + 0.74, q.z, wood, Math.PI / 2 - a); for (const [dx, dz] of [[-0.3, -0.2], [0.3, -0.2], [-0.3, 0.2], [0.3, 0.2]]) { const g = new THREE.BoxGeometry(0.04, 0.72, 0.04); g.translate(dx, 0.36, dz); g.rotateY(Math.PI / 2 - a); g.translate(q.x, y, q.z); deco.add(g, wood.clone().multiplyScalar(0.8)); }
      const book = new THREE.BoxGeometry(0.26, 0.04, 0.34); book.rotateY(0.3); book.translate(q.x, y + 0.78, q.z); deco.add(book, lin(0x3a2a4a));
      cyl(0.05, 0.07, 0.16, q.x + 0.2, y + 0.84, q.z - 0.12, lin(0x8a8a82));
      cyl(0.16, 0.16, 0.04, q.x + 0.35 * Math.cos(a + 1.2), y + 0.45, q.z + 0.35 * Math.sin(a + 1.2), wood); cyl(0.03, 0.03, 0.45, q.x + 0.35 * Math.cos(a + 1.2), y + 0.22, q.z + 0.35 * Math.sin(a + 1.2), wood.clone().multiplyScalar(0.7), 6); }
    // the weather vane on the roof (always drawn, with the tower)
    { const y = yT + 4.2; const arrow = new THREE.BoxGeometry(0.9, 0.03, 0.04); arrow.translate(T.x, y + 0.25, T.z); tower.add(arrow, lin(LK.iron));
      const tail = new THREE.BoxGeometry(0.02, 0.22, 0.18); tail.translate(T.x - 0.42, y + 0.3, T.z); tower.add(tail, lin(LK.iron));
      for (const r of [0, Math.PI / 2]) { const c = new THREE.BoxGeometry(0.6, 0.02, 0.02); c.rotateY(r); c.translate(T.x, y, T.z); tower.add(c, lin(LK.iron)); } }
  }
  // the lamps: small lanterns (unlit glass by day, glowing at night): over the door, on the jetty's post, along the stair
  const lantern = (x, y, z, hang) => {
    const f = lin(LK.iron), g1 = new THREE.BoxGeometry(0.16, 0.02, 0.16); g1.translate(x, y + 0.13, z); deco.add(g1, f);
    const cap = new THREE.ConeGeometry(0.13, 0.1, 4); cap.rotateY(Math.PI / 4); cap.translate(x, y + 0.19, z); deco.add(cap, f);
    const base = new THREE.BoxGeometry(0.14, 0.02, 0.14); base.translate(x, y - 0.13, z); deco.add(base, f);
    const pane = new THREE.BoxGeometry(0.12, 0.24, 0.12); pane.translate(x, y, z); lamps.add(pane, lin(0xffd08a));
    if (hang) { const h = new THREE.CylinderGeometry(0.01, 0.01, hang, 4); h.translate(x, y + 0.2 + hang / 2, z); deco.add(h, f); }
    glowAt.push(x, y, z);
  };
  { const q = P(rO(T.floor + 2.35) + 0.25, T.door + T.doorHalf + 0.22, T.floor + 2.3); lantern(q.x, q.y, q.z); const arm = new THREE.BoxGeometry(0.3, 0.03, 0.03); arm.rotateY(Math.PI / 2 - (T.door + T.doorHalf + 0.22)); arm.translate((q.x + P(rO(q.y), T.door + T.doorHalf + 0.22, 0).x) / 2, q.y + 0.2, (q.z + P(rO(q.y), T.door + T.doorHalf + 0.22, 0).z) / 2); deco.add(arm, lin(LK.iron)); }
  { const px = J.x1 + 0.2, pz = J.z - J.head.halfW + 0.15; cyl(0.05, 0.06, 2.3, px, J.deckY + 1.15, pz, lin(LK.iron), 8); const arm = new THREE.BoxGeometry(0.03, 0.03, 0.35); arm.translate(px, J.deckY + 2.28, pz + 0.17); deco.add(arm, lin(LK.iron)); lantern(px, J.deckY + 2.0, pz + 0.33, 0.1); }
  for (let k = 0; k < S.turns - 1; k++) {   // one a turn, on the wall 2.1 m over the tread below it
    const a = S.a0 + 1.1 + k * 2.4, s = (((a - S.a0) / (Math.PI * 2)) % 1 + 1) % 1, q = P(T.rIn - 0.14, a, T.floor + S.rise * (k + s) + 2.1); lantern(q.x, q.y, q.z);
  }
  { const q = P(T.rIn - 0.14, T.door + Math.PI * 0.5, T.floor + 2.2); lantern(q.x, q.y, q.z); }
  /* ---- foliage on the plateau and the ledges: sea thrift in flower, a few low junipers (near only; the grass, the
     wind-bent spruces, the boulders and ferns: world/islandLife.js) ---- */
  const spots = [];
  {
    const clear = (x, z) => {
      if (Math.hypot(x - T.x, z - T.z) < T.rOut[0] + 0.8) return false;                                       // the tower and plinth
      const u = L.x - x, v = Math.abs(z - L.z); if (u > G.u0 - 1.5 && v < G.half + 0.5) return false;           // the cleft
      if (x > L.x - G.u0 && x < T.x && v < 0.75) return false;                                                 // the flagstones
      return !solid.some(([sx, sz, r]) => Math.hypot(x - sx, z - sz) < r + 0.15);
    };
    for (let i = 0; i < 3200; i++) {
      const a = hash(i, 1) * Math.PI * 2, r = Math.sqrt(hash(i, 2)) * 12.5, x = L.x + Math.cos(a) * r, z = L.z + Math.sin(a) * r, h = lighthouseH(x, z);
      const sl = Math.hypot(lighthouseH(x + 0.3, z) - lighthouseH(x - 0.3, z), lighthouseH(x, z + 0.3) - lighthouseH(x, z - 0.3)) / 0.6;
      if (h < SEA_Y + 1.2 || sl > (h > L.top - 0.5 ? 0.6 : 0.35) || !clear(x, z)) continue;   // the plateau, and flat ledges on the cliffs
      spots.push([x, h, z, hash(i, 3), hash(i, 4)]);
    }
  }
  const thrift = (() => { const b = builder(); const cushion = new THREE.SphereGeometry(0.1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2); cushion.scale(1, 0.6, 1); b.add(cushion, lin(0x3f5028));
    for (let k = 0; k < 6; k++) { const a = k * 1.1, rr = 0.03 + 0.05 * hash(k, 8), x = Math.cos(a) * rr, z = Math.sin(a) * rr, h = 0.12 + 0.06 * hash(k, 9);
      const st = new THREE.CylinderGeometry(0.004, 0.004, h, 3); st.translate(x, h / 2, z); b.add(st, lin(0x55623a));
      const fl = new THREE.SphereGeometry(0.022, 6, 4); fl.translate(x, h, z); b.add(fl, lin(k % 2 ? 0xe07fa8 : 0xd46a98)); }
    return b.geometry(); })();
  const juniper = (() => { const b = builder(); for (let k = 0; k < 6; k++) { const g = new THREE.IcosahedronGeometry(0.28 + 0.1 * hash(k, 10), 1); g.scale(1.2, 0.55, 1); g.translate(Math.cos(k * 1.3) * 0.3, 0.12 + 0.04 * (k % 3), Math.sin(k * 1.3) * 0.25); b.add(g, (c, x, y, z) => c.copy(lin(0x2f4424)).lerp(lin(0x4e6634), 0.5 + 0.5 * Math.sin(x * 23 + y * 31 + z * 17))); } return b.geometry(); })();
  const scatterIM = (geo, list, mat, sMin, sMax) => {
    const im = new THREE.InstancedMesh(geo, mat, list.length), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    list.forEach(([x, h, z, a, b], i) => { const sc = sMin + (sMax - sMin) * b; e.set(0, a * 6.28, 0); q.setFromEuler(e); m4.compose(V(x, h - 0.02, z), q, V(sc, sc * (0.8 + 0.4 * a), sc)); im.setMatrixAt(i, m4); });
    im.instanceMatrix.needsUpdate = true; im.castShadow = false; im.receiveShadow = true; scene.add(im); return im;
  };
  const thriftSpots = spots.filter((p, i) => i % 5 === 0 && p[1] > L.top - 0.5 && p[3] < 0.45);
  const junSpots = spots.filter((p, i) => i % 5 === 0 && p[3] > 0.93).slice(0, 9);
  const thrifts = scatterIM(thrift, thriftSpots.slice(0, 70), std({ roughness: 0.8 }), 0.8, 1.3);
  const junipers = scatterIM(juniper, junSpots, std({ roughness: 0.95 }), 0.7, 1.2); junipers.castShadow = true;
  junSpots.forEach(([x, , z]) => solid.push([x, z, 0.4]));
  for (const [x, z, r] of solid) obstacles.add(x, z, r, L.top + 3);

  const rockMat = std({ roughness: 0.92 }), towerMat = std({ roughness: 0.7 }), innerMat = std({ roughness: 0.8, side: THREE.DoubleSide });
  const glassMat = farFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }), LK.fogK);
  const add = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = shadow; scene.add(m); return m; };
  const rockMesh = add(rock.rockGeo, farFog(terrainMaterial(ctx, { rock: 0x5a564e, dirt: 0x3d3528, sand: 0x6e6350, wetSand: 0x2a2826, rockSlope: 0.72 }), LK.fogK)), stepMesh = add(steps.geometry(), rockMat);
  const towerMesh = add(tower.geometry(), towerMat), glassMesh = add(glass.geometry(), glassMat, false), lens = add(lensGeo, lensMat, false);
  const inside = add(inner.geometry(), innerMat); glassMesh.renderOrder = 2; lens.renderOrder = 2;
  const decoMesh = add(deco.geometry(), std({ roughness: 0.8 }));
  const lampMat = farFog(new THREE.MeshBasicMaterial({ vertexColors: true }), LK.fogK), lampMesh = add(lamps.geometry(), lampMat, false);
  // their glow at night: soft additive sprites, one draw
  const glowGeo = new THREE.BufferGeometry(); glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowAt, 3));
  const glowMat = new THREE.PointsMaterial({ map: softDot, color: 0xffc070, size: 1.1, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
  const glow = new THREE.Points(glowGeo, glowMat); glow.frustumCulled = false; scene.add(glow);
  innerMat.emissive = new THREE.Color(1, 0.72, 0.42);   // the lamps' warm light on the whitewash at night (no light of their own)
  const near = [inside, decoMesh, lampMesh, glow, thrifts, junipers];

  /* ---- the beams: two soft additive cones back to back, turning about the lamp ---- */
  const B = LK.beam, beamU = { uBeamA: { value: 0 } };
  const beamGeo = new THREE.ConeGeometry(B.length * Math.tan(B.spread), B.length, 16, 1, true); beamGeo.translate(0, -B.length / 2, 0); beamGeo.rotateZ(Math.PI / 2);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: beamU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying float vAlong; void main() { vAlong = clamp(position.x / ' + B.length.toFixed(1) + ', 0.0, 1.0); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uBeamA; varying float vAlong; void main() { gl_FragColor = vec4(vec3(1.0, 0.93, 0.75) * uBeamA * (1.0 - vAlong) * (1.0 - vAlong) * smoothstep(0.0, 0.03, vAlong), 1.0); }',
  });
  const beam = new THREE.Group(); beam.position.set(T.x, T.topY + 1.4, T.z);
  const b1 = new THREE.Mesh(beamGeo, beamMat), b2 = new THREE.Mesh(beamGeo, beamMat); b2.rotation.y = Math.PI; beam.add(b1, b2); beam.visible = false; scene.add(beam);
  [b1, b2].forEach(m => { m.frustumCulled = false; m.renderOrder = 3; });

  const at = new THREE.Vector3(T.x, T.floor, T.z);
  return {
    meshes: { rock: rockMesh, steps: stepMesh, tower: towerMesh, glass: glassMesh, lens, inside }, beam,
    update(dt) {
      const isNear = camera.position.distanceTo(at) < LK.near; near.forEach(o => { o.visible = isNear; });
      const lit = smooth(B.night[0], B.night[1], skyUniforms.uNight.value);
      lampMat.color.setScalar(0.45 + 1.1 * lit); glowMat.opacity = 0.75 * lit; glow.visible = isNear && lit > 0.02; innerMat.emissiveIntensity = 0.05 * lit;
      lensMat.emissiveIntensity = 0.1 + 2.2 * lit;
      beam.visible = lit > 0.01; beamU.uBeamA.value = B.opacity * lit; beam.rotation.y += dt * Math.PI * 2 / B.period;
    },
  };
}
