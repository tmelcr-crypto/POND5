import * as THREE from 'three';
import { smooth, lin } from '../core/math.js';
import { hash2, vnoise2, fbm2 } from '../core/noise.js';
import { BOTTOM, H } from './layout.js';

/**
 * The diorama slab edges: layered soil cross-section and the underside.
 */
export function createSoilSkirt(ctx) {
  const { scene } = ctx;
  {
    const N = 180, R = 44, pos = [], nor = [], col = [], idx = [];
    const edges = [[[-5, 5], [5, 5], [0, 0, 1]], [[5, 5], [5, -5], [1, 0, 0]], [[5, -5], [-5, -5], [0, 0, -1]], [[-5, -5], [-5, 5], [-1, 0, 0]]];
    const root = lin(0x364422), top = lin(0x3a2818), topB = lin(0x2b1d12), clay = lin(0x7c5b3a), clayB = lin(0x93704a), stone = lin(0x5d5953), stoneB = lin(0x77726a);
    const c = new THREE.Color(), c2 = new THREE.Color();
    edges.forEach((e, ei) => {
      const base = pos.length / 3;
      for (let i = 0; i <= N; i++) {
        const s = i / N, x = e[0][0] + (e[1][0] - e[0][0]) * s, z = e[0][1] + (e[1][1] - e[0][1]) * s, hTop = H(x, z);
        const b1 = 0.4 + 0.08 * fbm2(s * 9 + ei * 7, 1.3, 3), b2 = 0.95 + 0.1 * fbm2(s * 6 + ei * 3, 5.1, 3);
        for (let j = 0; j <= R; j++) {
          const t = j / R, y = hTop + (BOTTOM - hTop) * t, d = hTop - y;
          pos.push(x, y, z); nor.push(e[2][0], e[2][1], e[2][2]);
          const nn = hash2(Math.floor(s * 900) + ei * 1000, j * 3), ns = 0.5 + 0.5 * vnoise2(s * 80 + ei * 10, j * 0.9);
          if (d < 0.05) c.copy(root);
          else if (d < b1) c.copy(top).lerp(topB, ns);
          else if (d < b2) c.copy(clay).lerp(clayB, ns * 0.8);
          else c.copy(stone).lerp(stoneB, ns);
          if (d >= 0.05 && d < b1 + 0.04 && d > b1 - 0.04) { c2.copy(top).lerp(clay, smooth(b1 - 0.04, b1 + 0.04, d)); c.copy(c2); }
          if (nn > 0.93) c.multiplyScalar(nn > 0.97 ? 1.45 : 0.6);
          col.push(c.r, c.g, c.b);
        }
      }
      for (let i = 0; i < N; i++) for (let j = 0; j < R; j++) {
        const a = base + i * (R + 1) + j, b = a + 1, cI = a + R + 1, d = cI + 1;
        idx.push(a, b, cI, cI, b, d);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true; scene.add(mesh);
    const bg = new THREE.PlaneGeometry(10, 10); bg.rotateX(Math.PI / 2); bg.translate(0, BOTTOM, 0);
    const bm = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ color: lin(0x4a4640), roughness: 1 })); bm.castShadow = true; scene.add(bm);
  }
}
