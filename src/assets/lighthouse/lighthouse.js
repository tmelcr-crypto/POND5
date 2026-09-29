import * as THREE from 'three';
import { lin, smooth } from '../../core/math.js';
import { fbm2 } from '../../core/noise.js';
import { LIGHTHOUSE, lighthouseH, SEA_Y } from '../../world/layout.js';

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
  bands: 4, white: 0xeeebe2, red: 0x9a2a22, stone: 0x8e877b, iron: 0x2e3032, wood: 0x7a5534, roof: 0x7e1e18,
  beam: { length: 140, spread: 0.08, period: 12, opacity: 0.22, night: [0.35, 0.6] },
};
const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };

/** Collects triangles with normals and colours; geometry() makes one non-indexed BufferGeometry. */
function builder() {
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
function farFog(mat, k) {
  mat.onBeforeCompile = s => {
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

export function createLighthouse({ scene, camera, skyUniforms }) {
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
    const col = new THREE.Color(), grass = lin(0x5f7236), grass2 = lin(0x7d8a45), stone = lin(0x7e7a71), pale = lin(0x9c978c), wet = lin(0x3c3a36), sand = lin(0x8a7d62), step = lin(LK.stone);
    const colour = (x, z, h, slope) => {
      const u = L.x - x, v = Math.abs(z - L.z), cleft = u > G.u0 && u < G.u1 + 0.4 && v < G.half + 0.05, nz = fbm2(x * 0.7, z * 0.7, 2);
      if (h < SEA_Y - 0.5) return col.copy(sand).lerp(wet, smooth(SEA_Y - 2.5, SEA_Y - 0.5, h));
      if (cleft) return col.copy(step).multiplyScalar(0.85 + 0.2 * hash(Math.floor(u / 0.5), 3));
      col.copy(stone).lerp(pale, smooth(0.1, 0.5, nz + 0.2 * Math.sin(h * 6)));
      if (h < SEA_Y + 0.6) col.lerp(wet, 1 - smooth(SEA_Y - 0.1, SEA_Y + 0.6, h));
      const flat = 1 - smooth(0.35, 0.8, slope);
      if (h > L.top - 0.4) col.lerp(grass.clone().lerp(grass2, smooth(-0.3, 0.4, nz)), flat * smooth(-0.35, 0.05, fbm2(x * 0.35 + 7, z * 0.35, 2) + 0.25));
      return col;
    };
    const verts = [], nrm = [], cols = [];
    const vtx = (i, j) => {
      const x = L.x - R + i * st, z = L.z - R + j * st, h = hAt(i, j);
      const dx = hAt(Math.min(n, i + 1), j) - hAt(Math.max(0, i - 1), j), dz = hAt(i, Math.min(n, j + 1)) - hAt(i, Math.max(0, j - 1)), nn = V(-dx, 2 * st, -dz).normalize();
      const c = colour(x, z, h, Math.hypot(dx, dz) / (2 * st)); verts.push(x, h, z); nrm.push(nn.x, nn.y, nn.z); cols.push(c.r, c.g, c.b);
    };
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      if (Math.max(hAt(i, j), hAt(i + 1, j), hAt(i, j + 1), hAt(i + 1, j + 1)) < SEA_Y - 3.2) continue;   // deep under the opaque sea
      for (const [a, b] of [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]]) vtx(i + a, j + b);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
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
    const ys = [y0, T.floor + 2.1]; for (let k = 1; k < LK.bands * 2; k++) ys.push(y0 + (yT - y0) * k / (LK.bands * 2)); ys.push(yT); ys.sort((a, b) => a - b);
    for (let k = 0; k < ys.length - 1; k++) for (let i = 0; i < NA; i++) {
      const a0 = i * dA - Math.PI, a1 = a0 + dA, am = a0 + dA / 2, ya = ys[k], yb = ys[k + 1], low = yb <= T.floor + 2.1 + 1e-6 && ya >= T.floor - 0.01;
      if (low && doorAt(am, ya, true)) continue;
      const colour = lin(band((ya + yb) / 2));
      const n0 = V(Math.cos(a0), 0, Math.sin(a0)), n1 = V(Math.cos(a1), 0, Math.sin(a1));
      tower.quad(P(rO(ya), a1, ya), P(rO(ya), a0, ya), P(rO(yb), a0, yb), P(rO(yb), a1, yb), colour, [n1, n0, n0, n1]);   // outside (faces out)
      inner.quad(P(T.rIn, a0, ya), P(T.rIn, a1, ya), P(T.rIn, a1, yb), P(T.rIn, a0, yb), lin(0xe8e4da).multiplyScalar(0.9 + 0.1 * hash(i, k)), [n0.clone().negate(), n1.clone().negate(), n1.clone().negate(), n0.clone().negate()]);   // inside, whitewashed
    }
    // the ground door's reveal (sides and lintel between the inner and outer skin) and its open leaf
    for (const sgn of [-1, 1]) { const a = T.door + sgn * T.doorHalf, q = [P(T.rIn, a, T.floor), P(rO(T.floor), a, T.floor), P(rO(T.floor + 2.1), a, T.floor + 2.1), P(T.rIn, a, T.floor + 2.1)]; if (sgn > 0) q.reverse(); tower.quad(...q, lin(LK.white).multiplyScalar(0.8)); }
    { const a0 = T.door - T.doorHalf, a1 = T.door + T.doorHalf, y = T.floor + 2.1; tower.quad(P(rO(y), a0, y), P(rO(y), a1, y), P(T.rIn, a1, y), P(T.rIn, a0, y), lin(LK.white).multiplyScalar(0.75)); }
    { const hinge = P(T.rIn - 0.02, T.door + T.doorHalf, 0), leaf = new THREE.BoxGeometry(0.05, 2.05, 1.05); leaf.translate(0, T.floor + 1.03, -0.53); leaf.rotateY(-T.door + Math.PI / 2 - 1.2); leaf.translate(hinge.x, 0, hinge.z); inner.add(leaf, lin(LK.red).multiplyScalar(0.8)); }
    // slit windows: dark outside, bright inside
    for (let k = 0; k < 4; k++) {
      const a = T.door + Math.PI * 0.6 + k * 1.9, y = T.floor + 2.6 + k * 2.6, w = 0.14, h = 0.55;
      tower.quad(P(rO(y) + 0.01, a + w / 2, y - h / 2), P(rO(y) + 0.01, a - w / 2, y - h / 2), P(rO(y) + 0.01, a - w / 2, y + h / 2), P(rO(y) + 0.01, a + w / 2, y + h / 2), lin(0x1e2328));
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

  const rockMat = std({ roughness: 0.92 }), towerMat = std({ roughness: 0.7 }), innerMat = std({ roughness: 0.8, side: THREE.DoubleSide });
  const glassMat = farFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }), LK.fogK);
  const add = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = shadow; scene.add(m); return m; };
  const rockMesh = add(mergeTwo(rock.rockGeo, steps.geometry()), rockMat);
  const towerMesh = add(tower.geometry(), towerMat), glassMesh = add(glass.geometry(), glassMat, false), lens = add(lensGeo, lensMat, false);
  const inside = add(inner.geometry(), innerMat); glassMesh.renderOrder = 2; lens.renderOrder = 2;

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
    meshes: { rock: rockMesh, tower: towerMesh, glass: glassMesh, lens, inside }, beam,
    update(dt) {
      inside.visible = camera.position.distanceTo(at) < LK.near;
      const lit = smooth(B.night[0], B.night[1], skyUniforms.uNight.value);
      lensMat.emissiveIntensity = 0.1 + 2.2 * lit;
      beam.visible = lit > 0.01; beamU.uBeamA.value = B.opacity * lit; beam.rotation.y += dt * Math.PI * 2 / B.period;
    },
  };
}
/** Two vertex-coloured geometries as one. */
function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) { const x = a.attributes[k].array, y = b.attributes[k].array, o = new Float32Array(x.length + y.length); o.set(x); o.set(y, x.length); g.setAttribute(k, new THREE.BufferAttribute(o, 3)); }
  g.computeBoundingSphere(); return g;
}
