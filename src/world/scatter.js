import * as THREE from 'three';
import { setSeed, rng, rr } from '../core/random.js';
import { smooth } from '../core/math.js';
import { CONFIG } from '../config.js';
import { H, WORLD_HALF, forest, excluded, coastDist } from './layout.js';
import { obstacles } from './bounds.js';
import { createSprucePrototype } from '../assets/trees/spruce.js';
import { createApplePrototype } from '../assets/trees/appleTree.js';
import { createRockPrototypes } from '../assets/rocks/scatteredRocks.js';

/**
 * Seeded scatter of trees and rocks over the world, drawn with InstancedMesh.
 *
 * A prototype is { height, width, trunkRadius?, lods: [{ parts: [{ geometry, material, castShadow, depthMaterial? }] }] }
 * (see createSprucePrototype). A GLB model can be dropped in by building the same object from its meshes.
 * Trees get 2 mesh LODs plus a camera-facing billboard whose texture is rendered from LOD 0 at load.
 * Every frame the instances are re-bucketed on the CPU (a few hundred distance + frustum tests) and the
 * visible matrices are written into each LOD's InstancedMesh; only the used part of the buffer is uploaded.
 */

// Poisson-ish rejection sampling on a hash grid
function placer(minDist) {
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

/** Render the prototype's LOD 0 from the side into a texture (albedo only; lit at runtime as a billboard). */
function bakeImpostor(renderer, proto, res = 256) {
  const w = proto.width, h = proto.height, aspect = w / h, H2 = res * 2, W2 = Math.max(32, Math.round(H2 * aspect / 32) * 32);
  const rt = new THREE.WebGLRenderTarget(W2, H2, { format: THREE.RGBAFormat, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter });
  rt.texture.encoding = THREE.sRGBEncoding;
  const sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-w / 2, w / 2, h, 0, -50, 50);
  cam.position.set(0, 0, 10); cam.lookAt(0, 0, 0);
  for (const part of proto.lods[0].parts) {
    const m = part.material, mb = new THREE.MeshBasicMaterial({ map: m.map, color: m.color, vertexColors: m.vertexColors, alphaTest: m.alphaTest || 0, side: THREE.DoubleSide, toneMapped: false, fog: false });
    // slight top-lit shading so the flat impostor keeps some volume
    mb.onBeforeCompile = s => { s.vertexShader = 'varying float vUp;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vUp = normal.y * 0.5 + 0.5;'); s.fragmentShader = 'varying float vUp;\n' + s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 0.62 + 0.45 * vUp;'); };
    const bm = new THREE.Mesh(part.geometry, mb); bm.frustumCulled = false; sc.add(bm);
  }
  const prevRT = renderer.getRenderTarget(), prevCol = renderer.getClearColor(new THREE.Color()), prevA = renderer.getClearAlpha();
  const prevSM = renderer.shadowMap.enabled; renderer.shadowMap.enabled = false;
  renderer.setRenderTarget(rt); renderer.setClearColor(0x2d4a24, 0); renderer.clear(); renderer.render(sc, cam);
  renderer.setRenderTarget(prevRT); renderer.setClearColor(prevCol, prevA); renderer.shadowMap.enabled = prevSM;
  sc.traverse(o => { if (o.material) o.material.dispose(); });
  return rt.texture;
}

