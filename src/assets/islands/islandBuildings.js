import * as THREE from 'three';
import { lin, clamp } from '../../core/math.js';
import { canvasTex } from '../../core/canvasTexture.js';
import { mergeGeos, limb } from '../../core/geometry.js';
import { buildingPlans, buildingAt } from '../../world/buildingPlans.js';
import { islandH } from '../../world/layout.js';

/**
 * The outer islands' buildings at the cabin's detail, to walk into (their floors, stairs and walls: world/buildingPlans.js):
 *  - the windmill on Millholm: a whitewashed stone tower with a door and deep-set windows, a thatched cap; inside, the
 *    millstones in their wooden tun under the hopper, grain sacks, the flour bin, a workbench, the main shaft turning with
 *    the sails; a steep stair to the loft (the miller's bunk, a table, shelves, the great spur wheel) open to the cap,
 *    where the windshaft and the brake wheel turn;
 *  - the beach hut on Palm Cay: a bamboo room on stilts, a thatched roof, a porch with a bench, steps to the sand; a
 *    low bed, a woven rug, a table with coconut cups, shells on a shelf, a net and a spear, a sea chest;
 *  - the observatory on Ember Rock: a stone drum under the turning dome; the telescope on its pier, a desk with star
 *    charts and brass instruments, bookshelves, a globe, a chalkboard of orbits, a cot;
 *  - the lodge on Heron Marsh: a board-and-batten house on stilts with a gable roof, a railed porch, steps down to the
 *    boardwalk; an iron stove and its pipe, a bunk bed, table and chairs, shelves of jars, nets, rods, a map of the marsh.
 * Every building is one group of a few merged meshes by material (textures drawn here from their own random stream),
 * drawn within NEAR m (the islands' cheap shells, assets/islands/outerIslands.js, stand in further away). Each has a
 * lantern you can light (main.js adds it to app/fires.js): its glass, the windows and a warm glow on the walls inside.
 */
const NEAR = 60;
const stream = seed => { let s = seed | 0; return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const WHITE = new THREE.Color(1, 1, 1);

/* ---- textures ---- */
function textures(maxAniso) {
  const R = stream(8117), rr = (a, b) => a + (b - a) * R();
  const rep = t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; return t; };
  const planks = (base, n, vertical) => (g, w, h) => {
    const pw = (vertical ? w : h) / n;
    for (let i = 0; i < n; i++) {
      const k = 0.8 + 0.3 * R(); g.fillStyle = `rgb(${base[0] * k | 0},${base[1] * k | 0},${base[2] * k | 0})`;
      if (vertical) g.fillRect(i * pw, 0, pw, h); else g.fillRect(0, i * pw, w, pw);
      for (let s = 0; s < 40; s++) { g.strokeStyle = `rgba(40,25,12,${0.08 + R() * 0.12})`; g.lineWidth = 1; g.beginPath(); if (vertical) { const x = i * pw + R() * pw; g.moveTo(x, 0); g.bezierCurveTo(x + rr(-3, 3), h * 0.3, x + rr(-3, 3), h * 0.7, x, h); } else { const y = i * pw + R() * pw; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + rr(-3, 3), w * 0.7, y + rr(-3, 3), w, y); } g.stroke(); }
      g.fillStyle = 'rgba(25,15,8,0.7)'; if (vertical) g.fillRect(i * pw, 0, 2, h); else g.fillRect(0, i * pw, w, 2);
      for (let s = 0; s < 2; s++) { g.fillStyle = 'rgba(30,20,12,0.5)'; g.beginPath(); const cx = vertical ? i * pw + pw / 2 : R() * w, cy = vertical ? R() * h : i * pw + pw / 2; g.ellipse(cx, cy, 3 + R() * 3, 2 + R() * 2, 0, 0, 6.28); g.fill(); }
      if (!vertical) for (let x = R() * 60; x < w; x += 120 + R() * 140) { g.fillStyle = 'rgba(25,15,8,0.6)'; g.fillRect(x, i * pw, 2, pw); }
    }
  };
  const plank = rep(canvasTex(256, 256, planks([150, 104, 62], 5, false)));
  const board = rep(canvasTex(256, 256, planks([128, 110, 88], 4, true)));
  const plaster = rep(canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e8e3d8'; g.fillRect(0, 0, w, h);
    for (let y = 0, row = 0; y < h; y += 26 + R() * 10, row++) for (let x = -R() * 40; x < w; x += 40 + R() * 30) { g.strokeStyle = 'rgba(120,110,95,0.28)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x + 22, y + 14, 20 + R() * 6, 11 + R() * 3, rr(-0.1, 0.1), 0, 6.28); g.stroke(); }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '255,255,250' : '150,140,125'},${R() * 0.25})`; g.fillRect(R() * w, R() * h, 1 + R() * 3, 1 + R() * 3); }
    for (let i = 0; i < 6; i++) { const x = R() * w; const grd = g.createLinearGradient(x, 0, x, h); grd.addColorStop(0, 'rgba(120,110,90,0)'); grd.addColorStop(1, 'rgba(120,110,90,0.18)'); g.fillStyle = grd; g.fillRect(x, R() * h * 0.5, 4 + R() * 8, h); }
  }));
  const ashlar = rep(canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#6a655d'; g.fillRect(0, 0, w, h);
    for (let y = 0, row = 0; y < h; y += 32, row++) for (let x = (row % 2) * -32; x < w; x += 64) { const k = 0.8 + 0.35 * R(); g.fillStyle = `rgb(${138 * k | 0},${132 * k | 0},${122 * k | 0})`; g.fillRect(x + 2, y + 2, 60, 28); for (let s = 0; s < 30; s++) { g.fillStyle = `rgba(${R() < 0.5 ? '40,38,35' : '200,195,185'},${R() * 0.2})`; g.fillRect(x + 2 + R() * 58, y + 2 + R() * 26, 2, 2); } }
  }));
  const thatch = rep(canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a7244'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const x = R() * w, y = R() * h, l = 10 + R() * 26, k = R(); g.strokeStyle = `rgba(${200 * (0.6 + k * 0.5) | 0},${170 * (0.6 + k * 0.5) | 0},${100 * (0.6 + k * 0.4) | 0},0.55)`; g.lineWidth = 1 + R(); g.beginPath(); g.moveTo(x, y); g.lineTo(x + rr(-2, 2), y + l); g.stroke(); }
    for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(40,28,12,0.35)'; g.fillRect(0, y, w, 3); }
  }));
  const bamboo = rep(canvasTex(256, 256, (g, w, h) => {
    for (let x = 0; x < w; x += 16) { const k = 0.85 + 0.25 * R(), grd = g.createLinearGradient(x, 0, x + 16, 0); grd.addColorStop(0, `rgb(${120 * k | 0},${100 * k | 0},${55 * k | 0})`); grd.addColorStop(0.5, `rgb(${206 * k | 0},${178 * k | 0},${110 * k | 0})`); grd.addColorStop(1, `rgb(${110 * k | 0},${90 * k | 0},${50 * k | 0})`); g.fillStyle = grd; g.fillRect(x, 0, 16, h);
      for (let y = R() * 60; y < h; y += 60 + R() * 30) { g.fillStyle = 'rgba(70,50,20,0.7)'; g.fillRect(x, y, 16, 3); } }
  }));
  const cloth = rep(canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#e8e4dc'; g.fillRect(0, 0, w, h); for (let i = 0; i < w; i += 4) { g.fillStyle = 'rgba(120,110,100,0.18)'; g.fillRect(i, 0, 1, h); g.fillRect(0, i, w, 1); } for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(90,80,70,${R() * 0.15})`; g.fillRect(R() * w, R() * h, 2, 2); } }));
  const rug = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#8a3a2a'; g.fillRect(0, 0, w, h);
    const band = (m, c) => { g.strokeStyle = c; g.lineWidth = 10; g.strokeRect(m, m, w - 2 * m, h - 2 * m); };
    band(12, '#d9b26a'); band(34, '#2e4a5e'); band(56, '#e8dcc0');
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { g.fillStyle = (i + j) % 2 ? '#d9b26a' : '#2e4a5e'; g.save(); g.translate(78 + i * 25, 78 + j * 25); g.rotate(Math.PI / 4); g.fillRect(-6, -6, 12, 12); g.restore(); }
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(0,0,0,${R() * 0.12})`; g.fillRect(R() * w, R() * h, 2, 1); }
  });
  // pictures: a star chart, a map of the marsh, a chalkboard of orbits, a painting of the sea (a 2 x 2 atlas)
  const paper = canvasTex(512, 512, (g) => {
    g.fillStyle = '#16213a'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(240,236,210,${0.4 + R() * 0.6})`; g.beginPath(); g.arc(R() * 256, R() * 256, R() < 0.9 ? 0.8 : 1.8, 0, 6.28); g.fill(); }
    g.strokeStyle = 'rgba(210,200,150,0.6)'; g.lineWidth = 1; for (let c = 0; c < 6; c++) { g.beginPath(); let x = 30 + R() * 190, y = 30 + R() * 190; g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += rr(-30, 30); y += rr(-30, 30); g.lineTo(x, y); g.arc(x, y, 2, 0, 6.28); } g.stroke(); }
    g.strokeStyle = 'rgba(210,200,150,0.35)'; g.beginPath(); g.arc(128, 128, 118, 0, 6.28); g.stroke(); g.beginPath(); g.moveTo(10, 128); g.lineTo(246, 128); g.moveTo(128, 10); g.lineTo(128, 246); g.stroke();
    g.fillStyle = '#d9c9a0'; g.fillRect(256, 0, 256, 256); g.fillStyle = '#7fa3a0'; g.beginPath(); g.moveTo(256, 256); for (let a = 0; a < 6.28; a += 0.3) g.lineTo(384 + Math.cos(a) * (90 + 20 * Math.sin(a * 3)), 128 + Math.sin(a) * (80 + 18 * Math.cos(a * 2))); g.fill();
    g.fillStyle = '#6f8a4a'; g.beginPath(); for (let a = 0; a < 6.28; a += 0.3) g.lineTo(384 + Math.cos(a) * (70 + 18 * Math.sin(a * 3)), 128 + Math.sin(a) * (60 + 15 * Math.cos(a * 2))); g.fill();
    g.fillStyle = '#5a88a0'; for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(340 + R() * 90, 90 + R() * 80, 8 + R() * 12, 5 + R() * 8, R(), 0, 6.28); g.fill(); }
    g.strokeStyle = '#5a3a22'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.moveTo(300, 200); g.lineTo(360, 150); g.lineTo(390, 120); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#3a2a1a'; g.strokeRect(262, 6, 244, 244); g.font = 'italic 16px serif'; g.fillStyle = '#3a2a1a'; g.fillText('Heron Marsh', 330, 238);
    g.fillStyle = '#2c3a30'; g.fillRect(0, 256, 256, 256); g.strokeStyle = 'rgba(235,235,225,0.75)'; g.lineWidth = 1.5;
    for (let k = 1; k <= 4; k++) { g.beginPath(); g.ellipse(128, 384, 26 * k, 20 * k, 0.2, 0, 6.28); g.stroke(); }
    g.fillStyle = 'rgba(245,230,150,0.9)'; g.beginPath(); g.arc(128, 384, 9, 0, 6.28); g.fill(); g.fillStyle = 'rgba(235,235,225,0.9)'; for (let k = 1; k <= 4; k++) { g.beginPath(); g.arc(128 + 26 * k * Math.cos(k * 1.7), 384 + 20 * k * Math.sin(k * 1.7), 3, 0, 6.28); g.fill(); }
    g.font = '14px serif'; g.fillText('r³ ∝ T²', 20, 490);
    const sky = g.createLinearGradient(0, 256, 0, 400); sky.addColorStop(0, '#9fb8c8'); sky.addColorStop(1, '#e6d6b0'); g.fillStyle = sky; g.fillRect(256, 256, 256, 150);
    g.fillStyle = '#3f6f86'; g.fillRect(256, 400, 256, 112); g.fillStyle = 'rgba(255,255,255,0.4)'; for (let i = 0; i < 30; i++) g.fillRect(256 + R() * 256, 400 + R() * 110, 8 + R() * 16, 2);
    g.fillStyle = '#6a7a8a'; g.beginPath(); g.moveTo(420, 400); g.quadraticCurveTo(430, 340, 438, 330); g.lineTo(446, 332); g.quadraticCurveTo(440, 360, 444, 400); g.fill(); g.strokeStyle = '#4a4030'; g.beginPath(); g.moveTo(438, 330); g.lineTo(426, 322); g.stroke();
    g.strokeStyle = '#5a3a22'; g.lineWidth = 10; g.strokeRect(256, 256, 256, 256);
  });
  return { plank, board, plaster, ashlar, thatch, bamboo, cloth, rug, paper };
}

