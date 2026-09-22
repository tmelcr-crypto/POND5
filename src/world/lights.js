import * as THREE from 'three';
import { CONFIG } from '../config.js';

/**
 * Sun/moon directional light with a soft shadow map, plus a hemisphere fill.
 * The shadow box (CONFIG.light.shadowExtent wide) follows the player; follow() snaps it to whole shadow-map
 * texels in light space so shadows don't shimmer while walking. timeOfDay sets sun.userData.dir.
 */
export function createLights(ctx) {
  const { scene } = ctx;
  const L = CONFIG.light;
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(L.shadowMapSize, L.shadowMapSize);
  const e = L.shadowExtent / 2;
  Object.assign(sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 0.5, far: L.shadowDistance * 2 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.022 * (L.shadowExtent / 17) * (4096 / L.shadowMapSize) * 0.5;
  sun.target.position.set(0, 0.5, 0);
  sun.userData.dir = new THREE.Vector3(0, 1, 0);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x3a4a22, 0.18); scene.add(hemi);

  const texel = L.shadowExtent / L.shadowMapSize, rot = new THREE.Matrix4(), inv = new THREE.Matrix4(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  function follow(p) {
    const dir = sun.userData.dir;
    // light-space basis; snap the box centre to the texel grid
    rot.lookAt(dir, new THREE.Vector3(), Math.abs(dir.y) > 0.99 ? new THREE.Vector3(0, 0, 1) : up); inv.copy(rot).invert();
    v.copy(p).applyMatrix4(inv); v.x = Math.round(v.x / texel) * texel; v.y = Math.round(v.y / texel) * texel; v.applyMatrix4(rot);
    sun.target.position.copy(v); sun.position.copy(dir).multiplyScalar(L.shadowDistance).add(v);
    sun.target.updateMatrixWorld();
  }
  return { sun, hemi, follow };
}
