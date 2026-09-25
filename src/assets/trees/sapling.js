import * as THREE from 'three';
import { V, lin } from '../../core/math.js';
import { mergeGeos, limb } from '../../core/geometry.js';
import { addFlutter } from '../../core/shaderPatches.js';

/**
 * Saplings you plant (#7; app/planting.js): a young apple tree (a slim bark trunk, a few branches, leaf clusters; the
 * island's apple leaves' seasons: blossom, autumn colours, bare in winter, role 'leaf') and a young spruce (whorls of
 * branches with needle sprays, a dusting of snow in winter, role 'needles'), each ~1.8 m at full size. One instanced
 * mesh per part (4 draw calls and their shadows for all of them); set(list) places them, each at its growth's scale.
 * Its own random numbers.
 */
export function createSaplings(ctx, max) {
  const { scene, tex } = ctx;
  let seed = 7717; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();
  const card = (w, h, p, dir, up) => {   // a leaf / needle card at p, lying along dir, facing roughly up
    const g = new THREE.PlaneGeometry(w, h); g.translate(0, h / 2, 0);
    const y = dir.clone().normalize(), z = up.clone().addScaledVector(y, -up.dot(y)).normalize(), x = new V().crossVectors(y, z);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z)); g.translate(p.x, p.y, p.z); return g;
  };
  const spray = (len, w, p, dir, up) => {   // a needle spray at p along dir (the texture's twig runs along u), facing roughly `up`
    const g = new THREE.PlaneGeometry(len, w); g.translate(len / 2, 0, 0);
    const x = dir.clone().normalize(), z = up.clone().addScaledVector(x, -up.dot(x)).normalize(), y = new V().crossVectors(z, x);
    g.applyMatrix4(new THREE.Matrix4().makeBasis(x, y, z)); g.translate(p.x, p.y, p.z); return g;
  };
  /* ---- the young apple tree ---- */
  const aw = [], al = [], top = new V(rr(-0.04, 0.04), 1.35, rr(-0.04, 0.04));
  aw.push(limb(new V(0, -0.05, 0), top, 0.034, 0.011, 7, 4));
  for (let b = 0; b < 6; b++) {
    const t = 0.45 + b * 0.09, a = b * 2.4 + rr(-0.3, 0.3), len = rr(0.3, 0.5) * (1.1 - t * 0.5), from = top.clone().multiplyScalar(t);
    const to = from.clone().add(new V(Math.cos(a) * len, len * rr(0.55, 0.9), Math.sin(a) * len));
    aw.push(limb(from, to, 0.013, 0.004, 5, 1));
    for (let tw = 0; tw < 2; tw++) {   // side twigs
      const k = rr(0.35, 0.8), f2 = from.clone().lerp(to, k), t2 = f2.clone().add(new V(rr(-0.18, 0.18), rr(0.05, 0.16), rr(-0.18, 0.18)));
      aw.push(limb(f2, t2, 0.005, 0.002, 4, 1));
      for (let l = 0; l < 10; l++) al.push(card(0.11, 0.14, f2.clone().lerp(t2, rr(0.2, 1.1)).add(new V(rr(-0.06, 0.06), rr(-0.04, 0.06), rr(-0.06, 0.06))), new V(rr(-1, 1), rr(-0.2, 1), rr(-1, 1)), new V(rr(-0.6, 0.6), 1, rr(-0.6, 0.6))));
    }
    for (let l = 0; l < 22; l++) { const k = rr(0.3, 1.1), p = from.clone().lerp(to, k).add(new V(rr(-0.09, 0.09), rr(-0.06, 0.09), rr(-0.09, 0.09))); al.push(card(0.11, 0.14, p, new V(rr(-1, 1), rr(-0.2, 1), rr(-1, 1)), new V(rr(-0.6, 0.6), 1, rr(-0.6, 0.6)))); }
  }
  for (let l = 0; l < 60; l++) { const p = top.clone().add(new V(rr(-0.24, 0.24), rr(-0.25, 0.22), rr(-0.24, 0.24))); al.push(card(0.11, 0.14, p, new V(rr(-1, 1), rr(-0.2, 1), rr(-1, 1)), new V(rr(-0.6, 0.6), 1, rr(-0.6, 0.6)))); }
  /* ---- the young spruce ---- */
  const sw = [], sn = [], H = 1.7;
  sw.push(limb(new V(0, -0.05, 0), new V(0, H, 0), 0.03, 0.006, 6, 4));
  for (let w = 0; w < 7; w++) {
    const y = 0.25 + w * 0.2, n = 5, len = 0.62 * (1 - (y - 0.2) / H) + 0.08;
    for (let b = 0; b < n; b++) {
      const a = b / n * Math.PI * 2 + w * 0.7 + rr(-0.2, 0.2), from = new V(0, y, 0), dir = new V(Math.cos(a), -0.12 + rr(-0.05, 0.1), Math.sin(a));
      const to = from.clone().addScaledVector(dir, len); sw.push(limb(from, to, 0.008, 0.003, 4, 1));
      const side = new V(-dir.z, 0, dir.x).normalize();
      sn.push(spray(len * 1.05, 0.13, from, dir, new V(0, 1, 0)));   // the branch's own spray, flat
      for (let c = 0; c < 3; c++) for (const tilt of [-0.8, 0.8]) {   // side sprays in V pairs, so it shows from the side too
        const p = from.clone().lerp(to, 0.2 + c * 0.25), up = new V(0, 1, 0).multiplyScalar(Math.cos(tilt)).addScaledVector(side, Math.sin(tilt));
        const d = dir.clone().multiplyScalar(0.7).addScaledVector(side, Math.sign(tilt) * 0.7).add(new V(0, rr(-0.05, 0.12), 0));
        sn.push(spray(len * (0.5 - c * 0.08), 0.1, p, d, up));
      }
    }
  }
  for (let c = 0; c < 4; c++) sn.push(spray(0.3, 0.11, new V(0, H - 0.28, 0), new V(rr(-0.15, 0.15), 1, rr(-0.15, 0.15)), new V(Math.cos(c * 1.6), 0, Math.sin(c * 1.6))));   // the leader
  const wood = new THREE.MeshStandardMaterial({ map: tex.barkTex, color: lin(0x8a7a66), roughness: 0.9 });
  const leaf = new THREE.MeshStandardMaterial({ map: tex.leafTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.75, envMapIntensity: 0.5, userData: { season: 'leaf' } }); addFlutter(leaf, 0.012);
  const needle = new THREE.MeshStandardMaterial({ map: tex.needleTex, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.8, envMapIntensity: 0.5, userData: { season: 'needles' } });
  const parts = {
    apple: [[mergeGeos(aw, ['position', 'normal', 'uv']), wood], [mergeGeos(al, ['position', 'normal', 'uv']), leaf]],
    spruce: [[mergeGeos(sw, ['position', 'normal', 'uv']), wood], [mergeGeos(sn, ['position', 'normal', 'uv']), needle]],
  };
  const meshes = {};
  for (const [sp, list] of Object.entries(parts)) meshes[sp] = list.map(([g, m]) => { const im = new THREE.InstancedMesh(g, m, max); im.count = 0; im.castShadow = im.receiveShadow = true; im.frustumCulled = false; im.userData.dynamic = true; scene.add(im); return im; });
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new V(), P = new V(), Y = new V(0, 1, 0);
  /** Place the saplings: [{ species: 'apple' | 'spruce', x, y, z, yaw, s }] (s: 0..1, its size now). */
  function set(list) {
    for (const sp of ['apple', 'spruce']) {
      const mine = list.filter(t => t.species === sp);
      meshes[sp].forEach(im => { mine.forEach((t, i) => im.setMatrixAt(i, M.compose(P.set(t.x, t.y, t.z), Q.setFromAxisAngle(Y, t.yaw), S.setScalar(Math.max(0.02, t.s))))); im.count = mine.length; im.instanceMatrix.needsUpdate = true; });
    }
  }
  return { set, meshes };
}
