import * as THREE from 'three';
import { setSeed, rng, rr } from '../core/random.js';
import { smooth } from '../core/math.js';
import { THIN, addSeason } from '../core/shaderPatches.js';
import { CONFIG } from '../config.js';
import { H, WORLD_HALF, forest, excluded, coastDist, walkwayDist, STONES, caveDist } from './layout.js';
import { SHOWN, PATCH } from './seasonLooks.js';
import { obstacles, rockBodies } from './bounds.js';
import { createSpruceVariants } from '../assets/trees/spruce.js';
import { createAppleVariants } from '../assets/trees/appleTree.js';
import { createRockVariants } from '../assets/rocks/scatteredRocks.js';
import { createBirchVariants, createWillowVariants, createPalmVariants, createSnagVariants } from '../assets/trees/islandTrees.js';
import { islandLife } from './islandLife.js';

/**
 * Seeded scatter of trees and rocks over the island.
 *
 * Trees use the reference generators at full detail: each species has a few variants (different seeds), built once.
 * A variant is { height, width, bounds, parts: [{ geometry, material, depth, instances? }] }; every tree is a small
 * Group of meshes that share the variant's geometry, instance buffers and materials, with the tree's own position,
 * rotation and scale in its modelMatrix (a GLB model can be dropped in by building the same object from its meshes).
 * Detail falls off continuously on the GPU (addThinning): parts are dropped by rank as keep(d) goes from 1 at
 * CONFIG.trees.keep[0] to keep[2] at keep[1], surviving cards grow a little, and past fade[0] the tree dissolves
 * (dithered) into a billboard baked at load from 8 angles. Rocks follow the same logic: the reference outcrop's
 * boulder generator at full detail near the camera, cross-faded into a cheap mesh of the same shape (instanced).
 * Per-frame CPU work: a distance check per tree / rock and one binary search per tree part.
 */

// Poisson-ish rejection sampling on a hash grid
export function placer(minDist) {
  const cell = minDist, grid = new Map(), pts = [];
  const k = (i, j) => i * 92821 + j;
  return {
    pts,
    tryAdd(x, z, r = minDist) {
      const i0 = Math.floor(x / cell), j0 = Math.floor(z / cell);
      for (let i = i0 - 2; i <= i0 + 2; i++) for (let j = j0 - 2; j <= j0 + 2; j++) {
        const l = grid.get(k(i, j)); if (l) for (const p of l) if (Math.hypot(p.x - x, p.z - z) < Math.max(r, p.r)) return null;
      }
      const p = { x, z, r }; pts.push(p); const kk = k(i0, j0); (grid.get(kk) || grid.set(kk, []).get(kk)).push(p); return p;
    },
  };
}

/* ---- shared by every "detailed object" (trees here, bushes and wild roses in undergrowth.js) ---- */
const survivors = (ranks, keep) => { let lo = 0, hi = ranks.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (ranks[mid] < keep) lo = mid + 1; else hi = mid; } return lo; };
/** keep(d) of the thinning, identical to the shader's (K = CONFIG.trees.keep, or the range's own keep). */
export function keepAt(d, K = CONFIG.trees.keep) { const t = 1 - Math.min(1, Math.max(0, (d - K[0]) / (K[1] - K[0]))); return 1 + (K[2] - 1) * (1 - t * t); }

/**
 * One small group per object, sharing everything with its variant ({ parts: [{ geometry, material, depth,
 * instances?, castShadow? }], bounds }): the object's position, rotation and scale go in the group's matrix.
 * list items: { x, y, z, s, rot, variant, pitch? }. Returns entries for updateGroups().
 */
