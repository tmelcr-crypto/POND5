import * as THREE from 'three';
import { lin } from '../../core/math.js';
import { vnoise3 } from '../../core/noise.js';
import { mergeGeos, paint } from '../../core/geometry.js';
import { TREASURE, TREEHOUSE, H } from '../../world/layout.js';

/**
 * The treasure hunt's things (#16; the hunt: app/treasure.js). The old map, rolled and tied with a red ribbon, on the
 * crate in the treehouse; the mound of loose sand on the islet where the treasure is buried (shown once the map has
 * been read); the small iron-bound chest that comes up when you dig there, its lid open, with a heap of gold coins in
 * it; and the coins' own model for the cabin shelf (coinsModel). Its own random numbers.
 */
export function coinsModel() {
  const parts = []; let s = 77; const rnd = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  for (let i = 0; i < 7; i++) { const g = new THREE.CylinderGeometry(0.011, 0.011, 0.003, 12); g.rotateX((rnd() - 0.5) * 0.4); g.translate(i < 4 ? (rnd() - 0.5) * 0.004 : (rnd() - 0.5) * 0.04, i < 4 ? i * 0.0032 : 0.0015, i < 4 ? 0 : (rnd() - 0.5) * 0.04); parts.push(g); }
  return { geo: mergeGeos(parts, ['position', 'normal']), mat: new THREE.MeshStandardMaterial({ color: lin(0xd9aa32), roughness: 0.3, metalness: 0.85 }) };
}

