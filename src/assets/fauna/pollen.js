import * as THREE from 'three';
import { rng, rr } from '../../core/random.js';
import { U } from '../../core/uniforms.js';

/**
 * Drifting pollen by day, fireflies by night (colour/size set by the time of day).
 */
export function createPollen(ctx) {
  const { scene } = ctx;
  const { softDot } = ctx.tex;
  let pollen, pollenBase;
  {
    const N = 380; pollenBase = new Float32Array(N * 4);
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { pollenBase[i * 4] = rr(-5.5, 5.5); pollenBase[i * 4 + 1] = rr(0.15, 3.6); pollenBase[i * 4 + 2] = rr(-5.5, 5.5); pollenBase[i * 4 + 3] = rng() * 100; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ size: 0.028, map: softDot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff0c8, opacity: 0.75 });
    pollen = new THREE.Points(g, m); pollen.frustumCulled = false; scene.add(pollen);
  }
  function update(t) {
    const pAttr = pollen.geometry.attributes.position;
    for (let i = 0; i < pAttr.count; i++) {
      const b = i * 4, s = pollenBase[b + 3];
      let x = pollenBase[b] + Math.sin(t * 0.21 + s) * 0.6 + U.uWindDir.value.x * ((t * 0.12 * (0.2 + U.uWind.value) + s) % 11 - 5.5);
      let z = pollenBase[b + 2] + Math.cos(t * 0.17 + s * 1.3) * 0.6 + U.uWindDir.value.y * ((t * 0.12 * (0.2 + U.uWind.value) + s) % 11 - 5.5);
      x = ((x + 5.5) % 11 + 11) % 11 - 5.5; z = ((z + 5.5) % 11 + 11) % 11 - 5.5;
      pAttr.setXYZ(i, x, pollenBase[b + 1] + Math.sin(t * 0.5 + s * 2.1) * 0.15, z);
    }
    pAttr.needsUpdate = true;
  }
  return { pollen, update };
}