export function plantGroups(scene, list, variants, tag) {
  const out = [];
  for (const t of list) {
    const v = variants[t.variant], g = new THREE.Group();
    g.position.set(t.x, t.y, t.z); g.rotation.set(0, t.rot, t.pitch || 0, 'YZX'); g.scale.setScalar(t.s);
    for (const part of v.parts) {
      let mesh;
      if (part.instances) { mesh = new THREE.InstancedMesh(part.geometry, part.material, 0); mesh.instanceMatrix = part.instances.matrix; mesh.instanceColor = part.instances.color; mesh.count = part.instances.count; }
      else {
        // own lightweight geometry (shared buffers) so each object can have its own draw range
        const geo = new THREE.BufferGeometry(); for (const k in part.geometry.attributes) geo.setAttribute(k, part.geometry.attributes[k]);
        geo.boundingSphere = part.geometry.boundingSphere; mesh = new THREE.Mesh(geo, part.material);
      }
      mesh.castShadow = part.castShadow !== false; mesh.receiveShadow = true; mesh.customDepthMaterial = part.depth; mesh.userData.dynamic = true; mesh.userData.part = part;
      g.add(mesh);
    }
    g.updateMatrixWorld(true); g.matrixAutoUpdate = false; g.children.forEach(c => { c.matrixAutoUpdate = false; });
    scene.add(g);
    out.push({ g, v, t, species: tag, sphere: v.bounds.clone().applyMatrix4(g.matrixWorld) });
  }
  return out;
}

/**
 * Per frame: hide objects that have fully become billboards / far meshes, and for the rest draw only the first N of
 * each rank-sorted part (instances or vertices) for keep(d). One distance and a few binary searches per object.
 */
export function updateGroups(entries, c, range = CONFIG.trees) {
  const hideBeyond = range.fade[1] + 1;
  for (const tr of entries) {
    const d = tr.g.position.distanceTo(c);
    tr.g.visible = d < hideBeyond;
    if (!tr.g.visible) continue;
    const keep = keepAt(d, range.keep);
    for (const mesh of tr.g.children) {
      const part = mesh.userData.part;
      if ((part.maxDist && d > part.maxDist) || (part.minDist && d <= part.minDist)) mesh.count = 0; // near / far mesh of a small part
      else if (part.instances) mesh.count = part.instances.ranks ? survivors(part.instances.ranks, keep) : part.instances.count;
      else if (part.vertexRanks) mesh.geometry.setDrawRange(0, survivors(part.vertexRanks, keep));
    }
  }
}

/**
 * Render every variant of a species from 8 angles into one atlas (rows: variants, columns: angles). Albedo only, at
 * half brightness (instance colours go above 1); the billboard material lights it and doubles it back. A proto may
 * carry an `origin` (its base, for assets built in world space); protos are otherwise in local space around (0, 0, 0).
 */
