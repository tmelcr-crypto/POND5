import * as THREE from 'three';
import { lin } from '../../core/math.js';
import { mergeGeos } from '../../core/geometry.js';
import { CB } from '../../world/layout.js';

/**
 * A cup of coffee on a saucer in every house you can go into (#sleepiness, app/body.js): on the cabin's dining table
 * between the two mugs, and on a table in the windmill's loft, the beach hut, the observatory and the marsh lodge (their
 * P.cup: local u, y, v, turn; assets/islands/islandBuildings.js). Pick it up and take it along; drinking it wakes you up.
 * Each is one small mesh in its building's group (shown with it), all sharing one vertex-coloured geometry and one
 * material; the cabin's is in the cabin's group, lit by its lamps. No random numbers.
 * Returns { cups: [{ mesh, at: Vector3 }], geo, mat } for app/items.js (addCups).
 */
export function createCoffeeCups({ cabin, buildings }) {
  const cream = lin(0xece4d4), rim = lin(0x9a6a3a), coffee = lin(0x2a1609), parts = [];
  const put = (g, c) => { const n = g.index ? g.toNonIndexed() : g, col = new Float32Array(n.attributes.position.count * 3); for (let i = 0; i < col.length; i += 3) c.toArray(col, i); n.setAttribute('color', new THREE.BufferAttribute(col, 3)); n.deleteAttribute('uv'); parts.push(n); };
  put(new THREE.LatheGeometry([[0, 0], [0.058, 0], [0.066, 0.006], [0.07, 0.012], [0.03, 0.01], [0, 0.011]].map(([x, y]) => new THREE.Vector2(x, y)), 24), cream);   // the saucer
  put(new THREE.LatheGeometry([[0, 0.012], [0.026, 0.012], [0.036, 0.022], [0.042, 0.05], [0.045, 0.078], [0.041, 0.078], [0.038, 0.052], [0.032, 0.026], [0, 0.024]].map(([x, y]) => new THREE.Vector2(x, y)), 24), cream);   // the cup
  { const g = new THREE.TorusGeometry(0.045, 0.0028, 4, 24); g.rotateX(Math.PI / 2); g.translate(0, 0.078, 0); put(g, rim); }   // a gold-brown line round its lip
  { const g = new THREE.TorusGeometry(0.016, 0.0045, 6, 14, Math.PI * 1.25); g.rotateZ(-Math.PI * 0.62); g.translate(0.048, 0.05, 0); put(g, cream); }   // the handle
  { const g = new THREE.CircleGeometry(0.039, 20); g.rotateX(-Math.PI / 2); g.translate(0, 0.068, 0); put(g, coffee); }   // the coffee
  const geo = mergeGeos(parts, ['position', 'normal', 'color']); geo.computeBoundingSphere();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0 });
  const cups = [];
  const add = (parent, u, y, v, ry) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(u, y, v); m.rotation.y = ry; m.castShadow = true; m.receiveShadow = true; parent.add(m);
    m.updateWorldMatrix(true, false); cups.push({ mesh: m, at: new THREE.Vector3().setFromMatrixPosition(m.matrixWorld) });
  };
  // the cabin (house-local: the group sits at HOUSE, PAD_H): between the mugs on the dining table
  add(cabin.group, -0.18 - 0.06, CB.FL + 0.765, 0.8 - 0.15, 0.9); cups[0].mesh.userData.interior = true;
  for (const b of buildings) if (b.P.cup) { const [u, y, v, ry] = b.P.cup; add(b.group, u, y, v, ry); cups[cups.length - 1].mesh.userData.dynamic = true; }
  return { cups, geo, mat };
}