/** Camera-facing (cylindrical) billboard material: an InstancedMesh of unit quads, each turned towards the camera. */
function billboardMaterial(tex) {
  const m = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, roughness: 0.9, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.5 });
  m.onBeforeCompile = s => {
    s.vertexShader = s.vertexShader
      .replace('#include <beginnormal_vertex>', `
        vec3 bbC = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec3 bbT = cameraPosition - bbC; bbT.y = 0.0; bbT = normalize(bbT + vec3(1e-4, 0.0, 0.0));
        vec3 bbR = vec3(bbT.z, 0.0, -bbT.x);
        vec3 objectNormal = normalize(bbT * 0.7 + vec3(0.0, 0.75, 0.0));`)
      .replace('#include <defaultnormal_vertex>', 'vec3 transformedNormal = normalize((viewMatrix * vec4(objectNormal, 0.0)).xyz);')
      .replace('#include <project_vertex>', `
        float bbSX = length(instanceMatrix[0].xyz), bbSY = length(instanceMatrix[1].xyz);
        vec3 bbW = bbC + bbR * transformed.x * bbSX + vec3(0.0, transformed.y * bbSY, 0.0);
        vec4 mvPosition = viewMatrix * vec4(bbW, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
  };
  return m;
}

export function createScatter(ctx) {
  const { scene, renderer } = ctx;
  const SC = CONFIG.scatter;
  setSeed(CONFIG.world.seed); // isolate the world from the diorama's random stream

  const species = [];
  const onLand = (x, z, m) => coastDist(x, z) > m; // m metres inland from the waterline

  /* ---- placement ---- */
  const treePts = placer(SC.minSpacing);
  function scatterTrees(proto, count, density, sMin, sMax, spacing) {
    const inst = []; let tries = 0;
    while (inst.length < count && tries < count * 60) {
      tries++;
      const x = rr(-WORLD_HALF, WORLD_HALF), z = rr(-WORLD_HALF, WORLD_HALF);
      if (!onLand(x, z, CONFIG.island.beachWidth + 2) || excluded(x, z, 1.5)) continue;
      if (rng() > density(x, z)) continue;
      if (!treePts.tryAdd(x, z, spacing)) continue;
      const s = rr(sMin, sMax);
      inst.push({ x, y: H(x, z), z, s, rot: rng() * 6.28 });
    }
    return inst;
  }
  const spruceP = createSprucePrototype(ctx, 10);
  const appleP = createApplePrototype(ctx);
  // spruces: groves between the meadow and the beach, a few loners in the meadow
  const spruce = scatterTrees(spruceP, SC.spruceCount, (x, z) => 0.03 + 0.97 * forest(x, z), 0.7, 1.35, SC.minSpacing);
  // apple trees: open meadow ring around the clearing, away from the forest
  const apple = scatterTrees(appleP, SC.appleCount, (x, z) => { const r = Math.hypot(x, z); return (1 - forest(x, z)) * smooth(SC.clearingRadius - 4, SC.clearingRadius + 2, r) * (1 - smooth(30, 42, r)); }, 0.8, 1.2, 5);

  /* ---- rocks ---- */
  const rockProtos = createRockPrototypes(3);
  const rocks = rockProtos.map(() => []);
  { const rp = placer(1.2); let n = 0, tries = 0;
    while (n < SC.rockCount && tries < SC.rockCount * 60) {
      tries++;
      const x = rr(-WORLD_HALF, WORLD_HALF), z = rr(-WORLD_HALF, WORLD_HALF);
      if (!onLand(x, z, 1.5) || excluded(x, z, 0.8)) continue;       // boulders reach down onto the beach
      const big = rng() < 0.2, s = big ? rr(0.9, 1.9) : rr(0.25, 0.8);
      if (rng() > 0.25 + 0.75 * Math.max(forest(x, z), 1 - smooth(0, 6, coastDist(x, z) - CONFIG.island.beachWidth))) continue; // woods and shore
      if (treePts.pts.some(p => Math.hypot(p.x - x, p.z - z) < 0.6 + s * 0.5)) continue;
      if (!rp.tryAdd(x, z, s * 1.2)) continue;
      const k = Math.floor(rng() * rockProtos.length);
      rocks[k].push({ x, y: H(x, z) - s * 0.12, z, s, rot: rng() * 6.28, tilt: rr(-0.15, 0.15) });
      n++;
    }
  }

  /* ---- colliders ---- */
  spruce.forEach(t => obstacles.add(t.x, t.z, spruceP.trunkRadius * t.s + 0.2, t.y + spruceP.height * t.s));
  apple.forEach(t => obstacles.add(t.x, t.z, appleP.trunkRadius * t.s + 0.2, t.y + 1.6 * t.s));
  rocks.forEach(list => list.forEach(r => { if (r.s > 0.45) obstacles.add(r.x, r.z, r.s * 0.75 + 0.15, r.y + r.s * 0.8); }));

  /* ---- meshes ---- */
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), Sv = new THREE.Vector3(), E = new THREE.Euler();
  function matrices(list) {
    const arr = new Float32Array(list.length * 16);
    list.forEach((t, i) => { Q.setFromEuler(E.set(t.tilt || 0, t.rot, 0)); M.compose(P.set(t.x, t.y, t.z), Q, Sv.setScalar(t.s)); M.toArray(arr, i * 16); });
    return arr;
  }
  function lodMeshes(lod, n) {
    return lod.parts.map(part => {
      const im = new THREE.InstancedMesh(part.geometry, part.material, n);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = !!part.castShadow; im.receiveShadow = true; im.count = 0; im.userData.dynamic = true;  // geometry.boundingSphere: set per frame in update()
      if (part.depthMaterial) im.customDepthMaterial = part.depthMaterial;
      scene.add(im); return im;
    });
  }
  function addSpecies(proto, list, withBillboard) {
    if (!list.length) return;
    const lods = proto.lods.map(l => lodMeshes(l, list.length));
    if (withBillboard) {
      const tex = proto.impostor || (proto.impostor = bakeImpostor(renderer, proto));
      const q = new THREE.PlaneGeometry(1, 1); q.translate(0, 0.5, 0);
      const bb = new THREE.InstancedMesh(q, billboardMaterial(tex), list.length);
      bb.instanceMatrix.setUsage(THREE.DynamicDrawUsage); bb.frustumCulled = false; bb.count = 0; bb.userData.dynamic = true; bb.receiveShadow = false; bb.castShadow = false;
      scene.add(bb); lods.push([bb]);
    }
    species.push({
      proto, list, lods, mats: matrices(list), billboard: withBillboard,
      bbMats: withBillboard ? (() => { const a = new Float32Array(list.length * 16); list.forEach((t, i) => { M.compose(P.set(t.x, t.y - 0.1 * t.s, t.z), Q.identity(), Sv.set(proto.width * t.s, proto.height * t.s, 1)); M.toArray(a, i * 16); }); return a; })() : null,
      cur: new Int8Array(list.length).fill(-1),
      radius: list.map(t => Math.max(proto.width, proto.height) * 0.6 * t.s),
    });
  }
  addSpecies(spruceP, spruce, true);
  addSpecies(appleP, apple, true);
  rockProtos.forEach((p, i) => addSpecies(p, rocks[i], false));

  /* ---- per-frame LOD + culling ---- */
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4(), sph = new THREE.Sphere();
  const boxes = [new THREE.Box3(), new THREE.Box3(), new THREE.Box3()], rads = [0, 0, 0];
  const [d0, d1] = SC.lod, hy = SC.lodHysteresis, shadowR = CONFIG.light.shadowExtent / 2 + 4;
  const stats = { lod: [0, 0, 0], trees: spruce.length + apple.length, rocks: rocks.reduce((s, l) => s + l.length, 0) };
  function update(camera) {
    pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); frustum.setFromProjectionMatrix(pm);
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z;
    stats.lod[0] = stats.lod[1] = stats.lod[2] = 0;
    for (const sp of species) {
      const n = sp.lods.length, counts = new Array(n).fill(0), list = sp.list, rocksOnly = !sp.billboard;
      for (let l = 0; l < n; l++) { boxes[l].makeEmpty(); rads[l] = 0; }
      for (let i = 0; i < list.length; i++) {
        const t = list[i], d = Math.hypot(t.x - cx, t.y + sp.proto.height * t.s * 0.4 - cy, t.z - cz);
        let l = 0;
        if (!rocksOnly) {
          const c = sp.cur[i];
          const e0 = d0 + (c > 0 ? -hy : hy), e1 = d1 + (c > 1 ? -hy : hy);
          l = d < e0 ? 0 : d < e1 ? 1 : 2; sp.cur[i] = l;
        }
        sph.center.set(t.x, t.y + sp.proto.height * t.s * 0.45, t.z); sph.radius = sp.radius[i];
        const shadowCaster = l < 2 && Math.abs(t.x - cx) < shadowR && Math.abs(t.z - cz) < shadowR;
        if (!frustum.intersectsSphere(sph) && !shadowCaster) continue;
        const src = l === 2 ? sp.bbMats : sp.mats;
        for (const im of sp.lods[l]) im.instanceMatrix.array.set(src.subarray(i * 16, i * 16 + 16), counts[l] * 16);
        counts[l]++; boxes[l].expandByPoint(sph.center); rads[l] = Math.max(rads[l], sph.radius);
      }
      for (let l = 0; l < n; l++) for (const im of sp.lods[l]) {
        // world-space bounds of this frame's instances, so shadow passes (sun box, fireplace cube map) can cull the mesh
        if (counts[l]) { boxes[l].getBoundingSphere(im.geometry.boundingSphere || (im.geometry.boundingSphere = new THREE.Sphere())); im.geometry.boundingSphere.radius += rads[l]; }
        im.count = counts[l]; im.instanceMatrix.updateRange.count = counts[l] * 16; im.instanceMatrix.needsUpdate = true; }
      if (!rocksOnly) for (let l = 0; l < 3; l++) stats.lod[l] += counts[l] || 0;
    }
  }
  return { update, stats, spruce, apple, rocks };
}