/* ---- the kit: geometries collected per material, uv projected from their local position (s m per repeat) ---- */
function kit() {
  const lists = new Map();
  const put = (key, g, tint = WHITE, s = 1) => {
    g = g.index ? g.toNonIndexed() : g; if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position, n = g.attributes.normal, uv = new Float32Array(p.count * 2), col = new Float32Array(p.count * 3), c = new THREE.Color(), keepUV = g.userData.keepUV;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
      if (keepUV) { uv[i * 2] = g.attributes.uv.getX(i); uv[i * 2 + 1] = g.attributes.uv.getY(i); }
      else if (ay >= ax && ay >= az) { uv[i * 2] = x / s; uv[i * 2 + 1] = z / s; } else if (ax >= az) { uv[i * 2] = z / s; uv[i * 2 + 1] = y / s; } else { uv[i * 2] = x / s; uv[i * 2 + 1] = y / s; }
      (typeof tint === 'function' ? tint(c, x, y, z) : c.copy(tint)).toArray(col, i * 3);
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (lists.get(key) || lists.set(key, []).get(key)).push(g);
  };
  const B = {
    put,
    /** A box w x h x d standing on y at (u, v), turned ry. */
    box(key, w, h, d, u, y, v, ry = 0, tint, s) { const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0); g.rotateY(ry); g.translate(u, y, v); put(key, g, tint, s); },
    cyl(key, rt, rb, h, u, y, v, seg = 12, tint, s, open = false) { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); g.translate(u, y + h / 2, v); put(key, g, tint, s); },
    rod(key, a, b, r, seg = 6, tint, s) { put(key, limb(a, b, r, r, seg), tint, s); },
    ball(key, r, u, y, v, sx = 1, sy = 1, sz = 1, tint, s) { const g = new THREE.SphereGeometry(r, 12, 8); g.scale(sx, sy, sz); g.translate(u, y, v); put(key, g, tint, s); },
    /** A picture from the atlas (tile i of 4) on a wall facing +n (angle rn), w x h, centre at (u, y, v). */
    picture(i, w, h, u, y, v, rn) { const g = new THREE.PlaneGeometry(w, h), a = g.attributes.uv, tu = (i % 2) * 0.5, tv = i < 2 ? 0.5 : 0; for (let k = 0; k < a.count; k++) a.setXY(k, tu + a.getX(k) * 0.5, tv + a.getY(k) * 0.5); g.userData.keepUV = true; g.rotateY(Math.PI / 2 - rn); g.translate(u, y, v); put('paper', g); },
    /** A straight wall from (u0, v0) to (u1, v1), y0..y1, thick, with openings [{ t0, t1 (m along it), y0, y1 }]. */
    wall(key, u0, v0, u1, v1, y0, y1, thick, openings = [], tint, s) {
      const L = Math.hypot(u1 - u0, v1 - v0), ang = Math.atan2(v1 - v0, u1 - u0), du = (u1 - u0) / L, dv = (v1 - v0) / L;
      const piece = (t0, t1, ya, yb) => { if (t1 - t0 < 0.005 || yb - ya < 0.005) return; const g = new THREE.BoxGeometry(t1 - t0, yb - ya, thick); g.translate((t0 + t1) / 2, (ya + yb) / 2, 0); g.rotateY(-ang); g.translate(u0, 0, v0); put(key, g, tint, s); };
      const ops = openings.slice().sort((a, b) => a.t0 - b.t0); let t = 0;
      for (const o of ops) { piece(t, o.t0, y0, y1); piece(o.t0, o.t1, y0, o.y0); piece(o.t0, o.t1, o.y1, y1); t = o.t1; }
      piece(t, L, y0, y1);
      return { at: (tt, n = 0) => [u0 + du * tt - dv * n, v0 + dv * tt + du * n], ang };
    },
    /** A round wall (radius rOut(y) outside, rIn(y) inside), y0..y1 in bands, N cells round; openings: { k0, k1, y0, y1 } in cells (k from angle 0 = +u). */
    roundWall(key, rOut, rIn, y0, y1, N, openings, tint, s) {
      const ys = [...new Set([y0, y1, ...openings.flatMap(o => [o.y0, o.y1])].filter(y => y >= y0 && y <= y1))].sort((a, b) => a - b), step = Math.PI * 2 / N, pos = [];
      const P = (r, a, y) => [Math.cos(a) * r, y, Math.sin(a) * r];
      const quad = (a, b, c, d) => pos.push(...a, ...b, ...c, ...a, ...c, ...d);
      const open = (k, ya, yb) => openings.some(o => { const kk = ((k - o.k0) % N + N) % N; return kk < o.k1 - o.k0 && ya >= o.y0 - 1e-4 && yb <= o.y1 + 1e-4; });
      for (let j = 0; j < ys.length - 1; j++) { const ya = ys[j], yb = ys[j + 1];
        for (let k = 0; k < N; k++) { if (open(k, ya, yb)) continue; const a0 = k * step, a1 = a0 + step;
          quad(P(rOut(ya), a0, ya), P(rOut(yb), a0, yb), P(rOut(yb), a1, yb), P(rOut(ya), a1, ya));
          quad(P(rIn(ya), a1, ya), P(rIn(yb), a1, yb), P(rIn(yb), a0, yb), P(rIn(ya), a0, ya)); } }
      for (const o of openings) { const a0 = o.k0 * step, a1 = o.k1 * step;
        quad(P(rIn(o.y0), a0, o.y0), P(rIn(o.y1), a0, o.y1), P(rOut(o.y1), a0, o.y1), P(rOut(o.y0), a0, o.y0));
        quad(P(rOut(o.y0), a1, o.y0), P(rOut(o.y1), a1, o.y1), P(rIn(o.y1), a1, o.y1), P(rIn(o.y0), a1, o.y0));
        for (let k = o.k0; k < o.k1; k++) { const b0 = k * step, b1 = b0 + step;
          if (o.y1 < y1) quad(P(rIn(o.y1), b0, o.y1), P(rIn(o.y1), b1, o.y1), P(rOut(o.y1), b1, o.y1), P(rOut(o.y1), b0, o.y1));
          if (o.y0 > y0) quad(P(rOut(o.y0), b0, o.y0), P(rOut(o.y0), b1, o.y0), P(rIn(o.y0), b1, o.y0), P(rIn(o.y0), b0, o.y0)); } }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); put(key, g, tint, s);
      return step;
    },
    meshes(group, mats, noShadow = []) {
      for (const [key, list] of lists) { const m = new THREE.Mesh(mergeGeos(list, ['position', 'normal', 'uv', 'color']), mats[key]); m.castShadow = !noShadow.includes(key); m.receiveShadow = true; group.add(m); }
    },
  };
  return B;
}

