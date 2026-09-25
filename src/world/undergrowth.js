import * as THREE from 'three';
import { setSeed, rng, rr } from '../core/random.js';
import { V, UPV, smooth, lin } from '../core/math.js';
import { fbm2 } from '../core/noise.js';
import { addFlutter, addWorldSway, addDistanceFade, THIN_SMALL } from '../core/shaderPatches.js';
import { U } from '../core/uniforms.js';
import { CONFIG } from '../config.js';
import { H, WORLD_HALF, SEA_Y, forest, excluded, coastDist, walkwayDist, signDist, builtDist } from './layout.js';
import { obstacles, rockBodies } from './bounds.js';
import { placer, plantGroups, updateGroups, seasonalBillboards } from './scatter.js';
import { createBushVariants } from '../assets/vegetation/bush.js';
import { createRoseVariants } from '../assets/vegetation/roseBush.js';
import { flowerGeometries, flowerTint } from '../assets/vegetation/meadowFlowers.js';
import { fernTexture, fernGeometry } from '../assets/rocks/rockOutcrop.js';
import { createLogVariants } from '../assets/trees/fallenLog.js';
import { pineconeGeo } from '../assets/trees/spruce.js';
import { boleteGeo, agaricGeo, stickGeo, groundCone } from '../assets/vegetation/forestFloor.js';
import { createButterflySwarm } from '../assets/fauna/butterflies.js';

/**
 * Forest undergrowth and meadow life on the island, with the same draw logic as the trees and rocks:
 *  - bushes and wild roses: full-detail variants (bush.js, the reference rose generator) planted with plantGroups(),
 *    thinned by rank with distance and dissolved into 8-angle billboards, like the trees but over a shorter range
 *    (CONFIG.undergrowth.keep / fade: they are small, so a billboard holds up closer);
 *  - fallen trunks with their stumps: a near mesh per log cross-faded into an instanced far mesh, like the boulders;
 *  - small things (ferns, mushrooms, sticks, spruce cones, meadow flowers): one InstancedMesh per kind whose instance
 *    buffer holds only the tiles near the camera (refilled when the camera has moved a metre or two), dithered out
 *    with distance like everything else; one draw call per kind;
 *  - butterflies (the plot's wings and flight), several around each wild rose and a few over the meadow, drawn
 *    only within CONFIG.undergrowth.butterflyRange of the camera;
 *  - pollen by day / fireflies at night: a field of points that follows the camera, sharing the reference pollen's
 *    material so the time of day drives both.
 * Everything is seeded from CONFIG.world.seed, after the trees and rocks (whose positions it avoids).
 */