export function createTreasureThings(ctx) {
  const { scene } = ctx;
  let seed = 3319; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();
  const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...o });

  /* ---- the map on the crate (the crate: assets/cabin/treehouse.js, local (-0.72, -0.85), 0.34 m tall) ---- */
  const T = TREEHOUSE, [mx, mz] = T.toWorld(-0.72, -0.85);
  const scroll = new THREE.Group(); scroll.position.set(mx, T.deck + 0.34 + 0.026, mz); scroll.rotation.y = T.rot + 0.5; scene.add(scroll);
  { const roll = new THREE.CylinderGeometry(0.025, 0.025, 0.24, 14); roll.rotateZ(Math.PI / 2); paint(roll, (c, x) => c.copy(lin(0xd8c49a)).multiplyScalar(0.85 + 0.15 * Math.abs(Math.sin(x * 40))));
    const end = new THREE.RingGeometry(0.006, 0.025, 14, 1, 0, Math.PI * 1.7); end.rotateY(Math.PI / 2); end.translate(0.1205, 0, 0); paint(end, c => c.copy(lin(0xc4ae82)));
    const ribbon = new THREE.TorusGeometry(0.027, 0.004, 4, 16); ribbon.rotateY(Math.PI / 2); paint(ribbon, c => c.copy(lin(0x9a1f1f)));
    const m = new THREE.Mesh(mergeGeos([roll, end, ribbon], ['position', 'normal', 'color']), std({ vertexColors: true, side: THREE.DoubleSide })); m.castShadow = m.receiveShadow = true; scroll.add(m); }

  /* ---- the mound of loose sand, three paces from the islet's cairn ---- */
  const X = TREASURE, gy = H(X.x, X.z);
  const pile = new THREE.Group(); pile.position.set(X.x, gy, X.z); pile.visible = false; scene.add(pile);
  { const parts = [];
    const g = new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), n = 1 + 0.18 * vnoise3(x * 5, y * 5, z * 5); p.setXYZ(i, x * n, y * 0.45 * n - 0.03, z * n * 0.85); }
    g.computeVertexNormals(); paint(g, (c, x, y, z) => c.copy(lin(0x8d7654)).lerp(lin(0x5f4c35), Math.min(1, Math.max(0, 0.5 + vnoise3(x * 9, y * 9, z * 9)))));
    parts.push(g);
    for (let i = 0; i < 9; i++) { const a = rnd() * 6.28, r = rr(0.5, 0.85), c = new THREE.IcosahedronGeometry(rr(0.025, 0.06), 0); c.translate(Math.cos(a) * r, 0.01, Math.sin(a) * r * 0.85); paint(c, col => col.copy(lin(0x6b573c)).multiplyScalar(rr(0.8, 1.1))); parts.push(c); }
    const m = new THREE.Mesh(mergeGeos(parts, ['position', 'normal', 'color']), std({ vertexColors: true, roughness: 0.95 })); m.castShadow = m.receiveShadow = true; pile.add(m); }

  /* ---- the chest: planks and iron bands, the lid on its hinge; half in the hole it came out of ---- */
  const chest = new THREE.Group(); chest.position.set(X.x, gy - 0.16, X.z); chest.rotation.y = 0.6; chest.visible = false; scene.add(chest);
  const W = 0.5, Dp = 0.32, Ht = 0.26;
  const wood = std({ color: lin(0x6a4a2c), roughness: 0.85 }), iron = std({ color: lin(0x3a3632), roughness: 0.5, metalness: 0.6 });
  const box = (w, h, d, x, y, z, mat, parent) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  box(W, 0.02, Dp, 0, 0.01, 0, wood, chest);   // bottom
  for (const s of [-1, 1]) { box(W, Ht, 0.02, 0, Ht / 2, s * (Dp / 2 - 0.01), wood, chest); box(0.02, Ht, Dp - 0.04, s * (W / 2 - 0.01), Ht / 2, 0, wood, chest); }
  for (const x of [-0.16, 0.16]) box(0.03, Ht + 0.01, Dp + 0.01, x, Ht / 2, 0, iron, chest);   // bands
  const lid = new THREE.Group(); lid.position.set(0, Ht, -Dp / 2); chest.add(lid);   // hinged along the back
  { const top = new THREE.CylinderGeometry(Dp / 2, Dp / 2, W, 14, 1, false, 0, Math.PI); top.rotateZ(Math.PI / 2); top.rotateX(Math.PI / 2); top.translate(0, 0, Dp / 2);
    const m = new THREE.Mesh(top, wood); m.castShadow = true; lid.add(m); for (const x of [-0.16, 0.16]) { const b = new THREE.CylinderGeometry(Dp / 2 + 0.006, Dp / 2 + 0.006, 0.03, 14, 1, true, 0, Math.PI); b.rotateZ(Math.PI / 2); b.rotateX(Math.PI / 2); b.translate(x, 0, Dp / 2); lid.add(new THREE.Mesh(b, iron)); } }
  lid.rotation.x = -1.9;   // thrown open
  const coins = new THREE.Group(); chest.add(coins);
  { const cm = coinsModel(), g = cm.geo, parts = [];
    for (let i = 0; i < 26; i++) { const c = g.clone(); c.rotateY(rnd() * 6.28); c.rotateX((rnd() - 0.5) * 0.8); c.translate(rr(-0.18, 0.18), Ht - 0.06 + rr(0, 0.05), rr(-0.1, 0.1)); parts.push(c); }
    const m = new THREE.Mesh(mergeGeos(parts, ['position', 'normal']), cm.mat); m.castShadow = true; coins.add(m); }
  { const rim = new THREE.RingGeometry(0.28, 0.62, 20, 1); rim.rotateX(-Math.PI / 2); const p = rim.attributes.position;   // the dug-up sand round the hole
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), r = Math.hypot(x, z); p.setY(i, 0.16 + 0.07 * Math.sin((r - 0.28) / 0.34 * Math.PI) + 0.02 * vnoise3(x * 9, 0, z * 9)); }
    rim.computeVertexNormals(); const m = new THREE.Mesh(rim, std({ color: lin(0x6e5a3e), roughness: 1 })); m.receiveShadow = true; chest.add(m); }
  const sandIn = new THREE.Mesh(new THREE.BoxGeometry(W - 0.04, 0.01, Dp - 0.04), std({ color: lin(0x5f4c35), roughness: 1 })); sandIn.position.y = Ht - 0.07; chest.add(sandIn);

  return {
    scroll, pile, chest, coins, lid,
    mapAt: new THREE.Vector3(mx, T.deck + 0.37, mz), pileAt: new THREE.Vector3(X.x, gy + 0.15, X.z), chestAt: new THREE.Vector3(X.x, gy + 0.15, X.z),
  };
}