export function createIslandBuildings(ctx) {
  const { scene, camera, skyUniforms, tex } = ctx, T = textures(ctx.maxAniso);
  const std = (map, o = {}) => new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.5, ...o });
  const mats = {
    plank: std(T.plank, { roughness: 0.78 }), board: std(T.board), plaster: std(T.plaster, { roughness: 0.92 }), ashlar: std(T.ashlar, { roughness: 0.9 }),
    thatch: std(T.thatch, { roughness: 0.95, side: THREE.DoubleSide }), bamboo: std(T.bamboo, { roughness: 0.7 }), cloth: std(T.cloth, { roughness: 0.95 }), rug: std(T.rug, { roughness: 1 }),
    paper: std(T.paper, { roughness: 0.8 }), plain: std(null, { roughness: 0.7 }), metal: std(null, { roughness: 0.45, metalness: 0.6 }), stone: std(T.ashlar, { roughness: 0.95 }),
  };
  mats.thatch.userData.season = 'roof';
  const warm = new THREE.Color(1, 0.72, 0.42); Object.values(mats).forEach(m => { m.emissive = warm.clone(); m.emissiveMap = m.map; m.emissiveIntensity = 0; });   // (the lamp's glow keeps the textures)
  const R = stream(3301), rr = (a, b) => a + (b - a) * R();
  const out = [];

  for (const P of buildingPlans()) {
    const K = kit(), group = new THREE.Group(), lamp = { k: 1, glass: [], glowAt: [] }, spins = [];
    group.position.set(P.x, 0, P.z); group.rotation.y = -P.a;
    const wood = lin(0x8a6a48), dark = lin(0x4a3424), iron = lin(0x2e2c2a), brass = lin(0xb08a3a), stoneC = lin(0x8c877e);
    const solid = (u, v, hu, hv, yLo, yHi, ang = 0) => { const c = Math.cos(ang), s = Math.sin(ang), pt = (a, b) => [u + c * a - s * b, v + s * a + c * b], q = [pt(-hu, -hv), pt(hu, -hv), pt(hu, hv), pt(-hu, hv)];
      for (let i = 0; i < 4; i++) P.walls.push([...q[i], ...q[(i + 1) % 4], yLo, yHi, 0.02]); };
    const outSteps = () => { const S = P.outStair; if (!S) return; const [u0, u1] = S.rect, run = (u1 - u0) / S.n, dy = (S.y0 - S.y1) / S.n;   // stone steps down from the door, solid to the ground
      for (let k = 1; k <= S.n; k++) { const y = S.y0 - k * dy, uc = u0 + (k - 0.5) * run, gy = Math.min(...[-0.62, 0, 0.62].map(v => islandH(P.I, ...P.W(uc, v)))) - 0.3; K.box('stone', run + 0.02, y - gy, 1.25, uc, gy, 0, 0, stoneC.clone().multiplyScalar(0.85 + 0.2 * R()), 1); } };
    const lantern = (u, y, v, hang = 0) => {   // a small iron lantern (its glass lit by its own material)
      K.box('metal', 0.18, 0.02, 0.18, u, y - 0.14, v, 0, iron); K.box('metal', 0.2, 0.02, 0.2, u, y + 0.12, v, 0, iron);
      const cap = new THREE.ConeGeometry(0.15, 0.12, 4); cap.rotateY(Math.PI / 4); cap.translate(u, y + 0.2, v); K.put('metal', cap, iron);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.rod('metal', V(u + a * 0.08, y - 0.13, v + b * 0.08), V(u + a * 0.08, y + 0.12, v + b * 0.08), 0.008, 4, iron);
      const gl = new THREE.BoxGeometry(0.14, 0.22, 0.14); gl.translate(u, y, v); lamp.glass.push(gl); lamp.glowAt.push(u, y, v);
      if (hang) K.rod('metal', V(u, y + 0.25, v), V(u, y + 0.25 + hang, v), 0.006, 4, iron);
    };
    const sack = (u, y, v, s = 1, ry = 0) => { const g = new THREE.SphereGeometry(0.26 * s, 12, 10); g.scale(1, 1.35, 0.8); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const yy = p.getY(i); if (yy < -0.2 * s) p.setY(i, -0.2 * s - (yy + 0.2 * s) * 0.2); } g.computeVertexNormals(); g.rotateY(ry); g.translate(u, y + 0.24 * s, v); K.put('cloth', g, lin(0xc8b48a)); K.cyl('cloth', 0.05 * s, 0.08 * s, 0.1 * s, u, y + 0.58 * s, v, 8, lin(0xb09a70)); };
    const books = (u, y, v, len, ry) => { const c = Math.cos(ry), s = Math.sin(ry); let t = -len / 2; while (t < len / 2 - 0.04) { const w = rr(0.03, 0.06), h = rr(0.18, 0.27), col = new THREE.Color().setHSL(R(), rr(0.3, 0.6), rr(0.2, 0.4)); K.box('plain', w, h, 0.17, u + c * (t + w / 2), y, v + s * (t + w / 2), -ry, col); t += w + 0.004; } };
    const shelf = (u, y0, v, len, ry, levels, fill) => { const c = Math.cos(ry), s = Math.sin(ry);
      for (let k = 0; k < levels; k++) K.box('plank', len, 0.03, 0.24, u, y0 + k * 0.42, v, -ry, wood);
      for (const e of [-1, 1]) K.box('plank', 0.03, levels * 0.42 - 0.3, 0.24, u + c * e * len / 2, y0, v + s * e * len / 2, -ry, wood.clone().multiplyScalar(0.85));
      for (let k = 0; k < levels; k++) fill(k, y0 + k * 0.42 + 0.03); };
    const jar = (u, y, v, col) => { K.cyl('plain', 0.045, 0.05, 0.14, u, y, v, 10, col); K.cyl('metal', 0.04, 0.04, 0.02, u, y + 0.14, v, 10, lin(0x8a7a60)); };
    const chair = (u, y, v, ry) => { const c = Math.cos(ry), s = Math.sin(ry), at = (a, b) => [u + c * a - s * b, v + s * a + c * b];
      K.box('plank', 0.42, 0.04, 0.42, u, y + 0.44, v, -ry, wood); for (const [a, b] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) { const [x, z] = at(a, b); K.box('plank', 0.04, 0.44, 0.04, x, y, z, -ry, wood); }
      for (const b of [-0.18, 0.18]) { const [x, z] = at(-0.19, b); K.box('plank', 0.04, 0.5, 0.04, x, y + 0.46, z, -ry, wood); } const [bx, bz] = at(-0.19, 0); K.box('plank', 0.04, 0.12, 0.4, bx, y + 0.82, bz, -ry, wood); };
    const table = (u, y, v, w, d, ry, h = 0.74) => { const c = Math.cos(ry), s = Math.sin(ry); K.box('plank', w, 0.04, d, u, y + h, v, -ry, wood);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.box('plank', 0.05, h, 0.05, u + c * a * (w / 2 - 0.06) - s * b * (d / 2 - 0.06), y, v + s * a * (w / 2 - 0.06) + c * b * (d / 2 - 0.06), -ry, wood.clone().multiplyScalar(0.85)); };
    const bed = (u, y, v, ry, blanket, len = 1.9, w = 0.9, h = 0.4) => { const c = Math.cos(ry), s = Math.sin(ry);
      K.box('plank', len, 0.12, w, u, y + h - 0.12, v, -ry, wood); for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) K.box('plank', 0.07, h, 0.07, u + c * a * (len / 2 - 0.04) - s * b * (w / 2 - 0.04), y, v + s * a * (len / 2 - 0.04) + c * b * (w / 2 - 0.04), -ry, wood);
      K.box('plank', 0.06, 0.5, w, u - c * (len / 2 - 0.03), y + h - 0.1, v - s * (len / 2 - 0.03), -ry, wood.clone().multiplyScalar(0.85));
      K.box('cloth', len - 0.1, 0.12, w - 0.08, u, y + h, v, -ry, lin(0xe6e0d2)); K.box('cloth', len * 0.66, 0.05, w - 0.02, u + c * len * 0.16, y + h + 0.1, v + s * len * 0.16, -ry, blanket);
      K.ball('cloth', 0.14, u - c * (len / 2 - 0.3), y + h + 0.16, v - s * (len / 2 - 0.3), 1.2, 0.45, 2.0, lin(0xf2eee4)); };

    if (P.kind === 'windmill') {
      const { f0, f1, base } = P, top = base + P.height, N = 28, door = { k0: -1, k1: 1, y0: f0 - 0.02, y1: f0 + P.door.h }, wins = [{ k0: 7, k1: 8, y0: f0 + 1.2, y1: f0 + 1.85 }, { k0: 20, k1: 21, y0: f1 + 1.0, y1: f1 + 1.65 }, { k0: 13, k1: 14, y0: f1 + 1.0, y1: f1 + 1.65 }, { k0: 3, k1: 4, y0: f1 + 1.9, y1: f1 + 2.5 }];
      const step = K.roundWall('plaster', y => P.Ro(y), y => P.Ri(y), base + 0.3, top, N, [door, ...wins], WHITE, 1.6);
      { const y0 = Math.min(base, P.footMin - 0.4); K.cyl('stone', 2.45, 2.55, f0 - y0, 0, y0, 0, 28, stoneC, 1.2); }   // the plinth, down to the ground all round
      outSteps();
      { const g = new THREE.TorusGeometry(P.Ro(top) + 0.04, 0.09, 6, 32); g.rotateX(Math.PI / 2); g.translate(0, top, 0); K.put('plank', g, dark); }
      { const g = new THREE.ConeGeometry(P.Ro(top) + 0.25, 2.2, 28, 3, true); g.translate(0, top + 1.1, 0); K.put('thatch', g, WHITE, 1.2); K.cyl('plank', 0.05, 0.12, 0.35, 0, top + 2.1, 0, 8, dark); }
      for (const o of [door, ...wins]) { const a0 = o.k0 * step, a1 = o.k1 * step, am = (a0 + a1) / 2, rO = P.Ro((o.y0 + o.y1) / 2), rI = P.Ri((o.y0 + o.y1) / 2), w = 2 * Math.sin((a1 - a0) / 2) * rO;   // frames, the glass
        const fr = (dy, h) => { const g = new THREE.BoxGeometry(0.1, h, w + 0.12); g.translate(0, dy + h / 2, 0); g.rotateY(-am); g.translate(Math.cos(am) * (rO + 0.02), 0, Math.sin(am) * (rO + 0.02)); K.put('plank', g, dark); };
        fr(o.y1, 0.1); if (o !== door) { fr(o.y0 - 0.08, 0.08); const gl = new THREE.BoxGeometry(0.03, o.y1 - o.y0, w); gl.translate(0, (o.y0 + o.y1) / 2, 0); gl.rotateY(-am); gl.translate(Math.cos(am) * (rO + rI) / 2, 0, Math.sin(am) * (rO + rI) / 2); lamp.panes = (lamp.panes || []).concat([gl]); } }
      { const g = new THREE.BoxGeometry(0.06, P.door.h - 0.05, 0.92); g.translate(0.03, P.door.h / 2, 0.46); g.rotateY(1.9); g.translate(P.Ri(f0 + 1) + 0.05, f0, -0.46); K.put('board', g, wood); }   // the door, open inward
      // ground floor
      { const g = new THREE.CircleGeometry(P.Ri(f0) + 0.02, 28); g.rotateX(-Math.PI / 2); g.translate(0, f0, 0); K.put('plank', g, WHITE, 1.2); }
      { const sh = new THREE.Group(), sk = kit();   // the main shaft and the great spur wheel turn with the sails
        sk.cyl('plank', 0.13, 0.13, top + 0.4 - f0, 0, f0, 0, 10, dark, 1.2);
        const wheel = new THREE.TorusGeometry(0.75, 0.07, 6, 28); wheel.rotateX(Math.PI / 2); wheel.translate(0, f1 + 0.9, 0); sk.put('plank', wheel, wood);
        for (let k = 0; k < 4; k++) { const arm = new THREE.BoxGeometry(1.5, 0.08, 0.08); arm.rotateY(k * Math.PI / 4); arm.translate(0, f1 + 0.9, 0); sk.put('plank', arm, wood); }
        for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2, cog = new THREE.BoxGeometry(0.05, 0.12, 0.05); cog.translate(Math.cos(a) * 0.78, f1 + 1.0, Math.sin(a) * 0.78); sk.put('plank', cog, dark); }
        sk.meshes(sh, mats); group.add(sh); spins.push({ spin: sh, axis: 'y', speed: 0.6 }); }
      // the millstones in their tun, the hopper over them on its horse
      { const u = -0.95, v = -0.95; K.cyl('board', 0.45, 0.45, 0.55, u, f0, v, 10, wood, 1); K.cyl('stone', 0.42, 0.42, 0.04, u, f0 + 0.55, v, 20, stoneC.clone().multiplyScalar(0.85), 0.8);
        const hop = new THREE.CylinderGeometry(0.34, 0.08, 0.4, 4, 1, true); hop.rotateY(Math.PI / 4); hop.translate(u, f0 + 1.2, v); K.put('board', hop, wood); K.cyl('plain', 0.24, 0.24, 0.02, u, f0 + 1.33, v, 12, lin(0xd9c38a));
        for (const [a, b] of [[-0.26, -0.26], [0.26, -0.26], [0.26, 0.26], [-0.26, 0.26]]) K.rod('plank', V(u + a, f0 + 0.55, v + b), V(u + a * 0.5, f0 + 1.05, v + b * 0.5), 0.025, 5, dark);
        K.box('plank', 0.1, 0.06, 0.4, u + 0.35, f0 + 0.62, v, 0.4, wood); P.posts.push([u, v, 0.48, f0 - 0.5, f0 + 1.3]); }
      sack(0.25, f0, -1.3, 1, 0.3); sack(0.6, f0, -1.25, 0.9, 1.2); sack(0.42, f0 + 0.52, -1.28, 0.8, 2); P.posts.push([0.42, -1.28, 0.42, f0 - 0.5, f0 + 1.2]);
      { const u = 1.2, v = -0.85; K.box('board', 0.5, 0.75, 0.75, u, f0, v, 0.6, wood, 1); K.box('plank', 0.54, 0.04, 0.79, u, f0 + 0.75, v, 0.6, dark); K.cyl('metal', 0.08, 0.1, 0.12, u, f0 + 0.79, v + 0.1, 10, lin(0x9a9a92)); solid(u, v, 0.27, 0.4, f0 - 0.5, f0 + 0.8, -0.6); }   // the flour bin, a scoop
      K.box('metal', 0.3, 0.03, 0.08, 1.2, f0 + 0.79, -0.95, 0.3, iron);
      lantern(0.7, f1 - 0.45, -0.4, 0.3);
      // the stair to the loft, a rail on its open side; the loft's floor (the stairwell cut out), its rail, a beam under it
      { const [u0, u1, v0, v1] = P.stair.rect, n = P.stair.n, run = (u1 - u0) / n, rise = (P.stair.y1 - P.stair.y0) / n;
        for (let k = 1; k <= n; k++) K.box('plank', run + 0.06, 0.05, v1 - v0, u0 + (k - 0.5) * run, f0 + k * rise - 0.05, (v0 + v1) / 2, 0, wood, 1);
        for (const v of [v0 + 0.02, v1 - 0.02]) { const a = V(u0, f0, v), b = V(u1, f1, v), g = new THREE.BoxGeometry(a.distanceTo(b), 0.2, 0.05); g.rotateZ(Math.atan2(f1 - f0, u1 - u0)); g.translate((u0 + u1) / 2, (f0 + f1) / 2, v); K.put('plank', g, dark); }
        K.rod('plank', V(u0 + 0.2, f0 + 1.1, v0), V(u1, f1 + 0.95, v0), 0.025, 6, wood); }
      { const s = new THREE.Shape(); s.absarc(0, 0, P.Ri(f1) + 0.02, 0, Math.PI * 2, false); const [a, b, c, d] = P.hole, hp = new THREE.Path(); hp.moveTo(a, -c); hp.lineTo(a, -d); hp.lineTo(b, -d); hp.lineTo(b, -c); hp.lineTo(a, -c); s.holes.push(hp);
        const g = new THREE.ShapeGeometry(s, 24); g.rotateX(-Math.PI / 2); g.translate(0, f1, 0); K.put('plank', g, WHITE, 1.2);
        const g2 = new THREE.ShapeGeometry(s, 24); g2.rotateX(Math.PI / 2); g2.scale(1, 1, -1); g2.translate(0, f1 - 0.06, 0); K.put('plank', g2, lin(0x9a8a78), 1.2); }
      for (const v of [-0.9, 0.0]) K.box('plank', 3.0, 0.16, 0.14, 0, f1 - 0.22, v, 0, dark);
      { const [a, b, c] = P.hole; for (const [p0, p1] of [[[a, c], [b, c]], [[a, c], [a, P.hole[3]]]]) { K.rod('plank', V(p0[0], f1 + 0.95, p0[1]), V(p1[0], f1 + 0.95, p1[1]), 0.03, 6, wood); K.rod('plank', V(p0[0], f1 + 0.5, p0[1]), V(p1[0], f1 + 0.5, p1[1]), 0.02, 6, wood); }
        for (const [u, v] of [[a, c], [b, c], [a, P.hole[3]], [(a + b) / 2, c]]) K.box('plank', 0.06, 0.97, 0.06, u, f1, v, 0, dark); }
      // the loft: the miller's bunk, a table and stool, shelves of jars, a sack or two
      bed(-0.75, f1, -0.95, 0.55, lin(0x8a2a24), 1.8, 0.85, 0.38); solid(-0.75, -0.95, 0.95, 0.47, f1 - 0.3, f1 + 0.6, 0.55);
      table(0.75, f1, -0.75, 0.6, 0.5, -0.3, 0.7); chair(0.95, f1, -0.25, -1.9); solid(0.75, -0.75, 0.34, 0.3, f1 - 0.3, f1 + 0.75, -0.3);
      K.cyl('plain', 0.07, 0.08, 0.2, 0.7, f1 + 0.74, -0.8, 12, lin(0x7a5a3a)); K.ball('plain', 0.09, 0.85, f1 + 0.78, -0.65, 1.4, 0.7, 1, lin(0xb07a3a));
      shelf(-1.25, f1 + 0.9, 0.4, 0.7, Math.PI / 2 + 0.25, 3, (k, y) => { for (let i = 0; i < 4; i++) jar(-1.25 + 0.03 * (i - 1.5), y, 0.4 + (i - 1.5) * 0.16, new THREE.Color().setHSL(0.08 + 0.1 * R(), 0.4, 0.35 + 0.2 * R())); });
      sack(-0.3, f1, 0.95, 0.9, 0.5);
      lantern(-0.2, f1 + 2.0, -0.5, 0.6);
    }

    if (P.kind === 'hut') {
      const d = P.deck, g0 = P.ground, [ru0, ru1, rv0, rv1] = P.room, wh = P.wallH, pr = P.porch, bam = lin(0xd8c890);
      for (const [u, v] of [[-1.7, -1.7], [-1.7, 1.7], [1.6, -1.7], [1.6, 1.7], [pr - 0.05, -1.7], [pr - 0.05, 1.7], [0, -1.7], [0, 1.7]]) { K.cyl('bamboo', 0.08, 0.09, d - g0 + 0.2, u, g0 - 0.2, v, 8, bam, 0.8); }
      for (const v of [-1.7, 1.7]) K.rod('bamboo', V(-1.7, g0 + 0.1, v), V(1.6, d - 0.1, v), 0.035, 6, bam);
      K.box('plank', pr + 1.8, 0.1, 3.5, (pr - 1.8) / 2, d - 0.1, 0, 0, lin(0xc8a878), 1);
      // the walls: bamboo, the door in front, a window each side, shutters propped open
      K.wall('bamboo', ru0, rv0, ru1, rv0, d, d + wh, 0.08, [{ t0: 1.2, t1: 2.0, y0: d + 0.9, y1: d + 1.55 }], bam, 1);
      K.wall('bamboo', ru0, rv1, ru1, rv1, d, d + wh, 0.08, [{ t0: 1.2, t1: 2.0, y0: d + 0.9, y1: d + 1.55 }], bam, 1);
      K.wall('bamboo', ru0, rv0, ru0, rv1, d, d + wh, 0.08, [{ t0: 1.25, t1: 1.95, y0: d + 1.0, y1: d + 1.5 }], bam, 1);
      K.wall('bamboo', ru1, rv0, ru1, rv1, d, d + wh, 0.08, [{ t0: 1.15, t1: 2.05, y0: d, y1: d + 1.95 }], bam, 1);
      for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(0.8, 0.04, 0.5); g.translate(0, 0, 0.25); g.rotateX(s * 0.9); g.translate(-0.0, d + 1.57, s * (1.6 + 0.0)); K.put('bamboo', g, bam); }
      lamp.panes = [];
      { const g = new THREE.BoxGeometry(0.05, 1.9, 0.86); g.translate(0.03, 0.95, 0.43); g.rotateY(-1.7); g.translate(1.6, d, -0.43); K.put('bamboo', g, bam.clone().multiplyScalar(0.8)); }
      for (const [u, v] of [[ru0, rv0], [ru0, rv1], [ru1, rv0], [ru1, rv1], [pr - 0.05, -1.7], [pr - 0.05, 1.7]]) K.cyl('bamboo', 0.07, 0.07, wh + 0.9, u, d, v, 8, bam, 0.8);
      // the roof: thatch over the room and the porch, bamboo rafters under it
      { const g = new THREE.ConeGeometry(3.2, 1.7, 4, 2, true); g.rotateY(Math.PI / 4); g.scale(1.25, 1, 1); g.translate(0.55, d + wh + 0.85, 0); K.put('thatch', g, WHITE, 1); }
      for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; K.rod('bamboo', V(0.55, d + wh + 1.65, 0), V(0.55 + Math.cos(a) * 2.9 * 1.25, d + wh + 0.05, Math.sin(a) * 2.9), 0.04, 6, bam); }
      // porch: rails, a bench, a bucket and coconuts; the steps
      for (const v of [-1.7, 1.7]) { K.rod('bamboo', V(1.6, d + 0.9, v), V(pr, d + 0.9, v), 0.03, 6, bam); K.rod('bamboo', V(1.6, d + 0.45, v), V(pr, d + 0.45, v), 0.025, 6, bam); }
      for (const v of [[-1.7, -0.55], [0.55, 1.7]]) { K.rod('bamboo', V(pr, d + 0.9, v[0]), V(pr, d + 0.9, v[1]), 0.03, 6, bam); K.cyl('bamboo', 0.035, 0.035, 0.9, pr, d, v[0] === -1.7 ? -0.55 : 0.55, 6, bam); }
      K.box('plank', 0.35, 0.05, 1.0, 2.35, d + 0.42, -1.15, 0, wood); for (const v of [-1.55, -0.75]) K.box('plank', 0.3, 0.42, 0.05, 2.35, d, v, 0, wood); solid(2.35, -1.15, 0.2, 0.52, d - 0.2, d + 0.5);
      K.cyl('board', 0.14, 0.12, 0.28, 2.35, d, 1.2, 12, wood); for (const [u, v] of [[2.1, 1.35], [2.2, 1.5]]) K.ball('plain', 0.1, u, d + 0.1, v, 1, 1.1, 1, lin(0x6a4a2a));
      { const [u0, u1] = P.stair.rect, n = P.stair.n, run = (u1 - u0) / n, dy = (P.stair.y0 - P.stair.y1) / n; for (let k = 1; k <= n; k++) K.box('plank', run + 0.04, 0.05, 1.0, u0 + (k - 0.5) * run, d - k * dy - 0.05, 0, 0, wood);
        for (const v of [-0.5, 0.5]) { const g = new THREE.BoxGeometry(Math.hypot(u1 - u0, d - g0), 0.16, 0.05); g.rotateZ(-Math.atan2(d - g0, u1 - u0)); g.translate((u0 + u1) / 2, (d + g0) / 2 - 0.08, v); K.put('plank', g, dark); } }
      // inside: a low bed with a sea-blue cover, a woven rug, a table with coconut cups and a lamp, shells on a shelf, a net and a spear, a sea chest
      bed(-0.8, d, -0.95, 0, lin(0x2f7a8a), 1.8, 0.9, 0.35); solid(-0.8, -0.95, 0.95, 0.47, d - 0.3, d + 0.55);
      { const g = new THREE.CircleGeometry(0.8, 24); g.rotateX(-Math.PI / 2); g.translate(0.15, d + 0.005, 0.35); K.put('rug', g, lin(0xd8c8a0), 1.6); }
      table(0.35, d, 0.75, 0.7, 0.5, 0, 0.45); solid(0.35, 0.75, 0.38, 0.28, d - 0.3, d + 0.5);
      for (const [u, v] of [[0.2, 0.7], [0.45, 0.85]]) { const g = new THREE.SphereGeometry(0.06, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); g.translate(u, d + 0.55, v); K.put('plain', g, lin(0x5a3a1e)); }
      lantern(0.55, d + 0.63, 0.65);
      shelf(-1.5, d + 1.1, 0.6, 0.8, Math.PI / 2, 2, (k, y) => { for (let i = 0; i < 4; i++) { const g = new THREE.SphereGeometry(0.045, 8, 6); g.scale(1, 0.6, 1.3); g.translate(-1.5, y + 0.03, 0.6 + (i - 1.5) * 0.17); K.put('plain', g, new THREE.Color().setHSL(0.06 + 0.05 * R(), 0.4, 0.6 + 0.3 * R())); } });
      { const u = -1.55; for (let i = 0; i <= 6; i++) { K.rod('plain', V(u, d + 0.7 + i * 0.16, -0.6), V(u, d + 0.7 + i * 0.16, 0.2), 0.004, 3, lin(0x8a8060)); K.rod('plain', V(u, d + 0.7, -0.6 + i * 0.13), V(u, d + 1.66, -0.6 + i * 0.13), 0.004, 3, lin(0x8a8060)); } }   // a net on the back wall
      K.rod('plank', V(1.45, d, 1.35), V(1.3, d + 2.0, 1.45), 0.02, 5, wood); { const g = new THREE.ConeGeometry(0.03, 0.18, 6); g.translate(1.3, d + 2.08, 1.45); K.put('metal', g, iron); }
      { const u = -1.1, v = 1.2; K.box('board', 0.7, 0.42, 0.42, u, d, v, 0, lin(0x7a5a3a), 0.8); K.box('metal', 0.72, 0.04, 0.44, u, d + 0.2, v, 0, iron); K.box('board', 0.72, 0.1, 0.44, u, d + 0.42, v, 0, lin(0x6a4a2e), 0.8); solid(u, v, 0.37, 0.23, d - 0.3, d + 0.5); }
      { const g = new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16); g.translate(1.52, d + 1.6, -1.2); K.put('thatch', g, WHITE); K.cyl('thatch', 0.1, 0.12, 0.1, 1.52, d + 1.6, -1.2, 10, WHITE); }   // a straw hat on its peg
      lantern(0.3, d + wh - 0.1, -0.2, 0.3);
    }

    if (P.kind === 'observatory') {
      const f = P.floor, b = P.base, top = b + P.drumH, N = 32, door = { k0: -1, k1: 1, y0: f - 0.01, y1: f + P.door.h }, wins = [{ k0: 8, k1: 9, y0: f + 1.2, y1: f + 1.8 }, { k0: -9, k1: -8, y0: f + 1.2, y1: f + 1.8 }, { k0: 15, k1: 17, y0: f + 1.25, y1: f + 1.75 }];
      const step = K.roundWall('ashlar', y => P.rOut - 0.05 * (y - b) / P.drumH, () => P.rIn, b, top, N, [door, ...wins], WHITE, 1.4);
      { const g = new THREE.TorusGeometry(P.rOut - 0.02, 0.1, 6, 40); g.rotateX(Math.PI / 2); g.translate(0, top - 0.05, 0); K.put('stone', g, stoneC); }
      { const g = new THREE.RingGeometry(P.rIn - 0.02, P.rOut + 0.02, 40); g.rotateX(-Math.PI / 2); g.translate(0, top, 0); K.put('stone', g, stoneC); }
      { const y0 = Math.min(b, P.footMin - 0.4); K.cyl('stone', P.rOut + 0.08, P.rOut + 0.2, f - 0.02 - y0, 0, y0, 0, 32, stoneC, 1.2); }   // its footing on the cone
      outSteps();
      lamp.panes = [];
      for (const o of wins) { const a0 = o.k0 * step, a1 = o.k1 * step, am = (a0 + a1) / 2, w = 2 * Math.sin((a1 - a0) / 2) * P.rOut, gl = new THREE.BoxGeometry(0.03, o.y1 - o.y0, w); gl.translate(0, (o.y0 + o.y1) / 2, 0); gl.rotateY(-am); gl.translate(Math.cos(am) * (P.rIn + 0.12), 0, Math.sin(am) * (P.rIn + 0.12)); lamp.panes.push(gl);
        const fr = new THREE.BoxGeometry(0.08, 0.08, w + 0.1); fr.translate(0, o.y1 + 0.04, 0); fr.rotateY(-am); fr.translate(Math.cos(am) * (P.rOut + 0.02), 0, Math.sin(am) * (P.rOut + 0.02)); K.put('plank', fr, dark); }
      { const g = new THREE.BoxGeometry(0.08, P.door.h - 0.05, 0.94); g.translate(0.04, P.door.h / 2, 0.47); g.rotateY(1.8); g.translate(P.rIn + 0.02, f, -0.47); K.put('board', g, lin(0x6a4a30)); for (let i = 0; i < 12; i++) { const s = new THREE.SphereGeometry(0.018, 6, 4); s.translate(0.09, 0.2 + (i % 6) * 0.35, 0.12 + Math.floor(i / 6) * 0.7); s.rotateY(1.8); s.translate(P.rIn + 0.02, f, -0.47); K.put('metal', s, iron); } }
      { const g = new THREE.CircleGeometry(P.rIn + 0.02, 32); g.rotateX(-Math.PI / 2); g.translate(0, f, 0); K.put('plank', g, WHITE, 1.2); }
      { const g = new THREE.CircleGeometry(1.05, 28); g.rotateX(-Math.PI / 2); g.translate(0, f + 0.005, 0); K.put('rug', g, lin(0xb8b8d8), 2.1); }
      // the pier the telescope stands on (the telescope turns with the dome: outerIslands.js)
      K.cyl('stone', 0.28, 0.36, 1.55, 0, f, 0, 16, stoneC, 1); K.cyl('metal', 0.22, 0.28, 0.12, 0, f + 1.55, 0, 16, brass);
      // the desk with star charts, a sextant and a lamp; the chair
      { const a = Math.PI / 2, r = 1.72, u = Math.cos(a) * r, v = Math.sin(a) * r, ry = a + Math.PI / 2;
        table(u, f, v, 1.2, 0.6, ry, 0.76); solid(u, v, 0.62, 0.32, f - 0.3, f + 0.8, ry);
        K.picture(0, 0.5, 0.36, u + 0.2, f + 0.785, v - 0.05, 0); const pp = lists => lists; void pp;
        { const g = new THREE.PlaneGeometry(0.5, 0.36), uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.5, 0.5 + uv.getY(k) * 0.5); g.userData.keepUV = true; g.rotateX(-Math.PI / 2); g.rotateY(0.2); g.translate(u - 0.2, f + 0.782, v); K.put('paper', g); }
        const sx = new THREE.TorusGeometry(0.1, 0.008, 4, 16, Math.PI / 3); sx.rotateX(-Math.PI / 2); sx.translate(u + 0.35, f + 0.8, v - 0.1); K.put('metal', sx, brass);
        lantern(u - 0.45, f + 0.92, v + 0.12); books(u + 0.1, f + 0.78, v + 0.2, 0.3, 0.1);
        chair(u, f, v - 0.55, a - Math.PI / 2 + 0.3); }
      // bookshelves along the wall
      for (const a of [2.55, 3.35]) { const r = P.rIn - 0.16, u = Math.cos(a) * r, v = Math.sin(a) * r, ry = a + Math.PI / 2; shelf(u, f + 0.05, v, 0.9, ry, 5, (k, y) => books(u, y, v, 0.84, ry)); solid(u, v, 0.47, 0.14, f - 0.3, f + 2.1, ry); }
      // a globe on its stand, the chalkboard, the star chart, a cot
      { const a = -1.15, r = 1.55, u = Math.cos(a) * r, v = Math.sin(a) * r; K.cyl('plank', 0.03, 0.05, 0.75, u, f, v, 8, wood); K.cyl('plank', 0.2, 0.22, 0.04, u, f, v, 16, wood);
        const gl = new THREE.SphereGeometry(0.24, 20, 14); gl.translate(u, f + 0.98, v); K.put('plain', gl, (c, x, y, z) => c.copy(Math.sin((x - u) * 11) + Math.cos((z - v) * 9 + (y - f) * 7) > 0.6 ? lin(0x7a8a4a) : lin(0x3a6a9a)));
        const ring = new THREE.TorusGeometry(0.27, 0.012, 4, 24, Math.PI * 1.3); ring.rotateY(0.4); ring.translate(u, f + 0.98, v); K.put('metal', ring, brass); P.posts.push([u, v, 0.28, f - 0.3, f + 1.2]); }
      { const a = Math.PI, r = P.rIn - 0.02; K.picture(2, 1.2, 0.9, Math.cos(a) * r, f + 1.6, Math.sin(a) * r + 0.0, a + Math.PI); }
      { const a = -Math.PI / 2 - 0.5, r = P.rIn - 0.02; K.picture(0, 0.7, 0.7, Math.cos(a) * r, f + 1.55, Math.sin(a) * r, a + Math.PI); }
      { const a = -2.3, r = 1.55, u = Math.cos(a) * r, v = Math.sin(a) * r, ry = a + Math.PI / 2, L = 1.8, Wd = 0.8, h = 0.38; bed(u, f, v, ry, lin(0x3a4a6a), L, Wd, h); solid(u, v, 0.95, 0.42, f - 0.3, f + 0.6, ry);
        // the bed you sleep in (app/sleeping.js, as the cabin's): its edge on the room's side, the pillow, the feet's way;
        // by its head a nightstand with the alarm clock that wakes you when you ask (its hands turn, the red one is the alarm)
        const du = Math.cos(ry), dv = Math.sin(ry), nu = -dv * Math.sign(-u * -dv + -v * du), nv = du * Math.sign(-u * -dv + -v * du), top = f + h + 0.12;
        const Wl = (lu, lv) => P.W(lu, lv), [cx, cz] = Wl(u, v), [ex, ez] = Wl(u + nu * (Wd / 2 - 0.14), v + nv * (Wd / 2 - 0.14)), [px, pz] = Wl(u - du * (L / 2 - 0.36), v - dv * (L / 2 - 0.36));
        const wn = [Math.cos(P.a) * nu - Math.sin(P.a) * nv, Math.sin(P.a) * nu + Math.cos(P.a) * nv], wf = [Math.cos(P.a) * du - Math.sin(P.a) * dv, Math.sin(P.a) * du + Math.cos(P.a) * dv];
        P.bed = { cx, cz, top, floor: f, edge: { x: ex, z: ez, fx: wn[0], fz: wn[1], top }, pillow: { x: px, z: pz, y: top + 0.14 }, feet: { x: wf[0], z: wf[1] }, alarm: true, inside: q => buildingAt(q.x, q.z) === P };
        const su = u - du * (L / 2 - 0.2) + nu * 0.72, sv = v - dv * (L / 2 - 0.2) + nv * 0.72;
        K.box('plank', 0.42, 0.52, 0.38, su, f, sv, -ry, wood); K.box('plank', 0.46, 0.03, 0.42, su, f + 0.52, sv, -ry, dark); K.box('plank', 0.3, 0.12, 0.02, su + nu * 0.2, f + 0.3, sv + nv * 0.2, -ry, dark);
        solid(su, sv, 0.23, 0.21, f - 0.3, f + 0.6, ry); books(su - du * 0.08, f + 0.55, sv - dv * 0.08, 0.14, ry);
        const clk = new THREE.Group(); clk.position.set(su + du * 0.08, f + 0.55, sv + dv * 0.08); clk.rotation.y = -Math.atan2(nv, nu) + Math.PI / 2; group.add(clk);
        const cm = (g, c, x, y, z, m = 'metal') => { const o2 = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: c, roughness: m === 'metal' ? 0.3 : 0.6, metalness: m === 'metal' ? 0.7 : 0 })); o2.position.set(x, y, z); o2.castShadow = true; clk.add(o2); return o2; };
        const body = new THREE.CylinderGeometry(0.075, 0.075, 0.05, 28); body.rotateX(Math.PI / 2); cm(body, 0xa8322a, 0, 0.1, 0);
        const faceTex = new THREE.CanvasTexture((() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d'); g.fillStyle = '#f4eee0'; g.beginPath(); g.arc(64, 64, 62, 0, 6.283); g.fill(); g.fillStyle = '#222'; g.font = 'bold 18px Georgia'; g.textAlign = 'center'; g.textBaseline = 'middle'; for (let k = 1; k <= 12; k++) { const a2 = k / 12 * 6.283 - Math.PI / 2; g.fillText(String(k), 64 + Math.cos(a2) * 47, 64 + Math.sin(a2) * 47); } for (let k = 0; k < 60; k++) { const a2 = k / 60 * 6.283; g.fillRect(64 + Math.cos(a2) * 58 - 1, 64 + Math.sin(a2) * 58 - 1, k % 5 ? 1.5 : 3, k % 5 ? 1.5 : 3); } return cv; })());
        faceTex.encoding = THREE.sRGBEncoding; { const fm = new THREE.Mesh(new THREE.CircleGeometry(0.066, 28), new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.5 })); fm.position.set(0, 0.1, 0.026); clk.add(fm); }
        { const g2 = new THREE.TorusGeometry(0.07, 0.008, 6, 28); cm(g2, 0xc8c8c0, 0, 0.1, 0.027); }
        for (const sx of [-1, 1]) { const bell = new THREE.SphereGeometry(0.035, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2); const b2 = cm(bell, 0xc8c8c0, sx * 0.045, 0.172, 0); b2.rotation.z = -sx * 0.5; cm(new THREE.CylinderGeometry(0.006, 0.006, 0.05, 6), 0x9a9a92, sx * 0.045, 0.02, -0.01).rotation.z = sx * 0.4; }
        cm(new THREE.SphereGeometry(0.012, 8, 6), 0xc8c8c0, 0, 0.19, 0); cm(new THREE.BoxGeometry(0.008, 0.035, 0.008), 0x9a9a92, 0, 0.175, 0.005);
        const hand = (len, wdt, c, z) => { const g2 = new THREE.BoxGeometry(wdt, len, 0.003); g2.translate(0, len / 2 - 0.006, 0); const m2 = cm(g2, c, 0, 0.1, z, 'paint'); return m2; };
        P.clock = { group: clk, hour: hand(0.036, 0.007, 0x111111, 0.03), minute: hand(0.052, 0.005, 0x111111, 0.031), alarm: hand(0.045, 0.003, 0xc81e1e, 0.029) }; }
      lantern(-1.2, f + 2.3, 0.6, 0.35);
    }

    if (P.kind === 'lodge') {
      const f = P.floor, g0 = P.ground, [hu0, hu1, hv0, hv1] = P.house, [pu0, pu1, pv0, pv1] = P.plat, wh = P.wallH, boardC = lin(0x9a8a70);
      for (const [u, v] of [[pu0, pv0], [pu0, pv1], [pu1, pv0], [pu1, pv1], [0.4, pv0], [0.4, pv1], [pu0, 0], [pu1, 0]]) K.cyl('plank', 0.1, 0.12, f - g0 + 0.3, u, g0 - 0.3, v, 8, dark, 1);
      for (const v of [pv0, pv1]) K.rod('plank', V(pu0, g0 + 0.2, v), V(0.4, f - 0.15, v), 0.04, 6, dark);
      K.box('plank', pu1 - pu0, 0.12, pv1 - pv0, (pu0 + pu1) / 2, f - 0.12, 0, 0, WHITE, 1.2);
      // board-and-batten walls, the door and windows with frames and glass
      const win = (t0, t1) => ({ t0, t1, y0: f + 0.95, y1: f + 1.65 });
      const W1 = K.wall('board', hu1, hv0, hu1, hv1, f, f + wh, 0.1, [{ t0: 1.65, t1: 2.55, y0: f, y1: f + 2.0 }, win(0.45, 1.15), win(3.05, 3.75)], boardC, 1.2);
      const W2 = K.wall('board', hu0, hv0, hu0, hv1, f, f + wh, 0.1, [win(1.7, 2.5)], boardC, 1.2);
      const W3 = K.wall('board', hu0, hv0, hu1, hv0, f, f + wh, 0.1, [win(1.35, 2.05)], boardC, 1.2);
      const W4 = K.wall('board', hu0, hv1, hu1, hv1, f, f + wh, 0.1, [win(1.35, 2.05)], boardC, 1.2);
      lamp.panes = [];
      for (const [Wl, o] of [[W1, win(0.45, 1.15)], [W1, win(3.05, 3.75)], [W2, win(1.7, 2.5)], [W3, win(1.35, 2.05)], [W4, win(1.35, 2.05)]]) {
        const [cu, cv] = Wl.at((o.t0 + o.t1) / 2), w = o.t1 - o.t0, gl = new THREE.BoxGeometry(w, o.y1 - o.y0, 0.02); gl.translate(0, (o.y0 + o.y1) / 2, 0); gl.rotateY(-Wl.ang); gl.translate(cu, 0, cv); lamp.panes.push(gl);
        for (const [dy, hh] of [[o.y0 - 0.06, 0.06], [o.y1, 0.07]]) { const g = new THREE.BoxGeometry(w + 0.16, hh, 0.16); g.translate(0, dy + hh / 2, 0); g.rotateY(-Wl.ang); g.translate(cu, 0, cv); K.put('plank', g, lin(0xd8d0c0)); }
        for (const e of [-1, 1]) { const [eu, ev] = Wl.at((o.t0 + o.t1) / 2 + e * (w / 2 + 0.04)), g = new THREE.BoxGeometry(0.08, o.y1 - o.y0, 0.16); g.translate(0, (o.y0 + o.y1) / 2, 0); g.rotateY(-Wl.ang); g.translate(eu, 0, ev); K.put('plank', g, lin(0xd8d0c0)); } }
      for (const [u, v] of [[hu0, hv0], [hu0, hv1], [hu1, hv0], [hu1, hv1]]) K.box('plank', 0.14, wh, 0.14, u, f, v, 0, dark);
      { const g = new THREE.BoxGeometry(0.06, 1.95, 0.88); g.translate(0.03, 0.975, 0.44); g.rotateY(-1.75); g.translate(hu1, f, -0.44); K.put('board', g, lin(0x5a6a5a)); }   // the door, green, open in
      // the gable roof (boards), its ridge along v; rafters under it
      { const rise = 1.3, span = (hu1 - hu0) / 2 + 0.4, L = Math.hypot(span, rise), ang = Math.atan2(rise, span), cu = (hu0 + hu1) / 2;
        for (const s of [-1, 1]) { const g = new THREE.BoxGeometry(L, 0.08, hv1 - hv0 + 0.7); g.rotateZ(s * ang * -1); g.translate(cu + s * span / 2, f + wh + rise / 2, 0); g.userData = {}; K.put('board', g, lin(0x5a4a3a), 1); }
        for (const v of [hv0, hv1]) { const sh = new THREE.Shape(); sh.moveTo(hu0, 0); sh.lineTo(hu1, 0); sh.lineTo(cu, rise); sh.lineTo(hu0, 0); const g = new THREE.ShapeGeometry(sh); g.translate(0, f + wh, 0); const g2 = g.clone(); g.translate(0, 0, v + (v < 0 ? -0.05 : 0.05)); g2.rotateY(Math.PI); g2.translate(2 * cu, 0, v + (v < 0 ? 0.05 : -0.05) ); K.put('board', g, boardC, 1.2); K.put('board', g2, boardC, 1.2); }
        for (let k = 0; k < 5; k++) { const v = hv0 + 0.3 + k * (hv1 - hv0 - 0.6) / 4; for (const s of [-1, 1]) K.rod('plank', V(cu + s * span * 0.95, f + wh + 0.03, v), V(cu, f + wh + rise - 0.05, v), 0.04, 5, dark); K.rod('plank', V(hu0 + 0.05, f + wh, v), V(hu1 - 0.05, f + wh, v), 0.04, 5, dark); } }
      // porch rails; the steps; the boardwalk to the jetty
      const rail = f + 0.95;
      for (const [a, b] of [[[pu0, pv0], [pu1, pv0]], [[pu0, pv1], [pu1, pv1]], [[pu0, pv0], [pu0, pv1]], [[pu1, pv0], [pu1, -0.6]], [[pu1, 0.6], [pu1, pv1]]]) {
        K.rod('plank', V(a[0], rail, a[1]), V(b[0], rail, b[1]), 0.035, 6, wood); K.rod('plank', V(a[0], f + 0.5, a[1]), V(b[0], f + 0.5, b[1]), 0.025, 6, wood);
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let t = 0; t <= L + 1e-3; t += L / Math.max(1, Math.round(L / 1.1))) K.box('plank', 0.07, 0.95, 0.07, a[0] + (b[0] - a[0]) * t / L, f, a[1] + (b[1] - a[1]) * t / L, 0, dark); }
      { const [u0, u1] = P.stair.rect, n = P.stair.n, run = (u1 - u0) / n, dy = (P.stair.y0 - P.stair.y1) / n; for (let k = 1; k <= n; k++) K.box('plank', run + 0.04, 0.05, 1.1, u0 + (k - 0.5) * run, f - k * dy - 0.05, 0, 0, wood);
        for (const v of [-0.6, 0.6]) { const h = f - P.stair.y1; K.rod('plank', V(u0, f + 0.9, v), V(u1, P.stair.y1 + 0.9, v), 0.03, 6, wood); const g = new THREE.BoxGeometry(Math.hypot(u1 - u0, h), 0.18, 0.05); g.rotateZ(-Math.atan2(h, u1 - u0)); g.translate((u0 + u1) / 2, (f + P.stair.y1) / 2 - 0.1, v); K.put('plank', g, dark); K.box('plank', 0.07, 0.95, 0.07, u1, P.stair.y1, v, 0, dark); } }
      { const bw = P.boardwalk, ang = P.boardwalkAng - P.a; for (let k = 0; k < bw.length; k++) { const [x, y, z] = bw[k], [u, v] = P.L(x, z); K.box('plank', 0.26, 0.05, 1.2, u, y - 0.05, v, -ang, wood.clone().multiplyScalar(0.8 + 0.3 * R()), 1); if (k % 6 === 0) for (const s of [-0.55, 0.55]) K.cyl('plank', 0.05, 0.05, 0.6, u - Math.sin(ang) * s, y - 0.6, v + Math.cos(ang) * s, 6, dark); } }
      // inside: the stove and its pipe, the bunk beds, table and chairs, shelves of jars, nets and rods, a barrel, boots, the map, a heron painting
      { const u = hu0 + 0.45, v = hv0 + 0.5; K.box('metal', 0.6, 0.55, 0.5, u, f + 0.12, v, 0, iron); for (const [a, b] of [[-0.25, -0.2], [0.25, -0.2], [-0.25, 0.2], [0.25, 0.2]]) K.box('metal', 0.05, 0.12, 0.05, u + a, f, v + b, 0, iron);
        K.cyl('metal', 0.07, 0.07, wh + 1.4, u, f + 0.67, v, 10, iron); K.cyl('metal', 0.12, 0.1, 0.18, u + 0.12, f + 0.67, v + 0.05, 12, lin(0x3a3a3a)); K.box('metal', 0.24, 0.2, 0.02, u + 0.3, f + 0.2, v, 0, lin(0x6a2a10));
        solid(u, v, 0.32, 0.27, f - 0.3, f + 0.7); for (let k = 0; k < 5; k++) K.cyl('plank', 0.06, 0.06, 0.45, u + 0.55, f + 0.06 + 0.1 * (k % 3), v - 0.15 + 0.12 * Math.floor(k / 2), 6, wood); }
      { const u = hu0 + 0.5, v = hv1 - 0.55; for (const y of [0.25, 1.25]) { K.box('plank', 1.9, 0.1, 0.85, u + 0.5, f + y, v, 0, wood); K.box('cloth', 1.8, 0.1, 0.78, u + 0.5, f + y + 0.1, v, 0, lin(0xe6e0d2)); K.box('cloth', 1.2, 0.05, 0.8, u + 0.8, f + y + 0.2, v, 0, y < 1 ? lin(0x4a5a3a) : lin(0x7a3a2a)); K.ball('cloth', 0.13, u - 0.2, f + y + 0.25, v, 1.1, 0.45, 2, lin(0xf2eee4)); }
        for (const [a, b] of [[-0.45, -0.4], [1.45, -0.4], [-0.45, 0.4], [1.45, 0.4]]) K.box('plank', 0.07, 1.8, 0.07, u + a, f, v + b, 0, dark);
        K.rod('plank', V(u + 1.45, f + 0.4, v - 0.42), V(u + 1.45, f + 1.3, v - 0.42), 0.02, 4, dark); solid(u + 0.5, v, 1.0, 0.45, f - 0.3, f + 1.9); }
      table(0.35, f, 0.2, 1.0, 0.7, 0); chair(0.35, f, -0.45, Math.PI / 2); chair(0.35, f, 0.85, -Math.PI / 2); chair(-0.4, f, 0.2, 0); solid(0.35, 0.2, 0.52, 0.37, f - 0.3, f + 0.8);
      lantern(0.5, f + 0.9, 0.3); for (const [u, v] of [[0.1, 0.05], [0.6, 0.45]]) K.cyl('plain', 0.11, 0.09, 0.02, u, f + 0.78, v, 16, lin(0xe8e4dc)); K.ball('plain', 0.05, 0.1, f + 0.82, 0.05, 2.4, 0.6, 1, lin(0x8a9aa0));
      shelf(hu1 - 0.2, f + 0.9, hv0 + 0.9, 0.8, Math.PI / 2, 3, (k, y) => { for (let i = 0; i < 4; i++) jar(hu1 - 0.2, y, hv0 + 0.9 + (i - 1.5) * 0.18, new THREE.Color().setHSL(R() < 0.5 ? 0.1 : 0.3, 0.4, 0.3 + 0.25 * R())); }); solid(hu1 - 0.2, hv0 + 0.9, 0.14, 0.42, f - 0.3, f + 2.0);
      { const u = hu0 + 0.06; for (let i = 0; i <= 7; i++) { K.rod('plain', V(u, f + 0.9 + i * 0.14, -0.9), V(u, f + 0.9 + i * 0.14, 0.2), 0.004, 3, lin(0x6a6a50)); K.rod('plain', V(u, f + 0.9, -0.9 + i * 0.15), V(u, f + 1.9, -0.9 + i * 0.15), 0.004, 3, lin(0x6a6a50)); } }
      for (let k = 0; k < 3; k++) K.rod('plank', V(hu1 - 0.15, f, hv1 - 0.3 - k * 0.12), V(hu1 - 0.35, f + 2.1, hv1 - 0.3 - k * 0.12), 0.012, 4, lin(0x6a4a2a));
      { const u = hu1 - 0.45, v = hv0 + 1.75; K.cyl('board', 0.24, 0.22, 0.7, u, f, v, 14, wood, 0.6); for (const y of [0.12, 0.58]) K.cyl('metal', 0.245, 0.245, 0.04, u, f + y, v, 14, iron); P.posts.push([u, v, 0.26, f - 0.3, f + 0.8]); }
      for (const s of [-1, 1]) K.box('plain', 0.12, 0.28, 0.25, hu1 - 0.25, f, 0.7 + s * 0.08, 0, lin(0x2a2a24));
      K.picture(1, 0.9, 0.9, 0.0, f + 1.5, hv1 - 0.07, -Math.PI / 2); K.picture(3, 0.6, 0.6, -0.6, f + 1.55, hv0 + 0.07, Math.PI / 2);
      { const g = new THREE.PlaneGeometry(1.6, 1.1); g.rotateX(-Math.PI / 2); g.translate(0.3, f + 0.005, 0.2); K.put('rug', g, lin(0xa8b8a0), 1.6); }
      lantern(-0.3, f + wh - 0.2, -0.8, 0.4);
    }

    K.meshes(group, mats, ['paper', 'rug', 'metal', 'cloth']);
    // the lantern glass and the windows: their own materials, lit by the lamp at night
    const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd08a }), paneMat = new THREE.MeshBasicMaterial({ color: 0x8aa0a8, transparent: true, opacity: 0.55, depthWrite: false });
    if (lamp.glass.length) group.add(new THREE.Mesh(mergeGeos(lamp.glass, ['position', 'normal']), lampMat));
    if (lamp.panes && lamp.panes.length) { const pm = new THREE.Mesh(mergeGeos(lamp.panes, ['position', 'normal']), paneMat); pm.renderOrder = 2; group.add(pm); }
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(lamp.glowAt, 3));
    const glowMat = new THREE.PointsMaterial({ map: tex.softDot, color: 0xffc070, size: 0.9, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
    const glow = new THREE.Points(gg, glowMat); glow.frustumCulled = false; group.add(glow);
    group.traverse(o => { if (o.isMesh) o.userData.dynamic = true; });
    scene.add(group);
    // the lamps' positions in the world (for lighting them: main.js, app/fires.js)
    const at = []; for (let i = 0; i < lamp.glowAt.length; i += 3) { const [x, z] = P.W(lamp.glowAt[i], lamp.glowAt[i + 2]); at.push(new THREE.Vector3(x, lamp.glowAt[i + 1], z)); }
    out.push({ P, group, lamp, lampMat, paneMat, glowMat, glow, spins, lamps: at, near: false });
  }

  const cam = camera.position;
  return {
    buildings: out,
    /** The building's lamps: on (k = 1) or off. */
    setLamp(i, k) { out[i].lamp.k = k; },
    update(dt, sailSpeed = 0) {
      const night = skyUniforms.uNight.value, inside = buildingAt(cam.x, cam.z);
      let warmK = 0;
      for (const b of out) {
        b.near = Math.hypot(cam.x - b.P.x, cam.z - b.P.z) < NEAR; b.group.visible = b.near;
        if (!b.near) continue;
        const lit = b.lamp.k * clamp(night * 1.6 - 0.2);
        b.lampMat.color.setRGB(0.55 + 0.9 * b.lamp.k, 0.45 + 0.65 * b.lamp.k, 0.3 + 0.3 * b.lamp.k);
        b.paneMat.color.setRGB(0.54 + 0.9 * lit, 0.63 + 0.55 * lit, 0.66 + 0.1 * lit); b.paneMat.opacity = 0.5 + 0.4 * lit;
        b.glowMat.opacity = 0.8 * lit; b.glow.visible = lit > 0.02;
        for (const s of b.spins) s.spin.rotation[s.axis] += dt * s.speed * sailSpeed;
        if (inside === b.P) warmK = 0.07 * lit;
      }
      for (const k in mats) mats[k].emissiveIntensity = warmK;
    },
  };
}
