import { WATER_Y, H } from '../../world/layout.js';
import * as THREE from 'three';
import { V, smooth } from '../../core/math.js';
import { canvasTex } from '../../core/canvasTexture.js';

// wing paintings: orange with a dark border and white spots, pale yellow, white with black spots
const WING_STYLES = [
  g => { g.fillStyle = '#e8801e'; g.beginPath(); g.ellipse(34, 30, 30, 26, -0.3, 0, 6.28); g.fill(); g.strokeStyle = '#1b130c'; g.lineWidth = 5; g.stroke(); g.fillStyle = '#fff'; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(12 + i * 7, 8 + (i % 2) * 5, 2.2, 0, 6.28); g.fill(); } },
  g => { g.fillStyle = '#f3e98a'; g.beginPath(); g.ellipse(34, 30, 30, 25, -0.3, 0, 6.28); g.fill(); g.fillStyle = '#e39a2a'; g.beginPath(); g.arc(34, 30, 4, 0, 6.28); g.fill(); },
  g => { g.fillStyle = '#f7f6f0'; g.beginPath(); g.ellipse(34, 30, 30, 25, -0.3, 0, 6.28); g.fill(); g.fillStyle = '#2b2b2b'; g.beginPath(); g.arc(50, 14, 6, 0, 6.28); g.fill(); g.beginPath(); g.arc(34, 34, 3.5, 0, 6.28); g.fill(); }
];

/**
 * Three butterflies (canvas-painted wings). Returns flight data; animated in updateButterflies().
 */
export function createButterflies(ctx) {
  const { scene } = ctx;
  const flies = [];
  {
    WING_STYLES.forEach((st, i) => {
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

/**
 * The island's butterflies: the plot's wings and flight, many of them. homes: [{ x, y, z, r, h }] - each butterfly loops
 * around (x, z) within r metres, h metres above the ground height y (a rose's top, or the meadow flowers). Only the
 * ones within `range` of the camera are drawn (they are 5 cm wide; further away they are not visible anyway): per
 * frame their wing / body matrices are written into one InstancedMesh per wing style plus one for the bodies, and
 * they shrink to nothing over the last metre so none pops. Returns update(t, cameraPosition) and the count drawn.
 */
export function createButterflySwarm(ctx, homes, range = 4) {
  const { scene } = ctx, n = homes.length;
  const wg = new THREE.PlaneGeometry(0.055, 0.055); wg.rotateX(-Math.PI / 2); wg.translate(0.0275, 0, 0);
  const bodyG = new THREE.CylinderGeometry(0.004, 0.003, 0.04, 5); bodyG.rotateX(Math.PI / 2);
  const wings = WING_STYLES.map(st => {
    const m = new THREE.InstancedMesh(wg, new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, st), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.7 }), Math.max(2, n * 2));
    m.castShadow = true; m.frustumCulled = false; m.userData.dynamic = true; m.count = 0; m.visible = false; scene.add(m); return m;
  });
  const bodies = new THREE.InstancedMesh(bodyG, new THREE.MeshStandardMaterial({ color: 0x1f1a14 }), Math.max(1, n));
  bodies.frustumCulled = false; bodies.userData.dynamic = true; bodies.count = 0; bodies.visible = false; scene.add(bodies);
  const G = new THREE.Matrix4(), W = new THREE.Matrix4(), Rz = new THREE.Matrix4(), Mirror = new THREE.Matrix4().makeScale(-1, 1, 1);
  const P = new V(), Q = new THREE.Quaternion(), S = new V(), UP = new V(0, 1, 0), reach = range + 1.5;
  const state = homes.map((h, i) => ({ ...h, ph: i * 2.1 + h.x * 0.37, sp: 0.35 + (i % 5) * 0.035, style: i % WING_STYLES.length, yaw: 0, px: h.x, pz: h.z }));
  const counts = [0, 0, 0];
  return {
    get drawn() { return bodies.count; },
    update(t, c) {
      counts.fill(0); let nb = 0;
      for (const f of state) {
        if (Math.abs(f.x - c.x) > reach || Math.abs(f.z - c.z) > reach) continue;
        const tt = t * f.sp + f.ph;
        const x = f.x + (Math.sin(tt * 1.3) * 1.1 + Math.sin(tt * 3.7) * 0.18) * f.r, z = f.z + (Math.cos(tt * 0.9) * 1.0 + Math.cos(tt * 4.1) * 0.15) * f.r;
        const y = f.y + f.h + Math.sin(tt * 2.3) * 0.18 + Math.sin(tt * 9.0) * 0.03;
        const dx = x - f.px, dz = z - f.pz; if (dx * dx + dz * dz > 1e-8) f.yaw = Math.atan2(dx, dz); f.px = x; f.pz = z;
        const d = Math.hypot(x - c.x, y - c.y, z - c.z), k = 1 - smooth(range - 1, range, d);
        if (k <= 0) continue;
        G.compose(P.set(x, y, z), Q.setFromAxisAngle(UP, f.yaw), S.setScalar(k));
        const flap = Math.sin(t * 26 + f.ph * 3) * 1.1 + 0.25, wm = wings[f.style], j = counts[f.style];
        wm.setMatrixAt(j * 2, W.multiplyMatrices(G, Rz.makeRotationZ(flap)));
        wm.setMatrixAt(j * 2 + 1, W.multiplyMatrices(G, Rz.makeRotationZ(-flap)).multiply(Mirror));
        counts[f.style]++; bodies.setMatrixAt(nb++, G);
      }
      wings.forEach((m, i) => { m.count = counts[i] * 2; m.visible = m.count > 0; m.instanceMatrix.needsUpdate = m.visible; });
      bodies.count = nb; bodies.visible = nb > 0; bodies.instanceMatrix.needsUpdate = bodies.visible;
    },
  };
}
