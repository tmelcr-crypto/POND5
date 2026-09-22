import { WATER_Y, H } from '../../world/layout.js';
import * as THREE from 'three';
import { V } from '../../core/math.js';
import { canvasTex } from '../../core/canvasTexture.js';

/**
 * Three butterflies (canvas-painted wings). Returns flight data; animated in updateButterflies().
 */
export function createButterflies(ctx) {
  const { scene } = ctx;
  const flies = [];
  {
    const styles = [
      g => { g.fillStyle = '#e8801e'; g.beginPath(); g.ellipse(34, 30, 30, 26, -0.3, 0, 6.28); g.fill(); g.strokeStyle = '#1b130c'; g.lineWidth = 5; g.stroke(); g.fillStyle = '#fff'; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(12 + i * 7, 8 + (i % 2) * 5, 2.2, 0, 6.28); g.fill(); } },
      g => { g.fillStyle = '#f3e98a'; g.beginPath(); g.ellipse(34, 30, 30, 25, -0.3, 0, 6.28); g.fill(); g.fillStyle = '#e39a2a'; g.beginPath(); g.arc(34, 30, 4, 0, 6.28); g.fill(); },
      g => { g.fillStyle = '#f7f6f0'; g.beginPath(); g.ellipse(34, 30, 30, 25, -0.3, 0, 6.28); g.fill(); g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(50, 14, 6, 0, 6.28); g.fill(); g.beginPath(); g.arc(34, 34, 3.5, 0, 6.28); g.fill(); }
    ];
    styles.forEach((st, i) => {
      const tex = canvasTex(64, 64, st);
      const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 });
      const wg = new THREE.PlaneGeometry(0.055, 0.055); wg.rotateX(-Math.PI / 2); wg.translate(0.0275, 0, 0);
      const grp = new THREE.Group();
      const L = new THREE.Mesh(wg, mat), R = new THREE.Mesh(wg, mat); R.scale.x = -1;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.003, 0.04, 5), new THREE.MeshStandardMaterial({ color: 0x1f1a14 })); body.rotation.x = Math.PI / 2;
      L.castShadow = R.castShadow = true;
      grp.add(L, R, body); scene.add(grp);
      flies.push({ grp, L, R, c: [new V(0.5, 0, 3.1), new V(-0.8, 0, -0.6), new V(3.4, 0, 1.2)][i], ph: i * 2.1, sp: 0.35 + i * 0.07 });
    });
  }
  return flies;
}

/** Per-frame butterfly flight: wandering loops above the meadow with flapping wings. */
export function updateButterflies(flies, t) {
  for (const f of flies) {
      const tt = t * f.sp + f.ph;
      const x = f.c.x + Math.sin(tt * 1.3) * 1.1 + Math.sin(tt * 3.7) * 0.18, z = f.c.z + Math.cos(tt * 0.9) * 1.0 + Math.cos(tt * 4.1) * 0.15;
      const y = Math.max(H(x, z), WATER_Y) + 0.42 + Math.sin(tt * 2.3) * 0.18 + Math.sin(tt * 9.0) * 0.03;
      const prev = f.grp.position.clone(); f.grp.position.set(x, y, z);
      const dx = x - prev.x, dz = z - prev.z; if (dx * dx + dz * dz > 1e-8) f.grp.rotation.y = Math.atan2(dx, dz);
      const flap = Math.sin(t * 26 + f.ph * 3) * 1.1 + 0.25; f.L.rotation.z = flap; f.R.rotation.z = -flap;
    }
}