export function bakeAtlas(renderer, protos, tile, season = null) {   // season: bake as it looks then (world/seasonLooks.js)
  const W = Math.max(...protos.map(p => p.width)), Hh = Math.max(...protos.map(p => p.height));
  const tw = tile, th = Math.max(32, Math.round(tile * Hh / W / 16) * 16);
  const rt = new THREE.WebGLRenderTarget(tw * 8, th * protos.length, { format: THREE.RGBAFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  rt.texture.encoding = THREE.sRGBEncoding;
  const cam = new THREE.OrthographicCamera(-W / 2, W / 2, Hh, 0, 0.1, 100);
  const prevRT = renderer.getRenderTarget(), prevCol = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha(), prevSM = renderer.shadowMap.enabled;
  renderer.shadowMap.enabled = false;
  rt.scissorTest = false; renderer.setRenderTarget(rt); renderer.setClearColor(0x2d4a24, 0); renderer.clear();
  const mats = [];
  protos.forEach((p, row) => {
    const sc = new THREE.Scene();
    if (p.origin) sc.position.set(-p.origin.x, -p.origin.y, -p.origin.z);   // an asset built in world space (the plot's)
    for (const part of p.parts) {
      const m = part.material, role = season && m.userData.season;
      if (role && SHOWN[role] && !SHOWN[role](season)) continue;   // not there this season (bare apple trees in winter)
      const mb = new THREE.MeshBasicMaterial({ map: m.map, color: m.color, vertexColors: m.vertexColors, alphaTest: m.alphaTest || 0, side: THREE.DoubleSide, toneMapped: false, fog: false });
      mb.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 0.5;'); };
      if (role && PATCH[role]) addSeason(mb, { ...PATCH[role], basic: true });
      mats.push(mb);
      let mesh;
      if (part.instances) { mesh = new THREE.InstancedMesh(part.geometry, mb, 0); mesh.instanceMatrix = part.instances.matrix; mesh.instanceColor = part.instances.color; mesh.count = part.instances.count; }
      else mesh = new THREE.Mesh(part.geometry, mb);
      mesh.frustumCulled = false; sc.add(mesh);
    }
    for (let a = 0; a < 8; a++) {
      const ang = a / 8 * Math.PI * 2;
      cam.position.set(Math.sin(ang) * 30, 0, Math.cos(ang) * 30); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
      rt.viewport.set(a * tw, row * th, tw, th); rt.scissor.set(a * tw, row * th, tw, th); rt.scissorTest = true;
      renderer.setRenderTarget(rt); renderer.render(sc, cam);
    }
  });
  rt.scissorTest = false;
  renderer.setRenderTarget(prevRT); renderer.setClearColor(prevCol, prevA); renderer.shadowMap.enabled = prevSM;
  mats.forEach(m => m.dispose());
  return { texture: rt.texture, rt, W, H: Hh, rows: protos.length };
}

/**
 * Billboards for one species: one InstancedMesh (every tree of the species), each quad turned to the camera around
 * its vertical axis and showing the atlas tile of its variant from the nearest of the 8 baked angles. Hidden (collapsed)
 * nearer than the fade; inside the fade it takes the pixels the dissolving tree gives up (same dither, complementary).
 */
/** Billboards that follow the season: baked now as in summer, and again by rebakeBillboards(season) (main.js, on each
 *  change; bakeAtlas leaves out and recolours parts by their seasonal role): the island's trees, its bushes and roses,
 *  the plot's reference trees and rose (world/undergrowth.js, world/plotDetail.js). */
const BAKES = [];
export function seasonalBillboards(renderer, protos, tile, list, uniforms) {
  const a = bakeAtlas(renderer, protos, tile), bb = billboards(a, list, uniforms);
  BAKES.push({ renderer, protos, tile, bb, rt: a.rt }); return bb;
}
export function rebakeBillboards(season) {
  for (const b of BAKES) { const a = bakeAtlas(b.renderer, b.protos, b.tile, season); b.bb.material.map = a.texture; b.rt.dispose(); b.rt = a.rt; }
}
export function billboards(atlas, list, uniforms = THIN) {
  const q = new THREE.PlaneGeometry(1, 1); q.translate(0, 0.5, 0);
  const bbData = new Float32Array(list.length * 2); list.forEach((t, i) => { bbData[i * 2] = t.rot; bbData[i * 2 + 1] = t.variant; });
  q.setAttribute('aBB', new THREE.InstancedBufferAttribute(bbData, 2));
  const m = new THREE.MeshStandardMaterial({ map: atlas.texture, color: new THREE.Color(2, 2, 2), alphaTest: 0.5, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.5 });
  m.onBeforeCompile = s => {
    Object.assign(s.uniforms, uniforms, { uRows: { value: atlas.rows } });
    s.vertexShader = 'attribute vec2 aBB; uniform vec3 uViewPos; uniform vec2 uFade; uniform float uRows; varying float vTreeD; varying float vFarK;\n' + s.vertexShader
      .replace('#include <uv_vertex>', `
        vec3 bbC = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 bbT = uViewPos - bbC; bbT.y = 0.0; bbT = normalize(bbT + vec3(1e-4, 0.0, 0.0));
        float bbA = atan(bbT.x, bbT.z) - aBB.x;                       // view azimuth in the tree's own frame
        float bbI = mod(floor(bbA / 0.785398 + 0.5), 8.0);
        vUv = vec2((bbI + uv.x) / 8.0, (aBB.y + uv.y) / uRows);`)
      .replace('#include <beginnormal_vertex>', `
        vec3 bbR = vec3(bbT.z, 0.0, -bbT.x);
        vec3 objectNormal = normalize(bbT * 0.7 + vec3(0.0, 0.75, 0.0));`)
      .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalize((viewMatrix * vec4(objectNormal, 0.0)).xyz);')
      .replace('#include <project_vertex>', `
        vTreeD = distance(bbC, uViewPos);
        vFarK = 1.0 - 0.5 * smoothstep(58.0, 80.0, length(bbC.xz));   // the outer islands' trees fog as their islands do (IL_LOOK.fogK)
        float bbSX = length(instanceMatrix[0].xyz), bbSY = length(instanceMatrix[1].xyz);
        vec3 bbW = bbC + (bbR * transformed.x * bbSX + vec3(0.0, transformed.y * bbSY, 0.0)) * step(uFade.x - 0.5, vTreeD);
        vec4 mvPosition = viewMatrix * vec4(bbW, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
    s.fragmentShader = 'uniform vec2 uFade; varying float vTreeD; varying float vFarK;\n' + s.fragmentShader.replace('void main() {', `void main() {
      if (fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) >= smoothstep(uFade.x, uFade.y, vTreeD)) discard;`)
      .replace('#include <fog_fragment>', `
      #ifdef USE_FOG
        #ifdef FOG_EXP2
          float fdK = fogDepth * vFarK;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, 1.0 - exp(-fogDensity * fogDensity * fdK * fdK));
        #else
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, smoothstep(fogNear, fogFar, fogDepth));
        #endif
      #endif`);
  };
  const bb = new THREE.InstancedMesh(q, m, list.length);
  const M = new THREE.Matrix4(), P = new THREE.Vector3(), S = new THREE.Vector3(), Q = new THREE.Quaternion();
  list.forEach((t, i) => bb.setMatrixAt(i, M.compose(P.set(t.x, t.y - 0.05 * t.s, t.z), Q, S.set(atlas.W * t.s, atlas.H * t.s, 1))));
  bb.frustumCulled = false; bb.castShadow = bb.receiveShadow = false; bb.userData.dynamic = true;
  return bb;
}

export function createScatter(ctx) {
  const { scene, renderer } = ctx;
  const SC = CONFIG.scatter, TC = CONFIG.trees;
  THIN.uKeep.value.set(TC.keep[0], TC.keep[1], TC.keep[2], TC.grow); THIN.uFade.value.set(TC.fade[0], TC.fade[1]);
  setSeed(CONFIG.world.seed); // isolate the world from the diorama's random stream
  const onLand = (x, z, m) => coastDist(x, z) > m; // m metres inland from the waterline

  /* ---- placement ---- */
  const treePts = placer(SC.minSpacing);
  function scatterTrees(count, density, scale, spacing) {
    const inst = []; let tries = 0;
    while (inst.length < count && tries < count * 60) {
      tries++;
      const x = rr(-WORLD_HALF, WORLD_HALF), z = rr(-WORLD_HALF, WORLD_HALF);
      if (!onLand(x, z, CONFIG.island.beachWidth + 2) || excluded(x, z, 1.5)) continue;
      if (rng() > density(x, z)) continue;
      if (!treePts.tryAdd(x, z, spacing)) continue;
      inst.push({ x, y: H(x, z), z, s: rr(scale[0], scale[1]), rot: rng() * 6.28, variant: Math.floor(rng() * TC.variants) });
    }
    return inst;
  }
  // spruces: groves between the meadow and the beach, a few loners in the meadow
  // (anything that would stand on a path, the bridge or a bench is dropped afterwards, so nothing else moves)
  const spruceAll = scatterTrees(SC.spruceCount, (x, z) => 0.03 + 0.97 * forest(x, z), TC.spruceScale, SC.minSpacing), spruce = spruceAll.filter(t => walkwayDist(t.x, t.z) > 1.1 && Math.hypot(t.x - STONES.x, t.z - STONES.z) > STONES.r + 1.8);   // (and none in the stone ring)
  // apple trees: open meadow ring around the clearing, away from the forest
  const appleAll = scatterTrees(SC.appleCount, (x, z) => { const r = Math.hypot(x, z); return (1 - forest(x, z)) * smooth(SC.clearingRadius - 4, SC.clearingRadius + 2, r) * (1 - smooth(30, 42, r)); }, TC.appleScale, 5), apple = appleAll.filter(t => walkwayDist(t.x, t.z) > 1.1);

  /* ---- rocks ---- */
  const RC = CONFIG.rocks, rockSet = createRockVariants(RC.variants, RC.nearDetail, RC.farDetail);
  const rocks = rockSet.variants.map(() => []), rocksAll = [];
  { const rp = placer(1.2); let n = 0, tries = 0;
    while (n < SC.rockCount && tries < SC.rockCount * 60) {
      tries++;
      const x = rr(-WORLD_HALF, WORLD_HALF), z = rr(-WORLD_HALF, WORLD_HALF);
      if (!onLand(x, z, 1.5) || excluded(x, z, 0.8)) continue;       // boulders reach down onto the beach
      const big = rng() < 0.2, s = big ? rr(0.9, 1.9) : rr(0.25, 0.8);
      if (rng() > 0.25 + 0.75 * Math.max(forest(x, z), 1 - smooth(0, 6, coastDist(x, z) - CONFIG.island.beachWidth))) continue; // woods and shore
      if (treePts.pts.some(p => Math.hypot(p.x - x, p.z - z) < 0.6 + s * 0.5)) continue;
      if (!rp.tryAdd(x, z, s * 1.2)) continue;
      const k = Math.floor(rng() * rockSet.variants.length);
      rocks[k].push({ x, y: H(x, z) - s * 0.12, z, s, rot: rng() * 6.28, tilt: rr(-0.15, 0.15) });
      n++;
    }
    rocksAll.push(...rocks.map(l => l.slice())); rocks.forEach((l, k) => { rocks[k] = l.filter(r => walkwayDist(r.x, r.z) > r.s * 1.1 + 0.2 && caveDist(r.x, r.z) > r.s * 0.3); });   // none on the walkways or in the cave's knoll
  }
  // the outer islands' and the lighthouse rock's boulders (world/islandLife.js; Ember Rock's dark), after the island's own
  const life = islandLife();
  life.rocks.forEach(r => rocks[Math.floor(r.v * rocks.length)].push({ x: r.x, y: r.y, z: r.z, s: r.s, rot: r.rot, tilt: r.tilt, dark: r.dark }));
  // seat every boulder on the ground: its mesh's lower part against the terrain under it, lowered until no part of its
  // underside hangs in the air (on a slope its centre's height left the downhill side floating); sea stacks stay as set
  const rockFit = { n: 0, floating: 0, maxGap: 0 };
  { const Mf = new THREE.Matrix4(), Qf = new THREE.Quaternion(), Ef = new THREE.Euler(), Pf = new THREE.Vector3(), Sf = new THREE.Vector3(), vf = new THREE.Vector3();
    // each variant's underside rim (its lowest eighth), and how high that rim stands over flat ground as placed (y - 0.12 s)
    const low = rockSet.variants.map(v => { const p = v.near.attributes.position, b = v.near.boundingBox || (v.near.computeBoundingBox(), v.near.boundingBox), cut = b.min.y + (b.max.y - b.min.y) * 0.13, out = [];
      let top = -Infinity; for (let i = 0; i < p.count; i++) if (p.getY(i) < cut) { out.push(new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i))); top = Math.max(top, p.getY(i)); } out.flat = top - 0.12; return out; });
    rocks.forEach((list, k) => list.forEach(r => {
      if (H(r.x, r.z) < r.y - r.s * 0.5) return;   // (standing in the sea)
      Mf.compose(Pf.set(r.x, r.y, r.z), Qf.setFromEuler(Ef.set(r.tilt, r.rot, 0)), Sf.setScalar(r.s));
      let gap = -Infinity; for (const q of low[k]) { vf.copy(q).applyMatrix4(Mf); gap = Math.max(gap, vf.y - H(vf.x, vf.z)); }
      gap -= low[k].flat * r.s;   // (more than on flat ground: hanging over a slope)
      rockFit.n++; if (gap > 0.02) { rockFit.floating++; rockFit.maxGap = Math.max(rockFit.maxGap, gap); r.y -= gap; }
    })); }

  /* ---- full-detail tree variants (each built from its own seed, after all placement draws) ---- */
  const spruceV = createSpruceVariants(ctx, TC.variants, CONFIG.world.seed + 101);
  const appleV = createAppleVariants(ctx, TC.variants, CONFIG.world.seed + 202);
  // the outer islands' trees: the same spruces and apples, and their own species (assets/trees/islandTrees.js)
  const IV = TC.islandVariants, islandV = { spruce: spruceV, apple: appleV, birch: createBirchVariants(ctx, IV, CONFIG.world.seed + 303), willow: createWillowVariants(ctx, IV, CONFIG.world.seed + 404),
    palm: createPalmVariants(ctx, IV, CONFIG.world.seed + 505), snag: createSnagVariants(ctx, IV, CONFIG.world.seed + 606) };
  const isl = {};
  for (const sp in life.trees) isl[sp] = life.trees[sp].map(t => ({ x: t.x, y: t.y, z: t.z, s: t.s, rot: t.lean !== undefined ? -t.lean + (t.v - 0.5) * 0.6 : t.rot, pitch: t.pitch, variant: Math.floor(t.v * islandV[sp].length) }));   // (a palm leans out to sea)

  /* ---- colliders ---- */
  spruce.forEach(t => obstacles.add(t.x, t.z, spruceV[t.variant].trunkRadius * t.s + 0.2, t.y + spruceV[t.variant].height * t.s));
  apple.forEach(t => obstacles.add(t.x, t.z, appleV[t.variant].trunkRadius * t.s + 0.2, t.y + 1.6 * t.s));
  for (const sp in isl) isl[sp].forEach(t => { const v = islandV[sp][t.variant]; obstacles.add(t.x, t.z, v.trunkRadius * t.s + 0.2, t.y + Math.min(v.height, 2.5) * t.s); });
  // boulders: rotated ellipsoids fitted to each variant's mesh, in the outcrop's collider format (radii padded by 0.2),
  // so the controls can stand on low ones and push the player (0.25 m body) around tall ones
  rocks.forEach((list, k) => list.forEach(r => { const e = rockSet.variants[k].ellipsoid;
    rockBodies.add({ x: r.x + (Math.cos(r.rot) * e.cx + Math.sin(r.rot) * e.cz) * r.s, y: r.y + e.cy * r.s, z: r.z + (-Math.sin(r.rot) * e.cx + Math.cos(r.rot) * e.cz) * r.s,
      rx: e.rx * r.s + 0.2, ry: e.ry * r.s + 0.2, rz: e.rz * r.s + 0.2, rot: r.rot, body: 0.25 }); }));

  /* ---- tree meshes: one small group per tree, everything shared with its variant ---- */
  const trees = plantGroups(scene, spruce, spruceV, 'spruce').concat(plantGroups(scene, apple, appleV, 'apple'));
  // (after the island's own: the apples you can pick keep their order; the islands' spruces are no squirrel's)
  for (const sp in isl) trees.push(...plantGroups(scene, isl[sp], islandV[sp], sp === 'spruce' ? 'islandSpruce' : sp));
  const bbs = [];
  if (spruce.length) bbs.push(seasonalBillboards(renderer, spruceV, TC.billboardTile, spruce.concat(isl.spruce)));
  if (apple.length) bbs.push(seasonalBillboards(renderer, appleV, TC.billboardTile, apple.concat(isl.apple)));
  for (const sp of ['birch', 'willow', 'palm', 'snag']) if (isl[sp].length) bbs.push(seasonalBillboards(renderer, islandV[sp], TC.billboardTile, isl[sp]));
  /** Bake every seasonal billboard again as it looks in this season (world/seasons.js): trees, bushes, the plot's. */
  const rebake = rebakeBillboards;
  bbs.forEach(b => scene.add(b));

  /* ---- rocks: full-detail mesh per rock near the camera, one instanced far mesh per variant, cross-faded like the trees ---- */
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), Sv = new THREE.Vector3(), E = new THREE.Euler();
  const nearRocks = [], DARK = new THREE.Color(0.34, 0.31, 0.3), WHITE = new THREE.Color(1, 1, 1);   // Ember Rock's basalt: the sandstone paint darkened
  const nearDark = rockSet.nearMat.clone(); nearDark.onBeforeCompile = rockSet.nearMat.onBeforeCompile; nearDark.color.copy(DARK);
  rockSet.variants.forEach((v, k) => {
    if (!rocks[k].length) return;
    const far = new THREE.InstancedMesh(v.far, rockSet.farMat, rocks[k].length);
    rocks[k].forEach((t, i) => {
      far.setMatrixAt(i, M.compose(P.set(t.x, t.y, t.z), Q.setFromEuler(E.set(t.tilt, t.rot, 0)), Sv.setScalar(t.s)));
      far.setColorAt(i, t.dark ? DARK : WHITE);
      const m = new THREE.Mesh(v.near, t.dark ? nearDark : rockSet.nearMat); m.matrix.copy(M); m.matrixAutoUpdate = false; m.matrixWorldNeedsUpdate = true;
      m.castShadow = m.receiveShadow = true; m.customDepthMaterial = rockSet.nearDepth; m.visible = false; m.userData.dynamic = true;
      scene.add(m); nearRocks.push({ m, p: new THREE.Vector3(t.x, t.y, t.z) });
    });
    far.castShadow = far.receiveShadow = true; far.customDepthMaterial = rockSet.farDepth; scene.add(far);
  });

  /* ---- per frame: the thinning's camera position; per tree, how many of its (rank-sorted) parts to draw, and hide
     trees that have fully become billboards. One distance and a few binary searches per tree. ---- */
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  const hideBeyond = TC.fade[1] + 1;
  const stats = { rockFit, trees: trees.length, rocks: rocks.reduce((s, l) => s + l.length, 0), near: 0, far: 0, cards: 0, nearRocks: 0 };
  function update(camera, withStats) {
    const c = camera.position; THIN.uViewPos.value.copy(c);
    for (const r of nearRocks) r.m.visible = r.p.distanceTo(c) < hideBeyond;   // the far mesh covers the rest
    updateGroups(trees, c);
    if (!withStats) return;
    // what the GPU draws this frame: foliage cards of trees in view, after thinning (exact, from the sorted ranks)
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    stats.near = stats.far = stats.cards = 0; stats.nearRocks = nearRocks.filter(r => r.m.visible).length;
    for (const tr of trees) {
      if (!frustum.intersectsSphere(tr.sphere)) continue;
      const d = tr.g.position.distanceTo(c);
      if (d < TC.fade[1]) { stats.near++; stats.cards += survivors(tr.v.cardRanks, keepAt(d)); } else stats.far++;
    }
  }
  // placed: everything as placed, before the walkways were cleared (the undergrowth avoids these, so its own draws are unchanged)
  return { update, stats, spruce, apple, rocks, trees, rebake, placed: { spruce: spruceAll, apple: appleAll, rocks: rocksAll } };
}
