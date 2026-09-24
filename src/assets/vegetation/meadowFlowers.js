import * as THREE from 'three';
import { isTouch } from '../../core/env.js';
import { rng, rr } from '../../core/random.js';
import { V, lin } from '../../core/math.js';
import { fbm2 } from '../../core/noise.js';
import { paint, mergeGeos } from '../../core/geometry.js';
import { addWorldSway } from '../../core/shaderPatches.js';
import { WATER_Y, houseRectDist, inRocks, inRose, CON, APP, H, H0, streamDist, footpathDist, chestDist } from '../../world/layout.js';

/** Flower head (white petals + yellow centre, tinted per instance) and stem, shared with the island's flowers. */
export function flowerGeometries() {
  const petals = new THREE.CircleGeometry(0.021, 10); petals.rotateX(-Math.PI / 2); petals.translate(0, 0.28, 0);
  const center = new THREE.SphereGeometry(0.0075, 8, 5); center.scale(1, 0.55, 1); center.translate(0, 0.285, 0);
  petals.computeVertexNormals(); center.computeVertexNormals();
  paint(petals, c => c.setRGB(1, 1, 1)); paint(center, c => c.copy(lin(0xe6b422)));
  const headGeo = mergeGeos([petals, center], ['position', 'normal', 'color']);
  const stemGeo = new THREE.CylinderGeometry(0.0013, 0.0018, 0.28, 4); stemGeo.translate(0, 0.14, 0);
  return { headGeo, stemGeo };
}
/** Tint of one flower from a random value r: mostly white daisies, some buttercups, a few lilac. */
export function flowerTint(r) { return r < 0.68 ? new THREE.Color(1, 1, 0.97) : r < 0.88 ? new THREE.Color(1.0, 0.82, 0.12) : new THREE.Color(0.72, 0.6, 1.0); }

/**
 * Instanced daisies, buttercups and lilac wildflowers.
 */
export function createMeadowFlowers(ctx) {
  const { scene } = ctx;
  {
    const { headGeo, stemGeo } = flowerGeometries();
    const mats = []; const tints = [];
    let tries = 0;
    const N = isTouch ? 170 : 260;
    while (mats.length < N && tries < 8000) {
      tries++;
      const x = rr(-4.8, 4.8), z = rr(-4.8, 4.8), h = H0(x, z);   // uncarved: the same draws as before the stream
      if (h - WATER_Y < 0.1 || houseRectDist(x, z) < 0.6 || inRocks(x, z, 0.35) || inRose(x, z, 0.75) || Math.hypot(x - CON.x, z - CON.z) < 1.7 || Math.hypot(x - APP.x, z - APP.z) < 0.5) continue;
      if (fbm2(x * 0.7 + 20, z * 0.7) < -0.05) continue;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rr(-0.15, 0.15), rng() * 6.28, rr(-0.15, 0.15)));
      mats.push(new THREE.Matrix4().compose(new V(x, H(x, z) - 0.02, z), q, new V(1, rr(0.75, 1.25), 1).multiplyScalar(rr(0.85, 1.15) * (streamDist(x, z) < 0.35 || footpathDist(x, z) < 0.08 || chestDist(x, z) < 0.08 ? 1e-4 : 1))));   // none in the stream or on the path
      tints.push(flowerTint(rng()));
    }
    const hMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide }); addWorldSway(hMat, 0.7);
    const sMat = new THREE.MeshStandardMaterial({ color: lin(0x4d7328), roughness: 0.8 }); addWorldSway(sMat, 0.7);
    const hm = new THREE.InstancedMesh(headGeo, hMat, mats.length), sm = new THREE.InstancedMesh(stemGeo, sMat, mats.length);
    mats.forEach((m, i) => { hm.setMatrixAt(i, m); sm.setMatrixAt(i, m); hm.setColorAt(i, tints[i]); });
    if (hm.instanceColor) hm.instanceColor.needsUpdate = true;
    hm.receiveShadow = sm.receiveShadow = true; hm.castShadow = true;
    scene.add(hm, sm);
  }
}
