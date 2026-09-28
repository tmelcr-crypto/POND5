import * as THREE from 'three';
import { lin } from '../../core/math.js';
import { vnoise3 } from '../../core/noise.js';
import { mergeGeos, paint } from '../../core/geometry.js';
import { ISLET, H, SEA_Y } from '../../world/layout.js';
import { obstacles, rockBodies } from '../../world/bounds.js';
import { boulder, finishRock } from '../rocks/rockOutcrop.js';

/**
 * What is on the islet off the north-east shore (#26; its ground: ISLET and isletH in world/layout.js, so the boat
 * runs aground on its sand and you can step off and walk round it). A few weathered boulders at the waterline, a
 * bleached driftwood log, a little cairn of flat stones on the top, and an old rowing boat, half sunk in the sand, its
 * ribs showing. Rocks in one mesh (the island boulders' paint), wood in another. Its own random numbers.
 */
export function createIslet(ctx) {
  const { scene } = ctx, I = ISLET;
  let seed = 4721; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();
  const at = (a, f) => { const x = I.x + Math.cos(a) * I.r * f, z = I.z + Math.sin(a) * I.r * f; return [x, H(x, z), z]; };
  const rocks = [], wood = [];

  /* ---- boulders round the waterline and one on the top ---- */
  for (const [a, f, s, sy] of [[0.4, 0.95, 1.0, 0.55], [1.2, 1.02, 0.7, 0.6], [2.9, 0.9, 1.3, 0.5], [4.4, 0.98, 0.8, 0.65], [5.3, 1.05, 0.55, 0.7], [3.6, 0.35, 0.5, 0.6]]) {
    const [x, y, z] = at(a, f), g = boulder(20 + a * 7, 4); g.scale(s, s * sy, s * rr(0.75, 1.1)); g.computeBoundingBox();
    g.translate(0, -g.boundingBox.min.y - 0.12 * s * sy, 0); const rot = rr(0, 6.28); g.rotateY(rot); g.translate(x, y, z);
    rocks.push(finishRock(g, (px, pz) => Math.max(H(px, pz), SEA_Y)));
    rockBodies.add({ x, y: y + s * sy * 0.45, z, rx: s * 0.95 + 0.2, ry: s * sy * 0.55 + 0.2, rz: s * 0.9 + 0.2, rot, body: 0.25 });
  }
  /* ---- the cairn: flat stones stacked, smaller upwards ---- */
  { const [x, y, z] = at(2.2, 0.15); let h = y - 0.03;
    for (let i = 0; i < 6; i++) { const r = 0.34 - i * 0.045 + rr(-0.02, 0.02), t = 0.09 + rr(0, 0.04), g = new THREE.CylinderGeometry(r * 0.92, r, t, 9, 1); const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) { const px = p.getX(k), pz = p.getZ(k); p.setXYZ(k, px * (1 + 0.12 * vnoise3(px * 6 + i, 0, pz * 6)), p.getY(k), pz * (1 + 0.12 * vnoise3(px * 6, i, pz * 6))); }
      g.computeVertexNormals(); g.rotateY(rr(0, 6.28)); g.rotateX(rr(-0.06, 0.06)); g.translate(x + rr(-0.03, 0.03), h + t / 2, z + rr(-0.03, 0.03)); h += t;
      const c = lin([0x8a857b, 0x75706a, 0x9a9184][i % 3]).multiplyScalar(rr(0.85, 1.1)); paint(g, col => col.copy(c)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); rocks.push(g); }
    obstacles.add(x, z, 0.45, h);
  }
  /* ---- driftwood: a long bleached log with a stub of a branch ---- */
  { const [x, y, z] = at(5.9, 0.4), bleached = lin(0xa39a8a);
    const log = new THREE.CylinderGeometry(0.11, 0.15, 2.6, 9, 6); const p = log.attributes.position;
    for (let k = 0; k < p.count; k++) { const py = p.getY(k); p.setX(k, p.getX(k) + 0.04 * Math.sin(py * 2.1)); }
    log.computeVertexNormals(); paint(log, (c, px, py) => c.copy(bleached).multiplyScalar(0.8 + 0.25 * vnoise3(px * 20, py * 3, 0)));
    const stub = new THREE.CylinderGeometry(0.03, 0.06, 0.6, 6); stub.rotateZ(0.9); stub.translate(0.2, 0.5, 0); paint(stub, c => c.copy(bleached).multiplyScalar(0.85));
    const g = mergeGeos([log, stub], ['position', 'normal', 'color']); g.rotateZ(Math.PI / 2); g.rotateY(0.7); g.translate(x, y + 0.06, z); wood.push(g);
    rockBodies.add({ x, y: y + 0.06, z, rx: 1.35, ry: 0.3, rz: 0.35, rot: 0.7, body: 0.25 });
  }
  /* ---- the old rowing boat: a hull half in the sand, tipped on its side, planks gone in places, the ribs showing ---- */
  { const [x, y, z] = at(0.9, 0.45), L = 3.2, B = 0.62, D = 0.42, hull = [], ribs = [];
    const plankC = lin(0x6e5a44), ribC = lin(0x5a4636);
    for (let s = 0; s < 7; s++) {   // planks, from the keel up
      const t0 = s / 7, t1 = (s + 1) / 7; if (s === 4 || (s === 5 && rnd() < 0.5)) continue;   // gaps where planks rotted away
      const pos = [];
      for (let i = 0; i <= 16; i++) { const u = i / 16 * 2 - 1, w = Math.sqrt(Math.max(0, 1 - u * u)), k = 1 - Math.abs(u) ** 3 * 0.2;
        for (const t of [t0, t1]) { const ang = t * Math.PI / 2; pos.push(u * L / 2, -D * Math.cos(ang) * k, B * w * Math.sin(ang)); } }
      const idx = []; for (let i = 0; i < 16; i++) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
      const g2 = g.clone(); g2.scale(1, 1, -1);   // the other side
      for (const h of [g, g2]) { h.computeVertexNormals(); const c = plankC.clone().multiplyScalar(rr(0.75, 1.1)); paint(h, col => col.copy(c)); hull.push(h); }
    }
    for (let i = 1; i < 8; i++) {   // ribs
      const u = i / 8 * 2 - 1, w = Math.sqrt(1 - u * u), k = 1 - Math.abs(u) ** 3 * 0.2, rib = new THREE.TorusGeometry(1, 0.025, 4, 12, Math.PI);
      rib.rotateZ(Math.PI); rib.rotateY(Math.PI / 2); rib.scale(1, D * k, B * w); rib.translate(u * L / 2, 0, 0);   // the lower half circle, across the hull (y down to the keel, z to either side) paint(rib, c => c.copy(ribC)); ribs.push(rib);
    }
    const boat = mergeGeos(hull.concat(ribs), ['position', 'normal', 'color']);
    boat.rotateX(0.55); boat.rotateY(2.3); boat.translate(x, y + 0.05, z); wood.push(boat);
    rockBodies.add({ x, y: y + 0.1, z, rx: L / 2 + 0.2, ry: 0.5, rz: B + 0.2, rot: 2.3, body: 0.25 });
  }

  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, envMapIntensity: 0.55 });
  const woodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const add = (list, mat, attrs) => { const m = new THREE.Mesh(mergeGeos(list, attrs), mat); m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  const rockMesh = add(rocks, rockMat, ['position', 'normal', 'color']), woodMesh = add(wood, woodMat, ['position', 'normal', 'color']);
  return { rocks: rockMesh, wood: woodMesh };
}