export function createUndergrowth(ctx, { scatter, pollen }) {
  const { scene, renderer } = ctx;
  const UC = CONFIG.undergrowth, TC = CONFIG.trees, seed = CONFIG.world.seed;

  /* ---- variants (each from its own seed) ---- */
  const small = { keep: UC.keep, fade: UC.fade };   // bushes and roses: their own, shorter full-detail range
  THIN_SMALL.uKeep.value.set(UC.keep[0], UC.keep[1], UC.keep[2], TC.grow); THIN_SMALL.uFade.value.set(UC.fade[0], UC.fade[1]);
  const bushV = createBushVariants(ctx, UC.bushVariants, seed + 404, THIN_SMALL);
  const roseV = createRoseVariants(ctx, UC.roseVariants, seed + 505, THIN_SMALL);
  const logSet = createLogVariants(ctx, UC.logVariants, seed + 606);
  setSeed(seed + 707); const fernTex = fernTexture();
  setSeed(seed + 303);

  /* ---- what is already there: trunks, boulders (and each placed log / bush) as circles on a hash grid ---- */
  const occ = new Map(), OC = 2, ok = (i, j) => i * 92821 + j;
  const occupy = (x, z, r) => { const k = ok(Math.floor(x / OC), Math.floor(z / OC)); (occ.get(k) || occ.set(k, []).get(k)).push({ x, z, r }); };
  const free = (x, z, m) => {
    const i0 = Math.floor(x / OC), j0 = Math.floor(z / OC);
    for (let i = i0 - 2; i <= i0 + 2; i++) for (let j = j0 - 2; j <= j0 + 2; j++) { const l = occ.get(ok(i, j)); if (l) for (const c of l) if (Math.hypot(c.x - x, c.z - z) < c.r + m) return false; }
    return true;
  };
  // (everything as placed, before the walkways were cleared of it: the same draws as without them)
  const placed = scatter.placed;
  placed.spruce.forEach(t => occupy(t.x, t.z, 0.45 * t.s)); placed.apple.forEach(t => occupy(t.x, t.z, 0.4 * t.s));
  placed.rocks.forEach(l => l.forEach(r => occupy(r.x, r.z, r.s)));
  const onLand = (x, z, m) => coastDist(x, z) > m, rpos = () => [rr(-WORLD_HALF, WORLD_HALF), rr(-WORLD_HALF, WORLD_HALF)];

  /* ---- fallen trunks + stumps: in the woods, along ground flat enough for the trunk to lie on ---- */
  const logs = [];
  for (let tries = 0; logs.length < UC.logs && tries < UC.logs * 300; tries++) {
    const [x, z] = rpos();
    if (forest(x, z) < 0.35 || !onLand(x, z, CONFIG.island.beachWidth + 3) || excluded(x, z, 2) || !free(x, z, 0.6)) continue;
    const k = Math.floor(rng() * logSet.variants.length), v = logSet.variants[k], rot = rng() * 6.28, phi = rot - v.yaw;
    const dx = Math.cos(phi), dz = -Math.sin(phi), y0 = H(x, z), y1 = H(x + dx * v.length, z + dz * v.length);
    const pitch = Math.atan2(y1 - y0, v.length); if (Math.abs(pitch) > 0.3) continue;
    let fits = true;
    for (let s = 0.6; s <= v.length && fits; s += 0.5) {
      const px = x + dx * s, pz = z + dz * s, off = H(px, pz) - (y0 + s * Math.tan(pitch));
      fits = off < 0.12 && off > -0.25 && free(px, pz, 0.45) && onLand(px, pz, CONFIG.island.beachWidth) && !excluded(px, pz, 1);
    }
    if (!fits) continue;
    logs.push({ x, y: y0, z, s: 1, rot, pitch, variant: k });
    for (let s = 0; s <= v.length; s += 0.5) occupy(x + dx * s, z + dz * s, 0.45);
  }
  /* ---- bushes: in the woods and thickest along their edges ---- */
  const bushes = [], bushPts = placer(2.2);
  for (let tries = 0; bushes.length < UC.bushes && tries < UC.bushes * 80; tries++) {
    const [x, z] = rpos(), f = forest(x, z);
    if (rng() > smooth(0.04, 0.3, f) * (1 - 0.55 * smooth(0.6, 1, f))) continue;
    const s = rr(0.8, 1.3);
    if (!onLand(x, z, CONFIG.island.beachWidth + 1) || excluded(x, z, 1) || !free(x, z, 0.5 * s + 0.3) || !bushPts.tryAdd(x, z)) continue;
    bushes.push({ x, y: H(x, z) - 0.03, z, s, rot: rng() * 6.28, variant: Math.floor(rng() * bushV.length) });
    occupy(x, z, 0.5 * s);
  }
  /* ---- wild roses: on the meadow side of the forest edges ---- */
  const roses = [];
  for (let tries = 0; roses.length < UC.roses && tries < UC.roses * 150; tries++) {
    const [x, z] = rpos(), f = forest(x, z);
    if (rng() > smooth(0.005, 0.06, f) * (1 - smooth(0.2, 0.45, f))) continue;
    const s = rr(0.8, 1.15);
    if (!onLand(x, z, CONFIG.island.beachWidth + 1) || excluded(x, z, 1) || !free(x, z, 0.55 * s + 0.3) || !bushPts.tryAdd(x, z)) continue;
    roses.push({ x, y: H(x, z), z, s, rot: rng() * 6.28, variant: Math.floor(rng() * roseV.length) });
    occupy(x, z, 0.5 * s);
  }

  /* ---- small things, as instance lists [matrix, colour?] ---- */
  const M = () => new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler();
  const ferns = [], mush = [[], []], sticks = [], cones = [], flowers = [], flowerCols = [];
  for (let n = 0, tries = 0; n < UC.fernClumps && tries < UC.fernClumps * 60; tries++) {
    const [x0, z0] = rpos();
    if (rng() > smooth(0.12, 0.45, forest(x0, z0)) || !onLand(x0, z0, CONFIG.island.beachWidth + 1) || excluded(x0, z0, 0.5) || !free(x0, z0, 0.3)) continue;
    n++;
    const y0 = H(x0, z0) - 0.01, k = 7 + Math.floor(rng() * 6), sc = rr(0.9, 1.6);   // the outcrop's clumps, a bit larger (bracken)
    for (let i = 0; i < k; i++) {
      const a = i / k * 6.28 + rr(-0.25, 0.25), tilt = rr(0.45, 1.05), len = rr(0.32, 0.5) * sc;
      const d = new V(Math.cos(a) * Math.sin(tilt), Math.cos(tilt), Math.sin(a) * Math.sin(tilt));
      const q = new THREE.Quaternion().setFromUnitVectors(UPV, d); q.multiply(new THREE.Quaternion().setFromAxisAngle(UPV, rr(-0.3, 0.3) + Math.PI / 2));
      ferns.push([M().compose(new V(x0, y0, z0), q, new V(len * 0.42, len, len)), new THREE.Color(rr(0.8, 1.05), rr(0.9, 1.1), rr(0.75, 0.95))]);
    }
  }
  for (let n = 0, tries = 0; n < UC.mushrooms && tries < UC.mushrooms * 60; tries++) {
    const [x0, z0] = rpos();
    if (rng() > smooth(0.2, 0.5, forest(x0, z0)) || !onLand(x0, z0, CONFIG.island.beachWidth + 2) || excluded(x0, z0, 0.5) || !free(x0, z0, 0.15)) continue;
    const kind = rng() < 0.6 ? 0 : 1, k = 1 + Math.floor(rng() * 4);
    for (let i = 0; i < k && n < UC.mushrooms; i++, n++) {
      const x = x0 + rr(-0.25, 0.25), z = z0 + rr(-0.25, 0.25);
      mush[kind].push([M().compose(new V(x, H(x, z) - 0.008, z), Q.setFromEuler(E.set(rr(-0.15, 0.15), rng() * 6.28, rr(-0.15, 0.15))), new V(1, 1, 1).multiplyScalar(rr(0.6, 1.35)))]);
    }
  }
  for (let tries = 0; sticks.length < UC.sticks && tries < UC.sticks * 60; tries++) {
    const [x, z] = rpos();
    if (rng() > 0.1 + 0.9 * smooth(0.1, 0.4, forest(x, z)) || !onLand(x, z, CONFIG.island.beachWidth) || excluded(x, z, 0.3) || !free(x, z, 0.2)) continue;
    const s = rr(0.35, 1.3);
    sticks.push([M().compose(new V(x, H(x, z), z), Q.setFromEuler(E.set(rr(-0.08, 0.08), rng() * 6.28, rr(-0.06, 0.06))), new V(s, rr(0.8, 1.3), rr(0.8, 1.3)))]);
  }
  for (let tries = 0; cones.length < UC.cones && tries < UC.cones * 10 && placed.spruce.length; tries++) {
    const t = placed.spruce[Math.floor(rng() * placed.spruce.length)], a = rng() * 6.28, r = rr(0.45, 2.8) * t.s, x = t.x + Math.cos(a) * r, z = t.z + Math.sin(a) * r;
    if (!onLand(x, z, 0.5) || excluded(x, z, 0.2) || !free(x, z, 0.05)) continue;
    cones.push([M().compose(new V(x, H(x, z) - 0.004, z), Q.setFromEuler(E.set(rr(-0.2, 0.2), rng() * 6.28, rr(-0.3, 0.3))), new V(1, 1, 1).multiplyScalar(rr(0.8, 1.15)))]);
  }
  // meadow flowers: the plot's flowers and tints, in patches (the plot's patch noise) over the open meadow
  for (let cx = -WORLD_HALF; cx < WORLD_HALF; cx += 0.5) for (let cz = -WORLD_HALF; cz < WORLD_HALF; cz += 0.5) {
    const x = cx + rng() * 0.5, z = cz + rng() * 0.5, p = rng();
    if (p > UC.flowers * 0.25 * 2) continue;   // x2: about half the ground is outside the patches
    const f = forest(x, z); if (f > 0.1 || fbm2(x * 0.7 + 20, z * 0.7) < -0.05 || fbm2(x * 0.09 - 3, z * 0.09 + 11) < -0.25) continue;
    if (rng() > 1 - smooth(0.02, 0.1, f) || !onLand(x, z, CONFIG.island.beachWidth + 0.5) || excluded(x, z, 0.2) || !free(x, z, 0.1)) continue;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(-0.15, 0.15), rng() * 6.28, rr(-0.15, 0.15)));
    flowers.push([M().compose(new V(x, H(x, z) - 0.02, z), q, new V(1, rr(0.75, 1.25), 1).multiplyScalar(rr(0.85, 1.15)))]);
    flowerCols.push(flowerTint(rng()));
  }

  /* ---- clear the walkways (paths, bridge, benches) of anything placed on them; nothing else moves ---- */
  const off = m => it => { const e = it[0].elements; return Math.min(walkwayDist(e[12], e[14]), signDist(e[12], e[14]), builtDist(e[12], e[14]) - 0.3) > m; };   // (not the signposts, garden and well through walkwayDist: the pebbles would move)
  const logClear = t => { const v = logSet.variants[t.variant], dx = Math.cos(t.rot - v.yaw), dz = -Math.sin(t.rot - v.yaw); for (let s = 0; s <= v.length; s += 0.4) if (walkwayDist(t.x + dx * s, t.z + dz * s) < 0.7) return false; return walkwayDist(t.x, t.z) > 0.7; };
  const keep = (list, ok) => { const k = list.filter(ok); list.length = 0; list.push(...k); };
  keep(logs, logClear); keep(bushes, t => walkwayDist(t.x, t.z) > 0.6 * t.s + 0.4); keep(roses, t => walkwayDist(t.x, t.z) > 0.6 * t.s + 0.4);
  keep(ferns, off(0.45)); mush.forEach(l => keep(l, off(0.1))); keep(sticks, off(0.5)); keep(cones, off(0.05));
  { const k = flowers.map((f, i) => [f, flowerCols[i]]).filter(([f]) => off(0.08)(f)); flowers.length = flowerCols.length = 0; k.forEach(([f, c]) => { flowers.push(f); flowerCols.push(c); }); }
  // colliders: the stump like a tree trunk, the trunk as a chain of ellipsoids (the boulders' format) in the log's frame
  logs.forEach(t => {
    const v = logSet.variants[t.variant], cr = Math.cos(t.rot), sr = Math.sin(t.rot), sp = Math.sin(t.pitch), cp = Math.cos(t.pitch);
    obstacles.add(t.x, t.z, v.stump.r + 0.1, t.y + v.stump.top);
    v.log.forEach(c => { const lx = c.x * cp - c.y * sp, ly = c.x * sp + c.y * cp;
      rockBodies.add({ x: t.x + cr * lx + sr * c.z, y: t.y + ly, z: t.z - sr * lx + cr * c.z, rx: c.hx + 0.2, ry: c.r + 0.2, rz: c.r + 0.2, rot: t.rot - v.yaw, body: 0.25 }); });
  });

  /* ---- meshes ---- */
  const groups = plantGroups(scene, bushes, bushV, 'bush').concat(plantGroups(scene, roses, roseV, 'rose'));
  if (bushes.length) scene.add(seasonalBillboards(renderer, bushV, 160, bushes, THIN_SMALL));   // bare in winter too
  if (roses.length) scene.add(seasonalBillboards(renderer, roseV, 160, roses, THIN_SMALL));
  const logParts = logSet.variants.map(v => ({ bounds: v.bounds, parts: [
    { geometry: v.near[0], material: logSet.barkMat, depth: logSet.nearDepth }, { geometry: v.near[1], material: logSet.woodMat, depth: logSet.nearDepth, castShadow: false }] }));
  const logGroups = plantGroups(scene, logs, logParts, 'log');
  logSet.variants.forEach((v, k) => {
    const mine = logs.filter(t => t.variant === k); if (!mine.length) return;
    const far = new THREE.InstancedMesh(v.far, logSet.farMat, mine.length), P = new V(), S = new V(1, 1, 1);
    mine.forEach((t, i) => far.setMatrixAt(i, M().compose(P.set(t.x, t.y, t.z), Q.setFromEuler(E.set(0, t.rot, t.pitch, 'YZX')), S)));
    far.castShadow = far.receiveShadow = true; far.customDepthMaterial = logSet.farDepth; scene.add(far);
  });

  const depth = (map, alphaTest) => { const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest }); addDistanceFade(m, false); return m; };
  const fade = m => { addDistanceFade(m, false); return m; };
  const fMat = new THREE.MeshStandardMaterial({ map: fernTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75, envMapIntensity: 0.6 }); fMat.userData.season = 'leafVeg'; addFlutter(fMat, 0.012); fade(fMat);
  const vcMat = fade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, userData: { season: 'mushroom' } })), woodyMat = fade(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  const { headGeo, stemGeo } = flowerGeometries();
  const hMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }); addWorldSway(hMat, 0.7); fade(hMat);
  const sMat = new THREE.MeshStandardMaterial({ color: lin(0x4d7328), roughness: 0.8 }); addWorldSway(sMat, 0.7); fade(sMat);
  const solidDepth = depth(null, 0);
  const smalls = [
    tiled(fernGeometry(), fMat, depth(fernTex, 0.45), ferns, true),
    tiled(boleteGeo(), vcMat, solidDepth, mush[0], false),
    tiled(agaricGeo(), vcMat, solidDepth, mush[1], false),
    tiled(stickGeo(), woodyMat, solidDepth, sticks, false),
    tiled(groundCone(pineconeGeo), woodyMat, solidDepth, cones, false),
    tiled(headGeo, hMat, solidDepth, flowers.map((f, i) => [f[0], flowerCols[i]]), true),
    tiled(stemGeo, sMat, solidDepth, flowers, false),
  ];
  smalls.forEach(s => scene.add(s.mesh));

  /** One InstancedMesh for a kind of small thing; its buffer is refilled with the tiles within the fade distance. */
  function tiled(geo, mat, depthMat, items, cast) {
    const T = UC.tile, buckets = new Map();
    items.forEach(it => { const e = it[0].elements, i = Math.floor(e[12] / T), j = Math.floor(e[14] / T), k = i * 4096 + j; let b = buckets.get(k); if (!b) buckets.set(k, b = { i, j, list: [] }); b.list.push(it); });
    const where = new Map();   // item -> [its tile, its place in the tile] (for hide / show)
    const tiles = [...buckets.values()].map(b => { const m = new Float32Array(b.list.length * 16), c = b.list[0][1] ? new Float32Array(b.list.length * 3) : null, tile = { x0: b.i * T, z0: b.j * T, n: b.list.length, m, c };
      b.list.forEach((it, n) => { it[0].toArray(m, n * 16); if (c) it[1].toArray(c, n * 3); where.set(it, [tile, n]); }); return tile; });
    const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
    if (items.length && items[0][1]) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(items.length * 3), 3);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.count = 0;
    mesh.castShadow = cast; mesh.receiveShadow = true; mesh.customDepthMaterial = depthMat; mesh.frustumCulled = false; mesh.userData.dynamic = true;
    const last = new V(1e9, 0, 0), reach = TC.fade[1] + 2;
    return {
      mesh, total: items.length,
      /** Where each item is (x, y, z), and hide(i) / show(i) for picking one up and its coming back (app/items.js). */
      positions: () => items.map(it => { const e = it[0].elements; return { x: e[12], y: e[13], z: e[14] }; }),
      hide(i) { const [t, n] = where.get(items[i]); t.m.fill(0, n * 16, n * 16 + 16); last.x = 1e9; },
      show(i) { const [t, n] = where.get(items[i]); items[i][0].toArray(t.m, n * 16); last.x = 1e9; },
      look: i => ({ geo: mesh.geometry, mat: mesh.material, m: items[i][0], color: items[i][1] || null }),
      update(c) {
        if (Math.hypot(c.x - last.x, c.z - last.z) < 1.5) return;   // the +2 m margin covers the movement in between
        last.copy(c); let n = 0;
        for (const t of tiles) {
          const dx = Math.max(t.x0 - c.x, 0, c.x - t.x0 - T), dz = Math.max(t.z0 - c.z, 0, c.z - t.z0 - T);
          if (dx * dx + dz * dz > reach * reach) continue;
          mesh.instanceMatrix.array.set(t.m, n * 16); if (t.c) mesh.instanceColor.array.set(t.c, n * 3); n += t.n;
        }
        mesh.count = n; mesh.instanceMatrix.updateRange.count = n * 16; mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) { mesh.instanceColor.updateRange.count = n * 3; mesh.instanceColor.needsUpdate = true; }
      },
    };
  }

  /* ---- pollen / fireflies around the camera (the plot keeps its own, so none inside it) ---- */
  const NP = UC.pollen, B = 14, pBase = new Float32Array(NP * 4);
  for (let i = 0; i < NP; i++) { pBase[i * 4] = rr(-B, B); pBase[i * 4 + 1] = rr(0.15, 3.4); pBase[i * 4 + 2] = rr(-B, B); pBase[i * 4 + 3] = rng() * 100; }
  const pg = new THREE.BufferGeometry(); pg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(NP * 3), 3));
  const motes = new THREE.Points(pg, pollen.material); motes.frustumCulled = false; scene.add(motes);
  // ground height on a 1 m grid (H itself is too slow for every mote every frame)
  const GN = Math.ceil(WORLD_HALF * 2) + 1, hm = new Float32Array(GN * GN);
  for (let j = 0; j < GN; j++) for (let i = 0; i < GN; i++) hm[j * GN + i] = Math.max(H(i - WORLD_HALF, j - WORLD_HALF), SEA_Y);
  const hAt = (x, z) => {
    const fx = Math.min(Math.max(x + WORLD_HALF, 0), GN - 1.001), fz = Math.min(Math.max(z + WORLD_HALF, 0), GN - 1.001), i = Math.floor(fx), j = Math.floor(fz), u = fx - i, w = fz - j;
    return (hm[j * GN + i] * (1 - u) + hm[j * GN + i + 1] * u) * (1 - w) + (hm[(j + 1) * GN + i] * (1 - u) + hm[(j + 1) * GN + i + 1] * u) * w;
  };
  function updateMotes(t, c) {
    const a = pg.attributes.position, W = 2 * B, wx = U.uWindDir.value.x, wz = U.uWindDir.value.y, drift = t * 0.12 * (0.2 + U.uWind.value);
    for (let i = 0; i < NP; i++) {
      const b = i * 4, s = pBase[b + 3], d = (drift + s) % W - B;
      let x = pBase[b] + Math.sin(t * 0.21 + s) * 0.6 + wx * d, z = pBase[b + 2] + Math.cos(t * 0.17 + s * 1.3) * 0.6 + wz * d;
      x = c.x + (((x - c.x + B) % W) + W) % W - B; z = c.z + (((z - c.z + B) % W) + W) % W - B;   // wrap into the box around the camera
      const inPlot = Math.abs(x) < 5.6 && Math.abs(z) < 5.6;
      a.setXYZ(i, x, inPlot ? -100 : hAt(x, z) + pBase[b + 1] + Math.sin(t * 0.5 + s * 2.1) * 0.15, z);
    }
    a.needsUpdate = true;
  }

  /* ---- butterflies: a few around every wild rose, fewer over the rest of the meadow (own seed, after all the above) ---- */
  setSeed(seed + 808);
  const homes = [];
  roses.forEach(r => { const v = roseV[r.variant], k = UC.butterfliesPerRose[0] + Math.floor(rng() * (UC.butterfliesPerRose[1] - UC.butterfliesPerRose[0] + 1));
    for (let i = 0; i < k; i++) homes.push({ x: r.x + rr(-0.3, 0.3), y: r.y, z: r.z + rr(-0.3, 0.3), r: rr(0.45, 0.8) * r.s, h: v.height * r.s * rr(0.75, 1.05) }); });
  for (let tries = 0, n = 0; n < UC.meadowButterflies && tries < UC.meadowButterflies * 100; tries++) {
    const [x, z] = rpos();
    if (forest(x, z) > 0.12 || !onLand(x, z, CONFIG.island.beachWidth + 1) || excluded(x, z, 0)) continue;
    homes.push({ x, y: H(x, z), z, r: rr(0.9, 1.4), h: rr(0.35, 0.6) }); n++;
  }
  const butterflies = createButterflySwarm(ctx, homes, UC.butterflyRange);

  const all = groups.concat(logGroups);   // for the stats
  const stats = { bushes: bushes.length, roses: roses.length, logs: logs.length, near: 0, small: 0, smallTotal: smalls.reduce((s, k) => s + k.total, 0), butterflies: homes.length, butterfliesDrawn: 0 };
  function update(camera, t, withStats) {
    const c = camera.position;
    updateGroups(groups, c, small); updateGroups(logGroups, c);
    for (const s of smalls) s.update(c);
    updateMotes(t, c);
    butterflies.update(t, c);
    if (withStats) { stats.near = all.filter(e => e.g.visible).length; stats.small = smalls.reduce((s, k) => s + k.mesh.count, 0); stats.butterfliesDrawn = butterflies.drawn; }
  }
  return { update, stats, bushes, roses, bushVariants: bushV, roseVariants: roseV, logs, logVariants: logSet.variants, groups: all, smalls, boletes: smalls[1], sticks: smalls[3], cones: smalls[4] };
}
