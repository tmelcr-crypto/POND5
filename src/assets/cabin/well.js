import * as THREE from 'three';
import { V, lin } from '../../core/math.js';
import { mergeGeos, paint } from '../../core/geometry.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { WELL } from '../../world/layout.js';
import { obstacles } from '../../world/bounds.js';

/**
 * The well behind the cabin (#12; site: WELL in world/layout.js, drawing water: app/drawWater.js). A ring of dressed
 * stones in four courses with a cap course, a dark shaft down to the water ~1.7 m below the ground; two posts carry a
 * little shingled roof (snow settles on it, world/seasonLooks.js 'roof') and the windlass: a log axle with rope wound
 * round it and an iron crank. The rope runs down to a banded wooden bucket. setBucket(y) lowers or raises the bucket
 * (the axle and crank turn with the rope), setFull(on) shows water in it. Its own random numbers. Sizes in WELL_LOOK.
 */
export const WELL_LOOK = {
  ring: { inner: 0.4, courses: 4, stones: 12 }, water: -1.7,
  axleY: 1.32, axleR: 0.065, postX: 0.63, roofY: 1.98,
  bucket: { r0: 0.1, r1: 0.125, h: 0.2, bail: 0.13, idle: 0.84 },   // idle: the bucket's base, hanging over the rim
};

