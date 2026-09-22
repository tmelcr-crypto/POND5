import * as THREE from 'three';
import { rng, rr } from '../../core/random.js';
import { V, lin } from '../../core/math.js';
import { addWorldSway } from '../../core/shaderPatches.js';
import { WATER_Y, LAKE, lakeR, H } from '../../world/layout.js';

/**
 * Reeds and cattails along the far bank (world-space wind sway).
 */
export function createReeds(ctx) {
  const { scene } = ctx;
  {
    const reedG = new THREE.CylinderGeometry(0.35, 1, 1, 5, 6); reedG.translate(0, 0.5, 0);
    const headG = new THREE.CylinderGeometry(1, 1, 1, 8, 1); headG.translate(0, 0.5, 0);
    const reeds = [], heads = [];
    let tries = 0;
    while (reeds.length < 110 && tries < 5000) {
      tries++;
      const a = rng() < 0.75 ? rr(3.4, 4.7) : rr(1.7, 2.3);
      const r = lakeR(a) * rr(0.86, 1.06), x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r, h = H(x, z);
      if (h < WATER_Y - 0.14 || h > WATER_Y + 0.06) continue;
      const len = rr(0.7, 1.45), lean = rr(0, 0.14), la = rng() * 6.28;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.cos(la) * lean, rng() * 6.28, Math.sin(la) * lean));
      const base = new V(x, h - 0.02, z), w = rr(0.006, 0.011);
      reeds.push(new THREE.Matrix4().compose(base, q, new V(w, len, w)));
      if (rng() < 0.42) {
        const upv = new V(0, 1, 0).applyQuaternion(q), hl = rr(0.12, 0.17);
        heads.push(new THREE.Matrix4().compose(base.clone().addScaledVector(upv, len * 0.8), q, new V(0.02, hl, 0.02)));
      }
    }
    const rMat = new THREE.MeshStandardMaterial({ color: lin(0x5f7d34), roughness: 0.7 }); addWorldSway(rMat, 0.07);
    const hMat = new THREE.MeshStandardMaterial({ color: lin(0x5a3a22), roughness: 0.95 }); addWorldSway(hMat, 0.07);
    const rm = new THREE.InstancedMesh(reedG, rMat, reeds.length); reeds.forEach((m, i) => rm.setMatrixAt(i, m));
    const hm = new THREE.InstancedMesh(headG, hMat, heads.length); heads.forEach((m, i) => hm.setMatrixAt(i, m));
    rm.castShadow = hm.castShadow = true; rm.receiveShadow = hm.receiveShadow = true;
    scene.add(rm, hm);
  }
}
