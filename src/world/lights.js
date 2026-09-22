import * as THREE from 'three';
import { isTouch } from '../core/env.js';

/**
 * Sun/moon directional light with a large soft shadow map, plus a hemisphere fill.
 */
export function createLights(ctx) {
  const { scene } = ctx;
  const sun = new THREE.DirectionalLight(0xffffff, 2.6);
  sun.castShadow = true;
  const SM = isTouch ? 2048 : 4096;
  sun.shadow.mapSize.set(SM, SM);
  Object.assign(sun.shadow.camera, { left: -8.5, right: 8.5, top: 8.5, bottom: -8.5, near: 0.5, far: 45 });
  sun.shadow.bias = -0.0002; sun.shadow.normalBias = 0.022;
  sun.target.position.set(0, 0.5, 0);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x3a4a22, 0.18); scene.add(hemi);
  return { sun, hemi };
}