export function createWell(ctx) {
  const { scene, maxAniso } = ctx, WL = WELL_LOOK, R = WELL.r, RI = WL.ring.inner, rim = WELL.rim;
  let seed = 9021; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }, rr = (a, b) => a + (b - a) * rnd();
  const group = new THREE.Group(); group.position.set(WELL.x, WELL.y, WELL.z); group.rotation.y = 0.35; scene.add(group);

  const grain = canvasTex(128, 256, (g, w, h) => {   // weathered wood, grain along v
    g.fillStyle = '#8d7658'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { const x = rnd() * w, y = rnd() * h, len = 30 + rnd() * 160; g.strokeStyle = rnd() < 0.6 ? `rgba(50,34,22,${0.1 + rnd() * 0.3})` : `rgba(220,200,170,${0.05 + rnd() * 0.15})`; g.lineWidth = 0.6 + rnd() * 1.5; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + rr(-3, 3), y + len / 3, x + rr(-3, 3), y + len * 2 / 3, x, y + len); g.stroke(); }
  });
  grain.wrapS = grain.wrapT = THREE.RepeatWrapping; grain.anisotropy = maxAniso;
  const tint = (g, c) => paint(g, col => col.copy(c));
  const place = (g, x, y, z, ry = 0, rx = 0, rz = 0) => { g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz))); g.translate(x, y, z); return g; };

  /* ---- stones: courses of blocks round the shaft, a cap course of flat stones ---- */
  const stones = [], greys = [0x6b665d, 0x5d584f, 0x767064, 0x55514a, 0x6e6254, 0x645a4c];   // fieldstone, some warmer
  const block = (a, y, h, w, d, r) => {
    const g = new THREE.BoxGeometry(w, h, d, 2, 1, 1), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * rr(0.97, 1.03), p.getY(i) * rr(0.94, 1.0), p.getZ(i) * rr(0.95, 1.05));   // a little uneven
    g.computeVertexNormals();
    const c = lin(greys[Math.floor(rnd() * greys.length)]).multiplyScalar(rr(0.85, 1.1));
    paint(g, (col, x, yy, z) => col.copy(c).multiplyScalar(0.85 + 0.15 * (yy / h + 0.5) + 0.08 * Math.sin(x * 60 + z * 40)));
    return place(g, Math.cos(a) * r, y, Math.sin(a) * r, -a + Math.PI / 2);
  };
  const N = WL.ring.stones, ch = (rim - 0.06) / WL.ring.courses, mid = (R + RI) / 2;
  for (let c = 0; c < WL.ring.courses; c++) for (let i = 0; i < N; i++) {
    const a = (i + (c % 2) * 0.5) / N * Math.PI * 2 + rr(-0.03, 0.03);
    stones.push(block(a, c * ch + ch / 2 - 0.02, ch - 0.012, 2 * Math.PI * mid / N - 0.018, R - RI, mid));
  }
  for (let i = 0; i < 10; i++) { const a = (i + 0.3) / 10 * Math.PI * 2; stones.push(block(a, rim - 0.035, 0.07, 2 * Math.PI * (R + 0.03) / 10 - 0.02, R - RI + 0.08, mid + 0.01)); }
  // mortar behind the stones' joints
  const mortar = new THREE.CylinderGeometry(R - 0.035, R - 0.035, rim - 0.04, 20, 1, true); mortar.translate(0, (rim - 0.04) / 2, 0); paint(mortar, c => c.copy(lin(0x4a463f)));
  stones.push(mortar);
  // the shaft inside, darkening downwards, and the water far below
  const shaft = new THREE.CylinderGeometry(RI + 0.005, RI + 0.005, rim - WL.water + 0.1, 20, 6, true); shaft.translate(0, (rim + WL.water) / 2 - 0.05, 0);
  paint(shaft, (c, x, y) => c.setRGB(0.16, 0.15, 0.14).multiplyScalar(Math.max(0.06, Math.min(1, (y - WL.water) / (rim - WL.water)) * 1.1)));
  const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
  const shaftMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, side: THREE.BackSide });
  const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; group.add(m); return m; };
  add(mergeGeos(stones, ['position', 'normal', 'color']), stoneMat);
  const water = new THREE.CircleGeometry(RI, 20).rotateX(Math.PI / 2); water.translate(0, WL.water, 0);   // facing down: the shaft's material shows back faces
  paint(water, c => c.setRGB(0.012, 0.03, 0.035));
  add(mergeGeos([shaft, water], ['position', 'normal', 'color']), shaftMat, false);

  /* ---- posts, beam, roof ---- */
  const wood = [], woodCol = lin(0xb59a78), dark = lin(0x7d664c);
  const beam = (w, h, d, x, y, z, c = woodCol, ry = 0, rx = 0, rz = 0) => {
    const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, o = rnd();
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.3 + o, uv.getY(k) * Math.max(w, h, d) * 0.9 + o * 3);
    wood.push(place(tint(g, c.clone().multiplyScalar(rr(0.9, 1.08))), x, y, z, ry, rx, rz));
  };
  const PX = WL.postX, top = WL.roofY - 0.05;   // the posts reach up under the ridge beam, a crosspiece under each end of the roof
  for (const s of [-1, 1]) { beam(0.11, top + 0.1, 0.11, s * PX, top / 2 - 0.05, 0); beam(0.07, 0.07, 0.7, s * PX, top - 0.3, 0, dark); }
  beam(PX * 2 + 0.3, 0.09, 0.09, 0, WL.roofY - 0.02, 0, dark);   // the ridge beam
  const slope = 0.62, pitch = 0.62, roofW = PX * 2 + 0.42;
  const roofGeo = [];
  for (const s of [-1, 1]) {   // two roof slopes of overlapping shingle rows (the rows as steps)
    for (let row = 0; row < 5; row++) {
      const t = (row + 0.5) / 5, zc = s * Math.cos(pitch) * slope * t, yc = WL.roofY + 0.04 - Math.sin(pitch) * slope * t;
      const g = new THREE.BoxGeometry(roofW, 0.028, slope / 5 + 0.05, 8, 1, 1), p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) < 0 && Math.abs(p.getZ(i)) > 0.01) p.setY(i, p.getY(i) + rr(-0.006, 0.004));
      const uv = g.attributes.uv, o = rnd(); for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * roofW * 1.5 + o, uv.getY(k) * 0.3 + o);
      g.computeVertexNormals();
      paint(g, (c, x) => c.copy(lin(0x6a5540)).multiplyScalar(0.8 + 0.3 * Math.abs(Math.sin(x * 23 + row * 1.7))));
      roofGeo.push(place(g, 0, yc, zc, 0, s * pitch));
    }
  }
  const woodMat = new THREE.MeshStandardMaterial({ map: grain, vertexColors: true, roughness: 0.88, metalness: 0, userData: { season: 'roof' } });   // snow on the roof and the beams' tops
  add(mergeGeos(wood.concat(roofGeo), ['position', 'normal', 'uv', 'color']), woodMat);

  /* ---- the windlass: axle, wound rope, crank (turns about x) ---- */
  const axle = new THREE.Group(); axle.position.y = WL.axleY; group.add(axle);
  const ax = new THREE.CylinderGeometry(WL.axleR, WL.axleR, PX * 2 + 0.12, 12, 1); ax.rotateZ(Math.PI / 2);
  const uvA = ax.attributes.uv; for (let k = 0; k < uvA.count; k++) uvA.setXY(k, uvA.getX(k), uvA.getY(k) * 1.2);
  tint(ax, lin(0xa58a66));
  const coil = new THREE.CylinderGeometry(WL.axleR + 0.014, WL.axleR + 0.014, 0.26, 12, 6); coil.rotateZ(Math.PI / 2);
  paint(coil, (c, x) => c.copy(lin(0xb49a6a)).multiplyScalar(0.75 + 0.35 * Math.abs(Math.sin(x * 120))));   // the turns of rope
  const arm = new THREE.BoxGeometry(0.035, 0.26, 0.035); arm.translate(PX + 0.1, -0.12, 0); tint(arm, lin(0x2c2825));
  const handle = new THREE.CylinderGeometry(0.016, 0.016, 0.15, 8); handle.rotateZ(Math.PI / 2); handle.translate(PX + 0.17, -0.24, 0); tint(handle, lin(0x5a4632));
  const pin = new THREE.CylinderGeometry(0.012, 0.012, 0.12, 8); pin.rotateZ(Math.PI / 2); pin.translate(PX + 0.06, 0, 0); tint(pin, lin(0x2c2825));
  const axleMesh = new THREE.Mesh(mergeGeos([ax, coil, arm, handle, pin], ['position', 'normal', 'uv', 'color']), woodMat); axleMesh.castShadow = true; axle.add(axleMesh);

  /* ---- rope and bucket ---- */
  const B = WL.bucket, ropeTop = WL.axleY - WL.axleR, ropeX = 0.0, ropeZ = 0.0;
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 1, 6, 1).translate(0, -0.5, 0), new THREE.MeshStandardMaterial({ color: lin(0xa89068), roughness: 0.95 }));
  rope.position.set(ropeX, ropeTop, ropeZ); rope.castShadow = true; group.add(rope);
  const bucket = new THREE.Group(); group.add(bucket);
  const body = new THREE.LatheGeometry([[0, 0.004], [B.r0, 0], [B.r0 + 0.002, 0.004], [B.r1, B.h], [B.r1 - 0.012, B.h], [B.r0 - 0.012, 0.018], [0, 0.018]].map(([x, y]) => new THREE.Vector2(x, y)), 24);
  paint(body, (c, x, y, z) => { const a = Math.atan2(z, x), stave = Math.floor((a + Math.PI) / (Math.PI * 2) * 12); c.copy(lin(0x9a7a52)).multiplyScalar(0.8 + 0.25 * ((stave * 7) % 3) / 2); if (Math.abs(y - 0.04) < 0.014 || Math.abs(y - B.h + 0.03) < 0.014) c.copy(lin(0x3a3530)); });
  const bail = new THREE.TorusGeometry(B.r1 + 0.005, 0.005, 5, 18, Math.PI); bail.translate(0, B.h, 0); tint(bail, lin(0x3a3530));
  const bMesh = new THREE.Mesh(mergeGeos([body, bail], ['position', 'normal', 'color']), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.05, side: THREE.DoubleSide }));
  bMesh.castShadow = true; bucket.add(bMesh);
  const inBucket = new THREE.Mesh(new THREE.CircleGeometry(B.r1 - 0.016, 18).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: lin(0x1f3a3e), roughness: 0.25, metalness: 0.1 }));
  inBucket.position.y = B.h - 0.035; inBucket.visible = false; bucket.add(inBucket);

  let spin = 0;
  function setBucket(y) {   // y: the bucket's base above the ground (idle WELL_LOOK.bucket.idle, down to the water)
    bucket.position.set(ropeX, y, ropeZ);
    const hang = ropeTop - (y + B.h + B.bail);
    rope.scale.y = Math.max(0.01, hang);
    spin = (B.idle - y) / WL.axleR; axle.rotation.x = spin;
  }
  setBucket(B.idle);
  obstacles.add(WELL.x, WELL.z, R + 0.08, WELL.y + 1.9);
  return {
    group, setBucket, setFull(on) { inBucket.visible = on; },
    water: WL.water, idle: B.idle, rimTop: new V(WELL.x, WELL.y + rim + 0.2, WELL.z),
    bucketWorld: () => bucket.getWorldPosition(new V()),
  };
}
