import * as THREE from 'three';
import { rng, rr } from '../../core/random.js';
import { lin } from '../../core/math.js';
import { WATER_Y, LAKE, lakeR, H0 } from '../../world/layout.js';

/**
 * Floating lily pads (one with a water-lily flower). Returns the pads so the loop can bob them.
 */
export function createLilyPads(ctx) {
  const { scene } = ctx;
  const pads = [];
  {
    const pm = new THREE.MeshStandardMaterial({ color: lin(0x3b6a28), roughness: 0.4, side: THREE.DoubleSide }); pm.userData.season = 'pond';   // gone under the ice in winter
    const pm2 = new THREE.MeshStandardMaterial({ color: lin(0x55702e), roughness: 0.45, side: THREE.DoubleSide }); pm2.userData.season = 'pond';
    let tries = 0;
    while (pads.length < 11 && tries < 500) {
      tries++;
      const a = rr(-0.6, 2.6), r = lakeR(a) * rr(0.35, 0.8), x = LAKE.x + Math.cos(a) * r, z = LAKE.z + Math.sin(a) * r;
      if (WATER_Y - H0(x, z) < 0.12) continue;   // uncarved: the same pads as before the stream
      if (pads.some(p => Math.hypot(p.position.x - x, p.position.z - z) < 0.35)) continue;
      const pr = rr(0.1, 0.19), g = new THREE.CircleGeometry(pr, 28, 0.35, Math.PI * 2 - 0.35); g.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(g, rng() < 0.3 ? pm2 : pm); mesh.position.set(x, WATER_Y + 0.006, z); mesh.rotation.y = rng() * 6.28;
      mesh.receiveShadow = true; mesh.castShadow = true; mesh.userData.ph = rng() * 6.28; pads.push(mesh); scene.add(mesh);
    }
    // one water lily flower on a pad
    const fl = new THREE.Group(); const petalM = new THREE.MeshStandardMaterial({ color: lin(0xfbeef0), roughness: 0.5 }); petalM.userData.season = 'pond';
    for (let ring = 0; ring < 2; ring++) for (let i = 0; i < 8; i++) {
      const p = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 6), petalM); p.scale.set(0.38, 0.14, 1);
      const a = i / 8 * Math.PI * 2 + ring * 0.4; p.position.set(Math.cos(a) * 0.025 * (1 - ring * 0.35), 0.012 + ring * 0.012, Math.sin(a) * 0.025 * (1 - ring * 0.35));
      p.rotation.y = -a + Math.PI / 2; p.rotation.x = -0.45 - ring * 0.35; p.castShadow = true; fl.add(p);
    }
    const ctr = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 6), new THREE.MeshStandardMaterial({ color: lin(0xf2c233), roughness: 0.6 })); ctr.position.y = 0.02; fl.add(ctr);
    if (pads[0]) { pads[0].add(fl); fl.position.set(0.01, 0, 0.01); }
  }
  return pads;
}
