import * as THREE from 'three';
import { lin } from '../../core/math.js';
import { mergeGeos, paint } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { TREEHOUSE, H } from '../../world/layout.js';
import { obstacles } from '../../world/bounds.js';

/**
 * The treehouse in the east wood (#58; site and deck: TREEHOUSE in world/layout.js, climbing: app/climbing.js). A deck
 * of weathered planks on two beams and four log posts with braces, among the spruces; a little plank hut with an open
 * front and a sloping shingle roof over the back half (a crate and a rolled blanket inside), railings round the front
 * half with a gap for the rope ladder, which hangs down to the ground with wooden rungs. Built in the deck's own frame
 * (x across, z to the front) and turned into place. Three merged meshes (wood, roof, rope); snow on the roof and deck in
 * winter (world/seasonLooks.js 'roof'). Its own random numbers.
 */
export function createTreehouse(ctx) {
  const { scene, maxAniso } = ctx, T = TREEHOUSE, hf = T.half, deck = T.deck;
  let seed = 5813; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();
  const group = new THREE.Group(); group.position.set(T.x, 0, T.z); group.rotation.y = T.rot; scene.add(group);
  const groundAt = (lx, lz) => { const [x, z] = T.toWorld(lx, lz); return H(x, z); };

  const grain = canvasTex(128, 256, (g, w, h) => {   // weathered wood, grain along v
    g.fillStyle = '#8f7456'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 170; i++) { const x = rnd() * w, y = rnd() * h, len = 30 + rnd() * 160; g.strokeStyle = rnd() < 0.6 ? `rgba(48,32,20,${0.1 + rnd() * 0.3})` : `rgba(222,204,172,${0.05 + rnd() * 0.15})`; g.lineWidth = 0.6 + rnd() * 1.5; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + rr(-3, 3), y + len / 3, x + rr(-3, 3), y + len * 2 / 3, x, y + len); g.stroke(); }
    for (let i = 0; i < 6; i++) { const x = rnd() * w, y = rnd() * h; g.fillStyle = 'rgba(40,26,16,0.45)'; g.beginPath(); g.ellipse(x, y, 2 + rnd() * 3, 4 + rnd() * 5, 0, 0, 6.28); g.fill(); }   // knots
  });
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.anisotropy = maxAniso;
  const wood = [], roof = [], rope = [];
  const tone = () => lin(0xb0a28c).multiplyScalar(rr(0.8, 1.08));
  /** A board w x h x d at (x, y, z) turned (rx, ry, rz), its grain along its longest side. */
  function board(list, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, c = tone()) {
    const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv, p = g.attributes.position;
    const long = w >= h && w >= d ? 0 : h >= d ? 1 : 2;
    for (let i = 0; i < uv.count; i++) { const v = [p.getX(i), p.getY(i), p.getZ(i)]; uv.setXY(i, (v[(long + 1) % 3] + v[(long + 2) % 3]) * 1.5 + x * 0.37, v[long] * 0.9 + z * 0.29); }
    paint(g, col => col.copy(c));
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))); g.translate(x, y, z); list.push(g); return g;
  }
  /** A round log from (x0, y0, z0) to (x1, y1, z1). */
  function log(list, r, a, b, c = tone().multiplyScalar(0.85), seg = 8) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), len = A.distanceTo(B);
    const g = new THREE.CylinderGeometry(r * 0.92, r, len, seg, 1); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * len * 0.8);
    paint(g, col => col.copy(c));
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()))); g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2); list.push(g); return g;
  }

  /* ---- posts, braces, beams ---- */
  const pin = hf - 0.14;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const lx = sx * pin, lz = sz * pin, gy = groundAt(lx, lz) - 0.25;
    log(wood, 0.11, [lx, gy, lz], [lx + rr(-0.02, 0.02), deck - 0.16, lz + rr(-0.02, 0.02)]);
    log(wood, 0.045, [lx, deck - 1.2, lz], [lx - sx * 0.9, deck - 0.2, lz], undefined, 6);   // braces up to the beams
    const [wx, wz] = T.toWorld(lx, lz); obstacles.add(wx, wz, 0.16, deck - 0.05);
  }
  for (const sz of [-1, 1]) board(wood, hf * 2 + 0.1, 0.16, 0.12, 0, deck - 0.12, sz * pin, 0, 0, 0, tone().multiplyScalar(0.8));   // beams
  for (const sx of [-1, 0, 1]) board(wood, 0.08, 0.1, hf * 2, sx * (pin - 0.05), deck - 0.07, 0, 0, 0, 0, tone().multiplyScalar(0.8));   // joists

  /* ---- the deck: planks across, a few a little uneven ---- */
  const pw = 0.15, n = Math.floor(hf * 2 / pw);
  for (let i = 0; i < n; i++) { const z = -hf + (i + 0.5) * (hf * 2 / n); board(wood, hf * 2 + rr(-0.02, 0.06), 0.035, hf * 2 / n - 0.012, rr(-0.02, 0.02), deck - 0.0175 + rr(-0.004, 0.004), z, 0, rr(-0.01, 0.01), rr(-0.006, 0.006)); }

  /* ---- railings round the front half, a gap for the ladder ---- */
  const rh = 0.92, rail = (a, b) => { board(wood, Math.hypot(b[0] - a[0], b[1] - a[1]), 0.06, 0.045, (a[0] + b[0]) / 2, deck + rh, (a[1] + b[1]) / 2, 0, -Math.atan2(b[1] - a[1], b[0] - a[0])); board(wood, Math.hypot(b[0] - a[0], b[1] - a[1]), 0.05, 0.035, (a[0] + b[0]) / 2, deck + rh * 0.5, (a[1] + b[1]) / 2, 0, -Math.atan2(b[1] - a[1], b[0] - a[0])); };
  const post = (x, z, h = rh + 0.04) => board(wood, 0.08, h, 0.08, x, deck + h / 2, z);
  const e = hf - 0.04, hutFront = -0.1;
  for (const sx of [-1, 1]) {
    post(sx * e, e); post(sx * e, (e + hutFront) / 2); rail([sx * e, hutFront], [sx * e, e]);   // the sides, from the hut to the front
    post(sx * T.gap, e); rail([sx * e, e], [sx * T.gap, e]);                                    // the front, either side of the gap
  }

  /* ---- the hut: plank walls on three sides, a sloping roof, open to the front ---- */
  const hBack = 1.78, hFront = 2.05, wall = (x0, z0, x1, z1, h0, h1) => {   // vertical boards from (x0, z0) to (x1, z1), h0 to h1 tall
    const len = Math.hypot(x1 - x0, z1 - z0), k = Math.max(2, Math.round(len / 0.17)), ang = -Math.atan2(z1 - z0, x1 - x0);
    for (let i = 0; i < k; i++) { const t = (i + 0.5) / k, h = h0 + (h1 - h0) * t, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; board(wood, len / k - 0.008, h, 0.03, x, deck + h / 2, z, 0, ang); }
  };
  wall(-e, -e, e, -e, hBack, hBack);                          // back
  for (const sx of [-1, 1]) {
    wall(sx * e, -e, sx * e, hutFront, hBack, hFront);         // sides, rising to the front
    post(sx * e, hutFront, hFront + 0.02);                     // corner posts at the open front
  }
  board(wood, hf * 2, 0.1, 0.08, 0, deck + hFront - 0.05, hutFront);   // lintel over the front
  board(wood, hf * 2 - 0.1, 0.035, 0.12, 0, deck + 0.9, -e + 0.08);   // a shelf along the back wall
  // the roof: two layers of shingles on a sloping board, overhanging
  const slope = -Math.atan2(hFront - hBack, hutFront + e), rl = Math.hypot(hutFront + e, hFront - hBack) + 0.5;   // higher at the front
  const ry = deck + (hFront + hBack) / 2 + 0.06, rz = (hutFront - e) / 2 + 0.1;
  board(roof, hf * 2 + 0.4, 0.05, rl, 0, ry, rz, slope, 0, 0, lin(0x8b7a66));
  for (let row = 0; row < 7; row++) for (let i = 0; i < 12; i++) {
    const t = row / 6, lz = -rl / 2 + t * rl, w = (hf * 2 + 0.4) / 12;
    const g = new THREE.BoxGeometry(w - 0.012, 0.018, rl / 6 + 0.06); paint(g, c => c.copy(lin(0x7a6653)).multiplyScalar(rr(0.75, 1.1)));
    g.translate(-hf - 0.2 + (i + 0.5) * w + (row % 2) * w * 0.5 * 0, 0.035 + row * 0.004, lz); g.rotateX(slope); g.translate(0, ry, rz); roof.push(g);
  }
  // inside: a crate and a rolled blanket
  board(wood, 0.42, 0.34, 0.34, -0.72, deck + 0.17, -0.85, 0, 0.2);
  { const g = new THREE.CylinderGeometry(0.11, 0.11, 0.62, 12); g.rotateZ(Math.PI / 2); paint(g, (c, x) => c.copy(lin(Math.sin(x * 40) > 0.2 ? 0x9b2f2a : 0x5a2320))); g.translate(0.5, deck + 0.11, -0.95); rope.push(g); }

  /* ---- the rope ladder: two ropes from the deck's edge to the ground, rungs every 0.3 m ---- */
  const top = [0, deck, hf], bot = [0, T.foot.y, hf + 0.55], ropeCol = lin(0xb59c72);
  for (const sx of [-1, 1]) log(rope, 0.014, [sx * 0.22, top[1] + 0.05, top[2] + 0.02], [sx * 0.22, bot[1] - 0.02, bot[2]], ropeCol, 5);
  const steps = Math.floor((deck - T.foot.y) / 0.3);
  for (let i = 1; i <= steps; i++) { const t = i / (steps + 0.3), y = deck + (T.foot.y - deck) * t, z = top[2] + (bot[2] - top[2]) * t; log(wood, 0.022, [-0.25, y, z], [0.25, y, z], tone().multiplyScalar(0.9), 6); }

  /* ---- meshes ---- */
  const woodMat = new THREE.MeshStandardMaterial({ map: grain, vertexColors: true, roughness: 0.85, metalness: 0 });
  const roofMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 });
  const ropeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  woodMat.userData.season = 'roof'; roofMat.userData.season = 'roof';   // snow on the deck, the rails and the roof
  const add = (list, mat, attrs) => { const m = new THREE.Mesh(mergeGeos(list, attrs), mat); m.castShadow = m.receiveShadow = true; group.add(m); return m; };
  add(wood, woodMat, ['position', 'normal', 'color', 'uv']); add(roof, roofMat, ['position', 'normal', 'color']); add(rope, ropeMat, ['position', 'normal', 'color']);
  group.updateMatrixWorld(true);
  const [tx, tz] = T.toWorld(0, hf + 0.2), [fx, fz] = T.toWorld(0, hf + 0.5);
  return { group, ladderTop: new THREE.Vector3(tx, deck + 0.3, tz), ladderMid: new THREE.Vector3(fx, (deck + T.foot.y) / 2 + 0.3, fz) };
}
