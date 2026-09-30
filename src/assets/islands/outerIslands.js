import * as THREE from 'three';
import { lin, smooth, clamp } from '../../core/math.js';
import { fbm2 } from '../../core/noise.js';
import { ISLANDS, islandH, MARSH_POOL, SEA_Y } from '../../world/layout.js';
import { obstacles } from '../../world/bounds.js';
import { isTouch } from '../../core/env.js';
import { U } from '../../core/uniforms.js';
import { builder, farFog } from '../lighthouse/lighthouse.js';
import { islandLife, soilAt, ihash as hash } from '../../world/islandLife.js';
import { terrainMaterial } from '../../world/terrain.js';
import { buildingPlans } from '../../world/buildingPlans.js';
import { createIslandBuildings } from './islandBuildings.js';

/**
 * The four islands round the home island (their ground, jetties and docking: ISLANDS in world/layout.js), each its own
 * place: Millholm's meadow and windmill, Palm Cay's sand, palms and stilt hut, Ember Rock's black cone, steam and
 * observatory, Heron Marsh's pools, reeds, willows and stilt lodge.
 *
 * Seen from afar each island is one mesh (ground, jetties, trees and building, vertex-coloured), plus the few parts that
 * move (the windmill's sails, the observatory's dome); all their windows are one mesh (lit at night), all shallows one
 * and all still water one. Within IL_LOOK.near m of an island its small life appears: grass, flowers, reeds, sheep,
 * herons, shells, lily pads, steam, the lava's glow. Their materials fog at IL_LOOK.fogK of the scene's density, so the
 * islands read across the sea. No random numbers (hashes only).
 */
export const IL_LOOK = { fogK: 0.5, near: 55, step: 0.5 };
const C = hex => lin(hex);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function createOuterIslands(ctx) {
  const { scene, camera, skyUniforms, tex } = ctx, life = islandLife();
  const std = (o = {}) => farFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, metalness: 0, ...o }), IL_LOOK.fogK);
  const partMat = std({ roughness: 0.75, side: THREE.DoubleSide }), nearMat = std({ roughness: 0.9, side: THREE.DoubleSide });
  const shallows = { p: [], c: [], a: [] }, water = builder(), windows = builder(), lava = builder(), glowAt = [], glowCol = [];
  const islands = [], plans = buildingPlans();
  // near a building its detailed self (assets/islands/islandBuildings.js) takes over: the cheap shell's windows and glow
  // there are dropped (a sphere round the building: uHide = centre x, z, radius; the shell itself by its draw range)
  const uHide = { value: new THREE.Vector3(0, 0, -1) };
  const hideNear = mat => { const prev = mat.onBeforeCompile; mat.onBeforeCompile = (sh, r) => { prev.call(mat, sh, r); sh.uniforms.uHide = uHide;
    sh.vertexShader = 'uniform vec3 uHide;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n { vec4 hw = modelMatrix * vec4(transformed, 1.0); if (distance(hw.xz, uHide.xy) < uHide.z) gl_Position = vec4(2.0, 2.0, 2.0, 1.0); }'); }; return mat; };
  const HIDE_R = { windmill: 2.4, hut: 2.2, observatory: 2.75, lodge: 2.9 };

  // the ground's layers in the home island's terrain shader, by kind: dirt (paths, mud, ash), rock on the slopes, sand
  const GROUND = { meadow: {}, palm: { sand: 0xe6dcbf, wetSand: 0xa89a78 }, volcano: { dirt: 0x33302d, rock: 0x3b3633, sand: 0x2e2b29, wetSand: 0x1e1c1b, rockSlope: 0.86 }, marsh: { dirt: 0x3b3222, sand: 0x8d7d5c, wetSand: 0x5a4e38 } };
  for (const I of ISLANDS) {
    const far = builder(), shell = builder(), near = builder(), moving = [], hAt = (x, z) => islandH(I, x, z), site = life.sites[ISLANDS.indexOf(I)];
    const place = (g, x, z, y = hAt(x, z), ry = 0) => { g.rotateY(ry); g.translate(x, y, z); return g; };
    const box = (b, w, h, d, x, y, z, c, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); b.add(place(g, x, z, y, ry), c); };
    const cyl = (b, r0, r1, h, x, y, z, c, seg = 10) => { const g = new THREE.CylinderGeometry(r1, r0, h, seg); g.translate(0, h / 2, 0); b.add(place(g, x, z, y), c); };
    const solid = (x, z, r) => obstacles.add(x, z, r, hAt(x, z) + 3), plan = plans[ISLANDS.indexOf(I)];

    /* ---- the ground: a height grid, coloured by the island's kind ---- */
    {
      const E = I.r * 1.45, st = IL_LOOK.step, n = Math.round(2 * E / st), hs = [];
      for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) hs.push(hAt(I.x - E + i * st, I.z - E + j * st));
      const at = (i, j) => hs[j * (n + 1) + i], col = new THREE.Color(), pos = [], nor = [], cols = [], uvs = [], soil = [];
      const K = {
        meadow: { a: C(0x5d7a32), b: C(0x86993f), sand: C(0xcdbb8e), rock: C(0x857d70) },
        palm: { a: C(0x9aa24c), b: C(0x6f8a3a), sand: C(0xeee3c8), rock: C(0xb9a98a) },
        volcano: { a: C(0x2a2624), b: C(0x4a2c24), sand: C(0x2e2b29), rock: C(0x3b3633) },
        marsh: { a: C(0x51602e), b: C(0x6b6a34), sand: C(0x8d7d5c), rock: C(0x4a4230) },
      }[I.kind];
      const colour = (x, z, h, slope) => {
        const nz = fbm2(x * 0.25 + I.s, z * 0.25, 3), s2 = Math.hypot(x - I.x, z - I.z) / I.r;
        col.copy(K.a).lerp(K.b, smooth(0.25, 0.75, nz));
        if (I.kind === 'volcano') { col.lerp(C(0x6a6460), smooth(0.35, 0.8, fbm2(x * 0.9, z * 0.9, 2)) * 0.5); if (h > I.top * 0.75) col.lerp(C(0x5b3026), 0.6); }
        if (I.kind === 'marsh') col.lerp(C(0x3b3a24), smooth(MARSH_POOL + 0.1, MARSH_POOL - 0.2, h));
        col.lerp(K.rock, smooth(0.5, 1.1, slope) * 0.8);
        const beachK = I.kind === 'palm' ? 1 - smooth(SEA_Y + 0.9, SEA_Y + 1.45, h) : 1 - smooth(SEA_Y + 0.55, SEA_Y + 1.0, h);
        col.lerp(K.sand, beachK); if (h < SEA_Y - 0.1) col.lerp(K.sand.clone().multiplyScalar(0.6), 0.7);
        void s2; return col;
      };
      const vtx = (i, j) => {
        const x = I.x - E + i * st, z = I.z - E + j * st, h = at(i, j), dx = at(Math.min(n, i + 1), j) - at(Math.max(0, i - 1), j), dz = at(i, Math.min(n, j + 1)) - at(i, Math.max(0, j - 1));
        const nn = V3(-dx, 2 * st, -dz).normalize(), c = colour(x, z, h, Math.hypot(dx, dz) / (2 * st)); pos.push(x, h, z); nor.push(nn.x, nn.y, nn.z); cols.push(c.r, c.g, c.b);
        uvs.push(x / 10, -z / 10); soil.push(soilAt(site, x, z));
      };
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        if (Math.max(at(i, j), at(i + 1, j), at(i, j + 1), at(i + 1, j + 1)) < SEA_Y - 3.2) continue;
        for (const [a, b] of [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]]) vtx(i + a, j + b);
        // the shallows: a tint over the sea where it is shallow, turquoise over sand, fading out with depth
        const cx = I.x - E + (i + 0.5) * st, cz = I.z - E + (j + 0.5) * st, d = SEA_Y - hAt(cx, cz);
        if (d > -0.05 && d < 3.2) for (const [a, b] of [[0, 0], [0, 1], [1, 1], [0, 0], [1, 1], [1, 0]]) {
          const x = I.x - E + (i + a) * st, z = I.z - E + (j + b) * st, dd = SEA_Y - hAt(x, z), k = clamp(1 - dd / 3.0), tq = I.kind === 'palm' ? C(0x47d6c8) : I.kind === 'volcano' ? C(0x3b6a6c) : C(0x4fb4a4);
          shallows.p.push(x, SEA_Y + 0.012, z); shallows.c.push(tq.r, tq.g, tq.b); shallows.a.push(0.72 * k * k * (dd < 0.15 ? 0.6 + 2.6 * Math.max(0, dd) : 1) + (dd < 0.12 && dd > -0.05 ? 0.35 : 0));
        }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); g.setAttribute('aSoil', new THREE.Float32BufferAttribute(soil, 1)); g.setAttribute('aStream', new THREE.Float32BufferAttribute(new Float32Array(soil.length), 1));
      far.groundGeo = g;
    }

    /* ---- the jetties: planks, posts, bollards (the home jetty's shape) ---- */
    for (const d of I.docks) {
      const wood = C(0x7a5534), ry = -d.ang;
      for (let u = 0; u < d.len; u += 0.2) { const w = u >= d.len - d.head.len ? d.head.halfW : d.hw, [x, z] = d.W(u + 0.1, 0), g = new THREE.BoxGeometry(0.185, 0.05, w * 2); g.rotateY(ry); g.translate(x, d.deckY - 0.05, z); far.add(g, wood.clone().multiplyScalar(0.8 + 0.35 * hash(Math.round(u * 5), d.index + I.s))); }
      for (let u = 0.3; u < d.len; u += 2.2) for (const sg of [-1, 1]) { const w = u >= d.len - d.head.len ? d.head.halfW : d.hw, [x, z] = d.W(u, sg * (w - 0.08)), bot = hAt(x, z) - 0.3, g = new THREE.CylinderGeometry(0.1, 0.11, d.deckY - bot, 8); g.translate(x, (d.deckY + bot) / 2 - 0.05, z); far.add(g, wood.clone().multiplyScalar(0.7)); }
      for (const [bx, bz] of d.bollards) { const g = new THREE.CylinderGeometry(0.09, 0.11, 0.42, 10); g.translate(bx, d.deckY + 0.21, bz); far.add(g, C(0x2e3032)); }
      const [lx, lz] = d.W(d.len - 0.25, d.head.halfW - 0.2); cyl(far, 0.05, 0.05, 2.2, lx, d.deckY, lz, C(0x2e3032), 6); box(far, 0.16, 0.24, 0.16, lx, d.deckY + 2.0, lz, C(0x2e3032)); glowAt.push(lx, d.deckY + 2.12, lz); glowCol.push(1, 0.75, 0.42);
      windows.add(new THREE.BoxGeometry(0.12, 0.18, 0.12).translate(lx, d.deckY + 2.12, lz), C(0xffd08a));
    }

    /* ---- the island's own life and building ---- */
    const { spot, top, clearOf } = site;   // the building's site and a place finder (world/islandLife.js)

    if (I.kind === 'meadow') {
      // the windmill on the hill: a whitewashed stone tower, a thatched cap, four sails that turn with the wind
      const [x, z, h] = top, faceA = Math.atan2(-z, -x), ry = -faceA + Math.PI / 2;
      const tower = new THREE.CylinderGeometry(1.55, 2.2, 7, 16, 4); tower.translate(0, 3.5, 0); shell.add(place(tower, x, z, h - 0.3), (c, px, py) => c.copy(C(0xe4ddcf)).multiplyScalar(0.9 + 0.08 * Math.sin(py * 7)));
      const base = new THREE.CylinderGeometry(2.45, 2.5, 0.6, 16); base.translate(0, 0.3, 0); shell.add(place(base, x, z, h - 0.3), C(0x8a8174));
      const cap = new THREE.ConeGeometry(1.8, 2.2, 16); cap.translate(0, 8.1, 0); shell.add(place(cap, x, z, h - 0.3), C(0x6e5a3a));
      const f = (u, y, v) => { const c = Math.cos(faceA), s = Math.sin(faceA); return [x + c * u - s * v, h - 0.3 + y, z + s * u + c * v]; };
      { const [dx, dy, dz] = f(2.02, 0, 0); const door = new THREE.BoxGeometry(0.12, 1.9, 1.0); door.translate(0, 0.95 + 0.3, 0); door.rotateY(ry + Math.PI / 2); door.translate(dx, dy, dz); shell.add(door, C(0x5a3a24)); }
      for (const [u, y, v] of [[1.83, 3.2, 0], [1.6, 5.4, 0.6], [1.7, 4.2, -0.9]]) { const [wx, wy, wz] = f(u, y, v), g = new THREE.BoxGeometry(0.1, 0.6, 0.45); g.rotateY(ry + Math.PI / 2); g.translate(wx, wy, wz); windows.add(g, C(0xffd9a0)); glowAt.push(wx, wy, wz); glowCol.push(1, 0.8, 0.5); }
      // the sails: a hub and four lattice arms with canvas, on the cap's front, turned in update()
      const sails = builder(); { const hub = new THREE.CylinderGeometry(0.22, 0.22, 0.5, 10); hub.rotateX(Math.PI / 2); sails.add(hub, C(0x3a2a1c));
        for (let k = 0; k < 4; k++) { const arm = new THREE.BoxGeometry(0.14, 5.6, 0.1); arm.translate(0, 2.9, 0); arm.rotateZ(k * Math.PI / 2); sails.add(arm, C(0x5a4028));
          const cloth = new THREE.BoxGeometry(1.0, 4.4, 0.03); cloth.translate(0.62, 3.2, -0.05); cloth.rotateZ(k * Math.PI / 2); sails.add(cloth, (c, px, py) => c.copy(C(0xefe6d2)).multiplyScalar(0.85 + 0.15 * Math.sin((px + py) * 12))); }
        // the windshaft into the cap and the brake wheel on it (seen from the loft)
        const shaft = new THREE.CylinderGeometry(0.14, 0.14, 2.3, 10); shaft.rotateX(Math.PI / 2); shaft.translate(0, 0, -1.1); sails.add(shaft, C(0x4a3424));
        const bw = new THREE.TorusGeometry(0.7, 0.07, 6, 24); bw.translate(0, 0, -1.55); sails.add(bw, C(0x7a5a3a));
        for (let k = 0; k < 4; k++) { const sp = new THREE.BoxGeometry(1.4, 0.07, 0.07); sp.rotateZ(k * Math.PI / 4); sp.translate(0, 0, -1.55); sails.add(sp, C(0x6a4a2e)); }
        for (let k = 0; k < 28; k++) { const a = k / 28 * Math.PI * 2, cog = new THREE.BoxGeometry(0.05, 0.05, 0.12); cog.translate(Math.cos(a) * 0.72, Math.sin(a) * 0.72, -1.47); sails.add(cog, C(0x3a2a1c)); } }
      const sm = new THREE.Mesh(sails.geometry(), partMat), pivot = new THREE.Group(), [px, py, pz] = f(2.15, 7.2, 0); pivot.position.set(px, py, pz); pivot.rotation.y = Math.PI / 2 - faceA; pivot.add(sm); scene.add(pivot); sm.castShadow = true;   // (the sails face out, over the jetty and home)
      moving.push({ spin: sm, axis: 'z', speed: 0.9 });   // (you walk in: world/buildingPlans.js)
      // the dry-stone walls (the trees, orchard and hedgerows: world/islandLife.js, planted by world/scatter.js and undergrowth.js)
      for (const [sx, sz, w, t] of site.walls) { for (let q = 0; q < 2; q++) { const g = new THREE.DodecahedronGeometry(0.28 + 0.1 * hash(t, q + w), 1); g.scale(1.3, 0.7, 1); g.rotateY(hash(t, w + 5) * 3); g.translate(0, 0.18 + q * 0.33, 0); far.add(place(g, sx, sz), (c, px, py, pz) => c.copy(C(0x8d8578)).multiplyScalar(0.8 + 0.4 * hash(t, q * 3 + w)).lerp(C(0x56662e), 0.55 * smooth(0.3, 0.8, fbm2(px * 4, pz * 4, 2) + (py - hAt(sx, sz) - 0.4)))); } solid(sx, sz, 0.35); }
      // sheep and wildflowers (near only)
      for (let k = 0; k < 5; k++) { const s = spot(k + 40, 0.2, 0.7, (px2, pz2) => clearOf(px2, pz2, 2)); if (s) sheep(near, s[0], s[2], s[1], hash(k, 4) * 6.28); }
    }
    if (I.kind === 'palm') {
      // the beach hut on stilts, facing the sea to the west, a hammock, palms all round
      const [x, z] = site.build, h = hAt(x, z), faceA = Math.atan2(I.z - z - 30, I.x - x - 60), ry = -faceA;
      const deck = h + 1.1, wood = C(0x8a6a44), bamboo = C(0xb8a060), thatch = C(0xc9a85e);
      for (const [u, v] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) { const px = x + Math.cos(faceA) * u - Math.sin(faceA) * v, pz = z + Math.sin(faceA) * u + Math.cos(faceA) * v; cyl(shell, 0.1, 0.09, deck - hAt(px, pz) + 2.3, px, hAt(px, pz) - 0.1, pz, bamboo, 6); }
      box(shell, 3.4, 0.12, 3.4, x, deck - 0.12, z, wood, ry);
      for (const [u, v, w, d] of [[0, -1.6, 3.2, 0.1], [-1.6, 0, 0.1, 3.2], [0, 1.6, 3.2, 0.1]]) { const px = x + Math.cos(faceA) * u - Math.sin(faceA) * v, pz = z + Math.sin(faceA) * u + Math.cos(faceA) * v; box(shell, w, 1.9, d, px, deck, pz, bamboo.clone().multiplyScalar(0.9), ry); }
      const roof = new THREE.ConeGeometry(3.0, 1.6, 4); roof.rotateY(Math.PI / 4); roof.translate(0, deck + 2.7, 0); shell.add(place(roof, x, z, 0, ry), (c, px, py) => c.copy(thatch).multiplyScalar(0.8 + 0.25 * Math.sin(py * 30)));
      for (let k = 0; k < 6; k++) { const px = x + Math.cos(faceA) * (1.8 + k * 0.28), pz = z + Math.sin(faceA) * (1.8 + k * 0.28); box(shell, 0.9, 0.06, 0.3, px, deck - 0.2 - k * 0.2, pz, wood, ry); }   // steps down to the sand
      { const [wx, wy, wz] = [x - Math.cos(faceA) * 1.55, deck + 1.1, z - Math.sin(faceA) * 1.55]; windows.add(new THREE.BoxGeometry(0.7, 0.5, 0.7).translate(wx, wy, wz), C(0xffc98a)); glowAt.push(x, deck + 1.9, z); glowCol.push(1, 0.72, 0.4); }
      for (let k = 0; k < 2; k++) { const tx = x + Math.cos(faceA) * 2.6 + (k ? 1.5 : -1.5) * -Math.sin(faceA), tz = z + Math.sin(faceA) * 2.6 + (k ? 1.5 : -1.5) * Math.cos(faceA); cyl(far, 0.04, 0.05, 1.5, tx, hAt(tx, tz), tz, C(0x4a3424), 6); glowAt.push(tx, hAt(tx, tz) + 1.6, tz); glowCol.push(1, 0.6, 0.25); windows.add(new THREE.ConeGeometry(0.07, 0.2, 6).translate(tx, hAt(tx, tz) + 1.6, tz), C(0xffa050)); }   // tiki torches
      // a hammock between the two palms nearest each other
      { const P = life.trees.palm.filter(t => Math.hypot(t.x - I.x, t.z - I.z) < I.r * 1.2); let best = null;
        for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++) { const d = Math.hypot(P[a].x - P[b].x, P[a].z - P[b].z); if (d > 3 && d < 5.5 && (!best || d < best[2])) best = [P[a], P[b], d]; }
        if (best) hammock(far, [best[0].x, best[0].z, hAt(best[0].x, best[0].z)], [best[1].x, best[1].z, hAt(best[1].x, best[1].z)]); }
      for (let k = 0; k < 30; k++) { const a = hash(k, 5) * 6.28, rr = I.r * (0.8 + 0.12 * hash(k, 6)), sx = I.x + Math.cos(a) * rr, sz = I.z + Math.sin(a) * rr, h2 = hAt(sx, sz); if (h2 < SEA_Y + 0.05) continue; const g = k % 4 === 0 ? starfish() : new THREE.SphereGeometry(0.035, 6, 4).scale(1, 0.5, 1.3); g.rotateY(hash(k, 7) * 6); g.translate(sx, h2 + 0.02, sz); near.add(g, k % 4 === 0 ? C(0xd8703a) : C(0xf2e6d2).multiplyScalar(0.8 + 0.3 * hash(k, 8))); }
    }
    if (I.kind === 'volcano') {
      // the observatory on the flat top: a stone drum, a copper dome that turns slowly, the telescope in its slit
      const [x, z, h] = top;
      cyl(shell, 2.6, 2.4, 3.0, x, h - 0.2, z, (c, px, py, pz) => c.copy(C(0x8f877c)).multiplyScalar(0.85 + 0.15 * hash(Math.floor(py * 3), Math.floor(Math.atan2(pz - z, px - x) * 4))), 20);
      const ring = new THREE.TorusGeometry(2.45, 0.08, 6, 32); ring.rotateX(Math.PI / 2); ring.translate(x, h + 2.85, z); shell.add(ring, C(0x3a3230));
      { const fa = Math.atan2(-z, -x), dx = x + Math.cos(fa) * 2.5, dz = z + Math.sin(fa) * 2.5; const door = new THREE.BoxGeometry(0.12, 1.9, 0.9); door.translate(0, 0.95, 0); door.rotateY(-fa); door.translate(dx, h - 0.2, dz); shell.add(door, C(0x4a3024)); windows.add(new THREE.BoxGeometry(0.1, 0.4, 0.4).rotateY(-fa).translate(x + Math.cos(fa + 0.6) * 2.48, h + 1.8, z + Math.sin(fa + 0.6) * 2.48), C(0xffd08a)); glowAt.push(dx, h + 2.2, dz); glowCol.push(1, 0.78, 0.5); }
      const dome = builder(); { const g = new THREE.SphereGeometry(2.45, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2); dome.add(g, (c, px, py, pz) => { const a = Math.atan2(pz, px); c.copy(Math.abs(a) < 0.18 ? C(0x1a1a1c) : C(0x5f8f84)).multiplyScalar(0.85 + 0.15 * Math.sin(a * 24)); });
        // the telescope on its fork (the pier under it: islandBuildings.js), aimed out of the slit; its eyepiece at eye height
        const tube = new THREE.CylinderGeometry(0.2, 0.26, 3.2, 16); tube.translate(0, 0.9, 0); tube.rotateZ(-(Math.PI / 2 - 0.62)); tube.translate(0, -1.08, 0); dome.add(tube, C(0xd8d4cc));
        for (const s of [-1, 1]) { const fk = new THREE.BoxGeometry(0.08, 0.5, 0.06); fk.translate(0, -1.2, s * 0.3); dome.add(fk, C(0x2e2c2a)); }
        const ep = new THREE.CylinderGeometry(0.04, 0.05, 0.22, 10); ep.rotateZ(-(Math.PI / 2 - 0.62)); ep.translate(-0.62, -1.52, 0); dome.add(ep, C(0x1a1a1c));
        const ring2 = new THREE.TorusGeometry(2.42, 0.05, 6, 40); ring2.rotateX(Math.PI / 2); ring2.translate(0, 0.02, 0); dome.add(ring2, C(0x3a3230)); }
      const dm = new THREE.Mesh(dome.geometry(), partMat); dm.position.set(x, h + 2.8, z); dm.castShadow = true; scene.add(dm); moving.push({ spin: dm, axis: 'y', speed: 0.05 });
      // the hot spring: steaming turquoise water in its basin
      const sp = I.spring; { const g = new THREE.CircleGeometry(sp.r + 0.3, 24); g.rotateX(-Math.PI / 2); g.translate(sp.x, sp.y, sp.z); water.add(g, C(0x3fb6b0)); }
      // glowing cracks down the cone; steam vents (near). (Its dead trees and boulders: world/islandLife.js)
      for (let c = 0; c < 7; c++) { let a = c / 7 * 6.28 + 0.4, rr = 2.8; const pts = []; while (rr < I.r * 0.82) { const px2 = x + Math.cos(a) * rr, pz2 = z + Math.sin(a) * rr; pts.push([px2, hAt(px2, pz2) + 0.03, pz2]); rr += 0.5; a += (hash(c, rr) - 0.5) * 0.25; }
        for (let i = 1; i < pts.length; i++) { const [ax, ay, az] = pts[i - 1], [bx, by, bz] = pts[i], w = 0.07 * (1 - i / pts.length) + 0.02, nx = -(bz - az), nz = bx - ax, l = Math.hypot(nx, nz) || 1;
          const q = new THREE.BufferGeometry(); q.setAttribute('position', new THREE.Float32BufferAttribute([ax + nx / l * w, ay, az + nz / l * w, bx + nx / l * w, by, bz + nz / l * w, bx - nx / l * w, by, bz - nz / l * w, ax + nx / l * w, ay, az + nz / l * w, bx - nx / l * w, by, bz - nz / l * w, ax - nx / l * w, ay, az - nz / l * w], 3)); q.computeVertexNormals(); lava.add(q, C(0xff6a1e)); } }
      for (let v = 0; v < 5; v++) { const s = spot(v + 60, 0.35, 0.7); if (s) I.vents = (I.vents || []).concat([s]); }
      if (sp) I.vents = (I.vents || []).concat([[sp.x, sp.z, sp.y]]);
    }
    if (I.kind === 'marsh') {
      // the fisherman's lodge on stilts by the first jetty, a boardwalk to it, drying racks for nets
      const d = I.docks[0], lx0 = plan.x, lz0 = plan.z, faceA = plan.a, ry = -faceA, floor = plan.floor, plank = C(0x6e5638), wall = C(0x7c6446);
      const W = (u, v) => plan.W(u, v);
      for (const [u, v] of [[-1.9, -2.3], [2.7, -2.3], [-1.9, 2.3], [2.7, 2.3], [0.4, -2.3], [0.4, 2.3]]) { const [px, pz] = W(u, v); cyl(shell, 0.12, 0.11, floor - hAt(px, pz) + 0.2, px, hAt(px, pz) - 0.2, pz, plank.clone().multiplyScalar(0.7), 6); }
      { const [cx, cz] = W(0.4, 0); box(shell, 4.6, 0.15, 4.6, cx, floor - 0.15, cz, plank, ry); }
      const house = new THREE.BoxGeometry(3.4, 2.3, 4.2); house.translate(0, 1.15, 0); shell.add(place(house, lx0, lz0, floor, ry), (c, px, py) => c.copy(wall).multiplyScalar(0.85 + 0.15 * Math.sin(py * 22)));
      const roof = new THREE.CylinderGeometry(0.01, 2.6, 1.3, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(0.95, 1, 1.25); roof.translate(0, floor + 2.3 + 0.65, 0); shell.add(place(roof, lx0, lz0, 0, ry), C(0x4a3b2e));
      for (const v of [-1.3, 1.3]) { const [wx, wz] = W(1.72, v), g = new THREE.BoxGeometry(0.06, 0.6, 0.7); g.translate(0, floor + 1.3, 0); g.rotateY(ry); g.translate(wx, 0, wz); windows.add(g, C(0xffd08a)); glowAt.push(wx, floor + 1.3, wz); glowCol.push(1, 0.78, 0.48); }
      plan.boardwalk.forEach(([bx, by, bz], k) => box(shell, 0.28, 0.06, 1.2, bx, by - 0.06, bz, plank.clone().multiplyScalar(0.85 + 0.2 * hash(k, 3)), -plan.boardwalkAng));   // the boardwalk
      { const n = plan.stair.n; for (let k = 1; k <= n; k++) { const [sx, sz] = W(plan.stair.rect[0] + (k - 0.5) * 0.3, 0); box(shell, 0.3, 0.06, 1.1, sx, floor - k * (floor - plan.stair.y1) / n - 0.06, sz, plank, ry); } }
      for (let r = 0; r < 2; r++) { const [rx, rz] = d.W(-6 - r * 2.2, -3.5); cyl(far, 0.05, 0.05, 1.6, rx - 0.8, hAt(rx - 0.8, rz), rz, plank, 6); cyl(far, 0.05, 0.05, 1.6, rx + 0.8, hAt(rx + 0.8, rz), rz, plank, 6); box(far, 1.7, 0.04, 0.04, rx, hAt(rx, rz) + 1.55, rz, plank); const net = new THREE.PlaneGeometry(1.5, 1.2, 6, 4); const pp = net.attributes.position; for (let i = 0; i < pp.count; i++) pp.setZ(i, 0.06 * Math.sin(pp.getX(i) * 7)); net.translate(rx, hAt(rx, rz) + 0.95, rz); far.add(net, C(0x5a5848)); }
      // pools, reeds and cattails, herons (its willows: world/islandLife.js)
      { const E = I.r * 0.85, st = 0.6; for (let x = I.x - E; x < I.x + E; x += st) for (let z = I.z - E; z < I.z + E; z += st) { const c = [[0, 0], [st, 0], [st, st], [0, st]].map(([a, b]) => hAt(x + a, z + b)); if (Math.min(...c) < MARSH_POOL - 0.02 && Math.hypot(x - I.x, z - I.z) < I.r * 0.8) { const g = new THREE.PlaneGeometry(st, st); g.rotateX(-Math.PI / 2); g.translate(x + st / 2, MARSH_POOL, z + st / 2); water.add(g, C(0x2f4a3c)); } } }
      I.herons = []; for (let k = 0; k < 3; k++) { const s = spot(k + 70, 0.3, 0.8, (px2, pz2, h2) => h2 < MARSH_POOL + 0.25 && clearOf(px2, pz2, 3)); if (s) { heron(near, s[0], Math.max(s[2], MARSH_POOL - 0.1), s[1], hash(k, 9) * 6.28); } }
    }

    /* ---- near life: reeds and cattails round the marsh's pools and shore, instanced (the grass: world/grass.js) ---- */
    const nearParts = [];
    if (I.kind === 'marsh') {
      const reeds = [], nT = isTouch ? 900 : 1400;
      for (let k = 0; k < nT * 6 && reeds.length < nT; k++) {
        const a = hash(k, 11 + I.s) * 6.28, rr = I.r * 0.95 * Math.sqrt(hash(k, 12 + I.s)), x = I.x + Math.cos(a) * rr, z = I.z + Math.sin(a) * rr, h = hAt(x, z);
        if (h < MARSH_POOL - 0.25 || h > MARSH_POOL + 0.22 || !clearOf(x, z, 0.5) || I.docks.some(d => d.dist(x, z) < 0.6) || site.blocked(x, z, 0.1)) continue;
        reeds.push([x, Math.max(h, MARSH_POOL - 0.05), z, hash(k, 14), hash(k, 15)]);
      }
      nearParts.push(instanced(scene, reedGeo(), reeds, nearMat, 0.8, 1.5));
    }
    const nearGeo = near.geometry(); if (nearGeo.attributes.position.count) { const nm = new THREE.Mesh(nearGeo, nearMat); nm.castShadow = true; nm.receiveShadow = true; scene.add(nm); nearParts.push(nm); }

    const gm = new THREE.Mesh(far.groundGeo, farFog(terrainMaterial(ctx, GROUND[I.kind]), IL_LOOK.fogK)); gm.receiveShadow = true; gm.castShadow = true; scene.add(gm);
    const fg = far.geometry(), sg = shell.geometry(), nFar = fg.attributes.position.count, m = new THREE.Mesh(mergeTwo(fg, sg), partMat); m.castShadow = m.receiveShadow = true; scene.add(m);
    islands.push({ I, ground: gm, far: m, nFar, plan, near: nearParts, moving, at: V3(I.x, 0, I.z) });
  }

  /* ---- shared: shallows, still water, windows, lava, lamps' glow ---- */
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(shallows.p, 3)); sg.setAttribute('color', new THREE.Float32BufferAttribute(shallows.c, 3)); sg.setAttribute('alpha', new THREE.Float32BufferAttribute(shallows.a, 1));
  const shMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false });
  shMat.onBeforeCompile = s => { s.vertexShader = 'attribute float alpha; varying float vA;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vA = alpha;'); s.fragmentShader = 'varying float vA;\n' + s.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity * vA );'); };
  shMat.customProgramCacheKey = () => 'shallows';
  const shal = new THREE.Mesh(sg, shMat); shal.renderOrder = 1; scene.add(shal);
  const waterMesh = new THREE.Mesh(water.geometry(), farFog(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.05, metalness: 0.3, envMapIntensity: 1.0 }), IL_LOOK.fogK)); waterMesh.receiveShadow = true; scene.add(waterMesh);
  const winMat = hideNear(new THREE.MeshBasicMaterial({ vertexColors: true })), winMesh = new THREE.Mesh(windows.geometry(), farFog(winMat, IL_LOOK.fogK)); scene.add(winMesh);
  const lavaMat = new THREE.MeshBasicMaterial({ vertexColors: true }), lavaMesh = new THREE.Mesh(lava.geometry(), farFog(lavaMat, IL_LOOK.fogK)); scene.add(lavaMesh);
  const gg2 = new THREE.BufferGeometry(); gg2.setAttribute('position', new THREE.Float32BufferAttribute(glowAt, 3)); gg2.setAttribute('color', new THREE.Float32BufferAttribute(glowCol, 3));
  const glowMat = hideNear(new THREE.PointsMaterial({ map: tex.softDot, vertexColors: true, size: 2.2, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  const glow = new THREE.Points(gg2, glowMat); glow.frustumCulled = false; scene.add(glow);
  // steam over the vents and the hot spring: puffs rising and fading (near Ember Rock)
  const vents = ISLANDS.flatMap(I => I.vents || []), NS = vents.length * 10, stP = new Float32Array(NS * 3);
  const stGeo = new THREE.BufferGeometry(); stGeo.setAttribute('position', new THREE.BufferAttribute(stP, 3));
  const steam = new THREE.Points(stGeo, new THREE.PointsMaterial({ map: tex.softDot, color: 0xe8ecee, size: 1.6, sizeAttenuation: true, transparent: true, opacity: 0.28, depthWrite: false })); steam.frustumCulled = false; scene.add(steam);
  const volcano = islands.find(o => o.I.kind === 'volcano'); if (volcano) volcano.near.push(steam);

  const buildings = createIslandBuildings(ctx);
  const cam = camera.position;
  return {
    islands, buildings,
    update(dt, t) {
      const night = skyUniforms.uNight.value, lit = smooth(0.3, 0.6, night);
      shal.position.y = U.uSea.value - SEA_Y;   // (the tide)
      for (const o of islands) {
        const d = Math.hypot(cam.x - o.I.x, cam.z - o.I.z), isNear = d < IL_LOOK.near + o.I.r; o.near.forEach(n => { n.visible = isNear; });
        for (const mv of o.moving) mv.spin.rotation[mv.axis] += dt * mv.speed * (mv.axis === 'z' ? 0.4 + 0.9 * Math.min(1.4, U.uWind.value) : 1);
      }
      buildings.update(dt, 0.4 + 0.9 * Math.min(1.4, U.uWind.value));
      uHide.value.z = -1;
      for (const o of islands) { const b = buildings.buildings.find(q => q.P === o.plan); o.far.geometry.setDrawRange(0, b && b.near ? o.nFar : Infinity); if (b && b.near) uHide.value.set(o.plan.x, o.plan.z, HIDE_R[o.plan.kind]); }
      winMat.color.setScalar(0.35 + 1.2 * lit); glowMat.opacity = 0.8 * lit; glow.visible = lit > 0.02;
      lavaMat.color.setRGB(0.12 + 1.6 * lit, 0.06 + 1.0 * lit, 0.05 + 0.5 * lit);   // dull by day, glowing at night
      if (steam.visible) for (let i = 0; i < NS; i++) { const v = vents[Math.floor(i / 10)], k = ((t * 0.25 + hash(i, 1)) % 1); stP[i * 3] = v[0] + Math.sin(t * 0.7 + i) * 0.3 * k; stP[i * 3 + 1] = v[2] + 0.2 + k * 3.2; stP[i * 3 + 2] = v[1] + Math.cos(t * 0.6 + i) * 0.3 * k; }
      stGeo.attributes.position.needsUpdate = true;
    },
  };
}

/* ---- the plants and animals, built in place into a builder ---- */
function sheep(b, x, h, z, a) {
  const add = (g, c) => { g.rotateY(a); g.translate(x, h, z); b.add(g, c); };
  const body = new THREE.IcosahedronGeometry(0.42, 1); body.scale(1.35, 0.9, 0.95); body.translate(0, 0.62, 0); add(body, lin(0xeeeae0));
  const head = new THREE.SphereGeometry(0.16, 8, 6); head.scale(1.3, 1, 0.9); head.translate(0.62, 0.78, 0); add(head, lin(0x2a2622));
  for (const [u, v] of [[0.3, 0.18], [0.3, -0.18], [-0.3, 0.18], [-0.3, -0.18]]) { const l = new THREE.CylinderGeometry(0.045, 0.04, 0.34, 5); l.translate(u, 0.17, v); add(l, lin(0x2a2622)); }
}
function heron(b, x, h, z, a) {
  const add = (g, c) => { g.rotateY(a); g.translate(x, h, z); b.add(g, c); };
  const body = new THREE.SphereGeometry(0.2, 10, 8); body.scale(1.6, 0.9, 0.8); body.translate(0, 0.85, 0); add(body, lin(0x8e949a));
  const neck = new THREE.CylinderGeometry(0.035, 0.05, 0.5, 6); neck.rotateZ(-0.5); neck.translate(0.28, 1.1, 0); add(neck, lin(0xb8bcc0));
  const head = new THREE.SphereGeometry(0.07, 8, 6); head.translate(0.42, 1.34, 0); add(head, lin(0xdcdcdc));
  const bill = new THREE.ConeGeometry(0.025, 0.24, 5); bill.rotateZ(-Math.PI / 2 - 0.2); bill.translate(0.56, 1.32, 0); add(bill, lin(0xd8a030));
  for (const v of [0.06, -0.06]) { const l = new THREE.CylinderGeometry(0.012, 0.012, 0.7, 4); l.translate(0, 0.35, v); add(l, lin(0x4a4030)); }
}
function hammock(b, p1, p2) {
  const [x1, z1, h1] = p1, [x2, z2, h2] = p2, pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector3(x1 + (x2 - x1) * t, (h1 + 1.3) + (h2 - h1) * t - Math.sin(t * Math.PI) * 0.7, z1 + (z2 - z1) * t)); }
  if (Math.hypot(x2 - x1, z2 - z1) > 6) return;
  b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.18, 6), (c, px, py) => c.copy(lin(0xd84a3a)).lerp(lin(0xf0d8a0), 0.5 + 0.5 * Math.sin(px * 12 + py * 6)));
}
function starfish() { const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * 6.28, r = i % 2 ? 0.035 : 0.09; (i ? s.lineTo : s.moveTo).call(s, Math.cos(a) * r, Math.sin(a) * r); } const g = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g; }
function reedGeo() {   // tall reeds and a cattail
  const pos = [], col = [], base = lin(0x4a5a2a), tip = lin(0xa8b060);
  for (let b = 0; b < 7; b++) { const a = b / 7 * 6.28 + hash(b, 8), h = 0.9 + 0.7 * hash(b, 9), lean = 0.12 * hash(b, 10), w = 0.02, cx = Math.cos(a) * 0.05, cz = Math.sin(a) * 0.05, px = -Math.sin(a) * w, pz = Math.cos(a) * w;
    pos.push(cx - px, 0, cz - pz, cx + px, 0, cz + pz, cx + Math.cos(a) * lean, h, cz + Math.sin(a) * lean); col.push(base.r, base.g, base.b, base.r, base.g, base.b, tip.r, tip.g, tip.b); }
  { const stem = new THREE.CylinderGeometry(0.006, 0.008, 1.25, 4).toNonIndexed(); stem.translate(0.02, 0.62, 0); const sp = stem.attributes.position, sc = lin(0x5a6a32); for (let i = 0; i < sp.count; i++) { pos.push(sp.getX(i), sp.getY(i), sp.getZ(i)); col.push(sc.r, sc.g, sc.b); } }   // the cattail's stalk
  const cat = new THREE.CylinderGeometry(0.016, 0.016, 0.13, 6).toNonIndexed(); cat.translate(0.02, 1.3, 0); const cp = cat.attributes.position; const brown = lin(0x3e2616);
  for (let i = 0; i < cp.count; i++) { pos.push(cp.getX(i), cp.getY(i), cp.getZ(i)); col.push(brown.r, brown.g, brown.b); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((v, i) => (i % 3 === 1 ? 1 : 0)), 3)); return g;
}
function instanced(scene, geo, list, mat, sMin, sMax) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  list.forEach(([x, h, z, a, b], i) => { const sc = sMin + (sMax - sMin) * b; e.set(0, a * 6.28, 0); q.setFromEuler(e); m4.compose(new THREE.Vector3(x, h - 0.02, z), q, new THREE.Vector3(sc, sc * (0.8 + 0.4 * a), sc)); im.setMatrixAt(i, m4); });
  if (!list.length) im.count = 0;
  im.instanceMatrix.needsUpdate = true; im.castShadow = false; im.receiveShadow = true; scene.add(im); return im;
}
function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry();
  for (const k of ['position', 'normal', 'color']) { const x = a.attributes[k].array, y = b.attributes[k].array, o = new Float32Array(x.length + y.length); o.set(x); o.set(y, x.length); g.setAttribute(k, new THREE.BufferAttribute(o, 3)); }
  g.computeBoundingSphere(); return g;
}
